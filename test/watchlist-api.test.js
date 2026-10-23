import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { WatchlistQuoteService, normalizeYahooSymbol } from '../src/watchlist-quotes.js';
import { buildMultiSessionQuote } from '../src/market-sessions.js';

test('normalizeYahooSymbol correctly pads HK stock tickers to 4 digits and normalizes US dash', () => {
  assert.equal(normalizeYahooSymbol('00700.HK'), '0700.HK');
  assert.equal(normalizeYahooSymbol('00005.HK'), '0005.HK');
  assert.equal(normalizeYahooSymbol('09988.HK'), '9988.HK');
  assert.equal(normalizeYahooSymbol('07709.HK'), '7709.HK');
  assert.equal(normalizeYahooSymbol('BRK-B'), 'BRK.B');
  assert.equal(normalizeYahooSymbol('AAPL'), 'AAPL');
});

class MockQuoteProvider {
  constructor() {
    this.status = 'connected';
    this.statusReason = 'Mock provider';
    this.listener = null;
    this.subscribed = [];
  }
  isConfigured() { return true; }
  onQuoteUpdate(fn) { this.listener = fn; }
  subscribe(syms) { this.subscribed.push(...syms); }
  unsubscribe() {}
  async quote(symbols) {
    const res = {};
    for (const s of symbols) {
      res[s] = buildMultiSessionQuote({
        symbol: s,
        regularPrice: 100,
        regularPrevClose: 98,
        todayRthClose: 100,
        postPrice: 101,
        overnightPrice: 102,
        provider: 'Mock'
      });
    }
    return res;
  }
  emitPush(event) {
    if (this.listener) this.listener(event);
  }
}

test('Watchlist API: /api/watchlist/quotes returns multi-session structure', async t => {
  const provider = new MockQuoteProvider();
  const quoteService = new WatchlistQuoteService({ provider, batchIntervalMs: 50 });
  const server = createServer({ quoteService });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    quoteService.destroy();
    return new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/watchlist/quotes?symbols=AAPL,NVDA`);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.ok(data.quotes.AAPL);
  assert.ok(data.quotes.NVDA);
  assert.equal(data.quotes.AAPL.regular.price, 100);
  assert.equal(data.quotes.AAPL.post.price, 101);
  assert.equal(data.quotes.AAPL.overnight.price, 102);
  assert.ok(data.session);
  assert.equal(data.provider.name, 'Longbridge');
});

test('Watchlist API: /api/watchlist/stream provides SSE stream with batching', async t => {
  const provider = new MockQuoteProvider();
  const quoteService = new WatchlistQuoteService({ provider, batchIntervalMs: 20 });
  const server = createServer({ quoteService });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    quoteService.destroy();
    return new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  });

  const base = `http://127.0.0.1:${server.address().port}`;

  // Prime the quotes
  await quoteService.getQuotes(['AAPL']);

  const controller = new AbortController();
  const response = await fetch(`${base}/api/watchlist/stream?symbols=AAPL`, { signal: controller.signal });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  // First chunk has 'connected' event
  const chunk1 = await reader.read();
  const text1 = decoder.decode(chunk1.value);
  assert.match(text1, /connected/);

  // Emit an update from provider
  provider.emitPush({
    symbol: 'AAPL',
    session: 'post',
    price: 104.5,
    volume: 5000,
    time: new Date().toISOString()
  });

  // Wait for batch flush
  await new Promise(resolve => setTimeout(resolve, 60));

  const chunk2 = await reader.read();
  const text2 = decoder.decode(chunk2.value);
  assert.match(text2, /quotes/);
  assert.match(text2, /104.5/);

  controller.abort();
});
