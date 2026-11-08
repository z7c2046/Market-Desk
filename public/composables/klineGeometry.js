/**
 * TradingView + OKX 风格 K 线视口几何数学引擎 (v2.2)
 * Lightweight Charts 5.2.1 半柱连续坐标系统与摄像机投影模型
 */

export const EPS = 1e-9;

export function finiteRange(r) {
  return !!r && Number.isFinite(r.from) && Number.isFinite(r.to) && r.to > r.from;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function spanOf(r) {
  return r.to - r.from;
}

export const easeAlpha = (rate, seconds) => -Math.expm1(-rate * Math.max(0, seconds));

/**
 * 规范化摄像机 (Lightweight Charts 5.2.1 连续坐标模型)
 * N = to - from + 1
 * L = from - 0.5
 */
export function cameraFromRange(range) {
  if (!Number.isFinite(range?.from) || !Number.isFinite(range?.to) || range.to < range.from) {
    throw new RangeError('Invalid logical range');
  }
  return { left: range.from - 0.5, count: range.to - range.from + 1 };
}

export function rangeFromCamera(camera) {
  if (!(camera?.count >= 1) || !Number.isFinite(camera?.left)) throw new RangeError('Invalid camera');
  return { from: camera.left + 0.5, to: camera.left + camera.count - 0.5 };
}

export function pixelFraction(x, width) {
  if (!(width > 1)) throw new RangeError('Pane is not measurable');
  return (clamp(x, 0, width - 1) + 1) / width;
}

export function logicalAtPixel(camera, x, width) {
  return camera.left + camera.count * pixelFraction(x, width);
}

export function pixelAtLogical(camera, logical, width) {
  return (logical - camera.left) * width / camera.count - 1;
}

export function anchorCamera(camera, count, fraction) {
  const anchor = camera.left + camera.count * fraction;
  return { left: anchor - count * fraction, count };
}

export function zoomPriceAbout(range, anchorPrice, factor) {
  if (!(factor > 0) || !Number.isFinite(factor)) throw new RangeError('Invalid price factor');
  return {
    from: anchorPrice + (range.from - anchorPrice) * factor,
    to: anchorPrice + (range.to - anchorPrice) * factor,
  };
}

export function safeAutoPriceStep(display, target, seconds, rate = 20) {
  if (!display) return { ...target };
  const a = easeAlpha(rate, seconds);
  const dMin = Number.isFinite(display.minValue) ? display.minValue : (display.from ?? 0);
  const dMax = Number.isFinite(display.maxValue) ? display.maxValue : (display.to ?? 0);
  const tMin = Number.isFinite(target.minValue) ? target.minValue : (target.from ?? 0);
  const tMax = Number.isFinite(target.maxValue) ? target.maxValue : (target.to ?? 0);
  const nextMin = Math.min(tMin, dMin + (tMin - dMin) * a);
  const nextMax = Math.max(tMax, dMax + (tMax - dMax) * a);
  return {
    minValue: nextMin,
    maxValue: nextMax,
    from: nextMin,
    to: nextMax,
  };
}

export function stepFling(velocityPxPerSecond, seconds, friction = 12) {
  if (!(friction > 0) || seconds < 0) throw new RangeError('Invalid fling parameters');
  const decay = Math.exp(-friction * seconds);
  return {
    deltaPx: velocityPxPerSecond * (1 - decay) / friction,
    velocity: velocityPxPerSecond * decay,
  };
}

/**
 * FOLLOW_LATEST 模式下最新一根蜡烛中心在绘图区的横向比例 f(span)。
 * 近景 (span <= 30): f = 0.50 (绘图区水平正中，右侧为未来留白)
 * 远景 (span >= 300): f = 0.94 (靠近右侧价格轴，留出安全边距)
 * 中间采用 log(span) + smoothstep 平滑插值，保证正向/反向滚轮无阶跃、连续可逆。
 */
export function latestBarFraction(span, centerUntilBars = 30, rightAtBars = 300, rightFraction = 0.94) {
  const low = Math.max(centerUntilBars, EPS);
  const high = Math.max(rightAtBars, low + EPS);
  const s = Math.max(span, EPS);
  const t = clamp((Math.log(s) - Math.log(low)) / (Math.log(high) - Math.log(low)), 0, 1);
  const smooth = t * t * (3 - 2 * t);
  return 0.5 + (clamp(rightFraction, 0.5, 0.98) - 0.5) * smooth;
}

/**
 * 以最新 K 线逻辑索引为基准，根据可见跨度 span 重建可见逻辑范围 [from, to]
 */
export function latestAnchoredRange(
  latestLogical,
  span,
  minBars = 8,
  maxBars = 50000,
  centerUntilBars = 30,
  rightAtBars = 300,
  rightFraction = 0.94
) {
  const s = clamp(span, minBars, maxBars);
  const fraction = latestBarFraction(s, centerUntilBars, rightAtBars, rightFraction);
  const from = latestLogical - fraction * s;
  return { from, to: from + s };
}

/**
 * FOLLOW_LATEST 模式下缩放时间跨度
 */
export function latestZoom(
  current,
  latestLogical,
  factor,
  minBars,
  maxBars,
  centerUntilBars = 30,
  rightAtBars = 300,
  rightFraction = 0.94
) {
  return latestAnchoredRange(
    latestLogical,
    spanOf(current) * factor,
    minBars,
    maxBars,
    centerUntilBars,
    rightAtBars,
    rightFraction
  );
}

/**
 * HISTORY 模式: 以光标所在历史位置为锚点缩放
 */
export function anchorZoom(r, positionFraction, zoomFactor, minSpan, maxSpan) {
  const f = clamp(positionFraction, 0, 1);
  const span = clamp(spanOf(r) * zoomFactor, minSpan, maxSpan);
  const anchor = r.from + spanOf(r) * f;
  const from = anchor - span * f;
  return { from, to: from + span };
}

/**
 * 时间轴水平平移 (拖拽 dx)
 */
export function timePan(r, deltaX, plotWidth) {
  const shift = (deltaX / Math.max(plotWidth, 1)) * spanOf(r);
  return { from: r.from - shift, to: r.to - shift };
}

/**
 * 价格轴纵向平移 (拖拽 dy, 价格向上增大)
 */
export function pricePan(r, deltaY, plotHeight) {
  const shift = (deltaY / Math.max(plotHeight, 1)) * spanOf(r);
  return { from: r.from + shift, to: r.to + shift };
}

/**
 * 价格轴以指定 Y 分数为锚点缩放 (yFractionTop = 0 对应顶部最高价)
 */
export function priceZoomAtY(r, yFractionTop, zoomFactor, minSpan, maxSpan) {
  return anchorZoom(r, 1 - clamp(yFractionTop, 0, 1), zoomFactor, minSpan, maxSpan);
}

/**
 * 归一化滚轮 deltaY 像素位移 (适配行/页模式与触控板)
 */
export function wheelPixelDelta(e, viewportHeight) {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewportHeight : 1;
  return clamp(e.deltaY * unit, -300, 300);
}

/**
 * 指数模型滚轮缩放倍率 (delta < 0 向上滚 -> factor < 1 放大；delta > 0 向下滚 -> factor > 1 缩小)
 */
export function logZoom(delta, sensitivity) {
  return Math.exp(clamp(delta * sensitivity, -1.5, 1.5));
}
