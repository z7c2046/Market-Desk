#!/usr/bin/env node
/**
 * Algorithm A/B backtest comparison
 *   OLD : EMA(20/50) + RSI(14) filter
 *   NEW : DEMA(14/30) + Williams %R(9) filter  [B-mode]
 *
 * Runs 3 strategies per algorithm per symbol:
 *   eB/eS  — early signals only
 *   B/S    — confirmed signals only
 *   B&H    — buy and hold baseline
 *
 * Usage: node scratch/compare_algorithms.mjs
 */

import {
  ema, dema,
  atrSeries, clamp, computeMutant,
  rsiSeries, williamsRSeries, volumeSurgeSeries
} from '../src/indicators.js';
import { fetchTradingViewBars } from '../src/tradingview.js';

const WATCHLIST = [
  'AAPL', 'TSM',  'GOOG', 'MU',   'INTC',
  'MRVL', 'COHR', 'LITE', 'AAOI', 'AXTI',
  'NOK',  'DRAM', 'AHET', 'CRCL', 'NVDA'
];
const TF    = '15m';
const LIMIT = 3000;   // ~6 months of 15m bars
const COST_RATE = 8 / 10000;  // 8bps round-trip per leg

// ── Shared internals ─────────────────────────────────────────────────────────
function adaptiveThresholds(atr, idx, baseEnter = 0.22, baseExit = 0.08) {
  const start = Math.max(0, idx - 60);
  const slice = atr.slice(start, idx + 1).filter(Number.isFinite);
  if (slice.length < 5) return { enter: baseEnter, exit: baseExit };
  const sorted = [...slice].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  const ratio = p90 > p50 ? clamp((atr[idx] - p50) / (p90 - p50), 0, 1) : 0;
  const scale = 1 + ratio * 0.6;
  return { enter: baseEnter * scale, exit: baseExit * scale };
}

function mutantWeight(mutantByTime, bars, idx, base = 0.18, win = 5) {
  if (idx < win) return base;
  let same = 0;
  const ref = Number(mutantByTime.get(bars[idx]?.time) || 0);
  for (let k = 1; k <= win; k++) {
    const v = Number(mutantByTime.get(bars[idx - k]?.time) || 0);
    if (Math.sign(v) === Math.sign(ref) && Math.abs(v) > 0.1) same++;
  }
  return base * (0.6 + (same / win) * 0.8);
}

function volFactor(surge) {
  if (!Number.isFinite(surge)) return 1.0;
  if (surge >= 1.5) return 1.15;
  if (surge >= 1.0) return 1.00;
  if (surge >= 0.7) return 0.85;
  return 0.70;
}

// ── OLD algorithm: EMA(20/50) + RSI(14) ─────────────────────────────────────
function computeSignalsOld(bars) {
  const closes  = bars.map(b => Number(b.close));
  const fast    = ema(closes, 20);
  const slow    = ema(closes, 50);
  const atr     = atrSeries(bars, 14);
  const rsi     = rsiSeries(bars, 14);
  const vol     = volumeSurgeSeries(bars, 20);
  const mutant  = computeMutant(bars, bars.length, 5);
  const mByTime = new Map(mutant.map(p => [p.time, p.value]));
  const CONFIRM = 2;

  const signals = [];
  let regime = 0, pending = 0, pendingCount = 0, lastEarlyAt = null;

  for (let i = 55; i < bars.length; i++) {
    const f = Number(fast[i]), s = Number(slow[i]);
    const c = Number(bars[i].close);
    const v = Number(atr[i]) || Math.max(1e-9, Math.abs(c) * 0.01);
    const m = Number(mByTime.get(bars[i].time) || 0);
    if (!Number.isFinite(f) || !Number.isFinite(s) || !Number.isFinite(c)) continue;

    const { enter: et, exit: xt } = adaptiveThresholds(atr, i);
    const rsiVal   = Number(rsi[i]);
    const surge    = Number(vol[i]);
    const vf       = volFactor(surge);
    const mw       = mutantWeight(mByTime, bars, i);

    const spreadSc = (f - s) / v;
    const priceSc  = (c - f) / v;
    const slopeSc  = (f - Number(fast[i - CONFIRM] ?? f)) / v;
    const score    = (0.5 * spreadSc + 0.3 * priceSc + 0.2 * slopeSc + mw * m) * vf;

    const dir = score > 0 ? 1 : score < 0 ? -1 : 0;
    let confluence = 0;
    if (dir) {
      if (spreadSc * dir > 0.05)                                   confluence++;
      if (slopeSc  * dir > 0.02)                                   confluence++;
      if (Number.isFinite(rsiVal) && Math.sign(rsiVal - 50) === dir) confluence++;
      if (Number.isFinite(surge)  && surge >= 1.2)                  confluence++;
    }

    let target = regime;
    if      (score >=  et) target =  1;
    else if (score <= -et) target = -1;
    else if (Math.abs(score) <= xt) target = 0;

    if (target === 1  && Number.isFinite(rsiVal) && rsiVal > 72  && regime !== 1)  target = regime;
    if (target === -1 && Number.isFinite(rsiVal) && rsiVal < 28  && regime !== -1) target = regime;
    if (target === regime || target === 0) { pending = 0; pendingCount = 0; continue; }

    if (pending !== target) {
      pending = target; pendingCount = 1; lastEarlyAt = bars[i].time;
      signals.push({ time: bars[i].time, price: c, side: target > 0 ? 'eB' : 'eS', confluence });
    } else {
      pendingCount++;
    }
    if (pendingCount >= CONFIRM && lastEarlyAt !== bars[i].time) {
      signals.push({ time: bars[i].time, price: c, side: target > 0 ? 'B' : 'S', confluence });
      regime = pending; pending = 0; pendingCount = 0;
    }
  }
  return signals;
}

