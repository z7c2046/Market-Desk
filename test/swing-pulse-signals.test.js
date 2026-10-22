import test from "node:test";
import assert from "node:assert/strict";
import { computeRsiVolumeSignals, computeSwingPulseSignals } from "../src/rsi-volume-signals.js";
import { computeTrendRegimeSeries, buildSynchronizedRegimeMap } from "../src/regime.js";

function createUptrendBars(length = 140, startPrice = 100) {
  const bars = [];
  let price = startPrice;
  for (let i = 0; i < length; i += 1) {
    // Upward drift so 50 SMA and 20 SMA are rising
    const drift = 0.35 + Math.sin(i / 6) * 0.5;
    const open = price;
    const close = price + drift;
    const high = Math.max(open, close) + 1.0;
    const low = Math.min(open, close) - 1.0;
    price = close;
    bars.push({
      time: 1700000000 + i * 86400,
      open,
      high,
      low,
      close,
      volume: 1_000_000
    });
  }
  return bars;
}

test("Branch D: Consolidation Breakout generates launch_watch eB and launch_confirmed B", () => {
  const bars = createUptrendBars(130, 100);

  // Index 80..100: strong upward run to establish 20-day high ~ 150 at index 100
  for (let k = 80; k <= 100; k += 1) {
    bars[k].open = 110 + (k - 80) * 2;
    bars[k].close = 111 + (k - 80) * 2;
    bars[k].high = bars[k].close + 1.0;
    bars[k].low = bars[k].open - 0.5;
    bars[k].volume = 1_500_000;
  }
  bars[100].high = 152;
  bars[100].close = 150;

  // Index 101..108: consolidation near high with low amplitude and low volume
  for (let k = 101; k <= 108; k += 1) {
    bars[k].open = 148;
    bars[k].close = 149;
    bars[k].high = 150;
    bars[k].low = 147.5;
    bars[k].volume = 600_000; // volume contraction
  }

  // Index 109: breakout above 152 with surge volume 2,500,000 (RVOL > 1.5)
  bars[109].open = 149;
  bars[109].close = 155; // breaks 20-day high (152)
  bars[109].high = 156;
  bars[109].low = 148.5;
  bars[109].volume = 2_800_000;

  const result = computeSwingPulseSignals(bars, { symbol: "TEST" });

  // 1. Should have emitted consolidation_launch observation (eB) during tight consolidation
  const launchObs = result.signals.filter(
    (s) => s.kind === "consolidation_launch" && s.side === "eB"
  );
  assert.ok(launchObs.length >= 1, "Should emit consolidation_launch observation (eB)");

  // 2. Should have confirmed consolidation breakout on bar 109 (B)
  const launchConfirm = result.signals.find(
    (s) => s.kind === "consolidation_launch" && s.side === "B" && s.time === bars[109].time
  );
  assert.ok(launchConfirm, "Should confirm launch breakout B on bar 109");
  assert.strictEqual(launchConfirm.direction, "bullish");
  assert.strictEqual(launchConfirm.stage, "confirmed");
});

test("Branch E: Pullback Reversal in uptrend confirms B near 20 SMA with volume contraction", () => {
  const bars = createUptrendBars(135, 100);

  // Upward trend to index 110
  for (let k = 90; k <= 110; k += 1) {
    bars[k].open = 120 + (k - 90) * 1.5;
    bars[k].close = 121 + (k - 90) * 1.5;
    bars[k].high = bars[k].close + 1;
    bars[k].low = bars[k].open - 0.5;
    bars[k].volume = 1_200_000;
  }

  // Mild pullback to 20 SMA on bars 111..114 with shrinking volume and RSI pulling back to ~48
  for (let k = 111; k <= 114; k += 1) {
    bars[k].open = 149 - (k - 110) * 2;
    bars[k].close = 148 - (k - 110) * 2;
    bars[k].high = bars[k].open + 0.5;
    bars[k].low = bars[k].close - 0.5;
    bars[k].volume = 700_000; // contraction
  }

  // Bar 115: bounces and breaks above the high of the past 3 days (bars 112..114 high ~ 145)
  bars[115].open = 141;
  bars[115].close = 147;
  bars[115].high = 147.5;
  bars[115].low = 140.5;
  bars[115].volume = 1_400_000;

  const result = computeSwingPulseSignals(bars, { symbol: "TEST" });
  const pullbackSignals = result.signals.filter(
    (s) => s.kind === "pullback_reversal" && s.side === "B"
  );
  assert.ok(pullbackSignals.length >= 1, "Should detect pullback reversal signal");
  assert.strictEqual(pullbackSignals[0].direction, "bullish");
});

