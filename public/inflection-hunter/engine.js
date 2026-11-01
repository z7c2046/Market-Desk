/**
 * Inflection Hunter R1: State Machine & Signal Engine
 * Implements:
 * - Candidate Events (SETUP d = +1 / -1)
 * - Discounted Accumulator Progression
 * - Confirmation Conditions (EB, B, ES, S)
 * - Structural Breakout (B+, B-) & Extension Checks
 * - Structural Initial Stop Price Calculation
 * Specification: Inflection_Hunter_R1_Algorithm_Spec.md (Sections 9, 10, 13)
 */

import { R1_CONFIG } from './constants.js';
import { computeR1Features } from './features.js';
import { calcPathEfficiency, calcConfirmationThreshold } from './efficiency.js';
import { stepAccumulator } from './accumulator.js';

/**
 * Computes all R1 Inflection Hunter Signals (EB, B, ES, S) on a sequence of OHLCV bars.
 *
 * @param {Array<{time: number, open: number, high: number, low: number, close: number, volume?: number}>} bars
 * @param {Partial<typeof R1_CONFIG>} [options={}]
 * @returns {Array<import('./types.d.ts').InflectionSignal>}
 */
export function computeInflectionSignals(bars, options = {}) {
  if (!Array.isArray(bars) || bars.length < 5) return [];

  const cfg = { ...R1_CONFIG, ...options };
  const n = bars.length;
  const features = computeR1Features(bars, cfg);

  const signals = [];

  let state = 'FLAT'; // 'FLAT' | 'SETUP' | 'CONFIRMED'
  let setupDir = 0; // +1 (Long) or -1 (Short)
  let setupStartIdx = -1;
  let setupH = cfg.H0;
  let eLong = 0;
  let eShort = 0;

  for (let t = 0; t < n; t++) {
    const feat = features[t];
    const prevFeat = t > 0 ? features[t - 1] : feat;
    const bar = bars[t];
    const close = Number(bar.close);
    const sigma = feat.sigma;

    // Calculate Path Efficiency ERprev and confirmation threshold H_t
    const erPrev = calcPathEfficiency(bars, t, cfg.n_ER);
    const H_t = calcConfirmationThreshold(erPrev, cfg.H0, cfg.lambda_ER);

    // 1. Check for New Candidate Events in direction d (+1 or -1)
    // d * x_A > 0 and d * x_M > 0
    // Fresh turn in direction d within recent 1 to 3 bars
    // d * z_T >= -0.60
    // TR_t <= 3 * sigma
    const turnedBullRecently = [1, 2, 3].some(k => t >= k && (features[t - k].x_A <= 0 || features[t - k].x_M <= 0));
    const isBullCandidate =
      feat.x_A > 0 &&
      feat.x_M > 0 &&
      turnedBullRecently &&
      feat.z_T >= -cfg.trend_tolerance &&
      !feat.shock_flag;

    const turnedBearRecently = [1, 2, 3].some(k => t >= k && (features[t - k].x_A >= 0 || features[t - k].x_M >= 0));
    const isBearCandidate =
      feat.x_A < 0 &&
      feat.x_M < 0 &&
      turnedBearRecently &&
      feat.z_T <= cfg.trend_tolerance &&
      !feat.shock_flag;

    // 2. Handle Candidate Setup Trigger
    let newSetupStarted = false;
    if (isBullCandidate && (!isBearCandidate || feat.x_A > -feat.x_A)) {
      if (state !== 'SETUP' || setupDir !== 1) {
        // Start or flip to Bullish SETUP
        state = 'SETUP';
        setupDir = 1;
        setupStartIdx = t;
        setupH = H_t;
        eLong = Math.max(0, feat.S - cfg.k);
        eShort = 0;
        newSetupStarted = true;

        signals.push({
          time: bar.time,
          index: t,
          side: 'EB',
          d: 1,
          price: close,
          score: Number(feat.S.toFixed(4)),
          H: Number(setupH.toFixed(4)),
          E: Number(eLong.toFixed(4)),
          fastDema: feat.F ? Number(feat.F.toFixed(2)) : undefined,
          slowDema: feat.G ? Number(feat.G.toFixed(2)) : undefined,
          sigma: Number(sigma.toFixed(2)),
          text: 'EB'
        });
      }
    } else if (isBearCandidate) {
      if (state !== 'SETUP' || setupDir !== -1) {
        // Start or flip to Bearish SETUP
        state = 'SETUP';
        setupDir = -1;
        setupStartIdx = t;
        setupH = H_t;
        eShort = Math.max(0, -feat.S - cfg.k);
        eLong = 0;
        newSetupStarted = true;

        signals.push({
          time: bar.time,
          index: t,
          side: 'ES',
          d: -1,
          price: close,
          score: Number(feat.S.toFixed(4)),
          H: Number(setupH.toFixed(4)),
          E: Number(eShort.toFixed(4)),
          fastDema: feat.F ? Number(feat.F.toFixed(2)) : undefined,
          slowDema: feat.G ? Number(feat.G.toFixed(2)) : undefined,
          sigma: Number(sigma.toFixed(2)),
          text: 'ES'
        });
      }
    }

    // 3. Process Active SETUP Progression & Confirmation
    if (state === 'SETUP' && !newSetupStarted) {
      const age = t - setupStartIdx;

      // Update accumulator across bars
      const stepped = stepAccumulator(eLong, eShort, feat.S, cfg.rho, cfg.k);
      eLong = stepped.ePlus;
      eShort = stepped.eMinus;

      const d = setupDir;
      const e_d = d === 1 ? eLong : eShort;
      const e_anti = d === 1 ? eShort : eLong;

      // Confirmation Criteria (Section 9):
      // - E_d >= H_setup
      // - E_anti < H_setup
      // - d * S_t > k
      // - d * x_M > 0 and d * z_T >= -0.60
      // - Structural breakout: C_t > B+ (long) or C_t < B- (short)
      //   where B+ = max(H_{t-3}, H_{t-2}, H_{t-1}), B- = min(L_{t-3}, L_{t-2}, L_{t-1})
      // - 0 < d(C_t - F_t) / sigma_t <= 1.50
      // - TR_t <= 3 * sigma_t
      let breakoutPassed = false;
      if (t >= 3) {
        if (d === 1) {
          const bPlus = Math.max(
            Number(bars[t - 1].high),
            Number(bars[t - 2].high),
            Number(bars[t - 3].high)
          );
          breakoutPassed = close > bPlus;
        } else {
          const bMinus = Math.min(
            Number(bars[t - 1].low),
            Number(bars[t - 2].low),
            Number(bars[t - 3].low)
          );
          breakoutPassed = close < bMinus;
        }
      } else {
        breakoutPassed = true; // Near series beginning
      }

      // Extension check: 0 < d*(C - F) / sigma <= extension_max (1.50)
      const fVal = feat.F ?? close;
      const ext = (d * (close - fVal)) / sigma;
      const extPassed = ext > -0.2 && ext <= cfg.extension_max;

      const confirmed =
        e_d >= setupH &&
        e_anti < setupH &&
        d * feat.S > cfg.k &&
        d * feat.x_M > 0 &&
        d * feat.z_T >= -cfg.trend_tolerance &&
        breakoutPassed &&
        extPassed &&
        !feat.shock_flag;

      if (confirmed) {
        // Calculate initial structural stop (Section 10)
        let stopPrice = undefined;
        if (t >= 4) {
          if (d === 1) {
            let lowestL = Number(bars[t].low);
            for (let j = 1; j <= 4; j++) {
              lowestL = Math.min(lowestL, Number(bars[t - j].low));
            }
            const pStruct = lowestL - cfg.stop_buffer * sigma;
            const dist = Math.max(close - pStruct, cfg.stop_min * sigma);
            if (dist <= cfg.stop_max * sigma) {
              stopPrice = Number((close - dist).toFixed(2));
            }
          } else {
            let highestH = Number(bars[t].high);
            for (let j = 1; j <= 4; j++) {
              highestH = Math.max(highestH, Number(bars[t - j].high));
            }
            const pStruct = highestH + cfg.stop_buffer * sigma;
            const dist = Math.max(pStruct - close, cfg.stop_min * sigma);
            if (dist <= cfg.stop_max * sigma) {
              stopPrice = Number((close + dist).toFixed(2));
            }
          }
        }

        signals.push({
          time: bar.time,
          index: t,
          side: d === 1 ? 'B' : 'S',
          d,
          price: close,
          score: Number(feat.S.toFixed(4)),
          H: Number(setupH.toFixed(4)),
          E: Number(e_d.toFixed(4)),
          fastDema: feat.F ? Number(feat.F.toFixed(2)) : undefined,
          slowDema: feat.G ? Number(feat.G.toFixed(2)) : undefined,
          sigma: Number(sigma.toFixed(2)),
          stopPrice,
          text: d === 1 ? 'B' : 'S'
        });

        state = 'CONFIRMED';
      } else if (age >= cfg.setup_life) {
        // Candidate setup expired after 5 bars without confirmation
        state = 'FLAT';
      } else if (d * feat.z_T < -cfg.trend_tolerance || feat.shock_flag) {
        // Severe trend invalidation or volatility shock
        state = 'FLAT';
      }
    }
  }

  return signals;
}
