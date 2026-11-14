import test from 'node:test';
import assert from 'node:assert/strict';
import { number, parseYahoo, parseNews, ticker, DataCache } from '../src/workspace-data.js';
import { buildOptionsWall, parseContract } from '../src/options-wall.js';
import { parseFlows } from '../public/flows.js';

const contract = (type, strike, oi, gamma = .02, expiry = '261023') => ({ option: `SPY${expiry}${type}${String(Math.round(strike * 1000)).padStart(8, '0')}`, open_interest: oi, gamma, volume: 90000 });
const payload = rows => ({ timestamp: '2026-10-22 10:00:00', data: { current_price: 100, options: rows } });
const config = { symbol: 'SPY', now: new Date('2026-10-22T14:00:00Z') };

test('missing values and zero are distinct', () => { assert.equal(number(null), null); assert.equal(number(''), null); assert.equal(number(false), null); assert.equal(number(0), 0); });
test('reject invalid symbols before provider calls', () => { assert.equal(ticker('brk-b'), 'BRK-B'); assert.throws(() => ticker('../secret')); assert.throws(() => ticker('AAPL?x')); });
test('daily change uses previous trading day, not range starting close', () => {
  const d = parseYahoo({ chart: { result: [{ meta: { regularMarketPrice: 110, chartPreviousClose: 50, regularMarketDayHigh: 112, regularMarketDayLow: 97, regularMarketTime: Date.parse('2026-10-22T19:00Z') / 1000 }, timestamp: [Date.parse('2026-10-21T13:30Z') / 1000, Date.parse('2026-10-22T13:30Z') / 1000], indicators: { quote: [{ open: [99, 101], high: [102, 111], low: [98, 100], close: [100, 110], volume: [10, null] }] } }] } }, 'SPY');
  assert.equal(d.previousClose, 100); assert.ok(Math.abs(d.changePercent - 10) < 1e-8); assert.equal(d.volume, null); assert.equal(d.turnover, null); assert.equal(d.bars[1].volume, null);
  assert.equal(d.dayHigh, 112); assert.equal(d.dayLow, 97);
});
test('OI wall sums contracts across expiries without substituting volume; gamma scaling', () => {
  const d = buildOptionsWall(payload([contract('P', 95, 60), contract('C', 105, 40), contract('C', 105, 60, .02, '261030'), contract('C', 100, 70)]), { ...config, expiration: 'all' });
  assert.deepEqual(d.callWall, [105]); assert.deepEqual(d.putWall, [95]); assert.equal(d.callOi, 170); assert.equal(d.putOi, 60); assert.equal(d.netGex, 22000); assert.equal(d.putCallRatio, 60 / 170);
});
test('fractional strikes and shuffled contracts survive parsing', () => { const d = parseContract(contract('P', 100.5, 8), 'SPY'); assert.equal(d.strike, 100.5); assert.equal(d.type, 'P'); assert.equal(parseContract({ ...contract('C', 100, 2), option: 'SPY1261023C00100000' }, 'SPY'), null); });
test('expired dates excluded; valid zero does not create fake wall; ties retained', () => {
  const d = buildOptionsWall(payload([contract('C', 90, 999, .1, '261021'), contract('C', 100, 10), contract('C', 105, 10), contract('P', 95, 0)]), config);
  assert.deepEqual(d.callWall, [100, 105]); assert.deepEqual(d.putWall, []); assert.equal(d.expiration, '2026-10-23'); assert.equal(d.contracts, 3);
  assert.throws(() => buildOptionsWall(payload([contract('C', 100, 1)]), { ...config, expiration: '2026-01-01' }), /有效期权链/);
});
test('missing gamma suppresses total GEX, missing OI suppresses walls', () => {
  const a = buildOptionsWall(payload([contract('C', 100, 2, null)]), config); assert.equal(a.netGex, null); assert.equal(a.missingGamma, 1); assert.deepEqual(a.callWall, [100]);
  const b = buildOptionsWall(payload([contract('C', 100, null)]), config); assert.equal(b.callOi, null); assert.equal(b.netGex, null); assert.deepEqual(b.callWall, []);
});
test('same-day contracts leave the available expiry list after 16:15 New York', () => {
  const d = buildOptionsWall(payload([contract('C', 100, 999, .02, '261022'), contract('C', 105, 2)]), { ...config, now: new Date('2026-10-22T20:16:00Z') });
  assert.deepEqual(d.expirations, ['2026-10-23']); assert.deepEqual(d.callWall, [105]);
});
test('RSS accepts safe links, strips markup, rejects entity declarations', () => {
  const xml = '<rss><channel><item><title><![CDATA[<b>Hello</b> &amp; world]]></title><link>https://example.com/story</link><pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>';
  const d = parseNews(xml, 'test'); assert.equal(d.length, 1); assert.equal(d[0].title, 'Hello & world'); assert.equal(d[0].publishedAt, '2026-10-22T10:00:00.000Z'); assert.throws(() => parseNews('<!DOCTYPE rss><rss/>', 'test'));
});
test('cache deduplicates parallel fetches, preserves fetchedAt on stale fallback and expires it', async () => {
  let now = 0, calls = 0; const cache = new DataCache({ now: () => now });
  const loader = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return { fetchedAt: 'original' }; };
  await Promise.all([cache.get('x', 10, loader, 100), cache.get('x', 10, loader, 100)]); assert.equal(calls, 1);
  now = 20; const stale = await cache.get('x', 10, async () => { throw Error('offline'); }, 100); assert.equal(stale.stale, true); assert.equal(stale.fetchedAt, 'original');
  now = 101; await assert.rejects(cache.get('x', 10, async () => { throw Error('offline'); }, 100));
});
test('flow imports preserve negative/zero and reject missing, duplicate or impossible dates', () => {
  const head = 'date,symbol,netFlowUsd,source\n';
  const data = parseFlows(head + '2026-10-21,SPY,-120000,Issuer\n2026-10-21,QQQ,0,Issuer'); assert.equal(data.find(x => x.symbol === 'SPY').netFlowUsd, -120000);
  for (const rows of ['2026-02-30,SPY,2,Issuer', '2026-10-21,SPY,,Issuer', '2026-10-21,SPY,2,Issuer\n2026-10-21,SPY,3,Issuer']) assert.throws(() => parseFlows(head + rows));
});

