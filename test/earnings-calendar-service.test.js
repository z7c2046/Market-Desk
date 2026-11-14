import test from 'node:test';
import assert from 'node:assert/strict';
import { createEarningsCalendarService, normalizeEarningsRows } from '../src/earnings-calendar-service.js';
import { getEarningsCalendarDate, getEarningsWeeks } from '../public/earnings-calendar-model.js';
import { createServer } from '../src/server.js';

const monday = '2026-11-02';
const initialTime = '2026-11-07T16:00:00.000Z';
const row = { symbol: 'PLTR', time: 'time-after-hours', eps: '0.32', epsForecast: '0.30', fiscalQuarterEnding: 'Sep/2026' };
const payload = (rows = [row]) => Response.json({ status: { rCode: 200 }, data: { asOf: 'provider date', rows } });

test('earnings dates use New York midnight and roll across weekends, year boundaries and DST', () => {
  assert.equal(getEarningsCalendarDate(new Date('2026-11-09T04:59:00Z')), '2026-11-08');
  assert.equal(getEarningsCalendarDate(new Date('2026-11-09T05:00:00Z')), '2026-11-09');
  const weekend = getEarningsWeeks('2026-11-08');
  assert.equal(weekend.current.weekStart, monday);
  assert.equal(weekend.next.weekStart, '2026-11-09');
  assert.ok(weekend.current.days.every(day => !day.isToday));
  const weekday = getEarningsWeeks('2026-11-09');
  assert.equal(weekday.current.days.find(day => day.isToday).fullDate, '2026-11-09');
  assert.equal(weekday.prev.days.filter(day => day.isToday).length, 0);
  assert.equal(getEarningsWeeks('2027-01-01').current.weekStart, '2026-12-28');
  assert.equal(getEarningsWeeks('2027-01-01').next.weekStart, '2027-01-04');
  assert.equal(getEarningsWeeks(new Date('2026-03-09T04:00:00Z')).current.weekStart, '2026-03-09');
});

test('Nasdaq rows keep missing metrics missing, normalize negative/zero EPS, and preserve unknown timing', () => {
  const items = normalizeEarningsRows([
    row,
    { symbol: 'AAPL', eps: 'N/A', epsForecast: '$1.20', lastYearEPS: '$1.00', time: 'time-not-supplied' },
    { symbol: 'AMD', eps: '($0.10)', epsForecast: '($0.20)', time: 'time-pre-market' },
    { symbol: 'NVDA', eps: '0', epsForecast: '0' },
    { symbol: 'MSFT', eps: '1.00', epsForecast: '--' },
    { symbol: 'ZZZZ-NOT-IN-CATALOGUE', eps: '3' }
  ], monday, 'provider date', initialTime);
  assert.equal(items.length, 5);
  const [pltr, aapl, amd, nvda, msft] = items;
  assert.equal(pltr.reportStatus, 'beat');
  assert.equal(pltr.timing, 'AMC');
  assert.equal(pltr.epsActual, '$0.32');
  assert.equal(pltr.day, 'mon');
  assert.equal(pltr.fullDate, monday);
  assert.match(pltr.sourceUrl, /nasdaq.com.*2026-11-02/);
  assert.equal(aapl.timing, 'UNKNOWN');
  assert.equal(aapl.reportStatus, 'pending');
  assert.equal(aapl.epsActual, null);
  assert.equal(aapl.epsPrev, '$1.00');
  assert.equal(amd.epsActual, '$-0.10');
  assert.equal(amd.reportStatus, 'beat');
  assert.equal(amd.timing, 'BMO');
  assert.equal(nvda.reportStatus, 'reported');
  assert.equal(nvda.epsActual, '$0.00');
  assert.equal(msft.reportStatus, 'reported');
  assert.equal(msft.epsConsensus, null);
  for (const item of items) {
    assert.equal(item.revActual, null);
    assert.equal(item.revConsensus, null);
    assert.equal(item.aiCatalyst, null);
  }

  const largeCapAndCurated = normalizeEarningsRows([
    { symbol: 'NBIS', name: 'Nebius Group N.V.', marketCap: '$35,000,000,000', eps: '$0.10', epsForecast: '$0.05', time: 'time-not-supplied' },
    { symbol: 'FOO', name: 'Foo Global Corp', marketCap: '$45,000,000,000', eps: '$1.50', epsForecast: '$1.40', time: 'time-not-supplied' },
    { symbol: 'FOO.A', name: 'Foo Global Corp Class A', marketCap: '$45,000,000,000', eps: '$1.50', epsForecast: '$1.40', time: 'time-not-supplied' },
    { symbol: 'TINY', name: 'Tiny Micro Cap', marketCap: '$500,000,000', eps: '$0.01', time: 'time-pre-market' }
  ], monday, 'provider date', initialTime);
  assert.deepEqual(largeCapAndCurated.map(item => item.symbol), ['NBIS', 'FOO']);
  assert.equal(largeCapAndCurated[0].sectorId, 'cloud');
  assert.equal(largeCapAndCurated[0].isAiSupplyChain, true);
  assert.equal(largeCapAndCurated[1].sectorId, 'broad');
  assert.equal(largeCapAndCurated[1].isAiSupplyChain, false);
  assert.equal(largeCapAndCurated[1].reportStatus, 'beat');
  assert.equal(largeCapAndCurated[1].timing, 'UNKNOWN');
});

