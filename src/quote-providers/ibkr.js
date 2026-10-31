// Interactive Brokers (IBKR) Gateway Quote Provider for US Equity & Multi-Session Data
// Connects to local IB Gateway / TWS via high-performance Native Socket Protocol (Port 4002 / 4001 / 7497 / 7496)
// Supports streaming real-time ticks: Regular, Pre-market, Post-market, and Overnight with auto-reconnection.

import net from 'node:net';
import { buildMultiSessionQuote, getCurrentSession, calcChangePercent, SESSION_TYPES } from '../market-sessions.js';

// IB TWS Socket API Constants
const OUT_MSG = {
  REQ_MKT_DATA: 1,
  CANCEL_MKT_DATA: 2,
  START_API: 71,
  REQ_CURRENT_TIME: 49,
  REQ_MARKET_DATA_TYPE: 59
};

const IN_MSG = {
  TICK_PRICE: 1,
  TICK_SIZE: 2,
  ERR_MSG: 4,
  NEXT_VALID_ID: 9,
  MANAGED_ACCTS: 15,
  TICK_GENERIC: 46,
  TICK_STRING: 47,
  CURRENT_TIME: 49
};

export const TICK_TYPES = {
  BID_SIZE: 0,
  BID: 1,
  ASK: 2,
  ASK_SIZE: 3,
  LAST: 4,
  LAST_SIZE: 5,
  HIGH: 6,
  LOW: 7,
  VOLUME: 8,
  CLOSE: 9,
  OPEN: 14,
  LAST_TIMESTAMP: 45,
  // Delayed ticks (fallback when account has delayed or unbundled market data)
  DELAYED_BID: 66,
  DELAYED_ASK: 67,
  DELAYED_LAST: 68,
  DELAYED_BID_SIZE: 69,
  DELAYED_HIGH: 70,
  DELAYED_LOW: 71,
  DELAYED_ASK_SIZE: 72,
  DELAYED_HIGH_ALT: 72,
  DELAYED_LOW_ALT: 73,
  DELAYED_VOLUME: 74,
  DELAYED_CLOSE: 75,
  DELAYED_OPEN: 76,
  DELAYED_LAST_TIMESTAMP: 88
};

export function toIbkrSymbol(raw) {
  if (!raw) return '';
  const s = String(raw).trim().toUpperCase();
  // Normalize BRK-B or BRK.B to BRK B for IBKR contract symbol
  if (s === 'BRK.B' || s === 'BRK-B') return 'BRK B';
  if (s === 'BF.B' || s === 'BF-B') return 'BF B';
  if (s.endsWith('.US')) return s.slice(0, -3);
  return s;
}

export function fromIbkrSymbol(ibSymbol) {
  if (!ibSymbol) return '';
  const s = String(ibSymbol).trim().toUpperCase();
  if (s === 'BRK B') return 'BRK-B';
  if (s === 'BF B') return 'BF-B';
  return s;
}

export function buildIbkrContract(rawSymbol) {
  const symbol = toIbkrSymbol(rawSymbol);
  const isHk = symbol.endsWith('.HK') || /^\d{4,5}$/.test(symbol);
  if (isHk) {
    const rawNum = symbol.replace('.HK', '').replace(/^0+/, '');
    return {
      symbol: rawNum.length < 4 ? rawNum.padStart(4, '0') : rawNum,
      secType: 'STK',
      exchange: 'SEHK',
      primaryExchange: 'SEHK',
      currency: 'HKD'
    };
  }

  return {
    symbol,
    secType: 'STK',
    exchange: 'SMART',
    primaryExchange: 'ISLAND',
    currency: 'USD'
  };
}

export function encodeIbkrMsg(fields) {
  const str = fields.map(f => (f == null ? '' : String(f))).join('\0') + '\0';
  const payload = Buffer.from(str, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export function decodeIbkrFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const len = buffer.readUInt32BE(offset);
    if (offset + 4 + len > buffer.length) break; // Incomplete frame
    const payload = buffer.subarray(offset + 4, offset + 4 + len).toString('utf8');
    const fields = payload.split('\0');
    if (fields.length && fields[fields.length - 1] === '') fields.pop();
    frames.push(fields);
    offset += 4 + len;
  }
  return { frames, remainder: buffer.subarray(offset) };
}

