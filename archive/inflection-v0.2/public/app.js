import { money, percent, signedPercent, todayIso, getDateOffset, getYtdIso, formatTimeFor, reasonLabel, round } from "./utils.js?v=7";
import { useChart } from "./composables/useChart.js?v=6";

const { createApp, computed, onMounted, reactive, ref, watch } = Vue;

// ── Default Watchlist (TradingView watchlist pre-set) ──────────────────────
const WATCHLIST_DEFAULT = [
  "005930", "000660", "NOK", "AAOI", "MU", "SNDK", "SKHY", "INTC"
];

const TIMEFRAMES = [
  { label: "1D", value: "1d", limit: 600 }
];

const ALGORITHM_OPTIONS = [
  { id: "major_turn_v1",  label: "重要顶底识别 (Major Turn V1)" },
  { id: "swing_pulse_v1", label: "波段启动+转弱预警 (重构版)" },
  { id: "rsi_volume_v1",  label: "RSI+成交量基准 (V1)" },
  { id: "legacy_v2",      label: "趋势修正版 (V2)" },
  { id: "legacy_v1",      label: "原版趋势 (V1)" }
];

const BACKTEST_PRESETS = [
  { id: "1m",  label: "1个月", days: 30 },
  { id: "3m",  label: "3个月", days: 90 },
  { id: "6m",  label: "6个月", days: 180 },
  { id: "ytd", label: "年初至今" },
  { id: "1y",  label: "1年", days: 365 }
];

