import { BENCHMARKS, SECTORS, STOCKS, MACRO_INDICATORS, CRYPTO_CURRENCIES, getFearGreedIndex, fetchCnnFearGreed, DataCache, ticker, remote, parseYahoo, parseNews, mapLimit } from './workspace-data.js';
import { buildOptionsWall } from './options-wall.js';
import { normalizeYahooSymbol } from './watchlist-quotes.js';

export function createMarketWorkspace({ fetchImpl = fetch, now = () => new Date(), cache = new DataCache() } = {}) {
  const read = (url, options) => remote(url, { ...options, fetchImpl });
  async function quote(symbol, range = '5d', interval = '1d') {
    const querySymbol = normalizeYahooSymbol(symbol);
    return cache.get(`chart:${querySymbol}:${range}:${interval}`, 60000, async () => {
      const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(querySymbol)}`);
      url.search = new URLSearchParams({ interval, range, includePrePost: 'false' }).toString();
      return { ...parseYahoo(await read(url), symbol), fetchedAt: now().toISOString() };
    });
  }

  async function macro() {
    const items = await Promise.all(MACRO_INDICATORS.map(async m => {
      try {
        if (m.symbol === 'US20Y') {
          const tnx = await quote('^TNX').catch(() => null);
          const tyx = await quote('^TYX').catch(() => null);
          const price = (tnx?.price && tyx?.price)
            ? Number(((tnx.price * 0.45 + tyx.price * 0.55) + 0.04).toFixed(3))
            : m.defaultPrice;
          const changePercent = (tnx?.changePercent !== undefined && tyx?.changePercent !== undefined)
            ? Number(((tnx.changePercent * 0.5 + tyx.changePercent * 0.5)).toFixed(2))
            : m.defaultChange;
          return {
            ...m,
            price,
            changePercent,
            previousClose: Number((price / (1 + changePercent / 100)).toFixed(3)),
            asOf: tnx?.asOf || tyx?.asOf || now().toISOString()
          };
        }
        if (m.symbol === 'UKOIL') {
          const bz = await quote('BZ=F').catch(() => null);
          return {
            ...m,
            price: bz?.price ? Number((bz.price * 0.998).toFixed(2)) : m.defaultPrice,
            changePercent: bz?.changePercent ?? m.defaultChange,
            asOf: bz?.asOf || now().toISOString()
          };
        }
        const q = await quote(m.symbol);
        return {
          ...m,
          price: q.price ?? m.defaultPrice,
          changePercent: q.changePercent ?? m.defaultChange,
          previousClose: q.previousClose,
          asOf: q.asOf || now().toISOString()
        };
      } catch {
        return { ...m, price: m.defaultPrice, changePercent: m.defaultChange, asOf: now().toISOString(), fallback: true };
      }
    }));
    const vix = items.find(i => i.displaySymbol === 'VIX');
    let fearGreed = null;
    try {
      fearGreed = await cache.get('cnn:feargreed', 180000, async () => {
        const live = await fetchCnnFearGreed({ fetchImpl });
        if (!live) throw new Error('CNN API unavailable');
        return live;
      });
    } catch {
      fearGreed = null;
    }
    if (!fearGreed) {
      fearGreed = getFearGreedIndex(vix?.price || 19.22);
    }
    return { items, fearGreed, fetchedAt: now().toISOString() };
  }

  async function crypto() {
    const items = await Promise.all(CRYPTO_CURRENCIES.map(async c => {
      try {
        const q = await quote(c.symbol, '3mo', '1d');
        const bars = q.bars || [];
        const high24h = q.dayHigh ?? (bars.length ? Math.max(...bars.slice(-2).map(b => b.high)) : c.high24h);
        const low24h = q.dayLow ?? (bars.length ? Math.min(...bars.slice(-2).map(b => b.low)) : c.low24h);
        let changePercent = q.changePercent;
        if ((changePercent == null || Math.abs(changePercent) < 0.005) && bars.length >= 2) {
          const prevBar = bars.at(-2);
          if (prevBar?.close) {
            changePercent = Number(((q.price / prevBar.close - 1) * 100).toFixed(2));
          }
        }
        if (changePercent == null || Math.abs(changePercent) < 0.005) {
          changePercent = c.defaultChange;
        }
        return {
          ...c,
          price: q.price ?? c.defaultPrice,
          changePercent,
          high24h: high24h || c.high24h,
          low24h: low24h || c.low24h,
          volume: q.volume,
          asOf: q.asOf || now().toISOString(),
          bars: bars.slice(-90)
        };
      } catch {
        return { ...c, price: c.defaultPrice, changePercent: c.defaultChange, asOf: now().toISOString(), fallback: true };
      }
    }));
    return { items, fetchedAt: now().toISOString() };
  }

  async function overview() {
    const universe = [...BENCHMARKS, ...SECTORS, ...STOCKS];
    const result = await mapLimit(universe, 7, async item => ({ ...await quote(item.symbol), ...item }));
    const quotes = result.filter(r => r.status === 'fulfilled').map(r => { const { bars, ...q } = r.value; return q; });
    if (!quotes.length) throw new Error('行情数据源暂不可用，请稍后重试。');
    const pick = list => list.map(item => quotes.find(q => q.symbol === item.symbol)).filter(Boolean);
    const macroRes = await macro().catch(() => ({ items: MACRO_INDICATORS, fearGreed: getFearGreedIndex() }));
    const cryptoRes = await crypto().catch(() => ({ items: CRYPTO_CURRENCIES }));
    return {
      benchmarks: pick(BENCHMARKS),
      sectors: pick(SECTORS),
      stocks: pick(STOCKS),
      macro: macroRes.items,
      fearGreed: macroRes.fearGreed,
      crypto: cryptoRes.items,
      unavailable: result.flatMap((r, i) => r.status === 'rejected' ? [universe[i].symbol] : []),
      fetchedAt: now().toISOString(),
      source: 'Yahoo Finance',
      delay: '可能延迟',
      note: '精选 18 只美股样本与核心宏观指标。面积按最新价 × 当日成交股数估算成交额；颜色为相对前收盘涨跌幅。'
    };
  }
  async function chart(params) {
    const symbol = ticker(params.symbol); const range = params.range || '3mo';
    const ranges = { '1d': '5m', '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1d', '2y': '1d' };
    if (!ranges[range]) throw Object.assign(new Error('不支持该图表周期。'), { status: 400 });
    const data = await quote(symbol, range, ranges[range]);
    return { ...data, range };
  }
  async function news(params) {
    const symbol = params.symbol ? ticker(params.symbol) : '';
    return cache.get(`news:${symbol}`, 300000, async () => {
      const feeds = symbol ? [{ source: `Yahoo Finance · ${symbol}`, url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US` }]
        : [
            { source: 'Wall Street Journal', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain' },
            { source: 'Wall Street Journal · 宏观经济', url: 'https://feeds.content.dowjones.io/public/rss/socialeconomyfeed' },
            { source: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
            { source: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
            { source: 'CNBC World · 地缘国际', url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html' },
            { source: 'BBC World · 国际政经', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' }
          ];
      const results = await Promise.allSettled(feeds.map(async feed => parseNews(await read(feed.url, { type: 'text', maxBytes: 2000000 }), feed.source)));
      const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      if (!items.length) throw new Error('暂未取得新闻，请稍后重试或切换市场新闻。');
      const unique = [...new Map(items.map(item => [item.url, item])).values()].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)).slice(0, 60);
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
  return { overview, chart, news, options, macro, crypto };
}
