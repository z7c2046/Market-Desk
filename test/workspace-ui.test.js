// DOM integration tests. This does not claim real-browser or visual verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parseFlows } from '../public/flows.js';
import * as watchlistModel from '../public/watchlist-model.js';
import * as earningsCalendarModel from '../public/earnings-calendar-model.js';
import * as inflectionSignals from '../public/inflection-signals.js';
import * as themeModel from '../public/theme-model.js';
import * as mobileWorkspace from '../public/mobile-workspace.js';
import * as mobileQuoteView from '../public/mobile-quote-view.js';
import * as chartDerivedData from '../public/composables/chartDerivedData.js';
import * as whaleSankeyModel from '../public/composables/whaleSankeyModel.js';
import { AiSearchService } from '../src/ai-search-service.js';
import { createServer } from '../src/server.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 30));

function earningsFixture(weekStart, symbol = 'PLTR', epsActual = '$0.32') {
  const week = earningsCalendarModel.getEarningsWeeks(weekStart).current;
  const fetchedAt = new Date().toISOString();
  return { weekStart, weekEnd: week.weekEnd, status: 'ready', fetchedAt,
    source: 'Nasdaq 财报日历', days: week.days.map(day => ({ date: day.fullDate, status: 'ready', fetchedAt })),
    items: [{ symbol, name: symbol === 'PLTR' ? 'Palantir' : 'Apple', day: 'mon', fullDate: weekStart,
      timing: 'UNKNOWN', sectorId: 'cloud', sectorName: '云计算', aiTag: '企业软件', isAiSupplyChain: true,
      epsActual, epsConsensus: '$0.30', epsPrev: null, revActual: null, revConsensus: null,
      reportStatus: 'beat', statusBadgeText: 'EPS 超预期', fiscalQuarter: 'Sep/2026', fetchedAt,
      source: 'Nasdaq 财报日历', sourceUrl: 'https://www.nasdaq.com/market-activity/earnings' }] };
}

test('earnings calendar loads live weeks, labels missing data, refreshes, and closes via backdrop/Escape with focus restored', async t => {
  const requests = [];
  let fail = false, now = Date.now(), refreshTimer;
  const ui = await mount(t, async url => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname !== '/api/earnings/calendar') return { ok: true, json: async () => fixture(url) };
    requests.push(u);
    if (fail) throw new Error('测试断网');
    return { ok: true, json: async () => earningsFixture(u.searchParams.get('weekStart'), 'PLTR', requests.length > 1 ? '$0.40' : '$0.32') };
  }, null, w => {
    const setInterval = w.setInterval;
    w.setInterval = (fn, ms, ...args) => {
      if (fn.name === 'refreshVisibleEarnings') refreshTimer = fn;
      return setInterval(fn, ms, ...args);
    };
    w.Date.now = () => now;
    Object.defineProperty(w.document, 'hidden', { configurable: true, value: false });
  });
  await ui.click('新闻资讯');
  [...ui.w.document.querySelectorAll('.news-view-btn')].find(el => el.textContent.includes('财报周历')).click();
  await tick();
  const document = ui.w.document;
  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get('weekStart'), earningsCalendarModel.getEarningsWeeks(new Date(now)).current.weekStart);
  assert.equal(document.querySelectorAll('.earnings-wall-card').length, 1, 'No static demo rows');
  assert.match(document.querySelector('.earnings-unknown-subcol').textContent, /时段未提供.*PLTR/s);
  const trigger = document.querySelector('.earnings-wall-card');
  trigger.focus(); trigger.click(); await tick(); await tick();
  let dialog = document.querySelector('.earnings-hero-expanded-card');
  assert.equal(document.activeElement, dialog);
  assert.equal(document.body.classList.contains('earnings-detail-open'), true);
  assert.match(dialog.querySelector('.eps-card').textContent, /\$0\.32/);
  assert.match(dialog.querySelector('.rev-card').textContent, /—/);
  assert.equal(dialog.querySelector('.hero-catalyst-block'), null);
  dialog.click(); await tick();
  assert.ok(document.querySelector('.earnings-hero-backdrop'), 'Clicking content keeps detail open');
  dialog.dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, dialog.querySelector('.hero-close-btn'));
  document.querySelector('.earnings-hero-backdrop').click(); await tick(); await tick(); await tick();
  assert.equal(document.querySelector('.earnings-hero-backdrop'), null);
  assert.equal(document.activeElement, trigger);
  assert.equal(document.body.classList.contains('earnings-detail-open'), false);
  trigger.dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await tick(); await tick();
  document.activeElement.dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await tick(); await tick(); await tick();
  assert.equal(document.querySelector('.earnings-hero-backdrop'), null);
  await ui.click('刷新日历');
  assert.equal(requests.at(-1).searchParams.get('force'), '1');
  trigger.click(); await tick(); await tick();
  assert.match(document.querySelector('.eps-card').textContent, /\$0\.40/);
  document.querySelector('.hero-close-btn').click(); await tick(); await tick(); await tick();
  assert.ok(refreshTimer);
  refreshTimer(); await tick();
  assert.equal(requests.length, 2, 'Fresh cache avoids polling upstream');
  now += 11 * 60_000;
  refreshTimer(); await tick();
  assert.equal(requests.length, 3, 'Visible stale cache refreshes automatically');
  fail = true;
  await ui.click('刷新日历');
  assert.match(document.querySelector('.earnings-data-status').textContent, /测试断网/);
  assert.match(document.querySelector('.earnings-day-header').textContent, /旧快照/);
  assert.equal(document.querySelectorAll('.earnings-wall-card').length, 1);
  assert.deepEqual(ui.errors, []);
});

test('earnings week switching rejects late responses, including when returning to a cached week', async t => {
  const pending = [];
  const ui = await mount(t, async url => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname !== '/api/earnings/calendar') return { ok: true, json: async () => fixture(url) };
    return new Promise(resolve => pending.push({ weekStart: u.searchParams.get('weekStart'), resolve }));
  });
  await ui.click('新闻资讯');
  [...ui.w.document.querySelectorAll('.news-view-btn')].find(el => el.textContent.includes('财报周历')).click();
  await tick();
  const document = ui.w.document;
  assert.equal(document.querySelectorAll('.earnings-wall-card').length, 0);
  assert.match(document.querySelector('.earnings-data-status').textContent, /正在更新/);
  pending[0].resolve({ ok: true, json: async () => earningsFixture(pending[0].weekStart) }); await tick();
  const weekButton = label => [...document.querySelectorAll('.week-tab-btn')].find(el => el.textContent.includes(label));
  weekButton('下周').click(); await tick();
  assert.equal(document.querySelectorAll('.earnings-wall-card').length, 0, 'Old week cards clear immediately');
  weekButton('本周').click(); await tick();
  assert.equal(pending.length, 2, 'Returning to cached week makes no request');
  assert.match(document.querySelector('.earnings-wall-card').textContent, /PLTR/);
  pending[1].resolve({ ok: true, json: async () => earningsFixture(pending[1].weekStart, 'AAPL') }); await tick();
  assert.match(document.querySelector('.earnings-wall-card').textContent, /PLTR/);
  weekButton('上周').click(); await tick();
  pending[2].resolve({ ok: true, json: async () => ({ ...earningsFixture(pending[2].weekStart), status: 'unavailable', fetchedAt: null, items: [], days: [] }) }); await tick();
  assert.equal(document.querySelectorAll('.earnings-wall-card').length, 0);
  assert.match(document.querySelector('.earnings-data-status').textContent, /数据暂不可用/);
  assert.match(document.querySelector('.subcol-empty-card').textContent, /暂未获取数据/);
  assert.deepEqual(ui.errors, []);
});
async function mount(t, fetchImpl, initStorage = null, configureWindow = null) {
  const errors = [], configs = new Map();
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', e => errors.push(e.message)); virtualConsole.on('error', e => errors.push(String(e)));
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''), { url: 'http://localhost/', runScripts: 'outside-only', virtualConsole });
  t.after(() => dom.window.close()); const w = dom.window;
  w.fetch = fetchImpl; w.parseFlows = parseFlows; w.ResizeObserver = class { observe() {} disconnect() {} };
  w.EventSource = class { constructor() {} close() {} };
  w.requestAnimationFrame = cb => setTimeout(cb, 16);
  w.cancelAnimationFrame = id => clearTimeout(id);
  Object.assign(w, watchlistModel, earningsCalendarModel, inflectionSignals, themeModel, mobileWorkspace, mobileQuoteView, chartDerivedData, whaleSankeyModel);
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get: () => 800 });
  w.echarts = { init: el => ({ setOption: config => configs.set(el.id, config), off() {}, on() {}, resize() {}, dispose() {}, dispatchAction() {} }) };
  w.eval(await fs.readFile(new URL('../node_modules/vue/dist/vue.global.prod.js', import.meta.url), 'utf8'));
  w.bindKlineGestures = () => ({
    focusLatest() {},
    reset() {},
    resetPriceScale() {},
    cancelMotion() {},
    replaceData() {},
    invalidateGeometry() {},
    setInputPolicy() {},
    getInputPolicy() { return 'desktop'; },
    zoomIn() {},
    zoomOut() {},
    attachSeriesProvider() {},
    detachSeriesProvider() {},
    getState() { return { navigation: 'follow-latest', phase: 'idle', priceMode: 'auto' }; },
    dispose() {},
    isFollowingLatest() { return true; }
  });
  if (initStorage) {
    for (const [k, v] of Object.entries(initStorage)) {
      w.localStorage.setItem(k, JSON.stringify(v));
    }
  }
  const appSrc = (await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8'))
    .replace("import { parseFlows } from './flows.js';", 'const parseFlows = window.parseFlows;')
    .replace("import { bindKlineGestures } from './composables/klineGesture.js';", 'const bindKlineGestures = window.bindKlineGestures;')
    .replace("import { createChartDerivedData } from './composables/chartDerivedData.js';", 'const { createChartDerivedData } = window;')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/composables\/whaleSankeyModel\.js';/, 'const { getAssetLabel, formatWhaleCompactUsd, disambiguateWallets, computeWhaleSankeyGraph, buildAggregatedPositions, detectPositionDeltas } = window;')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/watchlist-model\.js';/, 'const { WatchlistManager, sortWatchlistRows, getSelectedExtQuote, getCurrentSession, getNyTime, SESSION_TYPES, MAX_UNIQUE_SYMBOLS, validSymbol, SYMBOL_NAMES, NASDAQ100_STOCKS, SP500_STOCKS, isLeveragedEtf, isCryptoSymbol, STOCK_MARKET_CAPS, getStockMarketCap, sortSymbolsByMarketCap } = window;')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/earnings-calendar-model\.js';/, 'const { AI_SECTOR_FILTERS, CORPORATE_LOGOS, getEarningsCalendarDate, getEarningsWeeks, MACRO_CALENDAR_ITEMS, filterEarningsByDay, parseMetricNumber, getMetricSurprise, getMetricYoy } = window;')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/inflection-signals\.js';/, 'const { computeInflectionSignals, formatSignalMarkers, dema } = window;')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/theme-model\.js';/, 'const { VALID_PALETTES, VALID_THEMES, DEFAULT_PALETTE, DEFAULT_THEME, normalizePalette, normalizeTheme, applyThemeToDOM, readChartTokens } = window;')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/mobile-workspace\.js';/, 'const { isPhone, isCompact, getRecentSymbols, addRecentSymbol, clearRecentSymbols, createHistoryState, captureViewState, getViewState, clearViewState, lockBodyScroll, unlockBodyScroll } = window;')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/mobile-quote-view\.js';/, 'const { toMobileQuoteView, formatSessionLabel } = window;');
  if (configureWindow) configureWindow(w);
  w.eval(appSrc);
  await tick();
  const button = text => [...w.document.querySelectorAll('button')].find(el => el.textContent.trim() === text || el.textContent.trim().endsWith(text));
  const click = async text => { const el = button(text); assert.ok(el, `Missing button ${text}`); el.click(); await tick(); };
  return { w, configs, errors, click };
}
const q = { symbol: 'NVDA', name: 'NVIDIA', sector: '科技', price: 100, changePercent: 2, turnover: 10000, asOf: '2026-10-21T20:00:00Z' };
const fixture = url => {
  const u = new URL(url, 'http://localhost');
  if (u.pathname.endsWith('overview')) return { benchmarks: [{ ...q, symbol: 'SPY' }], stocks: [q], sectors: [{ ...q, symbol: 'XLK' }], unavailable: [], note: 'Fixture for automated tests only' };
  if (u.pathname === '/api/news') return { symbol: u.searchParams.get('symbol'), fetchedAt: '2026-10-22T00:00:00Z', unavailable: [], items: [{ title: 'A test headline', url: 'https://example.com', source: 'Test', publishedAt: '2026-10-21T21:00:00Z' }] };
  if (u.pathname.endsWith('chart')) return { ...q, symbol: u.searchParams.get('symbol'), currency: 'USD', range: u.searchParams.get('range'), bars: [{ time: 1792612800, open: 99, close: 100, low: 98, high: 101, volume: 1000 }] };
  if (u.pathname === '/api/crypto') return { items: [{ symbol: 'BTC-USD', code: 'BTC', name: 'Bitcoin 比特币', price: 68000, changePercent: 1.5, marketCap: '1.3T', vol24h: '30B', high24h: 69000, low24h: 67000 }] };
  if (u.pathname === '/api/crypto/whales') {
    return {
      ok: true,
      isLive: true,
      source: 'hyperliquid-api',
      fetchedAt: new Date().toISOString(),
      aggregate: {
        totalTrackedWhales: 2,
        totalEquity: 50000000,
        totalOI: 150000000,
        totalLongNotional: 50000000,
        totalShortNotional: 100000000,
        longRatio: 33.3,
        shortRatio: 66.7,
        sentiment: '巨鲸显著看空 BEARISH',
        sentimentColor: 'short',
        topCoins: [{ coin: 'BTC', totalNtl: 100000000, longPct: 40, shortPct: 60 }]
      },
      whales: [
        {
          address: '0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00',
          shortAddress: '0xecb6...2b00',
          name: 'HL 亿级多空对冲巨鲸',
          tag: '机构级对冲基金',
          avatar: '🐋',
          accountValue: 43000000,
          totalNtlPos: 124000000,
          netExposure: -25000000,
          netBiasLabel: '净空',
          positions: [
            {
              coin: 'ETH',
              chartSymbol: 'ETH-USD',
              side: 'SHORT',
              sideLabel: '做空',
              isLong: false,
              size: 13685,
              entryPx: 2328.55,
              markPx: 2330.1,
              positionValue: 31800000,
              unrealizedPnl: 185000,
              roePct: 12.5,
              leverage: 10,
              leverageType: '全仓',
              leverageLabel: '10x 全仓',
              liquidationPx: 4850,
              liqDistancePct: 108.2
            },
            {
              coin: 'BTC',
              chartSymbol: 'BTC-USD',
              side: 'LONG',
              sideLabel: '做多',
              isLong: true,
              size: 88.2,
              entryPx: 78550,
              markPx: 78600,
              positionValue: 6930000,
              unrealizedPnl: 24500,
              roePct: 7.1,
              leverage: 20,
              leverageType: '全仓',
              leverageLabel: '20x 全仓',
              liquidationPx: 54200,
              liqDistancePct: 31.0
            }
          ]
        },
        {
          address: '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be',
          shortAddress: '0x3f5c...f0be',
          name: 'SOL 高频套利巨鲸',
          tag: '高频量化',
          avatar: '⚡',
          accountValue: 19500000,
          totalNtlPos: 18700000,
          netExposure: 10300000,
          netBiasLabel: '净多',
          positions: [
            {
              coin: 'SOL',
              chartSymbol: 'SOL-USD',
              side: 'LONG',
              sideLabel: '做多',
              isLong: true,
              size: 102112,
              entryPx: 138.4,
              markPx: 142.0,
              positionValue: 14500000,
              unrealizedPnl: 367600,
              roePct: 18.2,
              leverage: 10,
              leverageType: '全仓',
              leverageLabel: '10x 全仓',
              liquidationPx: 112.0,
              liqDistancePct: 21.1
            },
            {
              coin: 'BTC',
              chartSymbol: 'BTC-USD',
              side: 'SHORT',
              sideLabel: '做空',
              isLong: false,
              size: 53.4,
              entryPx: 79100,
              markPx: 78600,
              positionValue: 4200000,
              unrealizedPnl: 26700,
              roePct: 6.4,
              leverage: 10,
              leverageType: '全仓',
              leverageLabel: '10x 全仓',
              liquidationPx: 92000,
              liqDistancePct: 17.0
            }
          ]
        }
      ],
      activityLogs: [
        {
          id: 'log-1',
          timeAgo: '12分钟前',
          whaleName: 'HL 亿级多空对冲巨鲸',
          whaleAddress: '0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00',
          shortAddress: '0xecb6...2b00',
          action: '开仓做空',
          isLong: false,
          coin: 'ETH',
          chartSymbol: 'ETH-USD',
          amountText: '13,685 ETH',
          valueText: '$31.8M',
          leverageText: '10x',
          entryPx: 2328.55,
          pnlText: '+$185,000'
        }
      ]
    };
  }
  if (u.pathname === '/api/crypto/onchain-stocks') {
    return {
      ok: true,
      provider: 'On-Chain DEX & RWA Aggregator',
      aggregate: {
        totalTrackedCount: 10,
        totalVolume24h: 268500000,
        totalNetFlow24h: 38200000,
        overallBuyRatio: 57.1,
        overallSellRatio: 42.9,
        overallSentiment: '多头净流入 BULLISH INFLOW',
        sentimentClass: 'bullish',
        topInflowSymbol: 'NVDA (+$18.4M)',
        maxPremiumSymbol: 'TSLA (+1.13%)'
      },
      top10: [
        {
          rank: 1,
          symbol: 'NVDA',
          name: '英伟达',
          protocol: 'Hyperliquid Perp / Backed',
          network: 'Hyperliquid L1',
          price: 148.5,
          changePercent: 3.42,
          tradFiClose: 147.8,
          premiumPct: 0.47,
          volume24h: 64820000,
          inflow24h: 41614440,
          outflow24h: 23205560,
          netFlow: 18408880,
          buyRatio: 64.2,
          sellRatio: 35.8,
          openInterest: 38500000,
          turnoverRate: 16.8,
          chartSymbol: 'NVDA'
        }
      ]
    };
  }
  if (u.pathname === '/api/options') return { symbol: 'SPY', spot: 100, expiration: '2026-10-23', expirations: ['2026-10-23'], callWall: [105], putWall: [95], callOi: 100, putOi: 50, putCallRatio: .5, netGex: 10000, missingOi: 0, missingGamma: 0, contracts: 2, rows: [{ strike: 105, callOi: 100, putOi: 50, callGex: 20000, putGex: -10000 }], asOf: '2026-10-22 00:00:00' };
  if (u.pathname.includes('/watchlist/quotes')) return {
    quotes: {
      NVDA: {
        symbol: 'NVDA',
        name: 'NVIDIA',
        regular: { price: 100, changePercent: 2, volume: 1000000 },
        pre: { price: 96.5, changePercent: -3.5, volume: 200000 },
        overnight: { price: 104.2, changePercent: 4.2, volume: 150000 },
        post: { price: 102, changePercent: 2, volume: 180000 },
        meta: { status: 'active', delayStatus: 'realtime' }
      }
    },
    session: { session: 'regular', desc: '常规交易' },
    provider: { isConfigured: false, name: 'Longbridge' }
  };
};