test("Branch F: Independent Weakness Warning eS fires on 5-day low break + volume surge + low CLV without top divergence", () => {
  const bars = createUptrendBars(130, 100);

  // Steady trading around 140 for bars 100..109
  for (let k = 100; k < 110; k += 1) {
    bars[k].open = 140;
    bars[k].close = 141;
    bars[k].high = 142;
    bars[k].low = 139.5;
    bars[k].volume = 1_000_000;
  }

  // Bar 110: Sudden heavy volume breakdown below past 5-day low (139.5), closes near day low (CLV <= 0.25)
  bars[110].open = 140;
  bars[110].high = 140.5;
  bars[110].low = 132;
  bars[110].close = 132.5; // (132.5 - 132) / (140.5 - 132) = 0.5 / 8.5 = 0.058 <= 0.25
  bars[110].volume = 2_500_000; // RVOL >= 1.2

  const result = computeSwingPulseSignals(bars, { symbol: "TEST" });
  const weaknessWarnings = result.signals.filter(
    (s) => s.kind === "structural_weakness" && s.side === "eS" && s.time === bars[110].time
  );

  assert.ok(weaknessWarnings.length >= 1, "Must emit independent weakness warning (eS)");
  assert.strictEqual(weaknessWarnings[0].reason, "breakdown_volume_weakness_warning");
  assert.strictEqual(weaknessWarnings[0].direction, "bearish");
});

test("Branch G: Risk confirmation S triggers on 3xATR trailing stop break without requiring RSI or divergence", () => {
  const bars = createUptrendBars(130, 100);

  // Entry triggered by consolidation breakout at bar 100
  bars[100].open = 140;
  bars[100].close = 150;
  bars[100].high = 151;
  bars[100].low = 139;
  bars[100].volume = 3_000_000;

  // Next few bars peak at 155
  bars[101].open = 150; bars[101].close = 155; bars[101].high = 156; bars[101].low = 149;
  bars[102].open = 155; bars[102].close = 154; bars[102].high = 156; bars[102].low = 152;

  // ATR is ~ 2.0. Peak close is 155. 3 * ATR = 6.0. Trailing stop is ~ 149.
  // Bar 103: Sharp plunge breaking trailing stop to 142
  bars[103].open = 151;
  bars[103].close = 142; // Below trailing stop (~149)
  bars[103].low = 141;
  bars[103].high = 151.5;
  bars[103].volume = 1_500_000;

  const result = computeSwingPulseSignals(bars, { symbol: "TEST", atrTrailingMult: 3.0 });
  const riskExits = result.signals.filter(
    (s) => s.kind === "risk_confirmation" && s.side === "S" && s.time === bars[103].time
  );

  assert.ok(riskExits.length >= 1, "Must trigger risk confirmation S on ATR trailing stop break");
  assert.strictEqual(riskExits[0].reason, "atr_trailing_stop_exit");
  assert.strictEqual(riskExits[0].direction, "bearish");
});

