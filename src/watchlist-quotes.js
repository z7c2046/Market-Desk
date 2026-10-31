// Central Watchlist Quote Store and SSE Dispatcher
// Merges multi-session quotes, handles deduplication, throttling (100-250ms batching), and SSE streams.

import { LongbridgeProvider } from './quote-providers/longbridge.js';
import { IbkrProvider } from './quote-providers/ibkr.js';
import { getCurrentSession, calcChangePercent, resolveExtReferenceClose, SESSION_TYPES, buildMultiSessionQuote } from './market-sessions.js';

export function createQuoteProvider(options = {}) {
  const env = process.env;
  const preferred = (env.QUOTE_PROVIDER || '').toLowerCase();
  if (preferred === 'longbridge') {
    return new LongbridgeProvider(options.longbridge);
  }
  if (preferred === 'ibkr') {
    return new IbkrProvider(options.ibkr);
  }
  // Auto mode: If Longbridge credentials are explicitly provided, use LongbridgeProvider
  const hasLongbridgeCreds = Boolean(
    options.longbridge || env.LONGBRIDGE_APP_KEY || env.LONGPORT_APP_KEY
  );
  const hasIbkrConfig = Boolean(
    options.ibkr || env.IB_GATEWAY_PORT || env.IB_GATEWAY_HOST || env.IB_CLIENT_ID
  );
  if (hasLongbridgeCreds && !hasIbkrConfig) {
    return new LongbridgeProvider(options.longbridge);
  }
  // Default to local IB Gateway provider
  return new IbkrProvider(options.ibkr);
}

const yahooCache = new Map(); // symbol -> { quote, expiresAt }

export function normalizeYahooSymbol(sym) {
  if (sym.endsWith('.HK')) {
    const rawNum = sym.slice(0, -3).replace(/^0+/, '');
    const padded = rawNum.length < 4 ? rawNum.padStart(4, '0') : rawNum;
    return `${padded}.HK`;
  }
  // Yahoo Finance uses hyphen for US dual-class shares (e.g. BRK-B, BF-B) instead of dot (BRK.B returns 404)
  return sym.replace(/\./g, '-');
}

