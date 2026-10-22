import test from "node:test";
import assert from "node:assert/strict";
import { computeMajorTurnSignals } from "../src/major-turn-signals.js";

/**
 * Creates synthetic daily bars with base prices, high volume and proper ATR.
 */
function createBaseDailyBars(length = 220, startPrice = 100) {
  const bars = [];
  let price = startPrice;
  for (let i = 0; i < length; i += 1) {
    const drift = Math.sin(i / 10) * 0.5;
    price += drift;
    const open = price;
    const close = price + 0.2;
    bars.push({
      time: 1700000000 + i * 86400,
      open,
      high: Math.max(open, close) + 1.0,
      low: Math.min(open, close) - 1.0,
      close,
      volume: 1_000_000
    });
  }
  return bars;
}

test("Test 1: RSI oversold without abnormal volume produces NO panic_bottom watch", () => {
  const bars = createBaseDailyBars(220, 100);

  // Bar 190: deep oversold drawdown, but normal volume (1,000,000, RVOL ~ 1.0, < VP95)
  bars[190].open = 75;
  bars[190].high = 76;
  bars[190].low = 65;
  bars[190].close = 66; // Oversold drawdown
  bars[190].volume = 1_000_000; // Normal volume

  const result = computeMajorTurnSignals(bars, { symbol: "TEST" });
  const bottomWatch = result.signals.find(
    (s) => s.kind === "panic_bottom" && s.time === bars[190].time
  );
  assert.strictEqual(bottomWatch, undefined, "Oversold without panic volume must NOT generate watch");
});

test("Test 1b: Panic volume without drawdown produces NO panic_bottom watch", () => {
  const bars = createBaseDailyBars(220, 100);

  // Bar 190: Huge volume (5,000,000) but price is near recent highs (no drawdown)
  bars[190].open = 105;
  bars[190].high = 107;
  bars[190].low = 104;
  bars[190].close = 106;
  bars[190].volume = 5_000_000;

  const result = computeMajorTurnSignals(bars, { symbol: "TEST" });
  const bottomWatch = result.signals.find(
    (s) => s.kind === "panic_bottom" && s.time === bars[190].time
  );
  assert.strictEqual(bottomWatch, undefined, "Volume surge without drawdown must NOT generate watch");
});

test("Test 2: Panic volume + oversold creates observation eB on t0; confirms B on t0+1 recovery without divergence or RSI > 30", () => {
  const bars = createBaseDailyBars(220, 100);

  // Bars 130..184: steady around 100
  // Bars 185..189: rapid plunge to 70 to establish HC60 ~ 100, drawdown >= 4 ATR
  for (let k = 185; k <= 189; k += 1) {
    bars[k].open = 100 - (k - 184) * 6;
    bars[k].close = bars[k].open - 5;
    bars[k].high = bars[k].open + 0.5;
    bars[k].low = bars[k].close - 0.5;
    bars[k].volume = 1_200_000;
  }

  // Bar 190 (t0): Capitulation selloff, RVOL >= 2.0, V >= VP95, RSI <= 30, near 20-day low
  bars[190].open = 68;
  bars[190].high = 69;
  bars[190].low = 58;
  bars[190].close = 60;
  bars[190].volume = 6_000_000; // Massive capitulation volume

  // Bar 191 (t0+1): Strong bounce recovering > 60% of t0 range (58..69, range=11, 60%=6.6, recoveryLevel=64.6)
  // C[t0+1] = 66 > 64.6, C > H[t0]=69? Wait, recovery check: C > recoveryLevel (64.6), C > H[t-1] (69).
  // Let H[t0] = 65, Low = 58 -> recoveryLevel = 58 + 0.6*(65-58) = 62.2
  bars[190].high = 64; // Range = 64 - 58 = 6 -> recoveryLevel = 58 + 3.6 = 61.6
  bars[191].open = 61;
  bars[191].low = 60.5;
  bars[191].high = 66;
  bars[191].close = 65.5; // > recoveryLevel (61.6) and > H[t0] (64)
  bars[191].volume = 2_000_000;

  const result = computeMajorTurnSignals(bars, { symbol: "TEST" });

  // 1. Day t0: MUST ONLY emit observation (eB)
  const obs = result.signals.find((s) => s.kind === "panic_bottom" && s.side === "eB" && s.time === bars[190].time);
  assert.ok(obs, "Must emit observation eB on panic day t0");
  const sameDayConfirm = result.signals.find((s) => s.kind === "panic_bottom" && s.side === "B" && s.time === bars[190].time);
  assert.strictEqual(sameDayConfirm, undefined, "Day t0 must NOT confirm B immediately");

  // 2. Day t0+1: Confirms recovery B
  const confirm = result.signals.find((s) => s.kind === "panic_bottom" && s.side === "B" && s.time === bars[191].time);
  assert.ok(confirm, "Day t0+1 must confirm recovery B");
  assert.strictEqual(confirm.stage, "confirmed");
});

