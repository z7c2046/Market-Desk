import test from 'node:test';
import assert from 'node:assert/strict';
import { bindKlineGestures } from '../public/composables/klineGesture.js';

function createMockElement() {
  const listeners = new Map();
  return {
    dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }),
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener: (type, fn) => {
      if (!listeners.has(type)) return;
      const list = listeners.get(type).filter(f => f !== fn);
      listeners.set(type, list);
    },
    dispatchEvent: (event) => {
      const list = listeners.get(event.type) || [];
      for (const fn of list) fn(event);
    },
    setPointerCapture: () => {},
    releasePointerCapture: () => {}
  };
}

function createMockChart() {
  let range = { from: 10, to: 100 };
  return {
    timeScale: () => ({
      getVisibleLogicalRange: () => range,
      setVisibleLogicalRange: (r) => { range = r; }
    }),
    priceScale: () => ({
      applyOptions: () => {}
    })
  };
}

function createMockSeries() {
  return {
    coordinateToPrice: (y) => 100 - y * 0.1,
    priceToCoordinate: (p) => (100 - p) * 10
  };
}

test('Kline Gesture Mobile: Reading mode ignores touch pointerdown so page scrolling works', () => {
  const el = createMockElement();
  const chart = createMockChart();
  const series = createMockSeries();

  const controller = bindKlineGestures(el, chart, series, {
    inputPolicy: 'reading',
    getLatestLogicalIndex: () => 100,
    getFirstLogicalIndex: () => 0
  });

  assert.equal(controller.getInputPolicy(), 'reading');

  let prevented = false;
  const touchDownEvent = {
    type: 'pointerdown',
    pointerType: 'touch',
    pointerId: 1,
    clientX: 200,
    clientY: 200,
    preventDefault: () => { prevented = true; }
  };

  el.dispatchEvent(touchDownEvent);
  assert.equal(prevented, false, 'Touch event in reading mode must NOT be preventDefaulted');

  // Mouse event in reading mode still works (e.g. desktop preview)
  let mousePrevented = false;
  const mouseDownEvent = {
    type: 'pointerdown',
    pointerType: 'mouse',
    pointerId: 2,
    button: 0,
    clientX: 200,
    clientY: 200,
    preventDefault: () => { mousePrevented = true; }
  };
  el.dispatchEvent(mouseDownEvent);
  assert.equal(mousePrevented, true, 'Mouse event can still be captured');

  controller.dispose();
});

test('Kline Gesture Mobile: Switching to expanded mode enables full touch interaction', () => {
  const el = createMockElement();
  const chart = createMockChart();
  const series = createMockSeries();

  const controller = bindKlineGestures(el, chart, series, {
    inputPolicy: 'reading',
    getLatestLogicalIndex: () => 100,
    getFirstLogicalIndex: () => 0
  });

  controller.setInputPolicy('expanded');
  assert.equal(controller.getInputPolicy(), 'expanded');

  let touchPrevented = false;
  const touchDownEvent = {
    type: 'pointerdown',
    pointerType: 'touch',
    pointerId: 10,
    clientX: 200,
    clientY: 200,
    preventDefault: () => { touchPrevented = true; }
  };

  el.dispatchEvent(touchDownEvent);
  assert.equal(touchPrevented, true, 'Touch event in expanded mode MUST be captured and handled');

  controller.dispose();
});

test('Kline Gesture Mobile: zoomIn and zoomOut methods adjust logical time range', () => {
  const el = createMockElement();
  const chart = createMockChart();
  const series = createMockSeries();

  const controller = bindKlineGestures(el, chart, series, {
    getLatestLogicalIndex: () => 100,
    getFirstLogicalIndex: () => 0
  });

  const initialRange = chart.timeScale().getVisibleLogicalRange();
  const initialSpan = initialRange.to - initialRange.from;

  controller.zoomIn();
  const zoomedInSpan = chart.timeScale().getVisibleLogicalRange().to - chart.timeScale().getVisibleLogicalRange().from;
  assert.ok(zoomedInSpan < initialSpan, 'zoomIn must decrease the number of visible bars');

  controller.zoomOut();
  const zoomedOutSpan = chart.timeScale().getVisibleLogicalRange().to - chart.timeScale().getVisibleLogicalRange().from;
  assert.ok(zoomedOutSpan > zoomedInSpan, 'zoomOut must increase the number of visible bars');

  controller.dispose();
});
