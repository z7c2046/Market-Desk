/**
 * Inflection Hunter R1: TypeScript Type Definitions
 * Specification: Inflection_Hunter_R1_Algorithm_Spec.md (Version 1.0)
 */

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface R1Config {
  n_fast: number;
  n_slow: number;
  n_ATR: number;
  n_smooth: number;
  N_scale: number;
  q_scale: number;
  epsilon_scale: number;
  n_volume: number;
  gamma: number;
  n_ER: number;
  w_T: number;
  w_A: number;
  w_M: number;
  rho: number;
  k: number;
  H0: number;
  lambda_ER: number;
  H_off: number;
  setup_life: number;
  n_breakout: number;
  trend_tolerance: number;
  extension_max: number;
  shock_max: number;
  ATR_activity_min: number;
  tick: number;
  n_structure_stop: number;
  stop_buffer: number;
  stop_min: number;
  stop_max: number;
  trail_activation: number;
  trail_distance: number;
  progress_bars: number;
  progress_min: number;
  max_holding: number;
  cooldown: number;
  risk_fraction: number;
  gross_notional_cap: number;
  daily_loss_halt: number;
  peak_drawdown_halt: number;
  min_bars_warmup: number;
}

export type SignalSide = 'EB' | 'B' | 'ES' | 'S';

export interface InflectionSignal {
  time: number;
  index: number;
  side: SignalSide;
  price: number;
  score: number;
  H: number;
  E: number;
  d: 1 | -1;
  stopPrice?: number;
  fastDema?: number;
  slowDema?: number;
  sigma?: number;
  text?: string;
}

export interface R1BarFeatures {
  time: number;
  index: number;
  close: number;
  F: number | null; // Fast DEMA
  G: number | null; // Slow DEMA
  D: number | null; // F - G
  ATR: number | null;
  sigma: number;
  x_T: number;
  x_A: number;
  x_M: number;
  s_T: number;
  s_A: number;
  s_M: number;
  z_T: number;
  z_A: number;
  z_M: number;
  S: number;
  ERprev: number;
  H: number;
  Eplus: number;
  Eminus: number;
  volume_fallback: boolean;
  shock_flag: boolean;
}

export interface ChartMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
  size?: number;
}

