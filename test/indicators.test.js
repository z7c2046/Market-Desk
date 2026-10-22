import test from "node:test";
import assert from "node:assert/strict";
import {
  rsiSeries,
  wilderAtrSeries,
  rvol20Series,
  clvSeries,
  volumeMaSeries,
  smaSeries,
  meanAmplitudeSeries,
  highestHighSeries,
  lowestLowSeries
} from "../src/indicators.js";

test("RSI boundary conditions", () => {
  // 1. Flat price series returns 50 (project convention)
  const flatBars = Array.from({ length: 30 }, (_, i) => ({
    time: 1000 + i * 86400,
    open: 100,
    high: 100,
    low: 100,
    close: 100
  }));
  const flatRsi = rsiSeries(flatBars, 14);
  assert.strictEqual(flatRsi[13], null); // insufficient (< 15 bars)
  assert.strictEqual(flatRsi[14], 50);   // flat market convention
  assert.strictEqual(flatRsi[29], 50);

  // 2. Monotonically increasing returns 100
  const upBars = Array.from({ length: 30 }, (_, i) => ({
    time: 1000 + i * 86400,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i
  }));
  const upRsi = rsiSeries(upBars, 14);
  assert.strictEqual(upRsi[14], 100);
  assert.strictEqual(upRsi[29], 100);

  // 3. Monotonically decreasing returns 0
  const downBars = Array.from({ length: 30 }, (_, i) => ({
    time: 1000 + i * 86400,
    open: 100 - i,
    high: 101 - i,
    low: 99 - i,
    close: 100 - i
  }));
  const downRsi = rsiSeries(downBars, 14);
  assert.strictEqual(downRsi[14], 0);
  assert.strictEqual(downRsi[29], 0);

  // 4. Insufficient history (< 15 bars) returns nulls
  const shortBars = Array.from({ length: 14 }, (_, i) => ({
    time: 1000 + i * 86400,
    close: 100 + i
  }));
  const shortRsi = rsiSeries(shortBars, 14);
  assert.strictEqual(shortRsi.length, 14);
  assert.ok(shortRsi.every((v) => v === null));
});

test("Wilder ATR series", () => {
  const bars = Array.from({ length: 25 }, (_, i) => ({
    time: 1000 + i * 86400,
    open: 100,
    high: 105,
    low: 95,
    close: 100
  }));
  const atr = wilderAtrSeries(bars, 14);
  assert.strictEqual(atr[12], null);
  // Each bar has true range = 10, so ATR should be 10
  assert.strictEqual(Math.round(atr[13]), 10);
  assert.strictEqual(Math.round(atr[24]), 10);
});

test("RVOL20 series excludes current day and handles zero volume", () => {
  // 25 bars with constant volume 1000
  const bars = Array.from({ length: 25 }, (_, i) => ({
    time: 1000 + i * 86400,
    volume: 1000
  }));
  // On bar 21, volume surges to 2000
  bars[21].volume = 2000;

  const rvol = rvol20Series(bars, 20);
  assert.strictEqual(rvol[19], null); // index 19 has only 19 prior bars
  // bar 20: volume is 1000, prior 20 bars are 1000 each -> rvol = 1.0
  assert.strictEqual(rvol[20], 1.0);
  // bar 21: volume is 2000, prior 20 bars (indices 1..20) are 1000 each -> rvol = 2000 / 1000 = 2.0
  assert.strictEqual(rvol[21], 2.0);

  // Bar 22: volume is 1000, prior 20 bars includes bar 21 (2000) and 19 of 1000 -> mean = 21000 / 20 = 1050
  assert.strictEqual(Math.round(rvol[22] * 100) / 100, Math.round((1000 / 1050) * 100) / 100);

  // If a bar in past 20 has zero volume (e.g. trading halt)
  const haltBars = Array.from({ length: 25 }, (_, i) => ({
    time: 1000 + i * 86400,
    volume: 1000
  }));
  haltBars[5].volume = 0; // halt
  const haltRvol = rvol20Series(haltBars, 20);
  assert.strictEqual(haltRvol[21], null); // contains zero in window
});

test("Close Location Value (CLV)", () => {
  const bars = [
    { high: 110, low: 100, close: 110 }, // at high -> 1.0
    { high: 110, low: 100, close: 100 }, // at low -> 0.0
    { high: 110, low: 100, close: 105 }, // at midpoint -> 0.5
    { high: 100, low: 100, close: 100 }  // flat -> 0.5
  ];
  const clv = clvSeries(bars);
  assert.strictEqual(clv[0], 1.0);
  assert.strictEqual(clv[1], 0.0);
  assert.strictEqual(clv[2], 0.5);
  assert.strictEqual(clv[3], 0.5);
});

test("SMA series calculation", () => {
  const vals = [10, 20, 30, 40, 50];
  const sma3 = smaSeries(vals, 3);
  assert.strictEqual(sma3[0], null);
  assert.strictEqual(sma3[1], null);
  assert.strictEqual(sma3[2], 20); // (10 + 20 + 30) / 3 = 20
  assert.strictEqual(sma3[3], 30); // (20 + 30 + 40) / 3 = 30
  assert.strictEqual(sma3[4], 40); // (30 + 40 + 50) / 3 = 40
});

test("Mean Amplitude series and past High/Low series", () => {
  const bars = [
    { high: 105, low: 95, close: 100 }, // range = 10, amp = 0.1
    { high: 106, low: 96, close: 100 }, // range = 10, amp = 0.1
    { high: 108, low: 92, close: 100 }, // range = 16, amp = 0.16
    { high: 110, low: 90, close: 100 }  // range = 20, amp = 0.2
  ];

  const amp2 = meanAmplitudeSeries(bars, 2);
  assert.strictEqual(amp2[0], null);
  assert.strictEqual(amp2[1], 0.1);
  assert.strictEqual(amp2[2], 0.13); // (0.1 + 0.16) / 2 = 0.13

  const hh = highestHighSeries(bars, 2, true);
  // On bar 2: past 2 bars are index 0, 1 -> max(105, 106) = 106
  assert.strictEqual(hh[2], 106);
  // On bar 3: past 2 bars are index 1, 2 -> max(106, 108) = 108
  assert.strictEqual(hh[3], 108);

  const ll = lowestLowSeries(bars, 2, true);
  // On bar 2: past 2 bars are index 0, 1 -> min(95, 96) = 95
  assert.strictEqual(ll[2], 95);
  // On bar 3: past 2 bars are index 1, 2 -> min(96, 92) = 92
  assert.strictEqual(ll[3], 92);
});
