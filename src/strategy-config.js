/**
 * Strategy Configuration & Parameter Validation
 * Centralized configuration for Daily RSI + Volume Inflection and Legacy strategies.
 */

export const ALGORITHMS = {
  MAJOR_TURN_V1: "major_turn_v1",
  SWING_PULSE_V1: "swing_pulse_v1",
  RSI_VOLUME_V1: "rsi_volume_v1",
  LEGACY_V1: "legacy_v1",
  LEGACY_V2: "legacy_v2"
};

export const DEFAULT_ALGORITHM = ALGORITHMS.SWING_PULSE_V1;

export const MAJOR_TURN_V1_CONFIG = {
  algorithm: ALGORITHMS.MAJOR_TURN_V1,
  version: "1.0.0",
  name: "重要顶底识别 (Major Turn V1)",
  timeframe: "1d",
  minWarmupBars: 180,
  defaultDisplayBars: 180,
  defaultFetchBars: 900,
  // 底部形态 panic_bottom
  bottomDrawdownAtrMult: 4.0,       // (HC60 - C) / A0 >= 4
  bottomTrendDays: 5,               // C[t0] < C[t0-5]
  bottomRsiOversold: 30,            // R[t0] <= 30
  bottomRvolThreshold: 2.0,         // RVOL[t0] >= 2.0
  bottomVolumePercentile: 0.95,     // V[t0] >= VP95[t0]
  bottomLookbackBars: 60,           // HC60
  bottomMinLowLookbackBars: 20,     // L[t0] <= min(L[t0-20..t0-1]) + 0.25*A0
  bottomMinLowAtrMult: 0.25,
  bottomInvalidationAtrMult: 0.5,   // invalidationLevel = L0 - 0.5*A0
  bottomRecoveryRatio: 0.60,        // recoveryLevel = L0 + 0.60*(H0 - L0)
  bottomConfirmationDays: 7,        // t0+1 to t0+7
  bottomRsiRecoveryDelta: 4,        // R[t] >= R0+4 && R[t] > R[t-1]
  bottomLateAtrMult: 2.0,           // (C[t] - L0) / A0 > 2.0 -> late
  // 顶部形态 exhaustion_top
  topSmaPeriod: 50,                 // C[d] > SMA50[d]
  topRunupAtrMult: 6.0,             // (C[d] - LL60) / A0 >= 6
  topProximityAtrMult: 1.5,         // HH60 - C[d] <= 1.5*A0
  topOverboughtRsi: 70,             // RMAX20[d] >= 70
  topRsiDecayDelta: 5,              // R[d] <= RMAX20[d] - 5
  topVolumeDecayRatio: 0.80,        // VDECAY[d] <= 0.80
  topTriggerLowBars: 3,             // min(L[d-3..d-1])
  topInvalidationAtrMult: 0.5,      // invalidationLevel = peakPrice + 0.5*A0
  topConfirmationDays: 7,           // d to d+7
  topLateAtrMult: 2.0,              // (peakPrice - C[t]) / A0 > 2.0 -> late
  // 去重参数 (Episode)
  episodeLengthBars: 20,            // e0 to e0+19
  attemptCooldownBars: 2,           // 至少间隔2根
  attemptNewLowAtrMult: 1.0,        // 新低须低于旧L0至少1个A0
  attemptNewHighAtrMult: 1.0,       // 新高须高于旧peakPrice至少1个A0
  episodeResetNeutralRsiBottom: 45, // 底部连续3天 RSI >= 45
  episodeResetNeutralRsiTop: 55,    // 顶部连续3天 RSI <= 55
  episodeResetExtremeAtrMult: 2.0,  // 或超出旧极值至少2个A0
  backtest: {
    feeBpsPerLeg: 5,
    slippageBpsPerLeg: 5
  }
};

