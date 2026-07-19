import { money, percent, signedPercent, todayIso, formatTimeFor } from "./utils.js";
import { useChart } from "./composables/useChart.js";

const { createApp, computed, onMounted, reactive, ref, watch } = Vue;

// ── Default Watchlist (TradingView watchlist pre-set) ──────────────────────
const WATCHLIST_DEFAULT = [
  "005930", "000660", "NOK", "AAOI", "MU", "SNDK", "SKHY", "INTC"
];

const TIMEFRAMES = [
  { label: "15m", value: "15m", limit: 500 },
  { label: "30m", value: "30m", limit: 500 },
  { label: "1h",  value: "1h",  limit: 500 },
  { label: "4h",  value: "4h",  limit: 500 },
  { label: "1D",  value: "1d",  limit: 600 }
];

const BACKTEST_TIMEFRAMES = [
  { label: "15m", value: "15m" },
  { label: "30m", value: "30m" },
  { label: "1h",  value: "1h"  },
  { label: "4h",  value: "4h"  },
  { label: "1D",  value: "1d"  }
];

createApp({
  setup() {
    // ── Chart ─────────────────────────────────────────────────
    const chartHost = ref(null);
    const { renderChart: _renderChart, resetZoom, applyTheme } = useChart(chartHost);

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

    const form         = reactive({ symbol: "SNDK", tf: "15m", limit: 500 });
    const toggles      = reactive({ ema: true, aux: true, signals: true });
    const radarForm    = reactive({ symbols: "", lookback: 4, max: 36 });
    const backtestForm = reactive({ start: "2026-01-01", end: todayIso(), tf: "15m" });

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

    function _saveWatchlist() {
      localStorage.setItem("ih_watchlist", JSON.stringify(watchlist.value));
    }

    function openWatchlistEdit() {
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

    // Pull the watchlist from the Notion-backed /api/watchlist endpoint.
    // Returns true on success. On any failure the existing list is kept.
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
          tf:       form.tf,
          limit:    String(form.limit || activeTimeframe.value.limit),
          lookback: String(radarForm.lookback || 4),
          max:      String(watchlist.value.length),
          symbols:  watchlist.value.join(",")
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
    const activeTimeframe = computed(() =>
      TIMEFRAMES.find((t) => t.value === form.tf) || TIMEFRAMES[0]
    );
    const activeBacktestTf = computed(() =>
      BACKTEST_TIMEFRAMES.find((t) => t.value === backtestForm.tf) || BACKTEST_TIMEFRAMES[0]
    );

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
      if (radarLoading.value) return `Scanning ${radarForm.max} symbols on ${activeTimeframe.value.label}`;
      if (!radar.value)       return "No scan yet";
      const { scanned, bullish, bearish, elapsedMs } = radar.value;
      return `${scanned} scanned · ${(bullish || []).length} bullish · ${(bearish || []).length} bearish · ${Math.round(elapsedMs / 1000)}s`;
    });

    const backtestSummary = computed(() => {
      if (backtestError.value)   return backtestError.value;
      if (backtestLoading.value) return `Running ${activeBacktestTf.value.label} ${(form.symbol || "SNDK").toUpperCase()} comparison`;
      if (!backtest.value)       return "No comparison yet";
      const bt    = backtest.value;
      const start = bt.actualStartDate || bt.startDate;
      const end   = bt.actualEndDate   || bt.endDate;
      return `${start} to ${end} · ${bt.tfLabel || bt.tf} · best ${bt.bestStrategyName || "..."}`;
    });

    const displaySymbol     = computed(() => snapshot.value?.symbol || form.symbol.toUpperCase());
    const lastPrice         = computed(() => money(snapshot.value?.bars?.at(-1)?.close));
    const pulseScore        = computed(() => snapshot.value?.pulse?.score ?? "...");
    const pulseLabel        = computed(() => snapshot.value?.pulse?.label || "Neutral");
    const signalCount       = computed(() => `${snapshot.value?.signals?.length || 0} marks`);
    const recentSignals     = computed(() => [...(snapshot.value?.signals || [])].slice(-12).reverse());
    const riskDirection     = computed(() => snapshot.value?.risk?.direction || "long");
    const radarBullish      = computed(() => radar.value?.bullish || []);
    const radarBearish      = computed(() => radar.value?.bearish || []);
    const backtestRows      = computed(() => backtest.value?.strategies || []);
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
    function formatSignalTime(time) { return formatTimeFor(snapshot.value?.tf || form.tf, time); }
    function radarTime(item)        { return formatTimeFor(item?.tf || form.tf, item?.signalTime); }
    function mutantStyle(point) {
      const v      = Number(point.value || 0);
      const height = 12 + Math.abs(v) * 48;
      const top    = v >= 0 ? 60 - height : 60;
      return { height: `${height}px`, transform: `translateY(${top}px)` };
    }

    // ── Chart rendering ────────────────────────────────────────
    async function doRender(snap) {
      await _renderChart(snap || snapshot.value, toggles, isDark.value);
      applyTheme(isDark.value);
    }

    // ── API ────────────────────────────────────────────────────
    async function loadSnapshot() {
      const id = ++requestId.value;
      loading.value = true;
      error.value   = "";
      resetZoom();
      try {
        const params = new URLSearchParams({ symbol: form.symbol || "SNDK", tf: form.tf, limit: String(form.limit || 600) });
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
          tf:       form.tf,
          limit:    String(form.limit || activeTimeframe.value.limit),
          lookback: String(radarForm.lookback || 4),
          max:      String(radarForm.max || 36)
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
      try {
        const params = new URLSearchParams({
          symbol: symbolOverride || form.symbol || "SNDK",
          tf:     backtestForm.tf || activeBacktestTf.value.value,
          start:  backtestForm.start || "2026-01-01",
          end:    backtestForm.end   || todayIso()
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

    function changeTimeframe(tf) {
      const next = TIMEFRAMES.find((t) => t.value === tf) || TIMEFRAMES[0];
      form.tf    = next.value;
      form.limit = next.limit;
      loadSnapshot();
      runRadar();
    }

    function changeBacktestTimeframe(tf) {
      const found = BACKTEST_TIMEFRAMES.find((t) => t.value === tf) || BACKTEST_TIMEFRAMES[0];
      backtestForm.tf = found.value;
      // ── Sync main chart to the same timeframe ──────────────────
      const chartTf = TIMEFRAMES.find((t) => t.value === found.value);
      if (chartTf) {
        form.tf    = chartTf.value;
        form.limit = chartTf.limit;
        loadSnapshot();   // reload chart with new TF
      }
      runBacktest();
    }

    function openRadarSymbol(item) {
      if (!item?.symbol) return;
      form.symbol = item.symbol;
      if (item.tf) form.tf = item.tf;
      loadSnapshot();
      if (isMobile.value) {
        activeTab.value = 1; // Swipe to Chart
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
      await fetchWatchlist();   // Notion watchlist is the source of truth on load
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
      // constants
      timeframes: TIMEFRAMES,
      backtestTimeframes: BACKTEST_TIMEFRAMES,
      // computed
      statusText, radarStatusText, radarSummary, backtestSummary,
      displaySymbol, lastPrice, pulseScore, pulseLabel,
      splitText, riskText, targetText, backtestText, expectancyText,
      activeTimeframeLabel: computed(() => activeTimeframe.value.label),
      radarBullish, radarBearish, backtestRows, backtestSymbol,
      signalCount, recentSignals, riskDirection, mutantBars,
      // watchlist
      watchlist, watchlistEditMode, watchlistInput, watchlistNewSym,
      openWatchlistEdit, saveWatchlistEdit, cancelWatchlistEdit,
      addWatchlistSymbol, removeWatchlistSymbol, resetWatchlist, loadWatchlistSymbol, runRadarOnWatchlist,
      // formatters
      money, percent, signedPercent, strategyMeta,
      returnClass, formatSignalTime, radarTime, mutantStyle,
      // actions
      toggleTheme:              () => { isDark.value = !isDark.value; },
      loadSnapshot,
      renderChart:              () => doRender(),
      changeTimeframe,
      runRadar,
      runBacktest,
      changeBacktestTimeframe,
      openRadarSymbol
    };
  }
}).mount("#app");
