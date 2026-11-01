/**
 * Inflection Hunter R1: Core Numerical Indicators
 * Numerically stable EMA, DEMA, ATR, True Range, and Median Baseline
 * Specification: Inflection_Hunter_R1_Algorithm_Spec.md (Sections 3, 5, 6)
 */

/**
 * Numerically stable EMA recurrence:
 * EMA_t = EMA_{t-1} + a * (x_t - EMA_{t-1}), a = 2 / (n + 1)
 * Initialized with first valid numeric value. Constant-input invariant.
 * @param {number[]} values
 * @param {number} period
 * @returns {(number|null)[]}
 */
export function ema(values, period) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const alpha = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) continue;
    if (prev === null) {
      prev = v;
    } else {
      prev = prev + alpha * (v - prev);
    }
    out[i] = prev;
  }
  return out;
}

/**
 * Dual Exponential Moving Average (DEMA):
 * DEMA_n(x) = 2 * EMA_n(x) - EMA_n(EMA_n(x))
 * @param {number[]} values
 * @param {number} period
 * @returns {(number|null)[]}
 */
export function dema(values, period) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const ema1 = ema(values, period);
  const ema2 = ema(ema1, period);

  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const e1 = ema1[i];
    const e2 = ema2[i];
    if (e1 !== null && e2 !== null && Number.isFinite(e1) && Number.isFinite(e2)) {
      out[i] = 2 * e1 - e2;
    }
  }
  return out;
}

/**
 * True Range Series:
 * TR_t = max(H_t - L_t, |H_t - C_{t-1}|, |L_t - C_{t-1}|)
 * For t = 0: TR_0 = max(0, H_0 - L_0)
 * @param {Array<{high: number, low: number, close: number}>} bars
 * @returns {number[]}
 */
export function trueRangeSeries(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const n = bars.length;
  const trs = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const cur = bars[i];
    const h = Number(cur.high);
    const l = Number(cur.low);
    if (i === 0) {
      trs[i] = Math.max(0, h - l);
    } else {
      const prevC = Number(bars[i - 1].close);
      const hl = h - l;
      const hc = Math.abs(h - prevC);
      const lc = Math.abs(l - prevC);
      trs[i] = Math.max(hl, hc, lc);
    }
  }
  return Array.from(trs);
}

/**
 * ATR Series (Simple Moving Average of TR over 14 bars as specified in R1 Section 5):
 * ATR_t = SMA_14(TR_t)
 * @param {Array<{high: number, low: number, close: number}>} bars
 * @param {number} period
 * @returns {(number|null)[]}
 */
export function atrSeries(bars, period = 14) {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const trs = trueRangeSeries(bars);
  const n = trs.length;
  const out = new Array(n).fill(null);

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += trs[i];
    if (i >= period) {
      sum -= trs[i - period];
    }
    const count = Math.min(i + 1, period);
    out[i] = sum / count;
  }
  return out;
}

/**
 * Standard linear interpolation percentile:
 * h = (N - 1) * p, interpolate between sorted elements at floor(h) and ceil(h).
 * @param {number[]} sortedArr
 * @param {number} p - [0, 1]
 * @returns {number}
 */
export function percentileLinear(sortedArr, p) {
  const n = sortedArr.length;
  if (n === 0) return 0;
  if (n === 1) return sortedArr[0];
  const clampedP = Math.max(0, Math.min(1, p));
  const h = (n - 1) * clampedP;
  const i = Math.floor(h);
  const f = h - i;
  if (i >= n - 1) return sortedArr[n - 1];
  return sortedArr[i] + f * (sortedArr[i + 1] - sortedArr[i]);
}

/**
 * Median of an array:
 * @param {number[]} values
 * @returns {number}
 */
export function median(values) {
  if (!values || values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return percentileLinear(sorted, 0.5);
}