test('AI news UI sends the typed query and controls through HTTP to the real search service', async t => {
  const providerQueries = [], requests = [];
  const service = new AiSearchService({ keys: { tavily: 'test', exa: '', firecrawl: '' }, enableLiveFeeds: false, fetchImpl: async (_, options) => {
    providerQueries.push(JSON.parse(options.body).query);
    return new Response(JSON.stringify({ results: [{ title: 'Nvidia earnings demand improves', url: 'https://reuters.com/markets/nvidia-earnings', published_date: new Date().toISOString(), content: 'Nvidia earnings and demand' }] }));
  } });
  const server = createServer({ aiSearchService: service, workspace: {}, quoteService: {}, watchlist: async () => [] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const ui = await mount(t, async (url, options) => {
    if (url.startsWith('/api/news/ai-search')) {
      requests.push(new URL(url, 'http://localhost'));
      // Bridge jsdom's signal into Node's native fetch realm.
      const controller = new AbortController();
      if (options?.signal?.aborted) controller.abort();
      else options?.signal?.addEventListener('abort', () => controller.abort(), { once: true });
      return fetch(`http://127.0.0.1:${server.address().port}${url}`, { signal: controller.signal });
    }
    return { ok: true, json: async () => fixture(url) };
  });
  await ui.click('新闻资讯'); ui.w.document.querySelectorAll('.news-view-btn')[1].click(); await tick();
  const input = ui.w.document.querySelector('[aria-label="财经新闻搜索词"]');
  input.value = 'NVDA earnings'; input.dispatchEvent(new ui.w.Event('input', { bubbles: true }));
  input.form.dispatchEvent(new ui.w.Event('submit', { bubbles: true, cancelable: true })); await tick(); await tick();
  assert.equal(requests.at(-1).searchParams.get('query'), 'NVDA earnings');
  assert.ok(providerQueries.length, ui.w.document.querySelector('.ai-search-error-box')?.textContent || 'Provider was not reached');
  assert.match(providerQueries.at(-1), /NVDA earnings/);
  assert.match(ui.w.document.querySelector('.ai-news-card').textContent, /Nvidia earnings/);
  const range = ui.w.document.querySelector('[aria-label="新闻时间范围"]');
  range.value = 'week'; range.dispatchEvent(new ui.w.Event('change', { bubbles: true })); await tick(); await tick();
  const sort = ui.w.document.querySelector('[aria-label="新闻排序"]');
  sort.value = 'relevance'; sort.dispatchEvent(new ui.w.Event('change', { bubbles: true })); await tick(); await tick();
  assert.equal(requests.at(-1).searchParams.get('timeRange'), 'week');
  assert.equal(requests.at(-1).searchParams.get('sort'), 'relevance');
  assert.match(ui.w.document.querySelector('.ai-search-telemetry-strip').textContent, /相关性优先/);
  assert.match(ui.w.document.querySelector('.ai-engines-status-pills').textContent, /未配置/);
  assert.deepEqual(ui.errors, []);
});

test('AI news rejects late responses and preserves server relevance order and honest date labels', async t => {
  let releaseOld;
  const result = query => ({ ok: true, query, items: [{ id: query, title: query, url: 'https://example.com/news', publishedAt: null }, { id: 'recent', title: 'SECOND ITEM', url: 'https://example.com/new', publishedAt: new Date().toISOString() }], sortOrder: 'relevance_desc', engineErrors: [{ engine: 'Exa', error: '请求频率受限' }] });
  const ui = await mount(t, async url => {
    if (url.startsWith('/api/news/ai-search')) {
      const query = new URL(url, 'http://localhost').searchParams.get('query');
      if (query === 'US stock market') return new Promise(resolve => { releaseOld = () => resolve({ ok: true, json: async () => result('OLD RESULT') }); });
      return { ok: true, json: async () => result(query) };
    }
    return { ok: true, json: async () => fixture(url) };
  });
  await ui.click('新闻资讯'); ui.w.document.querySelectorAll('.news-view-btn')[1].click(); await tick();
  await ui.click('通胀与物价');
  releaseOld(); await tick();
  const cards = [...ui.w.document.querySelectorAll('.ai-card-title')];
  assert.equal(cards[0].textContent, '美国通胀');
  assert.equal(cards[1].textContent, 'SECOND ITEM');
  assert.doesNotMatch(ui.w.document.querySelector('main').textContent, /OLD RESULT/);
  assert.match(ui.w.document.querySelector('.ai-time-tag').textContent, /发布时间不明/);
  assert.match(ui.w.document.querySelector('.ai-search-notice').textContent, /请求频率受限/);
  assert.deepEqual(ui.errors, []);
});

test('AI automatic refresh pauses on hidden pages, uses submitted query and stages results until accepted', async t => {
  const timers = new Map(); let timerId = 100000, now = Date.now(), hidden = false, searches = 0;
  const queries = [];
  const ui = await mount(t, async url => {
    if (url.startsWith('/api/news/ai-search')) {
      searches++; queries.push(new URL(url, 'http://localhost').searchParams.get('query'));
      return { ok: true, json: async () => ({ query: queries.at(-1), items: [{ id: String(searches), title: `NEWS VERSION ${searches}`, url: 'https://example.com/story' }] }) };
    }
    return { ok: true, json: async () => fixture(url) };
  }, null, w => {
    Object.defineProperty(w.document, 'hidden', { get: () => hidden });
    w.Date.now = () => now;
    const realSet = w.setTimeout.bind(w), realClear = w.clearTimeout.bind(w);
    w.setTimeout = (fn, ms, ...args) => { if (ms >= 1000 && ms <= 300000) { const id = ++timerId; timers.set(id, { fn, ms }); return id; } return realSet(fn, ms, ...args); };
    w.clearTimeout = id => { timers.delete(id); realClear(id); };
  });
  await ui.click('新闻资讯'); ui.w.document.querySelectorAll('.news-view-btn')[1].click(); await tick();
  const auto = [...ui.w.document.querySelectorAll('.ai-search-options input')].find(el => el.parentElement.textContent.includes('每 5 分钟'));
  auto.click(); await tick();
  assert.ok([...timers.values()].some(t => t.ms === 300000));
  hidden = true; ui.w.document.dispatchEvent(new ui.w.Event('visibilitychange')); await tick();
  assert.equal([...timers.values()].filter(t => t.ms === 300000).length, 0);
  hidden = false; ui.w.document.dispatchEvent(new ui.w.Event('visibilitychange')); await tick();
  const input = ui.w.document.querySelector('[aria-label="财经新闻搜索词"]');
  input.value = 'UNSUBMITTED DRAFT'; input.dispatchEvent(new ui.w.Event('input', { bubbles: true }));
  now += 300000;
  const entry = [...timers.entries()].find(([, value]) => value.ms === 300000); timers.delete(entry[0]); entry[1].fn(); await tick();
  assert.equal(queries.at(-1), 'US stock market');
  assert.match(ui.w.document.querySelector('.ai-card-title').textContent, /VERSION 1/);
  await ui.click('显示更新结果');
  assert.match(ui.w.document.querySelector('.ai-card-title').textContent, /VERSION 2/);
  await ui.click('数据与说明');
  assert.equal([...timers.values()].filter(t => t.ms === 300000).length, 0);
  assert.deepEqual(ui.errors, []);
});
test('Vue page mounts, navigates all modules, wires chart data and handles watchlist', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));
  assert.ok(ui.w.document.querySelector('#heatmap-chart')); assert.ok(ui.configs.get('heatmap-chart').series[0].data.length > 0);
  await ui.click('个股行情'); assert.equal(ui.configs.get('price-chart').series[0].data[0][1], 100);
  const search = ui.w.document.querySelector('[aria-label="搜索美股代码"]'); search.value = 'BABA'; search.dispatchEvent(new ui.w.Event('input', { bubbles: true })); await tick(); search.form.dispatchEvent(new ui.w.Event('submit', { bubbles: true, cancelable: true })); await tick(); await tick();
  assert.match(ui.w.document.querySelector('main h2').textContent, /BABA/); await ui.click('+ 加入自选'); assert.ok(JSON.parse(ui.w.localStorage.getItem('market-desk-watchlist')).includes('BABA'));
  const lightAxis = ui.configs.get('price-chart').yAxis[0].axisLine.lineStyle.color;
  await ui.click('Dark');
  assert.ok(ui.w.document.documentElement.classList.contains('dark'));
  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-theme')), 'dark');
  assert.notEqual(ui.configs.get('price-chart').yAxis[0].axisLine.lineStyle.color, lightAxis);
  assert.match(ui.w.document.querySelector('main h2').textContent, /BABA/);
  await ui.click('Light');
  assert.equal(ui.w.document.documentElement.classList.contains('dark'), false);
  await ui.click('自选看板');
  assert.ok(ui.w.document.querySelector('.watchlist-table'));
  assert.ok(ui.w.document.querySelector('.watchlist-toolbar'));
  await ui.click('全部排行');
  assert.ok(ui.w.document.querySelector('.watchlist-table'));
  await ui.click('分组视图');
  assert.ok(ui.w.document.querySelector('.watchlist-table'));
  await ui.click('资金观察'); assert.ok(ui.configs.has('rotation-chart')); await ui.click('ETF 净申赎'); assert.match(ui.w.document.querySelector('main').textContent, /接入你有来源/);
  await ui.click('期权墙'); assert.ok(ui.configs.has('options-chart')); await ui.click('估算 GEX'); assert.equal(ui.configs.get('options-chart').series[1].data[0], -10000);
  await ui.click('新闻资讯'); assert.match(ui.w.document.querySelector('.news-card').textContent, /A test headline/);
  await ui.click('数据与说明'); assert.match(ui.w.document.querySelector('.documentation').textContent, /G\|Flows/);
  ui.w.innerWidth = 390; ui.w.dispatchEvent(new ui.w.Event('resize')); await tick();
  ui.w.document.querySelector('.settings-trigger').click(); await tick();
  assert.ok(ui.w.document.querySelector('.sidebar').classList.contains('show-mobile'));
  assert.equal(ui.w.document.querySelector('.sidebar').getAttribute('aria-modal'), 'true');
  ui.w.document.querySelector('.sidebar').dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick();
  assert.equal(ui.w.document.querySelector('.sidebar').classList.contains('show-mobile'), false);
  assert.equal(ui.w.document.activeElement, ui.w.document.querySelector('.settings-trigger'));
  assert.deepEqual(ui.errors, []);
});
test('out-of-order responses do not place an old ticker beneath a new heading', async t => {
  let resolveOld;
  const ui = await mount(t, async url => {
    if (url.includes('/chart') && url.includes('symbol=SPY')) return new Promise(resolve => { resolveOld = () => resolve({ ok: true, json: async () => ({ ...fixture(url), name: 'OLD SPY RESPONSE' }) }); });
    return { ok: true, json: async () => fixture(url) };
  });
  await ui.click('个股行情');
  const input = ui.w.document.querySelector('[aria-label="搜索美股代码"]'); input.value = 'NVDA'; input.dispatchEvent(new ui.w.Event('input', { bubbles: true })); input.form.dispatchEvent(new ui.w.Event('submit', { bubbles: true, cancelable: true })); await tick();
  resolveOld(); await tick();
  const text = ui.w.document.querySelector('main').textContent; assert.match(text, /NVDA/); assert.doesNotMatch(text, /OLD SPY RESPONSE/); assert.deepEqual(ui.errors, []);
});
test('network failure renders a recoverable error with no fabricated quote cards', async t => {
  const ui = await mount(t, async () => ({ ok: false, json: async () => ({ error: 'Source offline' }) }));
  assert.match(ui.w.document.querySelector('.error-box').textContent, /Source offline/); assert.equal(ui.w.document.querySelectorAll('.index-card').length, 0); assert.deepEqual(ui.errors, []);
});

test('K-line color schemes: defaults to classic (图一), switches to neon (图二) and cyberpunk (图三), adapts day/night backgrounds and persists in settings', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));
  await ui.click('个股行情');
  
  // 1. Initial default state: Classic (图一: #10B981 up, #F43F5E down)
  let chartCfg = ui.configs.get('price-chart');
  assert.ok(chartCfg, 'Price chart config exists');
  assert.equal(chartCfg.backgroundColor, '#FFFFFF', 'Day mode has pure white #FFFFFF background');
  assert.equal(chartCfg.series[0].itemStyle.color, '#10B981', 'Default up color is classic green #10B981');
  assert.equal(chartCfg.series[0].itemStyle.color0, '#F43F5E', 'Default down color is classic red #F43F5E');
  assert.equal(chartCfg.series[6].data[0].itemStyle.color, 'rgba(16, 185, 129, 0.75)', 'Day volume color is classic green with 0.75 alpha');
  assert.equal(chartCfg.xAxis[0].splitLine.show, true, 'X axis grid lines visible');
  assert.equal(chartCfg.yAxis[0].splitLine.show, true, 'Y axis grid lines visible');

  // 2. Day / Night mode adaptation: Dark mode has pure black #000000 background
  await ui.click('Dark');
  chartCfg = ui.configs.get('price-chart');
  assert.equal(chartCfg.backgroundColor, '#000000', 'Dark mode has pure deep black #000000 background');
  assert.ok(chartCfg.xAxis[0].splitLine.lineStyle.color.includes('255'), 'Dark mode grid is subtle light grey');
  assert.equal(chartCfg.series[6].data[0].itemStyle.color, 'rgba(16, 185, 129, 0.65)', 'Dark volume color is classic green with 0.65 alpha');

  // 3. Switch to neon (图二: #7CE138 up, #FF4D82 down)
  await ui.click('亮绿玫粉');
  chartCfg = ui.configs.get('price-chart');
  assert.equal(chartCfg.series[0].itemStyle.color, '#7CE138', 'Style 2 up color is neon lime #7CE138');
  assert.equal(chartCfg.series[0].itemStyle.color0, '#FF4D82', 'Style 2 down color is rose pink #FF4D82');
  assert.equal(chartCfg.series[6].data[0].itemStyle.color, 'rgba(124, 225, 56, 0.65)', 'Volume series matches neon lime #7CE138');
  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-kline-scheme')), 'neon');

  // 4. Switch to cyberpunk (图三: #00D2FF up, #FF3377 down)
  await ui.click('青蓝品红');
  chartCfg = ui.configs.get('price-chart');
  assert.equal(chartCfg.series[0].itemStyle.color, '#00D2FF', 'Style 3 up color is electric cyan #00D2FF');
  assert.equal(chartCfg.series[0].itemStyle.color0, '#FF3377', 'Style 3 down color is electric pink #FF3377');
  assert.equal(chartCfg.series[6].data[0].itemStyle.color, 'rgba(0, 210, 255, 0.65)', 'Volume series matches cyberpunk cyan #00D2FF');
  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-kline-scheme')), 'cyberpunk');

  // 5. Open Preferences Modal
  const settingsBtn = ui.w.document.querySelector('.settings-modal-btn');
  assert.ok(settingsBtn, 'Settings modal button exists in topbar');
  settingsBtn.click();
  await tick();
  const modal = ui.w.document.querySelector('.preferences-modal-backdrop');
  assert.ok(modal, 'Preferences modal opens');
  assert.match(modal.textContent, /工作台与图表偏好设置/);
  assert.match(modal.textContent, /经典绿红/);
  assert.match(modal.textContent, /荧光极光/);
  assert.match(modal.textContent, /赛博霓虹/);

  // Switch back to classic in modal
  const classicCard = modal.querySelector('.preview-classic').closest('.kline-scheme-card');
  assert.ok(classicCard, 'Classic card found in modal');
  classicCard.click();
  await tick();
  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-kline-scheme')), 'classic');
  chartCfg = ui.configs.get('price-chart');
  assert.equal(chartCfg.series[0].itemStyle.color, '#10B981', 'Reverted to classic green');

  // Verify Deep Blue-Purple (Demo Options Center) scheme is selectable & obsidian is removed
  const deepCard = modal.querySelector('.preview-deepbluepurple').closest('.kline-scheme-card');
  assert.ok(deepCard, 'Deep blue-purple card found in modal');
  deepCard.click();
  await tick();
  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-kline-scheme')), 'deepbluepurple');
  chartCfg = ui.configs.get('price-chart');
  assert.equal(chartCfg.series[0].itemStyle.color, '#2563EB', 'Deep blue-purple up color is #2563EB');
  assert.equal(chartCfg.series[0].itemStyle.color0, '#7C3AED', 'Deep blue-purple down color is #7C3AED');
  assert.equal(ui.w.document.querySelector('.preview-obsidian'), null, 'Obsidian scheme is removed from modal');

  // Revert back to classic
  classicCard.click();
  await tick();

  // Close modal via finish button
  modal.querySelector('.pref-confirm-btn').click();
  await tick();
  assert.equal(ui.w.document.querySelector('.preferences-modal-backdrop'), null, 'Modal closes');

  assert.deepEqual(ui.errors, []);
});

