import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { createMarketWorkspace } from '../src/market-workspace.js';

test('API routing, disabled strategies, method guard, static boundaries, local vendor assets', async t => {
  const server = createServer({ workspace: { overview: async () => ({ stocks: [{ symbol: 'TEST' }] }), chart: async () => { throw Object.assign(Error('bad range'), { status: 400 }); } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const overview = await fetch(base + '/api/market/overview'); assert.deepEqual((await overview.json()).stocks, [{ symbol: 'TEST' }]);
  for (const route of ['/api/radar', '/api/backtest', '/api/market/snapshot']) assert.equal((await fetch(base + route)).status, 410);
  assert.equal((await fetch(base + '/api/market/chart?range=bad')).status, 400);
  assert.equal((await fetch(base + '/api/health', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/unknown')).status, 404);
  assert.equal((await fetch(base + '/..%2f.env')).status, 403);
  assert.equal((await fetch(base + '/%zz')).status, 400);
  assert.equal((await fetch(base + '/vendor/vue.js')).status, 200);
  assert.equal((await fetch(base + '/vendor/echarts.js')).status, 200);
  assert.equal((await fetch(base + '/vendor/lightweight-charts.standalone.js')).status, 200);
  const html = await (await fetch(base)).text(); assert.match(html, /Market Desk/); assert.doesNotMatch(html, /Inflection Hunter|Strategy Algorithm/);
});
test('partial provider failures are listed and chart preserves requested ticker', async () => {
  const fetchImpl = async url => {
    const s = new URL(url).pathname.split('/').at(-1);
    if (s === 'NVDA') return new Response('', { status: 503 });
    return Response.json({ chart: { result: [{ meta: { regularMarketPrice: 10, previousClose: 8, regularMarketTime: 1792612800 }, timestamp: [], indicators: { quote: [{}] } }] } });
  };
  const api = createMarketWorkspace({ fetchImpl }); const d = await api.overview();
  assert.deepEqual(d.unavailable, ['NVDA']); assert.equal(d.stocks.length, 17); assert.equal(d.benchmarks.length, 4);
  assert.equal((await api.chart({ symbol: 'AAPL' })).symbol, 'AAPL');
  await assert.rejects(api.chart({ symbol: 'AAPL', range: 'bad' }), /不支持/);
});
test('all provider failures produce an error instead of made-up data', async () => {
  const api = createMarketWorkspace({ fetchImpl: async () => new Response('', { status: 503 }) });
  await assert.rejects(api.overview(), /暂不可用/); await assert.rejects(api.news({}), /暂未取得/); await assert.rejects(api.options({ symbol: 'SPY' }));
});

test('chart endpoint supports intervals (15m, 1h, 4h, 1d) with default 1d and rejects invalid interval', async () => {
  const fetchImpl = async url => {
    const u = new URL(url);
    const timestamps = [1793975400, 1793979000, 1793982600, 1793986200, 1793989800, 1793993400, 1793997000, 1793998800];
    const quoteData = {
      open: [100, 102, 101, 103, 104, 103, 102, 101],
      high: [103, 105, 104, 106, 107, 105, 104, 102],
      low: [99, 101, 100, 102, 103, 101, 100, 100],
      close: [102, 101, 103, 104, 103, 102, 101, 101],
      volume: [1000, 1200, 800, 1500, 2000, 1100, 900, 500]
    };
    return Response.json({
      chart: {
        result: [{
          meta: { regularMarketPrice: 101, previousClose: 100, regularMarketTime: 1793998800 },
          timestamp: timestamps,
          indicators: { quote: [quoteData] }
        }]
      }
    });
  };
  const api = createMarketWorkspace({ fetchImpl });

  const defChart = await api.chart({ symbol: 'AAPL' });
  assert.equal(defChart.interval, '1d');
  assert.equal(defChart.range, '3mo');

  const c15m = await api.chart({ symbol: 'AAPL', range: '1mo', interval: '15m' });
  assert.equal(c15m.interval, '15m');

  const c1h = await api.chart({ symbol: 'AAPL', range: '1mo', interval: '1h' });
  assert.equal(c1h.interval, '1h');

  const c4h = await api.chart({ symbol: 'AAPL', range: '1mo', interval: '4h' });
  assert.equal(c4h.interval, '4h');
  assert.equal(c4h.bars.length, 2);
  assert.equal(c4h.bars[0].open, 100);
  assert.equal(c4h.bars[0].high, 106);
  assert.equal(c4h.bars[0].low, 99);
  assert.equal(c4h.bars[0].close, 104);
  assert.equal(c4h.bars[0].volume, 4500);

  await assert.rejects(api.chart({ symbol: 'AAPL', interval: '5m' }), /不支持/);
});
