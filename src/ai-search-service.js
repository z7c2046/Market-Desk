import { DataCache, parseNews } from './workspace-data.js';

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

const EXCLUDED_JUNK_DOMAINS = [
  'distil.src.online.wsj.com',
  'jp.reuters.com',
  'de.reuters.com',
  'fr.reuters.com',
  'es.reuters.com',
  'ar.reuters.com',
  'accounts.wsj.com',
  'subscribe.wsj.com',
  'customercenter.wsj.com'
];

const LIVE_AUTHORITY_FEEDS = [
  { source: 'Wall Street Journal', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain', scope: ['wsj_reuters', 'authority', 'all'] },
  { source: 'Wall Street Journal', url: 'https://feeds.content.dowjones.io/public/rss/socialeconomyfeed', scope: ['wsj_reuters', 'authority', 'all'] },
  { source: 'Wall Street Journal', url: 'https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness', scope: ['wsj_reuters', 'authority', 'all'] },
  { source: 'Wall Street Journal', url: 'https://feeds.content.dowjones.io/public/rss/RSSWorldNews', scope: ['wsj_reuters', 'authority', 'all'] },
  { source: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', scope: ['authority', 'all'] },
  { source: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', scope: ['authority', 'all'] }
];

const CN_EN_FINANCIAL_TERMS = [
  ['美联储', 'Federal Reserve Fed FOMC'],
  ['降息', 'rate cut interest rates'],
  ['加息', 'rate hike interest rates'],
  ['通胀', 'inflation CPI PCE'],
  ['非农', 'nonfarm payrolls jobs report unemployment'],
  ['财报', 'earnings revenue guidance quarterly results'],
  ['芯片', 'chip semiconductor AI GPU'],
  ['半导体', 'semiconductor chip TSMC Nvidia'],
  ['英伟达', 'Nvidia NVDA Blackwell'],
  ['特斯拉', 'Tesla TSLA Elon Musk'],
  ['苹果', 'Apple AAPL iPhone'],
  ['微软', 'Microsoft MSFT Azure OpenAI'],
  ['谷歌', 'Alphabet Google GOOGL'],
  ['亚马逊', 'Amazon AMZN AWS'],
  ['台积电', 'TSMC TSM wafer'],
  ['美光', 'Micron MU HBM memory'],
  ['地缘', 'geopolitics Middle East war sanctions tariff'],
  ['关税', 'tariff trade war customs'],
  ['原油', 'oil crude Brent WTI OPEC'],
  ['黄金', 'gold bullion safe-haven'],
  ['美债', 'Treasury yields bonds 10-year'],
  ['华尔街', 'Wall Street US stocks S&P 500 Nasdaq']
];

export function decodeHtmlText(str) {
  return String(str || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x2019;|&#8217;|&rsquo;/gi, '’')
    .replace(/&#x2018;|&#8216;|&lsquo;/gi, '‘')
    .replace(/&#x201c;|&#8220;|&ldquo;/gi, '“')
    .replace(/&#x201d;|&#8221;|&rdquo;/gi, '”')
    .replace(/&#x2014;|&#8212;|&mdash;/gi, '—')
    .replace(/&#x2013;|&#8211;|&ndash;/gi, '–')
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function expandFinancialQuery(query) {
  const raw = String(query || '').trim();
  if (!raw) return 'US stock market Wall Street economy Fed earnings';
  const additions = [];
  for (const [cn, en] of CN_EN_FINANCIAL_TERMS) {
    if (raw.includes(cn)) additions.push(en);
  }
  if (additions.length === 0) return raw;
  return `${raw} ${additions.join(' ')}`.trim();
}

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

    if (host.includes('barrons.com')) {
      return {
        name: "Barron's (巴伦周刊)",
        type: 'authority',
        badge: '华尔街深度投研',
        icon: '📘',
        tagClass: 'source-pill-wsj',
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
    [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'ref', 'source', 'mod', 'chan', 'gaa_at', 'gaa_n', 'gaa_sig', 'gaa_ts',
      'ncid', 'guccounter', 'guce_referrer', 'guce_referrer_sig'
    ].forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return url;
  }
}

export function normalizeHeadline(title) {
  return decodeHtmlText(title)
    .toLowerCase()
    .replace(/\s*(?:\||-|\u2013|\u2014)\s*(?:wsj|the wall street journal|wall street journal|reuters|bloomberg|cnbc|financial times|marketwatch|barron's|ロイター)\s*$/gi, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .trim();
}

function extractUrlEmbeddedDateMs(url = '') {
  const str = String(url || '');
  // 1. YYYY-MM-DD or YYYY/MM/DD in URL path/slug
  const ymd = str.match(/(?:\/|-|\b)(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])(?:\b|\/|$)/);
  if (ymd) {
    const ms = Date.parse(`${ymd[1]}-${ymd[2]}-${ymd[3]}T12:00:00Z`);
    if (Number.isFinite(ms)) return ms;
  }
  // 2. MM-DD-YYYY in URL slug (e.g. wsj.com/livecoverage/...-11-14-2023)
  const mdy = str.match(/(?:\/|-|\b)(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])-(20\d{2})(?:\b|\/|$)/);
  if (mdy) {
    const ms = Date.parse(`${mdy[3]}-${mdy[1]}-${mdy[2]}T12:00:00Z`);
    if (Number.isFinite(ms)) return ms;
  }
  // 3. Reuters video IDs: idOV023723082022RP1 or idRW010202102025RP1 -> DDMMYYYY
  const reutersVid = str.match(/id(?:OV|RW|LV)\d{4}(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})/i);
  if (reutersVid) {
    const ms = Date.parse(`${reutersVid[3]}-${reutersVid[2]}-${reutersVid[1]}T12:00:00Z`);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function extractTextEmbeddedDateMs(text = '', nowMs = Date.now()) {
  const str = String(text || '');
  // Explicit English date e.g. "August 24, 2022" or "Oct. 28, 2026"
  const monthMatch = str.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (monthMatch) {
    const ms = Date.parse(`${monthMatch[1]} ${monthMatch[2]}, ${monthMatch[3]} 12:00:00 UTC`);
    if (Number.isFinite(ms)) return ms;
  }
  // Relative time e.g. "25 minutes ago", "3 hours ago", "1 day ago"
  const relMatch = str.match(/\b(\d{1,2})\s*(minute|min|hour|hr|day)s?\s+ago\b/i);
  if (relMatch) {
    const val = Number(relMatch[1]);
    const unit = relMatch[2].toLowerCase();
    const mult = unit.startsWith('min') ? 60000 : unit.startsWith('h') ? 3600000 : 86400000;
    return nowMs - val * mult;
  }
  return null;
}

export function extractPublishedDate({ rawDate, url = '', title = '', snippet = '', nowMs = Date.now() } = {}) {
  const urlDateMs = extractUrlEmbeddedDateMs(url);
  const textDateMs = extractTextEmbeddedDateMs(`${title} ${snippet}`, nowMs);

  // If URL or text explicitly embeds an old date (> 14 days ago), do not let a crawler's rawDate override it
  if (urlDateMs != null && nowMs - urlDateMs > 14 * 86400000) {
    return new Date(urlDateMs).toISOString();
  }
  if (textDateMs != null && nowMs - textDateMs > 14 * 86400000) {
    return new Date(textDateMs).toISOString();
  }

  if (rawDate) {
    const parsedMs = Date.parse(rawDate);
    if (Number.isFinite(parsedMs)) {
      const clampedMs = Math.min(parsedMs, nowMs);
      return new Date(clampedMs).toISOString();
    }
  }

  if (urlDateMs != null) {
    return new Date(Math.min(urlDateMs, nowMs)).toISOString();
  }
  if (textDateMs != null) {
    return new Date(Math.min(textDateMs, nowMs)).toISOString();
  }

  // Never fabricate new Date().toISOString() when no real timestamp exists
  return null;
}

export function isStaleOrJunkResult(item, { maxAgeDays = 14, nowMs = Date.now() } = {}) {
  if (!item || !item.url) return true;
  let parsedUrl;
  try {
    parsedUrl = new URL(item.url);
  } catch {
    return true;
  }

  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = parsedUrl.pathname;

  // 1. Reject junk / captcha / non-English duplicate domains
  if (EXCLUDED_JUNK_DOMAINS.some(d => host === d || host.endsWith(`.${d}`))) {
    return true;
  }

  // 2. Reject bare homepages or generic section/topic/quote landing pages
  if (!pathname || pathname === '/' || /^\/(markets|business|economy|world|finance|news|video|podcasts|topics)\/?$/i.test(pathname)) {
    return true;
  }
  if (/^\/(topics\/subject|markets\/quote|market-data\/quotes)\//i.test(pathname)) {
    return true;
  }
  // Legacy Reuters archive paths from 2010-2020 (e.g. /article/...-idUSKBN0...)
  if (/\/article\//i.test(pathname) && /idUSKBN[01]/i.test(pathname)) {
    return true;
  }

  // 3. Reject generic SEO / homepage titles
  const cleanTitle = decodeHtmlText(item.title || '');
  if (!cleanTitle || cleanTitle === '无标题财经资讯') return true;
  if (/^(Wall Street Stock Market|The Wall Street Journal\s*[-|]\s*Breaking News|Reuters\s*\|\s*Breaking International News|Bloomberg\s*-\s*Are you a robot)/i.test(cleanTitle)) {
    return true;
  }

  // 4. Reject if URL or title/snippet explicitly contains historical years (2010 - 2025)
  const urlDateMs = extractUrlEmbeddedDateMs(item.url);
  if (urlDateMs != null && nowMs - urlDateMs > maxAgeDays * 86400000) {
    return true;
  }
  if (/(?:\/|-)(201\d|202[0-5])(?:\/|-|\b)/.test(pathname)) {
    return true;
  }

  // 5. Reject if publishedAt is older than maxAgeDays
  if (item.publishedAt) {
    const pubMs = Date.parse(item.publishedAt);
    if (Number.isFinite(pubMs) && nowMs - pubMs > maxAgeDays * 86400000) {
      return true;
    }
  }

  return false;
}

export class AiSearchService {
  constructor({
    keys = DEFAULT_AI_SEARCH_KEYS,
    fetchImpl = globalThis.fetch,
    cache = new DataCache(),
    timeoutMs = 12000,
    enableLiveFeeds = fetchImpl === globalThis.fetch
  } = {}) {
    this.keys = { ...DEFAULT_AI_SEARCH_KEYS, ...keys };
    this.fetch = fetchImpl;
    this.cache = cache;
    this.timeoutMs = timeoutMs;
    this.enableLiveFeeds = enableLiveFeeds;
  }

  async searchWithTavily(query, { source = 'all', limit = 10 } = {}) {
    const key = this.keys.tavily;
    if (!key) throw new Error('Tavily API Key 未配置');

    let include_domains = [];
    let effectiveQuery = expandFinancialQuery(query);
    const isSocial = ['reddit', 'x', 'social'].includes(source);

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
        max_results: Math.max(limit, 14),
        topic: isSocial ? 'general' : 'news',
        days: isSocial ? 5 : 2,
        time_range: isSocial ? 'week' : 'day',
        exclude_domains: EXCLUDED_JUNK_DOMAINS
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
      const nowMs = Date.now();
      return results.map(item => {
        const cleaned = cleanUrl(item.url || '');
        const meta = detectSourceMeta(cleaned);
        const title = decodeHtmlText(item.title || '无标题财经资讯');
        const snippet = decodeHtmlText(item.content || item.raw_content || '').slice(0, 320);
        const publishedAt = extractPublishedDate({
          rawDate: item.published_date || item.publishedDate,
          url: cleaned,
          title,
          snippet,
          nowMs
        });
        return {
          id: `tavily_${Buffer.from(cleaned).toString('base64').slice(0, 16)}`,
          title,
          url: cleaned,
          snippet,
          source: meta.name,
          sourceBadge: meta.badge,
          sourceType: meta.type,
          sourceIcon: meta.icon,
          sourceClass: meta.tagClass,
          domain: meta.domain,
          engine: 'tavily',
          engineName: 'Tavily AI',
          score: item.score || 0,
          publishedAt
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
    let effectiveQuery = expandFinancialQuery(query);
    const isSocial = ['reddit', 'x', 'social'].includes(source);

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
      const startPublishedDate = new Date(Date.now() - 3 * 86400000).toISOString();
      const payload = {
        query: effectiveQuery,
        numResults: Math.max(limit, 14),
        useAutoprompt: true,
        startPublishedDate,
        contents: {
          highlights: { numSentences: 3 }
        }
      };
      if (!isSocial) {
        payload.category = 'news';
      }
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
      const nowMs = Date.now();
      return results.map(item => {
        const cleaned = cleanUrl(item.url || '');
        const meta = detectSourceMeta(cleaned);
        const rawSnippet = Array.isArray(item.highlights) && item.highlights.length > 0
          ? item.highlights.join(' ')
          : (item.text || item.summary || '');
        const title = decodeHtmlText(item.title || '无标题财经资讯');
        const snippet = decodeHtmlText(rawSnippet).slice(0, 320);
        const publishedAt = extractPublishedDate({
          rawDate: item.publishedDate || item.published_date,
          url: cleaned,
          title,
          snippet,
          nowMs
        });
        return {
          id: `exa_${Buffer.from(cleaned).toString('base64').slice(0, 16)}`,
          title,
          url: cleaned,
          snippet,
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
          publishedAt
        };
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async searchWithFirecrawl(query, { source = 'all', limit = 10 } = {}) {
    const key = this.keys.firecrawl;
    if (!key) throw new Error('Firecrawl API Key 未配置');

    let effectiveQuery = expandFinancialQuery(query);
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
          limit,
          tbs: 'qdr:w'
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Firecrawl API 响应异常 (${res.status}): ${errText.slice(0, 100)}`);
      }

      const data = await res.json();
      const results = Array.isArray(data.data) ? data.data : [];
      const nowMs = Date.now();
      return results.map(item => {
        const cleaned = cleanUrl(item.url || '');
        const meta = detectSourceMeta(cleaned);
        const title = decodeHtmlText(item.title || '无标题财经资讯');
        const snippet = decodeHtmlText(item.description || item.markdown?.slice(0, 260) || '');
        const publishedAt = extractPublishedDate({
          rawDate: item.publishedDate || item.published_date || item.metadata?.publishedTime,
          url: cleaned,
          title,
          snippet,
          nowMs
        });
        return {
          id: `firecrawl_${Buffer.from(cleaned).toString('base64').slice(0, 16)}`,
          title,
          url: cleaned,
          snippet,
          source: meta.name,
          sourceBadge: meta.badge,
          sourceType: meta.type,
          sourceIcon: meta.icon,
          sourceClass: meta.tagClass,
          domain: meta.domain,
          engine: 'firecrawl',
          engineName: 'Firecrawl',
          score: 0,
          publishedAt
        };
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async searchWithLiveWireFeeds(query, { source = 'all', limit = 12 } = {}) {
    if (!this.enableLiveFeeds) return [];
    if (!['all', 'authority', 'wsj_reuters'].includes(source)) return [];

    const feeds = LIVE_AUTHORITY_FEEDS.filter(f => f.scope.includes(source));
    if (!feeds.length) return [];

    const expanded = expandFinancialQuery(query).toLowerCase();
    const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'wall', 'street', 'stock', 'market', 'stocks', 'news']);
    const specificTokens = expanded
      .split(/[^a-z0-9\u4e00-\u9fa5]+/)
      .filter(t => t.length >= 2 && !stopWords.has(t));

    const results = await Promise.allSettled(
      feeds.map(async feed => {
        const res = await this.fetch(feed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 MarketDesk/1.0',
            'Accept': 'application/rss+xml,application/xml,text/xml'
          },
          signal: AbortSignal.timeout(4500)
        });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseNews(xml, feed.source);
      })
    );

    const nowMs = Date.now();
    const maxWireAgeMs = 48 * 3600000; // Only include live wire items from the last 48 hours
    const matched = [];

    for (const r of results) {
      if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
      for (const item of r.value) {
        if (!item.url || !item.publishedAt) continue;
        const pubMs = Date.parse(item.publishedAt);
        if (!Number.isFinite(pubMs) || nowMs - pubMs > maxWireAgeMs) continue;

        const cleaned = cleanUrl(item.url);
        const title = decodeHtmlText(item.title);
        const snippet = decodeHtmlText(item.summary || '');
        const haystack = `${title} ${snippet} ${cleaned}`.toLowerCase();

        // Check relevance against specific query tokens (or allow top breaking macro/market stories on general queries)
        let matchCount = 0;
        for (const tok of specificTokens) {
          if (haystack.includes(tok)) matchCount++;
        }
        const isBroadMarketQuery = specificTokens.length === 0 || /economy|fed|inflation|earnings|macro/.test(expanded);
        const hasHighImpactSignal = /\b(fed|rate|inflation|cpi|pce|gdp|jobs|payroll|tariff|treasury|yield|earnings|nasdaq|s&p|dow|wall street|ai|nvidia|apple|alphabet|google|microsoft|meta|tesla|amazon|ecb|oil|gold)\b/i.test(haystack);

        if (matchCount > 0 || (isBroadMarketQuery && hasHighImpactSignal)) {
          const meta = detectSourceMeta(cleaned);
          matched.push({
            id: `wire_${Buffer.from(cleaned).toString('base64').slice(0, 16)}`,
            title,
            url: cleaned,
            snippet: snippet || title,
            source: meta.name,
            sourceBadge: meta.badge,
            sourceType: meta.type,
            sourceIcon: meta.icon,
            sourceClass: meta.tagClass,
            domain: meta.domain,
            engine: 'live_wire',
            engineName: '实时权威专线',
            score: 1 + matchCount * 0.2,
            publishedAt: new Date(Math.min(pubMs, nowMs)).toISOString()
          });
        }
      }
    }

    matched.sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
    return matched.slice(0, limit);
  }

  async search({ query = '', engine = 'all', source = 'all', limit = 16 } = {}) {
    const q = String(query || '').trim() || 'US stock market Wall Street economy';
    const targetEngine = ['all', 'tavily', 'exa', 'firecrawl'].includes(engine) ? engine : 'all';
    const targetSource = ['all', 'social', 'reddit', 'x', 'authority', 'wsj_reuters'].includes(source) ? source : 'all';

    // Short 90s cache TTL to keep breaking news stream ultra-fresh
    const cacheKey = `ai_search:v2:${targetEngine}:${targetSource}:${q}:${limit}`;
    return this.cache.get(cacheKey, 90000, async () => {
      const startTime = Date.now();
      let rawItems = [];
      const engineErrors = [];

      if (targetEngine === 'tavily') {
        const [tavilyRes, wireRes] = await Promise.allSettled([
          this.searchWithTavily(q, { source: targetSource, limit }),
          this.searchWithLiveWireFeeds(q, { source: targetSource, limit: Math.ceil(limit * 0.5) })
        ]);
        if (tavilyRes.status === 'fulfilled') rawItems.push(...tavilyRes.value);
        else throw tavilyRes.reason;
        if (wireRes.status === 'fulfilled') rawItems.push(...wireRes.value);
      } else if (targetEngine === 'exa') {
        const [exaRes, wireRes] = await Promise.allSettled([
          this.searchWithExa(q, { source: targetSource, limit }),
          this.searchWithLiveWireFeeds(q, { source: targetSource, limit: Math.ceil(limit * 0.5) })
        ]);
        if (exaRes.status === 'fulfilled') rawItems.push(...exaRes.value);
        else throw exaRes.reason;
        if (wireRes.status === 'fulfilled') rawItems.push(...wireRes.value);
      } else if (targetEngine === 'firecrawl') {
        rawItems = await this.searchWithFirecrawl(q, { source: targetSource, limit });
      } else {
        // Ensemble / All: Parallel dispatch across Tavily + Exa + Firecrawl + Live Authority Wire
        const [wireRes, tavilyRes, exaRes, firecrawlRes] = await Promise.allSettled([
          this.searchWithLiveWireFeeds(q, { source: targetSource, limit: Math.ceil(limit * 0.6) }),
          this.searchWithTavily(q, { source: targetSource, limit: Math.ceil(limit * 0.8) }),
          this.searchWithExa(q, { source: targetSource, limit: Math.ceil(limit * 0.8) }),
          this.searchWithFirecrawl(q, { source: targetSource, limit: 6 })
        ]);

        if (wireRes.status === 'fulfilled') rawItems.push(...wireRes.value);
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

      const nowMs = Date.now();
      const filteredItems = rawItems.filter(item => !isStaleOrJunkResult(item, { maxAgeDays: 14, nowMs }));

      // Deduplicate by both canonical URL and normalized headline, keeping the item with the most accurate timestamp
      const byUrl = new Map();
      const byTitle = new Map();
      const uniqueItems = [];

      for (const item of filteredItems) {
        const normUrl = cleanUrl(item.url)
          .toLowerCase()
          .replace(/^https?:\/\/(www\.)?/, '')
          .replace(/\/+$/, '');
        const normTitle = normalizeHeadline(item.title);

        const existingIdx = byUrl.has(normUrl)
          ? byUrl.get(normUrl)
          : (normTitle.length >= 12 && byTitle.has(normTitle) ? byTitle.get(normTitle) : -1);

        if (existingIdx !== -1) {
          const prev = uniqueItems[existingIdx];
          const prevTime = prev.publishedAt ? Date.parse(prev.publishedAt) : 0;
          const currTime = item.publishedAt ? Date.parse(item.publishedAt) : 0;
          // Prefer item with a verified non-midnight timestamp or newer timestamp
          const prevHasExactClock = prev.publishedAt && !prev.publishedAt.endsWith('T00:00:00.000Z');
          const currHasExactClock = item.publishedAt && !item.publishedAt.endsWith('T00:00:00.000Z');
          if ((!prevHasExactClock && currHasExactClock) || (currTime > prevTime && currHasExactClock)) {
            uniqueItems[existingIdx] = {
              ...prev,
              ...item,
              snippet: (item.snippet && item.snippet.length >= (prev.snippet || '').length) ? item.snippet : prev.snippet
            };
          }
          continue;
        }

        const idx = uniqueItems.length;
        uniqueItems.push(item);
        byUrl.set(normUrl, idx);
        if (normTitle.length >= 12) {
          byTitle.set(normTitle, idx);
        }
      }

      // STRICT DESCENDING SORT BY PUBLISHED TIMESTAMP (Newest at the very top!)
      uniqueItems.sort((a, b) => {
        const timeA = a.publishedAt ? Date.parse(a.publishedAt) : NaN;
        const timeB = b.publishedAt ? Date.parse(b.publishedAt) : NaN;
        const validA = Number.isFinite(timeA);
        const validB = Number.isFinite(timeB);
        if (validA && validB) {
          if (timeB !== timeA) return timeB - timeA;
          return (b.score || 0) - (a.score || 0);
        }
        if (validB) return 1;
        if (validA) return -1;
        return (b.score || 0) - (a.score || 0);
      });

      const finalItems = uniqueItems.slice(0, limit);

      // Calculate source distribution for telemetry
      const sourceCounts = {};
      finalItems.forEach(item => {
        sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
      });

      const latencyMs = Date.now() - startTime;

      return {
        ok: true,
        query: q,
        engine: targetEngine,
        source: targetSource,
        sortOrder: 'publishedAt_desc',
        total: uniqueItems.length,
        items: finalItems,
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
