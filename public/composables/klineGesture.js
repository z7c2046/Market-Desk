/**
 * TradingView + OpenMarket 风格 K 线图表手势交互控制器 (v3.0)
 *
 * 整合：
 * - klineWheelInput: CSS 像素归一化、微量累积与主轴竞争锁定
 * - klineViewportMotion: 单一 rAF 调度器、指数时间收敛 (21.5/s)、水平拖拽惯性 (12/s)
 * - klinePriceMotion: 原生 autoscaleInfoProvider 适配、扩张保护、真实指针价格锚点
 * - klineGeometry: 5.2.1 半柱连续坐标摄像机模型
 */

import {
  clamp,
  finiteRange,
  latestAnchoredRange,
  latestZoom,
  anchorZoom,
  spanOf,
  logZoom
} from './klineGeometry.js';
import { createWheelInputParser } from './klineWheelInput.js';
import { createViewportMotionController } from './klineViewportMotion.js';
import { createPriceMotionController } from './klinePriceMotion.js';

export function bindKlineGestures(element, chart, series, options = {}) {
  const minBars = options.minBars ?? 8;
  const maxBars = options.maxBars ?? 50000;
  const minBarSpacing = options.minBarSpacing ?? 0.5;
  const initialBars = options.initialBars ?? 180;
  const centerUntilBars = options.centerUntilBars ?? 30;
  const rightAtBars = options.rightAtBars ?? 300;
  const rightFraction = options.rightFraction ?? 0.94;

  let currentPolicy = options.inputPolicy || 'desktop';
  let active = null;
  let dead = false;

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

  function effectiveMaxBars() {
    const { w } = area();
    return Math.max(minBars, Math.min(maxBars, w / Math.max(minBarSpacing, 0.01)));
  }

  function emitState() {
    const vpState = viewportMotion.getState();
    const priceMode = priceMotion.getPriceMode();
    const stateObj = {
      navigation: vpState.navigation,
      phase: vpState.phase,
      priceMode,
      toString() {
        return vpState.navigation;
      }
    };
    element.dataset.mode = vpState.navigation;
    options.onState?.(stateObj);
  }

  // 1. 初始化价格轴平滑与手动控制适配器
  const priceMotion = createPriceMotionController(chart, series, {
    rate: 21.5,
    axisSensitivity: options.axisSensitivity ?? 0.0055,
    zoomGain: options.wheelSensitivity ? options.wheelSensitivity * 0.35 : 0.0006,
    onPriceModeChange: () => emitState(),
    onPriceChange: () => options.onViewportChange?.()
  });

  if (series) {
    priceMotion.attachSeriesProvider(series, 'main-candle');
  }

  // 2. 初始化视口统一运动调度器 (Single-rAF)
  const viewportMotion = createViewportMotionController({
    timeScale: chart.timeScale(),
    getWidth: () => area().w,
    rate: 21.5,
    friction: 12.0,
    settlePx: 0.25,
    onFrameTick: ({ dt }) => {
      priceMotion.stepAutoPrice(dt);
      options.onFrameTick?.({ dt });
      options.onViewportChange?.();
    },
    onPhaseChange: () => emitState()
  });

  const initialRange = chart.timeScale().getVisibleLogicalRange();
  if (finiteRange(initialRange)) {
    viewportMotion.seedFromRange(initialRange);
  }

  // 3. 初始化滚轮与触控板解析器
  const wheelParser = createWheelInputParser({
    zoomGain: options.wheelSensitivity ? options.wheelSensitivity * 0.35 : undefined,
    pinchGain: 0.00625,
    microThreshold: 1.0,
    lockThreshold: 8.0,
    switchDominanceRatio: 2.0
  });

  // 订阅库内部范围变更，确认合法范围
  let unsubscribeRangeChange = null;
  if (typeof chart.timeScale().subscribeVisibleLogicalRangeChange === 'function') {
    const onRangeChange = (range) => {
      viewportMotion.handleObservedRangeChange(range);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);
    unsubscribeRangeChange = () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange); } catch (_) {}
    };
  }

  function applyTime(r) {
    if (finiteRange(r)) {
      chart.timeScale().setVisibleLogicalRange(r);
    }
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

  function getOverviewRange() {
    const first = options.getFirstLogicalIndex?.() ?? 0;
    const last = options.getLatestLogicalIndex?.() ?? 0;
    const total = Math.max(1, last - first + 1);
    const rightMargin = Math.max(3, Math.min(15, Math.round(total * 0.05)));
    return {
      from: first - 0.5,
      to: last + rightMargin + 0.5
    };
  }

  function focusLatest(bars) {
    viewportMotion.cancelMotion('focusLatest');
    wheelParser.reset();
    viewportMotion.setNavigation('follow-latest');

    const first = options.getFirstLogicalIndex?.() ?? 0;
    const last = options.getLatestLogicalIndex?.() ?? 0;
    const total = Math.max(1, last - first + 1);

    if (typeof bars === 'number' && bars > 0 && bars < total) {
      applyTime(latestRange(bars));
    } else {
      applyTime(getOverviewRange());
    }

    viewportMotion.seedFromRange(chart.timeScale().getVisibleLogicalRange());
    emitState();
  }

  function showAll() {
    viewportMotion.cancelMotion('showAll');
    wheelParser.reset();
    priceMotion.resetPriceScale();
    viewportMotion.setNavigation('follow-latest');

    if (typeof chart.timeScale?.().fitContent === 'function') {
      chart.timeScale().fitContent();
    } else {
      applyTime(getOverviewRange());
    }

    viewportMotion.seedFromRange(chart.timeScale().getVisibleLogicalRange());
    emitState();
  }

  function resetPriceScale() {
    priceMotion.resetPriceScale();
    emitState();
  }

  function reset(bars) {
    viewportMotion.cancelMotion('reset');
    wheelParser.reset();
    priceMotion.resetPriceScale();
    viewportMotion.setNavigation('follow-latest');

    const first = options.getFirstLogicalIndex?.() ?? 0;
    const last = options.getLatestLogicalIndex?.() ?? 0;
    const total = Math.max(1, last - first + 1);

    if (typeof bars === 'number' && bars > 0 && bars < total) {
      applyTime(latestRange(bars));
    } else {
      if (typeof chart.timeScale?.().fitContent === 'function') {
        chart.timeScale().fitContent();
      } else {
        applyTime(getOverviewRange());
      }
    }

    viewportMotion.seedFromRange(chart.timeScale().getVisibleLogicalRange());
    emitState();
  }

  function cancelMotion(reason = 'external') {
    viewportMotion.cancelMotion(reason);
    priceMotion.cancelMotion(reason);
    wheelParser.reset();
  }

  function replaceData(context = {}) {
    cancelMotion('replaceData');
    priceMotion.resetPriceScale();
    const range = chart.timeScale().getVisibleLogicalRange();
    if (finiteRange(range)) {
      viewportMotion.seedFromRange(range);
    }
  }

  function invalidateGeometry(reason = 'resize') {
    cancelMotion(reason);
    const range = chart.timeScale().getVisibleLogicalRange();
    if (finiteRange(range)) {
      viewportMotion.seedFromRange(range);
    }
  }

  function getInputPolicy() {
    return typeof options.getInputPolicy === 'function' ? options.getInputPolicy() : currentPolicy;
  }

  function setInputPolicy(policy) {
    if (active) {
      if (typeof element.releasePointerCapture === 'function' && active.pointerId) {
        try { element.releasePointerCapture(active.pointerId); } catch (_) {}
      }
      active = null;
    }
    cancelMotion('setInputPolicy');
    currentPolicy = policy;
  }

  function zoomIn(factor = 0.8) {
    cancelMotion('zoomIn');
    const current = chart.timeScale().getVisibleLogicalRange();
    if (!finiteRange(current)) return;
    const isLive = viewportMotion.getState().navigation === 'follow-latest';
    const next = scaleTimeFrom(current, factor, 0.5, isLive);
    applyTime(next);
    viewportMotion.seedFromRange(next);
  }

  function zoomOut(factor = 1.25) {
    cancelMotion('zoomOut');
    const current = chart.timeScale().getVisibleLogicalRange();
    if (!finiteRange(current)) return;
    const isLive = viewportMotion.getState().navigation === 'follow-latest';
    const next = scaleTimeFrom(current, factor, 0.5, isLive);
    applyTime(next);
    viewportMotion.seedFromRange(next);
  }

  // --- Pointer 事件处理 ---

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (active || dead) return;
    if (e.shiftKey || element.dataset.rulerMode === 'active' || (typeof options.isRulerActive === 'function' && options.isRulerActive())) {
      cancelMotion('ruler-active');
      return;
    }
    const policy = getInputPolicy();
    if (policy === 'reading' && e.pointerType === 'touch') {
      return;
    }

    cancelMotion('pointerdown');
    const { x, y } = local(e);
    const { w, h } = area();
    const time = chart.timeScale().getVisibleLogicalRange();
    const price = priceMotion.getCurrentPriceRange(h);
    if (!finiteRange(time)) return;

    const zone = hitZone(x, y);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    let startAnchorPrice = null;
    if (series && typeof series.coordinateToPrice === 'function') {
      startAnchorPrice = series.coordinateToPrice(y);
    }
    if (!Number.isFinite(startAnchorPrice) && price) {
      const f = 1 - clamp(y / Math.max(h, 1), 0, 1);
      startAnchorPrice = price.from + (price.to - price.from) * f;
    }

    active = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      zone,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      lastTime: now,
      samples: [{ t: now, x, y }],
      plotWidth: w,
      plotHeight: h,
      startPrice: price,
      startAnchorPrice,
      moved: false
    };

    if (typeof element.setPointerCapture === 'function') {
      try {
        element.setPointerCapture(e.pointerId);
      } catch (_) {}
    }

    viewportMotion.setPhase(zone === 'plot' ? 'drag' : 'axis-drag');
    e.preventDefault();
  }

  function onPointerMove(e) {
    const policy = getInputPolicy();
    if (policy === 'reading' && e.pointerType === 'touch') {
      return;
    }
    if (!active || active.pointerId !== e.pointerId) {
      return;
    }

    const { x, y } = local(e);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const totalDx = x - active.startX;
    const totalDy = y - active.startY;
    const stepDx = x - active.lastX;
    const stepDy = y - active.lastY;

    if (!active.moved && Math.hypot(totalDx, totalDy) < 3) return;
    active.moved = true;

    // 记录最近 100ms 样本用于计算松手惯性
    active.samples.push({ t: now, x, y });
    while (active.samples.length > 2 && now - active.samples[0].t > 100) {
      active.samples.shift();
    }
    active.lastX = x;
    active.lastY = y;
    active.lastTime = now;

    if (active.zone === 'plot') {
      // 绘图区二维平移：水平拖拽直接平移 X 摄像机，有效垂直位移超过 3px 才切手动 Y
      viewportMotion.panPx(stepDx, active.plotWidth);
      if (Math.abs(totalDy) >= 3 && active.startPrice) {
        priceMotion.panPrice(totalDy, active.startPrice, active.plotHeight);
      }
    } else if (active.zone === 'time-axis') {
      viewportMotion.panPx(stepDx, active.plotWidth);
    } else if (active.zone === 'price-axis') {
      priceMotion.dragScalePrice(totalDy, active.startPrice, active.startAnchorPrice, active.plotHeight);
    }

    options.onViewportChange?.();

    e.preventDefault();
  }

  function end(e) {
    if (!active || active.pointerId !== e.pointerId) return;

    if (typeof element.hasPointerCapture === 'function' && element.hasPointerCapture(e.pointerId)) {
      try {
        element.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    priceMotion.endDrag();
    const wasActive = active;
    active = null;

    // 仅在真实鼠标有效拖拽释放且未超时时启动水平惯性
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (
      wasActive.moved &&
      wasActive.pointerType === 'mouse' &&
      wasActive.zone === 'plot' &&
      now - wasActive.lastTime <= 120 &&
      wasActive.samples.length >= 2
    ) {
      const first = wasActive.samples[0];
      const last = wasActive.samples[wasActive.samples.length - 1];
      const dt = (last.t - first.t) / 1000;
      if (dt > 0.01) {
        const vx = (last.x - first.x) / dt;
        viewportMotion.startFling(vx, wasActive.plotWidth);
      } else {
        viewportMotion.setPhase('idle');
      }
    } else {
      viewportMotion.setPhase('idle');
    }

    emitState();
  }

  function onPointerCancel(e) {
    if (!active || active.pointerId !== e.pointerId) return;
    if (typeof element.hasPointerCapture === 'function' && element.hasPointerCapture(e.pointerId)) {
      try { element.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    priceMotion.endDrag();
    active = null;
    viewportMotion.setPhase('idle');
    emitState();
  }

  function onWheel(e) {
    if (active || dead) return;
    const { w, h, rect } = area();
    const { x, y } = local(e);
    const zone = hitZone(x, y);

    const isRuler = element.dataset.rulerMode === 'active' || (typeof options.isRulerActive === 'function' && options.isRulerActive());
    if (isRuler) {
      cancelMotion('ruler-active');
      e.preventDefault();
      return;
    }

    const { admitted, actions } = wheelParser.parseWheel(e, {
      paneWidth: w,
      paneHeight: h,
      zone,
      rect,
      localX: x,
      localY: y,
      isRulerActive: isRuler
    });

    if (admitted) {
      e.preventDefault();
      try { e.stopPropagation(); } catch (_) {}
    }

    for (const action of actions) {
      if (action.type === 'zoom') {
        viewportMotion.queueZoom(action.delta, action.fraction, {
          gain: action.gain,
          anchorType: action.anchorType,
          minCount: minBars,
          maxCount: effectiveMaxBars()
        });
      } else if (action.type === 'pan') {
        viewportMotion.panPx(action.deltaPx, w);
      } else if (action.type === 'price-zoom') {
        priceMotion.queuePriceZoom(action.delta, action.pointerY, h, { gain: action.gain });
      }
    }

    if (actions.length > 0) {
      options.onViewportChange?.();
    }
  }

  function onDblClick(e) {
    cancelMotion('dblclick');
    const { x, y } = local(e);
    const zone = hitZone(x, y);

    if (zone === 'price-axis') {
      priceMotion.resetPriceScale();
    } else {
      reset();
    }
    options.onViewportChange?.();
    e.preventDefault();
  }

  function onEscape(e) {
    if (e.key !== 'Escape' || !active) return;
    const pointerId = active.pointerId;
    active = null;
    if (typeof element.hasPointerCapture === 'function' && element.hasPointerCapture(pointerId)) {
      try { element.releasePointerCapture(pointerId); } catch (_) {}
    }
    viewportMotion.setPhase('idle');
    emitState();
  }

  element.addEventListener('pointerdown', onPointerDown, true);
  element.addEventListener('pointermove', onPointerMove, true);
  element.addEventListener('pointerup', end, true);
  element.addEventListener('pointercancel', onPointerCancel, true);
  element.addEventListener('lostpointercapture', onPointerCancel, true);
  element.addEventListener('wheel', onWheel, { passive: false, capture: true });
  element.addEventListener('dblclick', onDblClick, true);
  if (typeof window !== 'undefined') window.addEventListener('keydown', onEscape);

  return {
    focusLatest,
    showAll,
    reset,
    resetPriceScale,
    cancelMotion,
    replaceData,
    invalidateGeometry,
    getState: () => ({
      ...viewportMotion.getState(),
      priceMode: priceMotion.getPriceMode(),
      inputPolicy: getInputPolicy()
    }),
    getInputPolicy,
    setInputPolicy,
    zoomIn,
    zoomOut,
    isFollowingLatest: () => viewportMotion.getState().navigation === 'follow-latest',
    attachSeriesProvider: (s, k) => priceMotion.attachSeriesProvider(s, k),
    detachSeriesProvider: (s, k) => priceMotion.detachSeriesProvider(s, k),
    notifyLatestBarChanged: () => {
      if (viewportMotion.getState().navigation !== 'follow-latest' || active) return;
      cancelMotion('notifyLatestBarChanged');
      const current = chart.timeScale().getVisibleLogicalRange();
      if (finiteRange(current)) {
        applyTime(latestRange(spanOf(current)));
        viewportMotion.seedFromRange(chart.timeScale().getVisibleLogicalRange());
      }
    },
    dispose: () => {
      if (dead) return;
      dead = true;
      cancelMotion('dispose');
      viewportMotion.dispose();
      priceMotion.dispose();
      unsubscribeRangeChange?.();

      element.removeEventListener('pointerdown', onPointerDown, true);
      element.removeEventListener('pointermove', onPointerMove, true);
      element.removeEventListener('pointerup', end, true);
      element.removeEventListener('pointercancel', onPointerCancel, true);
      element.removeEventListener('lostpointercapture', onPointerCancel, true);
      element.removeEventListener('wheel', onWheel, true);
      element.removeEventListener('dblclick', onDblClick, true);
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onEscape);
    }
  };
}
