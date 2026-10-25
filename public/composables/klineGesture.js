/**
 * TradingView + OKX 风格 K 线图表手势交互控制器 (v2.1)
 * 对应蓝图: kline_chart_blueprint_v2.md
 */

import {
  anchorZoom,
  clamp,
  finiteRange,
  latestAnchoredRange,
  latestZoom,
  logZoom,
  pricePan,
  priceZoomAtY,
  spanOf,
  timePan,
  wheelPixelDelta
} from './klineGeometry.js';

/**
 * 绑定 TradingView + OKX 风格手势引擎
 *
 * @param {HTMLElement} element - 图表宿主 DOM 容器
 * @param {object} chart - LightweightCharts 实例
 * @param {object} series - 主 K 线系列 (CandlestickSeries)
 * @param {object} options - 配置项
 * @returns {object} GestureController
 */
export function bindKlineGestures(element, chart, series, options = {}) {
  const minBars = options.minBars ?? 8;
  const maxBars = options.maxBars ?? 50000;
  const minBarSpacing = options.minBarSpacing ?? 0.5;
  const initialBars = options.initialBars ?? 180;
  const centerUntilBars = options.centerUntilBars ?? 30;
  const rightAtBars = options.rightAtBars ?? 300;
  const rightFraction = options.rightFraction ?? 0.94;
  const wheelSensitivity = options.wheelSensitivity ?? 0.0017;
  const axisSensitivity = options.axisSensitivity ?? 0.007;

  let followLatest = true;
  let active = null;
  let frame = 0;
  let scheduled = null;
  let wheelBatch = null;
  let dead = false;

  const emit = (s) => {
    element.dataset.mode = s;
    options.onState?.(s);
  };

  const queue = (fn) => {
    scheduled = fn;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const run = scheduled;
      scheduled = null;
      run?.();
    });
  };

  function flushFrame() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const run = scheduled;
    scheduled = null;
    run?.();
  }

  function area() {
    const rect = element.getBoundingClientRect();
    let paneWidth = null;
    let paneHeight = null;
    if (typeof chart.paneSize === 'function') {
      try {
        const pane = chart.paneSize(0);
        if (pane) {
          paneWidth = pane.width;
          paneHeight = pane.height;
        }
      } catch (_) {}
    }
    const w = Math.max(paneWidth ?? (rect.width - 65), 1);
    const h = Math.max(paneHeight ?? (rect.height - 28), 1);
    return { rect, w, h };
  }

  function local(e) {
    const { rect } = area();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hitZone(x, y) {
    const { w, h } = area();
    if (x >= w) return 'price-axis';
    if (y >= h) return 'time-axis';
    return 'plot';
  }

  function priceRange() {
    const scale = chart.priceScale('right');
    if (typeof scale.getVisibleRange === 'function') {
      const p = scale.getVisibleRange();
      if (finiteRange(p)) return { from: p.from, to: p.to };
    }
    const { h } = area();
    if (series && typeof series.coordinateToPrice === 'function') {
      const top = series.coordinateToPrice(0);
      const bottom = series.coordinateToPrice(h);
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

  function lockManualPriceScale(r) {
    const scale = chart.priceScale('right');
    if (typeof scale.setAutoScale === 'function') {
      scale.setAutoScale(false);
    } else if (typeof scale.applyOptions === 'function') {
      scale.applyOptions({ autoScale: false });
    }
    if (typeof scale.setVisibleRange === 'function') {
      scale.setVisibleRange(r);
    }
  }

  function applyPrice(r) {
    if (finiteRange(r) && spanOf(r) > 1e-7) {
      const scale = chart.priceScale('right');
      if (typeof scale.setVisibleRange === 'function') {
        scale.setVisibleRange(r);
      }
    }
  }

  function applyTime(r) {
    if (finiteRange(r)) {
      chart.timeScale().setVisibleLogicalRange(r);
    }
  }

  function effectiveMaxBars() {
    const { w } = area();
    return Math.max(minBars, Math.min(maxBars, w / Math.max(minBarSpacing, 0.01)));
  }

  function latestRange(bars) {
    const latest = options.getLatestLogicalIndex?.() ?? 0;
    return latestAnchoredRange(
      latest,
      bars,
      minBars,
      effectiveMaxBars(),
      centerUntilBars,
      rightAtBars,
      rightFraction
    );
  }

  function scaleTimeFrom(start, factor, fraction, live) {
    return live
      ? latestZoom(
          start,
          options.getLatestLogicalIndex?.() ?? 0,
          factor,
          minBars,
          effectiveMaxBars(),
          centerUntilBars,
          rightAtBars,
          rightFraction
        )
      : anchorZoom(start, fraction, factor, minBars, effectiveMaxBars());
  }

  function focusLatest(bars = initialBars) {
    followLatest = true;
    flushFrame();
    wheelBatch = null;
    applyTime(latestRange(bars));
    emit('follow-latest');
  }

  function showAll() {
    flushFrame();
    wheelBatch = null;
    const first = options.getFirstLogicalIndex?.() ?? 0;
    const last = options.getLatestLogicalIndex?.() ?? 0;
    const span = clamp((last - first + 1) / rightFraction, minBars, effectiveMaxBars());
    followLatest = true;
    applyTime(latestRange(span));
    emit('follow-latest');
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (active || dead) return;
    flushFrame();
    wheelBatch = null;
    const { x, y } = local(e);
    const { w, h } = area();
    const time = chart.timeScale().getVisibleLogicalRange();
    const price = priceRange();
    if (!finiteRange(time) || !price) return;
    const zone = hitZone(x, y);
    active = {
      pointerId: e.pointerId,
      zone,
      startX: x,
      startY: y,
      plotWidth: w,
      plotHeight: h,
      time: { from: time.from, to: time.to },
      price,
      liveAtStart: followLatest,
      moved: false
    };
    if (typeof element.setPointerCapture === 'function') {
      try {
        element.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
    emit(zone === 'plot' ? 'panning-2d' : zone === 'price-axis' ? 'scaling-y' : 'scaling-x');
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!active || active.pointerId !== e.pointerId) {
      const { x, y } = local(e);
      emit(hitZone(x, y));
      return;
    }
    const start = active;
    const { x, y } = local(e);
    const dx = x - start.startX;
    const dy = y - start.startY;
    if (Math.hypot(dx, dy) < 3 && !start.moved) return;
    if (!start.moved && (start.zone === 'plot' || start.zone === 'price-axis')) {
      lockManualPriceScale(start.price);
    }
    start.moved = true;
    if (start.zone === 'plot') {
      followLatest = false; // 用户拖拽浏览历史，进入 HISTORY 模式
    }
    queue(() => {
      if (start.zone === 'plot') {
        applyTime(timePan(start.time, dx, start.plotWidth));
        applyPrice(pricePan(start.price, dy, start.plotHeight));
      } else if (start.zone === 'time-axis') {
        const fraction = clamp(start.startX / start.plotWidth, 0, 1);
        applyTime(scaleTimeFrom(start.time, logZoom(dx, axisSensitivity), fraction, start.liveAtStart));
      } else {
        const fractionY = clamp(start.startY / start.plotHeight, 0, 1);
        const currentSpan = spanOf(start.price);
        applyPrice(
          priceZoomAtY(
            start.price,
            fractionY,
            logZoom(dy, axisSensitivity),
            Math.max(currentSpan * 0.0001, 1e-7),
            currentSpan * 10000
          )
        );
      }
    });
    e.preventDefault();
  }

  function end(e) {
    if (!active || active.pointerId !== e.pointerId) return;
    flushFrame();
    active = null;
    if (typeof element.hasPointerCapture === 'function' && element.hasPointerCapture(e.pointerId)) {
      try {
        element.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    emit(followLatest ? 'follow-latest' : 'history');
  }

  function commitWheel() {
    const batch = wheelBatch;
    wheelBatch = null;
    if (!batch) return;
    const { w, h } = area();
    if (batch.zone === 'price-axis') {
      const oldPrice = priceRange();
      if (!oldPrice) return;
      lockManualPriceScale(oldPrice);
      const span = spanOf(oldPrice);
      applyPrice(
        priceZoomAtY(
          oldPrice,
          clamp(batch.y / h, 0, 1),
          logZoom(batch.delta, wheelSensitivity),
          Math.max(span * 0.0001, 1e-7),
          span * 10000
        )
      );
    } else {
      const oldTime = chart.timeScale().getVisibleLogicalRange();
      if (!finiteRange(oldTime)) return;
      applyTime(
        scaleTimeFrom(
          oldTime,
          logZoom(batch.delta, wheelSensitivity),
          clamp(batch.x / w, 0, 1),
          followLatest
        )
      );
    }
  }

  function onWheel(e) {
    if (active || dead) return;
    const { x, y } = local(e);
    const zone = hitZone(x, y);
    if (zone !== 'price-axis' && !finiteRange(chart.timeScale().getVisibleLogicalRange())) return;
    if (zone === 'price-axis' && !priceRange()) return;
    e.preventDefault(); // 三大区域捕获 wheel，防止页面联动滚动
    if (wheelBatch && wheelBatch.zone !== zone) flushFrame();
    const delta = wheelPixelDelta(e, area().h);
    if (!wheelBatch) {
      wheelBatch = { zone, delta, x, y };
    } else {
      wheelBatch.delta = clamp(wheelBatch.delta + delta, -500, 500);
      wheelBatch.x = x;
      wheelBatch.y = y;
    }
    emit(zone === 'price-axis' ? 'wheel-zoom-y' : 'wheel-zoom-x');
    queue(commitWheel);
  }

  function onDblClick(e) {
    flushFrame();
    wheelBatch = null;
    const rect = element.getBoundingClientRect();
    const zone = hitZone(e.clientX - rect.left, e.clientY - rect.top);
    if (zone === 'price-axis') {
      const scale = chart.priceScale('right');
      if (typeof scale.setAutoScale === 'function') {
        scale.setAutoScale(true);
      } else if (typeof scale.applyOptions === 'function') {
        scale.applyOptions({ autoScale: true });
      }
    }
    if (zone === 'time-axis') {
      focusLatest(initialBars);
    }
    e.preventDefault();
  }

  function onEscape(e) {
    if (e.key !== 'Escape' || !active) return;
    flushFrame();
    const pointerId = active.pointerId;
    active = null;
    if (typeof element.hasPointerCapture === 'function' && element.hasPointerCapture(pointerId)) {
      try {
        element.releasePointerCapture(pointerId);
      } catch (_) {}
    }
    emit(followLatest ? 'follow-latest' : 'history');
  }

  // 在 capture 阶段捕获事件，拥有唯一操作权，避免嵌套 canvas 原生竞争
  element.addEventListener('pointerdown', onPointerDown, true);
  element.addEventListener('pointermove', onPointerMove, true);
  element.addEventListener('pointerup', end, true);
  element.addEventListener('pointercancel', end, true);
  element.addEventListener('lostpointercapture', end, true);
  element.addEventListener('wheel', onWheel, { passive: false, capture: true });
  element.addEventListener('dblclick', onDblClick, true);
  window.addEventListener('keydown', onEscape);

  return {
    focusLatest,
    showAll,
    isFollowingLatest: () => followLatest,
    notifyLatestBarChanged: () => {
      if (!followLatest || active) return;
      flushFrame();
      wheelBatch = null;
      const current = chart.timeScale().getVisibleLogicalRange();
      if (finiteRange(current)) applyTime(latestRange(spanOf(current)));
    },
    dispose: () => {
      if (dead) return;
      dead = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      wheelBatch = null;
      scheduled = null;
      element.removeEventListener('pointerdown', onPointerDown, true);
      element.removeEventListener('pointermove', onPointerMove, true);
      element.removeEventListener('pointerup', end, true);
      element.removeEventListener('pointercancel', end, true);
      element.removeEventListener('lostpointercapture', end, true);
      element.removeEventListener('wheel', onWheel, true);
      element.removeEventListener('dblclick', onDblClick, true);
      window.removeEventListener('keydown', onEscape);
    }
  };
}