test('K-line MA switches: clicking MA5/MA20 toggles visibility in readout strip and preferences modal, and persists to localStorage', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));
  await ui.click('个股行情');
  await tick();

  const maButtons = [...ui.w.document.querySelectorAll('.ma-switch-btn')];
  assert.equal(maButtons.length, 6, 'Should render 6 switches: MA5, MA20, MA60, MA120, MA250, VOL');

  const ma5Btn = maButtons.find(b => b.classList.contains('ma5'));
  assert.ok(ma5Btn, 'MA5 switch button exists');
  assert.ok(ma5Btn.classList.contains('is-active'));

  // Click MA5 to turn off
  ma5Btn.click();
  await tick();
  assert.ok(ma5Btn.classList.contains('is-off'), 'MA5 switch button turns off');
  const stored = JSON.parse(ui.w.localStorage.getItem('market-desk-ma-visibility'));
  assert.equal(stored.ma5, false);

  // Click MA5 to turn back on
  ma5Btn.click();
  await tick();
  assert.ok(ma5Btn.classList.contains('is-active'), 'MA5 switch button turns back on');
  const storedAfter = JSON.parse(ui.w.localStorage.getItem('market-desk-ma-visibility'));
  assert.equal(storedAfter.ma5, true);
});

test('Default launch page preference: configurable in modal, persists to localStorage, and controls initial landing page', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));
  
  // 1. Initial page defaults to overview
  assert.ok(ui.w.document.querySelector('#heatmap-chart'), 'Default landing page is overview');

  // 2. Open preferences modal
  const settingsBtn = ui.w.document.querySelector('.settings-modal-btn') || [...ui.w.document.querySelectorAll('button')].find(b => b.textContent.includes('设置'));
  assert.ok(settingsBtn, 'Settings button found');
  settingsBtn.click();
  await tick();

  const modal = ui.w.document.querySelector('.preferences-modal-backdrop');
  assert.ok(modal, 'Preferences modal opened');
  assert.match(modal.textContent, /默认打开页面/);

  // 3. Select '自选看板' as default launch page
  const pageCards = [...modal.querySelectorAll('.pref-default-page-card')];
  assert.ok(pageCards.length >= 7, 'Has default page option cards');
  const watchlistCard = pageCards.find(c => c.textContent.includes('自选看板'));
  assert.ok(watchlistCard, 'Watchlist default page card found');
  watchlistCard.click();
  await tick();

  // Verify persistence
  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-default-page')), 'watchlist');
  assert.ok(watchlistCard.classList.contains('active'), 'Watchlist card is active');

  // 4. Verify mounting a new instance with saved preference loads watchlist as default
  const ui2 = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }), {
    'market-desk-default-page': 'watchlist'
  });
  assert.ok(ui2.w.document.querySelector('.watchlist-table'), 'Mounts directly to watchlist board');
});

test('Heatmap: strictly displays regular trading hours (正常开盘交易时段) data without session switcher', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));
  await tick();

  // 1. Session selectors must NOT be displayed per user specification
  const sessionSelect = ui.w.document.querySelector('[aria-label="热力图交易时段"]');
  assert.equal(sessionSelect, null, 'Heatmap session select dropdown is removed from DOM');
  const quickPills = ui.w.document.querySelector('.heatmap-session-quick-pills');
  assert.equal(quickPills, null, 'Heatmap quick session pills are removed from DOM');

  const getNvdaTile = () => {
    const cfg = ui.configs.get('heatmap-chart');
    return cfg?.series?.[0]?.data?.find(d => d.name === 'NVDA');
  };

  // 2. Heatmap strictly reflects regular trading hours quotes (NVDA regular price 100, +2%)
  const nvda = getNvdaTile();
  assert.ok(nvda, 'NVDA tile exists in heatmap');
  assert.equal(nvda.quote.price, 100);
  assert.equal(nvda.quote.changePercent, 2);
  assert.equal(nvda.quote.sessionKey, 'regular');
  assert.equal(nvda.quote.sessionLabel, '常规');

  // 3. Verify all overview cards across Row 1 and Row 2 have consistent 3-part layout (head, price, foot)
  const allCards = [...ui.w.document.querySelectorAll('.index-grid .index-card')];
  assert.ok(allCards.length > 0, 'Overview renders benchmark & macro cards');
  for (const card of allCards) {
    assert.ok(card.querySelector('.index-card-head'), 'Card has header');
    assert.ok(card.querySelector('.index-price-row'), 'Card has price row');
    assert.ok(card.querySelector('.index-card-foot'), 'Card has foot row');
    assert.equal(card.children.length, 3, 'Card has exactly 3 lines of content without extra height rows');
  }

  // 4. Verify Heatmap strictly displays US stocks, excluding crypto and leveraged ETFs
  const heatmapData = ui.configs.get('heatmap-chart')?.series?.[0]?.data || [];
  const heatmapSymbols = heatmapData.map(d => d.name);
  assert.equal(heatmapSymbols.includes('BTC-USD'), false, 'BTC-USD must be excluded from heatmap');
  assert.equal(heatmapSymbols.includes('ETH-USD'), false, 'ETH-USD must be excluded from heatmap');
  assert.equal(heatmapSymbols.includes('SOXL'), false, 'SOXL must be excluded from heatmap');

  const heatmapToolbar = ui.w.document.querySelector('.heatmap-toolbar');
  assert.ok(heatmapToolbar, 'Heatmap toolbar exists');
  assert.equal(heatmapToolbar.textContent.includes('加密货币'), false, 'Heatmap toolbar must not have 加密货币 tab');

  const scopeSelect = ui.w.document.querySelector('.heatmap-scope-control select');
  assert.ok(scopeSelect, 'Heatmap scope select exists');
  assert.match(scopeSelect.textContent, /已剔除杠杆ETF与加密货币/);

  assert.deepEqual(ui.errors, []);
});

test('Heatmap tiles: displays only change% and volume centered in 2 rows, removes price/PE/inflow, and gives Rank #1 badge only to top turnover stock', async t => {
  const stockNvda = { symbol: 'NVDA', name: 'NVIDIA', sector: '科技', price: 123.45, changePercent: 2.5, turnover: 50000000, asOf: '2026-10-21T20:00:00Z' };
  const stockMu = { symbol: 'MU', name: 'Micron', sector: '科技', price: 87.65, changePercent: -3.2, turnover: 20000000, asOf: '2026-10-21T20:00:00Z' };
  const stockAmd = { symbol: 'AMD', name: 'AMD', sector: '科技', price: 145.67, changePercent: -1.5, turnover: 30000000, asOf: '2026-10-21T20:00:00Z' };

  const customFixture = url => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.includes('/watchlist/quotes')) {
      return {
        quotes: {
          NVDA: {
            symbol: 'NVDA',
            name: 'NVIDIA',
            regular: { price: 100, changePercent: 2, volume: 300000000 }
          }
        },
        session: { session: 'regular', desc: '常规交易' }
      };
    }
    if (u.pathname.endsWith('overview')) {
      return {
        benchmarks: [{ ...stockNvda, symbol: 'SPY' }],
        stocks: [stockNvda, stockMu, stockAmd],
        sectors: [{ ...stockNvda, symbol: 'XLK' }],
        unavailable: [],
        note: 'Fixture for automated tests'
      };
    }
    return fixture(url);
  };

  const ui = await mount(t, async url => ({ ok: true, json: async () => customFixture(url) }), {
    'market-desk-heatmap-scope': 'watchlist',
    'market-desk-watchlist-v2': { groups: [{ id: 'default', name: '默认', symbolIds: ['NVDA', 'MU', 'AMD'] }] }
  });
  await tick();

  // Verify 'core' (精选样本) option is completely removed
  const coreOption = ui.w.document.querySelector('option[value="core"]');
  assert.equal(coreOption, null, '精选样本 (core) option is removed from DOM');
  assert.equal(ui.w.NASDAQ100_STOCKS.length, 101, 'Nasdaq 100 contains full 101 constituent listings');

  const cfg = ui.configs.get('heatmap-chart');
  assert.ok(cfg, 'Heatmap chart initialized');
  const series = cfg.series[0];
  const formatter = series.label.formatter;
  const rich = series.label.rich;

  // 1. Verify rich styles & label positions: top tags/badges placed at top-left, sym/pct/vol centered
  assert.equal(series.label.position, 'insideTopLeft');
  assert.equal(rich.top.align, 'left');
  assert.equal(rich.sym.align, 'center');
  assert.equal(rich.pct.align, 'center');
  assert.equal(rich.vol.align, 'center');

  const nvdaTile = series.data.find(d => d.name === 'NVDA');
  const muTile = series.data.find(d => d.name === 'MU');
  const amdTile = series.data.find(d => d.name === 'AMD');
  assert.ok(nvdaTile && muTile && amdTile);

  const nvdaLabel = formatter({ data: nvdaTile });
  const muLabel = formatter({ data: muTile });
  const amdLabel = formatter({ data: amdTile });

  // 2. NVDA has highest turnover ($50M), so NVDA gets Rank #1 badge directly above ticker symbol
  const nvdaLines = nvdaLabel.split('\n');
  assert.doesNotMatch(nvdaLines[0], /Rank #1/, 'First line has only the top sector tag, not Rank #1');
  assert.equal(nvdaLines[1], '{rank|Rank #1 资金热度}', 'Rank #1 badge is placed directly above symbol');
  assert.equal(nvdaLines[2], '{sym|NVDA}', 'Symbol is directly below Rank #1 badge');
  assert.doesNotMatch(muLabel, /\{rank\|Rank #1 资金热度\}/, 'MU does NOT have Rank #1 badge when turnover is not #1');
  assert.match(muLabel, /\{badge\|存储芯片\}/, 'MU falls back to standard subtag');

  // 3. All tiles display only symbol, change percentage (row 1, no plus sign for positive) and volume (row 2, no 成交 word)
  for (const [tile, label] of [[nvdaTile, nvdaLabel], [muTile, muLabel], [amdTile, amdLabel]]) {
    assert.match(label, new RegExp(`\\{sym\\|${tile.name}\\}`));
    assert.match(label, /\{pct\|-?\d+\.\d{2}%\}/);
    assert.doesNotMatch(label, /\{pct\|\+/);
    assert.match(label, /\{vol\|\$[\d\w.]+\}/);
    assert.doesNotMatch(label, /\{vol\|成交/);

    // No stock price (e.g. $123.45, $87.65, $145.67)
    assert.doesNotMatch(label, /\$123\.45/);
    assert.doesNotMatch(label, /\$87\.65/);
    assert.doesNotMatch(label, /\$145\.67/);

    // No PE or net inflow
    assert.doesNotMatch(label, /PE:/);
    assert.doesNotMatch(label, /净流入/);
  }

  assert.deepEqual(ui.errors, []);
});

test('Watchlist card layout (自选 search, group pills, 常规/延长 switcher, 股票 | 收盘价 | Chg% in-group sorting, stacked EXT%, and mobile Moon/Sunrise icons)', async t => {
  const customWatchlistFixture = url => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.includes('/watchlist/quotes')) {
      return {
        quotes: {
          SNDK: {
            symbol: 'SNDK',
            name: 'SanDisk Corporation',
            regular: { price: 1300, changePercent: 4.0 },
            pre: { price: 1222, changePercent: -6.0 },
            overnight: { price: null, changePercent: null },
            post: { price: null, changePercent: null },
            meta: { status: 'active', delayStatus: 'realtime' }
          },
          MU: {
            symbol: 'MU',
            name: 'Micron Technology',
            regular: { price: 960, changePercent: -1.8 },
            pre: { price: null, changePercent: null },
            overnight: { price: 985, changePercent: 2.6 },
            post: { price: null, changePercent: null },
            meta: { status: 'active', delayStatus: 'realtime' }
          },
          SKHY: {
            symbol: 'SKHY',
            name: 'SK hynix Inc.',
            regular: { price: 162, changePercent: 8.5 },
            pre: { price: 160, changePercent: -1.2 },
            overnight: { price: null, changePercent: null },
            post: { price: null, changePercent: null },
            meta: { status: 'active', delayStatus: 'realtime' }
          },
          KXIAY: {
            symbol: 'KXIAY',
            name: 'Kioxia Holdings',
            regular: { price: 7.51, changePercent: -17.11 },
            pre: { price: null, changePercent: null },
            overnight: { price: null, changePercent: null },
            post: { price: null, changePercent: null },
            meta: { status: 'active', delayStatus: 'realtime' }
          }
        },
        session: { session: 'pre', desc: '盘前交易' },
        provider: { isConfigured: false, name: 'Longbridge' }
      };
    }
    return fixture(url);
  };

  const ui = await mount(t, async url => ({ ok: true, json: async () => customWatchlistFixture(url) }));
  await tick();
  await tick();

  const rwSidebar = ui.w.document.querySelector('.right-watchlist-sidebar');
  assert.ok(rwSidebar, 'Right watchlist sidebar is rendered');

  // 1. Verify search input, group filter pills, and time/session bar
  const searchInput = rwSidebar.querySelector('.rw-search-input');
  assert.ok(searchInput, 'Search input exists');
  assert.equal(searchInput.getAttribute('placeholder'), '搜索股票代码或名称');

  const pillsBar = rwSidebar.querySelector('.rw-group-pills-bar');
  assert.ok(pillsBar, 'Group filter pills bar exists');
  assert.match(pillsBar.textContent, /芯片/);
  assert.match(pillsBar.textContent, /万亿市值/);
  const arrowRight = rwSidebar.querySelector('.rw-pills-arrow-btn.right');
  assert.ok(arrowRight, 'Right scroll arrow button exists for sliding to subsequent groups');

  const timeSessionBar = rwSidebar.querySelector('.rw-time-session-bar');
  assert.ok(timeSessionBar, 'Time bar exists');
  assert.match(timeSessionBar.textContent, /北京时间/);
  assert.equal(timeSessionBar.querySelector('.rw-session-seg'), null, 'Redundant 常规/盘后 buttons are removed');

  const storagePill = [...rwSidebar.querySelectorAll('.rw-grp-pill')].find(b => b.textContent.includes('存储'));
  storagePill?.click();
  await tick();

  // 2. Find the '存储' group block and its in-group column header (.rw-group-col-header: 股票 | 收盘价 | Chg%)
  const groupBlocks = [...rwSidebar.querySelectorAll('.rw-group-block')];
  const storageBlock = groupBlocks.find(b => b.querySelector('.rw-group-name')?.textContent.trim() === '存储');
  assert.ok(storageBlock, 'Storage group block exists');

  const inGroupHeader = storageBlock.querySelector('.rw-group-col-header');
  assert.ok(inGroupHeader, 'In-group sortable column header (.rw-group-col-header) exists inside group');
  assert.match(inGroupHeader.textContent, /标的/);
  assert.match(inGroupHeader.textContent, /收盘价格/);
  assert.match(inGroupHeader.textContent, /Chg%/);

  const getStorageSymbols = () => [...storageBlock.querySelectorAll('.rw-stock-row .rw-sym')].map(el => el.textContent.trim());

  // 3. Click '收盘价' inside Storage group -> sorts in-group by regularPrice descending (SNDK 1300 > MU 960 > SKHY 162)
  const priceSortBtn = inGroupHeader.querySelector('.rw-col-price');
  priceSortBtn.click();
  await tick();
  let syms = getStorageSymbols();
  assert.equal(syms[0], 'SNDK', 'Highest regularPrice (SNDK 1300) is first');
  assert.equal(syms[1], 'MU', 'Second highest regularPrice (MU 960) is second');
  assert.equal(syms[2], 'SKHY', 'Third regularPrice (SKHY 162) is third');

  // 4. Click 'Chg%' inside Storage group -> sorts in-group by regularChange descending (SKHY +8.5% > SNDK +4.0% > MU -1.8%)
  const chgSortBtn = inGroupHeader.querySelector('.rw-col-change');
  chgSortBtn.click();
  await tick();
  syms = getStorageSymbols();
  assert.equal(syms[0], 'SKHY', 'Highest regularChange (SKHY +8.5%) is first');
  assert.equal(syms[1], 'SNDK', 'Second highest regularChange (SNDK +4.0%) is second');

  // 5. Click EXT% column header -> sorts in-group by extChange descending (MU +2.6% > SKHY -1.2% > SNDK -6.0%)
  // Notice MU's quote is in overnight (+2.6%) while SNDK's is in pre (-6.0%) — both display directly in .rw-cell-ext!
  const extSortBtn = inGroupHeader.querySelector('.rw-col-ext');
  extSortBtn.click();
  await tick();
  syms = getStorageSymbols();
  assert.equal(syms[0], 'MU', 'Highest extChange (MU +2.6% overnight) is first');

  // Verify SNDK row displays 1,300.00 | 4.00% | -6.00% (positive change has no plus sign, no 盘前/盘后 text, negative ext has minus sign)
  const sndkRow = [...storageBlock.querySelectorAll('.rw-stock-row')].find(r => r.querySelector('.rw-sym')?.textContent.trim() === 'SNDK');
  assert.ok(sndkRow, 'SNDK row exists');
  assert.equal(sndkRow.querySelector('.rw-cell-price').textContent.trim(), '1,300.00');
  assert.equal(sndkRow.querySelector('.rw-cell-change').textContent.trim(), '4.00%', 'Positive regular change omits plus sign');
  assert.doesNotMatch(sndkRow.querySelector('.rw-cell-ext').textContent.trim(), /盘前|盘后/, 'No 盘前 or 盘后 text displayed in EXT cell');
  assert.equal(sndkRow.querySelector('.rw-cell-ext').textContent.trim(), '-6.00%', 'Negative EXT% preserves minus sign');

  // Verify MU row displays positive EXT% without plus sign (2.60%)
  const muRow = [...storageBlock.querySelectorAll('.rw-stock-row')].find(r => r.querySelector('.rw-sym')?.textContent.trim() === 'MU');
  assert.ok(muRow, 'MU row exists');
  assert.equal(muRow.querySelector('.rw-cell-ext').textContent.trim(), '2.60%', 'Green positive EXT% omits plus sign');

  // Verify KXIAY (no extended hours data) displays grey dash -
  const kxiayRow = [...storageBlock.querySelectorAll('.rw-stock-row')].find(r => r.querySelector('.rw-sym')?.textContent.trim() === 'KXIAY');
  assert.ok(kxiayRow, 'KXIAY row exists');
  assert.equal(kxiayRow.querySelector('.rw-cell-ext').textContent.trim(), '-', 'Missing extended hours data renders single dash -');

  assert.deepEqual(ui.errors, []);
});


test('Financial Terminal Skeleton and Top Pulse Progress Bar: renders 2px pulse bar in topbar and displays skeleton screen structures during module transitions', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));
  await tick();
  await tick();

  // 1. Verify 2px top progress bar element is present in the topbar header
  const topProgress = ui.w.document.querySelector('.topbar .top-progress');
  assert.ok(topProgress, 'Top progress element (.topbar .top-progress) exists');
  assert.equal(topProgress.getAttribute('aria-hidden'), 'true');

  // 2. Verify navigation triggers loading pulse
  await ui.click('期权墙');
  await tick();
  assert.ok(ui.w.document.querySelector('.top-progress'), 'Top progress bar persists across views');

  // 3. Verify Chart module contains .chart-viewport and skeleton structure elements
  await ui.click('个股行情');
  await tick();
  const chartViewport = ui.w.document.querySelector('.chart-viewport');
  assert.ok(chartViewport, 'Chart viewport container exists');
  assert.ok(ui.w.document.querySelector('#price-chart'), 'Price chart container exists inside viewport');

  assert.deepEqual(ui.errors, []);
});

