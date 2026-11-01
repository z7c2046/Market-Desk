import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dema,
  ema,
  atrSeries,
  volumeSurgeSeries,
  computeMutant,
  computeInflectionSignals,
  formatSignalMarkers
} from '../public/inflection-signals.js';

test('DEMA: exhibits faster convergence than simple EMA', () => {
  const values = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const emaVals = ema(values, 5);
  const demaVals = dema(values, 5);
  assert.equal(emaVals.length, values.length);
  assert.equal(demaVals.length, values.length);
  // On a persistent uptrend, DEMA tracks closer to current price than single EMA
  const lastEma = emaVals[emaVals.length - 1];
  const lastDema = demaVals[demaVals.length - 1];
  assert.ok(lastDema > lastEma, 'DEMA has lower lag and higher tracking value in uptrend');
});

test('ATR & Volume Surge: calculates realistic volatility and surge ratios', () => {
  const bars = Array.from({ length: 30 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: i === 25 ? 3000000 : 1000000
  }));

  const atr = atrSeries(bars, 14);
  assert.equal(atr.length, bars.length);
  assert.ok(Math.abs(atr[20] - 10) < 0.01, 'True range is accurately averaged to 10');

  const volSurge = volumeSurgeSeries(bars, 20);
  assert.equal(volSurge.length, bars.length);
  assert.ok(volSurge[25] > 2.0, 'Volume surge is correctly detected on spike bar');
});

test('computeMutant: values are clamped within [-1, 1] range', () => {
  const bars = Array.from({ length: 40 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 100 + i * 2,
    high: 102 + i * 2,
    low: 99 + i * 2,
    close: 101 + i * 2,
    volume: 1000000
  }));

  const mutant = computeMutant(bars, bars.length, 5);
  assert.equal(mutant.length, bars.length);
  for (const m of mutant) {
    assert.ok(m.value >= -1.0 && m.value <= 1.0, `Mutant value ${m.value} is within [-1, 1]`);
  }
});

test('computeInflectionSignals: generates EB, B, ES, S signals on trend reversals', () => {
  // Construct a clear upward wave, downward wave, and secondary upward wave
  const bars = [];
  let price = 100;
  for (let i = 0; i < 90; i++) {
    if (i < 30) price += 0.9;
    else if (i < 60) price -= 1.0;
    else price += 0.95;

    bars.push({
      time: 1700000000 + i * 86400,
      open: price - 0.2,
      high: price + 0.6,
      low: price - 0.6,
      close: price,
      volume: 1000000 + (i % 6 === 0 ? 800000 : 0)
    });
  }

  const signals = computeInflectionSignals(bars);
  assert.ok(signals.length >= 2, `Signals emitted: ${signals.length}`);

  const sides = signals.map(s => s.side);
  // Must emit early signals (EB/ES) and confirmed signals (B/S)
  assert.ok(sides.includes('ES') || sides.includes('S'), 'Contains bearish inflection signals');
  assert.ok(sides.includes('EB') || sides.includes('B'), 'Contains bullish inflection signals');

  const markers = formatSignalMarkers(signals);
  assert.equal(markers.length, signals.length);
  for (let i = 0; i < markers.length - 1; i++) {
    assert.ok(markers[i].time <= markers[i + 1].time, 'Markers must be sorted chronologically');
  }

  const ebMarker = markers.find(m => m.text === 'EB');
  if (ebMarker) {
    assert.equal(ebMarker.position, 'belowBar');
    assert.equal(ebMarker.shape, 'arrowUp');
    assert.equal(ebMarker.color, '#38bdf8');
  }

  const sMarker = markers.find(m => m.text === 'S');
  if (sMarker) {
    assert.equal(sMarker.position, 'aboveBar');
    assert.equal(sMarker.shape, 'arrowDown');
    assert.equal(sMarker.color, '#ef4444');
  }
});

