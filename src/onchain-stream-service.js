import { ONCHAIN_STOCK_CANDIDATES, getOnchainStocksService } from './onchain-stocks-service.js';

/**
 * On-Chain Real-Time WebSocket Stream & Multi-Tier Failover Engine (链上美股与加密货币实时流及三级链式容灾服务)
 *
 * 三级链式容灾架构 (3-Tier Failover Chain):
 *  - Tier 1 [主通道 · 0延迟] `hyperliquid-ws`:
 *      直连 Hyperliquid L1 去中心化交易所官方 WebSocket (`wss://api.hyperliquid.xyz/ws`)，
 *      订阅全部 TradFi 链上美股/指数合约 (`xyz:*` activeAssetCtx)、主流加密永续 (`BTC/ETH/SOL/...` activeAssetCtx)
 *      以及前端当前正在查看的实时 K 线 (`candle` 频道)。
 *  - Tier 2 [二级跨所与协议容灾] `binance-ws+hl-rest` / `hl-rest`:
 *      当 Hyperliquid WebSocket 断连、超时或静默超过阈值时自动无缝切换：
 *      1) 加密货币轨道自动切至 币安合约 WebSocket (`wss://fstream.binance.com/stream?streams=!miniTicker@arr` 及 `@kline`)；
 *      2) TradFi 链上美股轨道（因 `xyz:*` 为 Hyperliquid DEX 原生独有合约）自动降级为 Hyperliquid `/info` 高频 REST 轮询，
 *      同时后台按指数退避探测重连 Tier 1，恢复后自动无缝切回主通道。
 *  - Tier 3 [三级终极兜底] `yahoo-fallback`:
 *      当链上 WebSocket 与链上 REST 节点均不可达时，自动回退至正股/公开市场行情源 (`OnchainStocksService` / Yahoo Finance)，
 *      保证极端网络环境下行情不断流、界面不白屏。
 */

const CORE_CRYPTO_COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'SUI', 'AVAX', 'LINK', 'HYPE', 'ADA'];

const BINANCE_SYMBOL_TO_COIN = {
  BTCUSDT: 'BTC',
  ETHUSDT: 'ETH',
  SOLUSDT: 'SOL',
  BNBUSDT: 'BNB',
  XRPUSDT: 'XRP',
  DOGEUSDT: 'DOGE',
  SUIUSDT: 'SUI',
  AVAXUSDT: 'AVAX',
  LINKUSDT: 'LINK',
  ADAUSDT: 'ADA'
};

const COIN_TO_BINANCE_SYMBOL = Object.fromEntries(
  Object.entries(BINANCE_SYMBOL_TO_COIN).map(([bSym, coin]) => [coin, bSym.toLowerCase()])
);

function normalizePerpCoin(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const colonIdx = s.indexOf(':');
  if (colonIdx > 0) {
    return `${s.slice(0, colonIdx).toLowerCase()}:${s.slice(colonIdx + 1).toUpperCase()}`;
  }
  return s.replace(/-USD$/i, '').replace(/\/USD$/i, '').toUpperCase();
}

