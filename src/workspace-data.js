import { XMLParser } from 'fast-xml-parser';

export const BENCHMARKS = [
  ['^GSPC', '标普 500 指数'], ['^NDX', '纳斯达克 100 指数'], ['^DJI', '道琼斯工业指数'],
  ['^RUT', '罗素 2000 指数'], ['^VIX', '波动率 VIX'],
].map(([symbol, name]) => ({ symbol, name }));
export const SECTORS = [
  ['XLK', '科技'], ['XLC', '通信服务'], ['XLY', '可选消费'], ['XLP', '必需消费'],
  ['XLF', '金融'], ['XLV', '医疗保健'], ['XLI', '工业'], ['XLE', '能源'],
  ['XLB', '原材料'], ['XLRE', '房地产'], ['XLU', '公用事业'],
].map(([symbol, name]) => ({ symbol, name }));
export const STOCKS = [
  ['NVDA', 'NVIDIA', '科技'], ['AAPL', 'Apple', '科技'], ['MSFT', 'Microsoft', '科技'],
  ['AVGO', 'Broadcom', '科技'], ['AMD', 'AMD', '科技'], ['MU', 'Micron', '科技'],
  ['GOOGL', 'Alphabet', '通信服务'], ['META', 'Meta', '通信服务'], ['NFLX', 'Netflix', '通信服务'],
  ['AMZN', 'Amazon', '可选消费'], ['TSLA', 'Tesla', '可选消费'],
  ['JPM', 'JPMorgan Chase', '金融'], ['V', 'Visa', '金融'], ['WMT', 'Walmart', '必需消费'],
  ['LLY', 'Eli Lilly', '医疗保健'], ['XOM', 'Exxon Mobil', '能源'],
  ['CAT', 'Caterpillar', '工业'], ['NEE', 'NextEra Energy', '公用事业'],
].map(([symbol, name, sector]) => ({ symbol, name, sector }));

export const MACRO_INDICATORS = [
  { symbol: '^VIX', displaySymbol: 'VIX', name: '波动率指数', category: 'volatility', icon: '🇺🇸', defaultPrice: 19.22, defaultChange: 1.05 },
  { symbol: '^TNX', displaySymbol: 'US10Y', name: '10年期美债收益率', category: 'rates', icon: '🇺🇸', defaultPrice: 4.990, defaultChange: 0.58 },
  { symbol: 'US20Y', displaySymbol: 'US20Y', name: '20年期美债收益率', category: 'rates', icon: '🇺🇸', defaultPrice: 5.360, defaultChange: 0.66 },
  { symbol: '^TYX', displaySymbol: 'US30Y', name: '30年期美债收益率', category: 'rates', icon: '🇺🇸', defaultPrice: 5.314, defaultChange: 0.53 },
  { symbol: 'DX-Y.NYB', displaySymbol: 'DXY', name: '美元指数', category: 'fx', icon: '💲', defaultPrice: 101.782, defaultChange: 0.16 },
  { symbol: 'BZ=F', displaySymbol: 'BRN1!', name: '布伦特原油连续', category: 'commodity', icon: '🛢️', defaultPrice: 117.18, defaultChange: 3.54 },
  { symbol: 'UKOIL', displaySymbol: 'UKOIL', name: '伦敦布伦特现货', category: 'commodity', icon: '🛢️', defaultPrice: 117.01, defaultChange: 3.63 },
  { symbol: 'GC=F', displaySymbol: 'XAU/USD', name: '黄金现货 / 合约', category: 'commodity', icon: '🪙', defaultPrice: 2748.50, defaultChange: 0.65 },
  { symbol: 'CNY=X', displaySymbol: 'USD/CNY', name: '美元兑人民币', category: 'fx', icon: '🇨🇳', defaultPrice: 7.1200, defaultChange: 0.05 }
];

export const CRYPTO_CURRENCIES = [
  { symbol: 'BTC-USD', code: 'BTC', name: 'Bitcoin 比特币', rank: 1, icon: '₿', defaultPrice: 68420.00, defaultChange: 1.85, marketCap: '1.35T', vol24h: '38.2B', high24h: 68950, low24h: 66820 },
  { symbol: 'ETH-USD', code: 'ETH', name: 'Ethereum 以太坊', rank: 2, icon: 'Ξ', defaultPrice: 2620.50, defaultChange: 2.14, marketCap: '315.8B', vol24h: '18.4B', high24h: 2655, low24h: 2540 },
  { symbol: 'BNB-USD', code: 'BNB', name: 'BNB 币安币', rank: 3, icon: '🟡', defaultPrice: 595.30, defaultChange: 0.92, marketCap: '89.2B', vol24h: '1.4B', high24h: 602, low24h: 588 },
  { symbol: 'SOL-USD', code: 'SOL', name: 'Solana 索拉纳', rank: 4, icon: '🟣', defaultPrice: 172.40, defaultChange: 4.88, marketCap: '81.4B', vol24h: '4.8B', high24h: 176, low24h: 164 },
  { symbol: 'XRP-USD', code: 'XRP', name: 'XRP 瑞波币', rank: 5, icon: '✕', defaultPrice: 0.542, defaultChange: -0.65, marketCap: '30.7B', vol24h: '1.1B', high24h: 0.555, low24h: 0.536 },
  { symbol: 'ADA-USD', code: 'ADA', name: 'Cardano 艾达币', rank: 6, icon: '₳', defaultPrice: 0.358, defaultChange: 1.12, marketCap: '12.8B', vol24h: '340M', high24h: 0.366, low24h: 0.351 }
];

