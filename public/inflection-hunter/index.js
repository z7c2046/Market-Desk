/**
 * Inflection Hunter R1: Complete Modular Algorithm Engine
 * Fully compliant with Inflection_Hunter_R1_Algorithm_Spec.md (Version 1.0)
 *
 * Architecture:
 * - constants.js: Frozen research parameters & constraints
 * - indicators.js: Stable EMA, DEMA (14/30), ATR (14), True Range, Median
 * - features.js: Directional features (x_T, x_A, x_M) & Zero-preserving Robust Scale (s_i, z_i)
 * - efficiency.js: Path Efficiency (ERprev) & Adaptive Threshold (H_t)
 * - accumulator.js: Discounted Two-Sided Evidence Accumulator (E+, E-)
 * - engine.js: Candidate Setups, State Machine, Breakouts & Inflection Signals (EB, B, ES, S)
 * - formatters.js: Chart Visual Markers for Lightweight Charts & ECharts
 */

export { R1_CONFIG } from './constants.js';

export {
  ema,
  dema,
  trueRangeSeries,
  atrSeries,
  percentileLinear,
  median
} from './indicators.js';

export {
  computeR1Features
} from './features.js';

export {
  calcPathEfficiency,
  calcConfirmationThreshold
} from './efficiency.js';

export {
  stepAccumulator,
  constantSignalAccumulator
} from './accumulator.js';

export {
  computeInflectionSignals
} from './engine.js';

export {
  formatSignalMarkers
} from './formatters.js';

