/**
 * Inflection Signals Facade & Compatibility Layer
 * Re-exports R1 Modular Engine from ./inflection-hunter/index.js
 */

export * from './inflection-hunter/index.js';

import { ema } from './inflection-hunter/indicators.js';

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function volumeSurgeSeries(bars, period = 20) {
  const out = new Array(bars.length).fill(null);
  let rolling = 0;
  let count = 0;

  for (let i = 0; i < bars.length; i++) {
    const vol = Number(bars[i].volume || 0);
    if (!Number.isFinite(vol)) continue;
    rolling += vol;
    count += 1;
    if (count > period) {
      const old = Number(bars[i - period]?.volume || 0);
      if (Number.isFinite(old)) rolling -= old;
      count -= 1;
    }
    if (count >= Math.min(period, i + 1) && count > 0) {
      const avg = rolling / count;
      out[i] = avg > 0 ? vol / avg : 1;
    }
  }
  return out;
}

function percentile(sortedArr, ratio) {
  if (!sortedArr.length) return null;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(sortedArr.length * ratio)));
  return sortedArr[idx];
}

export function computeMutant(bars, lookback = 260, smooth = 5, scaleLookback = 260) {
  const n = Math.min(lookback, bars.length);
  const start = bars.length - n;
  const scaleWindow = Math.max(5, Math.floor(Number(scaleLookback) || 260));
  const raw = [];

  for (let i = 0; i < n; i++) {
    const current = Number(bars[start + i]?.close);
    const prev = i > 0 ? Number(bars[start + i - 1]?.close) : current;
    if (!Number.isFinite(current) || !Number.isFinite(prev) || prev === 0) {
      raw.push(0);
    } else {
      raw.push(Math.log(current / prev) * 260);
    }
  }

  const smoothed = ema(raw, smooth);
  const absWindow = [];
  const out = [];

  for (let index = 0; index < smoothed.length; index++) {
    const value = smoothed[index];
    let normalized = 0;

    if (Number.isFinite(value)) {
      const absValue = Math.abs(value);
      const insertAt = absWindow.findIndex(v => v > absValue);
      if (insertAt === -1) absWindow.push(absValue);
      else absWindow.splice(insertAt, 0, absValue);
    }

    const oldValue = smoothed[index - scaleWindow];
    if (Number.isFinite(oldValue)) {
      const oldAbs = Math.abs(oldValue);
      const removeAt = absWindow.findIndex(v => v === oldAbs);
      if (removeAt !== -1) absWindow.splice(removeAt, 1);
    }

    if (Number.isFinite(value)) {
      const p95 = percentile(absWindow, 0.95) ?? 1;
      const denom = Math.max(0.0001, p95);
      normalized = clamp(value / denom, -1, 1);
    }

    out.push({
      time: bars[start + index]?.time,
      value: normalized
    });
  }

  return out;
}
