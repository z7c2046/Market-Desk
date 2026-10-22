// Central Watchlist Quote Store and SSE Dispatcher
// Merges multi-session quotes, handles deduplication, throttling (100-250ms batching), and SSE streams.

import { LongbridgeProvider } from './quote-providers/longbridge.js';
import { getCurrentSession, calcChangePercent, resolveExtReferenceClose, SESSION_TYPES } from './market-sessions.js';

export class WatchlistQuoteService {
  constructor({ provider = new LongbridgeProvider(), batchIntervalMs = 150 } = {}) {
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

    this.startHeartbeat();
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.broadcast({ type: 'heartbeat', ts: Date.now() });
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
          name: 'Longbridge',
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

    // Auto-subscribe to pushes for requested symbols
    this.provider.subscribe?.(symList);

    const result = {};
    for (const s of symList) {
      result[s] = this.quotes.get(s) || fresh[s];
    }

    return {
      quotes: result,
      session: sessionInfo,
      provider: {
        name: 'Longbridge',
        status: this.provider.status,
        reason: this.provider.statusReason,
        isConfigured: this.provider.isConfigured()
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
