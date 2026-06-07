import { toChartBar, markerFor } from "../utils.js";

const { ref, nextTick } = Vue;

const THEMES = {
  light: {
    bg:         { type: "solid", color: "#FFFFFF" },
    text:       "#6E6E73",
    grid:       "rgba(0,0,0,0.04)",
    border:     "rgba(0,0,0,0.08)"
  },
  dark: {
    bg:         { type: "solid", color: "#1C1C1E" },
    text:       "#A1A1A6",
    grid:       "rgba(255,255,255,0.05)",
    border:     "rgba(255,255,255,0.09)"
  }
};

export function useChart(chartHostRef) {
  const chart        = ref(null);
  const candleSeries = ref(null);
  const emaSeries    = ref(null);
  const auxSeries    = ref(null);

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
    }, { passive: false });

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
    candleSeries.value = chart.value.addCandlestickSeries({
      upColor:        "#30D158", downColor:        "#FF453A",
      borderUpColor:  "#30D158", borderDownColor:  "#FF453A",
      wickUpColor:    "#30D158", wickDownColor:    "#FF453A",
      autoscaleInfoProvider: provider
    });
    emaSeries.value = chart.value.addLineSeries({ color: "#0071E3", lineWidth: 2, priceLineVisible: false, autoscaleInfoProvider: provider });
    auxSeries.value = chart.value.addLineSeries({ color: "#FF9F0A", lineWidth: 2, priceLineVisible: false, autoscaleInfoProvider: provider });

    _bindEvents(host);
  }

  function resetZoom() {
    yZoomFactor  = 1.0;
    yOffsetPrice = 0.0;
  }

  async function renderChart(snap, toggles, isDark = false) {
    await nextTick();
    _init(isDark);
    if (!snap || !candleSeries.value) return;
    candleSeries.value.setData((snap.bars || []).map(toChartBar));
    emaSeries.value.setData(toggles.ema ? snap.ema_series || [] : []);
    auxSeries.value.setData(toggles.aux ? snap.aux_series || [] : []);
    candleSeries.value.setMarkers(toggles.signals ? (snap.signals || []).map(markerFor) : []);
    chart.value.timeScale().fitContent();
  }

  return { renderChart, resetZoom, applyTheme };
}
