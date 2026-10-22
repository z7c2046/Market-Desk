import { XMLParser } from 'fast-xml-parser';

export const BENCHMARKS = [
  ['SPY', '标普 500 ETF'], ['QQQ', '纳斯达克 100 ETF'], ['DIA', '道琼斯 ETF'],
  ['IWM', '罗素 2000 ETF'], ['^VIX', '波动率 VIX'],
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

export function number(value) {
  if (value == null || (typeof value === 'string' && !value.trim()) || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function ticker(value = 'SPY') {
  const symbol = String(value).trim().toUpperCase();
  if (!/^\^?[A-Z][A-Z0-9.-]{0,10}$/.test(symbol)) {
    throw Object.assign(new Error('请输入有效的美股代码，例如 AAPL、BRK-B 或 SPY。'), { status: 400 });
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
  return {
    symbol, name: meta.longName || meta.shortName || symbol, price, previousClose,
    changePercent: price !== null && previousClose > 0 ? (price / previousClose - 1) * 100 : null,
    volume, turnover: price !== null && volume !== null ? price * volume : null,
    currency: meta.currency || 'USD', asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    source: 'Yahoo Finance', delay: '可能延迟', bars,
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
    return { title, url, source, publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null };
  }).filter(x => x.url && x.title);
}

export async function mapLimit(items, limit, fn) {
  const result = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const i = cursor++; try { result[i] = { status: 'fulfilled', value: await fn(items[i]) }; } catch (reason) { result[i] = { status: 'rejected', reason }; } }
  }));
  return result;
}
