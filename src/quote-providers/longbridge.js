// Longbridge (长桥) OpenAPI Quote Adapter for US Equity Multi-Session Data
// Supports US LV1: Regular, Pre-market, Post-market, and Overnight (开启隔夜)

import { buildMultiSessionQuote, SESSION_TYPES } from '../market-sessions.js';

let longportSdk = null;
async function getSdk() {
  if (!longportSdk) {
    try {
      longportSdk = await import('longport');
    } catch {
      longportSdk = null;
    }
  }
  return longportSdk;
}

export function toLongbridgeSymbol(raw) {
  if (!raw) return '';
  const s = String(raw).trim().toUpperCase();
  if (s.endsWith('.US')) return s;
  // Format BRK-B to BRK.B.US
  const clean = s.replace(/-/g, '.');
  return `${clean}.US`;
}

export function fromLongbridgeSymbol(longSymbol) {
  if (!longSymbol) return '';
  const s = String(longSymbol).trim().toUpperCase();
  const withoutSuffix = s.endsWith('.US') ? s.slice(0, -3) : s;
  // Format BRK.B to BRK-B
  if (withoutSuffix === 'BRK.B') return 'BRK-B';
  return withoutSuffix;
}

function toNum(v) {
  if (v == null) return null;
  const n = Number(typeof v?.toString === 'function' ? v.toString() : v);
  return Number.isFinite(n) ? n : null;
}

function toMs(ts) {
  if (!ts) return null;
  // If Longport timestamp is seconds or Date or string
  if (typeof ts === 'number') {
    return ts < 1e11 ? ts * 1000 : ts;
  }
  if (ts instanceof Date) return ts.getTime();
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : null;
}

export class LongbridgeProvider {
  constructor(options = {}) {
    this.options = options;
    this.ctx = null;
    this.status = 'unconfigured'; // 'unconfigured' | 'connecting' | 'connected' | 'error'
    this.statusReason = '';
    this.listeners = new Set();
    this.subscribedSymbols = new Set();
    this.symbolRefCounts = new Map();
  }

  isConfigured() {
    const env = process.env;
    const appKey = this.options.appKey || env.LONGBRIDGE_APP_KEY || env.LONGPORT_APP_KEY;
    const appSecret = this.options.appSecret || env.LONGBRIDGE_APP_SECRET || env.LONGPORT_APP_SECRET;
    const accessToken = this.options.accessToken || env.LONGBRIDGE_ACCESS_TOKEN || env.LONGPORT_ACCESS_TOKEN;
    return Boolean(appKey && appSecret && accessToken);
  }

  getCredentials() {
    const env = process.env;
    return {
      appKey: this.options.appKey || env.LONGBRIDGE_APP_KEY || env.LONGPORT_APP_KEY || '',
      appSecret: this.options.appSecret || env.LONGBRIDGE_APP_SECRET || env.LONGPORT_APP_SECRET || '',
      accessToken: this.options.accessToken || env.LONGBRIDGE_ACCESS_TOKEN || env.LONGPORT_ACCESS_TOKEN || '',
      httpUrl: this.options.httpUrl || env.LONGBRIDGE_HTTP_URL || env.LONGPORT_HTTP_URL,
      wsUrl: this.options.wsUrl || env.LONGBRIDGE_WS_URL || env.LONGPORT_WS_URL,
      enableOvernight: env.LONGBRIDGE_ENABLE_OVERNIGHT !== 'false'
    };
  }