// ── NEW algorithm: DEMA(14/30) + Williams %R(9) [B-mode] ────────────────────
function computeSignalsNew(bars) {
  const closes  = bars.map(b => Number(b.close));
  const fast    = dema(closes, 14);
  const slow    = dema(closes, 30);
  const atr     = atrSeries(bars, 14);
  const wR      = williamsRSeries(bars, 9);
  const vol     = volumeSurgeSeries(bars, 20);
  const mutant  = computeMutant(bars, bars.length, 5);
  const mByTime = new Map(mutant.map(p => [p.time, p.value]));
  const BASE_CONFIRM = 2;

  const signals = [];
  let regime = 0, pending = 0, pendingCount = 0, lastEarlyAt = null;

  for (let i = 60; i < bars.length; i++) {
    const f = Number(fast[i]), s = Number(slow[i]);
    const c = Number(bars[i].close);
    const v = Number(atr[i]) || Math.max(1e-9, Math.abs(c) * 0.01);
    const m = Number(mByTime.get(bars[i].time) || 0);
    if (!Number.isFinite(f) || !Number.isFinite(s) || !Number.isFinite(c)) continue;

    const { enter: et, exit: xt } = adaptiveThresholds(atr, i);
    const wrVal  = Number(wR[i]);
    const surge  = Number(vol[i]);
    const vf     = volFactor(surge);
    const mw     = mutantWeight(mByTime, bars, i);
    const prev1  = Number(bars[i - 1]?.close ?? c);

    const velocity = (c - prev1) / v;
    const spreadSc = (f - s) / v;
    const priceSc  = (c - f) / v;
    const slopeSc  = (f - Number(fast[i - 2] ?? f)) / v;
    const score    = (0.45 * spreadSc + 0.25 * priceSc + 0.15 * slopeSc + 0.08 * velocity + mw * m) * vf;

    const dir = score > 0 ? 1 : score < 0 ? -1 : 0;
    let confluence = 0;
    if (dir) {
      if (spreadSc * dir > 0.05)                                                    confluence++;
      if (slopeSc  * dir > 0.02)                                                    confluence++;
      if (Number.isFinite(wrVal) && Math.sign(wrVal + 50) === dir)                  confluence++;
      if (Number.isFinite(surge) && surge >= 1.2)                                   confluence++;
    }

    // B-mode adaptive confirm: only go to 1 bar if VERY strong (4-star + 2.2x threshold)
    const dynConfirm = (confluence >= 4 && Math.abs(score) >= et * 2.2) ? 1 : BASE_CONFIRM;

    let target = regime;
    if      (score >=  et) target =  1;
    else if (score <= -et) target = -1;
    else if (Math.abs(score) <= xt) target = 0;

    if (target === 1  && Number.isFinite(wrVal) && wrVal >= -15 && regime !== 1)  target = regime;
    if (target === -1 && Number.isFinite(wrVal) && wrVal <= -85 && regime !== -1) target = regime;
    if (target === regime || target === 0) { pending = 0; pendingCount = 0; continue; }

    if (pending !== target) {
      pending = target; pendingCount = 1; lastEarlyAt = bars[i].time;
      signals.push({ time: bars[i].time, price: c, side: target > 0 ? 'eB' : 'eS', confluence });
    } else {
      pendingCount++;
    }
    if (pendingCount >= dynConfirm && lastEarlyAt !== bars[i].time) {
      signals.push({ time: bars[i].time, price: c, side: target > 0 ? 'B' : 'S', confluence });
      regime = pending; pending = 0; pendingCount = 0;
    }
  }
  return signals;
}

