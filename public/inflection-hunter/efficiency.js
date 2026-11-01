/**
 * Inflection Hunter R1: Path Efficiency (ER) and Confirmation Threshold (H)
 * Specification: Inflection_Hunter_R1_Algorithm_Spec.md (Section 7)
 */

import { R1_CONFIG } from './constants.js';

/**
 * Calculates Path Efficiency ERprev_t using history up to bar t-1:
 * ERprev_t = |C_{t-1} - C_{t-21}| / sum_{j=1..20} |C_{t-j} - C_{t-j-1}|
 * Returns value in [0, 1].
 * @param {Array<{close: number}>} bars
 * @param {number} t - Current bar index
 * @param {number} [window=20]
 * @returns {number}
 */
export function calcPathEfficiency(bars, t, window = 20) {
  if (!bars || t <= 1) return 0;

  const endIdx = t - 1;
  const startIdx = Math.max(0, endIdx - window);
  if (startIdx >= endIdx) return 0;

  const netMove = Math.abs(Number(bars[endIdx].close) - Number(bars[startIdx].close));
  let grossMove = 0;

  for (let j = startIdx + 1; j <= endIdx; j++) {
    grossMove += Math.abs(Number(bars[j].close) - Number(bars[j - 1].close));
  }

  if (grossMove <= 1e-12) return 0;
  return Math.max(0, Math.min(1, netMove / grossMove));
}

/**
 * Calculates adaptive confirmation threshold H_t:
 * H_t = H0 * [1 + lambda_ER * (1 - ERprev_t)^2]
 * Higher path efficiency (ER -> 1) yields base threshold H0 (e.g. 0.65).
 * Choppy / noisy environments (ER -> 0) penalize and raise threshold up to H0 * (1 + lambda_ER) (e.g. 1.17).
 * @param {number} erPrev - Efficiency ratio in [0, 1]
 * @param {number} [H0=0.65]
 * @param {number} [lambdaER=0.80]
 * @returns {number}
 */
export function calcConfirmationThreshold(
  erPrev,
  H0 = R1_CONFIG.H0,
  lambdaER = R1_CONFIG.lambda_ER
) {
  const er = Math.max(0, Math.min(1, Number(erPrev) || 0));
  const factor = 1 + lambdaER * Math.pow(1 - er, 2);
  return H0 * factor;
}

