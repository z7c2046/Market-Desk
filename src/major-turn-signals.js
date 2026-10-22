/**
 * Major Turn Daily Signal Engine (major_turn_v1)
 *
 * Implements strict, sparse macro inflection detection for daily bars:
 * - panic_bottom: Capitulation volume + deep oversold + price recovery
 * - exhaustion_top: Prior massive uptrend + near highs + overbought rollover + volume decay
 *
 * Strictly adheres to docs/MAJOR_TURN_DAILY_HANDOFF.zh-CN.md:
 * - Independent episode and attempt lifecycle (no forced S/B alternation)
 * - Anti-repainting & prefix consistency
 * - Minimum 180-bar warmup per detection bar
 * - Late confirmations flagged (actionable=false)
 */

import {
  wilderRsiSeries,
  wilderAtrSeries,
  rvol20Series,
  vp95Series,
  highestHighSeries,
  lowestLowSeries,
  highestCloseSeries,
  maxSeries,
  vdecaySeries,
  clvSeries,
  lowestLow,
  round
} from "./indicators.js";
import { MAJOR_TURN_V1_CONFIG } from "./strategy-config.js";

/**
 * Computes major turn signals on completed daily bars.
 * Pure function: No network, no state mutation, no lookahead.
 */
export function computeMajorTurnSignals(bars = [], options = {}) {
  const config = { ...MAJOR_TURN_V1_CONFIG, ...(options.params || options) };
  const symbol = String(options.symbol || "UNKNOWN").toUpperCase();

  if (!Array.isArray(bars) || bars.length < config.minWarmupBars) {
    return {
      symbol,
      algorithm: config.algorithm,
      algorithmVersion: config.version,
      signals: [],
      signalEvents: [],
      episodes: [],
      config,
      dataQuality: {
        totalBars: bars?.length || 0,
        warmupMet: false,
        reason: `Insufficient bars: requires at least ${config.minWarmupBars} bars.`
      }
    };
  }

  // ── 1. Precalculate Indicator Series ───────────────────────────────────────
  const closes = bars.map((b) => Number(b.close));
  const rsi = wilderRsiSeries(bars, 14);
  const atr = wilderAtrSeries(bars, 14);
  const rvol = rvol20Series(bars, 20);
  const vp95 = vp95Series(bars, 120);

  // HH60, LL60, HC60 (60 bars inclusive of bar i)
  const hh60 = highestHighSeries(bars, config.topRunupLookbackBars || 60, false);
  const ll60 = lowestLowSeries(bars, config.topRunupLookbackBars || 60, false);
  const hc60 = highestCloseSeries(bars, config.bottomLookbackBars || 60, false);

  // RMAX20 (20 bars inclusive of bar i)
  const rmax20 = maxSeries(rsi, 20, false);

  // VDECAY: mean(V[t-2..t]) / mean(V[t-22..t-3])
  const vdecay = vdecaySeries(bars);

  // CLV
  const clv = clvSeries(bars);

  // SMA50 for top trend check
  const sma50 = new Array(bars.length).fill(null);
  let smaRolling = 0;
  for (let i = 0; i < closes.length; i += 1) {
    smaRolling += closes[i];
    if (i >= 50) smaRolling -= closes[i - 50];
    if (i >= 49) sma50[i] = smaRolling / 50;
  }

  // ── 2. Episode & Attempt State ─────────────────────────────────────────────
  // Bottom and Top are completely independent state machines
  const state = {
    bottom: {
      activeEpisode: null,      // { episodeId, startIndex, endIndex, watchPushed, confirmPushed, activeAttempt, lastAttempt }
      completedEpisodes: [],
      prevEpisode: null,        // { minLow, a0, endBarIndex }
      rsiNeutralConsecutiveDays: 0
    },
    top: {
      activeEpisode: null,      // { episodeId, startIndex, endIndex, watchPushed, confirmPushed, activeAttempt, lastAttempt }
      completedEpisodes: [],
      prevEpisode: null,        // { maxHigh, a0, endBarIndex }
      rsiNeutralConsecutiveDays: 0
    }
  };

  const signalEvents = [];
  const chartSignals = [];
  let skippedDueToQuality = 0;

  // ── 3. Chronological Simulation Loop ───────────────────────────────────────
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    const barOpen = Number(bar.open);
    const barHigh = Number(bar.high);
    const barLow = Number(bar.low);
    const barClose = Number(bar.close);
    const barVol = Number(bar.volume);
    const barTime = Number(bar.time);

    const currRsi = Number(rsi[i]);
    const prevRsi = Number(rsi[i - 1]);
    const currAtr = Number(atr[i]);
    const prevAtr = Number(atr[i - 1]); // A[t-1] for context threshold
    const currRvol = Number(rvol[i]);
    const currVp95 = Number(vp95[i]);
    const currHc60 = Number(hc60[i]);
    const currHh60 = Number(hh60[i]);
    const currLl60 = Number(ll60[i]);
    const currRmax20 = Number(rmax20[i]);
    const currVdecay = Number(vdecay[i]);
    const currSma50 = Number(sma50[i]);
    const currClv = Number(clv[i]);

    // Track RSI Neutral Days for episode reset requirements
    if (Number.isFinite(currRsi)) {
      if (currRsi >= config.episodeResetNeutralRsiBottom) {
        state.bottom.rsiNeutralConsecutiveDays += 1;
      } else {
        state.bottom.rsiNeutralConsecutiveDays = 0;
      }

      if (currRsi <= config.episodeResetNeutralRsiTop) {
        state.top.rsiNeutralConsecutiveDays += 1;
      } else {
        state.top.rsiNeutralConsecutiveDays = 0;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // A. EVALUATE ACTIVE BOTTOM ATTEMPT (Confirmation / Invalidation / Expiration)
    // ─────────────────────────────────────────────────────────────────────────
    const botEp = state.bottom.activeEpisode;
    if (botEp && botEp.activeAttempt) {
      const att = botEp.activeAttempt;

      // Only evaluate on days after t0: t0+1 to t0+7
      if (i > att.t0Index) {
        // Step 1: Invalidation check (L[t] < invalidationLevel)
        if (barLow < att.invalidationLevel) {
          att.stage = "invalidated";
          att.invalidatedAt = barTime;
          att.invalidatedIndex = i;

          signalEvents.push({
            id: `${att.attemptId}_invalidated_${barTime}`,
            algorithm: config.algorithm,
            algorithmVersion: config.version,
            symbol,
            episodeId: botEp.episodeId,
            attemptId: att.attemptId,
            kind: "panic_bottom",
            eventType: "invalidation",
            side: "S",
            direction: "bullish",
            stage: "invalidated",
            eventAt: barTime,
            eventIndex: i,
            anchorAt: att.anchorAt,
            detectedAt: att.detectedAt,
            confirmedAt: null,
            triggerLevel: att.triggerLevel,
            invalidationLevel: att.invalidationLevel,
            recoveryLevel: att.recoveryLevel,
            frozenAtr: att.a0,
            timing: "timely",
            actionable: false,
            evidence: {
              brokenLow: round(barLow, 4),
              invalidationLevel: round(att.invalidationLevel, 4),
              dayOffset: i - att.t0Index
            },
            dataQuality: { ok: true }
          });

          botEp.lastAttempt = att;
          botEp.activeAttempt = null;
        } else {
          // Step 2: Confirmation check
          const recoveredRatio = barClose > att.recoveryLevel;
          const brokePrevHigh = barClose > Number(bars[i - 1]?.high);
          const rsiRecovered = Number.isFinite(currRsi) && Number.isFinite(prevRsi) &&
            currRsi >= att.r0 + config.bottomRsiRecoveryDelta &&
            currRsi > prevRsi;

          if (recoveredRatio && brokePrevHigh && rsiRecovered) {
            att.stage = "confirmed";
            att.confirmedAt = barTime;
            att.confirmedIndex = i;

            // Late timing check: (C[t] - L0) / A0 > 2.0
            const lateDist = (barClose - att.l0) / att.a0;
            const isLate = lateDist > config.bottomLateAtrMult;
            att.timing = isLate ? "late" : "timely";
            att.actionable = !isLate;

            signalEvents.push({
              id: `${att.attemptId}_confirmed_${barTime}`,
              algorithm: config.algorithm,
              algorithmVersion: config.version,
              symbol,
              episodeId: botEp.episodeId,
              attemptId: att.attemptId,
              kind: "panic_bottom",
              eventType: "confirmation",
              side: "B",
              direction: "bullish",
              stage: "confirmed",
              eventAt: barTime,
              eventIndex: i,
              anchorAt: att.anchorAt,
              detectedAt: att.detectedAt,
              confirmedAt: barTime,
              triggerLevel: att.triggerLevel,
              invalidationLevel: att.invalidationLevel,
              recoveryLevel: att.recoveryLevel,
              frozenAtr: att.a0,
              timing: att.timing,
              actionable: att.actionable,
              evidence: {
                barClose: round(barClose, 4),
                prevHigh: round(Number(bars[i - 1]?.high), 4),
                recoveryLevel: round(att.recoveryLevel, 4),
                currRsi: round(currRsi, 2),
                prevRsi: round(prevRsi, 2),
                r0: round(att.r0, 2),
                lateDist: round(lateDist, 2),
                leadBars: i - att.t0Index
              },
              dataQuality: { ok: true }
            });

            // At most one confirmation push per episode
            if (!botEp.confirmPushed) {
              botEp.confirmPushed = true;
              chartSignals.push({
                id: `${symbol}_panic_bottom_B_${barTime}`,
                setupId: att.attemptId,
                time: barTime,
                price: barClose,
                side: "B",
                direction: "bullish",
                stage: "confirmed",
                kind: "panic_bottom",
                reason: "panic_bottom_confirmed",
                triggerLevel: att.recoveryLevel,
                invalidationLevel: att.invalidationLevel,
                timing: att.timing,
                actionable: att.actionable,
                evidence: {
                  l0: att.l0,
                  h0: att.h0,
                  a0: att.a0,
                  lateDist: round(lateDist, 2),
                  clv: round(currClv, 3)
                }
              });
            }

            botEp.lastAttempt = att;
            botEp.activeAttempt = null;
          } else if (i >= att.deadlineIndex || i >= botEp.endIndex) {
            // Step 3: Expiration check
            att.stage = "expired";
            att.expiredAt = barTime;
            att.expiredIndex = i;

            signalEvents.push({
              id: `${att.attemptId}_expired_${barTime}`,
              algorithm: config.algorithm,
              algorithmVersion: config.version,
              symbol,
              episodeId: botEp.episodeId,
              attemptId: att.attemptId,
              kind: "panic_bottom",
              eventType: "expiration",
              side: "eB",
              direction: "bullish",
              stage: "expired",
              eventAt: barTime,
              eventIndex: i,
              anchorAt: att.anchorAt,
              detectedAt: att.detectedAt,
              confirmedAt: null,
              triggerLevel: att.triggerLevel,
              invalidationLevel: att.invalidationLevel,
              recoveryLevel: att.recoveryLevel,
              frozenAtr: att.a0,
              timing: "timely",
              actionable: false,
              evidence: {
                reason: i >= botEp.endIndex ? "episode_window_ended" : "confirmation_deadline_reached",
                lastClose: round(barClose, 4)
              },
              dataQuality: { ok: true }
            });

            botEp.lastAttempt = att;
            botEp.activeAttempt = null;
          }
        }
      }
    }

    // Close finished bottom episode
    if (botEp && i >= botEp.endIndex && !botEp.activeAttempt) {
      state.bottom.completedEpisodes.push(botEp);
      state.bottom.prevEpisode = {
        minLow: botEp.lastAttempt?.l0 ?? barLow,
        a0: botEp.lastAttempt?.a0 ?? currAtr,
        endBarIndex: i
      };
      state.bottom.activeEpisode = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // B. EVALUATE ACTIVE TOP ATTEMPT (Confirmation / Invalidation / Expiration)
    // ─────────────────────────────────────────────────────────────────────────
    const topEp = state.top.activeEpisode;
    if (topEp && topEp.activeAttempt) {
      const att = topEp.activeAttempt;

      // Top confirmation check runs from d to d+7
      // Step 1: Invalidation check (C[t] > invalidationLevel)
      if (barClose > att.invalidationLevel) {
        att.stage = "invalidated";
        att.invalidatedAt = barTime;
        att.invalidatedIndex = i;

        signalEvents.push({
          id: `${att.attemptId}_invalidated_${barTime}`,
          algorithm: config.algorithm,
          algorithmVersion: config.version,
          symbol,
          episodeId: topEp.episodeId,
          attemptId: att.attemptId,
          kind: "exhaustion_top",
          eventType: "invalidation",
          side: "B",
          direction: "bearish",
          stage: "invalidated",
          eventAt: barTime,
          eventIndex: i,
          anchorAt: att.anchorAt,
          detectedAt: att.detectedAt,
          confirmedAt: null,
          triggerLevel: att.triggerLevel,
          invalidationLevel: att.invalidationLevel,
          frozenAtr: att.a0,
          timing: "timely",
          actionable: false,
          evidence: {
            brokenClose: round(barClose, 4),
            invalidationLevel: round(att.invalidationLevel, 4)
          },
          dataQuality: { ok: true }
        });

        topEp.lastAttempt = att;
        topEp.activeAttempt = null;
      } else {
        // Step 2: Confirmation check (C[t] < triggerLevel && R[t] < R[t-1])
        const brokeTrigger = barClose < att.triggerLevel;
        const rsiRolled = Number.isFinite(currRsi) && Number.isFinite(prevRsi) && currRsi < prevRsi;

        if (brokeTrigger && rsiRolled) {
          att.stage = "confirmed";
          att.confirmedAt = barTime;
          att.confirmedIndex = i;

          // Late timing check: (peakPrice - C[t]) / A0 > 2.0
          const lateDist = (att.peakPrice - barClose) / att.a0;
          const isLate = lateDist > config.topLateAtrMult;
          att.timing = isLate ? "late" : "timely";
          att.actionable = !isLate;

          const leadBars = i - att.dIndex;

          signalEvents.push({
            id: `${att.attemptId}_confirmed_${barTime}`,
            algorithm: config.algorithm,
            algorithmVersion: config.version,
            symbol,
            episodeId: topEp.episodeId,
            attemptId: att.attemptId,
            kind: "exhaustion_top",
            eventType: "confirmation",
            side: "S",
            direction: "bearish",
            stage: "confirmed",
            eventAt: barTime,
            eventIndex: i,
            anchorAt: att.anchorAt,
            detectedAt: att.detectedAt,
            confirmedAt: barTime,
            triggerLevel: att.triggerLevel,
            invalidationLevel: att.invalidationLevel,
            frozenAtr: att.a0,
            timing: att.timing,
            actionable: att.actionable,
            leadBars,
            evidence: {
              barClose: round(barClose, 4),
              triggerLevel: round(att.triggerLevel, 4),
              currRsi: round(currRsi, 2),
              prevRsi: round(prevRsi, 2),
              lateDist: round(lateDist, 2),
              leadBars
            },
            dataQuality: { ok: true }
          });

          // At most one confirmation push per episode
          if (!topEp.confirmPushed) {
            topEp.confirmPushed = true;
            chartSignals.push({
              id: `${symbol}_exhaustion_top_S_${barTime}`,
              setupId: att.attemptId,
              time: barTime,
              price: barClose,
              side: "S",
              direction: "bearish",
              stage: "confirmed",
              kind: "exhaustion_top",
              reason: "exhaustion_top_confirmed",
              triggerLevel: att.triggerLevel,
              invalidationLevel: att.invalidationLevel,
              timing: att.timing,
              actionable: att.actionable,
              evidence: {
                peakPrice: att.peakPrice,
                a0: att.a0,
                lateDist: round(lateDist, 2),
                leadBars
              }
            });
          }

          topEp.lastAttempt = att;
          topEp.activeAttempt = null;
        } else if (i >= att.deadlineIndex || i >= topEp.endIndex) {
          // Step 3: Expiration check
          att.stage = "expired";
          att.expiredAt = barTime;
          att.expiredIndex = i;

          signalEvents.push({
            id: `${att.attemptId}_expired_${barTime}`,
            algorithm: config.algorithm,
            algorithmVersion: config.version,
            symbol,
            episodeId: topEp.episodeId,
            attemptId: att.attemptId,
            kind: "exhaustion_top",
            eventType: "expiration",
            side: "eS",
            direction: "bearish",
            stage: "expired",
            eventAt: barTime,
            eventIndex: i,
            anchorAt: att.anchorAt,
            detectedAt: att.detectedAt,
            confirmedAt: null,
            triggerLevel: att.triggerLevel,
            invalidationLevel: att.invalidationLevel,
            frozenAtr: att.a0,
            timing: "timely",
            actionable: false,
            evidence: {
              reason: i >= topEp.endIndex ? "episode_window_ended" : "confirmation_deadline_reached",
              lastClose: round(barClose, 4)
            },
            dataQuality: { ok: true }
          });

          topEp.lastAttempt = att;
          topEp.activeAttempt = null;
        }
      }
    }

    // Close finished top episode
    if (topEp && i >= topEp.endIndex && !topEp.activeAttempt) {
      state.top.completedEpisodes.push(topEp);
      state.top.prevEpisode = {
        maxHigh: topEp.lastAttempt?.peakPrice ?? barHigh,
        a0: topEp.lastAttempt?.a0 ?? currAtr,
        endBarIndex: i
      };
      state.top.activeEpisode = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // C. NEW DETECTIONS (Only if warmup >= 180 bars)
    // ─────────────────────────────────────────────────────────────────────────
    if (i < config.minWarmupBars) {
      continue;
    }

    // Data quality check for bar i
    const hasValidIndicators = (
      Number.isFinite(currRsi) &&
      Number.isFinite(currAtr) && currAtr > 0 &&
      Number.isFinite(prevAtr) && prevAtr > 0 &&
      Number.isFinite(currRvol) &&
      Number.isFinite(currVp95) &&
      Number.isFinite(currHc60) &&
      Number.isFinite(currHh60) &&
      Number.isFinite(currLl60)
    );

    if (!hasValidIndicators) {
      skippedDueToQuality += 1;
      continue;
    }

    // ── C1. Bottom Detector (panic_bottom) ───────────────────────────────────
    const a0Bottom = prevAtr; // Use ATR[t-1] so panic day doesn't inflate own threshold
    const condDrawdown = (currHc60 - barClose) / a0Bottom >= config.bottomDrawdownAtrMult;
    const condTrendDown = i >= 5 && barClose < Number(bars[i - 5]?.close);
    const condOversold = currRsi <= config.bottomRsiOversold;
    const condPanicVolume = currRvol >= config.bottomRvolThreshold && barVol >= currVp95;

    // Past 20 low excluding today
    let minPast20L = Infinity;
    for (let k = Math.max(0, i - config.bottomMinLowLookbackBars); k < i; k += 1) {
      const l = Number(bars[k]?.low);
      if (Number.isFinite(l) && l < minPast20L) minPast20L = l;
    }
    const condNearLow = barLow <= minPast20L + config.bottomMinLowAtrMult * a0Bottom;

    if (condDrawdown && condTrendDown && condOversold && condPanicVolume && condNearLow) {
      const activeEp = state.bottom.activeEpisode;

      // Can we create an episode or an attempt?
      let canCreateAttempt = false;
      let isNewEpisode = false;

      if (!activeEp) {
        // Check reset requirements from previous episode
        const prev = state.bottom.prevEpisode;
        let meetsReset = true;
        if (prev) {
          const rsiNeutralMet = state.bottom.rsiNeutralConsecutiveDays >= 3;
          const newExtremeMet = barLow < prev.minLow - config.episodeResetExtremeAtrMult * prev.a0;
          meetsReset = rsiNeutralMet || newExtremeMet;
        }

        if (meetsReset) {
          canCreateAttempt = true;
          isNewEpisode = true;
        }
      } else if (!activeEp.activeAttempt && !activeEp.confirmPushed) {
        // In existing episode: attempt must be at least 2 bars after last attempt,
        // and low must be lower than old L0 by at least 1.0 * old A0
        const last = activeEp.lastAttempt;
        const cooldownMet = !last || (i >= (last.invalidatedIndex ?? last.expiredIndex ?? 0) + config.attemptCooldownBars);
        const lowerThanOldL0 = !last || (barLow <= last.l0 - config.attemptNewLowAtrMult * last.a0);

        if (cooldownMet && lowerThanOldL0 && i < activeEp.endIndex) {
          canCreateAttempt = true;
          isNewEpisode = false;
        }
      }

      if (canCreateAttempt) {
        if (isNewEpisode) {
          state.bottom.activeEpisode = {
            episodeId: `${symbol}_bot_ep_${barTime}`,
            startIndex: i,
            endIndex: i + config.episodeLengthBars - 1,
            watchPushed: false,
            confirmPushed: false,
            activeAttempt: null,
            lastAttempt: null
          };
        }

        const currEp = state.bottom.activeEpisode;
        const attemptIndex = (currEp.historyAttempts?.length || 0) + 1;
        const attemptId = `${currEp.episodeId}_att_${attemptIndex}`;

        const l0 = barLow;
        const h0 = barHigh;
        const c0 = barClose;
        const r0 = currRsi;
        const invalidationLevel = l0 - config.bottomInvalidationAtrMult * a0Bottom;
        const recoveryLevel = l0 + config.bottomRecoveryRatio * (h0 - l0);
        const deadlineIndex = Math.min(i + config.bottomConfirmationDays, currEp.endIndex);

        const newAttempt = {
          attemptId,
          t0Index: i,
          t0Time: barTime,
          l0,
          h0,
          c0,
          r0,
          a0: a0Bottom,
          triggerLevel: recoveryLevel,
          invalidationLevel: round(invalidationLevel, 4),
          recoveryLevel: round(recoveryLevel, 4),
          deadlineIndex,
          anchorAt: barTime,
          detectedAt: barTime,
          stage: "candidate",
          timing: "timely",
          actionable: true
        };

        currEp.activeAttempt = newAttempt;

        signalEvents.push({
          id: `${attemptId}_observed_${barTime}`,
          algorithm: config.algorithm,
          algorithmVersion: config.version,
          symbol,
          episodeId: currEp.episodeId,
          attemptId,
          kind: "panic_bottom",
          eventType: "observation",
          side: "eB",
          direction: "bullish",
          stage: "candidate",
          eventAt: barTime,
          eventIndex: i,
          anchorAt: barTime,
          detectedAt: barTime,
          confirmedAt: null,
          triggerLevel: round(recoveryLevel, 4),
          invalidationLevel: round(invalidationLevel, 4),
          recoveryLevel: round(recoveryLevel, 4),
          frozenAtr: a0Bottom,
          timing: "timely",
          actionable: true,
          evidence: {
            hc60: round(currHc60, 4),
            close: round(barClose, 4),
            drawdownAtr: round((currHc60 - barClose) / a0Bottom, 2),
            rsi: round(currRsi, 2),
            rvol: round(currRvol, 2),
            vp95: round(currVp95, 0),
            volume: barVol,
            l0,
            h0,
            clv: round(currClv, 3)
          },
          dataQuality: { ok: true }
        });

        // Push watch signal only once per episode
        if (!currEp.watchPushed) {
          currEp.watchPushed = true;
          chartSignals.push({
            id: `${symbol}_panic_bottom_eB_${barTime}`,
            setupId: attemptId,
            time: barTime,
            price: barClose,
            side: "eB",
            direction: "bullish",
            stage: "observation",
            kind: "panic_bottom",
            reason: "panic_bottom_observation",
            triggerLevel: round(recoveryLevel, 4),
            invalidationLevel: round(invalidationLevel, 4),
            timing: "timely",
            actionable: true,
            evidence: {
              hc60: round(currHc60, 4),
              rsi: round(currRsi, 2),
              rvol: round(currRvol, 2),
              a0: round(a0Bottom, 4)
            }
          });
        }
      }
    }

    // ── C2. Top Detector (exhaustion_top) ─────────────────────────────────────
    const a0Top = currAtr;
    const condTrendUp = Number.isFinite(currSma50) && barClose > currSma50 && (barClose - currLl60) / a0Top >= config.topRunupAtrMult;
    const condNearHigh = (currHh60 - barClose) <= config.topProximityAtrMult * a0Top;
    const condWasOverbought = currRmax20 >= config.topOverboughtRsi;
    const condRsiDecayed = currRsi <= currRmax20 - config.topRsiDecayDelta;
    const condVolumeDecay = Number.isFinite(currVdecay) && currVdecay <= config.topVolumeDecayRatio;

    if (condTrendUp && condNearHigh && condWasOverbought && condRsiDecayed && condVolumeDecay) {
      const activeEp = state.top.activeEpisode;

      let canCreateAttempt = false;
      let isNewEpisode = false;

      if (!activeEp) {
        const prev = state.top.prevEpisode;
        let meetsReset = true;
        if (prev) {
          const rsiNeutralMet = state.top.rsiNeutralConsecutiveDays >= 3;
          const newExtremeMet = barHigh > prev.maxHigh + config.episodeResetExtremeAtrMult * prev.a0;
          meetsReset = rsiNeutralMet || newExtremeMet;
        }

        if (meetsReset) {
          canCreateAttempt = true;
          isNewEpisode = true;
        }
      } else if (!activeEp.activeAttempt && !activeEp.confirmPushed) {
        const last = activeEp.lastAttempt;
        const cooldownMet = !last || (i >= (last.invalidatedIndex ?? last.expiredIndex ?? 0) + config.attemptCooldownBars);
        const higherThanOldPeak = !last || (barHigh >= last.peakPrice + config.attemptNewHighAtrMult * last.a0);

        if (cooldownMet && higherThanOldPeak && i < activeEp.endIndex) {
          canCreateAttempt = true;
          isNewEpisode = false;
        }
      }

      if (canCreateAttempt) {
        if (isNewEpisode) {
          state.top.activeEpisode = {
            episodeId: `${symbol}_top_ep_${barTime}`,
            startIndex: i,
            endIndex: i + config.episodeLengthBars - 1,
            watchPushed: false,
            confirmPushed: false,
            activeAttempt: null,
            lastAttempt: null
          };
        }

        const currEp = state.top.activeEpisode;
        const attemptIndex = (currEp.historyAttempts?.length || 0) + 1;
        const attemptId = `${currEp.episodeId}_att_${attemptIndex}`;

        const peakPrice = currHh60;
        // Peak time: first date in [i-59..i] that made peakPrice
        let peakTime = barTime;
        for (let k = Math.max(0, i - 59); k <= i; k += 1) {
          if (Number(bars[k]?.high) === peakPrice) {
            peakTime = Number(bars[k]?.time);
            break;
          }
        }

        // triggerLevel = min(L[d-3..d-1]) excluding d
        const triggerLevel = lowestLow(bars, Math.max(0, i - config.topTriggerLowBars), i - 1) ?? barLow;
        const invalidationLevel = peakPrice + config.topInvalidationAtrMult * a0Top;
        const deadlineIndex = Math.min(i + config.topConfirmationDays, currEp.endIndex);

        const newAttempt = {
          attemptId,
          dIndex: i,
          dTime: barTime,
          peakPrice,
          peakTime,
          a0: a0Top,
          triggerLevel: round(triggerLevel, 4),
          invalidationLevel: round(invalidationLevel, 4),
          deadlineIndex,
          anchorAt: peakTime,
          detectedAt: barTime,
          stage: "candidate",
          timing: "timely",
          actionable: true
        };

        currEp.activeAttempt = newAttempt;

        signalEvents.push({
          id: `${attemptId}_observed_${barTime}`,
          algorithm: config.algorithm,
          algorithmVersion: config.version,
          symbol,
          episodeId: currEp.episodeId,
          attemptId,
          kind: "exhaustion_top",
          eventType: "observation",
          side: "eS",
          direction: "bearish",
          stage: "candidate",
          eventAt: barTime,
          eventIndex: i,
          anchorAt: peakTime,
          detectedAt: barTime,
          confirmedAt: null,
          triggerLevel: round(triggerLevel, 4),
          invalidationLevel: round(invalidationLevel, 4),
          frozenAtr: a0Top,
          timing: "timely",
          actionable: true,
          evidence: {
            hh60: round(currHh60, 4),
            peakTime,
            ll60: round(currLl60, 4),
            runupAtr: round((barClose - currLl60) / a0Top, 2),
            rmax20: round(currRmax20, 2),
            rsi: round(currRsi, 2),
            vdecay: round(currVdecay, 3),
            sma50: round(currSma50, 4),
            triggerLevel: round(triggerLevel, 4),
            clv: round(currClv, 3)
          },
          dataQuality: { ok: true }
        });

        // Check if day d ALSO immediately confirms (C[d] < triggerLevel && R[d] < R[d-1])
        const immediateConfirm = barClose < triggerLevel && Number.isFinite(prevRsi) && currRsi < prevRsi;

        if (immediateConfirm) {
          newAttempt.stage = "confirmed";
          newAttempt.confirmedAt = barTime;
          newAttempt.confirmedIndex = i;
          const lateDist = (peakPrice - barClose) / a0Top;
          const isLate = lateDist > config.topLateAtrMult;
          newAttempt.timing = isLate ? "late" : "timely";
          newAttempt.actionable = !isLate;

          signalEvents.push({
            id: `${attemptId}_confirmed_${barTime}`,
            algorithm: config.algorithm,
            algorithmVersion: config.version,
            symbol,
            episodeId: currEp.episodeId,
            attemptId,
            kind: "exhaustion_top",
            eventType: "confirmation",
            side: "S",
            direction: "bearish",
            stage: "confirmed",
            eventAt: barTime,
            eventIndex: i,
            anchorAt: peakTime,
            detectedAt: barTime,
            confirmedAt: barTime,
            triggerLevel: round(triggerLevel, 4),
            invalidationLevel: round(invalidationLevel, 4),
            frozenAtr: a0Top,
            timing: newAttempt.timing,
            actionable: newAttempt.actionable,
            leadBars: 0,
            evidence: {
              barClose: round(barClose, 4),
              triggerLevel: round(triggerLevel, 4),
              currRsi: round(currRsi, 2),
              prevRsi: round(prevRsi, 2),
              leadBars: 0
            },
            dataQuality: { ok: true }
          });

          // Single confirmation mark shown on chart with leadBars: 0
          currEp.watchPushed = true;
          currEp.confirmPushed = true;
          chartSignals.push({
            id: `${symbol}_exhaustion_top_S_${barTime}`,
            setupId: attemptId,
            time: barTime,
            price: barClose,
            side: "S",
            direction: "bearish",
            stage: "confirmed",
            kind: "exhaustion_top",
            reason: "exhaustion_top_confirmed",
            triggerLevel: round(triggerLevel, 4),
            invalidationLevel: round(invalidationLevel, 4),
            timing: newAttempt.timing,
            actionable: newAttempt.actionable,
            leadBars: 0,
            evidence: {
              peakPrice,
              a0: a0Top,
              lateDist: round(lateDist, 2),
              leadBars: 0
            }
          });

          currEp.lastAttempt = newAttempt;
          currEp.activeAttempt = null;
        } else if (!currEp.watchPushed) {
          // Normal watch mark
          currEp.watchPushed = true;
          chartSignals.push({
            id: `${symbol}_exhaustion_top_eS_${barTime}`,
            setupId: attemptId,
            time: barTime,
            price: barClose,
            side: "eS",
            direction: "bearish",
            stage: "observation",
            kind: "exhaustion_top",
            reason: "exhaustion_top_observation",
            triggerLevel: round(triggerLevel, 4),
            invalidationLevel: round(invalidationLevel, 4),
            timing: "timely",
            actionable: true,
            evidence: {
              peakPrice,
              peakTime,
              rmax20: round(currRmax20, 2),
              rsi: round(currRsi, 2),
              vdecay: round(currVdecay, 3),
              a0: round(a0Top, 4)
            }
          });
        }
      }
    }
  }

  // Collect all episodes
  const allEpisodes = [
    ...state.bottom.completedEpisodes,
    ...(state.bottom.activeEpisode ? [state.bottom.activeEpisode] : []),
    ...state.top.completedEpisodes,
    ...(state.top.activeEpisode ? [state.top.activeEpisode] : [])
  ].sort((a, b) => a.startIndex - b.startIndex);

  return {
    symbol,
    algorithm: config.algorithm,
    algorithmVersion: config.version,
    signals: chartSignals,
    signalEvents,
    episodes: allEpisodes,
    config,
    dataQuality: {
      totalBars: bars.length,
      warmupMet: bars.length >= config.minWarmupBars,
      skippedDueToQuality
    }
  };
}
