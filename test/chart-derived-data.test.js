import test from 'node:test';
import assert from 'node:assert/strict';
import { createChartDerivedData } from '../public/composables/chartDerivedData.js';

const mockBars = [
  { time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: 1060, open: 11, high: 13, low: 10, close: 12, volume: 120 },
  { time: 1120, open: 12, high: 14, low: 11, close: 13, volume: 110 },
  { time: 1180, open: 13, high: 15, low: 12, close: 14, volume: 130 },
  { time: 1240, open: 14, high: 16, low: 13, close: 15, volume: 150 },
];

test('chartDerivedData: caches snapshot for same context and bars without re-computation', () => {
  let signalComputeCount = 0;
  const mockComputeSignals = (bars) => {
    signalComputeCount++;
    return [{ time: 1240, side: 'B', price: 15 }];
  };

  const cache = createChartDerivedData({
    computeSignals: mockComputeSignals,
    formatMarkers: (sigs) => sigs.map(s => ({ time: s.time, position: 'belowBar' })),
    dema: (closes, period) => closes.map(c => c * 1.05)
  });

  const ctx = {
    symbol: 'NVDA',
    interval: '15m',
    range: '1d',
    dataRevision: 1,
    showSignals: true
  };

  const snap1 = cache.getSnapshot(ctx, mockBars);
  assert.equal(signalComputeCount, 1);
  assert.equal(snap1.bars.length, 5);
  assert.equal(snap1.signals.length, 1);

  // Repeat request with identical context returns cached snapshot reference
  const snap2 = cache.getSnapshot(ctx, mockBars);
  assert.equal(signalComputeCount, 1);
  assert.strictEqual(snap1, snap2);

  // Context change invalidates and recalculates
  const snap3 = cache.getSnapshot({ ...ctx, dataRevision: 2 }, mockBars);
  assert.equal(signalComputeCount, 2);
  assert.notStrictEqual(snap1, snap3);
});

test('chartDerivedData: preserves multiple signals at same time in order and preserves DEMA nulls', () => {
  const multiSignals = [
    { time: 1120, side: 'EB', label: '观察买入' },
    { time: 1120, side: 'B', label: '确认买入' }
  ];

  const cache = createChartDerivedData({
    computeSignals: () => multiSignals,
    formatMarkers: (sigs) => sigs,
    dema: (closes, p) => [null, null, 12.5, 13.5, 14.5] // simulate warmup nulls
  });

  const snap = cache.getSnapshot({ symbol: 'AMD', dataRevision: 1, showSignals: true }, mockBars);
  const list = snap.signalsByTime.get(1120);
  assert.equal(list.length, 2);
  assert.equal(list[0].side, 'EB');
  assert.equal(list[1].side, 'B');

  // Verify warmup null is preserved without being converted to 0
  assert.strictEqual(snap.fastDema[0], null);
  assert.strictEqual(snap.fastDema[1], null);
  assert.strictEqual(snap.fastDema[2], 12.5);
});

test('chartDerivedData: formatReadoutHtml memoization and stable date formatting', () => {
  const cache = createChartDerivedData({
    computeSignals: () => [{ time: 1240, side: 'B' }],
    formatMarkers: () => [],
    dema: (c) => c
  });

  const snap = cache.getSnapshot({ symbol: 'SPY', dataRevision: 1, showSignals: true }, mockBars);
  const bar = mockBars[4];

  const html1 = cache.formatReadoutHtml(bar, snap, {
    klineScheme: { up: '#10b981', down: '#ef4444' },
    klineSchemeKey: 'classic',
    isDark: true,
    showSignals: true
  });

  assert.ok(html1.includes('15.00'));
  assert.ok(html1.includes('B 确认买入'));

  // Identical bar and snapshot returns memoized string
  const html2 = cache.formatReadoutHtml(bar, snap, {
    klineScheme: { up: '#10b981', down: '#ef4444' },
    klineSchemeKey: 'classic',
    isDark: true,
    showSignals: true
  });
  assert.strictEqual(html1, html2);
});