export function getFearGreedIndex(vixPrice = 19.22) {
  const baseScore = Math.max(8, Math.min(92, Math.round(55 - (vixPrice - 15) * 2.8)));
  const score = baseScore || 28;
  let rating = '中性';
  let ratingEn = 'Neutral';
  let toneClass = 'kpi-pill-blue';
  if (score <= 25) {
    rating = '极度恐慌';
    ratingEn = 'Extreme Fear';
    toneClass = 'kpi-pill-red';
  } else if (score <= 45) {
    rating = '恐慌';
    ratingEn = 'Fear';
    toneClass = 'kpi-pill-amber';
  } else if (score <= 55) {
    rating = '中性';
    ratingEn = 'Neutral';
    toneClass = 'kpi-pill-blue';
  } else if (score <= 75) {
    rating = '贪婪';
    ratingEn = 'Greed';
    toneClass = 'kpi-pill-green';
  } else {
    rating = '极度贪婪';
    ratingEn = 'Extreme Greed';
    toneClass = 'kpi-pill-green';
  }
  return {
    score,
    rating,
    ratingEn,
    toneClass,
    previousClose: 20,
    previousWeek: 22,
    previousMonth: 33,
    previousYear: 28,
    description: score < 45 ? '市场投资者防御情绪抬升，避险偏好占优' : '市场风险偏好提升，流动性环境良好'
  };
}

export async function fetchCnnFearGreed({ fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) throw new Error('CNN API status ' + res.status);
    const data = await res.json();
    const fg = data?.fear_and_greed;
    if (fg && typeof fg.score === 'number') {
      const score = Math.round(fg.score);
      let rating = '中性';
      let ratingEn = 'Neutral';
      let toneClass = 'kpi-pill-blue';
      if (score <= 25) {
        rating = '极度恐慌';
        ratingEn = 'Extreme Fear';
        toneClass = 'kpi-pill-red';
      } else if (score <= 45) {
        rating = '恐慌';
        ratingEn = 'Fear';
        toneClass = 'kpi-pill-amber';
      } else if (score <= 55) {
        rating = '中性';
        ratingEn = 'Neutral';
        toneClass = 'kpi-pill-blue';
      } else if (score <= 75) {
        rating = '贪婪';
        ratingEn = 'Greed';
        toneClass = 'kpi-pill-green';
      } else {
        rating = '极度贪婪';
        ratingEn = 'Extreme Greed';
        toneClass = 'kpi-pill-green';
      }
      return {
        score,
        rating,
        ratingEn,
        toneClass,
        previousClose: Math.round(fg.previous_close ?? 20),
        previousWeek: Math.round(fg.previous_1_week ?? 22),
        previousMonth: Math.round(fg.previous_1_month ?? 33),
        previousYear: Math.round(fg.previous_1_year ?? 28),
        timestamp: fg.timestamp,
        source: 'CNN Official API',
        description: score <= 25 ? '市场处于极度恐慌状态，投资者避险情绪到达极值' : (score <= 45 ? '市场投资者防御情绪抬升，避险偏好占优' : '市场风险偏好提升，流动性环境良好')
      };
    }
  } catch {
    return null;
  }
}

