import test from "node:test";
import assert from "node:assert/strict";
import { findFreshSignals } from "../src/radar.js";

test("Radar: findFreshSignals calculates ageBars and filters outside lookback", () => {
  const bars = Array.from({ length: 20 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    close: 100 + i
  }));

  const snapshot = {
    bars,
    signals: [
      { time: bars[10].time, side: "B", direction: "bullish" }, // 9 bars ago
      { time: bars[18].time, side: "eS", direction: "bearish" }  // 1 bar ago
    ]
  };

  // With lookback = 5 (indices 15..19)
  const fresh = findFreshSignals(snapshot, 5);
  assert.strictEqual(fresh.length, 1);
  assert.strictEqual(fresh[0].side, "eS");
  assert.strictEqual(fresh[0].ageBars, 1);
});

test("Radar candidate preservation: Fresh candidate warning eS is not suppressed by older confirmed B", () => {
  const bars = Array.from({ length: 20 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    close: 100 + i
  }));

  // Confirmed B occurred 5 bars ago (bar index 14)
  // Fresh weakness warning eS occurred today (bar index 19, ageBars = 0)
  const snapshot = {
    symbol: "NVDA",
    bars,
    signals: [
      { time: bars[14].time, side: "B", direction: "bullish", kind: "consolidation_launch" },
      { time: bars[19].time, side: "eS", direction: "bearish", kind: "structural_weakness" }
    ]
  };

  const fresh = findFreshSignals(snapshot, 10);
  assert.strictEqual(fresh.length, 2);

  const botConf = fresh.find((s) => s.side === "DV-B" || s.side === "AV-B" || s.side === "B");
  const topConf = fresh.find((s) => s.side === "DV-S" || s.side === "S");
  const cand = fresh.find(
    (s) => s.side === "cDV-B" || s.side === "cAV-B" || s.side === "cDV-S" || s.side === "eB" || s.side === "eS"
  );

  assert.ok(botConf, "botConf should find older B");
  assert.ok(cand, "cand should find fresh eS");
  assert.strictEqual(botConf.ageBars, 5);
  assert.strictEqual(cand.ageBars, 0);

  // Verification of the radar candidate rule:
  const newerThanBot = !botConf || cand.ageBars <= botConf.ageBars;
  const newerThanTop = !topConf || cand.ageBars <= topConf.ageBars;
  assert.ok(newerThanBot || newerThanTop, "Fresh candidate must NOT be suppressed by older confirmed B");
});
