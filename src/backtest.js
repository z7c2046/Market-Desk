import { getMarketSnapshot } from "./snapshot.js";

const DEFAULT_START_DATE = "2026-01-01";
const BACKTEST_TIMEFRAMES = new Map([
  ["15m", { label: "15m", limit: 3000 }],
  ["30m", { label: "30m", limit: 2200 }],
  ["1h", { label: "1h", limit: 1600 }],
  ["4h", { label: "4h", limit: 900 }],
  ["1d", { label: "1D", limit: 900 }]
]);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(value, fallback) {
  const raw = String(value || fallback || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? raw : fallback;
}

function dateStart(date) {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
}

function dateEnd(date) {
  return Math.floor(Date.parse(`${date}T23:59:59Z`) / 1000);
}

function dateFor(time) {
  const n = Number(time);
  if (!Number.isFinite(n)) return "";
  return new Date(n * 1000).toISOString().slice(0, 10);
}

function timestampFor(tf, time) {
  const n = Number(time);
  if (!Number.isFinite(n)) return "";
  const date = new Date(n * 1000);
  if (String(tf).toLowerCase() === "1d") return date.toISOString().slice(0, 10);
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function parseTimeframe(value) {
  const raw = String(value || "15m").trim().toLowerCase();
  return BACKTEST_TIMEFRAMES.has(raw) ? raw : "15m";
}

function defaultLimitForTimeframe(tf) {
  return BACKTEST_TIMEFRAMES.get(tf)?.limit || 900;
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

function drawdownFromCurve(curve) {
  let peak = 1;
  let maxDrawdown = 0;

  for (const point of curve) {
    const equity = Number(point.equity);
    if (!Number.isFinite(equity)) continue;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1);
  }

  return maxDrawdown;
}

function summarizeTrades(trades) {
  const wins = trades.filter((trade) => trade.pnlPct > 0);
  const losses = trades.filter((trade) => trade.pnlPct <= 0);
  const avgWin = wins.length ? wins.reduce((sum, trade) => sum + trade.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((sum, trade) => sum + trade.pnlPct, 0) / losses.length : 0;
  const expectancy = trades.length
    ? trades.reduce((sum, trade) => sum + trade.pnlPct, 0) / trades.length
    : 0;

  return {
    trades: trades.length,
    winRate: trades.length ? wins.length / trades.length : null,
    expectancy,
    avgWin,
    avgLoss
  };
}

function buildSignalEvents(bars, signals, buySide, sellSide, startTime, endTime) {
  const byTime = new Map(bars.map((bar, index) => [Number(bar.time), index]));
  const events = [];

  for (const signal of signals) {
    const signalTime = Number(signal.time);
    const side = String(signal.side || "");
    if (side !== buySide && side !== sellSide) continue;
    if (signalTime < startTime || signalTime > endTime) continue;

    const signalIndex = byTime.get(signalTime);
    if (!Number.isInteger(signalIndex) || signalIndex + 1 >= bars.length) continue;

    const fillIndex = signalIndex + 1;
    const fillBar = bars[fillIndex];
    const fillTime = Number(fillBar?.time);
    const fillPrice = Number(fillBar?.open || fillBar?.close);
    if (!Number.isFinite(fillTime) || !Number.isFinite(fillPrice)) continue;
    if (fillTime < startTime || fillTime > endTime) continue;

    events.push({
      type: side === buySide ? "buy" : "sell",
      side,
      signalTime,
      signalPrice: Number(signal.price),
      signalReason: signal.reason,
      fillIndex,
      fillTime,
      fillPrice
    });
  }

  events.sort((a, b) => {
    if (a.fillIndex !== b.fillIndex) return a.fillIndex - b.fillIndex;
    return a.signalTime - b.signalTime;
  });

  return events;
}

function backtestSignalStrategy({ id, name, bars, signals, buySide, sellSide, startTime, endTime, costBps, tf }) {
  const startIndex = bars.findIndex((bar) => Number(bar.time) >= startTime);
  const endIndex = bars.reduce((last, bar, index) => Number(bar.time) <= endTime ? index : last, -1);

  if (startIndex < 0 || endIndex < startIndex) {
    return {
      id,
      name,
      totalReturn: null,
      finalEquity: null,
      maxDrawdown: null,
      trades: 0,
      winRate: null,
      expectancy: 0,
      exposurePct: 0,
      events: [],
      sample: []
    };
  }

  const events = buildSignalEvents(bars, signals, buySide, sellSide, startTime, endTime);
  const eventsByIndex = new Map();
  for (const event of events) {
    const list = eventsByIndex.get(event.fillIndex) || [];
    list.push(event);
    eventsByIndex.set(event.fillIndex, list);
  }

  const costRate = Math.max(0, Number(costBps || 0)) / 10000;
  const trades = [];
  const curve = [];
  const eventLog = [];
  let equity = 1;
  let position = null;
  let exposureBars = 0;

  for (let i = startIndex; i <= endIndex; i += 1) {
    const bar = bars[i];
    const dayEvents = eventsByIndex.get(i) || [];

    for (const event of dayEvents) {
      if (event.type === "buy" && !position) {
        const entryEquity = equity;
        const shares = (equity * (1 - costRate)) / event.fillPrice;
        position = {
          shares,
          entryEquity,
          entry: event.fillPrice,
          entryTime: event.fillTime,
          entrySignalTime: event.signalTime,
          entrySide: event.side
        };
        eventLog.push({ ...event, ignored: false });
      } else if (event.type === "sell" && position) {
        const exitEquity = position.shares * event.fillPrice * (1 - costRate);
        const pnlPct = exitEquity / position.entryEquity - 1;
        trades.push({
          entrySide: position.entrySide,
          exitSide: event.side,
          entryTime: position.entryTime,
          exitTime: event.fillTime,
          entryDate: timestampFor(tf, position.entryTime),
          exitDate: timestampFor(tf, event.fillTime),
          entry: position.entry,
          exit: event.fillPrice,
          pnlPct
        });
        equity = exitEquity;
        position = null;
        eventLog.push({ ...event, ignored: false });
      } else {
        eventLog.push({ ...event, ignored: true });
      }
    }

    const close = Number(bar.close);
    const marketEquity = position && Number.isFinite(close) ? position.shares * close : equity;
    if (position) exposureBars += 1;
    curve.push({ time: bar.time, equity: marketEquity });
  }

  let finalEquity = equity;
  if (position) {
    const last = bars[endIndex];
    const exit = Number(last.close);
    if (Number.isFinite(exit)) {
      finalEquity = position.shares * exit;
      trades.push({
        entrySide: position.entrySide,
        exitSide: "mark",
        entryTime: position.entryTime,
        exitTime: last.time,
        entryDate: timestampFor(tf, position.entryTime),
        exitDate: timestampFor(tf, last.time),
        entry: position.entry,
        exit,
        pnlPct: finalEquity / position.entryEquity - 1,
        openEnded: true
      });
    }
  }

  const summary = summarizeTrades(trades);

  return {
    id,
    name,
    buySide,
    sellSide,
    totalReturn: finalEquity - 1,
    finalEquity,
    maxDrawdown: drawdownFromCurve(curve),
    exposurePct: curve.length ? exposureBars / curve.length : 0,
    events: eventLog.slice(-12),
    sample: trades.slice(-10),
    ...summary
  };
}

function backtestBuyAndHold({ bars, startTime, endTime, costBps, tf }) {
  const periodBars = bars.filter((bar) => Number(bar.time) >= startTime && Number(bar.time) <= endTime);
  if (!periodBars.length) {
    return {
      id: "buy_hold",
      name: "Buy & Hold",
      totalReturn: null,
      finalEquity: null,
      maxDrawdown: null,
      trades: 0,
      winRate: null,
      expectancy: 0,
      exposurePct: 0,
      sample: []
    };
  }

  const costRate = Math.max(0, Number(costBps || 0)) / 10000;
  const first = periodBars[0];
  const last = periodBars.at(-1);
  const entry = Number(first.open || first.close);
  const exit = Number(last.close);
  const shares = Number.isFinite(entry) && entry > 0 ? (1 - costRate) / entry : 0;
  const finalEquity = Number.isFinite(exit) ? shares * exit : null;
  const curve = periodBars.map((bar) => ({
    time: bar.time,
    equity: shares * Number(bar.close)
  }));
  const pnlPct = Number.isFinite(finalEquity) ? finalEquity - 1 : null;
  const trade = {
    entrySide: "buy",
    exitSide: "mark",
    entryTime: first.time,
    exitTime: last.time,
    entryDate: timestampFor(tf, first.time),
    exitDate: timestampFor(tf, last.time),
    entry,
    exit,
    pnlPct,
    openEnded: true
  };
  const summary = summarizeTrades(Number.isFinite(pnlPct) ? [trade] : []);

  return {
    id: "buy_hold",
    name: "Buy & Hold",
    totalReturn: pnlPct,
    finalEquity,
    maxDrawdown: drawdownFromCurve(curve),
    exposurePct: 1,
    events: [],
    sample: Number.isFinite(pnlPct) ? [trade] : [],
    ...summary
  };
}

export async function compareStrategyBacktests(query = {}) {
  const symbol = String(query.symbol || "TSLA").trim().toUpperCase();
  const tf = parseTimeframe(query.tf);
  const startDate = parseDate(query.start, DEFAULT_START_DATE);
  const endDate = parseDate(query.end, todayIso());
  const startTime = dateStart(startDate);
  const endTime = dateEnd(endDate);
  const costBps = Math.max(0, Number(query.costBps || 0));
  const limit = Math.max(120, Math.min(3000, Number(query.limit || defaultLimitForTimeframe(tf))));
  const snapshot = await getMarketSnapshot({ symbol, tf, limit });
  const bars = snapshot.bars || [];
  const signals = snapshot.signals || [];

  const strategies = [
    backtestSignalStrategy({
      id: "early",
      name: "eB / eS",
      bars,
      signals,
      buySide: "eB",
      sellSide: "eS",
      startTime,
      endTime,
      costBps,
      tf
    }),
    backtestSignalStrategy({
      id: "confirmed",
      name: "B / S",
      bars,
      signals,
      buySide: "B",
      sellSide: "S",
      startTime,
      endTime,
      costBps,
      tf
    }),
    backtestBuyAndHold({ bars, startTime, endTime, costBps, tf })
  ].map((strategy) => ({
    ...strategy,
    totalReturn: round(strategy.totalReturn),
    finalEquity: round(strategy.finalEquity),
    maxDrawdown: round(strategy.maxDrawdown),
    expectancy: round(strategy.expectancy),
    avgWin: round(strategy.avgWin),
    avgLoss: round(strategy.avgLoss),
    exposurePct: round(strategy.exposurePct),
    sample: (strategy.sample || []).map((trade) => ({
      ...trade,
      entry: round(trade.entry),
      exit: round(trade.exit),
      pnlPct: round(trade.pnlPct)
    }))
  }));

  const ranked = strategies
    .filter((strategy) => Number.isFinite(strategy.totalReturn))
    .sort((a, b) => b.totalReturn - a.totalReturn);
  const best = ranked[0] || null;
  const periodBars = bars.filter((bar) => Number(bar.time) >= startTime && Number(bar.time) <= endTime);

  return {
    ok: true,
    symbol,
    tvSymbol: snapshot.tvSymbol,
    tf,
    tfLabel: BACKTEST_TIMEFRAMES.get(tf)?.label || tf,
    startDate,
    endDate,
    actualStartDate: dateFor(periodBars[0]?.time),
    actualEndDate: dateFor(periodBars.at(-1)?.time),
    bars: periodBars.length,
    costBps,
    startingPosition: "cash",
    fillModel: "signal_next_bar_open",
    bestStrategyId: best?.id || null,
    bestStrategyName: best?.name || null,
    bestReturn: best?.totalReturn ?? null,
    strategies,
    meta: {
      generatedAt: new Date().toISOString(),
      signalSource: "existing_ema_aux_mutant_engine",
      note: "Signal strategies are long-only: buy on the buy signal, sell to cash on the sell signal."
    }
  };
}