test('Heatmap color schemes: defaults to classic (经典绿红), switches to neon (荧光极光) and cyberpunk (赛博霓虹), updates treemap colors & gradient, and persists independently from K-line scheme', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));
  await tick();
  assert.ok(ui.w.document.querySelector('#heatmap-chart'));
  
  ui.w.document.querySelector('.settings-modal-btn').click();
  await tick();
  const modal = ui.w.document.querySelector('.preferences-modal-backdrop');
  assert.ok(modal);

  const chips = [...modal.querySelectorAll('.heatmap-scheme-card')];
  assert.equal(chips.length, 5);
  assert.match(chips[0].textContent, /经典绿红/);
  assert.match(chips[1].textContent, /荧光极光/);
  assert.match(chips[2].textContent, /赛博霓虹/);
  assert.match(chips[3].textContent, /极光蓝紫/);
  assert.match(chips[4].textContent, /深邃蓝紫/);

  chips[1].click();
  await tick();
  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-heatmap-scheme')), 'neon');

  chips[2].click();
  await tick();
  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-heatmap-scheme')), 'cyberpunk');

  chips[3].click();
  await tick();
  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-heatmap-scheme')), 'bluepurple');

  chips[4].click();
  await tick();
  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-heatmap-scheme')), 'deepbluepurple');

  assert.deepEqual(ui.errors, []);
});

test('Watchlist refined layout: "全部" view shows flat list without group headers, hides company names, and masks EXT% numeric value during market open', async t => {
  const openMarketFixture = url => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.includes('/watchlist/quotes')) {
      return {
        quotes: {
          SNDK: {
            symbol: 'SNDK',
            name: 'SanDisk Corporation',
            regular: { price: 1300, changePercent: 4.0 },
            pre: { price: 1222, changePercent: -6.0 },
            overnight: { price: null, changePercent: null },
            post: { price: null, changePercent: null },
            meta: { status: 'active', delayStatus: 'realtime' }
          }
        },
        session: { session: 'regular', desc: '正常开盘' },
        provider: { isConfigured: false, name: 'Longbridge' }
      };
    }
    return fixture(url);
  };

  const ui = await mount(t, async url => ({ ok: true, json: async () => openMarketFixture(url) }));
  await tick();
  await tick();

  const rwSidebar = ui.w.document.querySelector('.right-watchlist-sidebar');
  assert.ok(rwSidebar, 'Right watchlist sidebar exists');

  const flatBlock = rwSidebar.querySelector('.rw-all-flat-block');
  assert.ok(flatBlock, 'Flat block renders under "全部"');

  assert.equal(flatBlock.querySelector('.rw-name-sub'), null, 'Company name is hidden');

  const header = flatBlock.querySelector('.rw-group-col-header');
  assert.match(header.textContent, /标的/);
  assert.match(header.textContent, /收盘价格/);
  assert.match(header.textContent, /Chg%/);
  assert.match(header.textContent, /EXT%/);

  const extCell = flatBlock.querySelector('.rw-cell-ext');
  assert.ok(extCell, 'EXT% element exists during market open');
  assert.match(extCell.textContent, /--/);
  assert.doesNotMatch(extCell.textContent, /-6\.00%/);

  const moreBtn = rwSidebar.querySelector('.rw-more-wrap .rw-action-btn');
  assert.ok(moreBtn, '3-dots more action button exists');
  moreBtn.click();
  await tick();

  const dropdown = rwSidebar.querySelector('.rw-more-dropdown');
  assert.ok(dropdown, '3-dots settings dropdown opens');
  assert.match(dropdown.textContent, /显示延长时段/);

  const toggleSetting = dropdown.querySelector('.rw-dropdown-setting');
  toggleSetting.click();
  await tick();

  assert.doesNotMatch(header.textContent, /EXT%/);
  assert.equal(flatBlock.querySelector('.rw-cell-ext'), null);

  assert.deepEqual(ui.errors, []);
});

test('Watchlist refined layout: displays extended hours move (EXT%) when market is closed/post-market', async t => {
  const closedMarketFixture = url => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.includes('/watchlist/quotes')) {
      return {
        quotes: {
          SNDK: {
            symbol: 'SNDK',
            name: 'SanDisk Corporation',
            regular: { price: 1300, changePercent: 4.0 },
            pre: { price: null, changePercent: null },
            overnight: { price: null, changePercent: null },
            post: { price: 1222, changePercent: -6.0 },
            meta: { status: 'active', delayStatus: 'realtime' }
          }
        },
        session: { session: 'post', desc: '盘后交易' },
        provider: { isConfigured: false, name: 'Longbridge' }
      };
    }
    return fixture(url);
  };

  const ui = await mount(t, async url => ({ ok: true, json: async () => closedMarketFixture(url) }));
  await tick();
  await tick();

  const rwSidebar = ui.w.document.querySelector('.right-watchlist-sidebar');
  const flatBlock = rwSidebar.querySelector('.rw-all-flat-block');
  const extCell = flatBlock.querySelector('.rw-cell-ext');
  assert.ok(extCell, 'EXT% element exists');
  assert.match(extCell.textContent, /-6\.00%/);

  assert.deepEqual(ui.errors, []);
});

test('Right watchlist sidebar: scrollbar is hidden while preserving scrolling capability', async () => {
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.rw-groups-scrollable\s*\{[^}]*scrollbar-width:\s*none;/);
  assert.match(css, /\.rw-groups-scrollable\s*\{[^}]*-ms-overflow-style:\s*none;/);
  assert.match(css, /\.rw-groups-scrollable::-webkit-scrollbar\s*\{[^}]*display:\s*none;/);
});

test('CNN Fear & Greed score: font has color without background pill box', async t => {
  const fgScoreFixture = url => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('overview')) {
      return {
        benchmarks: [],
        stocks: [],
        sectors: [],
        fearGreed: {
          score: 26,
          rating: '恐慌',
          ratingEn: 'Fear',
          toneClass: 'fg-tone-fear',
          previousClose: 25,
          previousWeek: 30,
          previousMonth: 40
        },
        unavailable: []
      };
    }
    return fixture(url);
  };

  const ui = await mount(t, async url => ({ ok: true, json: async () => fgScoreFixture(url) }));
  await tick();

  const scoreEl = ui.w.document.querySelector('.fg-score-val');
  assert.ok(scoreEl, 'Fear & greed score element renders');
  assert.equal(scoreEl.textContent.trim(), '26');
  assert.ok(scoreEl.classList.contains('fg-tone-fear'));

  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.fg-score-val[^{]*\{[^}]*background:\s*transparent\s*!important/);
  assert.match(css, /\.fg-tone-fear[^{]*\{[^}]*color:\s*#d97706/);
});




test('Options page: syncs with selected watchlist symbol (e.g. SNDK) instead of staying stuck on NVDA', async t => {
  const requestedOptionsSymbols = [];
  const customFixture = url => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.includes('/watchlist/quotes')) {
      return {
        quotes: {
          SNDK: { symbol: 'SNDK', name: 'SanDisk', regular: { price: 1150, changePercent: -13.4 } },
          NVDA: { symbol: 'NVDA', name: 'NVIDIA', regular: { price: 100, changePercent: 2 } }
        },
        session: { session: 'regular', desc: '常规交易' }
      };
    }
    if (u.pathname === '/api/options') {
      const sym = u.searchParams.get('symbol') || 'SPY';
      requestedOptionsSymbols.push(sym);
      return {
        symbol: sym,
        spot: sym === 'SNDK' ? 1155.5 : 100,
        expiration: '2026-11-06',
        expirations: ['2026-11-06'],
        callWall: [1160],
        putWall: [1140],
        callOi: 1200,
        putOi: 900,
        putCallRatio: 0.75,
        netGex: 5000,
        missingOi: 0,
        missingGamma: 0,
        contracts: 10,
        rows: [{ strike: 1160, callOi: 1200, putOi: 900, callGex: 5000, putGex: -3000 }],
        asOf: '2026-10-31 20:00:00'
      };
    }
    return fixture(url);
  };

  const ui = await mount(t, async url => ({ ok: true, json: async () => customFixture(url) }));
  await tick();

  const optNavBtn = [...ui.w.document.querySelectorAll('.nav-item')].find(el => el.dataset.id === 'options');
  assert.ok(optNavBtn, 'Options nav button exists');

  const sndkRow = [...ui.w.document.querySelectorAll('.rw-stock-row')].find(el => el.textContent.includes('SNDK'));
  if (sndkRow) {
    sndkRow.click();
    await tick();
  }

  optNavBtn.click();
  await tick();
  await tick();

  const optInput = ui.w.document.querySelector('input[aria-label="期权标的"]');
  assert.ok(optInput, 'Options symbol input exists');
  assert.ok(requestedOptionsSymbols.length > 0, 'Options API was requested');

  const lastRequested = requestedOptionsSymbols[requestedOptionsSymbols.length - 1];
  assert.equal(optInput.value, 'SNDK');
  assert.equal(lastRequested, 'SNDK', 'Options loaded selected SNDK');

  // Verify the visible DOM board, including both metrics, not only the hidden ECharts chart.
  const row = ui.w.document.querySelector('.butterfly-row.is-call-wall');
  assert.ok(row, 'Actual strike row exists');
  const [left, strike, right] = row.children;
  assert.ok(left.classList.contains('butterfly-side-call'));
  assert.ok(strike.classList.contains('butterfly-strike-center'));
  assert.ok(right.classList.contains('butterfly-side-put'));
  assert.equal(left.querySelector('.butterfly-val-label').textContent, '1K');
  assert.equal(right.querySelector('.butterfly-val-label').textContent, '900');
  assert.equal(left.querySelector('.butterfly-bar-call').style.width, '75%');
  assert.equal(right.querySelector('.butterfly-bar-put').style.width, '56.25%');
  const legend = ui.w.document.querySelector('.options-legend-group');
  assert.match(legend.children[0].textContent, /Call.*左侧/);
  assert.match(legend.children[1].textContent, /Put.*右侧/);
  await ui.click('估算 GEX');
  assert.equal(left.querySelector('.butterfly-val-label').textContent, '5K');
  assert.equal(right.querySelector('.butterfly-val-label').textContent, '3K');
  assert.equal(right.querySelector('.butterfly-bar-put').style.width, '45%');

  assert.deepEqual(ui.errors, []);
});

test('Watchlist skeleton: renders shimmering skeleton rows during page refresh / loading and smoothly reveals real quotes', async t => {
  let resolveQuotes;
  const delayedFixture = url => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.includes('/watchlist/quotes')) {
      return new Promise(resolve => {
        resolveQuotes = () => resolve({
          quotes: {
            AAPL: { symbol: 'AAPL', name: 'Apple', regular: { price: 230, changePercent: 1.5, volume: 5000000 } }
          },
          session: { session: 'regular', desc: '常规交易' }
        });
      });
    }
    return fixture(url);
  };

  const ui = await mount(t, async url => ({ ok: true, json: async () => delayedFixture(url) }));
  await tick();

  // 1. While quotes request is in flight (states.watchlist.loading && no quotes yet), skeleton is active
  const rwSidebar = ui.w.document.querySelector('.right-watchlist-sidebar');
  assert.ok(rwSidebar, 'Right watchlist sidebar exists');
  const skeletonWrap = rwSidebar.querySelector('.rw-skeleton-wrap');
  assert.ok(skeletonWrap, 'Watchlist skeleton wrap is rendered during loading');
  const skeletonRows = skeletonWrap.querySelectorAll('.rw-skeleton-row');
  assert.equal(skeletonRows.length, 14, 'Renders 14 realistic skeleton rows');

  // Verify skeleton elements contain .sk shimmering elements
  const firstSkRow = skeletonRows[0];
  assert.ok(firstSkRow.querySelector('.rw-cell-code .sk'), 'Symbol cell has sk bar');
  assert.ok(firstSkRow.querySelector('.rw-cell-price .sk'), 'Price cell has sk bar');
  assert.ok(firstSkRow.querySelector('.rw-cell-change .sk'), 'Change cell has sk pill');

  // 2. Resolve delayed quotes
  resolveQuotes();
  await tick();
  await tick();

  // Skeleton disappears and real data is revealed
  assert.equal(rwSidebar.querySelector('.rw-skeleton-wrap'), null, 'Skeleton wrap disappears after quotes arrive');
  assert.ok(rwSidebar.querySelector('.rw-stock-row:not(.rw-skeleton-row)'), 'Real stock rows are displayed');

  // 3. Subsequent background quotes update (e.g. switching back from IDE / visibilitychange / periodic refresh):
  // Wait for initial page mount loading pulse (800ms) to complete
  await new Promise(r => setTimeout(r, 850));
  await tick();

  // Must NOT re-trigger skeleton screen or top progress bar!
  ui.w.document.dispatchEvent(new ui.w.Event('visibilitychange'));
  await tick();
  await tick();

  assert.equal(rwSidebar.querySelector('.rw-skeleton-wrap'), null, 'Skeleton wrap is never shown during background refresh');
  assert.equal(ui.w.document.querySelector('.top-progress.is-active'), null, 'Top progress bar is not triggered during background refresh');
  assert.ok(rwSidebar.querySelector('.rw-stock-row:not(.rw-skeleton-row)'), 'Real stock rows stay continuously visible without flickering');

  assert.deepEqual(ui.errors, []);
});