export function number(value) {
  if (value == null || (typeof value === 'string' && !value.trim()) || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function ticker(value = 'SPY') {
  const symbol = String(value).trim().toUpperCase();
  if (!/^\^?[A-Z0-9][A-Z0-9.=-]{0,14}$/.test(symbol)) {
    throw Object.assign(new Error('请输入有效的美股或港股代码，例如 AAPL、BRK-B、07709.HK 或 SPY。'), { status: 400 });
  }
  return symbol;
}
export function nyDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function safeUrl(value) {
  try { const u = new URL(String(value)); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}

// Bounded cache with single-flight requests and explicitly marked stale fallback.
export class DataCache {
  constructor({ now = Date.now, max = 150 } = {}) { this.now = now; this.max = max; this.values = new Map(); this.pending = new Map(); }
  async get(key, ttl, loader, staleTtl = 3600000) {
    const old = this.values.get(key);
    if (old && this.now() - old.saved < ttl) return { ...old.value, cached: true, stale: false };
    if (this.pending.has(key)) return this.pending.get(key);
    const request = (async () => {
      try {
        const value = await loader();
        if (this.values.size >= this.max) this.values.delete(this.values.keys().next().value);
        this.values.set(key, { saved: this.now(), value });
        return { ...value, cached: false, stale: false };
      } catch (error) {
        if (old && this.now() - old.saved < staleTtl) return { ...old.value, cached: true, stale: true, warning: '数据源暂不可用，显示上次成功快照。' };
        throw error;
      } finally { this.pending.delete(key); }
    })();
    this.pending.set(key, request);
    return request;
  }
}

export async function remote(url, { type = 'json', fetchImpl = fetch, maxBytes = 16000000, timeout = 14000 } = {}) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'Mozilla/5.0 MarketDesk/1.0', Accept: type === 'json' ? 'application/json' : 'application/rss+xml,application/xml,text/xml' } });
  if (!res.ok) throw new Error(`数据源返回 HTTP ${res.status}`);
  const reader = res.body.getReader();
  let bytes = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > maxBytes) { await reader.cancel(); throw new Error('数据源响应过大'); }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  return type === 'json' ? JSON.parse(body) : body;
}

export function parseYahoo(payload, symbol) {
  const data = payload?.chart?.result?.[0];
  if (!data) throw new Error('该代码暂时没有可用行情。');
  const meta = data.meta || {}; const values = data.indicators?.quote?.[0] || {};
  const bars = (data.timestamp || []).map((time, i) => ({ time, open: number(values.open?.[i]), high: number(values.high?.[i]), low: number(values.low?.[i]), close: number(values.close?.[i]), volume: number(values.volume?.[i]) }))
    .filter(b => [b.time, b.open, b.high, b.low, b.close].every(Number.isFinite)).sort((a, b) => a.time - b.time);
  const price = number(meta.regularMarketPrice) ?? bars.at(-1)?.close ?? null;
  // chartPreviousClose is the range baseline, NOT yesterday's close for multi-day charts.
  const tradeDate = meta.regularMarketTime ? nyDate(new Date(meta.regularMarketTime * 1000)) : null;
  const previousBar = bars.filter(b => nyDate(new Date(b.time * 1000)) < tradeDate).at(-1);
  const previousClose = number(meta.previousClose) ?? previousBar?.close ?? null;
  const volume = number(meta.regularMarketVolume);
  const fulldayPrice = number(meta.fulldayPrice);
  const extPrice = (fulldayPrice != null && fulldayPrice !== price) ? fulldayPrice : null;
  const extChangePercent = extPrice != null
    ? (number(meta.fulldayChangePercent) ?? (price > 0 ? (extPrice / price - 1) * 100 : null))
    : null;
  return {
    symbol, name: meta.longName || meta.shortName || symbol, price, previousClose,
    changePercent: price !== null && previousClose > 0 ? (price / previousClose - 1) * 100 : null,
    extPrice, extChangePercent,
    volume, turnover: price !== null && volume !== null ? price * volume : null,
    dayHigh: number(meta.regularMarketDayHigh), dayLow: number(meta.regularMarketDayLow),
    currency: meta.currency || 'USD', asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    source: 'Yahoo Finance', delay: '可能延迟', delayStatus: 'delayed', bars,
  };
}

export function parseNews(xml, source) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('不支持带实体声明的新闻源。');
  const parsed = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false }).parse(xml);
  const raw = parsed.rss?.channel?.item ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(item => {
    const url = safeUrl(typeof item.link === 'string' ? item.link : '');
    const title = String(item.title || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const date = Date.parse(item.pubDate);
    let image = null;
    if (item.enclosure && item.enclosure['@_url']) {
      image = safeUrl(item.enclosure['@_url']);
    }
    const mc = item['media:content'] || item['media:thumbnail'];
    if (!image && mc) {
      const candidate = Array.isArray(mc) ? mc[0]?.['@_url'] : mc['@_url'];
      if (candidate) image = safeUrl(candidate);
    }
    let summary = '';
    if (typeof item.description === 'string') {
      const imgMatch = item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (!image && imgMatch) image = safeUrl(imgMatch[1]);
      summary = item.description.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    }
    return { title, url, source, publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null, image, summary };
  }).filter(x => x.url && x.title);
}

export async function mapLimit(items, limit, fn) {
  const result = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const i = cursor++; try { result[i] = { status: 'fulfilled', value: await fn(items[i]) }; } catch (reason) { result[i] = { status: 'rejected', reason }; } }
  }));
  return result;
}
