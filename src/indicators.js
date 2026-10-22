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

function percentile(sortedValues, ratio) {
  const clean = sortedValues.filter(Number.isFinite);
  if (!clean.length) return null;
  const index = Math.min(clean.length - 1, Math.max(0, Math.floor(clean.length * ratio)));
  return clean[index];
}

export function computeMutant(bars, lookback = 260, smooth = 5, scaleLookback = 260) {
  const n = Math.min(lookback, bars.length);
  const start = bars.length - n;
  const scaleWindow = Math.max(5, Math.floor(Number(scaleLookback) || 260));
  const raw = [];

  for (let i = 0; i < n; i += 1) {
    const current = Number(bars[start + i]?.close);
    const prev = i > 0 ? Number(bars[start + i - 1]?.close) : current;
    if (!Number.isFinite(current) || !Number.isFinite(prev) || prev === 0) raw.push(0);
    else raw.push(Math.log(current / prev) * 260);
  }

  const smoothed = ema(raw, smooth);
  const absWindow = [];
  const out = [];

  for (let index = 0; index < smoothed.length; index += 1) {
    const value = smoothed[index];
    let normalized = 0;

    if (Number.isFinite(value)) {
      const absValue = Math.abs(value);
      const insertAt = absWindow.findIndex((v) => v > absValue);
      if (insertAt === -1) absWindow.push(absValue);
      else absWindow.splice(insertAt, 0, absValue);
    }

    const oldValue = smoothed[index - scaleWindow];
    if (Number.isFinite(oldValue)) {
      const oldAbs = Math.abs(oldValue);
      const removeAt = absWindow.findIndex((v) => v === oldAbs);
      if (removeAt !== -1) absWindow.splice(removeAt, 1);
    }

    if (Number.isFinite(value)) {
      const p95 = percentile(absWindow, 0.95) ?? 1;
      normalized = clamp(value / Math.max(1e-9, p95), -1, 1);
    }

    out.push({
      time: bars[start + index]?.time,
      value: normalized
    });
  }

  return out;
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

function calcRsiFromAverages(avgGain, avgLoss) {
  if (avgGain === 0 && avgLoss === 0) return 50; // Project convention: flat market returns 50
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/**
 * RSI series (Wilder smoothing).
 * Returns an array of numbers in [0, 100], null when not enough data.
 * Boundary convention:
 * - avgGain == 0 && avgLoss == 0 => 50 (flat market)
 * - avgLoss == 0 && avgGain > 0  => 100
 * - avgGain == 0 && avgLoss > 0  => 0
 * - insufficient bars (< period + 1) => null
 */
export function rsiSeries(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  if (bars.length < period + 1) return out;

  let avgGain = 0;
  let avgLoss = 0;

  // Seed with simple average over first `period` changes
  for (let i = 1; i <= period; i += 1) {
    const delta = Number(bars[i].close) - Number(bars[i - 1].close);
    if (!Number.isFinite(delta)) return out;
    if (delta > 0) avgGain += delta;
    else avgLoss += -delta;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = calcRsiFromAverages(avgGain, avgLoss);

  // Wilder smoothing for the rest
  for (let i = period + 1; i < bars.length; i += 1) {
    const delta = Number(bars[i].close) - Number(bars[i - 1].close);
    if (!Number.isFinite(delta)) {
      out[i] = null;
      continue;
    }
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = calcRsiFromAverages(avgGain, avgLoss);
  }

  return out;
}

export const wilderRsiSeries = rsiSeries;

/**
 * Wilder-smoothed ATR series.
 * Initialized with 14-period SMA of True Range (indices 0..13).
 * Subsequent values smoothed as: (prevATR * (period - 1) + TR) / period.
 */
export function wilderAtrSeries(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  if (!Array.isArray(bars) || bars.length < period) return out;

  const trs = bars.map((bar, index) => trueRange(bar, bars[index - 1]));
  let initialTrSum = 0;
  for (let i = 0; i < period; i += 1) {
    const tr = trs[i];
    if (!Number.isFinite(tr)) return out;
    initialTrSum += tr;
  }

  let prevAtr = initialTrSum / period;
  out[period - 1] = prevAtr;

  for (let i = period; i < bars.length; i += 1) {
    const tr = trs[i];
    if (!Number.isFinite(tr)) {
      out[i] = null;
      continue;
    }
    prevAtr = (prevAtr * (period - 1) + tr) / period;
    out[i] = prevAtr;
  }

  return out;
}

/**
 * Relative Volume RVOL20 series.
 * Formula: RVOL20(i) = V(i) / mean(V(i-20) ... V(i-1))
 * Strictly excludes current day V(i) from the benchmark denominator.
 * Returns null if insufficient history, unknown volume, or any zero volume in past 20 bars.
 */
export function rvol20Series(bars, period = 20) {
  const out = new Array(bars.length).fill(null);
  if (!Array.isArray(bars) || bars.length <= period) return out;

  for (let i = period; i < bars.length; i += 1) {
    const currVol = Number(bars[i]?.volume);
    if (!Number.isFinite(currVol) || currVol < 0) {
      out[i] = null;
      continue;
    }

    let sum = 0;
    let hasInvalid = false;
    for (let k = i - period; k < i; k += 1) {
      const v = Number(bars[k]?.volume);
      // If missing, non-finite, or zero (e.g. trading halt / missing data) -> null
      if (!Number.isFinite(v) || v <= 0) {
        hasInvalid = true;
        break;
      }
      sum += v;
    }

    if (hasInvalid) {
      out[i] = null;
      continue;
    }

    const baseline = sum / period;
    out[i] = baseline > 0 ? currVol / baseline : null;
  }

  return out;
}

/**
 * Close Location Value (CLV).
 * Formula: CLV = (close - low) / (high - low)
 * Range: [0, 1]. Returns 0.5 when high == low.
 */
export function clvSeries(bars) {
  if (!Array.isArray(bars)) return [];
  return bars.map((bar) => {
    const high = Number(bar?.high);
    const low = Number(bar?.low);
    const close = Number(bar?.close);
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;
    const range = high - low;
    if (range <= 0) return 0.5;
    return clamp((close - low) / range, 0, 1);
  });
}

/**
 * Standard Volume Moving Average (SMA) over past period bars (inclusive of current bar).
 */
export function volumeMaSeries(bars, period = 20) {
  const out = new Array(bars.length).fill(null);
  if (!Array.isArray(bars) || bars.length < period) return out;

  let sum = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const v = Number(bars[i]?.volume || 0);
    sum += v;
    if (i >= period) {
      sum -= Number(bars[i - period]?.volume || 0);
    }
    if (i >= period - 1) {
      out[i] = sum / period;
    }
  }

  return out;
}

/**
 * Simple Moving Average (SMA) series over numerical values.
 */
export function smaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  const n = Math.max(1, Math.floor(period));
  if (!Array.isArray(values) || values.length < n) return out;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count += 1;
    if (count > n) {
      sum -= Number(values[i - n]);
      count -= 1;
    }
    if (count === n) {
      out[i] = sum / n;
    }
  }
  return out;
}

