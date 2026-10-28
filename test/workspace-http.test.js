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
