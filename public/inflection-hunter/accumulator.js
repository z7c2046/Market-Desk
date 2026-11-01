/**
 * Inflection Hunter R1: Discounted Two-Sided Evidence Accumulator
 * Specification: Inflection_Hunter_R1_Algorithm_Spec.md (Section 8, Section 15, Section 16)
 */

import { R1_CONFIG } from './constants.js';

/**
 * Steps the two-sided evidence accumulators with score S_t:
 * Eplus_t = max(0, rho * Eplus_{t-1} + S_t - k)
 * Eminus_t = max(0, rho * Eminus_{t-1} - S_t - k)
 *
 * Theoretical upper bound: (1 - k) / (1 - rho) = (1 - 0.10) / (1 - 0.80) = 4.50
 *
 * @param {number} prevEplus
 * @param {number} prevEminus
 * @param {number} score - Unified score S in [-1, 1]
 * @param {number} [rho=0.80] - Evidence retention factor in (0, 1)
 * @param {number} [k=0.10] - Reference deduction value in [0, 1)
 * @returns {{ ePlus: number, eMinus: number }}
 */
export function stepAccumulator(
  prevEplus,
  prevEminus,
  score,
  rho = R1_CONFIG.rho,
  k = R1_CONFIG.k
) {
  const s = Math.max(-1, Math.min(1, Number(score) || 0));
  const ePlus = Math.max(0, (Number(prevEplus) || 0) * rho + s - k);
  const eMinus = Math.max(0, (Number(prevEminus) || 0) * rho - s - k);
  return { ePlus, eMinus };
}

/**
 * Calculates closed-form accumulator value for constant signal c after n steps:
 * E_n = (c - k) * (1 - rho^n) / (1 - rho)
 * @param {number} c
 * @param {number} n
 * @param {number} [rho=0.80]
 * @param {number} [k=0.10]
 * @returns {number}
 */
export function constantSignalAccumulator(
  c,
  n,
  rho = R1_CONFIG.rho,
  k = R1_CONFIG.k
) {
  if (c <= k) return 0;
  return ((c - k) * (1 - Math.pow(rho, n))) / (1 - rho);
}

