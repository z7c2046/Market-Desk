import test from "node:test";
import assert from "node:assert/strict";
import { runLongOnlyBacktest, backtestBuyAndHold, evaluateSwingAlerts } from "../src/backtest.js";

test("Backtest: Next day open fill, fee and slippage math", () => {
  // Construct 5 daily bars:
  // Bar 0: Signal day (Buy event emitted at bar 0 time)
  // Bar 1: Fill day (Open = 100, Close = 105)
  // Bar 2: Signal day (Sell event emitted at bar 2 time, Close = 110)
  // Bar 3: Fill day (Open = 112, Close = 115)
  // Bar 4: Final day (Close = 116)
  const bars = [
    { time: 1000, date: "2026-01-01", open: 98, high: 101, low: 97, close: 100, volume: 1000 },
    { time: 2000, date: "2026-01-02", open: 100, high: 106, low: 99, close: 105, volume: 1000 },
    { time: 3000, date: "2026-01-03", open: 106, high: 111, low: 105, close: 110, volume: 1000 },
    { time: 4000, date: "2026-01-04", open: 112, high: 116, low: 111, close: 115, volume: 1000 },
    { time: 5000, date: "2026-01-05", open: 115, high: 117, low: 114, close: 116, volume: 1000 }
  ];

  const events = [
    { time: 1000, side: "B" }, // Should fill on Bar 1 Open
    { time: 3000, side: "S" }  // Should fill on Bar 3 Open
  ];

  // Test with fee = 10 bps (0.0010), slippage = 10 bps (0.0010)
  const result = runLongOnlyBacktest({
    bars,
    events,
    startTime: 1000,
    endTime: 5000,
    feeBps: 10,
    slippageBps: 10
  });

  assert.strictEqual(result.trades, 1);
  assert.strictEqual(result.winRate, 1.0); // 1 win, 0 loss -> 100%
  assert.strictEqual(result.openPosition, null);

  const trade = result.closedTrades[0];
  // Entry fill price = 100 * (1 + 0.001) = 100.1
  assert.strictEqual(trade.entryPrice, 100.1);
  // Exit fill price = 112 * (1 - 0.001) = 111.888
  assert.strictEqual(trade.exitPrice, 111.888);
  // Both fee legs applied:
  // Investable = 1.0 - 0.001 = 0.999
  // Shares = 0.999 / 100.1 = 0.00998002
  // Gross exit = shares * 111.888 = 1.1166444
  // Net exit = 1.1166444 * (1 - 0.001) = 1.1155277
  // PnL = 1.1155277 - 1 = +11.55%
  assert.ok(trade.pnlPct > 0.11 && trade.pnlPct < 0.12);
});

test("Backtest: Open position is separated from closed trades (winRate null for 0 closed)", () => {
  const bars = [
    { time: 1000, date: "2026-01-01", open: 100, high: 101, low: 99, close: 100, volume: 1000 },
    { time: 2000, date: "2026-01-02", open: 102, high: 105, low: 101, close: 104, volume: 1000 },
    { time: 3000, date: "2026-01-03", open: 104, high: 108, low: 103, close: 107, volume: 1000 }
  ];

  // Buy event at bar 0, fills at bar 1. No sell event!
  const events = [{ time: 1000, side: "DV-B" }];

  const result = runLongOnlyBacktest({
    bars,
    events,
    startTime: 1000,
    endTime: 3000,
    feeBps: 0,
    slippageBps: 0
  });

  assert.strictEqual(result.trades, 0, "No completed trades");
  assert.strictEqual(result.winRate, null, "0 closed trades must return null winRate (displayed as '—')");
  assert.ok(result.openPosition !== null, "Must have active openPosition");
  assert.strictEqual(result.openPosition.currentPrice, 107);
  // Total return accounts for mark-to-market open position:
  // entry = 102, mark = 107 -> return ~ +4.9%
  assert.ok(result.totalReturn > 0.045 && result.totalReturn < 0.05);
});

