// Inflection Hunter DEMA Fast/Slow Multi-Factor Score Algorithm
// Ported exclusively: Dual Exponential Moving Average (14 & 30) + Mutant Momentum + Volume Surge Factor
// Emits 4 core signals: EB (Early Buy), B (Confirmed Buy), ES (Early Sell), S (Confirmed Sell)

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function ema(values, period) {
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) continue;
    if (prev === null) {
      prev = v;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

export function dema(values, period) {
  const ema1 = ema(values, period);
  const ema2 = ema(ema1, period);
  return ema1.map((e1, i) => {
    const e2 = ema2[i];
    if (e1 === null || e2 === null || !Number.isFinite(e1) || !Number.isFinite(e2)) return null;
    return 2 * e1 - e2;
  });
}

export function atrSeries(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  const trs = new Array(bars.length);

  for (let i = 0; i < bars.length; i++) {
    const cur = bars[i];
    if (i === 0) {
      trs[i] = Math.max(0, cur.high - cur.low);
    } else {
      const prevClose = bars[i - 1].close;
      const hl = cur.high - cur.low;
      const hc = Math.abs(cur.high - prevClose);
      const lc = Math.abs(cur.low - prevClose);
      trs[i] = Math.max(hl, hc, lc);
    }
  }

  let rolling = 0;
  let count = 0;
  for (let i = 0; i < trs.length; i++) {
    const tr = trs[i];
    if (!Number.isFinite(tr)) continue;
    rolling += tr;
    count += 1;
    if (count > period) {
      const old = trs[i - period];
      if (Number.isFinite(old)) rolling -= old;
      count -= 1;
    }
    if (count > 0) {
      out[i] = rolling / count;
    }
  }
  return out;
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
      normalized = clamp(value / Math.max(1e-9, p95), -1, 1);
    }

    out.push({
      time: bars[start + index]?.time,
      value: normalized
    });
  }

  return out;
}

function mutantWeight(mutantByTime, bars, currentIdx, baseWeight = 0.18, window = 5) {
  if (currentIdx < window) return baseWeight;
  let same = 0;
  const ref = Number(mutantByTime.get(bars[currentIdx]?.time) || 0);
  for (let k = 1; k <= window; k++) {
    const v = Number(mutantByTime.get(bars[currentIdx - k]?.time) || 0);
    if (Math.sign(v) === Math.sign(ref) && Math.abs(v) > 0.1) same += 1;
  }
  const consistency = same / window;
  return baseWeight * (0.6 + consistency * 0.8);
}

function adaptiveThresholds(atr, currentIdx, baseEnter = 0.22, baseExit = 0.08) {
  const lookback = 60;
  const start = Math.max(0, currentIdx - lookback);
  const slice = atr.slice(start, currentIdx + 1).filter(Number.isFinite);
  if (slice.length < 5) return { enter: baseEnter, exit: baseExit };

  const sorted = [...slice].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  const current = atr[currentIdx];

  const ratio = p90 > p50 ? clamp((current - p50) / (p90 - p50), 0, 1) : 0;
  const scale = 1 + ratio * 0.6;
  return {
    enter: baseEnter * scale,
    exit: baseExit * scale
  };
}

/**
 * 核心拐点算法（DEMA 14 & 30 快慢线综合多因子评分）
 * @param {Array<{time: number, open: number, high: number, low: number, close: number, volume?: number}>} bars
 * @param {Object} [options]
 * @returns {Array<{time: number, price: number, side: 'EB'|'B'|'ES'|'S', regime: 'UP'|'DOWN', score: number, confluence: number}>}
 */
