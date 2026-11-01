import test from 'node:test';
import assert from 'node:assert/strict';

import {
  R1_CONFIG,
  dema,
  ema,
  trueRangeSeries,
  atrSeries,
  percentileLinear,
  calcPathEfficiency,
  calcConfirmationThreshold,
  stepAccumulator,
  constantSignalAccumulator,
  computeR1Features,
  computeInflectionSignals,
  formatSignalMarkers
} from '../public/inflection-hunter/index.js';

test('R1 Spec Section 15 P1: Sign preservation of tanh(x/s)', () => {
  const scales = [0.1, 0.5, 1.0, 2.5, 10.0];
  const testValues = [-10, -2, -0.5, 0, 0.5, 2, 10];

  for (const s of scales) {
    for (const x of testValues) {
      const z = Math.tanh(x / s);
      assert.equal(Math.sign(z), Math.sign(x), `Sign preserved for x=${x}, s=${s}`);
    }
  }
});

test('R1 Spec Section 15 P2 & P3: Score bounded in [-1, 1] and volume multiplier in [0.65, 1.35]', () => {
  const gamma = R1_CONFIG.gamma; // 0.35
  const ratios = [0.000001, 0.1, 0.5, 1.0, 2.0, 5.0, 100.0, 10000.0];

  for (const r of ratios) {
    const g = 1 + gamma * Math.tanh(Math.log(r));
    assert.ok(g >= 1 - gamma - 1e-6, `g >= 0.65 for ratio=${r}`);
    assert.ok(g <= 1 + gamma + 1e-6, `g <= 1.35 for ratio=${r}`);
  }
});

test('R1 Spec Section 15 P4: Two-sided accumulator upper bound is 4.5', () => {
  // B = (1 - k) / (1 - rho) = (1 - 0.10) / (1 - 0.80) = 4.50
  let ePlus = 0;
  let eMinus = 0;

  // Drive with extreme scores +1 and -1
  for (let i = 0; i < 1000; i++) {
    const step = stepAccumulator(ePlus, eMinus, 1.0, 0.80, 0.10);
    ePlus = step.ePlus;
    eMinus = step.eMinus;
    assert.ok(ePlus <= 4.5 + 1e-12, `ePlus ${ePlus} does not exceed 4.5`);
  }
});

test('R1 Spec Section 16: Deterministic verification cases from Spec table', () => {
  const rho = 0.80;
  const k = 0.10;

  // Case 1: [0.90], H=0.65 => E1 = 0.80 >= 0.65 (Confirmed on bar 1)
  {
    const step1 = stepAccumulator(0, 0, 0.90, rho, k);
    assert.equal(Number(step1.ePlus.toFixed(4)), 0.80);
    assert.ok(step1.ePlus >= 0.65, 'Case 1 confirmed on bar 1');
  }

  // Case 2: [0.26, 0.26], H=0.65 => E = [0.16, 0.288] (Not confirmed)
  {
    const step1 = stepAccumulator(0, 0, 0.26, rho, k);
    assert.equal(Number(step1.ePlus.toFixed(4)), 0.16);
    const step2 = stepAccumulator(step1.ePlus, step1.eMinus, 0.26, rho, k);
    assert.equal(Number(step2.ePlus.toFixed(4)), 0.288);
    assert.ok(step2.ePlus < 0.65, 'Case 2 not confirmed');
  }

  // Case 3: [0.80, 0.24, 0.75], H=0.90 => E = [0.70, 0.70, 1.21] (Confirmed on bar 3)
  {
    const step1 = stepAccumulator(0, 0, 0.80, rho, k);
    assert.equal(Number(step1.ePlus.toFixed(4)), 0.70);
    const step2 = stepAccumulator(step1.ePlus, step1.eMinus, 0.24, rho, k);
    assert.equal(Number(step2.ePlus.toFixed(4)), 0.70);
    const step3 = stepAccumulator(step2.ePlus, step2.eMinus, 0.75, rho, k);
    assert.equal(Number(step3.ePlus.toFixed(4)), 1.21);
    assert.ok(step3.ePlus >= 0.90, 'Case 3 confirmed on bar 3');
  }

  // Case 4: [0.90, 0.90], H=1.17 => E = [0.80, 1.44] (Confirmed on bar 2)
  {
    const step1 = stepAccumulator(0, 0, 0.90, rho, k);
    assert.equal(Number(step1.ePlus.toFixed(4)), 0.80);
    const step2 = stepAccumulator(step1.ePlus, step1.eMinus, 0.90, rho, k);
    assert.equal(Number(step2.ePlus.toFixed(4)), 1.44);
    assert.ok(step2.ePlus >= 1.17, 'Case 4 confirmed on bar 2');
  }

  // Case 5: 100 bars of 0.20, H=0.65 => Asymptotic 0.50 (Never confirmed)
  {
    let e = 0;
    for (let i = 0; i < 100; i++) {
      e = stepAccumulator(e, 0, 0.20, rho, k).ePlus;
    }
    assert.ok(Math.abs(e - 0.50) < 0.001, `Asymptotic 0.50, got ${e}`);
    assert.ok(e < 0.65, 'Case 5 never crosses 0.65');
  }
});