test("Backtest: Explicit 0 fee and 0 slippage are respected", () => {
  const bars = [
    { time: 1000, date: "2026-01-01", open: 100, high: 101, low: 99, close: 100, volume: 1000 },
    { time: 2000, date: "2026-01-02", open: 100, high: 105, low: 99, close: 105, volume: 1000 },
    { time: 3000, date: "2026-01-03", open: 105, high: 110, low: 104, close: 110, volume: 1000 },
    { time: 4000, date: "2026-01-04", open: 110, high: 112, low: 109, close: 110, volume: 1000 }
  ];

  const events = [
    { time: 1000, side: "B" },
    { time: 3000, side: "S" }
  ];

  const result = runLongOnlyBacktest({
    bars,
    events,
    startTime: 1000,
    endTime: 4000,
    feeBps: 0,
    slippageBps: 0
  });

  const trade = result.closedTrades[0];
  assert.strictEqual(trade.entryPrice, 100);
  assert.strictEqual(trade.exitPrice, 110);
  assert.strictEqual(trade.pnlPct, 0.1); // Exactly 10%
});

test("evaluateSwingAlerts: clusters adjacent alerts, evaluates 5/10/20d windows and major moves", () => {
  // Construct 40 daily bars
  const bars = Array.from({ length: 40 }, (_, i) => {
    // 0..19: flat ~ 100
    // 20..30: surge up to 130 (+30%)
    // 31..39: flat ~ 130
    const price = i < 20 ? 100 : i <= 30 ? 100 + (i - 20) * 3 : 130;
    return {
      time: 1700000000 + i * 86400,
      open: price - 0.5,
      high: price + 1.0,
      low: price - 1.0,
      close: price,
      volume: 1_000_000
    };
  });

  // Alert at bar 19 (eB launch watch) and bar 20 (B launch confirm)
  // These two alerts are within 1 bar -> should cluster into ONE bullish cluster anchored at bar 19
  const signals = [
    { time: bars[19].time, side: "eB", direction: "bullish" },
    { time: bars[20].time, side: "B", direction: "bullish" }
  ];

  const evalResult = evaluateSwingAlerts({
    bars,
    signals,
    windows: [5, 10, 20]
  });

  assert.strictEqual(evalResult.totalSignals, 2);
  assert.strictEqual(evalResult.clustersCount, 1, "Must merge adjacent alerts into 1 cluster");

  const tenDay = evalResult.byWindow[10];
  assert.strictEqual(tenDay.evaluatedClusters, 1);
  assert.strictEqual(tenDay.hits, 1, "Should be a hit in 10-day window due to 30% rally");
  assert.ok(tenDay.avgMfePct >= 0.25, "MFE should reflect > 25% surge");
  assert.strictEqual(evalResult.majorMoveCoverage.capturedSwings, 1, "Must capture the major surge");
  assert.ok(evalResult.majorMoveCoverage.coveragePct >= 0.5);
});

