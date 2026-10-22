/**
 * Market Snapshot Service
 * Fetches market data, normalizes completed bars, dispatches to the requested strategy,
 * and compiles synchronized series and long-only backtest summaries.
 */

import {
  deriveMarketPulse,
  deriveRisk,
  dema,
  round,
  computeMutant,
  rsiSeries,
  volumeMaSeries,
  rvol20Series
} from "./indicators.js";
import {
  normalizeBars,
  assessDataQuality,
  getCachedSnapshot,
  setCachedSnapshot,
  buildSnapshotCacheKey
} from "./market-data.js";
import { computeRsiVolumeSignals, computeSwingPulseSignals } from "./rsi-volume-signals.js";
import { computeMajorTurnSignals } from "./major-turn-signals.js";
import { computeSignalsLegacyV1, computeSignalsLegacyV2 } from "./signals.js";
import { runLongOnlyBacktest, evaluateSwingAlerts } from "./backtest.js";
import {
  normalizeAlgorithm,
  validateStrategyParams,
  ALGORITHMS,
  MAJOR_TURN_V1_CONFIG,
  SWING_PULSE_V1_CONFIG,
  RSI_VOLUME_V1_CONFIG,
  LEGACY_CONFIG
} from "./strategy-config.js";
import { fetchTradingViewBars } from "./tradingview.js";
import { getCachedBenchmarkBars, buildSynchronizedRegimeMap } from "./regime.js";

function toSeries(bars, values) {
  return values
    .map((value, index) => ({
      time: bars[index]?.time,
      value: Number.isFinite(value) ? round(value, 4) : null
    }))
    .filter((point) => point.time && Number.isFinite(point.value));
}

