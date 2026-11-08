/**
 * Original, DOM-free implementation sketch for the Gemini handoff.
 * NOT imported by Market Desk. This is not the Titan source or a full controller.
 * Units: CSS pixels, seconds, logical bar coordinates; linear price mode only.
 */
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const easeAlpha = (rate, seconds) => -Math.expm1(-rate * Math.max(0, seconds));

export function cameraFromRange(range) {
  if (!Number.isFinite(range?.from) || !Number.isFinite(range?.to) || range.to < range.from) {
    throw new RangeError('Invalid logical range');
  }
  return { left: range.from - 0.5, count: range.to - range.from + 1 };
}
export function rangeFromCamera(camera) {
  if (!(camera.count >= 1) || !Number.isFinite(camera.left)) throw new RangeError('Invalid camera');
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

export function makeZoomState(range) {
  const display = cameraFromRange(range);
  return { display, targetCount: display.count, anchor: display.left + display.count, fraction: 1 };
}

// Call once for each normalized, admitted wheel sample, before frame coalescing.
// An anchor change retains remaining scale debt; a direction reversal cancels it.
export function queueZoom(state, deltaPixels, fraction, {
  gain = 0.0006, minCount = 8, maxCount = 2000,
} = {}) {
  if (!Number.isFinite(deltaPixels) || deltaPixels === 0) return;
  const step = clamp(deltaPixels * gain, -0.1, 0.1);
  const debt = state.targetCount - state.display.count;
  if (debt * step < 0) state.targetCount = state.display.count;
  state.fraction = fraction;
  state.anchor = state.display.left + state.display.count * fraction;
  state.targetCount = clamp(state.targetCount * (1 + step), minCount, maxCount);
}

// Fixed targets converge equally over equal elapsed time at different refresh rates.
// Runtime must separately handle hidden tabs, stale generations and long frame gaps.
export function stepZoom(state, seconds, { rate = 21.5, width = 1000, settlePx = 0.25 } = {}) {
  const alpha = easeAlpha(rate, seconds);
  let count = state.display.count + (state.targetCount - state.display.count) * alpha;
  const remainingPx = Math.abs(state.targetCount - count) * width / count;
  if (remainingPx <= settlePx) count = state.targetCount;
  state.display = { left: state.anchor - state.fraction * count, count };
  return state.display;
}

// The actual cursor price comes from series.coordinateToPrice(y), not y / paneHeight.
export function zoomPriceAbout(range, anchorPrice, factor) {
  if (!(factor > 0) || !Number.isFinite(factor)) throw new RangeError('Invalid price factor');
  return {
    from: anchorPrice + (range.from - anchorPrice) * factor,
    to: anchorPrice + (range.to - anchorPrice) * factor,
  };
}

// Use only in auto mode, behind per-series autoscaleInfoProvider wrappers.
// Expand immediately to contain extrema; contract smoothly. Preserve native margins.
export function safeAutoPriceStep(display, target, seconds, rate = 20) {
  if (!display) return {...target};
  const a = easeAlpha(rate, seconds);
  return {
    from: Math.min(target.from, display.from + (target.from - display.from) * a),
    to: Math.max(target.to, display.to + (target.to - display.to) * a),
  };
}

// Exact integration of exponential velocity decay; avoids refresh-rate-dependent travel.
export function stepFling(velocityPxPerSecond, seconds, friction = 12) {
  if (!(friction > 0) || seconds < 0) throw new RangeError('Invalid fling parameters');
  const decay = Math.exp(-friction * seconds);
  return {
    deltaPx: velocityPxPerSecond * (1 - decay) / friction,
    velocity: velocityPxPerSecond * decay,
  };
}