test('Inflection algorithm switch: toggles in chart legend and preferences modal, marks EB/B/ES/S', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));
  await tick();

  // Navigate to chart page
  const chartNavBtn = [...ui.w.document.querySelectorAll('.nav-item')].find(el => el.dataset.id === 'chart');
  assert.ok(chartNavBtn, 'Chart nav button exists');
  chartNavBtn.click();
  await tick();
  await tick();

  // 1. Chart readout strip has the inflection switch button
  const readoutStrip = ui.w.document.querySelector('#chart-readout-strip');
  assert.ok(readoutStrip, 'Chart readout strip exists');
  const inflBtn = readoutStrip.querySelector('.inflection-switch-btn');
  assert.ok(inflBtn, 'Inflection algorithm switch button exists in chart header');
  assert.equal(inflBtn.getAttribute('aria-pressed'), 'false', 'Defaults to off');

  // Click to turn ON
  inflBtn.click();
  await tick();
  await tick();

  assert.equal(inflBtn.getAttribute('aria-pressed'), 'true', 'Toggled to active');
  assert.ok(inflBtn.classList.contains('is-active'), 'Has is-active class');
  assert.equal(ui.w.localStorage.getItem('market-desk-inflection-signals'), 'true', 'Persisted to localStorage');

  // Verify regular MAs are turned off and DEMA indicators are visible
  const maStorage = JSON.parse(ui.w.localStorage.getItem('market-desk-ma-visibility'));
  assert.equal(maStorage.ma5, false, 'MA5 turned off when inflection hunter enabled');
  assert.equal(maStorage.ma20, false, 'MA20 turned off when inflection hunter enabled');
  const demaIndicators = readoutStrip.querySelectorAll('.dema-legend-indicator');
  assert.equal(demaIndicators.length, 2, 'DEMA 14 and DEMA 30 indicators rendered in chart strip');

  // Check fallback chart config contains DEMA lines
  const chartCfg = ui.configs.get('price-chart');
  if (chartCfg && chartCfg.series) {
    const hasDema14 = chartCfg.series.some(s => s.name === 'DEMA14 (快线)');
    const hasDema30 = chartCfg.series.some(s => s.name === 'DEMA30 (慢线)');
    assert.ok(hasDema14, 'Chart series includes DEMA14 fast line');
    assert.ok(hasDema30, 'Chart series includes DEMA30 slow line');
  }

  // 2. Open preferences modal and check inflection banner switch
  const settingsBtn = ui.w.document.querySelector('.settings-modal-btn') || [...ui.w.document.querySelectorAll('button')].find(b => b.textContent.includes('设置'));
  assert.ok(settingsBtn, 'Settings button found');
  settingsBtn.click();
  await tick();
  await tick();

  const prefBanner = ui.w.document.querySelector('.pref-inflection-banner');
  assert.ok(prefBanner, 'Preferences modal has inflection banner switch');
  assert.equal(prefBanner.getAttribute('aria-checked'), 'true', 'Modal reflects active state');

  // Click in modal to turn OFF
  prefBanner.click();
  await tick();
  await tick();

  assert.equal(prefBanner.getAttribute('aria-checked'), 'false', 'Modal toggles to false');
  assert.equal(inflBtn.getAttribute('aria-pressed'), 'false', 'Chart legend button synchronizes to false');
  assert.equal(ui.w.localStorage.getItem('market-desk-inflection-signals'), 'false', 'Persisted false to localStorage');

  assert.deepEqual(ui.errors, []);
});


test('Watchlist table: displays accurate session status (☀️ 常规交易) and distinct headers (最新现价 vs 盘前对照) during regular trading', async t => {
  const regularMarketFixture = url => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.includes('/watchlist/quotes')) {
      return {
        session: { session: 'regular', isExt: false, desc: '常规交易' },
        quotes: {
          NVDA: {
            symbol: 'NVDA',
            name: 'NVIDIA Corporation',
            regular: { price: 287.16, changePercent: 1.25, volume: 15000000 },
            pre: { price: 285.25, changePercent: 0.30, volume: 1000000 },
            post: { price: 288.10, changePercent: 0.33, volume: 500000 }
          }
        }
      };
    }
    return fixture(url);
  };

  const ui = await mount(t, async url => ({ ok: true, json: async () => regularMarketFixture(url) }), {
    'market-desk-default-page': 'watchlist'
  });
  await tick();
  await tick();

  // 1. Verify table is rendered on the watchlist page
  const table = ui.w.document.querySelector('.watchlist-table');
  assert.ok(table, 'Watchlist table exists');

  // 2. Verify column headers in regular trading
  const regPriceTh = table.querySelector('.wl-col-regular-price');
  assert.match(regPriceTh.textContent, /最新现价/, 'Col 2 header is 最新现价 during regular trading, not 常规收盘价');

  const regChgTh = table.querySelector('.wl-col-regular-chg');
  assert.match(regChgTh.textContent, /日内涨跌%/, 'Col 3 header is 日内涨跌%');

  const extPriceTh = table.querySelector('.wl-col-ext-price');
  assert.match(extPriceTh.textContent, /盘前/, 'Col 4 EXT header reflects 盘前 instead of duplicating 常规');

  // 3. Verify session badge displays 常规交易 (not 盘后交易)
  const sessionPills = table.querySelectorAll('.wl-session-pill');
  assert.ok(sessionPills.length > 0, 'Session pills exist');
  assert.match(sessionPills[0].textContent, /常规交易/, 'Session badge displays 常规交易');
  assert.deepEqual(ui.errors, []);
});

test('UI Palette selection: defaults to terminal, switches to cobalt in preferences modal, and persists to localStorage', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));
  
  // 1. Initial palette is terminal
  assert.equal(ui.w.document.documentElement.getAttribute('data-palette'), 'terminal');

  // 2. Open preferences modal
  const settingsBtn = ui.w.document.querySelector('.settings-modal-btn');
  assert.ok(settingsBtn, 'Settings modal button exists');
  settingsBtn.click();
  await tick();

  const modal = ui.w.document.querySelector('.preferences-modal-backdrop');
  assert.ok(modal, 'Modal is open');
  assert.match(modal.textContent, /界面配色/);
  assert.match(modal.textContent, /经典终端/);
  assert.match(modal.textContent, /蓝灰数据/);

  // 3. Click Cobalt palette card
  const cobaltCard = [...modal.querySelectorAll('.pref-palette-card')].find(c => c.textContent.includes('蓝灰数据'));
  assert.ok(cobaltCard, 'Cobalt card exists');
  cobaltCard.click();
  await tick();

  assert.equal(ui.w.document.documentElement.getAttribute('data-palette'), 'cobalt');
  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-ui-palette')), 'cobalt');

  // 4. Click Terminal palette card to switch back
  const terminalCard = [...modal.querySelectorAll('.pref-palette-card')].find(c => c.textContent.includes('经典终端'));
  assert.ok(terminalCard, 'Terminal card exists');
  terminalCard.click();
  await tick();

  assert.equal(ui.w.document.documentElement.getAttribute('data-palette'), 'terminal');
  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-ui-palette')), 'terminal');

  modal.querySelector('.pref-confirm-btn').click();
  await tick();
  assert.deepEqual(ui.errors, []);
});

test('Mobile Workspace Redesign: 5 bottom tabs, dedicated search overlay, more functions sheet, and vertical card list', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));
  
  // 0. Desktop Guard: on desktop viewports, mobile overlay root is not rendered
  assert.equal(ui.w.document.querySelector('#mobile-overlay-root'), null, 'Mobile overlay root is strictly omitted on desktop');

  // 1. Resize to mobile width (390px iPhone standard)
  ui.w.innerWidth = 390;
  ui.w.dispatchEvent(new ui.w.Event('resize'));
  await tick();

  // 2. Verify 5 bottom tabs: 市场 / 自选 / 个股 / 资讯 / 更多
  const mobileTabs = [...ui.w.document.querySelectorAll('.mobile-tab-item')];
  assert.equal(mobileTabs.length, 5, 'Should have exactly 5 bottom tabs');
  assert.match(mobileTabs[0].textContent, /市场/);
  assert.match(mobileTabs[1].textContent, /自选/);
  assert.match(mobileTabs[2].textContent, /个股/);
  assert.match(mobileTabs[3].textContent, /资讯/);
  assert.match(mobileTabs[4].textContent, /更多/);

  // 3. Click "自选" tab
  mobileTabs[1].click();
  await tick();
  assert.equal(ui.w.document.querySelector('.mobile-watchlist-container') !== null, true, 'Mobile vertical stock list is rendered');
  assert.ok(ui.w.document.querySelector('.mobile-quote-card'), 'Mobile quote cards are rendered in mobile watchlist');

  // 4. Click "更多" tab -> opens more functions sheet
  mobileTabs[4].click();
  await tick();
  assert.ok(ui.w.document.querySelector('.mobile-bottom-sheet.is-active'), 'More sheet is active');
  assert.match(ui.w.document.querySelector('.mobile-bottom-sheet.is-active').textContent, /加密行情/);
  assert.match(ui.w.document.querySelector('.mobile-bottom-sheet.is-active').textContent, /期权持仓/);

  // Close more sheet
  ui.w.document.querySelector('.mobile-bottom-sheet.is-active .sheet-close-btn').click();
  await tick();
  assert.equal(ui.w.document.querySelector('.mobile-bottom-sheet.is-active'), null, 'Sheet closed');

  assert.deepEqual(ui.errors, []);
});