  onQuoteUpdate(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyUpdate(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Longbridge update listener error:', err);
      }
    }
  }

  async connect() {
    if (!this.isConfigured()) {
      this.status = 'unconfigured';
      this.statusReason = '长桥 OpenAPI 凭证未配置（可在 .env 设置 LONGBRIDGE_APP_KEY / SECRET / ACCESS_TOKEN）';
      return false;
    }

    if (this.ctx) return true;

    try {
      this.status = 'connecting';
      const sdk = await getSdk();
      if (!sdk) throw new Error('longport SDK 模块未加载');

      const creds = this.getCredentials();
      const config = sdk.Config.fromApikey(creds.appKey, creds.appSecret, creds.accessToken);

      this.ctx = await sdk.QuoteContext.new(config);

      // Register push handler
      this.ctx.setOnQuote((err, event) => {
        if (err) {
          console.error('Longbridge PushQuote error:', err);
          return;
        }
        if (!event) return;
        this.handlePushQuote(event);
      });

      this.status = 'connected';
      this.statusReason = '已连接长桥实时行情 (US LV1)';
      return true;
    } catch (err) {
      this.status = 'error';
      this.statusReason = `长桥连接失败: ${err.message || '未知错误'}`;
      this.ctx = null;
      return false;
    }
  }

  handlePushQuote(event) {
    const symbol = fromLongbridgeSymbol(event.symbol);
    const sessionKey = this.mapSession(event.tradeSession);
    const price = toNum(event.lastDone);
    const volume = toNum(event.volume);
    const timeMs = toMs(event.timestamp);

    this.notifyUpdate({
      symbol,
      session: sessionKey,
      price,
      volume,
      time: timeMs ? new Date(timeMs).toISOString() : null,
      provider: 'Longbridge',
      raw: event
    });
  }

  mapSession(longportSession) {
    const s = String(longportSession || '').toLowerCase();
    if (s.includes('pre')) return SESSION_TYPES.PRE;
    if (s.includes('post')) return SESSION_TYPES.POST;
    if (s.includes('overnight')) return SESSION_TYPES.OVERNIGHT;
    return SESSION_TYPES.REGULAR;
  }

  async quote(symbols = []) {
    if (!symbols.length) return {};

    if (!this.ctx) {
      const connected = await this.connect();
      if (!connected) {
        return this.buildFallbackQuotes(symbols);
      }
    }

    try {
      const longSymbols = symbols.map(toLongbridgeSymbol);
      const quotes = await this.ctx.quote(longSymbols);
      const results = {};

      for (const item of quotes || []) {
        const symbol = fromLongbridgeSymbol(item.symbol);
        const regularPrice = toNum(item.lastDone);
        const prevClose = toNum(item.prevClose);
        const regularVolume = toNum(item.volume);
        const regularTime = toMs(item.timestamp);

        // Pre-market quote
        const pre = item.preMarketQuote;
        const prePrice = toNum(pre?.lastDone);
        const preVolume = toNum(pre?.volume);
        const preTime = toMs(pre?.timestamp);

        // Post-market quote
        const post = item.postMarketQuote;
        const postPrice = toNum(post?.lastDone);
        const postVolume = toNum(post?.volume);
        const postTime = toMs(post?.timestamp);

        // Overnight quote
        const over = item.overnightQuote;
        const overPrice = toNum(over?.lastDone);
        const overVolume = toNum(over?.volume);
        const overTime = toMs(over?.timestamp);

        results[symbol] = buildMultiSessionQuote({
          symbol,
          regularPrice,
          regularPrevClose: prevClose,
          regularVolume,
          regularTime: regularTime ? new Date(regularTime).toISOString() : null,
          todayRthClose: regularPrice,
          prePrice,
          preVolume,
          preTime: preTime ? new Date(preTime).toISOString() : null,
          postPrice,
          postVolume,
          postTime: postTime ? new Date(postTime).toISOString() : null,
          overnightPrice: overPrice,
          overnightVolume: overVolume,
          overnightTime: overTime ? new Date(overTime).toISOString() : null,
          provider: 'Longbridge',
          coverage: 'US LV1',
          delayStatus: 'realtime',
          status: 'active'
        });
      }

      // Check any symbols not returned
      for (const s of symbols) {
        if (!results[s]) {
          results[s] = this.buildSingleFallback(s, '标的无行情或源未覆盖');
        }
      }

      return results;
    } catch (err) {
      return this.buildFallbackQuotes(symbols, `拉取行情失败: ${err.message}`);
    }
  }

  async subscribe(symbols = []) {
    if (!this.ctx || !symbols.length) return;
    try {
      const sdk = await getSdk();
      if (!sdk) return;
      const longSymbols = symbols.map(toLongbridgeSymbol);
      await this.ctx.subscribe(longSymbols, [sdk.SubType.Quote]);
      for (const s of symbols) {
        this.subscribedSymbols.add(s);
      }
    } catch (err) {
      console.warn('Longbridge subscribe warning:', err.message);
    }
  }

  async unsubscribe(symbols = []) {
    if (!this.ctx || !symbols.length) return;
    try {
      const sdk = await getSdk();
      if (!sdk) return;
      const longSymbols = symbols.map(toLongbridgeSymbol);
      await this.ctx.unsubscribe(longSymbols, [sdk.SubType.Quote]);
      for (const s of symbols) {
        this.subscribedSymbols.delete(s);
      }
    } catch (err) {
      console.warn('Longbridge unsubscribe warning:', err.message);
    }
  }

  buildFallbackQuotes(symbols, reason = '') {
    const res = {};
    for (const s of symbols) {
      res[s] = this.buildSingleFallback(s, reason || this.statusReason);
    }
    return res;
  }

  buildSingleFallback(symbol, reason = '') {
    return buildMultiSessionQuote({
      symbol,
      provider: 'Longbridge',
      coverage: 'US LV1',
      delayStatus: 'unconfirmed',
      status: this.isConfigured() ? 'error' : 'unconfigured',
      statusReason: reason || (this.isConfigured() ? '数据暂不可用' : '实时源未配置')
    });
  }
}
