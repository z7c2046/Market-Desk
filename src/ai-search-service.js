import { DataCache } from './workspace-data.js';

export const DEFAULT_AI_SEARCH_KEYS = {
  tavily: process.env.TAVILY_API_KEY || '',
  firecrawl: process.env.FIRECRAWL_API_KEY || '',
  exa: process.env.EXA_API_KEY || ''
};

const AUTHORITY_DOMAINS = [
  'reuters.com',
  'wsj.com',
  'bloomberg.com',
  'ft.com',
  'cnbc.com',
  'marketwatch.com',
  'barrons.com'
];

export function detectSourceMeta(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.toLowerCase();

    if (host.includes('reddit.com')) {
      let sub = 'Reddit';
      if (path.includes('/r/wallstreetbets')) sub = 'Reddit · r/wallstreetbets';
      else if (path.includes('/r/stocks')) sub = 'Reddit · r/stocks';
      else if (path.includes('/r/investing')) sub = 'Reddit · r/investing';
      else if (path.includes('/r/options')) sub = 'Reddit · r/options';
      else if (path.includes('/r/economics')) sub = 'Reddit · r/economics';
      return {
        name: sub,
        type: 'reddit',
        badge: 'Reddit 散户社区',
        icon: '💬',
        tagClass: 'source-pill-reddit',
        domain: host
      };
    }

    if (host.includes('twitter.com') || host.includes('x.com')) {
      return {
        name: 'X (Twitter)',
        type: 'x',
        badge: 'X 交易员速递',
        icon: '🐦',
        tagClass: 'source-pill-x',
        domain: host
      };
    }

    if (host.includes('reuters.com')) {
      return {
        name: 'Reuters (路透社)',
        type: 'authority',
        badge: '权威通讯社',
        icon: '⚡',
        tagClass: 'source-pill-reuters',
        domain: host
      };
    }

    if (host.includes('wsj.com')) {
      return {
        name: 'Wall Street Journal (华尔街日报)',
        type: 'authority',
        badge: '华尔街核心大报',
        icon: '📰',
        tagClass: 'source-pill-wsj',
        domain: host
      };
    }

    if (host.includes('bloomberg.com')) {
      return {
        name: 'Bloomberg (彭博终端)',
        type: 'authority',
        badge: '专业金融资讯',
        icon: '📊',
        tagClass: 'source-pill-bloomberg',
        domain: host
      };
    }

    if (host.includes('cnbc.com')) {
      return {
        name: 'CNBC',
        type: 'authority',
        badge: '美股财经直播',
        icon: '📺',
        tagClass: 'source-pill-cnbc',
        domain: host
      };
    }

    if (host.includes('ft.com')) {
      return {
        name: 'Financial Times (金融时报)',
        type: 'authority',
        badge: '国际宏观财经',
        icon: '🏛️',
        tagClass: 'source-pill-ft',
        domain: host
      };
    }

    if (host.includes('marketwatch.com')) {
      return {
        name: 'MarketWatch',
        type: 'authority',
        badge: '实时美股动向',
        icon: '📈',
        tagClass: 'source-pill-mw',
        domain: host
      };
    }

    return {
      name: host,
      type: 'web',
      badge: '财经网络源',
      icon: '🌐',
      tagClass: 'source-pill-web',
      domain: host
    };
  } catch {
    return {
      name: '财经网络源',
      type: 'web',
      badge: '财经快讯',
      icon: '🌐',
      tagClass: 'source-pill-web',
      domain: 'web'
    };
  }
}

export function cleanUrl(url) {
  try {
    const u = new URL(url);
    // Strip common marketing / tracking query parameters
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source'].forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return url;
  }
}

export class AiSearchService {
  constructor({
    keys = DEFAULT_AI_SEARCH_KEYS,
    fetchImpl = globalThis.fetch,
    cache = new DataCache(),
    timeoutMs = 12000
  } = {}) {
    this.keys = { ...DEFAULT_AI_SEARCH_KEYS, ...keys };
    this.fetch = fetchImpl;
    this.cache = cache;
    this.timeoutMs = timeoutMs;
  }

