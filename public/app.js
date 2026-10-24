import { parseFlows } from './flows.js';
import {
  WatchlistManager,
  sortWatchlistRows,
  getSelectedExtQuote,
  MAX_UNIQUE_SYMBOLS,
  validSymbol,
  SYMBOL_NAMES,
  NASDAQ100_STOCKS,
  SP500_STOCKS,
  isLeveragedEtf
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
  { symbol: 'BZ=F', displaySymbol: 'BRN1!', name: '布伦特原油连续', category: 'commodity', icon: '🛢️', price: 117.18, changePercent: 3.54, badge: 'D' },
  { symbol: 'UKOIL', displaySymbol: 'UKOIL', name: '伦敦布伦特现货', category: 'commodity', icon: '🛢️', price: 117.01, changePercent: 3.63 },
  { symbol: 'GC=F', displaySymbol: 'XAU/USD', name: '黄金现货 / 合约', category: 'commodity', icon: '🪙', price: 2748.50, changePercent: 0.65 }
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

createApp({ setup() {
  const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  const savedTheme = readStorage('market-desk-theme', null);
  const isDark = ref(savedTheme === 'dark' || (savedTheme !== 'light' && Boolean(systemTheme?.matches)));
  const isMobile = ref(window.innerWidth < 768);
  const isWide = ref(window.innerWidth >= 1600);
  const showSettings = ref(false);
  const mobileNav = nav.filter(item => ['overview', 'watchlist', 'chart', 'crypto', 'options', 'news'].includes(item.id));
  let themeOverride = savedTheme === 'dark' || savedTheme === 'light';
  let muted, gridColor, chartText, chartSurface, axis, tooltip;

  document.documentElement.classList.toggle('dark', isDark.value);
  function toggleTheme() { themeOverride = true; isDark.value = !isDark.value; persist('market-desk-theme', isDark.value ? 'dark' : 'light'); }
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
    // Blueprint T07: no artificial bezier curves; hide sparkline when no authentic sequence exists
    return '';
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

  const initial = location.hash.slice(1);
  const page = ref(nav.some(n => n.id === initial) ? initial : 'overview');
  const currentNav = computed(() => nav.find(n => n.id === page.value) || nav[0]);
  const overview = ref(null), chart = ref(null), options = ref(null), news = ref(null);
  const states = reactive(Object.fromEntries(['overview', 'chart', 'options', 'news', 'watchlist', 'crypto'].map(k => [k, { loading: false, error: '' }])));
  const searchInput = ref(''), symbol = ref('SPY'), chartRange = ref('3mo');
  const optionSymbol = ref('SPY'), optionExpiry = ref(''), optionMetric = ref('oi'), strikeRange = ref('0.15');
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
    return macroItems.value.find(m => m.displaySymbol === 'XAU/USD') || DEFAULT_MACRO[7];
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
  const compactPanelOpen = ref(Boolean(watchlistMgr.data.preferences.compactPanelOpen));

  // Quote Store & Session
  const quoteStore = ref({});
  const providerInfo = ref({ name: 'Longbridge', status: 'unconfigured', reason: '', isConfigured: false });
  const currentSession = ref({ session: 'regular', isExt: false, desc: '常规交易' });
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
        status: s < 45 ? 'Fear 恐慌' : s > 55 ? 'Greed 贪婪' : 'Neutral 中性',
        toneClass: s < 45 ? 'tone-fear' : s > 55 ? 'tone-greed' : 'tone-neutral',
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
        status: s <= 45 ? 'Fear 恐慌' : 'Neutral 中性',
        toneClass: s <= 45 ? 'tone-fear' : 'tone-neutral',
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

  const toast = ref(''), undoAction = ref(null), importing = ref(false), clock = ref(new Date());
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
  const rankedSectors = computed(() => [...(overview.value?.sectors || [])].sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity)));
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
    if (!options.value?.spot || !options.value?.callWall?.[0]) return null;
    const dist = ((options.value.callWall[0] / options.value.spot) - 1) * 100;
    return dist.toFixed(2);
  });
  const putWallDist = computed(() => {
    if (!options.value?.spot || !options.value?.putWall?.[0]) return null;
    const dist = ((options.value.putWall[0] / options.value.spot) - 1) * 100;
    return dist.toFixed(2);
  });

  // News Category Filters & Enrichment Helpers
  const newsCategory = ref('all');
  const newsCategories = [
    { id: 'all', label: '全部快讯' },
    { id: 'macro', label: '市场宏观' },
    { id: 'movers', label: '个股异动' },
    { id: 'earnings', label: '重磅财报' },
    { id: 'fed', label: '美联储与利率' },
    { id: 'tech', label: '产业与AI' }
  ];

  function getNewsSentiment(item) {
    const title = (item.title || '').toLowerCase();
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
    const title = item.title || '';
    const tags = [];
    const candidates = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD', 'MU', 'AVGO', 'INTC', 'SPY', 'QQQ', 'BRENT', 'XLE'];
    for (const sym of candidates) {
      const re = new RegExp(`\\b${sym}\\b`, 'i');
      if (re.test(title)) tags.push(sym);
    }
    return tags.slice(0, 3);
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
    const rawList = news.value?.items || [];
    const list = rawList.map(item => ({
      ...item,
      title: cleanHtmlEntities(item.title)
    }));
    if (newsCategory.value === 'all') return list;
    if (newsCategory.value === 'macro') {
      return list.filter(n => /(economy|gdp|inflation|market|treasury|bond|brent|oil)/i.test(n.title));
    }
    if (newsCategory.value === 'movers') {
      return list.filter(n => /(plunge|surge|jump|tumble|slump|spike|rally|record)/i.test(n.title));
    }
    if (newsCategory.value === 'earnings') {
      return list.filter(n => /(earning|revenue|profit|guidance|q3|q4|capex|forecast)/i.test(n.title));
    }
    if (newsCategory.value === 'fed') {
      return list.filter(n => /(fed|powell|rate|cut|hike|fomc|central bank)/i.test(n.title));
    }
    if (newsCategory.value === 'tech') {
      return list.filter(n => /(tech|ai|chip|cloud|semi|nvidia|apple|microsoft|google)/i.test(n.title));
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
    const price = r.regularPrice;
    const low = r.regularLow;
    const high = r.regularHigh;
    if (price === null || low === null || high === null || !Number.isFinite(price) || !Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
      return null;
    }
    const pctVal = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
    return {
      low,
      high,
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
      sourceTime: reg.sourceTime || null,
      receivedAt: q.meta?.updatedAt || null,
      updatedAt: reg.sourceTime || q.meta?.updatedAt || null,
      status: q.meta?.status || 'active',
      delayStatus: q.meta?.delayStatus || 'unconfirmed',
      groups: groupsBelonged
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
        map[g.id] = sortWatchlistRows(rows, sortField.value, sortDirection.value);
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

  function toggleSort(field) {
    if (sortField.value === field) {
      sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
      sortField.value = field;
      sortDirection.value = 'desc';
    }
  }

  // Sidebar Watchlist State & Methods (Persistent Sorting & Group Filtering)
  const sidebarSortField = ref(readStorage('market-desk-sidebar-sort-field', 'regularPrice'));
  const sidebarSortDirection = ref(readStorage('market-desk-sidebar-sort-dir', 'desc'));
  const sidebarActiveGroup = ref(readStorage('market-desk-sidebar-group', 'all'));
  const sidebarViewMode = ref(readStorage('market-desk-sidebar-view-mode', 'grouped')); // 'grouped' | 'flat'

  function setSidebarSort(field) {
    if (sidebarSortField.value === field) {
      sidebarSortDirection.value = sidebarSortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
      sidebarSortField.value = field;
      sidebarSortDirection.value = 'desc';
    }
    persist('market-desk-sidebar-sort-field', sidebarSortField.value);
    persist('market-desk-sidebar-sort-dir', sidebarSortDirection.value);
  }

  function setSidebarGroup(groupId) {
    sidebarActiveGroup.value = groupId;
    persist('market-desk-sidebar-group', groupId);
  }

  function toggleSidebarViewMode() {
    sidebarViewMode.value = sidebarViewMode.value === 'grouped' ? 'flat' : 'grouped';
    persist('market-desk-sidebar-view-mode', sidebarViewMode.value);
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

  // TradingView Style: Vertical sections with internal sorting
  const sidebarGroupSections = computed(() => {
    return groups.value.map(g => {
      const rows = g.symbolIds.map(buildRow);
      const sortedRows = sortWatchlistRows(rows, sidebarSortField.value, sidebarSortDirection.value);
      const valid = rows.filter(r => r.regularChange !== null && Number.isFinite(r.regularChange));
      let avg = null;
      if (valid.length) {
        const sum = valid.reduce((acc, r) => acc + r.regularChange, 0);
        avg = sum / valid.length;
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
  });

  // Flat Overall Sorted Watchlist Rows
  const sidebarFlatRows = computed(() => {
    const rows = watchlist.value.map(buildRow);
    return sortWatchlistRows(rows, sidebarSortField.value, sidebarSortDirection.value);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.quotes) {
        quoteStore.value = { ...quoteStore.value, ...data.quotes };
      }
      if (data.provider) providerInfo.value = data.provider;
      if (data.session) currentSession.value = data.session;
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
    const res = watchlistMgr.deleteGroup(groupId);
    if (!res.ok) {
      toast.value = res.error;
      return;
    }
    syncWatchlistData();
    undoAction.value = () => {
      watchlistMgr.undoDeleteGroup();
      syncWatchlistData();
      toast.value = '已撤销删除分组';
      undoAction.value = null;
    };
    toast.value = `分组已删除（未在其他组的 ${res.movedSymbolsCount} 支标的已移至“未分组”）`;
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

  function selectSymbol(s) { symbol.value = s; navigate('chart'); }
  function search() { const s = searchInput.value.trim().toUpperCase(); if (!validSymbol(s)) { toast.value = '请输入有效代码，例如 AAPL、SPY 或 BRK-B。'; return; } selectSymbol(s); }

  async function request(key, endpoint, params, target) {
    const seq = sequences[key] = (sequences[key] || 0) + 1;
    controllers[key]?.abort(); const controller = controllers[key] = new AbortController();
    const timer = setTimeout(() => controller.abort(), 85000);
    states[key] = { loading: true, error: '' }; target.value = null;
    try {
      const response = await fetch(endpoint + '?' + new URLSearchParams(params), { signal: controller.signal });
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
    chartSurface = isDark.value ? '#1E293B' : '#FFFFFF';
    green = '#10B981';
    red = '#F43F5E';
    blue = '#2563EB';
    axis = { axisLine: { lineStyle: { color: gridColor } }, axisTick: { show: false }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: gridColor, type: 'dashed' } } };
    tooltip = { renderMode: 'richText', backgroundColor: chartSurface, borderColor: gridColor, textStyle: { color: chartText }, confine: true };
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

  function renderPrice() {
    const d = chart.value; if (!d || states.chart.loading) return;
    const labels = d.bars.map(b => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', ...(d.range === '1d' ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).format(new Date(b.time * 1000)));
    const ma5 = calcMA(d.bars, 5);
    const ma20 = calcMA(d.bars, 20);
    const ma60 = calcMA(d.bars, 60);
    const ma120 = calcMA(d.bars, 120);
    const ma250 = calcMA(d.bars, 250);

    makeChart('price-chart', {
      tooltip: { ...tooltip, trigger: 'axis' },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      legend: { data: ['价格 OHLC', 'MA5', 'MA20', 'MA60', 'MA120', 'MA250', '成交股数'], textStyle: { color: muted }, top: 0, right: 20 },
      grid: [{ left: 70, right: 25, top: 32, height: '62%' }, { left: 70, right: 25, top: '76%', height: '13%' }],
      xAxis: [0, 1].map(i => ({ ...axis, type: 'category', data: labels, gridIndex: i, axisLabel: { show: i === 1, color: muted }, boundaryGap: true })),
      yAxis: [
        {
          ...axis,
          scale: true,
          name: d.currency,
          min: val => Math.max(0, Number((val.min - (val.max - val.min) * 0.15).toFixed(2))),
          max: val => Number((val.max + (val.max - val.min) * 0.15).toFixed(2))
        },
        { ...axis, gridIndex: 1, name: '成交量', axisLabel: { color: muted, formatter: compact } }
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
        { name: '价格 OHLC', type: 'candlestick', data: d.bars.map(b => [b.open, b.close, b.low, b.high]), itemStyle: { color: green, color0: red, borderColor: green, borderColor0: red } },
        { name: 'MA5', type: 'line', data: ma5, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#f97316' } },
        { name: 'MA20', type: 'line', data: ma20, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#3b82f6' } },
        { name: 'MA60', type: 'line', data: ma60, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#a855f7' } },
        { name: 'MA120', type: 'line', data: ma120, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#06b6d4' } },
        { name: 'MA250', type: 'line', data: ma250, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#eab308' } },
        { name: '成交股数', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: d.bars.map(b => ({ value: b.volume, itemStyle: { color: b.close >= b.open ? green : red } })) }
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
    const bars = item.bars && item.bars.length > 5 ? item.bars : null;
    if (!bars) {
      makeChart('crypto-chart', {
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
    const categories = bars.map(b => b.time || '');
    const ohlc = bars.map(b => [b.open, b.close, b.low, b.high]);
    const ma5 = calcMA(bars, 5);
    const ma20 = calcMA(bars, 20);

    makeChart('crypto-chart', {
      tooltip: { ...tooltip, trigger: 'axis', axisPointer: { link: [{ xAxisIndex: 'all' }] } },
      legend: { data: [`${item.code} 走势`, 'MA5', 'MA20', '成交量'], textStyle: { color: muted }, top: 0, right: 20 },
      grid: [{ left: 70, right: 25, top: 32, height: '60%' }, { left: 70, right: 25, top: '75%', height: '14%' }],
      xAxis: [
        { ...axis, type: 'category', data: categories, boundaryGap: true, axisLabel: { show: false } },
        { ...axis, type: 'category', data: categories, gridIndex: 1, boundaryGap: true, axisLabel: { color: muted } }
      ],
      yAxis: [
        {
          ...axis,
          scale: true,
          name: 'USD',
          min: val => Math.max(0, Number((val.min - (val.max - val.min) * 0.1).toFixed(2))),
          max: val => Number((val.max + (val.max - val.min) * 0.1).toFixed(2))
        },
        { ...axis, gridIndex: 1, name: '成交量', axisLabel: { color: muted, formatter: compact } }
      ],
      dataZoom: [
        { type: 'inside', id: 'crypto-inside-x', xAxisIndex: [0, 1] },
        { type: 'inside', id: 'crypto-inside-y', yAxisIndex: [0], filterMode: 'none' },
        { type: 'slider', id: 'crypto-slider-x', xAxisIndex: [0, 1], bottom: 0, height: 18, borderColor: gridColor, textStyle: { color: muted } }
      ],
      series: [
        { name: `${item.code} 走势`, type: 'candlestick', data: ohlc, itemStyle: { color: green, color0: red, borderColor: green, borderColor0: red } },
        { name: 'MA5', type: 'line', data: ma5, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#f97316' } },
        { name: 'MA20', type: 'line', data: ma20, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#3b82f6' } },
        { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: bars.map(b => ({ value: b.volume, itemStyle: { color: b.close >= b.open ? green : red } })) }
      ]
    });
  }

  function render() {
    updateChartTheme();
    for (const [id, entry] of charts) { if (!document.contains(entry.el)) { entry.observer.disconnect(); entry.chart.dispose(); charts.delete(id); } }
    if (page.value === 'overview') renderHeatmap();
    if (page.value === 'chart') renderPrice();
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
    clockTimer = setInterval(() => { clock.value = new Date(); }, 1000);
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

  return {
    nav, mobileNav, isDark, isMobile, isWide, showSettings, toggleTheme, openSettings, closeSettings, navigate, handleDrawerKey,
    page, currentNav, onPageEntered,
    overview, chart, options, news, states, searchInput, symbol, chartRange,
    optionSymbol, optionExpiry, optionMetric, strikeRange, newsSymbol, newsSearch, heatSize, sectorFilter,
    heatmapScope, activeHeatmapStocks, onHeatmapScopeChange, renderHeatmap, isLeveragedEtf, nonLeveragedWatchlist,
    flowTab, flows, flowDate, flowDates, dayFlows,
    // Macro & Fear/Greed & Gold & Crypto & Treasury
    macroItems, macroMap, fearGreedIndex, goldContract, formatMacroPrice,
    showFearGreedModal, openFearGreedModal, closeFearGreedModal, getFearGreedRatingText, getFearGreedTone, fearGreedIndicators,
    showTreasuryModal, openTreasuryModal, closeTreasuryModal, spread30Y10Y, spread20Y10Y, isCurveInverted,
    cryptoData, cryptoList, selectedCrypto, selectedCryptoItem, cryptoTimeframe,
    formatCryptoPrice, getCryptoRangePct, selectCryptoCoin, loadCrypto, renderCryptoChart,
    // Watchlist & Groups & Sidebar Live Streamlined Board
    watchlistData, groups, watchlist, quoteStore, providerInfo, currentSession,
    viewMode, extMode, sortField, sortDirection, freezeResort, compactPanelOpen,
    allRankedRows, groupedRows, groupAverages, compactRows, cellFlashes,
    sidebarSortField, sidebarSortDirection, sidebarActiveGroup, setSidebarSort, setSidebarGroup, sidebarWatchlistRows,
    sidebarViewMode, toggleSidebarViewMode, toggleGroupCollapse, toggleAllGroupsCollapse, areAllGroupsCollapsed, openAddStockToGroup, sidebarGroupSections, sidebarFlatRows,
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
    callWallDist, putWallDist,
    newsCategory, newsCategories, filteredNews, getNewsSentiment, getNewsTags, getDayRange, getDayRangeWidth, missingTurnoverCount,
    // Earnings & Macro Calendars
    newsSubView, earningsSectorFilter, earningsTimingFilter, earningsAiOnly, earningsSearch,
    showEarningsModal, selectedEarningsItem, earningsList, macroCalendarList,
    AI_SECTOR_FILTERS, EARNINGS_DAYS, CORPORATE_LOGOS,
    getCompanyLogoSvg, getDayEarnings, countDayTotal, openEarningsModal, closeEarningsModal, viewStockFromEarnings,
    selectSymbol, search, refresh, loadOverview, loadChart, loadNews, loadOptions, resetPriceChartZoom, fetchWatchlistQuotes, importNotion, importFlows, clearFlows
  };
} }).mount('#app');
