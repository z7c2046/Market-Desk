import test from 'node:test';
import assert from 'node:assert/strict';
import { AiSearchService, detectSourceMeta, cleanUrl } from '../src/ai-search-service.js';
import { createServer } from '../src/server.js';

test('detectSourceMeta correctly identifies Reddit, X, Reuters, WSJ, Bloomberg, and generic domains', () => {
  const reddit = detectSourceMeta('https://www.reddit.com/r/wallstreetbets/comments/123/nvda');
  assert.equal(reddit.type, 'reddit');
  assert.equal(reddit.name, 'Reddit · r/wallstreetbets');
  assert.equal(reddit.tagClass, 'source-pill-reddit');

  const x = detectSourceMeta('https://x.com/marketsday/status/123456');
  assert.equal(x.type, 'x');
  assert.equal(x.name, 'X (Twitter)');
  assert.equal(x.tagClass, 'source-pill-x');

  const twitter = detectSourceMeta('https://twitter.com/wsj/status/98765');
  assert.equal(twitter.type, 'x');

  const wsj = detectSourceMeta('https://www.wsj.com/economy/central-banking/fed-rate');
  assert.equal(wsj.type, 'authority');
  assert.equal(wsj.name, 'Wall Street Journal (华尔街日报)');
  assert.equal(wsj.tagClass, 'source-pill-wsj');

  const reuters = detectSourceMeta('https://www.reuters.com/markets/us/stocks-higher-2026');
  assert.equal(reuters.type, 'authority');
  assert.equal(reuters.name, 'Reuters (路透社)');

  const bloomberg = detectSourceMeta('https://www.bloomberg.com/news/articles/2026-10-25/oil');
  assert.equal(bloomberg.type, 'authority');
  assert.equal(bloomberg.name, 'Bloomberg (彭博终端)');

  const other = detectSourceMeta('https://finance.example.com/story');
  assert.equal(other.type, 'web');
  assert.equal(other.domain, 'finance.example.com');
});

test('cleanUrl strips marketing tracking parameters (utm, ref, source)', () => {
  const dirty = 'https://www.reuters.com/markets/us/stocks?utm_source=twitter&utm_medium=social&ref=123&keep=real';
  const cleaned = cleanUrl(dirty);
  assert.equal(cleaned, 'https://www.reuters.com/markets/us/stocks?keep=real');
});

