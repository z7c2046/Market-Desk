import { atrSeries, clamp, computeMutant, williamsRSeries, volumeSurgeSeries } from "./indicators.js";

function signalSide(direction, early) {
  if (direction > 0) return early ? "eB" : "B";
  if (direction < 0) return early ? "eS" : "S";
  return "";
}

/**
 * Compute ATR-percentile-based adaptive thresholds.
 * When recent ATR is elevated (high-volatility regime), the enter threshold
 * is raised to avoid chasing extended moves; it narrows in quiet regimes.
 */
function adaptiveThresholds(atr, currentIdx, baseEnter = 0.22, baseExit = 0.08) {
  const lookback = 60;
  const start = Math.max(0, currentIdx - lookback);
  const slice = atr.slice(start, currentIdx + 1).filter(Number.isFinite);
  if (slice.length < 5) return { enter: baseEnter, exit: baseExit };

  const sorted = [...slice].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  const current = atr[currentIdx];

  // ratio in [0, 1]: 0 = near median, 1 = near 90th percentile
  const ratio = p90 > p50 ? clamp((current - p50) / (p90 - p50), 0, 1) : 0;

  // Scale thresholds up to 60 % higher in high-volatility regimes
  const scale = 1 + ratio * 0.6;
  return {
    enter: baseEnter * scale,
    exit:  baseExit  * scale
  };
}

/**
 * Adaptive Mutant weight: amplify when Mutant has been consistently
 * directional over the last `window` bars, dampen when it is oscillating.
 */
function mutantWeight(mutantByTime, bars, currentIdx, baseWeight = 0.18, window = 5) {
  if (currentIdx < window) return baseWeight;
  let same = 0;
  const ref = Number(mutantByTime.get(bars[currentIdx]?.time) || 0);
  for (let k = 1; k <= window; k += 1) {
    const v = Number(mutantByTime.get(bars[currentIdx - k]?.time) || 0);
    if (Math.sign(v) === Math.sign(ref) && Math.abs(v) > 0.1) same += 1;
  }
  const consistency = same / window; // 0 = random, 1 = all aligned
  return baseWeight * (0.6 + consistency * 0.8); // range [0.108, 0.324]
}

export function computeSignalsLegacyV1(bars, emaFast, aux, options = {}) {
  const confirmBars    = Math.max(1, Number(options.confirmBars    || 2));
  const baseEnter      = Number(options.enterThreshold || 0.22);
  const baseExit       = Number(options.exitThreshold  || 0.08);

  const atr      = atrSeries(bars, 14);
  const wR       = williamsRSeries(bars, 9);
  const volSurge = volumeSurgeSeries(bars, 20);
  const mutant   = computeMutant(bars, bars.length, 5);
  const mutantByTime = new Map(mutant.map((point) => [point.time, point.value]));

  const signals = [];
  let regime       = 0;
  let pending      = 0;
  let pendingCount = 0;
  let lastEarlyAt  = null;

  for (let i = 55; i < bars.length; i += 1) {
    const bar   = bars[i];
    const fast  = Number(emaFast[i]);
    const slow  = Number(aux[i]);
    const close = Number(bar.close);
    const vol   = Number(atr[i]) || Math.max(1e-9, Math.abs(close) * 0.01);
    const m     = Number(mutantByTime.get(bar.time) || 0);

    if (!Number.isFinite(fast) || !Number.isFinite(slow) || !Number.isFinite(close)) continue;

    const { enter: enterThreshold, exit: exitThreshold } = adaptiveThresholds(atr, i, baseEnter, baseExit);
    const wrVal       = Number(wR[i]);
    const wrOverbought = Number.isFinite(wrVal) && wrVal >= -15;
    const wrOversold   = Number.isFinite(wrVal) && wrVal <= -85;

    const surge       = Number(volSurge[i]);
    const volFactor   = !Number.isFinite(surge) ? 1.0
      : surge >= 1.5 ? 1.15
      : surge >= 1.0 ? 1.0
      : surge >= 0.7 ? 0.85
      : 0.70;

    const mWeight = mutantWeight(mutantByTime, bars, i);
    const prev1      = Number(bars[i - 1]?.close ?? close);
    const velocity   = (close - prev1) / vol;
    const spreadScore = (fast - slow) / vol;
    const priceScore  = (close - fast) / vol;
    const slopeScore  = (fast - Number(emaFast[i - 2] ?? emaFast[i])) / vol;
    const rawScore    = 0.45 * spreadScore + 0.25 * priceScore + 0.15 * slopeScore + 0.08 * velocity + mWeight * m;
    const score       = rawScore * volFactor;

    const direction = score > 0 ? 1 : score < 0 ? -1 : 0;
    let confluence = 0;
    if (direction !== 0) {
      if (spreadScore * direction > 0.05) confluence += 1;
      if (slopeScore  * direction > 0.02) confluence += 1;
      if (Number.isFinite(wrVal) && Math.sign(wrVal + 50) === direction) confluence += 1;
      if (Number.isFinite(volSurge[i]) && volSurge[i] >= 1.2) confluence += 1;
    }

    const dynConfirm = (confluence >= 4 && Math.abs(score) >= enterThreshold * 2.2) ? 1 : confirmBars;

    let target = regime;
    if      (score >= enterThreshold)   target = 1;
    else if (score <= -enterThreshold)  target = -1;
    else if (Math.abs(score) <= exitThreshold) target = 0;

    // Unmodified legacy_v1 filter:
    if (target === 1  && wrOverbought && regime !== 1)  target = regime;
    if (target === -1 && wrOversold   && regime !== -1) target = regime;

    if (target === regime) { pending = 0; pendingCount = 0; continue; }
    if (target === 0)      { pending = 0; pendingCount = 0; continue; }

    if (pending !== target) {
      pending      = target;
      pendingCount = 1;
      lastEarlyAt  = bar.time;
      signals.push({
        time:       bar.time,
        price:      close,
        side:       signalSide(target, true),
        regime:     target > 0 ? "UP" : "DOWN",
        reason:     target > 0 ? "dema_cross_up" : "dema_cross_down",
        strength:   0.55,
        score:      clamp(Math.abs(score), 0, 1.5),
        confluence,
        wr:         Number.isFinite(wrVal) ? Math.round(wrVal) : null,
        volSurge:   Number.isFinite(volSurge[i])  ? Math.round(volSurge[i] * 100) / 100 : null
      });
    } else {
      pendingCount += 1;
    }

    if (pendingCount >= dynConfirm && lastEarlyAt !== bar.time) {
      signals.push({
        time:       bar.time,
        price:      close,
        side:       signalSide(pending, false),
        regime:     pending > 0 ? "UP" : "DOWN",
        reason:     `confirm_${dynConfirm}bar_c${confluence}`,
        strength:   0.6 + confluence * 0.1,
        score:      clamp(Math.abs(score), 0, 1.5),
        confluence,
        wr:         Number.isFinite(wrVal) ? Math.round(wrVal) : null,
        volSurge:   Number.isFinite(volSurge[i])  ? Math.round(volSurge[i] * 100) / 100 : null
      });
      regime       = pending;
      pending      = 0;
      pendingCount = 0;
    }
  }

  return signals;
}