test("Divergence mode: Adaptive mode captures divergence even without extreme 70/30 or volume decay", () => {
  // Construct baseline identical to Branch A test in signals.test.js
  const bars = [];
  let price = 100;
  for (let i = 0; i < 140; i += 1) {
    const drift = Math.sin(i / 5) * 2;
    const open = price;
    const close = price + drift;
    price = close;
    bars.push({
      time: 1700000000 + i * 86400,
      open,
      high: Math.max(open, close) + 1.5,
      low: Math.min(open, close) - 1.5,
      close,
      volume: 1_000_000
    });
  }

  // p1 at index 100: peak price 127, volume 2,000,000
  for (let k = 90; k <= 100; k += 1) {
    bars[k].open = 100 + (k - 90) * 2.5;
    bars[k].close = 101 + (k - 90) * 2.5;
    bars[k].high = bars[k].close + 1;
    bars[k].low = bars[k].open - 1;
    bars[k].volume = 2_000_000;
  }
  bars[100].high = 127;
  bars[100].close = 126;
  bars[100].volume = 2_000_000;

  // Dip after p1 (index 101..106)
  for (let k = 101; k <= 106; k += 1) {
    bars[k].close = 118 - (k - 100) * 1.5;
    bars[k].high = bars[k].close + 1;
    bars[k].low = bars[k].close - 1;
    bars[k].volume = 1_000_000;
  }

  // Rise to p2 at index 112: H2 = 130 > 127, RSI lower, but volume is 2,200,000 (NO volume decay! Q2/Q1 > 1.0)
  for (let k = 107; k <= 112; k += 1) {
    bars[k].close = 110 + (k - 106) * 3;
    bars[k].high = bars[k].close + 1;
    bars[k].low = bars[k].close - 1;
    bars[k].volume = 2_200_000;
  }
  bars[112].high = 130;
  bars[112].close = 128;
  bars[112].volume = 2_200_000;

  // Bars 113, 114 to confirm p2 at index 112 + 2 = 114
  bars[113].high = 125; bars[113].close = 124; bars[113].low = 122; bars[113].volume = 1_000_000;
  bars[114].high = 124; bars[114].close = 120; bars[114].low = 118; bars[114].volume = 1_000_000;

  // Run in strict mode: should NOT trigger because volume did not decay (2.2M / 2.0M > 0.85)
  const strictResult = computeSwingPulseSignals(bars, { symbol: "TEST", divergenceMode: "strict" });
  const strictTopDiv = strictResult.signalEvents.filter((e) => e.kind === "top_divergence_exhaustion");
  assert.strictEqual(strictTopDiv.length, 0, "Strict mode must drop setup when volume decay not met");

  // Run in adaptive mode: should trigger because price made higher high and RSI made lower high
  const adaptiveResult = computeSwingPulseSignals(bars, { symbol: "TEST", divergenceMode: "adaptive" });
  const adaptiveTopDiv = adaptiveResult.signalEvents.filter((e) => e.kind === "top_divergence_exhaustion");
  assert.ok(adaptiveTopDiv.length >= 1, "Adaptive mode must capture divergence even without volume decay");
});

