// DOM integration tests. This does not claim real-browser or visual verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parseFlows } from '../public/flows.js';
import * as watchlistModel from '../public/watchlist-model.js';
import * as earningsCalendarModel from '../public/earnings-calendar-model.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
async function mount(t, fetchImpl) {
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
  const appSrc = (await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8'))
    .replace("import { parseFlows } from './flows.js';", 'const parseFlows = window.parseFlows;')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/watchlist-model\.js';/, 'const { WatchlistManager, sortWatchlistRows, getSelectedExtQuote, MAX_UNIQUE_SYMBOLS, validSymbol, SYMBOL_NAMES, NASDAQ100_STOCKS, SP500_STOCKS, isLeveragedEtf } = window;')
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
  if (u.pathname.includes('/watchlist/quotes')) return { quotes: { NVDA: { symbol: 'NVDA', name: 'NVIDIA', regular: { price: 100, changePercent: 2 }, post: { price: 102, changePercent: 2 }, meta: { status: 'active', delayStatus: 'realtime' } } }, session: { session: 'regular', desc: '常规交易' }, provider: { isConfigured: false, name: 'Longbridge' } };
};
test('Vue page mounts, navigates all modules, wires chart data and handles watchlist', async t => {
  const ui = await mount(t, async url => ({ ok: true, json: async () => fixture(url) }));
  assert.ok(ui.w.document.querySelector('#heatmap-chart')); assert.ok(ui.configs.get('heatmap-chart').series[0].data.length > 0);
  await ui.click('个股行情'); assert.equal(ui.configs.get('price-chart').series[0].data[0][1], 100);
  const search = ui.w.document.querySelector('[aria-label="搜索美股代码"]'); search.value = 'BABA'; search.dispatchEvent(new ui.w.Event('input', { bubbles: true })); search.form.dispatchEvent(new ui.w.Event('submit', { bubbles: true, cancelable: true })); await tick();
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
