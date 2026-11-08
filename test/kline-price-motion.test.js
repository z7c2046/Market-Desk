import test from 'node:test';
import assert from 'node:assert/strict';
import {
  safeAutoPriceStep,
  zoomPriceAbout
} from '../public/composables/klineGeometry.js';
import { createPriceMotionController } from '../public/composables/klinePriceMotion.js';

const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} within eps ${eps}`);

test('klinePriceMotion: expansion protection expands instantly to contain extrema and contracts smoothly', () => {
  const display = { from: 100, to: 200 };

  // New high spike (expansion): target = { from: 100, to: 250 }
  const expanded = safeAutoPriceStep(display, { from: 100, to: 250 }, 0.016, 20);
  // High should expand immediately to contain new peak
  assert.equal(expanded.to, 250);
  assert.equal(expanded.from, 100);

  // New contraction: target = { from: 120, to: 180 }
  const contracted = safeAutoPriceStep(display, { from: 120, to: 180 }, 0.016, 20);
  // Should not jump immediately to 120/180; must have intermediate smooth state
  assert.ok(contracted.from > 100 && contracted.from < 120);
  assert.ok(contracted.to < 200 && contracted.to > 180);
});

test('klinePriceMotion: autoscaleInfoProvider retains raw margins and provides union range', () => {
  let appliedOptions = null;
  const mockSeries = {
    applyOptions: (opts) => { appliedOptions = opts; },
    coordinateToPrice: (y) => 200 - y * 0.25
  };
  const mockChart = {
    priceScale: () => ({
      applyOptions: () => {},
      setAutoScale: () => {},
      getVisibleRange: () => ({ from: 100, to: 200 })
    })
  };

  const priceCtrl = createPriceMotionController(mockChart, mockSeries, { enableAutoSmooth: true });
  priceCtrl.attachSeriesProvider(mockSeries, 'main-candle');

  assert.ok(typeof appliedOptions.autoscaleInfoProvider === 'function');
  const provider = appliedOptions.autoscaleInfoProvider;

  // First call seeds displayRange
  const raw1 = { priceRange: { minValue: 100, maxValue: 200 }, margins: { above: 0.1, below: 0.2 } };
  const res1 = provider(() => raw1);
  assert.equal(res1.priceRange.minValue, 100);
  assert.equal(res1.priceRange.maxValue, 200);
  assert.deepEqual(res1.margins, { above: 0.1, below: 0.2 });

  // Extrema spike: raw2 = { minValue: 90, maxValue: 220 }
  const raw2 = { priceRange: { minValue: 90, maxValue: 220 }, margins: { above: 0.1, below: 0.2 } };
  const res2 = provider(() => raw2);
  // Returns union so new extrema is immediately visible
  assert.equal(res2.priceRange.minValue, 90);
  assert.equal(res2.priceRange.maxValue, 220);

  priceCtrl.dispose();
});

test('klinePriceMotion: zoomPriceAbout anchors exactly at pointer price (including margins)', () => {
  const range = { from: 100, to: 200 };
  const anchorPrice = 140; // pointer is at $140
  const factor = 0.5; // zoom in by 2x

  const zoomed = zoomPriceAbout(range, anchorPrice, factor);
  // anchorPrice stays fixed:
  // newFrom = 140 + (100 - 140) * 0.5 = 120
  // newTo = 140 + (200 - 140) * 0.5 = 170
  assert.equal(zoomed.from, 120);
  assert.equal(zoomed.to, 170);
  assert.equal(zoomed.to - zoomed.from, 50);

  // Even if anchorPrice is outside (in margins, e.g. $210):
  const marginAnchor = 210;
  const zoomedMargin = zoomPriceAbout(range, marginAnchor, factor);
  assert.equal(zoomedMargin.from, 210 + (100 - 210) * 0.5); // 155
  assert.equal(zoomedMargin.to, 210 + (200 - 210) * 0.5); // 205
});

test('klinePriceMotion: manual price mode bypasses auto smoothing and reset restores auto', () => {
  let scaleAutoScale = true;
  const mockChart = {
    priceScale: () => ({
      applyOptions: (opts) => { if (opts.autoScale !== undefined) scaleAutoScale = opts.autoScale; },
      setAutoScale: (v) => { scaleAutoScale = v; },
      getVisibleRange: () => ({ from: 100, to: 200 }),
      setVisibleRange: () => {}
    }),
    applyOptions: () => {}
  };
  const mockSeries = {
    applyOptions: () => {},
    coordinateToPrice: (y) => 200 - y
  };

  const priceCtrl = createPriceMotionController(mockChart, mockSeries);
  assert.equal(priceCtrl.getPriceMode(), 'auto');

  // Lock manual
  priceCtrl.lockManualPriceScale({ from: 110, to: 190 });
  assert.equal(priceCtrl.getPriceMode(), 'manual');
  assert.equal(scaleAutoScale, false);

  // Step auto price has no work in manual mode
  assert.equal(priceCtrl.stepAutoPrice(0.016), false);

  // Reset restores auto
  priceCtrl.resetPriceScale();
  assert.equal(priceCtrl.getPriceMode(), 'auto');
  assert.equal(scaleAutoScale, true);

  priceCtrl.dispose();
});

test('klinePriceMotion: queuePriceZoom accumulates target span and eases smoothly via single rAF model', () => {
  let visibleRange = { from: 100, to: 200 };
  const mockChart = {
    priceScale: () => ({
      applyOptions: () => {},
      setAutoScale: () => {},
      getVisibleRange: () => visibleRange,
      setVisibleRange: (r) => { visibleRange = { from: r.from, to: r.to }; }
    }),
    applyOptions: () => {}
  };
  const mockSeries = {
    applyOptions: () => {},
    coordinateToPrice: (y) => 200 - y * 0.25 // y=200 -> price=150 (midpoint)
  };

  const priceCtrl = createPriceMotionController(mockChart, mockSeries, { rate: 21.5 });

  // Wheel zoom out: deltaPixels = 100, pointerY = 200 (anchorPrice = 150)
  priceCtrl.queuePriceZoom(100, 200, 400, { gain: 0.0006 });
  assert.equal(priceCtrl.getPriceMode(), 'manual');

  const target1 = priceCtrl.getManualTargetRange();
  assert.ok(target1);
  assert.ok(target1.to - target1.from > 100, 'Target span should expand on positive delta');

  // Advance motion by 16ms
  const now0 = 1000;
  priceCtrl.stepMotion(now0);
  priceCtrl.stepMotion(now0 + 16);

  const display1 = priceCtrl.getManualDisplayRange();
  assert.ok(display1);
  // Display span should have smoothly expanded between 100 and target span
  const currentSpan = display1.to - display1.from;
  assert.ok(currentSpan > 100 && currentSpan < target1.to - target1.from);

  // Reversal: quick wheel in the opposite direction (-100) cuts debt
  priceCtrl.queuePriceZoom(-100, 200, 400, { gain: 0.0006 });
  const targetReversed = priceCtrl.getManualTargetRange();
  // Reversed target should immediately cut previous expansion debt
  assert.ok(targetReversed.to - targetReversed.from < currentSpan);

  // Advance several frames until settling
  for (let t = 2; t <= 30; t++) {
    priceCtrl.stepMotion(now0 + t * 16);
  }

  const settled = priceCtrl.getManualDisplayRange();
  near(settled.from, targetReversed.from, 0.05);
  near(settled.to, targetReversed.to, 0.05);

  priceCtrl.dispose();
});

test('klinePriceMotion: dragScalePrice stretches and compresses price axis around cursor grab anchor', () => {
  let visibleRange = { from: 100, to: 200 };
  const mockChart = {
    priceScale: () => ({
      applyOptions: () => {},
      setAutoScale: () => {},
      getVisibleRange: () => visibleRange,
      setVisibleRange: (r) => { visibleRange = { from: r.from, to: r.to }; }
    }),
    applyOptions: () => {}
  };
  const mockSeries = {
    applyOptions: () => {},
    coordinateToPrice: (y) => 200 - y * 0.25
  };

  const priceCtrl = createPriceMotionController(mockChart, mockSeries, { axisSensitivity: 0.0055 });
  const startPrice = { from: 100, to: 200 };
  const startAnchorPrice = 150; // Grabbed at $150

  // Drag up by 100px: totalDy = -100 (should expand price span)
  priceCtrl.dragScalePrice(-100, startPrice, startAnchorPrice, 400);
  priceCtrl.endDrag();

  assert.equal(priceCtrl.getPriceMode(), 'manual');
  assert.ok(visibleRange.to - visibleRange.from > 100);
  // Anchor price 150 must remain stationary relative to expansion
  // (150 - from) / span should equal 0.5
  near((150 - visibleRange.from) / (visibleRange.to - visibleRange.from), 0.5, 1e-4);

  // Drag down by 100px: totalDy = +100 (should compress price span)
  priceCtrl.dragScalePrice(100, startPrice, startAnchorPrice, 400);
  priceCtrl.endDrag();
  assert.ok(visibleRange.to - visibleRange.from < 100);
  near((150 - visibleRange.from) / (visibleRange.to - visibleRange.from), 0.5, 1e-4);

  // Return to 0: returns exactly to startPrice
  priceCtrl.dragScalePrice(0, startPrice, startAnchorPrice, 400);
  priceCtrl.endDrag();
  near(visibleRange.from, 100, 1e-4);
  near(visibleRange.to, 200, 1e-4);

  priceCtrl.dispose();
});

test('klinePriceMotion: panPrice shifts range with 1:1 mouse movement without jitter', () => {
  let visibleRange = { from: 100, to: 200 };
  const mockChart = {
    priceScale: () => ({
      applyOptions: () => {},
      setAutoScale: () => {},
      getVisibleRange: () => visibleRange,
      setVisibleRange: (r) => { visibleRange = { from: r.from, to: r.to }; }
    }),
    applyOptions: () => {}
  };
  const mockSeries = {
    applyOptions: () => {},
    coordinateToPrice: (y) => 200 - y * 0.25 // pricePerPx = 0.25
  };

  const priceCtrl = createPriceMotionController(mockChart, mockSeries);
  const startPrice = { from: 100, to: 200 };

  // Pan downwards by 40px: shift = +40 * 0.25 = +10
  priceCtrl.panPrice(40, startPrice, 400);
  priceCtrl.endDrag();

  near(visibleRange.from, 110, 1e-4);
  near(visibleRange.to, 210, 1e-4);
  near(visibleRange.to - visibleRange.from, 100, 1e-4); // Span stays strictly constant

  priceCtrl.dispose();
});