export function computeSignalsLegacyV2(bars, emaFast, aux, options = {}) {
  const confirmBars    = Math.max(1, Number(options.confirmBars    || 2));
  const baseEnter      = Number(options.enterThreshold || 0.22);
  const baseExit       = Number(options.exitThreshold  || 0.08);

  const atr      = atrSeries(bars, 14);
  const wR       = williamsRSeries(bars, 9);
  const volSurge = volumeSurgeSeries(bars, 20);
  const mutant   = computeMutant(bars, bars.length, 5);
  const mutantByTime = new Map(mutant.map((point) => [point.time, point.value]));

  const signals = [];
  let regime       = 0;
  let pending      = 0;
  let pendingCount = 0;
  let lastEarlyAt  = null;

  for (let i = 55; i < bars.length; i += 1) {
    const bar   = bars[i];
    const fast  = Number(emaFast[i]);
    const slow  = Number(aux[i]);
    const close = Number(bar.close);
    const vol   = Number(atr[i]) || Math.max(1e-9, Math.abs(close) * 0.01);
    const m     = Number(mutantByTime.get(bar.time) || 0);

    if (!Number.isFinite(fast) || !Number.isFinite(slow) || !Number.isFinite(close)) continue;

    const { enter: enterThreshold, exit: exitThreshold } = adaptiveThresholds(atr, i, baseEnter, baseExit);
    const wrVal       = Number(wR[i]);
    const wrOverbought = Number.isFinite(wrVal) && wrVal >= -15;
    const wrOversold   = Number.isFinite(wrVal) && wrVal <= -85;

    const surge       = Number(volSurge[i]);
    const volFactor   = !Number.isFinite(surge) ? 1.0
      : surge >= 1.5 ? 1.15
      : surge >= 1.0 ? 1.0
      : surge >= 0.7 ? 0.85
      : 0.70;

    const mWeight = mutantWeight(mutantByTime, bars, i);
    const prev1      = Number(bars[i - 1]?.close ?? close);
    const velocity   = (close - prev1) / vol;
    const spreadScore = (fast - slow) / vol;
    const priceScore  = (close - fast) / vol;
    const slopeScore  = (fast - Number(emaFast[i - 2] ?? emaFast[i])) / vol;
    const rawScore    = 0.45 * spreadScore + 0.25 * priceScore + 0.15 * slopeScore + 0.08 * velocity + mWeight * m;
    const score       = rawScore * volFactor;

    const direction = score > 0 ? 1 : score < 0 ? -1 : 0;
    let confluence = 0;
    if (direction !== 0) {
      if (spreadScore * direction > 0.05) confluence += 1;
      if (slopeScore  * direction > 0.02) confluence += 1;
      if (Number.isFinite(wrVal) && Math.sign(wrVal + 50) === direction) confluence += 1;
      if (Number.isFinite(volSurge[i]) && volSurge[i] >= 1.2) confluence += 1;
    }

    const dynConfirm = (confluence >= 4 && Math.abs(score) >= enterThreshold * 2.2) ? 1 : confirmBars;

    let target = regime;
    if      (score >= enterThreshold)   target = 1;
    else if (score <= -enterThreshold)  target = -1;
    else if (Math.abs(score) <= exitThreshold) target = 0;

    // ── V2 FIX 1: Oversold %R does NOT block downward exit when currently holding UP regime ──
    if (target === 1  && wrOverbought && regime !== 1)  target = regime;
    if (target === -1 && wrOversold   && regime !== 1 && regime !== -1) target = regime;

    if (target === regime) { pending = 0; pendingCount = 0; continue; }
    if (target === 0)      { pending = 0; pendingCount = 0; continue; }

    if (pending !== target) {
      pending      = target;
      pendingCount = 1;
      lastEarlyAt  = bar.time;
      signals.push({
        time:       bar.time,
        price:      close,
        side:       signalSide(target, true),
        regime:     target > 0 ? "UP" : "DOWN",
        reason:     target > 0 ? "dema_cross_up" : "dema_cross_down",
        strength:   0.55,
        score:      clamp(Math.abs(score), 0, 1.5),
        confluence,
        wr:         Number.isFinite(wrVal) ? Math.round(wrVal) : null,
        volSurge:   Number.isFinite(volSurge[i])  ? Math.round(volSurge[i] * 100) / 100 : null
      });
    } else {
      pendingCount += 1;
    }

    // ── V2 FIX 2: When dynConfirm === 1, allow first bar to complete confirmation while retaining early event ──
    if (pendingCount >= dynConfirm && (dynConfirm === 1 || lastEarlyAt !== bar.time)) {
      signals.push({
        time:       bar.time,
        price:      close,
        side:       signalSide(pending, false),
        regime:     pending > 0 ? "UP" : "DOWN",
        reason:     `confirm_${dynConfirm}bar_c${confluence}`,
        strength:   0.6 + confluence * 0.1,
        score:      clamp(Math.abs(score), 0, 1.5),
        confluence,
        wr:         Number.isFinite(wrVal) ? Math.round(wrVal) : null,
        volSurge:   Number.isFinite(volSurge[i])  ? Math.round(volSurge[i] * 100) / 100 : null
      });
      regime       = pending;
      pending      = 0;
      pendingCount = 0;
    }
  }

  return signals;
}