test("Item 3 Counter-example: Reached target after -12% plunge has 100% favorableTouchRate but 0% firstTouchRate (stopped out first)", () => {
  // Construct 10 bars:
  // Bar 0: Alert at 100. Stop is ~ 97, Target is ~ 103.
  // Bar 1: Plunges -12% to 88 (low 87) -> hits stop first!
  // Bar 4: Rebounds to 105 (high 106) -> reaches target later in the 5-day window.
  const bars = [
    { time: 1000, date: "2026-01-01", open: 99, high: 101, low: 99, close: 100, volume: 1000 },
    { time: 2000, date: "2026-01-02", open: 95, high: 96, low: 87, close: 88, volume: 1000 },
    { time: 3000, date: "2026-01-03", open: 89, high: 93, low: 88, close: 92, volume: 1000 },
    { time: 4000, date: "2026-01-04", open: 93, high: 99, low: 92, close: 98, volume: 1000 },
    { time: 5000, date: "2026-01-05", open: 99, high: 106, low: 98, close: 105, volume: 1000 },
    { time: 6000, date: "2026-01-06", open: 105, high: 107, low: 104, close: 106, volume: 1000 },
    { time: 7000, date: "2026-01-07", open: 106, high: 108, low: 105, close: 107, volume: 1000 },
    { time: 8000, date: "2026-01-08", open: 107, high: 109, low: 106, close: 108, volume: 1000 },
    { time: 9000, date: "2026-01-09", open: 108, high: 110, low: 107, close: 109, volume: 1000 },
    { time: 10000, date: "2026-01-10", open: 109, high: 111, low: 108, close: 110, volume: 1000 }
  ];

  const signals = [
    {
      time: 1000,
      price: 100,
      side: "B",
      direction: "bullish",
      stage: "confirmed",
      kind: "consolidation_launch",
      invalidationLevel: 97,
      triggerLevel: 103
    }
  ];

  const evalResult = evaluateSwingAlerts({
    bars,
    signals,
    windows: [5]
  });

  const fiveDay = evalResult.byWindow[5];
  assert.strictEqual(fiveDay.evaluatedClusters, 1);
  // Reached target later: favorableTouchRate is 100% (1.0)
  assert.strictEqual(fiveDay.favorableTouchHits, 1);
  assert.strictEqual(fiveDay.favorableTouchRate, 1.0);
  // Hit stop FIRST before target: firstTouchRate is 0% (0.0)
  assert.strictEqual(fiveDay.firstTouchHits, 0);
  assert.strictEqual(fiveDay.firstTouchRate, 0.0);
  // MAE must be positive (e.g. 13% = 0.13), NEVER negative
  assert.ok(fiveDay.avgMaePct > 0.10, "MAE must be >= 10% positive value");
});

test("Item 3: Incomplete observation window (< W bars) is classified as pendingClusters and excluded from evaluatedClusters", () => {
  // Only 5 bars total (times 1000..5000)
  const bars = [
    { time: 1000, date: "2026-01-01", open: 100, high: 101, low: 99, close: 100, volume: 1000 },
    { time: 2000, date: "2026-01-02", open: 100, high: 102, low: 99, close: 101, volume: 1000 },
    { time: 3000, date: "2026-01-03", open: 101, high: 103, low: 100, close: 102, volume: 1000 },
    { time: 4000, date: "2026-01-04", open: 102, high: 104, low: 101, close: 103, volume: 1000 },
    { time: 5000, date: "2026-01-05", open: 103, high: 105, low: 102, close: 104, volume: 1000 }
  ];

  // Signal on Bar 4 (the latest bar, only 0 subsequent bars available)
  const signals = [
    { time: 5000, price: 104, side: "B", direction: "bullish", stage: "confirmed", kind: "consolidation_launch" }
  ];

  const evalResult = evaluateSwingAlerts({
    bars,
    signals,
    windows: [5, 10, 20]
  });

  // For 5, 10, and 20 day windows, this cluster is incomplete (pending)
  for (const W of [5, 10, 20]) {
    const win = evalResult.byWindow[W];
    assert.strictEqual(win.evaluatedClusters, 0, `Window ${W} must have 0 evaluated clusters`);
    assert.strictEqual(win.pendingClusters, 1, `Window ${W} must have 1 pending cluster`);
    assert.strictEqual(win.firstTouchRate, null, `Window ${W} must have null rate`);
  }
});

test("Item 3: Evaluation startIndex and endIndex limits alert scoring to selected date range", () => {
  const bars = Array.from({ length: 40 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 1000
  }));

  // Signal 1 at bar 5 (outside range 15..35)
  // Signal 2 at bar 20 (inside range 15..35)
  const signals = [
    { time: bars[5].time, price: 105, side: "B", direction: "bullish", stage: "confirmed", kind: "consolidation_launch" },
    { time: bars[20].time, price: 120, side: "B", direction: "bullish", stage: "confirmed", kind: "consolidation_launch" }
  ];

  const evalResult = evaluateSwingAlerts({
    bars,
    signals,
    windows: [5],
    startIndex: 15,
    endIndex: 35
  });

  // Only Signal 2 should be included in evaluation
  assert.strictEqual(evalResult.totalSignals, 1, "Only signals within startIndex..endIndex should be evaluated");
  assert.strictEqual(evalResult.clustersCount, 1);
});
