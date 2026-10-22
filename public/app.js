import { parseFlows } from './flows.js';
import {
  WatchlistManager,
  sortWatchlistRows,
  getSelectedExtQuote,
  MAX_UNIQUE_SYMBOLS,
  validSymbol
} from './watchlist-model.js';

const { createApp, ref, computed, reactive, watch, nextTick, onMounted, onUnmounted } = window.Vue;
const green = '#38ab70', red = '#df4f46', blue = '#2976ff';

const nav = [
  { id: 'overview', icon: '◫', label: '市场总览', eyebrow: 'MARKET OVERVIEW', title: '市场，全景在握。', description: '从大盘到板块，从价格到事件。在这里建立你的市场视角。' },
  { id: 'watchlist', icon: '★', label: '自选看板', eyebrow: 'WATCHLIST BOARD', title: '自选动态，多时段兼顾。', description: '自选股分组、常规与盘前/盘后/隔夜报价，支持按时段排序。' },
  { id: 'heatmap', icon: '▦', label: '市场热力图', eyebrow: 'MARKET MAP', title: '看见市场的温度。', description: '观察精选美股的涨跌与成交活跃度，点击方块深入了解。' },
  { id: 'chart', icon: '⌁', label: '个股行情', eyebrow: 'PRICE & VOLUME', title: '让价格与成交量说话。', description: '查看真实 K 线、成交量与不同周期的价格变化。' },
  { id: 'flows', icon: '⇄', label: '资金观察', eyebrow: 'SECTOR ROTATION', title: '关注度，流向哪里？', description: '并排观察板块表现与成交活跃度，单独查看有来源的净申赎数据。' },
  { id: 'options', icon: '◈', label: '期权墙', eyebrow: 'OPTIONS POSITIONING', title: '读懂持仓的分布。', description: '按到期日与行权价，观察 Call / Put 持仓集中区及估算 Gamma 敞口。' },
  { id: 'news', icon: '▤', label: '新闻资讯', eyebrow: 'MARKET BRIEFING', title: '价格背后的新消息。', description: '汇集市场与个股新闻。保留来源，直接阅读原文。' },
  { id: 'sources', icon: 'ⓘ', label: '数据与说明', eyebrow: 'DATA & METHODOLOGY', title: '知道数据从哪里来。', description: '来源、时效与计算口径，都清楚展示。' },
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
  const mobileNav = nav.filter(item => ['overview', 'watchlist', 'chart', 'options', 'news'].includes(item.id));
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
  function navigate(id) { page.value = id; closeSettings(); }
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
  const states = reactive(Object.fromEntries(['overview', 'chart', 'options', 'news', 'watchlist'].map(k => [k, { loading: false, error: '' }])));
  const searchInput = ref(''), symbol = ref('SPY'), chartRange = ref('3mo');
  const optionSymbol = ref('SPY'), optionExpiry = ref(''), optionMetric = ref('oi'), strikeRange = ref('0.15');
  const newsSymbol = ref(''), newsSearch = ref(''), heatSize = ref('turnover'), sectorFilter = ref('全部');
  const flowTab = ref('rotation'), flows = ref([]), flowDate = ref('');
  const savedFlows = readStorage('market-desk-flows', '');
  try { if (typeof savedFlows === 'string' && savedFlows) flows.value = parseFlows(savedFlows); } catch {}
  flowDate.value = flows.value[0]?.date || '';

  // Watchlist Model & Manager (v2)
  const storage = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  const watchlistMgr = new WatchlistManager({ storage });
  const watchlistData = ref(watchlistMgr.data);
  const groups = computed(() => watchlistData.value.groups);
  const watchlist = computed(() => watchlistMgr.getAllUniqueSymbols());

  // Watchlist Preferences & State
  const viewMode = ref(watchlistMgr.data.preferences.viewMode || 'grouped');
  const extMode = ref(watchlistMgr.data.preferences.extMode || 'auto');
  const sortField = ref(watchlistMgr.data.preferences.sortField || 'extChange');
  const sortDirection = ref(watchlistMgr.data.preferences.sortDirection || 'desc');
  const freezeResort = ref(Boolean(watchlistMgr.data.preferences.freezeResort));
  const compactPanelOpen = ref(watchlistMgr.data.preferences.compactPanelOpen !== false);

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

  const toast = ref(''), undoAction = ref(null), importing = ref(false), clock = ref(new Date());
  const nyClock = computed(() => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(clock.value));
  const dateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(clock.value));
  const refreshing = computed(() => Object.values(states).some(s => s.loading));
  const stockSectors = computed(() => [...new Set((overview.value?.stocks || []).map(q => q.sector))]);
  const rankedSectors = computed(() => [...(overview.value?.sectors || [])].sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity)));
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

  // Watchlist Row Data Projection
  function buildRow(sym) {
    const q = quoteStore.value[sym] || {};
    const ext = getSelectedExtQuote(q, extMode.value, currentSession.value);
    const regPrice = q.regular?.price ?? null;
    const regChange = q.regular?.changePercent ?? null;
    const groupsBelonged = watchlistMgr.getGroupsForSymbol(sym);
    return {
      symbol: sym,
      name: q.name || sym,
      regularPrice: regPrice,
      regularChange: regChange,
      extPrice: ext.price,
      extChange: ext.changePercent,
      extLabel: ext.label,
      extStatus: ext.status,
      extSession: ext.session,
      updatedAt: q.meta?.updatedAt || q.regular?.sourceTime || null,
      status: q.meta?.status || 'active',
      delayStatus: q.meta?.delayStatus || 'unconfirmed',
      groups: groupsBelonged
    };
  }

  // Sorted Rows for All View
  const allRankedRows = computed(() => {
    const rows = watchlist.value.map(buildRow);
    return sortWatchlistRows(rows, sortField.value, sortDirection.value);
  });

  // Grouped Rows Map
  const groupedRows = computed(() => {
    const map = {};
    for (const g of groups.value) {
      const rows = g.symbolIds.map(buildRow);
      map[g.id] = sortWatchlistRows(rows, sortField.value, sortDirection.value);
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

  // Setup SSE stream
  function setupEventSource() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    const symbols = watchlist.value;
    if (!symbols.length || typeof EventSource === 'undefined') {
      startShortPolling();
      return;
    }

    try {
      const url = `/api/watchlist/stream?symbols=${encodeURIComponent(symbols.join(','))}`;
      eventSource = new EventSource(url);

      eventSource.onmessage = event => {
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
        eventSource?.close();
        eventSource = null;
        startShortPolling();
      };
    } catch {
      startShortPolling();
    }
  }

  function startShortPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (page.value === 'watchlist' || compactPanelOpen.value) {
        fetchWatchlistQuotes();
      }
    }, 10000);
  }

  watch(watchlist, (newList, oldList) => {
    watchlistData.value = { ...watchlistMgr.data };
    persist('market-desk-watchlist', newList);
    fetchWatchlistQuotes();
    setupEventSource();
  }, { deep: true });

  // Watchlist Actions
  function addWatch(s, targetGroupId = 'default') {
    if (!validSymbol(s)) return;
    const res = watchlistMgr.addSymbol(s, targetGroupId);
    if (!res.ok) {
      toast.value = res.error;
      return;
    }
    watchlistData.value = { ...watchlistMgr.data };
    toast.value = `${res.symbol} 已加入自选`;
  }

  function removeWatch(s, groupId = null) {
    if (groupId) {
      watchlistMgr.removeSymbolFromGroup(s, groupId);
    } else {
      watchlistMgr.removeSymbolGlobally(s);
    }
    watchlistData.value = { ...watchlistMgr.data };
  }

  function handleCreateGroup() {
    const res = watchlistMgr.createGroup(newGroupName.value);
    if (!res.ok) {
      toast.value = res.error;
      return;
    }
    watchlistData.value = { ...watchlistMgr.data };
    newGroupName.value = '';
    toast.value = `分组“${res.group.name}”已创建`;
  }

  function handleDeleteGroup(groupId) {
    const res = watchlistMgr.deleteGroup(groupId);
    if (!res.ok) {
      toast.value = res.error;
      return;
    }
    watchlistData.value = { ...watchlistMgr.data };
    undoAction.value = () => {
      watchlistMgr.undoDeleteGroup();
      watchlistData.value = { ...watchlistMgr.data };
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
    watchlistData.value = { ...watchlistMgr.data };
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
  async function loadOptions(reset = false) {
    const s = optionSymbol.value.trim().toUpperCase();
    if (!validSymbol(s)) { toast.value = '请输入有效的期权标的代码。'; return; }
    optionSymbol.value = s;
    const data = await request('options', '/api/options', { symbol: s, expiration: reset ? '' : optionExpiry.value }, options);
    if (data) optionExpiry.value = data.expiration;
  }

  function refresh() {
    if (page.value === 'overview' || page.value === 'heatmap' || page.value === 'flows') loadOverview();
    if (page.value === 'overview' || page.value === 'news') loadNews();
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
      watchlistData.value = { ...watchlistMgr.data };
      toast.value = `已从 Notion 导入 ${addedCount} 支自选至“未分组”${data.stale ? '（旧缓存）' : ''}，当前总计 ${watchlist.value.length} 支。`;
    } catch (e) { toast.value = e.message; }
    finally { importing.value = false; }
  }

  async function importFlows(event) {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > 500000) throw new Error('文件不能超过 500 KB。'); const text = await file.text(); const parsed = parseFlows(text); flows.value = parsed; flowDate.value = parsed[0].date; persist('market-desk-flows', text); toast.value = `已导入 ${parsed.length} 条净申赎记录。`; await nextTick(); render(); } catch (e) { toast.value = e.message; } finally { event.target.value = ''; }
  }
  function clearFlows() { flows.value = []; persist('market-desk-flows', ''); }

  function makeChart(id, config, onClick) {
    const el = document.getElementById(id); if (!el || !el.clientWidth) return;
    let entry = charts.get(id);
    if (entry && entry.el !== el) { entry.observer.disconnect(); entry.chart.dispose(); charts.delete(id); entry = null; }
    if (!entry) {
      const instance = echarts.init(el, null, { renderer: 'canvas' });
      const observer = new ResizeObserver(() => instance.resize()); observer.observe(el);
      entry = { chart: instance, el, observer }; charts.set(id, entry);
    }
    entry.chart.setOption({ animation: false, textStyle: { fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif', color: muted }, ...config }, true);
    entry.chart.off('click'); if (onClick) entry.chart.on('click', onClick); entry.chart.resize();
  }

  function updateChartTheme() {
    muted = isDark.value ? '#afafaf' : '#787878';
    gridColor = isDark.value ? 'rgba(255,255,255,0.08)' : '#cecece';
    chartText = isDark.value ? '#ffffff' : '#101010';
    chartSurface = isDark.value ? '#2d2d2d' : '#f9f9f9';
    axis = { axisLine: { lineStyle: { color: gridColor } }, axisTick: { show: false }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: gridColor, type: 'dashed' } } };
    tooltip = { renderMode: 'richText', backgroundColor: chartSurface, borderColor: gridColor, textStyle: { color: chartText }, confine: true };
  }

  function renderHeatmap() {
    if (!overview.value) return;
    const selected = overview.value.stocks.filter(q => sectorFilter.value === '全部' || q.sector === sectorFilter.value);
    const color = v => !Number.isFinite(v) || v === 0 ? '#787878' : v >= 3 ? '#24794d' : v >= 1 ? green : v > 0 ? '#699a80' : v > -1 ? '#b6807b' : v > -3 ? red : '#ad3730';
    const data = selected.filter(q => heatSize.value === 'equal' || q.turnover > 0).map(q => ({ name: q.symbol, value: heatSize.value === 'equal' ? 1 : q.turnover, quote: q, itemStyle: { color: color(q.changePercent) } }));
    makeChart('heatmap-chart', { tooltip: { ...tooltip, formatter: p => { const q = p.data.quote; return q ? `${q.symbol} · ${q.name}\n${num(q.price)} USD   ${pct(q.changePercent)}\n估算成交额 ${compact(q.turnover)}\n${time(q.asOf)}${q.stale ? '\n旧快照' : ''}` : ''; } }, series: [{ type: 'treemap', data, roam: false, nodeClick: false, breadcrumb: { show: false }, left: 0, right: 0, top: 0, bottom: 0, itemStyle: { borderColor: chartSurface, borderWidth: 2, gapWidth: 3, borderRadius: 5 }, label: { show: true, color: '#ffffff', fontSize: 13, formatter: p => `${p.name}\n${pct(p.data.quote?.changePercent)}`, lineHeight: 23 }, emphasis: { itemStyle: { borderColor: blue, borderWidth: 2 } } }] }, p => { if (p.data.quote) selectSymbol(p.data.quote.symbol); });
  }

  function renderPrice() {
    const d = chart.value; if (!d || states.chart.loading) return;
    const labels = d.bars.map(b => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', ...(d.range === '1d' ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).format(new Date(b.time * 1000)));
    makeChart('price-chart', { tooltip: { ...tooltip, trigger: 'axis' }, axisPointer: { link: [{ xAxisIndex: 'all' }] }, grid: [{ left: 70, right: 25, top: 30, height: '62%' }, { left: 70, right: 25, top: '76%', height: '13%' }], xAxis: [0, 1].map(i => ({ ...axis, type: 'category', data: labels, gridIndex: i, axisLabel: { show: i === 1, color: muted }, boundaryGap: true })), yAxis: [{ ...axis, scale: true, name: d.currency }, { ...axis, gridIndex: 1, name: '成交量', axisLabel: { color: muted, formatter: compact } }], dataZoom: [{ type: 'inside', xAxisIndex: [0, 1] }, { type: 'slider', xAxisIndex: [0, 1], bottom: 0, height: 18, borderColor: gridColor, textStyle: { color: muted } }], series: [{ name: '价格 OHLC', type: 'candlestick', data: d.bars.map(b => [b.open, b.close, b.low, b.high]), itemStyle: { color: green, color0: red, borderColor: green, borderColor0: red } }, { name: '成交股数', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: d.bars.map(b => ({ value: b.volume, itemStyle: { color: b.close >= b.open ? green : red } })) }] });
  }

  function renderRotation() {
    if (!overview.value) return;
    makeChart('rotation-chart', { tooltip: { ...tooltip, formatter: p => `${p.data.name} · ${p.data.symbol}\n涨跌 ${pct(p.value[0])}\n估算成交额 ${compact(p.value[1])}` }, grid: { left: 75, right: 55, top: 35, bottom: 50 }, xAxis: { ...axis, type: 'value', name: '涨跌 %', axisLabel: { color: muted, formatter: '{value}%' } }, yAxis: { ...axis, type: 'value', name: '估算成交额 USD', axisLabel: { color: muted, formatter: compact } }, series: [{ type: 'scatter', symbolSize: 22, label: { show: true, formatter: p => p.data.name, position: 'top', color: chartText, fontSize: 11 }, data: overview.value.sectors.filter(q => Number.isFinite(q.changePercent) && q.turnover !== null).map(q => ({ value: [q.changePercent, q.turnover], name: q.name, symbol: q.symbol, itemStyle: { color: q.changePercent >= 0 ? green : red } })), markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: muted }, data: [{ xAxis: 0 }] } }] }, p => selectSymbol(p.data.symbol));
  }

  function renderFlows() {
    const data = dayFlows.value;
    makeChart('flows-chart', { tooltip: { ...tooltip, trigger: 'axis' }, grid: { left: 80, right: 30, top: 35, bottom: 45 }, xAxis: { ...axis, type: 'category', data: data.map(f => f.symbol) }, yAxis: { ...axis, type: 'value', name: '净申赎 USD', axisLabel: { color: muted, formatter: compact } }, series: [{ type: 'bar', barMaxWidth: 70, data: data.map(f => ({ value: f.netFlowUsd, itemStyle: { color: f.netFlowUsd >= 0 ? green : red } })) }] });
  }

  function renderOptions() {
    const d = options.value; if (!d || states.options.loading) return;
    const rows = d.rows.filter(r => strikeRange.value === 'all' || Math.abs(r.strike / d.spot - 1) <= Number(strikeRange.value));
    const gex = optionMetric.value === 'gex';
    const missing = d.missingOi || (gex && d.missingGamma);
    makeChart('options-chart', { title: missing ? { text: '数据不完整，暂不展示该汇总图', left: 'center', top: 'center', textStyle: { color: muted, fontSize: 14 } } : undefined, tooltip: { ...tooltip, trigger: 'axis' }, legend: { data: ['Call', 'Put'], textStyle: { color: muted }, top: 8 }, grid: { left: 80, right: 35, top: 50, bottom: 65 }, xAxis: { ...axis, type: 'category', name: '行权价', data: rows.map(r => String(r.strike)) }, yAxis: { ...axis, type: 'value', name: gex ? 'USD / 1% 波动' : '持仓量（合约）', axisLabel: { color: muted, formatter: compact } }, dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 5, height: 20, borderColor: gridColor, textStyle: { color: muted } }], series: missing ? [] : [{ type: 'bar', name: 'Call', itemStyle: { color: green }, data: rows.map(r => gex ? r.callGex : r.callOi) }, { type: 'bar', name: 'Put', itemStyle: { color: red }, data: rows.map(r => gex ? r.putGex : r.putOi) }] });
  }

  function render() {
    updateChartTheme();
    for (const [id, entry] of charts) { if (!document.contains(entry.el)) { entry.observer.disconnect(); entry.chart.dispose(); charts.delete(id); } }
    if (page.value === 'overview' || page.value === 'heatmap') renderHeatmap();
    if (page.value === 'chart') renderPrice();
    if (page.value === 'flows') flowTab.value === 'rotation' ? renderRotation() : renderFlows();
    if (page.value === 'options') renderOptions();
  }

  function onPageEntered() {
    render();
  }

  watch(page, async value => {
    history.replaceState(null, '', '#' + value);
    await nextTick();
    if (['overview', 'heatmap', 'flows'].includes(value) && !overview.value && !states.overview.loading) loadOverview();
    if (value === 'chart') loadChart();
    if (value === 'options') loadOptions(options.value?.symbol !== optionSymbol.value);
    if (value === 'news' || value === 'overview') loadNews();
    if (value === 'watchlist') fetchWatchlistQuotes();
    render();
  });

  watch([symbol, chartRange], () => { if (page.value === 'chart') loadChart(); });
  watch(newsSymbol, () => { if (page.value === 'news') loadNews(); });
  watch(optionExpiry, value => { if (page.value === 'options' && value && value !== options.value?.expiration) loadOptions(); });
  watch([heatSize, sectorFilter, flowTab, flowDate, optionMetric, strikeRange], async () => { await nextTick(); render(); });
  watch(isDark, async value => { document.documentElement.classList.toggle('dark', value); await nextTick(); render(); });
  watch(showSettings, value => { document.body.classList.toggle('drawer-open', value && isMobile.value); });

  onMounted(() => {
    refresh();
    fetchWatchlistQuotes();
    setupEventSource();
    window.addEventListener('resize', resizeLayout);
    systemTheme?.addEventListener?.('change', followSystemTheme);
    clockTimer = setInterval(() => { clock.value = new Date(); }, 30000);
  });

  onUnmounted(() => {
    clearInterval(clockTimer);
    clearInterval(pollTimer);
    eventSource?.close();
    window.removeEventListener('resize', resizeLayout);
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
    flowTab, flows, flowDate, flowDates, dayFlows,
    // Watchlist & Groups
    watchlistData, groups, watchlist, quoteStore, providerInfo, currentSession,
    viewMode, extMode, sortField, sortDirection, freezeResort, compactPanelOpen,
    allRankedRows, groupedRows, compactRows, cellFlashes,
    toggleSort, addWatch, removeWatch, handleCreateGroup, handleDeleteGroup,
    handleAddStockModalSubmit, handleExportJson, handleImportJson,
    showGroupModal, showAddStockModal, showBackupModal, newGroupName, addStockInput, addStockTargetGroup, backupJsonText,
    undoAction, isInteractingWithTable,
    toast, importing, nyClock, dateLabel, refreshing,
    stockSectors, rankedSectors, quoteWindow, breadth, findQuote, barWidth, walls, num, compact, pct, tone, time,
    selectSymbol, search, refresh, loadOverview, loadChart, loadNews, loadOptions, fetchWatchlistQuotes, importNotion, importFlows, clearFlows
  };
} }).mount('#app');