/**
 * Mean percentage amplitude series: mean of ((high - low) / close) over past period bars (inclusive).
 */
export function meanAmplitudeSeries(bars, period) {
  const out = new Array(bars.length).fill(null);
  const n = Math.max(1, Math.floor(period));
  if (!Array.isArray(bars) || bars.length < n) return out;

  const amps = bars.map((b) => {
    const h = Number(b.high);
    const l = Number(b.low);
    const c = Number(b.close);
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c) || c <= 0) return null;
    return (h - l) / c;
  });

  let sum = 0;
  let count = 0;
  for (let i = 0; i < amps.length; i += 1) {
    const a = amps[i];
    if (a === null) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += a;
    count += 1;
    if (count > n) {
      sum -= amps[i - n];
      count -= 1;
    }
    if (count === n) {
      out[i] = sum / n;
    }
  }
  return out;
}

/**
 * Highest high in bars[startIndex .. endIndex].
 */
export function highestHigh(bars, startIndex, endIndex) {
  let hh = -Infinity;
  const s = Math.max(0, startIndex);
  const e = Math.min(bars.length - 1, endIndex);
  for (let i = s; i <= e; i += 1) {
    const h = Number(bars[i]?.high);
    if (Number.isFinite(h) && h > hh) hh = h;
  }
  return Number.isFinite(hh) ? hh : null;
}