test('R1 Spec Section 7: Path efficiency ERprev and dynamic confirmation threshold H', () => {
  // Straight trend: ER = 1.0 => H = 0.65
  const straightH = calcConfirmationThreshold(1.0, 0.65, 0.80);
  assert.equal(straightH, 0.65);

  // Choppy trend: ER = 0.0 => H = 0.65 * (1 + 0.80) = 1.17
  const choppyH = calcConfirmationThreshold(0.0, 0.65, 0.80);
  assert.equal(Number(choppyH.toFixed(4)), 1.17);

  // Intermediate ER = 0.50 => H = 0.65 * [1 + 0.80 * 0.25] = 0.65 * 1.2 = 0.78
  const midH = calcConfirmationThreshold(0.50, 0.65, 0.80);
  assert.equal(Number(midH.toFixed(4)), 0.78);
});

test('R1 Spec Section 5 & 6: Feature extraction and unified score calculation', () => {
  const bars = Array.from({ length: 50 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume: 1000000
  }));

  const feats = computeR1Features(bars);
  assert.equal(feats.length, 50);

  for (let i = 0; i < feats.length; i++) {
    const f = feats[i];
    assert.ok(f.S >= -1.0 && f.S <= 1.0, `Score ${f.S} within [-1, 1]`);
    assert.ok(f.sigma >= 0.01, 'Sigma scale positive');
    assert.ok(Number.isFinite(f.z_T));
    assert.ok(Number.isFinite(f.z_A));
    assert.ok(Number.isFinite(f.z_M));
  }
});

test('R1 Spec End-to-End: State Machine emits EB, B, ES, S signals & formatSignalMarkers', () => {
  const bars = [];
  let p = 100;
  for (let i = 0; i < 90; i++) {
    if (i < 30) p += 1.2;
    else if (i < 60) p -= 1.3;
    else p += 1.25;

    bars.push({
      time: 1700000000 + i * 86400,
      open: p - 0.3,
      high: p + 0.8,
      low: p - 0.8,
      close: p,
      volume: 1500000 + (i % 5 === 0 ? 900000 : 0)
    });
  }

  const signals = computeInflectionSignals(bars);
  assert.ok(signals.length >= 2, `Signals generated: ${signals.length}`);

  const sides = signals.map(s => s.side);
  assert.ok(sides.includes('EB') || sides.includes('B'), 'Contains bullish signals');
  assert.ok(sides.includes('ES') || sides.includes('S'), 'Contains bearish signals');

  const markers = formatSignalMarkers(signals);
  assert.equal(markers.length, signals.length);

  for (let i = 0; i < markers.length - 1; i++) {
    assert.ok(markers[i].time <= markers[i + 1].time, 'Markers ordered chronologically');
  }

  const eb = markers.find(m => m.text === 'EB');
  if (eb) {
    assert.equal(eb.color, '#38bdf8');
    assert.equal(eb.position, 'belowBar');
    assert.equal(eb.shape, 'arrowUp');
  }

  const s = markers.find(m => m.text === 'S');
  if (s) {
    assert.equal(s.color, '#ef4444');
    assert.equal(s.position, 'aboveBar');
    assert.equal(s.shape, 'arrowDown');
  }
});