test('crypto workspace fetches multi-bar history and maps 24h ranges', async () => {
  const mockFetch = async () => new Response(JSON.stringify({
    chart: {
      result: [{
        meta: { regularMarketPrice: 80000, regularMarketDayHigh: 82000, regularMarketDayLow: 78000, regularMarketTime: 1729800000 },
        timestamp: [1729600000, 1729700000, 1729800000],
        indicators: { quote: [{ open: [77000, 78000, 79000], high: [78500, 79500, 82000], low: [76000, 77500, 78000], close: [78000, 79000, 80000], volume: [100, 200, 300] }] }
      }]
    }
  }));
  const { createMarketWorkspace } = await import('../src/market-workspace.js');
  const ws = createMarketWorkspace({ fetchImpl: mockFetch });
  const res = await ws.crypto();
  assert.ok(res.items.length >= 6);
  const btc = res.items.find(i => i.code === 'BTC');
  assert.ok(btc);
  assert.equal(btc.price, 80000);
  assert.equal(btc.high24h, 82000);
  assert.equal(btc.low24h, 78000);
  assert.equal(btc.bars.length, 3);
});

test('crypto -USD 4h chart falls back to Hyperliquid candleSnapshot when Yahoo has no data', async () => {
  const requests = [];
  const mockFetch = async (url, init = {}) => {
    const u = String(url);
    requests.push({ url: u, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (u.includes('hyperliquid.xyz/info') && requests.at(-1).body?.type === 'candleSnapshot') {
      return new Response(JSON.stringify([
        { t: 1730001600000, o: '230.5', h: '245.0', l: '228.0', c: '240.2', v: '15000.5' },
        { t: 1730016000000, o: '240.2', h: '252.4', l: '238.1', c: '249.8', v: '21400.25' }
      ]), { status: 200 });
    }
    return new Response(JSON.stringify({ chart: { result: [] } }), { status: 404 });
  };
  const { createMarketWorkspace } = await import('../src/market-workspace.js');
  const ws = createMarketWorkspace({ fetchImpl: mockFetch });
  const chartData = await ws.chart({ symbol: 'ZEC-USD', range: '1mo', interval: '4h' });
  assert.equal(chartData.symbol, 'ZEC-USD');
  assert.equal(chartData.interval, '4h');
  assert.equal(chartData.bars.length, 2);
  assert.equal(chartData.bars[0].time, 1730001600);
  assert.equal(chartData.bars[1].close, 249.8);
  assert.match(chartData.source, /Hyperliquid/);

  const hlCall = requests.find(r => r.url.includes('hyperliquid.xyz/info'));
  assert.ok(hlCall, 'Called Hyperliquid info API fallback');
  assert.equal(hlCall.body.req.coin, 'ZEC');
  assert.equal(hlCall.body.req.interval, '4h');

  // Non-crypto equity ticker should NOT fall back to Hyperliquid when Yahoo fails in default venue
  await assert.rejects(() => ws.chart({ symbol: 'AAPL', range: '1mo', interval: '4h' }));
});

test('TradFi venue=hyperliquid routes directly to HIP-3 xyz:* 24/7 perpetual candles with lowercase prefix and Yahoo fallback', async () => {
  const requests = [];
  const mockFetch = async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url: u, body });
    if (u.includes('hyperliquid.xyz/info') && body?.type === 'candleSnapshot') {
      const coin = body.req?.coin;
      if (coin === 'xyz:NVDA' || coin === 'xyz:SP500' || coin === 'xyz:XYZ100' || coin === 'xyz:MU') {
        const px = coin === 'xyz:SP500' ? '7530.5' : coin === 'xyz:XYZ100' ? '27720.0' : '162.4';
        return new Response(JSON.stringify([
          { t: 1794369600000, o: px, h: String(Number(px) + 2), l: String(Number(px) - 2), c: px, v: '42000' },
          { t: 1794384000000, o: px, h: String(Number(px) + 3), l: String(Number(px) - 1), c: String(Number(px) + 1.5), v: '51000' }
        ]), { status: 200 });
      }
      return new Response('null', { status: 500 });
    }
    if (u.includes('query1.finance.yahoo.com')) {
      return Response.json({
        chart: {
          result: [{
            meta: { regularMarketPrice: 99.5, previousClose: 98.0, regularMarketTime: 1794384000 },
            timestamp: [1794369600, 1794384000],
            indicators: { quote: [{ open: [98, 99], high: [100, 101], low: [97, 98.5], close: [99, 99.5], volume: [1000, 1200] }] }
          }]
        }
      });
    }
    return new Response('{}', { status: 404 });
  };

  const { createMarketWorkspace } = await import('../src/market-workspace.js');
  const ws = createMarketWorkspace({ fetchImpl: mockFetch });

  // 1. NVDA with venue=hyperliquid -> queries Hyperliquid directly for xyz:NVDA (native 4h), skipping Yahoo
  const nvdaHl = await ws.chart({ symbol: 'NVDA', range: '1mo', interval: '4h', venue: 'hyperliquid' });
  assert.equal(nvdaHl.symbol, 'NVDA');
  assert.equal(nvdaHl.perpCoin, 'xyz:NVDA');
  assert.equal(nvdaHl.venue, 'hyperliquid');
  assert.equal(nvdaHl.source, 'Hyperliquid HIP-3');
  assert.equal(nvdaHl.bars.length, 2);
  assert.equal(requests.filter(r => r.url.includes('yahoo.com')).length, 0);

  // 2. Index & mixed-case deployer coin mapping: SPY -> xyz:SP500, QQQ -> xyz:XYZ100, XYZ:MU -> xyz:MU
  const spyHl = await ws.chart({ symbol: 'SPY', range: '1mo', interval: '4h', venue: 'hyperliquid' });
  assert.equal(spyHl.perpCoin, 'xyz:SP500');
  assert.equal(spyHl.price, 7532);
  const qqqHl = await ws.chart({ symbol: 'QQQ', range: '1mo', interval: '15m', venue: 'hyperliquid' });
  assert.equal(qqqHl.perpCoin, 'xyz:XYZ100');
  const muHl = await ws.chart({ symbol: 'MU', range: '1mo', interval: '4h', venue: 'hyperliquid', coin: 'XYZ:MU' });
  assert.equal(muHl.perpCoin, 'xyz:MU');

  // 3. Unsupported HIP-3 ticker falls back cleanly to Yahoo equity bars instead of breaking UI
  const noHip3 = await ws.chart({ symbol: 'TESTNOHIP3', range: '1mo', interval: '1d', venue: 'hyperliquid' });
  assert.equal(noHip3.venue, 'yahoo');
  assert.equal(noHip3.venueFallback, true);
  assert.equal(noHip3.bars.length, 2);

  // 4. Rejects invalid venue or coin injection
  await assert.rejects(() => ws.chart({ symbol: 'NVDA', venue: 'bad_venue' }), { status: 400 });
  await assert.rejects(() => ws.chart({ symbol: 'NVDA', venue: 'hyperliquid', coin: '../bad' }), { status: 400 });
});