test('week loading shares concurrent requests, caches for ten minutes, and supports explicit refresh', async () => {
  let time = new Date(initialTime), requests = 0, active = 0, peak = 0;
  const service = createEarningsCalendarService({ now: () => time, fetchImpl: async () => {
    requests++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return payload();
  } });
  const [first, second] = await Promise.all([service.getWeek(), service.getWeek()]);
  assert.equal(first.weekStart, monday);
  assert.equal(first.status, 'ready');
  assert.equal(first.items.length, 5);
  assert.deepEqual(first, second);
  assert.equal(requests, 5);
  assert.equal(peak, 2);
  await service.getWeek();
  assert.equal(requests, 5);
  await service.getWeek({ force: true });
  assert.equal(requests, 10);
  time = new Date(time.getTime() + 10 * 60_000);
  const refreshed = await service.getWeek();
  assert.equal(requests, 15);
  assert.equal(refreshed.fetchedAt, time.toISOString());
});

test('partial failures preserve recent snapshots with stale flags but drop snapshots after 24 hours', async () => {
  let time = new Date(initialTime), fail = false;
  const service = createEarningsCalendarService({ now: () => time, fetchImpl: async url => {
    if (fail && new URL(url).searchParams.get('date') === monday) throw new Error('upstream offline');
    return payload();
  } });
  await service.getWeek();
  fail = true; time = new Date(time.getTime() + 11 * 60_000);
  const stale = await service.getWeek();
  assert.equal(stale.status, 'partial');
  assert.equal(stale.days[0].status, 'stale');
  assert.equal(stale.fetchedAt, initialTime);
  assert.equal(stale.items.find(item => item.fullDate === monday).stale, true);
  assert.equal(stale.items.find(item => item.fullDate === '2026-11-03').stale, false);
  time = new Date(Date.parse(initialTime) + 24 * 60 * 60_000);
  const expired = await service.getWeek();
  assert.equal(expired.days[0].status, 'unavailable');
  assert.ok(expired.items.every(item => item.fullDate !== monday));
});

test('empty results are distinct from unavailable or malformed provider responses', async () => {
  const empty = await createEarningsCalendarService({ fetchImpl: async () => payload([]) }).getWeek({ weekStart: monday });
  assert.equal(empty.status, 'ready');
  assert.equal(empty.items.length, 0);
  for (const response of [() => new Response('', { status: 503 }), () => payload(null), () => Response.json({})]) {
    const unavailable = await createEarningsCalendarService({ fetchImpl: async () => response() }).getWeek({ weekStart: monday });
    assert.equal(unavailable.status, 'unavailable');
    assert.equal(unavailable.items.length, 0);
    assert.equal(unavailable.fetchedAt, null);
  }
});

test('earnings HTTP endpoint forwards week/refresh and rejects invalid dates without provider calls', async t => {
  const dates = [];
  const earningsService = createEarningsCalendarService({ fetchImpl: async url => {
    dates.push(new URL(url).searchParams.get('date'));
    return payload();
  } });
  const server = createServer({ earningsService, workspace: {}, quoteService: {}, aiSearchService: {}, whaleService: {}, onchainStockService: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api/earnings/calendar`;
  for (const weekStart of ['2026-11-03', '2026-02-30', 'not-a-date']) {
    assert.equal((await fetch(`${base}?weekStart=${weekStart}`)).status, 400);
  }
  assert.equal(dates.length, 0);
  const response = await fetch(`${base}?weekStart=${monday}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).items[0].symbol, 'PLTR');
  assert.deepEqual(dates, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  await fetch(`${base}?weekStart=${monday}`);
  assert.equal(dates.length, 5);
  await fetch(`${base}?weekStart=${monday}&force=1`);
  assert.equal(dates.length, 10);
});
