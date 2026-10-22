/**
 * Swing Pulse & RSI-Volume Inflection Signal Engine (swing_pulse_v1 & rsi_volume_v1)
 *
 * Architecture:
 * - rsi_volume_v1: Strict baseline running ONLY Branch A (Top divergence), Branch B (Bottom divergence),
 *   and Branch C (Oversold volume reversal). Never emits new branches.
 * - swing_pulse_v1: Complete swing pulse engine (5~20 trading days) with:
 *   - Branch D: 强势整理后启动 (Consolidation Breakout eB & B)
 *   - Branch D-Alt: 放量动能突破 (Momentum Breakout B without consolidation)
 *   - Branch E: 上涨趋势中的回调转强 (Pullback Reversal B near 20 SMA with volume contraction)
 *   - Branch F: 独立转弱预警 (Weakness Warning eS on 5-day low break + volume surge + low CLV)
 *   - Branch G: 风险确认与 ATR 动态跟踪止损 (Risk Confirmation S on invalidation or ratchet stop break)
 *   - Divergence: Adaptive (core divergence + confluence scoring) vs Strict mode
 *   - Position state: No pyramiding; risk trailing line strictly ratchets UPWARDS only, never decreases.
 */

import {
  rsiSeries,
  wilderAtrSeries,
  rvol20Series,
  clvSeries,
  volumeMaSeries,
  smaSeries,
  meanAmplitudeSeries,
  highestHighSeries,
  lowestLowSeries,
  lowestLow,
  round
} from "./indicators.js";
import { findPivots, pairPivot } from "./pivots.js";
import {
  ALGORITHMS,
  RSI_VOLUME_V1_CONFIG,
  SWING_PULSE_V1_CONFIG
} from "./strategy-config.js";

function calcAvgVolume(bars, p) {
  if (p < 2 || p >= bars.length) return null;
  const v0 = Number(bars[p - 2]?.volume);
  const v1 = Number(bars[p - 1]?.volume);
  const v2 = Number(bars[p]?.volume);
  if (!Number.isFinite(v0) || v0 <= 0 ||
      !Number.isFinite(v1) || v1 <= 0 ||
      !Number.isFinite(v2) || v2 <= 0) {
    return null;
  }
  return (v0 + v1 + v2) / 3;
}