export const SWING_PULSE_V1_CONFIG = {
  algorithm: ALGORITHMS.SWING_PULSE_V1,
  version: "2.1.0",
  name: "波段启动与转弱预警 (重构版)",
  timeframe: "1d",
  // 1. 强势整理后启动
  consolidationTrendSma: 50,
  consolidationSlopeBars: 5,
  consolidationShortAmpBars: 5,
  consolidationLongAmpBars: 20,
  consolidationShortVolBars: 5,
  consolidationLongVolBars: 20,
  consolidationProximityAtrMult: 1.0,
  consolidationBreakoutRvol: 1.5,
  consolidationLookback: 20,
  // 2. 回调转强
  pullbackSma: 20,
  pullbackTrendSma: 50,
  pullbackRsiLower: 40,
  pullbackRsiUpper: 55,
  pullbackBreakoutBars: 3,
  // 3. 独立转弱预警与风险确认
  weaknessBreakoutBars: 5,
  weaknessRvolThreshold: 1.2,
  weaknessClvThreshold: 0.25,
  atrTrailingMult: 3.0,
  // 4. RSI 背离对照配置 (adaptive: 核心为背离，70/30与缩量作为权重; strict: 全部硬性成立)
  divergenceMode: "adaptive",
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  rsiDivergenceMinDelta: 4,
  atrPeriod: 14,
  rvolPeriod: 20,
  rvolThreshold: 1.8,
  pivotLeftBars: 3,
  pivotRightBars: 2,
  pivotMinDistance: 5,
  pivotMaxDistance: 60,
  volumeDecayThreshold: 0.85,
  priceEpsilonRatio: 0.003,
  priceEpsilonAtrMult: 0.15,
  confirmationWindowBars: 7,
  clvThreshold: 0.60,
  minHistoryBars: 100,
  defaultDisplayBars: 180,
  defaultFetchBars: 900,
  // 5. 市场与板块过滤 (QQQ / SMH)
  regimeFilterEnabled: true,
  qqqBenchmarkSymbol: "QQQ",
  smhBenchmarkSymbol: "SMH",
  // 6. 回测与多周期波段评估
  swingEvaluationWindows: [5, 10, 20],
  backtest: {
    feeBpsPerLeg: 5,
    slippageBpsPerLeg: 5
  }
};

export const RSI_VOLUME_V1_CONFIG = {
  algorithm: ALGORITHMS.RSI_VOLUME_V1,
  version: "1.0.0",
  name: "RSI + 成交量基准 (V1)",
  timeframe: "1d",
  divergenceMode: "strict",
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  rsiDivergenceMinDelta: 4,      // 4 absolute points
  atrPeriod: 14,
  rvolPeriod: 20,                // 20 bars excluding current
  rvolThreshold: 1.8,            // Significant surge
  pivotLeftBars: 3,
  pivotRightBars: 2,
  pivotMinDistance: 5,
  pivotMaxDistance: 60,
  volumeDecayThreshold: 0.85,    // Q(p2) / Q(p1) <= 0.85
  priceEpsilonRatio: 0.003,      // 0.3% of p1 price
  priceEpsilonAtrMult: 0.15,     // 0.15 * ATR(p2)
  confirmationWindowBars: 7,     // d to d+7
  clvThreshold: 0.60,            // Branch C absorption
  minHistoryBars: 100,
  defaultDisplayBars: 180,
  defaultFetchBars: 900,
  backtest: {
    feeBpsPerLeg: 5,             // 5 bps per leg
    slippageBpsPerLeg: 5         // 5 bps per leg
  }
};

export const LEGACY_CONFIG = {
  algorithmV1: ALGORITHMS.LEGACY_V1,
  algorithmV2: ALGORITHMS.LEGACY_V2,
  nameV1: "原版趋势拐点 (V1基准)",
  nameV2: "原版趋势拐点 (已修正)",
  fastPeriod: 14,                // DEMA
  slowPeriod: 30,                // DEMA
  confirmBars: 2,
  enterThreshold: 0.22,
  exitThreshold: 0.08,
  wrPeriod: 9,
  wrOverbought: -15,
  wrOversold: -85,
  volSurgePeriod: 20
};

export function normalizeAlgorithm(algo) {
  const clean = String(algo || "").trim().toLowerCase();
  if (clean === ALGORITHMS.MAJOR_TURN_V1 || clean === "major_turn" || clean === "major" || clean === "turn") {
    return ALGORITHMS.MAJOR_TURN_V1;
  }
  if (clean === ALGORITHMS.SWING_PULSE_V1 || clean === "swing" || clean === "pulse" || clean === "swing_pulse" || clean === "reconstructed") {
    return ALGORITHMS.SWING_PULSE_V1;
  }
  if (clean === ALGORITHMS.RSI_VOLUME_V1 || clean === "rsi_volume" || clean === "rsi" || clean === "strict") {
    return ALGORITHMS.RSI_VOLUME_V1;
  }
  if (clean === ALGORITHMS.LEGACY_V1 || clean === "legacy" || clean === "v1") {
    return ALGORITHMS.LEGACY_V1;
  }
  if (clean === ALGORITHMS.LEGACY_V2 || clean === "v2" || clean === "fixed") {
    return ALGORITHMS.LEGACY_V2;
  }
  return DEFAULT_ALGORITHM;
}