export async function fetchYahooQuote(rawSymbol) {
  const sym = String(rawSymbol).trim().toUpperCase();
  const cached = yahooCache.get(sym);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.quote;
  }

  try {
    const yahooSymbol = normalizeYahooSymbol(sym);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=5m&range=2d&includePrePost=true`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result0 = json.chart?.result?.[0];
    const meta = result0?.meta;
    if (!meta || meta.regularMarketPrice == null) return null;

    const regularPrice = meta.regularMarketPrice;
    const regularTime = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null;
    const regularVolume = meta.regularMarketVolume ?? null;
    const regTimeSec = meta.regularMarketTime || 0;

    const timestamps = result0?.timestamp || [];
    const quoteInd = result0?.indicators?.quote?.[0] || {};
    const closes = quoteInd.close || [];
    const opens = quoteInd.open || [];
    const volumes = quoteInd.volume || [];
    const tp = meta.tradingPeriods || {};
    const regWindows = (tp.regular || []).flat();
    const preWindows = (tp.pre || []).flat();
    const postWindows = (tp.post || []).flat();

    let w0LastClose = null;
    if (regWindows.length >= 2) {
      for (let i = 0; i < timestamps.length; i++) {
        const t = timestamps[i];
        if (t >= regWindows[0].start && t < regWindows[0].end && closes[i] != null) {
          w0LastClose = closes[i];
        }
      }
    }
    const prevClose = meta.previousClose ?? w0LastClose ?? meta.chartPreviousClose ?? null;
    const latestRegStart = regWindows.at(-1)?.start || 0;

    // Extract latest post-market session bars
    let latestPostBars = [];
    for (const w of postWindows) {
      const bars = [];
      for (let i = 0; i < timestamps.length; i++) {
        const t = timestamps[i];
        if (t >= w.start && t < w.end && closes[i] != null) {
          bars.push({ t, open: opens[i], close: closes[i], vol: volumes[i] });
        }
      }
      if (bars.length) latestPostBars = bars;
    }

    // Extract latest pre-market session bars
    let latestPreBars = [];
    for (const w of preWindows) {
      const bars = [];
      for (let i = 0; i < timestamps.length; i++) {
        const t = timestamps[i];
        if (t >= w.start && t < w.end && closes[i] != null) {
          bars.push({ t, open: opens[i], close: closes[i], vol: volumes[i] });
        }
      }
      if (bars.length) latestPreBars = bars;
    }

    const currentSess = getCurrentSession();

    let prePrice = meta.preMarketPrice ?? (latestPreBars.length ? latestPreBars.at(-1).close : null);
    let preTime = meta.preMarketTime
      ? new Date(meta.preMarketTime * 1000).toISOString()
      : (latestPreBars.length ? new Date(latestPreBars.at(-1).t * 1000).toISOString() : null);
    let preVolume = latestPreBars.length
      ? (latestPreBars.reduce((acc, b) => acc + (b.vol || 0), 0) || null)
      : null;
    let preBarSec = latestPreBars.length ? latestPreBars.at(-1).t : 0;

    let postPrice = meta.postMarketPrice ?? (latestPostBars.length ? latestPostBars.at(-1).close : null);
    let postTime = meta.postMarketTime
      ? new Date(meta.postMarketTime * 1000).toISOString()
      : (latestPostBars.length ? new Date(latestPostBars.at(-1).t * 1000).toISOString() : null);
    let postVolume = latestPostBars.length
      ? (latestPostBars.reduce((acc, b) => acc + (b.vol || 0), 0) || null)
      : null;
    let postBarSec = latestPostBars.length ? latestPostBars.at(-1).t : 0;

    let overnightPrice = meta.overnightMarketPrice ?? null;
    let overnightTime = meta.overnightMarketTime ? new Date(meta.overnightMarketTime * 1000).toISOString() : null;
    let overnightVolume = null;
    let overnightBarSec = 0;

    // Yahoo Finance v8 chart API:
    // In active pre/post/overnight, live/delayed extended trading price is provided in meta.fulldayPrice
    if (currentSess.session === 'pre') {
      if (meta.fulldayPrice != null && meta.fulldayPrice !== regularPrice) {
        prePrice = meta.fulldayPrice;
        preTime = new Date().toISOString();
        preBarSec = Math.floor(Date.now() / 1000);
      }
    } else if (currentSess.session === 'post') {
      if (meta.fulldayPrice != null && meta.fulldayPrice !== regularPrice) {
        postPrice = meta.fulldayPrice;
        postTime = new Date().toISOString();
        postBarSec = Math.floor(Date.now() / 1000);
      }
    } else if (currentSess.session === 'overnight') {
      if (meta.fulldayPrice != null && meta.fulldayPrice !== regularPrice) {
        overnightPrice = meta.fulldayPrice;
        overnightTime = new Date().toISOString();
        overnightBarSec = Math.floor(Date.now() / 1000);
      }
    }

    // Derive overnight quote from 04:00 ET pre-market opening handoff bar (or post-market close) if not directly provided
    if (overnightPrice == null) {
      if (latestPreBars.length > 0) {
        const firstPre = latestPreBars[0];
        overnightPrice = firstPre.open ?? firstPre.close;
        overnightTime = new Date(firstPre.t * 1000).toISOString();
        overnightBarSec = firstPre.t;
      } else if (postPrice != null) {
        overnightPrice = postPrice;
        overnightTime = postTime;
        overnightBarSec = postBarSec;
      }
    }

    // Determine accurate RTH reference close for each extended session window
    const resolveBarRef = (barSec) => {
      if (barSec && latestRegStart && regTimeSec >= latestRegStart && barSec < latestRegStart) {
        return prevClose ?? regularPrice;
      }
      return regularPrice;
    };

    const preRefClose = resolveBarRef(preBarSec);
    const postRefClose = resolveBarRef(postBarSec);
    const overnightRefClose = resolveBarRef(overnightBarSec);

    const quote = buildMultiSessionQuote({
      symbol: sym,
      name: meta.shortName || meta.longName || null,
      regularPrice,
      regularPrevClose: prevClose,
      regularVolume,
      regularTime,
      todayRthClose: regularPrice,
      prePrice,
      preVolume,
      preTime,
      preRefClose,
      postPrice,
      postVolume,
      postTime,
      postRefClose,
      overnightPrice,
      overnightVolume,
      overnightTime,
      overnightRefClose,
      provider: 'Yahoo Finance',
      coverage: '公开延迟',
      delayStatus: 'delayed',
      status: 'active',
      statusReason: '来自公开市场备用源'
    });

    yahooCache.set(sym, { quote, expiresAt: Date.now() + 15000 });
    return quote;
  } catch (err) {
    return null;
  }
}

export class WatchlistQuoteService {
  constructor({ provider = createQuoteProvider(), batchIntervalMs = 150 } = {}) {
    this.provider = provider;
    this.batchIntervalMs = batchIntervalMs;
    this.quotes = new Map(); // symbol -> MultiSessionQuote
    this.sseClients = new Set(); // Set of { res, symbols }
    this.batchUpdates = new Map(); // symbol -> { changes }
    this.batchTimer = null;
    this.heartbeatTimer = null;

    // Listen to real-time pushes from provider
    if (this.provider?.onQuoteUpdate) {
      this.provider.onQuoteUpdate(event => this.handlePushUpdate(event));
    }

    this.isRefreshingFallback = false;
    this.startHeartbeat();
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      this.broadcast({ type: 'heartbeat', ts: Date.now() });

      // If provider is unconfigured, periodically refresh active symbols for connected clients
      if (!this.provider.isConfigured() && this.sseClients.size > 0 && !this.isRefreshingFallback) {
        this.isRefreshingFallback = true;
        try {
          const clientSymbols = new Set();
          for (const c of this.sseClients) {
            for (const s of c.symbols || []) clientSymbols.add(s);
          }
          const symList = Array.from(clientSymbols);
          const chunkSize = 6;
          for (let i = 0; i < symList.length; i += chunkSize) {
            const chunk = symList.slice(i, i + chunkSize);
            await Promise.allSettled(chunk.map(async sym => {
              const updated = await fetchYahooQuote(sym);
              if (updated) {
                this.quotes.set(sym, updated);
                const current = getCurrentSession();
                this.queueUpdate(sym, {
                  symbol: sym,
                  session: current.session,
                  price: updated[current.session]?.price ?? updated.regular?.price,
                  changePercent: updated[current.session]?.changePercent ?? updated.regular?.changePercent,
                  volume: updated.regular?.volume,
                  sourceTime: updated.regular?.sourceTime,
                  updatedAt: new Date().toISOString()
                });
              }
            }));
          }
        } finally {
          this.isRefreshingFallback = false;
        }
      }
    }, 15000);
    this.heartbeatTimer.unref?.();
  }

  destroy() {
    if (this.batchTimer) clearTimeout(this.batchTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const client of this.sseClients) {
      try { client.res.end(); } catch {}
    }
    this.sseClients.clear();
  }

  handlePushUpdate(event) {
    const { symbol, session, price, volume, time } = event;
    if (!symbol) return;

    let quote = this.quotes.get(symbol);
    if (!quote) return;

    // Update session data
    const sessionObj = quote[session];
    if (sessionObj) {
      if (price !== null && Number.isFinite(price)) {
        sessionObj.price = price;
        // Recalculate percentage change if referenceClose is available
        if (sessionObj.referenceClose > 0) {
          sessionObj.changePercent = calcChangePercent(price, sessionObj.referenceClose);
        }
      }
      if (volume !== null && Number.isFinite(volume)) {
        sessionObj.volume = volume;
      }
      if (time) sessionObj.sourceTime = time;
    }

    quote.meta.updatedAt = new Date().toISOString();

    // Queue for batched broadcast
    this.queueUpdate(symbol, {
      symbol,
      session,
      price: sessionObj?.price ?? price,
      changePercent: sessionObj?.changePercent ?? null,
      volume: sessionObj?.volume ?? volume,
      sourceTime: sessionObj?.sourceTime ?? time,
      updatedAt: quote.meta.updatedAt
    });
  }

  queueUpdate(symbol, updateData) {
    this.batchUpdates.set(symbol, updateData);
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null;
        this.flushBatch();
      }, this.batchIntervalMs);
      this.batchTimer.unref?.();
    }
  }

  flushBatch() {
    if (!this.batchUpdates.size) return;
    const updates = Array.from(this.batchUpdates.values());
    this.batchUpdates.clear();
    this.broadcast({ type: 'quotes', data: updates });
  }

  broadcast(message) {
    if (!this.sseClients.size) return;
    const payload = `data: ${JSON.stringify(message)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.res.write(payload);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Fetch snapshot for symbols. Merges into local quote store.
   */
  async getQuotes(symbols = []) {
    const symList = [...new Set(symbols.map(s => String(s).trim().toUpperCase()).filter(Boolean))];
    const sessionInfo = getCurrentSession();

    if (!symList.length) {
      return {
        quotes: {},
        session: sessionInfo,
        provider: {
          name: this.provider.name || 'Longbridge',
          status: this.provider.status,
          reason: this.provider.statusReason,
          isConfigured: this.provider.isConfigured()
        }
      };
    }

    // Pull from provider
    const fresh = await this.provider.quote(symList);
    for (const [sym, q] of Object.entries(fresh)) {
      this.quotes.set(sym, q);
    }

    // Auto-fallback to public Yahoo Finance quotes if provider returned null prices
    const missingSymbols = symList.filter(s => {
      const q = this.quotes.get(s);
      return !q || q.regular?.price == null;
    });

    if (missingSymbols.length > 0) {
      const chunkSize = 14;
      for (let i = 0; i < missingSymbols.length; i += chunkSize) {
        const chunk = missingSymbols.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async sym => {
          const fallback = await fetchYahooQuote(sym);
          if (fallback) {
            this.quotes.set(sym, fallback);
          }
        }));
      }
    }

    // Auto-subscribe to pushes for requested symbols
    this.provider.subscribe?.(symList);

    const result = {};
    for (const s of symList) {
      result[s] = this.quotes.get(s) || fresh[s];
    }

    const isConfigured = this.provider.isConfigured();
    return {
      quotes: result,
      session: sessionInfo,
      provider: {
        name: isConfigured ? (this.provider.name || 'Longbridge') : 'Yahoo Finance (备用源)',
        status: isConfigured ? this.provider.status : 'active',
        reason: isConfigured ? this.provider.statusReason : '已启用公开市场备用源',
        isConfigured
      }
    };
  }

  /**
   * Attach SSE client
   */
  addClient(req, res, symbols = []) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });
    res.flushHeaders?.();

    const client = { res, symbols };
    this.sseClients.add(client);

    // Initial connected ping
    res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);

    // Subscribe provider to symbols if any
    if (symbols.length) {
      this.provider.subscribe?.(symbols);
    }

    req.on('close', () => {
      this.sseClients.delete(client);
    });
  }
}

let defaultService = null;
export function getWatchlistQuoteService(options) {
  if (!defaultService || options) {
    defaultService = new WatchlistQuoteService(options);
  }
  return defaultService;
}
