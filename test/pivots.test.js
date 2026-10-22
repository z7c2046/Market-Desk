import test from "node:test";
import assert from "node:assert/strict";
import { findPivots, pairPivot } from "../src/pivots.js";

test("Pivot detection - Left 3 / Right 2 strict extrema", () => {
  // Construct a sequence with a clear peak at index 5 and trough at index 12
  // Indices: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
  const highs = [10, 12, 14, 16, 18, 25, 18, 16, 14, 12, 10,  8,  5,  8, 10, 12];
  const lows  = [ 8, 10, 12, 14, 16, 22, 16, 14, 12, 10,  8,  6,  2,  6,  8, 10];
  const bars = highs.map((h, i) => ({
    time: 1000 + i * 86400,
    open: h - 1,
    high: h,
    low: lows[i],
    close: lows[i] + 1
  }));

  const { highs: detectedHighs, lows: detectedLows } = findPivots(bars, { leftBars: 3, rightBars: 2 });

  // Peak is at index 5 (value 25), confirmed at index 5 + 2 = 7
  assert.strictEqual(detectedHighs.length, 1);
  assert.strictEqual(detectedHighs[0].pivotIndex, 5);
  assert.strictEqual(detectedHighs[0].price, 25);
  assert.strictEqual(detectedHighs[0].confirmedIndex, 7);

  // Trough is at index 12 (value 2), confirmed at index 12 + 2 = 14
  assert.strictEqual(detectedLows.length, 1);
  assert.strictEqual(detectedLows[0].pivotIndex, 12);
  assert.strictEqual(detectedLows[0].price, 2);
  assert.strictEqual(detectedLows[0].confirmedIndex, 14);
});

test("Pivot detection - Equal highs/lows do not form strict pivots", () => {
  const highs = [10, 12, 14, 20, 20, 18, 16, 14, 12, 10];
  const bars = highs.map((h, i) => ({
    time: 1000 + i * 86400,
    open: h - 2,
    high: h,
    low: h - 4,
    close: h - 1
  }));

  const { highs: detectedHighs } = findPivots(bars, { leftBars: 3, rightBars: 2 });
  // Neither index 3 nor 4 strictly exceeds the other, so no pivot
  assert.strictEqual(detectedHighs.length, 0);
});

test("Pivot pairing - Nearest predecessor within 5..60 bars", () => {
  // Suppose we have three confirmed highs: p1 at 10, p2 at 20, p3 at 28
  const highs = [
    { type: "high", pivotIndex: 10, confirmedIndex: 12, price: 100, pivotTime: 1000 },
    { type: "high", pivotIndex: 20, confirmedIndex: 22, price: 105, pivotTime: 2000 },
    { type: "high", pivotIndex: 23, confirmedIndex: 25, price: 106, pivotTime: 2300 } // only 3 bars away from p2!
  ];

  // Pair for p2 (index 20): distance to p1 is 10 (within 5..60)
  const pair2 = pairPivot(highs[1], highs, 5, 60);
  assert.ok(pair2);
  assert.strictEqual(pair2.p1.pivotIndex, 10);
  assert.strictEqual(pair2.p2.pivotIndex, 20);

  // Pair for p3 (index 23): distance to p2 is 3 (< 5, too close!). Distance to p1 is 13 (valid).
  // Nearest satisfying 5..60 is p1 (index 10)
  const pair3 = pairPivot(highs[2], highs, 5, 60);
  assert.ok(pair3);
  assert.strictEqual(pair3.p1.pivotIndex, 10);
});
