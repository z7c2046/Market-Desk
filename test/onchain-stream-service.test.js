import test from 'node:test';
import assert from 'node:assert/strict';
import { OnchainStreamService } from '../src/onchain-stream-service.js';
import { createServer } from '../src/server.js';

function createMockSseClient() {
  const frames = [];
  let closeHandler = null;
  const req = {
    on(evt, fn) {
      if (evt === 'close') closeHandler = fn;
    },
    triggerClose() {
      closeHandler?.();
    }
  };
  const res = {
    statusCode: 0,
    headers: {},
    writeHead(code, hdrs) {
      this.statusCode = code;
      this.headers = hdrs;
    },
    flushHeaders() {},
    write(chunk) {
      const text = String(chunk);
      for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) {
          frames.push(JSON.parse(line.slice(6)));
        }
      }
    }
  };
  return { req, res, frames };
}

test('OnchainStreamService: Tier 1 (hyperliquid-ws) streams activeAssetCtx and live candle updates with 0-latency', async () => {
  const sockets = [];
  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.sent = [];
      sockets.push(this);
    }
    send(payload) {
      this.sent.push(JSON.parse(payload));
    }
    close() {
      this.closed = true;
    }
  }

  const service = new OnchainStreamService({
    WebSocketImpl: MockWebSocket,
    fetchImpl: async () => ({ ok: false }),
    batchIntervalMs: 10,
    hlConnectTimeoutMs: 500
  });

  const client = createMockSseClient();
  service.addClient(client.req, client.res, { coin: 'xyz:NVDA', interval: '15m' });

  assert.equal(sockets.length, 1);
  assert.match(sockets[0].url, /wss:\/\/api\.hyperliquid\.xyz\/ws/);

  // Open Hyperliquid WS -> verifies subscriptions to xyz:NVDA activeAssetCtx, BTC activeAssetCtx, and xyz:NVDA 15m candle
  sockets[0].onopen();
  assert.ok(sockets[0].sent.some(m => m.method === 'subscribe' && m.subscription?.type === 'activeAssetCtx' && m.subscription?.coin === 'xyz:NVDA'));
  assert.ok(sockets[0].sent.some(m => m.method === 'subscribe' && m.subscription?.type === 'activeAssetCtx' && m.subscription?.coin === 'BTC'));
  assert.ok(sockets[0].sent.some(m => m.method === 'subscribe' && m.subscription?.type === 'candle' && m.subscription?.coin === 'xyz:NVDA' && m.subscription?.interval === '15m'));

  // Push live activeAssetCtx for xyz:NVDA & BTC + live 15m candle
  sockets[0].onmessage({
    data: JSON.stringify({
      channel: 'activeAssetCtx',
      data: {
        coin: 'xyz:NVDA',
        ctx: {
          markPx: '146.85',
          oraclePx: '146.50',
          prevDayPx: '150.00',
          dayNtlVlm: '490000000',
          openInterest: '2800000',
          funding: '0.0000125'
        }
      }
    })
  });
  sockets[0].onmessage({
    data: JSON.stringify({
      channel: 'activeAssetCtx',
      data: {
        coin: 'BTC',
        ctx: {
          markPx: '88500.5',
          oraclePx: '88490.0',
          prevDayPx: '86000.0',
          dayNtlVlm: '3200000000',
          openInterest: '45000',
          funding: '0.00001'
        }
      }
    })
  });
  sockets[0].onmessage({
    data: JSON.stringify({
      channel: 'candle',
      data: {
        t: 1795599000000,
        s: 'xyz:NVDA',
        i: '15m',
        o: '146.20',
        h: '147.10',
        l: '146.00',
        c: '146.85',
        v: '25400.5'
      }
    })
  });

  await new Promise(r => setTimeout(r, 35));

  assert.equal(service.getStatus().tier, 'hyperliquid-ws');
  const tickFrame = client.frames.find(f => f.type === 'ticks');
  assert.ok(tickFrame, 'Broadcasted real-time ticks frame');
  assert.equal(tickFrame.stocks.NVDA.price, 146.85);
  assert.equal(tickFrame.stocks.NVDA.tradFiClose, 146.50);
  assert.equal(tickFrame.stocks.NVDA.volume24h, 490000000);
  assert.equal(tickFrame.crypto.BTC.price, 88500.5);

  const candleFrame = client.frames.find(f => f.type === 'candle');
  assert.ok(candleFrame, 'Broadcasted real-time candle frame');
  assert.equal(candleFrame.coin, 'xyz:NVDA');
  assert.equal(candleFrame.interval, '15m');
  assert.equal(candleFrame.bar.close, 146.85);

  // Closing last client cleanly shuts down stream service
  client.req.triggerClose();
  assert.equal(service.getStatus().tier, 'idle');
});