test('Crypto Workspace: Sankey distribution, 4 scoped KPIs, 2-column whale-position linking, Crypto/TradFi switch, and collapsible secondary flow drawer', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => {
    const data = fixture(url);
    if (new URL(url, 'http://localhost').pathname !== '/api/crypto/onchain-stocks') return data;
    const nvda = data.top10[0];
    return { ...data, top10: [
      { ...nvda, symbol: 'NVDA', chartSymbol: 'NVDA', name: '英伟达', price: 148.5, tradFiClose: 147.8, premiumPct: 0.47, priceDiff: 0.7, volume24h: 64820000, netFlow: 18408880, buyRatio: 64.2, sellRatio: 35.8 },
      { ...nvda, symbol: 'AMD', chartSymbol: 'AMD', name: '超威半导体', price: 150.0, tradFiClose: 145.0, premiumPct: 3.45, priceDiff: 5.0, volume24h: 8000000, netFlow: 350000, buyRatio: 80, sellRatio: 20 },
      { ...nvda, symbol: 'TSLA', chartSymbol: 'TSLA', name: '特斯拉', price: 210.0, tradFiClose: 215.0, premiumPct: -2.33, priceDiff: -5.0, volume24h: 20000000, netFlow: -3000000, buyRatio: 20, sellRatio: 80 }
    ] };
  } }));

  // 1. Navigate to Crypto module
  await ui.click('加密货币');
  await tick();
  await tick();

  // 2. Verify legacy clutter and old sparklines/donuts are replaced by unified Sankey KPIs
  assert.equal(ui.w.document.querySelector('.crypto-table'), null, 'crypto-table is removed from crypto dashboard');
  assert.equal(ui.w.document.querySelector('#crypto-chart'), null, 'crypto-chart is not rendered');
  const mainText = ui.w.document.querySelector('main').textContent;
  assert.doesNotMatch(mainText, /市值霸主|智能合约|实时行情已联通|仅精选 BTC/);

  // 3. Verify 4 Scoped KPI Cards (名义持仓, 多仓 LONG, 空仓 SHORT, 多空净敞口)
  const kpiCards = ui.w.document.querySelectorAll('.cw-telemetry-card');
  assert.equal(kpiCards.length, 4, '4 scoped KPI cards rendered');
  assert.match(kpiCards[0].textContent, /名义持仓/);
  assert.match(kpiCards[1].textContent, /多仓.*LONG/);
  assert.match(kpiCards[2].textContent, /空仓.*SHORT/);
  assert.match(kpiCards[3].textContent, /多空净敞口/);
  assert.ok(kpiCards[3].querySelector('.cw-kpi-split-track'), 'L/S split bar rendered on KPI card 4');

  // 4. Verify SVG Sankey Diagram & Live Rebalance Strip
  const sankeyPanel = ui.w.document.querySelector('.cw-sankey-panel');
  assert.ok(sankeyPanel, 'Sankey panel rendered');
  assert.match(sankeyPanel.textContent, /加密货币 · 巨鲸持仓分布/);
  assert.match(sankeyPanel.querySelector('.cw-selection-badge').textContent, /全部钱包/);
  assert.ok(sankeyPanel.querySelector('.cw-now-strip'), 'Live rebalance marquee strip rendered');
  assert.match(sankeyPanel.querySelector('.cw-now-strip').textContent, /暂无 5 分钟内新成交/);

  const sankeySvg = sankeyPanel.querySelector('.cw-sankey-svg');
  assert.ok(sankeySvg, 'Responsive SVG Sankey chart rendered');
  assert.equal(sankeySvg.querySelectorAll('.cw-sk-pulse-beam').length, 0, 'Calm Crypto period renders zero synthetic pulse beams');
  assert.equal(sankeySvg.hasAttribute('viewBox'), true, 'SVG preserves camelCase viewBox attribute for browser scaling');
  assert.equal(sankeySvg.hasAttribute('viewbox'), false, 'SVG must not downgrade viewBox to lowercase viewbox');
  const vbParts = (sankeySvg.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
  assert.equal(vbParts.length, 4, 'Valid 4-tuple SVG viewBox');
  assert.equal(vbParts[2], 1280, 'Sankey viewBox width matches 1280px coordinate space');
  assert.ok(vbParts[3] >= 440, 'Sankey viewBox height avoids vertical clipping');

  const walletNodes = sankeySvg.querySelectorAll('.cw-sk-wallet-node');
  const assetNodes = sankeySvg.querySelectorAll('.cw-sk-asset-node');
  const ribbonPaths = sankeySvg.querySelectorAll('.cw-sk-ribbon');
  assert.match(sankeySvg.textContent, /持仓标的 · 按链上成交量/);
  assert.equal(walletNodes.length, 2, '2 crypto whale wallet nodes in SVG');
  assert.equal(walletNodes[0].querySelector('.cw-sk-avatar-txt').textContent.trim(), '01', 'Numeric monospace badge replaces emoji');
  assert.deepEqual(
    [...assetNodes].map(n => n.getAttribute('data-asset')),
    ['BTC', 'ETH', 'SOL'],
    'Crypto Sankey assets sort top-to-bottom by 24h on-chain volume (BTC > ETH > SOL) despite ETH holding highest whale OI'
  );
  assert.match(assetNodes[0].querySelector('.cw-sk-asset-lbl').textContent, /量 \$/);
  assert.equal(ribbonPaths.length, 4, '4 conservation-strict position ribbons in SVG');
  for (const rPath of ribbonPaths) {
    const dAttr = rPath.getAttribute('d') || '';
    assert.ok(dAttr.startsWith('M'), 'Valid SVG path string');
    assert.doesNotMatch(dAttr, /NaN|Infinity/);
    const mStart = dAttr.match(/^M[\d.]+,([\d.]+)\s/);
    const lEnd = dAttr.match(/L[\d.]+,([\d.]+)\sC/);
    const cEnd = dAttr.match(/C[\d.,\s]+[\d.]+,([\d.]+)\s/);
    assert.ok(mStart && lEnd && cEnd, 'Ribbon SVG path contains full closed cubic geometry');
    const targetSpan = Number(lEnd[1]) - Number(cEnd[1]);
    assert.ok(targetSpan > 1, `Ribbon must have non-zero vertical thickness (got ${targetSpan})`);
  }

  // Test direction mode filter (全部 -> 多仓 -> 空仓 -> 全部)
  const modeBtns = sankeyPanel.querySelectorAll('.cw-mode-seg .cw-seg-btn');
  assert.equal(modeBtns.length, 3, '全部 / 多仓 / 空仓 mode buttons rendered');
  modeBtns[1].click(); // 多仓
  await tick();
  assert.equal(sankeyPanel.querySelectorAll('.cw-sk-ribbon').length, 2, 'Only 2 long ribbons remain in 多仓 mode');
  modeBtns[2].click(); // 空仓
  await tick();
  assert.equal(sankeyPanel.querySelectorAll('.cw-sk-ribbon').length, 2, 'Only 2 short ribbons remain in 空仓 mode');
  modeBtns[0].click(); // 全部
  await tick();
  assert.equal(sankeyPanel.querySelectorAll('.cw-sk-ribbon').length, 4, 'Restored 4 ribbons in 全部 mode');

  // 5. Verify Lower Two-Column Split Layout: Left = 巨鲸钱包, Right = 持仓明细
  const lowerGrid = ui.w.document.querySelector('.cw-lower-grid');
  assert.ok(lowerGrid, 'Lower 2-column split grid exists');
  const whalePanel = lowerGrid.querySelector('.crypto-whale-tracker-panel');
  const detailPanel = lowerGrid.querySelector('.cw-positions-detail-panel');
  assert.ok(whalePanel && detailPanel, 'Left wallet panel & right detail panel exist');
  assert.match(whalePanel.textContent, /加密货币 · 巨鲸钱包/);
  assert.equal(ui.w.document.querySelector('#cw-positions-title').textContent.trim(), '全部钱包 · 持仓明细');
  assert.ok(detailPanel.querySelector('.cw-agg-positions-table'), 'Aggregated multi-wallet breakdown shown initially');

  // Test sorting of 多仓 / 空仓 / 合计 columns in 全部钱包 · 持仓明细 (when no wallet is selected)
  const aggSyms = () => [...detailPanel.querySelectorAll('.cw-agg-positions-table .cw-asset-sym')].map(el => el.textContent.trim());
  const thAggLong = detailPanel.querySelector('.th-agg-long.sortable-th');
  const thAggShort = detailPanel.querySelector('.th-agg-short.sortable-th');
  const thAggTotal = detailPanel.querySelector('.th-agg-total.sortable-th');
  assert.ok(thAggLong && thAggShort && thAggTotal, 'Sortable 多仓 / 空仓 / 合计 headers exist on aggregated table');
  assert.deepEqual(aggSyms(), ['BTC', 'ETH', 'SOL'], 'Initial aggregated order follows 24h volume desc');
  assert.equal(thAggLong.getAttribute('aria-sort'), 'none');
  assert.equal(thAggLong.querySelector('.sort-indicator').textContent.trim(), '⇅');

  // Cycle 多仓: desc (SOL $14.5M > BTC $6.93M > ETH $0) -> asc -> reset to volume order
  thAggLong.click();
  await tick();
  assert.deepEqual(aggSyms(), ['SOL', 'BTC', 'ETH'], '多仓 desc puts largest long position first');
  assert.equal(thAggLong.getAttribute('aria-sort'), 'descending');
  assert.equal(thAggLong.querySelector('.sort-indicator').textContent.trim(), '↓');
  assert.ok(thAggLong.classList.contains('is-sorted'));

  thAggLong.click();
  await tick();
  assert.deepEqual(aggSyms(), ['ETH', 'BTC', 'SOL'], '多仓 asc puts $0 long first');
  assert.equal(thAggLong.getAttribute('aria-sort'), 'ascending');
  assert.equal(thAggLong.querySelector('.sort-indicator').textContent.trim(), '↑');

  thAggLong.click();
  await tick();
  assert.deepEqual(aggSyms(), ['BTC', 'ETH', 'SOL'], '3rd click on 多仓 resets to default volume order');
  assert.equal(thAggLong.getAttribute('aria-sort'), 'none');

  // Cycle 空仓: desc (ETH $31.8M > BTC $4.2M > SOL $0) -> asc
  thAggShort.click();
  await tick();
  assert.deepEqual(aggSyms(), ['ETH', 'BTC', 'SOL'], '空仓 desc puts largest short position first');
  assert.equal(thAggShort.getAttribute('aria-sort'), 'descending');

  thAggShort.dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick();
  assert.deepEqual(aggSyms(), ['SOL', 'BTC', 'ETH'], 'Enter key toggles 空仓 to asc');
  assert.equal(thAggShort.getAttribute('aria-sort'), 'ascending');

  // Keyboard Space toggles 合计 desc -> asc
  thAggTotal.dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  await tick();
  assert.deepEqual(aggSyms(), ['ETH', 'SOL', 'BTC'], 'Space key sorts 合计 desc');
  thAggTotal.click();
  await tick();
  assert.deepEqual(aggSyms(), ['BTC', 'SOL', 'ETH'], 'Click sorts 合计 asc');
  thAggTotal.click();
  await tick();
  assert.deepEqual(aggSyms(), ['BTC', 'ETH', 'SOL'], '3rd click resets 合计 back to default volume order');

  // Click left wallet row -> links Sankey + highlights row + switches Right Panel to rich single-whale table
  const leftRows = whalePanel.querySelectorAll('.cw-wallet-row');
  assert.equal(leftRows.length, 2, '2 wallet rows rendered in left table');
  leftRows[0].click();
  await tick();

  assert.ok(leftRows[0].classList.contains('selected'), 'Clicked wallet row gets .selected state');
  assert.match(sankeyPanel.querySelector('.cw-selection-badge').textContent, /HL 亿级多空对冲巨鲸/);
  assert.match(ui.w.document.querySelector('#cw-positions-title').textContent, /HL 亿级多空对冲巨鲸 · 持仓明细/);
  assert.ok(detailPanel.querySelector('.cw-selected-wallet-strip'), 'Selected wallet summary strip shown');
  assert.ok(detailPanel.querySelector('.whale-positions-table'), 'Single-whale rich positions table shown');

  // Verify position column sorting on Right Panel (仓位 val asc/desc, 盈亏 pnl desc/asc)
  const thVal = detailPanel.querySelector('.th-val.sortable-th');
  const thPnl = detailPanel.querySelector('.th-pnl.sortable-th');
  assert.ok(thVal && thPnl, 'Sortable 仓位 & 盈亏 headers exist');

  let coinNames = Array.from(detailPanel.querySelectorAll('.whale-positions-table .pos-coin-name')).map(el => el.textContent.trim());
  assert.deepEqual(coinNames, ['ETH', 'BTC']);

  thVal.click();
  await tick();
  coinNames = Array.from(detailPanel.querySelectorAll('.whale-positions-table .pos-coin-name')).map(el => el.textContent.trim());
  assert.deepEqual(coinNames, ['BTC', 'ETH']);

  thPnl.click();
  await tick();
  coinNames = Array.from(detailPanel.querySelectorAll('.whale-positions-table .pos-coin-name')).map(el => el.textContent.trim());
  assert.deepEqual(coinNames, ['ETH', 'BTC']);

  thPnl.click();
  await tick();
  coinNames = Array.from(detailPanel.querySelectorAll('.whale-positions-table .pos-coin-name')).map(el => el.textContent.trim());
  assert.deepEqual(coinNames, ['BTC', 'ETH']);

  // Click 清除选择 -> restores 全部钱包 · 持仓明细
  const resetSelBtn = sankeyPanel.querySelector('.cw-reset-selection');
  assert.equal(resetSelBtn.disabled, false);
  resetSelBtn.click();
  await tick();
  assert.equal(ui.w.document.querySelector('#cw-positions-title').textContent.trim(), '全部钱包 · 持仓明细');
  assert.ok(detailPanel.querySelector('.cw-agg-positions-table'), 'Aggregated table restored after clearing selection');

  // Test clicking SVG wallet node directly -> selects 2nd whale (SOL 高频套利巨鲸)
  const solWalletSvgNode = sankeySvg.querySelectorAll('.cw-sk-wallet-node')[1];
  solWalletSvgNode.dispatchEvent(new ui.w.MouseEvent('click', { bubbles: true }));
  await tick();
  assert.match(ui.w.document.querySelector('#cw-positions-title').textContent, /SOL 高频套利巨鲸 · 持仓明细/);

  // Test clicking Sankey ribbon directly -> toggles/selects 1st whale
  const firstRibbon = sankeySvg.querySelector('.cw-sk-ribbon');
  firstRibbon.dispatchEvent(new ui.w.MouseEvent('click', { bubbles: true }));
  await tick();
  assert.match(ui.w.document.querySelector('#cw-positions-title').textContent, /HL 亿级多空对冲巨鲸 · 持仓明细/);

  // 6. Verify unified clickable market cards: switch to "TradFi"
  const catBtns = ui.w.document.querySelectorAll('.whale-cat-btn');
  assert.equal(catBtns.length, 2, 'Two clickable market cards exist');
  assert.match(catBtns[0].textContent, /加密货币/);
  assert.match(catBtns[1].textContent, /TradFi/);

  catBtns[1].click();
  await tick();
  assert.match(sankeyPanel.textContent, /TradFi · 巨鲸持仓分布/);
  assert.match(sankeyPanel.textContent, /样本持仓策略 · 静态演示账户/);
  assert.equal(sankeyPanel.querySelector('.cw-now-strip'), null, 'TradFi static sample hides 正在调仓 pseudo-live ticker');
  assert.equal(sankeySvg.querySelectorAll('.cw-sk-pulse-beam').length, 0, 'TradFi static sample never flashes pulse beams');
  assert.match(sankeySvg.textContent, /NVDA/);
  assert.equal(sankeySvg.hasAttribute('viewBox'), true, 'TradFi SVG also maintains camelCase viewBox');
  assert.ok(sankeySvg.querySelectorAll('.cw-sk-ribbon').length >= 1, 'TradFi renders non-empty Sankey ribbons');
  const tradfiAssetOrder = [...sankeySvg.querySelectorAll('.cw-sk-asset-node')].map(n => n.getAttribute('data-asset'));
  assert.deepEqual(
    tradfiAssetOrder.slice(0, 3),
    ['NVDA', 'TSLA', 'AMD'],
    'TradFi Sankey assets sort strictly by 24h on-chain volume descending (NVDA $64.8M > TSLA $20M > AMD $8M)'
  );
  assert.equal(tradfiAssetOrder.at(-1), 'OTHER', 'Long-tail bucket remains pinned at bottom');
  assert.match(whalePanel.textContent, /TradFi · 巨鲸钱包/);
  assert.equal(ui.w.document.querySelector('#cw-positions-title').textContent.trim(), '全部钱包 · 持仓明细', 'Market switch uses independent TradFi selection state');

  // Verify TradFi aggregated table sorting (independent from Crypto sort state)
  const tradfiAggLong = detailPanel.querySelector('.th-agg-long.sortable-th');
  const tradfiAggShort = detailPanel.querySelector('.th-agg-short.sortable-th');
  assert.equal(tradfiAggLong.getAttribute('aria-sort'), 'none');
  tradfiAggLong.click();
  await tick();
  const tradfiLongTop = [...detailPanel.querySelectorAll('.cw-agg-positions-table .cw-asset-sym')].map(el => el.textContent.trim());
  assert.deepEqual(tradfiLongTop.slice(0, 3), ['NVDA', 'SPY', 'MSTR'], 'TradFi 多仓 desc puts NVDA ($32.6M) > SPY ($28.9M) > MSTR ($22.5M)');
  tradfiAggShort.click();
  await tick();
  const tradfiShortTop = [...detailPanel.querySelectorAll('.cw-agg-positions-table .cw-asset-sym')].map(el => el.textContent.trim());
  assert.deepEqual(tradfiShortTop.slice(0, 3), ['QQQ', 'TSLA', 'AAPL'], 'TradFi 空仓 desc puts QQQ ($21.4M) > TSLA ($12.8M) > AAPL ($12.4M)');

  const stylesCss = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(stylesCss, /\.cw-sk-pulse-glow,\s*\.cw-sk-pulse-beam\s*\{[^}]*stroke-dasharray:/, 'Pulse glow and beam share dashed packet geometry');

  // 7. Verify Secondary Market Flow & Radar Drawer (Collapsed by default -> Expandable)
  assert.equal(ui.w.document.querySelector('.onchain-stocks-panel'), null, 'Full-market flow table collapsed by default');
  const secToggleBtn = ui.w.document.querySelector('.cw-sec-toggle-btn');
  assert.ok(secToggleBtn, 'Secondary section toggle button exists');
  secToggleBtn.click();
  await tick();

  const onchainPanel = ui.w.document.querySelector('.onchain-stocks-panel');
  assert.ok(onchainPanel, 'Capital Flow Matrix panel revealed after expanding secondary toggle');
  assert.match(onchainPanel.textContent, /NVDA/);
  assert.match(onchainPanel.textContent, /英伟达/);
  assert.match(onchainPanel.querySelector('.netflow-val').textContent, /^\+\$[0-9]/, 'positive TradFi net flow formatted cleanly');

  const flowSymbols = () => [...onchainPanel.querySelectorAll('.cw-flow-row .cw-ticker')].map(el => el.textContent.trim());
  const checkFlowSort = async (selector, descending, ascending) => {
    const header = onchainPanel.querySelector(selector);
    assert.equal(header.getAttribute('aria-sort'), 'none');
    assert.equal(header.querySelector('.cw-sort-arrow').textContent, '↕');
    header.click();
    await tick();
    assert.deepEqual(flowSymbols(), descending);
    header.click();
    await tick();
    assert.deepEqual(flowSymbols(), ascending);
    header.dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    assert.deepEqual(flowSymbols(), descending);
    header.dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await tick();
    assert.deepEqual(flowSymbols(), ascending);
  };

  await checkFlowSort('.th-flow', ['NVDA', 'AMD', 'TSLA'], ['TSLA', 'AMD', 'NVDA']);
  await checkFlowSort('.th-ls', ['AMD', 'NVDA', 'TSLA'], ['TSLA', 'NVDA', 'AMD']);
  await checkFlowSort('.th-spread', ['AMD', 'NVDA', 'TSLA'], ['TSLA', 'NVDA', 'AMD']);
  onchainPanel.querySelector('.th-vol').click();
  await tick();

  // Expand inline whale drawer under NVDA row -> verify cost axis & 钱包 ↘ filter jump
  const radarBtn = onchainPanel.querySelector('.onchain-radar-btn');
  assert.ok(radarBtn, 'onchain-radar-btn exists');
  radarBtn.click();
  await tick();
  const radarContainer = onchainPanel.querySelector('.stock-radar-container');
  assert.ok(radarContainer, 'stock-radar-container inline drawer rendered');
  assert.ok(radarContainer.querySelector('.cw-axis-rail'), 'Horizontal price cost/spot axis graphic rendered');
  assert.ok(radarContainer.querySelector('.cw-axis-pin.is-tradfi'), 'TradFi stock reference pin rendered');
  assert.ok(radarContainer.querySelector('.cw-spread-tag'), 'TradFi spread tag rendered');

  const whaleBtn = radarContainer.querySelector('.onchain-whale-btn');
  assert.ok(whaleBtn, 'onchain-whale-btn exists');
  whaleBtn.click();
  await tick();
  assert.match(whalePanel.textContent, /NVDA/);

  // 8. Verify Watchlist sidebar contains '加密货币' group
  const rwSidebar = ui.w.document.querySelector('.right-watchlist-sidebar');
  assert.ok(rwSidebar, 'Right watchlist sidebar exists');
  assert.match(rwSidebar.textContent, /加密货币/, 'Watchlist has crypto group');

  // 9. Click row K-line jump button -> navigates directly to 'chart' (个股)
  const onchainJumpBtn = onchainPanel.querySelector('.onchain-jump-btn');
  assert.ok(onchainJumpBtn, 'On-chain jump button exists');
  onchainJumpBtn.click();
  await tick();
  await tick();
  assert.equal(ui.w.document.querySelector('main').textContent.includes('NVDA') || ui.w.document.querySelector('main').textContent.includes('USD'), true, 'Navigated to K-line chart');

  assert.deepEqual(ui.errors, []);
});

test('Volatility Matrix: Row 1 renders Volatility Twin Card (VIX vs VXN), and clicking opens panoramic modal', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));

  // 1. Verify Volatility Twin Card is rendered in Row 1 index-grid
  const volCard = ui.w.document.querySelector('.volatility-twin-card');
  assert.ok(volCard, 'Volatility twin card exists in Row 1');
  assert.match(volCard.textContent, /波动率指数/);
  assert.match(volCard.textContent, /VIX \/ VXN/);
  assert.match(volCard.textContent, /标普 VIX/);
  assert.match(volCard.textContent, /纳指 VXN/);
  assert.match(volCard.textContent, /利差/);

  // 2. Verify modal is closed initially
  assert.equal(ui.w.document.querySelector('.volatility-modal-card'), null, 'Modal is closed initially');

  // 3. Click card to open CBOE Volatility Matrix Modal
  volCard.click();
  await tick();
  const volModal = ui.w.document.querySelector('.volatility-modal-card');
  assert.ok(volModal, 'Volatility modal opened on click');
  assert.match(volModal.textContent, /CBOE 波动率指数全景 · VIX vs VXN 联动雷达/);
  assert.match(volModal.textContent, /标普 500 波动率/);
  assert.match(volModal.textContent, /纳指 100 波动率/);
  assert.match(volModal.textContent, /交易员实战指引/);

  // 4. Close modal via close button
  const closeBtn = volModal.querySelector('.stock-modal-close-btn');
  assert.ok(closeBtn, 'Close button exists');
  closeBtn.click();
  await tick();
  assert.equal(ui.w.document.querySelector('.volatility-modal-card'), null, 'Modal closed on close button click');

  assert.deepEqual(ui.errors, []);
});

test('K-Line TradingView Ruler Tool & 15m Default Timeframe', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));

  // 1. Navigate to '个股行情'
  await ui.click('个股行情');
  await tick();

  // 2. Verify 15m timeframe button is labeled '15分' and select has '日内 · 15 分钟'
  const rangeTools = ui.w.document.querySelector('.chart-range-tools');
  assert.ok(rangeTools, 'chart-range-tools exists');
  assert.match(rangeTools.textContent, /15分/, 'Shows 15分 label for intraday');
  const rangeSelect = ui.w.document.querySelector('.chart-range-select');
  assert.match(rangeSelect.textContent, /日内 · 15 分钟/, 'Select contains 日内 · 15 分钟');

  // 2b. Verify K-line interval tools (15分, 1小时, 4小时, 日K) and default to 日K
  const intervalTools = ui.w.document.querySelector('.chart-interval-tools');
  assert.ok(intervalTools, 'chart-interval-tools exists');
  const intervalBtns = Array.from(intervalTools.querySelectorAll('.tiny-btn'));
  assert.equal(intervalBtns.length, 4, 'Has 4 interval options');
  assert.match(intervalTools.textContent, /15分/);
  assert.match(intervalTools.textContent, /1小时/);
  assert.match(intervalTools.textContent, /4小时/);
  assert.match(intervalTools.textContent, /日K/);
  const dailyBtn = intervalBtns.find(b => b.textContent.includes('日K'));
  assert.ok(dailyBtn.classList.contains('active'), '日K is active by default');

  // Click 1小时
  const h1Btn = intervalBtns.find(b => b.textContent.includes('1小时'));
  h1Btn.click();
  await tick();
  assert.ok(h1Btn.classList.contains('active'), '1小时 is active after click');
  assert.ok(!dailyBtn.classList.contains('active'), '日K is no longer active');

  // Verify chart interval tag in readout strip
  const intervalTag = ui.w.document.querySelector('.chart-interval-tag');
  assert.ok(intervalTag, 'chart-interval-tag exists');
  assert.match(intervalTag.textContent, /1小时/);

  // Restore daily K
  dailyBtn.click();
  await tick();
  assert.ok(dailyBtn.classList.contains('active'), '日K active again');

  // 3. Keep the ruler in the chart toolbar without a duplicate header button.
  assert.equal(ui.w.document.querySelector('.chart-ruler-btn'), null);
  const tvToolbar = ui.w.document.querySelector('.tv-left-toolbar');
  assert.ok(tvToolbar, 'TradingView left vertical toolbar exists');
  const tvRulerBtn = tvToolbar.querySelector('.tv-tool-btn');
  assert.ok(tvRulerBtn, 'TV toolbar ruler button exists');

  // 4. Ruler tool toggle
  assert.equal(ui.w.document.querySelector('.chart-ruler-layer'), null, 'Ruler layer closed initially');
  tvRulerBtn.click();
  await tick();
  assert.ok(ui.w.document.querySelector('.chart-ruler-layer'), 'Ruler layer active after click');
  assert.match(ui.w.document.querySelector('.ruler-hint-pill').textContent, /在图表上点击并拖动以测量/);

  // 5. Simulate measurement drag
  const rulerLayer = ui.w.document.querySelector('.chart-ruler-layer');
  rulerLayer.dispatchEvent(new ui.w.PointerEvent('pointerdown', { clientX: 100, clientY: 200, bubbles: true }));
  await tick();
  rulerLayer.dispatchEvent(new ui.w.PointerEvent('pointermove', { clientX: 250, clientY: 120, bubbles: true }));
  await tick();
  rulerLayer.dispatchEvent(new ui.w.PointerEvent('pointerup', { clientX: 250, clientY: 120, bubbles: true }));
  await tick();

  // 6. Verify measurement card and svg shapes are rendered
  assert.ok(ui.w.document.querySelector('.ruler-tooltip-card'), 'Ruler tooltip card is rendered');
  assert.ok(ui.w.document.querySelector('.chart-ruler-svg rect'), 'Ruler svg rect is rendered');
  assert.ok(ui.w.document.querySelector('.chart-ruler-svg line'), 'Ruler svg line is rendered');
  assert.match(ui.w.document.querySelector('.ruler-tooltip-card').textContent, /根 K线/);

  // 7. Clear measurement via close button
  const closeBtn = ui.w.document.querySelector('.ruler-close-pill');
  assert.ok(closeBtn, 'Ruler close pill exists');
  closeBtn.click();
  await tick();
  assert.equal(ui.w.document.querySelector('.chart-ruler-layer'), null, 'Ruler layer cleared after close button click');

  assert.deepEqual(ui.errors, []);
});

