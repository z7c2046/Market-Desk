import test from 'node:test';
import assert from 'node:assert/strict';
import { AiSearchService, detectSourceMeta, cleanUrl, publicationInfo } from '../src/ai-search-service.js';
import { normalizeSearchParams, relevanceFor } from '../src/news-search-policy.js';
import { DataCache } from '../src/workspace-data.js';
import { createServer } from '../src/server.js';
const NOW = Date.parse('2026-11-01T16:00:00Z');
const KEYS = { tavily: 'test-tavily', exa: 'test-exa', firecrawl: 'test-firecrawl' };
const article = (title = 'Nvidia earnings guidance', suffix = '1', age = 60000) => ({ title, url: `https://www.reuters.com/markets/story-${suffix}`, content: title, published_date: new Date(NOW - age).toISOString() });
const response = value => new Response(JSON.stringify(value), { status: 200 });
const svc = (fetchImpl, extra = {}) => new AiSearchService({ keys: KEYS, fetchImpl, now: () => NOW, enableLiveFeeds: false, ...extra });

test('source classification uses hostname boundaries; official and social evidence stay distinct', () => {
  assert.equal(detectSourceMeta('https://reuters.com/markets/story').type, 'authority');
  assert.equal(detectSourceMeta('https://reuters.com.evil.test/story').type, 'web');
  assert.equal(detectSourceMeta('https://notx.com/story').type, 'web');
  assert.equal(detectSourceMeta('https://www.federalreserve.gov/newsevents/story').type, 'official');
  assert.equal(detectSourceMeta('https://www.reddit.com/r/wallstreetbets/comments/123').name, 'Reddit · r/wallstreetbets');
  assert.equal(detectSourceMeta('https://twitter.com/user/status/123').type, 'x');
  assert.equal(cleanUrl('https://example.com/Story?utm_source=x&keep=yes#top'), 'https://example.com/Story?keep=yes');
});