export async function detectIbkrPort(host = '127.0.0.1', candidates = [4001, 4002, 7496, 7497], timeoutMs = 300) {
  for (const port of candidates) {
    const reachable = await new Promise(resolve => {
      const sock = net.createConnection({ host, port }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.setTimeout(timeoutMs);
      sock.on('timeout', () => { sock.destroy(); resolve(false); });
      sock.on('error', () => { sock.destroy(); resolve(false); });
    });
    if (reachable) return port;
  }
  return candidates[0];
}

export class IbkrProvider {
  constructor(options = {}) {
    this.options = options;
    this.name = 'Interactive Brokers (IB Gateway)';
    this.host = options.host || process.env.IB_GATEWAY_HOST || '127.0.0.1';
    this.explicitPort = Boolean(options.port || process.env.IB_GATEWAY_PORT);
    this.port = Number(options.port || process.env.IB_GATEWAY_PORT || 4001);
    this.clientId = options.clientId !== undefined ? Number(options.clientId) : (process.env.IB_CLIENT_ID ? Number(process.env.IB_CLIENT_ID) : 1);
    this.connectTimeoutMs = Number(options.timeout || process.env.IB_CONNECT_TIMEOUT || 4000);
    this.autoReconnect = options.autoReconnect ?? (process.env.IB_AUTO_RECONNECT !== 'false');

    this.socket = null;
    this.status = 'unconfigured'; // 'unconfigured' | 'connecting' | 'connected' | 'disconnected' | 'error'
    this.statusReason = '';
    this.serverVersion = null;
    this.serverTime = null;
    this.connectedAt = null;
    this.reconnectCount = 0;
    this.reconnectTimer = null;

    this.listeners = new Set();
    this.subscribedSymbols = new Set();
    this.symbolToReqId = new Map();
    this.reqIdToSymbol = new Map();
    this.nextReqId = 1000;

    this.receiveBuffer = Buffer.alloc(0);
    this.handshakeState = 'idle'; // 'idle' | 'await_server_version' | 'ready'
    this.quotes = new Map(); // symbol -> MultiSessionQuote
  }

  isConfigured() {
    const env = process.env;
    if (env.IB_GATEWAY_ENABLED === 'false') return false;
    const providerSetting = (env.QUOTE_PROVIDER || '').toLowerCase();
    if (providerSetting && providerSetting !== 'ibkr' && providerSetting !== 'auto') {
      return false;
    }
    return Boolean(this.host && this.port);
  }

  getCredentials() {
    return {
      host: this.host,
      port: this.port,
      clientId: this.clientId,
      isConfigured: this.isConfigured(),
      autoReconnect: this.autoReconnect
    };
  }

  getStatus() {
    return {
      name: this.name,
      status: this.status,
      statusReason: this.statusReason,
      isConfigured: this.isConfigured(),
      host: this.host,
      port: this.port,
      clientId: this.clientId,
      serverVersion: this.serverVersion,
      serverTime: this.serverTime,
      connectedAt: this.connectedAt,
      subscribedCount: this.subscribedSymbols.size,
      subscribedSymbols: Array.from(this.subscribedSymbols),
      reconnectCount: this.reconnectCount
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
        console.error('IBKR update listener error:', err);
      }
    }
  }

  async connect() {
    if (this.status === 'connected' && this.socket && !this.socket.destroyed) {
      return true;
    }

    if (!this.isConfigured()) {
      this.status = 'unconfigured';
      this.statusReason = 'IB Gateway 未启用或配置无效（可在 .env 中设置 IB_GATEWAY_HOST 与 IB_GATEWAY_PORT）';
      return false;
    }

    if (this.status === 'connecting') {
      return false;
    }

    this.status = 'connecting';
    this.handshakeState = 'idle';
    this.receiveBuffer = Buffer.alloc(0);

    const candidates = this.explicitPort ? [this.port] : [4001, 4002, 7497, 7496];

    return new Promise(async resolve => {
      let resolved = false;
      const done = success => {
        if (!resolved) {
          resolved = true;
          if (timer) clearTimeout(timer);
          resolve(success);
        }
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          this.status = 'disconnected';
          this.statusReason = `连接 IB Gateway 超时 (${this.connectTimeoutMs}ms)，请确认本地 IB Gateway / TWS 是否在 ${this.host}:${this.port} 启动并开启 API 访问`;
          if (this.socket) {
            this.socket.destroy();
            this.socket = null;
          }
          done(false);
          this.scheduleReconnect();
        }
      }, this.connectTimeoutMs);
      timer.unref?.();

      let connectedSocket = null;
      for (const p of candidates) {
        if (resolved) break;
        this.statusReason = `正在连接本地 IB Gateway (${this.host}:${p})...`;
        const candidateSocket = await new Promise(resSock => {
          const s = net.connect({ host: this.host, port: p }, () => resSock(s));
          s.once('error', () => {
            s.destroy();
            resSock(null);
          });
        });
        if (candidateSocket) {
          this.port = p;
          connectedSocket = candidateSocket;
          break;
        }
      }

      if (!connectedSocket) {
        this.status = 'error';
        this.statusReason = `未能连接到本地 IB Gateway (${this.host} 端口 ${candidates.join('/')})`;
        done(false);
        if (this.autoReconnect) this.scheduleReconnect();
        return;
      }

      this.socket = connectedSocket;
      this.sendHandshake();

      connectedSocket.on('data', chunk => {
        this.handleSocketData(chunk, () => done(true));
      });

      connectedSocket.on('error', err => {
        this.status = 'error';
        this.statusReason = `IB Gateway 连接错误: ${err.message || '网络无法连接'}`;
        done(false);
      });

      connectedSocket.on('close', () => {
        const wasConnected = (this.status === 'connected');
        this.status = 'disconnected';
        this.statusReason = wasConnected
          ? '本地 IB Gateway 连接已断开，正在尝试重连...'
          : `未能连接到本地 IB Gateway (${this.host}:${this.port})`;
        this.socket = null;
        done(false);
        if (wasConnected && this.autoReconnect) {
          this.scheduleReconnect();
        }
      });
    });
  }

  sendHandshake() {
    if (!this.socket || this.socket.destroyed) return;
    this.handshakeState = 'await_server_version';

    // TWS v100+ connection header: "API\0" + 4-byte length + "v100..176"
    const prefix = Buffer.from('API\0', 'utf8');
    const versionStr = 'v100..176';
    const versionBuf = Buffer.from(versionStr, 'utf8');
    const lenHeader = Buffer.alloc(4);
    lenHeader.writeUInt32BE(versionBuf.length, 0);

    this.socket.write(Buffer.concat([prefix, lenHeader, versionBuf]));
  }

  sendStartApi() {
    if (!this.socket || this.socket.destroyed) return;
    // START_API: Msg ID 71, Version 2, clientId, optionalCapabilities
    const msg = encodeIbkrMsg([OUT_MSG.START_API, '2', String(this.clientId), '']);
    this.socket.write(msg);
  }

  setMarketDataType(type = 3) {
    if (!this.socket || this.socket.destroyed) return;
    // REQ_MARKET_DATA_TYPE: Msg ID 59, Version 1, marketDataType (3: Delayed with live fallback)
    const msg = encodeIbkrMsg([OUT_MSG.REQ_MARKET_DATA_TYPE, '1', String(type)]);
    this.socket.write(msg);
  }

  handleSocketData(chunk, onConnectedCallback) {
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);

    // Handshake step 1: Server sends back [serverVersion, serverTime]
    if (this.handshakeState === 'await_server_version') {
      const { frames, remainder } = decodeIbkrFrames(this.receiveBuffer);
      this.receiveBuffer = remainder;
      if (frames.length > 0) {
        const frame0 = frames[0];
        this.serverVersion = Number(frame0[0]) || 176;
        this.serverTime = frame0[1] || '';
        this.handshakeState = 'ready';

        // Send START_API
        this.sendStartApi();

        // Process remaining frames if any
        for (let i = 1; i < frames.length; i++) {
          this.dispatchFrame(frames[i], onConnectedCallback);
        }
      }
      return;
    }

    // Normal stream frames
    const { frames, remainder } = decodeIbkrFrames(this.receiveBuffer);
    this.receiveBuffer = remainder;
    for (const frame of frames) {
      this.dispatchFrame(frame, onConnectedCallback);
    }
  }

  dispatchFrame(frame, onConnectedCallback) {
    if (!frame || !frame.length) return;
    const msgId = Number(frame[0]);

    switch (msgId) {
      case IN_MSG.NEXT_VALID_ID: {
        const orderId = frame.length >= 3 ? (Number(frame[2]) || Number(frame[1]) || 1) : (Number(frame[1]) || 1);
        this.nextReqId = Math.max(this.nextReqId, orderId + 100);
        this.status = 'connected';
        this.statusReason = `已连接本地 IB Gateway (协议版本 v${this.serverVersion || 176})`;
        this.connectedAt = new Date().toISOString();
        this.reconnectCount = 0;
        this.setMarketDataType(3);
        if (onConnectedCallback) onConnectedCallback();

        // Resubscribe active symbols after reconnect
        this.resubscribeAll();
        break;
      }

      case IN_MSG.TICK_PRICE: {
        this.handleTickPrice(frame);
        break;
      }

      case IN_MSG.TICK_SIZE: {
        this.handleTickSize(frame);
        break;
      }

      case IN_MSG.TICK_STRING: {
        this.handleTickString(frame);
        break;
      }

      case IN_MSG.ERR_MSG: {
        this.handleErrorMessage(frame);
        break;
      }

      default:
        break;
    }
  }

  handleTickPrice(frame) {
    // Supports both versioned: [msgId, version, tickerId, tickType, price, size, attrMask]
    // and versionless: [msgId, tickerId, tickType, price, size, attrMask]
    let tickerId, tickType, price;
    if (this.reqIdToSymbol.has(Number(frame[1]))) {
      tickerId = Number(frame[1]);
      tickType = Number(frame[2]);
      price = Number(frame[3]);
    } else if (this.reqIdToSymbol.has(Number(frame[2]))) {
      tickerId = Number(frame[2]);
      tickType = Number(frame[3]);
      price = Number(frame[4]);
    } else if (frame.length >= 6) {
      tickerId = Number(frame[2]);
      tickType = Number(frame[3]);
      price = Number(frame[4]);
    } else if (frame.length >= 4) {
      tickerId = Number(frame[1]);
      tickType = Number(frame[2]);
      price = Number(frame[3]);
    } else {
      return;
    }

    if (!Number.isFinite(price) || price <= 0) return;
    const symbol = this.reqIdToSymbol.get(tickerId);
    if (!symbol) return;

    let quote = this.quotes.get(symbol);
    if (!quote) {
      quote = buildMultiSessionQuote({ symbol, provider: 'Interactive Brokers', delayStatus: 'realtime' });
      this.quotes.set(symbol, quote);
    }

    const currentSess = getCurrentSession();
    const sessionKey = currentSess.session;
    const nowIso = new Date().toISOString();

    const isLast = (tickType === TICK_TYPES.LAST || tickType === 68);
    const isClose = (tickType === TICK_TYPES.CLOSE || tickType === 73 || tickType === 75);
    const isHigh = (tickType === TICK_TYPES.HIGH || tickType === 70 || tickType === 72);
    const isLow = (tickType === TICK_TYPES.LOW || tickType === 71 || tickType === 73);
    const isOpen = (tickType === TICK_TYPES.OPEN || tickType === 75 || tickType === 76);

    if (tickType === 68 || tickType === 73 || tickType === 74 || tickType === 75) {
      quote.delayStatus = 'delayed';
    }

    if (isLast) {
      // Latest traded price in active market session
      if (quote[sessionKey]) {
        quote[sessionKey].price = price;
        if (quote[sessionKey].referenceClose > 0) {
          quote[sessionKey].changePercent = calcChangePercent(price, quote[sessionKey].referenceClose);
        }
      }
      // Store in regular as base price if in regular session, closed, or not yet set
      if (sessionKey === SESSION_TYPES.REGULAR || sessionKey === 'closed' || !quote.regular.price) {
        quote.regular.price = price;
        quote.todayRthClose = price;
        if (quote.regularPrevClose > 0) {
          quote.regular.changePercent = calcChangePercent(price, quote.regularPrevClose);
        }
      }
      quote.meta.updatedAt = nowIso;

      this.notifyUpdate({
        symbol,
        session: sessionKey,
        price,
        volume: quote[sessionKey]?.volume ?? quote.regular.volume,
        time: nowIso,
        provider: 'Interactive Brokers'
      });
    } else if (isClose) {
      // Official closing price of previous regular trading session
      quote.regularPrevClose = price;
      quote.regular.referenceClose = price;
      if (quote.regular.price > 0) {
        quote.regular.changePercent = calcChangePercent(quote.regular.price, price);
      }
      quote.meta.updatedAt = nowIso;
    }
  }

  handleTickSize(frame) {
    let tickerId, tickType, size;
    if (this.reqIdToSymbol.has(Number(frame[1]))) {
      tickerId = Number(frame[1]);
      tickType = Number(frame[2]);
      size = Number(frame[3]);
    } else if (this.reqIdToSymbol.has(Number(frame[2]))) {
      tickerId = Number(frame[2]);
      tickType = Number(frame[3]);
      size = Number(frame[4]);
    } else if (frame.length >= 5) {
      tickerId = Number(frame[2]);
      tickType = Number(frame[3]);
      size = Number(frame[4]);
    } else if (frame.length >= 4) {
      tickerId = Number(frame[1]);
      tickType = Number(frame[2]);
      size = Number(frame[3]);
    } else {
      return;
    }

    if (!Number.isFinite(size) || size < 0) return;
    const symbol = this.reqIdToSymbol.get(tickerId);
    if (!symbol) return;

    const quote = this.quotes.get(symbol);
    if (!quote) return;

    const isVolume = (tickType === TICK_TYPES.VOLUME || tickType === 74 || tickType === 76);
    if (tickType === 74 || tickType === 76) {
      quote.delayStatus = 'delayed';
    }

    if (isVolume) {
      const currentSess = getCurrentSession();
      quote.regular.volume = size;
      if (quote[currentSess.session]) {
        quote[currentSess.session].volume = size;
      }
      quote.meta.updatedAt = new Date().toISOString();

      this.notifyUpdate({
        symbol,
        session: currentSess.session,
        price: quote[currentSess.session]?.price ?? quote.regular.price,
        volume: size,
        time: quote.meta.updatedAt,
        provider: 'Interactive Brokers'
      });
    }
  }

  handleTickString(frame) {
    let tickerId, tickType, value;
    if (this.reqIdToSymbol.has(Number(frame[1]))) {
      tickerId = Number(frame[1]);
      tickType = Number(frame[2]);
      value = frame[3];
    } else if (this.reqIdToSymbol.has(Number(frame[2]))) {
      tickerId = Number(frame[2]);
      tickType = Number(frame[3]);
      value = frame[4];
    } else if (frame.length >= 5) {
      tickerId = Number(frame[2]);
      tickType = Number(frame[3]);
      value = frame[4];
    } else if (frame.length >= 4) {
      tickerId = Number(frame[1]);
      tickType = Number(frame[2]);
      value = frame[3];
    } else {
      return;
    }

    const symbol = this.reqIdToSymbol.get(tickerId);
    if (!symbol) return;

    const quote = this.quotes.get(symbol);
    if (!quote) return;

    if (tickType === TICK_TYPES.LAST_TIMESTAMP) {
      const sec = Number(value);
      if (Number.isFinite(sec) && sec > 0) {
        const timeIso = new Date(sec * 1000).toISOString();
        quote.regular.sourceTime = timeIso;
        quote.meta.updatedAt = timeIso;
      }
    }
  }

  handleErrorMessage(frame) {
    if (frame.length < 4) return;
    const id = Number(frame[1]);
    const errorCode = Number(frame[2]);
    const errorMsg = frame[3];

    // Notification / status codes:
    // 2104: Market data farm connection OK
    // 2106: HMDS data farm connection OK
    // 2119: Market data farm connecting
    // 2158: Sec-def data farm connection OK
    // 10167: Requested market data is not subscribed. Displaying delayed data.
    // 10089: Requested market data requires additional subscription. Delayed available.
    if ([2104, 2106, 2119, 2158, 10167, 10089].includes(errorCode)) {
      if (errorCode === 10167 || errorCode === 10089) {
        const symbol = this.reqIdToSymbol.get(id);
        if (symbol) {
          const q = this.quotes.get(symbol);
          if (q) q.delayStatus = 'delayed';
        }
      }
      return;
    }

    // Error 326: Client ID already in use -> auto-increment and reconnect
    if (errorCode === 326) {
      const nextId = (this.clientId % 900) + 1;
      console.warn(`[IBKR Gateway] Client ID ${this.clientId} 已被占用，自动切换为 Client ID ${nextId} 重新连接...`);
      this.clientId = nextId;
      this.reconnect().catch(() => {});
      return;
    }

    if (errorCode > 0) {
      console.warn(`[IBKR Gateway Warning] ReqId: ${id}, Code: ${errorCode}, Msg: ${errorMsg}`);
    }
  }

  scheduleReconnect() {
    if (!this.autoReconnect || this.reconnectTimer) return;
    const delay = Math.min(30000, 2000 * Math.pow(1.5, Math.min(this.reconnectCount++, 6)));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.status !== 'connected') {
        this.connect().catch(() => {});
      }
    }, delay);
    this.reconnectTimer.unref?.();
  }

  async reconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.status = 'unconfigured';
    return this.connect();
  }

  resubscribeAll() {
    const symbols = Array.from(this.subscribedSymbols);
    if (!symbols.length || this.status !== 'connected') return;
    for (const sym of symbols) {
      this.sendReqMktDataForSymbol(sym);
    }
  }

  sendReqMktDataForSymbol(rawSymbol) {
    if (!this.socket || this.socket.destroyed || this.status !== 'connected') return;
    const symbol = String(rawSymbol).trim().toUpperCase();
    let reqId = this.symbolToReqId.get(symbol);
    if (!reqId) {
      reqId = ++this.nextReqId;
      this.symbolToReqId.set(symbol, reqId);
      this.reqIdToSymbol.set(reqId, symbol);
    }

    const c = buildIbkrContract(symbol);
    // REQ_MKT_DATA: [1, version 11, reqId, conId, symbol, secType, lastTradeDate, strike, right, multiplier, exchange, primaryExchange, currency, localSymbol, tradingClass, deltaNeutralContract, genericTicks, snapshot, regSnapshot, mktDataOptions]
    const msg = encodeIbkrMsg([
      OUT_MSG.REQ_MKT_DATA,
      '11',
      String(reqId),
      '0',
      c.symbol,
      c.secType,
      '',
      '0',
      '',
      '',
      c.exchange,
      c.primaryExchange,
      c.currency,
      '',
      '',
      '0',
      '100,101,104,106,165,221,225,233',
      '0', // streaming
      '0',
      ''
    ]);
    this.socket.write(msg);
  }

  sendCancelMktDataForSymbol(rawSymbol) {
    if (!this.socket || this.socket.destroyed) return;
    const symbol = String(rawSymbol).trim().toUpperCase();
    const reqId = this.symbolToReqId.get(symbol);
    if (!reqId) return;

    const msg = encodeIbkrMsg([OUT_MSG.CANCEL_MKT_DATA, '2', String(reqId)]);
    this.socket.write(msg);

    this.symbolToReqId.delete(symbol);
    this.reqIdToSymbol.delete(reqId);
  }

  async subscribe(symbols = []) {
    for (const s of symbols) {
      const sym = String(s).trim().toUpperCase();
      if (!sym) continue;
      this.subscribedSymbols.add(sym);
      if (this.status === 'connected') {
        this.sendReqMktDataForSymbol(sym);
      }
    }
    if (this.status !== 'connected' && this.isConfigured()) {
      this.connect().catch(() => {});
    }
  }

  async unsubscribe(symbols = []) {
    for (const s of symbols) {
      const sym = String(s).trim().toUpperCase();
      this.subscribedSymbols.delete(sym);
      this.sendCancelMktDataForSymbol(sym);
    }
  }

  async quote(symbols = []) {
    if (!symbols.length) return {};
    const symList = [...new Set(symbols.map(s => String(s).trim().toUpperCase()).filter(Boolean))];

    // Ensure connection & subscriptions
    if (this.status !== 'connected' && this.isConfigured()) {
      await this.connect().catch(() => {});
    }
    this.subscribe(symList);

    const result = {};
    for (const sym of symList) {
      const existing = this.quotes.get(sym);
      if (existing) {
        result[sym] = existing;
      } else {
        const placeholder = buildMultiSessionQuote({
          symbol: sym,
          provider: 'Interactive Brokers',
          coverage: 'IBKR Gateway',
          delayStatus: this.status === 'connected' ? 'realtime' : 'unconfirmed',
          status: this.status === 'connected' ? 'active' : this.status,
          statusReason: this.statusReason
        });
        this.quotes.set(sym, placeholder);
        result[sym] = placeholder;
      }
    }
    return result;
  }

  destroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.autoReconnect = false;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.status = 'disconnected';
    this.listeners.clear();
    this.subscribedSymbols.clear();
    this.symbolToReqId.clear();
    this.reqIdToSymbol.clear();
  }
}