export async function getMarketSnapshot(query = {}) {
  const symbol = String(query.symbol || "SNDK").trim().toUpperCase();
  const rawTf = String(query.tf || "1d").trim().toLowerCase();
  const rawAlgo = String(query.algorithm || DEFAULT_ALGORITHM).trim().toLowerCase();
  const { algorithm, params } = validateStrategyParams(rawAlgo, query);

  const isDailyOnly = algorithm === ALGORITHMS.SWING_PULSE_V1 || algorithm === ALGORITHMS.RSI_VOLUME_V1 || algorithm === ALGORITHMS.MAJOR_TURN_V1;
  if (isDailyOnly && rawTf !== "1d") {
    throw new Error(`Timeframe '${rawTf}' is not supported by ${algorithm}. Only '1d' daily swing mode is supported.`);
  }

  const tf = isDailyOnly ? "1d" : rawTf;
  const limit = Math.max(100, Math.min(3000, Number(query.limit || 900)));

  // Check cache
  const cacheKey = buildSnapshotCacheKey(symbol, tf, algorithm, params, 0);
  const cached = getCachedSnapshot(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  // Fetch TradingView bars
  const tv = await fetchTradingViewBars({ symbol, tf, limit });
  const allBars = normalizeBars(tv.bars).slice(-limit);
  const completedBars = allBars.filter((b) => b.isCompleted);
  const quality = assessDataQuality(allBars);

  // Fetch benchmark bars (QQQ / SMH)
  const { qqqBars, smhBars } = await getCachedBenchmarkBars({ limit: completedBars.length });
  const regimeMap = buildSynchronizedRegimeMap(completedBars, qqqBars, smhBars);

  const closes = completedBars.map((bar) => Number(bar.close));
  const demaFast = dema(closes, 14);
  const aux = dema(closes, 30);

  let signals = [];
  let signalEvents = [];
  let activeSetups = [];
  let activePosition = null;
  let rsiSeriesData = [];
  let volumeMaData = [];
  let rvolData = [];
  let sma50SeriesData = [];
  let sma20SeriesData = [];
  let trailingStopSeriesData = [];
  let algorithmName = SWING_PULSE_V1_CONFIG.name;
  let algorithmVersion = SWING_PULSE_V1_CONFIG.version;

  if (algorithm === ALGORITHMS.SWING_PULSE_V1) {
    algorithmName = SWING_PULSE_V1_CONFIG.name;
    algorithmVersion = SWING_PULSE_V1_CONFIG.version;
    const pulseResult = computeSwingPulseSignals(completedBars, { symbol, regimeMap, ...params });
    signals = pulseResult.signals;
    signalEvents = pulseResult.signalEvents;
    activeSetups = pulseResult.activeSetups;
    activePosition = pulseResult.activePosition;
    rsiSeriesData = pulseResult.series.rsi;
    volumeMaData = pulseResult.series.volumeMa;
    rvolData = pulseResult.series.rvol;
    sma50SeriesData = pulseResult.series.sma50;
    sma20SeriesData = pulseResult.series.sma20;
    trailingStopSeriesData = pulseResult.series.trailingStop;
  } else if (algorithm === ALGORITHMS.MAJOR_TURN_V1) {
    algorithmName = MAJOR_TURN_V1_CONFIG.name;
    algorithmVersion = MAJOR_TURN_V1_CONFIG.version;
    const turnResult = computeMajorTurnSignals(completedBars, { symbol, ...params });
    signals = turnResult.signals;
    signalEvents = turnResult.signalEvents;
    const rsiRaw = rsiSeries(completedBars, 14);
    const volMaRaw = volumeMaSeries(completedBars, 20);
    const rvolRaw = rvol20Series(completedBars, 20);
    rsiSeriesData = toSeries(completedBars, rsiRaw);
    volumeMaData = toSeries(completedBars, volMaRaw);
    rvolData = toSeries(completedBars, rvolRaw);
  } else if (algorithm === ALGORITHMS.RSI_VOLUME_V1) {
    algorithmName = RSI_VOLUME_V1_CONFIG.name;
    algorithmVersion = RSI_VOLUME_V1_CONFIG.version;
    const rsiVolResult = computeRsiVolumeSignals(completedBars, { symbol, divergenceMode: "strict", ...params });
    signals = rsiVolResult.signals;
    signalEvents = rsiVolResult.signalEvents;
    activeSetups = rsiVolResult.activeSetups;
    rsiSeriesData = rsiVolResult.series.rsi;
    volumeMaData = rsiVolResult.series.volumeMa;
    rvolData = rsiVolResult.series.rvol;
  } else if (algorithm === ALGORITHMS.LEGACY_V1) {
    algorithmName = LEGACY_CONFIG.nameV1;
    algorithmVersion = "1.0.0";
    signals = computeSignalsLegacyV1(completedBars, demaFast, aux, params);
    const rsiRaw = rsiSeries(completedBars, 14);
    const volMaRaw = volumeMaSeries(completedBars, 20);
    const rvolRaw = rvol20Series(completedBars, 20);
    rsiSeriesData = toSeries(completedBars, rsiRaw);
    volumeMaData = toSeries(completedBars, volMaRaw);
    rvolData = toSeries(completedBars, rvolRaw);
  } else {
    // LEGACY_V2 (fixed)
    algorithmName = LEGACY_CONFIG.nameV2;
    algorithmVersion = "2.0.0";
    signals = computeSignalsLegacyV2(completedBars, demaFast, aux, params);
    const rsiRaw = rsiSeries(completedBars, 14);
    const volMaRaw = volumeMaSeries(completedBars, 20);
    const rvolRaw = rvol20Series(completedBars, 20);
    rsiSeriesData = toSeries(completedBars, rsiRaw);
    volumeMaData = toSeries(completedBars, volMaRaw);
    rvolData = toSeries(completedBars, rvolRaw);
  }

  // Volume series with proper colors for chart
  const volumeSeries = allBars.map((b) => ({
    time: b.time,
    value: b.volume,
    color: Number(b.close) >= Number(b.open) ? "#38ab70" : "#df4f46"
  }));

  // Formal signals for direction and backtest
  const formalSignals = signals.filter(
    (s) => s.side === "B" || s.side === "S" || s.side === "DV-B" || s.side === "AV-B" || s.side === "DV-S"
  );
  const latestFormal = formalSignals.at(-1);
  const isBearish = latestFormal && (latestFormal.side === "S" || latestFormal.side === "DV-S");
  const direction = isBearish ? "short" : "long";

  const activeSetup = activeSetups.at(-1) || signalEvents.at(-1) || null;
  const pulse = deriveMarketPulse(completedBars);
  const risk = deriveRisk(completedBars, { direction, activePosition, activeSetup });
  const mutant = computeMutant(completedBars);

  // Pure long-only cash backtest on completed bars
  const startTimestamp = completedBars[0]?.time || 0;
  const endTimestamp = completedBars.at(-1)?.time || 0;
  const backtest = runLongOnlyBacktest({
    id: algorithm,
    name: algorithmName,
    bars: completedBars,
    events: formalSignals,
    startTime: startTimestamp,
    endTime: endTimestamp,
    feeBps: 5,
    slippageBps: 5
  });

  const swingEvaluation = evaluateSwingAlerts({
    bars: completedBars,
    signals,
    windows: [5, 10, 20],
    startIndex: 0,
    endIndex: completedBars.length - 1
  });

  const lastCompletedBar = completedBars.at(-1);
  const latestRegime = lastCompletedBar ? regimeMap.get(lastCompletedBar.time) : null;

  const snapshot = {
    ok: true,
    symbol,
    tvSymbol: tv.symbol,
    tf,
    interval: tv.interval,
    source: "tradingview_public",
    algorithm,
    algorithmName,
    algorithmVersion,
    bars: allBars,
    closedThrough: lastCompletedBar ? lastCompletedBar.date : null,
    dataQuality: quality,
    ema_series: algorithm === ALGORITHMS.SWING_PULSE_V1 && sma20SeriesData.length > 0 ? sma20SeriesData : toSeries(completedBars, demaFast),
    aux_series: algorithm === ALGORITHMS.SWING_PULSE_V1 && sma50SeriesData.length > 0 ? sma50SeriesData : toSeries(completedBars, aux),
    rsi_series: rsiSeriesData,
    volume_series: volumeSeries,
    volume_ma_series: volumeMaData,
    relative_volume_series: rvolData,
    sma50_series: sma50SeriesData,
    sma20_series: sma20SeriesData,
    trailing_stop_series: trailingStopSeriesData,
    regime: latestRegime || { qqqUp: false, smhUp: false, regime: "neutral", rs: null },
    signals,
    signalEvents,
    activeSetups,
    activeSetup,
    activePosition,
    mutant,
    pulse,
    risk,
    backtest,
    swingEvaluation,
    meta: {
      provider: "TradingView public websocket",
      data_mode: "public_best_effort",
      strategy: algorithmName,
      strategy_version: algorithmVersion,
      closed_through: lastCompletedBar ? lastCompletedBar.date : null,
      total_bars: allBars.length,
      completed_bars: completedBars.length,
      generated_at: new Date().toISOString()
    }
  };

  setCachedSnapshot(cacheKey, snapshot);
  return snapshot;
}