test('HTTP q and query reach real service and provider; different topics do not share default cache', async t => {
  const calls = [];
  const service = svc(async (_, options) => { calls.push(JSON.parse(options.body).query); return response({ results: [] }); });
  const server = createServer({ aiSearchService: service, workspace: {}, quoteService: {}, watchlist: async () => [] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  for (const [key, query] of [['q', 'NVDA earnings'], ['query', '美国通胀'], ['q', 'NVDA earnings']]) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/news/ai-search?${new URLSearchParams({ [key]: query, engine: 'tavily' })}`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).query, query);
  }
  assert.equal(calls.length, 2);
  assert.match(calls[0], /NVDA earnings/);
  assert.match(calls[1], /inflation/);
});

test('normalized input has bounded limits and explicit query precedence', () => {
  assert.equal(normalizeSearchParams({ q: 'A', query: 'B', limit: 'Infinity' }).query, 'B');
  assert.equal(normalizeSearchParams({ limit: '9999' }).limit, 20);
  assert.equal(normalizeSearchParams({ limit: '-5' }).limit, 1);
  assert.equal(normalizeSearchParams({ limit: 'bad' }).limit, 16);
  assert.throws(() => normalizeSearchParams({ query: 'a'.repeat(401) }), { status: 400 });
});

for (const timeRange of ['hour', 'day', 'week']) test(`all providers receive consistent ${timeRange} windows and current API schemas`, async () => {
  const payloads = {};
  const service = svc(async (url, options) => {
    const engine = url.includes('tavily') ? 'tavily' : url.includes('exa') ? 'exa' : 'firecrawl';
    payloads[engine] = JSON.parse(options.body);
    if (engine === 'tavily') assert.equal(options.headers.Authorization, 'Bearer test-tavily');
    if (engine === 'exa') assert.equal(options.headers['x-api-key'], 'test-exa');
    if (engine === 'firecrawl') {
      assert.match(url, /\/v2\/search$/);
      return response({ success: true, data: { news: [{ ...article(), link: article().url, date: '5 minutes ago' }] } });
    }
    return response({ results: [article()] });
  });
  const result = await service.search({ query: 'NVDA', engine: 'all', timeRange });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].engines.length, 3);
  assert.equal(payloads.tavily.time_range, timeRange === 'week' ? 'week' : 'day');
  assert.equal('days' in payloads.tavily, false);
  assert.equal('useAutoprompt' in payloads.exa, false);
  assert.equal(Date.parse(payloads.exa.endPublishedDate), NOW);
  assert.equal(NOW - Date.parse(payloads.exa.startPublishedDate), { hour: 3600000, day: 86400000, week: 604800000 }[timeRange]);
  assert.deepEqual(payloads.firecrawl.sources, ['news']);
  assert.equal(payloads.firecrawl.tbs, { hour: 'qdr:h', day: 'qdr:d', week: 'qdr:w' }[timeRange]);
});

test('strict windows exclude old, future and undated articles; unknown dates are opt-in and last', async () => {
  const service = svc(async () => response({ results: [article('Nvidia old earnings', 'old', 2 * 86400000), article('Nvidia new earnings', 'new'), article('Nvidia future earnings', 'future', -1000), { ...article('Nvidia undated earnings', 'unknown'), published_date: null }] }));
  const strict = await service.search({ query: 'NVDA', engine: 'tavily' });
  assert.equal(strict.items.length, 1);
  assert.match(strict.items[0].title, /new/);
  const broad = await service.search({ query: 'NVDA', engine: 'tavily', timeRange: 'week', includeUndated: true });
  assert.equal(broad.items.length, 3);
  assert.equal(broad.items.at(-1).publishedAt, null);
});

test('date precision is preserved; body references cannot date a story; old URL cannot masquerade as new', () => {
  assert.equal(publicationInfo({ rawDate: '2026-11-01', nowMs: NOW }).timePrecision, 'day');
  assert.equal(publicationInfo({ rawDate: '2026-11-01T00:00:00Z', nowMs: NOW }).timePrecision, 'exact');
  assert.equal(publicationInfo({ snippet: 'In August 24, 2022 things changed.', nowMs: NOW }).publishedAt, null);
  assert.equal(publicationInfo({ rawDate: '3 hours ago', nowMs: NOW }).publishedAt, '2026-11-01T13:00:00.000Z');
  assert.equal(publicationInfo({ rawDate: '2026-11-01T14:00:00Z', url: 'https://reuters.com/markets/2022-08-24/story', nowMs: NOW }).publishedAt, '2022-08-24T00:00:00.000Z');
});

test('entity and event relevance filters exclude unrelated companies and unrelated earnings', () => {
  assert.ok(relevanceFor({ title: 'US stocks rise on earnings' }, '美股新闻') > 0);
  assert.equal(relevanceFor({ title: 'Best recipes for dinner' }, '美股新闻'), 0);
  assert.equal(relevanceFor({ title: 'Apple launches new iPhone' }, '通胀'), 0);
  assert.equal(relevanceFor({ title: 'Tesla earnings guidance' }, 'NVDA earnings'), 0);
  assert.equal(relevanceFor({ title: 'Nvidia launches a product' }, 'NVDA earnings'), 0);
  assert.ok(relevanceFor({ title: 'Nvidia quarterly results and guidance' }, 'NVDA earnings') > 0);
  assert.equal(relevanceFor({ title: 'PCE price index report' }, 'CPI'), 0);
  assert.ok(relevanceFor({ title: 'Iran ceasefire agreement' }, '伊朗停火') > 0);
  assert.equal(relevanceFor({ title: 'Ukraine ceasefire agreement' }, '伊朗停火'), 0);
});

test('daily recurring headlines and distinct case-sensitive URL paths remain separate', async () => {
  const service = svc(async () => response({ results: [
    article('Nvidia earnings daily update', 'today'),
    article('Nvidia earnings daily update', 'yesterday', 86400000 + 60000),
    { ...article('Nvidia earnings first case'), url: 'https://example.com/Case' },
    { ...article('Nvidia earnings second case'), url: 'https://example.com/case' },
  ] }));
  const result = await service.search({ query: 'NVDA', engine: 'tavily', timeRange: 'week' });
  assert.equal(result.items.length, 4);
  assert.equal(new Set(result.items.map(i => i.id)).size, 4);
});

test('local domain filtering rejects upstream scope violations and unsafe URLs', async () => {
  const service = svc(async () => response({ results: [article(), { ...article('Nvidia earnings spoof', 'spoof'), url: 'https://reuters.com.evil.test/story' }, { ...article(), url: 'javascript:alert(1)' }, { ...article(), url: 'https://user:password@reuters.com/story' }] }));
  assert.equal((await service.search({ query: 'NVDA', engine: 'tavily', source: 'authority' })).items.length, 1);
});

test('dedup uses full URL identity, preserves case-sensitive paths and records channels without claiming corroboration', async () => {
  const service = svc(async url => response({ results: url.includes('tavily') ? [article(), article('Nvidia second earnings story', '2')] : [{ ...article(), url: article().url + '/?utm_source=exa', publishedDate: '2026-11-01T15:59:30Z' }] }));
  const result = await service.search({ query: 'NVDA', engine: 'all' });
  assert.equal(result.items.length, 2);
  assert.notEqual(result.items[0].id, result.items[1].id);
  assert.equal(result.items.find(i => i.title === article().title).engines.length, 2);
  assert.equal(result.engineErrors.length, 1);
});

test('auto stops after adequate filtered coverage; all explicitly uses every configured engine', async () => {
  const calls = [];
  const service = svc(async url => { calls.push(url); return response({ results: Array.from({ length: 8 }, (_, i) => article(`Nvidia earnings event ${i}`, String(i))) }); });
  const result = await service.search({ query: 'NVDA', engine: 'auto' });
  assert.equal(calls.length, 1);
  assert.equal(result.engineStatus.find(s => s.engine === 'exa').status, 'not_requested');
  assert.equal(result.items.length, 8);
});

test('auto falls back when results are irrelevant; partial failure is visible and secrets are not echoed', async () => {
  const service = svc(async url => {
    if (url.includes('tavily')) return response({ results: [article('Apple launches a phone')] });
    if (url.includes('exa')) return response({ results: [article()] });
    return new Response('secret-key upstream error', { status: 429 });
  });
  const result = await service.search({ query: 'NVDA', engine: 'auto' });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].engine, 'exa');
  assert.match(result.engineErrors[0].error, /429/);
  assert.doesNotMatch(JSON.stringify(result), /secret-key/);
});

test('official RSS follows the same topic filter and failure reporting as search', async () => {
  const service = svc(async url => {
    if (url.includes('api.tavily')) return response({ results: [] });
    if (url.includes('speeches_and_testimony')) return new Response('', { status: 503 });
    return new Response(`<rss><channel><item><title>Inflation and monetary policy</title><link>https://www.federalreserve.gov/newsevents/inflation.htm</link><pubDate>${new Date(NOW - 60000).toUTCString()}</pubDate></item><item><title>Bank merger announcement</title><link>https://www.federalreserve.gov/newsevents/merger.htm</link><pubDate>${new Date(NOW - 30000).toUTCString()}</pubDate></item></channel></rss>`);
  }, { enableLiveFeeds: true });
  const result = await service.search({ query: '通胀', engine: 'tavily', source: 'official' });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].evidenceType, 'primary_source');
  assert.equal(result.engineErrors.length, 1);
});

