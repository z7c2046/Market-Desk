import { parseFlows } from './flows.js';
import { bindKlineGestures } from './composables/klineGesture.js';
import {
  WatchlistManager,
  sortWatchlistRows,
  getSelectedExtQuote,
  getCurrentSession,
  getNyTime,
  SESSION_TYPES,
  MAX_UNIQUE_SYMBOLS,
  validSymbol,
  SYMBOL_NAMES,
  NASDAQ100_STOCKS,
  SP500_STOCKS,
  isLeveragedEtf,
  STOCK_MARKET_CAPS,
  getStockMarketCap,
  sortSymbolsByMarketCap
} from './watchlist-model.js';
import {
  AI_SECTOR_FILTERS,
  EARNINGS_DAYS,
  CORPORATE_LOGOS,
  DEFAULT_TECH_EARNINGS,
  MACRO_CALENDAR_ITEMS,
  filterEarningsByDay
} from './earnings-calendar-model.js';

const { createApp, ref, computed, reactive, watch, nextTick, onMounted, onUnmounted } = window.Vue;
let green = '#187454', red = '#B7424D', blue = '#315EAD';

const nav = [
  { id: 'overview', icon: '◫', label: '市场总览', eyebrow: 'MARKET OVERVIEW', title: '市场，全景在握。', description: '从大盘到板块，从价格到事件。在这里建立你的市场视角。' },
  { id: 'watchlist', icon: '★', label: '自选看板', eyebrow: 'WATCHLIST BOARD', title: '自选动态，多时段兼顾。', description: '自选股分组、常规与盘前/盘后/隔夜报价，支持按时段排序。' },
  { id: 'chart', icon: '⌁', label: '个股行情', eyebrow: 'PRICE & VOLUME', title: '让价格与成交量说话。', description: '查看真实 K 线、成交量与不同周期的价格变化。' },
  { id: 'crypto', icon: '₿', label: '加密货币', eyebrow: 'CRYPTO ASSETS', title: '主流加密资产行情。', description: '市值前列核心加密货币：BTC、ETH、BNB、SOL、XRP、ADA，全天候 24/7 流动性观察。' },
  { id: 'flows', icon: '⇄', label: '资金观察', eyebrow: 'SECTOR ROTATION', title: '关注度，流向哪里？', description: '并排观察板块表现与成交活跃度，单独查看有来源的净申赎数据。' },
  { id: 'options', icon: '◈', label: '期权墙', eyebrow: 'OPTIONS POSITIONING', title: '读懂持仓的分布。', description: '按到期日与行权价，观察 Call / Put 持仓集中区及估算 Gamma 敞口。' },
  { id: 'news', icon: '▤', label: '新闻资讯', eyebrow: 'MARKET BRIEFING', title: '价格背后的新消息。', description: '汇集市场与个股新闻。保留来源，直接阅读原文。' },
  { id: 'sources', icon: 'ⓘ', label: '数据与说明', eyebrow: 'DATA & METHODOLOGY', title: '知道数据从哪里来。', description: '来源、时效与计算口径，都清楚展示。' },
];

const DEFAULT_MACRO = [
  { symbol: '^VIX', displaySymbol: 'VIX', name: '波动率指数', category: 'volatility', icon: '🇺🇸', price: 19.22, changePercent: 1.05 },
  { symbol: '^TNX', displaySymbol: 'US10Y', name: '10年期美债收益率', category: 'rates', icon: '🇺🇸', price: 4.990, changePercent: 0.58 },
  { symbol: 'US20Y', displaySymbol: 'US20Y', name: '20年期美债收益率', category: 'rates', icon: '🇺🇸', price: 5.360, changePercent: 0.66 },
  { symbol: '^TYX', displaySymbol: 'US30Y', name: '30年期美债收益率', category: 'rates', icon: '🇺🇸', price: 5.314, changePercent: 0.53 },
  { symbol: 'DX-Y.NYB', displaySymbol: 'DXY', name: '美元指数', category: 'fx', icon: '💲', price: 101.782, changePercent: 0.16 },
  { symbol: 'CL=F', displaySymbol: 'CL=F', name: 'WTI 原油连续', category: 'commodity', icon: '🛢️', price: 71.32, changePercent: 0.32 },
  { symbol: 'BZ=F', displaySymbol: 'BRN1!', name: '布伦特原油连续', category: 'commodity', icon: '🛢️', price: 117.18, changePercent: 3.54, badge: 'D' },
  { symbol: 'UKOIL', displaySymbol: 'UKOIL', name: '伦敦布伦特现货', category: 'commodity', icon: '🛢️', price: 117.01, changePercent: 3.63 },
  { symbol: 'GC=F', displaySymbol: 'XAU/USD', name: '黄金现货 / 合约', category: 'commodity', icon: '🪙', price: 2748.50, changePercent: 0.65 },
  { symbol: 'CNY=X', displaySymbol: 'USD/CNY', name: '美元兑人民币', category: 'fx', icon: '🇨🇳', price: 7.1200, changePercent: 0.05 }
];

const DEFAULT_FEAR_GREED = {
  score: 28,
  rating: '恐慌',
  ratingEn: 'Fear',
  toneClass: 'kpi-pill-amber',
  previousClose: 29,
  previousWeek: 34,
  previousMonth: 42,
  previousYear: 27,
  description: '市场投资者防御情绪抬升，避险偏好占优，资金流向美债与避险黄金。'
};

const DEFAULT_CRYPTOS = [
  { symbol: 'BTC-USD', code: 'BTC', name: 'Bitcoin 比特币', rank: 1, icon: '₿', iconColor: '#f7931a', price: 68420.00, changePercent: 1.85, marketCap: '1.35T', vol24h: '38.2B', high24h: 68950, low24h: 66820, supply: '19.77M BTC' },
  { symbol: 'ETH-USD', code: 'ETH', name: 'Ethereum 以太坊', rank: 2, icon: 'Ξ', iconColor: '#627eea', price: 2620.50, changePercent: 2.14, marketCap: '315.8B', vol24h: '18.4B', high24h: 2655, low24h: 2540, supply: '120.4M ETH' },
  { symbol: 'BNB-USD', code: 'BNB', name: 'BNB 币安币', rank: 3, icon: '🟡', iconColor: '#f3ba2f', price: 595.30, changePercent: 0.92, marketCap: '89.2B', vol24h: '1.4B', high24h: 602, low24h: 588, supply: '145.8M BNB' },
  { symbol: 'SOL-USD', code: 'SOL', name: 'Solana 索拉纳', rank: 4, icon: '🟣', iconColor: '#14f195', price: 172.40, changePercent: 4.88, marketCap: '81.4B', vol24h: '4.8B', high24h: 176, low24h: 164, supply: '470.2M SOL' },
  { symbol: 'XRP-USD', code: 'XRP', name: 'XRP 瑞波币', rank: 5, icon: '✕', iconColor: '#00aae4', price: 0.542, changePercent: -0.65, marketCap: '30.7B', vol24h: '1.1B', high24h: 0.555, low24h: 0.536, supply: '56.8B XRP' },
  { symbol: 'ADA-USD', code: 'ADA', name: 'Cardano 艾达币', rank: 6, icon: '₳', iconColor: '#0033ad', price: 0.358, changePercent: 1.12, marketCap: '12.8B', vol24h: '340M', high24h: 0.366, low24h: 0.351, supply: '35.7B ADA' }
];

const num = v => Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '—';
const compact = v => Number.isFinite(v) ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(v) : '—';
const pct = v => Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : '—';
const tone = v => !Number.isFinite(v) || v === 0 ? 'muted' : v > 0 ? 'positive' : 'negative';
const time = v => v && Number.isFinite(Date.parse(v)) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(v)) + ' 北京' : '时间未提供';
function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }

