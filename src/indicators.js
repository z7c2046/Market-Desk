export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

export function ema(values, period) {
  const n = Math.max(1, Math.floor(period));
  const k = 2 / (n + 1);
  const out = new Array(values.length).fill(null);
  let prev = null;

  for (let i = 0; i < values.length; i += 1) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) continue;
    prev = prev === null ? v : v * k + prev * (1 - k);
    out[i] = prev;
  }

  return out;
}

export function trueRange(bar, prevBar) {
  const high = Number(bar?.high);
  const low = Number(bar?.low);
  const prevClose = Number(prevBar?.close);

  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  if (!Number.isFinite(prevClose)) return high - low;

  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

export function atrSeries(bars, period = 14) {
  const trs = bars.map((bar, index) => trueRange(bar, bars[index - 1]));
  const out = new Array(bars.length).fill(null);
  let rolling = 0;
  let count = 0;

  for (let i = 0; i < trs.length; i += 1) {
    const tr = trs[i];
    if (!Number.isFinite(tr)) continue;
    rolling += tr;
    count += 1;

    if (count > period) {
      const old = trs[i - period];
      if (Number.isFinite(old)) rolling -= old;
      count -= 1;
    }

    if (count > 0) out[i] = rolling / count;
  }

  return out;
}

export function regressionSlope(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  const n = clean.length;
  if (n < 2) return 0;

  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;

  for (let i = 0; i < n; i += 1) {
    const x = i;
    const y = clean[i];
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }

  const denom = n * sxx - sx * sx;
  if (!denom) return 0;
  return (n * sxy - sx * sy) / denom;
}

export function computeMutant(bars, lookback = 260, smooth = 5) {
  const n = Math.min(lookback, bars.length);
  const start = bars.length - n;
  const raw = [];

  for (let i = 0; i < n; i += 1) {
    const current = Number(bars[start + i]?.close);
    const prev = i > 0 ? Number(bars[start + i - 1]?.close) : current;
    if (!Number.isFinite(current) || !Number.isFinite(prev) || prev === 0) raw.push(0);
    else raw.push(Math.log(current / prev) * 260);
  }

  const smoothed = ema(raw, smooth);
  const abs = smoothed.filter(Number.isFinite).map((v) => Math.abs(v)).sort((a, b) => a - b);
  const p95 = abs.length ? abs[Math.floor(abs.length * 0.95)] : 1;
  const scale = Math.max(1e-9, p95);

  return smoothed.map((value, index) => ({
    time: bars[start + index]?.time,
    value: Number.isFinite(value) ? clamp(value / scale, -1, 1) : 0
  }));
}

export function deriveMarketPulse(bars) {
  if (!Array.isArray(bars) || bars.length < 30) return null;

  const segment = bars.slice(-20);
  const closes = segment.map((bar) => Number(bar.close));
  const last = closes.at(-1);
  const previous = closes.at(-2);
  const first = closes[0];

  if (!Number.isFinite(last) || !Number.isFinite(previous) || !Number.isFinite(first)) return null;

  const r1 = (last - previous) / (previous || last);
  const r20 = (last - first) / (first || last);
  const slope = regressionSlope(closes);
  const slopeN = slope / (last || 1);
  const raw = slopeN * 200 + r20 * 80 + r1 * 40;
  const score = Math.round(clamp(50 + raw * 3.5, 0, 100));
  const label = score >= 60 ? "Bullish" : score <= 40 ? "Bearish" : "Neutral";

  const d = Math.abs(score - 50);
  const neutral = clamp(1 - (d / 50) * 0.9, 0.1, 0.95);
  const rest = 1 - neutral;
  const bull = rest * (score >= 50 ? 0.75 : 0.25);
  const bear = rest - bull;

  let upVolume = 0;
  let downVolume = 0;
  for (const bar of segment) {
    const open = Number(bar.open);
    const close = Number(bar.close);
    const volume = Number(bar.volume || 0);
    if (!Number.isFinite(open) || !Number.isFinite(close) || !Number.isFinite(volume)) continue;
    if (close >= open) upVolume += volume;
    else downVolume += volume;
  }

  return {
    score,
    label,
    bull,
    bear,
    neutral,
    netInflow: upVolume - downVolume
  };
}

/**
 * RSI series (Wilder smoothing).
 * Returns an array of {time, value} — value in [0, 100], null when not enough data.
 */
export function rsiSeries(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  if (bars.length < period + 1) return out;

  let avgGain = 0;
  let avgLoss = 0;

  // Seed with simple average over first `period` changes
  for (let i = 1; i <= period; i += 1) {
    const delta = Number(bars[i].close) - Number(bars[i - 1].close);
    if (delta > 0) avgGain += delta;
    else avgLoss += -delta;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // Wilder smoothing for the rest
  for (let i = period + 1; i < bars.length; i += 1) {
    const delta = Number(bars[i].close) - Number(bars[i - 1].close);
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

/**
 * Volume surge ratio series.
 * value = bar.volume / rolling_avg(volume, period).
 * Returns 1.0 when volume equals the average, null when not enough data.
 */
export function volumeSurgeSeries(bars, period = 20) {
  const out = new Array(bars.length).fill(null);
  let rolling = 0;
  let count = 0;

  for (let i = 0; i < bars.length; i += 1) {
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

export function deriveRisk(bars, direction = "long") {
  if (!Array.isArray(bars) || bars.length < 20) return null;

  const entry = Number(bars.at(-1)?.close);
  if (!Number.isFinite(entry)) return null;

  const atr = atrSeries(bars, 14).at(-1);
  if (!Number.isFinite(atr)) return null;

  const isShort = direction === "short";
  const risk = atr * 1.5;
  const stop = isShort ? entry + risk : entry - risk;
  const target1 = isShort ? entry - risk : entry + risk;
  const target2 = isShort ? entry - 2 * risk : entry + 2 * risk;

  const segment = bars.slice(-20);
  const upBars = segment.filter((bar) => Number(bar.close) >= Number(bar.open)).length;
  const confidence = segment.length ? upBars / segment.length : 0;
  const sideConfidence = isShort ? 1 - confidence : confidence;

  return {
    direction,
    entry,
    stop,
    target1,
    target2,
    atr,
    confidence: sideConfidence
  };
}

/**
 * Double EMA (DEMA) — eliminates ~80% of EMA lag.
 * DEMA(n) = 2 × EMA(n) − EMA(EMA(n))
 *
 * Why it works: the second EMA pass estimates the lag error of the first,
 * and subtracting it brings the line much closer to the raw price.
 * Visual result: tracks price nearly instantly while staying smooth.
 */
export function dema(values, period) {
  const ema1 = ema(values, period);
  // Pass ema1 through a second EMA; nulls are skipped by ema() automatically.
  const ema2 = ema(ema1, period);
  return ema1.map((e1, i) => {
    const e2 = ema2[i];
    if (!Number.isFinite(e1) || !Number.isFinite(e2)) return null;
    return 2 * e1 - e2;
  });
}

/**
 * Williams %R series — zero-lag overbought/oversold oscillator.
 * %R = (Highest_High − Close) / (Highest_High − Lowest_Low) × −100
 *
 * Range: [−100, 0].
 *   ≥ −15  → overbought (near the top of the recent range)
 *   ≤ −85  → oversold   (near the bottom of the recent range)
 *
 * Unlike RSI(14) which carries ~7-bar Wilder smoothing lag,
 * Williams %R uses raw High/Low extremes — no smoothing, no lag.
 */
export function williamsRSeries(bars, period = 9) {
  const out = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i += 1) {
    let hh = -Infinity;
    let ll = +Infinity;
    for (let k = i - period + 1; k <= i; k += 1) {
      const h = Number(bars[k]?.high);
      const l = Number(bars[k]?.low);
      if (Number.isFinite(h)) hh = Math.max(hh, h);
      if (Number.isFinite(l))  ll = Math.min(ll, l);
    }
    const close = Number(bars[i]?.close);
    if (!Number.isFinite(close) || !Number.isFinite(hh) || !Number.isFinite(ll) || hh === ll) continue;
    out[i] = ((hh - close) / (hh - ll)) * -100;
  }
  return out;
}