export function validateStrategyParams(algo, params = {}) {
  const targetAlgo = normalizeAlgorithm(algo);
  const validated = { ...params };

  if (targetAlgo === ALGORITHMS.SWING_PULSE_V1) {
    if (params.tf && String(params.tf).toLowerCase() !== "1d") {
      throw new Error(`Timeframe '${params.tf}' is not supported by swing_pulse_v1. Only '1d' daily swing mode is supported.`);
    }
    validated.tf = "1d";
    validated.divergenceMode = params.divergenceMode === "strict" ? "strict" : "adaptive";
    const rawTrailing = Number(params.atrTrailingMult);
    validated.atrTrailingMult = Number.isFinite(rawTrailing) && rawTrailing >= 1.0 && rawTrailing <= 10.0 ? rawTrailing : SWING_PULSE_V1_CONFIG.atrTrailingMult;
    const rawBreakoutRvol = Number(params.consolidationBreakoutRvol);
    validated.consolidationBreakoutRvol = Number.isFinite(rawBreakoutRvol) && rawBreakoutRvol >= 0.1 ? rawBreakoutRvol : SWING_PULSE_V1_CONFIG.consolidationBreakoutRvol;
    const rawWeakRvol = Number(params.weaknessRvolThreshold);
    validated.weaknessRvolThreshold = Number.isFinite(rawWeakRvol) && rawWeakRvol >= 0.1 ? rawWeakRvol : SWING_PULSE_V1_CONFIG.weaknessRvolThreshold;
    const rawWeakClv = Number(params.weaknessClvThreshold);
    validated.weaknessClvThreshold = Number.isFinite(rawWeakClv) && rawWeakClv >= 0.01 && rawWeakClv <= 0.99 ? rawWeakClv : SWING_PULSE_V1_CONFIG.weaknessClvThreshold;
    const rawRsiLower = Number(params.pullbackRsiLower);
    validated.pullbackRsiLower = Number.isFinite(rawRsiLower) && rawRsiLower >= 10 && rawRsiLower <= 70 ? rawRsiLower : SWING_PULSE_V1_CONFIG.pullbackRsiLower;
    const rawRsiUpper = Number(params.pullbackRsiUpper);
    validated.pullbackRsiUpper = Number.isFinite(rawRsiUpper) && rawRsiUpper >= 30 && rawRsiUpper <= 80 ? rawRsiUpper : SWING_PULSE_V1_CONFIG.pullbackRsiUpper;
    validated.regimeFilterEnabled = params.regimeFilterEnabled !== false && params.regimeFilterEnabled !== "false";
  } else if (targetAlgo === ALGORITHMS.RSI_VOLUME_V1) {
    if (params.tf && String(params.tf).toLowerCase() !== "1d") {
      throw new Error(`Timeframe '${params.tf}' is not supported by rsi_volume_v1. Only '1d' daily swing mode is supported.`);
    }
    validated.tf = "1d";
    validated.rsiPeriod = Number(params.rsiPeriod) || RSI_VOLUME_V1_CONFIG.rsiPeriod;
    validated.rsiOverbought = Number(params.rsiOverbought) || RSI_VOLUME_V1_CONFIG.rsiOverbought;
    validated.rsiOversold = Number(params.rsiOversold) || RSI_VOLUME_V1_CONFIG.rsiOversold;
    validated.rsiDivergenceMinDelta = Number(params.rsiDivergenceMinDelta) || RSI_VOLUME_V1_CONFIG.rsiDivergenceMinDelta;
    validated.rvolThreshold = Number(params.rvolThreshold) || RSI_VOLUME_V1_CONFIG.rvolThreshold;
    validated.volumeDecayThreshold = Number(params.volumeDecayThreshold) || RSI_VOLUME_V1_CONFIG.volumeDecayThreshold;
  } else if (targetAlgo === ALGORITHMS.MAJOR_TURN_V1) {
    if (params.tf && String(params.tf).toLowerCase() !== "1d") {
      throw new Error(`Timeframe '${params.tf}' is not supported by major_turn_v1. Only '1d' daily swing mode is supported.`);
    }
    validated.tf = "1d";
    validated.bottomDrawdownAtrMult = Number(params.bottomDrawdownAtrMult) || MAJOR_TURN_V1_CONFIG.bottomDrawdownAtrMult;
    validated.bottomRvolThreshold = Number(params.bottomRvolThreshold) || MAJOR_TURN_V1_CONFIG.bottomRvolThreshold;
    validated.bottomRsiOversold = Number(params.bottomRsiOversold) || MAJOR_TURN_V1_CONFIG.bottomRsiOversold;
    validated.topRunupAtrMult = Number(params.topRunupAtrMult) || MAJOR_TURN_V1_CONFIG.topRunupAtrMult;
    validated.topVolumeDecayRatio = Number(params.topVolumeDecayRatio) || MAJOR_TURN_V1_CONFIG.topVolumeDecayRatio;
  }

  return { algorithm: targetAlgo, params: validated };
}