test('cache shares concurrent identical work, expires rolling results and refuses stale success on failure', async () => {
  let now = NOW, calls = 0, fail = false;
  const service = svc(async () => { calls++; if (fail) throw new Error('network unavailable'); return response({ results: [article('Nvidia earnings', '1', 3590000)] }); }, { now: () => now, cache: new DataCache({ now: () => now }) });
  const params = { query: 'NVDA', engine: 'tavily', timeRange: 'hour' };
  const [a, b] = await Promise.all([service.search(params), service.search(params)]);
  assert.equal(calls, 1); assert.equal(a.items.length, 1); assert.deepEqual(a.items, b.items);
  now += 20000;
  const cached = await service.search(params);
  assert.equal(cached.cached, true); assert.equal(cached.items.length, 0);
  now += 100000; fail = true;
  await assert.rejects(service.search(params), /network unavailable/);
});

test('latest and relevant sorting differ without comparing incompatible provider scores', async () => {
  const service = svc(async () => response({ results: [article('Nvidia earnings', 'new', 1000), article('Nvidia earnings demand', 'relevant', 2000)] }));
  const params = { query: 'NVDA earnings demand', engine: 'tavily' };
  assert.match((await service.search(params)).items[0].url, /new/);
  assert.match((await service.search({ ...params, sort: 'relevance' })).items[0].url, /relevant/);
});