  async searchWithTavily(query, { source = 'all', limit = 10 } = {}) {
    const key = this.keys.tavily;
    if (!key) throw new Error('Tavily API Key 未配置');

    let include_domains = [];
    let effectiveQuery = query;

    if (source === 'reddit') {
      include_domains = ['reddit.com'];
      if (!effectiveQuery.toLowerCase().includes('reddit')) effectiveQuery = `reddit ${effectiveQuery}`;
    } else if (source === 'x') {
      effectiveQuery = `site:x.com OR site:twitter.com ${effectiveQuery}`;
    } else if (source === 'wsj_reuters') {
      include_domains = ['reuters.com', 'wsj.com'];
    } else if (source === 'authority') {
      include_domains = AUTHORITY_DOMAINS;
    } else if (source === 'social') {
      include_domains = ['reddit.com', 'x.com', 'twitter.com'];
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const payload = {
        api_key: key,
        query: effectiveQuery,
        search_depth: 'advanced',
        max_results: limit
      };
      if (include_domains.length > 0) {
        payload.include_domains = include_domains;
      }

      const res = await this.fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Tavily API 响应异常 (${res.status}): ${errText.slice(0, 100)}`);
      }

      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      return results.map(item => {
        const cleaned = cleanUrl(item.url || '');
        const meta = detectSourceMeta(cleaned);
        return {
          id: `tavily_${Buffer.from(cleaned).toString('base64').slice(0, 16)}`,
          title: item.title || '无标题财经资讯',
          url: cleaned,
          snippet: item.content || item.raw_content || '',
          source: meta.name,
          sourceBadge: meta.badge,
          sourceType: meta.type,
          sourceIcon: meta.icon,
          sourceClass: meta.tagClass,
          domain: meta.domain,
          engine: 'tavily',
          engineName: 'Tavily AI',
          score: item.score || 0,
          publishedAt: item.published_date || new Date().toISOString()
        };
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async searchWithExa(query, { source = 'all', limit = 10 } = {}) {
    const key = this.keys.exa;
    if (!key) throw new Error('Exa API Key 未配置');

    let includeDomains = [];
    let effectiveQuery = query;

    if (source === 'reddit') {
      includeDomains = ['reddit.com'];
      if (!effectiveQuery.toLowerCase().includes('reddit')) effectiveQuery = `reddit ${effectiveQuery}`;
    } else if (source === 'x') {
      includeDomains = ['twitter.com', 'x.com'];
    } else if (source === 'wsj_reuters') {
      includeDomains = ['reuters.com', 'wsj.com'];
    } else if (source === 'authority') {
      includeDomains = AUTHORITY_DOMAINS;
    } else if (source === 'social') {
      includeDomains = ['reddit.com', 'twitter.com', 'x.com'];
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const payload = {
        query: effectiveQuery,
        numResults: limit,
        useAutoprompt: true,
        contents: {
          highlights: { numSentences: 3 }
        }
      };
      if (includeDomains.length > 0) {
        payload.includeDomains = includeDomains;
      }

      const res = await this.fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Exa API 响应异常 (${res.status}): ${errText.slice(0, 100)}`);
      }

      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      return results.map(item => {
        const cleaned = cleanUrl(item.url || '');
        const meta = detectSourceMeta(cleaned);
        const snippet = Array.isArray(item.highlights) && item.highlights.length > 0
          ? item.highlights.join(' ')
          : (item.text || item.summary || '');
        return {
          id: `exa_${Buffer.from(cleaned).toString('base64').slice(0, 16)}`,
          title: item.title || '无标题财经资讯',
          url: cleaned,
          snippet: snippet.replace(/\n+/g, ' ').slice(0, 300),
          source: meta.name,
          sourceBadge: meta.badge,
          sourceType: meta.type,
          sourceIcon: meta.icon,
          sourceClass: meta.tagClass,
          domain: meta.domain,
          engine: 'exa',
          engineName: 'Exa Neural',
          score: item.score || 0,
          author: item.author || '',
          publishedAt: item.publishedDate || new Date().toISOString()
        };
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async searchWithFirecrawl(query, { source = 'all', limit = 10 } = {}) {
    const key = this.keys.firecrawl;
    if (!key) throw new Error('Firecrawl API Key 未配置');

    let effectiveQuery = query;
    if (source === 'reddit') {
      effectiveQuery = `site:reddit.com ${effectiveQuery}`;
    } else if (source === 'x') {
      effectiveQuery = `site:x.com OR site:twitter.com ${effectiveQuery}`;
    } else if (source === 'wsj_reuters') {
      effectiveQuery = `site:reuters.com OR site:wsj.com ${effectiveQuery}`;
    } else if (source === 'authority') {
      effectiveQuery = `site:reuters.com OR site:wsj.com OR site:bloomberg.com ${effectiveQuery}`;
    } else if (source === 'social') {
      effectiveQuery = `site:reddit.com OR site:x.com ${effectiveQuery}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: effectiveQuery,
          limit
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Firecrawl API 响应异常 (${res.status}): ${errText.slice(0, 100)}`);
      }

      const data = await res.json();
      const results = Array.isArray(data.data) ? data.data : [];
      return results.map(item => {
        const cleaned = cleanUrl(item.url || '');
        const meta = detectSourceMeta(cleaned);
        return {
          id: `firecrawl_${Buffer.from(cleaned).toString('base64').slice(0, 16)}`,
          title: item.title || '无标题财经资讯',
          url: cleaned,
          snippet: item.description || item.markdown?.slice(0, 260) || '',
          source: meta.name,
          sourceBadge: meta.badge,
          sourceType: meta.type,
          sourceIcon: meta.icon,
          sourceClass: meta.tagClass,
          domain: meta.domain,
          engine: 'firecrawl',
          engineName: 'Firecrawl',
          score: 0,
          publishedAt: new Date().toISOString()
        };
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async search({ query = '', engine = 'all', source = 'all', limit = 12 } = {}) {
    const q = String(query || '').trim() || 'US stock market Wall Street economy';
    const targetEngine = ['all', 'tavily', 'exa', 'firecrawl'].includes(engine) ? engine : 'all';
    const targetSource = ['all', 'social', 'reddit', 'x', 'authority', 'wsj_reuters'].includes(source) ? source : 'all';

    const cacheKey = `ai_search:${targetEngine}:${targetSource}:${q}:${limit}`;
    return this.cache.get(cacheKey, 180000, async () => {
      const startTime = Date.now();
      let rawItems = [];
      const engineErrors = [];

      if (targetEngine === 'tavily') {
        rawItems = await this.searchWithTavily(q, { source: targetSource, limit });
      } else if (targetEngine === 'exa') {
        rawItems = await this.searchWithExa(q, { source: targetSource, limit });
      } else if (targetEngine === 'firecrawl') {
        rawItems = await this.searchWithFirecrawl(q, { source: targetSource, limit });
      } else {
        // Ensemble / All: Parallel dispatch with graceful degradation
        const [tavilyRes, exaRes, firecrawlRes] = await Promise.allSettled([
          this.searchWithTavily(q, { source: targetSource, limit: Math.ceil(limit * 0.7) }),
          this.searchWithExa(q, { source: targetSource, limit: Math.ceil(limit * 0.7) }),
          this.searchWithFirecrawl(q, { source: targetSource, limit: 5 })
        ]);

        if (tavilyRes.status === 'fulfilled') rawItems.push(...tavilyRes.value);
        else engineErrors.push({ engine: 'Tavily', error: tavilyRes.reason?.message });

        if (exaRes.status === 'fulfilled') rawItems.push(...exaRes.value);
        else engineErrors.push({ engine: 'Exa', error: exaRes.reason?.message });

        if (firecrawlRes.status === 'fulfilled') rawItems.push(...firecrawlRes.value);
        else engineErrors.push({ engine: 'Firecrawl', error: firecrawlRes.reason?.message });

        if (!rawItems.length && engineErrors.length > 0) {
          throw new Error(`AI 引擎检索失败: ${engineErrors.map(e => `${e.engine}: ${e.error}`).join('; ')}`);
        }
      }

      // Deduplicate by URL
      const seen = new Set();
      const uniqueItems = [];
      for (const item of rawItems) {
        if (!item.url) continue;
        const normalized = item.url.toLowerCase().replace(/\/+$/, '');
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        uniqueItems.push(item);
      }

      // Calculate source distribution for telemetry
      const sourceCounts = {};
      uniqueItems.forEach(item => {
        sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
      });

      const latencyMs = Date.now() - startTime;

      return {
        ok: true,
        query: q,
        engine: targetEngine,
        source: targetSource,
        total: uniqueItems.length,
        items: uniqueItems.slice(0, limit),
        latencyMs,
        sourceCounts,
        engineErrors: engineErrors.length ? engineErrors : undefined,
        fetchedAt: new Date().toISOString()
      };
    });
  }
}

let defaultServiceInstance = null;
export function getAiSearchService(options) {
  if (!defaultServiceInstance || options) {
    defaultServiceInstance = new AiSearchService(options);
  }
  return defaultServiceInstance;
}
