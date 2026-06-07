import { getMarketSnapshot } from "./snapshot.js";
import { DEFAULT_US_UNIVERSE, parseSymbolList } from "./universe.js";

const radarCache = new Map();

function radarTtl(tf) {
  const key = String(tf || "").toLowerCase();
  if (key.includes("m") || key.includes("h") || /^\d+$/.test(key)) return 30_000;
  return 120_000;
}

function defaultLimit(tf) {
  const key = String(tf || "").toLowerCase();
  if (key === "5m" || key === "15m" || key === "30m" || key === "1h") return 500;
  if (key === "4h") return 420;
  if (key === "1m" || key === "1mo") return 360;
  return 600;
}

function pctChange(bars) {
  const last = Number(bars.at(-1)?.close);
  const prev = Number(bars.at(-2)?.close);
  if (!Number.isFinite(last) || !Number.isFinite(prev) || prev === 0) return null;
  return (last - prev) / prev;
}

function findFreshSignals(snapshot, lookbackBars) {
  const bars = snapshot.bars || [];
  const signals = snapshot.signals || [];
  const indexByTime = new Map(bars.map((bar, index) => [Number(bar.time), index]));
  const threshold = Math.max(0, bars.length - lookbackBars);
  const fresh = [];

  for (const signal of signals) {
    const index = indexByTime.get(Number(signal.time));
    if (!Number.isInteger(index) || index < threshold) continue;
    const side = String(signal.side || "");
    if (!["eB", "B", "eS", "S"].includes(side)) continue;
    fresh.push({
      ...signal,
      ageBars: bars.length - 1 - index
    });
  }

  fresh.sort((a, b) => Number(b.time) - Number(a.time));
  return fresh;
}

function summarizeMatch(snapshot, signal) {
  const bars = snapshot.bars || [];
  const last = bars.at(-1) || {};
  return {
    symbol: snapshot.symbol,
    tvSymbol: snapshot.tvSymbol,
    tf: snapshot.tf,
    price: Number(last.close),
    changePct: pctChange(bars),
    side: signal.side,
    reason: signal.reason,
    signalTime: signal.time,
    signalPrice: signal.price,
    strength: signal.strength,
    ageBars: signal.ageBars,
    pulse: snapshot.pulse,
    risk: snapshot.risk,
    backtest: {
      trades: snapshot.backtest?.trades ?? 0,
      winRate: snapshot.backtest?.winRate ?? null,
      expectancy: snapshot.backtest?.expectancy ?? null
    }
  };
}

async function runPool(items, concurrency, worker) {
  const out = new Array(items.length);
  let cursor = 0;

  async function runOne() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runOne)
  );

  return out;
}

export async function scanRadar(query) {
  const tf = String(query.tf || "15m").trim();
  const lookbackBars = Math.max(1, Math.min(20, Number(query.lookback || 4)));
  const limit = Math.max(80, Math.min(1200, Number(query.limit || defaultLimit(tf))));
  const max = Math.max(5, Math.min(80, Number(query.max || 36)));
  const symbols = parseSymbolList(query.symbols, DEFAULT_US_UNIVERSE).slice(0, max);
  const key = JSON.stringify({ symbols, tf, lookbackBars, limit });
  const now = Date.now();
  const cached = radarCache.get(key);

  if (cached && now - cached.createdAt < radarTtl(tf)) {
    return { ...cached.result, cached: true };
  }

  const startedAt = Date.now();
  const bullish = [];
  const bearish = [];
  const errors = [];

  await runPool(symbols, 4, async (symbol) => {
    try {
      const snapshot = await getMarketSnapshot({ symbol, tf, limit });
      const fresh = findFreshSignals(snapshot, lookbackBars);
      const bull = fresh.find((signal) => signal.side === "eB" || signal.side === "B");
      const bear = fresh.find((signal) => signal.side === "eS" || signal.side === "S");
      if (bull) bullish.push(summarizeMatch(snapshot, bull));
      if (bear) bearish.push(summarizeMatch(snapshot, bear));
    } catch (error) {
      errors.push({ symbol, error: error.message || String(error) });
    }
  });

  const rank = (a, b) => {
    const aConfirmed = a.side.length === 1 ? 1 : 0;
    const bConfirmed = b.side.length === 1 ? 1 : 0;
    if (aConfirmed !== bConfirmed) return bConfirmed - aConfirmed;
    if (a.ageBars !== b.ageBars) return a.ageBars - b.ageBars;
    return Number(b.strength || 0) - Number(a.strength || 0);
  };

  bullish.sort(rank);
  bearish.sort(rank);

  const result = {
    ok: true,
    tf,
    lookbackBars,
    limit,
    scanned: symbols.length,
    elapsedMs: Date.now() - startedAt,
    generatedAt: new Date().toISOString(),
    bullish,
    bearish,
    errors
  };

  radarCache.set(key, { createdAt: now, result });
  return result;
}
