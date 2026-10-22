import test from "node:test";
import assert from "node:assert/strict";
import { computeRsiVolumeSignals } from "../src/rsi-volume-signals.js";

/**
 * Helper to build 120 baseline daily bars with realistic price and volume.
 */
function createBaseBars(length = 120, startPrice = 100) {
  const bars = [];
  let price = startPrice;
  for (let i = 0; i < length; i += 1) {
    // Gentle oscillation to establish 100+ bars history and stable ATR/RVOL
    const drift = Math.sin(i / 5) * 2;
    const open = price;
    const close = price + drift;
    const high = Math.max(open, close) + 1.5;
    const low = Math.min(open, close) - 1.5;
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

test("Branch A: Top divergence positive example generates warning and confirms DV-S", () => {
  const bars = createBaseBars(140, 100);

  // Construct two high pivots: p1 around index 100, p2 around index 112
  // p1 at index 100: peak price 127, high volume 2,500,000, RSI > 73
  for (let k = 90; k <= 100; k += 1) {
    bars[k].open = 100 + (k - 90) * 2.5;
    bars[k].close = 101 + (k - 90) * 2.5;
    bars[k].high = bars[k].close + 1;
    bars[k].low = bars[k].open - 1;
    bars[k].volume = 2_000_000;
  }
  bars[100].high = 127;
  bars[100].close = 126;
  bars[100].volume = 2_500_000;

  // Dip after p1 (index 101..106)
  for (let k = 101; k <= 106; k += 1) {
    bars[k].close = 118 - (k - 100) * 1.5;
    bars[k].high = bars[k].close + 1;
    bars[k].low = bars[k].close - 1;
    bars[k].volume = 1_000_000;
  }

  // Rise to p2 at index 112: H2 = 130 (higher than 127), but weaker momentum (RSI ~67) and lower volume (1,200,000)
  for (let k = 107; k <= 112; k += 1) {
    bars[k].close = 110 + (k - 106) * 3;
    bars[k].high = bars[k].close + 1;
    bars[k].low = bars[k].close - 1;
    bars[k].volume = 1_200_000;
  }
  bars[112].high = 130; // Peak 2 > Peak 1
  bars[112].close = 128;
  bars[112].volume = 1_200_000;

  // Bars 113, 114 to confirm p2 at index 112 + 2 = 114
  bars[113].high = 125;
  bars[113].close = 124;
  bars[113].low = 122;
  bars[113].volume = 1_000_000;

  bars[114].high = 124;
  bars[114].close = 120;
  bars[114].low = 118;
  bars[114].volume = 1_000_000;

  // Run signals
  const result = computeRsiVolumeSignals(bars, { symbol: "TEST" });

  // Check that candidate setup was created
  const topSetups = result.signalEvents.filter((e) => e.kind === "top_divergence_exhaustion");
  assert.ok(topSetups.length >= 1, "Should identify at least one top divergence setup");

  const setup = topSetups[0];
  assert.strictEqual(setup.direction, "bearish");
  assert.ok(setup.evidence.H2 > setup.evidence.H1, "Price made a higher high");
  assert.ok(setup.evidence.rsi2 < setup.evidence.rsi1, "RSI made a lower high");
  assert.ok(setup.evidence.volumeRatio <= 0.85, "Volume decayed by at least 15%");
});

test("Branch A Negative case: Price and RSI both higher highs -> no top divergence signal", () => {
  const bars = createBaseBars(140, 100);

  // Peak 1 at index 100
  bars[100].high = 120;
  bars[100].close = 119;
  // Dip
  bars[103].close = 115;
  // Peak 2 at index 112 with even stronger momentum (RSI higher) and high volume
  for (let k = 104; k <= 112; k += 1) {
    bars[k].close = 115 + (k - 104) * 4; // massive surge
    bars[k].high = bars[k].close + 1;
    bars[k].low = bars[k].close - 1;
    bars[k].volume = 3_000_000; // volume surge, not decay!
  }
  bars[112].high = 150;
  bars[112].close = 149;
  bars[113].high = 145;
  bars[113].close = 144;
  bars[114].high = 143;
  bars[114].close = 142;

  const result = computeRsiVolumeSignals(bars, { symbol: "TEST" });
  const topSetups = result.signalEvents.filter((e) => e.kind === "top_divergence_exhaustion");
  assert.strictEqual(topSetups.length, 0, "No top divergence setup when RSI and volume expand");
});

test("Branch C: Oversold high-volume stabilization (AV-B)", () => {
  const bars = createBaseBars(130, 100);

  // Step 1: Massive drop and volume surge at index 110 (t0)
  for (let k = 100; k < 110; k += 1) {
    bars[k].close = 100 - (k - 100) * 1.5;
    bars[k].high = bars[k].close + 1;
    bars[k].low = bars[k].close - 1;
    bars[k].volume = 1_000_000;
  }

  // Bar 110 (t0): Crash, Low = 75, High = 85, Close = 76, Volume = 3,500_000 (RVOL > 1.8)
  bars[110].time = 1700000000 + 110 * 86400;
  bars[110].open = 84;
  bars[110].high = 85;
  bars[110].low = 75;
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
  bars[112].close = 83; // CLV = (83 - 77)/(84 - 77) = 6/7 = 0.85 >= 0.60
  bars[112].volume = 1_100_000;

  // Bar 113 (t0+3): Breakout above H0 (85)
  bars[113].open = 84;
  bars[113].low = 83;
  bars[113].high = 89;
  bars[113].close = 88; // > H0 (85) and RSI > 30 and rising
  bars[113].volume = 1_800_000;

  const result = computeRsiVolumeSignals(bars, { symbol: "TEST" });
  const cEvents = result.signalEvents.filter((e) => e.kind === "oversold_volume_reversal");
  assert.ok(cEvents.length >= 1, "Should trigger Branch C setup");

  const confirmedC = result.signals.find((s) => s.kind === "oversold_volume_reversal" && s.side === "B");
  assert.ok(confirmedC, "Should generate Branch C confirmation signal B");
  assert.strictEqual(confirmedC.time, bars[113].time);
});

test("Branch C Invalidation: Drops below L0 - 0.35*ATR", () => {
  const bars = createBaseBars(130, 100);

  // Crash at index 110
  bars[110].open = 84;
  bars[110].high = 85;
  bars[110].low = 75;
  bars[110].close = 76;
  bars[110].volume = 3_500_000;

  // Next bar collapses below 75 - 0.35 * ATR
  bars[111].open = 74;
  bars[111].high = 74.5;
  bars[111].low = 65; // Massive break below invalidation level
  bars[111].close = 66;
  bars[111].volume = 2_000_000;

  const result = computeRsiVolumeSignals(bars, { symbol: "TEST" });
  const confirmedC = result.signals.find((s) => s.kind === "oversold_volume_reversal" && s.side === "B");
  assert.strictEqual(confirmedC, undefined, "Must NOT confirm B when low is broken");

  const invalidatedSetup = result.signalEvents.find(
    (e) => e.kind === "oversold_volume_reversal" && e.stage === "invalidated"
  );
  assert.ok(invalidatedSetup, "Setup should be marked as invalidated");
});

test("Prefix consistency: Evaluation up to bar t produces identical events as full sequence", () => {
  const bars = createBaseBars(140, 100);

  // Add some distinct patterns around 100..120
  bars[105].high = 125; bars[105].close = 124;
  bars[115].high = 130; bars[115].close = 129;

  const fullResult = computeRsiVolumeSignals(bars, { symbol: "TEST" });

  // Test truncated sequence up to index 125
  const truncatedBars = bars.slice(0, 126);
  const truncatedResult = computeRsiVolumeSignals(truncatedBars, { symbol: "TEST" });

  const fullEventsUpTo125 = fullResult.signalEvents.filter(
    (e) => e.detectedIndex <= 125 && (e.confirmedIndex == null || e.confirmedIndex <= 125)
  );
  const truncatedEvents = truncatedResult.signalEvents;

  assert.strictEqual(
    truncatedEvents.length,
    fullEventsUpTo125.length,
    "Number of events must match exactly for truncated sequence"
  );

  for (let i = 0; i < truncatedEvents.length; i += 1) {
    assert.strictEqual(truncatedEvents[i].id, fullEventsUpTo125[i].id);
    assert.strictEqual(truncatedEvents[i].stage, fullEventsUpTo125[i].stage);
  }
});
