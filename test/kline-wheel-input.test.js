import test from 'node:test';
import assert from 'node:assert/strict';
import { createWheelInputParser } from '../public/composables/klineWheelInput.js';

test('klineWheelInput: normalizes deltaMode 0, 1, 2 into CSS pixels', () => {
  const parser = createWheelInputParser();
  const ctx = { paneWidth: 800, paneHeight: 400, zone: 'plot' };

  // Mode 0: CSS px (1:1)
  const res0 = parser.parseWheel({ deltaX: 0, deltaY: 20, deltaMode: 0, timeStamp: 100 }, ctx);
  assert.equal(res0.admitted, true);
  assert.equal(res0.actions[0].delta, 20);

  parser.reset();
  // Mode 1: lines (* 16)
  const res1 = parser.parseWheel({ deltaX: 0, deltaY: 2, deltaMode: 1, timeStamp: 200 }, ctx);
  assert.equal(res1.admitted, true);
  assert.equal(res1.actions[0].delta, 32);

  parser.reset();
  // Mode 2: pages (* paneHeight)
  const res2 = parser.parseWheel({ deltaX: 0, deltaY: 0.5, deltaMode: 2, timeStamp: 300 }, ctx);
  assert.equal(res2.admitted, true);
  assert.equal(res2.actions[0].delta, 200);
});

test('klineWheelInput: sub-pixel micro input accumulates to ~1px before release and drops opposite residue', () => {
  const parser = createWheelInputParser({ microThreshold: 1.0 });
  const ctx = { paneWidth: 800, paneHeight: 400, zone: 'plot' };

  // 0.4px input: not admitted
  const r1 = parser.parseWheel({ deltaX: 0, deltaY: 0.4, deltaMode: 0, timeStamp: 100 }, ctx);
  assert.equal(r1.admitted, false);

  // Another 0.7px in same direction: total 1.1px >= 1.0px -> released!
  const r2 = parser.parseWheel({ deltaX: 0, deltaY: 0.7, deltaMode: 0, timeStamp: 110 }, ctx);
  assert.equal(r2.admitted, true);
  assert.ok(Math.abs(r2.actions[0].delta - 1.1) < 1e-6);

  // Micro reversal drops residue:
  // 0.3px positive
  parser.parseWheel({ deltaX: 0, deltaY: 0.3, deltaMode: 0, timeStamp: 120 }, ctx);
  // Reversal: -0.3px negative drops the +0.3 residue instead of canceling to 0
  const r3 = parser.parseWheel({ deltaX: 0, deltaY: -0.3, deltaMode: 0, timeStamp: 130 }, ctx);
  assert.equal(r3.admitted, false);
  // Another -0.8px in negative direction: releases -1.1px
  const r4 = parser.parseWheel({ deltaX: 0, deltaY: -0.8, deltaMode: 0, timeStamp: 140 }, ctx);
  assert.equal(r4.admitted, true);
  assert.ok(Math.abs(r4.actions[0].delta - (-1.1)) < 1e-6);
});

test('klineWheelInput: trackpad horizontal pan locks X axis and does not trigger zoom', () => {
  const parser = createWheelInputParser({ lockThreshold: 8.0 });
  const ctx = { paneWidth: 800, paneHeight: 400, zone: 'plot' };

  // Sequence of purely horizontal trackpad inputs
  const r1 = parser.parseWheel({ deltaX: 5.0, deltaY: 0.5, deltaMode: 0, timeStamp: 100 }, ctx);
  assert.equal(r1.admitted, true);
  assert.equal(r1.actions[0].type, 'pan');

  const r2 = parser.parseWheel({ deltaX: 6.0, deltaY: 0.2, deltaMode: 0, timeStamp: 120 }, ctx);
  assert.equal(r2.admitted, true);
  assert.equal(r2.actions[0].type, 'pan');
  assert.equal(parser.getLockedAxis(), 'x');
});

test('klineWheelInput: axis switching with deferred sample replay', () => {
  const parser = createWheelInputParser({
    lockThreshold: 6.0,
    switchDominanceRatio: 2.0,
    switchCountThreshold: 2,
    switchDistThreshold: 8.0
  });
  const ctx = { paneWidth: 800, paneHeight: 400, zone: 'plot' };

  // Lock Y axis (zoom) first
  parser.parseWheel({ deltaX: 0, deltaY: 10, deltaMode: 0, timeStamp: 100 }, ctx);
  assert.equal(parser.getLockedAxis(), 'y');

  // Candidate sample 1 for X (dominant: 6 vs 0)
  const c1 = parser.parseWheel({ deltaX: 6, deltaY: 0, deltaMode: 0, timeStamp: 120 }, ctx);
  // Not yet switched (needs count >= 2 and dist >= 8)
  assert.equal(parser.getLockedAxis(), 'y');

  // Candidate sample 2 for X (dominant: 6 vs 0) -> switch triggered!
  const c2 = parser.parseWheel({ deltaX: 6, deltaY: 0, deltaMode: 0, timeStamp: 140 }, ctx);
  assert.equal(parser.getLockedAxis(), 'x');
  // Deferred samples are replayed as pan!
  assert.equal(c2.actions.length, 2);
  assert.equal(c2.actions[0].type, 'pan');
  assert.equal(c2.actions[0].deltaPx, 6);
  assert.equal(c2.actions[1].type, 'pan');
  assert.equal(c2.actions[1].deltaPx, 6);
});

test('klineWheelInput: ctrlKey pinch zoom bypasses axis competition directly', () => {
  const parser = createWheelInputParser();
  const ctx = { paneWidth: 800, paneHeight: 400, zone: 'plot' };

  const r = parser.parseWheel({
    deltaX: 10,
    deltaY: -15,
    ctrlKey: true,
    deltaMode: 0,
    timeStamp: 100
  }, ctx);

  assert.equal(r.admitted, true);
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0].type, 'zoom');
  assert.equal(r.actions[0].subType, 'pinch');
  assert.equal(r.actions[0].delta, -15);
  assert.equal(r.actions[0].gain, 0.00625);
});

test('klineWheelInput: Alt/Meta selects cursor anchor; regular wheel selects right anchor', () => {
  const parser = createWheelInputParser();
  const ctx = { paneWidth: 1000, paneHeight: 500, zone: 'plot', localX: 250 };

  // Regular wheel -> right anchor (fraction = 1.0)
  const reg = parser.parseWheel({ deltaX: 0, deltaY: 20, deltaMode: 0, timeStamp: 100 }, ctx);
  assert.equal(reg.actions[0].fraction, 1.0);
  assert.equal(reg.actions[0].anchorType, 'right');

  parser.reset();
  // Alt + wheel -> cursor anchor ((250 + 1) / 1000 = 0.251)
  const alt = parser.parseWheel({ deltaX: 0, deltaY: 20, altKey: true, deltaMode: 0, timeStamp: 200 }, ctx);
  assert.equal(alt.actions[0].anchorType, 'cursor');
  assert.ok(Math.abs(alt.actions[0].fraction - 0.251) < 1e-6);
});