test("Regime awareness: Bearish regime raises breakout RVOL threshold", () => {
  const bars = createUptrendBars(130, 100);

  // Index 80..100 run to high 150
  for (let k = 80; k <= 100; k += 1) {
    bars[k].open = 110 + (k - 80) * 2;
    bars[k].close = 111 + (k - 80) * 2;
    bars[k].high = bars[k].close + 1.0;
    bars[k].low = bars[k].open - 0.5;
    bars[k].volume = 1_500_000;
  }
  bars[100].high = 152;
  bars[100].close = 150;

  // Index 101..108 consolidation
  for (let k = 101; k <= 108; k += 1) {
    bars[k].open = 148;
    bars[k].close = 149;
    bars[k].high = 150;
    bars[k].low = 147.5;
    bars[k].volume = 600_000;
  }

  // Index 109: breakout with RVOL ~ 1.66 (1.9M / 1.14M = 1.66, which is > 1.5 but < 1.8)
  bars[109].open = 149;
  bars[109].close = 155;
  bars[109].high = 156;
  bars[109].low = 148.5;
  bars[109].volume = 1_900_000;

  // 1. With neutral regime: should confirm (RVOL 1.66 >= 1.5)
  const neutralRegime = new Map([[bars[109].time, { regime: "neutral" }]]);
  const resNeutral = computeSwingPulseSignals(bars, { symbol: "TEST", regimeMap: neutralRegime, consolidationBreakoutRvol: 1.5 });
  const confirmNeutral = resNeutral.signals.find((s) => s.kind === "consolidation_launch" && s.side === "B" && s.time === bars[109].time);
  assert.ok(confirmNeutral, "Standard regime confirms at RVOL >= 1.5");

  // 2. With bearish regime: reqRvol is raised to 1.8, so RVOL 1.66 does NOT confirm
  const bearishRegime = new Map([[bars[109].time, { regime: "bearish" }]]);
  const resBearish = computeSwingPulseSignals(bars, { symbol: "TEST", regimeMap: bearishRegime });
  const confirmBearish = resBearish.signals.find((s) => s.kind === "consolidation_launch" && s.side === "B" && s.time === bars[109].time);
  assert.strictEqual(confirmBearish, undefined, "Bearish regime must filter out breakout below 1.8 RVOL");
});

test("Item 1 Counter-example: Consecutive B signals do not lower trailing stop, and price drop below original trailing line must exit", () => {
  const bars = createUptrendBars(130, 100);

  // Smooth bars 90..99 up to ~ 153 to keep ATR ~ 2.8
  for (let k = 90; k <= 99; k++) {
    bars[k].open = 150 + (k - 90) * 0.4;
    bars[k].close = bars[k].open + 0.3;
    bars[k].high = bars[k].close + 1.0;
    bars[k].low = bars[k].open - 1.0;
    bars[k].volume = 1_000_000;
  }

  // Setup initial consolidation breakout at bar 100
  bars[100].open = 153.8;
  bars[100].close = 154.3888;
  bars[100].high = 155.0;
  bars[100].low = 153.0;
  bars[100].volume = 3_000_000;

  // Next bar 101: Price pulls back slightly to 152.3835 and triggers a secondary buy or signal attempt
  bars[101].open = 153.0;
  bars[101].close = 152.3835;
  bars[101].high = 153.5;
  bars[101].low = 151.5;
  bars[101].volume = 2_500_000;

  // Next bar 102: Price plunges to 147, which is < trailing risk line (~147.15)
  bars[102].open = 150.0;
  bars[102].close = 147.0;
  bars[102].high = 150.5;
  bars[102].low = 146.8;
  bars[102].volume = 1_800_000;

  const result = computeSwingPulseSignals(bars, { symbol: "TEST", atrTrailingMult: 3.0 });

  // 1. Bar 100 must have entered B
  const buy100 = result.signals.find((s) => s.side === "B" && s.time === bars[100].time);
  assert.ok(buy100, "Must generate B on bar 100");

  // 2. Bar 102 MUST trigger risk exit S because 147.0 < trailing stop
  const exit102 = result.signals.find((s) => s.side === "S" && s.time === bars[102].time);
  assert.ok(exit102, "Must trigger risk exit S on bar 102 when dropping below original trailing line");
  assert.strictEqual(exit102.reason, "atr_trailing_stop_exit");
  assert.ok(exit102.triggerLevel >= 147.0, "Risk line must not have been lowered below 147.0");

  // 3. Position must be closed (not continuing to hold)
  assert.strictEqual(result.activePosition, null, "Active position must be null after trailing stop exit");
});