test('K-Line Lightweight Charts stub path: mounts LightweightCharts instance and binds gestures controller', async t => {
  let createdChart = null;
  const attachedProviders = [];
  const stubChart = {
    _hostEl: null,
    applyOptions() {},
    resize() {},
    remove() {},
    subscribeCrosshairMove(cb) { this._crosshairCb = cb; },
    timeScale: () => ({
      subscribeVisibleLogicalRangeChange() {},
      getVisibleLogicalRange: () => ({ from: 10, to: 100 }),
      setVisibleLogicalRange() {},
      fitContent() {}
    }),
    priceScale: () => ({
      applyOptions() {},
      setAutoScale() {},
      getVisibleRange: () => ({ from: 100, to: 200 })
    }),
    addSeries: () => ({
      applyOptions: (o) => {
        if (o?.autoscaleInfoProvider) attachedProviders.push(o.autoscaleInfoProvider);
      },
      setData() {},
      coordinateToPrice: (y) => 200 - y * 0.25,
      priceToCoordinate: (p) => (200 - p) * 4,
      priceScale: () => ({ setAutoScale() {}, applyOptions() {} })
    })
  };

  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }), null, w => {
    w.LightweightCharts = {
      ColorType: { Solid: 'solid' },
      CrosshairMode: { Normal: 1 },
      CandlestickSeries: 'Candlestick',
      HistogramSeries: 'Histogram',
      LineSeries: 'Line',
      createChart: (el) => {
        stubChart._hostEl = el;
        createdChart = stubChart;
        return stubChart;
      }
    };
  });

  const chartNavBtn = [...ui.w.document.querySelectorAll('.nav-item')].find(el => el.dataset.id === 'chart');
  assert.ok(chartNavBtn, 'Chart nav button exists');
  chartNavBtn.click();
  await tick();

  assert.ok(createdChart, 'LightweightCharts createChart was called');
  assert.ok(ui.w.document.getElementById('price-chart'), 'Price chart container exists');
  assert.ok(ui.w.klineGestureCtrl, 'klineGestureCtrl was assigned on window');
  assert.deepEqual(ui.errors, []);
});

test('Right watchlist sidebar: defaults to collapsed state and toggles via topbar button and floating tab', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));
  await tick();
  await tick();

  const rwSidebar = ui.w.document.querySelector('.right-watchlist-sidebar');
  assert.ok(rwSidebar, 'Right watchlist sidebar exists in DOM');
  assert.ok(rwSidebar.classList.contains('is-collapsed'), 'Sidebar is collapsed by default');

  const topbarToggle = ui.w.document.querySelector('.toggle-rw-btn');
  assert.ok(topbarToggle, 'Topbar toggle button exists');
  assert.ok(topbarToggle.classList.contains('is-collapsed'), 'Topbar toggle button reflects collapsed state');

  const floatingTab = ui.w.document.querySelector('.floating-expand-rw-btn');
  assert.ok(floatingTab, 'Floating expand button is visible when sidebar is collapsed');

  // Click floating tab to expand
  floatingTab.click();
  await tick();

  assert.equal(rwSidebar.classList.contains('is-collapsed'), false, 'Sidebar expands after clicking floating tab');
  assert.equal(topbarToggle.classList.contains('is-collapsed'), false, 'Topbar toggle reflects expanded state');
  const activeFloatingTab = ui.w.document.querySelector('.floating-expand-rw-btn');
  assert.ok(!activeFloatingTab || activeFloatingTab._isLeaving, 'Floating tab is leaving or removed when expanded');

  // Click topbar toggle button to collapse back
  topbarToggle.click();
  await tick();

  assert.ok(rwSidebar.classList.contains('is-collapsed'), 'Sidebar collapses again after clicking topbar toggle');
  assert.ok(topbarToggle.classList.contains('is-collapsed'), 'Topbar toggle reflects collapsed state again');
  assert.ok(ui.w.document.querySelector('.floating-expand-rw-btn'), 'Floating tab reappears');
  assert.deepEqual(ui.errors, []);
});

test('Crypto Workspace: truth-gated Sankey pulses only on fresh fills or contract size deltas and polls every 15s while visible', async t => {
  const intervals = new Map();
  let intervalId = 200000;
  let now = 1_794_300_000_000;
  let hidden = false;
  let whaleRequests = 0;

  let currentWhalePayload = () => {
    const base = fixture('/api/crypto/whales');
    // Calm initial response: old 20m fill should not light up the Sankey
    base.fetchedAt = new Date(now).toISOString();
    base.activityLogs = [
      {
        id: 'old-fill',
        time: now - 20 * 60 * 1000,
        ageMs: 20 * 60 * 1000,
        timeAgo: '20分钟前',
        whaleName: 'HL 亿级多空对冲巨鲸',
        whaleAddress: '0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00',
        action: '开仓做空',
        shortAction: '开空',
        isLong: false,
        isIncrease: true,
        isLiveFill: true,
        coin: 'ETH',
        chartSymbol: 'ETH-USD',
        valueUsd: 250000,
        valueText: '$250K'
      }
    ];
    return base;
  };

  const ui = await mount(t, async url => {
    if (url.startsWith('/api/crypto/whales')) {
      whaleRequests++;
      return { ok: true, json: async () => currentWhalePayload() };
    }
    return { ok: true, json: async () => fixture(url) };
  }, null, w => {
    Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => hidden });
    w.Date.now = () => now;
    const realClearInterval = w.clearInterval.bind(w);
    w.setInterval = (fn, ms) => {
      const id = ++intervalId;
      intervals.set(id, { fn, ms });
      return id;
    };
    w.clearInterval = id => {
      intervals.delete(id);
      realClearInterval(id);
    };
  });

  // Navigate to Crypto tab -> registers 15s whale poller
  await ui.click('加密货币');
  await tick();
  await tick();

  const pollEntry = () => [...intervals.values()].find(e => e.ms === 15000);
  assert.ok(pollEntry(), '15s Crypto whale poller is scheduled while visible on Crypto tab');
  assert.equal(ui.w.document.querySelectorAll('.cw-sk-pulse-beam').length, 0, 'Fills older than 5m stay calm (0 pulse beams)');

  const beforePollRequests = whaleRequests;

  // Poll 1: markPx / positionValue swings by +20% with IDENTICAL contract size -> STILL 0 pulse beams
  now += 15000;
  currentWhalePayload = () => {
    const base = fixture('/api/crypto/whales');
    base.fetchedAt = new Date(now).toISOString();
    base.whales[0].positions[0].markPx = 2796;
    base.whales[0].positions[0].positionValue = 38_160_000;
    base.activityLogs = [];
    return base;
  };
  pollEntry().fn();
  await tick();
  await tick();
  assert.equal(whaleRequests, beforePollRequests + 1, '15s poller requested updated whale snapshot');
  assert.equal(ui.w.document.querySelectorAll('.cw-sk-pulse-beam').length, 0, 'Mark-price swing without size change emits 0 beams');

  // Poll 2: fresh fill (30s ago, $180K) AND real contract size reduction on ETH (-1000 contracts) -> beam pulses with is-reverse!
  now += 15000;
  const freshSolFillTime = now - 30_000;
  currentWhalePayload = () => {
    const base = fixture('/api/crypto/whales');
    base.fetchedAt = new Date(now).toISOString();
    base.whales[0].positions[0].size = 12685; // trimmed by 1000 ETH
    base.whales[0].positions[0].positionValue = 29_500_000;
    base.activityLogs = [
      {
        id: 'fresh-sol-fill',
        time: freshSolFillTime,
        ageMs: now - freshSolFillTime,
        timeAgo: '刚刚',
        whaleName: 'SOL 高频套利巨鲸',
        whaleAddress: '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be',
        action: '开仓做多',
        shortAction: '开多',
        isLong: true,
        isIncrease: true,
        isLiveFill: true,
        coin: 'SOL',
        chartSymbol: 'SOL-USD',
        valueUsd: 180_000,
        valueText: '$180K'
      }
    ];
    return base;
  };
  pollEntry().fn();
  await tick();
  await tick();

  const beams = [...ui.w.document.querySelectorAll('.cw-sk-pulse-beam')];
  assert.equal(beams.length, 2, 'Both contract trim delta (ETH) and fresh 5m fill (SOL) illuminate pulse beams');
  assert.ok(beams.some(b => b.classList.contains('is-reverse') && b.classList.contains('is-short')), 'ETH trim renders reverse short pulse');
  assert.ok(beams.some(b => !b.classList.contains('is-reverse') && b.classList.contains('is-long')), 'SOL fresh buy renders forward long pulse');
  const stripText = ui.w.document.querySelector('.cw-now-strip').textContent;
  assert.match(stripText, /ETH → HL 亿级多空对冲巨鲸.*减空/);
  assert.match(stripText, /SOL 高频套利巨鲸 → SOL.*开多/);

  // Switch to TradFi -> 15s poller stops, 正在调仓 hidden, beams = 0
  const catBtns = ui.w.document.querySelectorAll('.whale-cat-btn');
  catBtns[1].click();
  await tick();
  assert.equal(pollEntry(), undefined, '15s poller pauses on TradFi static sample tab');
  assert.equal(ui.w.document.querySelectorAll('.cw-sk-pulse-beam').length, 0);

  // Switch back to Crypto, then advance clock +6 min -> both 2m snapshot delta and 5m fresh fill expire cleanly back to 0 beams
  catBtns[0].click();
  await tick();
  assert.ok(pollEntry(), '15s poller resumes on returning to Crypto');

  now += 6 * 60 * 1000;
  pollEntry().fn();
  await tick();
  await tick();
  assert.equal(ui.w.document.querySelectorAll('.cw-sk-pulse-beam').length, 0, 'Expired fills and snapshot deltas return Sankey to calm baseline');

  // Hide document -> poller stops; unhide -> resumes and triggers catch-up fetch
  const beforeUnhideCount = whaleRequests;
  hidden = true;
  ui.w.document.dispatchEvent(new ui.w.Event('visibilitychange'));
  await tick();
  assert.equal(pollEntry(), undefined, 'Poller stops while tab is hidden');

  hidden = false;
  ui.w.document.dispatchEvent(new ui.w.Event('visibilitychange'));
  await tick();
  await tick();
  assert.ok(pollEntry(), 'Poller resumes on visibility restore');
  assert.ok(whaleRequests > beforeUnhideCount, 'Catch-up fetch runs when tab returns to foreground');

  assert.deepEqual(ui.errors, []);
});

test('Crypto Workspace: dynamic Leaderboard Top N selector, custom wallet manager validation/add/scope-filter/empty-state and removal', async t => {
  const whaleUrls = [];
  const customZeroAddr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  const ui = await mount(t, async url => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname === '/api/crypto/whales') {
      whaleUrls.push(url);
      const topN = Number(u.searchParams.get('topN') || 12);
      const customRaw = u.searchParams.get('custom') || '';
      const base = fixture('/api/crypto/whales');
      base.meta = { topN, customCount: customRaw ? 1 : 0, leaderboardActive: true };

      if (topN >= 16) {
        base.whales.push({
          address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          shortAddress: '0xbbbb...bbbb',
          name: 'ApexQuantFund',
          tag: '排行榜发现 · Top 巨鲸',
          avatar: '🐋',
          isCurated: false,
          sourceType: 'leaderboard',
          sourceLabel: '榜单发现',
          accountValue: 18_500_000,
          totalNtlPos: 12_000_000,
          netExposure: 12_000_000,
          netBiasLabel: '净多',
          longNotional: 12_000_000,
          shortNotional: 0,
          positions: [
            {
              coin: 'BTC',
              chartSymbol: 'BTC-USD',
              side: 'LONG',
              sideLabel: '做多',
              isLong: true,
              size: 150,
              entryPx: 79000,
              markPx: 80000,
              positionValue: 12_000_000,
              unrealizedPnl: 150_000,
              roePct: 12.1,
              leverage: 10,
              leverageType: '全仓',
              leverageLabel: '10x 全仓',
              liquidationPx: 62000,
              liqDistancePct: 22.5
            }
          ]
        });
      }

      if (customRaw.includes(customZeroAddr)) {
        const pipeLabel = customRaw.split(',')[0].split('|')[1] || '自选地址';
        base.whales.push({
          address: customZeroAddr,
          shortAddress: '0xaaaa...aaaa',
          name: pipeLabel,
          tag: '自选链上钱包',
          avatar: '⭐',
          isCustom: true,
          isCurated: false,
          sourceType: 'custom',
          sourceLabel: '自选监控',
          accountValue: 45_000,
          totalNtlPos: 0,
          netExposure: 0,
          netBiasLabel: '暂无持仓',
          longNotional: 0,
          shortNotional: 0,
          positions: []
        });
      }

      return { ok: true, json: async () => base };
    }
    return { ok: true, json: async () => fixture(url) };
  });

  await ui.click('加密货币');
  await tick();
  await tick();

  // 1. Default Top 12 request & selector state
  assert.ok(whaleUrls.some(u => new URL(u, 'http://localhost').searchParams.get('topN') === '12'), 'Initial crypto fetch requests topN=12');
  const topNSelect = ui.w.document.querySelector('.cw-topn-select');
  assert.ok(topNSelect, 'Top N select exists in crypto toolbar');
  assert.equal(topNSelect.value, '12');

  // Change Top N to 16 -> persists to localStorage, fetches topN=16, renders newly discovered whale
  topNSelect.value = '16';
  topNSelect.dispatchEvent(new ui.w.Event('change', { bubbles: true }));
  await tick();
  await tick();

  assert.equal(JSON.parse(ui.w.localStorage.getItem('market-desk-whale-top-n')), 16);
  assert.ok(whaleUrls.some(u => new URL(u, 'http://localhost').searchParams.get('topN') === '16'), 'Changing Top N fetches topN=16');
  assert.equal(ui.w.document.querySelectorAll('.cw-wallet-row').length, 3, '3rd dynamically discovered whale renders in list');
  assert.match(ui.w.document.querySelector('.cw-market-desc').textContent, /Top 16/);

  // 2. Open Custom Wallet Manager & validate invalid EVM address
  const openBtn = ui.w.document.querySelector('.cw-custom-btn');
  assert.ok(openBtn, 'Custom wallet button exists');
  openBtn.click();
  await tick();

  const modal = ui.w.document.querySelector('.cw-custom-modal-card');
  assert.ok(modal, 'Custom wallet manager modal opens');
  const addrInput = modal.querySelector('.cw-custom-addr-input');
  const labelInput = modal.querySelector('.cw-custom-label-input');
  const form = modal.querySelector('form.cw-custom-form');

  addrInput.value = '0x123';
  addrInput.dispatchEvent(new ui.w.Event('input', { bubbles: true }));
  form.dispatchEvent(new ui.w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.ok(modal.querySelector('.cw-custom-error'), 'Invalid address shows validation error');
  assert.equal(ui.w.localStorage.getItem('market-desk-custom-whales'), null, 'Invalid address is not saved to localStorage');

  // 3. Submit valid custom wallet -> persists, requests custom=, focuses right panel with honest zero-position state
  addrInput.value = customZeroAddr.toUpperCase();
  addrInput.dispatchEvent(new ui.w.Event('input', { bubbles: true }));
  labelInput.value = '我的对冲号';
  labelInput.dispatchEvent(new ui.w.Event('input', { bubbles: true }));
  form.dispatchEvent(new ui.w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  await tick();

  const storedCustom = JSON.parse(ui.w.localStorage.getItem('market-desk-custom-whales'));
  assert.equal(storedCustom.length, 1);
  assert.equal(storedCustom[0].address, customZeroAddr);
  assert.equal(storedCustom[0].label, '我的对冲号');

  const lastCustomReq = whaleUrls.at(-1);
  assert.ok(lastCustomReq.includes('custom='), 'Submit sends custom query param');
  assert.equal(ui.w.document.querySelector('.cw-custom-modal-card'), null, 'Modal closes automatically after adding custom wallet');

  // Right panel displays selected zero-position custom wallet cleanly (live equity + honest empty state)
  assert.match(ui.w.document.querySelector('#cw-positions-title').textContent, /我的对冲号 · 持仓明细/);
  assert.match(ui.w.document.querySelector('.cw-selected-wallet-strip').textContent, /\$45\.0K/);
  assert.ok(ui.w.document.querySelector('.cw-pos-empty'), 'Empty position custom wallet shows honest empty state instead of blank table');
  assert.match(ui.w.document.querySelector('.cw-positions-detail-panel .cw-table-footer').textContent, /空仓观望/);

  const customRow = [...ui.w.document.querySelectorAll('.cw-wallet-row')].find(r => r.textContent.includes('我的对冲号'));
  assert.ok(customRow, 'Custom wallet row appears in left table');
  assert.ok(customRow.querySelector('.cw-src-pill.is-custom'), 'Custom wallet row has 自选 pill');
  assert.match(customRow.querySelector('.cw-wt-ratio-cell').textContent, /空仓/);

  // 4. Scope filter ("全部" vs "仅自选") filters cleanly & persists across TradFi toggle
  const scopeBtns = ui.w.document.querySelectorAll('.cw-scope-btn');
  assert.equal(scopeBtns.length, 2, 'Scope tabs appear once custom wallets exist');
  scopeBtns[1].click(); // 仅自选
  await tick();
  assert.equal(ui.w.document.querySelectorAll('.cw-wallet-row').length, 1, '仅自选 filters table strictly to custom wallet');

  scopeBtns[0].click(); // 全部
  await tick();
  assert.equal(ui.w.document.querySelectorAll('.cw-wallet-row').length, 4, '全部 restores all 4 tracked wallets');

  // TradFi hides Top N & custom controls, switching back preserves Crypto Top 16 & custom list
  const catBtns = ui.w.document.querySelectorAll('.whale-cat-btn');
  catBtns[1].click();
  await tick();
  assert.equal(ui.w.document.querySelector('.cw-topn-select'), null, 'TradFi hides Top N selector');
  assert.equal(ui.w.document.querySelector('.cw-custom-btn'), null, 'TradFi hides custom wallet manager button');

  catBtns[0].click();
  await tick();
  assert.equal(ui.w.document.querySelector('.cw-topn-select').value, '16', 'Top 16 selection preserved on returning to Crypto');

  // 5. Remove custom wallet from row action -> updates localStorage and resets selection back to 全部钱包
  const rowRemoveBtn = ui.w.document.querySelector('.cw-row-remove-btn');
  assert.ok(rowRemoveBtn, 'Inline remove button exists on custom wallet row');
  rowRemoveBtn.click();
  await tick();
  await tick();

  assert.deepEqual(JSON.parse(ui.w.localStorage.getItem('market-desk-custom-whales')), []);
  assert.equal(ui.w.document.querySelector('.cw-scope-btn'), null, 'Scope tabs hide cleanly once custom wallets empty out');
  assert.equal(ui.w.document.querySelector('#cw-positions-title').textContent.trim(), '全部钱包 · 持仓明细');
  assert.equal(ui.w.document.querySelectorAll('.cw-wallet-row').length, 3);

  assert.deepEqual(ui.errors, []);
});

