/**
 * Market Data Processing, Normalization, Quality Checks & Completed-Day Classification
 * Follows US/Eastern (America/New_York) calendar and regular trading session hours.
 */

import { round } from "./indicators.js";

const rawBarsCache = new Map();
const derivedSignalCache = new Map();

const RAW_BARS_TTL_MS = 60_000;       // 1 minute
const DERIVED_CACHE_TTL_MS = 60_000;   // 1 minute

/**
 * Get current time parts in America/New_York timezone.
 */
export function getEasternTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const partMap = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }
  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    hour: Number(partMap.hour),
    minute: Number(partMap.minute),
    second: Number(partMap.second),
    isoDate: `${partMap.year}-${partMap.month}-${partMap.day}`
  };
}

/**
 * Format a UNIX timestamp (seconds) into YYYY-MM-DD in America/New_York.
 */
export function formatEasternDate(timestampSec) {
  if (!Number.isFinite(Number(timestampSec))) return "";
  const date = new Date(Number(timestampSec) * 1000);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

/**
 * Determines whether a daily bar is completed based on current America/New_York time.
 * Regular trading session on NYSE/NASDAQ closes at 16:00 ET (4:00 PM).
 */
export function isDailyBarCompleted(barTimeSec, now = new Date()) {
  const barDateStr = formatEasternDate(barTimeSec);
  const nowET = getEasternTimeParts(now);

  if (!barDateStr) return false;

  if (barDateStr < nowET.isoDate) {
    // Bar is strictly from a prior calendar date -> completed
    return true;
  }

  if (barDateStr === nowET.isoDate) {
    // Bar is today's date -> completed only if current ET time >= 16:00:00
    return nowET.hour > 16 || (nowET.hour === 16 && nowET.minute >= 0);
  }

  // Future timestamp
  return false;
}

/**
 * Normalize and validate OHLCV bars.
 * Sorts ascending, removes duplicates, validates price sanity, and marks completed status.
 */
export function normalizeBars(rawBars, now = new Date()) {
  if (!Array.isArray(rawBars)) return [];

  const seenTimes = new Set();
  const validBars = [];

  for (const bar of rawBars) {
    const time = Number(bar?.time);
    const open = Number(bar?.open);
    const high = Number(bar?.high);
    const low = Number(bar?.low);
    const close = Number(bar?.close);
    const volume = Number(bar?.volume ?? 0);

    if (!Number.isFinite(time) || !Number.isFinite(close) || close <= 0) continue;
    if (seenTimes.has(time)) continue;
    seenTimes.add(time);

    const safeHigh = Number.isFinite(high) && high >= low ? Math.max(high, open || close, close) : Math.max(open || close, close);
    const safeLow = Number.isFinite(low) && low > 0 ? Math.min(low, open || close, close) : Math.min(open || close, close);
    const safeOpen = Number.isFinite(open) && open > 0 ? open : close;
    const safeVol = Number.isFinite(volume) && volume >= 0 ? volume : 0;

    const isCompleted = isDailyBarCompleted(time, now);

    validBars.push({
      time,
      date: formatEasternDate(time),
      open: round(safeOpen, 6),
      high: round(safeHigh, 6),
      low: round(safeLow, 6),
      close: round(close, 6),
      volume: round(safeVol, 2),
      isCompleted
    });
  }

  validBars.sort((a, b) => a.time - b.time);
  return validBars;
}

/**
 * Assesses data quality of normalized bars.
 */
export function assessDataQuality(bars) {
  const completedBars = bars.filter((b) => b.isCompleted);
  const issues = [];

  if (completedBars.length < 100) {
    issues.push(`insufficient_history: only ${completedBars.length} completed bars (minimum 100 required)`);
  }

  // Check for abnormal zero volumes in recent 30 completed bars
  const recent30 = completedBars.slice(-30);
  const zeroVolCount = recent30.filter((b) => Number(b.volume) <= 0).length;
  if (zeroVolCount > 3) {
    issues.push(`frequent_zero_volume: ${zeroVolCount} of last 30 bars have 0 volume`);
  }

  const lastCompleted = completedBars.at(-1);

  return {
    valid: issues.length === 0,
    totalBars: bars.length,
    completedBars: completedBars.length,
    closedThrough: lastCompleted ? lastCompleted.date : null,
    lastCompletedTime: lastCompleted ? lastCompleted.time : null,
    hasIntradayBar: bars.length > completedBars.length,
    issues
  };
}

// ── Cache Accessors ──────────────────────────────────────────────────────────

export function getCachedRawBars(symbol, tf) {
  const key = `${String(symbol).toUpperCase()}:${String(tf).toLowerCase()}`;
  const hit = rawBarsCache.get(key);
  if (hit && Date.now() - hit.createdAt < RAW_BARS_TTL_MS) {
    return hit.data;
  }
  return null;
}

export function setCachedRawBars(symbol, tf, data) {
  const key = `${String(symbol).toUpperCase()}:${String(tf).toLowerCase()}`;
  rawBarsCache.set(key, { createdAt: Date.now(), data });
}

export function getCachedSnapshot(key) {
  const hit = derivedSignalCache.get(key);
  if (hit && Date.now() - hit.createdAt < DERIVED_CACHE_TTL_MS) {
    return hit.snapshot;
  }
  return null;
}

export function setCachedSnapshot(key, snapshot) {
  derivedSignalCache.set(key, { createdAt: Date.now(), snapshot });
}

export function buildSnapshotCacheKey(symbol, tf, algorithm, params, lastCompletedTime) {
  const pStr = JSON.stringify(params || {});
  return `${String(symbol).toUpperCase()}:${String(tf).toLowerCase()}:${algorithm}:${pStr}:${lastCompletedTime || 0}`;
}