createApp({
  setup() {
    // ── Chart ─────────────────────────────────────────────────
    const chartHost = ref(null);
    const { renderChart: _renderChart, resetZoom, applyTheme, fitDateRange } = useChart(chartHost);

    // ── Theme ──────────────────────────────────────────────────
    const isDark = ref(window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
    watch(isDark, (dark) => {
      document.documentElement.classList.toggle("dark", dark);
      applyTheme(dark);
    }, { immediate: true });

    // ── Mobile Responsive Swipe States ─────────────────────────
    const activeTab = ref(1); // Default: Chart view
    const showSettings = ref(false);
    const isMobile = ref(window.innerWidth < 768);

    function checkMobileWidth() {
      isMobile.value = window.innerWidth < 768;
    }
    window.addEventListener("resize", checkMobileWidth);

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    function onTouchStart(e) {
      const target = e.target;
      if (
        target.closest(".chart-host") ||
        target.closest(".chart-band") ||
        target.closest("input") ||
        target.closest("select") ||
        target.closest("textarea") ||
        target.closest("button") ||
        target.closest(".wl-chip") ||
        target.closest(".wl-icon-btn")
      ) {
        return;
      }
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
    }

    function onTouchMove(e) {}

    function onTouchEnd(e) {
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      const duration = Date.now() - touchStartTime;

      if (duration < 300 && Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > 0) {
          if (activeTab.value > 0) activeTab.value--;
        } else {
          if (activeTab.value < 2) activeTab.value++;
        }
      }
    }

    const swipeStyle = computed(() => {
      return {
        transform: isMobile.value ? `translate3d(-${activeTab.value * 33.3333}%, 0, 0)` : "none"
      };
    });

    // ── State ──────────────────────────────────────────────────
    const loading           = ref(false);
    const error             = ref("");
    const snapshot          = ref(null);
    const requestId         = ref(0);
    const radarLoading      = ref(false);
    const radarError        = ref("");
    const radar             = ref(null);
    const backtestLoading   = ref(false);
    const backtestError     = ref("");
    const backtest          = ref(null);
    const backtestRequestId = ref(0);

    const form         = reactive({ symbol: "SNDK", tf: "1d", limit: 600, algorithm: "swing_pulse_v1" });
    const toggles      = reactive({ ema: true, aux: true, signals: true });
    const radarForm    = reactive({ symbols: "", lookback: 15, max: 36 });
    const backtestForm = reactive({ start: getDateOffset(90), end: todayIso(), tf: "1d" });
    const activePreset = ref("3m");

    // ── Watchlist ──────────────────────────────────────────────
    const _stored = (() => {
      try { return JSON.parse(localStorage.getItem("ih_watchlist") || "null"); } catch { return null; }
    })();
    const _cleanupSymbols = ["AAPL", "TSM", "GOOG", "MRVL", "COHR", "AXTI", "ANET", "CRCL", "NVDA", "INTW", "AAOX", "LNOK", "MUU", "SNXX", "DRAM"];
    const _shouldReset = !Array.isArray(_stored) || !_stored.length || _stored.some(s => _cleanupSymbols.includes(s));
    const watchlist         = ref(_shouldReset ? [...WATCHLIST_DEFAULT] : _stored);
    if (_shouldReset) {
      localStorage.setItem("ih_watchlist", JSON.stringify(WATCHLIST_DEFAULT));
    }
    const watchlistEditMode = ref(false);
    const watchlistInput    = ref("");
    const watchlistNewSym   = ref("");
    const isDeleteMode      = ref(false);
    const confirmDeleteSym  = ref(null);

    function toggleDeleteMode() {
      isDeleteMode.value = !isDeleteMode.value;
      confirmDeleteSym.value = null;
    }

    function handleChipClick(sym) {
      if (isDeleteMode.value) {
        if (confirmDeleteSym.value === sym) {
          removeWatchlistSymbol(sym);
          confirmDeleteSym.value = null;
        } else {
          confirmDeleteSym.value = sym;
        }
      } else {
        loadWatchlistSymbol(sym);
      }
    }

    function confirmDelete(sym) {
      removeWatchlistSymbol(sym);
      confirmDeleteSym.value = null;
    }

    function _saveWatchlist() {
      localStorage.setItem("ih_watchlist", JSON.stringify(watchlist.value));
    }

    function openWatchlistEdit() {
      isDeleteMode.value = false;
      confirmDeleteSym.value = null;
      watchlistInput.value = watchlist.value.join(", ");
      watchlistEditMode.value = true;
    }

    function saveWatchlistEdit() {
      const symbols = watchlistInput.value
        .split(/[,\n\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);
      watchlist.value = [...new Set(symbols)];
      _saveWatchlist();
      watchlistEditMode.value = false;
    }

    function cancelWatchlistEdit() {
      watchlistEditMode.value = false;
    }

    function addWatchlistSymbol() {
      const sym = watchlistNewSym.value.trim().toUpperCase();
      if (!sym || watchlist.value.includes(sym)) { watchlistNewSym.value = ""; return; }
      watchlist.value = [...watchlist.value, sym];
      _saveWatchlist();
      watchlistNewSym.value = "";
    }

    function removeWatchlistSymbol(symbol) {
      watchlist.value = watchlist.value.filter((s) => s !== symbol);
      _saveWatchlist();
    }

    async function fetchWatchlist() {
      try {
        const res  = await fetch("/api/watchlist");
        const data = await res.json();
        if (!res.ok || !data.ok || !Array.isArray(data.symbols) || !data.symbols.length) return false;
        watchlist.value = [...new Set(data.symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
        _saveWatchlist();
        return true;
      } catch {
        return false;
      }
    }

    async function resetWatchlist() {
      const ok = await fetchWatchlist();
      if (!ok) {
        watchlist.value = [...WATCHLIST_DEFAULT];
        _saveWatchlist();
      }
    }

    function loadWatchlistSymbol(symbol) {
      form.symbol = symbol;
      loadSnapshot();
      if (isMobile.value) {
        activeTab.value = 1; // Swipe to Chart
      }
    }

    async function runRadarOnWatchlist() {
      if (!watchlist.value.length) return;
      radarLoading.value = true;
      radarError.value   = "";
      try {
        const params = new URLSearchParams({
          tf:        "1d",
          limit:     String(form.limit || 600),
          lookback:  String(radarForm.lookback || 4),
          max:       String(watchlist.value.length),
          symbols:   watchlist.value.join(","),
          algorithm: form.algorithm || "swing_pulse_v1"
        });
        const res  = await fetch(`/api/radar?${params}`);
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        radar.value = data;
      } catch (err) {
        radarError.value = err.message || String(err);
      } finally {
        radarLoading.value = false;
      }
    }

    // ── Computed ───────────────────────────────────────────────
    const statusText = computed(() => {
      if (error.value)             return error.value;
      if (loading.value)           return "Fetching TradingView data";
      if (snapshot.value?.cached)  return "Cached snapshot loaded";
      if (snapshot.value?.ok)      return "Snapshot loaded";
      return "Ready";
    });

    const radarStatusText = computed(() => {
      if (radarError.value)      return "Error";
      if (radarLoading.value)    return "Scanning";
      if (radar.value?.cached)   return "Cached";
      if (radar.value?.ok)       return "Ready";
      return "Idle";
    });

    const radarSummary = computed(() => {
      if (radarError.value)   return radarError.value;
      const universeLabel = radarForm.symbols ? "自选股票池" : "纳指100科技股";
      if (radarLoading.value) return `Scanning ${radarForm.max} ${universeLabel} on 1D`;
      if (!radar.value)       return "No scan yet";
      const { scanned, bullish, bearish, elapsedMs } = radar.value;
      return `${scanned} scanned (${universeLabel}) · ${(bullish || []).length} bullish · ${(bearish || []).length} bearish · ${Math.round(elapsedMs / 1000)}s`;
    });

    const backtestSummary = computed(() => {
      if (backtestError.value)   return backtestError.value;
      if (backtestLoading.value) return `Running 1D ${(form.symbol || "SNDK").toUpperCase()} comparison`;
      if (!backtest.value)       return "No comparison yet";
      const bt    = backtest.value;
      const start = bt.actualStartDate || bt.startDate;
      const end   = bt.actualEndDate   || bt.endDate;
      return `${start} to ${end} · 1D · best ${bt.bestStrategyName || "..."}`;
    });

    const displaySymbol     = computed(() => snapshot.value?.symbol || form.symbol.toUpperCase());
    const lastPrice         = computed(() => money(snapshot.value?.bars?.at(-1)?.close));
    const pulseScore        = computed(() => snapshot.value?.pulse?.score ?? "...");
    const pulseLabel        = computed(() => snapshot.value?.pulse?.label || "Neutral");
    const signalCount       = computed(() => `${snapshot.value?.signals?.length || 0} marks`);
    const recentSignals     = computed(() => [...(snapshot.value?.signals || [])].slice(-12).reverse());
    const riskDirection     = computed(() => {
      const r = snapshot.value?.risk;
      if (!r) return "空仓观望";
      return r.statusLabel || (r.direction === "holding_long" ? "多头持仓跟踪" : r.direction === "flat_cash" ? "空仓观望 (Cash)" : "多头观察");
    });
    const radarBullish      = computed(() => radar.value?.bullish || []);
    const radarBearish      = computed(() => radar.value?.bearish || []);
    const backtestRows      = computed(() => {
      const list = backtest.value?.strategies || [];
      return [...list].sort((a, b) => {
        const retA = Number.isFinite(Number(a?.totalReturn)) ? Number(a.totalReturn) : -Infinity;
        const retB = Number.isFinite(Number(b?.totalReturn)) ? Number(b.totalReturn) : -Infinity;
        return retB - retA; // Best performing first (left-to-right), worst last
      });
    });
    const backtestSymbol    = computed(() =>
      (backtestLoading.value ? form.symbol : backtest.value?.symbol || form.symbol || "SNDK").toUpperCase()
    );
    const mutantBars        = computed(() => (snapshot.value?.mutant || []).slice(-180));

    const splitText = computed(() => {
      const p = snapshot.value?.pulse;
      return p ? `${percent(p.bull)} / ${percent(p.bear)} / ${percent(p.neutral)}` : "...";
    });
    const riskText = computed(() => {
      const r = snapshot.value?.risk;
      return r ? `${money(r.entry)} / ${money(r.stop)}` : "...";
    });
    const targetText = computed(() => {
      const r = snapshot.value?.risk;
      return r ? `${money(r.target1)} / ${money(r.target2)}` : "No risk model";
    });
    const backtestText = computed(() => {
      const bt = snapshot.value?.backtest;
      return bt?.winRate != null ? `${percent(bt.winRate)} WR` : "...";
    });
    const expectancyText = computed(() => {
      const bt = snapshot.value?.backtest;
      return bt ? `${bt.trades} trades, ${percent(bt.expectancy)} avg` : "No trades";
    });

    const regimeText = computed(() => {
      const reg = snapshot.value?.regime;
      if (!reg) return "...";
      const qqq = reg.qqqUp ? "QQQ多头" : "QQQ偏弱";
      const smh = reg.smhUp ? "SMH多头" : "SMH偏弱";
      const status = reg.regime === "bullish" ? "共振向上" : reg.regime === "bearish" ? "弱势防守" : "震荡中性";
      const rs = Number.isFinite(Number(reg.rs)) ? `RS ${round(reg.rs, 3)}` : "";
      return `${qqq} · ${smh} (${status}) ${rs ? "· " + rs : ""}`;
    });

    const swingEvaluation = computed(() => {
      return backtest.value?.swingEvaluation || snapshot.value?.swingEvaluation || null;
    });

    // ── Helpers ────────────────────────────────────────────────
    function strategyMeta(item) {
      if (!item) return "";
      const wr = Number.isFinite(Number(item.winRate)) ? `${percent(item.winRate)} WR` : "No WR";
      return `${item.trades || 0} trades · ${wr} · ${signedPercent(item.maxDrawdown)} DD`;
    }
    function returnClass(value) {
      const n = Number(value);
      return { positive: n > 0, negative: n < 0 };
    }
    function formatSignalTime(time) { return formatTimeFor("1d", time); }
    function radarTime(item)        { return formatTimeFor("1d", item?.signalTime); }
    function mutantStyle(point) {
      const v      = Number(point.value || 0);
      const height = 12 + Math.abs(v) * 48;
      const top    = v >= 0 ? 60 - height : 60;
      return { height: `${height}px`, transform: `translateY(${top}px)` };
    }

    // ── Chart rendering ────────────────────────────────────────
    async function doRender(snap) {
      await _renderChart(
        snap || snapshot.value,
        toggles,
        isDark.value,
        { start: backtestForm.start, end: backtestForm.end }
      );
      applyTheme(isDark.value);
    }

    // ── API ────────────────────────────────────────────────────
    async function loadSnapshot() {
      const id = ++requestId.value;
      loading.value = true;
      error.value   = "";
      resetZoom();
      try {
        const params = new URLSearchParams({
          symbol: form.symbol || "SNDK",
          tf: "1d",
          limit: String(form.limit || 600),
          algorithm: form.algorithm || "swing_pulse_v1"
        });
        const res    = await fetch(`/api/market/snapshot?${params}`);
        const data   = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (id !== requestId.value) return;
        snapshot.value = data;
        await doRender(data);
        if (!backtest.value || backtest.value.symbol !== data.symbol) runBacktest(data.symbol);
      } catch (err) {
        if (id === requestId.value) error.value = err.message || String(err);
      } finally {
        if (id === requestId.value) loading.value = false;
      }
    }

    async function runRadar() {
      radarLoading.value = true;
      radarError.value   = "";
      try {
        const params = new URLSearchParams({
          tf:        "1d",
          limit:     String(form.limit || 600),
          lookback:  String(radarForm.lookback || 4),
          max:       String(radarForm.max || 36),
          algorithm: form.algorithm || "swing_pulse_v1"
        });
        if (radarForm.symbols) params.set("symbols", radarForm.symbols);
        const res  = await fetch(`/api/radar?${params}`);
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        radar.value = data;
      } catch (err) {
        radarError.value = err.message || String(err);
      } finally {
        radarLoading.value = false;
      }
    }

    async function runBacktest(symbolOverride) {
      const id = ++backtestRequestId.value;
      backtestLoading.value = true;
      backtestError.value   = "";
      fitDateRange(backtestForm.start, backtestForm.end);
      try {
        const startStr = backtestForm.start || getDateOffset(90);
        const endStr   = backtestForm.end   || todayIso();
        const oldestBarDate = snapshot.value?.bars?.[0]?.date;
        if (oldestBarDate && startStr < oldestBarDate) {
          const days = Math.ceil((new Date(endStr) - new Date(startStr)) / 86400000);
          const needed = Math.min(2500, Math.ceil(days * (5 / 7)) + 60);
          if (needed > form.limit) {
            form.limit = needed;
            await loadSnapshot();
            return;
          }
        }

        const params = new URLSearchParams({
          symbol:    symbolOverride || form.symbol || "SNDK",
          tf:        "1d",
          start:     startStr,
          end:       endStr,
          algorithm: form.algorithm || "swing_pulse_v1"
        });
        const res  = await fetch(`/api/backtest?${params}`);
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (id !== backtestRequestId.value) return;
        backtest.value = data;
      } catch (err) {
        if (id === backtestRequestId.value) backtestError.value = err.message || String(err);
      } finally {
        if (id === backtestRequestId.value) backtestLoading.value = false;
      }
    }

    function setBacktestRange(presetId) {
      activePreset.value = presetId;
      const end = todayIso();
      let start = "";
      if (presetId === "1m") {
        start = getDateOffset(30);
      } else if (presetId === "3m") {
        start = getDateOffset(90);
      } else if (presetId === "6m") {
        start = getDateOffset(180);
      } else if (presetId === "ytd") {
        start = getYtdIso();
      } else if (presetId === "1y") {
        start = getDateOffset(365);
      } else {
        start = getDateOffset(90);
      }
      backtestForm.start = start;
      backtestForm.end = end;
      fitDateRange(start, end);
      runBacktest();
    }

    function onDateRangeChange() {
      activePreset.value = "";
      fitDateRange(backtestForm.start, backtestForm.end);
      runBacktest();
    }

    function changeTimeframe() {
      form.tf = "1d";
      form.limit = 600;
      loadSnapshot();
      runRadar();
    }

    function openRadarSymbol(item) {
      if (!item?.symbol) return;
      form.symbol = item.symbol;
      loadSnapshot();
      runBacktest(item.symbol);
      if (isMobile.value) {
        activeTab.value = 1; // Swipe to Chart
      }
      const target = document.querySelector(".chart-host") || document.querySelector(".chart-panel") || document.body;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }

    function loadSnapshotAndClose() {
      loadSnapshot();
      showSettings.value = false;
    }

    function runRadarAndClose() {
      runRadar();
      showSettings.value = false;
    }

    onMounted(async () => {
      await fetchWatchlist();
      await loadSnapshot();
      runRadar();
    });

    return {
      // refs
      chartHost, isDark,
      loading, error, snapshot,
      radarLoading, radar,
      backtestLoading, backtestError, backtest,
      // mobile states
      activeTab, showSettings, isMobile, swipeStyle,
      onTouchStart, onTouchMove, onTouchEnd,
      loadSnapshotAndClose, runRadarAndClose,
      // forms
      form, radarForm, backtestForm, toggles,
      activePreset,
      // constants
      timeframes: TIMEFRAMES,
      backtestPresets: BACKTEST_PRESETS,
      algorithmOptions: ALGORITHM_OPTIONS,
      // computed
      statusText, radarStatusText, radarSummary, backtestSummary,
      displaySymbol, lastPrice, pulseScore, pulseLabel,
      splitText, riskText, targetText, backtestText, expectancyText,
      regimeText, swingEvaluation,
      activeTimeframeLabel: computed(() => "1D"),
      radarBullish, radarBearish, backtestRows, backtestSymbol,
      signalCount, recentSignals, riskDirection, mutantBars,
      // watchlist
      watchlist, watchlistEditMode, watchlistInput, watchlistNewSym,
      isDeleteMode, confirmDeleteSym, toggleDeleteMode, handleChipClick, confirmDelete,
      openWatchlistEdit, saveWatchlistEdit, cancelWatchlistEdit,
      addWatchlistSymbol, removeWatchlistSymbol, resetWatchlist, loadWatchlistSymbol, runRadarOnWatchlist,
      // formatters
      money, percent, signedPercent, strategyMeta, reasonLabel, round,
      returnClass, formatSignalTime, radarTime, mutantStyle,
      // actions
      toggleTheme:              () => { isDark.value = !isDark.value; },
      loadSnapshot,
      renderChart:              () => doRender(),
      changeTimeframe,
      runRadar,
      runBacktest,
      setBacktestRange,
      onDateRangeChange,
      fitDateRange,
      openRadarSymbol
    };
  }
}).mount("#app");
