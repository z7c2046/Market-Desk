/**
 * Long-Only Cash Backtesting Engine
 * Pure function core for trade simulation, mark-to-market daily close drawdown,
 * strict openPosition vs closedTrades separation, and fee/slippage modeling.
 */

import { round, wilderAtrSeries, dema } from "./indicators.js";
import { normalizeBars, assessDataQuality, formatEasternDate } from "./market-data.js";
import { computeRsiVolumeSignals, computeSwingPulseSignals } from "./rsi-volume-signals.js";
import { computeMajorTurnSignals } from "./major-turn-signals.js";
import { computeSignalsLegacyV1, computeSignalsLegacyV2 } from "./signals.js";
import { fetchTradingViewBars } from "./tradingview.js";
import { getCachedBenchmarkBars, buildSynchronizedRegimeMap } from "./regime.js";

/**
 * Returns YYYY-MM-DD for today in UTC.
 */
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * One year ago in YYYY-MM-DD.
 */
function oneYearAgoIso() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function parseDate(value, fallback) {
  const raw = String(value || fallback || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? raw : fallback;
}

function dateStart(date) {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
}

function dateEnd(date) {
  return Math.floor(Date.parse(`${date}T23:59:59Z`) / 1000);
}

/**
 * Pure function backtest execution core.
 * Receives normalized bars, signal events, and configuration.
 * Does NOT call any network services or snapshot functions.
 */
export function runLongOnlyBacktest({
  id = "strategy",
  name = "Strategy",
  bars = [],
  events = [],
  startTime,
  endTime,
  feeBps = 5,
  slippageBps = 5
}) {
  const feeRate = (Number.isFinite(Number(feeBps)) ? Math.max(0, Number(feeBps)) : 5) / 10000;
  const slipRate = (Number.isFinite(Number(slippageBps)) ? Math.max(0, Number(slippageBps)) : 5) / 10000;

  // Find index range for evaluation period
  const startIndex = bars.findIndex((bar) => Number(bar.time) >= startTime);
  const endIndex = bars.reduce((last, bar, index) => (Number(bar.time) <= endTime ? index : last), -1);

  if (startIndex < 0 || endIndex < startIndex) {
    return {
      id,
      name,
      totalReturn: null,
      finalEquity: 1,
      maxDrawdown: 0,
      trades: 0,
      winRate: null,
      expectancy: 0,
      avgWin: 0,
      avgLoss: 0,
      exposurePct: 0,
      closedTrades: [],
      openPosition: null,
      curve: []
    };
  }

  // Index bars by timestamp
  const byTime = new Map(bars.map((bar, index) => [Number(bar.time), index]));

  // Map events to fill bars (Next Valid Trading Day Open)
  // Event must have occurred at or after startTime
  const fillEvents = [];
  for (const ev of events) {
    const signalTime = Number(ev.time);
    const signalIndex = byTime.get(signalTime);
    if (!Number.isInteger(signalIndex) || signalIndex + 1 >= bars.length) continue;

    const fillIndex = signalIndex + 1;
    const fillBar = bars[fillIndex];
    const fillTime = Number(fillBar?.time);
    const rawOpen = Number(fillBar?.open);

    if (!Number.isFinite(fillTime) || !Number.isFinite(rawOpen) || rawOpen <= 0) continue;
    // Fill must occur within the study window [startIndex .. endIndex]
    if (fillIndex < startIndex || fillIndex > endIndex) continue;

    const action = ev.side === "B" || ev.side === "eB" || ev.side === "DV-B" || ev.side === "AV-B"
      ? "buy"
      : ev.side === "S" || ev.side === "eS" || ev.side === "DV-S"
        ? "sell"
        : null;

    if (!action) continue;

    fillEvents.push({
      action,
      side: ev.side,
      kind: ev.kind,
      signalTime,
      signalIndex,
      fillIndex,
      fillTime,
      rawOpen
    });
  }

  // Group events by fillIndex
  const eventsByFillIndex = new Map();
  for (const fe of fillEvents) {
    const list = eventsByFillIndex.get(fe.fillIndex) || [];
    list.push(fe);
    eventsByFillIndex.set(fe.fillIndex, list);
  }

  // ── Execute Simulation ─────────────────────────────────────────────────────
  let equity = 1.0;
  let position = null; // { shares, entryEquity, entryPrice, entryTime, entryIndex, side }
  let peakEquity = 1.0;
  let maxDrawdown = 0.0;
  let exposureBars = 0;

  const closedTrades = [];
  const curve = [];

  for (let i = startIndex; i <= endIndex; i += 1) {
    const bar = bars[i];
    const dayEvents = eventsByFillIndex.get(i) || [];

    // Conflict handling: if both buy and sell exist on the same bar
    const hasBuy = dayEvents.some((e) => e.action === "buy");
    const hasSell = dayEvents.some((e) => e.action === "sell");

    if (hasBuy && hasSell) {
      if (position) {
        // Position priority: exit to cash
        const fillPrice = bar.open * (1 - slipRate);
        const gross = position.shares * fillPrice;
        const fee = gross * feeRate;
        const net = gross - fee;
        const pnlPct = (net - position.entryEquity) / position.entryEquity;

        closedTrades.push({
          entrySide: position.side,
          exitSide: "conflict_sell",
          entryTime: position.entryTime,
          exitTime: bar.time,
          entryDate: formatEasternDate(position.entryTime),
          exitDate: formatEasternDate(bar.time),
          entryPrice: round(position.entryPrice, 4),
          exitPrice: round(fillPrice, 4),
          pnlPct: round(pnlPct, 6)
        });

        equity = net;
        position = null;
      }
      // If was cash, remain in cash
    } else if (hasSell && position) {
      // Execute Sell
      const fillPrice = bar.open * (1 - slipRate);
      const gross = position.shares * fillPrice;
      const fee = gross * feeRate;
      const net = gross - fee;
      const pnlPct = (net - position.entryEquity) / position.entryEquity;

      closedTrades.push({
        entrySide: position.side,
        exitSide: dayEvents[0].side,
        entryTime: position.entryTime,
        exitTime: bar.time,
        entryDate: formatEasternDate(position.entryTime),
        exitDate: formatEasternDate(bar.time),
        entryPrice: round(position.entryPrice, 4),
        exitPrice: round(fillPrice, 4),
        pnlPct: round(pnlPct, 6)
      });

      equity = net;
      position = null;
    } else if (hasBuy && !position) {
      // Execute Buy
      const fillPrice = bar.open * (1 + slipRate);
      const entryFee = equity * feeRate;
      const investable = equity - entryFee;
      const shares = investable / fillPrice;

      position = {
        shares,
        entryEquity: equity,
        entryPrice: fillPrice,
        entryTime: bar.time,
        entryIndex: i,
        side: dayEvents[0].side
      };
    }

    // Daily close mark-to-market equity
    const closePrice = Number(bar.close);
    const dayEquity = position && Number.isFinite(closePrice)
      ? position.shares * closePrice
      : equity;

    if (position) exposureBars += 1;

    peakEquity = Math.max(peakEquity, dayEquity);
    const dd = dayEquity / peakEquity - 1;
    maxDrawdown = Math.min(maxDrawdown, dd);

    curve.push({
      time: bar.time,
      date: formatEasternDate(bar.time),
      equity: round(dayEquity, 6)
    });
  }

  // Handle open position at end of study window
  let openPosition = null;
  let finalEquity = equity;

  if (position) {
    const lastBar = bars[endIndex];
    const markPrice = Number(lastBar.close);
    finalEquity = position.shares * markPrice;
    const unrealizedPnlPct = (finalEquity - position.entryEquity) / position.entryEquity;

    openPosition = {
      entrySide: position.side,
      entryTime: position.entryTime,
      entryDate: formatEasternDate(position.entryTime),
      entryPrice: round(position.entryPrice, 4),
      currentPrice: round(markPrice, 4),
      shares: round(position.shares, 4),
      unrealizedPnlPct: round(unrealizedPnlPct, 6)
    };
  }

  // ── Compute Statistics ─────────────────────────────────────────────────────
  const wins = closedTrades.filter((t) => t.pnlPct > 0);
  const losses = closedTrades.filter((t) => t.pnlPct <= 0);
  const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : null;
  const avgWin = wins.length ? wins.reduce((sum, t) => sum + t.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((sum, t) => sum + t.pnlPct, 0) / losses.length : 0;
  const expectancy = closedTrades.length
    ? closedTrades.reduce((sum, t) => sum + t.pnlPct, 0) / closedTrades.length
    : 0;

  const totalBars = endIndex - startIndex + 1;

  return {
    id,
    name,
    totalReturn: round(finalEquity - 1, 6),
    finalEquity: round(finalEquity, 6),
    maxDrawdown: round(maxDrawdown, 6),
    trades: closedTrades.length,
    winRate: winRate !== null ? round(winRate, 4) : null,
    expectancy: round(expectancy, 6),
    avgWin: round(avgWin, 6),
    avgLoss: round(avgLoss, 6),
    exposurePct: totalBars > 0 ? round(exposureBars / totalBars, 4) : 0,
    closedTrades,
    openPosition,
    sample: closedTrades.slice(-10),
    curve
  };
}

/**
 * Buy & Hold strategy:
 * Enters at first bar open * (1 + slip), holds until end of period, marked at close.
 */
export function backtestBuyAndHold({
  bars = [],
  startTime,
  endTime,
  feeBps = 5,
  slippageBps = 5
}) {
  const feeRate = (Number.isFinite(Number(feeBps)) ? Math.max(0, Number(feeBps)) : 5) / 10000;
  const slipRate = (Number.isFinite(Number(slippageBps)) ? Math.max(0, Number(slippageBps)) : 5) / 10000;

  const periodBars = bars.filter((b) => Number(b.time) >= startTime && Number(b.time) <= endTime);
  if (!periodBars.length) {
    return {
      id: "buy_hold",
      name: "Buy & Hold",
      totalReturn: null,
      finalEquity: 1,
      maxDrawdown: 0,
      trades: 0,
      winRate: null,
      expectancy: 0,
      exposurePct: 0,
      closedTrades: [],
      openPosition: null,
      curve: []
    };
  }

  const first = periodBars[0];
  const last = periodBars.at(-1);
  const entryPrice = Number(first.open) * (1 + slipRate);
  const entryFee = 1.0 * feeRate;
  const shares = (1.0 - entryFee) / entryPrice;

  let peak = 1.0;
  let maxDrawdown = 0.0;
  const curve = [];

  for (const bar of periodBars) {
    const mark = shares * Number(bar.close);
    peak = Math.max(peak, mark);
    maxDrawdown = Math.min(maxDrawdown, mark / peak - 1);
    curve.push({
      time: bar.time,
      date: formatEasternDate(bar.time),
      equity: round(mark, 6)
    });
  }

  const finalEquity = shares * Number(last.close);
  const totalReturn = finalEquity - 1;

  const openPosition = {
    entrySide: "buy",
    entryTime: first.time,
    entryDate: formatEasternDate(first.time),
    entryPrice: round(entryPrice, 4),
    currentPrice: round(Number(last.close), 4),
    shares: round(shares, 4),
    unrealizedPnlPct: round(totalReturn, 6)
  };

  return {
    id: "buy_hold",
    name: "Buy & Hold",
    totalReturn: round(totalReturn, 6),
    finalEquity: round(finalEquity, 6),
    maxDrawdown: round(maxDrawdown, 6),
    trades: 0,
    winRate: null,
    expectancy: 0,
    avgWin: 0,
    avgLoss: 0,
    exposurePct: 1.0,
    closedTrades: [],
    openPosition,
    sample: [],
    curve
  };
}

/**
 * Evaluates swing prediction effectiveness over 5, 10, and 20 bar observation windows.
 *
 * Metrics:
 * - 预警命中率 (Warning Hit Rate)
 * - 大波动覆盖率 (Coverage of Large Moves)
 * - 提前量与滞后量 (Lead / Lag Bars)
 * - 误报频率 (False Alarm Rate per month)
 * - 不利波动 (MAE, Maximum Adverse Excursion)
 */
export function evaluateSwingAlerts({
  bars = [],
  signals = [],
  windows = [5, 10, 20],
  atrMultiplier = 1.5,
  minPctThreshold = 0.04,
  startIndex = 0,
  endIndex = null
}) {
  const actualEndIndex = Number.isInteger(endIndex) && endIndex >= 0
    ? Math.min(bars.length - 1, endIndex)
    : bars.length - 1;
  const actualStartIndex = Number.isInteger(startIndex) && startIndex >= 0
    ? Math.min(actualEndIndex, startIndex)
    : 0;

  if (!Array.isArray(bars) || bars.length < 5 || !Array.isArray(signals) || !signals.length) {
    return {
      totalAlerts: 0,
      totalSignals: 0,
      clustersCount: 0,
      byWindow: {},
      majorMoveCoverage: null,
      falseAlarmRate: null
    };
  }

  const atr = wilderAtrSeries(bars, 14);
  const byTime = new Map(bars.map((b, i) => [Number(b.time), i]));

  // 1. Filter directional signals
  const directional = signals.filter((s) =>
    s.direction === "bullish" ||
    s.direction === "bearish" ||
    (s.side && s.side.includes("B")) ||
    (s.side && s.side.includes("S"))
  );

  // 2. Cluster adjacent alerts within 3 bars in the same direction
  const allClusters = [];
  let currentCluster = null;

  for (const sig of directional) {
    const idx = byTime.get(Number(sig.time));
    if (!Number.isInteger(idx)) continue;

    const dir = sig.direction || (sig.side.includes("B") ? "bullish" : "bearish");
    const barClose = Number(bars[idx].close);
    const barAtr = Number(atr[idx]) || Math.max(1e-4, barClose * 0.02);

    if (
      currentCluster &&
      currentCluster.direction === dir &&
      idx - currentCluster.anchorIndex <= 3
    ) {
      currentCluster.signals.push(sig);
      currentCluster.lastIndex = idx;
      if (sig.invalidationLevel != null) {
        currentCluster.invalidationLevel = currentCluster.invalidationLevel != null
          ? (dir === "bullish"
              ? Math.max(currentCluster.invalidationLevel, sig.invalidationLevel)
              : Math.min(currentCluster.invalidationLevel, sig.invalidationLevel))
          : sig.invalidationLevel;
      }
    } else {
      currentCluster = {
        direction: dir,
        anchorIndex: idx,
        lastIndex: idx,
        anchorTime: Number(bars[idx].time),
        anchorDate: formatEasternDate(bars[idx].time),
        anchorPrice: barClose,
        anchorAtr: barAtr,
        kind: sig.kind || "unknown",
        stage: sig.stage || "confirmed",
        invalidationLevel: sig.invalidationLevel != null ? sig.invalidationLevel : null,
        signals: [sig]
      };
      allClusters.push(currentCluster);
    }
  }

  // Filter clusters whose anchor is within the selected evaluation window [actualStartIndex .. actualEndIndex]
  const clusters = allClusters.filter((c) =>
    c.anchorIndex >= actualStartIndex && c.anchorIndex <= actualEndIndex
  );

  // 3. Multi-Window Evaluation
  const byWindow = {};
  for (const W of windows) {
    let favorableTouchHits = 0;
    let firstTouchHits = 0;
    let evaluatedClusters = 0;
    let pendingClusters = 0;
    let sumMfePct = 0;
    let sumMfeAtr = 0;
    let sumMaePct = 0;
    let sumMaeAtr = 0;

    const byDirection = {
      bullish: { evaluated: 0, firstTouchHits: 0, favorableTouchHits: 0, sumMfePct: 0, sumMaePct: 0 },
      bearish: { evaluated: 0, firstTouchHits: 0, favorableTouchHits: 0, sumMfePct: 0, sumMaePct: 0 }
    };
    const byStage = {
      confirmed: { evaluated: 0, firstTouchHits: 0, favorableTouchHits: 0 },
      candidate: { evaluated: 0, firstTouchHits: 0, favorableTouchHits: 0 }
    };
    const byKind = {};

    for (const cluster of clusters) {
      const startIdx = cluster.anchorIndex;
      // If remaining bars < W, classify as pending / incomplete
      if (bars.length - 1 - startIdx < W) {
        pendingClusters += 1;
        continue;
      }

      const endIdx = startIdx + W;
      evaluatedClusters += 1;

      const anchorPrice = cluster.anchorPrice;
      const anchorAtr = cluster.anchorAtr;
      const dir = cluster.direction;
      const stage = cluster.stage === "candidate" ? "candidate" : "confirmed";
      const kind = cluster.kind;

      if (!byKind[kind]) {
        byKind[kind] = { evaluated: 0, firstTouchHits: 0, favorableTouchHits: 0 };
      }
      byKind[kind].evaluated += 1;
      byStage[stage].evaluated += 1;
      byDirection[dir].evaluated += 1;

      let maxHigh = -Infinity;
      let minLow = Infinity;

      // Targets and stops
      const targetDelta = Math.max(anchorPrice * minPctThreshold, anchorAtr * atrMultiplier);
      const isBull = dir === "bullish";
      const targetPrice = isBull ? anchorPrice + targetDelta : anchorPrice - targetDelta;
      const stopPrice = cluster.invalidationLevel != null
        ? cluster.invalidationLevel
        : (isBull ? anchorPrice - anchorAtr * atrMultiplier : anchorPrice + anchorAtr * atrMultiplier);

      let firstTouchHit = false;
      let resolvedFirstTouch = false;
      let favorableTouch = false;

      for (let j = startIdx + 1; j <= endIdx; j += 1) {
        const h = Number(bars[j].high);
        const l = Number(bars[j].low);
        if (h > maxHigh) maxHigh = h;
        if (l < minLow) minLow = l;

        if (isBull) {
          const hitTarget = h >= targetPrice;
          const hitStop = l <= stopPrice;

          if (hitTarget) favorableTouch = true;

          if (!resolvedFirstTouch) {
            if (hitTarget && hitStop) {
              // Same day both touched: conservative stance -> stopped out first
              resolvedFirstTouch = true;
              firstTouchHit = false;
            } else if (hitTarget) {
              resolvedFirstTouch = true;
              firstTouchHit = true;
            } else if (hitStop) {
              resolvedFirstTouch = true;
              firstTouchHit = false;
            }
          }
        } else {
          const hitTarget = l <= targetPrice;
          const hitStop = h >= stopPrice;

          if (hitTarget) favorableTouch = true;

          if (!resolvedFirstTouch) {
            if (hitTarget && hitStop) {
              resolvedFirstTouch = true;
              firstTouchHit = false;
            } else if (hitTarget) {
              resolvedFirstTouch = true;
              firstTouchHit = true;
            } else if (hitStop) {
              resolvedFirstTouch = true;
              firstTouchHit = false;
            }
          }
        }
      }

      // Guaranteed non-negative MFE and MAE
      const mfe = isBull ? Math.max(0, maxHigh - anchorPrice) : Math.max(0, anchorPrice - minLow);
      const mae = isBull ? Math.max(0, anchorPrice - minLow) : Math.max(0, maxHigh - anchorPrice);

      const mfePct = mfe / anchorPrice;
      const maePct = mae / anchorPrice;
      const mfeAtr = mfe / anchorAtr;
      const maeAtr = mae / anchorAtr;

      sumMfePct += mfePct;
      sumMfeAtr += mfeAtr;
      sumMaePct += maePct;
      sumMaeAtr += maeAtr;

      byDirection[dir].sumMfePct += mfePct;
      byDirection[dir].sumMaePct += maePct;

      if (favorableTouch) {
        favorableTouchHits += 1;
        byDirection[dir].favorableTouchHits += 1;
        byStage[stage].favorableTouchHits += 1;
        byKind[kind].favorableTouchHits += 1;
      }

      if (firstTouchHit) {
        firstTouchHits += 1;
        byDirection[dir].firstTouchHits += 1;
        byStage[stage].firstTouchHits += 1;
        byKind[kind].firstTouchHits += 1;
      }
    }

    const calcRate = (hits, total) => total > 0 ? round(hits / total, 4) : null;

    byWindow[W] = {
      windowBars: W,
      evaluatedClusters,
      pendingClusters,
      hits: firstTouchHits,
      firstHits: firstTouchHits,
      favorableHits: favorableTouchHits,
      firstTouchHits,
      firstTouchRate: calcRate(firstTouchHits, evaluatedClusters),
      favorableTouchHits,
      favorableTouchRate: calcRate(favorableTouchHits, evaluatedClusters),
      hitRate: calcRate(firstTouchHits, evaluatedClusters), // Primary conservative hit rate
      avgMfePct: evaluatedClusters > 0 ? round(sumMfePct / evaluatedClusters, 4) : 0,
      avgMfeAtr: evaluatedClusters > 0 ? round(sumMfeAtr / evaluatedClusters, 2) : 0,
      avgMaePct: evaluatedClusters > 0 ? round(sumMaePct / evaluatedClusters, 4) : 0,
      avgMaeAtr: evaluatedClusters > 0 ? round(sumMaeAtr / evaluatedClusters, 2) : 0,
      byDirection: {
        bullish: {
          evaluated: byDirection.bullish.evaluated,
          firstTouchRate: calcRate(byDirection.bullish.firstTouchHits, byDirection.bullish.evaluated),
          favorableTouchRate: calcRate(byDirection.bullish.favorableTouchHits, byDirection.bullish.evaluated),
          avgMfePct: byDirection.bullish.evaluated > 0 ? round(byDirection.bullish.sumMfePct / byDirection.bullish.evaluated, 4) : 0,
          avgMaePct: byDirection.bullish.evaluated > 0 ? round(byDirection.bullish.sumMaePct / byDirection.bullish.evaluated, 4) : 0
        },
        bearish: {
          evaluated: byDirection.bearish.evaluated,
          firstTouchRate: calcRate(byDirection.bearish.firstTouchHits, byDirection.bearish.evaluated),
          favorableTouchRate: calcRate(byDirection.bearish.favorableTouchHits, byDirection.bearish.evaluated),
          avgMfePct: byDirection.bearish.evaluated > 0 ? round(byDirection.bearish.sumMfePct / byDirection.bearish.evaluated, 4) : 0,
          avgMaePct: byDirection.bearish.evaluated > 0 ? round(byDirection.bearish.sumMaePct / byDirection.bearish.evaluated, 4) : 0
        }
      },
      byStage: {
        confirmed: {
          evaluated: byStage.confirmed.evaluated,
          firstTouchRate: calcRate(byStage.confirmed.firstTouchHits, byStage.confirmed.evaluated),
          favorableTouchRate: calcRate(byStage.confirmed.favorableTouchHits, byStage.confirmed.evaluated)
        },
        candidate: {
          evaluated: byStage.candidate.evaluated,
          firstTouchRate: calcRate(byStage.candidate.firstTouchHits, byStage.candidate.evaluated),
          favorableTouchRate: calcRate(byStage.candidate.favorableTouchHits, byStage.candidate.evaluated)
        }
      },
      byKind: Object.fromEntries(
        Object.entries(byKind).map(([k, v]) => [
          k,
          {
            evaluated: v.evaluated,
            firstTouchRate: calcRate(v.firstTouchHits, v.evaluated),
            favorableTouchRate: calcRate(v.favorableTouchHits, v.evaluated)
          }
        ])
      )
    };
  }

  // 4. Identify Major Swings within [actualStartIndex .. actualEndIndex]
  const majorSwings = [];
  const checkLookback = 10;
  let sIdx = Math.max(checkLookback, actualStartIndex + checkLookback);
  const swingLimit = Math.min(bars.length, actualEndIndex + 1);

  while (sIdx < swingLimit) {
    const pStart = Number(bars[sIdx - checkLookback].close);
    const pEnd = Number(bars[sIdx].close);
    const currAtr = Number(atr[sIdx - checkLookback]) || (pStart * 0.02);
    const move = pEnd - pStart;
    const moveAtr = Math.abs(move) / currAtr;
    const movePct = Math.abs(move) / pStart;

    if (moveAtr >= 2.0 || movePct >= 0.07) {
      majorSwings.push({
        startIndex: sIdx - checkLookback,
        endIndex: sIdx,
        direction: move > 0 ? "bullish" : "bearish",
        movePct: round(movePct, 4),
        moveAtr: round(moveAtr, 2)
      });
      sIdx += checkLookback;
    } else {
      sIdx += 2;
    }
  }

  let capturedSwings = 0;
  let totalLeadBars = 0;
  let capturedWithLead = 0;

  for (const swing of majorSwings) {
    const matched = clusters.find((c) =>
      c.direction === swing.direction &&
      c.anchorIndex >= swing.startIndex - 4 &&
      c.anchorIndex <= swing.startIndex + 4
    );

    if (matched) {
      capturedSwings += 1;
      const lead = swing.startIndex - matched.anchorIndex;
      totalLeadBars += lead;
      capturedWithLead += 1;
    }
  }

  const coveragePct = majorSwings.length > 0 ? round(capturedSwings / majorSwings.length, 4) : null;
  const avgLeadBars = capturedWithLead > 0 ? round(totalLeadBars / capturedWithLead, 1) : 0;

  // Monthly False Alarm Frequency
  const tenDayEval = byWindow[10];
  const totalClusters = clusters.length;
  const totalMonths = Math.max(1, (actualEndIndex - actualStartIndex + 1) / 21);
  const falseAlerts = tenDayEval ? (tenDayEval.evaluatedClusters - tenDayEval.firstTouchHits) : 0;
  const alertsPerMonth = round(totalClusters / totalMonths, 2);
  const falseAlertsPerMonth = round(falseAlerts / totalMonths, 2);

  return {
    totalSignals: clusters.reduce((sum, c) => sum + c.signals.length, 0),
    clustersCount: totalClusters,
    byWindow,
    majorMoveCoverage: {
      totalMajorSwings: majorSwings.length,
      capturedSwings,
      coveragePct,
      avgLeadBars
    },
    falseAlarmRate: {
      totalAlerts: totalClusters,
      falseAlerts,
      alertsPerMonth,
      falseAlertsPerMonth
    }
  };
}

/**
 * Compare all strategies on the same normalized bars and parameters.
 */
export async function compareStrategyBacktests(query = {}) {
  const options = query;
  const symbol = String(options.symbol || "SNDK").trim().toUpperCase();
  const tf = "1d";
  const startDate = parseDate(options.start, oneYearAgoIso());
  const endDate = parseDate(options.end, todayIso());
  const startTime = dateStart(startDate);
  const endTime = dateEnd(endDate);
  const feeBps = Number.isFinite(Number(options.feeBps)) ? Number(options.feeBps) : 5;
  const slippageBps = Number.isFinite(Number(options.slippageBps)) ? Number(options.slippageBps) : 5;
  const limit = Math.max(260, Math.min(3000, Number(options.limit || 900)));
  const algorithm = String(options.algorithm || "swing_pulse_v1").trim().toLowerCase();

  // Fetch raw daily bars from TradingView
  const tv = await fetchTradingViewBars({ symbol, tf, limit });
  const allBars = normalizeBars(tv.bars);
  const completedBars = allBars.filter((b) => b.isCompleted);
  const quality = assessDataQuality(allBars);

  // Fetch benchmark bars (QQQ / SMH) for sector/market regime filter
  const { qqqBars, smhBars } = await getCachedBenchmarkBars({ limit: completedBars.length });
  const regimeMap = buildSynchronizedRegimeMap(completedBars, qqqBars, smhBars);

  // Compute indicators on all completed bars
  const closes = completedBars.map((b) => Number(b.close));
  const demaFast = dema(closes, 14);
  const demaSlow = dema(closes, 30);

  // 1. Swing Pulse (重构版 - 启动预警 + 转弱预警 + 跟踪止损 + 自适应背离)
  const swingPulseResult = computeSwingPulseSignals(completedBars, { symbol, regimeMap, divergenceMode: "adaptive" });
  const swingPulseEvents = swingPulseResult.signals.filter((s) => s.stage === "confirmed");

  // 2. RSI + Volume V1 基准
  const rsiVolResult = computeRsiVolumeSignals(completedBars, { symbol, divergenceMode: "strict" });
  const rsiVolEvents = rsiVolResult.signals.filter((s) => s.stage === "confirmed");

  // 3. Legacy V1 signals (B/S and eB/eS)
  const legacyV1Signals = computeSignalsLegacyV1(completedBars, demaFast, demaSlow);
  const legacyV1ConfirmedEvents = legacyV1Signals.filter((s) => s.side === "B" || s.side === "S");
  const legacyV1EarlyEvents = legacyV1Signals.filter((s) => s.side === "eB" || s.side === "eS");

  // 4. Legacy V2 signals (fixed B/S)
  const legacyV2Signals = computeSignalsLegacyV2(completedBars, demaFast, demaSlow);
  const legacyV2ConfirmedEvents = legacyV2Signals.filter((s) => s.side === "B" || s.side === "S");

  // 5. Major Turn V1 signals (macro inflection only)
  const majorTurnResult = computeMajorTurnSignals(completedBars, { symbol });
  const majorTurnConfirmedEvents = majorTurnResult.signals
    .filter((s) => (s.side === "B" || s.side === "S") && s.actionable !== false)
    .map((s) => ({ time: s.time, side: s.side }));

  // Run backtests using the pure execution core
  const stratSwingPulse = runLongOnlyBacktest({
    id: "swing_pulse_v1",
    name: "波段启动+转弱预警 (重构版)",
    bars: completedBars,
    events: swingPulseEvents,
    startTime,
    endTime,
    feeBps,
    slippageBps
  });

  const stratRsiVol = runLongOnlyBacktest({
    id: "rsi_volume_v1",
    name: "RSI + 成交量基准",
    bars: completedBars,
    events: rsiVolEvents,
    startTime,
    endTime,
    feeBps,
    slippageBps
  });

  const stratMajorTurn = runLongOnlyBacktest({
    id: "major_turn_v1",
    name: "重要顶底确认 (V1)",
    bars: completedBars,
    events: majorTurnConfirmedEvents,
    startTime,
    endTime,
    feeBps,
    slippageBps
  });

  const stratLegacyV2 = runLongOnlyBacktest({
    id: "legacy_v2_confirmed",
    name: "趋势修正版 B/S",
    bars: completedBars,
    events: legacyV2ConfirmedEvents,
    startTime,
    endTime,
    feeBps,
    slippageBps
  });

  const stratLegacyV1 = runLongOnlyBacktest({
    id: "legacy_v1_confirmed",
    name: "原版 B/S 基准",
    bars: completedBars,
    events: legacyV1ConfirmedEvents,
    startTime,
    endTime,
    feeBps,
    slippageBps
  });

  const stratLegacyV1Early = runLongOnlyBacktest({
    id: "legacy_v1_early",
    name: "原版 eB/eS 基准",
    bars: completedBars,
    events: legacyV1EarlyEvents,
    startTime,
    endTime,
    feeBps,
    slippageBps
  });

  const stratBnH = backtestBuyAndHold({
    bars: completedBars,
    startTime,
    endTime,
    feeBps,
    slippageBps
  });

  // Compute indices corresponding to requested time range
  const startIndex = completedBars.findIndex((bar) => Number(bar.time) >= startTime);
  const endIndex = completedBars.reduce((last, bar, index) => (Number(bar.time) <= endTime ? index : last), -1);

  // Evaluate swing prediction effectiveness over the selected range
  const swingEvaluation = evaluateSwingAlerts({
    bars: completedBars,
    signals: swingPulseResult.signals,
    windows: [5, 10, 20],
    startIndex: startIndex >= 0 ? startIndex : 0,
    endIndex: endIndex >= 0 ? endIndex : completedBars.length - 1
  });

  const rsiVolEvaluation = evaluateSwingAlerts({
    bars: completedBars,
    signals: rsiVolResult.signals,
    windows: [5, 10, 20],
    startIndex: startIndex >= 0 ? startIndex : 0,
    endIndex: endIndex >= 0 ? endIndex : completedBars.length - 1
  });

  const majorTurnEvaluation = evaluateSwingAlerts({
    bars: completedBars,
    signals: majorTurnResult.signals,
    windows: [5, 10, 20],
    startIndex: startIndex >= 0 ? startIndex : 0,
    endIndex: endIndex >= 0 ? endIndex : completedBars.length - 1
  });

  stratSwingPulse.evaluation = swingEvaluation;
  stratRsiVol.evaluation = rsiVolEvaluation;
  stratMajorTurn.evaluation = majorTurnEvaluation;

  const strategies = [
    stratSwingPulse,
    stratMajorTurn,
    stratRsiVol,
    stratLegacyV2,
    stratLegacyV1,
    stratLegacyV1Early,
    stratBnH
  ].sort((a, b) => {
    const retA = Number.isFinite(Number(a?.totalReturn)) ? Number(a.totalReturn) : -Infinity;
    const retB = Number.isFinite(Number(b?.totalReturn)) ? Number(b.totalReturn) : -Infinity;
    return retB - retA;
  });

  const best = strategies[0] || null;

  const periodBars = completedBars.filter((b) => Number(b.time) >= startTime && Number(b.time) <= endTime);

  return {
    ok: true,
    symbol,
    tvSymbol: tv.symbol,
    tf: "1d",
    tfLabel: "1D",
    startDate,
    endDate,
    actualStartDate: periodBars[0]?.date || null,
    actualEndDate: periodBars.at(-1)?.date || null,
    bars: periodBars.length,
    feeBps,
    slippageBps,
    costBps: feeBps + slippageBps,
    startingPosition: "cash",
    fillModel: "signal_next_bar_open",
    bestStrategyId: best?.id || null,
    bestStrategyName: best?.name || null,
    bestReturn: best?.totalReturn ?? null,
    strategies,
    swingEvaluation: algorithm === "major_turn_v1" ? majorTurnEvaluation : (algorithm === "rsi_volume_v1" ? rsiVolEvaluation : swingEvaluation),
    dataQuality: quality,
    meta: {
      generatedAt: new Date().toISOString(),
      feeModel: `${feeBps} bps/leg commission, ${slippageBps} bps/leg slippage`,
      drawdownModel: "Mark-to-market daily close",
      note: "Pure signal comparison without discretionary stops. Long-only cash execution."
    }
  };
}