test('OnchainStreamService: 3-Tier Failover Chain (HL WS -> Binance WS + HL REST -> Yahoo Fallback -> Auto-Recovery to HL WS)', async () => {
  const wsInstances = [];
  let allowHlWsOpen = false;
  let allowBinanceWsOpen = true;
  let allowHlRest = true;

  class FailoverMockWebSocket {
    constructor(url) {
      this.url = url;
      this.sent = [];
      wsInstances.push(this);
      setImmediate(() => {
        if (url.includes('hyperliquid')) {
          if (allowHlWsOpen) {
            this.onopen?.();
          } else {
            this.onerror?.(new Error('HL WS blocked'));
          }
        } else if (url.includes('binance')) {
          if (allowBinanceWsOpen) {
            this.onopen?.();
          } else {
            this.onerror?.(new Error('Binance WS blocked'));
          }
        }
      });
    }
    send(payload) {
      this.sent.push(JSON.parse(payload));
    }
    close() {
      this.closed = true;
    }
  }

  const mockFetch = async (_url, opts) => {
    if (!allowHlRest) throw new Error('HL REST offline');
    const body = JSON.parse(opts.body);
    if (body.type === 'metaAndAssetCtxs' && body.dex === 'xyz') {
      return {
        ok: true,
        json: async () => [
          { universe: [{ name: 'xyz:NVDA' }] },
          [{ markPx: '142.30', oraclePx: '142.10', prevDayPx: '145.00', dayNtlVlm: '410000000', openInterest: '2100000', funding: '0.00001' }]
        ]
      };
    }
    return { ok: true, json: async () => [{ universe: [] }, []] };
  };

  const mockOnchainStockService = {
    getOnchainStocksData: async () => ({
      ok: true,
      allStocks: [
        {
          symbol: 'NVDA',
          price: 141.88,
          tradFiClose: 141.80,
          changePercent: -2.15,
          premiumPct: 0.06,
          priceDiff: 0.08,
          volume24h: 350000000,
          openInterest: 200000000,
          buyRatio: 44,
          sellRatio: 56,
          netFlow: -42000000
        }
      ]
    })
  };

  const service = new OnchainStreamService({
    WebSocketImpl: FailoverMockWebSocket,
    fetchImpl: mockFetch,
    onchainStockService: mockOnchainStockService,
    batchIntervalMs: 10,
    restPollIntervalMs: 80,
    reconnectBaseMs: 60,
    reconnectMaxMs: 120
  });

  const client = createMockSseClient();
  service.addClient(client.req, client.res, { coin: 'BTC', interval: '15m' });

  // Wait for HL WS to fail -> Tier 2 (Binance WS + HL REST) activates automatically
  await new Promise(r => setTimeout(r, 45));
  assert.equal(service.getStatus().tier, 'binance-ws+hl-rest');

  const binanceSocket = wsInstances.find(w => w.url.includes('binance'));
  assert.ok(binanceSocket, 'Opened Binance Futures failover WebSocket');
  assert.match(binanceSocket.url, /btcusdt@kline_15m/);

  // Emit Binance miniTicker update -> streams BTC price seamlessly during HL WS outage
  binanceSocket.onmessage({
    data: JSON.stringify({
      stream: '!miniTicker@arr',
      data: [{ s: 'BTCUSDT', c: '89120.5', o: '87000.0', h: '89500.0', l: '86800.0', q: '4100000000' }]
    })
  });
  await new Promise(r => setTimeout(r, 25));

  const tier2Ticks = client.frames.filter(f => f.type === 'ticks');
  assert.ok(tier2Ticks.some(f => f.stocks?.NVDA?.price === 142.30), 'Tier 2 HL REST delivers TradFi xyz:NVDA price');
  assert.ok(tier2Ticks.some(f => f.crypto?.BTC?.price === 89120.5), 'Tier 2 Binance WS delivers Crypto BTC price');

  // Now simulate HL REST & Binance WS BOTH failing -> degrades to Tier 3 (Yahoo Fallback)
  allowHlRest = false;
  allowBinanceWsOpen = false;
  binanceSocket.onerror?.(new Error('Binance WS dropped'));
  await new Promise(r => setTimeout(r, 120));

  assert.equal(service.getStatus().tier, 'yahoo-fallback');
  assert.ok(client.frames.some(f => f.type === 'ticks' && f.stocks?.NVDA?.price === 141.88), 'Tier 3 Yahoo fallback delivers NVDA price without interruption');

  // Now recover Hyperliquid WS -> automatically promotes back to Tier 1 (hyperliquid-ws)
  allowHlWsOpen = true;
  await new Promise(r => setTimeout(r, 140));
  const latestHlSocket = [...wsInstances].reverse().find(w => w.url.includes('hyperliquid') && !w.closed);
  assert.ok(latestHlSocket, 'Reconnected to primary Hyperliquid WS');
  latestHlSocket.onmessage({
    data: JSON.stringify({
      channel: 'activeAssetCtx',
      data: {
        coin: 'xyz:NVDA',
        ctx: { markPx: '147.50', oraclePx: '147.40', prevDayPx: '145.00', dayNtlVlm: '500000000', openInterest: '2500000', funding: '0.00001' }
      }
    })
  });
  await new Promise(r => setTimeout(r, 25));

  assert.equal(service.getStatus().tier, 'hyperliquid-ws');
  assert.ok(client.frames.some(f => f.type === 'ticks' && f.tier === 'hyperliquid-ws' && f.stocks?.NVDA?.price === 147.50));

  service.stop();
});