function runSignalEngine(bars, options = {}) {
  const isSwingPulse = options.algorithm === ALGORITHMS.SWING_PULSE_V1;
  const defaults = isSwingPulse ? SWING_PULSE_V1_CONFIG : RSI_VOLUME_V1_CONFIG;
  const config = { ...defaults, ...options };
  const symbol = String(options.symbol || "SYM").toUpperCase();

  if (!Array.isArray(bars) || bars.length < config.minHistoryBars) {
    return {
      algorithm: config.algorithm,
      version: config.version,
      barsCount: Array.isArray(bars) ? bars.length : 0,
      signalEvents: [],
      activeSetups: [],
      signals: [],
      series: {
        rsi: [],
        wilderAtr: [],
        rvol: [],
        clv: [],
        volumeMa: [],
        sma50: [],
        sma20: [],
        trailingStop: [],
        volume: []
      }
    };
  }

  // ── 1. Indicator Series ────────────────────────────────────────────────────
  const closes = bars.map((b) => Number(b.close));
  const rsi = rsiSeries(bars, config.rsiPeriod);
  const atr = wilderAtrSeries(bars, config.atrPeriod);
  const rvol = rvol20Series(bars, config.rvolPeriod);
  const clv = clvSeries(bars);
  const volumeMa = volumeMaSeries(bars, 20);
  const sma50 = smaSeries(closes, config.consolidationTrendSma || 50);
  const sma20 = smaSeries(closes, config.pullbackSma || 20);
  const meanAmp5 = meanAmplitudeSeries(bars, config.consolidationShortAmpBars || 5);
  const meanAmp20 = meanAmplitudeSeries(bars, config.consolidationLongAmpBars || 20);
  const meanVol5 = volumeMaSeries(bars, config.consolidationShortVolBars || 5);

  const past20Highs = highestHighSeries(bars, config.consolidationLookback || 20, true);
  const past5Lows = lowestLowSeries(bars, config.weaknessBreakoutBars || 5, true);
  const past3Highs = highestHighSeries(bars, config.pullbackBreakoutBars || 3, true);

  // ── 2. Pivot Detection ─────────────────────────────────────────────────────
  const { highs, lows } = findPivots(bars, {
    leftBars: config.pivotLeftBars,
    rightBars: config.pivotRightBars
  });

  const highsByConfirmedIndex = new Map();
  for (const h of highs) {
    const list = highsByConfirmedIndex.get(h.confirmedIndex) || [];
    list.push(h);
    highsByConfirmedIndex.set(h.confirmedIndex, list);
  }

  const lowsByConfirmedIndex = new Map();
  for (const l of lows) {
    const list = lowsByConfirmedIndex.get(l.confirmedIndex) || [];
    list.push(l);
    lowsByConfirmedIndex.set(l.confirmedIndex, list);
  }

  // ── 3. State Tracking ──────────────────────────────────────────────────────
  const activeBranchA = []; // Top divergence setups
  const activeBranchB = []; // Bottom divergence setups
  let activeBranchC = null;  // Oversold volume stabilization
  let branchCCooldownUntil = -1;

  const activeBranchLaunch = []; // Consolidation breakout candidate setups

  // Trailing stop tracking for open positions: NO PYRAMIDING, RISK LINE STRICTLY NON-DECREASING
  let activePosition = null; // { entryIndex, entryPrice, highestClose, trailingStop, invalidationLevel }
  const trailingStopSeries = new Array(bars.length).fill(null);

  let lastWeaknessWarningBar = -10;
  let lastLaunchWatchBar = -10;

  const completedEvents = [];
  const chartSignals = [];

  const regimeMap = options.regimeMap instanceof Map ? options.regimeMap : null;

  function onPositionBuyConfirmed({ barIndex, barClose, currentAtr, invalidationLevel, atrTrailingMult }) {
    if (!isSwingPulse) return;
    const initialStop = Math.max(
      Number.isFinite(invalidationLevel) ? invalidationLevel : 0,
      barClose - atrTrailingMult * currentAtr
    );

    if (!activePosition) {
      activePosition = {
        entryIndex: barIndex,
        entryPrice: barClose,
        highestClose: barClose,
        trailingStop: round(initialStop, 4),
        invalidationLevel: Number.isFinite(invalidationLevel) ? round(invalidationLevel, 4) : null
      };
    } else {
      // Already holding: Do NOT reset entryIndex, entryPrice or highestClose!
      if (barClose > activePosition.highestClose) {
        activePosition.highestClose = barClose;
      }
      // Trailing stop strictly ONLY ratchets upwards, never decreases!
      activePosition.trailingStop = Math.max(activePosition.trailingStop, round(initialStop, 4));
      if (Number.isFinite(invalidationLevel)) {
        activePosition.invalidationLevel = activePosition.invalidationLevel !== null
          ? Math.max(activePosition.invalidationLevel, round(invalidationLevel, 4))
          : round(invalidationLevel, 4);
      }
    }
  }

  // ── 4. Chronological Simulation Loop (Strict No Lookahead) ─────────────────
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    const barOpen = Number(bar.open);
    const barClose = Number(bar.close);
    const barLow = Number(bar.low);
    const barHigh = Number(bar.high);
    const barTime = Number(bar.time);
    const currentRsi = Number(rsi[i]);
    const prevRsi = Number(rsi[i - 1]);
    const currentAtr = Number(atr[i]);
    const currentRvol = Number(rvol[i]);
    const currentClv = Number(clv[i]);

    // Regime on bar i
    const barRegime = regimeMap?.get(barTime);
    const regimeStatus = barRegime?.regime || "neutral";
    // Weak regime filter only applies if regimeFilterEnabled is true AND regime is explicitly bearish (not unknown)
    const isWeakRegime = config.regimeFilterEnabled !== false && regimeStatus === "bearish";
    const baseBreakoutRvol = Number.isFinite(Number(config.consolidationBreakoutRvol))
      ? Number(config.consolidationBreakoutRvol)
      : 1.5;
    const reqBreakoutRvol = isWeakRegime ? Math.max(baseBreakoutRvol, 1.8) : baseBreakoutRvol;

    let exitedOnBar = false;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4A. EVALUATE ACTIVE CANDIDATES (Invalidation checked before Confirmation)
    // ─────────────────────────────────────────────────────────────────────────

    // --- Branch A (Top Divergence) ---
    for (let k = activeBranchA.length - 1; k >= 0; k -= 1) {
      const setup = activeBranchA[k];

      if (barClose > setup.invalidationLevel) {
        setup.stage = "invalidated";
        setup.invalidatedAt = barTime;
        setup.invalidatedIndex = i;
        completedEvents.push({ ...setup });
        activeBranchA.splice(k, 1);
        continue;
      }

      if (Number.isFinite(currentRsi) && Number.isFinite(prevRsi) &&
          barClose < setup.triggerLevel && currentRsi < prevRsi) {
        setup.stage = "confirmed";
        setup.confirmedAt = barTime;
        setup.confirmedIndex = i;
        completedEvents.push({ ...setup });

        chartSignals.push({
          id: `${setup.id}_confirm`,
          setupId: setup.id,
          time: barTime,
          price: barClose,
          side: "DV-S",
          direction: "bearish",
          stage: "confirmed",
          kind: setup.kind,
          reason: "top_divergence_confirmed",
          triggerLevel: setup.triggerLevel,
          invalidationLevel: setup.invalidationLevel,
          evidence: setup.evidence
        });

        activeBranchA.splice(k, 1);
        continue;
      }

      if (i >= setup.windowEndIndex) {
        setup.stage = "expired";
        setup.expiredAt = barTime;
        setup.expiredIndex = i;
        completedEvents.push({ ...setup });
        activeBranchA.splice(k, 1);
      }
    }

    // --- Branch B (Bottom Divergence) ---
    for (let k = activeBranchB.length - 1; k >= 0; k -= 1) {
      const setup = activeBranchB[k];

      if (barLow < setup.invalidationLevel) {
        setup.stage = "invalidated";
        setup.invalidatedAt = barTime;
        setup.invalidatedIndex = i;
        completedEvents.push({ ...setup });
        activeBranchB.splice(k, 1);
        continue;
      }

      if (Number.isFinite(currentRsi) && Number.isFinite(prevRsi) &&
          barClose > setup.triggerLevel && currentRsi > 30 && currentRsi > prevRsi) {
        setup.stage = "confirmed";
        setup.confirmedAt = barTime;
        setup.confirmedIndex = i;
        completedEvents.push({ ...setup });

        chartSignals.push({
          id: `${setup.id}_confirm`,
          setupId: setup.id,
          time: barTime,
          price: barClose,
          side: "B",
          direction: "bullish",
          stage: "confirmed",
          kind: setup.kind,
          reason: "bottom_divergence_confirmed",
          triggerLevel: setup.triggerLevel,
          invalidationLevel: setup.invalidationLevel,
          evidence: setup.evidence
        });

        if (Number.isFinite(currentAtr) && currentAtr > 0 && !exitedOnBar) {
          onPositionBuyConfirmed({
            barIndex: i,
            barClose,
            currentAtr,
            invalidationLevel: setup.invalidationLevel,
            atrTrailingMult: config.atrTrailingMult || 3.0
          });
        }

        activeBranchB.splice(k, 1);
        continue;
      }

      if (i >= setup.windowEndIndex) {
        setup.stage = "expired";
        setup.expiredAt = barTime;
        setup.expiredIndex = i;
        completedEvents.push({ ...setup });
        activeBranchB.splice(k, 1);
      }
    }

    // --- Branch C Active State Check ---
    if (activeBranchC) {
      const setup = activeBranchC;

      if (barLow < setup.invalidationLevel) {
        setup.stage = "invalidated";
        setup.invalidatedAt = barTime;
        setup.invalidatedIndex = i;
        completedEvents.push({ ...setup });
        activeBranchC = null;
        branchCCooldownUntil = i + 3;
      } else if (setup.stageStep === 1) {
        const daysSinceT0 = i - setup.t0Index;

        if (daysSinceT0 >= 2 && daysSinceT0 <= 3) {
          let heldLows = true;
          for (let m = setup.t0Index + 1; m <= i; m += 1) {
            if (Number(bars[m]?.low) < setup.invalidationLevel) {
              heldLows = false;
              break;
            }
          }

          const condClose = barClose > setup.C0;
          const condClv = Number.isFinite(currentClv) && currentClv >= config.clvThreshold;
          const condRsiBounce = Number.isFinite(currentRsi) && currentRsi >= setup.evidence.rsi0 + 3;

          if (heldLows && condClose && condClv && condRsiBounce) {
            setup.stageStep = 2;
            setup.sIndex = i;
            setup.evidence.absorptionMet = true;
            setup.evidence.sClose = round(barClose, 4);
            setup.evidence.sClv = round(currentClv, 3);
            setup.evidence.sRsi = round(currentRsi, 2);
            setup.stage3WindowEndIndex = i + 7;

            // Immediate confirmation check on s bar
            if (barClose > setup.H0 && currentRsi > 30 && currentRsi > prevRsi) {
              setup.stage = "confirmed";
              setup.confirmedAt = barTime;
              setup.confirmedIndex = i;
              completedEvents.push({ ...setup });

              chartSignals.push({
                id: `${setup.id}_confirm`,
                setupId: setup.id,
                time: barTime,
                price: barClose,
                side: "B",
                direction: "bullish",
                stage: "confirmed",
                kind: setup.kind,
                reason: "oversold_volume_confirmed",
                triggerLevel: setup.H0,
                invalidationLevel: setup.invalidationLevel,
                evidence: setup.evidence
              });

              if (Number.isFinite(currentAtr) && currentAtr > 0 && !exitedOnBar) {
                onPositionBuyConfirmed({
                  barIndex: i,
                  barClose,
                  currentAtr,
                  invalidationLevel: setup.invalidationLevel,
                  atrTrailingMult: config.atrTrailingMult || 3.0
                });
              }

              activeBranchC = null;
              branchCCooldownUntil = i + 3;
            }
          }
        } else if (daysSinceT0 > 3) {
          setup.stage = "expired";
          setup.expiredAt = barTime;
          setup.expiredIndex = i;
          completedEvents.push({ ...setup });
          activeBranchC = null;
          branchCCooldownUntil = i + 3;
        }
      } else if (setup.stageStep === 2) {
        if (barClose > setup.H0 && currentRsi > 30 && currentRsi > prevRsi) {
          setup.stage = "confirmed";
          setup.confirmedAt = barTime;
          setup.confirmedIndex = i;
          completedEvents.push({ ...setup });

          chartSignals.push({
            id: `${setup.id}_confirm`,
            setupId: setup.id,
            time: barTime,
            price: barClose,
            side: "B",
            direction: "bullish",
            stage: "confirmed",
            kind: setup.kind,
            reason: "oversold_volume_confirmed",
            triggerLevel: setup.H0,
            invalidationLevel: setup.invalidationLevel,
            evidence: setup.evidence
          });

          if (Number.isFinite(currentAtr) && currentAtr > 0 && !exitedOnBar) {
            onPositionBuyConfirmed({
              barIndex: i,
              barClose,
              currentAtr,
              invalidationLevel: setup.invalidationLevel,
              atrTrailingMult: config.atrTrailingMult || 3.0
            });
          }

          activeBranchC = null;
          branchCCooldownUntil = i + 3;
        } else if (i >= setup.stage3WindowEndIndex) {
          setup.stage = "expired";
          setup.expiredAt = barTime;
          setup.expiredIndex = i;
          completedEvents.push({ ...setup });
          activeBranchC = null;
          branchCCooldownUntil = i + 3;
        }
      }
    }

    // --- Branch D (Consolidation Launch Watch Setups) --- Only for swing_pulse_v1!
    if (isSwingPulse) {
      for (let k = activeBranchLaunch.length - 1; k >= 0; k -= 1) {
        const setup = activeBranchLaunch[k];

        if (barClose < setup.invalidationLevel) {
          setup.stage = "invalidated";
          setup.invalidatedAt = barTime;
          setup.invalidatedIndex = i;
          completedEvents.push({ ...setup });
          activeBranchLaunch.splice(k, 1);
          continue;
        }

        // Breakout confirmation: close > past20High && RVOL >= reqBreakoutRvol
        if (barClose > setup.triggerLevel && Number.isFinite(currentRvol) && currentRvol >= reqBreakoutRvol && barClose >= barOpen) {
          setup.stage = "confirmed";
          setup.confirmedAt = barTime;
          setup.confirmedIndex = i;
          completedEvents.push({ ...setup });

          chartSignals.push({
            id: `${setup.id}_confirm`,
            setupId: setup.id,
            time: barTime,
            price: barClose,
            side: "B",
            direction: "bullish",
            stage: "confirmed",
            kind: setup.kind,
            reason: "consolidation_launch_confirmed",
            triggerLevel: setup.triggerLevel,
            invalidationLevel: setup.invalidationLevel,
            evidence: {
              ...setup.evidence,
              breakoutRvol: round(currentRvol, 2),
              breakoutClose: round(barClose, 4)
            }
          });

          if (Number.isFinite(currentAtr) && currentAtr > 0 && !exitedOnBar) {
            onPositionBuyConfirmed({
              barIndex: i,
              barClose,
              currentAtr,
              invalidationLevel: setup.invalidationLevel,
              atrTrailingMult: config.atrTrailingMult || 3.0
            });
          }

          activeBranchLaunch.splice(k, 1);
          continue;
        }

        if (i >= setup.windowEndIndex) {
          setup.stage = "expired";
          setup.expiredAt = barTime;
          setup.expiredIndex = i;
          completedEvents.push({ ...setup });
          activeBranchLaunch.splice(k, 1);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4B. EVALUATE DYNAMIC POSITION RISK & ATR TRAILING STOP (swing_pulse_v1 only)
    // ─────────────────────────────────────────────────────────────────────────
    if (isSwingPulse && activePosition && Number.isFinite(currentAtr) && currentAtr > 0) {
      if (barClose > activePosition.highestClose) {
        activePosition.highestClose = barClose;
      }

      const atrMult = config.atrTrailingMult || 3.0;
      const stepTrailingStop = activePosition.highestClose - atrMult * currentAtr;
      // Trailing stop strictly ONLY moves up, never moves down
      activePosition.trailingStop = Math.max(activePosition.trailingStop, round(stepTrailingStop, 4));
      trailingStopSeries[i] = activePosition.trailingStop;

      // Check exit condition (收盘跌破买入形态失效位 或 跌破 ATR 跟踪线)
      // Note: No RSI, no top divergence, no volume surge required!
      const brokeInvalidation = activePosition.invalidationLevel !== null && barClose < activePosition.invalidationLevel;
      const brokeTrailing = barClose < activePosition.trailingStop;

      if (brokeInvalidation || brokeTrailing) {
        const exitReason = brokeTrailing ? "atr_trailing_stop_exit" : "setup_invalidation_exit";
        chartSignals.push({
          id: `${symbol}_risk_exit_${barTime}`,
          setupId: `pos_${activePosition.entryIndex}`,
          time: barTime,
          price: barClose,
          side: "S",
          direction: "bearish",
          stage: "confirmed",
          kind: "risk_confirmation",
          reason: exitReason,
          triggerLevel: activePosition.trailingStop,
          invalidationLevel: activePosition.invalidationLevel || activePosition.trailingStop,
          evidence: {
            highestClose: activePosition.highestClose,
            trailingStop: activePosition.trailingStop,
            invalidationLevel: activePosition.invalidationLevel,
            barClose,
            currentAtr: round(currentAtr, 4)
          }
        });

        activePosition = null;
        exitedOnBar = true;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4C. NEW INITIATIONS (Branches D, E, F only for swing_pulse_v1!)
    // ─────────────────────────────────────────────────────────────────────────
    if (isSwingPulse) {
      const isTrendUp = (
        sma50[i] !== null &&
        i >= 5 &&
        sma50[i - 5] !== null &&
        sma50[i] > sma50[i - 5] &&
        barClose > sma50[i]
      );

      const past20H = past20Highs[i];

      // D1. 强势整理产生观察 (Launch Watch)
      if (
        isTrendUp &&
        past20H !== null &&
        meanAmp5[i] !== null &&
        meanAmp20[i] !== null &&
        meanVol5[i] !== null &&
        volumeMa[i] !== null &&
        meanAmp5[i] < meanAmp20[i] &&
        meanVol5[i] <= volumeMa[i] &&
        Number.isFinite(currentAtr) &&
        currentAtr > 0 &&
        barClose <= past20H &&
        (past20H - barClose) <= (config.consolidationProximityAtrMult || 1.0) * currentAtr
      ) {
        if (i >= lastLaunchWatchBar + 3) {
          lastLaunchWatchBar = i;
          const triggerLevel = past20H;
          const invalidationLevel = barClose - 2.0 * currentAtr;

          const setup = {
            id: `${symbol}_launch_${barTime}`,
            symbol,
            direction: "bullish",
            stage: "candidate",
            stageStep: 1,
            kind: "consolidation_launch",
            detectedIndex: i,
            detectedAt: barTime,
            windowEndIndex: i + (config.confirmationWindowBars || 7),
            triggerLevel: round(triggerLevel, 4),
            invalidationLevel: round(invalidationLevel, 4),
            confirmedAt: null,
            invalidatedAt: null,
            expiredAt: null,
            evidence: {
              past20High: round(past20H, 4),
              close: round(barClose, 4),
              distanceToHigh: round(past20H - barClose, 4),
              atr: round(currentAtr, 4),
              meanAmp5: round(meanAmp5[i], 4),
              meanAmp20: round(meanAmp20[i], 4),
              regime: regimeStatus
            }
          };

          activeBranchLaunch.push(setup);

          chartSignals.push({
            id: `${setup.id}_obs`,
            setupId: setup.id,
            time: barTime,
            price: barClose,
            side: "eB",
            direction: "bullish",
            stage: "candidate",
            kind: setup.kind,
            reason: "consolidation_launch_observation",
            triggerLevel: setup.triggerLevel,
            invalidationLevel: setup.invalidationLevel,
            evidence: setup.evidence
          });
        }
      }

      // D2 & D3. 突破确认 (D2: 整理突破, D3: 放量动能突破)
      if (
        isTrendUp &&
        past20H !== null &&
        barClose > past20H &&
        Number.isFinite(currentRvol) && currentRvol >= reqBreakoutRvol &&
        barClose >= barOpen // 阳线收高
      ) {
        // Avoid duplicate trigger if already confirmed by activeBranchLaunch on this bar
        const alreadyConfirmed = chartSignals.some((s) => s.time === barTime && s.side === "B");
        if (!alreadyConfirmed) {
          const invalidationLevel = Number.isFinite(currentAtr) ? barClose - 2.0 * currentAtr : barLow;

          // Check if prior 5 days had consolidation
          const hasPriorConsolidation = (
            i >= 5 &&
            meanAmp5[i - 1] !== null &&
            meanAmp20[i - 1] !== null &&
            meanVol5[i - 1] !== null &&
            volumeMa[i - 1] !== null &&
            meanAmp5[i - 1] <= meanAmp20[i - 1] &&
            meanVol5[i - 1] <= volumeMa[i - 1]
          );

          const signalKind = hasPriorConsolidation ? "consolidation_launch" : "momentum_breakout";
          const signalReason = hasPriorConsolidation ? "consolidation_launch_confirmed" : "momentum_breakout_confirmed";

          chartSignals.push({
            id: `${symbol}_${signalKind}_${barTime}`,
            setupId: `${signalKind}_${barTime}`,
            time: barTime,
            price: barClose,
            side: "B",
            direction: "bullish",
            stage: "confirmed",
            kind: signalKind,
            reason: signalReason,
            triggerLevel: round(past20H, 4),
            invalidationLevel: round(invalidationLevel, 4),
            evidence: {
              past20High: round(past20H, 4),
              breakoutClose: round(barClose, 4),
              rvol: round(currentRvol, 2),
              hasPriorConsolidation,
              regime: regimeStatus
            }
          });

          if (Number.isFinite(currentAtr) && currentAtr > 0 && !exitedOnBar) {
            onPositionBuyConfirmed({
              barIndex: i,
              barClose,
              currentAtr,
              invalidationLevel,
              atrTrailingMult: config.atrTrailingMult || 3.0
            });
          }
        }
      }

      // Branch E: 上涨趋势中的回调转强 (Pullback Reversal in Uptrend)
      const currSma20 = sma20[i];
      const past3H = past3Highs[i];
      // Pullback low during the 4-day window before today
      const pullbackLow = lowestLow(bars, Math.max(0, i - 4), i - 1);
      const rsiWindow = [rsi[i - 3], rsi[i - 2], rsi[i - 1], rsi[i]].filter(Number.isFinite);
      const minRsiWindow = rsiWindow.length ? Math.min(...rsiWindow) : currentRsi;

      const tested20Sma = pullbackLow !== null && currSma20 !== null && pullbackLow <= currSma20 * 1.025 && barClose >= currSma20 * 0.95;
      // Volume contraction strictly checked during the pullback phase (prior to breakout day)
      const volContractedInPullback = i >= 5 && meanVol5[i - 1] !== null && volumeMa[i - 1] !== null && meanVol5[i - 1] <= volumeMa[i - 1];

      const rsiLowerBound = config.pullbackRsiLower || 40;
      const rsiUpperBound = config.pullbackRsiUpper || 55;
      const rsiRebounding = minRsiWindow >= (rsiLowerBound - 4) && minRsiWindow <= (rsiUpperBound + 3) && currentRsi > prevRsi && currentRsi >= rsiLowerBound;

      if (
        isTrendUp &&
        tested20Sma &&
        volContractedInPullback &&
        rsiRebounding &&
        past3H !== null &&
        barClose > past3H
      ) {
        const alreadyConfirmed = chartSignals.some((s) => s.time === barTime && s.side === "B");
        if (!alreadyConfirmed) {
          // Setup invalidation level is the structural swing low of the pullback with 0.25 ATR buffer
          const structuralLow = pullbackLow !== null ? pullbackLow : barLow;
          const invalidationLevel = Number.isFinite(currentAtr) ? structuralLow - 0.25 * currentAtr : structuralLow;

          chartSignals.push({
            id: `${symbol}_pullback_confirm_${barTime}`,
            setupId: `pullback_${barTime}`,
            time: barTime,
            price: barClose,
            side: "B",
            direction: "bullish",
            stage: "confirmed",
            kind: "pullback_reversal",
            reason: "pullback_reversal_confirmed",
            triggerLevel: round(past3H, 4),
            invalidationLevel: round(invalidationLevel, 4),
            evidence: {
              past3High: round(past3H, 4),
              close: round(barClose, 4),
              pullbackLow: round(structuralLow, 4),
              sma20: round(currSma20, 4),
              rsi: round(currentRsi, 2),
              prevRsi: round(prevRsi, 2),
              regime: regimeStatus
            }
          });

          if (Number.isFinite(currentAtr) && currentAtr > 0 && !exitedOnBar) {
            onPositionBuyConfirmed({
              barIndex: i,
              barClose,
              currentAtr,
              invalidationLevel,
              atrTrailingMult: config.atrTrailingMult || 3.0
            });
          }
        }
      }

      // F. 独立转弱预警 (Weakness Warning eS)
      const past5L = past5Lows[i];
      const reqWeakRvol = Number.isFinite(Number(config.weaknessRvolThreshold)) ? Number(config.weaknessRvolThreshold) : 1.2;
      const reqWeakClv = Number.isFinite(Number(config.weaknessClvThreshold)) ? Number(config.weaknessClvThreshold) : 0.25;

      if (
        past5L !== null &&
        barClose < past5L &&
        Number.isFinite(currentRvol) &&
        currentRvol >= reqWeakRvol &&
        Number.isFinite(currentClv) &&
        currentClv <= reqWeakClv &&
        (i - lastWeaknessWarningBar >= 3)
      ) {
        lastWeaknessWarningBar = i;
        const weaknessSignal = {
          id: `${symbol}_weakness_${barTime}`,
          setupId: `weakness_${barTime}`,
          time: barTime,
          price: barClose,
          side: "eS",
          direction: "bearish",
          stage: "observation",
          kind: "structural_weakness",
          reason: "breakdown_volume_weakness_warning",
          triggerLevel: round(past5L, 4),
          invalidationLevel: round(barHigh, 4),
          evidence: {
            past5Low: round(past5L, 4),
            close: round(barClose, 4),
            rvol: round(currentRvol, 2),
            clv: round(currentClv, 3),
            regime: regimeStatus
          }
        };

        chartSignals.push(weaknessSignal);
        completedEvents.push({
          id: weaknessSignal.id,
          kind: "structural_weakness",
          direction: "bearish",
          side: "eS",
          stage: "observation",
          anchorIndex: i,
          anchorTime: barTime,
          anchorPrice: barClose,
          triggerLevel: past5L,
          invalidationLevel: barHigh,
          evidence: weaknessSignal.evidence
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4D. PIVOT EVALUATION (Branch A: Top Divergence, Branch B: Bottom Divergence)
    // ─────────────────────────────────────────────────────────────────────────

    // --- Branch A: Top Divergence (High Pivot p2 confirmed at bar i) ---
    const newHighPivots = highsByConfirmedIndex.get(i) || [];
    for (const p2 of newHighPivots) {
      const pair = pairPivot(p2, highs, config.pivotMinDistance, config.pivotMaxDistance);
      if (!pair) continue;
      const { p1 } = pair;

      const p1Idx = p1.pivotIndex;
      const p2Idx = p2.pivotIndex;
      const H1 = p1.price;
      const H2 = p2.price;
      const atrP2 = Number(atr[p2Idx]);
      const epsilon = Math.max(H1 * config.priceEpsilonRatio, config.priceEpsilonAtrMult * (Number.isFinite(atrP2) ? atrP2 : 0));

      const rsi1 = Number(rsi[p1Idx]);
      const rsi2 = Number(rsi[p2Idx]);
      if (!Number.isFinite(rsi1) || !Number.isFinite(rsi2)) continue;

      const condHigherHigh = H2 >= H1 + epsilon;
      const condLowerRsi = rsi2 <= rsi1 - config.rsiDivergenceMinDelta;
      const condRsiOverbought = rsi1 >= config.rsiOverbought || rsi2 >= config.rsiOverbought;

      const Q1 = calcAvgVolume(bars, p1Idx);
      const Q2 = calcAvgVolume(bars, p2Idx);
      const condVolume = Q1 !== null && Q2 !== null && Q2 <= Q1 * config.volumeDecayThreshold;

      // Strict vs Adaptive Divergence
      let passesDivergence = false;
      let confluence = 0;
      if (config.divergenceMode === "strict") {
        passesDivergence = condHigherHigh && condLowerRsi && condRsiOverbought && condVolume;
        confluence = 4;
      } else {
        if (condHigherHigh) confluence += 1;
        if (condLowerRsi) confluence += 1;
        if (condRsiOverbought) confluence += 1;
        if (condVolume) confluence += 1;
        passesDivergence = condHigherHigh && condLowerRsi; // Core divergence required
      }

      if (passesDivergence) {
        let L_between = Infinity;
        for (let k = p1Idx + 1; k < p2Idx; k += 1) {
          const l = Number(bars[k]?.low);
          if (Number.isFinite(l) && l < L_between) L_between = l;
        }
        if (!Number.isFinite(L_between)) L_between = Math.min(Number(bars[p1Idx].low), Number(bars[p2Idx].low));

        const triggerLevel = L_between;
        const invalidationLevel = H2;

        const setup = {
          id: `${symbol}_top_div_${barTime}`,
          symbol,
          direction: "bearish",
          stage: "candidate",
          kind: "top_divergence_exhaustion",
          detectedIndex: i,
          detectedAt: barTime,
          windowEndIndex: i + config.confirmationWindowBars,
          triggerLevel: round(triggerLevel, 4),
          invalidationLevel: round(invalidationLevel, 4),
          confirmedAt: null,
          invalidatedAt: null,
          expiredAt: null,
          evidence: {
            p1Index: p1Idx,
            p2Index: p2Idx,
            p1Time: p1.time,
            p2Time: p2.time,
            H1: round(H1, 4),
            H2: round(H2, 4),
            priceDeltaPct: round(((H2 - H1) / H1) * 100, 2),
            epsilon: round(epsilon, 4),
            rsi1: round(rsi1, 2),
            rsi2: round(rsi2, 2),
            rsiDelta: round(rsi2 - rsi1, 2),
            Q1: Q1 !== null ? round(Q1, 2) : null,
            Q2: Q2 !== null ? round(Q2, 2) : null,
            volumeRatio: (Q1 && Q2) ? round(Q2 / Q1, 3) : null,
            confluence,
            hasOverbought: condRsiOverbought,
            hasVolumeDecay: condVolume,
            triggerLevel: round(triggerLevel, 4),
            invalidationLevel: round(invalidationLevel, 4),
            regime: regimeStatus
          }
        };

        if (barClose > invalidationLevel) {
          setup.stage = "invalidated";
          setup.invalidatedAt = barTime;
          setup.invalidatedIndex = i;
          completedEvents.push(setup);
        } else if (Number.isFinite(currentRsi) && Number.isFinite(prevRsi) &&
                   barClose < triggerLevel && currentRsi < prevRsi) {
          setup.stage = "confirmed";
          setup.confirmedAt = barTime;
          setup.confirmedIndex = i;
          completedEvents.push(setup);

          chartSignals.push({
            id: `${setup.id}_confirm`,
            setupId: setup.id,
            time: barTime,
            price: barClose,
            side: "DV-S",
            direction: "bearish",
            stage: "confirmed",
            kind: setup.kind,
            reason: "top_divergence_confirmed",
            triggerLevel: setup.triggerLevel,
            invalidationLevel: setup.invalidationLevel,
            evidence: setup.evidence
          });
        } else {
          activeBranchA.push(setup);
          chartSignals.push({
            id: `${setup.id}_warn`,
            setupId: setup.id,
            time: barTime,
            price: barClose,
            side: "eS",
            direction: "bearish",
            stage: "candidate",
            kind: setup.kind,
            reason: "top_divergence_warning",
            triggerLevel: setup.triggerLevel,
            invalidationLevel: setup.invalidationLevel,
            evidence: setup.evidence
          });
        }
      }
    }

    // --- Branch B: Bottom Divergence (Low Pivot p2 confirmed at bar i) ---
    const newLowPivots = lowsByConfirmedIndex.get(i) || [];
    for (const p2 of newLowPivots) {
      const pair = pairPivot(p2, lows, config.pivotMinDistance, config.pivotMaxDistance);
      if (!pair) continue;
      const { p1 } = pair;

      const p1Idx = p1.pivotIndex;
      const p2Idx = p2.pivotIndex;
      const L1 = p1.price;
      const L2 = p2.price;
      const atrP2 = Number(atr[p2Idx]);
      const epsilon = Math.max(L1 * config.priceEpsilonRatio, config.priceEpsilonAtrMult * (Number.isFinite(atrP2) ? atrP2 : 0));

      const rsi1 = Number(rsi[p1Idx]);
      const rsi2 = Number(rsi[p2Idx]);
      if (!Number.isFinite(rsi1) || !Number.isFinite(rsi2)) continue;

      const condLowerLow = L2 <= L1 - epsilon;
      const condHigherRsi = rsi2 >= rsi1 + config.rsiDivergenceMinDelta;
      const condRsiOversold = rsi1 <= config.rsiOversold || rsi2 <= config.rsiOversold;

      const Q1 = calcAvgVolume(bars, p1Idx);
      const Q2 = calcAvgVolume(bars, p2Idx);
      const condVolume = Q1 !== null && Q2 !== null && Q2 <= Q1 * config.volumeDecayThreshold;

      let passesDivergence = false;
      let confluence = 0;
      if (config.divergenceMode === "strict") {
        passesDivergence = condLowerLow && condHigherRsi && condRsiOversold && condVolume;
        confluence = 4;
      } else {
        if (condLowerLow) confluence += 1;
        if (condHigherRsi) confluence += 1;
        if (condRsiOversold) confluence += 1;
        if (condVolume) confluence += 1;
        passesDivergence = condLowerLow && condHigherRsi;
      }

      if (passesDivergence) {
        let H_between = -Infinity;
        for (let k = p1Idx + 1; k < p2Idx; k += 1) {
          const h = Number(bars[k]?.high);
          if (Number.isFinite(h) && h > H_between) H_between = h;
        }
        if (!Number.isFinite(H_between)) H_between = Math.max(Number(bars[p1Idx].high), Number(bars[p2Idx].high));

        const triggerLevel = H_between;
        const invalidationLevel = L2;

        const setup = {
          id: `${symbol}_bot_div_${barTime}`,
          symbol,
          direction: "bullish",
          stage: "candidate",
          kind: "bottom_divergence_exhaustion",
          detectedIndex: i,
          detectedAt: barTime,
          windowEndIndex: i + config.confirmationWindowBars,
          triggerLevel: round(triggerLevel, 4),
          invalidationLevel: round(invalidationLevel, 4),
          confirmedAt: null,
          invalidatedAt: null,
          expiredAt: null,
          evidence: {
            p1Index: p1Idx,
            p2Index: p2Idx,
            p1Time: p1.time,
            p2Time: p2.time,
            L1: round(L1, 4),
            L2: round(L2, 4),
            priceDeltaPct: round(((L2 - L1) / L1) * 100, 2),
            epsilon: round(epsilon, 4),
            rsi1: round(rsi1, 2),
            rsi2: round(rsi2, 2),
            rsiDelta: round(rsi2 - rsi1, 2),
            Q1: Q1 !== null ? round(Q1, 2) : null,
            Q2: Q2 !== null ? round(Q2, 2) : null,
            volumeRatio: (Q1 && Q2) ? round(Q2 / Q1, 3) : null,
            confluence,
            hasOversold: condRsiOversold,
            hasVolumeDecay: condVolume,
            triggerLevel: round(triggerLevel, 4),
            invalidationLevel: round(invalidationLevel, 4),
            regime: regimeStatus
          }
        };

        if (barLow < invalidationLevel) {
          setup.stage = "invalidated";
          setup.invalidatedAt = barTime;
          setup.invalidatedIndex = i;
          completedEvents.push(setup);
        } else if (Number.isFinite(currentRsi) && Number.isFinite(prevRsi) &&
                   barClose > triggerLevel && currentRsi > 30 && currentRsi > prevRsi) {
          setup.stage = "confirmed";
          setup.confirmedAt = barTime;
          setup.confirmedIndex = i;
          completedEvents.push(setup);

          chartSignals.push({
            id: `${setup.id}_confirm`,
            setupId: setup.id,
            time: barTime,
            price: barClose,
            side: "B",
            direction: "bullish",
            stage: "confirmed",
            kind: setup.kind,
            reason: "bottom_divergence_confirmed",
            triggerLevel: setup.triggerLevel,
            invalidationLevel: setup.invalidationLevel,
            evidence: setup.evidence
          });

          if (Number.isFinite(currentAtr) && currentAtr > 0 && !exitedOnBar) {
            onPositionBuyConfirmed({
              barIndex: i,
              barClose,
              currentAtr,
              invalidationLevel: setup.invalidationLevel,
              atrTrailingMult: config.atrTrailingMult || 3.0
            });
          }
        } else {
          activeBranchB.push(setup);
          chartSignals.push({
            id: `${setup.id}_warn`,
            setupId: setup.id,
            time: barTime,
            price: barClose,
            side: "eB",
            direction: "bullish",
            stage: "candidate",
            kind: setup.kind,
            reason: "bottom_divergence_warning",
            triggerLevel: setup.triggerLevel,
            invalidationLevel: setup.invalidationLevel,
            evidence: setup.evidence
          });
        }
      }
    }

    // --- Branch C Discovery (Oversold High-Volume Stabilization) ---
    if (!activeBranchC && i >= branchCCooldownUntil) {
      if (
        Number.isFinite(currentRsi) && currentRsi <= config.rsiOversold &&
        Number.isFinite(currentRvol) && currentRvol >= config.rvolThreshold &&
        Number.isFinite(currentAtr) && currentAtr > 0
      ) {
        let minPast20Low = Infinity;
        for (let k = Math.max(0, i - 20); k < i; k += 1) {
          const l = Number(bars[k]?.low);
          if (Number.isFinite(l) && l < minPast20Low) minPast20Low = l;
        }

        // Exact original tolerance restored: L(t0) <= minPast20Low + 0.25 * ATR
        if (barLow <= minPast20Low + 0.25 * currentAtr) {
          const L0 = barLow;
          const H0 = barHigh;
          const C0 = barClose;
          const A0 = currentAtr;
          const invalidationLevel = L0 - 0.35 * A0;

          activeBranchC = {
            id: `${symbol}_oversold_vol_${barTime}`,
            symbol,
            direction: "bullish",
            stage: "candidate",
            stageStep: 1,
            kind: "oversold_volume_reversal",
            detectedIndex: i,
            detectedAt: barTime,
            t0Index: i,
            t0Time: barTime,
            L0,
            H0,
            C0,
            A0,
            sIndex: null,
            stage3WindowEndIndex: null,
            triggerLevel: round(H0, 4),
            invalidationLevel: round(invalidationLevel, 4),
            confirmedAt: null,
            invalidatedAt: null,
            expiredAt: null,
            evidence: {
              rsi0: round(currentRsi, 2),
              rvol0: round(currentRvol, 2),
              minPast20Low: round(minPast20Low, 4),
              atr0: round(A0, 4),
              absorptionMet: false,
              regime: regimeStatus
            }
          };

          chartSignals.push({
            id: `${activeBranchC.id}_obs`,
            setupId: activeBranchC.id,
            time: barTime,
            price: barClose,
            side: "eB",
            direction: "bullish",
            stage: "candidate",
            kind: activeBranchC.kind,
            reason: "oversold_volume_observation",
            triggerLevel: round(H0, 4),
            invalidationLevel: round(invalidationLevel, 4),
            evidence: activeBranchC.evidence
          });
        }
      }
    }

    // --- Branch F: 独立转弱预警 (Weakness Warning eS) --- Only for swing_pulse_v1!
    if (isSwingPulse) {
      const past5L = past5Lows[i];
      const weakRvolThreshold = Number(config.weaknessRvolThreshold) || 1.2;
      const weakClvThreshold = Number(config.weaknessClvThreshold) || 0.25;

      if (
        past5L !== null &&
        barClose < past5L &&
        Number.isFinite(currentRvol) && currentRvol >= weakRvolThreshold &&
        Number.isFinite(currentClv) && currentClv <= weakClvThreshold &&
        barClose < barOpen &&
        i >= lastWeaknessWarningBar + 3
      ) {
        lastWeaknessWarningBar = i;
        chartSignals.push({
          id: `${symbol}_weakness_warn_${barTime}`,
          setupId: `weakness_${barTime}`,
          time: barTime,
          price: barClose,
          side: "eS",
          direction: "bearish",
          stage: "candidate",
          kind: "weakness_warning",
          reason: "weakness_warning",
          triggerLevel: round(past5L, 4),
          invalidationLevel: round(barHigh, 4),
          evidence: {
            past5Low: round(past5L, 4),
            close: round(barClose, 4),
            rvol: round(currentRvol, 2),
            clv: round(currentClv, 3),
            regime: regimeStatus
          }
        });
      }
    }
  }

  // ── 5. Assemble Output ─────────────────────────────────────────────────────
  const activeSetups = [
    ...activeBranchA,
    ...activeBranchB,
    ...(activeBranchC ? [activeBranchC] : []),
    ...(isSwingPulse ? activeBranchLaunch : [])
  ];

  const rsiSeriesOut = bars.map((b, idx) => ({
    time: b.time,
    value: rsi[idx] != null ? round(rsi[idx], 2) : null
  })).filter((p) => p.value !== null);

  const wilderAtrOut = bars.map((b, idx) => ({
    time: b.time,
    value: atr[idx] != null ? round(atr[idx], 4) : null
  })).filter((p) => p.value !== null);

  const rvolOut = bars.map((b, idx) => ({
    time: b.time,
    value: rvol[idx] != null ? round(rvol[idx], 2) : null
  })).filter((p) => p.value !== null);

  const volumeMaOut = bars.map((b, idx) => ({
    time: b.time,
    value: volumeMa[idx] != null ? round(volumeMa[idx], 2) : null
  })).filter((p) => p.value !== null);

  const sma50Out = bars.map((b, idx) => ({
    time: b.time,
    value: sma50[idx] != null ? round(sma50[idx], 4) : null
  })).filter((p) => p.value !== null);

  const sma20Out = bars.map((b, idx) => ({
    time: b.time,
    value: sma20[idx] != null ? round(sma20[idx], 4) : null
  })).filter((p) => p.value !== null);

  const trailingStopOut = bars.map((b, idx) => ({
    time: b.time,
    value: trailingStopSeries[idx] != null ? round(trailingStopSeries[idx], 4) : null
  })).filter((p) => p.value !== null);

  const volumeSeriesOut = bars.map((b) => ({
    time: b.time,
    value: round(b.volume, 2),
    color: Number(b.close) >= Number(b.open) ? "#38ab70" : "#df4f46"
  }));

  return {
    algorithm: config.algorithm,
    version: config.version,
    barsCount: bars.length,
    signalEvents: [...completedEvents, ...activeSetups].sort((a, b) => a.detectedIndex - b.detectedIndex),
    activeSetups,
    signals: chartSignals.sort((a, b) => a.time - b.time),
    pivots: { highs, lows },
    activePosition: activePosition ? {
      ...activePosition,
      highestClose: round(activePosition.highestClose, 4),
      trailingStop: round(activePosition.trailingStop, 4),
      invalidationLevel: activePosition.invalidationLevel !== null ? round(activePosition.invalidationLevel, 4) : null
    } : null,
    series: {
      rsi: rsiSeriesOut,
      wilderAtr: wilderAtrOut,
      rvol: rvolOut,
      volumeMa: volumeMaOut,
      sma50: sma50Out,
      sma20: sma20Out,
      trailingStop: trailingStopOut,
      volume: volumeSeriesOut
    }
  };
}

export function computeRsiVolumeSignals(bars, options = {}) {
  return runSignalEngine(bars, {
    ...RSI_VOLUME_V1_CONFIG,
    ...options,
    algorithm: ALGORITHMS.RSI_VOLUME_V1,
    divergenceMode: "strict"
  });
}

export function computeSwingPulseSignals(bars, options = {}) {
  const targetAlgo = options.algorithm && options.algorithm !== ALGORITHMS.RSI_VOLUME_V1
    ? options.algorithm
    : ALGORITHMS.SWING_PULSE_V1;
  return runSignalEngine(bars, {
    ...SWING_PULSE_V1_CONFIG,
    ...options,
    algorithm: targetAlgo
  });
}
