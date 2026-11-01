/**
 * Inflection Hunter R1: Directional Features & Zero-Preserving Robust Scale
 * Computes:
 * - sigma_t (Common Volatility Scale)
 * - x_T (Trend Position: DEMA14 - DEMA30 / sigma)
 * - x_A (Change in Trend Difference: EMA3(delta D) / sigma)
 * - x_M (Directional Volume Momentum: EMA3(g * delta C) / sigma)
 * - Zero-preserving Robust Scale (s_i, z_i = tanh(x_i / s_i))
 * - Unified Score S_t = (z_T + z_A + z_M) / 3
 * Specification: Inflection_Hunter_R1_Algorithm_Spec.md (Sections 5 & 6)
 */

import { R1_CONFIG } from './constants.js';
import { dema, ema, atrSeries, percentileLinear, median } from './indicators.js';

/**
 * Computes the full R1 bar features across the series.
 * @param {Array<{time: number, open: number, high: number, low: number, close: number, volume?: number}>} bars
 * @param {Partial<typeof R1_CONFIG>} [options={}]
 * @returns {Array<import('./types.d.ts').R1BarFeatures>}
 */
export function computeR1Features(bars, options = {}) {
  if (!Array.isArray(bars) || bars.length === 0) return [];

  const cfg = { ...R1_CONFIG, ...options };
  const n = bars.length;

  const closes = bars.map(b => Number(b.close) || 0);
  const fastDema = dema(closes, cfg.n_fast);
  const slowDema = dema(closes, cfg.n_slow);
  const atrs = atrSeries(bars, cfg.n_ATR);

  // 1. Raw Trend Difference: D_t = F_t - G_t
  const D = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = fastDema[i];
    const g = slowDema[i];
    D[i] = (f !== null && g !== null) ? (f - g) : 0;
  }

  // 2. Change in Trend Difference: delta D = D_t - D_{t-1}
  const deltaD = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    deltaD[i] = i === 0 ? 0 : (D[i] - D[i - 1]);
  }
  const J = ema(Array.from(deltaD), cfg.n_smooth);

  // 3. Directional Volume Momentum
  const U = new Float64Array(n);
  const volumeFallbackFlags = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const curVol = Number(bars[i].volume);
    const hasVol = Number.isFinite(curVol) && curVol > 0;

    // Vbase_t = median(V_{t-20}, ..., V_{t-1})
    let vBase = 0;
    if (i > 0) {
      const start = Math.max(0, i - cfg.n_volume);
      const pastVols = [];
      for (let j = start; j < i; j++) {
        const v = Number(bars[j].volume);
        if (Number.isFinite(v) && v > 0) pastVols.push(v);
      }
      if (pastVols.length > 0) {
        vBase = median(pastVols);
      }
    }

    let g_t = 1.0;
    if (hasVol && vBase > 0) {
      const R_t = Math.max(curVol / vBase, 0.000001);
      g_t = 1 + cfg.gamma * Math.tanh(Math.log(R_t));
    } else {
      volumeFallbackFlags[i] = 1;
    }

    const deltaC = i === 0 ? 0 : (closes[i] - closes[i - 1]);
    U[i] = g_t * deltaC;
  }

  const M = ema(Array.from(U), cfg.n_smooth);

  // 4. Three unscaled directional features: x_T, x_A, x_M
  const x_T = new Float64Array(n);
  const x_A = new Float64Array(n);
  const x_M = new Float64Array(n);
  const sigmas = new Float64Array(n);
  const shockFlags = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    // sigma_t = max(ATR_{t-1}, tick)
    const prevAtr = i > 0 ? (atrs[i - 1] ?? atrs[i] ?? cfg.tick) : (atrs[0] ?? cfg.tick);
    const sigma = Math.max(Number(prevAtr) || cfg.tick, cfg.tick);
    sigmas[i] = sigma;

    x_T[i] = D[i] / sigma;
    x_A[i] = (J[i] ?? 0) / sigma;
    x_M[i] = (M[i] ?? 0) / sigma;

    // Shock bar check: TR_t > shock_max * sigma_t
    const curH = Number(bars[i].high);
    const curL = Number(bars[i].low);
    const prevC = i > 0 ? closes[i - 1] : curL;
    const curTR = Math.max(curH - curL, Math.abs(curH - prevC), Math.abs(curL - prevC));
    if (curTR > cfg.shock_max * sigma) {
      shockFlags[i] = 1;
    }
  }

  // 5. Zero-preserving Robust Scale & Unified Score S_t
  const result = new Array(n);
  const qScale = cfg.q_scale;
  const eps = cfg.epsilon_scale;
  const N_scale = cfg.N_scale;

  for (let i = 0; i < n; i++) {
    // Collect past absolute values up to t-1
    const windowStart = Math.max(0, i - N_scale);
    let s_T = eps;
    let s_A = eps;
    let s_M = eps;

    if (i > 0) {
      const count = i - windowStart;
      const absT = new Float64Array(count);
      const absA = new Float64Array(count);
      const absM = new Float64Array(count);

      let k = 0;
      for (let j = windowStart; j < i; j++) {
        absT[k] = Math.abs(x_T[j]);
        absA[k] = Math.abs(x_A[j]);
        absM[k] = Math.abs(x_M[j]);
        k++;
      }

      absT.sort();
      absA.sort();
      absM.sort();

      s_T = Math.max(percentileLinear(absT, qScale), eps);
      s_A = Math.max(percentileLinear(absA, qScale), eps);
      s_M = Math.max(percentileLinear(absM, qScale), eps);
    }

    // z_i = tanh(x_i / s_i)
    const z_T = Math.tanh(x_T[i] / s_T);
    const z_A = Math.tanh(x_A[i] / s_A);
    const z_M = Math.tanh(x_M[i] / s_M);

    // Unified Score: S = (z_T + z_A + z_M) / 3
    const S = (z_T * cfg.w_T + z_A * cfg.w_A + z_M * cfg.w_M);

    result[i] = {
      time: bars[i].time,
      index: i,
      close: closes[i],
      F: fastDema[i],
      G: slowDema[i],
      D: D[i],
      ATR: atrs[i],
      sigma: sigmas[i],
      x_T: x_T[i],
      x_A: x_A[i],
      x_M: x_M[i],
      s_T,
      s_A,
      s_M,
      z_T,
      z_A,
      z_M,
      S,
      volume_fallback: Boolean(volumeFallbackFlags[i]),
      shock_flag: Boolean(shockFlags[i])
    };
  }

  return result;
}

