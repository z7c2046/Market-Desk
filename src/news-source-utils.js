import { OFFICIAL_DOMAINS, domainMatches } from './news-search-policy.js';

export const EXCLUDED_JUNK_DOMAINS = ['distil.src.online.wsj.com', 'accounts.wsj.com', 'subscribe.wsj.com', 'customercenter.wsj.com'];
export const LIVE_AUTHORITY_FEEDS = [
  { source: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml', scope: ['official', 'authority', 'all'] },
  { source: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/speeches_and_testimony.xml', scope: ['official', 'authority', 'all'] },
  { source: 'Wall Street Journal', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain', scope: ['wsj_reuters', 'authority', 'all'] },
  { source: 'Wall Street Journal', url: 'https://feeds.content.dowjones.io/public/rss/socialeconomyfeed', scope: ['wsj_reuters', 'authority', 'all'] },
  { source: 'Wall Street Journal', url: 'https://feeds.content.dowjones.io/public/rss/RSSWorldNews', scope: ['wsj_reuters', 'authority', 'all'] },
  { source: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', scope: ['authority', 'all'] },
  { source: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', scope: ['authority', 'all'] },
];

export function decodeHtmlText(str) {
  const entities = { amp: '&', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–' };
  return String(str || '').replace(/<[^>]*>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, key) => {
    if (!key.startsWith('#')) return entities[key.toLowerCase()] ?? whole;
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  }).replace(/\s+/g, ' ').trim();
}

export function detectSourceMeta(rawUrl) {
  let host = 'web', path = '';
  try { const url = new URL(rawUrl); host = url.hostname.toLowerCase().replace(/^www\./, ''); path = url.pathname.toLowerCase(); } catch { /* unknown source */ }
  const meta = (name, type, badge, icon, style = type) => ({ name, type, badge, icon, tagClass: `source-pill-${style}`, domain: host });
  if (OFFICIAL_DOMAINS.some(d => domainMatches(host, d))) return meta(host, 'official', '官方原始来源', '🏛️', 'wsj');
  if (domainMatches(host, 'reddit.com')) {
    const sub = path.match(/^\/r\/(wallstreetbets|stocks|investing|options|economics)(?:\/|$)/)?.[1];
    return meta(sub ? `Reddit · r/${sub}` : 'Reddit', 'reddit', '社交讨论 · 待核实', '💬');
  }
  if (domainMatches(host, 'x.com') || domainMatches(host, 'twitter.com')) return meta('X (Twitter)', 'x', '社交讨论 · 待核实', '🐦');
  const media = [
    ['reuters.com', 'Reuters (路透社)', 'reuters'], ['wsj.com', 'Wall Street Journal (华尔街日报)', 'wsj'],
    ['bloomberg.com', 'Bloomberg (彭博终端)', 'bloomberg'], ['ft.com', 'Financial Times (金融时报)', 'ft'],
    ['cnbc.com', 'CNBC', 'cnbc'], ['marketwatch.com', 'MarketWatch', 'mw'], ['barrons.com', "Barron's (巴伦周刊)", 'wsj'], ['apnews.com', 'Associated Press (美联社)', 'reuters'],
  ].find(([domain]) => domainMatches(host, domain));
  return media ? meta(media[1], 'authority', '媒体报道', '📰', media[2]) : meta(host, 'web', '网络来源', '🌐');
}

export function cleanUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|gaa_|guce_)/i.test(key) || ['ref', 'source', 'mod', 'chan', 'ncid', 'guccounter'].includes(key)) url.searchParams.delete(key);
    url.hash = '';
    return url.toString();
  } catch { return value; }
}

export function canonicalUrl(value) {
  const url = new URL(cleanUrl(value));
  url.hostname = url.hostname.replace(/^www\./, '');
  url.searchParams.sort();
  return url.toString().replace(/\/$/, '');
}

export function normalizeHeadline(title) {
  return decodeHtmlText(title).toLowerCase().replace(/\s*(?:\||-|–|—)\s*(?:wsj|the wall street journal|wall street journal|reuters|bloomberg|cnbc|financial times|marketwatch|barron's)\s*$/gi, '').replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim();
}

export function publicationInfo({ rawDate, url = '', nowMs = Date.now() } = {}) {
  let path = '';
  try { path = new URL(url).pathname; } catch { /* unknown */ }
  const ymd = path.match(/(?:\/|-)(20\d{2})[-/](\d{2})[-/](\d{2})(?:\b|\/)/);
  const mdy = path.match(/(?:\/|-)(\d{2})-(\d{2})-(20\d{2})(?:\b|\/)/);
  const video = path.match(/id(?:OV|RW|LV)\d{4}(\d{2})(\d{2})(20\d{2})/i);
  const urlDate = ymd ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : mdy ? `${mdy[3]}-${mdy[1]}-${mdy[2]}` : video ? `${video[3]}-${video[2]}-${video[1]}` : '';
  const urlMs = Date.parse(`${urlDate}T00:00:00Z`);
  const raw = typeof rawDate === 'string' ? rawDate.trim() : '';
  const relative = raw.match(/^(\d+)\s+(minute|min|hour|hr|day)s?\s+ago$/i);
  let ms = relative ? nowMs - Number(relative[1]) * (/^min/i.test(relative[2]) ? 60000 : /^h/i.test(relative[2]) ? 3600000 : 86400000) : Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  let precision = relative ? 'relative' : /(?:T|\s)\d{1,2}:\d{2}/.test(raw) ? 'exact' : 'day';
  let dateSource = 'provider';
  // Retain old URL dates rather than relabel an updated historical article as breaking news.
  if (Number.isFinite(urlMs) && (!Number.isFinite(ms) || ms - urlMs > 2 * 86400000)) { ms = urlMs; precision = 'day'; dateSource = 'url'; }
  return { publishedAt: Number.isFinite(ms) ? new Date(ms).toISOString() : null, timePrecision: Number.isFinite(ms) ? precision : 'unknown', dateSource: Number.isFinite(ms) ? dateSource : 'unknown' };
}

export function extractPublishedDate(options = {}) { return publicationInfo(options).publishedAt; }

export function isStaleOrJunkResult(item, { maxAgeDays = 14, nowMs = Date.now() } = {}) {
  if (!item?.url || !item.title) return true;
  let url;
  try { url = new URL(item.url); } catch { return true; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return true;
  if (EXCLUDED_JUNK_DOMAINS.some(d => domainMatches(url.hostname.toLowerCase(), d))) return true;
  if (!url.pathname || url.pathname === '/' || /^\/(markets|business|economy|world|finance|news|video|podcasts|topics)\/?$/i.test(url.pathname)) return true;
  if (/^\/(topics\/subject|markets\/quote|market-data\/quotes)\//i.test(url.pathname)) return true;
  if (/^(Wall Street Stock Market|The Wall Street Journal\s*[-|]\s*Breaking News|Reuters\s*\|\s*Breaking International News|Bloomberg\s*-\s*Are you a robot)/i.test(item.title)) return true;
  const ms = Date.parse(item.publishedAt);
  return Number.isFinite(ms) && (ms > nowMs || nowMs - ms > maxAgeDays * 86400000);
}