/**
 * Lowest low in bars[startIndex .. endIndex].
 */
export function lowestLow(bars, startIndex, endIndex) {
  let ll = Infinity;
  const s = Math.max(0, startIndex);
  const e = Math.min(bars.length - 1, endIndex);
  for (let i = s; i <= e; i += 1) {
    const l = Number(bars[i]?.low);
    if (Number.isFinite(l) && l < ll) ll = l;
  }
  return Number.isFinite(ll) ? ll : null;
}

/**
 * Rolling highest high over past period bars.
 * If excludeCurrent = true, searches [i - period .. i - 1].
 */
export function highestHighSeries(bars, period = 20, excludeCurrent = true) {
  const out = new Array(bars.length).fill(null);
  const p = Math.max(1, Math.floor(period));
  for (let i = 0; i < bars.length; i += 1) {
    const end = excludeCurrent ? i - 1 : i;
    const start = end - p + 1;
    if (start < 0) continue;
    out[i] = highestHigh(bars, start, end);
  }
  return out;
}

/**
 * Rolling lowest low over past period bars.
 * If excludeCurrent = true, searches [i - period .. i - 1].
 */
export function lowestLowSeries(bars, period = 5, excludeCurrent = true) {
  const out = new Array(bars.length).fill(null);
  const p = Math.max(1, Math.floor(period));
  for (let i = 0; i < bars.length; i += 1) {
    const end = excludeCurrent ? i - 1 : i;
    const start = end - p + 1;
    if (start < 0) continue;
    out[i] = lowestLow(bars, start, end);
  }
  return out;
}

export function highestClose(bars, startIndex, endIndex) {
  let hc = -Infinity;
  const s = Math.max(0, startIndex);
  const e = Math.min(bars.length - 1, endIndex);
  for (let i = s; i <= e; i += 1) {
    const c = Number(bars[i]?.close);
    if (Number.isFinite(c) && c > hc) hc = c;
  }
  return Number.isFinite(hc) ? hc : null;
}

export function highestCloseSeries(bars, period = 60, excludeCurrent = false) {
  const out = new Array(bars.length).fill(null);
  const p = Math.max(1, Math.floor(period));
  for (let i = 0; i < bars.length; i += 1) {
    const end = excludeCurrent ? i - 1 : i;
    const start = end - p + 1;
    if (start < 0) continue;
    out[i] = highestClose(bars, start, end);
  }
  return out;
}

export function maxSeries(series, period = 20, excludeCurrent = false) {
  const out = new Array(series.length).fill(null);
  const p = Math.max(1, Math.floor(period));
  for (let i = 0; i < series.length; i += 1) {
    const end = excludeCurrent ? i - 1 : i;
    const start = end - p + 1;
    if (start < 0) continue;
    let m = -Infinity;
    for (let k = start; k <= end; k += 1) {
      const v = Number(series[k]);
      if (Number.isFinite(v) && v > m) m = v;
    }
    out[i] = Number.isFinite(m) ? m : null;
  }
  return out;
}

/**
 * VP95: 95th percentile volume of past period bars, excluding current bar t.
 * Nearest-rank: sort ascending, ceil(0.95 * n) - 1.
 */
