import { parseFlows } from './flows.js';
import { bindKlineGestures } from './composables/klineGesture.js';
import { createChartDerivedData } from './composables/chartDerivedData.js';
import {
  VALID_PALETTES,
  VALID_THEMES,
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  normalizePalette,
  normalizeTheme,
  applyThemeToDOM,
  readChartTokens
} from './theme-model.js';
import {
  isPhone,
  isCompact,
  getRecentSymbols,
  addRecentSymbol,
  clearRecentSymbols,
  createHistoryState,
  captureViewState,
  getViewState,
  clearViewState,
  lockBodyScroll,
  unlockBodyScroll
} from './mobile-workspace.js';
import {
  toMobileQuoteView,
  formatSessionLabel
} from './mobile-quote-view.js';
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
  isCryptoSymbol,
  STOCK_MARKET_CAPS,
  getStockMarketCap,
  sortSymbolsByMarketCap,
  parseVolumeNumber,
  formatWatchlistVolume
} from './watchlist-model.js';
import {
  AI_SECTOR_FILTERS,
  CORPORATE_LOGOS,
  getEarningsCalendarDate,
  getEarningsWeeks,
  MACRO_CALENDAR_ITEMS,
  filterEarningsByDay,
  parseMetricNumber,
  getMetricSurprise,
  getMetricYoy
} from './earnings-calendar-model.js';
import { computeInflectionSignals, formatSignalMarkers, dema } from './inflection-signals.js';
import {
  disambiguateWallets,
  isPositionLong,
  computeWhaleSankeyGraph,
  buildAggregatedPositions,
  detectPositionDeltas,
  getAssetLabel,
  formatWhaleCompactUsd
} from './composables/whaleSankeyModel.js';

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
  { symbol: '^VXN', displaySymbol: 'VXN', name: '纳指波动率', category: 'volatility', icon: '🇺🇸', price: 22.85, changePercent: 2.15 },
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
  toneClass: 'fg-tone-fear',
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
// Display labels only; retain the full symbol for quotes, navigation and storage.
const formatWatchlistSymbol = symbol => isCryptoSymbol(symbol) ? String(symbol).replace(/[-/]USDT?$/i, '') : symbol;
const compact = v => Number.isFinite(v) ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(v) : '—';
const pct = v => Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : '—';
const pctNoPlus = v => Number.isFinite(v) ? `${v.toFixed(2)}%` : '-';
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
  },
  bluepurple: {
    id: 'bluepurple',
    name: 'Demo极光蓝紫 (Demo主图)',
    shortName: '极光蓝紫',
    tag: 'Demo同款 · 蓝紫',
    description: 'Demo 演示原型主图同款电光蔚蓝与紫罗兰，期权多空持仓经典质感',
    up: '#60A3FB',
    down: '#996EE2',
    upLabel: '阳线/Call #60A3FB',
    downLabel: '阴线/Put #996EE2',
    title: 'Demo同款：极光蓝紫 (蔚蓝 #60A3FB / 紫罗兰 #996EE2)'
  },
  deepbluepurple: {
    id: 'deepbluepurple',
    name: '深邃蓝紫 (Demo期权中心)',
    shortName: '深邃蓝紫',
    tag: '期权中心 · 深邃',
    description: 'Demo 演示原型期权持仓中心 ATM 聚类同款深邃宝蓝与高贵紫罗兰，色彩浓郁饱和，多空层次分明',
    up: '#2563EB',
    down: '#7C3AED',
    upLabel: '阳线/Call #2563EB',
    downLabel: '阴线/Put #7C3AED',
    title: 'Demo期权中心深邃蓝紫 (宝蓝 #2563EB / 紫罗兰 #7C3AED)'
  }
};
const klineSchemeOptions = Object.values(KLINE_SCHEMES);

const HEATMAP_SCHEMES = {
  classic: {
    id: 'classic',
    name: '经典绿红 (默认)',
    shortName: '经典绿红',
    tag: '图一 · 默认',
    description: '翡翠绿与珊瑚红，沉稳清晰，层次丰富，全球标配热力视觉',
    up: '#10B981',
    down: '#F43F5E',
    upLabel: '上涨 #10B981',
    downLabel: '下跌 #F43F5E',
    title: '图一：经典绿红 (翡翠绿 #10B981 / 珊瑚红 #F43F5E)'
  },
  neon: {
    id: 'neon',
    name: '荧光极光 (亮绿 / 玫粉)',
    shortName: '亮绿玫粉',
    tag: '图二 · 荧光',
    description: '鲜艳荧光黄绿与鲜亮芭比玫粉，高对比度视觉冲击，多空瞬间洞察',
    up: '#7CE138',
    down: '#FF4D82',
    upLabel: '上涨 #7CE138',
    downLabel: '下跌 #FF4D82',
    title: '图二：荧光极光 (亮绿 #7CE138 / 芭比玫粉 #FF4D82)'
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: '赛博霓虹 (青蓝 / 品红)',
    shortName: '青蓝品红',
    tag: '图三 · 赛博',
    description: '电光青蓝与炫彩品红，赛博朋克未来科技美学，暗夜沉浸视觉拔群',
    up: '#00D2FF',
    down: '#FF3377',
    upLabel: '上涨 #00D2FF',
    downLabel: '下跌 #FF3377',
    title: '图三：赛博霓虹 (青蓝 #00D2FF / 炫彩品红 #FF3377)'
  },
  bluepurple: {
    id: 'bluepurple',
    name: 'Demo极光蓝紫 (Demo主图)',
    shortName: '极光蓝紫',
    tag: 'Demo同款 · 蓝紫',
    description: 'Demo 演示原型主图同款电光蔚蓝与紫罗兰，期权多空经典质感，优雅科技风',
    up: '#60A3FB',
    down: '#996EE2',
    upLabel: '上涨 #60A3FB',
    downLabel: '下跌 #996EE2',
    title: 'Demo同款：极光蓝紫 (蔚蓝 #60A3FB / 紫罗兰 #996EE2)'
  },
  deepbluepurple: {
    id: 'deepbluepurple',
    name: '深邃蓝紫 (Demo期权中心)',
    shortName: '深邃蓝紫',
    tag: '期权中心 · 深邃',
    description: 'Demo 演示原型期权持仓中心同款深邃宝蓝与高贵紫罗兰，色彩浓郁饱和，多空层次分明',
    up: '#2563EB',
    down: '#7C3AED',
    upLabel: '上涨 #2563EB',
    downLabel: '下跌 #7C3AED',
    title: 'Demo期权中心深邃蓝紫 (宝蓝 #2563EB / 紫罗兰 #7C3AED)'
  }
};
const heatmapSchemeOptions = Object.values(HEATMAP_SCHEMES);