test('Crypto Workspace: live HIP-3 (xyz) TradFi mode enables Top N, Custom Wallets, xyz fills, and 15s polling', async t => {
  const whaleUrls = [];
  const intervals = new Map();
  let intervalId = 300000;
  let now = 1_794_310_000_000;
  const customTradfiAddr = '0xcccccccccccccccccccccccccccccccccccccccc';
  let emitFreshXyzFill = false;

  const buildStocksPayload = ({ topN = 12, customRaw = '' } = {}) => {
    const whales = [
      {
        address: '0x7111111111111111111111111111111111111111',
        shortAddress: '0x7111...1111',
        name: 'XyzSemiDesk',
        tag: 'HIP-3 TradFi 千万级巨鲸',
        avatar: '🐋',
        isCurated: false,
        sourceType: 'leaderboard',
        sourceLabel: '榜单发现',
        accountValue: 42_000_000,
        totalNtlPos: 65_000_000,
        netExposure: 13_300_000,
        netBiasLabel: '净多',
        longNotional: 39_150_000,
        shortNotional: 25_850_000,
        positions: [
          {
            coin: 'XYZ100',
            chartSymbol: 'QQQ',
            side: 'LONG',
            sideLabel: '做多',
            isLong: true,
            size: 1500,
            entryPx: 25800,
            markPx: 26100,
            positionValue: 39_150_000,
            unrealizedPnl: 450_000,
            roePct: 14.0,
            leverage: 10,
            leverageType: '全仓',
            leverageLabel: '10x 全仓',
            liquidationPx: 22000,
            liqDistancePct: 15.7
          },
          {
            coin: 'NVDA',
            chartSymbol: 'NVDA',
            side: 'SHORT',
            sideLabel: '做空',
            isLong: false,
            size: 137135,
            entryPx: 190.0,
            markPx: 188.5,
            positionValue: 25_850_000,
            unrealizedPnl: 205_000,
            roePct: 8.2,
            leverage: 10,
            leverageType: '全仓',
            leverageLabel: '10x 全仓',
            liquidationPx: 220.0,
            liqDistancePct: 16.7
          }
        ]
      },
      {
        address: '0x7222222222222222222222222222222222222222',
        shortAddress: '0x7222...2222',
        name: 'XyzIndexArb',
        tag: 'HIP-3 TradFi 榜单巨鲸',
        avatar: '🏛️',
        isCurated: false,
        sourceType: 'leaderboard',
        sourceLabel: '榜单发现',
        accountValue: 18_000_000,
        totalNtlPos: 24_000_000,
        netExposure: 24_000_000,
        netBiasLabel: '净多',
        longNotional: 24_000_000,
        shortNotional: 0,
        positions: [
          {
            coin: 'NVDA',
            chartSymbol: 'NVDA',
            side: 'LONG',
            sideLabel: '做多',
            isLong: true,
            size: 127320,
            entryPx: 185.0,
            markPx: 188.5,
            positionValue: 24_000_000,
            unrealizedPnl: 445_000,
            roePct: 21.0,
            leverage: 10,
            leverageType: '全仓',
            leverageLabel: '10x 全仓',
            liquidationPx: 152.0,
            liqDistancePct: 19.4
          }
        ]
      }
    ];

    if (topN >= 16) {
      whales.push({
        address: '0x7333333333333333333333333333333333333333',
        shortAddress: '0x7333...3333',
        name: 'XyzGoldFund',
        tag: 'HIP-3 TradFi 榜单巨鲸',
        avatar: '🐋',
        isCurated: false,
        sourceType: 'leaderboard',
        sourceLabel: '榜单发现',
        accountValue: 11_000_000,
        totalNtlPos: 15_000_000,
        netExposure: 15_000_000,
        netBiasLabel: '净多',
        longNotional: 15_000_000,
        shortNotional: 0,
        positions: [
          {
            coin: 'GOLD',
            chartSymbol: 'GC=F',
            side: 'LONG',
            sideLabel: '做多',
            isLong: true,
            size: 4385,
            entryPx: 3390,
            markPx: 3420,
            positionValue: 15_000_000,
            unrealizedPnl: 131_500,
            roePct: 9.5,
            leverage: 8,
            leverageType: '全仓',
            leverageLabel: '8x 全仓',
            liquidationPx: 2950,
            liqDistancePct: 13.7
          }
        ]
      });
    }

    if (customRaw.includes(customTradfiAddr)) {
      const pipeLabel = decodeURIComponent(customRaw.split(',')[0].split('|')[1] || '我的美股一号');
      whales.push({
        address: customTradfiAddr,
        shortAddress: '0xcccc...cccc',
        name: pipeLabel,
        tag: '自选链上钱包',
        avatar: '⭐',
        isCustom: true,
        isCurated: false,
        sourceType: 'custom',
        sourceLabel: '自选监控',
        accountValue: 125_000,
        totalNtlPos: 0,
        netExposure: 0,
        netBiasLabel: '暂无持仓',
        longNotional: 0,
        shortNotional: 0,
        positions: []
      });
    }

    return {
      ok: true,
      category: 'stocks',
      provider: 'Hyperliquid HIP-3 (TradeXYZ)',
      isLive: true,
      isSample: false,
      source: 'hyperliquid-xyz-api',
      fetchedAt: new Date(now).toISOString(),
      meta: { topN, dex: 'xyz', customCount: customRaw ? 1 : 0, leaderboardActive: true },
      aggregate: {
        totalTrackedWhales: whales.length,
        totalEquity: 60_000_000,
        totalOI: 89_000_000,
        totalLongNotional: 63_150_000,
        totalShortNotional: 25_850_000,
        longRatio: 71.0,
        shortRatio: 29.0,
        sentiment: '巨鲸偏向做多 BULLISH',
        sentimentColor: 'long',
        topCoins: [{ coin: 'NVDA', totalNtl: 49_850_000, longPct: 48, shortPct: 52 }]
      },
      whales,
      assetVolumes: { NVDA: 654_000_000, XYZ100: 447_000_000, GOLD: 190_000_000 },
      activityLogs: emitFreshXyzFill
        ? [
          {
            id: 'xyz-live-fill-1',
            time: now - 30_000,
            ageMs: 30_000,
            timeAgo: '刚刚',
            whaleName: 'XyzIndexArb',
            whaleAddress: '0x7222222222222222222222222222222222222222',
            action: '开仓做多',
            shortAction: '开多',
            isLong: true,
            isIncrease: true,
            isLiveFill: true,
            coin: 'NVDA',
            chartSymbol: 'NVDA',
            valueUsd: 320_000,
            valueText: '$320K'
          }
        ]
        : []
    };
  };

  const ui = await mount(t, async url => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname === '/api/crypto/whales') {
      whaleUrls.push(url);
      if (u.searchParams.get('category') === 'stocks') {
        const topN = Number(u.searchParams.get('topN') || 12);
        const customRaw = u.searchParams.get('custom') || '';
        return { ok: true, json: async () => buildStocksPayload({ topN, customRaw }) };
      }
      return { ok: true, json: async () => fixture(url) };
    }
    return { ok: true, json: async () => fixture(url) };
  }, null, w => {
    Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => false });
    w.Date.now = () => now;
    const realClearInterval = w.clearInterval.bind(w);
    w.setInterval = (fn, ms) => {
      const id = ++intervalId;
      intervals.set(id, { fn, ms });
      return id;
    };
    w.clearInterval = id => {
      intervals.delete(id);
      realClearInterval(id);
    };
  });

  await ui.click('加密货币');
  await tick();
  await tick();

  // Switch to TradFi -> live HIP-3 (xyz) mode activates Top N, Custom Wallet, 正在调仓, and 15s polling
  const catBtns = ui.w.document.querySelectorAll('.whale-cat-btn');
  catBtns[1].click();
  await tick();
  await tick();

  assert.match(ui.w.document.querySelector('#cw-flow-title').textContent, /TradFi · 巨鲸持仓分布/);
  assert.match(ui.w.document.querySelector('.cw-market-desc').textContent, /Hyperliquid HIP-3 \(xyz\) 实时 · Top 12/);
  assert.equal(ui.w.document.querySelector('.cw-sample-pill'), null, 'Sample pill must not render in live HIP-3 mode');

  const topNSelect = ui.w.document.querySelector('.cw-topn-select');
  assert.ok(topNSelect, 'Top N selector renders on live TradFi');
  assert.ok(ui.w.document.querySelector('.cw-custom-btn'), 'Custom wallet button renders on live TradFi');
  assert.ok(ui.w.document.querySelector('.cw-now-strip'), '正在调仓 bar renders on live TradFi');
  assert.ok([...intervals.values()].some(e => e.ms === 15000), '15s poller stays active on live TradFi');

  // Change Top N to 16 -> stays on TradFi & fetches category=stocks&topN=16
  topNSelect.value = '16';
  topNSelect.dispatchEvent(new ui.w.Event('change', { bubbles: true }));
  await tick();
  await tick();

  const lastTopNUrl = new URL(whaleUrls.at(-1), 'http://localhost');
  assert.equal(lastTopNUrl.searchParams.get('category'), 'stocks');
  assert.equal(lastTopNUrl.searchParams.get('topN'), '16');
  assert.match(ui.w.document.querySelector('#cw-flow-title').textContent, /TradFi · 巨鲸持仓分布/);
  assert.equal(ui.w.document.querySelectorAll('.cw-wallet-row').length, 3, '3rd HIP-3 xyz whale appears for Top 16');

  // Add custom wallet while on TradFi -> stays on TradFi & passes category=stocks
  ui.w.document.querySelector('.cw-custom-btn').click();
  await tick();
  const modal = ui.w.document.querySelector('.cw-custom-modal-card');
  const addrInput = modal.querySelector('.cw-custom-addr-input');
  const labelInput = modal.querySelector('.cw-custom-label-input');
  addrInput.value = customTradfiAddr;
  addrInput.dispatchEvent(new ui.w.Event('input', { bubbles: true }));
  labelInput.value = '我的美股一号';
  labelInput.dispatchEvent(new ui.w.Event('input', { bubbles: true }));
  modal.querySelector('form.cw-custom-form').dispatchEvent(new ui.w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  await tick();

  const lastCustomUrl = new URL(whaleUrls.at(-1), 'http://localhost');
  assert.equal(lastCustomUrl.searchParams.get('category'), 'stocks');
  assert.ok(lastCustomUrl.searchParams.get('custom').includes(customTradfiAddr));
  assert.match(ui.w.document.querySelector('#cw-positions-title').textContent, /我的美股一号 · 持仓明细/);
  assert.match(ui.w.document.querySelector('.cw-pos-empty').textContent, /Hyperliquid HIP-3 \(xyz\)/);

  // Remove custom wallet while on TradFi -> stays on TradFi, restores 全部钱包
  ui.w.document.querySelector('.cw-row-remove-btn').click();
  await tick();
  await tick();
  assert.equal(new URL(whaleUrls.at(-1), 'http://localhost').searchParams.get('category'), 'stocks');
  assert.equal(ui.w.document.querySelector('#cw-positions-title').textContent.trim(), '全部钱包 · 持仓明细');

  // Trigger 15s poll on TradFi -> emits live xyz fill pulse beam
  now += 15000;
  emitFreshXyzFill = true;
  const pollEntry = [...intervals.values()].find(e => e.ms === 15000);
  pollEntry.fn();
  await tick();
  await tick();

  assert.equal(ui.w.document.querySelectorAll('.cw-sk-pulse-beam').length, 1, 'Live xyz fill pulses beam on TradFi Sankey');
  assert.match(ui.w.document.querySelector('.cw-now-strip').textContent, /XyzIndexArb → NVDA.*开多/);

  assert.deepEqual(ui.errors, []);
});

test('Options Butterfly Skeleton: spot row (.is-spot-row) is rendered strictly at the apex / peak of the bilateral butterfly bars', async t => {
  let resolveOptions;
  const ui = await mount(t, async url => {
    if (url.includes('/api/options')) {
      return new Promise(resolve => { resolveOptions = resolve; });
    }
    return { ok: true, json: async () => fixture(url) };
  });

  await ui.click('期权墙');
  await tick();

  const skeletonContainer = ui.w.document.querySelector('.options-skeleton-container');
  assert.ok(skeletonContainer, 'Options skeleton container is rendered while loading');

  const rows = Array.from(skeletonContainer.querySelectorAll('.options-butterfly-card .butterfly-row'));
  assert.ok(rows.length > 0, 'Butterfly skeleton rows exist');

  const spotRow = skeletonContainer.querySelector('.butterfly-row.is-spot-row');
  assert.ok(spotRow, 'Spot row (.is-spot-row) exists in butterfly skeleton');

  // Verify spot row is strictly at row index 5 (the peak of the butterfly shape)
  const spotIndex = rows.indexOf(spotRow);
  assert.equal(spotIndex, 5, 'Spot row is at row index 5 (peak position)');

  // Verify that row index 5 has the maximum Call and Put bar widths across all skeleton rows
  const getCallW = r => parseFloat(r.querySelector('.sk-butterfly-call')?.style?.width || 0);
  const getPutW = r => parseFloat(r.querySelector('.sk-butterfly-put')?.style?.width || 0);

  const spotCallW = getCallW(spotRow);
  const spotPutW = getPutW(spotRow);

  for (let i = 0; i < rows.length; i++) {
    if (i !== spotIndex) {
      assert.ok(spotCallW > getCallW(rows[i]), `Peak Call width (${spotCallW}%) is strictly greater than row ${i} (${getCallW(rows[i])}%)`);
      assert.ok(spotPutW > getPutW(rows[i]), `Peak Put width (${spotPutW}%) is strictly greater than row ${i} (${getPutW(rows[i])}%)`);
    }
  }

  // Clean up
  resolveOptions({ ok: true, json: async () => fixture('/api/options') });
  await tick();
  assert.deepEqual(ui.errors, []);
});