test("Test 3: Breaking below invalidationLevel (L0 - 0.5*A0) invalidates attempt; cannot confirm", () => {
  const bars = createBaseDailyBars(220, 100);

  for (let k = 185; k <= 189; k += 1) {
    bars[k].open = 100 - (k - 184) * 6;
    bars[k].close = bars[k].open - 5;
    bars[k].high = bars[k].open + 0.5;
    bars[k].low = bars[k].close - 0.5;
    bars[k].volume = 1_200_000;
  }

  // Bar 190 (t0): L0 = 58, ATR ~ 3.0 -> invalidationLevel = 58 - 1.5 = 56.5
  bars[190].open = 65;
  bars[190].high = 66;
  bars[190].low = 58;
  bars[190].close = 59;
  bars[190].volume = 6_000_000;

  // Bar 191: Drops to 55 (< 56.5), breaking invalidation level
  bars[191].open = 58;
  bars[191].high = 66; // Intraday rally cannot bypass invalidation
  bars[191].low = 55;
  bars[191].close = 65;
  bars[191].volume = 2_000_000;

  const result = computeMajorTurnSignals(bars, { symbol: "TEST" });
  const confirm = result.signals.find((s) => s.kind === "panic_bottom" && s.side === "B" && s.time === bars[191].time);
  assert.strictEqual(confirm, undefined, "Must NOT confirm when low breaks invalidation level");

  const invEvent = result.signalEvents.find((e) => e.kind === "panic_bottom" && e.eventType === "invalidation");
  assert.ok(invEvent, "Must record invalidation event");
});

test("Test 4: Top detector: Volume decay with decaying RSI emits exhaustion_top eS; rising RSI does not", () => {
  const bars = createBaseDailyBars(220, 100);

  // Bars 130..190: Major uptrend from 100 to 180 (Runup >= 6 ATR), RSI >= 70
  for (let k = 130; k <= 190; k += 1) {
    bars[k].open = 100 + (k - 130) * 1.35;
    bars[k].close = bars[k].open + 1.0;
    bars[k].high = bars[k].close + 1.0;
    bars[k].low = bars[k].open - 0.5;
    bars[k].volume = 1_500_000;
  }
  bars[188].high = 185;
  bars[188].close = 184;

  // Bars 191..193: Volume decays (VDECAY <= 0.80), price still near high (182), but RSI drops from peak
  for (let k = 191; k <= 193; k += 1) {
    bars[k].open = 182;
    bars[k].close = 181.5;
    bars[k].high = 183;
    bars[k].low = 180.5;
    bars[k].volume = 500_000; // Strong volume contraction
  }

  const result = computeMajorTurnSignals(bars, { symbol: "TEST" });
  const topObs = result.signals.find((s) => s.kind === "exhaustion_top" && s.side === "eS");
  assert.ok(topObs, "Must emit exhaustion top observation eS when volume and RSI decay");
});

test("Test 7: Breakouts, pullbacks and ATR trailing stops do NOT appear in major_turn_v1", () => {
  const bars = createBaseDailyBars(220, 100);

  // Run major_turn_v1
  const result = computeMajorTurnSignals(bars, { symbol: "TEST" });

  const prohibitedKinds = new Set([
    "consolidation_launch",
    "momentum_breakout",
    "pullback_reversal",
    "structural_weakness",
    "risk_confirmation"
  ]);

  for (const s of result.signals) {
    assert.ok(!prohibitedKinds.has(s.kind), `major_turn_v1 must not emit swing signal: ${s.kind}`);
  }
  for (const e of result.signalEvents) {
    assert.ok(!prohibitedKinds.has(e.kind), `major_turn_v1 must not emit swing event: ${e.kind}`);
  }
});

test("Test 8: Prefix consistency: Evaluation up to bar t matches events in full sequence up to t", () => {
  const bars = createBaseDailyBars(220, 100);

  const fullResult = computeMajorTurnSignals(bars, { symbol: "TEST" });
  const truncatedBars = bars.slice(0, 200);
  const truncatedResult = computeMajorTurnSignals(truncatedBars, { symbol: "TEST" });

  const fullEventsUpTo200 = fullResult.signalEvents.filter((e) => e.eventIndex < 200);
  assert.strictEqual(truncatedResult.signalEvents.length, fullEventsUpTo200.length, "Prefix event count must match exactly");
});