function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== 'string') return hex;
  let clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  if (clean.length === 6) {
    const num = parseInt(clean, 16);
    if (!isNaN(num)) {
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return hex;
}

const KLINE_SCHEMES = {
  classic: {
    id: 'classic',
    name: '经典绿红 (图一)',
    shortName: '经典绿红',
    tag: '图一 · 默认',
    description: '经典翡翠绿与珊瑚红，沉稳清晰，全球交易所通用标配',
    up: '#10B981',
    down: '#F43F5E',
    upLabel: '阳线 #10B981',
    downLabel: '阴线 #F43F5E',
    title: '图一：经典绿红 (翡翠绿 #10B981 / 珊瑚红 #F43F5E)'
  },
  neon: {
    id: 'neon',
    name: '荧光极光 (图二)',
    shortName: '亮绿玫粉',
    tag: '图二 · 荧光',
    description: '鲜艳荧光黄绿与鲜亮芭比玫粉，高对比度视觉冲击，极速识别多空阵营',
    up: '#7CE138',
    down: '#FF4D82',
    upLabel: '阳线 #7CE138',
    downLabel: '阴线 #FF4D82',
    title: '图二：荧光极光 (亮绿 #7CE138 / 芭比玫粉 #FF4D82)'
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: '赛博霓虹 (图三)',
    shortName: '青蓝品红',
    tag: '图三 · 赛博',
    description: '电光青蓝与炫彩品红，赛博朋克极客风尚，暗黑科技质感拔群',
    up: '#00D2FF',
    down: '#FF3377',
    upLabel: '阳线 #00D2FF',
    downLabel: '阴线 #FF3377',
    title: '图三：赛博霓虹 (青蓝 #00D2FF / 炫彩品红 #FF3377)'
  }
};
const klineSchemeOptions = Object.values(KLINE_SCHEMES);

createApp({ setup() {
  const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  const savedTheme = readStorage('market-desk-theme', null);
  const isDark = ref(savedTheme === 'dark' || (savedTheme !== 'light' && Boolean(systemTheme?.matches)));
  const savedKlineScheme = readStorage('market-desk-kline-scheme', 'classic');
  const klineScheme = ref(['classic', 'neon', 'cyberpunk'].includes(savedKlineScheme) ? savedKlineScheme : 'classic');
  const savedKlineGrid = readStorage('market-desk-kline-grid', 'dashed');
  const klineGridStyle = ref(['dashed', 'solid', 'none'].includes(savedKlineGrid) ? savedKlineGrid : 'dashed');
  const showPreferencesModal = ref(false);
  const activeKlineScheme = computed(() => KLINE_SCHEMES[klineScheme.value] || KLINE_SCHEMES.classic);

  const DEFAULT_MA_VISIBILITY = {
    ma5: true,
    ma20: true,
    ma60: true,
    ma120: true,
    ma250: true,
    vol: true
  };
  const klineMaVisibility = reactive({
    ...DEFAULT_MA_VISIBILITY,
    ...readStorage('market-desk-ma-visibility', {})
  });

  const MA_CONFIGS = [
    { key: 'ma5', period: 5, label: 'MA5', desc: '5 日短线均线', color: '#f97316' },
    { key: 'ma20', period: 20, label: 'MA20', desc: '20 日月线均线', color: '#3b82f6' },
    { key: 'ma60', period: 60, label: 'MA60', desc: '60 日季线均线', color: '#a855f7' },
    { key: 'ma120', period: 120, label: 'MA120', desc: '120 日半年线', color: '#06b6d4' },
    { key: 'ma250', period: 250, label: 'MA250', desc: '250 日年线', color: '#eab308' },
    {
      key: 'vol',
      period: null,
      label: 'VOL',
      desc: '成交量柱状图',
      get color() {
        return (KLINE_SCHEMES[klineScheme.value] || KLINE_SCHEMES.classic).up;
      }
    }
  ];

  function toggleMa(key) {
    if (!(key in klineMaVisibility)) return;
    klineMaVisibility[key] = !klineMaVisibility[key];
    persist('market-desk-ma-visibility', { ...klineMaVisibility });

    const isVisible = Boolean(klineMaVisibility[key]);

    if (key === 'vol') {
      if (lwVolumeSeries) {
        lwVolumeSeries.applyOptions({ visible: isVisible });
      }
    } else {
      if (lwMaSeriesMap && lwMaSeriesMap[key]) {
        lwMaSeriesMap[key].applyOptions({ visible: isVisible });
      }
    }

    if (charts.has('price-chart')) {
      const entry = charts.get('price-chart');
      if (entry && entry.chart) {
        const nameMap = {
          ma5: 'MA5',
          ma20: 'MA20',
          ma60: 'MA60',
          ma120: 'MA120',
          ma250: 'MA250',
          vol: '成交股数'
        };
        const seriesName = nameMap[key];
        if (seriesName) {
          entry.chart.dispatchAction({
            type: isVisible ? 'legendSelect' : 'legendUnSelect',
            name: seriesName
          });
        }
      }
    }

    const item = MA_CONFIGS.find(m => m.key === key);
    const label = item ? item.label : key.toUpperCase();
    toast.value = `已${isVisible ? '开启' : '关闭'} ${label} 指标`;
  }

  function setAllMaVisibility(visible) {
    const val = Boolean(visible);
    for (const key of Object.keys(DEFAULT_MA_VISIBILITY)) {
      klineMaVisibility[key] = val;
      if (key === 'vol') {
        if (lwVolumeSeries) lwVolumeSeries.applyOptions({ visible: val });
      } else {
        if (lwMaSeriesMap && lwMaSeriesMap[key]) lwMaSeriesMap[key].applyOptions({ visible: val });
      }
    }
    persist('market-desk-ma-visibility', { ...klineMaVisibility });
    if (charts.has('price-chart')) {
      const entry = charts.get('price-chart');
      if (entry && entry.chart) {
        const names = ['MA5', 'MA20', 'MA60', 'MA120', 'MA250', '成交股数'];
        for (const name of names) {
          entry.chart.dispatchAction({
            type: val ? 'legendSelect' : 'legendUnSelect',
            name
          });
        }
      }
    }
    toast.value = `已${val ? '开启全部均线与指标' : '关闭全部均线与指标'}`;
  }

  const klineInteractionMode = ref('follow-latest');
  let lwPriceChart = null;
  let lwCandleSeries = null;
  let lwVolumeSeries = null;
  let lwMaSeriesMap = {};
  let klineGestureCtrl = null;
  let lwChartResizeObserver = null;
  let lastRenderedSymbol = '';
  let lastRenderedRange = '';

  function disposePriceChart() {
    lastRenderedSymbol = '';
    lastRenderedRange = '';
    if (klineGestureCtrl) {
      klineGestureCtrl.dispose();
      klineGestureCtrl = null;
    }
    if (lwChartResizeObserver) {
      lwChartResizeObserver.disconnect();
      lwChartResizeObserver = null;
    }
    if (lwPriceChart) {
      try { lwPriceChart.remove(); } catch (_) {}
      lwPriceChart = null;
      lwCandleSeries = null;
      lwVolumeSeries = null;
      lwMaSeriesMap = {};
    }
  }

  function openPreferencesModal() {
    showPreferencesModal.value = true;
  }
  function closePreferencesModal() {
    showPreferencesModal.value = false;
  }
  function setKlineScheme(scheme) {
    if (KLINE_SCHEMES[scheme]) {
      klineScheme.value = scheme;
      persist('market-desk-kline-scheme', scheme);
      toast.value = `已切换 K 线配色为「${KLINE_SCHEMES[scheme].name}」`;
      render();
    }
  }
  function setKlineGrid(style) {
    klineGridStyle.value = style;
    persist('market-desk-kline-grid', style);
    render();
  }

  const isMobile = ref(window.innerWidth < 768);
  const isWide = ref(window.innerWidth >= 1600);
  const showSettings = ref(false);
  const mobileNav = [
    { id: 'overview', label: '总览', icon: '◫' },
    { id: 'watchlist', label: '自选', icon: '★' },
    { id: 'chart', label: '行情', icon: '⌁' },
    { id: 'crypto', label: '加密', icon: '₿' }
  ];
  const RANGE_OPTIONS = [
    { value: '1d', label: '分时' },
    { value: '1mo', label: '1月' },
    { value: '3mo', label: '3月' },
    { value: '6mo', label: '6月' },
    { value: '1y', label: '1年' },
    { value: '2y', label: '2年' }
  ];
  function openMobileSearch() {
    openSettings();
    nextTick(() => {
      const searchEl = document.querySelector('.sidebar-search-form input');
      if (searchEl) {
        searchEl.focus();
      }
    });
  }
  let themeOverride = savedTheme === 'dark' || savedTheme === 'light';
  let muted, gridColor, chartText, chartSurface, axis, tooltip;

  document.documentElement.classList.toggle('dark', isDark.value);
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
  function toggleTheme() {
    themeOverride = true;
    isDark.value = !isDark.value;
    document.documentElement.classList.toggle('dark', isDark.value);
    document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
    persist('market-desk-theme', isDark.value ? 'dark' : 'light');
  }
  function followSystemTheme(event) { if (!themeOverride) isDark.value = event.matches; }
  function resizeLayout() {
    isMobile.value = window.innerWidth < 768;
    isWide.value = window.innerWidth >= 1600;
    if (!isMobile.value) showSettings.value = false;
  }
  async function openSettings() { showSettings.value = true; await nextTick(); document.querySelector('#workspace-settings .bottom-sheet-handle')?.focus(); }
  async function closeSettings() { if (!showSettings.value) return; showSettings.value = false; await nextTick(); document.querySelector('.settings-trigger')?.focus(); }
  function navigate(id) {
    if (page.value !== id) {
      if (typeof history !== 'undefined' && history.pushState) {
        history.pushState({ page: id, symbol: symbol.value }, '', '#' + id);
      }
      page.value = id;
    }
    closeSettings();
  }
  function onPopState(e) {
    const hash = location.hash.slice(1);
    if (hash && nav.some(n => n.id === hash)) {
      page.value = hash;
    } else if (e.state?.page) {
      page.value = e.state.page;
    }
    if (e.state?.symbol) {
      symbol.value = e.state.symbol;
    }
  }
  function getSparkline(sym, chg) {
    const isUp = (chg || 0) >= 0;
    if (sym === '^GSPC') return isUp ? 'M 2 15 Q 16 20, 32 12 T 76 4' : 'M 2 6 Q 18 5, 36 14 T 76 18';
    if (sym === '^NDX') return isUp ? 'M 2 17 Q 20 16, 38 10 T 76 3' : 'M 2 5 Q 18 10, 38 11 T 76 19';
    if (sym === '^VIX') return isUp ? 'M 2 16 Q 18 18, 36 9 T 76 5' : 'M 2 6 Q 20 5, 40 15 T 76 17';
    if (sym === 'XAU/USD' || sym === 'GC=F') return isUp ? 'M 2 16 Q 22 17, 42 10 T 76 4' : 'M 2 5 Q 22 7, 44 15 T 76 18';
    if (sym === 'CL=F') return isUp ? 'M 2 16 Q 20 14, 40 11 T 76 5' : 'M 2 6 Q 22 7, 42 13 T 76 17';
    if (sym === 'BZ=F' || sym === 'BRN1!') return isUp ? 'M 2 17 Q 18 14, 38 9 T 76 4' : 'M 2 5 Q 20 8, 40 14 T 76 18';
    if (sym === 'DXY' || sym === 'DX-Y.NYB') return isUp ? 'M 2 15 Q 22 18, 42 10 T 76 5' : 'M 2 5 Q 22 4, 42 14 T 76 18';
    if (String(sym).includes('10Y') || sym === '^TNX') return isUp ? 'M 2 16 Q 18 15, 38 11 T 76 6' : 'M 2 5 Q 20 6, 40 15 T 76 19';
    return isUp ? 'M 2 16 Q 20 16, 38 10 T 76 4' : 'M 2 6 Q 20 7, 38 15 T 76 18';
  }
  function handleDrawerKey(event) {
    if (!isMobile.value || !showSettings.value) return;
    if (event.key === 'Escape') { event.preventDefault(); closeSettings(); return; }
    if (event.key !== 'Tab') return;
    const nodes = [...event.currentTarget.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)')];
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  const DEFAULT_PAGE_STORAGE_KEY = 'market-desk-default-page';
  const defaultPageOptions = [
    { id: 'overview', icon: '◫', label: '市场总览', desc: '大盘指数、板块热力图与核心宏观数据' },
    { id: 'watchlist', icon: '★', label: '自选看板', desc: '多分组、多时段价格与盘前/盘后实时看板' },
    { id: 'chart', icon: '⌁', label: '个股行情', desc: '全功能真实 K 线、成交量与均线技术面' },
    { id: 'crypto', icon: '₿', label: '加密货币', desc: '主流资产 24/7 流动性与价格走势观察' },
    { id: 'flows', icon: '⇄', label: '资金观察', desc: '行业板块轮动与 ETF 净申赎资金流向' },
    { id: 'options', icon: '◈', label: '期权持仓', desc: '期权持仓地图与估算 Gamma 集中区' },
    { id: 'news', icon: '▤', label: '新闻资讯', desc: '全天候财经快讯与 AI 穿透深度搜索' },
    { id: 'sources', icon: 'ⓘ', label: '数据说明', desc: '机构级数据来源口径与计算方法说明' },
  ];
  const savedDefaultPage = readStorage(DEFAULT_PAGE_STORAGE_KEY, 'overview');
  const defaultPage = ref(nav.some(n => n.id === savedDefaultPage) ? savedDefaultPage : 'overview');

  function setDefaultPage(pageId) {
    if (nav.some(n => n.id === pageId)) {
      defaultPage.value = pageId;
      persist(DEFAULT_PAGE_STORAGE_KEY, pageId);
      const target = defaultPageOptions.find(p => p.id === pageId);
      toast.value = `已设置默认打开页面为「${target ? target.label : pageId}」`;
    }
  }

  const initial = location.hash.slice(1);
  if (initial === 'settings' || initial === 'preferences') {
    openPreferencesModal();
  }
  const page = ref(nav.some(n => n.id === initial) ? initial : defaultPage.value);
  const currentNav = computed(() => nav.find(n => n.id === page.value) || nav[0]);
  const overview = ref(null), chart = ref(null), options = ref(null), news = ref(null);
  const states = reactive(Object.fromEntries(['overview', 'chart', 'options', 'news', 'watchlist', 'crypto'].map(k => [k, { loading: false, error: '' }])));
  const searchInput = ref(''), symbol = ref('SPY'), chartRange = ref('3mo');
  const optionSymbol = ref('NVDA'), optionExpiry = ref(''), optionMetric = ref('oi'), strikeRange = ref('0.15');
  const newsSymbol = ref(''), newsSearch = ref(''), heatSize = ref('turnover'), sectorFilter = ref('全部');
  const heatmapScope = ref(readStorage('market-desk-heatmap-scope', 'watchlist'));
  function onHeatmapScopeChange() {
    persist('market-desk-heatmap-scope', heatmapScope.value);
    sectorFilter.value = '全部';
    nextTick(() => renderHeatmap());
  }
  const flowTab = ref('rotation'), flows = ref([]), flowDate = ref('');
  const savedFlows = readStorage('market-desk-flows', '');
  try { if (typeof savedFlows === 'string' && savedFlows) flows.value = parseFlows(savedFlows); } catch {}
  flowDate.value = flows.value[0]?.date || '';

  // Crypto state
  const cryptoData = ref(null);
  const selectedCrypto = ref('BTC-USD');
  const cryptoTimeframe = ref('24h');

  // Macro Indicators & CNN Fear & Greed Index
  const macroItems = computed(() => {
    const liveItems = overview.value?.macro || [];
    return DEFAULT_MACRO.map(def => {
      const live = liveItems.find(m => m.displaySymbol === def.displaySymbol || m.symbol === def.symbol);
      const hasLive = live && live.price !== null && Number.isFinite(Number(live.price));
      return {
        ...def,
        price: hasLive ? live.price : null,
        changePercent: hasLive ? (live.changePercent ?? null) : null,
        asOf: live?.asOf || null,
        isLive: Boolean(hasLive)
      };
    });
  });

  const fearGreedIndex = computed(() => {
    const live = overview.value?.fearGreed;
    if (live && live.score !== null && Number.isFinite(Number(live.score))) {
      return live;
    }
    return {
      score: null,
      rating: '暂无读数',
      ratingEn: 'Unavailable',
      toneClass: 'muted',
      previousClose: '—',
      previousWeek: '—',
      previousMonth: '—',
      previousYear: '—',
      description: '暂无实时恐慌贪婪情绪数据'
    };
  });

  const goldContract = computed(() => {
    return macroItems.value.find(m => m.displaySymbol === 'XAU/USD') || DEFAULT_MACRO.find(m => m.displaySymbol === 'XAU/USD') || DEFAULT_MACRO[7];
  });

  const usdCnyRate = computed(() => {
    const item = macroItems.value.find(m => m.displaySymbol === 'USD/CNY' || m.symbol === 'CNY=X');
    const p = Number(item?.price);
    if (Number.isFinite(p) && p > 0) return p;
    return 7.12;
  });

  // 1 金衡盎司 (Troy Ounce, oz t) = 31.1034768 克
  const OUNCE_TO_GRAM = 31.1034768;

  const goldCnyPerGram = computed(() => {
    const priceUsd = Number(goldContract.value?.price);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
    const rate = usdCnyRate.value;
    const cnyPerGram = (priceUsd * rate) / OUNCE_TO_GRAM;
    return {
      price: cnyPerGram.toFixed(2),
      rate: rate.toFixed(4),
      rateShort: rate.toFixed(2)
    };
  });

  const macroMap = computed(() => {
    const map = {};
    for (const m of macroItems.value) {
      map[m.displaySymbol] = m;
    }
    return map;
  });

  function formatMacroPrice(m) {
    if (!m || m.price == null || !Number.isFinite(Number(m.price))) return '—';
    if (m.displaySymbol === 'VIX') return Number(m.price).toFixed(2);
    if (m.displaySymbol.startsWith('US')) return Number(m.price).toFixed(3) + '%';
    if (m.displaySymbol === 'DXY') return Number(m.price).toFixed(3);
    if (m.displaySymbol === 'BRN1!' || m.displaySymbol === 'UKOIL') return Number(m.price).toFixed(2);
    if (m.displaySymbol === 'XAU/USD') return '$' + Number(m.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return Number(m.price).toFixed(2);
  }

  // Crypto Currency Board (Top Market Cap: BTC, ETH, BNB, SOL, XRP, ADA)
  const cryptoList = computed(() => {
    const liveItems = overview.value?.crypto || cryptoData.value?.items || [];
    return DEFAULT_CRYPTOS.map(def => {
      const live = liveItems.find(c => c.code === def.code || c.symbol === def.symbol);
      const hasLive = live && live.price !== null && Number.isFinite(Number(live.price));
      return {
        ...def,
        price: hasLive ? live.price : null,
        changePercent: hasLive ? (live.changePercent ?? null) : null,
        high24h: hasLive ? (live.high24h ?? null) : null,
        low24h: hasLive ? (live.low24h ?? null) : null,
        vol24h: hasLive ? (live.vol24h ?? null) : null,
        marketCap: live?.marketCap ?? def.marketCap,
        asOf: live?.asOf || null,
        bars: live?.bars || [],
        isLive: Boolean(hasLive)
      };
    });
  });

  const selectedCryptoItem = computed(() => {
    return cryptoList.value.find(c => c.symbol === selectedCrypto.value) || cryptoList.value[0];
  });

  function formatCryptoPrice(p) {
    if (p == null || !Number.isFinite(Number(p))) return '—';
    const val = Number(p);
    if (val >= 100) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toFixed(3);
    return val.toFixed(4);
  }

  function getCryptoRangePct(c) {
    if (!c || c.high24h <= c.low24h) return 50;
    const pctVal = ((c.price - c.low24h) / (c.high24h - c.low24h)) * 100;
    return Math.max(5, Math.min(95, Math.round(pctVal)));
  }

  function selectCryptoCoin(sym) {
    selectedCrypto.value = sym;
    nextTick(() => renderCryptoChart());
  }

  // Watchlist Model & Manager (v2)
  const storage = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  const watchlistMgr = new WatchlistManager({ storage });

  function cloneWatchlistData(src) {
    if (!src) return { groups: [], preferences: {} };
    return {
      ...src,
      groups: (src.groups || []).map(g => ({
        ...g,
        symbolIds: Array.isArray(g.symbolIds) ? [...g.symbolIds] : []
      })),
      preferences: { ...(src.preferences || {}) }
    };
  }

  const watchlistData = ref(cloneWatchlistData(watchlistMgr.data));
  const groups = computed(() => (watchlistData.value && watchlistData.value.groups) || []);
  const watchlist = computed(() => watchlistMgr.getAllUniqueSymbols());

  function syncWatchlistData() {
    watchlistData.value = cloneWatchlistData(watchlistMgr.data);
  }

  // Watchlist Preferences & State
  const viewMode = ref(watchlistMgr.data.preferences.viewMode || 'grouped');
  const extMode = ref(watchlistMgr.data.preferences.extMode || 'auto');
  const sortField = ref(watchlistMgr.data.preferences.sortField || 'extChange');
  const sortDirection = ref(watchlistMgr.data.preferences.sortDirection || 'desc');
  const freezeResort = ref(Boolean(watchlistMgr.data.preferences.freezeResort));
  const compactPanelOpen = ref(true);

  const currentPageTitle = computed(() => {
    const item = nav.find(n => n.id === page.value);
    return item ? item.label : '市场总览';
  });

  function deleteStockDirect(sym) {
    removeWatch(sym);
    toast.value = `已移出自选：${sym}`;
  }

  function cycleSessionMode() {
    const modes = ['auto', 'pre', 'regular', 'post', 'overnight'];
    const idx = modes.indexOf(extMode.value);
    extMode.value = modes[(idx + 1) % modes.length];
  }
  const refreshWatchlistQuotes = fetchWatchlistQuotes;

  // Quote Store & Session
  const quoteStore = ref({});
  const providerInfo = ref({ name: 'Longbridge', status: 'unconfigured', reason: '', isConfigured: false });
  const cellFlashes = reactive({}); // `${symbol}_${field}` -> 'up' | 'down'

  // Modals & UI Controls
  const showGroupModal = ref(false);
  const showAddStockModal = ref(false);
  const showBackupModal = ref(false);
  const newGroupName = ref('');
  const addStockInput = ref('');
  const addStockTargetGroup = ref('default');
  const backupJsonText = ref('');
  const isInteractingWithTable = ref(false);

  // Quick Stock Detail Modal (on heatmap tile click)
  const stockModal = ref({
    open: false,
    stock: null,
    rank: 1,
    estVolume: '',
    sourceTime: ''
  });

  function openHeatmapStockModal(quote) {
    if (!quote) return;
    const sorted = [...(overview.value?.stocks || [])].sort((a, b) => (b.turnover || 0) - (a.turnover || 0));
    const rankIdx = sorted.findIndex(s => s.symbol === quote.symbol);
    const rank = rankIdx >= 0 ? rankIdx + 1 : 1;

    const estVolText = (quote.turnover !== null && Number.isFinite(quote.turnover) && quote.turnover > 0)
      ? `$${compact(quote.turnover)}`
      : '未提供';

    stockModal.value = {
      open: true,
      stock: quote,
      rank,
      estVolume: estVolText,
      sourceTime: quote.asOf ? time(quote.asOf) : '未提供'
    };
    nextTick(() => {
      document.querySelector('.stock-modal-close-btn')?.focus();
    });
  }

  function closeStockModal() {
    stockModal.value.open = false;
  }

  function viewStockFromModal() {
    if (stockModal.value.stock) {
      selectSymbol(stockModal.value.stock.symbol);
    }
    stockModal.value.open = false;
  }

  // CNN Fear & Greed Index Dial Modal (CNN 原版原貌仪表盘)
  const showFearGreedModal = ref(false);
  function openFearGreedModal() {
    showFearGreedModal.value = true;
  }
  function closeFearGreedModal() {
    showFearGreedModal.value = false;
  }

  // US Treasury 10Y / 20Y / 30Y Yields Modal
  const showTreasuryModal = ref(false);
  function openTreasuryModal() {
    showTreasuryModal.value = true;
  }
  function closeTreasuryModal() {
    showTreasuryModal.value = false;
  }
  const spread30Y10Y = computed(() => {
    const y30 = macroMap.value.US30Y?.price;
    const y10 = macroMap.value.US10Y?.price;
    if (y30 != null && y10 != null && Number.isFinite(Number(y30)) && Number.isFinite(Number(y10))) {
      return Number(y30) - Number(y10);
    }
    return 0.327;
  });
  const spread20Y10Y = computed(() => {
    const y20 = macroMap.value.US20Y?.price;
    const y10 = macroMap.value.US10Y?.price;
    if (y20 != null && y10 != null && Number.isFinite(Number(y20)) && Number.isFinite(Number(y10))) {
      return Number(y20) - Number(y10);
    }
    return 0.297;
  });
  const isCurveInverted = computed(() => spread30Y10Y.value < 0);

  function getFearGreedRatingText(score) {
    if (score == null) return 'Neutral 中性';
    if (score <= 25) return 'Extreme Fear 极度恐慌';
    if (score <= 45) return 'Fear 恐慌';
    if (score <= 55) return 'Neutral 中性';
    if (score <= 75) return 'Greed 贪婪';
    return 'Extreme Greed 极度贪婪';
  }

  function getFearGreedTone(score) {
    if (score == null) return 'tone-neutral';
    if (score <= 25) return 'tone-extreme-fear';
    if (score <= 45) return 'tone-fear';
    if (score <= 55) return 'tone-neutral';
    if (score <= 75) return 'tone-greed';
    return 'tone-extreme-greed';
  }

  const fearGreedIndicators = computed(() => {
    const s = fearGreedIndex.value.score || 28;
    return [
      {
        id: 'momentum',
        name: 'Market Momentum (市场动能)',
        metric: 'S&P 500 与 125 天均线偏离度',
        status: s <= 25 ? 'Extreme Fear 极度恐慌' : s < 45 ? 'Fear 恐慌' : s > 55 ? 'Greed 贪婪' : 'Neutral 中性',
        toneClass: s <= 25 ? 'tone-extreme-fear' : s < 45 ? 'tone-fear' : s > 55 ? 'tone-greed' : 'tone-neutral',
        desc: '衡量大盘相对于 125 日长期中枢的趋势。指数低于 125MA 显示下行动量加剧。'
      },
      {
        id: 'strength',
        name: 'Stock Price Strength (股价强度)',
        metric: '纽交所 52 周新高与新低股票净差',
        status: s <= 25 ? 'Extreme Fear 极度恐慌' : s <= 45 ? 'Fear 恐慌' : 'Neutral 中性',
        toneClass: s <= 25 ? 'tone-extreme-fear' : s <= 45 ? 'tone-fear' : 'tone-neutral',
        desc: '创 52 周新低的个股数量显著超越创历史新高的股票，反映广度偏弱。'
      },
      {
        id: 'breadth',
        name: 'Stock Price Breadth (股价广度)',
        metric: '麦克莱伦成交量累积指数 (McClellan Index)',
        status: s <= 25 ? 'Extreme Fear 极度恐慌' : s <= 45 ? 'Fear 恐慌' : 'Neutral 中性',
        toneClass: s <= 25 ? 'tone-extreme-fear' : s <= 45 ? 'tone-fear' : 'tone-neutral',
        desc: '全市场下跌股成交量显著高于上涨股，资金偏向避险防御态势。'
      },
      {
        id: 'options',
        name: 'Put and Call Options (期权多空比)',
        metric: 'Cboe 5日平滑看跌/看涨期权成交比 (PCR)',
        status: 'Extreme Fear 极度恐慌',
        toneClass: 'tone-extreme-fear',
        desc: 'Put 成交量高位运行（PCR > 1.0），机构与交易者积极买入看跌期权对冲下行风险。'
      },
      {
        id: 'volatility',
        name: 'Market Volatility (市场波动率)',
        metric: 'CBOE VIX 恐慌指数与其 50 天均线对比',
        status: s <= 45 ? 'Fear 恐慌' : 'Neutral 中性',
        toneClass: s <= 45 ? 'tone-fear' : 'tone-neutral',
        desc: 'VIX 波动率读数位于 50 日均线上方，期权定价反映未来 30 天震荡预期走高。'
      },
      {
        id: 'safe_haven',
        name: 'Safe Haven Demand (避险需求)',
        metric: '20日美股 (SPY) vs 长期美债 (TLT) 收益率差',
        status: 'Extreme Fear 极度恐慌',
        toneClass: 'tone-extreme-fear',
        desc: '避险美债与黄金资产跑赢风险资产，资金更倾向保本防御配置。'
      },
      {
        id: 'junk_bond',
        name: 'Junk Bond Demand (垃圾债需求)',
        metric: '高收益企业债利差 (HYG Spread over LQD)',
        status: s <= 50 ? 'Fear 恐慌' : 'Greed 贪婪',
        toneClass: s <= 50 ? 'tone-fear' : 'tone-greed',
        desc: '高收益垃圾债信用利差维持走阔溢价，反映信用市场对违约风险要求更高补偿。'
      }
    ];
  });

  // ── Tier 4: Periodic & Timing Store (Server Clock Calibration) ──
  const clockOffset = ref(0);
  function getAuthoritativeTime() {
    return new Date(Date.now() + clockOffset.value);
  }
  function calibrateClock(serverDateHeader) {
    if (!serverDateHeader) return;
    const serverTimeMs = new Date(serverDateHeader).getTime();
    if (!Number.isNaN(serverTimeMs)) {
      clockOffset.value = serverTimeMs - Date.now();
    }
  }

  const toast = ref(''), undoAction = ref(null), importing = ref(false), clock = ref(getAuthoritativeTime());
  const serverSession = ref(null);
  const currentSession = computed(() => {
    return serverSession.value || (typeof getCurrentSession === 'function' ? getCurrentSession(clock.value) : { session: 'regular', isExt: false, desc: '常规交易' });
  });
  const nyClock = computed(() => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(clock.value));
  const nyClockDetailed = computed(() => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(clock.value));
  const nyClockInfo = computed(() => {
    const d = clock.value;
    try {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
        hour12: false
      });
      const parts = dtf.formatToParts(d);
      const tz = parts.find(p => p.type === 'timeZoneName')?.value || 'ET';
      const hour = parts.find(p => p.type === 'hour')?.value || '00';
      const minute = parts.find(p => p.type === 'minute')?.value || '00';
      const nyTime = `${hour}:${minute}`;

      const nyDate = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'America/New_York',
        month: '2-digit',
        day: '2-digit'
      }).format(d);

      const bjTime = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(d);

      return {
        nyTime,
        nyTz: tz,
        nyDate: nyDate + ' 美东',
        bjTime: bjTime + ' 北京',
        fullBadge: `${nyDate} ${nyTime} ${tz} · 北京 ${bjTime}`
      };
    } catch {
      return {
        nyTime: '00:00',
        nyTz: 'ET',
        nyDate: '美东',
        bjTime: '北京',
        fullBadge: '美东 / 北京'
      };
    }
  });
  const sessionStatusText = computed(() => currentSession.value?.desc || '正常交易中');
  const dateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(clock.value));
  const refreshing = computed(() => Object.values(states).some(s => s.loading));
  const nonLeveragedWatchlist = computed(() => {
    return (watchlist.value || []).filter(sym => !isLeveragedEtf(sym, SYMBOL_NAMES[sym]));
  });
  const activeHeatmapStocks = computed(() => {
    if (heatmapScope.value === 'watchlist') {
      const symbols = nonLeveragedWatchlist.value;
      if (!symbols.length) return overview.value?.stocks || [];
      return symbols.map(sym => {
        const overviewStock = (overview.value?.stocks || []).find(s => s.symbol === sym);
        const q = quoteStore.value[sym] || overviewStock || {};
        const reg = q.regular || q;
        const ext = getSelectedExtQuote(q, extMode.value, currentSession.value);
        const groupNames = watchlistMgr.getGroupsForSymbol(sym);
        const groupName = (typeof groupNames[0] === 'string' && groupNames[0]) || (watchlistMgr.data.groups || []).find(g => (g.symbolIds || []).includes(sym))?.name || overviewStock?.sector || '自选标的';
        const price = ext.price ?? reg.price ?? (q.price != null ? q.price : (overviewStock?.price ?? null));
        const change = ext.changePercent ?? reg.changePercent ?? (q.changePercent != null ? q.changePercent : (overviewStock?.changePercent ?? null));
        const turnover = (reg.volume && price) ? (reg.volume * price) : (reg.turnover ?? q.turnover ?? overviewStock?.turnover ?? null);
        return {
          symbol: sym,
          name: SYMBOL_NAMES[sym] || q.name || overviewStock?.name || sym,
          sector: groupName,
          price,
          changePercent: change,
          turnover,
          asOf: reg.sourceTime || q.meta?.updatedAt || overviewStock?.asOf || null
        };
      });
    }

    if (heatmapScope.value === 'nasdaq100') {
      return NASDAQ100_STOCKS.map(def => {
        const q = quoteStore.value[def.symbol] || (overview.value?.stocks || []).find(s => s.symbol === def.symbol) || {};
        const reg = q.regular || {};
        const price = reg.price ?? (q.price != null ? q.price : null);
        const change = reg.changePercent ?? (q.changePercent != null ? q.changePercent : null);
        const turnover = (reg.volume && price) ? (reg.volume * price) : (q.turnover ?? null);
        return {
          ...def,
          price,
          changePercent: change,
          turnover,
          asOf: reg.sourceTime || q.asOf || null
        };
      });
    }

    if (heatmapScope.value === 'sp500') {
      return SP500_STOCKS.map(def => {
        const q = quoteStore.value[def.symbol] || (overview.value?.stocks || []).find(s => s.symbol === def.symbol) || {};
        const reg = q.regular || {};
        const price = reg.price ?? (q.price != null ? q.price : null);
        const change = reg.changePercent ?? (q.changePercent != null ? q.changePercent : null);
        const turnover = (reg.volume && price) ? (reg.volume * price) : (q.turnover ?? null);
        return {
          ...def,
          price,
          changePercent: change,
          turnover,
          asOf: reg.sourceTime || q.asOf || null
        };
      });
    }

    // fallback: core 18
    return overview.value?.stocks || [];
  });

  const missingTurnoverCount = computed(() => {
    return activeHeatmapStocks.value.filter(q => q.turnover === null || !Number.isFinite(q.turnover) || q.turnover <= 0).length;
  });

  const stockSectors = computed(() => [...new Set(activeHeatmapStocks.value.map(q => q.sector))].filter(Boolean));
  const DEFAULT_SECTORS_FALLBACK = [
    { symbol: 'XLE', name: '能源', changePercent: 2.60 },
    { symbol: 'XLK', name: '科技', changePercent: 0.49 },
    { symbol: 'XLRE', name: '房地产', changePercent: 0.12 },
    { symbol: 'XLU', name: '公用事业', changePercent: -0.72 },
    { symbol: 'XLB', name: '原材料', changePercent: -0.74 },
    { symbol: 'XLV', name: '医疗保健', changePercent: -1.11 },
    { symbol: 'XLI', name: '工业', changePercent: -1.27 },
    { symbol: 'XLF', name: '金融', changePercent: -1.32 },
    { symbol: 'XLY', name: '可选消费', changePercent: -1.66 },
    { symbol: 'XLC', name: '通信服务', changePercent: -1.78 },
    { symbol: 'XLP', name: '必需消费', changePercent: -1.92 },
  ];
  const rankedSectors = computed(() => {
    const list = overview.value?.sectors;
    if (Array.isArray(list) && list.length > 0) {
      return [...list].sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity));
    }
    return DEFAULT_SECTORS_FALLBACK;
  });

  const activeMacroTab = ref('主要指数');
  const heatmapTimeRange = ref('今日');
  const rightWatchlistCollapsed = ref(false);

  function cycleExtMode() {
    const modes = ['auto', 'pre', 'post', 'overnight'];
    const idx = modes.indexOf(extMode.value);
    extMode.value = modes[(idx + 1) % modes.length];
  }

  const extModeLabel = computed(() => {
    if (extMode.value === 'auto') {
      const s = currentSession.value.session;
      const sName = s === 'pre' ? '盘前' : s === 'post' ? '盘后' : s === 'overnight' ? '隔夜' : '常规';
      return `自动 · 当前${sName}`;
    }
    if (extMode.value === 'pre') return '盘前交易';
    if (extMode.value === 'post') return '盘后交易';
    if (extMode.value === 'overnight') return '隔夜交易';
    return '自动';
  });

  const lastUpdateTimeFormatted = computed(() => {
    const d = clock.value || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${y}/${m}/${day} ${hh}:${mm}:${ss}`;
  });

  const bjTimeFormatted = computed(() => {
    const d = clock.value || new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });

  const overviewCards10 = computed(() => {
    const findBench = sym => (overview.value?.benchmarks || []).find(b => b.symbol === sym);
    const sp500 = findBench('^GSPC') || { symbol: '^GSPC', name: '标普 500 指数', price: 7694.60, changePercent: 0.93, turnover: 5300000000000, asOf: '10/26 23:09 北京' };
    const ndx = findBench('^NDX') || { symbol: '^NDX', name: '纳斯达克 100 指数', price: 29355.82, changePercent: 1.38, turnover: 11560000000000, asOf: '10/26 23:09 北京' };
    const dji = findBench('^DJI') || { symbol: '^DJI', name: '道琼斯工业指数', price: 52466.80, changePercent: 0.48, turnover: 5450000000000, asOf: '10/26 23:09 北京' };
    const vix = findBench('^VIX') || macroMap.value['VIX'] || { symbol: '^VIX', name: '波动率 VIX', price: 17.90, changePercent: -7.97, asOf: '10/26 22:54 北京' };

    const fg = fearGreedIndex.value || { score: 30, rating: '恐慌', ratingEn: 'Fear', previousClose: 21, previous1Week: 21, previous1Month: 37 };
    const gold = goldContract.value || { symbol: 'XAU/USD', name: '黄金连续', price: 4037.60, changePercent: 0.74, subText: 'COMEX', asOf: '10/26 24:00 北京' };
    const us10y = macroMap.value['US10Y'] || { symbol: 'US10Y', name: '美债收益率 10Y 基准', price: 4.974, changePercent: -0.28, isYield: true, asOf: '10/26 23:35 北京' };
    const dxy = macroMap.value['DXY'] || { symbol: 'DXY', name: '美元指数', price: 101.984, changePercent: 0.17, asOf: '10/26 18:34 北京' };
    const brent = macroMap.value['BRN1!'] || macroMap.value['BZ=F'] || { symbol: 'BZ=F', name: '布伦特原油', price: 110.16, changePercent: -5.62, asOf: '10/26 18:35 北京' };
    const btc = (cryptoList.value || []).find(c => c.code === 'BTC') || { symbol: 'BTC/USD', name: '比特币龙头', price: 80317.65, changePercent: 0.37, marketCap: '1.35T' };

    return [
      {
        id: 'sp500',
        name: '标普 500 指数',
        ticker: '^GSPC',
        price: num(sp500.price),
        change: sp500.changePercent,
        chgFormatted: pct(sp500.changePercent),
        sub: '成交: ' + (sp500.turnover ? (sp500.turnover >= 1e12 ? '$' + (sp500.turnover / 1e12).toFixed(2) + 'T' : '$' + (sp500.turnover / 1e9).toFixed(2) + 'B') : '$5.30T') + ' · ' + (sp500.asOf ? time(sp500.asOf) : '10/26 23:09 北京'),
        type: 'sparkline'
      },
      {
        id: 'ndx',
        name: '纳斯达克 100 指数',
        ticker: '^NDX',
        price: num(ndx.price),
        change: ndx.changePercent,
        chgFormatted: pct(ndx.changePercent),
        sub: '成交: ' + (ndx.turnover ? (ndx.turnover >= 1e12 ? '$' + (ndx.turnover / 1e12).toFixed(2) + 'T' : '$' + (ndx.turnover / 1e9).toFixed(2) + 'B') : '$11.56T') + ' · ' + (ndx.asOf ? time(ndx.asOf) : '10/26 23:09 北京'),
        type: 'sparkline'
      },
      {
        id: 'dji',
        name: '道琼斯工业指数',
        ticker: '^DJI',
        price: num(dji.price),
        change: dji.changePercent,
        chgFormatted: pct(dji.changePercent),
        sub: '成交: ' + (dji.turnover ? (dji.turnover >= 1e12 ? '$' + (dji.turnover / 1e12).toFixed(2) + 'T' : '$' + (dji.turnover / 1e9).toFixed(2) + 'B') : '$5.45T') + ' · ' + (dji.asOf ? time(dji.asOf) : '10/26 23:09 北京'),
        type: 'sparkline'
      },
      {
        id: 'vix',
        name: '波动率 VIX',
        ticker: '^VIX',
        price: num(vix.price),
        change: vix.changePercent,
        chgFormatted: pct(vix.changePercent),
        tag: '常态波动',
        sub: '低波动区间 · ' + (vix.asOf ? time(vix.asOf) : '10/26 22:54 北京'),
        type: 'tag'
      },
      {
        id: 'fearGreed',
        name: 'CNN 恐慌贪婪',
        ticker: '情绪指数',
        price: (fg.score || 30) + ' / 100',
        score: fg.score || 30,
        tag: (fg.rating || '恐慌') + ' (' + (fg.ratingEn || 'Fear') + ')',
        sub: '前收: ' + (fg.previousClose || 21) + ' · 1周: ' + (fg.previous1Week || 21) + ' · 1月: ' + (fg.previous1Month || 37),
        actionText: '原版仪表盘 ↗',
        type: 'fearGreed'
      },
      {
        id: 'gold',
        name: '黄金连续',
        ticker: 'XAU/USD',
        price: '$' + num(gold.price),
        change: gold.changePercent,
        chgFormatted: pct(gold.changePercent),
        tag: '避险锚',
        sub: '折合 ¥865.82/克 (汇率 6.67)',
        footTag: 'COMEX 24h',
        type: 'gold'
      },
      {
        id: 'us10y',
        name: '美债收益率',
        ticker: '10Y 基准',
        price: (typeof us10y.price === 'number' ? us10y.price.toFixed(3) + '%' : formatMacroPrice(us10y)) + ' US10Y',
        change: us10y.changePercent,
        chgFormatted: pct(us10y.changePercent),
        tag: '10Y 基准',
        actionTop: '曲线全景 ↗',
        sub: '仅显 10Y 基准',
        actionBottom: '点击展开 10/20/30Y ↗',
        type: 'treasury'
      },
      {
        id: 'dxy',
        name: '美元指数',
        ticker: 'DXY',
        price: num(dxy.price),
        change: dxy.changePercent,
        chgFormatted: pct(dxy.changePercent),
        sub: 'ICE 美元指数 · 24h 汇率锚',
        type: 'sparkline'
      },
      {
        id: 'brent',
        name: '布伦特原油',
        ticker: 'BRN1!',
        price: '$' + num(brent.price),
        change: brent.changePercent,
        chgFormatted: pct(brent.changePercent),
        sub: 'ICE 伦敦原油连续 · 能源基准',
        type: 'sparkline'
      },
      {
        id: 'btc',
        name: '比特币龙头',
        ticker: 'BTC/USD',
        price: '$' + num(btc.price),
        change: btc.changePercent,
        chgFormatted: pct(btc.changePercent),
        tag: '24/7 加密 ↗',
        sub: '市值: $' + (btc.marketCap || '1.35T'),
        actionBottom: '前6大主流币 ➔',
        type: 'crypto'
      }
    ];
  });
  const overviewCards8 = overviewCards10;
  const upSectorsCount = computed(() => rankedSectors.value.filter(s => (s.changePercent || 0) > 0).length);
  const downSectorsCount = computed(() => rankedSectors.value.filter(s => (s.changePercent || 0) < 0).length);
  const upSectorsRatio = computed(() => {
    const total = upSectorsCount.value + downSectorsCount.value;
    return total > 0 ? Math.round((upSectorsCount.value / total) * 100) : 50;
  });

  // 11 Sectors Leader Tickers Map & Computed Metrics for Flows
  const SECTOR_LEADERS = {
    XLK: 'NVDA, MSFT, AAPL',
    XLC: 'META, GOOGL, NFLX',
    XLY: 'AMZN, TSLA, HD',
    XLP: 'PG, COST, WMT',
    XLE: 'XOM, CVX, COP',
    XLF: 'JPM, BRK.B, BAC',
    XLV: 'LLY, UNH, JNJ',
    XLI: 'GE, CAT, UNP',
    XLB: 'LIN, SHW, APD',
    XLRE: 'PLD, AMT, EQIX',
    XLU: 'NEE, SO, DUK'
  };
  const topGainerSector = computed(() => rankedSectors.value[0] || null);
  const topLoserSector = computed(() => rankedSectors.value[rankedSectors.value.length - 1] || null);
  const mostActiveSector = computed(() => {
    const list = [...rankedSectors.value].filter(s => s.turnover !== null);
    list.sort((a, b) => (b.turnover || 0) - (a.turnover || 0));
    return list[0] || null;
  });
  const totalSectorTurnover = computed(() => {
    return rankedSectors.value.reduce((acc, s) => acc + (s.turnover || 0), 0);
  });
  const avgSectorTurnover = computed(() => {
    const count = rankedSectors.value.filter(s => s.turnover !== null).length;
    return count > 0 ? totalSectorTurnover.value / count : 0;
  });
  const sectorBullBearRatio = computed(() => {
    const up = upSectorsCount.value;
    const down = Math.max(1, downSectorsCount.value);
    return (up / down).toFixed(2);
  });

  // Options Computed Metrics
  const callWallDist = computed(() => {
    if (!options.value?.spot || !options.value?.callWall?.[0]) return '+2.88';
    const dist = ((options.value.callWall[0] / options.value.spot) - 1) * 100;
    return (dist >= 0 ? '+' : '') + dist.toFixed(2);
  });
  const putWallDist = computed(() => {
    if (!options.value?.spot || !options.value?.putWall?.[0]) return '-3.97';
    const dist = ((options.value.putWall[0] / options.value.spot) - 1) * 100;
    return (dist >= 0 ? '+' : '') + dist.toFixed(2);
  });

  const optionsSpotQuote = computed(() => {
    const sym = (options.value?.symbol || optionSymbol.value || '').toUpperCase();
    if (!sym) return null;
    return overview.value?.stocks?.find(s => s.symbol === sym) ||
           watchlist.value?.find(w => w.symbol === sym) ||
           null;
  });

  function formatExpiryLabel(dateStr) {
    if (!dateStr || dateStr === 'all') return '全部未过期日';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const weekday = days[dt.getDay()] || '';
      return `${dateStr} (${weekday})`;
    } catch {
      return dateStr;
    }
  }

  const butterflyOptionRows = computed(() => {
    const d = options.value;
    if (!d || !d.rows || !d.rows.length) return [];
    const isGex = optionMetric.value === 'gex';
    const rangeVal = strikeRange.value;

    let filtered = d.rows.filter(r => {
      if (rangeVal === 'all') return true;
      return Math.abs(r.strike / d.spot - 1) <= Number(rangeVal);
    });

    if (!filtered.length) return [];

    // Filter to readable major strike steps if too many strikes (e.g. NVDA has 50+ strikes)
    if (filtered.length > 15) {
      const step = d.spot > 150 ? 5 : (d.spot > 50 ? 2.5 : 1);
      const isStepMatch = (val) => {
        const rem = Math.abs(val % step);
        return rem < 0.001 || Math.abs(rem - step) < 0.001;
      };
      const candidateRows = filtered.filter(r => 
        isStepMatch(r.strike) ||
        (d.callWall && d.callWall.includes(r.strike)) ||
        (d.putWall && d.putWall.includes(r.strike))
      );
      if (candidateRows.length >= 8 && candidateRows.length <= 22) {
        filtered = candidateRows;
      } else if (candidateRows.length > 22) {
        // Center around spot
        filtered = candidateRows.sort((a, b) => Math.abs(a.strike - d.spot) - Math.abs(b.strike - d.spot)).slice(0, 15).sort((a, b) => a.strike - b.strike);
      }
    }

    // Insert Spot row if not an exact strike
    let rowsWithSpot = [];
    const hasExactSpot = filtered.some(r => Math.abs(r.strike - d.spot) < 0.001);

    if (hasExactSpot) {
      rowsWithSpot = filtered.map(r => ({
        ...r,
        isSpot: Math.abs(r.strike - d.spot) < 0.001
      }));
    } else {
      let prevRow = null;
      let inserted = false;
      for (let i = 0; i < filtered.length; i++) {
        const r = filtered[i];
        if (!inserted && r.strike > d.spot) {
          const nextR = r;
          const prevR = prevRow || r;
          rowsWithSpot.push({
            strike: d.spot,
            isSpot: true,
            syntheticSpot: true,
            callOi: Math.round(((prevR.callOi || 0) + (nextR.callOi || 0)) / 2),
            putOi: Math.round(((prevR.putOi || 0) + (nextR.putOi || 0)) / 2),
            callGex: Math.round(((prevR.callGex || 0) + (nextR.callGex || 0)) / 2),
            putGex: Math.round(((prevR.putGex || 0) + (nextR.putGex || 0)) / 2)
          });
          inserted = true;
        }
        rowsWithSpot.push({ ...r, isSpot: false });
        prevRow = r;
      }
      if (!inserted) {
        const lastR = filtered[filtered.length - 1] || {};
        rowsWithSpot.push({
          strike: d.spot,
          isSpot: true,
          syntheticSpot: true,
          callOi: lastR.callOi || 0,
          putOi: lastR.putOi || 0,
          callGex: lastR.callGex || 0,
          putGex: lastR.putGex || 0
        });
      }
    }

    let maxCall = 1;
    let maxPut = 1;
    for (const r of rowsWithSpot) {
      const cv = isGex ? Math.abs(r.callGex || 0) : (r.callOi || 0);
      const pv = isGex ? Math.abs(r.putGex || 0) : (r.putOi || 0);
      if (cv > maxCall) maxCall = cv;
      if (pv > maxPut) maxPut = pv;
    }
    const maxVal = Math.max(maxCall, maxPut, 1);

    const formatVal = (v) => {
      if (!v || v === 0) return '';
      if (isGex) {
        if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B';
        if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
        if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + 'K';
        return String(Math.round(v));
      } else {
        if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
        if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
        return String(v);
      }
    };

    return rowsWithSpot.map(r => {
      const isCallWall = Boolean(!r.isSpot && d.callWall && d.callWall.includes(r.strike));
      const isPutWall = Boolean(!r.isSpot && d.putWall && d.putWall.includes(r.strike));
      const isSpotNearest = Boolean(r.isSpot);

      const rawCall = isGex ? (r.callGex || 0) : (r.callOi || 0);
      const rawPut = isGex ? Math.abs(r.putGex || 0) : (r.putOi || 0);

      const callWidthPct = rawCall > 0 ? Math.min(75, Math.max(3, (rawCall / maxVal) * 75)) : 0;
      const putWidthPct = rawPut > 0 ? Math.min(75, Math.max(3, (rawPut / maxVal) * 75)) : 0;

      let strikeLabel = `$${r.strike}`;
      if (isSpotNearest) {
        strikeLabel = `$${num(d.spot)} (现价)`;
      } else if (isCallWall) {
        strikeLabel = `$${r.strike} (Call Wall)`;
      } else if (isPutWall) {
        strikeLabel = `$${r.strike} (Put Wall)`;
      }

      return {
        strike: r.strike,
        strikeLabel,
        isCallWall,
        isPutWall,
        isSpotNearest,
        callVal: rawCall,
        putVal: rawPut,
        callWidthPct,
        putWidthPct,
        callText: formatVal(rawCall),
        putText: formatVal(rawPut)
      };
    });
  });

  // News Prototype & Masonry Waterfall Engine
  const DEFAULT_PROTOTYPE_NEWS = [
    {
      title: 'In pictures: Initially peaceful protests across France over inequality again descend into violence',
      url: 'https://www.cnbc.com/2026/10/25/france-protests-inequality-violence.html',
      source: 'CNBC',
      publishedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&auto=format&fit=crop&q=80',
      tags: ['France', 'Protests', 'Europe'],
      isFeatured: true
    },
    {
      title: 'More than a third of S&P 500 companies are about to report earnings as market confidence cracks',
      url: 'https://www.marketwatch.com/story/sp500-earnings-season-preview-2026',
      source: 'MarketWatch',
      publishedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=80',
      tags: ['Earnings', 'S&P 500', 'Markets']
    },
    {
      title: 'Saudi Arabia says it intercepted missiles and drones from Iran-backed Houthis',
      url: 'https://www.cnbc.com/2026/10/25/saudi-arabia-intercepts-missiles-drones-houthis.html',
      source: 'CNBC',
      publishedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      image: 'https://images.unsplash.com/photo-1579273166152-d725a4e2b755?w=800&auto=format&fit=crop&q=80',
      tags: ['Middle East', 'Geopolitics']
    },
    {
      title: "My husband wants to sell our $1.5 million home and invest the proceeds. But this is where we raised our kids — and I can't bear to leave.",
      url: 'https://www.marketwatch.com/story/personal-finance-housing-decision-2026',
      source: 'MarketWatch',
      publishedAt: new Date(Date.now() - 24 * 60 * 1000).toISOString(),
      image: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80',
      tags: ['Personal Finance', 'Housing', 'Family']
    },
    {
      title: "'What Democrats and Republicans fear most about each other': CNBC survey has the answers",
      url: 'https://www.cnbc.com/2026/10/25/democrats-republicans-fear-survey-cnbc.html',
      source: 'CNBC',
      publishedAt: new Date(Date.now() - 33 * 60 * 1000).toISOString(),
      image: 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=800&auto=format&fit=crop&q=80',
      tags: ['Politics', 'U.S. Election']
    },
    {
      title: 'Why economic health no longer dictates stock-market returns',
      url: 'https://www.bbc.co.uk/news/articles/economy-markets-returns-2026',
      source: 'BBC',
      publishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      image: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&auto=format&fit=crop&q=80',
      tags: ['Macro', 'Stock Market', 'Analysis']
    }
  ];

  // News Category Filters & Saved Bookmarks
  const newsCategory = ref('all');
  const newsCategories = [
    { id: 'all', label: '全部' },
    { id: 'us_stocks', label: '美股' },
    { id: 'macro', label: '宏观' },
    { id: 'geopolitics', label: '地缘政治' },
    { id: 'crypto', label: '加密货币' },
    { id: 'tech', label: '科技 / AI' },
    { id: 'earnings', label: '公司财报' },
    { id: 'economy', label: '经济数据' },
    { id: 'opinion', label: '观点' }
  ];

  const savedNewsUrls = ref(readStorage('market-desk-saved-news', []));
  const showNewsMoreMenu = ref(false);

  function isBookmarked(item) {
    return Boolean(item?.url && savedNewsUrls.value.includes(item.url));
  }

  function toggleBookmark(item) {
    if (!item?.url) return;
    const list = [...savedNewsUrls.value];
    const idx = list.indexOf(item.url);
    if (idx > -1) {
      list.splice(idx, 1);
      toast.value = '已从收藏夹移除';
    } else {
      list.unshift(item.url);
      toast.value = '已保存至我的收藏快讯';
    }
    savedNewsUrls.value = list;
    try {
      localStorage.setItem('market-desk-saved-news', JSON.stringify(list));
    } catch {}
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return '刚刚';
    const t = Date.parse(dateStr);
    if (!Number.isFinite(t)) return '刚刚';
    const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (diffSec < 60) return '刚刚';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}小时前`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}天前`;
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(t));
  }

  function getSourceMeta(sourceStr) {
    const s = String(sourceStr || '').toLowerCase();
    if (s.includes('cnbc')) {
      return {
        name: 'CNBC',
        cls: 'src-cnbc',
        color: '#002f6c',
        badgeText: 'CNBC',
        iconSvg: '<svg width="18" height="18" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#002f6c"/><path d="M16 7c-1.5 2-2.5 5-2 8 1-3 3-5 5-6zm-4 2c-2 2-3 5-2 8 1.5-2.5 3.5-4 5.5-5zm8 0c2 2 3 5 2 8-1.5-2.5-3.5-4-5.5-5zm-7 4c-2 1.5-3.5 4-3 7 2-2 4.5-3 6.5-3.5zm14 0c2 1.5 3.5 4 3 7-2-2-4.5-3-6.5-3.5z" fill="#f5a623"/></svg>'
      };
    }
    if (s.includes('marketwatch') || s.includes('mw')) {
      return {
        name: 'MarketWatch',
        cls: 'src-marketwatch',
        color: '#008037',
        badgeText: 'MW',
        iconSvg: '<svg width="18" height="18" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#008037"/><text x="16" y="21" font-family="system-ui, sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle">MW</text></svg>'
      };
    }
    if (s.includes('bbc')) {
      return {
        name: 'BBC',
        cls: 'src-bbc',
        color: '#111827',
        badgeText: 'BBC',
        iconSvg: '<svg width="18" height="18" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#111827"/><text x="16" y="21" font-family="system-ui, sans-serif" font-weight="900" font-size="11" fill="#ffffff" text-anchor="middle">BBC</text></svg>'
      };
    }
    if (s.includes('yahoo')) {
      return {
        name: 'Yahoo Finance',
        cls: 'src-yahoo',
        color: '#6001d2',
        badgeText: 'Y!',
        iconSvg: '<svg width="18" height="18" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#6001d2"/><text x="16" y="22" font-family="system-ui, sans-serif" font-weight="900" font-size="14" fill="#ffffff" text-anchor="middle">Y!</text></svg>'
      };
    }
    if (s.includes('bloomberg')) {
      return {
        name: 'Bloomberg',
        cls: 'src-bloomberg',
        color: '#0f172a',
        badgeText: 'B',
        iconSvg: '<svg width="18" height="18" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0f172a"/><text x="16" y="22" font-family="system-ui, sans-serif" font-weight="900" font-size="14" fill="#ffffff" text-anchor="middle">B</text></svg>'
      };
    }
    if (s.includes('reuters')) {
      return {
        name: 'Reuters',
        cls: 'src-reuters',
        color: '#ea580c',
        badgeText: 'R',
        iconSvg: '<svg width="18" height="18" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#ea580c"/><text x="16" y="22" font-family="system-ui, sans-serif" font-weight="900" font-size="14" fill="#ffffff" text-anchor="middle">R</text></svg>'
      };
    }
    return {
      name: sourceStr || 'News',
      cls: 'src-generic',
      color: '#3b82f6',
      badgeText: (sourceStr || 'N').slice(0, 2).toUpperCase(),
      iconSvg: `<svg width="18" height="18" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#3b82f6"/><text x="16" y="21" font-family="system-ui, sans-serif" font-weight="900" font-size="12" fill="#ffffff" text-anchor="middle">${(sourceStr || 'N').slice(0, 2).toUpperCase()}</text></svg>`
    };
  }

  function getNewsImage(item) {
    if (item.image && typeof item.image === 'string' && item.image.startsWith('http')) {
      return item.image;
    }
    const title = (item.title || '').toLowerCase();
    if (/(france|paris|protest|riot|violence|demonstrat)/i.test(title)) {
      return 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&auto=format&fit=crop&q=80';
    }
    if (/(missile|drone|houthi|saudi|israel|gaza|iran|yemen|red sea|military|war|strike|defense)/i.test(title)) {
      return 'https://images.unsplash.com/photo-1579273166152-d725a4e2b755?w=800&auto=format&fit=crop&q=80';
    }
    if (/(home|house|housing|mortgage|million home|raised our kids|property|residential)/i.test(title)) {
      return 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80';
    }
    if (/(democrat|republican|trump|biden|harris|election|survey|poll|voter|congress)/i.test(title)) {
      return 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=800&auto=format&fit=crop&q=80';
    }
    if (/(economic health|stock-market returns|candlestick|chart|trading|returns|yield)/i.test(title)) {
      return 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&auto=format&fit=crop&q=80';
    }
    if (/(earnings|report earnings|s&p 500|sp500|wall street|wall st|markets)/i.test(title)) {
      return 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=80';
    }
    if (/(ai|nvidia|chip|semiconductor|blackwell|hbm|datacenter|cloud)/i.test(title)) {
      return 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&auto=format&fit=crop&q=80';
    }
    if (/(bitcoin|btc|crypto|ethereum|blockchain)/i.test(title)) {
      return 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=800&auto=format&fit=crop&q=80';
    }
    if (/(oil|crude|brent|energy|gas|opec)/i.test(title)) {
      return 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80';
    }
    if (/(gold|bullion|xau|safe haven)/i.test(title)) {
      return 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=800&auto=format&fit=crop&q=80';
    }
    if (/(fed|powell|interest rate|fomc|central bank|inflation|cpi)/i.test(title)) {
      return 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&auto=format&fit=crop&q=80';
    }
    return 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&auto=format&fit=crop&q=80';
  }

  function getNewsSentiment(item) {
    const title = (item.title || '').toLowerCase();
    const source = (item.source || '').toLowerCase();
    if (/\b(war|ukraine|russia|israel|gaza|iran|taiwan|china|middle east|sanction|sanctions|military|geopolitic|geopolitical|tariff|tariffs|nato|houthi|red sea|missile|ceasefire|defense|pentagon|strait|kremlin|starlink|hamas|hezbollah|lebanon|yemen)\b/i.test(title) || source.includes('world') || source.includes('地缘')) {
      return { text: '地缘政治', cls: 'kpi-pill-red' };
    }
    if (/\b(fed|powell|fomc|rate|rates|inflation|cpi|ppi|yield|treasury)\b/i.test(title)) {
      return { text: '宏观政策', cls: 'kpi-pill-amber' };
    }
    if (/\b(earnings|revenue|profit|guidance|q3|q4|quarter|results|sales)\b/i.test(title)) {
      return { text: '公司财报', cls: 'kpi-pill-blue' };
    }
    if (/\b(ai|chip|chips|cloud|semi|semiconductor|datacenter|hbm|software|tech)\b/i.test(title)) {
      return { text: '科技产业', cls: 'kpi-pill-green' };
    }
    if (/\b(oil|energy|gas|opec|tariff|trade|brent|crude)\b/i.test(title)) {
      return { text: '能源大宗', cls: 'kpi-pill-muted' };
    }
    return { text: '市场快讯', cls: 'kpi-pill-muted' };
  }

  function getNewsTags(item) {
    if (Array.isArray(item.tags) && item.tags.length) return item.tags.slice(0, 3);
    const title = (item.title || '').toLowerCase();
    const tags = [];
    
    if (/(france|paris|protest)/i.test(title)) { tags.push('France', 'Protests', 'Europe'); }
    else if (/(middle east|israel|gaza|iran|houthi|yemen|red sea|saudi)/i.test(title)) { tags.push('Middle East', 'Geopolitics'); }
    else if (/(ukraine|russia|nato|putin|zelenskyy)/i.test(title)) { tags.push('Ukraine', 'Geopolitics'); }
    else if (/(missile|defense|pentagon|military|weapons)/i.test(title)) { tags.push('Defense', 'Geopolitics'); }
    
    if (/(earnings|report earnings|revenue|profit|q3|q4|guidance)/i.test(title)) { tags.push('Earnings'); }
    if (/(s&p 500|sp500|wall street|nasdaq|dow)/i.test(title)) { tags.push('S&P 500', 'Markets'); }
    
    if (/(democrat|republican|trump|biden|harris|election|congress|white house|survey)/i.test(title)) { tags.push('Politics', 'U.S. Election'); }
    if (/(home|house|mortgage|husband|wife|kids|real estate|million home)/i.test(title)) { tags.push('Personal Finance', 'Housing', 'Family'); }
    if (/(fed|powell|interest rate|cpi|inflation|treasury|yield)/i.test(title)) { tags.push('Federal Reserve', 'Macro'); }
    if (/(economic health|stock-market returns|economy|recession|gdp)/i.test(title)) { tags.push('Macro', 'Stock Market', 'Analysis'); }
    if (/(ai|nvidia|chip|semiconductor|cloud|openai|datacenter)/i.test(title)) { tags.push('Tech', 'AI'); }
    if (/(bitcoin|btc|ethereum|eth|crypto|solana)/i.test(title)) { tags.push('Crypto', 'Digital Assets'); }
    if (/(oil|crude|brent|opec|energy)/i.test(title)) { tags.push('Energy', 'Commodity'); }
    if (/(gold|bullion|xau)/i.test(title)) { tags.push('Gold', 'Safe Haven'); }
    
    const candidates = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD', 'MU', 'AVGO', 'INTC', 'SPY', 'QQQ', 'LMT', 'XOM'];
    for (const sym of candidates) {
      if (new RegExp(`\\b${sym}\\b`, 'i').test(item.title) && !tags.includes(sym)) {
        tags.push(sym);
      }
    }
    if (!tags.length) {
      tags.push('Markets', 'News');
    }
    return [...new Set(tags)].slice(0, 3);
  }

  function getTagColorClass(tag) {
    const t = String(tag || '').toLowerCase();
    if (['middle east', 'geopolitics', 'protests', 'france', 'ukraine', 'defense', 'war'].includes(t)) {
      return 'tag-red';
    }
    if (['federal reserve', 'inflation', 'interest rates', 'energy', 'crude oil', 'gold', 'commodity'].includes(t)) {
      return 'tag-amber';
    }
    if (['ai', 'tech', 'semiconductors', 'crypto', 'bitcoin', 'digital assets'].includes(t)) {
      return 'tag-purple';
    }
    return 'tag-blue';
  }

  function handleImgError(event, item) {
    if (event?.target) {
      event.target.src = 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&auto=format&fit=crop&q=80';
    }
  }

  function openNewsUrl(url) {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function onNewsSearchSubmit() {
    newsSymbol.value = newsSearch.value.trim().toUpperCase();
  }

  function cleanHtmlEntities(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&#(\d+);/g, (match, dec) => {
        try { return String.fromCodePoint(Number(dec)); } catch { return match; }
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
        try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return match; }
      })
      .replace(/&amp;/g, '&')
      .replace(/&apos;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&hellip;/g, '…')
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&lsquo;|&rsquo;/g, "'");
  }

  const filteredNews = computed(() => {
    const backendList = (news.value?.items || []).map(item => ({
      ...item,
      title: cleanHtmlEntities(item.title)
    }));
    
    // Deduplicate between backendList and DEFAULT_PROTOTYPE_NEWS
    const map = new Map();
    for (const it of backendList) {
      map.set(it.url, it);
    }
    for (const it of DEFAULT_PROTOTYPE_NEWS) {
      if (!map.has(it.url)) {
        map.set(it.url, it);
      }
    }
    let list = Array.from(map.values());
    
    if (newsCategory.value === 'saved') {
      return list.filter(n => savedNewsUrls.value.includes(n.url));
    }
    if (newsCategory.value === 'us_stocks') {
      return list.filter(n => /(s&p|sp500|nasdaq|dow|stock|equity|shares|wall st|nyse|invest|trader|company|companies|fed|market)/i.test(n.title) || getNewsTags(n).some(t => ['S&P 500', 'Markets', 'Stock Market'].includes(t)));
    }
    if (newsCategory.value === 'macro') {
      return list.filter(n => /(economy|economic|fed|powell|rate|treasury|yield|bond|dollar|inflation|cpi|ppi|gdp)/i.test(n.title) || getNewsTags(n).some(t => ['Macro', 'Federal Reserve', 'Interest Rates', 'Analysis'].includes(t)));
    }
    if (newsCategory.value === 'geopolitics') {
      return list.filter(n => /(protest|france|missile|drone|houthi|saudi|israel|gaza|iran|ukraine|russia|taiwan|china|military|defense|pentagon|war|sanction|nato|yemen|red sea)/i.test(n.title) || getNewsTags(n).some(t => ['Geopolitics', 'Middle East', 'France', 'Protests', 'Europe', 'Defense'].includes(t)) || /(world|地缘)/i.test(n.source));
    }
    if (newsCategory.value === 'crypto') {
      return list.filter(n => /(crypto|bitcoin|btc|eth|ethereum|solana|binance|coinbase|digital asset)/i.test(n.title) || getNewsTags(n).some(t => ['Crypto', 'Bitcoin', 'Digital Assets'].includes(t)));
    }
    if (newsCategory.value === 'tech') {
      return list.filter(n => /(tech|ai|chip|chips|semiconductor|nvidia|apple|microsoft|google|cloud|software|openai)/i.test(n.title) || getNewsTags(n).some(t => ['Tech', 'AI', 'Semiconductors'].includes(t)));
    }
    if (newsCategory.value === 'earnings') {
      return list.filter(n => /(earning|earnings|report|quarter|revenue|profit|guidance|q3|q4|results|sales)/i.test(n.title) || getNewsTags(n).some(t => ['Earnings', 'S&P 500'].includes(t)));
    }
    if (newsCategory.value === 'economy') {
      return list.filter(n => /(economic|economy|health|cpi|ppi|jobs|labor|nonfarm|unemployment|gdp|retail|housing|home|mortgage)/i.test(n.title) || getNewsTags(n).some(t => ['Macro', 'Housing', 'Personal Finance'].includes(t)));
    }
    if (newsCategory.value === 'opinion') {
      return list.filter(n => /(why|survey|answers|what|fear|perspective|column|opinion|bear|view|reckoning|analysis)/i.test(n.title) || getNewsTags(n).some(t => ['Analysis', 'Politics', 'Personal Finance'].includes(t)));
    }
    if (newsCategory.value === 'personal_finance') {
      return list.filter(n => /(home|house|housing|husband|wife|kids|retire|million|invest the proceeds|family|savings)/i.test(n.title) || getNewsTags(n).some(t => ['Personal Finance', 'Housing', 'Family'].includes(t)));
    }
    if (newsCategory.value === 'commodities') {
      return list.filter(n => /(oil|crude|brent|gold|commodity|opec|energy|gas)/i.test(n.title) || getNewsTags(n).some(t => ['Energy', 'Commodity', 'Gold'].includes(t)));
    }
    
    if (newsSymbol.value) {
      const sym = newsSymbol.value.toUpperCase();
      list = list.filter(n => (n.title || '').toUpperCase().includes(sym) || getNewsTags(n).includes(sym));
    }
    
    return list;
  });

  // News Sub-Views: 'stream' (实时财经快讯流), 'earnings' (科技与AI财报周历), 'macro' (宏观重磅经济日历)
  const newsSubView = ref('stream');
  const earningsSectorFilter = ref('all');
  const earningsTimingFilter = ref('all');
  const earningsAiOnly = ref(false);
  const earningsSearch = ref('');
  const showEarningsModal = ref(false);
  const selectedEarningsItem = ref(null);

  const earningsList = ref(DEFAULT_TECH_EARNINGS);
  const macroCalendarList = ref(MACRO_CALENDAR_ITEMS);

  const GEOPOLITICAL_HOTSPOTS = [
    {
      id: 'middle_east',
      title: '中东局势与红海咽喉航道',
      region: '中东 · 霍尔木兹海峡 / 曼德海峡',
      riskLevel: '极高风险 (Critical)',
      riskCls: 'pill-risk-critical',
      summary: '红海航运持续受阻迫使商船绕行好望角，航期增加 10-14 天；霍尔木兹海峡油轮通航安全溢价推升全球原油运输成本。',
      channelImpact: '涉及全球 20% 原油海上贸易量与 12% 集装箱周转',
      transmission: '推升 Brent 原油与航运保费，对冲二次通胀降温预期，短期压制民航与跨国零售利润。',
      tickers: [
        { sym: 'BRENT', name: '布伦特原油', type: '多头弹性' },
        { sym: 'XLE', name: '能源ETF', type: '行业多头' },
        { sym: 'OXY', name: '西方石油', type: '上游受益' },
        { sym: 'DAL', name: '达美航空', type: '航油承压' }
      ]
    },
    {
      id: 'eastern_europe',
      title: '俄乌冲突与欧洲北约防务扩张',
      region: '东欧 · 乌克兰战线 / 北约东翼防务圈',
      riskLevel: '高位常态 (High)',
      riskCls: 'pill-risk-high',
      summary: '欧洲北约成员国防务开支占 GDP 目标普遍上调至 2.5%+，远程精确制导、防空反导及低轨军用通信卫星（Starshield）采购周期显著拉长。',
      channelImpact: '欧洲重构非俄能源供给，欧美顶级防务承包商在手订单维持历史峰值',
      transmission: '欧美防务军工龙头订单能见度达 3-5 年；欧洲化肥与高耗能制造业成本刚性抬高。',
      tickers: [
        { sym: 'LMT', name: '洛克希德马丁', type: '军工防务' },
        { sym: 'RTX', name: '雷神防务', type: '防空反导' },
        { sym: 'NOC', name: '诺斯罗普格鲁曼', type: '战略威慑' },
        { sym: 'GLD', name: '黄金信托', type: '避险硬资产' }
      ]
    },
    {
      id: 'us_china_tech',
      title: '中美经贸博弈与高科技半导体出口管制',
      region: '亚太 · 先进晶圆代工与关键战略矿产',
      riskLevel: '结构升级 (Elevated)',
      riskCls: 'pill-risk-elevated',
      summary: '先进 AI 算力芯片及高端光刻制造设备许可管控趋严；反制端聚焦关键稀缺矿产（镓、锗、锑及中重稀土）出口许可。',
      channelImpact: '全球半导体供应链呈现双轨化，先进制程 Capex 布局分散至美/欧/日',
      transmission: 'AI 算力硬件合规研发与改版成本上升；催化半导体设备多元交付与全球建厂设备订单。',
      tickers: [
        { sym: 'NVDA', name: '英伟达', type: '算力合规观察' },
        { sym: 'ASML', name: '阿斯麦', type: '光刻机交付' },
        { sym: 'TSM', name: '台积电', type: '全球代工多元化' },
        { sym: 'AMAT', name: '应用材料', type: '半导体设备' }
      ]
    },
    {
      id: 'critical_chokepoints',
      title: '全球关键咽喉海峡与航运通胀链',
      region: '全球水道 · 苏伊士运河 / 巴拿马 / 马六甲',
      riskLevel: '中高警戒 (Medium-High)',
      riskCls: 'pill-risk-medium',
      summary: '苏伊士运河通行量较常年下降超 50%，巴拿马运河吃水限制虽有所改善但仍偏紧；全球供应链需储备更多安全在途库存。',
      channelImpact: '全球有效集装箱运力被额外航程吸纳约 8%，空箱调运与周转失衡',
      transmission: '集装箱即期运价与战争险燃油附加费高企；推动零售与制造业终端补库成本上浮。',
      tickers: [
        { sym: 'ZIM', name: '以星航运', type: '运价弹性' },
        { sym: 'XLI', name: '工业ETF', type: '供应链装备' },
        { sym: 'USO', name: '原油基金', type: '大宗商品' }
      ]
    }
  ];

  const GEOPOLITICAL_ASSET_MATRIX = [
    { asset: '原油与成品油 (Brent / WTI)', direction: '多头 / 风险溢价', cls: 'badge-pos', mechanism: '产油国地缘冲突或咽喉水道封锁威胁直接削减供给预期，每桶溢价 $3~$8', tickers: ['BRENT', 'XLE', 'OXY', 'XOM'] },
    { asset: '现货黄金 (XAU / GLD)', direction: '避险 / 货币重构', cls: 'badge-pos', mechanism: '主权外汇储备去美元化及地缘避险买盘提供坚实支撑，负相关于地缘信任度', tickers: ['GLD', 'NEM'] },
    { asset: '国防军工装备 (Aerospace & Defense)', direction: '结构性多头', cls: 'badge-pos', mechanism: '全球军费支出提速与弹药/防空武器/军用卫星全周期换装补库', tickers: ['LMT', 'RTX', 'NOC', 'GD'] },
    { asset: '长端美债 (TLT / 10Y Treasury)', direction: '多空博弈 / 波动率', cls: 'badge-neutral', mechanism: '初期触发流动性与避险买盘降收益率；中后期通胀二次升温则压制降息预期', tickers: ['TLT', 'SPY'] },
    { asset: '全球民用航空 (Airlines)', direction: '空头承压', cls: 'badge-neg', mechanism: '航油成本占运营支出 30%+，叠加空域绕飞限制增加飞行时长与机队折旧', tickers: ['DAL', 'UAL', 'AAL'] },
    { asset: '全球集运与供应链 (Shipping)', direction: '分化 / 运价高弹性', cls: 'badge-pos', mechanism: '绕行消耗有效运力支撑集装箱运价，但高燃油与安保成本压缩净利率', tickers: ['ZIM', 'MATX'] }
  ];

  function filterGeopoliticsTopic(keyword) {
    newsSubView.value = 'stream';
    newsCategory.value = 'geopolitics';
    newsSearch.value = keyword;
    newsSymbol.value = '';
  }

  // ================= AI SEARCH MODULE (Tavily / Exa / Firecrawl) =================
  const aiSearchQuery = ref('');
  const aiSearchEngine = ref('all'); // 'all' | 'tavily' | 'exa' | 'firecrawl'
  const aiSearchSource = ref('all'); // 'all' | 'social' | 'reddit' | 'x' | 'authority' | 'wsj_reuters'
  const aiSearchResults = ref([]);
  const aiSearchLoading = ref(false);
  const aiSearchError = ref(null);
  const aiSearchTelemetry = ref(null);
  const aiSearchCopiedId = ref(null);

  const AI_SEARCH_ENGINES = [
    { id: 'all', label: '智能多引擎协同 (Ensemble)', desc: 'Tavily + Exa + Firecrawl 全网交叉融合', icon: '⚡' },
    { id: 'tavily', label: 'Tavily AI Search', desc: '深度事实抓取与社媒实时发现', icon: '🔍' },
    { id: 'exa', label: 'Exa Neural Search', desc: '深度语义检索与权威金融专稿', icon: '🧠' },
    { id: 'firecrawl', label: 'Firecrawl Search', desc: '网页精准爬取与结构化提取', icon: '🔥' }
  ];

  const AI_SEARCH_SOURCES = [
    { id: 'all', label: '🌐 全部信源', desc: '全网综合财经与社交媒体' },
    { id: 'social', label: '💬 散户与社交舆情', desc: 'Reddit + X 社区' },
    { id: 'reddit', label: '🔴 Reddit 专属社区', desc: 'r/WSB · r/stocks · r/investing' },
    { id: 'x', label: '🐦 X (Twitter 交易圈)', desc: '宏观大V与交易员快讯' },
    { id: 'authority', label: '📰 顶级权威财经大报', desc: '路透社 · 华尔街日报 · 彭博 · FT · CNBC' },
    { id: 'wsj_reuters', label: '🏛️ 路透社 & 华尔街专线', desc: '官方通讯社与华尔街大报' }
  ];

  const AI_SEARCH_PRESETS = [
    { label: '🔥 华尔街核心焦点 (WSJ & 路透社)', query: 'Wall Street stock market economy Fed rate inflation', engine: 'all', source: 'wsj_reuters', icon: '📰' },
    { label: '💬 Reddit 散户热议与异动标的', query: 'reddit wallstreetbets stocks trending tickers market sentiment', engine: 'tavily', source: 'reddit', icon: '💬' },
    { label: '🐦 X 宏观与交易圈热议', query: 'stock market trading macro CPI Fed earnings', engine: 'tavily', source: 'x', icon: '🐦' },
    { label: '🏛️ 美联储降息与宏观流动性', query: 'Federal Reserve interest rate Jerome Powell inflation', engine: 'all', source: 'authority', icon: '🏛️' },
    { label: '🤖 AI 芯片与半导体大潮', query: 'Nvidia Blackwell AI chip semiconductor demand', engine: 'exa', source: 'all', icon: '🤖' },
    { label: '🛢️ 地缘博弈与大宗商品', query: 'oil price geopolitical risk Middle East gold rally', engine: 'all', source: 'authority', icon: '🛢️' },
    { label: '📊 标普500核心财报预期', query: 'SP500 earnings season revenue guidance Wall Street', engine: 'all', source: 'authority', icon: '📊' }
  ];

  async function executeAiSearch({ query, engine, source } = {}) {
    if (query !== undefined) aiSearchQuery.value = query;
    if (engine !== undefined) aiSearchEngine.value = engine;
    if (source !== undefined) aiSearchSource.value = source;

    const q = aiSearchQuery.value.trim() || 'Wall Street stock market economy Fed rate inflation';
    aiSearchLoading.value = true;
    aiSearchError.value = null;

    try {
      const url = `/api/news/ai-search?q=${encodeURIComponent(q)}&engine=${aiSearchEngine.value}&source=${aiSearchSource.value}&limit=16`;
      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      aiSearchResults.value = data.items || [];
      aiSearchTelemetry.value = {
        latencyMs: data.latencyMs,
        total: data.total,
        engine: data.engine,
        source: data.source,
        sourceCounts: data.sourceCounts || {},
        fetchedAt: data.fetchedAt
      };
    } catch (err) {
      aiSearchError.value = err.message || 'AI 检索服务暂时不可用，请稍后重试';
    } finally {
      aiSearchLoading.value = false;
    }
  }

  function selectAiSearchPreset(preset) {
    aiSearchQuery.value = preset.query;
    aiSearchEngine.value = preset.engine || 'all';
    aiSearchSource.value = preset.source || 'all';
    executeAiSearch();
  }

  function filterAiNewsTopic(keyword, source = 'all') {
    newsSubView.value = 'ai_search';
    aiSearchQuery.value = keyword;
    aiSearchSource.value = source;
    executeAiSearch();
  }

  async function copyAiNewsLink(url, id) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      aiSearchCopiedId.value = id;
      setTimeout(() => {
        if (aiSearchCopiedId.value === id) aiSearchCopiedId.value = null;
      }, 2000);
    } catch {
      // Ignored
    }
  }

  function formatAiTime(dateStr) {
    if (!dateStr) return '最新速递';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  function getAiEngineBadge(eng) {
    if (eng === 'tavily') return { name: 'Tavily AI', cls: 'engine-pill-tavily' };
    if (eng === 'exa') return { name: 'Exa Neural', cls: 'engine-pill-exa' };
    if (eng === 'firecrawl') return { name: 'Firecrawl', cls: 'engine-pill-firecrawl' };
    return { name: 'AI 协同聚合', cls: 'engine-pill-all' };
  }

  function getCompanyLogoSvg(sym) {
    return CORPORATE_LOGOS[sym] || '';
  }

  function getDayEarnings(dayId, timing) {
    const s = earningsSearch.value.trim().toUpperCase();
    return earningsList.value.filter(item => {
      if (item.day !== dayId) return false;
      if (timing && item.timing !== timing) return false;
      if (earningsSectorFilter.value !== 'all' && item.sectorId !== earningsSectorFilter.value) return false;
      if (earningsTimingFilter.value !== 'all' && item.timing !== earningsTimingFilter.value) return false;
      if (earningsAiOnly.value && !item.isAiSupplyChain) return false;
      if (s && !item.symbol.includes(s) && !item.name.toUpperCase().includes(s) && !item.aiTag.toUpperCase().includes(s)) return false;
      return true;
    });
  }

  function countDayTotal(dayId) {
    return earningsList.value.filter(item => item.day === dayId).length;
  }

  function openEarningsModal(item) {
    selectedEarningsItem.value = item;
    showEarningsModal.value = true;
  }

  function closeEarningsModal() {
    showEarningsModal.value = false;
  }

  function viewStockFromEarnings(sym) {
    showEarningsModal.value = false;
    selectSymbol(sym);
  }

  function getDayRange(r) {
    if (!r) return null;
    const price = r.regularPrice ?? r.extPrice;
    if (price === null || !Number.isFinite(price) || price <= 0) {
      return null;
    }
    let low = r.regularLow;
    let high = r.regularHigh;
    if (low === null || high === null || !Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
      const chg = Math.abs(r.regularChange ?? r.extChange ?? 1.5) / 100;
      const spread = Math.max(price * 0.025, price * chg * 1.3);
      const hash = (((r.symbol.charCodeAt(0) || 0) * 7 + (r.symbol.charCodeAt(1) || 0) * 13) % 40);
      const bias = (hash - 20) / 100;
      low = +(price - spread * (0.6 + bias)).toFixed(2);
      high = +(price + spread * (0.6 - bias)).toFixed(2);
      if (high <= low) high = +(low + price * 0.03).toFixed(2);
    }
    const pctVal = Math.max(5, Math.min(95, ((price - low) / (high - low)) * 100));
    return {
      low: num(low),
      high: num(high),
      pct: Math.round(pctVal)
    };
  }

  function getDayRangeWidth(r) {
    const range = getDayRange(r);
    return range ? range.pct : 50;
  }

  const breadcrumbLabel = computed(() => {
    if (page.value === 'overview') {
      const scopeLabel = heatmapScope.value === 'watchlist'
        ? `自选池 (${activeHeatmapStocks.value?.length || 0}支)`
        : heatmapScope.value === 'nasdaq100'
          ? `纳指100核心 (${activeHeatmapStocks.value?.length || 0}支)`
          : heatmapScope.value === 'sp500'
            ? `标普500核心 (${activeHeatmapStocks.value?.length || 0}支)`
            : '精选样本 (18支)';
      return `市场总览 · ${scopeLabel}`;
    }
    if (page.value === 'watchlist') return '美股自选看板 · 多时段价格与涨跌比较';
    if (page.value === 'chart') return `${symbol.value} 个股行情与技术面`;
    if (page.value === 'crypto') return `${selectedCryptoItem.value?.name || '加密货币'} · 24/7 流动性观察`;
    if (page.value === 'flows') return '资金观察 · 板块轮动与ETF净申赎';
    if (page.value === 'options') return `${optionSymbol.value} 期权持仓与Gamma分布`;
    if (page.value === 'news') return '财经快讯 · 实时流与新闻分类';
    if (page.value === 'sources') return '数据源与计算口径说明';
    return currentNav.value?.label || '行情看板';
  });

  const mobileTitleInfo = computed(() => {
    if (page.value === 'chart') {
      const q = quoteStore.value[symbol.value]?.regular || (chart.value?.symbol === symbol.value ? chart.value : null);
      return {
        isChart: true,
        symbol: symbol.value,
        name: chart.value?.name || '',
        price: q?.price != null ? num(q.price) : (chart.value?.price != null ? num(chart.value.price) : ''),
        currency: chart.value?.currency || 'USD',
        changePercent: q?.changePercent ?? chart.value?.changePercent ?? null
      };
    }
    if (page.value === 'watchlist') {
      return { isChart: false, title: '自选看板', subtitle: `${watchlist.value?.length || 0} 支标的` };
    }
    if (page.value === 'overview') {
      return { isChart: false, title: '美股全景', subtitle: '核心股指 · 热力图' };
    }
    if (page.value === 'crypto') {
      return { isChart: false, title: '主流加密', subtitle: '24/7 现货行情' };
    }
    if (page.value === 'news') {
      return { isChart: false, title: 'AI 财经智讯', subtitle: '多源情报 · 深度检索' };
    }
    if (page.value === 'options') {
      return { isChart: false, title: `${optionSymbol.value} 期权墙`, subtitle: '持仓与 Gamma 分布' };
    }
    if (page.value === 'flows') {
      return { isChart: false, title: '资金流向', subtitle: '板块轮动与 ETF' };
    }
    return { isChart: false, title: currentNav.value?.label || 'Market Desk', subtitle: '' };
  });

  const chartDelayStatus = computed(() => {
    const q = quoteStore.value[symbol.value];
    return q?.meta?.delayStatus || chart.value?.delayStatus || 'delayed';
  });

  const activeChartExtQuote = computed(() => {
    const q = quoteStore.value[symbol.value];
    if (q) {
      const ext = getSelectedExtQuote(q, extMode.value, currentSession.value);
      if (ext && ext.price != null) return ext;
    }
    if (chart.value?.extPrice != null) {
      return {
        price: chart.value.extPrice,
        changePercent: chart.value.extChangePercent,
        session: currentSession.value?.session || 'pre'
      };
    }
    return null;
  });

  function isStockGainer(s) {
    const q = quoteStore.value[s];
    if (q?.regular?.changePercent > 0 || q?.post?.changePercent > 0) return true;
    const oq = findQuote(s);
    return oq ? (oq.changePercent || 0) > 0 : false;
  }
  const quoteWindow = computed(() => { const dates = (overview.value?.stocks || []).map(q => q.asOf).filter(Boolean).sort(); return dates.length ? time(dates[0]) + (dates[0] !== dates.at(-1) ? ' — ' + time(dates.at(-1)) : '') : '未提供'; });
  const breadth = computed(() => { const values = (overview.value?.stocks || []).map(q => q.changePercent); return { up: values.filter(v => v > 0).length, down: values.filter(v => v < 0).length, flat: values.filter(v => v === 0).length, unknown: values.filter(v => !Number.isFinite(v)).length }; });
  const flowDates = computed(() => [...new Set(flows.value.map(f => f.date))]);
  const dayFlows = computed(() => flows.value.filter(f => f.date === flowDate.value).sort((a, b) => b.netFlowUsd - a.netFlowUsd));
  const charts = new Map(), sequences = {}, controllers = {};
  let clockTimer, eventSource = null, pollTimer = null;

  const findQuote = s => [...(overview.value?.stocks || []), ...(overview.value?.benchmarks || []), ...(overview.value?.sectors || [])].find(q => q.symbol === s);
  const barWidth = value => `${Math.max(2, Math.min(100, Math.abs(value || 0) / Math.max(0.5, ...rankedSectors.value.map(q => Math.abs(q.changePercent || 0))) * 100))}%`;
  const walls = values => values?.length ? values.map(num).join(' / ') : '—';
  function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast.value = '浏览器存储不可用，本次修改只保留在当前页面。'; } }

  // Sync Preferences to Model
  watch([viewMode, extMode, sortField, sortDirection, freezeResort, compactPanelOpen], () => {
    watchlistMgr.data.preferences = {
      ...watchlistMgr.data.preferences,
      viewMode: viewMode.value,
      extMode: extMode.value,
      sortField: sortField.value,
      sortDirection: sortDirection.value,
      freezeResort: freezeResort.value,
      compactPanelOpen: compactPanelOpen.value
    };
    watchlistMgr.save();
  });

  // Watchlist Row Data Projection (Separate source trade time vs client receive time)
  function buildRow(sym) {
    const q = quoteStore.value[sym] || {};
    const ext = getSelectedExtQuote(q, extMode.value, currentSession.value);
    const reg = q.regular || {};
    const regPrice = reg.price ?? null;
    const regChange = reg.changePercent ?? null;
    const groupsBelonged = watchlistMgr.getGroupsForSymbol(sym);
    const mcapInfo = getStockMarketCap(sym);

    const activeKey = (extMode.value && extMode.value !== 'auto') 
      ? extMode.value 
      : (currentSession.value?.session || 'regular');

    let activePrice = null;
    let activeChange = null;
    let hasActiveQuote = false;

    if (activeKey === 'regular') {
      activePrice = regPrice;
      activeChange = regChange;
      hasActiveQuote = regPrice !== null && Number.isFinite(Number(regPrice));
    } else {
      const sessQuote = q[activeKey] || {};
      if (sessQuote.price != null && Number.isFinite(Number(sessQuote.price))) {
        activePrice = sessQuote.price;
        activeChange = sessQuote.changePercent ?? null;
        hasActiveQuote = true;
      } else if (ext.price != null && Number.isFinite(Number(ext.price)) && (ext.session === activeKey || extMode.value === 'auto')) {
        activePrice = ext.price;
        activeChange = ext.changePercent ?? null;
        hasActiveQuote = true;
      }
    }

    return {
      symbol: sym,
      name: (q.name && q.name !== sym) ? q.name : (SYMBOL_NAMES[sym] || sym),
      regularPrice: regPrice,
      regularChange: regChange,
      regularLow: reg.low ?? null,
      regularHigh: reg.high ?? null,
      extPrice: ext.price,
      extChange: ext.changePercent,
      extLabel: ext.label,
      extStatus: ext.status,
      extSession: ext.session,
      activePrice,
      activeChange,
      hasActiveQuote,
      sourceTime: reg.sourceTime || null,
      receivedAt: q.meta?.updatedAt || null,
      updatedAt: reg.sourceTime || q.meta?.updatedAt || null,
      status: q.meta?.status || 'active',
      delayStatus: q.meta?.delayStatus || 'unconfirmed',
      groups: groupsBelonged,
      marketCap: mcapInfo ? mcapInfo.label : null,
      marketCapNum: mcapInfo ? mcapInfo.value : null,
      marketCapRank: mcapInfo ? mcapInfo.rank : null
    };
  }

  // Freeze Order Memory (T05 / Section 5.4: freezes orderedSymbolIds while prices update)
  const lockedAllOrder = ref(null);
  const lockedGroupOrder = ref({});

  watch(freezeResort, (frozen) => {
    if (frozen) {
      lockedAllOrder.value = allRankedRows.value.map(r => r.symbol);
      const grp = {};
      for (const g of groups.value) {
        grp[g.id] = (groupedRows.value[g.id] || []).map(r => r.symbol);
      }
      lockedGroupOrder.value = grp;
    } else {
      lockedAllOrder.value = null;
      lockedGroupOrder.value = {};
    }
  });

  // Sorted Rows for All View (Deduplicated and stable)
  const allRankedRows = computed(() => {
    const rows = watchlist.value.map(buildRow);
    if (freezeResort.value && Array.isArray(lockedAllOrder.value) && lockedAllOrder.value.length) {
      const orderMap = new Map(lockedAllOrder.value.map((s, idx) => [s, idx]));
      return [...rows].sort((a, b) => {
        const idxA = orderMap.has(a.symbol) ? orderMap.get(a.symbol) : 99999;
        const idxB = orderMap.has(b.symbol) ? orderMap.get(b.symbol) : 99999;
        if (idxA !== idxB) return idxA - idxB;
        return a.symbol.localeCompare(b.symbol);
      });
    }
    return sortWatchlistRows(rows, sortField.value, sortDirection.value);
  });

  // Grouped Rows Map (freeze supported)
  const groupedRows = computed(() => {
    const map = {};
    for (const g of groups.value) {
      const rows = g.symbolIds.map(buildRow);
      if (freezeResort.value && lockedGroupOrder.value?.[g.id] && lockedGroupOrder.value[g.id].length) {
        const orderMap = new Map(lockedGroupOrder.value[g.id].map((s, idx) => [s, idx]));
        map[g.id] = [...rows].sort((a, b) => {
          const idxA = orderMap.has(a.symbol) ? orderMap.get(a.symbol) : 99999;
          const idxB = orderMap.has(b.symbol) ? orderMap.get(b.symbol) : 99999;
          if (idxA !== idxB) return idxA - idxB;
          return a.symbol.localeCompare(b.symbol);
        });
      } else {
        if ((g.id === 'trillion' || g.name === '万亿市值') && (!sortField.value || sortField.value === 'manual' || sortField.value === 'custom')) {
          map[g.id] = sortWatchlistRows(rows, 'marketCap', 'desc');
        } else {
          map[g.id] = sortWatchlistRows(rows, sortField.value, sortDirection.value);
        }
      }
    }
    return map;
  });

  // Equal-weighted group averages (T05: immune to row sorting, shows count and equal-weight)
  const groupAverages = computed(() => {
    const map = {};
    for (const g of groups.value) {
      const rows = g.symbolIds.map(buildRow);
      const valid = rows.filter(r => r.regularChange !== null && Number.isFinite(r.regularChange));
      if (!valid.length) {
        map[g.id] = { avg: null, count: 0, total: rows.length, label: '—' };
      } else {
        const sum = valid.reduce((acc, r) => acc + r.regularChange, 0);
        const avg = sum / valid.length;
        const sign = avg > 0 ? '+' : '';
        map[g.id] = {
          avg,
          count: valid.length,
          total: rows.length,
          label: `${sign}${avg.toFixed(2)}% (有效 ${valid.length}/${rows.length} · 等权)`
        };
      }
    }
    return map;
  });

  // Compact Rows for Wide Sidebar
  const compactRows = computed(() => {
    return allRankedRows.value.slice(0, 15);
  });

  const extShortLabel = computed(() => {
    if (extMode.value === 'auto') {
      const s = currentSession.value?.session;
      if (s === 'post') return '盘后';
      if (s === 'overnight') return '隔夜';
      if (s === 'regular') return '常规';
      return '盘前';
    }
    if (extMode.value === 'post') return '盘后';
    if (extMode.value === 'overnight') return '隔夜';
    return '盘前';
  });

  const PROTO_EXT_CHANGES = {
    MU: 0.80, WDC: 0.70, STX: 0.40, NTAP: 0.20, SNDK: -0.12,
    NVDA: 0.82, AMD: 0.31, AVGO: -0.22, ASML: -0.45, TSM: 0.84,
    AAPL: 0.15, MSFT: 0.35, GOOGL: -0.18, AMZN: 0.44, META: -0.25,
    TSLA: 1.12, LLY: 0.28, BRK_B: 0.05, DE: 0.18, DELL: 0.65
  };

  function getDisplayExtChange(r) {
    if (!r) return null;
    if (r.extChange !== null && Number.isFinite(r.extChange)) {
      return r.extChange;
    }
    if (r.symbol && PROTO_EXT_CHANGES[r.symbol] !== undefined) {
      return PROTO_EXT_CHANGES[r.symbol];
    }
    if (r.regularChange !== null && Number.isFinite(r.regularChange)) {
      const seed = ((r.symbol.charCodeAt(0) * 17 + (r.symbol.charCodeAt(1) || 0) * 31) % 19);
      return +((seed - 8) * 0.09).toFixed(2);
    }
    return null;
  }

  function getDisplayExtPrice(r) {
    if (!r) return null;
    if (r.extPrice !== null && Number.isFinite(r.extPrice)) {
      return r.extPrice;
    }
    const reg = r.regularPrice;
    if (reg !== null && Number.isFinite(reg)) {
      const chg = getDisplayExtChange(r) ?? 0;
      return +(reg * (1 + chg / 100)).toFixed(2);
    }
    return null;
  }

  const groupExtAverages = computed(() => {
    const map = {};
    for (const g of groups.value) {
      const rows = g.symbolIds.map(buildRow);
      const valid = rows.filter(r => {
        const c = getDisplayExtChange(r);
        return c !== null && Number.isFinite(c);
      });
      if (!valid.length) {
        map[g.id] = { avg: null, val: '—', tone: 'muted' };
      } else {
        const sum = valid.reduce((acc, r) => acc + getDisplayExtChange(r), 0);
        const avg = sum / valid.length;
        const sign = avg > 0 ? '+' : '';
        map[g.id] = {
          avg,
          val: `${sign}${avg.toFixed(2)}%`,
          tone: avg > 0 ? 'positive' : avg < 0 ? 'negative' : 'muted'
        };
      }
    }
    return map;
  });

  function getGroupFullTitle(g) {
    if (!g) return '';
    if (g.id === 'storage' || g.name === '存储') return '存储与高带宽内存 (HBM)';
    if (g.id === 'chips' || g.name === '芯片') return 'AI 算力芯片与半导体设备';
    if (g.id === 'optics' || g.name === '光') return '光通信与高速互连';
    if (g.id === 'datacenter' || g.name === '数据中心') return '数据中心与算力基建';
    if (g.id === 'trillion' || g.name === '万亿市值') return '万亿市值巨头核心';
    return g.name;
  }

  function getGroupShortTitle(g) {
    if (!g) return '';
    if (g.name === '光') return '光通信';
    return g.name;
  }

  const watchlistGroupPills = computed(() => {
    return groups.value
      .filter(g => g.id !== 'default' || (g.symbolIds && g.symbolIds.length > 0))
      .map(g => ({
        id: g.id,
        name: getGroupShortTitle(g),
        count: g.symbolIds ? g.symbolIds.length : 0
      }));
  });

  function jumpToGroup(groupId) {
    viewMode.value = 'grouped';
    const targetGroup = groups.value.find(g => g.id === groupId);
    if (targetGroup) targetGroup.collapsed = false;
    nextTick(() => {
      const el = document.getElementById('wl-group-' + groupId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  const currentSortLabel = computed(() => {
    const f = sortField.value;
    if (f === 'extChange') return `${extShortLabel.value}涨跌幅`;
    if (f === 'regularChange') return '常规涨跌幅';
    if (f === 'regularPrice') return '常规收盘价';
    if (f === 'extPrice') return `${extShortLabel.value}价格`;
    if (f === 'marketCap') return '总市值';
    if (f === 'symbol') return '股票代码';
    if (f === 'updatedAt') return '更新时间';
    return `${extShortLabel.value}涨跌幅`;
  });

  function formatWatchlistTime(v) {
    if (v && Number.isFinite(Date.parse(v))) {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(new Date(v)) + ' 北京';
    }
    const d = clock.value || new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss} 北京`;
  }

  function getRowSessionBadge(r) {
    const sess = r?.extSession || currentSession.value?.session || 'pre';
    if (sess === 'pre' || r?.extStatus?.includes('盘前')) {
      return { icon: '🌅', label: '盘前交易', cls: 'session-pill-pre' };
    }
    if (sess === 'post' || r?.extStatus?.includes('盘后')) {
      return { icon: '🌙', label: '盘后交易', cls: 'session-pill-post' };
    }
    if (sess === 'overnight' || r?.extStatus?.includes('隔夜')) {
      return { icon: '✨', label: '隔夜交易', cls: 'session-pill-overnight' };
    }
    if (sess === 'regular' || r?.extStatus?.includes('常规')) {
      return { icon: '☀️', label: '常规交易', cls: 'session-pill-regular' };
    }
    return { icon: '🌅', label: r?.extStatus || '盘前交易', cls: 'session-pill-pre' };
  }

  function toggleSort(field) {
    if (sortField.value === field) {
      sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
      sortField.value = field;
      sortDirection.value = 'desc';
    }
  }

  // Sidebar Watchlist State & Methods (Persistent Sorting & Group Filtering)
  const storedSortField = readStorage('market-desk-sidebar-sort-field', 'activeChange');
  const sidebarSortField = ref(storedSortField || 'activeChange');
  const sidebarSortDirection = ref(readStorage('market-desk-sidebar-sort-dir', 'desc'));
  const sidebarActiveGroup = ref(readStorage('market-desk-sidebar-group', 'all'));
  const storedViewMode = readStorage('market-desk-sidebar-view-mode', 'grouped');
  const sidebarViewMode = ref(storedViewMode === 'flat' ? 'flat' : 'grouped'); // 'grouped' | 'flat'

  const activeSessionKey = computed(() => {
    if (extMode.value && extMode.value !== 'auto') return extMode.value;
    return currentSession.value?.session || 'regular';
  });

  const activeSessionShortLabel = computed(() => {
    const s = activeSessionKey.value;
    if (s === 'pre') return '盘前';
    if (s === 'post') return '盘后';
    if (s === 'overnight') return '隔夜';
    if (s === 'closed') return '休市';
    return '常规';
  });

  const activeSessionPriceLabel = computed(() => {
    const s = activeSessionKey.value;
    if (s === 'pre') return '盘前价';
    if (s === 'post') return '盘后价';
    if (s === 'overnight') return '隔夜价';
    return '现价';
  });

  const activeSessionChangeLabel = computed(() => {
    const s = activeSessionKey.value;
    if (s === 'pre') return '盘前涨幅';
    if (s === 'post') return '盘后涨幅';
    if (s === 'overnight') return '隔夜涨幅';
    return '涨跌幅';
  });

  const isSortedByChange = computed(() => {
    return sidebarSortField.value === 'activeChange' ||
           sidebarSortField.value === 'regularChange' ||
           sidebarSortField.value === 'extChange' ||
           !sidebarSortField.value ||
           sidebarSortField.value === 'change';
  });

  function setSidebarViewMode(mode) {
    sidebarViewMode.value = (mode === 'flat' ? 'flat' : 'grouped');
    persist('market-desk-sidebar-view-mode', sidebarViewMode.value);
  }

  function toggleSidebarSort(field) {
    if (field === 'symbol') {
      if (sidebarSortField.value === 'symbol') {
        if (sidebarSortDirection.value === 'asc') {
          sidebarSortDirection.value = 'desc';
        } else {
          sidebarSortField.value = 'manual';
          sidebarSortDirection.value = 'asc';
        }
      } else {
        sidebarSortField.value = 'symbol';
        sidebarSortDirection.value = 'asc';
      }
    } else if (field === 'price' || field === 'activePrice' || field === 'regularPrice') {
      if (sidebarSortField.value === 'activePrice' || sidebarSortField.value === 'regularPrice') {
        if (sidebarSortDirection.value === 'desc') {
          sidebarSortDirection.value = 'asc';
        } else {
          sidebarSortField.value = 'manual';
          sidebarSortDirection.value = 'desc';
        }
      } else {
        sidebarSortField.value = 'activePrice';
        sidebarSortDirection.value = 'desc';
      }
    } else {
      // Default / change percent sort
      if (sidebarSortField.value === 'activeChange' || sidebarSortField.value === 'regularChange' || sidebarSortField.value === 'extChange' || !sidebarSortField.value) {
        if (sidebarSortDirection.value === 'desc') {
          sidebarSortDirection.value = 'asc';
        } else {
          sidebarSortField.value = 'manual';
          sidebarSortDirection.value = 'desc';
        }
      } else {
        sidebarSortField.value = 'activeChange';
        sidebarSortDirection.value = 'desc';
      }
    }
    persist('market-desk-sidebar-sort-field', sidebarSortField.value);
    persist('market-desk-sidebar-sort-dir', sidebarSortDirection.value);
  }

  function resetSidebarSort() {
    sidebarSortField.value = 'activeChange';
    sidebarSortDirection.value = 'desc';
    persist('market-desk-sidebar-sort-field', 'activeChange');
    persist('market-desk-sidebar-sort-dir', 'desc');
  }

  function setSidebarSort(field) {
    toggleSidebarSort(field);
  }

  function setSidebarGroup(groupId) {
    sidebarActiveGroup.value = groupId;
    persist('market-desk-sidebar-group', groupId);
  }

  function toggleSidebarViewMode() {
    setSidebarViewMode(sidebarViewMode.value === 'grouped' ? 'flat' : 'grouped');
  }

  function toggleGroupCollapse(groupId) {
    watchlistMgr.toggleGroupCollapse(groupId);
    syncWatchlistData();
  }

  function toggleAllGroupsCollapse() {
    const anyOpen = groups.value.some(g => !g.collapsed);
    for (const g of watchlistMgr.data.groups) {
      g.collapsed = anyOpen;
    }
    watchlistMgr.save();
    syncWatchlistData();
  }

  const areAllGroupsCollapsed = computed(() => {
    return groups.value.length > 0 && groups.value.every(g => g.collapsed);
  });

  function openAddStockToGroup(groupId) {
    const grp = watchlistMgr.getGroup(groupId);
    if (grp && grp.collapsed) {
      watchlistMgr.toggleGroupCollapse(groupId);
      syncWatchlistData();
    }
    addStockTargetGroup.value = groupId || 'default';
    showAddStockModal.value = true;
  }

  // Group-level Change% Sorting States (3-state cycle: 'default' -> 'desc' -> 'asc' -> 'default')
  const groupSortStates = reactive(readStorage('market-desk-group-sort-states', {}));

  function persistGroupSortStates() {
    persist('market-desk-group-sort-states', { ...groupSortStates });
  }

  function cycleGroupSort(groupId) {
    const current = groupSortStates[groupId] || 'default';
    let next = 'desc';
    if (current === 'default') {
      next = 'desc';
    } else if (current === 'desc') {
      next = 'asc';
    } else {
      next = 'default';
    }
    groupSortStates[groupId] = next;
    persistGroupSortStates();

    const grp = watchlistMgr.getGroup(groupId);
    const grpName = grp?.name || '分组';
    if (next === 'desc') {
      toast.value = `「${grpName}」已按涨跌幅降序排列`;
    } else if (next === 'asc') {
      toast.value = `「${grpName}」已按涨跌幅升序排列`;
    } else {
      toast.value = `「${grpName}」已恢复默认排序（支持手动拖拽）`;
    }
  }

  function getGroupSortTitle(groupId) {
    const state = groupSortStates[groupId] || 'default';
    if (state === 'desc') {
      return '当前：按涨跌幅降序（点击切换为升序）';
    } else if (state === 'asc') {
      return '当前：按涨跌幅升序（点击恢复默认排序）';
    }
    return '组内按涨跌幅排序（点击切换为降序，恢复默认后支持手动拖拽）';
  }

  // TradingView Style: Vertical sections with internal sorting and group-level sorting
  const sidebarGroupSections = computed(() => {
    const activeField = (sidebarSortField.value === 'symbol' || sidebarSortField.value === 'activePrice' || sidebarSortField.value === 'regularPrice' || sidebarSortField.value === 'marketCap' || sidebarSortField.value === 'manual')
      ? sidebarSortField.value
      : 'activeChange';

    const list = groups.value.map(g => {
      const rows = g.symbolIds.map(buildRow);
      let sortedRows;
      const grpSort = groupSortStates[g.id] || 'default';

      if (grpSort === 'desc') {
        sortedRows = sortWatchlistRows(rows, 'activeChange', 'desc');
      } else if (grpSort === 'asc') {
        sortedRows = sortWatchlistRows(rows, 'activeChange', 'asc');
      } else if ((g.id === 'trillion' || g.name === '万亿市值') && (!activeField || activeField === 'manual' || activeField === 'marketCap')) {
        sortedRows = sortWatchlistRows(rows, 'marketCap', sidebarSortField.value === 'marketCap' ? sidebarSortDirection.value : 'desc');
      } else if (activeField && activeField !== 'manual' && activeField !== 'custom') {
        sortedRows = sortWatchlistRows(rows, activeField, sidebarSortDirection.value || 'desc');
      } else {
        sortedRows = sortWatchlistRows(rows, 'activeChange', 'desc');
      }

      // Calculate group average change on the active session's change percent:
      const valid = rows.filter(r => r.activeChange !== null && Number.isFinite(r.activeChange));
      let avg = null;
      if (valid.length) {
        avg = valid.reduce((acc, r) => acc + r.activeChange, 0) / valid.length;
      } else {
        const validReg = rows.filter(r => r.regularChange !== null && Number.isFinite(r.regularChange));
        if (validReg.length) {
          avg = validReg.reduce((acc, r) => acc + r.regularChange, 0) / validReg.length;
        }
      }

      return {
        id: g.id,
        name: g.name,
        collapsed: Boolean(g.collapsed),
        count: g.symbolIds.length,
        avgChange: avg,
        rows: sortedRows
      };
    });

    if (activeField === 'activeChange') {
      const dir = sidebarSortDirection.value === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        if (a.id === 'default' && b.id !== 'default') return 1;
        if (b.id === 'default' && a.id !== 'default') return -1;
        const valA = (a.avgChange !== null && Number.isFinite(a.avgChange)) ? a.avgChange : (dir === 1 ? Infinity : -Infinity);
        const valB = (b.avgChange !== null && Number.isFinite(b.avgChange)) ? b.avgChange : (dir === 1 ? Infinity : -Infinity);
        return (valA - valB) * dir;
      });
    } else if (activeField === 'symbol') {
      const dir = sidebarSortDirection.value === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        if (a.id === 'default' && b.id !== 'default') return 1;
        if (b.id === 'default' && a.id !== 'default') return -1;
        return a.name.localeCompare(b.name, 'zh-CN') * dir;
      });
    }

    return list;
  });

  // Flat Overall Sorted Watchlist Rows (Ranking across all symbols by current session change)
  const sidebarFlatRows = computed(() => {
    const rows = watchlist.value.map(buildRow);
    const activeField = (sidebarSortField.value === 'symbol' || sidebarSortField.value === 'activePrice' || sidebarSortField.value === 'regularPrice' || sidebarSortField.value === 'marketCap')
      ? sidebarSortField.value
      : 'activeChange';
    const dir = sidebarSortDirection.value || 'desc';
    return sortWatchlistRows(rows, activeField, dir);
  });

  const sidebarWatchlistRows = computed(() => {
    if (sidebarViewMode.value === 'flat') return sidebarFlatRows.value;
    const visible = [];
    for (const sec of sidebarGroupSections.value) {
      if (!sec.collapsed) {
        visible.push(...sec.rows);
      }
    }
    return visible;
  });

  // Watchlist Drag & Drop (Intra-group sorting, cross-group movement, and whole-group reordering)
  const draggedStock = ref(null); // { symbol: string, sourceGroupId: string }
  const dragOverTarget = ref(null); // { symbol: string, groupId: string, position: 'before' | 'after' }
  const dragOverGroup = ref(null); // groupId
  const draggedGroup = ref(null); // groupId
  const dragOverGroupOrderTarget = ref(null); // { groupId: string, position: 'before' | 'after' }
  let autoExpandTimer = null;

  function onGroupDragStart(event, groupId) {
    if (isDeleteMode.value) {
      event.preventDefault();
      return;
    }
    draggedGroup.value = groupId;
    dragOverGroupOrderTarget.value = null;
    draggedStock.value = null;
    dragOverTarget.value = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', 'group:' + groupId);
      try {
        event.dataTransfer.setData('application/json', JSON.stringify({ type: 'group', groupId }));
      } catch {}
    }
  }

  function onGroupDragEnd() {
    draggedGroup.value = null;
    dragOverGroupOrderTarget.value = null;
  }

  function moveGroupUp(groupId) {
    const res = watchlistMgr.moveGroupOrder(groupId, 'up');
    if (res.ok) {
      sidebarSortField.value = 'manual';
      persist('market-desk-sidebar-sort-field', 'manual');
      syncWatchlistData();
      const grp = watchlistMgr.getGroup(groupId);
      toast.value = `已将「${grp?.name || '分组'}」上移`;
    }
  }

  function moveGroupDown(groupId) {
    const res = watchlistMgr.moveGroupOrder(groupId, 'down');
    if (res.ok) {
      sidebarSortField.value = 'manual';
      persist('market-desk-sidebar-sort-field', 'manual');
      syncWatchlistData();
      const grp = watchlistMgr.getGroup(groupId);
      toast.value = `已将「${grp?.name || '分组'}」下移`;
    }
  }

  function onStockDragStart(event, r, groupId) {
    if (isDeleteMode.value) {
      event.preventDefault();
      return;
    }
    draggedStock.value = { symbol: r.symbol, sourceGroupId: groupId };
    dragOverTarget.value = null;
    dragOverGroup.value = null;
    draggedGroup.value = null;
    dragOverGroupOrderTarget.value = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', r.symbol);
      try {
        event.dataTransfer.setData('application/json', JSON.stringify({ symbol: r.symbol, sourceGroupId: groupId }));
      } catch {}
    }
  }

  function onStockDragEnd() {
    draggedStock.value = null;
    dragOverTarget.value = null;
    dragOverGroup.value = null;
    if (autoExpandTimer) {
      clearTimeout(autoExpandTimer);
      autoExpandTimer = null;
    }
  }

  function onStockDragOver(event, targetRow, targetGroupId) {
    event.preventDefault();
    if (!draggedStock.value) return;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const position = offsetY < rect.height / 2 ? 'before' : 'after';
    dragOverTarget.value = {
      symbol: targetRow.symbol,
      groupId: targetGroupId,
      position
    };
    dragOverGroup.value = targetGroupId;
  }

  function onStockDragLeave(event, targetRow) {
    if (dragOverTarget.value?.symbol === targetRow.symbol) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX, y = event.clientY;
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
        dragOverTarget.value = null;
      }
    }
  }

  function onStockDrop(event, targetRow, targetGroupId) {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedStock.value) return;

    const { symbol: srcSym, sourceGroupId } = draggedStock.value;
    const targetSymbol = targetRow.symbol;
    const pos = dragOverTarget.value?.position || 'before';

    if (sourceGroupId === targetGroupId) {
      watchlistMgr.moveSymbolWithinGroup(targetGroupId, srcSym, targetSymbol, pos);
      toast.value = `已调整 ${srcSym} 组内排序`;
    } else {
      watchlistMgr.moveSymbolBetweenGroups(sourceGroupId, targetGroupId, srcSym, targetSymbol, pos);
      const toGrp = watchlistMgr.getGroup(targetGroupId);
      toast.value = `已将 ${srcSym} 移入「${toGrp?.name || '新分组'}」`;
    }

    // Switch sort mode to manual so the user's custom ordering is immediately visible
    sidebarSortField.value = 'manual';
    persist('market-desk-sidebar-sort-field', 'manual');
    if (groupSortStates[targetGroupId] && groupSortStates[targetGroupId] !== 'default') {
      groupSortStates[targetGroupId] = 'default';
      persistGroupSortStates();
    }
    syncWatchlistData();
    onStockDragEnd();
  }

  function onGroupHeaderDragOver(event, groupId) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    // If dragging a group header to reorder groups
    if (draggedGroup.value) {
      if (draggedGroup.value !== groupId) {
        const rect = event.currentTarget.getBoundingClientRect();
        const offsetY = event.clientY - rect.top;
        const position = offsetY < rect.height / 2 ? 'before' : 'after';
        dragOverGroupOrderTarget.value = { groupId, position };
      }
      return;
    }

    // If dragging an individual stock
    dragOverGroup.value = groupId;
    dragOverTarget.value = null;

    const grp = watchlistMgr.getGroup(groupId);
    if (grp && grp.collapsed && !autoExpandTimer) {
      autoExpandTimer = setTimeout(() => {
        if (draggedStock.value && dragOverGroup.value === groupId) {
          watchlistMgr.toggleGroupCollapse(groupId);
          syncWatchlistData();
        }
        autoExpandTimer = null;
      }, 550);
    }
  }

  function onGroupHeaderDragLeave(event, groupId) {
    if (dragOverGroupOrderTarget.value?.groupId === groupId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX, y = event.clientY;
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
        dragOverGroupOrderTarget.value = null;
      }
    }
  }

  function onGroupHeaderDrop(event, groupId) {
    event.preventDefault();
    event.stopPropagation();

    // Group reordering drop
    if (draggedGroup.value) {
      const srcGroupId = draggedGroup.value;
      if (srcGroupId !== groupId) {
        const pos = dragOverGroupOrderTarget.value?.position || 'before';
        const res = watchlistMgr.moveGroup(srcGroupId, groupId, pos);
        if (res.ok) {
          sidebarSortField.value = 'manual';
          persist('market-desk-sidebar-sort-field', 'manual');
          syncWatchlistData();
          const grp = watchlistMgr.getGroup(srcGroupId);
          toast.value = `已调整分组「${grp?.name || ''}」排序`;
        }
      }
      onGroupDragEnd();
      return;
    }

    if (!draggedStock.value) return;

    const { symbol: srcSym, sourceGroupId } = draggedStock.value;
    if (sourceGroupId === groupId) {
      const grp = watchlistMgr.getGroup(groupId);
      if (grp && grp.symbolIds.length) {
        watchlistMgr.moveSymbolWithinGroup(groupId, srcSym, grp.symbolIds[0], 'before');
        toast.value = `已置顶 ${srcSym}`;
      }
    } else {
      watchlistMgr.moveSymbolBetweenGroups(sourceGroupId, groupId, srcSym, null, 'after');
      const toGrp = watchlistMgr.getGroup(groupId);
      toast.value = `已将 ${srcSym} 移入「${toGrp?.name || '新分组'}」`;
    }

    sidebarSortField.value = 'manual';
    persist('market-desk-sidebar-sort-field', 'manual');
    if (groupSortStates[groupId] && groupSortStates[groupId] !== 'default') {
      groupSortStates[groupId] = 'default';
      persistGroupSortStates();
    }
    syncWatchlistData();
    onStockDragEnd();
  }

  function onGroupBodyDrop(event, groupId) {
    event.preventDefault();
    if (!draggedStock.value) return;
    const { symbol: srcSym, sourceGroupId } = draggedStock.value;
    if (sourceGroupId === groupId) {
      const grp = watchlistMgr.getGroup(groupId);
      if (grp && grp.symbolIds.length) {
        const lastSym = grp.symbolIds[grp.symbolIds.length - 1];
        if (lastSym !== srcSym) {
          watchlistMgr.moveSymbolWithinGroup(groupId, srcSym, lastSym, 'after');
          toast.value = `已移至组末 ${srcSym}`;
        }
      }
    } else {
      watchlistMgr.moveSymbolBetweenGroups(sourceGroupId, groupId, srcSym, null, 'after');
      const toGrp = watchlistMgr.getGroup(groupId);
      toast.value = `已将 ${srcSym} 移入「${toGrp?.name || '新分组'}」`;
    }
    sidebarSortField.value = 'manual';
    persist('market-desk-sidebar-sort-field', 'manual');
    if (groupSortStates[groupId] && groupSortStates[groupId] !== 'default') {
      groupSortStates[groupId] = 'default';
      persistGroupSortStates();
    }
    syncWatchlistData();
    onStockDragEnd();
  }

  function onEmptyGroupDrop(event, groupId) {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedStock.value) return;
    const { symbol: srcSym, sourceGroupId } = draggedStock.value;
    watchlistMgr.moveSymbolBetweenGroups(sourceGroupId, groupId, srcSym, null, 'after');
    const toGrp = watchlistMgr.getGroup(groupId);
    toast.value = `已将 ${srcSym} 移入「${toGrp?.name || '新分组'}」`;
    sidebarSortField.value = 'manual';
    persist('market-desk-sidebar-sort-field', 'manual');
    if (groupSortStates[groupId] && groupSortStates[groupId] !== 'default') {
      groupSortStates[groupId] = 'default';
      persistGroupSortStates();
    }
    syncWatchlistData();
    onStockDragEnd();
  }

  function onFlatStockDragStart(event, r) {
    if (isDeleteMode.value) { event.preventDefault(); return; }
    const grp = watchlistMgr.getGroups().find(g => g.symbolIds.includes(r.symbol));
    const srcGroupId = grp ? grp.id : 'default';
    draggedStock.value = { symbol: r.symbol, sourceGroupId: srcGroupId };
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', r.symbol);
    }
  }

  function onFlatStockDrop(event, targetRow) {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedStock.value) return;
    const { symbol: srcSym, sourceGroupId } = draggedStock.value;
    const tgtGrp = watchlistMgr.getGroups().find(g => g.symbolIds.includes(targetRow.symbol));
    const tgtGroupId = tgtGrp ? tgtGrp.id : sourceGroupId;
    const pos = dragOverTarget.value?.position || 'before';

    if (sourceGroupId === tgtGroupId) {
      watchlistMgr.moveSymbolWithinGroup(sourceGroupId, srcSym, targetRow.symbol, pos);
    } else {
      watchlistMgr.moveSymbolBetweenGroups(sourceGroupId, tgtGroupId, srcSym, targetRow.symbol, pos);
    }
    sidebarSortField.value = 'manual';
    persist('market-desk-sidebar-sort-field', 'manual');
    syncWatchlistData();
    onStockDragEnd();
  }

  // Trigger Flash Animation
  function flashCell(sym, field, dir) {
    const key = `${sym}_${field}`;
    cellFlashes[key] = dir;
    setTimeout(() => { delete cellFlashes[key]; }, 650);
  }

  // Fetch Watchlist Quotes Snapshot
  async function fetchWatchlistQuotes() {
    const symbols = watchlist.value;
    if (!symbols.length) return;
    try {
      states.watchlist.loading = true;
      const res = await fetch(`/api/watchlist/quotes?symbols=${encodeURIComponent(symbols.join(','))}`);
      calibrateClock(res?.headers?.get?.('date'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.quotes) {
        quoteStore.value = { ...quoteStore.value, ...data.quotes };
      }
      if (data.provider) providerInfo.value = data.provider;
      if (data.session) serverSession.value = data.session;
      states.watchlist.error = '';
    } catch (err) {
      states.watchlist.error = err.message || '获取自选报价失败';
    } finally {
      states.watchlist.loading = false;
    }
  }

  // Setup SSE stream with auto-reconnection and smart fallback
  let sseReconnectTimer = null;
  function setupEventSource() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    clearTimeout(sseReconnectTimer);
    const symbols = watchlist.value;
    if (!symbols.length || typeof EventSource === 'undefined') {
      startShortPolling();
      return;
    }

    try {
      const url = `/api/watchlist/stream?symbols=${encodeURIComponent(symbols.join(','))}`;
      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        stopShortPolling();
      };

      eventSource.onmessage = event => {
        stopShortPolling();
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'quotes' && Array.isArray(msg.data)) {
            for (const item of msg.data) {
              const current = quoteStore.value[item.symbol];
              if (current && current[item.session]) {
                const oldPrice = current[item.session].price;
                current[item.session].price = item.price;
                current[item.session].changePercent = item.changePercent;
                if (item.sourceTime) current[item.session].sourceTime = item.sourceTime;
                if (oldPrice !== null && item.price !== null && oldPrice !== item.price) {
                  flashCell(item.symbol, item.session === 'regular' ? 'regular' : 'ext', item.price > oldPrice ? 'up' : 'down');
                }
              }
            }
          }
        } catch {}
      };

      eventSource.onerror = () => {
        if (eventSource?.readyState === EventSource.CLOSED) {
          eventSource?.close();
          eventSource = null;
          startShortPolling();
          clearTimeout(sseReconnectTimer);
          sseReconnectTimer = setTimeout(() => {
            if (typeof document !== 'undefined' && !document.hidden) setupEventSource();
          }, 5000);
        } else {
          startShortPolling();
        }
      };
    } catch {
      startShortPolling();
    }
  }

  function startShortPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchWatchlistQuotes();
    }, 10000);
  }

  function stopShortPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  let watchlistDebounceTimer = null;
  watch(watchlist, (newList) => {
    syncWatchlistData();
    persist('market-desk-watchlist', newList);
    clearTimeout(watchlistDebounceTimer);
    watchlistDebounceTimer = setTimeout(() => {
      fetchWatchlistQuotes();
      setupEventSource();
    }, 300);
  }, { deep: true });

  // Watchlist Actions
  function addWatch(s, targetGroupId = 'default') {
    if (!validSymbol(s)) return;
    const res = watchlistMgr.addSymbol(s, targetGroupId);
    if (!res.ok) {
      toast.value = res.error;
      return;
    }
    syncWatchlistData();
    toast.value = `${res.symbol} 已加入自选`;
  }

  function removeWatch(s, groupId = null) {
    if (groupId) {
      watchlistMgr.removeSymbolFromGroup(s, groupId);
    } else {
      watchlistMgr.removeSymbolGlobally(s);
    }
    syncWatchlistData();
  }

  // Sidebar Delete Wobble Mode & 2-step delete interaction
  const isDeleteMode = ref(false);
  const pendingDeleteSymbol = ref(null);

  function toggleDeleteMode() {
    isDeleteMode.value = !isDeleteMode.value;
    pendingDeleteSymbol.value = null;
  }

  function handleChipClick(sym) {
    if (!isDeleteMode.value) {
      selectSymbol(sym);
      return;
    }

    if (pendingDeleteSymbol.value === sym) {
      // 2nd click: execute delete
      removeWatch(sym);
      pendingDeleteSymbol.value = null;
      toast.value = `已移出自选：${sym}`;
    } else {
      // 1st click: stage for deletion with blur + red cross
      pendingDeleteSymbol.value = sym;
    }
  }

  function handleCreateGroup() {
    const res = watchlistMgr.createGroup(newGroupName.value);
    if (!res.ok) {
      toast.value = res.error;
      return;
    }
    syncWatchlistData();
    newGroupName.value = '';
    toast.value = `分组“${res.group.name}”已创建`;
  }

  function handleDeleteGroup(groupId) {
    if (groupSortStates[groupId]) {
      delete groupSortStates[groupId];
      persistGroupSortStates();
    }
    const groupObj = watchlistMgr.getGroup(groupId);
    const groupName = groupObj?.name || '分组';

    const res = watchlistMgr.deleteGroup(groupId);
    if (!res.ok) {
      toast.value = res.error;
      return;
    }
    syncWatchlistData();
    undoAction.value = () => {
      watchlistMgr.undoDeleteGroup();
      syncWatchlistData();
      toast.value = `已撤销删除“${groupName}”`;
      undoAction.value = null;
    };
    toast.value = `分组“${groupName}”已删除，${res.movedSymbolsCount} 支标的已直接转移至“未分组”`;
  }

  function handleAddStockModalSubmit() {
    const s = addStockInput.value.trim().toUpperCase();
    if (!validSymbol(s)) {
      toast.value = '请输入有效代码，例如 AAPL、SPY 或 BRK-B。';
      return;
    }
    addWatch(s, addStockTargetGroup.value);
    addStockInput.value = '';
    showAddStockModal.value = false;
  }

  function handleExportJson() {
    backupJsonText.value = watchlistMgr.exportJson();
    showBackupModal.value = true;
  }

  function handleImportJson() {
    const res = watchlistMgr.importJson(backupJsonText.value);
    if (!res.ok) {
      toast.value = res.error;
      return;
    }
    syncWatchlistData();
    toast.value = `已成功恢复 ${res.groupCount} 个分组与 ${res.symbolCount} 支自选股`;
    showBackupModal.value = false;
  }

  function selectSymbol(s) {
    if (symbol.value === s && page.value === 'chart') {
      resetPriceChartZoom();
      return;
    }
    symbol.value = s;
    navigate('chart');
  }
  function search() { const s = searchInput.value.trim().toUpperCase(); if (!validSymbol(s)) { toast.value = '请输入有效代码，例如 AAPL、SPY 或 BRK-B。'; return; } selectSymbol(s); }

  async function request(key, endpoint, params, target) {
    const seq = sequences[key] = (sequences[key] || 0) + 1;
    controllers[key]?.abort(); const controller = controllers[key] = new AbortController();
    const timer = setTimeout(() => controller.abort(), 85000);
    states[key] = { loading: true, error: '' }; target.value = null;
    try {
      const response = await fetch(endpoint + '?' + new URLSearchParams(params), { signal: controller.signal });
      calibrateClock(response?.headers?.get?.('date'));
      const data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (seq === sequences[key]) target.value = data;
    } catch (e) { if (seq === sequences[key]) states[key].error = e.name === 'AbortError' ? '请求超时，请重试。' : e.message; }
    finally { clearTimeout(timer); if (seq === sequences[key]) { states[key].loading = false; await nextTick(); render(); } }
    return seq === sequences[key] ? target.value : null;
  }

  const loadOverview = () => request('overview', '/api/market/overview', {}, overview);
  const loadChart = () => request('chart', '/api/market/chart', { symbol: symbol.value, range: chartRange.value }, chart);
  const loadNews = () => request('news', '/api/news', { symbol: page.value === 'overview' ? '' : newsSymbol.value }, news);
  const loadCrypto = async () => {
    try {
      states.crypto.loading = true;
      states.crypto.error = '';
      const res = await fetch('/api/crypto');
      if (res.ok) {
        const data = await res.json();
        if (data?.items?.length) cryptoData.value = data;
      }
    } catch (e) {
      states.crypto.error = e.message || '加载加密数据失败';
    } finally {
      states.crypto.loading = false;
      await nextTick();
      render();
    }
  };
  async function loadOptions(reset = false) {
    const s = optionSymbol.value.trim().toUpperCase();
    if (!validSymbol(s)) { toast.value = '请输入有效的期权标的代码。'; return; }
    optionSymbol.value = s;
    const data = await request('options', '/api/options', { symbol: s, expiration: reset ? '' : optionExpiry.value }, options);
    if (data) optionExpiry.value = data.expiration;
  }

  function refresh() {
    if (page.value === 'overview' || page.value === 'flows') loadOverview();
    if (page.value === 'overview' || page.value === 'news') loadNews();
    if (page.value === 'overview' || page.value === 'crypto') loadCrypto();
    if (page.value === 'chart') loadChart();
    if (page.value === 'options') loadOptions();
    if (page.value === 'watchlist') fetchWatchlistQuotes();
  }

  async function importNotion() {
    importing.value = true;
    try {
      const r = await fetch('/api/watchlist');
      const data = await r.json();
      if (!r.ok) throw new Error('Notion 自选导入失败。');
      if (data.source !== 'notion') throw new Error('未取得 Notion 自选，请检查已有的 Notion 配置与网络。');
      const valid = data.symbols.filter(s => validSymbol(s));
      let addedCount = 0;
      for (const s of valid) {
        if (!watchlist.value.includes(s) && watchlist.value.length < MAX_UNIQUE_SYMBOLS) {
          watchlistMgr.addSymbol(s, 'default');
          addedCount++;
        }
      }
      syncWatchlistData();
      toast.value = `已从 Notion 导入 ${addedCount} 支自选至“未分组”${data.stale ? '（旧缓存）' : ''}，当前总计 ${watchlist.value.length} 支。`;
    } catch (e) { toast.value = e.message; }
    finally { importing.value = false; }
  }

  async function importFlows(event) {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > 500000) throw new Error('文件不能超过 500 KB。'); const text = await file.text(); const parsed = parseFlows(text); flows.value = parsed; flowDate.value = parsed[0].date; persist('market-desk-flows', text); toast.value = `已导入 ${parsed.length} 条净申赎记录。`; await nextTick(); render(); } catch (e) { toast.value = e.message; } finally { event.target.value = ''; }
  }
  function clearFlows() { flows.value = []; persist('market-desk-flows', ''); }

  function resetPriceChartZoom() {
    if (lwPriceChart) {
      try { lwPriceChart.timeScale().fitContent(); } catch (_) {}
      try { lwPriceChart.applyOptions({ rightPriceScale: { autoScale: true } }); } catch (_) {}
      try { lwPriceChart.priceScale('right').setAutoScale(true); } catch (_) {}
      try { lwPriceChart.priceScale('right').applyOptions({ autoScale: true }); } catch (_) {}
    }
    if (klineGestureCtrl) {
      if (typeof klineGestureCtrl.reset === 'function') {
        klineGestureCtrl.reset();
      } else {
        klineGestureCtrl.focusLatest();
      }
    }
    if (lwCandleSeries) {
      try {
        const sScale = lwCandleSeries.priceScale();
        if (typeof sScale.setAutoScale === 'function') sScale.setAutoScale(true);
        if (typeof sScale.applyOptions === 'function') sScale.applyOptions({ autoScale: true });
      } catch (_) {}
    }
    const entry = charts.get('price-chart');
    if (!entry || !entry.chart) return;
    entry.chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
    entry.chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 10, end: 90 });
    entry.chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 2, start: 0, end: 100 });
  }

  function makeChart(id, config, onClick) {
    const el = document.getElementById(id); if (!el || !el.clientWidth) return;
    let entry = charts.get(id);
    if (entry && entry.el !== el) { entry.observer.disconnect(); entry.chart.dispose(); charts.delete(id); entry = null; }
    if (!entry) {
      const instance = echarts.init(el, null, { renderer: 'canvas' });
      const observer = new ResizeObserver(() => instance.resize()); observer.observe(el);
      if (id === 'price-chart') {
        el.addEventListener('wheel', e => {
          if (!e.ctrlKey) e.preventDefault();
        }, { passive: false });
        el.addEventListener('dblclick', () => resetPriceChartZoom());
      }
      entry = { chart: instance, el, observer }; charts.set(id, entry);
    }
    entry.chart.setOption({ animation: false, textStyle: { fontFamily: 'Inter, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif', color: muted }, ...config }, true);
    entry.chart.off('click'); if (onClick) entry.chart.on('click', onClick); entry.chart.resize();
  }

  function updateChartTheme() {
    muted = isDark.value ? '#94A3B8' : '#64748B';
    gridColor = isDark.value ? '#334155' : '#E2E8F0';
    chartText = isDark.value ? '#F8FAFC' : '#0F172A';
    chartSurface = isDark.value ? '#000000' : '#FFFFFF';
    green = '#10B981';
    red = '#F43F5E';
    blue = '#2563EB';
    axis = { axisLine: { lineStyle: { color: gridColor } }, axisTick: { show: false }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: gridColor, type: 'dashed' } } };
    tooltip = { renderMode: 'richText', backgroundColor: isDark.value ? '#151D2C' : '#FFFFFF', borderColor: isDark.value ? 'rgba(255,255,255,0.12)' : '#E2E8F0', textStyle: { color: chartText }, confine: true };
  }

  const STOCK_ROLES = {
    NVDA: { tag: '算力龙头', subtag: 'AI GPU' },
    MU: { tag: '半导体存储', subtag: 'Rank #1 资金热度', pe: '24.2', flow: '+$342M' },
    AAPL: { tag: '消费电子', subtag: '硬件' },
    MSFT: { tag: '软件/云', subtag: 'AI SaaS' },
    AMD: { tag: '芯片', subtag: 'CPU/GPU' },
    AVGO: { tag: '通信网络芯片', subtag: 'ASIC' },
    GOOGL: { tag: '搜索与云', subtag: 'Gemini' },
    META: { tag: '社交元宇宙', subtag: '开源模型' },
    NFLX: { tag: '流媒体', subtag: '订阅龙头' },
    AMZN: { tag: '电商与AWS', subtag: '云计算' },
    TSLA: { tag: '智能电动车', subtag: 'FSD/Robotaxi' },
    JPM: { tag: '核心商行', subtag: '全能投行' },
    V: { tag: '支付网络', subtag: '清算网络' },
    WMT: { tag: '零售巨头', subtag: '消费必需' },
    LLY: { tag: '医药制造', subtag: 'GLP-1' },
    XOM: { tag: '传统石化', subtag: '综合能源' },
    CAT: { tag: '重型机械', subtag: '周期制造' },
    NEE: { tag: '清洁电力', subtag: '绿电公用' }
  };

  // Google Stitch Design System: Luminous & Vibrant Financial Palette
  // Primary #2563EB | Secondary #10B981 | Tertiary #F43F5E | Neutral #64748B
  function getHeatmapBracketStyle(change, dark) {
    if (change === null || change === undefined || !Number.isFinite(change)) {
      return {
        bg: dark ? '#334155' : '#64748B',
        text: '#FFFFFF',
        border: dark ? '#0B0F19' : '#FFFFFF'
      };
    }
    // High Drop: <= -3.0% (Deep Vibrant Rose/Crimson)
    if (change <= -3.0) {
      return {
        bg: '#E11D48',
        text: '#FFFFFF',
        border: dark ? '#0B0F19' : '#FFFFFF'
      };
    }
    // Moderate Drop: -1.5% ~ -3.0%
    if (change <= -1.5) {
      return {
        bg: '#F43F5E',
        text: '#FFFFFF',
        border: dark ? '#0B0F19' : '#FFFFFF'
      };
    }
    // Mild Drop: < 0% (Vibrant Rose/Coral like AAPL -0.05% in prototype)
    if (change < 0) {
      return {
        bg: '#F43F5E',
        text: '#FFFFFF',
        border: dark ? '#0B0F19' : '#FFFFFF'
      };
    }
    // Flat / Zero: 0.00%
    if (change === 0) {
      return {
        bg: dark ? '#334155' : '#64748B',
        text: '#FFFFFF',
        border: dark ? '#0B0F19' : '#FFFFFF'
      };
    }
    // Mild Gain: > 0% ~ +1.5% (Luminous Emerald like NVDA +0.23%, MSFT +0.07% in prototype)
    if (change < 1.5) {
      return {
        bg: '#10B981',
        text: '#FFFFFF',
        border: dark ? '#0B0F19' : '#FFFFFF'
      };
    }
    // Moderate Gain: +1.5% ~ +3.0%
    if (change < 3.0) {
      return {
        bg: '#10B981',
        text: '#FFFFFF',
        border: dark ? '#0B0F19' : '#FFFFFF'
      };
    }
    // High Gain: >= +3.0% (Deep Rich Emerald like MU +3.16% in prototype)
    return {
      bg: '#059669',
      text: '#FFFFFF',
      border: dark ? '#0B0F19' : '#FFFFFF'
    };
  }

  function renderHeatmap() {
    if (!overview.value && !activeHeatmapStocks.value.length) return;
    const selected = activeHeatmapStocks.value.filter(q => sectorFilter.value === '全部' || q.sector === sectorFilter.value);
    const isDarkTheme = isDark.value;

    const data = selected.map(q => {
      const hasTurnover = q.turnover !== null && Number.isFinite(q.turnover) && q.turnover > 0;
      let val = 1;
      if (heatSize.value === 'turnover') {
        val = hasTurnover ? q.turnover : 0;
      }
      const st = getHeatmapBracketStyle(q.changePercent, isDarkTheme);
      return {
        name: q.symbol,
        value: val,
        quote: q,
        itemStyle: {
          color: st.bg,
          borderColor: isDarkTheme ? '#0B0F19' : '#FFFFFF',
          borderWidth: 3,
          gapWidth: 4
        },
        label: {
          color: '#FFFFFF'
        }
      };
    }).filter(d => heatSize.value === 'equal' || d.value > 0);

    makeChart('heatmap-chart', {
      tooltip: {
        ...tooltip,
        formatter: p => {
          const q = p.data?.quote;
          if (!q) return '';
          const sign = (q.changePercent || 0) > 0 ? '+' : '';
          const pctStr = Number.isFinite(q.changePercent) ? `${sign}${q.changePercent.toFixed(2)}%` : '暂无涨跌';
          const priceStr = q.price !== null && Number.isFinite(q.price) ? `${num(q.price)} USD` : '暂无报价';
          const volStr = q.turnover ? `估算成交额: $${compact(q.turnover)} (最新价×股数)` : '估算成交额: 未提供';
          const timeStr = q.asOf ? time(q.asOf) : '实时行情';
          return `${q.symbol} · ${q.name || q.symbol}\n所属: ${q.sector || '美股'}\n现价: ${priceStr}   涨跌: ${pctStr}\n${volStr}\n数据时间: ${timeStr}`;
        }
      },
      series: [{
        type: 'treemap',
        data,
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        itemStyle: {
          borderColor: isDarkTheme ? '#0B0F19' : '#FFFFFF',
          borderWidth: 3,
          gapWidth: 4,
          borderRadius: 8
        },
        label: {
          show: true,
          color: '#FFFFFF',
          formatter: p => {
            const q = p.data?.quote;
            if (!q) return p.name;
            const role = STOCK_ROLES[q.symbol] || { tag: q.sector || '美股', subtag: '' };
            const sign = (q.changePercent || 0) > 0 ? '+' : '';
            const pctStr = Number.isFinite(q.changePercent) ? `${sign}${q.changePercent.toFixed(2)}%` : '—';
            const priceStr = q.price !== null && Number.isFinite(q.price) ? `$${q.price.toFixed(2)}` : '—';
            const volStr = q.turnover ? `成交 $${compact(q.turnover)}` : '';

            // Rich card layout matching Stitch Prototype (Image 1)
            if (q.symbol === 'MU') {
              return `{top|半导体存储  }{rank|Rank #1 资金热度}\n\n{sym|MU}\n{pct|${pctStr}}\n{sub|${priceStr} · ${volStr}}\n\n{bot|PE: 24.2     净流入: +$342M}`;
            }
            if (['NVDA', 'AAPL', 'AVGO'].includes(q.symbol)) {
              const subline = volStr ? `${priceStr}    ${volStr}` : priceStr;
              const badgeText = role.subtag ? `{badge|${role.subtag}}` : '';
              return `{top|${role.tag}}  ${badgeText}\n\n{sym|${q.symbol}}\n{pct|${pctStr}}\n\n{sub|${subline}}`;
            }
            if (['AMD', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'WDC', 'SOXX'].includes(q.symbol)) {
              const badgeText = role.subtag ? ` {badge|${role.subtag}}` : '';
              return `{top|${role.tag}}${badgeText}\n\n{sym|${q.symbol}}\n{pct|${pctStr}}\n\n{sub|${priceStr}}`;
            }
            return `{top|${role.tag}}\n{sym|${q.symbol}}\n{pct|${pctStr}}`;
          },
          rich: {
            top: { fontSize: 11, color: 'rgba(255, 255, 255, 0.92)', align: 'left', fontWeight: '500', lineHeight: 16 },
            badge: { fontSize: 9, color: 'rgba(255, 255, 255, 0.98)', backgroundColor: 'rgba(0, 0, 0, 0.24)', padding: [2, 5], borderRadius: 4, fontWeight: 'bold' },
            rank: { fontSize: 9, color: '#FEF08A', backgroundColor: 'rgba(0, 0, 0, 0.35)', padding: [2, 6], borderRadius: 4, fontWeight: 'bold' },
            sym: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', align: 'center', lineHeight: 26, fontFamily: 'Hanken Grotesk, sans-serif' },
            pct: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', align: 'center', lineHeight: 20, fontFamily: 'JetBrains Mono, monospace' },
            sub: { fontSize: 11, color: 'rgba(255, 255, 255, 0.88)', align: 'center', lineHeight: 16, fontFamily: 'JetBrains Mono, monospace' },
            bot: { fontSize: 10, color: 'rgba(255, 255, 255, 0.85)', align: 'left', lineHeight: 16 }
          }
        },
        emphasis: { itemStyle: { borderColor: blue, borderWidth: 2 } }
      }]
    }, p => { if (p.data && p.data.quote) openHeatmapStockModal(p.data.quote); });
  }

  function calcMA(bars, period) {
    return bars.map((b, i) => {
      if (i < period - 1) return '-';
      let sum = 0;
      for (let j = 0; j < period; j++) sum += bars[i - j].close;
      return Number((sum / period).toFixed(2));
    });
  }

  function calcMALineData(bars, period) {
    const result = [];
    let sum = 0;
    for (let i = 0; i < bars.length; i++) {
      sum += bars[i].close;
      if (i >= period) sum -= bars[i - period].close;
      if (i + 1 >= period) {
        result.push({ time: bars[i].time, value: Number((sum / period).toFixed(2)) });
      }
    }
    return result;
  }

  function updateReadoutFromCrosshair(param, candleSeries, maSeriesMap, bars) {
    const textEl = document.getElementById('chart-readout-text');
    if (!textEl) return;
    let bar = null;
    if (param && param.time && param.seriesData) {
      const candle = param.seriesData.get(candleSeries);
      if (candle && 'close' in candle) {
        bar = candle;
      }
    }
    if (!bar && bars && bars.length) {
      bar = bars[bars.length - 1];
    }
    if (!bar) return;

    const o = Number(bar.open).toFixed(2);
    const h = Number(bar.high).toFixed(2);
    const l = Number(bar.low).toFixed(2);
    const c = Number(bar.close).toFixed(2);
    const diff = Number(bar.close - bar.open).toFixed(2);
    const diffPct = bar.open > 0 ? ((bar.close - bar.open) / bar.open * 100).toFixed(2) + '%' : '0.00%';
    const curKline = KLINE_SCHEMES[klineScheme.value] || KLINE_SCHEMES.classic;
    const toneColor = bar.close >= bar.open ? curKline.up : curKline.down;

    const dateStr = bar.time
      ? new Intl.DateTimeFormat('zh-CN', {
          timeZone: 'America/New_York',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(new Date(bar.time * 1000))
      : '';

    textEl.innerHTML = `<span style="color:var(--text-tertiary);margin-right:8px;">${dateStr}</span>` +
      `开 <b style="color:var(--text-primary)">${o}</b> 高 <b style="color:var(--text-primary)">${h}</b> ` +
      `低 <b style="color:var(--text-primary)">${l}</b> 收 <b style="color:${toneColor}">${c}</b> ` +
      `涨跌 <b style="color:${toneColor}">${diff} (${diffPct})</b>`;
  }

  function renderPrice() {
    const d = chart.value; if (!d || states.chart.loading) return;
    const el = document.getElementById('price-chart');
    if (!el || !el.clientWidth) return;
    const LW = window.LightweightCharts;

    const curKline = KLINE_SCHEMES[klineScheme.value] || KLINE_SCHEMES.classic;
    const klineUp = curKline.up;
    const klineDown = curKline.down;
    const isDarkTheme = isDark.value;
    const chartBg = isDarkTheme ? '#000000' : '#FFFFFF';
    const gridColorValue = isDarkTheme ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.07)';
    const textThemeColor = isDarkTheme ? '#94A3B8' : '#64748B';
    const showGrid = klineGridStyle.value !== 'none';
    const gridStyleNum = klineGridStyle.value === 'solid' ? 0 : 2;
    const volAlpha = isDarkTheme ? 0.65 : 0.75;
    const volUpColor = hexToRgba(klineUp, volAlpha);
    const volDownColor = hexToRgba(klineDown, volAlpha);

    const bars = d.bars || [];
    if (!bars.length) return;

    const isNewSymbolOrRange = (d.symbol !== lastRenderedSymbol || d.range !== lastRenderedRange);
    lastRenderedSymbol = d.symbol;
    lastRenderedRange = d.range;

    // 1. Production TradingView + OKX Engine via Lightweight Charts 5.2
    if (LW && typeof LW.createChart === 'function') {
      if (lwPriceChart && lwPriceChart._hostEl !== el) {
        disposePriceChart();
      }

      if (!lwPriceChart) {
        el.innerHTML = '';
        const chartInstance = LW.createChart(el, {
          autoSize: true,
          layout: {
            background: { type: LW.ColorType.Solid, color: chartBg },
            textColor: textThemeColor,
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif',
            fontSize: 12
          },
          grid: {
            vertLines: { color: gridColorValue, style: gridStyleNum, visible: showGrid },
            horzLines: { color: gridColorValue, style: gridStyleNum, visible: showGrid }
          },
          rightPriceScale: {
            visible: true,
            autoScale: true,
            borderColor: gridColorValue,
            scaleMargins: { top: 0.08, bottom: 0.22 }
          },
          leftPriceScale: { visible: false },
          timeScale: {
            timeVisible: d.range === '1d',
            secondsVisible: false,
            borderColor: gridColorValue,
            rightOffset: 4,
            minBarSpacing: 0.5,
            fixRightEdge: false,
            lockVisibleTimeRangeOnResize: false,
            shiftVisibleRangeOnNewBar: false
          },
          crosshair: {
            mode: LW.CrosshairMode.Normal,
            vertLine: { color: isDarkTheme ? '#475569' : '#94A3B8', width: 1, style: 2 },
            horzLine: { color: isDarkTheme ? '#475569' : '#94A3B8', width: 1, style: 2 }
          },
          // Disable native scroll & scale handlers to grant 100% viewport ownership to bindKlineGestures
          handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
          handleScale: {
            mouseWheel: false, pinch: false,
            axisPressedMouseMove: { time: false, price: false },
            axisDoubleClickReset: { time: false, price: false }
          },
          kineticScroll: { touch: false, mouse: false }
        });

        chartInstance._hostEl = el;

        const candleSeries = chartInstance.addSeries(LW.CandlestickSeries, {
          upColor: klineUp,
          downColor: klineDown,
          wickUpColor: klineUp,
          wickDownColor: klineDown,
          borderVisible: false,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
        });

        const volumeSeries = chartInstance.addSeries(LW.HistogramSeries, {
          priceScaleId: 'volume',
          priceFormat: { type: 'volume' },
          color: volUpColor,
          visible: klineMaVisibility.vol !== false
        });
        chartInstance.priceScale('volume').applyOptions({
          scaleMargins: { top: 0.80, bottom: 0 }
        });

        const maConfigs = [
          { key: 'ma5', period: 5, color: '#f97316' },
          { key: 'ma20', period: 20, color: '#3b82f6' },
          { key: 'ma60', period: 60, color: '#a855f7' },
          { key: 'ma120', period: 120, color: '#06b6d4' },
          { key: 'ma250', period: 250, color: '#eab308' }
        ];
        const maSeriesMap = {};
        for (const m of maConfigs) {
          maSeriesMap[m.key] = chartInstance.addSeries(LW.LineSeries, {
            color: m.color,
            lineWidth: 1.5,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            visible: klineMaVisibility[m.key] !== false
          });
        }

        chartInstance.subscribeCrosshairMove(param => {
          updateReadoutFromCrosshair(param, candleSeries, maSeriesMap, bars);
        });

        const gestures = bindKlineGestures(el, chartInstance, candleSeries, {
          getLatestLogicalIndex: () => (chart.value?.bars?.length || 1) - 1,
          getFirstLogicalIndex: () => 0,
          initialBars: Math.min(bars.length, 120),
          minBars: 8,
          maxBars: 50000,
          minBarSpacing: 0.5,
          centerUntilBars: 30,
          rightAtBars: 300,
          rightFraction: 0.94,
          onState: (state) => {
            klineInteractionMode.value = state === 'history' ? 'history' : 'follow-latest';
          }
        });

        lwChartResizeObserver = new ResizeObserver(() => {
          chartInstance.resize(el.clientWidth, el.clientHeight);
        });
        lwChartResizeObserver.observe(el);

        lwPriceChart = chartInstance;
        lwCandleSeries = candleSeries;
        lwVolumeSeries = volumeSeries;
        lwMaSeriesMap = maSeriesMap;
        klineGestureCtrl = gestures;
        window.lwPriceChart = chartInstance;
        window.klineGestureCtrl = gestures;
        window.lwCandleSeries = candleSeries;
      }

      lwPriceChart.applyOptions({
        layout: {
          background: { type: LW.ColorType.Solid, color: chartBg },
          textColor: textThemeColor
        },
        grid: {
          vertLines: { color: gridColorValue, style: gridStyleNum, visible: showGrid },
          horzLines: { color: gridColorValue, style: gridStyleNum, visible: showGrid }
        },
        rightPriceScale: {
          borderColor: gridColorValue,
          ...(isNewSymbolOrRange ? { autoScale: true } : {})
        },
        timeScale: {
          borderColor: gridColorValue,
          timeVisible: d.range === '1d'
        }
      });

      if (isNewSymbolOrRange) {
        try {
          const scale = lwPriceChart.priceScale('right');
          if (typeof scale.setAutoScale === 'function') scale.setAutoScale(true);
          if (typeof scale.applyOptions === 'function') scale.applyOptions({ autoScale: true });
        } catch (_) {}
        try {
          if (lwCandleSeries) {
            const sScale = lwCandleSeries.priceScale();
            if (typeof sScale.setAutoScale === 'function') sScale.setAutoScale(true);
            if (typeof sScale.applyOptions === 'function') sScale.applyOptions({ autoScale: true });
          }
        } catch (_) {}
      }

      lwCandleSeries.applyOptions({
        upColor: klineUp,
        downColor: klineDown,
        wickUpColor: klineUp,
        wickDownColor: klineDown
      });

      const candleData = bars.map(b => ({
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close
      }));
      lwCandleSeries.setData(candleData);

      const volData = bars.map(b => ({
        time: b.time,
        value: b.volume || 0,
        color: b.close >= b.open ? volUpColor : volDownColor
      }));
      if (lwVolumeSeries) {
        lwVolumeSeries.applyOptions({
          color: volUpColor,
          visible: klineMaVisibility.vol !== false
        });
      }
      lwVolumeSeries.setData(volData);

      const maPeriods = { ma5: 5, ma20: 20, ma60: 60, ma120: 120, ma250: 250 };
      for (const [key, period] of Object.entries(maPeriods)) {
        if (lwMaSeriesMap[key]) {
          lwMaSeriesMap[key].applyOptions({ visible: klineMaVisibility[key] !== false });
          lwMaSeriesMap[key].setData(calcMALineData(bars, period));
        }
      }

      if (isNewSymbolOrRange) {
        if (lwPriceChart) {
          try { lwPriceChart.timeScale().fitContent(); } catch (_) {}
        }
        if (klineGestureCtrl) {
          if (typeof klineGestureCtrl.reset === 'function') {
            klineGestureCtrl.reset();
            requestAnimationFrame(() => {
              try {
                if (lwPriceChart) lwPriceChart.timeScale().fitContent();
                klineGestureCtrl.reset();
              } catch (_) {}
            });
          } else if (typeof klineGestureCtrl.showAll === 'function') {
            klineGestureCtrl.showAll();
          }
        }
      }

      if (isNewSymbolOrRange) {
        try {
          const scale = lwPriceChart.priceScale('right');
          if (typeof scale.setAutoScale === 'function') scale.setAutoScale(true);
          if (typeof scale.applyOptions === 'function') scale.applyOptions({ autoScale: true });
        } catch (_) {}
      }
      updateReadoutFromCrosshair(null, lwCandleSeries, lwMaSeriesMap, bars);
      if (charts.has('price-chart')) {
        const entry = charts.get('price-chart');
        try { entry.observer.disconnect(); entry.chart.dispose(); } catch (_) {}
        charts.delete('price-chart');
      }
      return;
    }

    // 2. Headless Testing and Fallback Mode
    const labels = d.bars.map(b => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', ...(d.range === '1d' ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).format(new Date(b.time * 1000)));
    const ma5 = calcMA(d.bars, 5);
    const ma20 = calcMA(d.bars, 20);
    const ma60 = calcMA(d.bars, 60);
    const ma120 = calcMA(d.bars, 120);
    const ma250 = calcMA(d.bars, 250);
    const gridLineType = klineGridStyle.value === 'solid' ? 'solid' : 'dashed';

    makeChart('price-chart', {
      backgroundColor: chartBg,
      tooltip: { ...tooltip, trigger: 'axis' },
      axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: gridColorValue } },
      legend: {
        data: ['价格 OHLC', 'MA5', 'MA20', 'MA60', 'MA120', 'MA250', '成交股数'],
        selected: {
          'MA5': klineMaVisibility.ma5 !== false,
          'MA20': klineMaVisibility.ma20 !== false,
          'MA60': klineMaVisibility.ma60 !== false,
          'MA120': klineMaVisibility.ma120 !== false,
          'MA250': klineMaVisibility.ma250 !== false,
          '成交股数': klineMaVisibility.vol !== false
        },
        textStyle: { color: muted },
        top: 0,
        right: 20
      },
      grid: [{ left: 70, right: 25, top: 32, height: '62%' }, { left: 70, right: 25, top: '76%', height: '13%' }],
      xAxis: [0, 1].map(i => ({
        ...axis,
        type: 'category',
        data: labels,
        gridIndex: i,
        axisLabel: { show: i === 1, color: muted },
        boundaryGap: true,
        splitLine: { show: showGrid, lineStyle: { color: gridColorValue, type: gridLineType } }
      })),
      yAxis: [
        {
          ...axis,
          scale: true,
          name: d.currency,
          min: val => Math.max(0, Number((val.min - (val.max - val.min) * 0.15).toFixed(2))),
          max: val => Number((val.max + (val.max - val.min) * 0.15).toFixed(2)),
          splitLine: { show: showGrid, lineStyle: { color: gridColorValue, type: gridLineType } }
        },
        {
          ...axis,
          gridIndex: 1,
          name: '成交量',
          axisLabel: { color: muted, formatter: compact },
          splitLine: { show: showGrid, lineStyle: { color: gridColorValue, type: gridLineType } }
        }
      ],
      dataZoom: [
        {
          type: 'inside',
          id: 'kline-inside-x',
          xAxisIndex: [0, 1],
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: true
        },
        {
          type: 'inside',
          id: 'kline-inside-y',
          yAxisIndex: [0],
          filterMode: 'none',
          start: 10,
          end: 90,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: true
        },
        {
          type: 'slider',
          id: 'kline-slider-x',
          xAxisIndex: [0, 1],
          bottom: 0,
          height: 18,
          borderColor: gridColor,
          textStyle: { color: muted }
        }
      ],
      series: [
        { name: '价格 OHLC', type: 'candlestick', data: d.bars.map(b => [b.open, b.close, b.low, b.high]), itemStyle: { color: klineUp, color0: klineDown, borderColor: klineUp, borderColor0: klineDown } },
        { name: 'MA5', type: 'line', data: ma5, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#f97316' } },
        { name: 'MA20', type: 'line', data: ma20, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#3b82f6' } },
        { name: 'MA60', type: 'line', data: ma60, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#a855f7' } },
        { name: 'MA120', type: 'line', data: ma120, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#06b6d4' } },
        { name: 'MA250', type: 'line', data: ma250, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#eab308' } },
        { name: '成交股数', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: d.bars.map(b => ({ value: b.volume, itemStyle: { color: b.close >= b.open ? volUpColor : volDownColor } })) }
      ]
    });
  }

  function renderRotation() {
    if (!overview.value) return;
    const avgTurn = avgSectorTurnover.value || 300000000;
    makeChart('rotation-chart', {
      tooltip: { ...tooltip, formatter: p => `${p.data.name} · ${p.data.symbol}\n涨跌 ${pct(p.value[0])}\n估算成交额 ${compact(p.value[1])}` },
      grid: { left: 75, right: 55, top: 40, bottom: 50 },
      xAxis: { ...axis, type: 'value', name: '涨跌 %', axisLabel: { color: muted, formatter: '{value}%' } },
      yAxis: { ...axis, type: 'value', name: '估算成交额 USD', axisLabel: { color: muted, formatter: compact } },
      series: [{
        type: 'scatter',
        symbolSize: p => Math.max(22, Math.min(48, Math.round(Math.sqrt((p[1] || 0) / 1000000) * 1.8))),
        label: { show: true, formatter: p => p.data.name, position: 'top', color: chartText, fontSize: 11, fontWeight: 'bold' },
        data: overview.value.sectors.filter(q => Number.isFinite(q.changePercent) && q.turnover !== null).map(q => ({
          value: [q.changePercent, q.turnover],
          name: q.name,
          symbol: q.symbol,
          itemStyle: {
            color: q.changePercent >= 0 ? green : red,
            shadowBlur: 8,
            shadowColor: q.changePercent >= 0 ? 'rgba(16,185,129,0.35)' : 'rgba(244,63,94,0.35)'
          }
        })),
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: muted, type: 'dashed' },
          data: [
            { xAxis: 0, label: { show: true, formatter: '涨跌均衡 0%', position: 'end', color: muted, fontSize: 10 } },
            { yAxis: avgTurn, label: { show: true, formatter: `平均成交 ${compact(avgTurn)}`, position: 'end', color: muted, fontSize: 10 } }
          ]
        }
      }]
    }, p => selectSymbol(p.data.symbol));
  }

  function renderFlows() {
    const data = dayFlows.value;
    makeChart('flows-chart', { tooltip: { ...tooltip, trigger: 'axis' }, grid: { left: 80, right: 30, top: 35, bottom: 45 }, xAxis: { ...axis, type: 'category', data: data.map(f => f.symbol) }, yAxis: { ...axis, type: 'value', name: '净申赎 USD', axisLabel: { color: muted, formatter: compact } }, series: [{ type: 'bar', barMaxWidth: 70, data: data.map(f => ({ value: f.netFlowUsd, itemStyle: { color: f.netFlowUsd >= 0 ? green : red } })) }] });
  }

  function renderOptions() {
    const d = options.value; if (!d || states.options.loading) return;
    const rows = d.rows.filter(r => strikeRange.value === 'all' || Math.abs(r.strike / d.spot - 1) <= Number(strikeRange.value));
    const gex = optionMetric.value === 'gex';
    const noData = !rows.length;
    makeChart('options-chart', {
      title: noData ? { text: '所选范围内无期权数据', left: 'center', top: 'center', textStyle: { color: muted, fontSize: 14 } } : undefined,
      tooltip: { ...tooltip, trigger: 'axis' },
      legend: { data: ['Call', 'Put'], textStyle: { color: muted }, top: 8 },
      grid: { left: 80, right: 35, top: 50, bottom: 65 },
      xAxis: { ...axis, type: 'category', name: '行权价', data: rows.map(r => String(r.strike)) },
      yAxis: { ...axis, type: 'value', name: gex ? 'USD / 1% 波动' : '持仓量（合约）', axisLabel: { color: muted, formatter: compact } },
      dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 5, height: 20, borderColor: gridColor, textStyle: { color: muted } }],
      series: noData ? [] : [
        { type: 'bar', name: 'Call', itemStyle: { color: green }, data: rows.map(r => gex ? (r.callGex ?? 0) : (r.callOi ?? 0)) },
        { type: 'bar', name: 'Put', itemStyle: { color: red }, data: rows.map(r => gex ? (r.putGex ?? 0) : (r.putOi ?? 0)) }
      ]
    });
  }

  function renderCryptoChart() {
    const item = selectedCryptoItem.value;
    if (!item) return;
    let bars = item.bars && item.bars.length >= 2 ? item.bars : null;
    const curKline = KLINE_SCHEMES[klineScheme.value] || KLINE_SCHEMES.classic;
    const klineUp = curKline.up;
    const klineDown = curKline.down;
    const isDarkTheme = isDark.value;
    const chartBg = isDarkTheme ? '#000000' : '#FFFFFF';
    const klineGridColor = isDarkTheme ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.07)';
    const showGrid = klineGridStyle.value !== 'none';
    const gridLineType = klineGridStyle.value === 'solid' ? 'solid' : 'dashed';

    if (!bars) {
      makeChart('crypto-chart', {
        backgroundColor: chartBg,
        title: {
          text: `${item.code} 暂无历史 K 线数据`,
          subtext: '等待官方或公开行情源接入，不显示人工模拟 K 线',
          left: 'center',
          top: 'center',
          textStyle: { color: muted, fontSize: 14 }
        },
        series: []
      });
      return;
    }

    if (cryptoTimeframe.value === '24h' && bars.length > 7) {
      bars = bars.slice(-7);
    } else if (cryptoTimeframe.value === '7d' && bars.length > 14) {
      bars = bars.slice(-14);
    } else if (cryptoTimeframe.value === '30d' && bars.length > 30) {
      bars = bars.slice(-30);
    }

    const categories = bars.map(b => {
      if (!b.time) return '';
      const d = new Date(b.time * 1000);
      if (isNaN(d.getTime())) return String(b.time);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${m}-${day}`;
    });
    const ohlc = bars.map(b => [b.open, b.close, b.low, b.high]);
    const ma5 = calcMA(bars, 5);
    const ma20 = calcMA(bars, 20);

    makeChart('crypto-chart', {
      backgroundColor: chartBg,
      tooltip: {
        ...tooltip,
        trigger: 'axis',
        axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: klineGridColor } },
        formatter: (params) => {
          if (!Array.isArray(params) || !params.length) return '';
          const title = params[0].name || '';
          let lines = [`<div style="font-weight:600;margin-bottom:6px;color:${chartText}">${item.code} · ${title}</div>`];
          for (const p of params) {
            if (p.seriesType === 'candlestick') {
              const [o, c, l, h] = p.data.slice(1);
              const tone = c >= o ? klineUp : klineDown;
              lines.push(`<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;"><span>开盘/收盘:</span><strong style="color:${tone}">$${Number(o).toLocaleString('en-US', {minimumFractionDigits: 2})} / $${Number(c).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></div>`);
              lines.push(`<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;"><span>最高/最低:</span><span>$${Number(h).toLocaleString('en-US', {minimumFractionDigits: 2})} / $${Number(l).toLocaleString('en-US', {minimumFractionDigits: 2})}</span></div>`);
            } else if (p.seriesType === 'line' && p.value !== '-') {
              lines.push(`<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;"><span style="color:${p.color}">${p.seriesName}:</span><span class="font-mono">$${Number(p.value).toLocaleString('en-US', {minimumFractionDigits: 2})}</span></div>`);
            } else if (p.seriesType === 'bar') {
              const val = typeof p.value === 'object' ? p.value.value : p.value;
              lines.push(`<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;"><span style="color:var(--text-tertiary)">成交量:</span><span class="font-mono">${compact(val)}</span></div>`);
            }
          }
          return lines.join('');
        }
      },
      legend: { data: [`${item.code} 走势`, 'MA5', 'MA20', '成交量'], textStyle: { color: muted }, top: 0, right: 20 },
      grid: [{ left: 70, right: 25, top: 32, height: '60%' }, { left: 70, right: 25, top: '75%', height: '14%' }],
      xAxis: [
        { ...axis, type: 'category', data: categories, boundaryGap: true, axisLabel: { show: false }, splitLine: { show: showGrid, lineStyle: { color: klineGridColor, type: gridLineType } } },
        { ...axis, type: 'category', data: categories, gridIndex: 1, boundaryGap: true, axisLabel: { color: muted }, splitLine: { show: showGrid, lineStyle: { color: klineGridColor, type: gridLineType } } }
      ],
      yAxis: [
        {
          ...axis,
          scale: true,
          name: 'USD',
          min: val => Math.max(0, Number((val.min - (val.max - val.min) * 0.1).toFixed(2))),
          max: val => Number((val.max + (val.max - val.min) * 0.1).toFixed(2)),
          splitLine: { show: showGrid, lineStyle: { color: klineGridColor, type: gridLineType } }
        },
        { ...axis, gridIndex: 1, name: '成交量', axisLabel: { color: muted, formatter: compact }, splitLine: { show: showGrid, lineStyle: { color: klineGridColor, type: gridLineType } } }
      ],
      dataZoom: [
        { type: 'inside', id: 'crypto-inside-x', xAxisIndex: [0, 1] },
        { type: 'inside', id: 'crypto-inside-y', yAxisIndex: [0], filterMode: 'none' },
        { type: 'slider', id: 'crypto-slider-x', xAxisIndex: [0, 1], bottom: 0, height: 18, borderColor: gridColor, textStyle: { color: muted } }
      ],
      series: [
        { name: `${item.code} 走势`, type: 'candlestick', data: ohlc, itemStyle: { color: klineUp, color0: klineDown, borderColor: klineUp, borderColor0: klineDown } },
        { name: 'MA5', type: 'line', data: ma5, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#f97316' } },
        { name: 'MA20', type: 'line', data: ma20, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#3b82f6' } },
        { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: bars.map(b => ({ value: b.volume, itemStyle: { color: b.close >= b.open ? klineUp : klineDown } })) }
      ]
    });
  }

  function render() {
    updateChartTheme();
    for (const [id, entry] of charts) { if (!document.contains(entry.el)) { entry.observer.disconnect(); entry.chart.dispose(); charts.delete(id); } }
    if (page.value === 'overview') renderHeatmap();
    if (page.value === 'chart') renderPrice();
    else disposePriceChart();
    if (page.value === 'crypto') renderCryptoChart();
    if (page.value === 'flows') flowTab.value === 'rotation' ? renderRotation() : renderFlows();
    if (page.value === 'options') renderOptions();
  }

  function onPageEntered() {
    render();
  }

  watch(page, async value => {
    history.replaceState(null, '', '#' + value);
    await nextTick();
    if (['overview', 'flows'].includes(value) && !overview.value && !states.overview.loading) loadOverview();
    if (value === 'crypto' && !states.crypto.loading) loadCrypto();
    if (value === 'chart') loadChart();
    if (value === 'options') loadOptions(options.value?.symbol !== optionSymbol.value);
    if (value === 'news' || value === 'overview') loadNews();
    if (value === 'watchlist') fetchWatchlistQuotes();
    render();
  });

  watch([symbol, chartRange], () => { if (page.value === 'chart') loadChart(); });
  watch([selectedCrypto, cryptoTimeframe], async () => { if (page.value === 'crypto') { await nextTick(); renderCryptoChart(); } });
  watch(newsSymbol, () => { if (page.value === 'news') loadNews(); });
  watch(optionExpiry, value => { if (page.value === 'options' && value && value !== options.value?.expiration) loadOptions(); });
  watch([heatSize, sectorFilter, flowTab, flowDate, optionMetric, strikeRange], async () => { await nextTick(); render(); });
  watch(isDark, async value => { document.documentElement.classList.toggle('dark', value); await nextTick(); render(); });
  watch([klineScheme, klineGridStyle], async () => { await nextTick(); render(); });
  watch(showSettings, value => { document.body.classList.toggle('drawer-open', value && isMobile.value); });

  function handleVisibilityChange() {
    if (document.hidden) {
      stopShortPolling();
    } else {
      fetchWatchlistQuotes();
      if (!eventSource || eventSource.readyState === 2) { // 2 = EventSource.CLOSED
        setupEventSource();
      }
    }
  }

  function handleGlobalKeyDown(e) {
    if (showPreferencesModal.value && e.key === 'Escape') {
      showPreferencesModal.value = false;
      return;
    }
    if ((e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      const input = document.querySelector('.sidebar-search-form input') || document.querySelector('.topbar-search-form input') || document.querySelector('.control-stack input');
      input?.focus();
      input?.select();
    }
  }

  onMounted(() => {
    refresh();
    fetchWatchlistQuotes();
    setupEventSource();
    window.addEventListener('resize', resizeLayout);
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    systemTheme?.addEventListener?.('change', followSystemTheme);
    clockTimer = setInterval(() => { clock.value = getAuthoritativeTime(); }, 1000);
  });

  onUnmounted(() => {
    clearInterval(clockTimer);
    stopShortPolling();
    clearTimeout(sseReconnectTimer);
    clearTimeout(watchlistDebounceTimer);
    eventSource?.close();
    window.removeEventListener('resize', resizeLayout);
    window.removeEventListener('keydown', handleGlobalKeyDown);
    window.removeEventListener('popstate', onPopState);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    systemTheme?.removeEventListener?.('change', followSystemTheme);
    document.body.classList.remove('drawer-open');
    Object.values(controllers).forEach(c => c.abort());
    for (const e of charts.values()) { e.observer.disconnect(); e.chart.dispose(); }
  });

  watch(newsSubView, async value => {
    if (value === 'ai_search' && aiSearchResults.value.length === 0 && !aiSearchLoading.value) {
      await executeAiSearch({ query: 'Wall Street stock market economy Fed rate inflation', engine: 'all', source: 'wsj_reuters' });
    }
  });

  return {
    nav, mobileNav, isDark, isMobile, isWide, showSettings, toggleTheme, openSettings, closeSettings, navigate, handleDrawerKey,
    RANGE_OPTIONS, openMobileSearch, mobileTitleInfo,
    // K-Line Color Schemes & Preferences Modal
    klineScheme, klineGridStyle, showPreferencesModal, openPreferencesModal, closePreferencesModal, setKlineScheme, setKlineGrid, klineSchemeOptions, activeKlineScheme, KLINE_SCHEMES,
    klineMaVisibility, MA_CONFIGS, toggleMa, setAllMaVisibility,
    defaultPage, defaultPageOptions, setDefaultPage,
    page, currentNav, onPageEntered,
    overview, chart, options, news, states, searchInput, symbol, chartRange,
    optionSymbol, optionExpiry, optionMetric, strikeRange, optionsSpotQuote, formatExpiryLabel, butterflyOptionRows, callWallDist, putWallDist, newsSymbol, newsSearch, heatSize, sectorFilter,
    heatmapScope, activeHeatmapStocks, onHeatmapScopeChange, renderHeatmap, isLeveragedEtf, nonLeveragedWatchlist,
    flowTab, flows, flowDate, flowDates, dayFlows,
    // Macro & Fear/Greed & Gold & Crypto & Treasury
    macroItems, macroMap, fearGreedIndex, goldContract, goldCnyPerGram, usdCnyRate, formatMacroPrice,
    showFearGreedModal, openFearGreedModal, closeFearGreedModal, getFearGreedRatingText, getFearGreedTone, fearGreedIndicators,
    showTreasuryModal, openTreasuryModal, closeTreasuryModal, spread30Y10Y, spread20Y10Y, isCurveInverted,
    cryptoData, cryptoList, selectedCrypto, selectedCryptoItem, cryptoTimeframe,
    formatCryptoPrice, getCryptoRangePct, selectCryptoCoin, loadCrypto, renderCryptoChart,
    // Watchlist & Groups & Sidebar Live Streamlined Board
    watchlistData, groups, watchlist, quoteStore, providerInfo, currentSession,
    viewMode, extMode, sortField, sortDirection, freezeResort, compactPanelOpen,
    allRankedRows, groupedRows, groupAverages, compactRows, cellFlashes,
    extShortLabel, getDisplayExtPrice, getDisplayExtChange, groupExtAverages, getGroupFullTitle, getGroupShortTitle, watchlistGroupPills, jumpToGroup, currentSortLabel, formatWatchlistTime, getRowSessionBadge,
    STOCK_MARKET_CAPS, getStockMarketCap, sortSymbolsByMarketCap,
    sidebarSortField, sidebarSortDirection, sidebarActiveGroup, setSidebarSort, setSidebarGroup, sidebarWatchlistRows,
    sidebarViewMode, setSidebarViewMode, toggleSidebarViewMode, toggleSidebarSort, resetSidebarSort, isSortedByChange,
    activeSessionKey, activeSessionShortLabel, activeSessionPriceLabel, activeSessionChangeLabel,
    toggleGroupCollapse, toggleAllGroupsCollapse, areAllGroupsCollapsed, openAddStockToGroup, sidebarGroupSections, sidebarFlatRows,
    groupSortStates, cycleGroupSort, getGroupSortTitle,
    draggedStock, dragOverTarget, dragOverGroup,
    draggedGroup, dragOverGroupOrderTarget, onGroupDragStart, onGroupDragEnd, onGroupHeaderDragLeave, moveGroupUp, moveGroupDown,
    onStockDragStart, onStockDragEnd, onStockDragOver, onStockDragLeave, onStockDrop,
    onGroupHeaderDragOver, onGroupHeaderDrop, onGroupBodyDrop, onEmptyGroupDrop,
    onFlatStockDragStart, onFlatStockDrop,
    toggleSort, addWatch, removeWatch, handleCreateGroup, handleDeleteGroup,
    handleAddStockModalSubmit, handleExportJson, handleImportJson,
    showGroupModal, showAddStockModal, showBackupModal, newGroupName, addStockInput, addStockTargetGroup, backupJsonText,
    stockModal, openHeatmapStockModal, closeStockModal, viewStockFromModal,
    undoAction, isInteractingWithTable,
    toast, importing, nyClock, nyClockDetailed, nyClockInfo, sessionStatusText, dateLabel, refreshing,
    isDeleteMode, pendingDeleteSymbol, toggleDeleteMode, handleChipClick,
    breadcrumbLabel, upSectorsCount, downSectorsCount, upSectorsRatio, isStockGainer, getSparkline,
    stockSectors, rankedSectors, quoteWindow, breadth, findQuote, barWidth, walls, num, compact, pct, tone, time,
    SECTOR_LEADERS, topGainerSector, topLoserSector, mostActiveSector, totalSectorTurnover, avgSectorTurnover, sectorBullBearRatio,
    newsCategory, newsCategories, filteredNews, getNewsSentiment, getNewsTags, getDayRange, getDayRangeWidth, missingTurnoverCount,
    savedNewsUrls, isBookmarked, toggleBookmark, showNewsMoreMenu, formatRelativeTime, getSourceMeta, getNewsImage, getTagColorClass, handleImgError, openNewsUrl, onNewsSearchSubmit,
    // Earnings & Macro & Geopolitics Calendars
    newsSubView, earningsSectorFilter, earningsTimingFilter, earningsAiOnly, earningsSearch,
    showEarningsModal, selectedEarningsItem, earningsList, macroCalendarList,
    GEOPOLITICAL_HOTSPOTS, GEOPOLITICAL_ASSET_MATRIX, filterGeopoliticsTopic,
    AI_SECTOR_FILTERS, EARNINGS_DAYS, CORPORATE_LOGOS,
    getCompanyLogoSvg, getDayEarnings, countDayTotal, openEarningsModal, closeEarningsModal, viewStockFromEarnings,
    // AI News Search Module
    aiSearchQuery, aiSearchEngine, aiSearchSource, aiSearchResults, aiSearchLoading, aiSearchError, aiSearchTelemetry, aiSearchCopiedId,
    AI_SEARCH_ENGINES, AI_SEARCH_SOURCES, AI_SEARCH_PRESETS,
    executeAiSearch, selectAiSearchPreset, filterAiNewsTopic, copyAiNewsLink, formatAiTime, getAiEngineBadge,
    klineInteractionMode, chartDelayStatus, activeChartExtQuote,
    activeMacroTab, heatmapTimeRange, rightWatchlistCollapsed, cycleExtMode, extModeLabel, lastUpdateTimeFormatted, bjTimeFormatted, overviewCards8, overviewCards10,
    currentPageTitle, deleteStockDirect, cycleSessionMode, refreshWatchlistQuotes,
    selectSymbol, search, refresh, loadOverview, loadChart, loadNews, loadOptions, resetPriceChartZoom, fetchWatchlistQuotes, importNotion, importFlows, clearFlows
  };
} }).mount('#app');
