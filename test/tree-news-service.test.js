import test from 'node:test';
import assert from 'node:assert/strict';
import { TreeNewsService, normalizeTreeItem } from '../src/tree-news-service.js';
import { createServer } from '../src/server.js';

test('normalizeTreeItem classifies Bloomberg, Reuters, SEC, and Twitter accurately with symbol extraction', () => {
  // Bloomberg news
  const bb = normalizeTreeItem({
    _id: 'bb1',
    title: 'BLOOMBERG: Fed Powell hints at cautious policy stance amid resilient growth',
    source: 'Blogs',
    sourceName: 'BLOOMBERG',
    time: 1793620000000,
    symbols: ['SPY_USDT'],
    url: 'https://bloomberg.com/news/123'
  });
  assert.equal(bb.source, 'Bloomberg (彭博终端)');
  assert.equal(bb.sourceType, 'bloomberg');
  assert.equal(bb.badge, '彭博专线 · 突发');
  assert.deepEqual(bb.symbols, ['SPY']);
  assert.equal(bb.isBreaking, true);

  // Reuters news
  const rtr = normalizeTreeItem({
    _id: 'rtr1',
    title: 'REUTERS: Nvidia launches next-gen Blackwell Ultra GPU chips',
    source: 'News',
    sourceName: 'REUTERS',
    time: 1793620005000,
    url: 'https://reuters.com/tech/123'
  });
  assert.equal(rtr.source, 'Reuters (路透社)');
  assert.equal(rtr.sourceType, 'reuters');
  assert.equal(rtr.badge, '路透快讯 · 突发');

  // SEC EDGAR Form 8-K
  const sec = normalizeTreeItem({
    _id: 'sec1',
    title: 'SEC EDGAR: Apple Inc. files Form 8-K regarding executive transition',
    source: 'SEC',
    time: 1793620010000,
    url: 'https://sec.gov/edgar/123'
  });
  assert.equal(sec.source, 'SEC EDGAR 官方');
  assert.equal(sec.sourceType, 'sec');
  assert.equal(sec.badge, '官方披露 · 8-K');

  // Twitter
  const tw = normalizeTreeItem({
    _id: 'tw1',
    title: 'WatcherGuru (@WatcherGuru): $NVDA market cap surges past $4 Trillion in premarket trading',
    source: 'Twitter',
    time: 1793620015000,
    url: 'https://x.com/post'
  });
  assert.equal(tw.source, 'X (Twitter 速递)');
  assert.equal(tw.sourceType, 'twitter');
  assert.ok(tw.symbols.includes('NVDA'));

  // Invalid item returns null
  assert.equal(normalizeTreeItem(null), null);
  assert.equal(normalizeTreeItem({ title: '' }), null);
});

test('TreeNewsService buffer and deduplication respects maximum buffer limit', () => {
  const service = new TreeNewsService({ autoConnect: false, enableWs: false, bufferLimit: 5 });
  
  for (let i = 1; i <= 8; i++) {
    service.addItem({
      _id: `id-${i}`,
      title: `Breaking News Article ${i}`,
      source: 'Bloomberg',
      time: 1000 + i
    }, false);
  }

  // Deduplication: re-adding id-8 should be rejected
  const dup = service.addItem({ _id: 'id-8', title: 'Breaking News Article 8' }, false);
  assert.equal(dup, null);

  // Buffer size capped at 5, newest items retained
  assert.equal(service.buffer.length, 5);
  assert.equal(service.buffer[0].id, 'id-8');
  assert.equal(service.buffer[4].id, 'id-4');

  service.close();
});

test('TreeNewsService fetchInitialHistory populates initial buffer in chronological order', async () => {
  const mockItems = [
    { _id: 'h3', title: 'Newest item', time: 3000 },
    { _id: 'h2', title: 'Middle item', time: 2000 },
    { _id: 'h1', title: 'Oldest item', time: 1000 }
  ];

  const fetchImpl = async () => new Response(JSON.stringify(mockItems), { status: 200 });
  const service = new TreeNewsService({ autoConnect: false, enableWs: false, fetchImpl });
  
  await service.fetchInitialHistory();
  assert.equal(service.buffer.length, 3);
  assert.equal(service.buffer[0].id, 'h3');
  assert.equal(service.buffer[2].id, 'h1');

  service.close();
});

test('TreeNewsService connects to WebSocket, handles login if API key exists, and broadcasts to SSE clients', async () => {
  let sentLogin = null;
  let clientMessage = null;

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      setTimeout(() => {
        this.readyState = 1;
        this.onopen?.();
      }, 10);
    }
    send(data) {
      sentLogin = data;
    }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
  }

  const service = new TreeNewsService({
    autoConnect: false,
    enableWs: false,
    apiKey: 'VIP_TREE_KEY_123',
    WebSocketImpl: MockWebSocket
  });

  service.connectWs();
  await new Promise(r => setTimeout(r, 30));

  assert.equal(service.status, 'connected');
  assert.equal(sentLogin, 'login VIP_TREE_KEY_123');

  // Mock SSE client
  const mockRes = {
    writeHead() {},
    flushHeaders() {},
    write(chunk) { clientMessage = chunk; },
    end() {}
  };
  const mockReq = { on() {} };
  service.addClient(mockReq, mockRes);

  assert.ok(clientMessage.includes('"type":"snapshot"'));

  // Deliver a live WebSocket message
  service.ws.onmessage({
    data: JSON.stringify({
      _id: 'live1',
      title: 'BLOOMBERG: White House announces major clean energy tech initiative',
      source: 'Bloomberg',
      time: Date.now(),
      symbols: ['TSLA']
    })
  });

  assert.ok(clientMessage.includes('"type":"news"'));
  assert.ok(clientMessage.includes('clean energy tech initiative'));
  assert.equal(service.buffer[0].id, 'live1');

  service.close();
  assert.equal(service.status, 'disconnected');
});

test('HTTP Server exposes Tree News routes: /api/news/live/history, /status, and /stream', async t => {
  const mockService = {
    getHistory: params => ({
      ok: true,
      total: 1,
      items: [{ id: 'test1', title: 'Reuters: AI chip market expands', source: 'Reuters', symbols: ['NVDA'] }]
    }),
    getStatus: () => ({
      ok: true,
      status: 'connected',
      wsUrl: 'wss://news.treeofalpha.com/ws',
      totalReceived: 42
    }),
    addClient(req, res) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: {"type":"connected"}\n\n');
    }
  };

  const server = createServer({
    treeNewsService: mockService,
    workspace: {},
    quoteService: {},
    watchlist: async () => []
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));

  const port = server.address().port;

  // 1. History
  const histRes = await fetch(`http://127.0.0.1:${port}/api/news/live/history?symbol=NVDA`);
  const histData = await histRes.json();
  assert.equal(histRes.status, 200);
  assert.equal(histData.ok, true);
  assert.equal(histData.items[0].id, 'test1');

  // 2. Status
  const statusRes = await fetch(`http://127.0.0.1:${port}/api/news/live/status`);
  const statusData = await statusRes.json();
  assert.equal(statusRes.status, 200);
  assert.equal(statusData.status, 'connected');
  assert.equal(statusData.totalReceived, 42);

  // 3. Stream
  const streamRes = await fetch(`http://127.0.0.1:${port}/api/news/live/stream`);
  assert.equal(streamRes.status, 200);
  assert.equal(streamRes.headers.get('content-type'), 'text/event-stream');
});
