import { BENCHMARKS, SECTORS, STOCKS, DataCache, ticker, remote, parseYahoo, parseNews, mapLimit } from './workspace-data.js';
import { buildOptionsWall } from './options-wall.js';

export function createMarketWorkspace({ fetchImpl = fetch, now = () => new Date(), cache = new DataCache() } = {}) {
  const read = (url, options) => remote(url, { ...options, fetchImpl });
  async function quote(symbol, range = '5d', interval = '1d') {
    return cache.get(`chart:${symbol}:${range}:${interval}`, 60000, async () => {
      const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
      url.search = new URLSearchParams({ interval, range, includePrePost: 'false' }).toString();
      return { ...parseYahoo(await read(url), symbol), fetchedAt: now().toISOString() };
    });
  }
  async function overview() {
    const universe = [...BENCHMARKS, ...SECTORS, ...STOCKS];
    const result = await mapLimit(universe, 7, async item => ({ ...await quote(item.symbol), ...item }));
    const quotes = result.filter(r => r.status === 'fulfilled').map(r => { const { bars, ...q } = r.value; return q; });
    if (!quotes.length) throw new Error('行情数据源暂不可用，请稍后重试。');
    const pick = list => list.map(item => quotes.find(q => q.symbol === item.symbol)).filter(Boolean);
    return { benchmarks: pick(BENCHMARKS), sectors: pick(SECTORS), stocks: pick(STOCKS),
      unavailable: result.flatMap((r, i) => r.status === 'rejected' ? [universe[i].symbol] : []),
      fetchedAt: now().toISOString(), source: 'Yahoo Finance', delay: '可能延迟',
      note: '精选 18 只美股样本，非全市场或完整标普 500。面积按最新价 × 当日成交股数估算成交额；颜色为相对前收盘涨跌幅。' };
  }
  async function chart(params) {
    const symbol = ticker(params.symbol); const range = params.range || '3mo';
    const ranges = { '1d': '5m', '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1d' };
    if (!ranges[range]) throw Object.assign(new Error('不支持该图表周期。'), { status: 400 });
    const data = await quote(symbol, range, ranges[range]);
    return { ...data, range };
  }
  async function news(params) {
    const symbol = params.symbol ? ticker(params.symbol) : '';
    return cache.get(`news:${symbol}`, 300000, async () => {
      const feeds = symbol ? [{ source: `Yahoo Finance · ${symbol}`, url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US` }]
        : [{ source: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' }, { source: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' }];
      const results = await Promise.allSettled(feeds.map(async feed => parseNews(await read(feed.url, { type: 'text', maxBytes: 2000000 }), feed.source)));
      const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      if (!items.length) throw new Error('暂未取得新闻，请稍后重试或切换市场新闻。');
      const unique = [...new Map(items.map(item => [item.url, item])).values()].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)).slice(0, 40);
      return { symbol, items: unique, fetchedAt: now().toISOString(), unavailable: results.flatMap((r, i) => r.status === 'rejected' ? [feeds[i].source] : []) };
    });
  }
  async function options(params) {
    const symbol = ticker(params.symbol);
    const expiration = String(params.expiration || '');
    if (expiration && expiration !== 'all' && !/^\d{4}-\d{2}-\d{2}$/.test(expiration)) throw Object.assign(new Error('到期日格式错误。'), { status: 400 });
    const data = await cache.get(`options:${symbol}`, 900000, async () => {
      const code = symbol.replace(/^\^/, '_').replace('-', '.');
      const payload = await read(`https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(code)}.json`, { timeout: 20000 });
      if (!Array.isArray(payload?.data?.options)) throw new Error('该标的暂无可用的 Cboe 期权链。');
      return { payload, fetchedAt: now().toISOString() };
    });
    const { payload, ...meta } = data;
    return { ...buildOptionsWall(payload, { symbol, expiration, now: now() }), ...meta };
  }
  return { overview, chart, news, options };
}