export function vp95Series(bars, period = 120) {
  const out = new Array(bars.length).fill(null);
  const p = Math.max(1, Math.floor(period));
  for (let i = p; i < bars.length; i += 1) {
    const windowVols = [];
    for (let k = i - p; k < i; k += 1) {
      const v = Number(bars[k]?.volume);
      if (Number.isFinite(v) && v > 0) windowVols.push(v);
    }
    if (windowVols.length < p) continue;
    windowVols.sort((a, b) => a - b);
    const n = windowVols.length;
    const rankIndex = Math.ceil(0.95 * n) - 1;
    out[i] = windowVols[rankIndex];
  }
  return out;
}

/**
 * VDECAY: mean(V[t-2 ... t]) / mean(V[t-22 ... t-3])
 * Numerator (3 bars) and denominator (20 bars) are completely non-overlapping.
 */
export function vdecaySeries(bars) {
  const out = new Array(bars.length).fill(null);
  for (let i = 22; i < bars.length; i += 1) {
    let sumNum = 0;
    let countNum = 0;
    for (let k = i - 2; k <= i; k += 1) {
      const v = Number(bars[k]?.volume);
      if (Number.isFinite(v)) {
        sumNum += v;
        countNum += 1;
      }
    }
    if (countNum < 3) continue;
    const meanNum = sumNum / 3;

    let sumDen = 0;
    let countDen = 0;
    for (let k = i - 22; k <= i - 3; k += 1) {
      const v = Number(bars[k]?.volume);
      if (Number.isFinite(v)) {
        sumDen += v;
        countDen += 1;
      }
    }
    if (countDen < 20 || sumDen <= 0) continue;
    const meanDen = sumDen / 20;

    out[i] = meanDen > 0 ? meanNum / meanDen : null;
  }
  return out;
}

/**
 * Volume surge ratio series (legacy compatibility).
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

export function deriveRisk(bars, options = "long") {
  if (!Array.isArray(bars) || bars.length < 20) return null;

  const rawDir = typeof options === "string" ? options : (options?.direction || "long");
  const activePosition = typeof options === "object" ? options?.activePosition : null;

  const lastBarClose = Number(bars.at(-1)?.close);
  if (!Number.isFinite(lastBarClose)) return null;

  const atr = atrSeries(bars, 14).at(-1);
  if (!Number.isFinite(atr)) return null;

  const segment = bars.slice(-20);
  const upBars = segment.filter((bar) => Number(bar.close) >= Number(bar.open)).length;
  const upBarRatio = segment.length ? round(upBars / segment.length, 3) : 0;

  if (activePosition && Number.isFinite(activePosition.entryPrice)) {
    const entry = Number(activePosition.entryPrice);
    const stop = Number(activePosition.trailingStop) || (entry - atr * 1.5);
    return {
      direction: "holding_long",
      statusLabel: "多头持仓跟踪",
      isHolding: true,
      entry: round(entry, 4),
      stop: round(stop, 4),
      target1: round(entry + atr * 1.5, 4),
      target2: round(entry + atr * 3.0, 4),
      atr: round(atr, 4),
      confidence: upBarRatio,
      upBarRatio
    };
  }

  const isShortOrFlat = rawDir === "short" || rawDir === "flat" || rawDir === "flat_cash";
  const direction = isShortOrFlat ? "flat_cash" : "long";
  const statusLabel = isShortOrFlat ? "空仓观望" : "多头观察";
  const entry = lastBarClose;
  const risk = atr * 1.5;
  const stop = entry - risk;
  const target1 = entry + risk;
  const target2 = entry + 2 * risk;

  return {
    direction,
    statusLabel,
    isHolding: false,
    entry: round(entry, 4),
    stop: round(stop, 4),
    target1: round(target1, 4),
    target2: round(target2, 4),
    atr: round(atr, 4),
    confidence: isShortOrFlat ? round(1 - upBarRatio, 3) : upBarRatio,
    upBarRatio
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