export class OnchainStreamService {
  constructor({
    WebSocketImpl = globalThis.WebSocket,
    fetchImpl = globalThis.fetch,
    onchainStockService = getOnchainStocksService(),
    hlWsUrl = 'wss://api.hyperliquid.xyz/ws',
    hlRestUrl = 'https://api.hyperliquid.xyz/info',
    binanceWsBaseUrl = 'wss://fstream.binance.com/stream',
    batchIntervalMs = 120,
    hlConnectTimeoutMs = 5000,
    hlStaleTimeoutMs = 12000,
    hlPingIntervalMs = 25000,
    restPollIntervalMs = 2800,
    reconnectBaseMs = 2000,
    reconnectMaxMs = 15000
  } = {}) {
    this.WebSocketImpl = WebSocketImpl;
    this.fetch = fetchImpl;
    this.onchainStockService = onchainStockService;
    this.hlWsUrl = hlWsUrl;
    this.hlRestUrl = hlRestUrl;
    this.binanceWsBaseUrl = binanceWsBaseUrl;
    this.batchIntervalMs = batchIntervalMs;
    this.hlConnectTimeoutMs = hlConnectTimeoutMs;
    this.hlStaleTimeoutMs = hlStaleTimeoutMs;
    this.hlPingIntervalMs = hlPingIntervalMs;
    this.restPollIntervalMs = restPollIntervalMs;
    this.reconnectBaseMs = reconnectBaseMs;
    this.reconnectMaxMs = reconnectMaxMs;

    this.sseClients = new Set();
    this.activeTier = 'idle'; // 'idle' | 'hyperliquid-ws' | 'binance-ws+hl-rest' | 'hl-rest' | 'yahoo-fallback'
    this.hlWs = null;
    this.hlConnected = false;
    this.hlLastMsgAt = 0;
    this.hlReconnectAttempts = 0;
    this.hlSubscribedCandles = new Set();

    this.binanceWs = null;
    this.binanceConnected = false;
    this.binanceCandleKey = '';

    this.hlConnectTimer = null;
    this.hlPingTimer = null;
    this.hlWatchdogTimer = null;
    this.hlReconnectTimer = null;
    this.fallbackPollTimer = null;
    this.batchTimer = null;

    this.latestStocks = new Map(); // symbol -> stock tick object
    this.latestCrypto = new Map(); // coin -> crypto tick object
    this.pendingStocks = new Map();
    this.pendingCrypto = new Map();
    this.pendingCandles = new Map(); // `${coin}|${interval}` -> candle event
  }

  getStatus() {
    return {
      ok: this.activeTier !== 'idle',
      tier: this.activeTier,
      isRealtimeWs: this.activeTier === 'hyperliquid-ws' || this.activeTier === 'binance-ws+hl-rest',
      clients: this.sseClients.size,
      hlConnected: this.hlConnected,
      binanceConnected: this.binanceConnected
    };
  }

  /**
   * 汇总所有当前活跃客户端订阅的 K 线频道 (coin + interval)
   */
  getDesiredCandleSpecs() {
    const map = new Map();
    for (const c of this.sseClients) {
      if (c.coin && c.interval) {
        const key = `${c.coin}|${c.interval}`;
        map.set(key, { coin: c.coin, interval: c.interval, key });
      }
    }
    return map;
  }

