import { BENCHMARKS, SECTORS, STOCKS, MACRO_INDICATORS, CRYPTO_CURRENCIES, getFearGreedIndex, fetchCnnFearGreed, DataCache, ticker, remote, parseYahoo, parseNews, mapLimit } from './workspace-data.js';
import { buildOptionsWall } from './options-wall.js';
import { normalizeYahooSymbol } from './watchlist-quotes.js';

export function aggregateBarsTo4H(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const groups = new Map();
  for (const b of bars) {
    const ny = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(b.time * 1000));
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(b.time * 1000)));
    const slot = (hour >= 9 && hour < 13) ? 'morn' : ((hour >= 13 && hour <= 16) ? 'aft' : `slot_${Math.floor(hour / 4)}`);
    const key = `${ny}_${slot}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  const result = [];
  for (const list of groups.values()) {
    if (!list.length) continue;
    const first = list[0];
    const last = list[list.length - 1];
    result.push({
      time: first.time,
      open: first.open,
      high: Math.max(...list.map(b => b.high)),
      low: Math.min(...list.map(b => b.low)),
      close: last.close,
      volume: list.reduce((sum, b) => sum + (b.volume || 0), 0)
    });
  }
  return result.sort((a, b) => a.time - b.time);
}

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
  const HYPERLIQUID_TRADFI_COIN_MAP = {
    SPY: 'xyz:SP500',
    SP500: 'xyz:SP500',
    QQQ: 'xyz:XYZ100',
    XYZ100: 'xyz:XYZ100',
    'GC=F': 'xyz:GOLD',
    GOLD: 'xyz:GOLD',
    'SI=F': 'xyz:SILVER',
    SILVER: 'xyz:SILVER',
    'CL=F': 'xyz:CL',
    CL: 'xyz:CL',
    'BZ=F': 'xyz:BRENTOIL',
    BRENTOIL: 'xyz:BRENTOIL',
    'NG=F': 'xyz:NATGAS',
    NATGAS: 'xyz:NATGAS',
    'HG=F': 'xyz:COPPER',
    COPPER: 'xyz:COPPER',
    'PL=F': 'xyz:PLATINUM',
    PLATINUM: 'xyz:PLATINUM',
    'PA=F': 'xyz:PALLADIUM',
    PALLADIUM: 'xyz:PALLADIUM',
    '^VIX': 'xyz:VIX',
    VIX: 'xyz:VIX',
    DXY: 'xyz:DXY',
    'DX-Y.NYB': 'xyz:DXY'
  };

  function normalizeHyperliquidCoin(rawCoin) {
    const cleaned = String(rawCoin || '').trim().replace(/-USD$/i, '').replace(/\/USD$/i, '');
    if (!cleaned) return '';
    const colonIdx = cleaned.indexOf(':');
    if (colonIdx > 0) {
      return `${cleaned.slice(0, colonIdx).toLowerCase()}:${cleaned.slice(colonIdx + 1).toUpperCase()}`;
    }
    return cleaned.toUpperCase();
  }

  function resolveHyperliquidCoin(symbol, explicitCoin = '') {
    const explicit = normalizeHyperliquidCoin(explicitCoin);
    if (explicit) return explicit;
    if (/-USD$/i.test(symbol) || /\/USD$/i.test(symbol)) {
      return normalizeHyperliquidCoin(symbol);
    }
    if (HYPERLIQUID_TRADFI_COIN_MAP[symbol]) {
      return HYPERLIQUID_TRADFI_COIN_MAP[symbol];
    }
    return normalizeHyperliquidCoin(`xyz:${symbol}`);
  }

  async function fetchHyperliquidCandles(symbol, range, interval, explicitCoin = '') {
    const coin = resolveHyperliquidCoin(symbol, explicitCoin);
    const rangeMsMap = {
      '1d': 2 * 86400 * 1000,
      '1mo': 30 * 86400 * 1000,
      '3mo': 90 * 86400 * 1000,
      '6mo': 180 * 86400 * 1000,
      '1y': 365 * 86400 * 1000,
      '2y': 730 * 86400 * 1000
    };
    const endTime = now().getTime();
    const startTime = endTime - (rangeMsMap[range] || 30 * 86400 * 1000);
    return cache.get(`hl-chart:${coin}:${range}:${interval}`, 60000, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetchImpl('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval, startTime, endTime } }),
          signal: controller.signal
        });
        if (!res.ok) throw new Error(`Hyperliquid candleSnapshot HTTP ${res.status}`);
        const raw = await res.json();
        if (!Array.isArray(raw) || raw.length === 0) throw new Error('Hyperliquid 无可用 K 线数据');
        const bars = raw
          .map(k => ({
            time: Math.floor(Number(k.t) / 1000),
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
            volume: Number(k.v || 0)
          }))
          .filter(b => Number.isFinite(b.time) && Number.isFinite(b.open) && Number.isFinite(b.close))
          .sort((a, b) => a.time - b.time);
        if (!bars.length) throw new Error('Hyperliquid K 线解析为空');
        const last = bars[bars.length - 1];
        const prev = bars.length >= 2 ? bars[bars.length - 2] : null;
        const baseClose = prev?.close || last.open || last.close;
        const changePercent = baseClose ? Number(((last.close / baseClose - 1) * 100).toFixed(2)) : 0;
        const isHip3 = coin.includes(':');
        return {
          symbol,
          perpCoin: coin,
          venue: 'hyperliquid',
          name: isHip3 ? `${coin} 链上合约` : `${coin}/USD 永续`,
          currency: 'USD',
          price: last.close,
          previousClose: baseClose,
          changePercent,
          bars,
          range,
          interval,
          source: isHip3 ? 'Hyperliquid HIP-3' : 'Hyperliquid DEX',
          delay: '实时 24/7',
          fetchedAt: now().toISOString()
        };
      } finally {
        clearTimeout(timer);
      }
    });
  }

  async function chart(params) {
    const symbol = ticker(params.symbol);
    const range = params.range || '3mo';
    const validRanges = ['1d', '1mo', '3mo', '6mo', '1y', '2y'];
    const validIntervals = ['15m', '1h', '4h', '1d'];
    const rawVenue = String(params.venue || '').trim().toLowerCase();
    const validVenues = ['', 'auto', 'yahoo', 'equity', 'hyperliquid', 'onchain', 'hl'];
    const explicitCoin = String(params.coin || params.perpCoin || '').trim();

    if (!validRanges.includes(range)) throw Object.assign(new Error('不支持该图表周期。'), { status: 400 });

    const interval = params.interval || (range === '1d' ? '15m' : '1d');
    if (!validIntervals.includes(interval)) throw Object.assign(new Error('不支持该K线周期。'), { status: 400 });
    if (!validVenues.includes(rawVenue)) throw Object.assign(new Error('不支持该数据源。'), { status: 400 });
    if (explicitCoin && !/^([a-z0-9_-]{1,12}:)?[A-Z0-9=-]{1,16}(\/USD)?$/i.test(explicitCoin)) {
      throw Object.assign(new Error('链上合约代码格式无效。'), { status: 400 });
    }

    const forceHyperliquid = ['hyperliquid', 'onchain', 'hl'].includes(rawVenue);
    let upstreamInterval = interval;
    let upstreamRange = range;

    if (interval === '4h') {
      upstreamInterval = '1h';
    } else if (interval === '15m') {
      if (['3mo', '6mo', '1y', '2y'].includes(range)) {
        upstreamRange = '60d';
      }
    }

    if (forceHyperliquid) {
      try {
        return await fetchHyperliquidCandles(symbol, range, interval, explicitCoin);
      } catch (hlErr) {
        try {
          const fallbackData = await quote(symbol, upstreamRange, upstreamInterval);
          let fallbackBars = fallbackData.bars || [];
          if (interval === '4h') {
            fallbackBars = aggregateBarsTo4H(fallbackBars);
          }
          if (fallbackBars.length > 0) {
            return { ...fallbackData, bars: fallbackBars, range, interval, venue: 'yahoo', venueFallback: true };
          }
        } catch (_) {}
        throw hlErr;
      }
    }

    try {
      const data = await quote(symbol, upstreamRange, upstreamInterval);
      let bars = data.bars || [];
      if (interval === '4h') {
        bars = aggregateBarsTo4H(bars);
      }
      if (bars.length > 0 || !/-USD$/i.test(symbol)) {
        return { ...data, bars, range, interval, venue: 'yahoo' };
      }
    } catch (err) {
      if (!/-USD$/i.test(symbol)) throw err;
      try {
        return await fetchHyperliquidCandles(symbol, range, interval, explicitCoin);
      } catch (_) {
        throw err;
      }
    }
    return await fetchHyperliquidCandles(symbol, range, interval, explicitCoin);
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
