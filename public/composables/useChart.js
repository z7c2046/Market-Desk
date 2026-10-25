import { toChartBar, markerFor, formatTimeFor } from "../utils.js";

const { ref, nextTick } = Vue;

const THEMES = {
  light: {
    bg:         { type: "solid", color: "#FFFFFF" },
    text:       "#64748b",
    grid:       "rgba(0,0,0,0.07)",
    border:     "#e2e8f0"
  },
  dark: {
    bg:         { type: "solid", color: "#000000" },
    text:       "#94a3b8",
    grid:       "rgba(255,255,255,0.08)",
    border:     "rgba(255,255,255,0.10)"
  }
};

const KLINE_PALETTES = {
  classic:   { up: "#10b981", down: "#f43f5e" },
  neon:      { up: "#7ce138", down: "#ff4d82" },
  cyberpunk: { up: "#00d2ff", down: "#ff3377" }
};

function getActivePalette() {
  try {
    const saved = JSON.parse(localStorage.getItem('market-desk-kline-scheme'));
    return KLINE_PALETTES[saved] || KLINE_PALETTES.classic;
  } catch {
    return KLINE_PALETTES.classic;
  }
}

export function useChart(chartHostRef) {
  const chart        = ref(null);
  const candleSeries = ref(null);
  const emaSeries    = ref(null);
  const auxSeries    = ref(null);
  const stopSeries   = ref(null);

  let currentBars  = [];
  let yZoomFactor  = 1.0;
  let yOffsetPrice = 0.0;

  function _autoscale() {
    return (original) => {
      const res = original();
      if (res?.priceRange) {
        const { minValue: lo, maxValue: hi } = res.priceRange;
        const center    = (lo + hi) / 2 + yOffsetPrice;
        const halfRange = ((hi - lo) / 2) * yZoomFactor;
        return {
          priceRange: { minValue: center - halfRange, maxValue: center + halfRange },
          margins: res.margins
        };
      }
      return res;
    };
  }

  function _refresh() {
    if (!chart.value) return;
    chart.value.priceScale("right").applyOptions({ autoScale: true });
    candleSeries.value?.applyOptions({});
    emaSeries.value?.applyOptions({});
    auxSeries.value?.applyOptions({});
    stopSeries.value?.applyOptions({});
  }

  function applyTheme(isDark) {
    if (!chart.value) return;
    const t = isDark ? THEMES.dark : THEMES.light;
    chart.value.applyOptions({
      layout: { background: t.bg, textColor: t.text },
      grid:   { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border },
      timeScale:       { borderColor: t.border }
    });
    const pal = getActivePalette();
    candleSeries.value?.applyOptions({
      upColor: pal.up, downColor: pal.down,
      borderUpColor: pal.up, borderDownColor: pal.down,
      wickUpColor: pal.up, wickDownColor: pal.down
    });
  }

  function _bindEvents(host) {
    host.addEventListener("wheel", (e) => {
      if (!chart.value) return;
      e.preventDefault();
      const rect           = host.getBoundingClientRect();
      const priceScaleW    = chart.value.priceScale("right").width() || 60;
      const overPriceScale = e.clientX - rect.left >= rect.width - priceScaleW;
      if (overPriceScale) {
        e.stopPropagation();
        yZoomFactor = e.deltaY < 0
          ? Math.max(0.1, yZoomFactor * 0.9)
          : Math.min(10.0, yZoomFactor * 1.1);
        _refresh();
      }
    }, { passive: false, capture: true });

    host.addEventListener("dblclick", (e) => {
      if (!chart.value) return;
      const rect        = host.getBoundingClientRect();
      const priceScaleW = chart.value.priceScale("right").width() || 60;
      if (e.clientX - rect.left >= rect.width - priceScaleW) {
        yZoomFactor  = 1.0;
        yOffsetPrice = 0.0;
        _refresh();
      }
    });

    let dragging = false, startY = 0, initOffset = 0;
    host.addEventListener("mousedown", (e) => {
      const rect        = host.getBoundingClientRect();
      const priceScaleW = chart.value?.priceScale("right").width() || 60;
      if (e.clientX - rect.left < rect.width - priceScaleW) {
        dragging = true; startY = e.clientY; initOffset = yOffsetPrice;
      }
    });
    host.addEventListener("mousemove", (e) => {
      if (!dragging || !candleSeries.value) return;
      const rect = host.getBoundingClientRect();
      const p0   = candleSeries.value.coordinateToPrice(0);
      const pH   = candleSeries.value.coordinateToPrice(rect.height);
      if (p0 !== null && pH !== null) {
        yOffsetPrice = initOffset + (e.clientY - startY) * (p0 - pH) / rect.height;
        _refresh();
      }
    });
    const stopDrag = () => { dragging = false; };
    host.addEventListener("mouseup",    stopDrag);
    host.addEventListener("mouseleave", stopDrag);
  }

  function _init(isDark = false) {
    if (chart.value || !chartHostRef.value || !window.LightweightCharts) return;
    const host = chartHostRef.value;
    const t    = isDark ? THEMES.dark : THEMES.light;

    chart.value = LightweightCharts.createChart(host, {
      autoSize: true,
      layout: {
        background:  t.bg,
        textColor:   t.text,
        fontFamily:  "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize:    12
      },
      grid:            { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border },
      timeScale:       { borderColor: t.border, timeVisible: true },
      crosshair:       { mode: 1 },
      handleScroll:    { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale:     {
        mouseWheel: true, pinch: true,
        axisPressedMouseMove:   { time: true, price: true },
        axisDoubleClickReset:   { time: true, price: true }
      }
    });

    const provider    = _autoscale();
    const pal         = getActivePalette();
    candleSeries.value = chart.value.addCandlestickSeries({
      upColor:        pal.up, downColor:        pal.down,
      borderUpColor:  pal.up, borderDownColor:  pal.down,
      wickUpColor:    pal.up, wickDownColor:    pal.down,
      autoscaleInfoProvider: provider
    });
    emaSeries.value = chart.value.addLineSeries({ color: "#2976ff", lineWidth: 2, priceLineVisible: false, autoscaleInfoProvider: provider });
    auxSeries.value = chart.value.addLineSeries({ color: "#f37d42", lineWidth: 2, priceLineVisible: false, autoscaleInfoProvider: provider });
    stopSeries.value = chart.value.addLineSeries({ color: "rgba(223, 79, 70, 0.85)", lineWidth: 1.5, lineStyle: 2, priceLineVisible: false, autoscaleInfoProvider: provider });

    _bindEvents(host);
  }

  function resetZoom() {
    yZoomFactor  = 1.0;
    yOffsetPrice = 0.0;
  }

  function fitDateRange(startDate, endDate) {
    if (!chart.value || !candleSeries.value || !currentBars.length) return;
    const startStr = String(startDate || "").trim();
    const endStr   = String(endDate || "").trim();

    let fromIdx = 0;
    if (startStr) {
      const idx = currentBars.findIndex(b => (b.date || formatTimeFor("1d", b.time)) >= startStr);
      if (idx !== -1) {
        fromIdx = idx;
      } else {
        fromIdx = Math.max(0, currentBars.length - 1);
      }
    }

    let toIdx = currentBars.length - 1;
    if (endStr) {
      let found = false;
      for (let i = currentBars.length - 1; i >= 0; i--) {
        const bDate = currentBars[i].date || formatTimeFor("1d", currentBars[i].time);
        if (bDate <= endStr) {
          toIdx = i;
          found = true;
          break;
        }
      }
      if (!found) {
        toIdx = 0;
      }
    }

    if (fromIdx <= toIdx) {
      resetZoom();
      chart.value.timeScale().setVisibleLogicalRange({
        from: Math.max(0, fromIdx - 0.5),
        to: Math.min(currentBars.length - 1, toIdx) + 0.5
      });
      const priceScale = chart.value.priceScale("right");
      priceScale.applyOptions({ autoScale: false });
      priceScale.applyOptions({ autoScale: true });
    }
  }

  async function renderChart(snap, toggles, isDark = false, dateRange = null) {
    await nextTick();
    _init(isDark);
    if (!snap || !candleSeries.value) return;

    currentBars = snap.bars || [];
    candleSeries.value.setData(currentBars.map(toChartBar));
    emaSeries.value.setData(toggles.ema ? snap.ema_series || [] : []);
    auxSeries.value.setData(toggles.aux ? snap.aux_series || [] : []);
    stopSeries.value.setData(toggles.signals && snap.trailing_stop_series ? snap.trailing_stop_series : []);
    candleSeries.value.setMarkers(toggles.signals ? (snap.signals || []).map(markerFor) : []);

    if (currentBars.length > 0) {
      if (dateRange && (dateRange.start || dateRange.end)) {
        fitDateRange(dateRange.start, dateRange.end);
      } else {
        // Default visible range: Recent 3 months (~65 daily trading bars)
        const total = currentBars.length;
        const count = Math.min(total, 65);
        chart.value.timeScale().setVisibleLogicalRange({
          from: Math.max(0, total - count),
          to: total - 1
        });
      }
    } else {
      chart.value.timeScale().fitContent();
    }

    const priceScale = chart.value.priceScale("right");
    priceScale.applyOptions({ autoScale: false });
    priceScale.applyOptions({ autoScale: true });
  }

  return { renderChart, resetZoom, applyTheme, fitDateRange };
}