// ── Backtest engine ───────────────────────────────────────────────────────────
function runBacktest(bars, signals, buySide, sellSide) {
  const byTime = new Map(bars.map((b, i) => [Number(b.time), i]));
  const trades = [];
  let position = null;

  for (const sig of signals) {
    if (sig.side !== buySide && sig.side !== sellSide) continue;
    const idx = byTime.get(Number(sig.time));
    if (!Number.isInteger(idx) || idx + 1 >= bars.length) continue;
    const fill = Number(bars[idx + 1].open || bars[idx + 1].close);
    if (!Number.isFinite(fill)) continue;

    if (sig.side === buySide && !position) {
      position = { entry: fill * (1 + COST_RATE), time: bars[idx + 1].time };
    } else if (sig.side === sellSide && position) {
      const exit = fill * (1 - COST_RATE);
      trades.push({ pnl: (exit - position.entry) / position.entry });
      position = null;
    }
  }
  if (position && bars.length) {
    const last = Number(bars.at(-1).close);
    if (Number.isFinite(last)) {
      trades.push({ pnl: (last - position.entry) / position.entry, open: true });
    }
  }

  if (!trades.length) return { n: 0, wr: null, ret: null, dd: null };

  let equity = 1, peak = 1, maxDD = 0;
  for (const t of trades) {
    equity *= 1 + t.pnl;
    peak    = Math.max(peak, equity);
    maxDD   = Math.min(maxDD, equity / peak - 1);
  }
  const wins   = trades.filter(t => t.pnl > 0);
  return {
    n:   trades.length,
    wr:  wins.length / trades.length,
    ret: equity - 1,
    dd:  maxDD
  };
}

function buyAndHold(bars) {
  const entry = Number(bars[0]?.close);
  const exit  = Number(bars.at(-1)?.close);
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry === 0) return null;
  return (exit - entry) / entry;
}

// ── Formatting ────────────────────────────────────────────────────────────────
const p = (v, signed = true) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const s = (v * 100).toFixed(1) + '%';
  return signed && v > 0 ? '+' + s : s;
};
const wr = v => v === null || !Number.isFinite(v) ? '—' : (v * 100).toFixed(0) + '%';
const n  = v => (v === 0 || v) ? String(v) : '—';

function arrow(oldV, newV) {
  if (!Number.isFinite(oldV) || !Number.isFinite(newV)) return '—';
  return newV > oldV ? '✅↑' : newV < oldV ? '❌↓' : '➡️';
}

// ── Main ──────────────────────────────────────────────────────────────────────
const results = [];

for (const symbol of WATCHLIST) {
  process.stdout.write(`  ${symbol.padEnd(6)} ... `);
  try {
    const tv   = await fetchTradingViewBars({ symbol, tf: TF, limit: LIMIT });
    const bars  = tv.bars.map(b => ({
      time:   Number(b.time),
      open:   Number(b.open),
      high:   Number(b.high),
      low:    Number(b.low),
      close:  Number(b.close),
      volume: Number(b.volume || 0)
    })).filter(b => Number.isFinite(b.close)).slice(-LIMIT);

    if (bars.length < 120) {
      console.log(`skip (only ${bars.length} bars)`);
      results.push({ symbol, skip: true, reason: `only ${bars.length} bars` });
      continue;
    }

    const sigOld = computeSignalsOld(bars);
    const sigNew = computeSignalsNew(bars);

    const oldBS  = runBacktest(bars, sigOld, 'B',  'S');
    const oldEB  = runBacktest(bars, sigOld, 'eB', 'eS');
    const newBS  = runBacktest(bars, sigNew, 'B',  'S');
    const newEB  = runBacktest(bars, sigNew, 'eB', 'eS');
    const bnh    = buyAndHold(bars);

    results.push({ symbol, bars: bars.length, oldBS, oldEB, newBS, newEB, bnh });
    console.log(`✓  bars=${bars.length}  old_BS=${oldBS.n}t/${p(oldBS.ret)}  new_BS=${newBS.n}t/${p(newBS.ret)}`);
  } catch (err) {
    console.log(`✗  ${err.message?.slice(0, 60)}`);
    results.push({ symbol, skip: true, reason: err.message });
  }
}

// ── Output tables ─────────────────────────────────────────────────────────────
const line = [];
line.push('');
line.push('# 算法回测对比：OLD (EMA+RSI) vs NEW B-mode (DEMA+Williams%R)');
line.push('');
line.push(`> **周期**: ${TF}  ·  **最大数据量**: ${LIMIT} 根K线  ·  **成本**: 8bps/腿`);
line.push('');

