/**
 * Inflection Hunter R1: Frozen Research Parameters
 * Specification: Inflection_Hunter_R1_Algorithm_Spec.md (Version 1.0)
 */

export const R1_CONFIG = Object.freeze({
  // Moving Averages
  n_fast: 14,
  n_slow: 30,

  // Volatility & Smoothing
  n_ATR: 14,
  n_smooth: 3,

  // Robust Scale (Section 6)
  N_scale: 260,
  q_scale: 0.75,
  epsilon_scale: 0.000001,

  // Volume Baseline & Momentum (Section 5.3)
  n_volume: 20,
  gamma: 0.35,

  // Path Efficiency & Confirmation (Section 7)
  n_ER: 20,
  w_T: 1 / 3,
  w_A: 1 / 3,
  w_M: 1 / 3,

  // Accumulator (Section 8)
  rho: 0.80,
  k: 0.10,
  H0: 0.65,
  lambda_ER: 0.80,
  H_off: 0.1625, // 0.25 * H0

  // Candidate Setup & Confirmation (Section 9)
  setup_life: 5,
  n_breakout: 3,
  trend_tolerance: 0.60, // d * z_T >= -0.60
  extension_max: 1.50, // 1.50 ATR
  shock_max: 3.00, // TR_t <= 3.00 sigma_t
  ATR_activity_min: 0.0001, // 2 ticks minimum
  tick: 0.01,

  // Position & Risk Constraints (Section 10, 11, 12)
  n_structure_stop: 5,
  stop_buffer: 0.25, // 0.25 ATR
  stop_min: 1.00, // 1.00 ATR
  stop_max: 2.50, // 2.50 ATR
  trail_activation: 1.50, // 1.50 R
  trail_distance: 2.00, // 2.00 ATR
  progress_bars: 8,
  progress_min: 0.50, // 0.50 R
  max_holding: 48,
  cooldown: 2,
  risk_fraction: 0.005,
  gross_notional_cap: 1.0,
  daily_loss_halt: 0.02,
  peak_drawdown_halt: 0.10,

  // Minimum warmup bars for full statistical fidelity
  min_bars_warmup: 410
});

