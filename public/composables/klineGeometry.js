/**
 * TradingView + OKX 风格 K 线视口几何数学引擎 (v2.1)
 * 对应蓝图: kline_chart_blueprint_v2.md
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