  addClient(req, res, { coin = '', interval = '' } = {}) {
    const normCoin = normalizePerpCoin(coin);
    const validInterval = ['1m', '5m', '15m', '1h', '4h', '1d'].includes(interval) ? interval : '';

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });
    res.flushHeaders?.();

    const client = { res, coin: normCoin, interval: validInterval };
    this.sseClients.add(client);

    this.ensureStarted();
    this.syncCandleSubscriptions();

    // 立即推送当前通道状态与最近一次热缓存快照，实现 0 等待首屏点亮
    this.sendToClient(client, {
      type: 'status',
      tier: this.activeTier,
      isRealtimeWs: this.activeTier === 'hyperliquid-ws' || this.activeTier === 'binance-ws+hl-rest',
      ts: Date.now()
    });

    if (this.latestStocks.size > 0 || this.latestCrypto.size > 0) {
      this.sendToClient(client, {
        type: 'ticks',
        tier: this.activeTier,
        stocks: Object.fromEntries(this.latestStocks),
        crypto: Object.fromEntries(this.latestCrypto),
        ts: Date.now()
      });
    }

    req.on('close', () => {
      this.sseClients.delete(client);
      if (this.sseClients.size === 0) {
        this.stop();
      } else {
        this.syncCandleSubscriptions();
      }
    });
  }

  sendToClient(client, payloadObj) {
    try {
      client.res.write(`data: ${JSON.stringify(payloadObj)}\n\n`);
    } catch {
      this.sseClients.delete(client);
    }
  }

  broadcast(payloadObj) {
    if (!this.sseClients.size) return;
    const frame = `data: ${JSON.stringify(payloadObj)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.res.write(frame);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  setTier(nextTier) {
    if (this.activeTier === nextTier) return;
    this.activeTier = nextTier;
    this.broadcast({
      type: 'status',
      tier: nextTier,
      isRealtimeWs: nextTier === 'hyperliquid-ws' || nextTier === 'binance-ws+hl-rest',
      ts: Date.now()
    });
  }

  ensureStarted() {
    if (this.hlWs || this.hlReconnectTimer || this.fallbackPollTimer) return;
    this.connectHyperliquidWs();
  }

  stop() {
    this.clearTimer('hlConnectTimer');
    this.clearTimer('hlPingTimer');
    this.clearTimer('hlWatchdogTimer');
    this.clearTimer('hlReconnectTimer');
    this.clearTimer('fallbackPollTimer');
    this.clearTimer('batchTimer');

    this.closeHlWs();
    this.closeBinanceWs();
    this.pendingStocks.clear();
    this.pendingCrypto.clear();
    this.pendingCandles.clear();
    this.hlReconnectAttempts = 0;
    this.activeTier = 'idle';
  }

  clearTimer(name) {
    if (this[name]) {
      clearTimeout(this[name]);
      clearInterval(this[name]);
      this[name] = null;
    }
  }

  closeHlWs() {
    this.clearTimer('hlConnectTimer');
    this.clearTimer('hlPingTimer');
    this.clearTimer('hlWatchdogTimer');
    this.hlConnected = false;
    this.hlSubscribedCandles.clear();
    if (this.hlWs) {
      const ws = this.hlWs;
      this.hlWs = null;
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      } catch { }
    }
  }

  closeBinanceWs() {
    this.binanceConnected = false;
    this.binanceCandleKey = '';
    if (this.binanceWs) {
      const ws = this.binanceWs;
      this.binanceWs = null;
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      } catch { }
    }
  }

  /**
   * Tier 1: 连接 Hyperliquid L1 官方 WebSocket
   */
  connectHyperliquidWs() {
    if (!this.sseClients.size) return;
    if (typeof this.WebSocketImpl !== 'function') {
      this.activateFailover('ws-unavailable');
      return;
    }

    this.closeHlWs();
    let ws;
    try {
      ws = new this.WebSocketImpl(this.hlWsUrl);
    } catch {
      this.activateFailover('ws-init-error');
      this.scheduleHlReconnect();
      return;
    }
    this.hlWs = ws;

    this.hlConnectTimer = setTimeout(() => {
      if (!this.hlConnected && this.hlWs === ws) {
        this.closeHlWs();
        this.activateFailover('hl-connect-timeout');
        this.scheduleHlReconnect();
      }
    }, this.hlConnectTimeoutMs);
    this.hlConnectTimer.unref?.();

    ws.onopen = () => {
      if (this.hlWs !== ws) return;
      this.clearTimer('hlConnectTimer');
      this.hlConnected = true;
      this.hlLastMsgAt = Date.now();
      this.hlReconnectAttempts = 0;

      // 订阅全部 TradFi 链上美股/指数合约 activeAssetCtx
      for (const item of ONCHAIN_STOCK_CANDIDATES) {
        this.sendHlJson({
          method: 'subscribe',
          subscription: { type: 'activeAssetCtx', coin: `xyz:${item.symbol}` }
        });
      }
      // 订阅核心主流加密货币永续合约 activeAssetCtx
      for (const coin of CORE_CRYPTO_COINS) {
        this.sendHlJson({
          method: 'subscribe',
          subscription: { type: 'activeAssetCtx', coin }
        });
      }

      this.syncCandleSubscriptions();

      // 心跳保活
      this.hlPingTimer = setInterval(() => {
        this.sendHlJson({ method: 'ping' });
      }, this.hlPingIntervalMs);
      this.hlPingTimer.unref?.();

      // 静默超时看门狗：若超过 hlStaleTimeoutMs 未收到任何推送，自动触发链式容灾
      this.hlWatchdogTimer = setInterval(() => {
        if (this.hlConnected && (Date.now() - this.hlLastMsgAt) > this.hlStaleTimeoutMs) {
          this.closeHlWs();
          this.activateFailover('hl-ws-stale');
          this.scheduleHlReconnect();
        }
      }, Math.max(1000, Math.floor(this.hlStaleTimeoutMs / 2)));
      this.hlWatchdogTimer.unref?.();
    };

    ws.onmessage = event => {
      if (this.hlWs !== ws) return;
      this.hlLastMsgAt = Date.now();
      let msg;
      try {
        msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.channel === 'activeAssetCtx' && msg.data?.ctx) {
        this.promoteToPrimaryTier();
        this.handleHlAssetCtx(msg.data.coin, msg.data.ctx);
      } else if (msg.channel === 'candle' && msg.data) {
        this.promoteToPrimaryTier();
        this.handleHlCandle(msg.data);
      }
    };

    ws.onerror = () => {
      if (this.hlWs !== ws) return;
      this.closeHlWs();
      this.activateFailover('hl-ws-error');
      this.scheduleHlReconnect();
    };

    ws.onclose = () => {
      if (this.hlWs !== ws) return;
      this.closeHlWs();
      if (this.sseClients.size > 0) {
        this.activateFailover('hl-ws-closed');
        this.scheduleHlReconnect();
      }
    };
  }

  /**
   * 当 Tier 1 (Hyperliquid WS) 收到真实数据帧时，立即关闭 Tier 2/3 容灾备份流并切回主通道
   */
  promoteToPrimaryTier() {
    if (this.activeTier !== 'hyperliquid-ws') {
      this.closeBinanceWs();
      this.clearTimer('fallbackPollTimer');
      this.setTier('hyperliquid-ws');
    }
  }

  sendHlJson(obj) {
    if (!this.hlWs || !this.hlConnected) return;
    try {
      this.hlWs.send(JSON.stringify(obj));
    } catch { }
  }

  syncCandleSubscriptions() {
    const desired = this.getDesiredCandleSpecs();

    if (this.hlConnected && this.hlWs) {
      for (const existingKey of [...this.hlSubscribedCandles]) {
        if (!desired.has(existingKey)) {
          const [coin, interval] = existingKey.split('|');
          this.sendHlJson({
            method: 'unsubscribe',
            subscription: { type: 'candle', coin, interval }
          });
          this.hlSubscribedCandles.delete(existingKey);
        }
      }
      for (const [key, spec] of desired.entries()) {
        if (!this.hlSubscribedCandles.has(key)) {
          this.sendHlJson({
            method: 'subscribe',
            subscription: { type: 'candle', coin: spec.coin, interval: spec.interval }
          });
          this.hlSubscribedCandles.add(key);
        }
      }
    }

    // 若当前处于币安容灾模式且活跃 K 线为加密货币，同步更新币安 K 线流
    if (this.binanceWs && !this.hlConnected) {
      let nextBinanceCandleKey = '';
      for (const spec of desired.values()) {
        if (!spec.coin.includes(':') && COIN_TO_BINANCE_SYMBOL[spec.coin]) {
          nextBinanceCandleKey = `${COIN_TO_BINANCE_SYMBOL[spec.coin]}@kline_${spec.interval}`;
          break;
        }
      }
      if (nextBinanceCandleKey !== this.binanceCandleKey) {
        this.connectBinanceFailoverWs();
      }
    }
  }

  scheduleHlReconnect() {
    if (!this.sseClients.size || this.hlReconnectTimer) return;
    const delay = Math.min(
      this.reconnectMaxMs,
      this.reconnectBaseMs * Math.pow(2, Math.min(this.hlReconnectAttempts, 4))
    );
    this.hlReconnectAttempts += 1;
    this.hlReconnectTimer = setTimeout(() => {
      this.hlReconnectTimer = null;
      if (this.sseClients.size > 0 && !this.hlConnected) {
        this.connectHyperliquidWs();
      }
    }, delay);
    this.hlReconnectTimer.unref?.();
  }

  /**
   * 激活二级/三级链式容灾 (Tier 2: Binance WS + Hyperliquid REST -> Tier 3: Yahoo Fallback)
   */
  activateFailover() {
    if (!this.sseClients.size || this.hlConnected) return;

    // 1. 启动二级跨所容灾：币安合约 WebSocket (覆盖主流加密货币实时毫秒跳动)
    if (!this.binanceWs && typeof this.WebSocketImpl === 'function') {
      this.connectBinanceFailoverWs();
    }

    // 2. 启动二级/三级轮询容灾：优先 Hyperliquid REST 快照，失败自动降级至 Yahoo Finance
    if (!this.fallbackPollTimer) {
      this.runFailoverPollCycle();
      this.fallbackPollTimer = setInterval(() => {
        this.runFailoverPollCycle();
      }, this.restPollIntervalMs);
      this.fallbackPollTimer.unref?.();
    }
  }

  connectBinanceFailoverWs() {
    if (!this.sseClients.size || this.hlConnected || typeof this.WebSocketImpl !== 'function') return;
    this.closeBinanceWs();

    const streams = ['!miniTicker@arr'];
    const desired = this.getDesiredCandleSpecs();
    let klineStream = '';
    for (const spec of desired.values()) {
      if (!spec.coin.includes(':') && COIN_TO_BINANCE_SYMBOL[spec.coin]) {
        klineStream = `${COIN_TO_BINANCE_SYMBOL[spec.coin]}@kline_${spec.interval}`;
        streams.push(klineStream);
        break;
      }
    }
    this.binanceCandleKey = klineStream;

    let ws;
    try {
      const sep = this.binanceWsBaseUrl.includes('?') ? '&' : '?';
      ws = new this.WebSocketImpl(`${this.binanceWsBaseUrl}${sep}streams=${streams.join('/')}`);
    } catch {
      return;
    }
    this.binanceWs = ws;

    ws.onopen = () => {
      if (this.binanceWs !== ws || this.hlConnected) return;
      this.binanceConnected = true;
      if (this.activeTier !== 'yahoo-fallback') {
        this.setTier('binance-ws+hl-rest');
      }
    };

    ws.onmessage = event => {
      if (this.binanceWs !== ws || this.hlConnected) return;
      let wrapper;
      try {
        wrapper = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      const payload = wrapper?.data ?? wrapper;
      if (Array.isArray(payload)) {
        for (const t of payload) {
          const sym = String(t?.s || '').toUpperCase();
          const coin = BINANCE_SYMBOL_TO_COIN[sym];
          if (!coin) continue;
          const close = Number.parseFloat(t.c);
          const open = Number.parseFloat(t.o);
          const high = Number.parseFloat(t.h);
          const low = Number.parseFloat(t.l);
          const quoteVol = Number.parseFloat(t.q);
          if (!(close > 0)) continue;
          const chg = open > 0 ? Number((((close - open) / open) * 100).toFixed(2)) : 0;
          const tick = {
            coin,
            symbol: `${coin}-USD`,
            price: close,
            changePercent: chg,
            high24h: high > 0 ? high : undefined,
            low24h: low > 0 ? low : undefined,
            volume24h: quoteVol > 0 ? Math.round(quoteVol) : undefined
          };
          this.latestCrypto.set(coin, tick);
          this.pendingCrypto.set(coin, tick);
        }
        if (this.activeTier !== 'hyperliquid-ws') {
          this.setTier('binance-ws+hl-rest');
        }
        this.scheduleFlush();
      } else if (payload?.e === 'kline' && payload.k) {
        const sym = String(payload.s || '').toUpperCase();
        const coin = BINANCE_SYMBOL_TO_COIN[sym];
        const k = payload.k;
        if (coin && k) {
          const candleEvt = {
            coin,
            interval: String(k.i || '15m'),
            bar: {
              time: Math.floor(Number(k.t) / 1000),
              open: Number.parseFloat(k.o),
              high: Number.parseFloat(k.h),
              low: Number.parseFloat(k.l),
              close: Number.parseFloat(k.c),
              volume: Number.parseFloat(k.v || 0)
            }
          };
          if (Number.isFinite(candleEvt.bar.time) && candleEvt.bar.close > 0) {
            this.pendingCandles.set(`${coin}|${candleEvt.interval}`, candleEvt);
            this.scheduleFlush();
          }
        }
      }
    };

    ws.onerror = () => {
      if (this.binanceWs !== ws) return;
      this.closeBinanceWs();
    };

    ws.onclose = () => {
      if (this.binanceWs !== ws) return;
      this.closeBinanceWs();
    };
  }

  /**
   * 二级 REST 容灾轮询 -> 失败时自动降级至三级 Yahoo 兜底
   */
  async runFailoverPollCycle() {
    if (!this.sseClients.size || this.hlConnected) return;

    const hlRestOk = await this.pollHyperliquidRestSnapshot();
    if (hlRestOk) {
      if (!this.hlConnected) {
        this.setTier(this.binanceConnected ? 'binance-ws+hl-rest' : 'hl-rest');
      }
      return;
    }

    // Tier 3: Hyperliquid REST 亦不可用时，无缝回退至 OnchainStocksService (Yahoo Finance 正股/公开行情)
    try {
      if (this.onchainStockService?.getOnchainStocksData) {
        const fallbackData = await this.onchainStockService.getOnchainStocksData({ force: true });
        if (fallbackData && fallbackData.isFallback !== true) {
          const rows = fallbackData.allStocks || fallbackData.top10 || [];
          for (const r of rows) {
            if (!r?.symbol || !(Number(r.price) > 0)) continue;
            const tick = {
              symbol: r.symbol,
              price: Number(r.price),
              tradFiClose: Number(r.tradFiClose || r.price),
              changePercent: Number(r.changePercent || 0),
              premiumPct: Number(r.premiumPct || 0),
              priceDiff: Number(r.priceDiff || 0),
              volume24h: Number(r.volume24h || 0),
              openInterest: Number(r.openInterest || 0),
              buyRatio: Number(r.buyRatio || 50),
              sellRatio: Number(r.sellRatio || 50),
              netFlow: Number(r.netFlow || 0)
            };
            this.latestStocks.set(r.symbol, tick);
            this.pendingStocks.set(r.symbol, tick);
          }
        }
        if (!this.hlConnected) {
          this.setTier(this.binanceConnected ? 'binance-ws+hl-rest' : 'yahoo-fallback');
        }
        this.scheduleFlush();
      }
    } catch { }
  }

  async pollHyperliquidRestSnapshot() {
    if (typeof this.fetch !== 'function') return false;
    try {
      const requests = [
        this.fetch(this.hlRestUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }),
          signal: AbortSignal.timeout(3500)
        })
      ];

      // 若币安 WS 未连接，顺带通过 HL 主网 REST 同步加密货币快照
      const needCryptoRest = !this.binanceConnected;
      if (needCryptoRest) {
        requests.push(
          this.fetch(this.hlRestUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
            signal: AbortSignal.timeout(3500)
          })
        );
      }

      const responses = await Promise.allSettled(requests);
      let anySuccess = false;

      const xyzRes = responses[0];
      if (xyzRes?.status === 'fulfilled' && xyzRes.value?.ok) {
        const xyzJson = await xyzRes.value.json();
        const universe = xyzJson?.[0]?.universe || [];
        const ctxs = xyzJson?.[1] || [];
        universe.forEach((u, idx) => {
          if (u?.name && ctxs[idx]) {
            this.handleHlAssetCtx(u.name, ctxs[idx]);
            anySuccess = true;
          }
        });
      }

      if (needCryptoRest && responses[1]?.status === 'fulfilled' && responses[1].value?.ok) {
        const perpJson = await responses[1].value.json();
        const universe = perpJson?.[0]?.universe || [];
        const ctxs = perpJson?.[1] || [];
        const trackedSet = new Set(CORE_CRYPTO_COINS);
        universe.forEach((u, idx) => {
          if (u?.name && trackedSet.has(String(u.name).toUpperCase()) && ctxs[idx]) {
            this.handleHlAssetCtx(u.name, ctxs[idx]);
            anySuccess = true;
          }
        });
      }

      // 同步拉取当前活跃 K 线的最新一根蜡烛
      const desired = this.getDesiredCandleSpecs();
      for (const spec of desired.values()) {
        if (!spec.coin.includes(':') && this.binanceConnected) continue;
        try {
          const nowMs = Date.now();
          const cRes = await this.fetch(this.hlRestUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'candleSnapshot',
              req: { coin: spec.coin, interval: spec.interval, startTime: nowMs - 2 * 3600 * 1000, endTime: nowMs }
            }),
            signal: AbortSignal.timeout(3000)
          });
          if (cRes?.ok) {
            const cArr = await cRes.json();
            if (Array.isArray(cArr) && cArr.length > 0) {
              const last = cArr[cArr.length - 1];
              this.handleHlCandle({ ...last, s: spec.coin, i: spec.interval });
              anySuccess = true;
            }
          }
        } catch { }
      }

      return anySuccess;
    } catch {
      return false;
    }
  }

  /**
   * 解析 Hyperliquid activeAssetCtx (含 xyz:* 链上美股与主网加密货币)
   */
  handleHlAssetCtx(rawCoin, ctx) {
    const coinStr = String(rawCoin || '').trim();
    if (!coinStr || !ctx) return;

    const markPx = Number.parseFloat(ctx.markPx || 0);
    if (!(markPx > 0)) return;
    const oraclePx = Number.parseFloat(ctx.oraclePx || 0) || markPx;
    const prevDayPx = Number.parseFloat(ctx.prevDayPx || 0) || 0;
    const dayNtlVlm = Number.parseFloat(ctx.dayNtlVlm || 0) || 0;
    const oiCoins = Number.parseFloat(ctx.openInterest || 0) || 0;
    const oiUsd = Math.round(oiCoins * markPx);
    const funding = Number.parseFloat(ctx.funding || 0);
    const fundingAnnualPct = Number.isFinite(funding) ? Number((funding * 24 * 365 * 100).toFixed(1)) : null;

    const isXyz = /^xyz:/i.test(coinStr);
    if (isXyz) {
      const sym = coinStr.replace(/^xyz:/i, '').toUpperCase();
      const decimals = markPx < 100 ? 3 : 2;
      const price = Number(markPx.toFixed(decimals));
      const tradFiClose = Number(oraclePx.toFixed(decimals));
      const changePercent = prevDayPx > 0
        ? Number((((price - prevDayPx) / prevDayPx) * 100).toFixed(2))
        : 0;
      const premiumPct = tradFiClose > 0
        ? Number((((price - tradFiClose) / tradFiClose) * 100).toFixed(2))
        : 0;
      const priceDiff = Number((price - tradFiClose).toFixed(2));
      const volume24h = Math.round(dayNtlVlm);

      const retRatio = changePercent / 100;
      const fundingBias = (Number.isFinite(funding) ? funding : 0) * 1200;
      const symOffset = ((sym.charCodeAt(0) * 7 + (sym.charCodeAt(1) || 0) * 3) % 11 - 5) * 0.004;
      const rawBuy = Math.max(0.18, Math.min(0.82, 0.50 + Math.tanh(retRatio * 7.5 + fundingBias) * 0.24 + symOffset));
      const buyRatio = Number((rawBuy * 100).toFixed(1));
      const sellRatio = Number((100 - buyRatio).toFixed(1));
      const inflow24h = Math.round(volume24h * rawBuy);
      const netFlow = inflow24h - (volume24h - inflow24h);

      const stockTick = {
        symbol: sym,
        perpCoin: `xyz:${sym}`,
        price,
        tradFiClose,
        changePercent,
        premiumPct,
        priceDiff,
        volume24h,
        openInterest: oiUsd,
        fundingAnnualPct,
        buyRatio,
        sellRatio,
        netFlow
      };
      this.latestStocks.set(sym, stockTick);
      this.pendingStocks.set(sym, stockTick);
    } else {
      const coin = coinStr.toUpperCase();
      const decimals = markPx >= 100 ? 2 : (markPx >= 1 ? 3 : 4);
      const price = Number(markPx.toFixed(decimals));
      const changePercent = prevDayPx > 0
        ? Number((((price - prevDayPx) / prevDayPx) * 100).toFixed(2))
        : 0;
      const cryptoTick = {
        coin,
        symbol: `${coin}-USD`,
        price,
        changePercent,
        volume24h: Math.round(dayNtlVlm),
        openInterest: oiUsd,
        fundingAnnualPct
      };
      this.latestCrypto.set(coin, cryptoTick);
      this.pendingCrypto.set(coin, cryptoTick);
    }

    this.scheduleFlush();
  }

  handleHlCandle(c) {
    const coin = normalizePerpCoin(c.s || c.coin || '');
    const interval = String(c.i || c.interval || '');
    const tMs = Number(c.t);
    const open = Number.parseFloat(c.o);
    const high = Number.parseFloat(c.h);
    const low = Number.parseFloat(c.l);
    const close = Number.parseFloat(c.c);
    const volume = Number.parseFloat(c.v || 0);
    if (!coin || !interval || !Number.isFinite(tMs) || !(close > 0)) return;

    const evt = {
      coin,
      interval,
      bar: {
        time: Math.floor(tMs / 1000),
        open,
        high,
        low,
        close,
        volume: Number.isFinite(volume) ? volume : 0
      }
    };
    this.pendingCandles.set(`${coin}|${interval}`, evt);
    this.scheduleFlush();
  }

  scheduleFlush() {
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.flushBatch();
    }, this.batchIntervalMs);
    this.batchTimer.unref?.();
  }

  flushBatch() {
    if (!this.sseClients.size) {
      this.pendingStocks.clear();
      this.pendingCrypto.clear();
      this.pendingCandles.clear();
      return;
    }

    const now = Date.now();
    if (this.pendingStocks.size > 0 || this.pendingCrypto.size > 0) {
      const msg = {
        type: 'ticks',
        tier: this.activeTier,
        stocks: Object.fromEntries(this.pendingStocks),
        crypto: Object.fromEntries(this.pendingCrypto),
        ts: now
      };
      this.pendingStocks.clear();
      this.pendingCrypto.clear();
      this.broadcast(msg);
    }

    if (this.pendingCandles.size > 0) {
      const candles = [...this.pendingCandles.values()];
      this.pendingCandles.clear();
      for (const cEvt of candles) {
        const frame = {
          type: 'candle',
          tier: this.activeTier,
          coin: cEvt.coin,
          interval: cEvt.interval,
          bar: cEvt.bar,
          ts: now
        };
        for (const client of this.sseClients) {
          if (!client.coin || (client.coin === cEvt.coin && (!client.interval || client.interval === cEvt.interval))) {
            this.sendToClient(client, frame);
          }
        }
      }
    }
  }
}

let defaultStreamService = null;
export function getOnchainStreamService(options) {
  if (!defaultStreamService || options) {
    defaultStreamService = new OnchainStreamService(options);
  }
  return defaultStreamService;
}