export function computeSignals(bars, emaFast, aux, options = {}) {
  const version = String(options.version || options.algorithm || "").toLowerCase();
  if (version === "legacy_v1" || version === "v1") {
    return computeSignalsLegacyV1(bars, emaFast, aux, options);
  }
  return computeSignalsLegacyV2(bars, emaFast, aux, options);
}

export function backtestSignals(bars, signals, options = {}) {
  const costBps = Number(options.costBps || 8);
  const formal = signals.filter((signal) => signal.side === "B" || signal.side === "S");
  const byTime = new Map(bars.map((bar, index) => [bar.time, index]));
  const trades = [];

  let position = null;

  for (const signal of formal) {
    const index = byTime.get(signal.time);
    if (!Number.isInteger(index) || index + 1 >= bars.length) continue;
    const nextBar = bars[index + 1];
    const fill = Number(nextBar.open || nextBar.close);
    if (!Number.isFinite(fill)) continue;

    const side = signal.side === "B" ? "long" : "short";

    if (position && position.side !== side) {
      const gross = position.side === "long"
        ? (fill - position.entry) / position.entry
        : (position.entry - fill) / position.entry;
      const net = gross - (costBps / 10000) * 2;
      trades.push({
        side: position.side,
        entryTime: position.time,
        exitTime: nextBar.time,
        entry: position.entry,
        exit: fill,
        pnlPct: net
      });
      position = null;
    }

    if (!position) {
      position = { side, entry: fill, time: nextBar.time };
    }
  }

  if (position && bars.length) {
    const last = bars.at(-1);
    const exit = Number(last.close);
    if (Number.isFinite(exit)) {
      const gross = position.side === "long"
        ? (exit - position.entry) / position.entry
        : (position.entry - exit) / position.entry;
      const net = gross - (costBps / 10000);
      trades.push({
        side: position.side,
        entryTime: position.time,
        exitTime: last.time,
        entry: position.entry,
        exit,
        pnlPct: net,
        openEnded: true
      });
    }
  }

  const wins = trades.filter((trade) => trade.pnlPct > 0);
  const losses = trades.filter((trade) => trade.pnlPct <= 0);
  const avgWin = wins.length ? wins.reduce((sum, trade) => sum + trade.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((sum, trade) => sum + trade.pnlPct, 0) / losses.length : 0;
  const expectancy = trades.length
    ? trades.reduce((sum, trade) => sum + trade.pnlPct, 0) / trades.length
    : 0;

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const trade of trades) {
    equity *= 1 + trade.pnlPct;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1);
  }

  return {
    trades: trades.length,
    winRate: trades.length ? wins.length / trades.length : null,
    expectancy,
    avgWin,
    avgLoss,
    maxDrawdown,
    totalReturn: equity - 1,
    sample: trades.slice(-10)
  };
}