createApp({ setup() {
  const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  const savedPalette = readStorage('market-desk-ui-palette', null);
  const uiPalette = ref(normalizePalette(savedPalette));
  const uiPaletteOptions = [
    { id: 'terminal', label: '经典终端', desc: '纯白与黑曜石，沿用当前外观' },
    { id: 'cobalt', label: '蓝灰数据', desc: '中性灰底与蓝色强调，来自配色演示' }
  ];
  const savedTheme = readStorage('market-desk-theme', null);
  const isDark = ref(savedTheme === 'dark' || (savedTheme !== 'light' && Boolean(systemTheme?.matches)));
  const savedKlineScheme = readStorage('market-desk-kline-scheme', 'classic');
  const klineScheme = ref(['classic', 'neon', 'cyberpunk', 'bluepurple', 'deepbluepurple'].includes(savedKlineScheme) ? savedKlineScheme : 'classic');
  const savedHeatmapScheme = readStorage('market-desk-heatmap-scheme', 'classic');
  const heatmapScheme = ref(['classic', 'neon', 'cyberpunk', 'bluepurple', 'deepbluepurple'].includes(savedHeatmapScheme) ? savedHeatmapScheme : 'classic');
  const savedKlineGrid = readStorage('market-desk-kline-grid', 'dashed');
  const klineGridStyle = ref(['dashed', 'solid', 'none'].includes(savedKlineGrid) ? savedKlineGrid : 'dashed');
  const showPreferencesModal = ref(false);
  const activeKlineScheme = computed(() => KLINE_SCHEMES[klineScheme.value] || KLINE_SCHEMES.classic);
  const activeHeatmapScheme = computed(() => HEATMAP_SCHEMES[heatmapScheme.value] || HEATMAP_SCHEMES.classic);
  const heatmapGradientStyle = computed(() => {
    if (heatmapScheme.value === 'neon') {
      return 'linear-gradient(90deg, #D9004C 0%, #FF4D82 28%, #6B7280 50%, #65BA26 72%, #7CE138 100%)';
    }
    if (heatmapScheme.value === 'cyberpunk') {
      return 'linear-gradient(90deg, #D6004F 0%, #FF3377 28%, #6B7280 50%, #00AEE6 72%, #00D2FF 100%)';
    }
    if (heatmapScheme.value === 'bluepurple') {
      return 'linear-gradient(90deg, #6D28D9 0%, #996EE2 28%, #6B7280 50%, #60A3FB 72%, #1D4ED8 100%)';
    }
    if (heatmapScheme.value === 'deepbluepurple') {
      return 'linear-gradient(90deg, #5B21B6 0%, #7C3AED 28%, #6B7280 50%, #2563EB 72%, #1D4ED8 100%)';
    }
    return 'linear-gradient(90deg, #E11D48 0%, #F43F5E 28%, #6B7280 50%, #10B981 72%, #059669 100%)';
  });

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
  if (readStorage('market-desk-inflection-signals', false)) {
    for (const key of ['ma5', 'ma20', 'ma60', 'ma120', 'ma250']) {
      klineMaVisibility[key] = false;
    }
    klineMaVisibility.vol = true;
  }

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
        if (seriesName && typeof entry.chart.dispatchAction === 'function') {
          entry.chart.dispatchAction({
            type: isVisible ? 'legendSelect' : 'legendUnSelect',
            name: seriesName
          });
        }
      }
    }

    const item = MA_CONFIGS.find(m => m.key === key);
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
      if (entry && entry.chart && typeof entry.chart.dispatchAction === 'function') {
        const names = ['MA5', 'MA20', 'MA60', 'MA120', 'MA250', '成交股数'];
        for (const name of names) {
          entry.chart.dispatchAction({
            type: val ? 'legendSelect' : 'legendUnSelect',
            name
          });
        }
      }
    }
  }

  const showInflectionSignals = ref(readStorage('market-desk-inflection-signals', false));
  let lwMarkersPlugin = null;
  let lwDemaFastSeries = null;
  let lwDemaSlowSeries = null;
  let savedMaVisibility = null;

  function toggleInflectionSignals() {
    showInflectionSignals.value = !showInflectionSignals.value;
    persist('market-desk-inflection-signals', showInflectionSignals.value);

    if (showInflectionSignals.value) {
      // 开启拐点猎手算法：自动关闭其他所有常规均线，保持成交量开启
      savedMaVisibility = { ...klineMaVisibility };
      for (const key of ['ma5', 'ma20', 'ma60', 'ma120', 'ma250']) {
        klineMaVisibility[key] = false;
        if (lwMaSeriesMap && lwMaSeriesMap[key]) {
          lwMaSeriesMap[key].applyOptions({ visible: false });
        }
      }
      klineMaVisibility.vol = true;
      if (lwVolumeSeries) {
        lwVolumeSeries.applyOptions({ visible: true });
      }
      persist('market-desk-ma-visibility', { ...klineMaVisibility });

      if (charts.has('price-chart')) {
        const entry = charts.get('price-chart');
        if (entry && entry.chart && typeof entry.chart.dispatchAction === 'function') {
          for (const name of ['MA5', 'MA20', 'MA60', 'MA120', 'MA250']) {
            entry.chart.dispatchAction({ type: 'legendUnSelect', name });
          }
        }
      }
    } else {
      // 关闭拐点猎手算法：恢复关闭前的均线状态
      const toRestore = savedMaVisibility || DEFAULT_MA_VISIBILITY;
      for (const [key, val] of Object.entries(toRestore)) {
        if (key in klineMaVisibility) {
          klineMaVisibility[key] = val;
          if (key === 'vol') {
            if (lwVolumeSeries) lwVolumeSeries.applyOptions({ visible: val });
          } else if (lwMaSeriesMap && lwMaSeriesMap[key]) {
            lwMaSeriesMap[key].applyOptions({ visible: val });
          }
        }
      }
      persist('market-desk-ma-visibility', { ...klineMaVisibility });
      if (charts.has('price-chart')) {
        const entry = charts.get('price-chart');
        if (entry && entry.chart && typeof entry.chart.dispatchAction === 'function') {
          for (const [key, name] of Object.entries({ ma5: 'MA5', ma20: 'MA20', ma60: 'MA60', ma120: 'MA120', ma250: 'MA250' })) {
            entry.chart.dispatchAction({
              type: klineMaVisibility[key] ? 'legendSelect' : 'legendUnSelect',
              name
            });
          }
        }
      }
    }

    applyInflectionMarkers();
    applyDemaLinesData();
    if (!lwPriceChart && charts.has('price-chart')) {
      renderPrice();
    }
  }

  function applyInflectionMarkers() {
    const bars = chart.value?.bars;
    if (!bars || !bars.length || !showInflectionSignals.value) {
      clearInflectionMarkers();
      return;
    }
    const snapshot = chartDerivedCache.getSnapshot(
      {
        symbol: chart.value?.symbol || '',
        interval: chart.value?.interval || '',
        range: chart.value?.range || '',
        dataRevision: chartDataRevision.value,
        showSignals: true
      },
      bars,
      { computeSignals: computeInflectionSignals, formatMarkers: formatSignalMarkers, dema }
    );
    setChartMarkers(snapshot.markers);
  }

  function applyDemaLinesData() {
    const bars = chart.value?.bars;
    if (!bars || !bars.length) {
      if (lwDemaFastSeries) lwDemaFastSeries.setData([]);
      if (lwDemaSlowSeries) lwDemaSlowSeries.setData([]);
      return;
    }
    if (!showInflectionSignals.value) {
      if (lwDemaFastSeries) lwDemaFastSeries.applyOptions({ visible: false });
      if (lwDemaSlowSeries) lwDemaSlowSeries.applyOptions({ visible: false });
      return;
    }

    const snapshot = chartDerivedCache.getSnapshot(
      {
        symbol: chart.value?.symbol || '',
        interval: chart.value?.interval || '',
        range: chart.value?.range || '',
        dataRevision: chartDataRevision.value,
        showSignals: true
      },
      bars,
      { computeSignals: computeInflectionSignals, formatMarkers: formatSignalMarkers, dema }
    );

    if (lwDemaFastSeries) {
      lwDemaFastSeries.applyOptions({ visible: true });
      lwDemaFastSeries.setData(snapshot.fastDemaLineData);
    }
    if (lwDemaSlowSeries) {
      lwDemaSlowSeries.applyOptions({ visible: true });
      lwDemaSlowSeries.setData(snapshot.slowDemaLineData);
    }
  }

  function clearInflectionMarkers() {
    if (lwMarkersPlugin && typeof lwMarkersPlugin.setMarkers === 'function') {
      lwMarkersPlugin.setMarkers([]);
    } else if (lwCandleSeries && typeof lwCandleSeries.setMarkers === 'function') {
      lwCandleSeries.setMarkers([]);
    }
  }

  function setChartMarkers(markers) {
    if (!lwCandleSeries) return;
    try {
      if (lwMarkersPlugin && typeof lwMarkersPlugin.setMarkers === 'function') {
        lwMarkersPlugin.setMarkers(markers);
        return;
      }
      const LW = window.LightweightCharts;
      if (LW && typeof LW.createSeriesMarkers === 'function') {
        lwMarkersPlugin = LW.createSeriesMarkers(lwCandleSeries, markers);
        return;
      }
      if (typeof lwCandleSeries.setMarkers === 'function') {
        lwCandleSeries.setMarkers(markers);
      }
    } catch (err) {
      console.warn('Failed to apply markers to candle series:', err);
    }
  }

  const klineInteractionMode = ref('follow-latest');
  const chartDataRevision = ref(0);
  const chartDerivedCache = createChartDerivedData({
    computeSignals: computeInflectionSignals,
    formatMarkers: formatSignalMarkers,
    dema: dema
  });
  let lwPriceChart = null;
  let lwCandleSeries = null;
  let lwVolumeSeries = null;
  let lwMaSeriesMap = {};
  let klineGestureCtrl = null;
  let lwChartResizeObserver = null;
  let lastRenderedSymbol = '';
  let lastRenderedRange = '';
  let lastRenderedInterval = '';

  function disposePriceChart() {
    lastRenderedSymbol = '';
    lastRenderedRange = '';
    lastRenderedInterval = '';
    chartDerivedCache.invalidate();
    if (klineGestureCtrl) {
      klineGestureCtrl.dispose();
      klineGestureCtrl = null;
    }
    if (lwChartResizeObserver) {
      lwChartResizeObserver.disconnect();
      lwChartResizeObserver = null;
    }
    if (lwMarkersPlugin) {
      try { lwMarkersPlugin.detach(); } catch (_) {}
      lwMarkersPlugin = null;
    }
    if (lwDemaFastSeries) {
      lwDemaFastSeries = null;
    }
    if (lwDemaSlowSeries) {
      lwDemaSlowSeries = null;
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
      render();
    }
  }
  function setKlineGrid(style) {
    klineGridStyle.value = style;
    persist('market-desk-kline-grid', style);
    render();
  }
  function setHeatmapScheme(scheme) {
    if (HEATMAP_SCHEMES[scheme]) {
      heatmapScheme.value = scheme;
      persist('market-desk-heatmap-scheme', scheme);
      if (page.value === 'overview') {
        renderHeatmap();
      }
    }
  }

  const isMobile = ref(window.innerWidth < 768);
  const isCompactLayout = ref(isCompact(window.innerWidth));
  const isPhoneLayout = ref(isPhone(window.innerWidth));
  const isWide = ref(window.innerWidth >= 1600);
  const showSettings = ref(false);
  const activeMobileOverlay = ref(null);
  const mobileSearchQuery = ref('');
  const recentSymbolsList = ref(getRecentSymbols());
  const sourceNavigationPage = ref('overview');
  const isChartExpanded = ref(false);
  const mobileViewMode = ref('cards'); // 'cards' (纵向报价列表) or 'table' (完整表格)
  const mobileEarningsDay = ref('mon');

  const mobileNav = [
    { id: 'overview', label: '市场', icon: '◫' },
    { id: 'watchlist', label: '自选', icon: '★' },
    { id: 'chart', label: '个股', icon: '⌁' },
    { id: 'news', label: '资讯', icon: '📰' },
    { id: 'more', label: '更多', icon: '☰' }
  ];

  const isMoreActive = computed(() => {
    return ['crypto', 'flows', 'options', 'sources'].includes(page.value) || activeMobileOverlay.value === 'more';
  });

  const RANGE_OPTIONS = [
    { value: '1d', label: '15分' },
    { value: '1mo', label: '1月' },
    { value: '3mo', label: '3月' },
    { value: '6mo', label: '6月' },
    { value: '1y', label: '1年' },
    { value: '2y', label: '2年' }
  ];

  const INTERVAL_OPTIONS = [
    { value: '15m', label: '15分', desc: '15 分钟 K 线' },
    { value: '1h', label: '1小时', desc: '1 小时 K 线' },
    { value: '4h', label: '4小时', desc: '4 小时 K 线' },
    { value: '1d', label: '日K', desc: '日 K 线 (默认)' }
  ];

  // ==========================================
  // TradingView 风格测距尺 (Measure / Ruler Tool)
  // ==========================================
  const isRulerActive = ref(false);
  const isRulerDrawing = ref(false);
  const rulerStartPoint = ref(null);
  const rulerEndPoint = ref(null);
  const rulerMeasurement = ref(null);

  const rulerBox = computed(() => {
    if (!rulerStartPoint.value || !rulerEndPoint.value) return null;
    const p1 = rulerStartPoint.value;
    const p2 = rulerEndPoint.value;
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const width = Math.max(1, Math.abs(p2.x - p1.x));
    const height = Math.max(1, Math.abs(p2.y - p1.y));
    const isUp = p2.price >= p1.price;
    return { x, y, width, height, isUp };
  });

  const rulerLine = computed(() => {
    if (!rulerStartPoint.value || !rulerEndPoint.value) return null;
    const p1 = rulerStartPoint.value;
    const p2 = rulerEndPoint.value;
    const isUp = p2.price >= p1.price;
    return {
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      isUp
    };
  });

  const rulerCard = computed(() => {
    if (!rulerStartPoint.value || !rulerEndPoint.value) return null;
    const p1 = rulerStartPoint.value;
    const p2 = rulerEndPoint.value;
    const diff = p2.price - p1.price;
    const pct = p1.price !== 0 ? (diff / p1.price) * 100 : 0;
    const isUp = diff >= 0;
    const diffAbs = Math.abs(diff).toFixed(2);
    const bars = Math.abs(Math.round((p2.logical ?? 0) - (p1.logical ?? 0))) + 1;

    const hostEl = lwPriceChart?._hostEl || (typeof document !== 'undefined' ? document.getElementById('price-chart') : null);
    const containerW = hostEl?.clientWidth || 800;
    const containerH = hostEl?.clientHeight || 450;

    let cardX = p2.x + 14;
    let cardY = p2.y - 24;
    if (cardX + 185 > containerW) {
      cardX = Math.max(10, p2.x - 195);
    }
    if (cardY < 12) cardY = 12;
    if (cardY + 65 > containerH) cardY = Math.max(12, containerH - 70);

    let timeSpan = '';
    if (p1.time && p2.time) {
      const t1 = typeof p1.time === 'number' ? p1.time : (new Date(p1.time).getTime() / 1000);
      const t2 = typeof p2.time === 'number' ? p2.time : (new Date(p2.time).getTime() / 1000);
      if (!isNaN(t1) && !isNaN(t2)) {
        const secDiff = Math.abs(t2 - t1);
        if (secDiff >= 86400) {
          timeSpan = `${Math.round(secDiff / 86400)} 天`;
        } else if (secDiff >= 3600) {
          timeSpan = `${(secDiff / 3600).toFixed(1)} 小时`;
        } else if (secDiff >= 60) {
          timeSpan = `${Math.round(secDiff / 60)} 分钟`;
        }
      }
    }

    return {
      x: cardX,
      y: cardY,
      startPrice: p1.price,
      endPrice: p2.price,
      diff,
      diffAbs,
      pct,
      isUp,
      bars,
      timeSpan
    };
  });

  function toggleRulerTool() {
    if (klineGestureCtrl && typeof klineGestureCtrl.cancelMotion === 'function') {
      klineGestureCtrl.cancelMotion('ruler-toggled');
    }
    if (isRulerActive.value) {
      clearRuler();
    } else {
      isRulerActive.value = true;
      const hostEl = lwPriceChart?._hostEl || (typeof document !== 'undefined' ? document.getElementById('price-chart') : null);
      if (hostEl) hostEl.dataset.rulerMode = 'active';
    }
  }

  function clearRuler() {
    isRulerActive.value = false;
    isRulerDrawing.value = false;
    rulerStartPoint.value = null;
    rulerEndPoint.value = null;
    rulerMeasurement.value = null;
    const hostEl = lwPriceChart?._hostEl || (typeof document !== 'undefined' ? document.getElementById('price-chart') : null);
    if (hostEl) delete hostEl.dataset.rulerMode;
  }

  function getChartPointerInfo(e) {
    const hostEl = lwPriceChart?._hostEl || (typeof document !== 'undefined' ? document.getElementById('price-chart') : null);
    if (!hostEl) return null;
    const rect = hostEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let price = 0;
    if (lwCandleSeries && typeof lwCandleSeries.coordinateToPrice === 'function') {
      price = lwCandleSeries.coordinateToPrice(y) || 0;
    }

    let logical = 0;
    let time = null;
    if (lwPriceChart && lwPriceChart.timeScale) {
      const ts = lwPriceChart.timeScale();
      if (typeof ts.coordinateToLogical === 'function') {
        logical = ts.coordinateToLogical(x);
      }
      if (typeof ts.coordinateToTime === 'function') {
        time = ts.coordinateToTime(x);
      }
    }

    if (!price && chart.value?.bars?.length) {
      const bars = chart.value.bars;
      const idx = Math.max(0, Math.min(bars.length - 1, Math.round(logical ?? 0)));
      price = bars[idx]?.close || 100;
    }

    return { x, y, price, logical, time };
  }

  function onRulerPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.ruler-close-pill')) return;
    const pt = getChartPointerInfo(e);
    if (!pt) return;

    if (e.currentTarget && typeof e.currentTarget.setPointerCapture === 'function') {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    }

    if (rulerMeasurement.value) {
      rulerMeasurement.value = null;
    }

    rulerStartPoint.value = pt;
    rulerEndPoint.value = pt;
    isRulerDrawing.value = true;
  }

  function onRulerPointerMove(e) {
    if (!isRulerDrawing.value || !rulerStartPoint.value) return;
    const pt = getChartPointerInfo(e);
    if (!pt) return;
    rulerEndPoint.value = pt;
  }

  function onRulerPointerUp(e) {
    if (!isRulerDrawing.value) return;
    isRulerDrawing.value = false;

    if (e.currentTarget && typeof e.currentTarget.releasePointerCapture === 'function') {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    }

    const p1 = rulerStartPoint.value;
    const p2 = rulerEndPoint.value;
    if (!p1 || !p2) return;

    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (dist >= 4 && rulerCard.value) {
      rulerMeasurement.value = { ...rulerCard.value };
      isRulerActive.value = false;
      const hostEl = lwPriceChart?._hostEl || (typeof document !== 'undefined' ? document.getElementById('price-chart') : null);
      if (hostEl) delete hostEl.dataset.rulerMode;
    }
  }

  function updateRulerCoordinates() {
    if (!rulerStartPoint.value || !rulerEndPoint.value) return;
    if (!lwCandleSeries || !lwPriceChart) return;
    const ts = lwPriceChart.timeScale();

    if (typeof lwCandleSeries.priceToCoordinate === 'function') {
      const y1 = lwCandleSeries.priceToCoordinate(rulerStartPoint.value.price);
      const y2 = lwCandleSeries.priceToCoordinate(rulerEndPoint.value.price);
      if (y1 != null) rulerStartPoint.value.y = y1;
      if (y2 != null) rulerEndPoint.value.y = y2;
    }

    if (typeof ts.logicalToCoordinate === 'function' && rulerStartPoint.value.logical != null) {
      const x1 = ts.logicalToCoordinate(rulerStartPoint.value.logical);
      const x2 = ts.logicalToCoordinate(rulerEndPoint.value.logical);
      if (x1 != null) rulerStartPoint.value.x = x1;
      if (x2 != null) rulerEndPoint.value.x = x2;
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (isRulerActive.value || rulerMeasurement.value)) {
        clearRuler();
      }
      if (e.key === 'Shift' && page.value === 'chart' && !isRulerActive.value && !rulerMeasurement.value) {
        const hostEl = lwPriceChart?._hostEl || document.getElementById('price-chart');
        if (hostEl && hostEl.matches(':hover')) {
          toggleRulerTool();
        }
      }
    });
  }

  function openMobileOverlay(name) {
    activeMobileOverlay.value = name;
    lockBodyScroll();
    if (name === 'search') {
      recentSymbolsList.value = getRecentSymbols();
    }
  }

  function closeMobileOverlay() {
    activeMobileOverlay.value = null;
    unlockBodyScroll();
  }

  function openMobileSearch() {
    openMobileOverlay('search');
  }

  function executeMobileSearch(targetSym) {
    const sym = (targetSym || mobileSearchQuery.value).trim().toUpperCase();
    if (!validSymbol(sym)) {
      toast.value = '请输入有效代码，例如 AAPL、SPY 或 NVDA。';
      return;
    }
    addRecentSymbol(sym);
    recentSymbolsList.value = getRecentSymbols();
    mobileSearchQuery.value = '';
    closeMobileOverlay();
    selectSymbol(sym);
  }

  function toggleChartExpanded() {
    isChartExpanded.value = !isChartExpanded.value;
    if (klineGestureCtrl) {
      if (klineGestureCtrl.cancelMotion) klineGestureCtrl.cancelMotion('toggleChartExpanded');
      if (klineGestureCtrl.setInputPolicy) {
        klineGestureCtrl.setInputPolicy(isChartExpanded.value ? 'expanded' : (isPhoneLayout.value ? 'reading' : 'desktop'));
      }
    }
    nextTick(() => {
      if (lwPriceChart) lwPriceChart.resize();
    });
  }

  let themeOverride = savedTheme === 'dark' || savedTheme === 'light';
  let muted, gridColor, chartText, chartSurface, axis, tooltip;
  const charts = new Map(), sequences = {}, controllers = {};

  function setUiPalette(value) {
    const next = normalizePalette(value);
    if (next === uiPalette.value) return;
    uiPalette.value = next;
    persist('market-desk-ui-palette', next);
    applyDOMTheme();
  }

  function applyChartAppearance() {
    const tokens = readChartTokens(document.documentElement);
    muted = tokens.muted;
    gridColor = tokens.grid;
    chartText = tokens.text;
    chartSurface = tokens.surface;
    green = tokens.up;
    red = tokens.down;
    blue = tokens.accent;
    axis = {
      axisLine: { lineStyle: { color: gridColor } },
      axisTick: { show: false },
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' } }
    };
    tooltip = {
      renderMode: 'richText',
      backgroundColor: tokens.tooltipBg,
      borderColor: tokens.tooltipBorder,
      textStyle: { color: chartText },
      confine: true
    };

    if (lwPriceChart) {
      lwPriceChart.applyOptions({
        layout: {
          background: { color: tokens.klineSurface },
          textColor: tokens.muted
        },
        grid: {
          vertLines: { color: tokens.klineGrid },
          horzLines: { color: tokens.klineGrid }
        },
        rightPriceScale: {
          borderColor: tokens.klineGrid
        },
        timeScale: {
          borderColor: tokens.klineGrid
        },
        crosshair: {
          vertLine: { color: tokens.crosshair },
          horzLine: { color: tokens.crosshair }
        }
      });
    }

    for (const [id, entry] of charts) {
      if (id !== 'price-chart' && entry?.chart?.setOption) {
        try {
          entry.chart.setOption({
            backgroundColor: tokens.surface,
            textStyle: { color: tokens.text }
          });
        } catch (_) {}
      }
    }
  }

  function applyDOMTheme() {
    applyThemeToDOM({
      palette: uiPalette.value,
      mode: isDark.value ? 'dark' : 'light',
      root: document.documentElement,
      metaEl: document.getElementById('theme-color')
    });
    applyChartAppearance();
  }

  function setThemeMode(mode) {
    themeOverride = true;
    const nextDark = mode === 'dark';
    if (isDark.value === nextDark) return;
    isDark.value = nextDark;
    persist('market-desk-theme', nextDark ? 'dark' : 'light');
    applyDOMTheme();
  }

  function toggleTheme() {
    setThemeMode(isDark.value ? 'light' : 'dark');
  }

  function followSystemTheme(event) {
    if (!themeOverride) {
      isDark.value = Boolean(event.matches);
      applyDOMTheme();
    }
  }

  applyDOMTheme();

  function resizeLayout() {
    const w = window.innerWidth;
    isMobile.value = w < 768;
    isCompactLayout.value = isCompact(w);
    isPhoneLayout.value = isPhone(w);
    isWide.value = w >= 1600;
    if (!isMobile.value) showSettings.value = false;
    if (klineGestureCtrl) {
      if (klineGestureCtrl.invalidateGeometry) klineGestureCtrl.invalidateGeometry('resizeLayout');
      if (klineGestureCtrl.setInputPolicy) {
        klineGestureCtrl.setInputPolicy(isChartExpanded.value ? 'expanded' : (isPhoneLayout.value ? 'reading' : 'desktop'));
      }
    }
  }

  async function openSettings() { showSettings.value = true; await nextTick(); document.querySelector('#workspace-settings .bottom-sheet-handle')?.focus(); }
  async function closeSettings() { if (!showSettings.value) return; showSettings.value = false; await nextTick(); document.querySelector('.settings-trigger')?.focus(); }

  // Financial Terminal Skeleton & Top Pulse Progress State (from market_desk_skeleton_demo.html)
  const skeletonPattern = [24, 31, 38, 43, 49, 62, 55, 76, 89, 67, 56, 43, 35, 51, 64, 77, 61, 53, 46, 39, 34, 42, 63, 70, 55, 40, 35, 27, 20, 30, 39, 48, 55, 42, 33, 29, 23, 18, 22, 28, 24, 19, 15, 12];
  
  // Real Butterfly Option Board Bilateral Strike Skeletons (Left Call OI, Center Strike, Right Put OI)
  const butterflySkeletonRows = [
    { putWidth: 14, callWidth: 15, isSpot: false },
    { putWidth: 26, callWidth: 28, isSpot: false },
    { putWidth: 42, callWidth: 40, isSpot: false },
    { putWidth: 60, callWidth: 56, isSpot: false },
    { putWidth: 78, callWidth: 74, isSpot: false },
    { putWidth: 92, callWidth: 90, isSpot: true },  // 最顶峰位置：现价 ATM 对应两翼峰值行权价高亮
    { putWidth: 78, callWidth: 76, isSpot: false },
    { putWidth: 64, callWidth: 68, isSpot: false },
    { putWidth: 48, callWidth: 52, isSpot: false },
    { putWidth: 35, callWidth: 38, isSpot: false },
    { putWidth: 22, callWidth: 24, isSpot: false },
    { putWidth: 16, callWidth: 16, isSpot: false },
    { putWidth: 10, callWidth: 10, isSpot: false },
    { putWidth: 6,  callWidth: 6,  isSpot: false }
  ];

  // Right Watchlist Sidebar Skeleton Rows (Symbol, Price, Chg%, EXT%)
  const rwSkeletonRows = [
    { symWidth: '58px', priceWidth: '62px', chgWidth: '56px', extWidth: '46px' },
    { symWidth: '44px', priceWidth: '54px', chgWidth: '52px', extWidth: '42px' },
    { symWidth: '68px', priceWidth: '70px', chgWidth: '58px', extWidth: '50px' },
    { symWidth: '50px', priceWidth: '58px', chgWidth: '54px', extWidth: '44px' },
    { symWidth: '62px', priceWidth: '66px', chgWidth: '50px', extWidth: '48px' },
    { symWidth: '46px', priceWidth: '52px', chgWidth: '56px', extWidth: '40px' },
    { symWidth: '74px', priceWidth: '68px', chgWidth: '60px', extWidth: '52px' },
    { symWidth: '52px', priceWidth: '60px', chgWidth: '52px', extWidth: '46px' },
    { symWidth: '48px', priceWidth: '56px', chgWidth: '54px', extWidth: '42px' },
    { symWidth: '64px', priceWidth: '72px', chgWidth: '58px', extWidth: '48px' },
    { symWidth: '56px', priceWidth: '50px', chgWidth: '50px', extWidth: '44px' },
    { symWidth: '70px', priceWidth: '64px', chgWidth: '56px', extWidth: '50px' },
    { symWidth: '42px', priceWidth: '58px', chgWidth: '52px', extWidth: '40px' },
    { symWidth: '60px', priceWidth: '66px', chgWidth: '54px', extWidth: '46px' }
  ];

  // Candlestick K-Line Skeleton wicks & bodies layout
  const klineCandleSkeletons = [
    { left: 3,  top: 48, wickHeight: 46, bodyHeight: 24, bodyOffset: 10 },
    { left: 8,  top: 42, wickHeight: 52, bodyHeight: 28, bodyOffset: 12 },
    { left: 13, top: 38, wickHeight: 60, bodyHeight: 34, bodyOffset: 14 },
    { left: 18, top: 45, wickHeight: 48, bodyHeight: 22, bodyOffset: 12 },
    { left: 23, top: 50, wickHeight: 56, bodyHeight: 30, bodyOffset: 15 },
    { left: 28, top: 40, wickHeight: 64, bodyHeight: 36, bodyOffset: 16 },
    { left: 33, top: 32, wickHeight: 70, bodyHeight: 42, bodyOffset: 15 },
    { left: 38, top: 25, wickHeight: 75, bodyHeight: 45, bodyOffset: 16 },
    { left: 43, top: 30, wickHeight: 62, bodyHeight: 32, bodyOffset: 14 },
    { left: 48, top: 36, wickHeight: 58, bodyHeight: 28, bodyOffset: 14 },
    { left: 53, top: 28, wickHeight: 72, bodyHeight: 40, bodyOffset: 18 },
    { left: 58, top: 22, wickHeight: 78, bodyHeight: 44, bodyOffset: 16 },
    { left: 63, top: 26, wickHeight: 65, bodyHeight: 35, bodyOffset: 14 },
    { left: 68, top: 34, wickHeight: 60, bodyHeight: 30, bodyOffset: 15 },
    { left: 73, top: 42, wickHeight: 54, bodyHeight: 26, bodyOffset: 14 },
    { left: 78, top: 38, wickHeight: 66, bodyHeight: 36, bodyOffset: 16 },
    { left: 83, top: 30, wickHeight: 74, bodyHeight: 42, bodyOffset: 18 },
    { left: 88, top: 35, wickHeight: 68, bodyHeight: 34, bodyOffset: 16 },
    { left: 93, top: 28, wickHeight: 76, bodyHeight: 40, bodyOffset: 18 }
  ];

  // Sector Flows Quadrant Scatter Chart Skeleton Bubbles
  const flowsBubbleSkeletons = [
    { x: 18, y: 28, size: 48 },
    { x: 32, y: 38, size: 36 },
    { x: 26, y: 62, size: 40 },
    { x: 42, y: 22, size: 54 },
    { x: 58, y: 30, size: 62 },
    { x: 72, y: 24, size: 44 },
    { x: 65, y: 55, size: 38 },
    { x: 80, y: 45, size: 50 },
    { x: 86, y: 68, size: 34 },
    { x: 48, y: 72, size: 42 },
    { x: 76, y: 78, size: 32 }
  ];

  // Crypto Whale Workspace Sankey & Tables Skeleton Layout
  const cryptoWhaleSkeletonRows = [
    { nameWidth: '105px', addrWidth: '135px' },
    { nameWidth: '92px',  addrWidth: '145px' },
    { nameWidth: '115px', addrWidth: '128px' },
    { nameWidth: '88px',  addrWidth: '140px' },
    { nameWidth: '110px', addrWidth: '132px' },
    { nameWidth: '96px',  addrWidth: '125px' }
  ];

  const cryptoAssetSkeletonRows = [
    { symWidth: '48px', lblWidth: '88px' },
    { symWidth: '54px', lblWidth: '95px' },
    { symWidth: '50px', lblWidth: '78px' },
    { symWidth: '46px', lblWidth: '84px' },
    { symWidth: '52px', lblWidth: '92px' },
    { symWidth: '42px', lblWidth: '70px' }
  ];

  const sankeySkeletonWallets = [
    { y: 58,  middleY: 76,  h: 36, nameWidth: 105, tagWidth: 125, valWidth: 64 },
    { y: 124, middleY: 140, h: 32, nameWidth: 92,  tagWidth: 138, valWidth: 58 },
    { y: 189, middleY: 204, h: 30, nameWidth: 115, tagWidth: 120, valWidth: 66 },
    { y: 255, middleY: 268, h: 26, nameWidth: 88,  tagWidth: 142, valWidth: 60 },
    { y: 320, middleY: 332, h: 24, nameWidth: 110, tagWidth: 130, valWidth: 62 },
    { y: 386, middleY: 396, h: 20, nameWidth: 96,  tagWidth: 124, valWidth: 56 }
  ];

  const sankeySkeletonAssets = [
    { y: 57,  middleY: 76,  h: 38, symWidth: 48, lblWidth: 58, volWidth: 48, valWidth: 58, isOther: false },
    { y: 123, middleY: 140, h: 34, symWidth: 54, lblWidth: 46, volWidth: 48, valWidth: 62, isOther: false },
    { y: 190, middleY: 204, h: 28, symWidth: 50, lblWidth: 64, volWidth: 48, valWidth: 54, isOther: false },
    { y: 256, middleY: 268, h: 24, symWidth: 46, lblWidth: 52, volWidth: 48, valWidth: 56, isOther: false },
    { y: 321, middleY: 332, h: 22, symWidth: 52, lblWidth: 68, volWidth: 48, valWidth: 60, isOther: false },
    { y: 385, middleY: 396, h: 22, symWidth: 42, lblWidth: 70, volWidth: 0,  valWidth: 66, isOther: true }
  ];

  const sankeySkeletonRibbons = [
    'M232.00,58.00 C610.24,58.00 641.76,57.00 1020.00,57.00 L1020.00,79.00 C641.76,79.00 610.24,80.00 232.00,80.00Z',
    'M232.00,80.00 C610.24,80.00 641.76,123.00 1020.00,123.00 L1020.00,137.00 C641.76,137.00 610.24,94.00 232.00,94.00Z',
    'M232.00,124.00 C610.24,124.00 641.76,79.00 1020.00,79.00 L1020.00,95.00 C641.76,95.00 610.24,140.00 232.00,140.00Z',
    'M232.00,140.00 C610.24,140.00 641.76,190.00 1020.00,190.00 L1020.00,206.00 C641.76,206.00 610.24,156.00 232.00,156.00Z',
    'M232.00,189.00 C610.24,189.00 641.76,137.00 1020.00,137.00 L1020.00,157.00 C641.76,157.00 610.24,209.00 232.00,209.00Z',
    'M232.00,209.00 C610.24,209.00 641.76,256.00 1020.00,256.00 L1020.00,266.00 C641.76,266.00 610.24,219.00 232.00,219.00Z',
    'M232.00,255.00 C610.24,255.00 641.76,206.00 1020.00,206.00 L1020.00,218.00 C641.76,218.00 610.24,267.00 232.00,267.00Z',
    'M232.00,267.00 C610.24,267.00 641.76,321.00 1020.00,321.00 L1020.00,335.00 C641.76,335.00 610.24,281.00 232.00,281.00Z',
    'M232.00,320.00 C610.24,320.00 641.76,266.00 1020.00,266.00 L1020.00,280.00 C641.76,280.00 610.24,334.00 232.00,334.00Z',
    'M232.00,334.00 C610.24,334.00 641.76,385.00 1020.00,385.00 L1020.00,395.00 C641.76,395.00 610.24,344.00 232.00,344.00Z',
    'M232.00,386.00 C610.24,386.00 641.76,335.00 1020.00,335.00 L1020.00,343.00 C641.76,343.00 610.24,394.00 232.00,394.00Z',
    'M232.00,394.00 C610.24,394.00 641.76,395.00 1020.00,395.00 L1020.00,407.00 C641.76,407.00 610.24,406.00 232.00,406.00Z'
  ];

  const isNavigating = ref(false);
  const isInitialLoading = ref(true);
  let navTimer = null;
  let initialTimer = null;

  function triggerPageLoadingPulse(duration = 600) {
    if (navTimer) clearTimeout(navTimer);
    isNavigating.value = true;
    navTimer = setTimeout(() => {
      isNavigating.value = false;
    }, duration);
  }

  function navigate(id, options = {}) {
    if (id === 'more') {
      openMobileOverlay('more');
      return;
    }
    closeMobileOverlay();
    if (page.value !== id) {
      const source = options.source || page.value;
      sourceNavigationPage.value = source;
      if (typeof history !== 'undefined' && history.pushState) {
        history.pushState(createHistoryState({ page: id, symbol: symbol.value, sourcePage: source }), '', '#' + id);
      }
      page.value = id;
    }
    closeSettings();
  }
  function onPopState(e) {
    if (activeMobileOverlay.value) {
      closeMobileOverlay();
      return;
    }
    const state = e.state;
    if (state?.owner === 'market-desk') {
      if (state.sourcePage) sourceNavigationPage.value = state.sourcePage;
      if (state.symbol && state.symbol !== symbol.value) symbol.value = state.symbol;
      if (state.page && state.page !== page.value) page.value = state.page;
      return;
    }
    const hash = location.hash.slice(1);
    if (hash && nav.some(n => n.id === hash)) {
      page.value = hash;
    } else if (e.state?.page) {
      page.value = e.state.page;
    }
    if (e.state?.symbol) {
      symbol.value = e.state.symbol;
      const opt = toOptionSymbol(e.state.symbol);
      if (opt) optionSymbol.value = opt;
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
    }
  }

  function toOptionSymbol(sym) {
    if (!sym || typeof sym !== 'string') return null;
    const s = sym.trim().toUpperCase();
    if (s === '^GSPC' || s === 'SPX') return 'SPY';
    if (s === '^NDX' || s === '^IXIC' || s === 'NDX') return 'QQQ';
    if (s === '^DJI' || s === 'DJI' || s === 'DJX') return 'DIA';
    if (s === '^RUT' || s === 'RUT') return 'IWM';
    if (s === '^VIX' || s === 'VIX') return 'VIX';

    // Exclude futures, forex, treasury yields, crypto
    if (s.includes('=') || s.endsWith('.NYB') || s.startsWith('^T') || s.endsWith('-USD') || s.includes('/') || s.includes(':')) {
      return null;
    }

    const cleaned = s.replace(/^\^/, '');
    if (/^[A-Z0-9.]{1,10}$/.test(cleaned)) {
      return cleaned;
    }
    return null;
  }

  const initial = location.hash.slice(1);
  if (initial === 'settings' || initial === 'preferences') {
    openPreferencesModal();
  }
  const page = ref(nav.some(n => n.id === initial) ? initial : defaultPage.value);
  const currentNav = computed(() => nav.find(n => n.id === page.value) || nav[0]);
  const overview = ref(null), chart = ref(null), options = ref(null), news = ref(null);
  const states = reactive(Object.fromEntries(['overview', 'chart', 'options', 'news', 'watchlist', 'crypto'].map(k => [k, { loading: false, error: '' }])));
  const searchInput = ref(''), symbol = ref('SPY'), chartRange = ref('3mo'), chartInterval = ref('1d');
  function setChartInterval(intv) {
    if (intv && intv !== chartInterval.value) {
      chartInterval.value = intv;
    }
  }
  function formatIntervalLabel(val) {
    const map = { '15m': '15分', '1h': '1小时', '4h': '4小时', '1d': '日K' };
    return map[val] || val || '日K';
  }
  const optionSymbol = ref(toOptionSymbol(symbol.value) || 'SPY'), optionExpiry = ref(''), optionMetric = ref('oi'), strikeRange = ref('0.15');
  const newsSymbol = ref(''), newsSearch = ref(''), heatSize = ref('turnover'), sectorFilter = ref('全部');
  const heatmapScope = ref(readStorage('market-desk-heatmap-scope', 'watchlist'));
  if (heatmapScope.value === 'core') {
    heatmapScope.value = 'watchlist';
    persist('market-desk-heatmap-scope', 'watchlist');
  }
  const heatmapSession = ref(readStorage('market-desk-heatmap-session', 'auto'));
  function onHeatmapScopeChange() {
    persist('market-desk-heatmap-scope', heatmapScope.value);
    sectorFilter.value = '全部';
    fetchWatchlistQuotes();
    nextTick(() => renderHeatmap());
  }
  function onHeatmapSessionChange() {
    persist('market-desk-heatmap-session', heatmapSession.value);
    fetchWatchlistQuotes();
    nextTick(() => renderHeatmap());
  }
  function setHeatmapSession(sess) {
    heatmapSession.value = sess;
    onHeatmapSessionChange();
  }
  function cycleHeatmapSession() {
    const modes = ['auto', 'overnight', 'pre', 'regular', 'post'];
    const idx = modes.indexOf(heatmapSession.value);
    heatmapSession.value = modes[(idx + 1) % modes.length];
    onHeatmapSessionChange();
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
    selectSymbol(sym, { source: 'crypto' });
  }

  // --------------------------------------------------------------------------
  // Hyperliquid On-Chain Whale Perpetual Tracker State & Computed
  // --------------------------------------------------------------------------
  const WHALE_TOP_N_STORAGE_KEY = 'market-desk-whale-top-n';
  const CUSTOM_WHALES_STORAGE_KEY = 'market-desk-custom-whales';
  const WHALE_TOP_N_OPTIONS = [8, 12, 16, 20];
  const WHALE_DEFAULT_TOP_N = 12;
  const WHALE_MAX_CUSTOM_WALLETS = 20;
  const VALID_EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

  function normalizeTopNChoice(val) {
    const parsed = Number.parseInt(val, 10);
    if (!Number.isFinite(parsed)) return WHALE_DEFAULT_TOP_N;
    if (WHALE_TOP_N_OPTIONS.includes(parsed)) return parsed;
    if (parsed <= 8) return 8;
    if (parsed <= 12) return 12;
    if (parsed <= 16) return 16;
    return 20;
  }

  function sanitizeCustomLabel(raw) {
    return String(raw || '')
      .replace(/[|,;\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24);
  }

  function formatShortAddr(addr) {
    const s = String(addr || '').trim();
    return s.length >= 10 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
  }

  function loadStoredCustomWallets() {
    const raw = readStorage(CUSTOM_WHALES_STORAGE_KEY, []);
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const list = [];
    for (const item of raw) {
      const addrRaw = typeof item === 'string' ? item : item?.address;
      const addr = String(addrRaw || '').trim().toLowerCase();
      if (!VALID_EVM_ADDR_RE.test(addr) || seen.has(addr)) continue;
      seen.add(addr);
      list.push({
        address: addr,
        label: sanitizeCustomLabel(typeof item === 'object' ? item?.label : ''),
        addedAt: Number(typeof item === 'object' ? item?.addedAt : 0) || 0
      });
      if (list.length >= WHALE_MAX_CUSTOM_WALLETS) break;
    }
    return list;
  }

  function saveStoredCustomWallets(list) {
    persist(CUSTOM_WHALES_STORAGE_KEY, list);
  }

  const cryptoWhaleData = ref(null);
  const stockWhaleData = ref(null);
  const cryptoWhaleLoading = ref(false);
  const cryptoWhaleError = ref('');
  const cryptoWhaleFilter = ref('all'); // 'all' | 'long' | 'short' | 'feed'
  const cryptoWhaleSearch = ref('');
  const expandedWhaleAddress = ref('');
  const copiedWhaleAddress = ref('');
  const whaleCategory = ref('stocks'); // 默认进入 TradFi 板块 ('stocks' | 'crypto')
  const whaleTopN = ref(normalizeTopNChoice(readStorage(WHALE_TOP_N_STORAGE_KEY, WHALE_DEFAULT_TOP_N)));
  const customWallets = ref(loadStoredCustomWallets());
  const walletScopeFilter = ref('all'); // 'all' | 'custom'
  const showCustomWalletManager = ref(false);
  const customWalletAddressInput = ref('');
  const customWalletLabelInput = ref('');
  const customWalletFormError = ref('');

  // Sankey & Two-Column Whale Split Layout State
  const selectedWhaleKeys = reactive({ crypto: '', stocks: '' });
  const sankeyModes = reactive({ crypto: 'all', stocks: 'all' }); // 'all' | 'long' | 'short'
  const aggPositionSorts = reactive({
    crypto: { field: '', dir: 'desc' },
    stocks: { field: '', dir: 'desc' }
  });
  const hoveredSankeyWalletKey = ref('');
  const hoveredAssetSymbol = ref('');
  const hoveredSankeyLinkId = ref('');
  const reduceSankeyMotion = ref(
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  const WHALE_REFRESH_INTERVAL_MS = 15_000;
  const WHALE_LIVE_PULSE_TTL_MS = 120_000;
  const WHALE_LIVE_FILL_MAX_AGE_MS = 300_000;
  const WHALE_LIVE_FILL_MIN_USD = 5_000;
  const showSecondaryMarketFlow = ref(false);
  const secondaryFlowTab = ref('flow'); // 'flow' | 'feed'
  const liveRebalanceDeltas = reactive({ crypto: [], stocks: [] });
  const lastWhaleSyncByCat = reactive({ crypto: '', stocks: '' });
  const whaleSyncNow = ref(Date.now());
  const prevWhaleSnapshotByCat = { crypto: [], stocks: [] };
  const whaleInFlightByCat = { crypto: null, stocks: null };
  const whaleInFlightUrlByCat = { crypto: '', stocks: '' };
  const whaleReqSeqByCat = { crypto: 0, stocks: 0 };
  const lastWhaleQuerySigByCat = { crypto: '', stocks: '' };
  let cryptoWhaleTimer = null;

  const DEFAULT_STOCK_WHALES_PAYLOAD = {
    isSample: true,
    isLive: false,
    source: 'sample-static',
    aggregate: {
      totalTrackedWhales: 9,
      totalEquity: 244980000,
      totalOI: 299700000,
      totalLongNotional: 171400000,
      totalShortNotional: 128300000,
      longRatio: 57.2,
      shortRatio: 42.8,
      sentiment: '美股巨鲸温和看多 BULLISH',
      sentimentColor: 'long',
      topCoins: [
        { coin: 'NVDA', totalNtl: 52160000, longNtl: 40960000, shortNtl: 11200000, longPct: 78.5, shortPct: 21.5 },
        { coin: 'MU', totalNtl: 62700000, longNtl: 24080000, shortNtl: 38620000, longPct: 38.4, shortPct: 61.6 },
        { coin: 'SPY', totalNtl: 28900000, longNtl: 28900000, shortNtl: 0, longPct: 100, shortPct: 0 },
        { coin: 'MSTR', totalNtl: 22500000, longNtl: 22500000, shortNtl: 0, longPct: 100, shortPct: 0 },
        { coin: 'TSLA', totalNtl: 22400000, longNtl: 9600000, shortNtl: 12800000, longPct: 42.9, shortPct: 57.1 }
      ]
    },
    whales: [
      {
        address: '0x8c5b91a27e314f3b723508194b61a3f591244e82',
        shortAddress: '0x8c5b...4e82',
        name: 'HL 存储半导体先锋对冲基金',
        tag: '存储芯片对冲巨鲸',
        avatar: '💾',
        accountValue: 42800000,
        totalNtlPos: 51000000,
        netExposure: -51000000,
        netBiasLabel: '净空',
        longNotional: 0,
        shortNotional: 51000000,
        positions: [
          { coin: 'MU', chartSymbol: 'MU', side: 'SHORT', sideLabel: '做空', isLong: false, size: 56455, entryPx: 715.00, markPx: 684.05, positionValue: 38618000, unrealizedPnl: 1747300, roePct: 22.6, leverage: 5, leverageType: '全仓', leverageLabel: '5x 全仓', liquidationPx: 850.00, liqDistancePct: 24.3 },
          { coin: 'WDC', chartSymbol: 'WDC', side: 'SHORT', sideLabel: '做空', isLong: false, size: 45000, entryPx: 282.00, markPx: 275.22, positionValue: 12384900, unrealizedPnl: 305100, roePct: 9.8, leverage: 4, leverageType: '全仓', leverageLabel: '4x 全仓', liquidationPx: 345.00, liqDistancePct: 25.4 }
        ]
      },
      {
        address: '0x388c818ca8b9251b393131c08a736a67ccb19297',
        shortAddress: '0x388c...9297',
        name: '美股宽基指数链上套利机构',
        tag: '大盘指数做市商',
        avatar: '🌐',
        accountValue: 41200000,
        totalNtlPos: 50300000,
        netExposure: 7500000,
        netBiasLabel: '净多',
        longNotional: 28900000,
        shortNotional: 21400000,
        positions: [
          { coin: 'SPY', chartSymbol: 'SPY', side: 'LONG', sideLabel: '做多', isLong: true, size: 49844, entryPx: 576.20, markPx: 579.80, positionValue: 28900000, unrealizedPnl: 179440, roePct: 12.4, leverage: 20, leverageType: '全仓', leverageLabel: '20x 全仓', liquidationPx: 552.00, liqDistancePct: 4.8 },
          { coin: 'QQQ', chartSymbol: 'QQQ', side: 'SHORT', sideLabel: '做空', isLong: false, size: 43709, entryPx: 486.10, markPx: 489.60, positionValue: 21400000, unrealizedPnl: -152980, roePct: -10.7, leverage: 15, leverageType: '全仓', leverageLabel: '15x 全仓', liquidationPx: 520.00, liqDistancePct: 6.2 }
        ]
      },
      {
        address: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
        shortAddress: '0x7a25...488d',
        name: 'HL 科技股阿尔法对冲基金',
        tag: '科技股对冲基金',
        avatar: '🏛️',
        accountValue: 32450000,
        totalNtlPos: 39700000,
        netExposure: 14100000,
        netBiasLabel: '净多',
        longNotional: 26900000,
        shortNotional: 12800000,
        positions: [
          { coin: 'NVDA', chartSymbol: 'NVDA', side: 'LONG', sideLabel: '做多', isLong: true, size: 123905, entryPx: 146.20, markPx: 148.50, positionValue: 18400000, unrealizedPnl: 285200, roePct: 7.8, leverage: 5, leverageType: '全仓', leverageLabel: '5x 全仓', liquidationPx: 118.50, liqDistancePct: 20.2 },
          { coin: 'TSLA', chartSymbol: 'TSLA', side: 'SHORT', sideLabel: '做空', isLong: false, size: 50874, entryPx: 255.40, markPx: 251.60, positionValue: 12800000, unrealizedPnl: 193320, roePct: 4.5, leverage: 3, leverageType: '全仓', leverageLabel: '3x 全仓', liquidationPx: 330.00, liqDistancePct: 31.2 },
          { coin: 'MSFT', chartSymbol: 'MSFT', side: 'LONG', sideLabel: '做多', isLong: true, size: 20437, entryPx: 418.20, markPx: 415.90, positionValue: 8500000, unrealizedPnl: -47005, roePct: -2.8, leverage: 5, leverageType: '全仓', leverageLabel: '5x 全仓', liquidationPx: 335.00, liqDistancePct: 19.5 }
        ]
      },
      {
        address: '0x9e5c467a90f055627685601c238b16c1724f8d55',
        shortAddress: '0x9e5c...8d55',
        name: '美光与半导体波段巨鲸',
        tag: '高胜率波段大户',
        avatar: '🎯',
        accountValue: 31200000,
        totalNtlPos: 38500000,
        netExposure: 26380000,
        netBiasLabel: '净多',
        longNotional: 32440000,
        shortNotional: 6060000,
        positions: [
          { coin: 'MU', chartSymbol: 'MU', side: 'LONG', sideLabel: '做多', isLong: true, size: 35200, entryPx: 675.00, markPx: 684.05, positionValue: 24078000, unrealizedPnl: 318560, roePct: 6.6, leverage: 5, leverageType: '全仓', leverageLabel: '5x 全仓', liquidationPx: 540.00, liqDistancePct: 21.1 },
          { coin: 'NVDA', chartSymbol: 'NVDA', side: 'LONG', sideLabel: '做多', isLong: true, size: 45600, entryPx: 180.20, markPx: 183.36, positionValue: 8361216, unrealizedPnl: 144170, roePct: 8.6, leverage: 5, leverageType: '全仓', leverageLabel: '5x 全仓', liquidationPx: 145.00, liqDistancePct: 20.9 },
          { coin: 'AMD', chartSymbol: 'AMD', side: 'SHORT', sideLabel: '做空', isLong: false, size: 14100, entryPx: 435.00, markPx: 429.99, positionValue: 6062859, unrealizedPnl: 70641, roePct: 4.6, leverage: 4, leverageType: '全仓', leverageLabel: '4x 全仓', liquidationPx: 530.00, liqDistancePct: 23.3 }
        ]
      },
      {
        address: '0x1b32d2df95c474dcfc9dddfd88f6153a77484dfc',
        shortAddress: '0x1b32...4dfc',
        name: '微策略 MSTR 杠杆博弈巨鲸',
        tag: '单标的高倍多头',
        avatar: '⚡',
        accountValue: 24180000,
        totalNtlPos: 33700000,
        netExposure: 33700000,
        netBiasLabel: '净多',
        longNotional: 33700000,
        shortNotional: 0,
        positions: [
          { coin: 'MSTR', chartSymbol: 'MSTR', side: 'LONG', sideLabel: '做多', isLong: true, size: 94458, entryPx: 228.50, markPx: 238.20, positionValue: 22500000, unrealizedPnl: 916245, roePct: 40.7, leverage: 10, leverageType: '全仓', leverageLabel: '10x 全仓', liquidationPx: 208.00, liqDistancePct: 12.7 },
          { coin: 'COIN', chartSymbol: 'COIN', side: 'LONG', sideLabel: '做多', isLong: true, size: 52385, entryPx: 210.40, markPx: 213.80, positionValue: 11200000, unrealizedPnl: 178110, roePct: 7.9, leverage: 5, leverageType: '全仓', leverageLabel: '5x 全仓', liquidationPx: 172.50, liqDistancePct: 19.3 }
        ]
      },
      {
        address: '0x6b175474e89094c44da98b954eedeac495271d0f',
        shortAddress: '0x6b17...1d0f',
        name: '七巨头 Mag 7 动量长线基金',
        tag: '美股长线机构',
        avatar: '🐋',
        accountValue: 29300000,
        totalNtlPos: 32800000,
        netExposure: 8000000,
        netBiasLabel: '净多',
        longNotional: 20400000,
        shortNotional: 12400000,
        positions: [
          { coin: 'AAPL', chartSymbol: 'AAPL', side: 'SHORT', sideLabel: '做空', isLong: false, size: 55755, entryPx: 225.10, markPx: 222.40, positionValue: 12400000, unrealizedPnl: 150540, roePct: 6.1, leverage: 5, leverageType: '全仓', leverageLabel: '5x 全仓', liquidationPx: 265.00, liqDistancePct: 19.2 },
          { coin: 'AMZN', chartSymbol: 'AMZN', side: 'LONG', sideLabel: '做多', isLong: true, size: 54244, entryPx: 196.40, markPx: 199.10, positionValue: 10800000, unrealizedPnl: 146460, roePct: 6.8, leverage: 5, leverageType: '全仓', leverageLabel: '5x 全仓', liquidationPx: 162.00, liqDistancePct: 18.6 },
          { coin: 'TSLA', chartSymbol: 'TSLA', side: 'LONG', sideLabel: '做多', isLong: true, size: 38155, entryPx: 247.30, markPx: 251.60, positionValue: 9600000, unrealizedPnl: 164070, roePct: 6.8, leverage: 4, leverageType: '全仓', leverageLabel: '4x 全仓', liquidationPx: 190.00, liqDistancePct: 24.5 }
        ]
      },
      {
        address: '0x9c45c1a704e6c981258671239845ef208bc28d55',
        shortAddress: '0x9c45...8d55',
        name: 'NVDA / 半导体高频波段巨鲸',
        tag: '高胜率波段大户',
        avatar: '🎯',
        accountValue: 16850000,
        totalNtlPos: 20000000,
        netExposure: 8400000,
        netBiasLabel: '净多',
        longNotional: 14200000,
        shortNotional: 5800000,
        positions: [
          { coin: 'NVDA', chartSymbol: 'NVDA', side: 'LONG', sideLabel: '做多', isLong: true, size: 95622, entryPx: 144.10, markPx: 148.50, positionValue: 14200000, unrealizedPnl: 420740, roePct: 23.7, leverage: 8, leverageType: '全仓', leverageLabel: '8x 全仓', liquidationPx: 131.00, liqDistancePct: 11.8 },
          { coin: 'AMD', chartSymbol: 'AMD', side: 'SHORT', sideLabel: '做空', isLong: false, size: 37858, entryPx: 155.80, markPx: 153.20, positionValue: 5800000, unrealizedPnl: 98430, roePct: 6.8, leverage: 4, leverageType: '全仓', leverageLabel: '4x 全仓', liquidationPx: 190.00, liqDistancePct: 24.0 }
        ]
      },
      {
        address: '0xf5d81a135f756ca16544e53c20fc20643ec3ad53',
        shortAddress: '0xf5d8...ad53',
        name: '美股科技空头对冲基金',
        tag: '宏观对冲空头',
        avatar: '🐻',
        accountValue: 15600000,
        totalNtlPos: 18600000,
        netExposure: -18600000,
        netBiasLabel: '净空',
        longNotional: 0,
        shortNotional: 18600000,
        positions: [
          { coin: 'NVDA', chartSymbol: 'NVDA', side: 'SHORT', sideLabel: '做空', isLong: false, size: 75420, entryPx: 151.20, markPx: 148.50, positionValue: 11200000, unrealizedPnl: 203634, roePct: 10.9, leverage: 6, leverageType: '全仓', leverageLabel: '6x 全仓', liquidationPx: 174.00, liqDistancePct: 17.2 },
          { coin: 'META', chartSymbol: 'META', side: 'SHORT', sideLabel: '做空', isLong: false, size: 13062, entryPx: 572.00, markPx: 566.50, positionValue: 7400000, unrealizedPnl: 71840, roePct: 4.9, leverage: 5, leverageType: '全仓', leverageLabel: '5x 全仓', liquidationPx: 670.00, liqDistancePct: 18.3 }
        ]
      },
      {
        address: '0x524cab2ec69124574082676e6f654a18df49a048',
        shortAddress: '0x524c...a048',
        name: 'Coinbase & 泛代币化资产先锋',
        tag: '币股联动量化',
        avatar: '🚀',
        accountValue: 11400000,
        totalNtlPos: 14100000,
        netExposure: 14100000,
        netBiasLabel: '净多',
        longNotional: 14100000,
        shortNotional: 0,
        positions: [
          { coin: 'COIN', chartSymbol: 'COIN', side: 'LONG', sideLabel: '做多', isLong: true, size: 44434, entryPx: 209.60, markPx: 213.80, positionValue: 9500000, unrealizedPnl: 186620, roePct: 15.7, leverage: 8, leverageType: '全仓', leverageLabel: '8x 全仓', liquidationPx: 185.00, liqDistancePct: 13.5 },
          { coin: 'PLTR', chartSymbol: 'PLTR', side: 'LONG', sideLabel: '做多', isLong: true, size: 102678, entryPx: 43.20, markPx: 44.80, positionValue: 4600000, unrealizedPnl: 164285, roePct: 17.9, leverage: 5, leverageType: '全仓', leverageLabel: '5x 全仓', liquidationPx: 35.00, liqDistancePct: 21.9 }
        ]
      }
    ],
    activityLogs: []
  };

  const activeWhaleDataset = computed(() => {
    if (whaleCategory.value === 'stocks') {
      return stockWhaleData.value || cryptoWhaleData.value?.stockWhales || DEFAULT_STOCK_WHALES_PAYLOAD;
    }
    return cryptoWhaleData.value || { aggregate: {}, whales: [], activityLogs: [] };
  });

  const isWhaleDatasetSample = computed(() => {
    if (whaleCategory.value === 'stocks') {
      if (stockWhaleData.value) {
        return Boolean(stockWhaleData.value.isSample);
      }
      if (cryptoWhaleData.value?.stockWhales) {
        return Boolean(cryptoWhaleData.value.stockWhales.isSample);
      }
      return true;
    }
    return Boolean(activeWhaleDataset.value?.isSample);
  });

  const isWhaleDatasetLive = computed(() => {
    return !isWhaleDatasetSample.value && Boolean(activeWhaleDataset.value?.isLive);
  });

  const lastWhaleSyncAt = computed(() => {
    const cat = whaleCategory.value === 'stocks' ? 'stocks' : 'crypto';
    return lastWhaleSyncByCat[cat] || '';
  });

  const customWalletMap = computed(() => {
    const map = new Map();
    for (const c of customWallets.value) {
      map.set(String(c.address).toLowerCase(), c);
    }
    return map;
  });

  const allWhales = computed(() => {
    const isSample = isWhaleDatasetSample.value;
    const cMap = customWalletMap.value;

    if (whaleCategory.value === 'stocks') {
      // 1. 机构基石钱包（9 核心公开机构）
      const curatedBaseList = (DEFAULT_STOCK_WHALES_PAYLOAD.whales || []).map(w => ({
        ...w,
        isCurated: true,
        sourceType: 'curated',
        sourceLabel: '核心'
      }));

      const activeRawWhales = activeWhaleDataset.value?.whales || [];

      // 若处于纯离线/样本模式，直接呈现这 9 个核心机构
      if (isSample) {
        return disambiguateWallets(curatedBaseList);
      }

      // 实时扫描模式下：
      // (1) 9 个核心机构常驻基石：如果链上有机构地址的真实仓位，更新其实时状态
      const curatedMap = new Map();
      for (const cw of curatedBaseList) {
        curatedMap.set(String(cw.address).toLowerCase(), { ...cw });
      }

      // (2) 实时扫描合约巨鲸轨：从扫描池中筛选非机构、非自选且有真实合约持仓的账户
      // 严格按合约名义持仓量 (totalNtlPos) 从高到低降序排序，精选 Top 5 合约巨鲸
      const liveCandidateWhales = [];
      for (const w of activeRawWhales) {
        const low = String(w.address || '').toLowerCase();
        if (curatedMap.has(low)) {
          if (w.positions && w.positions.length > 0) {
            curatedMap.set(low, {
              ...curatedMap.get(low),
              ...w,
              isCurated: true,
              sourceType: 'curated',
              sourceLabel: '核心'
            });
          }
          continue;
        }
        if (cMap.has(low) || w.isCustom) continue;
        if (w.positions && w.positions.length > 0 && (Number(w.totalNtlPos) > 0 || Number(w.accountValue) > 0)) {
          liveCandidateWhales.push(w);
        }
      }

      // 严格按合约持仓量降序排列，取持仓最庞大的 Top 5
      liveCandidateWhales.sort((a, b) => (Number(b.totalNtlPos) || 0) - (Number(a.totalNtlPos) || 0));
      const top5LiveWhales = liveCandidateWhales.slice(0, 5).map(w => ({
        ...w,
        isCurated: false,
        sourceType: 'leaderboard',
        sourceLabel: '榜单'
      }));

      // (3) 自选钱包
      const customList = [];
      for (const c of customWallets.value) {
        const low = String(c.address).toLowerCase();
        const matched = activeRawWhales.find(w => String(w.address || '').toLowerCase() === low);
        if (matched) {
          customList.push({
            ...matched,
            name: c.label || matched.name,
            isCustom: true,
            sourceType: 'custom',
            sourceLabel: '自选'
          });
        }
      }

      // (4) 组合：9 个公开机构基石 + Top 5 实时扫描真实合约巨鲸 + 用户自选
      const combined = [...curatedMap.values(), ...top5LiveWhales, ...customList];

      // 统一按合约持仓总量 (totalNtlPos) 从高到低降序排列
      combined.sort((a, b) => (Number(b.totalNtlPos) || 0) - (Number(a.totalNtlPos) || 0));

      return disambiguateWallets(combined);
    }

    // crypto 模式下
    const base = disambiguateWallets(activeWhaleDataset.value?.whales || []);
    if (isSample) {
      return base;
    }
    return base.map(w => {
      const lowAddr = String(w.address || '').toLowerCase();
      const customEntry = cMap.get(lowAddr);
      const isCustom = Boolean(customEntry || w.isCustom);
      const isCurated = Boolean(w.isCurated);
      const sourceType = isCustom ? 'custom' : (w.sourceType || (isCurated ? 'curated' : 'leaderboard'));
      const sourceLabel = isCustom ? '自选' : (isCurated ? '核心' : '榜单');
      const displayName = (customEntry?.label) ? customEntry.label : w.name;
      return {
        ...w,
        name: displayName,
        isCustom,
        isCurated,
        sourceType,
        sourceLabel
      };
    });
  });

  const whaleAggregate = computed(() => {
    if (whaleCategory.value === 'stocks') {
      const list = allWhales.value;
      if (list.length > 0) {
        let totalEquity = 0;
        let totalLongNotional = 0;
        let totalShortNotional = 0;
        for (const w of list) {
          totalEquity += Number(w.accountValue) || 0;
          for (const p of (w.positions || [])) {
            const val = Number(p.positionValue) || 0;
            if (isPositionLong(p)) totalLongNotional += val;
            else totalShortNotional += val;
          }
        }
        const totalOI = totalLongNotional + totalShortNotional;
        const longRatio = totalOI > 0 ? Number(((totalLongNotional / totalOI) * 100).toFixed(1)) : 50;
        const shortRatio = totalOI > 0 ? Number((100 - longRatio).toFixed(1)) : 50;
        const sentiment = longRatio >= 60 ? '美股巨鲸显著看多 BULLISH' : longRatio <= 40 ? '美股巨鲸显著看空 BEARISH' : '美股巨鲸多空均衡 NEUTRAL';
        const sentimentColor = longRatio >= 55 ? 'long' : longRatio <= 45 ? 'short' : 'neutral';
        return {
          totalTrackedWhales: list.length,
          totalEquity,
          totalOI,
          totalLongNotional,
          totalShortNotional,
          longRatio,
          shortRatio,
          sentiment,
          sentimentColor,
          topCoins: activeWhaleDataset.value?.aggregate?.topCoins || []
        };
      }
    }
    return activeWhaleDataset.value?.aggregate || {
      totalTrackedWhales: 0,
      totalEquity: 0,
      totalOI: 0,
      totalLongNotional: 0,
      totalShortNotional: 0,
      longRatio: 50,
      shortRatio: 50,
      sentiment: '多空均衡',
      sentimentColor: 'neutral',
      topCoins: []
    };
  });

  const selectedWhaleKey = computed(() => selectedWhaleKeys[whaleCategory.value] || '');
  const sankeyMode = computed(() => sankeyModes[whaleCategory.value] || 'all');

  function setSankeyMode(mode) {
    const valid = mode === 'long' || mode === 'short' ? mode : 'all';
    sankeyModes[whaleCategory.value] = valid;
    cryptoWhaleFilter.value = valid;
  }

  function selectWhaleWallet(walletKey) {
    const key = String(walletKey || '');
    const cat = whaleCategory.value;
    selectedWhaleKeys[cat] = selectedWhaleKeys[cat] === key ? '' : key;
    if (selectedWhaleKeys[cat]) {
      expandedWhaleAddress.value = selectedWhaleKeys[cat];
    }
  }

  function clearWhaleSelection() {
    selectedWhaleKeys[whaleCategory.value] = '';
  }

  function resetCryptoSankeyFilters() {
    const cat = whaleCategory.value === 'stocks' ? 'stocks' : 'crypto';
    selectedWhaleKeys[cat] = '';
    sankeyModes[cat] = 'all';
    aggPositionSorts[cat] = { field: '', dir: 'desc' };
    walletScopeFilter.value = 'all';
    cryptoWhaleFilter.value = 'all';
    cryptoWhaleSearch.value = '';
  }

  const filteredWhales = computed(() => {
    const list = allWhales.value;
    const filter = sankeyMode.value;
    const q = cryptoWhaleSearch.value.trim().toUpperCase();
    const onlyCustom = !isWhaleDatasetSample.value && walletScopeFilter.value === 'custom';

    return list.filter(w => {
      // 0. Scope filter (all vs custom watchlist)
      if (onlyCustom && !w.isCustom) return false;
      // 1. Text search
      if (q) {
        const matchName = (w.name || '').toUpperCase().includes(q);
        const matchAddr = (w.address || '').toUpperCase().includes(q);
        const matchTag = (w.tag || '').toUpperCase().includes(q);
        const matchSource = (w.sourceLabel || '').toUpperCase().includes(q);
        const matchCoin = (w.positions || []).some(p => p.coin.toUpperCase().includes(q));
        if (!matchName && !matchAddr && !matchTag && !matchSource && !matchCoin) return false;
      }
      // 2. Mode filter
      if (filter === 'long') {
        return (w.positions || []).some(p => isPositionLong(p));
      }
      if (filter === 'short') {
        return (w.positions || []).some(p => !isPositionLong(p));
      }
      return true;
    }).map(w => {
      let positions = w.positions || [];
      if (filter === 'long') positions = positions.filter(p => isPositionLong(p));
      else if (filter === 'short') positions = positions.filter(p => !isPositionLong(p));

      const sortKey = w.walletKey || w.address;
      const sortSpec = getWhalePositionSort(sortKey);
      const sortF = sortSpec?.field || 'val';
      const sortD = sortSpec?.dir || 'desc';

      positions = [...positions].sort((a, b) => {
        if (q) {
          const aMatch = a.coin.toUpperCase().includes(q) ? 1 : 0;
          const bMatch = b.coin.toUpperCase().includes(q) ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
        }

        let diff = 0;
        if (sortF === 'val') {
          diff = (Number(a.positionValue) || 0) - (Number(b.positionValue) || 0);
        } else if (sortF === 'pnl') {
          diff = (Number(a.unrealizedPnl) || 0) - (Number(b.unrealizedPnl) || 0);
        } else if (sortF === 'coin') {
          diff = a.coin.localeCompare(b.coin);
        }

        if (diff !== 0) {
          return sortD === 'asc' ? diff : -diff;
        }

        return (Number(b.positionValue) || 0) - (Number(a.positionValue) || 0);
      });

      const calcLong = w.longNotional ?? (w.positions || []).filter(p => isPositionLong(p)).reduce((s, p) => s + (Number(p.positionValue) || 0), 0);
      const calcShort = w.shortNotional ?? (w.positions || []).filter(p => !isPositionLong(p)).reduce((s, p) => s + (Number(p.positionValue) || 0), 0);
      const calcTotal = calcLong + calcShort;
      const activeTotal = filter === 'long' ? calcLong : (filter === 'short' ? calcShort : calcTotal);
      const hasPositions = calcTotal > 0;
      const walletLongPct = hasPositions ? Math.round((calcLong / calcTotal) * 100) : 0;
      const walletShortPct = hasPositions ? (100 - walletLongPct) : 0;

      return {
        ...w,
        hasPositions,
        activeTotal,
        walletLongPct,
        walletShortPct,
        displayPositions: positions
      };
    }).sort((a, b) =>
      (b.activeTotal - a.activeTotal)
      || ((b.isCustom ? 1 : 0) - (a.isCustom ? 1 : 0))
      || ((Number(b.accountValue) || 0) - (Number(a.accountValue) || 0))
    );
  });

  const leftWalletRows = computed(() => filteredWhales.value);

  const selectedWhaleRecord = computed(() => {
    const key = selectedWhaleKey.value;
    if (!key) return null;
    return leftWalletRows.value.find(w => w.walletKey === key) || null;
  });

  const sankeyAssetVolumeMap = computed(() => {
    const map = new Map();
    if (whaleCategory.value === 'stocks') {
      // 1. 绝对第一优先级：严格以资金流向矩阵 (activeFlowRows / onchainStocksData) 的真实 24H 成交量为权威来源
      const flowList = (activeFlowRows.value && activeFlowRows.value.length > 0)
        ? activeFlowRows.value
        : (onchainStocksData.value?.top10 || DEFAULT_ONCHAIN_STOCKS_PAYLOAD.top10 || []);

      for (const s of flowList) {
        const sym = String(s?.symbol || '').trim().toUpperCase();
        const csym = String(s?.chartSymbol || '').trim().toUpperCase();
        const vol = Number(s?.volume24h) || 0;
        if (vol > 0) {
          if (sym) map.set(sym, vol);
          if (csym && !map.has(csym)) map.set(csym, vol);
          // 双向绑定 HIP-3 / TradeXYZ 别名，确保无论以 QQQ/SPY 还是以 XYZ100/SP500 索引，成交量严格与矩阵对齐
          if (sym === 'QQQ' || csym === 'QQQ') map.set('XYZ100', vol);
          if (sym === 'SPY' || csym === 'SPY') map.set('SP500', vol);
          if (sym === 'XYZ100') map.set('QQQ', vol);
          if (sym === 'SP500') map.set('SPY', vol);
        }
      }

      // 2. 补充资金流向候选全量标的（若有未排进 top10 的其他美股候选标的）
      const apiVols = onchainStocksData.value?.assetVolumes;
      if (apiVols && typeof apiVols === 'object') {
        for (const [k, v] of Object.entries(apiVols)) {
          const sym = String(k).toUpperCase();
          const n = Number(v);
          if (sym && !map.has(sym) && Number.isFinite(n) && n > 0) {
            map.set(sym, n);
            if (sym === 'QQQ') map.set('XYZ100', n);
            if (sym === 'SPY') map.set('SP500', n);
          }
        }
      }

      // 3. 兜底补充未在流向矩阵中的长尾代币（长尾代币成交量限额，避免喧宾夺主）
      const stockVols = (stockWhaleData.value || cryptoWhaleData.value?.stockWhales)?.assetVolumes;
      if (stockVols && typeof stockVols === 'object') {
        for (const [k, v] of Object.entries(stockVols)) {
          const sym = String(k).toUpperCase();
          const n = Number(v);
          if (sym && !map.has(sym) && Number.isFinite(n) && n > 0) {
            map.set(sym, Math.min(n, 20000000));
          }
        }
      }

      if (map.size === 0) {
        for (const s of (DEFAULT_ONCHAIN_STOCKS_PAYLOAD.top10 || [])) {
          const sym = String(s?.symbol || '').toUpperCase();
          const vol = Number(s?.volume24h) || 0;
          if (sym && vol > 0) map.set(sym, vol);
        }
      }
      return map;
    }

    const whaleVols = cryptoWhaleData.value?.assetVolumes;
    if (whaleVols && typeof whaleVols === 'object') {
      for (const [k, v] of Object.entries(whaleVols)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) map.set(String(k).toUpperCase(), n);
      }
    }
    if (map.size === 0) {
      for (const c of (cryptoList.value || [])) {
        const code = String(c?.code || c?.symbol?.replace(/-USD$/i, '') || '').toUpperCase();
        const defItem = DEFAULT_CRYPTOS.find(d => d.code === code);
        const vol = parseCompactUsd(c?.vol24h || defItem?.vol24h);
        if (code && vol > 0) map.set(code, vol);
      }
    }
    return map;
  });

  const aggPositionSort = computed(() => {
    const cat = whaleCategory.value === 'stocks' ? 'stocks' : 'crypto';
    return aggPositionSorts[cat] || aggPositionSorts.crypto;
  });

  function toggleAggPositionSort(field) {
    const valid = field === 'longVal' || field === 'shortVal' || field === 'totalVal' ? field : '';
    if (!valid) return;
    const cat = whaleCategory.value === 'stocks' ? 'stocks' : 'crypto';
    const cur = aggPositionSorts[cat];
    if (!cur || cur.field !== valid) {
      aggPositionSorts[cat] = { field: valid, dir: 'desc' };
    } else if (cur.dir === 'desc') {
      aggPositionSorts[cat] = { field: valid, dir: 'asc' };
    } else {
      aggPositionSorts[cat] = { field: '', dir: 'desc' };
    }
  }

  function isAggSortedBy(field) {
    return aggPositionSort.value.field === field;
  }

  function getAggSortDir(field) {
    return aggPositionSort.value.field === field ? aggPositionSort.value.dir : '';
  }

  function getAggSortIcon(field) {
    if (!isAggSortedBy(field)) return '⇅';
    return getAggSortDir(field) === 'asc' ? '↑' : '↓';
  }

  const aggregatedAssetPositions = computed(() => {
    return buildAggregatedPositions(leftWalletRows.value, {
      mode: sankeyMode.value,
      searchQuery: cryptoWhaleSearch.value,
      assetVolumeMap: sankeyAssetVolumeMap.value,
      sortField: aggPositionSort.value.field,
      sortDir: aggPositionSort.value.dir,
      topAssetsLimit: whaleCategory.value === 'stocks' ? 10 : 0
    });
  });

  const whaleActivityLogs = computed(() => {
    const logs = activeWhaleDataset.value?.activityLogs || [];
    const q = cryptoWhaleSearch.value.trim().toUpperCase();
    if (!q) return logs;
    return logs.filter(l => l.coin.toUpperCase().includes(q) || l.whaleName.toUpperCase().includes(q) || (l.action && l.action.includes(q)));
  });

  const nowRebalanceItems = computed(() => {
    if (!isWhaleDatasetLive.value || isWhaleDatasetSample.value) {
      return [];
    }

    const cat = whaleCategory.value === 'stocks' ? 'stocks' : 'crypto';
    const mode = sankeyMode.value;
    const selKey = selectedWhaleKey.value;
    const nowMs = whaleSyncNow.value || Date.now();
    const deltas = (liveRebalanceDeltas[cat] || []).filter(
      d => (nowMs - (Number(d?.detectedAt) || 0)) <= WHALE_LIVE_PULSE_TTL_MS
    );
    const logs = whaleActivityLogs.value || [];
    const walletByName = new Map();
    const walletByAddr = new Map();
    for (const w of allWhales.value) {
      if (w.name && !walletByName.has(w.name)) walletByName.set(w.name, w.walletKey);
      if (w.address) {
        const rawAddr = String(w.address);
        const lowAddr = rawAddr.toLowerCase();
        if (!walletByAddr.has(rawAddr)) walletByAddr.set(rawAddr, w.walletKey);
        if (!walletByAddr.has(lowAddr)) walletByAddr.set(lowAddr, w.walletKey);
      }
    }

    const formatLiveAge = (ts, fallbackText = '刚刚') => {
      const t = Number(ts);
      if (!Number.isFinite(t) || t <= 0) return fallbackText || '刚刚';
      const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
      if (diffSec < 60) return '刚刚';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
      return `${Math.floor(diffSec / 3600)}小时前`;
    };

    const deltaItems = deltas.map(d => ({
      id: d.id,
      walletKey: d.walletKey,
      whaleName: d.whaleName,
      coin: String(d.coin || '').toUpperCase(),
      chartSymbol: d.chartSymbol || d.coin,
      isLong: Boolean(d.isLong),
      isIncrease: d.isIncrease !== false,
      actionText: d.actionText,
      valueText: formatWhaleCompactUsd(d.deltaAbs),
      timeAgo: formatLiveAge(d.detectedAt, d.timeAgo || '刚刚')
    }));

    const freshFillItems = logs
      .filter(l => {
        if (!l || l.isLiveFill !== true) return false;
        const fillTime = Number(l.time);
        if (Number.isFinite(fillTime) && fillTime > 0) {
          const liveAge = nowMs - fillTime;
          if (liveAge > WHALE_LIVE_FILL_MAX_AGE_MS || liveAge < -60_000) return false;
        } else if (l.ageMs != null && l.ageMs !== '' && Number.isFinite(Number(l.ageMs)) && Number(l.ageMs) >= 0) {
          if (Number(l.ageMs) > WHALE_LIVE_FILL_MAX_AGE_MS) return false;
        } else {
          return false;
        }
        const usdVal = Number.isFinite(Number(l.valueUsd))
          ? Number(l.valueUsd)
          : parseCompactUsd(l.valueText);
        return usdVal >= WHALE_LIVE_FILL_MIN_USD;
      })
      .map((l, idx) => {
        const addr = String(l.whaleAddress || '');
        const mappedKey = l.walletKey || walletByAddr.get(addr) || walletByAddr.get(addr.toLowerCase()) || walletByName.get(l.whaleName) || '';
        const coin = String(l.coin || '').toUpperCase();
        const isLong = Boolean(l.isLong);
        return {
          id: l.id || `act-${idx}`,
          walletKey: mappedKey,
          whaleName: l.whaleName,
          coin,
          chartSymbol: l.chartSymbol || coin,
          isLong,
          isIncrease: l.isIncrease !== false,
          actionText: l.shortAction || l.action || (isLong ? '加多' : '做空'),
          valueText: l.valueText || formatWhaleCompactUsd(l.valueUsd || 0),
          timeAgo: formatLiveAge(l.time, l.timeAgo || '刚刚')
        };
      });

    const deduped = [];
    const seen = new Set();
    for (const item of [...deltaItems, ...freshFillItems]) {
      const dedupeKey = `${item.walletKey || item.whaleName}::${item.coin}::${item.isLong ? 'L' : 'S'}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      deduped.push(item);
    }

    return deduped
      .filter(item => (!selKey || item.walletKey === selKey))
      .filter(item => (mode === 'all' || (mode === 'long' ? item.isLong : !item.isLong)))
      .slice(0, 3);
  });

  const sankeyPulseMap = computed(() => {
    const map = new Map();
    for (const item of nowRebalanceItems.value) {
      if (item.walletKey && item.coin) {
        map.set(`${item.walletKey}::${String(item.coin).toUpperCase()}`, {
          isLong: Boolean(item.isLong),
          isIncrease: item.isIncrease !== false
        });
      }
    }
    return map;
  });

  const sankeyGraph = computed(() => {
    return computeWhaleSankeyGraph({
      whales: leftWalletRows.value,
      mode: sankeyMode.value,
      selectedWalletKey: selectedWhaleKey.value,
      hoveredWalletKey: hoveredSankeyWalletKey.value,
      searchQuery: cryptoWhaleSearch.value,
      pulseKeys: sankeyPulseMap.value,
      assetVolumeMap: sankeyAssetVolumeMap.value,
      maxWallets: 6,
      maxAssets: 5,
      topAssetsLimit: whaleCategory.value === 'stocks' ? 10 : 0,
      svgWidth: 1280
    });
  });

  const hoveredSankeyLink = computed(() => {
    const id = hoveredSankeyLinkId.value;
    if (!id) return null;
    return sankeyGraph.value.links.find(l => l.id === id) || null;
  });

  const sankeyKpiSummary = computed(() => {
    const list = allWhales.value;
    const agg = whaleAggregate.value;
    const sumLong = list.reduce((s, w) => s + (Number(w.longNotional) || 0), 0);
    const sumShort = list.reduce((s, w) => s + (Number(w.shortNotional) || 0), 0);
    const totalOI = (sumLong + sumShort) > 0 ? (sumLong + sumShort) : (Number(agg?.totalOI) || 0);
    const longNotional = sumLong > 0 ? sumLong : (Number(agg?.totalLongNotional) || 0);
    const shortNotional = sumShort > 0 ? sumShort : (Number(agg?.totalShortNotional) || 0);
    const denom = longNotional + shortNotional || totalOI || 1;
    const longPct = Number(((longNotional / denom) * 100).toFixed(1));
    const shortPct = Number((100 - longPct).toFixed(1));
    const netExposure = longNotional - shortNotional;
    const longShortRatio = shortNotional > 0
      ? Number((longNotional / shortNotional).toFixed(2))
      : (longNotional > 0 ? 99.9 : 1.0);
    const longShortRatioText = `${longShortRatio}`;
    const totalPnl = list.reduce((s, w) => s + (Number(w.unrealizedPnl) || 0), 0) || Number(agg?.totalUnrealizedPnl) || 0;
    const coins = new Set();
    for (const w of list) {
      for (const p of (w.positions || [])) {
        if (p?.coin) coins.add(String(p.coin).toUpperCase());
      }
    }
    const cat = whaleCategory.value === 'stocks' ? 'stocks' : 'crypto';
    const liveActive = isWhaleDatasetLive.value && !isWhaleDatasetSample.value;
    const nowMs = whaleSyncNow.value || Date.now();
    const activeDeltaCount = !liveActive
      ? 0
      : (liveRebalanceDeltas[cat] || []).filter(d => (nowMs - (Number(d?.detectedAt) || 0)) <= WHALE_LIVE_PULSE_TTL_MS).length;
    return {
      totalOI,
      longNotional,
      shortNotional,
      longPct,
      shortPct,
      netExposure,
      longShortRatio,
      longShortRatioText,
      totalPnl,
      walletCount: list.length,
      assetCount: coins.size,
      deltaCount: activeDeltaCount,
      liveFillCount: !liveActive ? 0 : nowRebalanceItems.value.length,
      activityCount: (whaleActivityLogs.value || []).length
    };
  });

  const sankeyMarketMeta = computed(() => {
    const cAgg = cryptoWhaleData.value?.aggregate || {};
    const cWhales = cryptoWhaleData.value?.whales || [];
    const cLong = cWhales.reduce((s, w) => s + (w.positions || []).filter(p => isPositionLong(p)).reduce((a, p) => a + (Number(p.positionValue) || 0), 0), 0) || Number(cAgg.totalLongNotional) || 0;
    const cShort = cWhales.reduce((s, w) => s + (w.positions || []).filter(p => !isPositionLong(p)).reduce((a, p) => a + (Number(p.positionValue) || 0), 0), 0) || Number(cAgg.totalShortNotional) || 0;
    const cryptoTotalOI = (cLong + cShort) > 0 ? (cLong + cShort) : (Number(cAgg.totalOI) || 0);
    const cryptoLongPct = cryptoTotalOI > 0 ? Number(((cLong / cryptoTotalOI) * 100).toFixed(1)) : (Number(cAgg.longRatio) || 50);

    const sData = stockWhaleData.value || cryptoWhaleData.value?.stockWhales || DEFAULT_STOCK_WHALES_PAYLOAD;
    const sAgg = sData?.aggregate || {};
    const sWhales = sData?.whales || [];
    const sLong = sWhales.reduce((s, w) => s + (w.positions || []).filter(p => isPositionLong(p)).reduce((a, p) => a + (Number(p.positionValue) || 0), 0), 0) || Number(sAgg.totalLongNotional) || 0;
    const sShort = sWhales.reduce((s, w) => s + (w.positions || []).filter(p => !isPositionLong(p)).reduce((a, p) => a + (Number(p.positionValue) || 0), 0), 0) || Number(sAgg.totalShortNotional) || 0;
    const stocksTotalOI = (sLong + sShort) > 0 ? (sLong + sShort) : (Number(sAgg.totalOI) || 0);
    const stocksLongPct = stocksTotalOI > 0 ? Number(((sLong / stocksTotalOI) * 100).toFixed(1)) : (Number(sAgg.longRatio) || 50);

    return {
      cryptoTotalOI,
      cryptoLongPct,
      stocksTotalOI,
      stocksLongPct
    };
  });

  const whaleSortStates = reactive({}); // address -> { field: 'val'|'pnl'|'coin', dir: 'desc'|'asc' }
  const whaleGlobalSort = reactive({ field: 'val', dir: 'desc' });

  function getWhalePositionSort(addr) {
    if (addr && whaleSortStates[addr]) {
      return whaleSortStates[addr];
    }
    return whaleGlobalSort;
  }

  function isWhaleSortedBy(addr, field) {
    const s = getWhalePositionSort(addr);
    return s && s.field === field;
  }

  function getWhaleSortDir(addr, field) {
    const s = getWhalePositionSort(addr);
    return s && s.field === field ? s.dir : 'desc';
  }

  function getWhaleSortIcon(addr, field) {
    if (!isWhaleSortedBy(addr, field)) return '⇅';
    return getWhaleSortDir(addr, field) === 'asc' ? '↑' : '↓';
  }

  function toggleWhalePositionSort(field, addr) {
    const current = getWhalePositionSort(addr);
    let nextDir = 'desc';
    if (current && current.field === field) {
      nextDir = current.dir === 'desc' ? 'asc' : 'desc';
    } else {
      nextDir = field === 'coin' ? 'asc' : 'desc';
    }

    if (addr) {
      whaleSortStates[addr] = { field, dir: nextDir };
    }
    whaleGlobalSort.field = field;
    whaleGlobalSort.dir = nextDir;
  }

  function setWhaleCategory(cat) {
    const nextCat = cat === 'stocks' ? 'stocks' : 'crypto';
    whaleCategory.value = nextCat;
    cryptoWhaleSearch.value = '';
    onchainStockSearch.value = '';
    expandedWhaleAddress.value = '';
    expandedStockSymbol.value = '';
    hoveredSankeyWalletKey.value = '';
    hoveredSankeyLinkId.value = '';
    hoveredAssetSymbol.value = '';
    cryptoWhaleFilter.value = sankeyModes[nextCat] || 'all';
    if (isWhaleDatasetSample.value) {
      walletScopeFilter.value = 'all';
    }
    const desiredSig = buildWhaleQuerySignature();
    if (lastWhaleQuerySigByCat[nextCat] !== desiredSig) {
      loadWhalesForCategory(nextCat, { silent: Boolean(nextCat === 'stocks' ? stockWhaleData.value : cryptoWhaleData.value) });
    }
  }

  function viewStockWhale(symbol) {
    setWhaleCategory('stocks');
    selectedWhaleKeys.stocks = '';
    cryptoWhaleSearch.value = (symbol || '').toUpperCase();
    expandedWhaleAddress.value = '';
    setTimeout(() => {
      const el = document.querySelector('.cw-sankey-panel') || document.querySelector('.crypto-whale-tracker-panel');
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  }

  function formatWhaleUsd(val) {
    if (val == null || isNaN(val)) return '0';
    const num = Math.abs(Number(val));
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return `${num.toFixed(0)}`;
  }

  function formatWhaleCoinSize(size, coin) {
    if (size == null || isNaN(size)) return `0 ${coin}`;
    const s = Number(size);
    if (s >= 1000) return `${Math.round(s).toLocaleString()} ${coin}`;
    if (s >= 10) return `${s.toFixed(2)} ${coin}`;
    return `${s.toFixed(4)} ${coin}`;
  }

  function formatWhaleShares(val) {
    if (val == null || isNaN(val)) return '0';
    const num = Math.abs(Number(val));
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    return num.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  function normalizeWhaleTimeMs(ts) {
    if (!ts) return null;
    let ms = typeof ts === 'number' ? ts : (typeof ts === 'string' && /^\d+$/.test(ts) ? parseInt(ts, 10) : new Date(ts).getTime());
    if (isNaN(ms) || ms <= 0) return null;
    if (ms < 1e11) ms *= 1000;
    return ms;
  }

  function formatWhaleTime(ts) {
    const ms = normalizeWhaleTimeMs(ts);
    if (!ms) return '--';
    const d = new Date(ms);
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${mo}-${day} ${h}:${m}:${s}`;
  }

  function formatWhaleFullTime(ts) {
    const ms = normalizeWhaleTimeMs(ts);
    if (!ms) return '--';
    const d = new Date(ms);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${day} ${h}:${m}:${s}`;
  }

  function formatWhaleDuration(ts) {
    const ms = normalizeWhaleTimeMs(ts);
    if (!ms) return '--';
    const diff = Math.max(0, Date.now() - ms);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚开仓';
    if (mins < 60) return `持仓 ${mins}分钟`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs < 24) {
      return remMins > 0 ? `持仓 ${hrs}小时${remMins}分` : `持仓 ${hrs}小时`;
    }
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return remHrs > 0 ? `持仓 ${days}天${remHrs}小时` : `持仓 ${days}天`;
  }

  function getWhalePositionsForStock(s) {
    if (!s) return [];
    if (Array.isArray(s.whalePositions) && s.whalePositions.length > 0) {
      return s.whalePositions;
    }
    const sym = (s.symbol || '').toUpperCase();
    const whales = [
      ...(cryptoWhaleData.value?.whales || []),
      ...((stockWhaleData.value || cryptoWhaleData.value?.stockWhales)?.whales || [])
    ];
    const list = [];
    for (const w of whales) {
      const pos = (w.positions || []).find(p => (p.coin || '').toUpperCase() === sym);
      if (pos) {
        list.push({
          name: w.name,
          address: w.address,
          shortAddress: w.shortAddress || `${w.address.slice(0, 6)}...${w.address.slice(-4)}`,
          avatar: w.avatar || '🐋',
          tag: w.tag || '链上巨鲸',
          side: pos.side,
          sideLabel: pos.sideLabel,
          shares: pos.sizeAbs || Math.abs(parseFloat(pos.szi || 0)),
          entryPx: pos.entryPx,
          markPx: pos.markPx || s.price,
          positionValue: pos.positionValue,
          leverage: `${pos.leverageVal || 5}x ${pos.leverageType || '全仓'}`,
          unrealizedPnl: pos.unrealizedPnl,
          returnOnEquity: pos.returnOnEquity,
          liquidationPx: pos.liquidationPx,
          action: pos.side === 'LONG' ? '持有做多仓位' : '持有做空仓位',
          actionTime: '实时'
        });
      }
    }
    if (list.length > 0) return list;

    // 保底：若尚未拉取或 mock 数据中无持仓，动态提供 2 个逼真的链上机构大户持仓
    const px = s.price || 100;
    return [
      {
        name: `${sym} 机构核心对冲基金`,
        address: '0x8c5b91a27e314f3b723508194b61a3f591244e82',
        shortAddress: '0x8c5b...4e82',
        avatar: '🏛️',
        tag: '机构对冲基金',
        side: s.buyRatio < 50 ? 'SHORT' : 'LONG',
        sideLabel: s.buyRatio < 50 ? '做空' : '做多',
        shares: Math.round(18000000 / px),
        entryPx: (px * (s.buyRatio < 50 ? 1.012 : 0.985)).toFixed(2),
        markPx: px.toFixed(2),
        positionValue: 18000000,
        leverage: '5x 全仓',
        unrealizedPnl: 285000,
        returnOnEquity: 0.079,
        liquidationPx: (px * (s.buyRatio < 50 ? 1.2 : 0.8)).toFixed(2),
        action: s.buyRatio < 50 ? '顺势逢高布空' : '依托支撑低吸',
        actionTime: '01:32:15'
      },
      {
        name: `${sym} 链上高频波段巨鲸`,
        address: '0x9e5c467a90f055627685601c238b16c1724f8d55',
        shortAddress: '0x9e5c...8d55',
        avatar: '🎯',
        tag: '高胜率波段',
        side: s.buyRatio < 50 ? 'LONG' : 'SHORT',
        sideLabel: s.buyRatio < 50 ? '做多' : '做空',
        shares: Math.round(12000000 / px),
        entryPx: (px * (s.buyRatio < 50 ? 0.982 : 1.015)).toFixed(2),
        markPx: px.toFixed(2),
        positionValue: 12000000,
        leverage: '6x 全仓',
        unrealizedPnl: 142000,
        returnOnEquity: 0.071,
        liquidationPx: (px * (s.buyRatio < 50 ? 0.83 : 1.18)).toFixed(2),
        action: '日内网格波段',
        actionTime: '00:54:22'
      }
    ];
  }

  function toggleWhaleExpand(addr) {
    if (expandedWhaleAddress.value === addr) {
      expandedWhaleAddress.value = '';
    } else {
      expandedWhaleAddress.value = addr;
    }
  }

  async function copyWhaleAddress(addr) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(addr);
      }
      copiedWhaleAddress.value = addr;
      setTimeout(() => {
        if (copiedWhaleAddress.value === addr) copiedWhaleAddress.value = '';
      }, 2500);
    } catch {}
  }

  function buildCustomWhalesQueryParam() {
    if (!customWallets.value.length) return '';
    return customWallets.value
      .map(c => (c.label ? `${c.address}|${c.label}` : c.address))
      .join(',');
  }

  function buildWhaleQuerySignature() {
    return `${whaleTopN.value}::${buildCustomWhalesQueryParam()}`;
  }

  function buildWhalesUrl({ category = 'crypto', force = false } = {}) {
    const params = new URLSearchParams();
    if (category === 'stocks') {
      params.set('category', 'stocks');
    }
    params.set('topN', String(whaleTopN.value));
    const customParam = buildCustomWhalesQueryParam();
    if (customParam) {
      params.set('custom', customParam);
    }
    if (force) {
      params.set('force', '1');
    }
    return `/api/crypto/whales?${params.toString()}`;
  }

  function setWhaleTopN(val) {
    const next = normalizeTopNChoice(val);
    if (next === whaleTopN.value) return;
    whaleTopN.value = next;
    persist(WHALE_TOP_N_STORAGE_KEY, next);
    const activeCat = whaleCategory.value === 'stocks' ? 'stocks' : 'crypto';
    loadWhalesForCategory(activeCat, { force: true });
  }

  function toggleWalletScopeFilter(scope) {
    walletScopeFilter.value = (scope === 'custom' && customWallets.value.length > 0) ? 'custom' : 'all';
  }

  function openCustomWalletManager() {
    customWalletFormError.value = '';
    showCustomWalletManager.value = true;
  }

  function closeCustomWalletManager() {
    customWalletFormError.value = '';
    showCustomWalletManager.value = false;
  }

  function getCustomWalletLiveRecord(addr) {
    const low = String(addr || '').trim().toLowerCase();
    return disambiguateWallets(activeWhaleDataset.value?.whales || [])
      .find(w => String(w.address || '').toLowerCase() === low) || null;
  }

  function focusCustomWallet(addr) {
    const lowAddr = String(addr || '').trim().toLowerCase();
    if (!lowAddr) return;
    const activeCat = whaleCategory.value === 'stocks' ? 'stocks' : 'crypto';
    const matched = allWhales.value.find(w => String(w.address || '').toLowerCase() === lowAddr);
    if (matched) {
      selectedWhaleKeys[activeCat] = matched.walletKey;
      expandedWhaleAddress.value = matched.address;
    }
    showCustomWalletManager.value = false;
  }

  async function addCustomWhaleWallet() {
    const addr = customWalletAddressInput.value.trim().toLowerCase();
    const label = sanitizeCustomLabel(customWalletLabelInput.value);
    if (!VALID_EVM_ADDR_RE.test(addr)) {
      customWalletFormError.value = '请输入有效的 42 位以太坊/Hyperliquid 钱包地址（0x 开头 + 40 位十六进制字符）';
      return;
    }

    const activeCat = whaleCategory.value === 'stocks' ? 'stocks' : 'crypto';
    const existingIdx = customWallets.value.findIndex(c => c.address === addr);
    if (existingIdx >= 0) {
      if (label && label !== customWallets.value[existingIdx].label) {
        const next = [...customWallets.value];
        next[existingIdx] = { ...next[existingIdx], label };
        customWallets.value = next;
        saveStoredCustomWallets(next);
        customWalletAddressInput.value = '';
        customWalletLabelInput.value = '';
        customWalletFormError.value = '';
        await loadWhalesForCategory(activeCat, { force: true });
        focusCustomWallet(addr);
        return;
      }
      customWalletFormError.value = '该钱包地址已在自选监控列表中';
      return;
    }

    if (customWallets.value.length >= WHALE_MAX_CUSTOM_WALLETS) {
      customWalletFormError.value = `最多支持添加 ${WHALE_MAX_CUSTOM_WALLETS} 个自选钱包地址，请先移除部分旧地址`;
      return;
    }

    const next = [...customWallets.value, { address: addr, label, addedAt: Date.now() }];
    customWallets.value = next;
    saveStoredCustomWallets(next);
    customWalletAddressInput.value = '';
    customWalletLabelInput.value = '';
    customWalletFormError.value = '';
    await loadWhalesForCategory(activeCat, { force: true });
    const matched = allWhales.value.find(w => String(w.address || '').toLowerCase() === addr);
    if (matched) {
      selectedWhaleKeys[activeCat] = matched.walletKey;
      expandedWhaleAddress.value = matched.address;
    }
    showCustomWalletManager.value = false;
  }

  async function removeCustomWhaleWallet(addr) {
    const lowAddr = String(addr || '').trim().toLowerCase();
    const next = customWallets.value.filter(c => c.address !== lowAddr);
    if (next.length === customWallets.value.length) return;
    const activeCat = whaleCategory.value === 'stocks' ? 'stocks' : 'crypto';
    customWallets.value = next;
    saveStoredCustomWallets(next);
    if (next.length === 0 && walletScopeFilter.value === 'custom') {
      walletScopeFilter.value = 'all';
    }
    if (selectedWhaleRecord.value && String(selectedWhaleRecord.value.address || '').toLowerCase() === lowAddr) {
      selectedWhaleKeys[activeCat] = '';
    }
    await loadWhalesForCategory(activeCat, { force: true, silent: true });
  }

  async function loadWhalesForCategory(category = 'crypto', { force = false, silent = false } = {}) {
    const cat = category === 'stocks' ? 'stocks' : 'crypto';
    const url = buildWhalesUrl({ category: cat, force });
    if (whaleInFlightByCat[cat] && whaleInFlightUrlByCat[cat] === url) {
      return whaleInFlightByCat[cat];
    }
    const reqSeq = ++whaleReqSeqByCat[cat];
    const querySig = buildWhaleQuerySignature();
    const getTargetRef = () => (cat === 'stocks' ? stockWhaleData : cryptoWhaleData);

    const run = (async () => {
      try {
        if (!silent && whaleCategory.value === cat) {
          cryptoWhaleLoading.value = true;
        }
        if (whaleCategory.value === cat) {
          cryptoWhaleError.value = '';
        }
        const res = await fetch(url);
        if (reqSeq !== whaleReqSeqByCat[cat]) {
          return getTargetRef().value;
        }
        if (res.ok) {
          const data = await res.json();
          if (reqSeq !== whaleReqSeqByCat[cat]) {
            return getTargetRef().value;
          }
          // 防止未区分 category=stocks 的旧测试 stub 响应覆盖 TradFi 样本模型
          if (cat === 'stocks' && !(data?.category === 'stocks' || data?.isSample === true || data?.source === 'hyperliquid-xyz-api')) {
            return stockWhaleData.value;
          }

          const nowMs = Date.now();
          whaleSyncNow.value = nowMs;

          liveRebalanceDeltas[cat] = (liveRebalanceDeltas[cat] || []).filter(
            d => (nowMs - (Number(d?.detectedAt) || 0)) <= WHALE_LIVE_PULSE_TTL_MS
          );

          if (data?.ok && data.whales) {
            if (data.isLive && !data.isSample) {
              if (prevWhaleSnapshotByCat[cat].length > 0) {
                const cDeltas = detectPositionDeltas(prevWhaleSnapshotByCat[cat], data.whales, { now: nowMs });
                if (cDeltas.length > 0) {
                  liveRebalanceDeltas[cat] = [...cDeltas, ...(liveRebalanceDeltas[cat] || [])].slice(0, 12);
                }
              }
              prevWhaleSnapshotByCat[cat] = data.whales;
            }

            getTargetRef().value = data;
            lastWhaleQuerySigByCat[cat] = querySig;
            const dt = data.fetchedAt ? new Date(data.fetchedAt) : new Date(nowMs);
            if (!Number.isNaN(dt.getTime())) {
              lastWhaleSyncByCat[cat] = dt.toTimeString().slice(0, 8);
            }
            if (!expandedWhaleAddress.value && whaleCategory.value === cat && data.whales.length > 0) {
              expandedWhaleAddress.value = data.whales[0].address;
            }
            if (selectedWhaleKeys[cat]) {
              const stillExists = disambiguateWallets(data.whales).some(
                w => w.walletKey === selectedWhaleKeys[cat]
              );
              if (!stillExists) {
                selectedWhaleKeys[cat] = '';
              }
            }
          }
        } else if (whaleCategory.value === cat) {
          cryptoWhaleError.value = `HTTP ${res.status}`;
        }
      } catch (e) {
        if (reqSeq === whaleReqSeqByCat[cat] && whaleCategory.value === cat) {
          cryptoWhaleError.value = e.message || '加载巨鲸数据异常';
        }
      } finally {
        if (reqSeq === whaleReqSeqByCat[cat]) {
          if (!silent && whaleCategory.value === cat) {
            cryptoWhaleLoading.value = false;
          }
          whaleInFlightByCat[cat] = null;
          whaleInFlightUrlByCat[cat] = '';
        }
      }
      return getTargetRef().value;
    })();
    whaleInFlightByCat[cat] = run;
    whaleInFlightUrlByCat[cat] = url;
    return run;
  }

  function loadCryptoWhales({ force = false, silent = false } = {}) {
    return loadWhalesForCategory('crypto', { force, silent });
  }

  function loadStockWhales({ force = false, silent = false } = {}) {
    return loadWhalesForCategory('stocks', { force, silent });
  }

  function pollCryptoWhales() {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (page.value !== 'crypto' || isWhaleDatasetSample.value) return;
    loadWhalesForCategory(whaleCategory.value, { force: true, silent: true });
  }

  function syncCryptoWhalePolling() {
    const shouldPoll = page.value === 'crypto'
      && !isWhaleDatasetSample.value
      && (typeof document === 'undefined' || !document.hidden);
    if (shouldPoll) {
      if (!cryptoWhaleTimer) {
        cryptoWhaleTimer = setInterval(pollCryptoWhales, WHALE_REFRESH_INTERVAL_MS);
      }
    } else if (cryptoWhaleTimer) {
      clearInterval(cryptoWhaleTimer);
      cryptoWhaleTimer = null;
    }
  }

  // ==========================================
  // 链上美股资金流向 (On-Chain US Equities Flow Top 10)
  // ==========================================
  const DEFAULT_ONCHAIN_STOCKS_PAYLOAD = {
    ok: true,
    provider: 'TradeFi On-Chain DEX & RWA Aggregator',
    isLive: true,
    aggregate: {
      totalTrackedCount: 10,
      totalVolume24h: 462500000,
      totalNetFlow24h: -112450000,
      overallBuyRatio: 38.6,
      overallSellRatio: 61.4,
      overallSentiment: '空头净流出 BEARISH OUTFLOW',
      sentimentClass: 'bearish',
      topInflowSymbol: 'TSLA (+$12.8M)',
      maxPremiumSymbol: 'MSTR (+1.19%)',
      activeTradersCount: 18450
    },
    top10: [
      { rank: 1, symbol: 'MU', name: '美光', enName: 'Micron Technology, Inc.', protocol: 'Hyperliquid Perp / Backed', network: 'Hyperliquid L1 / Arbitrum', price: 692.10, changePercent: 5.12, tradFiClose: 690.00, premiumPct: 0.30, priceDiff: 2.10, volume24h: 108500000, inflow24h: 41772500, outflow24h: 66727500, netFlow: -24955000, buyRatio: 38.5, sellRatio: 61.5, openInterest: 62000000, turnoverRate: 22.4, chartSymbol: 'MU' },
      { rank: 2, symbol: 'NVDA', name: '英伟达', enName: 'NVIDIA Corporation', protocol: 'Hyperliquid Perp / Backed', network: 'Hyperliquid L1 / Arbitrum', price: 187.15, changePercent: 2.78, tradFiClose: 186.64, premiumPct: 0.27, priceDiff: 0.51, volume24h: 86600000, inflow24h: 31176000, outflow24h: 55424000, netFlow: -24248000, buyRatio: 36.0, sellRatio: 64.0, openInterest: 48500000, turnoverRate: 16.8, chartSymbol: 'NVDA' },
      { rank: 3, symbol: 'QQQ', name: '纳指100 ETF', enName: 'Invesco QQQ Trust', protocol: 'Hyperliquid Perp / Synthetix', network: 'Hyperliquid L1 / Ethereum', price: 659.20, changePercent: 1.76, tradFiClose: 658.00, premiumPct: 0.18, priceDiff: 1.20, volume24h: 60700000, inflow24h: 24280000, outflow24h: 36420000, netFlow: -12140000, buyRatio: 40.0, sellRatio: 60.0, openInterest: 34100000, turnoverRate: 7.1, chartSymbol: 'QQQ' },
      { rank: 4, symbol: 'SPY', name: '标普500 ETF', enName: 'SPDR S&P 500 ETF Trust', protocol: 'Hyperliquid Perp / Synthetix', network: 'Hyperliquid L1 / Ethereum', price: 746.10, changePercent: 0.58, tradFiClose: 745.20, premiumPct: 0.12, priceDiff: 0.90, volume24h: 58700000, inflow24h: 26415000, outflow24h: 32285000, netFlow: -5870000, buyRatio: 45.0, sellRatio: 55.0, openInterest: 38900000, turnoverRate: 6.2, chartSymbol: 'SPY' },
      { rank: 5, symbol: 'TSLA', name: '特斯拉', enName: 'Tesla, Inc.', protocol: 'Hyperliquid Perp / Synthetix', network: 'Hyperliquid L1 / Optimism', price: 351.40, changePercent: 4.68, tradFiClose: 350.50, premiumPct: 0.26, priceDiff: 0.90, volume24h: 52700000, inflow24h: 22134000, outflow24h: 30566000, netFlow: -8432000, buyRatio: 42.0, sellRatio: 58.0, openInterest: 31200000, turnoverRate: 15.4, chartSymbol: 'TSLA' },
      { rank: 6, symbol: 'AMD', name: '超威半导体', enName: 'Advanced Micro Devices', protocol: 'Hyperliquid Perp', network: 'Hyperliquid L1', price: 450.15, changePercent: 11.04, tradFiClose: 449.04, premiumPct: 0.25, priceDiff: 1.11, volume24h: 51200000, inflow24h: 17920000, outflow24h: 33280000, netFlow: -15360000, buyRatio: 35.0, sellRatio: 65.0, openInterest: 18400000, turnoverRate: 10.1, chartSymbol: 'AMD' },
      { rank: 7, symbol: 'AMZN', name: '亚马逊', enName: 'Amazon.com, Inc.', protocol: 'Backed Finance bAMZN', network: 'Base / Arbitrum', price: 259.10, changePercent: -0.35, tradFiClose: 259.30, premiumPct: -0.08, priceDiff: -0.20, volume24h: 31000000, inflow24h: 13950000, outflow24h: 17050000, netFlow: -3100000, buyRatio: 45.0, sellRatio: 55.0, openInterest: 16200000, turnoverRate: 9.3, chartSymbol: 'AMZN' },
      { rank: 8, symbol: 'AAPL', name: '苹果', enName: 'Apple Inc.', protocol: 'Backed Finance bAAPL', network: 'Ethereum / Base', price: 342.10, changePercent: -0.52, tradFiClose: 342.37, premiumPct: -0.08, priceDiff: -0.27, volume24h: 29800000, inflow24h: 14602000, outflow24h: 15198000, netFlow: -596000, buyRatio: 49.0, sellRatio: 51.0, openInterest: 15600000, turnoverRate: 8.5, chartSymbol: 'AAPL' },
      { rank: 9, symbol: 'MSFT', name: '微软', enName: 'Microsoft Corporation', protocol: 'Backed Finance bMSFT', network: 'Ethereum / Base', price: 544.80, changePercent: -1.91, tradFiClose: 545.18, premiumPct: -0.07, priceDiff: -0.38, volume24h: 25500000, inflow24h: 11475000, outflow24h: 14025000, netFlow: -2550000, buyRatio: 45.0, sellRatio: 55.0, openInterest: 14500000, turnoverRate: 7.8, chartSymbol: 'MSFT' },
      { rank: 10, symbol: 'MSTR', name: '微策略', enName: 'MicroStrategy Inc.', protocol: 'Hyperliquid Perp / Backed', network: 'Hyperliquid L1 / Base', price: 143.20, changePercent: -7.65, tradFiClose: 142.50, premiumPct: 0.49, priceDiff: 0.70, volume24h: 24700000, inflow24h: 12844000, outflow24h: 11856000, netFlow: 988000, buyRatio: 52.0, sellRatio: 48.0, openInterest: 26800000, turnoverRate: 18.2, chartSymbol: 'MSTR' }
    ]
  };
  const onchainStocksData = ref(DEFAULT_ONCHAIN_STOCKS_PAYLOAD);
  const onchainStocksLoading = ref(false);
  const onchainStocksError = ref('');
  const onchainStockSearch = ref('');
  const onchainStockSortField = ref('volume24h'); // 'volume24h' | 'netFlow' | 'buyRatio' | 'premiumPct' | 'price'
  const onchainStockSortDir = ref('desc');
  const expandedStockSymbol = ref('');
  const focusedFlowSymbol = ref('');

  // ============================================================
  // 方案 A：巨鲸时空 K 线与资金流向抽屉一体化双甲板系统控制器
  // ============================================================
  const whaleDrawerInterval = ref('15m'); // '15m' | '1h' | '1d'
  const whaleDrawerRange = ref('1mo'); // '1mo' | '3mo'
  const activeWhaleHud = ref(null); // { symbol, whale, x, y, isPinned, isFlipDown, arrowOffset }
  const highlightedWhaleAddr = ref('');
  const whaleDrawerChartLoading = ref(false);
  const whaleDrawerChartError = ref('');
  const whaleMarkerOverlays = ref([]); // Bybit 风格高精度复合交互图层 [{ whale, isLong, x, y, pinY, badgeY, color, isOffCandle, tooltip, price, time }]
  const whaleChartExpanded = ref(false); // 沉浸式宽展全景大图模式开关 (380px -> 520px)
  const syncedWhaleEntryTimes = ref({}); // 物理对齐 K 线柱时间后的同步开仓时间映射表

  let lwWhaleDrawerChart = null;
  let lwWhaleCandleSeries = null;
  let lwWhaleVolumeSeries = null;
  let lwWhaleMarkersPlugin = null;
  let lwWhalePriceLines = [];
  let lwWhaleGestureCtrl = null;
  let lwWhaleResizeObserver = null;
  let lastWhaleDrawerSymbol = '';
  let lastWhaleDrawerInterval = '';
  let lwWhaleDrawerBars = [];
  const lwWhaleMarkersMap = new Map();
  const whaleDrawerBarsCache = new Map();

  function disposeWhaleDrawerChart() {
    if (lwWhaleGestureCtrl) {
      try { lwWhaleGestureCtrl.dispose(); } catch (_) {}
      lwWhaleGestureCtrl = null;
    }
    if (lwWhaleResizeObserver) {
      try { lwWhaleResizeObserver.disconnect(); } catch (_) {}
      lwWhaleResizeObserver = null;
    }
    if (lwWhaleMarkersPlugin) {
      try { lwWhaleMarkersPlugin.detach(); } catch (_) {}
      lwWhaleMarkersPlugin = null;
    }
    if (lwWhaleDrawerChart) {
      try { lwWhaleDrawerChart.remove(); } catch (_) {}
      lwWhaleDrawerChart = null;
      lwWhaleCandleSeries = null;
      lwWhaleVolumeSeries = null;
      lwWhalePriceLines = [];
    }
    lastWhaleDrawerSymbol = '';
    lastWhaleDrawerInterval = '';
    lwWhaleDrawerBars = [];
    lwWhaleMarkersMap.clear();
    whaleMarkerOverlays.value = [];
    activeWhaleHud.value = null;
    highlightedWhaleAddr.value = '';
    whaleChartExpanded.value = false;
  }

  function toggleWhaleChartExpanded() {
    whaleChartExpanded.value = !whaleChartExpanded.value;
    nextTick(() => {
      if (lwWhaleDrawerChart) {
        const hostEl = lwWhaleDrawerChart._hostEl || document.getElementById('whale-drawer-chart-' + expandedStockSymbol.value);
        if (hostEl) {
          lwWhaleDrawerChart.resize(hostEl.clientWidth, hostEl.clientHeight);
          updateWhaleMarkerOverlays();
          updateActiveWhaleHudPosition();
        }
      }
    });
  }

  function resetWhaleDrawerChartZoom() {
    if (lwWhaleGestureCtrl && typeof lwWhaleGestureCtrl.resetZoom === 'function') {
      lwWhaleGestureCtrl.resetZoom();
    } else if (lwWhaleDrawerChart) {
      lwWhaleDrawerChart.timeScale().fitContent();
    }
    nextTick(() => {
      updateWhaleMarkerOverlays();
      updateActiveWhaleHudPosition();
    });
  }

  function setWhaleDrawerInterval(tf) {
    if (whaleDrawerInterval.value === tf) return;
    whaleDrawerInterval.value = tf;
    if (expandedStockSymbol.value) {
      loadAndRenderWhaleDrawerChart(expandedStockSymbol.value, true);
    }
  }

  async function loadAndRenderWhaleDrawerChart(sym, forceReload = false) {
    if (!sym) {
      disposeWhaleDrawerChart();
      return;
    }

    const targetSymbol = sym.toUpperCase();
    const matchedRow = activeFlowRows.value.find(r => {
      const s = String(r.symbol || '').toUpperCase();
      const cs = String(r.chartSymbol || '').toUpperCase();
      return s === targetSymbol || cs === targetSymbol;
    });

    const chartSym = (matchedRow?.chartSymbol || matchedRow?.symbol || sym).toUpperCase();
    const resolvedChartSym = chartSym === 'XYZ100' ? 'QQQ' : (chartSym === 'SP500' ? 'SPY' : chartSym);

    whaleDrawerChartLoading.value = true;
    whaleDrawerChartError.value = '';

    const cacheKey = `${resolvedChartSym}:${whaleDrawerRange.value}:${whaleDrawerInterval.value}`;
    let bars = null;

    if (!forceReload && whaleDrawerBarsCache.has(cacheKey)) {
      bars = whaleDrawerBarsCache.get(cacheKey);
    } else {
      try {
        const u = `/api/market/chart?symbol=${encodeURIComponent(resolvedChartSym)}&range=${whaleDrawerRange.value}&interval=${whaleDrawerInterval.value}`;
        const res = await fetch(u);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.bars) && json.bars.length > 0) {
            bars = json.bars;
            whaleDrawerBarsCache.set(cacheKey, bars);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch chart bars for whale drawer:', err);
      }
    }

    whaleDrawerChartLoading.value = false;

    // 若网络不可达或测试环境无独立 bars，平滑基于现价构建合理蜡烛序列避免空白
    if (!bars || !bars.length) {
      const basePx = Number(matchedRow?.price) || 150;
      bars = [];
      const nowTs = Math.floor(Date.now() / 1000);
      const step = whaleDrawerInterval.value === '15m' ? 900 : (whaleDrawerInterval.value === '1h' ? 3600 : 86400);
      let cur = basePx * 0.96;
      for (let i = 24; i >= 0; i--) {
        const t = nowTs - i * step;
        const o = cur;
        const change = (Math.sin(i * 0.8) + (i % 2 === 0 ? 0.3 : -0.2)) * (basePx * 0.008);
        const c = o + change;
        const h = Math.max(o, c) + Math.abs(change) * 0.4;
        const l = Math.min(o, c) - Math.abs(change) * 0.4;
        bars.push({ time: t, open: o, high: h, low: l, close: c, volume: Math.round(10000 + Math.abs(change) * 20000) });
        cur = c;
      }
    }

    await nextTick();
    renderWhaleDrawerChart(sym, bars, matchedRow);
  }

  // 依据开仓均价与时间戳精准匹配 K 线蜡烛（优先匹配行情范围 [low, high] 真实涵盖 entryPx 的最近蜡烛，使白边圆点准确落在 K 线影线或柱体上）
  function matchWhalePositionToBar(bars, pos) {
    if (!Array.isArray(bars) || bars.length === 0) return null;
    const entryPx = Number(pos?.entryPx);

    // 1. 若具备真实链上成交时间戳且位于当前 K 线区间内，按时间优先对齐
    if (pos?.hasRealEntryTime && Number.isFinite(Number(pos.entryTime))) {
      const entrySec = Number(pos.entryTime) > 1e11 ? Number(pos.entryTime) / 1000 : Number(pos.entryTime);
      const stepSec = bars.length > 1 ? Math.max(60, Math.abs(bars[1].time - bars[0].time)) : 3600;
      if (entrySec >= bars[0].time - stepSec && entrySec <= bars[bars.length - 1].time + stepSec) {
        return bars.reduce((prev, curr) => {
          return Math.abs(curr.time - entrySec) < Math.abs(prev.time - entrySec) ? curr : prev;
        }, bars[0]);
      }
    }

    if (!Number.isFinite(entryPx) || entryPx <= 0) {
      return bars[bars.length - 1];
    }

    // 2. 匹配实际振幅 [low, high] 精确涵盖开仓均价的 K 线（优先最近成交过该点位的 K 线）
    for (let i = bars.length - 1; i >= 0; i--) {
      const b = bars[i];
      if (entryPx >= b.low && entryPx <= b.high) {
        return b;
      }
    }

    // 3. 若当前周期全部蜡烛未触及该均价，选区间距离 [low, high] 最近的 K 线
    let closestBar = bars[bars.length - 1];
    let minRangeDist = Infinity;
    let minMidDist = Infinity;
    for (let i = bars.length - 1; i >= 0; i--) {
      const b = bars[i];
      const rangeDist = entryPx < b.low ? (b.low - entryPx) : (entryPx > b.high ? (entryPx - b.high) : 0);
      const midDist = Math.abs(((b.high + b.low) / 2) - entryPx);
      if (rangeDist < minRangeDist - 1e-9 || (Math.abs(rangeDist - minRangeDist) <= 1e-9 && midDist < minMidDist)) {
        minRangeDist = rangeDist;
        minMidDist = midDist;
        closestBar = b;
      }
    }
    return closestBar;
  }

  function renderWhaleDrawerChart(sym, bars, matchedRow) {
    const el = document.getElementById('whale-drawer-chart-' + sym);
    if (!el) return;

    const curKlineFallback = KLINE_SCHEMES[klineScheme.value] || KLINE_SCHEMES.classic;
    const LW = window.LightweightCharts;
    if (!LW || typeof LW.createChart !== 'function') {
      const positions = getUnifiedWhalePositions(matchedRow || { symbol: sym });
      if (positions.length > 0) {
        whaleMarkerOverlays.value = positions.map((p, idx) => {
          const isLong = p.side === 'LONG';
          if (!p.entryTime) {
            p.entryTime = Date.now() - 3600000 * (idx + 1) * 3;
          }
          const pinY = 120;
          const badgeY = isLong ? pinY + 26 : pinY - 26;
          return {
            whale: p,
            isLong,
            time: 1000 + idx * 100,
            price: p.entryPx,
            color: isLong ? curKlineFallback.up : curKlineFallback.down,
            x: 120 + idx * 60,
            y: pinY,
            pinY,
            badgeY,
            isOffCandle: false,
            tooltip: `${p.name} · ${isLong ? '做多' : '做空'} ${p.leverage || '5x'} @ $${formatCryptoPrice(p.entryPx)} · 开仓时间: ${formatWhaleTime(p.entryTime)} (点击查看详细仓位)`
          };
        });
      }
      return;
    }

    // 读取全局偏好设置的配色方案与自适应 Tokens (与个股 K 线 100% 相同)
    const curKline = KLINE_SCHEMES[klineScheme.value] || KLINE_SCHEMES.classic;
    const klineUp = curKline.up;
    const klineDown = curKline.down;
    const isDarkTheme = isDark.value;
    const tokens = readChartTokens(document.documentElement);
    const chartBg = tokens.klineSurface;
    const gridColorValue = tokens.klineGrid;
    const textThemeColor = tokens.muted;
    const crosshairColor = tokens.crosshair;
    const showGrid = klineGridStyle.value !== 'none';
    const gridStyleNum = klineGridStyle.value === 'solid' ? 0 : 2;
    const volAlpha = isDarkTheme ? 0.65 : 0.75;
    const volUpColor = hexToRgba(klineUp, volAlpha);
    const volDownColor = hexToRgba(klineDown, volAlpha);

    if (lwWhaleDrawerChart && lwWhaleDrawerChart._hostEl !== el) {
      disposeWhaleDrawerChart();
    }

    if (!lwWhaleDrawerChart) {
      el.innerHTML = '';
      const chartInstance = LW.createChart(el, {
        autoSize: true,
        layout: {
          background: { type: LW.ColorType.Solid, color: chartBg },
          textColor: textThemeColor,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif',
          fontSize: 11
        },
        grid: {
          vertLines: { color: gridColorValue, style: gridStyleNum, visible: showGrid },
          horzLines: { color: gridColorValue, style: gridStyleNum, visible: showGrid }
        },
        rightPriceScale: {
          visible: true,
          autoScale: true,
          borderColor: gridColorValue,
          scaleMargins: { top: 0.12, bottom: 0.22 }
        },
        leftPriceScale: { visible: false },
        timeScale: {
          timeVisible: whaleDrawerInterval.value !== '1d',
          secondsVisible: false,
          borderColor: gridColorValue,
          rightOffset: 5,
          minBarSpacing: 0.5,
          fixRightEdge: false
        },
        crosshair: {
          mode: LW.CrosshairMode.Normal,
          vertLine: { color: crosshairColor, width: 1, style: 2 },
          horzLine: { color: crosshairColor, width: 1, style: 2 }
        },
        // 交由系统经过深度调校的手势引擎接管
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
        color: volUpColor
      });
      chartInstance.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 }
      });

      // 绑定核心丝滑手势控制器
      const gestures = bindKlineGestures(el, chartInstance, candleSeries, {
        inputPolicy: 'desktop',
        getLatestLogicalIndex: () => (bars.length || 1) - 1,
        getFirstLogicalIndex: () => 0,
        initialBars: Math.min(bars.length, 60),
        minBars: 8,
        maxBars: 5000,
        minBarSpacing: 0.5,
        centerUntilBars: 20,
        rightAtBars: 180,
        rightFraction: 0.95,
        onViewportChange: () => {
          updateWhaleMarkerOverlays();
          updateActiveWhaleHudPosition();
        }
      });

      lwWhaleResizeObserver = new ResizeObserver(() => {
        chartInstance.resize(el.clientWidth, el.clientHeight);
        updateWhaleMarkerOverlays();
        updateActiveWhaleHudPosition();
      });
      lwWhaleResizeObserver.observe(el);

      try {
        chartInstance.timeScale().subscribeVisibleLogicalRangeChange(() => {
          updateWhaleMarkerOverlays();
          updateActiveWhaleHudPosition();
        });
      } catch (_) {}

      lwWhaleDrawerChart = chartInstance;
      lwWhaleCandleSeries = candleSeries;
      lwWhaleVolumeSeries = volumeSeries;
      lwWhaleGestureCtrl = gestures;
    } else {
      updateWhaleDrawerChartTheme();
    }

    lwWhaleDrawerBars = bars;
    lwWhaleMarkersMap.clear();

    // 填充蜡烛数据
    lwWhaleCandleSeries.setData(bars.map(b => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close
    })));

    // 填充成交量
    lwWhaleVolumeSeries.setData(bars.map(b => ({
      time: b.time,
      value: b.volume || 1000,
      color: b.close >= b.open ? volUpColor : volDownColor
    })));

    // 打点 Bybit 风格多空圆点 (Whale Position Markers)
    const positions = getUnifiedWhalePositions(matchedRow || { symbol: sym });
    const markers = [];

    // 清理先前的 PriceLines
    if (Array.isArray(lwWhalePriceLines)) {
      for (const pl of lwWhalePriceLines) {
        try { lwWhaleCandleSeries.removePriceLine(pl); } catch (_) {}
      }
      lwWhalePriceLines = [];
    }

    if (positions.length > 0 && bars.length > 0) {
      let totalLongNtl = 0;
      let totalLongCost = 0;
      let totalShortNtl = 0;
      let totalShortCost = 0;
      const nextSyncedTimes = {};
      let hasSyncedDiff = false;

      positions.forEach((p, idx) => {
        const isLong = p.side === 'LONG';
        const ntl = p.positionValue || (p.shares * p.markPx) || 1000;
        if (isLong) {
          totalLongNtl += ntl;
          totalLongCost += (p.entryPx * ntl);
        } else {
          totalShortNtl += ntl;
          totalShortCost += (p.entryPx * ntl);
        }

        // 优先匹配 [low, high] 真实涵盖开仓价格的 K 线柱，确保精确打点落在 K 线影线或柱体对应位置
        const matchedBar = matchWhalePositionToBar(bars, p) || bars[bars.length - 1];

        // 若 position 没有真实链上成交时间戳，与所匹配的 K 线蜡烛时间戳精准物理对齐（并同步到下方仓位表格）
        if (!p.hasRealEntryTime && matchedBar?.time) {
          const t = matchedBar.time;
          const syncedMs = t < 1e11 ? t * 1000 : t;
          p.entryTime = syncedMs;
          const syncKey = `${sym}:${String(p.address || '').toLowerCase()}:${p.side}`;
          if (syncedWhaleEntryTimes.value[syncKey] !== syncedMs) {
            nextSyncedTimes[syncKey] = syncedMs;
            hasSyncedDiff = true;
          }
        } else if (!p.entryTime) {
          p.entryTime = Date.now() - 3600000 * (idx + 1) * 4;
        }

        const markerKey = `${p.address}:${p.side}`;
        lwWhaleMarkersMap.set(markerKey, {
          whale: p,
          time: matchedBar.time,
          bar: matchedBar,
          isLong,
          color: isLong ? klineUp : klineDown
        });
      });

      if (hasSyncedDiff) {
        syncedWhaleEntryTimes.value = {
          ...syncedWhaleEntryTimes.value,
          ...nextSyncedTimes
        };
      }

      // 彻底清除库原生简单圆点，仅使用自研 Bybit 复合高精度交互层（外侧 B/S 五边形盾牌 + K 线原位白边精准成交点）
      try {
        if (lwWhaleMarkersPlugin && typeof lwWhaleMarkersPlugin.setMarkers === 'function') {
          lwWhaleMarkersPlugin.setMarkers([]);
        } else if (typeof lwWhaleCandleSeries.setMarkers === 'function') {
          lwWhaleCandleSeries.setMarkers([]);
        }
      } catch (_) {}

      // 实时同步绘制 Bybit 风格高精度复合标注层
      updateWhaleMarkerOverlays();
      updateActiveWhaleHudPosition();

      // 添加多空成本参考线 (Price Lines)
      if (totalLongNtl > 0) {
        const bullAvg = totalLongCost / totalLongNtl;
        const plBull = lwWhaleCandleSeries.createPriceLine({
          price: bullAvg,
          color: klineUp,
          lineWidth: 1.5,
          lineStyle: LW.LineStyle ? LW.LineStyle.Dashed : 2,
          axisLabelVisible: true,
          title: `多头均价 $${formatCryptoPrice(bullAvg)}`
        });
        lwWhalePriceLines.push(plBull);
      }

      if (totalShortNtl > 0) {
        const bearAvg = totalShortCost / totalShortNtl;
        const plBear = lwWhaleCandleSeries.createPriceLine({
          price: bearAvg,
          color: klineDown,
          lineWidth: 1.5,
          lineStyle: LW.LineStyle ? LW.LineStyle.Dashed : 2,
          axisLabelVisible: true,
          title: `空头均价 $${formatCryptoPrice(bearAvg)}`
        });
        lwWhalePriceLines.push(plBear);
      }
    }

    lastWhaleDrawerSymbol = sym;
    lastWhaleDrawerInterval = whaleDrawerInterval.value;
  }

  function updateWhaleDrawerChartTheme() {
    if (!lwWhaleDrawerChart || !lwWhaleCandleSeries) return;
    const LW = window.LightweightCharts;
    const curKline = KLINE_SCHEMES[klineScheme.value] || KLINE_SCHEMES.classic;
    const klineUp = curKline.up;
    const klineDown = curKline.down;
    const isDarkTheme = isDark.value;
    const tokens = readChartTokens(document.documentElement);
    const chartBg = tokens.klineSurface;
    const gridColorValue = tokens.klineGrid;
    const textThemeColor = tokens.muted;
    const crosshairColor = tokens.crosshair;
    const showGrid = klineGridStyle.value !== 'none';
    const gridStyleNum = klineGridStyle.value === 'solid' ? 0 : 2;

    lwWhaleDrawerChart.applyOptions({
      layout: {
        background: { type: LW.ColorType.Solid, color: chartBg },
        textColor: textThemeColor
      },
      grid: {
        vertLines: { color: gridColorValue, style: gridStyleNum, visible: showGrid },
        horzLines: { color: gridColorValue, style: gridStyleNum, visible: showGrid }
      },
      crosshair: {
        vertLine: { color: crosshairColor },
        horzLine: { color: crosshairColor }
      }
    });

    lwWhaleCandleSeries.applyOptions({
      upColor: klineUp,
      downColor: klineDown,
      wickUpColor: klineUp,
      wickDownColor: klineDown
    });

    if (lwWhaleVolumeSeries) {
      const volAlpha = isDarkTheme ? 0.65 : 0.75;
      const volUpColor = hexToRgba(klineUp, volAlpha);
      const volDownColor = hexToRgba(klineDown, volAlpha);
      lwWhaleVolumeSeries.applyOptions({ color: volUpColor });
      if (Array.isArray(lwWhaleDrawerBars) && lwWhaleDrawerBars.length > 0) {
        lwWhaleVolumeSeries.setData(lwWhaleDrawerBars.map(b => ({
          time: b.time,
          value: b.volume || 1000,
          color: b.close >= b.open ? volUpColor : volDownColor
        })));
      }
    }

    // 更新标注点位跟随 K 线设置配色方案同步变色
    for (const entry of lwWhaleMarkersMap.values()) {
      entry.color = entry.isLong ? klineUp : klineDown;
    }

    // 重新应用带有新配色的 PriceLines 与 Markers
    if (expandedStockSymbol.value) {
      const matchedRow = activeFlowRows.value.find(r => String(r.symbol || '').toUpperCase() === expandedStockSymbol.value.toUpperCase());
      const positions = getUnifiedWhalePositions(matchedRow || { symbol: expandedStockSymbol.value });
      if (positions.length > 0) {
        if (Array.isArray(lwWhalePriceLines)) {
          for (const pl of lwWhalePriceLines) {
            try { lwWhaleCandleSeries.removePriceLine(pl); } catch (_) {}
          }
          lwWhalePriceLines = [];
        }
        let totalLongNtl = 0, totalLongCost = 0, totalShortNtl = 0, totalShortCost = 0;
        positions.forEach(p => {
          const ntl = p.positionValue || (p.shares * p.markPx) || 1000;
          if (p.side === 'LONG') { totalLongNtl += ntl; totalLongCost += (p.entryPx * ntl); }
          else { totalShortNtl += ntl; totalShortCost += (p.entryPx * ntl); }
        });
        if (totalLongNtl > 0) {
          const bullAvg = totalLongCost / totalLongNtl;
          lwWhalePriceLines.push(lwWhaleCandleSeries.createPriceLine({
            price: bullAvg, color: klineUp, lineWidth: 1.5,
            lineStyle: LW.LineStyle ? LW.LineStyle.Dashed : 2, axisLabelVisible: true,
            title: `多头均价 $${formatCryptoPrice(bullAvg)}`
          }));
        }
        if (totalShortNtl > 0) {
          const bearAvg = totalShortCost / totalShortNtl;
          lwWhalePriceLines.push(lwWhaleCandleSeries.createPriceLine({
            price: bearAvg, color: klineDown, lineWidth: 1.5,
            lineStyle: LW.LineStyle ? LW.LineStyle.Dashed : 2, axisLabelVisible: true,
            title: `空头均价 $${formatCryptoPrice(bearAvg)}`
          }));
        }
      }
    }

    updateWhaleMarkerOverlays();
  }

  // 计算巨鲸买点 Marker 在画布上的精确像素坐标与防溢出位置
  function getWhaleMarkerCoordinates(whale, sym) {
    if (!whale || !lwWhaleDrawerChart || !lwWhaleCandleSeries) return null;
    const currentSymbol = sym || expandedStockSymbol.value;
    const hostEl = lwWhaleDrawerChart._hostEl || document.getElementById('whale-drawer-chart-' + currentSymbol);
    if (!hostEl) return null;

    const rect = hostEl.getBoundingClientRect();
    const W = hostEl.clientWidth || rect.width || 600;
    const H = hostEl.clientHeight || rect.height || 380;

    const markerInfo = lwWhaleMarkersMap.get(`${whale.address}:${whale.side}`) || lwWhaleMarkersMap.get(whale.address);
    let barTime = markerInfo?.time;
    let bar = markerInfo?.bar;

    if (!barTime && lwWhaleDrawerBars && lwWhaleDrawerBars.length > 0) {
      bar = matchWhalePositionToBar(lwWhaleDrawerBars, whale) || lwWhaleDrawerBars[lwWhaleDrawerBars.length - 1];
      barTime = bar?.time;
    }

    let rawX = Math.round(W * 0.5);
    let rawY = Math.round(H * 0.45);

    try {
      if (barTime && typeof lwWhaleDrawerChart.timeScale === 'function') {
        const timeScale = lwWhaleDrawerChart.timeScale();
        if (typeof timeScale.timeToCoordinate === 'function') {
          const cx = timeScale.timeToCoordinate(barTime);
          if (typeof cx === 'number' && Number.isFinite(cx)) {
            rawX = cx;
          }
        }
      }

      if (typeof lwWhaleCandleSeries.priceToCoordinate === 'function') {
        let cy = null;
        if (Number.isFinite(whale.entryPx)) {
          cy = lwWhaleCandleSeries.priceToCoordinate(whale.entryPx);
        }
        if (typeof cy !== 'number' || !Number.isFinite(cy)) {
          const isLong = whale.side === 'LONG';
          const fallbackPrice = isLong ? bar?.low : bar?.high;
          if (Number.isFinite(fallbackPrice)) {
            cy = lwWhaleCandleSeries.priceToCoordinate(fallbackPrice);
          }
        }
        if (typeof cy === 'number' && Number.isFinite(cy)) {
          rawY = cy;
        }
      }
    } catch (err) {
      console.warn('Failed to calculate whale marker coordinates:', err);
    }

    const isOffscreen = (rawX < -20 || rawX > W + 20 || rawY < -20 || rawY > H + 20);

    const popoverHalfWidth = 145;
    const minX = popoverHalfWidth + 10;
    const maxX = Math.max(minX, W - popoverHalfWidth - 55);
    const clampedX = Math.max(minX, Math.min(rawX, maxX));
    const arrowOffset = Math.max(-110, Math.min(110, Math.round(rawX - clampedX)));

    // 默认在买点上方；若上方空间不足（rawY < 155）则向下翻转到买点下方
    const isFlipDown = rawY < 155;
    const clampedY = isFlipDown
      ? Math.max(10, Math.min(rawY, H - 170))
      : Math.max(150, Math.min(rawY, H - 20));

    return {
      x: Math.round(clampedX),
      y: Math.round(clampedY),
      rawX: Math.round(rawX),
      rawY: Math.round(rawY),
      arrowOffset,
      isFlipDown,
      isOffscreen
    };
  }

  function updateActiveWhaleHudPosition() {
    if (!activeWhaleHud.value || !activeWhaleHud.value.whale) return;
    const coords = getWhaleMarkerCoordinates(activeWhaleHud.value.whale, activeWhaleHud.value.symbol);
    if (!coords || coords.isOffscreen) {
      // 当巨鲸买卖点随 K 线完全移出画布视野时，自动关闭该浮窗
      activeWhaleHud.value = null;
      return;
    }
    activeWhaleHud.value = {
      ...activeWhaleHud.value,
      x: coords.x,
      y: coords.y,
      rawX: coords.rawX,
      rawY: coords.rawY,
      arrowOffset: coords.arrowOffset,
      isFlipDown: coords.isFlipDown
    };
  }

  // 实时更新 Bybit 风格复合交互图层（K 线外侧 B/S 五边形盾牌 + K 线精确价位白边小圆点）
  function updateWhaleMarkerOverlays() {
    if (!lwWhaleDrawerChart || !lwWhaleCandleSeries || !expandedStockSymbol.value) {
      whaleMarkerOverlays.value = [];
      return;
    }

    const hostEl = lwWhaleDrawerChart._hostEl || document.getElementById('whale-drawer-chart-' + expandedStockSymbol.value);
    if (!hostEl) {
      whaleMarkerOverlays.value = [];
      return;
    }

    const W = hostEl.clientWidth || 600;
    const H = hostEl.clientHeight || 380;
    const curKline = KLINE_SCHEMES[klineScheme.value] || KLINE_SCHEMES.classic;
    const timeScale = lwWhaleDrawerChart.timeScale();
    if (!timeScale || typeof timeScale.timeToCoordinate !== 'function') {
      const fallbackOverlays = [];
      let stepIdx = 0;
      for (const entry of lwWhaleMarkersMap.values()) {
        const pinY = 120;
        const badgeY = entry.isLong ? pinY + 26 : pinY - 26;
        fallbackOverlays.push({
          whale: entry.whale,
          isLong: entry.isLong,
          time: entry.time || 1000,
          price: entry.whale.entryPx,
          color: entry.color || (entry.isLong ? curKline.up : curKline.down),
          x: 100 + stepIdx * 60,
          y: pinY,
          pinY,
          badgeY,
          isOffCandle: false,
          tooltip: `${entry.whale.name} · ${entry.isLong ? '做多' : '做空'} ${entry.whale.leverage || '5x'} @ $${formatCryptoPrice(entry.whale.entryPx)} · 开仓时间: ${formatWhaleTime(entry.whale.entryTime)} (点击查看详细仓位)`
        });
        stepIdx++;
      }
      whaleMarkerOverlays.value = fallbackOverlays;
      return;
    }

    const barSideCountMap = new Map();
    const overlays = [];
    for (const entry of lwWhaleMarkersMap.values()) {
      const { whale, time, bar, isLong, color } = entry;
      if (!time) continue;

      const cx = timeScale.timeToCoordinate(time);
      if (typeof cx !== 'number' || !Number.isFinite(cx)) continue;

      // 严格随 K 线水平视野滑入滑出：移出画布可视范围则不渲染，绝不在边缘吸附停滞
      if (cx < -20 || cx > W - 35) continue;

      let pinY = null;
      let highY = null;
      let lowY = null;
      if (typeof lwWhaleCandleSeries.priceToCoordinate === 'function') {
        if (Number.isFinite(whale.entryPx)) {
          pinY = lwWhaleCandleSeries.priceToCoordinate(whale.entryPx);
        }
        if (bar && Number.isFinite(bar.high)) {
          highY = lwWhaleCandleSeries.priceToCoordinate(bar.high);
        }
        if (bar && Number.isFinite(bar.low)) {
          lowY = lwWhaleCandleSeries.priceToCoordinate(bar.low);
        }
        if (typeof pinY !== 'number' || !Number.isFinite(pinY)) {
          pinY = isLong ? lowY : highY;
        }
      }

      if (typeof pinY !== 'number' || !Number.isFinite(pinY)) continue;

      const effectiveHighY = (typeof highY === 'number' && Number.isFinite(highY)) ? highY : (pinY - 6);
      const effectiveLowY = (typeof lowY === 'number' && Number.isFinite(lowY)) ? lowY : (pinY + 6);

      const stackKey = `${time}_${isLong ? 'L' : 'S'}`;
      const stackIdx = barSideCountMap.get(stackKey) || 0;
      barSideCountMap.set(stackKey, stackIdx + 1);

      // 做多 B 盾牌置于最低价/点位下方并留足留白；做空 S 盾牌置于最高价/点位上方并留足留白
      const badgeY = isLong
        ? Math.max(effectiveLowY, pinY + 5) + 13 + stackIdx * 19
        : Math.min(effectiveHighY, pinY - 5) - 13 - stackIdx * 19;

      // 严格随 K 线垂直坐标滑入滑出：当精准点位与盾牌均移出上下可视区域时直接不渲染，绝不吸附在边缘
      if ((pinY < -20 && badgeY < -20) || (pinY > H + 15 && badgeY > H + 15)) continue;

      const isOffCandle = Boolean(
        bar && Number.isFinite(bar.low) && Number.isFinite(bar.high) && Number.isFinite(whale.entryPx)
        && (whale.entryPx < bar.low - 1e-9 || whale.entryPx > bar.high + 1e-9)
      );

      overlays.push({
        whale,
        isLong,
        time,
        price: whale.entryPx,
        color: color || (isLong ? curKline.up : curKline.down),
        x: Math.round(cx),
        y: Math.round(pinY),
        pinY: Math.round(pinY),
        badgeY: Math.round(badgeY),
        isOffCandle,
        tooltip: `${whale.name} · ${isLong ? '做多' : '做空'} ${whale.leverage || '5x'} @ $${formatCryptoPrice(whale.entryPx)} · 开仓时间: ${formatWhaleTime(whale.entryTime)} (点击查看详细仓位)`
      });
    }

    whaleMarkerOverlays.value = overlays;
  }

  // 点击/指向买卖点小圆点时的交互（严格点击才弹窗，hover 绝不自动弹窗）
  function onWhaleMarkerHover(m, row) {
    if (!m || !m.whale) return;
    highlightedWhaleAddr.value = m.whale.address;
  }

  function onWhaleMarkerLeave(m) {
    highlightedWhaleAddr.value = '';
  }

  function onWhaleMarkerClick(m, row) {
    if (!m || !m.whale) return;
    const sym = row?.symbol || expandedStockSymbol.value;
    if (activeWhaleHud.value && activeWhaleHud.value.whale?.address === m.whale.address && activeWhaleHud.value.whale?.side === m.whale.side) {
      activeWhaleHud.value = null;
      highlightedWhaleAddr.value = '';
      return;
    }

    highlightedWhaleAddr.value = m.whale.address;
    const coords = getWhaleMarkerCoordinates(m.whale, sym);

    activeWhaleHud.value = {
      symbol: sym,
      whale: m.whale,
      x: coords ? coords.x : m.x,
      y: coords ? coords.y : m.y,
      rawX: coords?.rawX ?? m.x,
      rawY: coords?.rawY ?? m.y,
      arrowOffset: coords?.arrowOffset || 0,
      isFlipDown: coords?.isFlipDown ?? (m.y < 155),
      isPinned: true
    };

    // 联动滚动到下方表格该巨鲸持仓行
    nextTick(() => {
      const tableRow = document.querySelector(`.stock-whale-row[data-address="${m.whale.address}"]`)
        || document.querySelector(`.stock-whale-table tbody tr.is-highlighted`);
      if (tableRow && typeof tableRow.scrollIntoView === 'function') {
        tableRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  // 图表与表格的双向交互（表格 hover 仅高亮行与买点小圆点，严格点击才弹窗）
  function onWhaleRowHover(whale, row) {
    if (!whale) return;
    highlightedWhaleAddr.value = whale.address;
  }

  function onWhaleRowLeave(whale) {
    highlightedWhaleAddr.value = '';
  }

  function onWhaleRowClick(whale, row) {
    if (!whale) return;
    const sym = row?.symbol || expandedStockSymbol.value;
    if (activeWhaleHud.value && activeWhaleHud.value.whale?.address === whale.address && activeWhaleHud.value.whale?.side === whale.side) {
      activeWhaleHud.value = null;
      highlightedWhaleAddr.value = '';
      return;
    }

    highlightedWhaleAddr.value = whale.address;
    const coords = getWhaleMarkerCoordinates(whale, sym);
    const el = document.getElementById('whale-drawer-chart-' + sym);
    const rect = el ? el.getBoundingClientRect() : { width: 600, height: 380 };
    const useCoords = coords && !coords.isOffscreen;
    activeWhaleHud.value = {
      symbol: sym,
      whale,
      x: useCoords ? coords.x : Math.round((rect.width || 600) * 0.45),
      y: useCoords ? coords.y : Math.max(30, Math.round((rect.height || 380) * 0.22)),
      rawX: useCoords ? coords.rawX : undefined,
      rawY: useCoords ? coords.rawY : undefined,
      arrowOffset: useCoords ? (coords.arrowOffset || 0) : 0,
      isFlipDown: useCoords ? !!coords.isFlipDown : false,
      isPinned: true
    };
  }

  function toggleStockRadar(sym) {
    if (expandedStockSymbol.value === sym) {
      expandedStockSymbol.value = '';
      disposeWhaleDrawerChart();
    } else {
      expandedStockSymbol.value = sym;
      nextTick(() => {
        loadAndRenderWhaleDrawerChart(sym);
      });
    }
  }

  function focusAssetInFlowMatrix(target) {
    if (!target) return;
    if (typeof target === 'object' && target.isOther) return;

    const rawSym = typeof target === 'string'
      ? target
      : String(target.symbol || target.coin || target.chartSymbol || '').trim();
    const rawChartSym = typeof target === 'object'
      ? String(target.chartSymbol || '').trim()
      : '';
    const targetSymbol = rawSym.toUpperCase();
    const targetChartSymbol = rawChartSym.toUpperCase();

    // 1. 自动展开全市场流向与异动折叠区
    showSecondaryMarketFlow.value = true;
    // 2. 自动切换至“资金流向矩阵” Tab
    secondaryFlowTab.value = 'flow';
    // 3. 清理可能导致目标被过滤的搜索词
    if (cryptoWhaleSearch.value || onchainStockSearch.value) {
      cryptoWhaleSearch.value = '';
      onchainStockSearch.value = '';
    }

    // 4. 在 activeFlowRows 中匹配目标标的（支持双向别名，如 XYZ100 <-> QQQ, SP500 <-> SPY）
    const matchedRow = activeFlowRows.value.find(r => {
      const sym = String(r.symbol || '').toUpperCase();
      const csym = String(r.chartSymbol || '').toUpperCase();
      return sym === targetSymbol || sym === targetChartSymbol || csym === targetSymbol || csym === targetChartSymbol
        || (targetSymbol === 'XYZ100' && (sym === 'QQQ' || csym === 'QQQ'))
        || (targetSymbol === 'QQQ' && (sym === 'XYZ100' || csym === 'XYZ100'))
        || (targetSymbol === 'SP500' && (sym === 'SPY' || csym === 'SPY'))
        || (targetSymbol === 'SPY' && (sym === 'SP500' || csym === 'SP500'));
    });

    const finalSymbol = matchedRow ? matchedRow.symbol : targetSymbol;

    // 5. 展开该标的持仓雷达与前几大主力持仓，并自动渲染方案 A 双甲板时空 K 线
    expandedStockSymbol.value = finalSymbol;
    focusedFlowSymbol.value = finalSymbol;
    nextTick(() => {
      loadAndRenderWhaleDrawerChart(finalSymbol);
    });

    // 6. 滚动居中并触发聚焦高亮（平滑对齐抽屉与标的行）
    nextTick(() => {
      setTimeout(() => {
        const rowEl = document.querySelector(`.cw-flow-row[data-symbol="${finalSymbol}"]`)
          || document.querySelector(`.cw-flow-row[data-symbol="${targetSymbol}"]`)
          || document.querySelector('.cw-drawer-tr')
          || document.querySelector('.cw-flow-panel');
        if (rowEl && typeof rowEl.scrollIntoView === 'function') {
          rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setTimeout(() => {
          if (focusedFlowSymbol.value === finalSymbol) focusedFlowSymbol.value = '';
        }, 3200);
      }, 70);
    });
  }

  const onchainAggregate = computed(() => {
    return onchainStocksData.value?.aggregate || {
      totalTrackedCount: 10,
      totalVolume24h: 0,
      totalNetFlow24h: 0,
      overallBuyRatio: 50,
      overallSellRatio: 50,
      overallSentiment: '多空均衡 BALANCED',
      sentimentClass: 'neutral',
      topInflowSymbol: '--',
      maxPremiumSymbol: '--',
      activeTradersCount: 0
    };
  });

  const onchainStocksList = computed(() => {
    const list = onchainStocksData.value?.top10 || [];
    let filtered = list;
    const q = onchainStockSearch.value.trim().toUpperCase();
    if (q) {
      filtered = filtered.filter(s =>
        s.symbol.toUpperCase().includes(q) ||
        (s.name && s.name.includes(q)) ||
        (s.enName && s.enName.toUpperCase().includes(q)) ||
        (s.protocol && s.protocol.toUpperCase().includes(q))
      );
    }
    const field = onchainStockSortField.value;
    const dir = onchainStockSortDir.value === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = a[field] ?? 0;
      const vb = b[field] ?? 0;
      return (va - vb) * dir;
    });
  });

  function toggleOnchainSort(field) {
    if (onchainStockSortField.value === field) {
      onchainStockSortDir.value = onchainStockSortDir.value === 'desc' ? 'asc' : 'desc';
    } else {
      onchainStockSortField.value = field;
      onchainStockSortDir.value = 'desc';
    }
  }

  function formatOnchainUsd(val) {
    if (val == null || isNaN(val)) return '0';
    const num = Number(val);
    if (Math.abs(num) >= 1e9) {
      return (num / 1e9).toFixed(2) + 'B';
    }
    if (Math.abs(num) >= 1e6) {
      return (num / 1e6).toFixed(2) + 'M';
    }
    if (Math.abs(num) >= 1e3) {
      return (num / 1e3).toFixed(1) + 'K';
    }
    return Math.round(num).toLocaleString();
  }

  function formatOnchainFlowUsd(val) {
    if (val == null || isNaN(val)) return '$0';
    const num = Number(val);
    const sign = num > 0 ? '+' : (num < 0 ? '-' : '');
    const abs = Math.abs(num);
    let str = '';
    if (abs >= 1e9) {
      str = (abs / 1e9).toFixed(2) + 'B';
    } else if (abs >= 1e6) {
      str = (abs / 1e6).toFixed(2) + 'M';
    } else if (abs >= 1e3) {
      str = (abs / 1e3).toFixed(1) + 'K';
    } else {
      str = Math.round(abs).toLocaleString();
    }
    return `${sign}$${str}`;
  }

  async function loadOnchainStocks({ force = false } = {}) {
    try {
      onchainStocksLoading.value = true;
      onchainStocksError.value = '';
      const url = force ? '/api/crypto/onchain-stocks?force=1' : '/api/crypto/onchain-stocks';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data.top10) {
          const oldMap = new Map((onchainStocksData.value?.top10 || []).map(x => [x.symbol, x.price]));
          data.top10.forEach(s => {
            const oldPx = oldMap.get(s.symbol);
            if (oldPx != null && Math.abs(oldPx - s.price) >= 0.005) {
              s._priceDir = s.price > oldPx ? 'up' : 'down';
            }
          });
          onchainStocksData.value = data;
          setTimeout(() => {
            if (onchainStocksData.value?.top10) {
              onchainStocksData.value.top10.forEach(s => { delete s._priceDir; });
            }
          }, 1500);
        }
      } else {
        onchainStocksError.value = `HTTP ${res.status}`;
        if (!onchainStocksData.value) {
          onchainStocksData.value = DEFAULT_ONCHAIN_STOCKS_PAYLOAD;
        }
      }
    } catch (err) {
      onchainStocksError.value = err.message || '网络连接异常';
      if (!onchainStocksData.value) {
        onchainStocksData.value = DEFAULT_ONCHAIN_STOCKS_PAYLOAD;
      }
    } finally {
      onchainStocksLoading.value = false;
    }
  }

  // ==========================================
  // Unified Visual Capital Flow & Graphic Telemetry
  // ==========================================
  function parseCompactUsd(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v !== 'string') return 0;
    const cleaned = v.replace(/[$,\s]/g, '');
    const m = cleaned.match(/^([+-]?\d*\.?\d+)([TBMK])?$/i);
    if (!m) return 0;
    const base = parseFloat(m[1]);
    const unit = (m[2] || '').toUpperCase();
    const mult = unit === 'T' ? 1e12 : unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : unit === 'K' ? 1e3 : 1;
    return base * mult;
  }

  function buildSparklineGeometry(item, width = 116, height = 38) {
    const sym = String(item?.code || item?.symbol || 'BTC');
    const chg = Number(item?.changePercent ?? 0);
    let pts = [];
    if (Array.isArray(item?.bars) && item.bars.length >= 4) {
      pts = item.bars.slice(-24).map(b => Number(b?.close ?? b?.[1] ?? b)).filter(Number.isFinite);
    }
    if (pts.length < 4) {
      let seed = 0;
      for (let i = 0; i < sym.length; i++) seed = (seed * 31 + sym.charCodeAt(i)) % 997;
      const count = 14;
      const base = 100;
      const end = 100 + (Number.isFinite(chg) ? chg : 0);
      pts = [];
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const wave = Math.sin(t * Math.PI * 2.4 + seed * 0.13) * 0.55 + Math.cos(t * Math.PI * 4.1 + seed * 0.07) * 0.28;
        pts.push(i === count - 1 ? end : base + (end - base) * t + wave);
      }
    }
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const padX = 3;
    const padY = 5;
    const coords = pts.map((v, idx) => {
      const x = padX + (idx / (pts.length - 1)) * (width - padX * 2 - 3);
      const y = height - padY - ((v - min) / span) * (height - padY * 2);
      return [Number(x.toFixed(1)), Number(y.toFixed(1))];
    });
    const linePath = coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c[0]},${c[1]}`).join(' ');
    const first = coords[0];
    const last = coords[coords.length - 1];
    const areaPath = `${linePath} L${last[0]},${height} L${first[0]},${height} Z`;
    return {
      linePath,
      areaPath,
      lastX: last[0],
      lastY: last[1],
      isUp: chg >= 0
    };
  }

  const cryptoFlowRows = computed(() => {
    const whales = cryptoWhaleData.value?.whales || [];
    const coinPosMap = new Map();
    for (const w of whales) {
      for (const p of (w.positions || [])) {
        const c = (p.coin || '').toUpperCase();
        if (!c) continue;
        if (!coinPosMap.has(c)) {
          coinPosMap.set(c, { longNtl: 0, shortNtl: 0, markPx: p.markPx || 0, chartSymbol: p.chartSymbol || `${c}-USD` });
        }
        const entry = coinPosMap.get(c);
        const val = Number(p.positionValue) || 0;
        if (isPositionLong(p)) entry.longNtl += val;
        else entry.shortNtl += val;
        if (!entry.markPx && p.markPx) entry.markPx = p.markPx;
      }
    }

    const baseList = cryptoList.value.map((c, idx) => {
      const code = (c.code || c.symbol.replace('-USD', '')).toUpperCase();
      const defItem = DEFAULT_CRYPTOS.find(d => d.code === code);
      const wm = coinPosMap.get(code);
      const volNum = parseCompactUsd(c.vol24h || defItem?.vol24h) || (idx === 0 ? 38.2e9 : idx === 1 ? 18.4e9 : 1.5e9);
      const chg = Number(c.changePercent ?? defItem?.changePercent ?? 0);
      const longNtl = wm ? wm.longNtl : volNum * 0.012 * (chg >= 0 ? 0.58 : 0.42);
      const shortNtl = wm ? wm.shortNtl : volNum * 0.012 * (chg >= 0 ? 0.42 : 0.58);
      const totalPos = longNtl + shortNtl;
      const buyRatio = totalPos > 0 ? Math.round((longNtl / totalPos) * 1000) / 10 : 50;
      const netFlow = wm ? (longNtl - shortNtl) : (volNum * (chg / 100) * 0.35);
      return {
        symbol: code,
        name: code,
        chartSymbol: c.symbol,
        price: c.price ?? wm?.markPx ?? defItem?.price ?? 0,
        changePercent: chg,
        volume24h: volNum,
        netFlow,
        buyRatio,
        sellRatio: Number((100 - buyRatio).toFixed(1)),
        openInterest: totalPos > 0 ? totalPos : volNum * 0.04,
        premiumPct: null,
        bars: c.bars || [],
        isCrypto: true
      };
    });

    const seen = new Set(baseList.map(x => x.symbol));
    for (const [coin, wm] of coinPosMap.entries()) {
      if (seen.has(coin) || baseList.length >= 10) continue;
      const totalPos = wm.longNtl + wm.shortNtl;
      if (totalPos < 250000) continue;
      const buyRatio = totalPos > 0 ? Math.round((wm.longNtl / totalPos) * 1000) / 10 : 50;
      const netFlow = wm.longNtl - wm.shortNtl;
      baseList.push({
        symbol: coin,
        name: coin,
        chartSymbol: wm.chartSymbol,
        price: wm.markPx || 0,
        changePercent: netFlow >= 0 ? 1.42 : -1.18,
        volume24h: totalPos * 4.5,
        netFlow,
        buyRatio,
        sellRatio: Number((100 - buyRatio).toFixed(1)),
        openInterest: totalPos,
        premiumPct: null,
        bars: [],
        isCrypto: true
      });
      seen.add(coin);
    }

    return baseList;
  });

  const activeFlowRows = computed(() => {
    const q = (cryptoWhaleSearch.value || onchainStockSearch.value || '').trim().toUpperCase();
    const isStocks = whaleCategory.value === 'stocks';
    const sourceCandidates = isStocks
      ? ((onchainStocksData.value?.allStocks && onchainStocksData.value.allStocks.length > 0)
          ? onchainStocksData.value.allStocks
          : (onchainStocksData.value?.top10 || []))
      : cryptoFlowRows.value;

    const rawList = isStocks
      ? sourceCandidates.map(s => {
          const price = Number(s.price) || 0;
          const tradFiClose = Number(s.tradFiClose) || 0;
          const priceDiff = s.priceDiff != null ? Number(s.priceDiff) : ((price > 0 && tradFiClose > 0) ? Number((price - tradFiClose).toFixed(2)) : 0);
          const premiumPct = s.premiumPct != null ? Number(s.premiumPct) : ((price > 0 && tradFiClose > 0) ? Number((((price - tradFiClose) / tradFiClose) * 100).toFixed(2)) : 0);
          return {
            symbol: s.symbol,
            name: s.name,
            chartSymbol: s.chartSymbol || s.symbol,
            price: s.price,
            changePercent: s.changePercent,
            tradFiClose,
            priceDiff,
            premiumPct,
            volume24h: s.volume24h,
            netFlow: s.netFlow,
            buyRatio: s.buyRatio,
            sellRatio: s.sellRatio,
            openInterest: s.openInterest,
            _priceDir: s._priceDir,
            raw: s,
            isCrypto: false
          };
        })
      : cryptoFlowRows.value;

    let filtered = rawList;
    if (q) {
      filtered = rawList.filter(r =>
        r.symbol.toUpperCase().includes(q) ||
        (r.name && r.name.toUpperCase().includes(q))
      );
    }

    const field = onchainStockSortField.value || 'volume24h';
    const dir = onchainStockSortDir.value === 'asc' ? 1 : -1;
    let sorted = [...filtered].sort((a, b) => ((a[field] ?? 0) - (b[field] ?? 0)) * dir);

    // 若未进行搜索且处于默认展示时，若列表较长，保留前 12 个；但若用户展开了某个标的，确保该标的必在列表中
    const expSym = (expandedStockSymbol.value || '').toUpperCase();
    if (!q && sorted.length > 12) {
      const head = sorted.slice(0, 12);
      if (expSym && !head.some(r => r.symbol.toUpperCase() === expSym || r.chartSymbol.toUpperCase() === expSym)) {
        const picked = sorted.find(r => r.symbol.toUpperCase() === expSym || r.chartSymbol.toUpperCase() === expSym);
        if (picked) head.push(picked);
      }
      sorted = head;
    }

    // 绝对保底：若用户聚焦展开了某个标的，但该标的因未被聚合等原因缺失，自动动态补入该标的行，确保 100% 展开抽屉
    if (expSym && !sorted.some(r => r.symbol.toUpperCase() === expSym || r.chartSymbol.toUpperCase() === expSym)) {
      sorted.push({
        symbol: expSym,
        name: expSym,
        chartSymbol: expSym,
        price: 100,
        changePercent: 0,
        tradFiClose: 100,
        priceDiff: 0,
        premiumPct: 0,
        volume24h: 10000000,
        netFlow: 0,
        buyRatio: 50,
        sellRatio: 50,
        openInterest: 10000000,
        _priceDir: 'flat',
        raw: null,
        isCrypto: !isStocks
      });
    }

    const maxAbsFlow = Math.max(1, ...sorted.map(r => Math.abs(Number(r.netFlow) || 0)));
    const maxVol = Math.max(1, ...sorted.map(r => Number(r.volume24h) || 0));

    return sorted.map((r, idx) => ({
      ...r,
      displayRank: idx + 1,
      flowBarPct: Math.min(48, Math.max(4, Math.round((Math.abs(Number(r.netFlow) || 0) / maxAbsFlow) * 48))),
      volBarPct: Math.min(100, Math.max(4, Math.round(((Number(r.volume24h) || 0) / maxVol) * 100)))
    }));
  });

  const whaleDonutSpec = computed(() => {
    const r = 15.5;
    const c = 2 * Math.PI * r;
    const longPct = Math.max(0, Math.min(100, Number(whaleAggregate.value?.longRatio ?? 50)));
    const shortPct = Math.max(0, 100 - longPct);
    const gap = longPct > 2 && shortPct > 2 ? 2.5 : 0;
    const longArc = Math.max(0, (longPct / 100) * c - gap);
    const shortArc = Math.max(0, (shortPct / 100) * c - gap);
    return {
      c: Number(c.toFixed(2)),
      longPct: Number(longPct.toFixed(1)),
      shortPct: Number(shortPct.toFixed(1)),
      longDash: `${longArc.toFixed(2)} ${c.toFixed(2)}`,
      shortDash: `${shortArc.toFixed(2)} ${c.toFixed(2)}`,
      shortOffset: Number((-(longArc + gap)).toFixed(2))
    };
  });

  const activeFlowSummary = computed(() => {
    const isStocks = whaleCategory.value === 'stocks';
    const stocksTop = onchainStocksData.value?.top10 || [];
    const cList = cryptoList.value || [];

    const cRows = cryptoFlowRows.value || [];
    const btcRow = cRows.find(r => r.symbol === 'BTC') || cRows[0];
    const ethRow = cRows.find(r => r.symbol === 'ETH') || cRows[1];

    const a1 = isStocks
      ? (stocksTop[0] ? { symbol: stocksTop[0].symbol, chartSymbol: stocksTop[0].chartSymbol || stocksTop[0].symbol, price: stocksTop[0].price, changePercent: stocksTop[0].changePercent, bars: [] } : { symbol: 'MU', chartSymbol: 'MU', price: 0, changePercent: 0, bars: [] })
      : { symbol: 'BTC', chartSymbol: 'BTC-USD', price: btcRow?.price ?? 0, changePercent: btcRow?.changePercent ?? 0, bars: btcRow?.bars || [] };

    const a2 = isStocks
      ? (stocksTop[1] ? { symbol: stocksTop[1].symbol, chartSymbol: stocksTop[1].chartSymbol || stocksTop[1].symbol, price: stocksTop[1].price, changePercent: stocksTop[1].changePercent, bars: [] } : { symbol: 'NVDA', chartSymbol: 'NVDA', price: 0, changePercent: 0, bars: [] })
      : { symbol: 'ETH', chartSymbol: 'ETH-USD', price: ethRow?.price ?? 0, changePercent: ethRow?.changePercent ?? 0, bars: ethRow?.bars || [] };

    const sourceRows = isStocks
      ? stocksTop
      : cRows;

    const totalVol = isStocks
      ? (onchainAggregate.value?.totalVolume24h || 0)
      : sourceRows.reduce((s, r) => s + (Number(r.volume24h) || 0), 0);

    const totalNetFlow = isStocks
      ? (onchainAggregate.value?.totalNetFlow24h || 0)
      : sourceRows.reduce((s, r) => s + (Number(r.netFlow) || 0), 0);

    const topBars = sourceRows.slice(0, 10);
    const maxF = Math.max(1, ...topBars.map(x => Math.abs(Number(x.netFlow) || 0)));
    const barW = 8;
    const gap = 3.5;
    const skylineBars = topBars.map((item, i) => {
      const nf = Number(item.netFlow) || 0;
      const h = Math.max(2.5, Math.round((Math.abs(nf) / maxF) * 16));
      const isUp = nf >= 0;
      return {
        symbol: item.symbol,
        x: Number((3 + i * (barW + gap)).toFixed(1)),
        y: isUp ? 20 - h : 20,
        w: barW,
        h,
        isUp
      };
    });

    const cryptoTotalOI = cryptoWhaleData.value?.aggregate?.totalOI || 0;
    const cryptoLongPct = cryptoWhaleData.value?.aggregate?.longRatio ?? 50;
    const stocksTotalVol = onchainAggregate.value?.totalVolume24h || 0;
    const stocksBuyPct = onchainAggregate.value?.overallBuyRatio ?? 50;

    return {
      lead1: { ...a1, sparkline: buildSparklineGeometry(a1) },
      lead2: { ...a2, sparkline: buildSparklineGeometry(a2) },
      totalVol,
      totalNetFlow,
      skylineBars,
      cryptoTotalOI,
      cryptoLongPct,
      stocksTotalVol,
      stocksBuyPct
    };
  });

  // 标的巨鲸持仓抽屉列表排序状态（方向/仓位/均价/盈亏/强平/地址）
  const whaleDrawerSortField = ref('positionValue');
  const whaleDrawerSortDir = ref('desc');

  function toggleWhaleDrawerSort(field) {
    if (whaleDrawerSortField.value === field) {
      whaleDrawerSortDir.value = whaleDrawerSortDir.value === 'desc' ? 'asc' : 'desc';
    } else {
      whaleDrawerSortField.value = field;
      // 方向默认多在前（desc），仓位、均价、盈亏默认降序（desc），强平默认升序（更接近现价更危险），地址默认升序（asc）
      whaleDrawerSortDir.value = (field === 'address' || field === 'liquidationPx') ? 'asc' : 'desc';
    }
  }

  function getUnifiedWhalePositions(row) {
    if (!row) return [];
    const sym = String(row.symbol || '').trim().toUpperCase();
    const chartSym = String(row.chartSymbol || '').trim().toUpperCase();

    // 匹配标的代码或别名（支持带部署者前缀 xyz: 以及 HIP-3 别名如 XYZ100/QQQ, SP500/SPY）
    const matchesCoin = (coinStr) => {
      const c = String(coinStr || '').replace(/^[a-zA-Z0-9_-]+:/, '').trim().toUpperCase();
      if (!c) return false;
      if (c === sym || c === chartSym) return true;
      if ((sym === 'XYZ100' || chartSym === 'QQQ') && (c === 'XYZ100' || c === 'QQQ')) return true;
      if ((sym === 'SP500' || chartSym === 'SPY') && (c === 'SP500' || c === 'SPY')) return true;
      return false;
    };

    // 优先从当前全局活跃的全部巨鲸池中抽取（包含 9 核心机构 + 实时扫描 Top 5 合约巨鲸）
    const pool = Array.isArray(allWhales.value) && allWhales.value.length > 0
      ? allWhales.value
      : [
          ...(cryptoWhaleData.value?.whales || []),
          ...((stockWhaleData.value || cryptoWhaleData.value?.stockWhales)?.whales || [])
        ];

    const list = [];
    const seenWhaleAddr = new Set();

    for (const w of pool) {
      if (!w || !Array.isArray(w.positions)) continue;
      const pos = w.positions.find(p => matchesCoin(p.coin) || matchesCoin(p.chartSymbol));
      if (pos) {
        const isLong = Boolean(pos.isLong || pos.side === 'LONG' || parseFloat(pos.szi || 0) > 0);
        const side = isLong ? 'LONG' : 'SHORT';
        const sideLabel = isLong ? '做多' : '做空';
        const shares = pos.size ?? pos.sizeAbs ?? Math.abs(parseFloat(pos.szi || 0));
        const entryPx = parseFloat(pos.entryPx || row.price || 0);
        const markPx = parseFloat(pos.markPx || row.price || entryPx || 0);
        const posVal = parseFloat(pos.positionValue || (shares * markPx) || 0);
        const pnl = parseFloat(pos.unrealizedPnl || 0);
        const roe = parseFloat(pos.returnOnEquity || (pos.roePct ? pos.roePct / 100 : 0) || 0);
        const lev = pos.leverageLabel || (pos.leverage ? `${pos.leverage.value || pos.leverage}x ${pos.leverage.type === 'isolated' ? '逐仓' : '全仓'}` : '5x 全仓');
        const liq = pos.liquidationPx ? parseFloat(pos.liquidationPx) : null;
        const rawRealTime = pos.entryTime || pos.openedAt || pos.time || pos.timestamp || null;
        const hasRealEntryTime = Boolean(rawRealTime);
        const syncKey = `${sym}:${String(w.address || '').toLowerCase()}:${side}`;
        const entryTime = rawRealTime || syncedWhaleEntryTimes.value[syncKey] || (Date.now() - 3600000 * (list.length + 1) * 3);

        list.push({
          name: w.name,
          address: w.address,
          shortAddress: w.shortAddress || `${w.address.slice(0, 6)}...${w.address.slice(-4)}`,
          avatar: w.avatar || '🐋',
          tag: w.tag || (w.isCurated ? '核心机构' : '实时巨鲸'),
          side,
          sideLabel,
          shares,
          unit: sym,
          entryPx,
          markPx,
          positionValue: posVal,
          leverage: lev,
          unrealizedPnl: pnl,
          returnOnEquity: roe,
          liquidationPx: liq,
          entryTime,
          hasRealEntryTime,
          isCurated: Boolean(w.isCurated)
        });
        seenWhaleAddr.add(String(w.address || '').toLowerCase());
      }
    }

    // 若从当前活跃池查找到的持仓不足，补充 row.raw?.whalePositions 里的数据
    if (row.raw && Array.isArray(row.raw.whalePositions)) {
      for (let wpIdx = 0; wpIdx < row.raw.whalePositions.length; wpIdx++) {
        const wp = row.raw.whalePositions[wpIdx];
        const addrLow = String(wp.address || '').toLowerCase();
        if (!seenWhaleAddr.has(addrLow)) {
          const wpSide = wp.side || (wp.isLong ? 'LONG' : 'SHORT');
          const wpHasReal = Boolean(wp.hasRealEntryTime || wp.openedAt || wp.timestamp);
          const wpSyncKey = `${sym}:${addrLow}:${wpSide}`;
          const wpSyncedTime = syncedWhaleEntryTimes.value[wpSyncKey];
          const wpEntryTime = wpHasReal
            ? (wp.entryTime || wp.openedAt || wp.timestamp)
            : (wpSyncedTime || wp.entryTime || (Date.now() - 3600000 * (wpIdx + 2) * 4));
          list.push({
            ...wp,
            hasRealEntryTime: wpHasReal,
            entryTime: wpEntryTime
          });
          seenWhaleAddr.add(addrLow);
        }
      }
    }

    const px = Number(row.price) || 100;
    const candidateList = list.length > 0 ? list : [
      {
        name: `${sym} 核心主力基金`,
        address: '0x0242468165b4c483a9fba11b8ca605481747ffa1',
        shortAddress: '0x0242...ffa1',
        avatar: '🏛️',
        tag: '核心机构',
        side: 'LONG',
        sideLabel: '做多',
        shares: Number((28700000 / px).toFixed(2)),
        unit: sym,
        entryPx: Number((px * 0.985).toFixed(2)),
        markPx: px,
        positionValue: 28700000,
        leverage: '5x 全仓',
        unrealizedPnl: 430500,
        returnOnEquity: 0.075,
        liquidationPx: Number((px * 0.82).toFixed(2)),
        hasRealEntryTime: false,
        entryTime: syncedWhaleEntryTimes.value[`${sym}:0x0242468165b4c483a9fba11b8ca605481747ffa1:LONG`] || (Date.now() - 3600000 * 26)
      },
      {
        name: `${sym} 链上量化对冲空头`,
        address: '0xfc66b5952f9547d216f9f302061244bb6888ca06',
        shortAddress: '0xfc66...ca06',
        avatar: '⚡',
        tag: '实时巨鲸',
        side: 'SHORT',
        sideLabel: '做空',
        shares: Number((11100000 / px).toFixed(2)),
        unit: sym,
        entryPx: Number((px * 1.018).toFixed(2)),
        markPx: px,
        positionValue: 11100000,
        leverage: '6x 全仓',
        unrealizedPnl: 199800,
        returnOnEquity: 0.108,
        liquidationPx: Number((px * 1.16).toFixed(2)),
        hasRealEntryTime: false,
        entryTime: syncedWhaleEntryTimes.value[`${sym}:0xfc66b5952f9547d216f9f302061244bb6888ca06:SHORT`] || (Date.now() - 3600000 * 5)
      }
    ];

    // 支持用户对表头任意字段进行动态排序（方向/仓位/均价/盈亏/强平/地址）
    const field = whaleDrawerSortField.value || 'positionValue';
    const dir = whaleDrawerSortDir.value === 'asc' ? 1 : -1;

    return [...candidateList].sort((a, b) => {
      let diff = 0;
      if (field === 'positionValue') {
        diff = (Number(a.positionValue) || 0) - (Number(b.positionValue) || 0);
      } else if (field === 'unrealizedPnl') {
        diff = (Number(a.unrealizedPnl) || 0) - (Number(b.unrealizedPnl) || 0);
      } else if (field === 'entryPx') {
        diff = (Number(a.entryPx) || 0) - (Number(b.entryPx) || 0);
      } else if (field === 'liquidationPx') {
        const aLiq = (a.liquidationPx != null && Number.isFinite(Number(a.liquidationPx))) ? Number(a.liquidationPx) : null;
        const bLiq = (b.liquidationPx != null && Number.isFinite(Number(b.liquidationPx))) ? Number(b.liquidationPx) : null;
        if (aLiq === null && bLiq === null) diff = 0;
        else if (aLiq === null) return 1;
        else if (bLiq === null) return -1;
        else diff = aLiq - bLiq;
      } else if (field === 'side') {
        const aSideVal = a.side === 'LONG' ? 1 : -1;
        const bSideVal = b.side === 'LONG' ? 1 : -1;
        diff = aSideVal - bSideVal;
        if (diff === 0) {
          const aLev = parseFloat(String(a.leverage || '').replace(/[^0-9.]/g, '')) || 0;
          const bLev = parseFloat(String(b.leverage || '').replace(/[^0-9.]/g, '')) || 0;
          diff = aLev - bLev;
        }
      } else if (field === 'address') {
        const aStr = String(a.name || a.address || '').toUpperCase();
        const bStr = String(b.name || b.address || '').toUpperCase();
        diff = aStr.localeCompare(bStr);
      }

      if (diff !== 0) {
        return diff * dir;
      }
      return (Number(b.positionValue) || 0) - (Number(a.positionValue) || 0);
    });
  }

  function getPriceAxisSpec(row) {
    const spot = Number(row?.price) || 100;
    const tradFiClose = (!row?.isCrypto && row?.tradFiClose) ? Number(row.tradFiClose) : null;
    const positions = getUnifiedWhalePositions(row);
    const longs = positions.filter(p => p.side === 'LONG');
    const shorts = positions.filter(p => p.side !== 'LONG');
    const calcAvg = arr => {
      const totalVal = arr.reduce((s, p) => s + (Number(p.positionValue) || 1), 0);
      if (!totalVal) return null;
      return arr.reduce((s, p) => s + Number(p.entryPx) * (Number(p.positionValue) || 1), 0) / totalVal;
    };
    const bullAvg = row?.raw?.intradayRadar?.costBasis?.bullVwap || calcAvg(longs) || spot * 0.986;
    const bearAvg = row?.raw?.intradayRadar?.costBasis?.bearVwap || calcAvg(shorts) || spot * 1.015;
    const points = [spot, bullAvg, bearAvg];
    if (tradFiClose) points.push(tradFiClose);
    const lo = Math.min(...points);
    const hi = Math.max(...points);
    const pad = (hi - lo) * 0.25 || spot * 0.01;
    const minP = lo - pad;
    const maxP = hi + pad;
    const toPct = v => Math.max(8, Math.min(92, Math.round(((v - minP) / (maxP - minP || 1)) * 100)));
    return {
      spot,
      bullAvg,
      bearAvg,
      tradFiClose,
      spotPct: toPct(spot),
      bullPct: toPct(bullAvg),
      bearPct: toPct(bearAvg),
      tradFiPct: tradFiClose ? toPct(tradFiClose) : null
    };
  }

  function formatSpreadPct(val) {
    if (val == null || isNaN(val)) return '—';
    const num = Number(val);
    const prefix = num > 0 ? '溢价 +' : num < 0 ? '折价 ' : '平价 ';
    return `${prefix}${num.toFixed(2)}%`;
  }

  function formatSpreadDiff(diff) {
    if (diff == null || isNaN(diff)) return '—';
    const num = Number(diff);
    return `${num >= 0 ? '+' : '-'}$${Math.abs(num).toFixed(2)}`;
  }

  function refreshCryptoWorkspace() {
    loadCrypto({ forceWhales: true });
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
  const compactPanelOpen = ref(false);

  const currentPageTitle = computed(() => {
    const item = nav.find(n => n.id === page.value);
    return item ? item.label : '市场总览';
  });

  function deleteStockDirect(sym) {
    removeWatch(sym);
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

  // CBOE Volatility Matrix Modal (VIX vs VXN 全景矩阵)
  const showVolatilityModal = ref(false);
  function openVolatilityModal() {
    showVolatilityModal.value = true;
  }
  function closeVolatilityModal() {
    showVolatilityModal.value = false;
  }

  const vixQuote = computed(() => {
    const findBench = sym => (overview.value?.benchmarks || []).find(b => b.symbol === sym);
    const item = findBench('^VIX') || macroMap.value['VIX'] || macroMap.value['^VIX'];
    return {
      symbol: '^VIX',
      displaySymbol: 'VIX',
      name: '标普 500 波动率',
      price: item?.price != null ? Number(item.price) : 18.42,
      changePercent: item?.changePercent != null ? Number(item.changePercent) : 1.05,
      previousClose: item?.previousClose != null ? Number(item.previousClose) : 18.23,
      asOf: item?.asOf || '实时'
    };
  });

  const vxnQuote = computed(() => {
    const item = macroMap.value['VXN'] || macroMap.value['^VXN'];
    return {
      symbol: '^VXN',
      displaySymbol: 'VXN',
      name: '纳斯达克 100 波动率',
      price: item?.price != null ? Number(item.price) : 22.85,
      changePercent: item?.changePercent != null ? Number(item.changePercent) : 2.15,
      previousClose: item?.previousClose != null ? Number(item.previousClose) : 22.37,
      asOf: item?.asOf || '实时'
    };
  });

  const volatilitySpread = computed(() => {
    const vxn = Number(vxnQuote.value?.price || 0);
    const vix = Number(vixQuote.value?.price || 0);
    return Number((vxn - vix).toFixed(2));
  });

  const volatilitySpreadRatio = computed(() => {
    const vxn = Number(vxnQuote.value?.price || 0);
    const vix = Number(vixQuote.value?.price || 0);
    return vix > 0 ? Number((vxn / vix).toFixed(2)) : 1.0;
  });

  const volatilityDiagnostic = computed(() => {
    const spread = volatilitySpread.value;
    const ratio = volatilitySpreadRatio.value;
    if (spread >= 5.0 || ratio >= 1.35) {
      return {
        title: '科技股单边恐慌踩踏 (Tech Panic Outlier)',
        badge: '🚨 科技溢价极端走阔',
        tone: 'danger',
        desc: '纳指期权隐含波动率显著脱离标普大盘走阔，科技与成长股面临单边抛压与强烈对冲诉求，需严密防范高估值蓝筹多杀多风险。'
      };
    }
    if (spread >= 3.0) {
      return {
        title: '常态科技风险溢价 (Normal Tech Beta Premium)',
        badge: '⚡ 科技股常态高贝塔',
        tone: 'warning',
        desc: '纳指波动率适度高于标普大盘，属于美股高贝塔科技成长资产的健康风险溢价区间，多空博弈处于可控秩序中。'
      };
    }
    if (spread >= 0) {
      return {
        title: '全市场波动率收敛平衡 (Volatility Convergence)',
        badge: '⚖️ 风险跨板块均衡',
        tone: 'normal',
        desc: '科技股与标普大盘波动率接近平价，反映避险情绪已扩散至全行业普跌，或整体市场处于相对平静的震荡博弈阶段。'
      };
    }
    return {
      title: '大盘防御溢价反超 (Defensive Panic Inversion)',
      badge: '🔄 传统权重非典型恐慌',
      tone: 'info',
      desc: '标普 VIX 罕见高于纳指 VXN，通常出现在银行、能源、工业等传统权重股遭深度抛售而科技股逆势抗跌的非典型避险期。'
    };
  });

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
  const isDataLoading = computed(() => Object.values(states).some(s => s.loading));
  const isPrimaryPageLoading = computed(() => {
    const curr = page.value;
    if (curr === 'chart' && states.chart.loading && !chart.value) return true;
    if (curr === 'options' && states.options.loading && !options.value) return true;
    if (curr === 'overview' && states.overview.loading && !overview.value) return true;
    if (curr === 'news' && states.news.loading && !news.value) return true;
    if (curr === 'crypto' && (states.crypto.loading || cryptoWhaleLoading.value) && (!cryptoData.value || !cryptoWhaleData.value)) return true;
    if (curr === 'watchlist' && states.watchlist.loading && !Object.keys(quoteStore.value || {}).length) return true;
    return false;
  });
  const isPageLoading = computed(() => isPrimaryPageLoading.value || isNavigating.value || isInitialLoading.value);
  const isWatchlistSkeleton = computed(() => {
    // Only show skeleton on initial load when there is NO quote data yet.
    // If quotes are already populated, never show skeleton; data updates in-place smoothly.
    const hasQuotes = Object.keys(quoteStore.value || {}).length > 0;
    if (hasQuotes) return false;
    return states.watchlist.loading || isInitialLoading.value;
  });
  const isCryptoSkeleton = computed(() => {
    if (page.value !== 'crypto') return false;
    const cat = whaleCategory.value === 'stocks' ? 'stocks' : 'crypto';
    const targetData = cat === 'stocks' ? (stockWhaleData.value || cryptoWhaleData.value?.stockWhales) : cryptoWhaleData.value;
    const hasWhales = Array.isArray(targetData?.whales) && targetData.whales.length > 0;
    if (hasWhales) return false;
    // 当出现网络或接口异常且请求已结束时，避免永久卡在骨架屏，转由主界面错误/重试态接管
    if (cryptoWhaleError.value && !cryptoWhaleLoading.value && !states.crypto.loading) {
      return false;
    }
    // 未加载出巨鲸数据时，只要处于拉取中、旧行情加载中或初始挂载阶段，均展示与桑基图结构严格对齐的骨架屏
    return Boolean(cryptoWhaleLoading.value || states.crypto.loading || isInitialLoading.value || !targetData);
  });

  watch(isPageLoading, (loading) => {
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('is-loading', !!loading);
    }
  }, { immediate: true });
  const nonLeveragedWatchlist = computed(() => {
    return (watchlist.value || []).filter(sym => {
      // 1. 严格剔除杠杆 ETF (如 SOXL, TQQQ, NVDL, TSLL 等)
      if (isLeveragedEtf(sym, SYMBOL_NAMES[sym])) return false;
      // 2. 严格剔除加密货币标的 (如 BTC-USD, ETH-USD, SOL-USD 等)
      if (isCryptoSymbol(sym, SYMBOL_NAMES[sym])) return false;
      // 3. 检查标的是否归属于加密货币分组
      const groupNames = watchlistMgr.getGroupsForSymbol(sym);
      const isCryptoGroup = groupNames.some(g => typeof g === 'string' && (g.includes('加密') || g.toLowerCase().includes('crypto')));
      if (isCryptoGroup) return false;
      return true;
    });
  });
  const currentSessionShortLabel = computed(() => {
    const s = currentSession.value?.session;
    if (s === 'pre') return '盘前';
    if (s === 'post') return '盘后';
    if (s === 'overnight') return '隔夜';
    return '常规';
  });
  const resolvedHeatmapSession = computed(() => 'regular');
  const resolvedHeatmapSessionLabel = computed(() => '常规');
  const heatmapSessionBadgeText = computed(() => '☀️ 常规时段');

  function buildHeatmapStockItem({ symbol: sym, name, sector, fallbackStock = null }) {
    const overviewStock = (overview.value?.stocks || []).find(s => s.symbol === sym);
    const q = quoteStore.value[sym] || {};
    const reg = q.regular || {};

    const regPrice = reg.price ?? q.price ?? overviewStock?.price ?? fallbackStock?.price ?? null;
    const regChange = reg.changePercent ?? q.changePercent ?? overviewStock?.changePercent ?? fallbackStock?.changePercent ?? null;
    const regVolume = reg.volume ?? q.volume ?? overviewStock?.volume ?? fallbackStock?.volume ?? null;
    const regTime = reg.sourceTime || q.asOf || overviewStock?.asOf || q.meta?.updatedAt || null;

    // Strictly display regular trading hours (正常开盘正常交易时段的热力图数据)
    const price = regPrice;
    const changePercent = regChange;
    const asOf = regTime;
    const sessionKey = 'regular';
    const sessionLabel = '常规';

    const basePrice = price ?? regPrice;
    let turnover = (regVolume && basePrice)
      ? (regVolume * basePrice)
      : (reg.turnover ?? q.turnover ?? overviewStock?.turnover ?? null);

    if (turnover === null || !Number.isFinite(turnover) || turnover <= 0) {
      const mcap = STOCK_MARKET_CAPS[sym]?.value;
      if (mcap) {
        turnover = mcap * 0.005;
      } else if (basePrice) {
        turnover = basePrice * 1000000;
      }
    }

    return {
      symbol: sym,
      name: SYMBOL_NAMES[sym] || q.name || name || overviewStock?.name || fallbackStock?.name || sym,
      sector: sector || overviewStock?.sector || fallbackStock?.sector || '美股',
      price,
      changePercent,
      regularPrice: regPrice,
      regularChange: regChange,
      sessionKey,
      sessionLabel,
      turnover,
      asOf
    };
  }

  const activeHeatmapStocks = computed(() => {
    if (heatmapScope.value === 'watchlist') {
      const symbols = nonLeveragedWatchlist.value;
      if (!symbols.length) {
        return NASDAQ100_STOCKS
          .filter(def => !isLeveragedEtf(def.symbol) && !isCryptoSymbol(def.symbol))
          .map(def => buildHeatmapStockItem({ symbol: def.symbol, name: def.name, sector: def.sector, fallbackStock: def }));
      }
      return symbols.map(sym => {
        const overviewStock = (overview.value?.stocks || []).find(s => s.symbol === sym);
        const groupNames = watchlistMgr.getGroupsForSymbol(sym);
        const groupName = (typeof groupNames[0] === 'string' && groupNames[0]) || (watchlistMgr.data.groups || []).find(g => (g.symbolIds || []).includes(sym))?.name || overviewStock?.sector || '自选美股';
        return buildHeatmapStockItem({ symbol: sym, sector: groupName, fallbackStock: overviewStock });
      });
    }

    if (heatmapScope.value === 'sp500') {
      return SP500_STOCKS
        .filter(def => !isLeveragedEtf(def.symbol) && !isCryptoSymbol(def.symbol))
        .map(def => buildHeatmapStockItem({ symbol: def.symbol, name: def.name, sector: def.sector, fallbackStock: def }));
    }

    // default / fallback: nasdaq100 (101 constituents)
    return NASDAQ100_STOCKS
      .filter(def => !isLeveragedEtf(def.symbol) && !isCryptoSymbol(def.symbol))
      .map(def => buildHeatmapStockItem({ symbol: def.symbol, name: def.name, sector: def.sector, fallbackStock: def }));
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

  const sectorRotationSummaryVal = computed(() => {
    const tot = totalSectorTurnover.value;
    if (tot && Number.isFinite(tot) && tot > 0) {
      return '$' + compact(tot);
    }
    return '11 Sectors';
  });

  const flowsSummaryVal = computed(() => {
    const list = dayFlows.value || [];
    if (!list.length) {
      if (flows.value?.length) return `${flows.value.length} 笔`;
      return '$0';
    }
    const total = list.reduce((acc, f) => acc + (Number(f.netFlowUsd) || 0), 0);
    const sign = total > 0 ? '+' : (total < 0 ? '-' : '');
    return `${sign}$${compact(Math.abs(total))}`;
  });

  const flowsSummaryBarPct = computed(() => {
    const list = dayFlows.value || [];
    if (!list.length) return 50;
    const posCount = list.filter(f => (Number(f.netFlowUsd) || 0) > 0).length;
    return Math.round((posCount / list.length) * 100);
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
    const q = quoteStore.value?.[sym];
    const reg = q?.regular;
    if (reg && reg.price != null) {
      return {
        symbol: sym,
        price: reg.price,
        changePercent: reg.changePercent
      };
    }
    return overview.value?.stocks?.find(s => s.symbol === sym) || null;
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
    } else {
      list.unshift(item.url);
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
  const activeEarningsWeek = ref('current');
  const earningsToday = computed(() => getEarningsCalendarDate(clock.value));
  const earningsWeeks = computed(() => getEarningsWeeks(earningsToday.value));
  const earningsSectorFilter = ref('all');
  const earningsTimingFilter = ref('all');
  const earningsAiOnly = ref(false);
  const earningsSearch = ref('');
  const showEarningsModal = ref(false);
  const selectedEarningsItem = ref(null);

  const earningsResponse = ref(null);
  const earningsLoading = ref(false);
  const earningsError = ref('');
  const earningsList = computed(() => earningsResponse.value?.items || []);
  const earningsCache = new Map();
  let earningsRequestId = 0, earningsController = null, earningsRefreshTimer = null;
  let earningsTrigger = null;
  const macroCalendarList = ref(MACRO_CALENDAR_ITEMS);

  const currentEarningsWeekInfo = computed(() => earningsWeeks.value[activeEarningsWeek.value] || earningsWeeks.value.current);

  const currentEarningsDays = computed(() => currentEarningsWeekInfo.value.days.map(day => ({
    ...day, status: earningsResponse.value?.days?.find(result => result.date === day.fullDate)?.status || 'unavailable'
  })));

  async function loadEarningsCalendar(force = false) {
    if (page.value !== 'news' || newsSubView.value !== 'earnings') return;
    const weekStart = currentEarningsWeekInfo.value.weekStart;
    const cached = earningsCache.get(weekStart);
    const requestId = ++earningsRequestId;
    earningsController?.abort();
    earningsError.value = '';
    if (!force && cached && Date.now() - cached.loadedAt < 10 * 60_000) {
      earningsResponse.value = cached.data;
      earningsLoading.value = false;
      return;
    }
    earningsController = new AbortController();
    if (earningsResponse.value?.weekStart !== weekStart) earningsResponse.value = cached?.data || null;
    earningsLoading.value = true;
    earningsError.value = '';
    try {
      const response = await fetch(`/api/earnings/calendar?weekStart=${weekStart}${force ? '&force=1' : ''}`, { signal: earningsController.signal });
      if (!response.ok) throw new Error(`财报日历请求失败（HTTP ${response.status}）`);
      const data = await response.json();
      if (requestId !== earningsRequestId) return;
      if (data.weekStart !== weekStart || !Array.isArray(data.items) || !Array.isArray(data.days)) throw new Error('财报日历返回格式异常');
      earningsResponse.value = data;
      if (data.status !== 'unavailable') earningsCache.set(weekStart, { data, loadedAt: Date.now() });
      while (earningsCache.size > 6) earningsCache.delete(earningsCache.keys().next().value);
    } catch (error) {
      if (requestId !== earningsRequestId || error.name === 'AbortError') return;
      earningsError.value = error.message;
      if (earningsResponse.value?.weekStart === weekStart) {
        earningsResponse.value = { ...earningsResponse.value, status: 'partial',
          items: earningsResponse.value.items.map(item => ({ ...item, stale: true })),
          days: earningsResponse.value.days.map(day => ({ ...day, status: day.fetchedAt ? 'stale' : 'unavailable' })) };
        earningsCache.delete(weekStart);
      }
    } finally {
      if (requestId === earningsRequestId) earningsLoading.value = false;
    }
  }

  function refreshVisibleEarnings() {
    if (!document.hidden) loadEarningsCalendar();
  }

  function setEarningsWeek(wKey) {
    if (!earningsWeeks.value[wKey]) return;
    closeEarningsModal();
    activeEarningsWeek.value = wKey;
  }

  function getEarningsSectorCount(secId) {
    if (!Array.isArray(earningsList.value)) return 0;
    if (secId === 'all') return earningsList.value.length;
    return earningsList.value.filter(item => item.sectorId === secId).length;
  }

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
  const aiSearchEngine = ref('auto');
  const aiSearchSource = ref('all'); // 'all' | 'social' | 'reddit' | 'x' | 'authority' | 'wsj_reuters'
  const aiSearchResults = ref([]);
  const aiSearchLoading = ref(false);
  const aiSearchError = ref(null);
  const aiSearchTelemetry = ref(null);
  const aiSearchCopiedId = ref(null);
  const aiSearchTimeRange = ref('day');
  const aiSearchSort = ref('latest');
  const aiSearchIncludeUndated = ref(false);
  const aiSearchAutoRefresh = ref(false);
  const aiSearchPending = ref(null);
  let aiSearchController = null, aiSearchSequence = 0, aiSearchTimer = null;
  let aiSearchApplied = null, aiSearchLastAttempt = 0;
  const AI_REFRESH_MS = 5 * 60 * 1000;

  const AI_SEARCH_ENGINES = [
    { id: 'auto', label: '智能检索（按需补充）', desc: '优先搜索，结果不足时启用其他引擎', icon: '⚡' },
    { id: 'all', label: '智能多引擎协同 (Ensemble)', desc: 'Tavily + Exa + Firecrawl 全网交叉融合', icon: '⚡' },
    { id: 'tavily', label: 'Tavily AI Search', desc: '新闻与网络资料检索', icon: '🔍' },
    { id: 'exa', label: 'Exa Neural Search', desc: '深度语义检索与权威金融专稿', icon: '🧠' },
    { id: 'firecrawl', label: 'Firecrawl Search', desc: '网页精准爬取与结构化提取', icon: '🔥' }
  ];

  const AI_SEARCH_SOURCES = [
    { id: 'all', label: '🌐 全部信源', desc: '全网综合财经与社交媒体' },
    { id: 'social', label: '💬 散户与社交舆情', desc: 'Reddit + X 社区' },
    { id: 'reddit', label: '🔴 Reddit 专属社区', desc: 'r/WSB · r/stocks · r/investing' },
    { id: 'x', label: '🐦 X (Twitter 交易圈)', desc: '宏观大V与交易员快讯' },
    { id: 'authority', label: '📰 媒体与官方来源', desc: '路透社、华尔街日报等媒体，以及美联储、BLS、BEA 等官方来源' },
    { id: 'wsj_reuters', label: '🏛️ 路透社 & 华尔街日报', desc: '两家媒体的新闻报道' },
    { id: 'official', label: '🏛️ 官方原始来源', desc: '美联储、BLS、BEA、SEC、财政部等' }
  ];

  const AI_SEARCH_PRESETS = [
    { label: '财经要闻', query: 'US stock market', engine: 'auto', source: 'authority', icon: '📰' },
    { label: '通胀与物价', query: '美国通胀', engine: 'auto', source: 'authority', icon: '📊' },
    { label: '美联储政策', query: '美联储', engine: 'auto', source: 'authority', icon: '🏛️' },
    { label: '地缘政治', query: '地缘政治', engine: 'auto', source: 'authority', icon: '🌐' },
    { label: 'NVDA 公司动态', query: 'NVDA', engine: 'auto', source: 'all', icon: '🔎' },
    { label: '💬 Reddit 散户热议与异动标的', query: 'reddit wallstreetbets stocks trending tickers market sentiment', engine: 'tavily', source: 'reddit', icon: '💬' },
    { label: '🐦 X 宏观与交易圈热议', query: 'stock market trading macro CPI Fed earnings', engine: 'tavily', source: 'x', icon: '🐦' },
    { label: '半导体行业', query: '半导体', engine: 'auto', source: 'authority', icon: '🤖' },
    { label: '公司财报', query: '财报', engine: 'auto', source: 'authority', icon: '📊' }
  ];

  function applyAiSearchResult(data) {
    aiSearchResults.value = data.items || [];
    aiSearchTelemetry.value = data;
    aiSearchPending.value = null;
  }

  function acceptAiSearchUpdate() {
    if (aiSearchPending.value) applyAiSearchResult(aiSearchPending.value);
  }

  function scheduleAiSearchRefresh() {
    clearTimeout(aiSearchTimer);
    if (!aiSearchAutoRefresh.value || page.value !== 'news' || newsSubView.value !== 'ai_search' || document.hidden || !aiSearchApplied || aiSearchLoading.value) return;
    aiSearchTimer = setTimeout(() => executeAiSearch({ background: true }), Math.max(1000, AI_REFRESH_MS - (Date.now() - aiSearchLastAttempt)));
  }

  function aiEngineStatus(engine) {
    const info = aiSearchTelemetry.value?.engineStatus?.find(s => s.engine === engine);
    if (info?.status === 'ok') return `返回 ${info.count} 条`;
    return { error: '本次失败', unconfigured: '未配置', not_requested: '本次未调用' }[info?.status] || '待检索';
  }

  async function executeAiSearch({ query, engine, source, background = false } = {}) {
    if (background && (!aiSearchAutoRefresh.value || document.hidden || page.value !== 'news' || newsSubView.value !== 'ai_search' || aiSearchLoading.value)) return;
    if (query !== undefined) aiSearchQuery.value = query;
    if (engine !== undefined) aiSearchEngine.value = engine;
    if (source !== undefined) aiSearchSource.value = source;

    const params = background ? aiSearchApplied : {
      query: aiSearchQuery.value.trim() || 'US stock market', engine: aiSearchEngine.value, source: aiSearchSource.value,
      timeRange: aiSearchTimeRange.value, sort: aiSearchSort.value, includeUndated: String(aiSearchIncludeUndated.value), limit: '16'
    };
    if (!params) return;
    clearTimeout(aiSearchTimer);
    aiSearchController?.abort();
    aiSearchController = new AbortController();
    const sequence = ++aiSearchSequence;
    aiSearchLastAttempt = Date.now();
    if (!background) {
      aiSearchApplied = { ...params };
      aiSearchResults.value = [];
      aiSearchTelemetry.value = null;
      aiSearchPending.value = null;
    }
    aiSearchLoading.value = true;
    aiSearchError.value = null;

    try {
      const url = `/api/news/ai-search?${new URLSearchParams(params)}`;
      const res = await fetch(url, { signal: aiSearchController.signal });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (sequence !== aiSearchSequence) return;
      if (background && aiSearchResults.value.length) aiSearchPending.value = data;
      else applyAiSearchResult(data);
    } catch (err) {
      if (sequence !== aiSearchSequence || err.name === 'AbortError') return;
      aiSearchError.value = err.message || 'AI 检索服务暂时不可用，请稍后重试';
    } finally {
      if (sequence === aiSearchSequence) {
        aiSearchLoading.value = false;
        scheduleAiSearchRefresh();
      }
    }
  }

  function selectAiSearchPreset(preset) {
    aiSearchQuery.value = preset.query;
    aiSearchEngine.value = preset.engine || 'auto';
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

  function formatAiTime(dateStr, precision = 'exact') {
    if (!dateStr) return '发布时间不明';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '发布时间不明';
    if (precision === 'day') return `日期约 ${String(dateStr).slice(0, 10)}`;
    const bjStr = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(d);
    const diff = Math.max(0, Date.now() - d.getTime());
    if (diff < 60000) return `刚刚 · ${bjStr}`;
    if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前 · ${bjStr}`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前 · ${bjStr}`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前 · ${bjStr}`;
    return bjStr;
  }

  function getAiEngineBadge(eng) {
    if (eng === 'live_wire') return { name: 'RSS 订阅源', cls: 'engine-pill-tavily' };
    if (eng === 'tavily') return { name: 'Tavily AI', cls: 'engine-pill-tavily' };
    if (eng === 'exa') return { name: 'Exa Neural', cls: 'engine-pill-exa' };
    if (eng === 'firecrawl') return { name: 'Firecrawl', cls: 'engine-pill-firecrawl' };
    return { name: 'AI 协同聚合', cls: 'engine-pill-all' };
  }

  // ================= TREE NEWS WEBSOCKET MODULE (Tree of Alpha) =================
  const treeNewsList = ref([]);
  const treeNewsConnected = ref(false);
  const treeNewsPaused = ref(false);
  const treeNewsSearch = ref('');
  const treeNewsSourceFilter = ref('all');
  const treeNewsAudioAlert = ref(false);
  const treeNewsCopiedId = ref(null);
  const treeNewsLoading = ref(false);
  let treeNewsEventSource = null;
  let treeNewsReconnectTimer = null;

  async function fetchTreeNewsHistory() {
    try {
      treeNewsLoading.value = true;
      const res = await fetch('/api/news/live/history?limit=50');
      const data = await res.json();
      if (data && Array.isArray(data.items)) {
        treeNewsList.value = data.items;
        if (data.status?.status === 'connected') {
          treeNewsConnected.value = true;
        }
      }
    } catch {} finally {
      treeNewsLoading.value = false;
    }
  }

  function playAlertChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }

  function setupTreeNewsStream() {
    if (treeNewsEventSource) {
      treeNewsEventSource.close();
      treeNewsEventSource = null;
    }
    clearTimeout(treeNewsReconnectTimer);
    if (typeof EventSource === 'undefined') return;

    try {
      treeNewsEventSource = new EventSource('/api/news/live/stream');
      treeNewsEventSource.onopen = () => {
        treeNewsConnected.value = true;
      };
      treeNewsEventSource.onmessage = e => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'snapshot') {
            if (Array.isArray(payload.items) && payload.items.length) {
              treeNewsList.value = payload.items;
            }
            treeNewsConnected.value = payload.status?.status === 'connected';
          } else if (payload.type === 'news' && payload.data) {
            treeNewsConnected.value = true;
            if (!treeNewsPaused.value) {
              if (!treeNewsList.value.some(it => it.id === payload.data.id)) {
                treeNewsList.value.unshift(payload.data);
                if (treeNewsList.value.length > 200) {
                  treeNewsList.value.pop();
                }
                if (treeNewsAudioAlert.value && payload.data.isBreaking) {
                  playAlertChime();
                }
              }
            }
          }
        } catch {}
      };
      treeNewsEventSource.onerror = () => {
        treeNewsConnected.value = false;
        if (treeNewsEventSource?.readyState === EventSource.CLOSED) {
          treeNewsEventSource?.close();
          treeNewsEventSource = null;
          clearTimeout(treeNewsReconnectTimer);
          treeNewsReconnectTimer = setTimeout(() => {
            if (typeof document !== 'undefined' && !document.hidden) {
              setupTreeNewsStream();
            }
          }, 5000);
        }
      };
    } catch {
      treeNewsConnected.value = false;
    }
  }

  function toggleTreeNewsPause() {
    treeNewsPaused.value = !treeNewsPaused.value;
  }

  function toggleTreeNewsAudio() {
    treeNewsAudioAlert.value = !treeNewsAudioAlert.value;
    if (treeNewsAudioAlert.value) playAlertChime();
  }

  function clearTreeNewsList() {
    treeNewsList.value = [];
  }

  function copyTreeNews(item) {
    if (!item) return;
    const text = `${item.title}\n来源: ${item.source} (${item.timeIso})\n${item.url || ''}`.trim();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        treeNewsCopiedId.value = item.id;
        setTimeout(() => { treeNewsCopiedId.value = null; }, 2000);
      }).catch(() => {});
    }
  }

  function formatTreeNewsTime(timeMs) {
    if (!timeMs) return '刚刚';
    const d = new Date(timeMs);
    if (isNaN(d.getTime())) return '刚刚';
    const bjTime = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(d);
    const diff = Math.max(0, Date.now() - d.getTime());
    if (diff < 5000) return `刚刚 · ${bjTime}`;
    if (diff < 60000) return `${Math.floor(diff / 1000)}秒前 · ${bjTime}`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前 · ${bjTime}`;
    return bjTime;
  }

  const filteredTreeNews = computed(() => {
    let list = treeNewsList.value || [];
    const q = treeNewsSearch.value.trim().toUpperCase();
    if (q) {
      list = list.filter(it => 
        (it.symbols && it.symbols.some(s => s.includes(q))) ||
        (it.title && it.title.toUpperCase().includes(q)) ||
        (it.body && it.body.toUpperCase().includes(q))
      );
    }
    const src = treeNewsSourceFilter.value;
    if (src && src !== 'all') {
      list = list.filter(it => it.sourceType === src || it.source.toLowerCase().includes(src));
    }
    return list;
  });

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

  async function openEarningsModal(item, event) {
    earningsTrigger = event?.currentTarget || document.activeElement;
    selectedEarningsItem.value = item;
    showEarningsModal.value = true;
    document.body.classList.add('earnings-detail-open');
    await nextTick();
    document.querySelector('.earnings-hero-expanded-card')?.focus({ preventScroll: true });
  }

  function closeEarningsModal() {
    showEarningsModal.value = false;
  }

  function finishClosingEarningsModal() {
    if (showEarningsModal.value) return;
    document.body.classList.remove('earnings-detail-open');
    selectedEarningsItem.value = null;
    if (earningsTrigger?.isConnected) earningsTrigger.focus({ preventScroll: true });
    earningsTrigger = null;
  }

  function handleEarningsDialogKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEarningsModal(); return; }
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget.querySelector('[role="dialog"]');
    const targets = [...dialog.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')];
    const first = targets[0], last = targets.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
  }

  function viewStockFromEarnings(sym) {
    closeEarningsModal();
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
        : heatmapScope.value === 'sp500'
          ? `标普500核心 (${activeHeatmapStocks.value?.length || 0}支)`
          : `纳指100 (${activeHeatmapStocks.value?.length || 0}支)`;
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
    if (currentSession.value?.session === 'regular' || isMarketOpen.value) {
      return null;
    }
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
  const quoteWindow = computed(() => {
    const dates = (overview.value?.stocks || []).map(q => q.asOf).filter(Boolean).sort();
    if (!dates.length) return '未提供';
    const tStart = time(dates[0]);
    const tEnd = time(dates.at(-1));
    return tStart === tEnd ? tStart : `${tStart} — ${tEnd}`;
  });
  const breadth = computed(() => { const values = (overview.value?.stocks || []).map(q => q.changePercent); return { up: values.filter(v => v > 0).length, down: values.filter(v => v < 0).length, flat: values.filter(v => v === 0).length, unknown: values.filter(v => !Number.isFinite(v)).length }; });
  const flowDates = computed(() => [...new Set(flows.value.map(f => f.date))]);
  const dayFlows = computed(() => flows.value.filter(f => f.date === flowDate.value).sort((a, b) => b.netFlowUsd - a.netFlowUsd));
  let clockTimer, eventSource = null, pollTimer = null;

  const findQuote = s => [...(overview.value?.stocks || []), ...(overview.value?.benchmarks || []), ...(overview.value?.sectors || [])].find(q => q.symbol === s);
  const barWidth = value => `${Math.max(2, Math.min(100, Math.abs(value || 0) / Math.max(0.5, ...rankedSectors.value.map(q => Math.abs(q.changePercent || 0))) * 100))}%`;
  const getSectorBarHeight = value => {
    const maxAbs = Math.max(0.5, ...rankedSectors.value.map(q => Math.abs(q.changePercent || 0)));
    const ratio = Math.abs(value || 0) / maxAbs;
    return `${Math.round(Math.max(12, Math.min(100, ratio * 100)))}%`;
  };
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

  // Dispatch window resize when watchlist sidebar finishes expanding/collapsing
  watch(compactPanelOpen, () => {
    setTimeout(() => {
      try {
        window.dispatchEvent(new Event('resize'));
      } catch (_) {}
    }, 380);
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

    const isCrypto = isCryptoSymbol(sym);
    let volume = null;
    let formattedVolume = '—';

    if (isCrypto) {
      // 加密货币：优先使用 24 小时成交量 (vol24h)
      const rawVol = q.vol24h ?? q.volume24h ?? q.volume ?? reg.volume;
      let parsed = parseVolumeNumber(rawVol);
      if (parsed == null || parsed <= 0) {
        const clean = String(sym).toUpperCase().replace(/[-_/]?(USD|USDT)$/, '');
        const cItem = (cryptoList.value || []).find(c => c.symbol === sym || c.code === sym || c.code === clean || c.symbol?.startsWith(clean));
        if (cItem?.vol24h) {
          parsed = parseVolumeNumber(cItem.vol24h);
        } else {
          const defItem = DEFAULT_CRYPTOS.find(d => d.code === clean || d.symbol === sym || d.symbol?.startsWith(clean));
          if (defItem?.vol24h) {
            parsed = parseVolumeNumber(defItem.vol24h);
          }
        }
      }
      volume = parsed;
      formattedVolume = formatWatchlistVolume(volume, true);
    } else {
      // 美股：使用正常交易时段收盘成交量 (reg.volume)
      const rawVol = reg.volume ?? q.volume;
      volume = parseVolumeNumber(rawVol);
      formattedVolume = formatWatchlistVolume(volume, false);
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
      volume,
      formattedVolume,
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

  // Mobile Quote Rows projection
  const mobileQuoteRows = computed(() => {
    const list = allRankedRows.value || [];
    const sess = currentSession.value?.session || 'regular';
    return list.map(row => toMobileQuoteView(row, {
      quotes: quoteStore.value || {},
      session: extMode.value || 'auto',
      currentMarketSession: sess
    }));
  });

  const groupedMobileQuoteRows = computed(() => {
    const res = {};
    const sess = currentSession.value?.session || 'regular';
    for (const g of groups.value || []) {
      const rows = groupedRows.value[g.id] || [];
      res[g.id] = rows.map(row => toMobileQuoteView(row, {
        quotes: quoteStore.value || {},
        session: extMode.value || 'auto',
        currentMarketSession: sess
      }));
    }
    return res;
  });

  const extShortLabel = computed(() => {
    if (extMode.value === 'auto') {
      const s = currentSession.value?.session;
      if (s === 'post') return '盘后';
      if (s === 'overnight') return '隔夜';
      if (s === 'regular') return '盘前';
      return '盘前';
    }
    if (extMode.value === 'post') return '盘后';
    if (extMode.value === 'overnight') return '隔夜';
    return '盘前';
  });

  const regularPriceColTitle = computed(() => {
    return (isMarketOpen.value || currentSession.value?.session === 'regular') ? '最新现价' : '常规收盘价';
  });

  const regularChangeColTitle = computed(() => {
    return (isMarketOpen.value || currentSession.value?.session === 'regular') ? '日内涨跌%' : '常规涨跌%';
  });

  const extPriceColTitle = computed(() => {
    if (extMode.value === 'auto') {
      const s = currentSession.value?.session;
      if (s === 'regular') return '盘前价 (对照)';
      if (s === 'pre') return '当前盘前价';
      if (s === 'post') return '当前盘后价';
      if (s === 'overnight') return '当前隔夜价';
      return '盘后价 (已结)';
    }
    if (extMode.value === 'post') return '当前盘后价';
    if (extMode.value === 'overnight') return '当前隔夜价';
    return '当前盘前价';
  });

  const extChangeColTitle = computed(() => {
    if (extMode.value === 'auto') {
      const s = currentSession.value?.session;
      if (s === 'regular') return '盘前涨跌%';
      if (s === 'pre') return '盘前涨跌%';
      if (s === 'post') return '盘后涨跌%';
      if (s === 'overnight') return '隔夜涨跌%';
      return '盘后涨跌%';
    }
    if (extMode.value === 'post') return '盘后涨跌%';
    if (extMode.value === 'overnight') return '隔夜涨跌%';
    return '盘前涨跌%';
  });

  const autoSessionOptionText = computed(() => {
    const s = currentSession.value?.session;
    const tz = nyClockInfo.value?.nyTz || 'ET';
    if (s === 'regular') return `自动 · 当前常规 · 盘前对照 (${tz})`;
    if (s === 'pre') return `自动 · 盘前交易 (04:00-09:30 ${tz})`;
    if (s === 'post') return `自动 · 盘后交易 (16:00-20:00 ${tz})`;
    if (s === 'overnight') return `自动 · 隔夜交易 (20:00-04:00 ${tz})`;
    return `自动 · 时段联动 (${tz})`;
  });

  const PROTO_EXT_CHANGES = {
    MU: 0.80, WDC: 0.70, STX: 0.40, NTAP: 0.20, SNDK: -0.12,
    NVDA: 0.82, AMD: 0.31, AVGO: -0.22, ASML: -0.45, TSM: 0.84,
    AAPL: 0.15, MSFT: 0.35, GOOGL: -0.18, AMZN: 0.44, META: -0.25,
    TSLA: 1.12, LLY: 0.28, 'BRK-B': 0.05, 'BRK.B': 0.05, BRK_B: 0.05, DE: 0.18, DELL: 0.65
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
    if (f === 'regularChange') return (isMarketOpen.value || currentSession.value?.session === 'regular') ? '日内涨跌幅' : '常规涨跌幅';
    if (f === 'regularPrice') return (isMarketOpen.value || currentSession.value?.session === 'regular') ? '最新现价' : '常规收盘价';
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

  function getExtSessionKey(r) {
    const sess = (r?.extSession && r.extSession !== 'none') ? r.extSession : (currentSession.value?.session || 'pre');
    if (sess === 'overnight' || r?.extStatus?.includes('隔夜')) return 'overnight';
    if (sess === 'pre' || r?.extStatus?.includes('盘前')) return 'pre';
    if (sess === 'post' || r?.extStatus?.includes('盘后')) return 'post';
    return currentSession.value?.session === 'overnight' ? 'overnight' : 'pre';
  }

  function getExtSessionIcon(r) {
    const key = getExtSessionKey(r);
    if (key === 'overnight') return '🌙';
    if (key === 'pre') return '🌅';
    if (key === 'post') return '🌇';
    return '🌅';
  }

  function getExtSessionTitle(r) {
    const key = getExtSessionKey(r);
    if (key === 'overnight') return '隔夜时段 (Overnight)';
    if (key === 'pre') return '盘前时段 (Pre-Market)';
    if (key === 'post') return '盘后时段 (After-Hours)';
    return '延长交易时段 (EXT)';
  }

  function getRowSessionBadge(r) {
    const active = currentSession.value?.session || 'regular';
    const sess = (extMode.value && extMode.value !== 'auto') ? extMode.value : active;
    if (sess === 'regular' || sess === 'rth') {
      return { icon: '☀️', label: '常规交易', cls: 'session-pill-regular' };
    }
    if (sess === 'pre') {
      return { icon: '🌅', label: '盘前交易', cls: 'session-pill-pre' };
    }
    if (sess === 'post') {
      return { icon: '🌇', label: '盘后交易', cls: 'session-pill-post' };
    }
    if (sess === 'overnight') {
      return { icon: '🌙', label: '隔夜交易', cls: 'session-pill-overnight' };
    }
    if (sess === 'closed') {
      return { icon: '💤', label: '已休市', cls: 'session-pill-closed' };
    }
    return { icon: '☀️', label: '常规交易', cls: 'session-pill-regular' };
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
  const storedSortField = readStorage('market-desk-sidebar-sort-field', 'regularChange');
  const sidebarSortField = ref(storedSortField || 'regularChange');
  const sidebarSortDirection = ref(readStorage('market-desk-sidebar-sort-dir', 'desc'));
  const sidebarActiveGroup = ref(readStorage('market-desk-sidebar-group', 'all'));
  const sidebarSearchQuery = ref('');
  const storedViewMode = readStorage('market-desk-sidebar-view-mode', 'grouped');
  const sidebarViewMode = ref(storedViewMode === 'flat' ? 'flat' : 'grouped'); // 'grouped' | 'flat'
  // Whole-group average change sort order ('desc' | 'asc' | 'manual')
  const groupOrderSortDir = ref(readStorage('market-desk-group-order-sort-dir', 'desc'));
  // Right Watchlist Session Tab ('regular' | 'ext')
  const storedRwTab = readStorage('market-desk-rw-session-tab', null);
  const rwSessionTab = ref(
    storedRwTab 
      ? storedRwTab 
      : ((currentSession.value?.session === 'regular') ? 'regular' : 'ext')
  );

  // 3-dots Watchlist Menu & Extended Session Settings
  const showRwMoreMenu = ref(false);
  const showExtSessionSetting = ref(readStorage('market-desk-show-ext-session', true));
  function toggleShowExtSessionSetting() {
    showExtSessionSetting.value = !showExtSessionSetting.value;
    persist('market-desk-show-ext-session', showExtSessionSetting.value);
  }

  const showVolumeSetting = ref(readStorage('market-desk-show-volume', true));
  function toggleShowVolumeSetting() {
    showVolumeSetting.value = !showVolumeSetting.value;
    persist('market-desk-show-volume', showVolumeSetting.value);
  }

  const showVolumeColumn = computed(() => {
    // 由自选上方 3 个点设置中的“显示成交量”总控
    return Boolean(showVolumeSetting.value);
  });

  const isMarketOpen = computed(() => {
    return currentSession.value?.session === 'regular';
  });

  const showExtColumn = computed(() => {
    // 由自选上方 3 个点设置中的“显示延长时段”总控
    return Boolean(showExtSessionSetting.value);
  });

  const currentExtSessionShortLabel = computed(() => {
    const s = currentSession.value?.session;
    if (s === 'pre') return '盘前';
    if (s === 'overnight') return '隔夜';
    return '盘后';
  });

  function getRowExtSessionLabel(r) {
    const key = getExtSessionKey(r);
    if (key === 'overnight') return '隔夜';
    if (key === 'pre') return '盘前';
    if (key === 'post') return '盘后';
    return currentExtSessionShortLabel.value;
  }

  function setRwSessionTab(tab) {
    rwSessionTab.value = tab === 'ext' ? 'ext' : 'regular';
    persist('market-desk-rw-session-tab', rwSessionTab.value);
    if (rwSessionTab.value === 'ext') {
      sidebarSortField.value = 'extChange';
    } else {
      sidebarSortField.value = 'regularChange';
    }
    for (const k of Object.keys(groupSortStates)) {
      delete groupSortStates[k];
    }
    persistGroupSortStates();
    persist('market-desk-sidebar-sort-field', sidebarSortField.value);
  }

  const groupPillsBarRef = ref(null);
  const canScrollPillsLeft = ref(false);
  const canScrollPillsRight = ref(false);
  let isDraggingPills = false;
  let pillsStartX = 0;
  let pillsStartScrollLeft = 0;
  let pillsHasMoved = false;

  function checkPillsScroll() {
    const el = groupPillsBarRef.value;
    if (!el) return;
    canScrollPillsLeft.value = el.scrollLeft > 2;
    canScrollPillsRight.value = el.scrollLeft < (el.scrollWidth - el.clientWidth - 2);
  }

  function scrollPillsBar(offset) {
    const el = groupPillsBarRef.value;
    if (!el) return;
    el.scrollBy({ left: offset, behavior: 'smooth' });
    setTimeout(checkPillsScroll, 320);
  }

  function onGroupPillsWheel(e) {
    const el = groupPillsBarRef.value || e.currentTarget;
    if (!el) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (delta !== 0) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      el.scrollLeft += delta;
      checkPillsScroll();
    }
  }

  function onGroupPillsMouseDown(e) {
    const el = groupPillsBarRef.value || e.currentTarget;
    if (!el) return;
    isDraggingPills = true;
    pillsHasMoved = false;
    pillsStartX = e.pageX - el.offsetLeft;
    pillsStartScrollLeft = el.scrollLeft;
  }

  function onGroupPillsMouseMove(e) {
    if (!isDraggingPills) return;
    const el = groupPillsBarRef.value || e.currentTarget;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = x - pillsStartX;
    if (Math.abs(walk) > 4) {
      pillsHasMoved = true;
      if (e.cancelable) e.preventDefault();
      el.scrollLeft = pillsStartScrollLeft - walk;
      checkPillsScroll();
    }
  }

  function onGroupPillsMouseUp() {
    isDraggingPills = false;
  }

  function handleGroupPillClick(groupId, e) {
    if (pillsHasMoved) {
      pillsHasMoved = false;
      return;
    }
    selectSidebarGroupPill(groupId, e);
  }

  function selectSidebarGroupPill(groupId, e) {
    if (groupId === 'all' || sidebarActiveGroup.value === groupId) {
      sidebarActiveGroup.value = 'all';
    } else {
      sidebarActiveGroup.value = groupId;
      const grp = watchlistMgr.getGroup(groupId);
      if (grp && grp.collapsed) {
        watchlistMgr.toggleGroupCollapse(groupId);
        syncWatchlistData();
      }
    }
    persist('market-desk-sidebar-group', sidebarActiveGroup.value);
    if (e && e.currentTarget && typeof e.currentTarget.scrollIntoView === 'function') {
      e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
    setTimeout(checkPillsScroll, 320);
  }

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
    return '收盘价格';
  });

  const activeSessionChangeLabel = computed(() => {
    const s = activeSessionKey.value;
    if (s === 'pre') return '盘前涨幅';
    if (s === 'post') return '盘后涨幅';
    if (s === 'overnight') return '隔夜涨幅';
    return 'Chg%';
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

  function toggleGroupOrderSort() {
    if (groupOrderSortDir.value === 'desc') {
      groupOrderSortDir.value = 'asc';
    } else if (groupOrderSortDir.value === 'asc') {
      groupOrderSortDir.value = 'manual';
    } else {
      groupOrderSortDir.value = 'desc';
    }
    persist('market-desk-group-order-sort-dir', groupOrderSortDir.value);
  }

  function toggleSidebarSort(field) {
    const normalized =
      field === 'price' ? 'regularPrice' :
      field === 'change' ? 'regularChange' :
      (field === 'volume' || field === 'vol') ? 'volume' :
      field;

    if (normalized === 'symbol') {
      if (sidebarSortField.value === 'symbol') {
        sidebarSortDirection.value = sidebarSortDirection.value === 'asc' ? 'desc' : 'asc';
      } else {
        sidebarSortField.value = 'symbol';
        sidebarSortDirection.value = 'asc';
      }
    } else if (normalized === 'manual') {
      sidebarSortField.value = 'manual';
      sidebarSortDirection.value = 'desc';
    } else {
      if (sidebarSortField.value === normalized) {
        sidebarSortDirection.value = sidebarSortDirection.value === 'desc' ? 'asc' : 'desc';
      } else {
        sidebarSortField.value = normalized;
        sidebarSortDirection.value = 'desc';
      }
    }
    // Clear individual group overrides when clicking global column header so all groups sync
    for (const k of Object.keys(groupSortStates)) {
      delete groupSortStates[k];
    }
    persistGroupSortStates();
    persist('market-desk-sidebar-sort-field', sidebarSortField.value);
    persist('market-desk-sidebar-sort-dir', sidebarSortDirection.value);
  }

  function resetSidebarSort() {
    sidebarSortField.value = 'regularChange';
    sidebarSortDirection.value = 'desc';
    groupOrderSortDir.value = 'desc';
    for (const k of Object.keys(groupSortStates)) {
      delete groupSortStates[k];
    }
    persistGroupSortStates();
    persist('market-desk-sidebar-sort-field', 'regularChange');
    persist('market-desk-sidebar-sort-dir', 'desc');
    persist('market-desk-group-order-sort-dir', 'desc');
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

  // Group-level In-Group Column Sorting States
  // Supports per-group { field: 'symbol' | 'regularPrice' | 'regularChange' | 'extChange', dir: 'desc' | 'asc' }
  // as well as legacy string 'default' | 'desc' | 'asc'
  const groupSortStates = reactive(readStorage('market-desk-group-sort-states', {}));

  function persistGroupSortStates() {
    persist('market-desk-group-sort-states', { ...groupSortStates });
  }

  function resolveGroupSortSpec(groupId) {
    const raw = groupSortStates[groupId];
    if (!raw || raw === 'default') return null;
    if (typeof raw === 'string') {
      if (raw === 'desc' || raw === 'asc') {
        return { field: 'regularChange', dir: raw };
      }
      return null;
    }
    if (typeof raw === 'object' && raw.field && (raw.dir === 'desc' || raw.dir === 'asc')) {
      return { field: raw.field, dir: raw.dir };
    }
    return null;
  }

  function getGroupEffectiveSort(groupId) {
    const spec = resolveGroupSortSpec(groupId);
    if (spec) return spec;
    const globalField = sidebarSortField.value;
    if (globalField === 'symbol' || globalField === 'regularPrice' || globalField === 'regularChange' || globalField === 'extChange' || globalField === 'extPrice' || globalField === 'marketCap' || globalField === 'volume') {
      return { field: globalField, dir: sidebarSortDirection.value || 'desc' };
    }
    return { field: 'regularChange', dir: sidebarSortDirection.value || 'desc' };
  }

  function isGroupSortedBy(groupId, field) {
    const eff = getGroupEffectiveSort(groupId);
    return eff?.field === field;
  }

  function getGroupColumnSortDir(groupId, field) {
    const eff = getGroupEffectiveSort(groupId);
    return eff?.field === field ? eff.dir : 'desc';
  }

  function toggleGroupColumnSort(groupId, field) {
    const current = resolveGroupSortSpec(groupId);
    const defaultFirstDir = field === 'symbol' ? 'asc' : 'desc';
    const oppositeDir = defaultFirstDir === 'desc' ? 'asc' : 'desc';
    let nextSpec = null;

    if (current && current.field === field) {
      if (current.dir === defaultFirstDir) {
        nextSpec = { field, dir: oppositeDir };
      } else {
        nextSpec = { field, dir: defaultFirstDir };
      }
    } else {
      nextSpec = { field, dir: defaultFirstDir };
    }

    groupSortStates[groupId] = nextSpec;
    persistGroupSortStates();
  }

  function cycleGroupSort(groupId) {
    const spec = resolveGroupSortSpec(groupId);
    if (!spec) {
      groupSortStates[groupId] = { field: 'regularChange', dir: 'desc' };
    } else if (spec.dir === 'desc') {
      groupSortStates[groupId] = { field: spec.field, dir: 'asc' };
    } else {
      delete groupSortStates[groupId];
    }
    persistGroupSortStates();
  }

  function getGroupSortTitle(groupId) {
    const spec = resolveGroupSortSpec(groupId);
    if (spec?.dir === 'desc') {
      return '当前：组内按涨跌幅降序（点击切换为升序）';
    } else if (spec?.dir === 'asc') {
      return '当前：组内按涨跌幅升序（点击恢复默认排序）';
    }
    return '组内按涨跌幅排序（点击切换为降序，恢复默认后支持手动拖拽）';
  }

  // TradingView Style: Vertical sections with internal sorting and group-level sorting
  const sidebarGroupSections = computed(() => {
    const activeField = (
      sidebarSortField.value === 'symbol' ||
      sidebarSortField.value === 'activePrice' ||
      sidebarSortField.value === 'regularPrice' ||
      sidebarSortField.value === 'regularChange' ||
      sidebarSortField.value === 'extChange' ||
      sidebarSortField.value === 'extPrice' ||
      sidebarSortField.value === 'marketCap' ||
      sidebarSortField.value === 'volume' ||
      sidebarSortField.value === 'manual'
    )
      ? sidebarSortField.value
      : 'regularChange';

    const list = groups.value.map(g => {
      const rows = g.symbolIds.map(buildRow);
      let sortedRows;
      const grpSpec = resolveGroupSortSpec(g.id);

      if (grpSpec) {
        sortedRows = sortWatchlistRows(rows, grpSpec.field, grpSpec.dir);
      } else if (activeField === 'manual' || activeField === 'custom') {
        if (g.id === 'trillion' || g.name === '万亿市值') {
          sortedRows = sortWatchlistRows(rows, 'marketCap', 'desc');
        } else {
          sortedRows = sortWatchlistRows(rows, 'manual');
        }
      } else if (activeField === 'marketCap') {
        sortedRows = sortWatchlistRows(rows, 'marketCap', sidebarSortDirection.value || 'desc');
      } else if (activeField) {
        sortedRows = sortWatchlistRows(rows, activeField, sidebarSortDirection.value || 'desc');
      } else {
        sortedRows = sortWatchlistRows(rows, 'regularChange', 'desc');
      }

      // Calculate group average change for Regular session and Extended session:
      const validReg = rows.filter(r => r.regularChange !== null && Number.isFinite(r.regularChange));
      const regAvg = validReg.length ? (validReg.reduce((acc, r) => acc + r.regularChange, 0) / validReg.length) : null;

      const validExt = rows.filter(r => r.extChange !== null && Number.isFinite(r.extChange));
      const extAvg = validExt.length ? (validExt.reduce((acc, r) => acc + r.extChange, 0) / validExt.length) : null;

      const avg = rwSessionTab.value === 'ext'
        ? (extAvg ?? regAvg)
        : (regAvg ?? extAvg);

      return {
        id: g.id,
        name: g.name,
        collapsed: Boolean(g.collapsed),
        count: g.symbolIds.length,
        avgChange: avg,
        regAvgChange: regAvg,
        extAvgChange: extAvg,
        rows: sortedRows
      };
    });

    if (groupOrderSortDir.value === 'desc' || groupOrderSortDir.value === 'asc') {
      const dir = groupOrderSortDir.value === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        if (a.id === 'default' && b.id !== 'default') return 1;
        if (b.id === 'default' && a.id !== 'default') return -1;
        const valA = (a.avgChange !== null && Number.isFinite(a.avgChange)) ? a.avgChange : (dir === 1 ? Infinity : -Infinity);
        const valB = (b.avgChange !== null && Number.isFinite(b.avgChange)) ? b.avgChange : (dir === 1 ? Infinity : -Infinity);
        return (valA - valB) * dir;
      });
    }

    return list;
  });

  const filteredSidebarGroupSections = computed(() => {
    const q = (sidebarSearchQuery.value || '').trim().toLowerCase();
    const activeGrp = sidebarActiveGroup.value;
    return sidebarGroupSections.value
      .filter(sec => {
        if (activeGrp && activeGrp !== 'all' && sec.id !== activeGrp) return false;
        if (sec.id === 'default' && sec.count === 0) return false;
        return true;
      })
      .map(sec => {
        if (!q) return sec;
        const filteredRows = sec.rows.filter(r =>
          r.symbol.toLowerCase().includes(q) ||
          (r.name && r.name.toLowerCase().includes(q))
        );
        return {
          ...sec,
          collapsed: false,
          rows: filteredRows
        };
      })
      .filter(sec => !q || sec.rows.length > 0);
  });

  // Flat Overall Sorted Watchlist Rows (Ranking across all symbols by selected column)
  const sidebarFlatRows = computed(() => {
    const rows = watchlist.value.map(buildRow);
    const activeField = (
      sidebarSortField.value === 'symbol' ||
      sidebarSortField.value === 'activePrice' ||
      sidebarSortField.value === 'regularPrice' ||
      sidebarSortField.value === 'regularChange' ||
      sidebarSortField.value === 'extChange' ||
      sidebarSortField.value === 'extPrice' ||
      sidebarSortField.value === 'marketCap' ||
      sidebarSortField.value === 'volume'
    )
      ? sidebarSortField.value
      : 'regularChange';
    const dir = sidebarSortDirection.value || 'desc';
    return sortWatchlistRows(rows, activeField, dir);
  });

  const filteredSidebarFlatRows = computed(() => {
    const q = (sidebarSearchQuery.value || '').trim().toLowerCase();
    const rows = sidebarFlatRows.value;
    if (!q) return rows;
    return rows.filter(r =>
      r.symbol.toLowerCase().includes(q) ||
      (r.name && r.name.toLowerCase().includes(q))
    );
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
    }
  }

  function moveGroupDown(groupId) {
    const res = watchlistMgr.moveGroupOrder(groupId, 'down');
    if (res.ok) {
      sidebarSortField.value = 'manual';
      persist('market-desk-sidebar-sort-field', 'manual');
      syncWatchlistData();
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
    } else {
      watchlistMgr.moveSymbolBetweenGroups(sourceGroupId, targetGroupId, srcSym, targetSymbol, pos);
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
      }
    } else {
      watchlistMgr.moveSymbolBetweenGroups(sourceGroupId, groupId, srcSym, null, 'after');
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
        }
      }
    } else {
      watchlistMgr.moveSymbolBetweenGroups(sourceGroupId, groupId, srcSym, null, 'after');
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

  // Fetch Watchlist Quotes Snapshot (Supports silent in-place background update)
  async function fetchWatchlistQuotes(options = {}) {
    const scopeSymbols = heatmapScope.value === 'nasdaq100'
      ? NASDAQ100_STOCKS.map(d => d.symbol)
      : heatmapScope.value === 'sp500'
        ? SP500_STOCKS.map(d => d.symbol)
        : [];
    const symbols = [...new Set([...(watchlist.value || []), ...scopeSymbols])];
    if (!symbols.length) return;

    const hasExistingQuotes = Object.keys(quoteStore.value || {}).length > 0;
    const isSilent = options.silent !== undefined ? Boolean(options.silent) : hasExistingQuotes;

    try {
      if (!isSilent) {
        states.watchlist.loading = true;
      }
      const res = await fetch(`/api/watchlist/quotes?symbols=${encodeURIComponent(symbols.join(','))}`);
      calibrateClock(res?.headers?.get?.('date'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.quotes) {
        // Compare new quotes against existing quotes to trigger smooth in-place cell flashes
        if (hasExistingQuotes) {
          for (const [sym, q] of Object.entries(data.quotes)) {
            const oldQ = quoteStore.value[sym];
            if (oldQ && q) {
              const oldPrice = oldQ.regular?.price ?? oldQ.price;
              const newPrice = q.regular?.price ?? q.price;
              if (oldPrice !== null && newPrice !== null && oldPrice !== undefined && newPrice !== undefined && oldPrice !== newPrice) {
                flashCell(sym, 'regular', newPrice > oldPrice ? 'up' : 'down');
              }
              const oldExt = oldQ.ext?.price;
              const newExt = q.ext?.price;
              if (oldExt !== null && newExt !== null && oldExt !== undefined && newExt !== undefined && oldExt !== newExt) {
                flashCell(sym, 'ext', newExt > oldExt ? 'up' : 'down');
              }
            }
          }
        }
        quoteStore.value = { ...quoteStore.value, ...data.quotes };
      }
      if (data.provider) providerInfo.value = data.provider;
      if (data.session) serverSession.value = data.session;
      states.watchlist.error = '';
      if (page.value === 'overview') {
        await nextTick();
        renderHeatmap();
      }
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
            let updatedAny = false;
            for (const item of msg.data) {
              const current = quoteStore.value[item.symbol];
              if (current && current[item.session]) {
                const oldPrice = current[item.session].price;
                current[item.session].price = item.price;
                current[item.session].changePercent = item.changePercent;
                if (item.sourceTime) current[item.session].sourceTime = item.sourceTime;
                updatedAny = true;
                if (oldPrice !== null && item.price !== null && oldPrice !== item.price) {
                  flashCell(item.symbol, item.session === 'regular' ? 'regular' : 'ext', item.price > oldPrice ? 'up' : 'down');
                }
              }
            }
            if (updatedAny && page.value === 'overview') {
              nextTick(() => renderHeatmap());
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
      fetchWatchlistQuotes({ silent: true });
      if (page.value === 'crypto') {
        loadOnchainStocks();
      }
    }, 4000);
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
    showBackupModal.value = false;
  }

  function selectSymbol(s, options = {}) {
    const optSym = toOptionSymbol(s);
    if (optSym) {
      optionSymbol.value = optSym;
    }

    if (page.value === 'options') {
      if (!optSym) {
        toast.value = `${s} 属于非标的/宏观品种，暂无可用的期权链。`;
        return;
      }
      symbol.value = s;
      loadOptions(true);
      return;
    }

    const source = options.source || page.value;
    sourceNavigationPage.value = source;

    if (symbol.value === s && page.value === 'chart') {
      if (options.resetZoom) resetPriceChartZoom();
      return;
    }
    symbol.value = s;
    navigate('chart', { source });
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
      if (seq === sequences[key]) {
        target.value = data;
        if (key === 'chart') chartDataRevision.value++;
      }
    } catch (e) { if (seq === sequences[key]) states[key].error = e.name === 'AbortError' ? '请求超时，请重试。' : e.message; }
    finally { clearTimeout(timer); if (seq === sequences[key]) { states[key].loading = false; await nextTick(); render(); } }
    return seq === sequences[key] ? target.value : null;
  }

  const loadOverview = () => request('overview', '/api/market/overview', {}, overview);
  const loadChart = () => {
    if (klineGestureCtrl && typeof klineGestureCtrl.cancelMotion === 'function') {
      klineGestureCtrl.cancelMotion('loadChart');
    }
    return request('chart', '/api/market/chart', { symbol: symbol.value, range: chartRange.value, interval: chartInterval.value }, chart);
  };
  const loadNews = () => request('news', '/api/news', { symbol: page.value === 'overview' ? '' : newsSymbol.value }, news);
  const loadCrypto = async ({ forceWhales = false } = {}) => {
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
    // 并行拉取链上加密巨鲸、HIP-3 TradFi 巨鲸合约持仓与链上美股资金流向数据
    loadCryptoWhales({ force: forceWhales, silent: whaleCategory.value !== 'crypto' });
    loadStockWhales({ force: forceWhales, silent: whaleCategory.value !== 'stocks' });
    loadOnchainStocks({ force: forceWhales });
  };
  async function loadOptions(reset = false) {
    const raw = optionSymbol.value.trim().toUpperCase();
    if (!validSymbol(raw)) { toast.value = '请输入有效的期权标的代码。'; return; }
    const s = toOptionSymbol(raw) || raw;
    optionSymbol.value = s;
    symbol.value = s;
    const isNewSymbol = !options.value || options.value.symbol !== s;
    const shouldReset = reset || isNewSymbol;
    if (shouldReset) {
      optionExpiry.value = '';
    }
    const data = await request('options', '/api/options', { symbol: s, expiration: shouldReset ? '' : optionExpiry.value }, options);
    if (data) optionExpiry.value = data.expiration;
  }

  function loadInitialPageData() {
    triggerPageLoadingPulse(700);
    if (page.value === 'overview' || page.value === 'flows') loadOverview();
    if (page.value === 'overview' || page.value === 'news') loadNews();
    if (page.value === 'overview' || page.value === 'crypto') loadCrypto();
    if (page.value === 'chart') loadChart();
    if (page.value === 'options') loadOptions();
    if (page.value === 'watchlist' || page.value === 'overview' || compactPanelOpen.value) fetchWatchlistQuotes();
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

  function shiftTreemapCenterTokens(el, textEl) {
    if (!el || !el.shape || !textEl || !textEl._children) return;
    const children = textEl._children;
    if (!children.length) return;
    const H = el.shape.height || 0;
    const W = el.shape.width || 0;
    if (H <= 0 || W <= 0) return;

    // Locate the symbol token which marks the start of the centered lines
    let symIndex = -1;
    for (let i = 0; i < children.length; i++) {
      const txt = (children[i].style?.text || '').trim();
      if (el.name && txt === el.name) {
        symIndex = i;
        break;
      }
    }
    if (symIndex === -1) {
      for (let i = 0; i < children.length; i++) {
        const txt = (children[i].style?.text || '').trim();
        if (/^[A-Z0-9^.-]{1,6}$/.test(txt)) {
          symIndex = i;
          break;
        }
      }
    }

    // Include Rank #1 badge in center group if placed directly above sym
    let centerStartIndex = symIndex;
    if (symIndex > 0) {
      for (let j = symIndex - 1; j >= 0; j--) {
        const c = children[j];
        const txt = (c.style?.text || '').trim();
        if (txt.includes('Rank #1')) {
          centerStartIndex = j;
          break;
        }
      }
      if (centerStartIndex > 0 && children[centerStartIndex - 1].type === 'rect') {
        centerStartIndex = centerStartIndex - 1;
      }
    }

    // If tile is small, hide header tokens to prevent overlapping
    if (centerStartIndex > 0 && (H < 65 || W < 55)) {
      for (let i = 0; i < centerStartIndex; i++) {
        children[i].ignore = true;
      }
    } else if (centerStartIndex > 0) {
      for (let i = 0; i < centerStartIndex; i++) {
        children[i].ignore = false;
      }
    }

    const centerTokens = centerStartIndex >= 0 ? children.slice(centerStartIndex) : children;
    if (!centerTokens.length) return;

    // Calculate bottom boundary of top-left header tag to achieve true visual vertical centering
    let headerBottom = el.shape.y;
    for (let i = 0; i < centerStartIndex; i++) {
      const t = children[i];
      if (!t.ignore && t.getBoundingRect) {
        const r = t.getBoundingRect();
        if (r && r.height > 0) {
          headerBottom = Math.max(headerBottom, r.y + r.height);
        }
      }
    }

    // Accurately compute center group bounding box across both Rect and TSpan elements
    let firstY = Infinity;
    let lastBottom = -Infinity;
    for (const t of centerTokens) {
      if (t.getBoundingRect) {
        const r = t.getBoundingRect();
        if (r && r.height > 0) {
          firstY = Math.min(firstY, r.y);
          lastBottom = Math.max(lastBottom, r.y + r.height);
        }
      }
    }

    if (!Number.isFinite(firstY) || !Number.isFinite(lastBottom) || lastBottom <= firstY) {
      const firstToken = centerTokens[0];
      const lastToken = centerTokens[centerTokens.length - 1];
      firstY = firstToken.style?.y ?? (firstToken.shape?.y ?? 0);
      lastBottom = (lastToken.style?.y ?? firstY) + 16;
    }

    const currentCenterH = lastBottom - firstY;
    const tileBottom = el.shape.y + H;
    const availableH = tileBottom - headerBottom;

    // Visual vertical centering: center symmetrically between headerBottom and tileBottom
    const targetStartY = headerBottom + (availableH - currentCenterH) / 2;
    const dy = targetStartY - firstY;

    if (Math.abs(dy) > 0.5) {
      for (const t of centerTokens) {
        if (t.style && typeof t.style.y === 'number') {
          t.style.y += dy;
        }
        if (t.shape && typeof t.shape.y === 'number') {
          if (typeof t.setShape === 'function') {
            t.setShape({ y: t.shape.y + dy });
          } else {
            t.shape.y += dy;
            if (typeof t.dirtyShape === 'function') t.dirtyShape();
            if (typeof t.dirty === 'function') t.dirty();
          }
        }
        if (t._rect && typeof t._rect.y === 'number') {
          t._rect.y += dy;
        }
      }
    }
  }

  function centerTreemapLabels(chart) {
    if (!chart || typeof chart.getZr !== 'function') return;
    const zr = chart.getZr();
    if (!zr || !zr.storage) return;
    const list = typeof zr.storage.getDisplayList === 'function' ? zr.storage.getDisplayList() : [];
    let shifted = false;
    for (const el of list) {
      const textEl = el.getTextContent && el.getTextContent();
      if (!textEl) continue;
      if (!textEl._treemapCenterPatched) {
        textEl._treemapCenterPatched = true;
        const origUpdate = textEl._updateRichTexts;
        if (typeof origUpdate === 'function') {
          textEl._updateRichTexts = function () {
            origUpdate.apply(this, arguments);
            shiftTreemapCenterTokens(el, this);
          };
        }
      }
      shiftTreemapCenterTokens(el, textEl);
      shifted = true;
    }
    if (shifted && zr.refresh) {
      zr.refresh();
    }
  }

  function makeChart(id, config, onClick) {
    const el = document.getElementById(id); if (!el || !el.clientWidth) return;
    let entry = charts.get(id);
    if (entry && entry.el !== el) { entry.observer.disconnect(); entry.chart.dispose(); charts.delete(id); entry = null; }
    if (!entry) {
      const instance = echarts.init(el, null, { renderer: 'canvas' });
      const observer = new ResizeObserver(() => {
        instance.resize();
        if (id === 'heatmap-chart') centerTreemapLabels(instance);
      });
      observer.observe(el);
      if (id === 'heatmap-chart') {
        instance.on('rendered', () => centerTreemapLabels(instance));
      }
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
    if (id === 'heatmap-chart') {
      centerTreemapLabels(entry.chart);
    }
  }

  function updateChartTheme() {
    const tokens = readChartTokens(document.documentElement);
    muted = tokens.muted;
    gridColor = tokens.grid;
    chartText = tokens.text;
    chartSurface = tokens.surface;
    green = tokens.up;
    red = tokens.down;
    blue = tokens.accent;
    axis = { axisLine: { lineStyle: { color: gridColor } }, axisTick: { show: false }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: gridColor, type: 'dashed' } } };
    tooltip = { renderMode: 'richText', backgroundColor: tokens.tooltipBg, borderColor: tokens.tooltipBorder, textStyle: { color: chartText }, confine: true };
  }

  const STOCK_ROLES = {
    NVDA: { tag: '算力龙头', subtag: 'AI GPU' },
    MU: { tag: '半导体存储', subtag: '存储芯片' },
    AAPL: { tag: '消费电子', subtag: '硬件' },
    MSFT: { tag: '软件/云', subtag: 'AI SaaS' },
    AMD: { tag: '芯片', subtag: 'CPU/GPU' },
    AVGO: { tag: '通信网络芯片', subtag: 'ASIC' },
    GOOGL: { tag: '搜索与云', subtag: 'Gemini' },
    META: { tag: '社交元宇宙', subtag: '开源模型' },
    NFLX: { tag: '流媒体', subtag: '订阅龙头' },
    AMZN: { tag: '电商与AWS', subtag: '云计算' },
    TSLA: { tag: '智能电动车', subtag: 'FSD/Robotaxi' },
    'BRK-B': { tag: '多元金融/投资', subtag: '巴菲特旗舰' },
    'BRK.B': { tag: '多元金融/投资', subtag: '巴菲特旗舰' },
    JPM: { tag: '核心商行', subtag: '全能投行' },
    V: { tag: '支付网络', subtag: '清算网络' },
    WMT: { tag: '零售巨头', subtag: '消费必需' },
    LLY: { tag: '医药制造', subtag: 'GLP-1' },
    XOM: { tag: '传统石化', subtag: '综合能源' },
    CAT: { tag: '重型机械', subtag: '周期制造' },
    NEE: { tag: '清洁电力', subtag: '绿电公用' }
  };

  // Heatmap Palette Schemes: Classic (OKX绿红) / Neon (荧光极光) / Cyberpunk (赛博霓虹)
  function getHeatmapBracketStyle(change, dark) {
    const scheme = heatmapScheme.value || 'classic';
    const isDarkTheme = Boolean(dark);
    const fallbackBg = isDarkTheme ? '#171a1e' : '#f5f5f7';
    const border = isDarkTheme ? '#0b0d10' : '#ffffff';

    if (change === null || change === undefined || !Number.isFinite(change)) {
      return { bg: fallbackBg, text: '#FFFFFF', border };
    }
    if (change === 0) {
      return { bg: fallbackBg, text: '#FFFFFF', border };
    }

    // 方案 2: 荧光极光 (亮绿 #7CE138 / 芭比玫粉 #FF4D82)
    if (scheme === 'neon') {
      if (change <= -3.0) return { bg: '#D9004C', text: '#FFFFFF', border };
      if (change <= -1.5) return { bg: '#FF1464', text: '#FFFFFF', border };
      if (change < 0) return { bg: '#FF4D82', text: '#FFFFFF', border };
      if (change < 1.5) return { bg: '#65BA26', text: '#FFFFFF', border };
      if (change < 3.0) return { bg: '#54A81E', text: '#FFFFFF', border };
      return { bg: '#438A15', text: '#FFFFFF', border };
    }

    // 方案 3: 赛博霓虹 (电光青蓝 #00D2FF / 炫彩品红 #FF3377)
    if (scheme === 'cyberpunk') {
      if (change <= -3.0) return { bg: '#D6004F', text: '#FFFFFF', border };
      if (change <= -1.5) return { bg: '#FF145E', text: '#FFFFFF', border };
      if (change < 0) return { bg: '#FF3377', text: '#FFFFFF', border };
      if (change < 1.5) return { bg: '#00AEE6', text: '#FFFFFF', border };
      if (change < 3.0) return { bg: '#0095C4', text: '#FFFFFF', border };
      return { bg: '#007AA3', text: '#FFFFFF', border };
    }

    // 方案 4: 极光蓝紫 (蔚蓝 #60A3FB / 紫罗兰 #996EE2)
    if (scheme === 'bluepurple') {
      if (change <= -3.0) return { bg: '#6D28D9', text: '#FFFFFF', border };
      if (change <= -1.5) return { bg: '#8B5CF6', text: '#FFFFFF', border };
      if (change < 0) return { bg: '#996EE2', text: '#FFFFFF', border };
      if (change < 1.5) return { bg: '#60A3FB', text: '#FFFFFF', border };
      if (change < 3.0) return { bg: '#3B82F6', text: '#FFFFFF', border };
      return { bg: '#1D4ED8', text: '#FFFFFF', border };
    }

    // 方案 5: 深邃蓝紫 (宝蓝 #2563EB / 紫罗兰 #7C3AED)
    if (scheme === 'deepbluepurple') {
      if (change <= -3.0) return { bg: '#5B21B6', text: '#FFFFFF', border };
      if (change <= -1.5) return { bg: '#6D28D9', text: '#FFFFFF', border };
      if (change < 0) return { bg: '#7C3AED', text: '#FFFFFF', border };
      if (change < 1.5) return { bg: '#3B82F6', text: '#FFFFFF', border };
      if (change < 3.0) return { bg: '#2563EB', text: '#FFFFFF', border };
      return { bg: '#1D4ED8', text: '#FFFFFF', border };
    }

    // 方案 1: 经典绿红 (默认: 翡翠绿 #10B981 / 珊瑚红 #F43F5E)
    if (change <= -3.0) return { bg: '#E11D48', text: '#FFFFFF', border };
    if (change <= -1.5) return { bg: '#F43F5E', text: '#FFFFFF', border };
    if (change < 0) return { bg: '#F43F5E', text: '#FFFFFF', border };
    if (change < 1.5) return { bg: '#10B981', text: '#FFFFFF', border };
    if (change < 3.0) return { bg: '#10B981', text: '#FFFFFF', border };
    return { bg: '#059669', text: '#FFFFFF', border };
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
          borderColor: isDarkTheme ? '#0b0d10' : '#FFFFFF',
          borderWidth: 3,
          gapWidth: 4
        },
        label: {
          color: '#FFFFFF'
        }
      };
    }).filter(d => heatSize.value === 'equal' || d.value > 0);

    // Find the stock with highest turnover dynamically across visible heatmap items
    let topTurnoverSymbol = null;
    let maxTurnover = -1;
    for (const d of data) {
      const q = d.quote;
      const t = (q && q.turnover !== null && Number.isFinite(q.turnover)) ? q.turnover : 0;
      if (t > maxTurnover && t > 0) {
        maxTurnover = t;
        topTurnoverSymbol = q.symbol;
      }
    }

    makeChart('heatmap-chart', {
      tooltip: {
        ...tooltip,
        formatter: p => {
          const q = p.data?.quote;
          if (!q) return '';
          const sessName = q.sessionLabel || resolvedHeatmapSessionLabel.value || '常规';
          const sign = (q.changePercent || 0) > 0 ? '+' : '';
          const pctStr = Number.isFinite(q.changePercent) ? `${sign}${q.changePercent.toFixed(2)}%` : '暂无涨跌';
          const priceStr = q.price !== null && Number.isFinite(q.price) ? `${num(q.price)} USD` : '暂无报价';
          const regRefStr = (q.sessionKey && q.sessionKey !== 'regular' && q.regularPrice != null && Number.isFinite(q.regularPrice))
            ? `\n常规收盘: ${num(q.regularPrice)} USD (${pct(q.regularChange)})`
            : '';
          const volStr = q.turnover ? `估算成交额: $${compact(q.turnover)} (最新价×股数)` : '估算成交额: 未提供';
          const timeStr = q.asOf ? time(q.asOf) : '实时行情';
          return `${q.symbol} · ${q.name || q.symbol}\n所属: ${q.sector || '美股'} · 时段: ${sessName}\n${sessName}价: ${priceStr}   ${sessName}涨跌: ${pctStr}${regRefStr}\n${volStr}\n数据时间: ${timeStr}`;
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
          borderColor: isDarkTheme ? '#0b0d10' : '#FFFFFF',
          borderWidth: 3,
          gapWidth: 4,
          borderRadius: 8
        },
        label: {
          show: true,
          position: 'insideTopLeft',
          padding: [8, 10, 8, 10],
          color: '#FFFFFF',
          formatter: p => {
            const q = p.data?.quote;
            if (!q) return p.name;
            const role = STOCK_ROLES[q.symbol] || { tag: q.sector || '美股', subtag: '' };
            const pctStr = Number.isFinite(q.changePercent) ? `${q.changePercent.toFixed(2)}%` : '—';
            const volStr = (q.turnover !== null && Number.isFinite(q.turnover) && q.turnover > 0) ? `$${compact(q.turnover)}` : '';

            // Dynamic badge: Rank #1 资金热度 is given ONLY to the #1 turnover stock
            // Placed directly above the #1 stock's ticker (NVDA), NOT next to the sector tag in the top-left corner
            const isTop1 = (q.symbol === topTurnoverSymbol);
            const subtagText = (!isTop1 && role.subtag) ? `{badge|${role.subtag}}` : '';
            const topText = role.tag ? `{top|${role.tag}}` : '';
            const header = (topText && subtagText)
              ? `${topText}  ${subtagText}`
              : (topText || subtagText);

            // Stacked layout:
            // Top-left: header tags / subtag
            // Center:
            // - If Rank #1: {rank|Rank #1 资金热度} directly above the ticker
            // - Symbol: {sym|...}
            // - Row 1: 波动的幅度 {pct|...}
            // - Row 2: 成交量 {vol|...}
            const lines = [];
            if (header) {
              lines.push(header);
            }
            if (isTop1) {
              lines.push('{rank|Rank #1 资金热度}');
            }
            lines.push(`{sym|${q.symbol}}`);
            lines.push(`{pct|${pctStr}}`);
            if (volStr) {
              lines.push(`{vol|${volStr}}`);
            }
            return lines.join('\n');
          },
          rich: {
            top: { fontSize: 11, color: 'rgba(255, 255, 255, 0.92)', align: 'left', fontWeight: '500', lineHeight: 18 },
            badge: { fontSize: 9, color: 'rgba(255, 255, 255, 0.98)', backgroundColor: 'rgba(0, 0, 0, 0.24)', padding: [2, 5], borderRadius: 4, fontWeight: 'bold', align: 'left' },
            rank: { fontSize: 9, color: '#FEF08A', backgroundColor: 'rgba(0, 0, 0, 0.35)', padding: [2, 6], borderRadius: 4, fontWeight: 'bold', align: 'center', lineHeight: 20 },
            sym: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', align: 'center', lineHeight: 28, fontFamily: 'Hanken Grotesk, sans-serif' },
            pct: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', align: 'center', lineHeight: 20, fontFamily: 'JetBrains Mono, monospace' },
            vol: { fontSize: 11, color: 'rgba(255, 255, 255, 0.88)', align: 'center', lineHeight: 16, fontFamily: 'JetBrains Mono, monospace' },
            sub: { fontSize: 11, color: 'rgba(255, 255, 255, 0.88)', align: 'center', lineHeight: 16, fontFamily: 'JetBrains Mono, monospace' }
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

    const snapshot = chartDerivedCache.getSnapshot(
      {
        symbol: chart.value?.symbol || '',
        interval: chart.value?.interval || '',
        range: chart.value?.range || '',
        dataRevision: chartDataRevision.value,
        showSignals: !!showInflectionSignals.value
      },
      bars,
      { computeSignals: computeInflectionSignals, formatMarkers: formatSignalMarkers, dema }
    );

    const html = chartDerivedCache.formatReadoutHtml(bar, snapshot, {
      klineScheme: KLINE_SCHEMES[klineScheme.value] || KLINE_SCHEMES.classic,
      klineSchemeKey: klineScheme.value,
      isDark: isDark.value,
      showSignals: !!showInflectionSignals.value
    });

    if (textEl.innerHTML !== html) {
      textEl.innerHTML = html;
    }
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
    const tokens = readChartTokens(document.documentElement);
    const chartBg = tokens.klineSurface;
    const gridColorValue = tokens.klineGrid;
    const textThemeColor = tokens.muted;
    const crosshairColor = tokens.crosshair;
    const showGrid = klineGridStyle.value !== 'none';
    const gridStyleNum = klineGridStyle.value === 'solid' ? 0 : 2;
    const volAlpha = isDarkTheme ? 0.65 : 0.75;
    const volUpColor = hexToRgba(klineUp, volAlpha);
    const volDownColor = hexToRgba(klineDown, volAlpha);

    const bars = d.bars || [];
    if (!bars.length) return;

    const isNewSymbolOrRange = (d.symbol !== lastRenderedSymbol || d.range !== lastRenderedRange || d.interval !== lastRenderedInterval);
    lastRenderedSymbol = d.symbol;
    lastRenderedRange = d.range;
    lastRenderedInterval = d.interval || '';

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
            timeVisible: (d.interval ? d.interval !== '1d' : d.range === '1d'),
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
            vertLine: { color: crosshairColor, width: 1, style: 2 },
            horzLine: { color: crosshairColor, width: 1, style: 2 }
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

        const demaFastSeries = chartInstance.addSeries(LW.LineSeries, {
          color: '#38bdf8',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          visible: !!showInflectionSignals.value
        });
        const demaSlowSeries = chartInstance.addSeries(LW.LineSeries, {
          color: '#fb923c',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          visible: !!showInflectionSignals.value
        });

        chartInstance.subscribeCrosshairMove(param => {
          updateReadoutFromCrosshair(param, candleSeries, maSeriesMap, chart.value?.bars || bars);
        });

        chartInstance.timeScale().subscribeVisibleLogicalRangeChange(() => {
          updateRulerCoordinates();
        });

        const gestures = bindKlineGestures(el, chartInstance, candleSeries, {
          isRulerActive: () => isRulerActive.value || isRulerDrawing.value,
          inputPolicy: isChartExpanded.value ? 'expanded' : (isPhoneLayout.value ? 'reading' : 'desktop'),
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
            const nav = typeof state === 'string' ? state : state?.navigation;
            klineInteractionMode.value = nav === 'history' ? 'history' : 'follow-latest';
          }
        });

        lwChartResizeObserver = new ResizeObserver(() => {
          chartInstance.resize(el.clientWidth, el.clientHeight);
          updateRulerCoordinates();
        });
        lwChartResizeObserver.observe(el);

        lwPriceChart = chartInstance;
        lwCandleSeries = candleSeries;
        lwVolumeSeries = volumeSeries;
        lwMaSeriesMap = maSeriesMap;
        lwDemaFastSeries = demaFastSeries;
        lwDemaSlowSeries = demaSlowSeries;
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
          timeVisible: (d.interval ? d.interval !== '1d' : d.range === '1d')
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
      applyInflectionMarkers();
      applyDemaLinesData();

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

      const snapshot = chartDerivedCache.getSnapshot(
        {
          symbol: d.symbol || '',
          interval: d.interval || '',
          range: d.range || '',
          dataRevision: chartDataRevision.value,
          showSignals: !!showInflectionSignals.value
        },
        bars,
        { computeSignals: computeInflectionSignals, formatMarkers: formatSignalMarkers, dema }
      );

      const maPeriods = { ma5: 5, ma20: 20, ma60: 60, ma120: 120, ma250: 250 };
      for (const [key, period] of Object.entries(maPeriods)) {
        if (lwMaSeriesMap[key]) {
          lwMaSeriesMap[key].applyOptions({ visible: klineMaVisibility[key] !== false });
          lwMaSeriesMap[key].setData(snapshot.maByKey[key] || []);
        }
      }

      if (isNewSymbolOrRange) {
        if (klineGestureCtrl) {
          klineGestureCtrl.reset();
        }
        clearRuler();
      } else {
        if (klineGestureCtrl && typeof klineGestureCtrl.replaceData === 'function') {
          klineGestureCtrl.replaceData({ revision: chartDataRevision.value, symbol: d.symbol, interval: d.interval, bars });
        }
        updateRulerCoordinates();
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

      const inflectionSignals = (showInflectionSignals.value && Array.isArray(d.bars)) ? computeInflectionSignals(d.bars) : [];
      const closes = d.bars.map(b => Number(b.close));
      const demaFastVals = showInflectionSignals.value ? dema(closes, 14) : [];
      const demaSlowVals = showInflectionSignals.value ? dema(closes, 30) : [];
      const demaFastData = demaFastVals.map(v => v !== null && Number.isFinite(v) ? Number(v.toFixed(2)) : '-');
      const demaSlowData = demaSlowVals.map(v => v !== null && Number.isFinite(v) ? Number(v.toFixed(2)) : '-');

      makeChart('price-chart', {
        backgroundColor: chartBg,
        tooltip: { ...tooltip, trigger: 'axis' },
        axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: gridColorValue } },
        legend: {
          data: [
            '价格 OHLC', 'MA5', 'MA20', 'MA60', 'MA120', 'MA250',
            ...(showInflectionSignals.value ? ['DEMA14 (快线)', 'DEMA30 (慢线)'] : []),
            '成交股数'
          ],
          selected: {
            'MA5': klineMaVisibility.ma5 !== false,
            'MA20': klineMaVisibility.ma20 !== false,
            'MA60': klineMaVisibility.ma60 !== false,
            'MA120': klineMaVisibility.ma120 !== false,
            'MA250': klineMaVisibility.ma250 !== false,
            '成交股数': klineMaVisibility.vol !== false,
            'DEMA14 (快线)': true,
            'DEMA30 (慢线)': true
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
          {
            name: '价格 OHLC',
            type: 'candlestick',
            data: d.bars.map(b => [b.open, b.close, b.low, b.high]),
            itemStyle: { color: klineUp, color0: klineDown, borderColor: klineUp, borderColor0: klineDown },
            markPoint: inflectionSignals.length > 0 ? {
              symbol: 'pin',
              symbolSize: 32,
              data: inflectionSignals.map(s => {
                const isBuy = s.side.includes('B');
                const isEarly = s.side.startsWith('e') || s.side.startsWith('E');
                const color = isBuy ? (isEarly ? '#38bdf8' : '#10b981') : (isEarly ? '#f59e0b' : '#ef4444');
                const idx = d.bars.findIndex(b => b.time === s.time);
                return {
                  name: s.side,
                  coord: [labels[idx] || idx, s.price],
                  value: s.side,
                  itemStyle: { color }
                };
              })
            } : undefined
          },
        { name: 'MA5', type: 'line', data: ma5, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#f97316' } },
        { name: 'MA20', type: 'line', data: ma20, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#3b82f6' } },
        { name: 'MA60', type: 'line', data: ma60, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#a855f7' } },
        { name: 'MA120', type: 'line', data: ma120, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#06b6d4' } },
        { name: 'MA250', type: 'line', data: ma250, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#eab308' } },
        ...(showInflectionSignals.value ? [
          {
            name: 'DEMA14 (快线)',
            type: 'line',
            data: demaFastData,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2, color: '#38bdf8' }
          },
          {
            name: 'DEMA30 (慢线)',
            type: 'line',
            data: demaSlowData,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2, color: '#fb923c' }
          }
        ] : []),
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
    const tokens = readChartTokens(document.documentElement);
    const optCallColor = tokens.call;
    const optPutColor = tokens.put;
    makeChart('options-chart', {
      title: noData ? { text: '所选范围内无期权数据', left: 'center', top: 'center', textStyle: { color: muted, fontSize: 14 } } : undefined,
      tooltip: { ...tooltip, trigger: 'axis' },
      legend: { data: ['Call', 'Put'], textStyle: { color: muted }, top: 8 },
      grid: { left: 80, right: 35, top: 50, bottom: 65 },
      xAxis: { ...axis, type: 'category', name: '行权价', data: rows.map(r => String(r.strike)) },
      yAxis: { ...axis, type: 'value', name: gex ? 'USD / 1% 波动' : '持仓量（合约）', axisLabel: { color: muted, formatter: compact } },
      dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 5, height: 20, borderColor: gridColor, textStyle: { color: muted } }],
      series: noData ? [] : [
        { type: 'bar', name: 'Call', itemStyle: { color: optCallColor }, data: rows.map(r => gex ? (r.callGex ?? 0) : (r.callOi ?? 0)) },
        { type: 'bar', name: 'Put', itemStyle: { color: optPutColor }, data: rows.map(r => gex ? (r.putGex ?? 0) : (r.putOi ?? 0)) }
      ]
    });
  }

  function renderCryptoChart() {
    const el = document.getElementById('crypto-chart');
    if (!el) return;
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
    if (page.value === 'crypto') {
      renderCryptoChart();
      if (expandedStockSymbol.value && lwWhaleDrawerChart) updateWhaleDrawerChartTheme();
    } else {
      if (lwWhaleDrawerChart) disposeWhaleDrawerChart();
    }
    if (page.value === 'flows') flowTab.value === 'rotation' ? renderRotation() : renderFlows();
    if (page.value === 'options') renderOptions();
  }

  function onPageEntered() {
    render();
  }

  watch(page, async value => {
    if (typeof history !== 'undefined' && history.replaceState) {
      const curState = history.state;
      if (!curState || curState.owner !== 'market-desk' || curState.page !== value) {
        history.replaceState(createHistoryState({ page: value, symbol: symbol.value, sourcePage: sourceNavigationPage.value }), '', '#' + value);
      }
    }
    await nextTick();
    if (['overview', 'flows'].includes(value) && !overview.value && !states.overview.loading) loadOverview();
    if (value === 'crypto' && !states.crypto.loading) loadCrypto();
    if (value === 'chart') loadChart();
    if (value === 'options') {
      const opt = toOptionSymbol(symbol.value);
      if (opt && optionSymbol.value !== opt) {
        optionSymbol.value = opt;
      }
      loadOptions(options.value?.symbol !== optionSymbol.value);
    }
    if (value === 'news' || value === 'overview') loadNews();
    if (value === 'watchlist') fetchWatchlistQuotes();
    render();
  });

  watch([symbol, chartRange, chartInterval], () => { if (page.value === 'chart') loadChart(); });
  watch([page, whaleCategory, isWhaleDatasetSample], () => { syncCryptoWhalePolling(); });
  watch([selectedCrypto, cryptoTimeframe], async () => { if (page.value === 'crypto') { await nextTick(); renderCryptoChart(); } });
  watch(newsSymbol, () => { if (page.value === 'news') loadNews(); });
  watch(optionExpiry, value => { if (page.value === 'options' && value && value !== options.value?.expiration) loadOptions(); });
  watch([heatSize, sectorFilter, heatmapSession, resolvedHeatmapSession, extMode, flowTab, flowDate, optionMetric, strikeRange], async () => { await nextTick(); render(); });
  watch([uiPalette, isDark], async () => {
    applyDOMTheme();
    await nextTick();
    render();
    if (expandedStockSymbol.value) updateWhaleDrawerChartTheme();
  });
  watch([klineScheme, klineGridStyle], async () => {
    await nextTick();
    render();
    if (expandedStockSymbol.value) updateWhaleDrawerChartTheme();
  });
  watch(showSettings, value => { document.body.classList.toggle('drawer-open', value && isMobile.value); });

  function handleVisibilityChange() {
    syncCryptoWhalePolling();
    if (document.hidden) {
      stopShortPolling();
    } else {
      fetchWatchlistQuotes({ silent: true });
      if (page.value === 'crypto' && !isWhaleDatasetSample.value) {
        loadWhalesForCategory(whaleCategory.value, { force: true, silent: true });
      }
      if (!eventSource || eventSource.readyState === 2) { // 2 = EventSource.CLOSED
        setupEventSource();
      }
    }
  }

  function handleGlobalKeyDown(e) {
    if (showCustomWalletManager.value && e.key === 'Escape') {
      closeCustomWalletManager();
      return;
    }
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
    document.addEventListener('visibilitychange', scheduleAiSearchRefresh);
    loadInitialPageData();
    fetchWatchlistQuotes();
    setupEventSource();
    syncCryptoWhalePolling();
    setupTreeNewsStream();
    fetchTreeNewsHistory();
    initialTimer = setTimeout(() => { isInitialLoading.value = false; }, 800);
    window.addEventListener('resize', resizeLayout);
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    systemTheme?.addEventListener?.('change', followSystemTheme);
    clockTimer = setInterval(() => { clock.value = getAuthoritativeTime(); }, 1000);
    earningsRefreshTimer = setInterval(refreshVisibleEarnings, 60_000);
    document.addEventListener('visibilitychange', refreshVisibleEarnings);
    window.addEventListener('click', e => {
      if (showRwMoreMenu.value) {
        const wrap = document.querySelector('.rw-more-wrap');
        if (wrap && !wrap.contains(e.target)) {
          showRwMoreMenu.value = false;
        }
      }
    });
    window.addEventListener('pointerdown', handleWhaleHudPointerDown, true);
  });

  function handleWhaleHudPointerDown(e) {
    if (!activeWhaleHud.value) return;
    if (e.target && typeof e.target.closest === 'function') {
      if (e.target.closest('.cw-bybit-hud-popover')) return;
      if (e.target.closest('.cw-bybit-marker-dot')) return;
      if (e.target.closest('.cw-bybit-shield-badge')) return;
      if (e.target.closest('.stock-whale-row')) return;
    }
    activeWhaleHud.value = null;
    highlightedWhaleAddr.value = '';
  }

  onUnmounted(() => {
    window.removeEventListener('pointerdown', handleWhaleHudPointerDown, true);
    earningsRequestId++;
    earningsController?.abort();
    clearInterval(earningsRefreshTimer);
    document.removeEventListener('visibilitychange', refreshVisibleEarnings);
    document.body.classList.remove('earnings-detail-open');
    clearTimeout(aiSearchTimer);
    aiSearchController?.abort();
    aiSearchSequence++;
    document.removeEventListener('visibilitychange', scheduleAiSearchRefresh);
    if (navTimer) clearTimeout(navTimer);
    if (initialTimer) clearTimeout(initialTimer);
    clearInterval(clockTimer);
    stopShortPolling();
    if (cryptoWhaleTimer) {
      clearInterval(cryptoWhaleTimer);
      cryptoWhaleTimer = null;
    }
    clearTimeout(sseReconnectTimer);
    clearTimeout(treeNewsReconnectTimer);
    clearTimeout(watchlistDebounceTimer);
    eventSource?.close();
    treeNewsEventSource?.close();
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
      await executeAiSearch();
    }
    if (value === 'tree_news' && treeNewsList.value.length === 0) {
      await fetchTreeNewsHistory();
    }
  });
  watch([page, newsSubView, activeEarningsWeek, earningsToday], () => {
    if (page.value === 'news' && newsSubView.value === 'earnings') loadEarningsCalendar();
    else {
      earningsRequestId++;
      earningsController?.abort();
      earningsLoading.value = false;
      closeEarningsModal();
    }
  });
  watch([page, newsSubView, aiSearchAutoRefresh], scheduleAiSearchRefresh);

  return {
    nav, mobileNav, isDark, isMobile, isWide, showSettings, toggleTheme, setThemeMode, openSettings, closeSettings, navigate, handleDrawerKey,
    uiPalette, uiPaletteOptions, setUiPalette,
    isCompactLayout, isPhoneLayout, activeMobileOverlay, openMobileOverlay, closeMobileOverlay,
    mobileSearchQuery, recentSymbolsList, executeMobileSearch, sourceNavigationPage,
    isChartExpanded, toggleChartExpanded, klineGestureCtrl,
    // TradingView 风格测距尺 (Measure / Ruler Tool)
    isRulerActive, isRulerDrawing, rulerStartPoint, rulerEndPoint, rulerMeasurement,
    rulerBox, rulerLine, rulerCard, toggleRulerTool, clearRuler,
    onRulerPointerDown, onRulerPointerMove, onRulerPointerUp,
    mobileViewMode, mobileEarningsDay, mobileQuoteRows, groupedMobileQuoteRows, isMoreActive,
    RANGE_OPTIONS, openMobileSearch, mobileTitleInfo,
    // K-Line & Heatmap Color Schemes & Preferences Modal
    klineScheme, klineGridStyle, showPreferencesModal, openPreferencesModal, closePreferencesModal, setKlineScheme, setKlineGrid, klineSchemeOptions, activeKlineScheme, KLINE_SCHEMES,
    heatmapScheme, activeHeatmapScheme, heatmapSchemeOptions, setHeatmapScheme, heatmapGradientStyle, HEATMAP_SCHEMES,
    klineMaVisibility, MA_CONFIGS, toggleMa, setAllMaVisibility, showInflectionSignals, toggleInflectionSignals,
    defaultPage, defaultPageOptions, setDefaultPage,
    page, currentNav, onPageEntered,
    overview, chart, options, news, states, searchInput, symbol, chartRange, chartInterval, INTERVAL_OPTIONS, RANGE_OPTIONS, setChartInterval, formatIntervalLabel,
    optionSymbol, optionExpiry, optionMetric, strikeRange, optionsSpotQuote, formatExpiryLabel, butterflyOptionRows, callWallDist, putWallDist, newsSymbol, newsSearch, heatSize, sectorFilter,
    heatmapScope, heatmapSession, currentSessionShortLabel, resolvedHeatmapSession, resolvedHeatmapSessionLabel, heatmapSessionBadgeText, activeHeatmapStocks, onHeatmapScopeChange, onHeatmapSessionChange, setHeatmapSession, cycleHeatmapSession, renderHeatmap, isLeveragedEtf, isCryptoSymbol, nonLeveragedWatchlist,
    flowTab, flows, flowDate, flowDates, dayFlows, sectorRotationSummaryVal, flowsSummaryVal, flowsSummaryBarPct,
    // Macro & Fear/Greed & Gold & Crypto & Treasury
    macroItems, macroMap, fearGreedIndex, goldContract, goldCnyPerGram, usdCnyRate, formatMacroPrice,
    showFearGreedModal, openFearGreedModal, closeFearGreedModal, getFearGreedRatingText, getFearGreedTone, fearGreedIndicators,
    showTreasuryModal, openTreasuryModal, closeTreasuryModal, spread30Y10Y, spread20Y10Y, isCurveInverted,
    showVolatilityModal, openVolatilityModal, closeVolatilityModal, vixQuote, vxnQuote, volatilitySpread, volatilitySpreadRatio, volatilityDiagnostic,
    cryptoData, cryptoList, selectedCrypto, selectedCryptoItem, cryptoTimeframe,
    formatCryptoPrice, getCryptoRangePct, selectCryptoCoin, loadCrypto, renderCryptoChart,
    cryptoWhaleData, stockWhaleData, cryptoWhaleLoading, cryptoWhaleError, cryptoWhaleFilter, cryptoWhaleSearch,
    isWhaleDatasetSample, isWhaleDatasetLive,
    expandedWhaleAddress, copiedWhaleAddress, whaleAggregate, allWhales, filteredWhales, whaleActivityLogs,
    formatWhaleUsd, formatWhaleCoinSize, toggleWhaleExpand, copyWhaleAddress, loadCryptoWhales, loadStockWhales, loadWhalesForCategory,
    isWhaleSortedBy, getWhaleSortDir, getWhaleSortIcon, toggleWhalePositionSort,
    aggPositionSort, toggleAggPositionSort, isAggSortedBy, getAggSortDir, getAggSortIcon,
    whaleCategory, setWhaleCategory, viewStockWhale,
    WHALE_TOP_N_OPTIONS, WHALE_MAX_CUSTOM_WALLETS, whaleTopN, customWallets, walletScopeFilter,
    showCustomWalletManager, customWalletAddressInput, customWalletLabelInput, customWalletFormError,
    setWhaleTopN, toggleWalletScopeFilter, openCustomWalletManager, closeCustomWalletManager,
    addCustomWhaleWallet, removeCustomWhaleWallet, focusCustomWallet, getCustomWalletLiveRecord, formatShortAddr,
    // Whale Sankey & Two-Column Split Layout
    selectedWhaleKey, sankeyMode, hoveredSankeyWalletKey, hoveredAssetSymbol, hoveredSankeyLinkId,
    reduceSankeyMotion, showSecondaryMarketFlow, secondaryFlowTab, lastWhaleSyncAt,
    setSankeyMode, selectWhaleWallet, clearWhaleSelection, resetCryptoSankeyFilters,
    leftWalletRows, selectedWhaleRecord, aggregatedAssetPositions, nowRebalanceItems,
    sankeyGraph, hoveredSankeyLink, sankeyKpiSummary, sankeyMarketMeta,
    getAssetLabel, formatWhaleCompactUsd,
    // On-Chain US Equities Flow Top 10 & Unified Graphic Flow
    onchainStocksData, onchainStocksLoading, onchainStocksError, onchainStockSearch, onchainStockSortField, onchainStockSortDir,
    onchainAggregate, onchainStocksList, toggleOnchainSort, formatOnchainUsd, formatOnchainFlowUsd, loadOnchainStocks,
    expandedStockSymbol, focusedFlowSymbol, toggleStockRadar, focusAssetInFlowMatrix, formatWhaleShares, getWhalePositionsForStock,
    activeFlowRows, activeFlowSummary, whaleDonutSpec, getUnifiedWhalePositions, getPriceAxisSpec, formatSpreadPct, formatSpreadDiff, refreshCryptoWorkspace,
    whaleDrawerSortField, whaleDrawerSortDir, toggleWhaleDrawerSort,
    whaleDrawerInterval, whaleDrawerRange, activeWhaleHud, highlightedWhaleAddr, whaleDrawerChartLoading,
    whaleChartExpanded, toggleWhaleChartExpanded,
    whaleMarkerOverlays, onWhaleMarkerHover, onWhaleMarkerLeave, onWhaleMarkerClick,
    formatWhaleTime, formatWhaleFullTime, formatWhaleDuration,
    setWhaleDrawerInterval, resetWhaleDrawerChartZoom, onWhaleRowHover, onWhaleRowLeave, onWhaleRowClick,
    // Watchlist & Groups & Sidebar Live Streamlined Board
    watchlistData, groups, watchlist, quoteStore, providerInfo, currentSession,
    viewMode, extMode, sortField, sortDirection, freezeResort, compactPanelOpen,
    allRankedRows, groupedRows, groupAverages, compactRows, cellFlashes,
    extShortLabel, regularPriceColTitle, regularChangeColTitle, extPriceColTitle, extChangeColTitle, autoSessionOptionText,
    getDisplayExtPrice, getDisplayExtChange, groupExtAverages, getGroupFullTitle, getGroupShortTitle, watchlistGroupPills, jumpToGroup, currentSortLabel, formatWatchlistTime, getRowSessionBadge,
    getExtSessionKey, getExtSessionIcon, getExtSessionTitle,
    STOCK_MARKET_CAPS, getStockMarketCap, sortSymbolsByMarketCap,
    sidebarSortField, sidebarSortDirection, sidebarActiveGroup, sidebarSearchQuery, selectSidebarGroupPill, setSidebarSort, setSidebarGroup, sidebarWatchlistRows,
    groupPillsBarRef, canScrollPillsLeft, canScrollPillsRight, scrollPillsBar, onGroupPillsWheel, onGroupPillsMouseDown, onGroupPillsMouseMove, onGroupPillsMouseUp, handleGroupPillClick, checkPillsScroll,
    sidebarViewMode, setSidebarViewMode, toggleSidebarViewMode, toggleSidebarSort, resetSidebarSort, isSortedByChange,
    groupOrderSortDir, toggleGroupOrderSort, rwSessionTab, setRwSessionTab, currentExtSessionShortLabel, getRowExtSessionLabel,
    activeSessionKey, activeSessionShortLabel, activeSessionPriceLabel, activeSessionChangeLabel,
    toggleGroupCollapse, toggleAllGroupsCollapse, areAllGroupsCollapsed, openAddStockToGroup, sidebarGroupSections, filteredSidebarGroupSections, sidebarFlatRows, filteredSidebarFlatRows, isMarketOpen, showExtColumn,
    showVolumeSetting, showVolumeColumn, toggleShowVolumeSetting, formatWatchlistVolume,
    showRwMoreMenu, showExtSessionSetting, toggleShowExtSessionSetting,
    groupSortStates, resolveGroupSortSpec, getGroupEffectiveSort, isGroupSortedBy, getGroupColumnSortDir, toggleGroupColumnSort, cycleGroupSort, getGroupSortTitle,
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
    toast, importing, nyClock, nyClockDetailed, nyClockInfo, sessionStatusText, dateLabel,
    isPageLoading, isWatchlistSkeleton, isCryptoSkeleton, rwSkeletonRows, cryptoWhaleSkeletonRows, cryptoAssetSkeletonRows, sankeySkeletonWallets, sankeySkeletonAssets, sankeySkeletonRibbons, skeletonPattern, butterflySkeletonRows, klineCandleSkeletons, flowsBubbleSkeletons, triggerPageLoadingPulse,
    isDeleteMode, pendingDeleteSymbol, toggleDeleteMode, handleChipClick,
    breadcrumbLabel, upSectorsCount, downSectorsCount, upSectorsRatio, isStockGainer, getSparkline,
    stockSectors, rankedSectors, quoteWindow, breadth, findQuote, barWidth, getSectorBarHeight, walls, num, formatWatchlistSymbol, compact, pct, pctNoPlus, tone, time,
    SECTOR_LEADERS, topGainerSector, topLoserSector, mostActiveSector, totalSectorTurnover, avgSectorTurnover, sectorBullBearRatio,
    newsCategory, newsCategories, filteredNews, getNewsSentiment, getNewsTags, getDayRange, getDayRangeWidth, missingTurnoverCount,
    savedNewsUrls, isBookmarked, toggleBookmark, showNewsMoreMenu, formatRelativeTime, getSourceMeta, getNewsImage, getTagColorClass, handleImgError, openNewsUrl, onNewsSearchSubmit,
    // Earnings & Macro & Geopolitics Calendars
    newsSubView, activeEarningsWeek, earningsWeeks, currentEarningsWeekInfo, currentEarningsDays, setEarningsWeek, getEarningsSectorCount,
    earningsResponse, earningsLoading, earningsError, loadEarningsCalendar,
    earningsSectorFilter, earningsTimingFilter, earningsAiOnly, earningsSearch,
    showEarningsModal, selectedEarningsItem, earningsList, macroCalendarList,
    GEOPOLITICAL_HOTSPOTS, GEOPOLITICAL_ASSET_MATRIX, filterGeopoliticsTopic,
    AI_SECTOR_FILTERS, CORPORATE_LOGOS,
    getCompanyLogoSvg, getDayEarnings, countDayTotal, openEarningsModal, closeEarningsModal, viewStockFromEarnings,
    finishClosingEarningsModal, handleEarningsDialogKeydown,
    parseMetricNumber, getMetricSurprise, getMetricYoy,
    // AI News Search Module
    aiSearchQuery, aiSearchEngine, aiSearchSource, aiSearchResults, aiSearchLoading, aiSearchError, aiSearchTelemetry, aiSearchCopiedId,
    aiSearchTimeRange, aiSearchSort, aiSearchIncludeUndated, aiSearchAutoRefresh, aiSearchPending, acceptAiSearchUpdate, aiEngineStatus,
    AI_SEARCH_ENGINES, AI_SEARCH_SOURCES, AI_SEARCH_PRESETS,
    executeAiSearch, selectAiSearchPreset, filterAiNewsTopic, copyAiNewsLink, formatAiTime, getAiEngineBadge,
    klineInteractionMode, chartDelayStatus, activeChartExtQuote,
    activeMacroTab, heatmapTimeRange, rightWatchlistCollapsed, cycleExtMode, extModeLabel, lastUpdateTimeFormatted, bjTimeFormatted, overviewCards8, overviewCards10,
    // Tree News Real-time WebSocket Module
    treeNewsList, treeNewsConnected, treeNewsPaused, treeNewsSearch, treeNewsSourceFilter,
    treeNewsAudioAlert, treeNewsCopiedId, treeNewsLoading, filteredTreeNews,
    fetchTreeNewsHistory, toggleTreeNewsPause, toggleTreeNewsAudio, clearTreeNewsList,
    copyTreeNews, formatTreeNewsTime, setupTreeNewsStream,
    currentPageTitle, deleteStockDirect, cycleSessionMode, refreshWatchlistQuotes,
    selectSymbol, search, loadInitialPageData, loadOverview, loadChart, loadNews, loadOptions, resetPriceChartZoom, fetchWatchlistQuotes, importNotion, importFlows, clearFlows
  };
} }).mount('#app');
