export const NEWS_WINDOWS = { hour: 3600000, day: 86400000, week: 7 * 86400000 };
export const OFFICIAL_DOMAINS = ['federalreserve.gov', 'bls.gov', 'bea.gov', 'sec.gov', 'treasury.gov', 'bis.gov', 'ecb.europa.eu'];
export const MEDIA_DOMAINS = ['reuters.com', 'wsj.com', 'bloomberg.com', 'ft.com', 'cnbc.com', 'marketwatch.com', 'barrons.com', 'apnews.com'];
export const SOURCE_DOMAINS = {
  all: [], official: OFFICIAL_DOMAINS, authority: [...MEDIA_DOMAINS, ...OFFICIAL_DOMAINS],
  wsj_reuters: ['reuters.com', 'wsj.com'], reddit: ['reddit.com'], x: ['x.com', 'twitter.com'],
  social: ['reddit.com', 'x.com', 'twitter.com']
};

export function domainMatches(host, domain) { return host === domain || host.endsWith(`.${domain}`); }

// Aliases express identity, not a directional prediction or a particular product cycle.
const ENTITIES = [
  ['英伟达', '辉达', 'nvda', 'nvidia'], ['特斯拉', 'tsla', 'tesla'], ['苹果', 'aapl', 'apple'],
  ['微软', 'msft', 'microsoft'], ['谷歌', 'googl', 'goog', 'alphabet', 'google'],
  ['亚马逊', 'amzn', 'amazon'], ['台积电', 'tsm', 'tsmc'], ['美光', 'mu', 'micron'],
  ['meta', '脸书', 'facebook'], ['amd', '超微', 'advanced micro devices'],
  ['博通', 'avgo', 'broadcom'], ['palantir', 'pltr'], ['中东', 'middle east'],
  ['伊朗', 'iran', 'iranian'], ['以色列', 'israel', 'israeli'], ['俄罗斯', 'russia', 'russian'],
  ['乌克兰', 'ukraine', 'ukrainian'], ['红海', 'red sea'], ['台湾', 'taiwan'], ['中国', 'china', 'chinese'],
];
const TOPICS = [
  ['美联储', 'fed', 'federal reserve', 'fomc', 'powell'],
  ['通胀', 'inflation', 'cpi', 'pce', 'consumer price', 'price index'],
  ['cpi', 'consumer price index', '消费者物价'], ['pce', 'personal consumption expenditures'],
  ['非农', 'nonfarm', 'payrolls', 'jobs report', 'unemployment'],
  ['财报', 'earnings', 'revenue', 'guidance', 'quarterly results'],
  ['降息', 'rate cut', 'rates cut'], ['加息', 'rate hike', 'rates hike'],
  ['芯片', '半导体', 'semiconductor', 'chip', 'gpu'],
  ['地缘', '地缘政治', 'geopolitics', 'geopolitical', 'sanctions', 'war', 'ceasefire', 'conflict', 'tariff', 'military', 'missile', 'attack'],
  ['关税', 'tariff', 'tariffs', 'trade war'], ['制裁', 'sanction', 'sanctions'],
  ['停火', 'ceasefire', 'truce'], ['航运', 'shipping', 'freight'],
  ['出口管制', 'export control', 'export restrictions'],
  ['原油', '油价', 'oil', 'crude', 'brent', 'wti', 'opec'], ['黄金', 'gold', 'bullion'],
  ['美债', 'treasury', 'treasuries', 'bond yield', 'yields'],
];
const STOP = new Set('the a an and or for with from of to in on at is are how what latest recent today news market markets stock stocks us u s wall street economy economic finance financial report reports impact related update updates about reddit twitter x'.split(' '));

function contains(text, term) {
  if (/[^a-z0-9\s.-]/i.test(term)) return text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(text);
}

export function queryProfile(query) {
  const text = query.toLowerCase();
  const entities = ENTITIES.filter(group => group.some(term => contains(text, term)));
  let topics = TOPICS.filter(group => group.some(term => contains(text, term)));
  // A named indicator should not broaden into every other inflation indicator.
  if (/\bcpi\b|\bpce\b|消费者物价/i.test(text) && !text.includes('通胀') && !text.includes('inflation')) topics = topics.filter(group => group[0] !== '通胀');
  let remaining = text.replace(/美国股市|美股|股市|股票|财经|新闻|最新|今天|近期|相关|消息|影响|搜索|查找|关于|美国/g, ' ');
  for (const term of [...entities, ...topics].flat().sort((a, b) => b.length - a.length)) remaining = remaining.replaceAll(term, ' ');
  const tokens = [...new Set(remaining.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(t => t.length >= 2 && !STOP.has(t)))];
  return { entities, topics, tokens };
}

export function expandedQuery(query) {
  const { entities, topics } = queryProfile(query);
  const aliases = [...entities, ...topics].flatMap(group => group.filter(t => /^[a-z]/i.test(t)).slice(0, 3));
  const marketAlias = /美国股市|美股|股市|股票|财经/.test(query) ? ['US stock market'] : [];
  return [...new Set([query, ...aliases, ...marketAlias])].join(' ').slice(0, 500);
}

export function relevanceFor(item, query) {
  const profile = typeof query === 'string' ? queryProfile(query) : query;
  const text = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();
  const entityHits = profile.entities.filter(g => g.some(t => contains(text, t)));
  const topicHits = profile.topics.filter(g => g.some(t => contains(text, t)));
  const tokenHits = profile.tokens.filter(t => contains(text, t));
  if (profile.entities.length && !entityHits.length) return 0;
  if (profile.topics.length && !topicHits.length) return 0;
  if (!profile.entities.length && !profile.topics.length && profile.tokens.length && !tokenHits.length) return 0;
  const total = profile.entities.length + profile.topics.length + profile.tokens.length;
  if (!total && !/\b(stock|stocks|market|markets|equity|equities|economy|economic|fed|inflation|earnings|treasury|bonds|yields|nasdaq|tariff|oil|gold)\b|股市|财经|经济|通胀/i.test(text)) return 0;
  return total ? (entityHits.length + topicHits.length + tokenHits.length) / total : 0.5;
}

export function normalizeSearchParams(params = {}) {
  const query = String(params.query ?? params.q ?? '').trim() || 'US stock market';
  if (query.length > 400) throw Object.assign(new Error('搜索词请控制在 400 字符以内。'), { status: 400 });
  const limitValue = Number(params.limit ?? 16);
  return {
    query,
    engine: ['auto', 'all', 'tavily', 'exa', 'firecrawl'].includes(params.engine) ? params.engine : 'auto',
    source: Object.hasOwn(SOURCE_DOMAINS, params.source) ? params.source : 'all',
    timeRange: Object.hasOwn(NEWS_WINDOWS, params.timeRange) ? params.timeRange : 'day',
    sort: params.sort === 'relevance' ? 'relevance' : 'latest',
    limit: Number.isFinite(limitValue) ? Math.min(20, Math.max(1, Math.floor(limitValue))) : 16,
    includeUndated: params.includeUndated === true || params.includeUndated === 'true',
  };
}
