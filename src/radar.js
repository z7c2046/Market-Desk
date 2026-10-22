/**
 * Signal Radar Scanner
 * Scans a watchlist of symbols on daily (1d) timeframe using the selected algorithm.
 * Groups matches into Bottom Confirmed, Top Confirmed, and Candidates.
 */

import { fetchWatchlistSymbols } from "./notion.js";
import { getMarketSnapshot } from "./snapshot.js";
import { parseSymbolList, NASDAQ_100_TECH_UNIVERSE } from "./universe.js";
import { ALGORITHMS, DEFAULT_ALGORITHM, normalizeAlgorithm } from "./strategy-config.js";

const radarCache = new Map();

function radarTtl() {
  return 90_000; // 90s TTL for daily scan
}

function pctChange(bars) {
  const last = Number(bars.at(-1)?.close);
  const prev = Number(bars.at(-2)?.close);
  if (!Number.isFinite(last) || !Number.isFinite(prev) || prev === 0) return null;
  return (last - prev) / prev;
}

export function findFreshSignals(snapshot, lookbackBars) {
  const bars = snapshot.bars || [];
  const signals = snapshot.signals || [];
  const indexByTime = new Map(bars.map((bar, index) => [Number(bar.time), index]));
  const threshold = Math.max(0, bars.length - lookbackBars);
  const fresh = [];

  for (const signal of signals) {
    const index = indexByTime.get(Number(signal.time));
    if (!Number.isInteger(index) || index < threshold) continue;
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
    direction: signal.direction,
    stage: signal.stage,
    kind: signal.kind,
    reason: signal.reason,
    signalTime: signal.time,
    signalPrice: signal.price,
    triggerLevel: signal.triggerLevel,
    invalidationLevel: signal.invalidationLevel,
    evidence: signal.evidence,
    ageBars: signal.ageBars,
    pulse: snapshot.pulse,
    risk: snapshot.risk,
    backtest: {
      trades: snapshot.backtest?.trades ?? 0,
      winRate: snapshot.backtest?.winRate ?? null,
      totalReturn: snapshot.backtest?.totalReturn ?? null,
      maxDrawdown: snapshot.backtest?.maxDrawdown ?? null
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

export async function scanRadar(query = {}) {
  const tf = "1d";
  const algorithm = query.algorithm ? normalizeAlgorithm(query.algorithm) : DEFAULT_ALGORITHM;
  const lookbackBars = Math.max(1, Math.min(60, Number(query.lookback || 15)));
  const limit = Math.max(100, Math.min(1200, Number(query.limit || 900)));
  const max = Math.max(5, Math.min(80, Number(query.max || 36)));

  const symbols = parseSymbolList(query.symbols, NASDAQ_100_TECH_UNIVERSE).slice(0, max);
  const key = JSON.stringify({ symbols, tf, algorithm, lookbackBars, limit });
  const now = Date.now();
  const cached = radarCache.get(key);

  if (cached && now - cached.createdAt < radarTtl()) {
    return { ...cached.result, cached: true };
  }

  const startedAt = Date.now();
  const bottomConfirmed = [];
  const topConfirmed = [];
  const candidates = [];
  const errors = [];

  await runPool(symbols, 4, async (symbol) => {
    try {
      const snapshot = await getMarketSnapshot({ symbol, tf, algorithm, limit });
      const fresh = findFreshSignals(snapshot, lookbackBars);
      if (!fresh.length) return;

      const botConf = fresh.find((s) => s.side === "DV-B" || s.side === "AV-B" || s.side === "B");
      const topConf = fresh.find((s) => s.side === "DV-S" || s.side === "S");
      const cand = fresh.find(
        (s) => s.side === "cDV-B" || s.side === "cAV-B" || s.side === "cDV-S" || s.side === "eB" || s.side === "eS"
      );

      // Add confirmed signals if found
      if (botConf) bottomConfirmed.push(summarizeMatch(snapshot, botConf));
      if (topConf) topConfirmed.push(summarizeMatch(snapshot, topConf));

      // Candidates (eS/eB) must NEVER be suppressed by older confirmed signals!
      // If cand is fresher than the confirmed signals, or if no conflicting confirmed signal exists
      if (cand) {
        const newerThanBot = !botConf || cand.ageBars <= botConf.ageBars;
        const newerThanTop = !topConf || cand.ageBars <= topConf.ageBars;
        if (newerThanBot || newerThanTop) {
          candidates.push(summarizeMatch(snapshot, cand));
        }
      }
    } catch (error) {
      errors.push({ symbol, error: error.message || String(error) });
    }
  });

  const rank = (a, b) => {
    if (a.ageBars !== b.ageBars) return a.ageBars - b.ageBars; // Fresher first
    return (b.changePct || 0) - (a.changePct || 0);
  };

  bottomConfirmed.sort(rank);
  topConfirmed.sort(rank);
  candidates.sort(rank);

  // Backward compatibility: bullish and bearish arrays
  const bullish = [...bottomConfirmed, ...candidates.filter((c) => c.direction === "bullish" || c.side.includes("B"))];
  const bearish = [...topConfirmed, ...candidates.filter((c) => c.direction === "bearish" || c.side.includes("S"))];

  const result = {
    ok: true,
    tf: "1d",
    algorithm,
    lookbackBars,
    limit,
    scanned: symbols.length,
    elapsedMs: Date.now() - startedAt,
    generatedAt: new Date().toISOString(),
    bottomConfirmed,
    topConfirmed,
    candidates,
    bullish,
    bearish,
    errors
  };

  radarCache.set(key, { createdAt: now, result });
  return result;
}
