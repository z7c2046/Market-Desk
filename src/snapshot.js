import { deriveMarketPulse, deriveRisk, dema, round, computeMutant } from "./indicators.js";
import { backtestSignals, computeSignals } from "./signals.js";
import { fetchTradingViewBars } from "./tradingview.js";

const cache = new Map();

function cacheTtl(tf) {
  const key = String(tf || "").toLowerCase();
  if (key.includes("m") || key.includes("h") || /^\d+$/.test(key)) return 20_000;
  return 90_000;
}

function toSeries(bars, values) {
  return values
    .map((value, index) => ({
      time: bars[index]?.time,
      value: Number.isFinite(value) ? value : null
    }))
    .filter((point) => point.time && Number.isFinite(point.value));
}

function normalizeBars(bars) {
  return bars.map((bar) => ({
    time: Number(bar.time),
    open: round(Number(bar.open), 6),
    high: round(Number(bar.high), 6),
    low: round(Number(bar.low), 6),
    close: round(Number(bar.close), 6),
    volume: round(Number(bar.volume || 0), 2)
  }));
}

export async function getMarketSnapshot(query) {
  const symbol = String(query.symbol || "TSLA").trim().toUpperCase();
  const tf = String(query.tf || "1d").trim();
  const limit = Math.max(50, Math.min(3000, Number(query.limit || 600)));
  const key = `${symbol}:${tf}:${limit}`;
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && now - cached.createdAt < cacheTtl(tf)) {
    return { ...cached.snapshot, cached: true };
  }

  const tv = await fetchTradingViewBars({ symbol, tf, limit });
  const bars = normalizeBars(tv.bars).slice(-limit);
  const closes  = bars.map((bar) => Number(bar.close));
  const emaFast = dema(closes, 14);   // DEMA(14) — replaces EMA(20), ~80% less lag
  const aux     = dema(closes, 30);   // DEMA(30) — replaces EMA(50), ~80% less lag
  const signals = computeSignals(bars, emaFast, aux, { confirmBars: 2 });
  const formal = [...signals].reverse().find((signal) => signal.side === "B" || signal.side === "S");
  const direction = formal?.side === "S" ? "short" : "long";
  const pulse = deriveMarketPulse(bars);
  const risk = deriveRisk(bars, direction);
  const mutant = computeMutant(bars);
  const backtest = backtestSignals(bars, signals);

  const snapshot = {
    ok: true,
    symbol,
    tvSymbol: tv.symbol,
    tf,
    interval: tv.interval,
    source: "tradingview_public",
    bars,
    ema_series: toSeries(bars, emaFast),
    aux_series: toSeries(bars, aux),
    signals,
    mutant,
    pulse,
    risk,
    backtest,
    meta: {
      provider: "TradingView public websocket",
      data_mode: "public_best_effort",
      fast_indicator: "DEMA(14)",
      slow_indicator: "DEMA(30)",
      overbought_filter: "Williams_%R(9)",
      signal_mode: "B — reversal / low-noise",
      confirm_window: "adaptive_1-2",
      limit,
      generated_at: new Date().toISOString()
    }
  };

  cache.set(key, { createdAt: now, snapshot });
  return snapshot;
}
