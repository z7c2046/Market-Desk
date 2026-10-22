import test from "node:test";
import assert from "node:assert/strict";
import { computeSignalsLegacyV1, computeSignalsLegacyV2 } from "../src/signals.js";

test("Legacy V2 Fix 1: %R oversold does not block exit from UP regime", () => {
  // Construct 60 bars so on bars 50..56 regime is UP (1)
  const bars = Array.from({ length: 60 }, (_, i) => ({
    time: 1000 + i * 86400,
    open: 100, high: 102, low: 98, close: 100, volume: 1_000_000
  }));

  const fast = new Array(60).fill(110);
  const slow = new Array(60).fill(100);

  // Bars 50..56 establish UP regime
  for (let i = 50; i <= 56; i++) {
    bars[i].close = 120;
    bars[i].high = 125;
    bars[i].low = 118;
    fast[i] = 130;
    slow[i] = 100;
  }

  // On bar 57: crash close to 90, low to 89, %R is <= -85 (oversold)
  bars[57].close = 90;
  bars[57].high = 92;
  bars[57].low = 89;
  fast[57] = 80;
  slow[57] = 100;

  const s1 = computeSignalsLegacyV1(bars, fast, slow);
  const s2 = computeSignalsLegacyV2(bars, fast, slow);

  const v1HasExit = s1.some((s) => s.time === bars[57].time && (s.side === "eS" || s.side === "S"));
  const v2HasExit = s2.some((s) => s.time === bars[57].time && (s.side === "eS" || s.side === "S"));

  assert.strictEqual(v1HasExit, false, "V1 blocks exit when oversold");
  assert.strictEqual(v2HasExit, true, "V2 allows exit from UP regime even when oversold");
});

test("Legacy V2 Fix 2: confirmBars=1 confirms on first bar while preserving early event", () => {
  const bars = Array.from({ length: 60 }, (_, i) => ({
    time: 1000 + i * 86400,
    open: 100, high: 102, low: 98, close: 100, volume: 1_000_000
  }));

  const fast = new Array(60).fill(100);
  const slow = new Array(60).fill(100);

  for (let i = 50; i <= 56; i++) {
    bars[i].close = 120;
    bars[i].high = 125;
    bars[i].low = 118;
    fast[i] = 130;
    slow[i] = 100;
  }

  const s1 = computeSignalsLegacyV1(bars, fast, slow, { confirmBars: 1 });
  const s2 = computeSignalsLegacyV2(bars, fast, slow, { confirmBars: 1 });

  const s1Bar55 = s1.filter((s) => s.time === bars[55].time).map((s) => s.side);
  const s2Bar55 = s2.filter((s) => s.time === bars[55].time).map((s) => s.side);

  // V1 only has eB on bar 55, B is delayed because of lastEarlyAt !== bar.time
  assert.deepStrictEqual(s1Bar55, ["eB"], "V1 fails to confirm on bar 1");
  // V2 has both eB and B on bar 55
  assert.deepStrictEqual(s2Bar55, ["eB", "B"], "V2 confirms on bar 1");
});
