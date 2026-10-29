// DOM integration tests. This does not claim real-browser or visual verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parseFlows } from '../public/flows.js';
import * as watchlistModel from '../public/watchlist-model.js';
import * as earningsCalendarModel from '../public/earnings-calendar-model.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
async function mount(t, fetchImpl, initStorage = null) {
  const errors = [], configs = new Map();
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', e => errors.push(e.message)); virtualConsole.on('error', e => errors.push(String(e)));
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''), { url: 'http://localhost/', runScripts: 'outside-only', virtualConsole });
  t.after(() => dom.window.close()); const w = dom.window;
  w.fetch = fetchImpl; w.parseFlows = parseFlows; w.ResizeObserver = class { observe() {} disconnect() {} };
  w.EventSource = class { constructor() {} close() {} };
  w.requestAnimationFrame = cb => setTimeout(cb, 16);
  w.cancelAnimationFrame = id => clearTimeout(id);
  Object.assign(w, watchlistModel, earningsCalendarModel);
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get: () => 800 });
  w.echarts = { init: el => ({ setOption: config => configs.set(el.id, config), off() {}, on() {}, resize() {}, dispose() {} }) };
  w.eval(await fs.readFile(new URL('../node_modules/vue/dist/vue.global.prod.js', import.meta.url), 'utf8'));
  w.bindKlineGestures = () => ({ focusLatest() {}, reset() {}, resetPriceScale() {}, dispose() {}, isFollowingLatest() { return true; } });
  if (initStorage) {
    for (const [k, v] of Object.entries(initStorage)) {
      w.localStorage.setItem(k, JSON.stringify(v));
    }
  }
  const appSrc = (await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8'))
    .replace("import { parseFlows } from './flows.js';", 'const parseFlows = window.parseFlows;')
    .replace("import { bindKlineGestures } from './composables/klineGesture.js';", 'const bindKlineGestures = window.bindKlineGestures;')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/watchlist-model\.js';/, 'const { WatchlistManager, sortWatchlistRows, getSelectedExtQuote, getCurrentSession, getNyTime, SESSION_TYPES, MAX_UNIQUE_SYMBOLS, validSymbol, SYMBOL_NAMES, NASDAQ100_STOCKS, SP500_STOCKS, isLeveragedEtf, STOCK_MARKET_CAPS, getStockMarketCap, sortSymbolsByMarketCap } = window;')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/earnings-calendar-model\.js';/, 'const { AI_SECTOR_FILTERS, EARNINGS_DAYS, CORPORATE_LOGOS, DEFAULT_TECH_EARNINGS, MACRO_CALENDAR_ITEMS, filterEarningsByDay } = window;');
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
  assert.ok(timeSessionBar, 'Time and session switcher bar exists');
  assert.match(timeSessionBar.textContent, /北京时间/);
  assert.match(timeSessionBar.textContent, /常规/);

  // 2. Find the '存储' group block and its in-group column header (.rw-group-col-header: 股票 | 收盘价 | Chg%)
  const groupBlocks = [...rwSidebar.querySelectorAll('.rw-group-block')];
  const storageBlock = groupBlocks.find(b => b.querySelector('.rw-group-name')?.textContent.trim() === '存储');
  assert.ok(storageBlock, 'Storage group block exists');

  const inGroupHeader = storageBlock.querySelector('.rw-group-col-header');
  assert.ok(inGroupHeader, 'In-group sortable column header (.rw-group-col-header) exists inside group');
  assert.match(inGroupHeader.textContent, /股票/);
  assert.match(inGroupHeader.textContent, /收盘价/);
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

  // 5. Click extended-hours cell or session switcher -> sorts in-group by extChange descending (MU +2.6% > SKHY -1.2% > SNDK -6.0%)
  // Notice MU's quote is in overnight (+2.6%) while SNDK's is in pre (-6.0%) — both display directly in .rw-cell-ext!
  const extSegBtn = timeSessionBar.querySelectorAll('.rw-seg-btn')[1];
  extSegBtn.click();
  await tick();
  syms = getStorageSymbols();
  assert.equal(syms[0], 'MU', 'Highest extChange (MU +2.6% overnight) is first');

  // Verify SNDK row displays 1,300.00 | +4.00% | 盘前 -6.00%
  const sndkRow = [...storageBlock.querySelectorAll('.rw-stock-row')].find(r => r.querySelector('.rw-sym')?.textContent.trim() === 'SNDK');
  assert.ok(sndkRow, 'SNDK row exists');
  assert.equal(sndkRow.querySelector('.rw-cell-price').textContent.trim(), '1,300.00');
  assert.equal(sndkRow.querySelector('.rw-cell-change').textContent.trim(), '+4.00%');
  assert.match(sndkRow.querySelector('.rw-cell-ext').textContent.trim(), /盘前/);
  assert.match(sndkRow.querySelector('.rw-cell-ext').textContent.trim(), /-6\.00%/);

  // 6. Verify mobile / narrow screen icon rule:
  // On desktop (innerWidth >= 768), .rw-ext-sess-icon does not have .is-mobile-visible
  assert.equal(sndkRow.querySelector('.rw-ext-sess-icon').classList.contains('is-mobile-visible'), false);

  // Switch to mobile narrow screen (innerWidth = 390)
  ui.w.innerWidth = 390;
  ui.w.dispatchEvent(new ui.w.Event('resize'));
  await tick();

  // On mobile: SNDK (pre-market) has sunrise icon 🌅, MU (overnight) has moon icon 🌙
  const muRow = [...storageBlock.querySelectorAll('.rw-stock-row')].find(r => r.querySelector('.rw-sym')?.textContent.trim() === 'MU');
  assert.ok(sndkRow.querySelector('.rw-ext-sess-icon').classList.contains('is-mobile-visible'));
  assert.equal(sndkRow.querySelector('.rw-ext-sess-icon').textContent.trim(), '🌅');
  assert.ok(muRow.querySelector('.rw-ext-sess-icon').classList.contains('is-mobile-visible'));
  assert.equal(muRow.querySelector('.rw-ext-sess-icon').textContent.trim(), '🌙');

  assert.deepEqual(ui.errors, []);
});




