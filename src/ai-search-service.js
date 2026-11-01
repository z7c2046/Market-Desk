import { DataCache, parseNews } from './workspace-data.js';
import { createHash } from 'node:crypto';
import { NEWS_WINDOWS, SOURCE_DOMAINS, domainMatches, expandedQuery, queryProfile, relevanceFor, normalizeSearchParams } from './news-search-policy.js';
import { EXCLUDED_JUNK_DOMAINS, LIVE_AUTHORITY_FEEDS, decodeHtmlText, detectSourceMeta, cleanUrl, canonicalUrl, normalizeHeadline, publicationInfo, isStaleOrJunkResult } from './news-source-utils.js';
export { decodeHtmlText, detectSourceMeta, cleanUrl, normalizeHeadline, publicationInfo, extractPublishedDate, isStaleOrJunkResult } from './news-source-utils.js';
export { expandedQuery as expandFinancialQuery } from './news-search-policy.js';

export const DEFAULT_AI_SEARCH_KEYS = {
  tavily: process.env.TAVILY_API_KEY || '', firecrawl: process.env.FIRECRAWL_API_KEY || '', exa: process.env.EXA_API_KEY || ''
};
const ENGINE_NAMES = { tavily: 'Tavily', exa: 'Exa', firecrawl: 'Firecrawl', live_wire: 'RSS 订阅源' };
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);

export class AiSearchService {
  constructor({ keys = DEFAULT_AI_SEARCH_KEYS, fetchImpl = globalThis.fetch, cache = new DataCache(), timeoutMs = 12000, enableLiveFeeds = fetchImpl === globalThis.fetch, now = Date.now } = {}) {
    this.keys = { ...DEFAULT_AI_SEARCH_KEYS, ...keys };
    this.fetch = fetchImpl;
    this.cache = cache;
    this.timeoutMs = timeoutMs;
    this.enableLiveFeeds = enableLiveFeeds;
    this.now = now;
    this.firstSeen = new Map();
  }

  normalizeItem(item, engine) {
    const url = cleanUrl(item.url || item.link || '');
    const meta = detectSourceMeta(url);
    const snippet = decodeHtmlText(item.content || (Array.isArray(item.highlights) ? item.highlights.join(' ') : '') || item.description || item.summary || item.text || '').slice(0, 900);
    const published = publicationInfo({ rawDate: item.published_date || item.publishedDate || item.publishedAt || item.date || item.metadata?.publishedTime, url, nowMs: this.now() });
    return {
      id: hash(url), url, title: decodeHtmlText(item.title || ''), snippet, source: meta.name,
      sourceBadge: meta.badge, sourceType: meta.type, sourceIcon: meta.icon, sourceClass: meta.tagClass, domain: meta.domain,
      engine, engineName: ENGINE_NAMES[engine], engines: [engine], ...published,
      updatedAt: item.updatedAt || item.updated_date || null,
      evidenceType: ['x', 'reddit'].includes(meta.type) ? 'social_unverified' : meta.type === 'official' ? 'primary_source' : 'report',
    };
  }

