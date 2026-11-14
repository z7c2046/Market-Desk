/**
 * TradingView + OpenMarket 风格价格轴运动与自动平滑适配器 (v3.0)
 *
 * 核心特性：
 * 1. 单一 rAF 调度与指数时间收敛 (默认 rate = 21.5/s)，价格轴滚轮缩放与 X 轴同等丝滑
 * 2. 逐样本乘法目标累计 (queuePriceZoom) 与反向即时截断债务 (Reversal Debt Cancellation)
 * 3. 真实光标价格锚点 (coordinateToPrice(pointerY))
 * 4. 价格轴拖拽拉伸/压缩 (dragScalePrice) 与 rAF 样本合并 (Coalescing)，彻底杜绝卡顿与跳变
 * 5. 绘图区二维平移 (panPrice) 基准位移锁定，无累积抖动
 * 6. 原生 autoscaleInfoProvider 适配，扩张保护 (Expansion Protection) 与双击复位
 */

import {
  clamp,
  easeAlpha,
  safeAutoPriceStep,
  zoomPriceAbout,
  finiteRange
} from './klineGeometry.js';

export function createPriceMotionController(chart, candleSeries, options = {}) {
  const rate = options.rate ?? 21.5;
  const settleRatio = options.settleRatio ?? 0.0005;
  const axisSensitivity = options.axisSensitivity ?? 0.0055;
  const zoomGain = options.zoomGain ?? 0.0006;
  const enableAutoSmooth = options.enableAutoSmooth ?? false;
  const onPriceModeChange = options.onPriceModeChange || null;
  const onPriceChange = options.onPriceChange || null;

  let epoch = 0;
  let disposed = false;
  let rafId = 0;
  let lastFrameAt = null;

  const requestFrame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(() => cb(typeof performance !== 'undefined' ? performance.now() : Date.now()), 16);
  const cancelFrame = typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame
    : (id) => clearTimeout(id);

  let priceMode = 'auto'; // 'auto' | 'manual'
  const seriesRecords = new Map(); // key -> { series, displayRange, targetRange, active }

  let manualDisplayRange = null; // { from, to }
  let manualTargetRange = null;  // { from, to }
  let manualAnchorPrice = null;  // anchor price for ongoing zoom gesture
  let pendingDragRange = null;   // coalesced range for pointer dragging

  function getPriceScale() {
    return chart?.priceScale ? chart.priceScale('right') : null;
  }

  function setPriceMode(mode) {
    if (priceMode !== mode) {
      priceMode = mode;
      onPriceModeChange?.(mode);
    }
  }

  function isReducedMotion() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }

  function cancelMotion(reason = 'manual') {
    epoch++;
    if (rafId) {
      cancelFrame(rafId);
      rafId = 0;
    }
    lastFrameAt = null;
    manualAnchorPrice = null;
    pendingDragRange = null;
    if (manualDisplayRange && manualTargetRange) {
      manualTargetRange = { ...manualDisplayRange };
    }
  }

  function scheduleFrame() {
    if (rafId || disposed) return;
    const capturedEpoch = epoch;

    rafId = requestFrame((now) => {
      rafId = 0;
      if (disposed || capturedEpoch !== epoch) return;
      stepMotion(now);
    });
  }

  let isAutoScaleDisabled = false;

  function commitManualPrice(range) {
    if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to)) return;
    const scale = getPriceScale();
    if (!scale) return;

    if (!isAutoScaleDisabled) {
      if (typeof scale.setAutoScale === 'function') {
        scale.setAutoScale(false);
      } else if (typeof scale.applyOptions === 'function') {
        scale.applyOptions({ autoScale: false });
      }
      isAutoScaleDisabled = true;
    }

    if (typeof scale.setVisibleRange === 'function') {
      try {
        const from = Math.min(range.from, range.to);
        const to = Math.max(range.from, range.to);
        scale.setVisibleRange({
          from,
          to
        });
        onPriceChange?.();
      } catch (_) {}
    }
  }

  function stepMotion(now) {
    if (lastFrameAt === null) {
      lastFrameAt = now;
      scheduleFrame();
      return;
    }

    let dt = (now - lastFrameAt) / 1000;
    lastFrameAt = now;

    if (dt > 0.25 || (typeof document !== 'undefined' && document.hidden)) {
      cancelMotion('gap-timeout');
      return;
    }
    if (dt > 0.05) dt = 0.05;

    let hasWork = false;

    // 1. 提交指针拖拽最新合并状态 (Pointer drag update)
    if (pendingDragRange) {
      const r = pendingDragRange;
      pendingDragRange = null;
      commitManualPrice(r);
    }

    // 2. 推进滚轮平滑缩放缓动 (Smooth zoom easing)
    if (manualDisplayRange && manualTargetRange) {
      const fromDebt = manualTargetRange.from - manualDisplayRange.from;
      const toDebt = manualTargetRange.to - manualDisplayRange.to;
      const span = manualDisplayRange.to - manualDisplayRange.from;

      if (Math.abs(fromDebt) > 1e-5 || Math.abs(toDebt) > 1e-5) {
        const alpha = easeAlpha(rate, dt);
        let nextFrom = manualDisplayRange.from + fromDebt * alpha;
        let nextTo = manualDisplayRange.to + toDebt * alpha;

        const settleLimit = Math.max(span * settleRatio, 1e-5);
        if (
          Math.abs(manualTargetRange.from - nextFrom) <= settleLimit &&
          Math.abs(manualTargetRange.to - nextTo) <= settleLimit
        ) {
          nextFrom = manualTargetRange.from;
          nextTo = manualTargetRange.to;
          manualAnchorPrice = null;
        } else {
          hasWork = true;
        }

        manualDisplayRange = { from: nextFrom, to: nextTo };
        commitManualPrice(manualDisplayRange);
      } else {
        manualAnchorPrice = null;
      }
    }

    // 3. 自动模式平滑
    if (enableAutoSmooth && priceMode === 'auto') {
      if (stepAutoPrice(dt)) {
        hasWork = true;
      }
    }

    if (hasWork || pendingDragRange) {
      scheduleFrame();
    } else {
      lastFrameAt = null;
    }
  }

  function attachSeriesProvider(series, key) {
    if (!series || typeof series.applyOptions !== 'function') return;

    const record = {
      series,
      displayRange: null,
      targetRange: null,
      active: true
    };
    seriesRecords.set(key, record);

    if (!enableAutoSmooth) {
      return;
    }

    try {
      series.applyOptions({
        autoscaleInfoProvider: (original) => {
          const raw = typeof original === 'function' ? original() : original;
          if (!raw || !raw.priceRange) return raw;
          if (priceMode === 'manual') return raw;

          const rawMin = Number.isFinite(raw.priceRange.minValue)
            ? raw.priceRange.minValue
            : (Number.isFinite(raw.priceRange.from) ? raw.priceRange.from : null);
          const rawMax = Number.isFinite(raw.priceRange.maxValue)
            ? raw.priceRange.maxValue
            : (Number.isFinite(raw.priceRange.to) ? raw.priceRange.to : null);

          if (rawMin === null || rawMax === null) return raw;

          if (!record.displayRange) {
            record.displayRange = { minValue: rawMin, maxValue: rawMax, from: rawMin, to: rawMax };
          }
          record.targetRange = { minValue: rawMin, maxValue: rawMax, from: rawMin, to: rawMax };

          const dMin = Number.isFinite(record.displayRange.minValue) ? record.displayRange.minValue : (record.displayRange.from ?? rawMin);
          const dMax = Number.isFinite(record.displayRange.maxValue) ? record.displayRange.maxValue : (record.displayRange.to ?? rawMax);

          const minVal = Math.min(dMin, rawMin);
          const maxVal = Math.max(dMax, rawMax);

          return {
            ...raw,
            priceRange: {
              minValue: minVal,
              maxValue: maxVal,
              from: minVal,
              to: maxVal
            }
          };
        }
      });
    } catch (_) {}
  }

  function detachSeriesProvider(series, key) {
    seriesRecords.delete(key);
    if (series && typeof series.applyOptions === 'function') {
      try {
        series.applyOptions({ autoscaleInfoProvider: null });
      } catch (_) {}
    }
  }

  function stepAutoPrice(dt) {
    if (!enableAutoSmooth || priceMode === 'manual') return false;
    let hasWork = false;

    for (const record of seriesRecords.values()) {
      if (!record.active || !record.displayRange || !record.targetRange) continue;
      const target = record.targetRange;
      const display = record.displayRange;

      const tMin = Number.isFinite(target.minValue) ? target.minValue : target.from;
      const tMax = Number.isFinite(target.maxValue) ? target.maxValue : target.to;
      const dMin = Number.isFinite(display.minValue) ? display.minValue : display.from;
      const dMax = Number.isFinite(display.maxValue) ? display.maxValue : display.to;

      const diffFrom = tMin - dMin;
      const diffTo = tMax - dMax;

      if (Math.abs(diffFrom) > 1e-4 || Math.abs(diffTo) > 1e-4) {
        hasWork = true;
        record.displayRange = safeAutoPriceStep(display, target, dt, rate);
      } else {
        record.displayRange = { ...target };
      }
    }

    return hasWork;
  }

  function getCurrentPriceRange(paneHeight = 400) {
    const scale = getPriceScale();
    if (scale && typeof scale.getVisibleRange === 'function') {
      const r = scale.getVisibleRange();
      if (finiteRange(r)) return { from: r.from, to: r.to };
    }
    if (candleSeries && typeof candleSeries.coordinateToPrice === 'function') {
      const top = candleSeries.coordinateToPrice(0);
      const bottom = candleSeries.coordinateToPrice(paneHeight);
      if (
        typeof top === 'number' &&
        typeof bottom === 'number' &&
        Number.isFinite(top) &&
        Number.isFinite(bottom) &&
        top !== bottom
      ) {
        return { from: Math.min(top, bottom), to: Math.max(top, bottom) };
      }
    }
    return null;
  }

  function lockManualPriceScale(range) {
    setPriceMode('manual');
    if (!range) return;
    manualDisplayRange = { from: range.from, to: range.to };
    manualTargetRange = { from: range.from, to: range.to };
    pendingDragRange = null;
    commitManualPrice(range);
  }

  function resetPriceScale() {
    cancelMotion('reset');
    setPriceMode('auto');
    isAutoScaleDisabled = false;
    manualDisplayRange = null;
    manualTargetRange = null;
    manualAnchorPrice = null;
    pendingDragRange = null;

    for (const record of seriesRecords.values()) {
      record.displayRange = null;
      record.targetRange = null;
    }

    const scale = getPriceScale();
    if (scale) {
      if (typeof scale.setAutoScale === 'function') scale.setAutoScale(true);
      if (typeof scale.applyOptions === 'function') scale.applyOptions({ autoScale: true });
    }

    try {
      chart?.applyOptions?.({ rightPriceScale: { autoScale: true } });
    } catch (_) {}

    if (candleSeries && typeof candleSeries.priceScale === 'function') {
      try {
        const sScale = candleSeries.priceScale();
        if (typeof sScale.setAutoScale === 'function') sScale.setAutoScale(true);
        if (typeof sScale.applyOptions === 'function') sScale.applyOptions({ autoScale: true });
      } catch (_) {}
    }
  }

  /**
   * 价格轴平滑滚轮缩放 (累积目标与指数缓动)
   */
  function queuePriceZoom(deltaPixels, pointerY, paneHeight = 400, zoomOpts = {}) {
    if (!Number.isFinite(deltaPixels) || deltaPixels === 0) return;
    const gain = zoomOpts.gain ?? zoomGain;
    const step = clamp(deltaPixels * gain, -0.15, 0.15);

    if (!manualDisplayRange) {
      const current = getCurrentPriceRange(paneHeight);
      if (!current) return;
      manualDisplayRange = { ...current };
      manualTargetRange = { ...current };
    }

    // 锚定光标当前指向的实际价格
    if (!Number.isFinite(manualAnchorPrice)) {
      if (candleSeries && typeof candleSeries.coordinateToPrice === 'function') {
        manualAnchorPrice = candleSeries.coordinateToPrice(pointerY);
      }
      if (!Number.isFinite(manualAnchorPrice)) {
        const f = 1 - clamp(pointerY / Math.max(paneHeight, 1), 0, 1);
        manualAnchorPrice = manualDisplayRange.from + (manualDisplayRange.to - manualDisplayRange.from) * f;
      }
    }

    const currentSpan = manualDisplayRange.to - manualDisplayRange.from;
    const targetSpan = manualTargetRange.to - manualTargetRange.from;
    const debt = targetSpan - currentSpan;

    // 反向输入即刻截断债务
    if (debt * step < 0) {
      manualTargetRange = { ...manualDisplayRange };
    }

    // delta > 0 (下滚) -> factor > 1 (视野扩大，蜡烛压缩)
    // delta < 0 (上滚) -> factor < 1 (视野缩小，蜡烛放大)
    const factor = 1 + step;
    const nextTarget = zoomPriceAbout(manualTargetRange, manualAnchorPrice, factor);

    const nextSpan = nextTarget.to - nextTarget.from;
    if (nextSpan >= 1e-4 && nextSpan <= 1e10) {
      manualTargetRange = nextTarget;
    }

    setPriceMode('manual');

    if (isReducedMotion()) {
      manualDisplayRange = { ...manualTargetRange };
      commitManualPrice(manualDisplayRange);
      cancelMotion('reduced-motion');
      return;
    }

    scheduleFrame();
  }

  /**
   * 价格轴按住上下拖拽拉伸/压缩 (TradingView 风格)
   * 鼠标上移 (totalDy < 0): 扩大价格跨度 (factor > 1)
   * 鼠标下移 (totalDy > 0): 压缩价格跨度 (factor < 1)
   */
  function dragScalePrice(totalDy, startPrice, startAnchorPrice, paneHeight = 400) {
    if (!startPrice || !Number.isFinite(totalDy)) return;
    setPriceMode('manual');

    const sensitivity = axisSensitivity;
    const factor = Math.exp(-totalDy * sensitivity);

    let anchor = startAnchorPrice;
    if (!Number.isFinite(anchor)) {
      anchor = (startPrice.from + startPrice.to) / 2;
    }

    const nextRange = zoomPriceAbout(startPrice, anchor, factor);
    const span = nextRange.to - nextRange.from;
    if (span < 1e-4 || span > 1e10) return;

    pendingDragRange = nextRange;
    manualDisplayRange = { ...nextRange };
    manualTargetRange = { ...nextRange };

    scheduleFrame();
  }

  /**
   * 绘图区二维上下平移
   */
  function panPrice(totalDy, startPrice, paneHeight = 400) {
    if (!startPrice || !Number.isFinite(totalDy)) return;
    setPriceMode('manual');

    let pricePerPx = 0;
    if (candleSeries && typeof candleSeries.coordinateToPrice === 'function') {
      const pMid = candleSeries.coordinateToPrice(paneHeight / 2);
      const pMidPlus = candleSeries.coordinateToPrice(paneHeight / 2 + 10);
      if (Number.isFinite(pMid) && Number.isFinite(pMidPlus)) {
        pricePerPx = (pMid - pMidPlus) / 10;
      }
    }
    if (pricePerPx === 0) {
      pricePerPx = (startPrice.to - startPrice.from) / Math.max(paneHeight, 1);
    }

    const shift = totalDy * pricePerPx;
    const nextRange = {
      from: startPrice.from + shift,
      to: startPrice.to + shift
    };

    pendingDragRange = nextRange;
    manualDisplayRange = { ...nextRange };
    manualTargetRange = { ...nextRange };

    scheduleFrame();
  }

  function endDrag() {
    if (pendingDragRange) {
      const r = pendingDragRange;
      pendingDragRange = null;
      commitManualPrice(r);
    }
  }

  /**
   * 保持向后兼容的单次同步价格缩放接口
   */
  function zoomPriceAt(pointerY, factor, paneHeight = 400) {
    if (!(factor > 0) || !Number.isFinite(factor)) return;
    const current = getCurrentPriceRange(paneHeight);
    if (!current) return;

    let anchorPrice = null;
    if (candleSeries && typeof candleSeries.coordinateToPrice === 'function') {
      anchorPrice = candleSeries.coordinateToPrice(pointerY);
    }
    if (!Number.isFinite(anchorPrice)) {
      const f = 1 - clamp(pointerY / Math.max(paneHeight, 1), 0, 1);
      anchorPrice = current.from + (current.to - current.from) * f;
    }

    const nextRange = zoomPriceAbout(current, anchorPrice, factor);
    lockManualPriceScale(nextRange);
  }

  function dispose() {
    disposed = true;
    cancelMotion('dispose');
    for (const [key, record] of seriesRecords.entries()) {
      detachSeriesProvider(record.series, key);
    }
    seriesRecords.clear();
  }

  return {
    attachSeriesProvider,
    detachSeriesProvider,
    stepAutoPrice,
    getCurrentPriceRange,
    lockManualPriceScale,
    resetPriceScale,
    queuePriceZoom,
    dragScalePrice,
    panPrice,
    endDrag,
    zoomPriceAt,
    cancelMotion,
    stepMotion,
    getPriceMode: () => priceMode,
    setPriceMode,
    getManualDisplayRange: () => (manualDisplayRange ? { ...manualDisplayRange } : null),
    getManualTargetRange: () => (manualTargetRange ? { ...manualTargetRange } : null),
    dispose
  };
}
