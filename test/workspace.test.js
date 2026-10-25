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