  async request(engine, payload) {
    if (!this.keys[engine]) throw new Error(`${ENGINE_NAMES[engine]} 未配置 API Key`);
    const urls = { tavily: 'https://api.tavily.com/search', exa: 'https://api.exa.ai/search', firecrawl: 'https://api.firecrawl.dev/v2/search' };
    const headers = { 'Content-Type': 'application/json', ...(engine === 'exa' ? { 'x-api-key': this.keys[engine] } : { Authorization: `Bearer ${this.keys[engine]}` }) };
    const res = await this.fetch(urls[engine], { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) {
      const reason = res.status === 429 ? '请求频率或额度受限' : [401, 403].includes(res.status) ? '密钥或权限不可用' : res.status === 402 ? '额度不足' : '服务请求失败';
      // Upstream bodies can echo secrets; expose only status and a safe explanation.
      throw new Error(`${ENGINE_NAMES[engine]} ${reason} (HTTP ${res.status})`);
    }
    const data = await res.json();
    if (data.success === false) throw new Error(`${ENGINE_NAMES[engine]} 未能完成检索`);
    if (engine === 'firecrawl' && !Array.isArray(data.data?.news) && !Array.isArray(data.data?.web)) throw new Error('Firecrawl 返回格式异常');
    const rows = engine === 'firecrawl' ? [...(data.data?.news || []), ...(data.data?.web || [])] : data.results;
    if (!Array.isArray(rows)) throw new Error(`${ENGINE_NAMES[engine]} 返回格式异常`);
    return rows.map(item => this.normalizeItem(item, engine));
  }

  async searchWithTavily(query, { source = 'all', limit = 16, timeRange = 'day' } = {}) {
    const social = ['social', 'reddit', 'x'].includes(source);
    return this.request('tavily', {
      query: expandedQuery(query), search_depth: 'basic', max_results: Math.min(20, Math.max(10, limit)),
      topic: social || source === 'official' ? 'general' : 'news',
      time_range: timeRange === 'week' ? 'week' : 'day', include_published_date: true,
      include_domains: SOURCE_DOMAINS[source], exclude_domains: EXCLUDED_JUNK_DOMAINS,
    });
  }

  async searchWithExa(query, { source = 'all', limit = 16, timeRange = 'day' } = {}) {
    const payload = {
      query: expandedQuery(query), type: 'auto', numResults: Math.min(20, Math.max(10, limit)),
      startPublishedDate: new Date(this.now() - NEWS_WINDOWS[timeRange]).toISOString(),
      endPublishedDate: new Date(this.now()).toISOString(), contents: { highlights: true }, excludeDomains: EXCLUDED_JUNK_DOMAINS,
    };
    if (!['social', 'reddit', 'x', 'official'].includes(source)) payload.category = 'news';
    if (SOURCE_DOMAINS[source].length) payload.includeDomains = SOURCE_DOMAINS[source];
    return this.request('exa', payload);
  }

  async searchWithFirecrawl(query, { source = 'all', limit = 16, timeRange = 'day' } = {}) {
    const payload = {
      query: expandedQuery(query), limit: Math.min(20, Math.max(6, limit)),
      sources: ['social', 'reddit', 'x', 'official'].includes(source) ? ['web'] : ['news'],
      tbs: `qdr:${{ hour: 'h', day: 'd', week: 'w' }[timeRange]}`,
    };
    if (SOURCE_DOMAINS[source].length) payload.includeDomains = SOURCE_DOMAINS[source];
    return this.request('firecrawl', payload);
  }

  async searchWithLiveWireFeeds(query, { source = 'all' } = {}) {
    if (!this.enableLiveFeeds || ['social', 'reddit', 'x'].includes(source)) return { items: [], errors: [] };
    const feeds = LIVE_AUTHORITY_FEEDS.filter(f => f.scope.includes(source));
    const settled = await Promise.allSettled(feeds.map(feed => this.cache.get(`news-feed:${feed.url}`, 120000, async () => {
      const res = await this.fetch(feed.url, { headers: { Accept: 'application/rss+xml,application/xml,text/xml' }, signal: AbortSignal.timeout(4500) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { items: parseNews(await res.text(), feed.source).map(item => this.normalizeItem(item, 'live_wire')) };
    }, 0)));
    return {
      items: settled.flatMap(r => r.status === 'fulfilled' ? r.value.items : []),
      errors: settled.flatMap((r, i) => r.status === 'rejected' ? [{ engine: feeds[i].source, error: 'RSS 订阅源暂不可用' }] : []),
      available: settled.some(r => r.status === 'fulfilled'),
    };
  }

  selectItems(rawItems, options, nowMs = this.now()) {
    const profile = queryProfile(options.query);
    const seenUrl = new Map(), seenTitle = new Map(), unique = [];
    for (const raw of rawItems) {
      if (isStaleOrJunkResult(raw, { maxAgeDays: NEWS_WINDOWS[options.timeRange] / 86400000, nowMs })) continue;
      const host = new URL(raw.url).hostname.toLowerCase();
      if (SOURCE_DOMAINS[options.source].length && !SOURCE_DOMAINS[options.source].some(d => domainMatches(host, d))) continue;
      const dated = Number.isFinite(Date.parse(raw.publishedAt));
      if (!dated && !options.includeUndated) continue;
      if (options.timeRange === 'hour' && raw.timePrecision === 'day') continue;
      const relevance = relevanceFor(raw, profile);
      if (!relevance) continue;
      const canonical = canonicalUrl(raw.url);
      const normalizedTitle = normalizeHeadline(raw.title);
      // Repeated daily headlines on different dates are separate stories.
      const title = normalizedTitle.length >= 12 ? `${normalizedTitle}:${raw.publishedAt?.slice(0, 10) || 'unknown'}` : '';
      const existing = seenUrl.get(canonical) ?? (title ? seenTitle.get(title) : undefined);
      if (existing !== undefined) {
        const previous = unique[existing];
        previous.engines = [...new Set([...previous.engines, ...(raw.engines || [raw.engine])])];
        // A newer index date is not independent verification. Retain the earlier publication.
        if (dated && (!previous.publishedAt || Date.parse(raw.publishedAt) < Date.parse(previous.publishedAt))) {
          previous.publishedAt = raw.publishedAt; previous.timePrecision = raw.timePrecision; previous.dateSource = raw.dateSource;
        }
        if ((raw.snippet || '').length > (previous.snippet || '').length) previous.snippet = raw.snippet;
        seenUrl.set(canonical, existing); if (title) seenTitle.set(title, existing);
        continue;
      }
      const idx = unique.length;
      seenUrl.set(canonical, idx); if (title) seenTitle.set(title, idx);
      const primary = raw.sourceType === 'official' ? 0.1 : raw.sourceType === 'authority' ? 0.05 : 0;
      unique.push({ ...raw, relevance, rankingScore: relevance + primary, id: hash(canonical), engines: [...(raw.engines || [raw.engine])] });
    }
    unique.sort((a, b) => {
      const ta = Date.parse(a.publishedAt), tb = Date.parse(b.publishedAt);
      if (Number.isFinite(ta) !== Number.isFinite(tb)) return Number.isFinite(ta) ? -1 : 1;
      if (options.sort === 'relevance' && a.rankingScore !== b.rankingScore) return b.rankingScore - a.rankingScore;
      return (Number.isFinite(tb) ? tb - ta : 0) || b.rankingScore - a.rankingScore || a.id.localeCompare(b.id);
    });
    return unique;
  }

  async search(params = {}) {
    const options = normalizeSearchParams(params);
    const response = await this.cache.get(`ai-search:v3:${JSON.stringify(options)}`, 90000, async () => {
      const started = this.now(), raw = [], engineErrors = [], engineStatus = [];
      const run = async engine => {
        const start = this.now();
        if (!this.keys[engine]) { engineStatus.push({ engine, status: 'unconfigured' }); return; }
        try {
          const method = { tavily: 'searchWithTavily', exa: 'searchWithExa', firecrawl: 'searchWithFirecrawl' }[engine];
          const items = await this[method](options.query, options);
          raw.push(...items);
          engineStatus.push({ engine, status: 'ok', count: items.length, latencyMs: this.now() - start });
        } catch (error) {
          const message = ['TimeoutError', 'AbortError'].includes(error.name) ? `${ENGINE_NAMES[engine]} 请求超时` : error.message;
          engineErrors.push({ engine: ENGINE_NAMES[engine], error: message });
          engineStatus.push({ engine, status: 'error', latencyMs: this.now() - start });
        }
      };
      const feeds = this.searchWithLiveWireFeeds(options.query, options);
      const available = ['tavily', 'exa', 'firecrawl'].filter(engine => this.keys[engine]);
      if (options.engine === 'all') await Promise.all(['tavily', 'exa', 'firecrawl'].map(run));
      else if (options.engine === 'auto') {
        for (const engine of available) {
          await run(engine);
          if (this.selectItems(raw, options).length >= Math.min(8, options.limit)) break;
        }
      } else await run(options.engine);
      const wire = await feeds;
      raw.push(...wire.items); engineErrors.push(...wire.errors);
      for (const engine of ['tavily', 'exa', 'firecrawl']) {
        if (!engineStatus.some(s => s.engine === engine)) engineStatus.push({ engine, status: this.keys[engine] ? 'not_requested' : 'unconfigured' });
      }
      const succeeded = engineStatus.some(s => s.status === 'ok') || wire.available;
      if (!succeeded) throw Object.assign(new Error(engineErrors.length ? engineErrors.map(e => e.error).join('；') : '搜索引擎未配置，且当前没有可用的 RSS 结果。'), { status: 502 });
      const items = this.selectItems(raw, options);
      for (const item of items) {
        if (!this.firstSeen.has(item.id)) {
          if (this.firstSeen.size >= 2000) this.firstSeen.delete(this.firstSeen.keys().next().value);
          this.firstSeen.set(item.id, new Date(this.now()).toISOString());
        }
        item.firstSeenAt = this.firstSeen.get(item.id);
      }
      return { ok: true, ...options, items, engineStatus, engineErrors, latencyMs: this.now() - started, fetchedAt: new Date(this.now()).toISOString() };
    }, 0);
    // Rolling windows are checked again on cache hits; expired stories never become fresh.
    const items = this.selectItems(response.items, options), shown = items.slice(0, options.limit), sourceCounts = {};
    for (const item of shown) sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
    return { ...response, items: shown, total: items.length, sourceCounts, sortOrder: options.sort === 'relevance' ? 'relevance_desc' : 'publishedAt_desc', checkedAt: new Date(this.now()).toISOString() };
  }
}

let defaultServiceInstance;
export function getAiSearchService(options) {
  if (!defaultServiceInstance || options) defaultServiceInstance = new AiSearchService(options);
  return defaultServiceInstance;
}
