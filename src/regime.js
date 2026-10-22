/**
 * Market & Sector Regime Service
 * Assesses Nasdaq 100 (QQQ) and Semiconductor ETF (SMH) trend environment,
 * plus individual stock relative strength vs SMH (stockClose / smhClose).
 *
 * Rules:
 * - Uptrend: Close > 50-day SMA && 50-day SMA > 50-day SMA[i - 5]
 * - Favorable environment: Prioritize consolidation breakouts and pullback reversals.
 * - Weak environment: Tighten long entry confirmations; preserve bottom observations.
 * - Crucial: Environment filter NEVER suppresses weakness warnings (eS) or risk exits (S).
 * - Robustness: Missing or warmup benchmark data yields "unknown", NEVER "bearish"!
 */

import { smaSeries, round } from "./indicators.js";
import { normalizeBars } from "./market-data.js";
import { fetchTradingViewBars } from "./tradingview.js";

const BENCHMARK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedBenchmarks = {
  timestamp: 0,
  limit: 0,
  qqqBars: null,
  smhBars: null
};

/**
 * Evaluates trend regime on a single daily bar series.
 * Returns series of { time, isUp, status, close, sma50, slope } per bar.
 * If warmup is incomplete (< smaPeriod or < slopeBars), isUp is null and status is "unknown".
 */
export function computeTrendRegimeSeries(bars, smaPeriod = 50, slopeBars = 5) {
  if (!Array.isArray(bars) || bars.length === 0) {
    return [];
  }

  const closes = bars.map((b) => Number(b.close));
  const sma = smaSeries(closes, smaPeriod);

  return bars.map((b, i) => {
    const c = Number(b.close);
    const rawCurr = sma[i];
    const rawPrev = i >= slopeBars ? sma[i - slopeBars] : null;

    // Explicitly reject null or unformed SMAs (avoiding Number(null) === 0 pitfall)
    if (
      rawCurr === null ||
      rawPrev === null ||
      !Number.isFinite(c) ||
      !Number.isFinite(rawCurr) ||
      !Number.isFinite(rawPrev)
    ) {
      return {
        time: b.time,
        isUp: null,
        status: "unknown",
        close: Number.isFinite(c) ? round(c, 4) : null,
        sma50: rawCurr !== null && Number.isFinite(rawCurr) ? round(rawCurr, 4) : null,
        slope: null
      };
    }

    const currSma = Number(rawCurr);
    const prevSma = Number(rawPrev);
    const slope = currSma - prevSma;
    const isUp = c > currSma && slope > 0;

    return {
      time: b.time,
      isUp,
      status: isUp ? "bullish" : "bearish",
      close: round(c, 4),
      sma50: round(currSma, 4),
      slope: round(slope, 4)
    };
  });
}

/**
 * Synchronizes benchmark series with target stock bars by timestamp.
 * Returns Map<time, { qqqUp, smhUp, regime, qqqClose, smhClose, rs, coverage }>.
 */
export function buildSynchronizedRegimeMap(stockBars = [], qqqBars = [], smhBars = []) {
  const qqqRegime = computeTrendRegimeSeries(qqqBars);
  const smhRegime = computeTrendRegimeSeries(smhBars);

  const qqqByTime = new Map(qqqRegime.map((item) => [item.time, item]));
  const smhByTime = new Map(smhRegime.map((item) => [item.time, item]));

  const resultMap = new Map();

  for (const bar of stockBars) {
    const t = Number(bar.time);
    const qqq = qqqByTime.get(t);
    const smh = smhByTime.get(t);

    const qqqUp = qqq && qqq.isUp !== null ? qqq.isUp : null;
    const smhUp = smh && smh.isUp !== null ? smh.isUp : null;

    let regime = "neutral";
    if (qqqUp === null || smhUp === null) {
      // Benchmark missing, pre-warmup, or offline -> UNKNOWN, never penalize as bearish
      regime = "unknown";
    } else if (qqqUp === true && smhUp === true) {
      regime = "bullish";
    } else if (qqqUp === false && smhUp === false) {
      regime = "bearish";
    } else {
      regime = "neutral";
    }

    const stockClose = Number(bar.close);
    const smhClose = smh ? Number(smh.close) : null;
    const rs = (Number.isFinite(stockClose) && Number.isFinite(smhClose) && smhClose > 0)
      ? stockClose / smhClose
      : null;

    resultMap.set(t, {
      time: t,
      qqqUp,
      smhUp,
      regime,
      qqqClose: qqq ? qqq.close : null,
      smhClose: smh ? smh.close : null,
      rs: rs !== null ? round(rs, 6) : null
    });
  }

  return resultMap;
}

/**
 * Safe fetcher for QQQ and SMH daily bars with in-memory caching.
 * Dynamically scales limit to cover stock history depth.
 * Gracefully returns empty arrays on network failure or offline mode.
 */
export async function getCachedBenchmarkBars({ limit = 900 } = {}) {
  const fetchLimit = Math.max(600, Math.min(3000, Number(limit) || 900));
  const now = Date.now();

  if (
    cachedBenchmarks.qqqBars &&
    cachedBenchmarks.smhBars &&
    cachedBenchmarks.limit >= fetchLimit &&
    now - cachedBenchmarks.timestamp < BENCHMARK_CACHE_TTL_MS
  ) {
    return {
      qqqBars: cachedBenchmarks.qqqBars,
      smhBars: cachedBenchmarks.smhBars,
      coverage: {
        qqqCount: cachedBenchmarks.qqqBars.length,
        smhCount: cachedBenchmarks.smhBars.length,
        cached: true
      }
    };
  }

  try {
    const [qqqRes, smhRes] = await Promise.allSettled([
      fetchTradingViewBars({ symbol: "QQQ", tf: "1d", limit: fetchLimit }),
      fetchTradingViewBars({ symbol: "SMH", tf: "1d", limit: fetchLimit })
    ]);

    const qqqBars = qqqRes.status === "fulfilled" ? normalizeBars(qqqRes.value.bars) : [];
    const smhBars = smhRes.status === "fulfilled" ? normalizeBars(smhRes.value.bars) : [];

    if (qqqBars.length > 0 && smhBars.length > 0) {
      cachedBenchmarks = {
        timestamp: now,
        limit: fetchLimit,
        qqqBars,
        smhBars
      };
    }

    return {
      qqqBars: qqqBars.length > 0 ? qqqBars : (cachedBenchmarks.qqqBars || []),
      smhBars: smhBars.length > 0 ? smhBars : (cachedBenchmarks.smhBars || []),
      coverage: {
        qqqCount: qqqBars.length,
        smhCount: smhBars.length,
        cached: false
      }
    };
  } catch (_) {
    return {
      qqqBars: cachedBenchmarks.qqqBars || [],
      smhBars: cachedBenchmarks.smhBars || [],
      coverage: {
        qqqCount: cachedBenchmarks.qqqBars?.length || 0,
        smhCount: cachedBenchmarks.smhBars?.length || 0,
        cached: true
      }
    };
  }
}