test("Item 2 Counter-example: Strict baseline algorithm rsi_volume_v1 never emits swing_pulse branches", () => {
  const bars = createUptrendBars(130, 100);

  // Bar 100: consolidation breakout
  bars[100].open = 148;
  bars[100].close = 155;
  bars[100].high = 156;
  bars[100].low = 147.5;
  bars[100].volume = 3_000_000;

  // Bar 105: breakdown volume weakness
  bars[105].open = 150;
  bars[105].high = 150.5;
  bars[105].low = 135;
  bars[105].close = 135.5;
  bars[105].volume = 3_000_000;

  // Compute with strict rsi_volume_v1 baseline
  const baselineResult = computeRsiVolumeSignals(bars, {
    symbol: "TEST",
    algorithm: "rsi_volume_v1",
    divergenceMode: "strict"
  });

  const prohibitedKinds = new Set([
    "consolidation_launch",
    "momentum_breakout",
    "pullback_reversal",
    "structural_weakness",
    "risk_confirmation"
  ]);

  for (const s of baselineResult.signals) {
    assert.ok(!prohibitedKinds.has(s.kind), `Baseline must not emit swing branch kind: ${s.kind}`);
  }
  for (const e of baselineResult.signalEvents) {
    assert.ok(!prohibitedKinds.has(e.kind), `Baseline must not emit swing branch event: ${e.kind}`);
  }
});

test("Item 2 Benchmark check: Branch C tolerance allows entry when barLow <= minPast20Low + 0.25 * currentAtr", () => {
  const bars = [];
  let price = 100;
  for (let i = 0; i < 130; i += 1) {
    const drift = Math.sin(i / 5) * 2;
    price += drift;
    bars.push({
      time: 1700000000 + i * 86400,
      open: price,
      high: price + 1.5,
      low: price - 1.5,
      close: price,
      volume: 1_000_000
    });
  }

  // Bar 105: establishes 20-day low at 74.8
  bars[105].low = 74.8;

  // Crash at index 110: RSI <= 30, volume 3.5M
  // Low is 75.0 (which is > 74.8, but <= 74.8 + 0.25 * ATR (~0.5) = 75.3)
  bars[110].open = 84;
  bars[110].high = 85;
  bars[110].low = 75.0;
  bars[110].close = 76;
  bars[110].volume = 3_500_000;

  // Bar 111 (t0+1): holds low
  bars[111].open = 77;
  bars[111].low = 76;
  bars[111].high = 80;
  bars[111].close = 78;
  bars[111].volume = 1_200_000;

  // Bar 112 (t0+2): Support confirmed (CLV >= 0.60, close > 76, RSI up)
  bars[112].open = 78;
  bars[112].low = 77;
  bars[112].high = 84;
  bars[112].close = 83;
  bars[112].volume = 1_100_000;

  // Bar 113 (t0+3): Breakout above H0 (85)
  bars[113].open = 84;
  bars[113].low = 83;
  bars[113].high = 89;
  bars[113].close = 88;
  bars[113].volume = 1_800_000;

  const result = computeRsiVolumeSignals(bars, { symbol: "TEST", algorithm: "rsi_volume_v1" });
  const cEvents = result.signalEvents.filter((e) => e.kind === "oversold_volume_reversal");
  assert.ok(cEvents.length >= 1, "Should trigger Branch C setup when low is within 0.25 ATR of 20-day low");
  const confirmedC = result.signals.find((s) => s.kind === "oversold_volume_reversal" && s.side === "B");
  assert.ok(confirmedC, "Should generate Branch C confirmation signal B");
});

test("Item 4 Benchmark check: Missing or insufficient benchmark history (< 50 bars) classifies as unknown, never bearish", () => {
  // Only 30 bars (less than 50-day SMA period)
  const qqqShort = Array.from({ length: 30 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    close: 400 + i
  }));
  const smhShort = Array.from({ length: 30 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    close: 200 + i
  }));

  const stockBars = Array.from({ length: 30 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    close: 100 + i
  }));

  const regimeMap = buildSynchronizedRegimeMap(stockBars, qqqShort, smhShort);
  for (const bar of stockBars) {
    const entry = regimeMap.get(bar.time);
    assert.strictEqual(entry.regime, "unknown", "Pre-warmup benchmark must be classified as 'unknown'");
    assert.strictEqual(entry.qqqUp, null);
    assert.strictEqual(entry.smhUp, null);
  }
});