test('HTTP SSE endpoint /api/crypto/stream connects and streams JSON frames cleanly', async () => {
  const mockStream = {
    receivedOpts: null,
    addClient(_req, res, opts) {
      this.receivedOpts = opts;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(`data: ${JSON.stringify({ type: 'status', tier: 'hyperliquid-ws' })}\n\n`);
    },
    stop() {}
  };

  const server = createServer({ onchainStreamService: mockStream });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/crypto/stream?coin=xyz:NVDA&interval=15m`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /"tier":"hyperliquid-ws"/);
    assert.deepEqual(mockStream.receivedOpts, { coin: 'xyz:NVDA', interval: '15m' });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Tier 3 failover does not broadcast or overwrite latestStocks when fallbackData.isFallback is true', async () => {
  const realTick = { symbol: 'SOXL', price: 25.78, tradFiClose: 25.70, volume24h: 341000000 };
  const service = new OnchainStreamService({
    fetchImpl: async () => { throw new Error('HL REST down'); },
    onchainStockService: {
      getOnchainStocksData: async () => ({
        ok: true,
        isLive: false,
        isFallback: true,
        allStocks: [{ symbol: 'SOXL', price: 56.40, volume24h: 68900000 }]
      })
    },
    batchIntervalMs: 10,
    restPollIntervalMs: 1000
  });

  service.latestStocks.set('SOXL', realTick);
  service.sseClients.add({ res: { writableEnded: false, write: () => {} }, coin: '', interval: '15m' });
  await service.runFailoverPollCycle();

  assert.equal(service.latestStocks.get('SOXL')?.price, 25.78, 'Must preserve real $25.78 price instead of overwriting with static fallback $56.40');
  assert.equal(service.pendingStocks.size, 0, 'Must not queue static fallback mock prices for SSE broadcast');
  assert.equal(service.getStatus().tier, 'yahoo-fallback');
  service.stop();
});