test('AiSearchService executes Tavily search with domain restrictions', async () => {
  const mockFetch = async (url, options) => {
    assert.equal(url, 'https://api.tavily.com/search');
    const body = JSON.parse(options.body);
    assert.equal(body.api_key, 'tvly-test');
    assert.deepEqual(body.include_domains, ['reddit.com']);
    return new Response(JSON.stringify({
      results: [
        {
          title: 'Reddit WSB NVDA Yolo',
          url: 'https://www.reddit.com/r/wallstreetbets/comments/nvda?utm_source=share',
          content: 'Nvidia options discussion on WSB',
          score: 0.98,
          published_date: '2026-10-25T01:00:00Z'
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const svc = new AiSearchService({
    keys: { tavily: 'tvly-test', firecrawl: 'fc-test', exa: 'exa-test' },
    fetchImpl: mockFetch
  });

  const res = await svc.search({ query: 'NVDA', engine: 'tavily', source: 'reddit', limit: 5 });
  assert.equal(res.ok, true);
  assert.equal(res.total, 1);
  assert.equal(res.items[0].source, 'Reddit · r/wallstreetbets');
  assert.equal(res.items[0].engine, 'tavily');
  assert.equal(res.items[0].url, 'https://www.reddit.com/r/wallstreetbets/comments/nvda');
});

test('AiSearchService executes Exa neural search with highlights extraction', async () => {
  const mockFetch = async (url, options) => {
    assert.equal(url, 'https://api.exa.ai/search');
    assert.equal(options.headers['x-api-key'], 'exa-test');
    return new Response(JSON.stringify({
      results: [
        {
          title: 'Fed signals rate trajectory: WSJ Report',
          url: 'https://www.wsj.com/livecoverage/stock-market-cpi',
          highlights: ['Inflation report alters the interest rate curve.', 'Traders expect calm open.'],
          publishedDate: '2026-10-24T18:00:00Z'
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const svc = new AiSearchService({
    keys: { tavily: 'tvly-test', firecrawl: 'fc-test', exa: 'exa-test' },
    fetchImpl: mockFetch
  });

  const res = await svc.search({ query: 'Fed rate', engine: 'exa', source: 'authority', limit: 5 });
  assert.equal(res.ok, true);
  assert.equal(res.total, 1);
  assert.equal(res.items[0].source, 'Wall Street Journal (华尔街日报)');
  assert.equal(res.items[0].engine, 'exa');
  assert.match(res.items[0].snippet, /Inflation report/);
});

test('AiSearchService ensemble merges, deduplicates and gracefully tolerates single engine failure', async () => {
  const mockFetch = async (url) => {
    if (url.includes('tavily')) {
      return new Response(JSON.stringify({
        results: [
          { title: 'Duplicate Item', url: 'https://www.reuters.com/news/1', content: 'Reuters 1' },
          { title: 'Tavily Unique Item', url: 'https://www.wsj.com/news/2', content: 'WSJ 2' }
        ]
      }), { status: 200 });
    }
    if (url.includes('exa')) {
      return new Response(JSON.stringify({
        results: [
          { title: 'Duplicate Item from Exa', url: 'https://www.reuters.com/news/1/', highlights: ['Reuters 1 alt'] },
          { title: 'Exa Unique Item', url: 'https://x.com/trader/status/1', highlights: ['X Tweet'] }
        ]
      }), { status: 200 });
    }
    if (url.includes('firecrawl')) {
      // Simulate Firecrawl 500 error, ensemble should still succeed!
      return new Response('Firecrawl internal error', { status: 500 });
    }
    throw new Error('Unknown url');
  };

  const svc = new AiSearchService({
    keys: { tavily: 'tvly-test', firecrawl: 'fc-test', exa: 'exa-test' },
    fetchImpl: mockFetch
  });

  const res = await svc.search({ query: 'market', engine: 'all', limit: 10 });
  assert.equal(res.ok, true);
  // Total unique: reuters.com/news/1, wsj.com/news/2, x.com/trader/status/1 = 3 items (deduplicated!)
  assert.equal(res.total, 3);
  assert.equal(res.items.some(i => i.engine === 'tavily'), true);
  assert.equal(res.items.some(i => i.engine === 'exa'), true);
  assert.equal(Array.isArray(res.engineErrors), true);
  assert.equal(res.engineErrors[0].engine, 'Firecrawl');
});

test('Server API route /api/news/ai-search responds with standardized schema', async t => {
  const mockAiService = {
    search: async (params) => ({
      ok: true,
      query: params.q || 'default',
      engine: params.engine || 'all',
      source: params.source || 'all',
      total: 2,
      items: [
        {
          id: 'test_1',
          title: 'Reddit WSB Trending',
          url: 'https://www.reddit.com/r/wallstreetbets/test',
          snippet: 'Trending stocks on reddit',
          source: 'Reddit · r/wallstreetbets',
          sourceType: 'reddit',
          engine: 'tavily'
        },
        {
          id: 'test_2',
          title: 'Reuters Markets Overview',
          url: 'https://www.reuters.com/markets',
          snippet: 'Wall street stocks wrap up',
          source: 'Reuters (路透社)',
          sourceType: 'authority',
          engine: 'exa'
        }
      ],
      latencyMs: 120
    })
  };

  const server = createServer({ aiSearchService: mockAiService });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));

  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/news/ai-search?q=Nvidia&engine=all&source=all`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.query, 'Nvidia');
  assert.equal(data.items.length, 2);
  assert.equal(data.items[0].sourceType, 'reddit');
  assert.equal(data.items[1].sourceType, 'authority');
});
