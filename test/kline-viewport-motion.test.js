import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraFromRange,
  rangeFromCamera,
  pixelFraction,
  logicalAtPixel,
  pixelAtLogical,
  easeAlpha,
  stepFling
} from '../public/composables/klineGeometry.js';
import { createViewportMotionController } from '../public/composables/klineViewportMotion.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} within eps ${eps}`);

test('klineViewportMotion: 5.2.1 half-bar camera projection round-trip', () => {
  const range = { from: 100.5, to: 199.5 }; // count = 100
  const cam = cameraFromRange(range);
  assert.equal(cam.left, 100);
  assert.equal(cam.count, 100);

  const back = rangeFromCamera(cam);
  assert.equal(back.from, 100.5);
  assert.equal(back.to, 199.5);

  const width = 1000;
  // candle 150 center projection
  const px = pixelAtLogical(cam, 150, width);
  const backLogical = logicalAtPixel(cam, px, width);
  near(backLogical, 150);
});

test('klineViewportMotion: target count accumulation and reversal debt cancellation', () => {
  let currentRange = { from: 0.5, to: 99.5 };
  const mockTimeScale = {
    setVisibleLogicalRange: (r) => { currentRange = r; },
    getVisibleLogicalRange: () => currentRange
  };

  const motion = createViewportMotionController({
    timeScale: mockTimeScale,
    getWidth: () => 1000,
    rate: 21.5
  });
  motion.seedFromRange(currentRange);

  // Zoom in (+delta with negative step in zoom in)
  // Step for delta -100 with gain 0.0006: -0.06 -> factor 0.94
  motion.queueZoom(-100, 1.0, { gain: 0.0006, minCount: 8, maxCount: 2000 });
  const s1 = motion.getState();
  assert.ok(s1.targetCount < 100);
  const targetBeforeReversal = s1.targetCount;

  // Immediate direction reversal: should discard pending shrink debt and reverse cleanly
  motion.queueZoom(100, 1.0, { gain: 0.0006, minCount: 8, maxCount: 2000 });
  const s2 = motion.getState();
  assert.ok(s2.targetCount > targetBeforeReversal);

  motion.dispose();
});

test('klineViewportMotion: frame-rate independence (60Hz vs 120Hz over 200ms)', () => {
  const rate = 21.5;
  const totalSeconds = 0.200;

  // Analytical target convergence over 200ms
  const startCount = 100;
  const targetCount = 50;
  const debt = targetCount - startCount;

  // 60Hz: 12 frames of dt = 0.200 / 12
  let count60 = startCount;
  const dt60 = totalSeconds / 12;
  for (let i = 0; i < 12; i++) {
    const a = easeAlpha(rate, dt60);
    count60 += (targetCount - count60) * a;
  }

  // 120Hz: 24 frames of dt = 0.200 / 24
  let count120 = startCount;
  const dt120 = totalSeconds / 24;
  for (let i = 0; i < 24; i++) {
    const a = easeAlpha(rate, dt120);
    count120 += (targetCount - count120) * a;
  }

  near(count60, count120, 1e-9);
  // Verify ~98% of distance covered
  const progress = (startCount - count60) / (startCount - targetCount);
  assert.ok(progress > 0.95 && progress < 1.0);
});

test('klineViewportMotion: horizontal fling exact time-integrated distance', () => {
  const friction = 12.0;
  const initialV = 800; // px/s
  const totalSeconds = 0.15;

  // 60 Hz simulation
  let v60 = initialV;
  let totalDx60 = 0;
  const dt60 = totalSeconds / 9;
  for (let i = 0; i < 9; i++) {
    const step = stepFling(v60, dt60, friction);
    totalDx60 += step.deltaPx;
    v60 = step.velocity;
  }

  // 120 Hz simulation
  let v120 = initialV;
  let totalDx120 = 0;
  const dt120 = totalSeconds / 18;
  for (let i = 0; i < 18; i++) {
    const step = stepFling(v120, dt120, friction);
    totalDx120 += step.deltaPx;
    v120 = step.velocity;
  }

  near(totalDx60, totalDx120, 1e-8);
  near(v60, v120, 1e-8);
});

test('klineViewportMotion: cancelMotion stops pending frames and increments epoch', () => {
  let range = { from: 10, to: 110 };
  const motion = createViewportMotionController({
    timeScale: {
      setVisibleLogicalRange: (r) => { range = r; },
      getVisibleLogicalRange: () => range
    },
    getWidth: () => 800
  });
  motion.seedFromRange(range);

  const initEpoch = motion.getState().epoch;
  motion.queueZoom(-50, 1.0);
  assert.equal(motion.getState().phase, 'wheel');

  motion.cancelMotion('test-cancel');
  assert.equal(motion.getState().epoch, initEpoch + 1);
  assert.equal(motion.getState().phase, 'idle');

  motion.dispose();
});