export function computeInflectionSignals(bars, options = {}) {
  if (!Array.isArray(bars) || bars.length < 15) return [];

  const confirmBars = Math.max(1, Number(options.confirmBars || 2));
  const baseEnter = Number(options.enterThreshold || 0.22);
  const baseExit = Number(options.exitThreshold || 0.08);

  const closes = bars.map(b => Number(b.close));
  const emaFast = dema(closes, 14);
  const emaSlow = dema(closes, 30);
  const atr = atrSeries(bars, 14);
  const volSurge = volumeSurgeSeries(bars, 20);
  const mutant = computeMutant(bars, bars.length, 5);
  const mutantByTime = new Map(mutant.map(p => [p.time, p.value]));

  const signals = [];
  let regime = 0;
  let pending = 0;
  let pendingCount = 0;
  let lastEarlyAt = null;

  // Start evaluating as soon as both DEMA series have values
  const startIdx = Math.max(14, Math.min(30, bars.length - 1));

  for (let i = startIdx; i < bars.length; i++) {
    const bar = bars[i];
    const fast = Number(emaFast[i]);
    const slow = Number(emaSlow[i]);
    const close = Number(bar.close);
    const vol = Number(atr[i]) || Math.max(1e-9, Math.abs(close) * 0.01);
    const m = Number(mutantByTime.get(bar.time) || 0);

    if (!Number.isFinite(fast) || !Number.isFinite(slow) || !Number.isFinite(close)) continue;

    const { enter: enterThreshold, exit: exitThreshold } = adaptiveThresholds(atr, i, baseEnter, baseExit);

    // 成交量加权放大系数 (Volume Surge Factor)
    const surge = Number(volSurge[i]);
    const volFactor = !Number.isFinite(surge) ? 1.0
      : surge >= 1.5 ? 1.15
      : surge >= 1.0 ? 1.0
      : surge >= 0.7 ? 0.85
      : 0.70;

    // 变异动量因子 (Mutant Momentum) 动态权重
    const mWeight = mutantWeight(mutantByTime, bars, i);
    const prev1 = Number(bars[i - 1]?.close ?? close);
    const velocity = (close - prev1) / vol;

    // 双重指数移动平均线 (DEMA 14 & 30) 三重偏离加权
    const spreadScore = (fast - slow) / vol; // 权重 45%
    const priceScore = (close - fast) / vol;  // 权重 25%
    const slopeScore = (fast - Number(emaFast[i - 2] ?? emaFast[i])) / vol; // 权重 15%

    // 综合多因子得分
    const rawScore = 0.45 * spreadScore + 0.25 * priceScore + 0.15 * slopeScore + 0.08 * velocity + mWeight * m;
    const score = rawScore * volFactor;

    const direction = score > 0 ? 1 : score < 0 ? -1 : 0;
    let confluence = 0;
    if (direction !== 0) {
      if (spreadScore * direction > 0.05) confluence += 1;
      if (slopeScore * direction > 0.02) confluence += 1;
      if (Number.isFinite(volSurge[i]) && volSurge[i] >= 1.2) confluence += 1;
    }

    const dynConfirm = (confluence >= 3 && Math.abs(score) >= enterThreshold * 2.0) ? 1 : confirmBars;

    let target = regime;
    if (score >= enterThreshold) target = 1;
    else if (score <= -enterThreshold) target = -1;
    else if (Math.abs(score) <= exitThreshold) target = 0;

    if (target === regime || target === 0) {
      pending = 0;
      pendingCount = 0;
      continue;
    }

    if (pending !== target) {
      pending = target;
      pendingCount = 1;
      lastEarlyAt = bar.time;
      signals.push({
        time: bar.time,
        price: close,
        side: target > 0 ? 'EB' : 'ES',
        regime: target > 0 ? 'UP' : 'DOWN',
        score: Math.round(score * 1000) / 1000,
        confluence
      });
    } else {
      pendingCount += 1;
    }

    if (pendingCount >= dynConfirm && (dynConfirm === 1 || lastEarlyAt !== bar.time)) {
      signals.push({
        time: bar.time,
        price: close,
        side: pending > 0 ? 'B' : 'S',
        regime: pending > 0 ? 'UP' : 'DOWN',
        score: Math.round(score * 1000) / 1000,
        confluence
      });
      regime = pending;
      pending = 0;
      pendingCount = 0;
    }
  }

  return signals;
}

/**
 * 将拐点信号转换为 Lightweight Charts 图表 Markers 格式
 * @param {Array<{time: number, side: string, price: number}>} signals
 * @returns {Array<Object>}
 */
export function formatSignalMarkers(signals) {
  if (!Array.isArray(signals)) return [];
  const list = signals.map(s => {
    const side = String(s.side || '').toUpperCase();
    const isBuy = side.includes('B');
    const isEarly = side.startsWith('E');
    return {
      time: Number(s.time),
      position: isBuy ? 'belowBar' : 'aboveBar',
      color: isBuy
        ? (isEarly ? '#38bdf8' : '#10b981')
        : (isEarly ? '#f59e0b' : '#ef4444'),
      shape: isBuy ? 'arrowUp' : 'arrowDown',
      text: side,
      size: isEarly ? 1 : 2
    };
  });

  return list.sort((a, b) => a.time - b.time);
}