// ── Table 1: B/S confirmed ────────────────────────────────────────────────────
line.push('## 📊 B/S 策略（确认信号）\n');
line.push('| 标的 | 旧版交易数 | 旧版胜率 | 旧版回报 | 旧版MaxDD | 新版交易数 | 新版胜率 | 新版回报 | 新版MaxDD | 回报变化 | Buy&Hold |');
line.push('|:----:|:-------:|:------:|:------:|:-------:|:-------:|:------:|:------:|:-------:|:------:|:------:|');

for (const r of results) {
  if (r.skip) {
    line.push(`| ${r.symbol} | *${r.reason}* | — | — | — | — | — | — | — | — | — |`);
    continue;
  }
  line.push([
    `| **${r.symbol}**`,
    n(r.oldBS.n),
    wr(r.oldBS.wr),
    p(r.oldBS.ret),
    p(r.oldBS.dd),
    n(r.newBS.n),
    wr(r.newBS.wr),
    p(r.newBS.ret),
    p(r.newBS.dd),
    arrow(r.oldBS.ret, r.newBS.ret),
    p(r.bnh) + ' |'
  ].join(' | '));
}

line.push('');

// ── Table 2: eB/eS early signals ─────────────────────────────────────────────
line.push('## ⚡ eB/eS 策略（早期信号）\n');
line.push('| 标的 | 旧版交易数 | 旧版胜率 | 旧版回报 | 旧版MaxDD | 新版交易数 | 新版胜率 | 新版回报 | 新版MaxDD | 回报变化 |');
line.push('|:----:|:-------:|:------:|:------:|:-------:|:-------:|:------:|:------:|:-------:|:------:|');

for (const r of results) {
  if (r.skip) {
    line.push(`| ${r.symbol} | *${r.reason}* | — | — | — | — | — | — | — | — |`);
    continue;
  }
  line.push([
    `| **${r.symbol}**`,
    n(r.oldEB.n),
    wr(r.oldEB.wr),
    p(r.oldEB.ret),
    p(r.oldEB.dd),
    n(r.newEB.n),
    wr(r.newEB.wr),
    p(r.newEB.ret),
    p(r.newEB.dd),
    arrow(r.oldEB.ret, r.newEB.ret) + ' |'
  ].join(' | '));
}

line.push('');

// ── Summary ───────────────────────────────────────────────────────────────────
const valid = results.filter(r => !r.skip);
const bsImproved = valid.filter(r => Number.isFinite(r.newBS.ret) && Number.isFinite(r.oldBS.ret) && r.newBS.ret > r.oldBS.ret).length;
const ebImproved = valid.filter(r => Number.isFinite(r.newEB.ret) && Number.isFinite(r.oldEB.ret) && r.newEB.ret > r.oldEB.ret).length;
const avgOldBSret = valid.filter(r => Number.isFinite(r.oldBS.ret)).reduce((s,r) => s + r.oldBS.ret, 0) / (valid.filter(r => Number.isFinite(r.oldBS.ret)).length || 1);
const avgNewBSret = valid.filter(r => Number.isFinite(r.newBS.ret)).reduce((s,r) => s + r.newBS.ret, 0) / (valid.filter(r => Number.isFinite(r.newBS.ret)).length || 1);
const avgOldWR = valid.filter(r => Number.isFinite(r.oldBS.wr)).reduce((s,r) => s + r.oldBS.wr, 0) / (valid.filter(r => Number.isFinite(r.oldBS.wr)).length || 1);
const avgNewWR = valid.filter(r => Number.isFinite(r.newBS.wr)).reduce((s,r) => s + r.newBS.wr, 0) / (valid.filter(r => Number.isFinite(r.newBS.wr)).length || 1);

line.push('## 📈 汇总\n');
line.push(`| 指标 | 旧版 | 新版 | 变化 |`);
line.push(`|:----:|:----:|:----:|:----:|`);
line.push(`| B/S 平均回报 | ${p(avgOldBSret)} | ${p(avgNewBSret)} | ${arrow(avgOldBSret, avgNewBSret)} |`);
line.push(`| B/S 平均胜率 | ${wr(avgOldWR)} | ${wr(avgNewWR)} | ${arrow(avgOldWR, avgNewWR)} |`);
line.push(`| B/S 改进标的数 | — | — | ${bsImproved}/${valid.length} 支 ✅ |`);
line.push(`| eB/eS 改进标的数 | — | — | ${ebImproved}/${valid.length} 支 ✅ |`);

const output = line.join('\n');
console.log(output);

// Write to file
import { writeFileSync } from 'fs';
writeFileSync('./scratch/backtest_results.md', output, 'utf8');
console.log('\n✅ 结果已写入 scratch/backtest_results.md');