test("Item 5 Parameter wiring: consolidationBreakoutRvol and regimeFilterEnabled: false are strictly respected", () => {
  const bars = createUptrendBars(130, 100);

  // Index 80..100 run to high 150
  for (let k = 80; k <= 100; k += 1) {
    bars[k].open = 110 + (k - 80) * 2;
    bars[k].close = 111 + (k - 80) * 2;
    bars[k].high = bars[k].close + 1.0;
    bars[k].low = bars[k].open - 0.5;
    bars[k].volume = 1_500_000;
  }
  bars[100].high = 152;
  bars[100].close = 150;

  // Index 101..108 consolidation
  for (let k = 101; k <= 108; k += 1) {
    bars[k].open = 148;
    bars[k].close = 149;
    bars[k].high = 150;
    bars[k].low = 147.5;
    bars[k].volume = 600_000;
  }

  // Index 109: breakout with RVOL ~ 1.66 (1.9M / 1.14M = 1.66, which is > 1.5 but < 1.8)
  bars[109].open = 149;
  bars[109].close = 155;
  bars[109].high = 156;
  bars[109].low = 148.5;
  bars[109].volume = 1_900_000;

  // 1. With consolidationBreakoutRvol = 2.0, RVOL 1.66 is NOT enough -> no confirmation
  const resHighThreshold = computeSwingPulseSignals(bars, {
    symbol: "TEST",
    consolidationBreakoutRvol: 2.0
  });
  const confirmHigh = resHighThreshold.signals.find(
    (s) => s.kind === "consolidation_launch" && s.side === "B" && s.time === bars[109].time
  );
  assert.strictEqual(confirmHigh, undefined, "High RVOL threshold (2.0) must not confirm at 1.66 RVOL");

  // 2. In bearish regime, but regimeFilterEnabled: false -> RVOL 1.66 SHOULD confirm (not raised to 1.8)
  const bearishRegime = new Map([[bars[109].time, { regime: "bearish" }]]);
  const resFilterDisabled = computeSwingPulseSignals(bars, {
    symbol: "TEST",
    regimeMap: bearishRegime,
    regimeFilterEnabled: false,
    consolidationBreakoutRvol: 1.5
  });
  const confirmDisabled = resFilterDisabled.signals.find(
    (s) => s.kind === "consolidation_launch" && s.side === "B" && s.time === bars[109].time
  );
  assert.ok(confirmDisabled, "When regimeFilterEnabled is false, bearish regime penalty must not apply");
});

test("Item 7 Rule distinction: Breakout without contraction is labeled momentum_breakout, not consolidation_launch", () => {
  const bars = createUptrendBars(130, 100);

  // Past 5 days have WIDE amplitude and HIGH volume (no consolidation contraction)
  for (let k = 101; k <= 108; k += 1) {
    bars[k].open = 140;
    bars[k].close = 149;
    bars[k].high = 152;
    bars[k].low = 138; // Wide 14-point amplitude
    bars[k].volume = 2_000_000; // High volume
  }

  // Bar 109: Surges to new 20-day high with massive RVOL
  bars[109].open = 149;
  bars[109].close = 158;
  bars[109].high = 159;
  bars[109].low = 148;
  bars[109].volume = 3_500_000;

  const result = computeSwingPulseSignals(bars, { symbol: "TEST" });
  const breakoutB = result.signals.find((s) => s.side === "B" && s.time === bars[109].time);
  assert.ok(breakoutB, "Should confirm breakout B");
  assert.strictEqual(breakoutB.kind, "momentum_breakout", "Raw breakout without contraction must be momentum_breakout, not consolidation_launch");
});
