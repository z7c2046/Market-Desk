import test from 'node:test';
import assert from 'node:assert/strict';
import { bindKlineGestures } from '../public/composables/klineGesture.js';

function createTouchChartMock(options = {}) {
  const width = options.width ?? 390;
  const height = options.height ?? 380;
  const paneWidth = options.paneWidth ?? 325;
  const paneHeight = options.paneHeight ?? 352;
  let visibleRange = { ...(options.initialRange || { from: 40, to: 100 }) };
  let autoScale = true;
  let lastPriceRange = null;

  const listeners = new Map();
  const element = {
    dataset: {},
    style: {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width, height };
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    dispatch(type, eventObj) {
      let defaultPrevented = false;
      const evt = {
        ...eventObj,
        preventDefault() {
          defaultPrevented = true;
        },
        stopPropagation() {},
        get defaultPrevented() {
          return defaultPrevented;
        }
      };
      for (const fn of listeners.get(type) || []) {
        fn(evt);
      }
      return evt;
    }
  };

  const chart = {
    paneSize() {
      return { width: paneWidth, height: paneHeight };
    },
    timeScale() {
      return {
        getVisibleLogicalRange() {
          return { ...visibleRange };
        },
        setVisibleLogicalRange(next) {
          visibleRange = { from: next.from, to: next.to };
        }
      };
    },
    priceScale() {
      return {
        applyOptions(opts) {
          if (opts && typeof opts.autoScale === 'boolean') autoScale = opts.autoScale;
        },
        setVisibleRange(next) {
          if (next) lastPriceRange = { minValue: next.from, maxValue: next.to, from: next.from, to: next.to };
        }
      };
    },
    applyOptions() {},
    subscribeCrosshairMove() {},
    unsubscribeCrosshairMove() {}
  };

  const minPrice = 100;
  const maxPrice = 200;
  const series = {
    coordinateToPrice(y) {
      const ratio = y / paneHeight;
      return maxPrice - ratio * (maxPrice - minPrice);
    },
    priceToCoordinate(p) {
      return ((maxPrice - p) / (maxPrice - minPrice)) * paneHeight;
    },
    applyOptions(opts) {
      if (opts && typeof opts.autoscaleInfoProvider === 'function') {
        const res = opts.autoscaleInfoProvider(() => ({ priceRange: { minValue: minPrice, maxValue: maxPrice } }));
        if (res?.priceRange) lastPriceRange = res.priceRange;
      }
    }
  };

  return {
    element,
    chart,
    series,
    getRange: () => ({ ...visibleRange }),
    getAutoScale: () => autoScale,
    getLastPriceRange: () => lastPriceRange
  };
}

function flushRafQueue(queue) {
  const pending = queue.splice(0, queue.length);
  for (const fn of pending) fn(performance.now());
}

test('Single-finger touch drag inside plot pans X and Y in desktop policy', () => {
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  const rafQueue = [];
  globalThis.requestAnimationFrame = (fn) => {
    rafQueue.push(fn);
    return rafQueue.length;
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    const mock = createTouchChartMock();
    const ctrl = bindKlineGestures(mock.element, mock.chart, mock.series, {
      inputPolicy: 'desktop'
    });

    const initial = mock.getRange();
    const down = mock.element.dispatch('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 180,
      clientY: 160
    });
    assert.equal(down.defaultPrevented, true);

    mock.element.dispatch('pointermove', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 120,
      clientY: 120
    });
    flushRafQueue(rafQueue);

    const moved = mock.getRange();
    assert.ok(moved.from > initial.from && moved.to > initial.to, 'Dragging left shifts visible candles forward');
    assert.equal(mock.getAutoScale(), false, 'Vertical touch pan switches Y-axis into manual range');

    mock.element.dispatch('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 120,
      clientY: 120
    });
    ctrl.dispose();
  } finally {
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCaf;
  }
});

test('Single-finger touch drag on bottom X time-axis scales horizontal bar span', () => {
  const mock = createTouchChartMock({ width: 390, height: 380, paneWidth: 325, paneHeight: 352 });
  const ctrl = bindKlineGestures(mock.element, mock.chart, mock.series, {
    inputPolicy: 'desktop'
  });

  const initial = mock.getRange();
  const initialSpan = initial.to - initial.from;

  // Touch inside the expanded mobile bottom time-axis hit target (y = 345, close to 352..380)
  mock.element.dispatch('pointerdown', {
    pointerId: 2,
    pointerType: 'touch',
    clientX: 160,
    clientY: 345
  });

  // Drag right -> zoom in horizontally (fewer visible bars)
  mock.element.dispatch('pointermove', {
    pointerId: 2,
    pointerType: 'touch',
    clientX: 250,
    clientY: 345
  });
  const zoomedInSpan = mock.getRange().to - mock.getRange().from;
  assert.ok(zoomedInSpan < initialSpan, `Expected X span (${zoomedInSpan}) < initial (${initialSpan}) when dragging right`);

  // Drag left past start -> zoom out horizontally (more visible bars)
  mock.element.dispatch('pointermove', {
    pointerId: 2,
    pointerType: 'touch',
    clientX: 70,
    clientY: 345
  });
  const zoomedOutSpan = mock.getRange().to - mock.getRange().from;
  assert.ok(zoomedOutSpan > initialSpan, `Expected X span (${zoomedOutSpan}) > initial (${initialSpan}) when dragging left`);

  mock.element.dispatch('pointerup', {
    pointerId: 2,
    pointerType: 'touch',
    clientX: 70,
    clientY: 345
  });
  ctrl.dispose();
});

test('Single-finger touch drag on right Y price-axis scales vertical coordinate range', () => {
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  const rafQueue = [];
  globalThis.requestAnimationFrame = (fn) => {
    rafQueue.push(fn);
    return rafQueue.length;
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    const mock = createTouchChartMock({ width: 390, height: 380, paneWidth: 325, paneHeight: 352 });
    const ctrl = bindKlineGestures(mock.element, mock.chart, mock.series, {
      inputPolicy: 'desktop'
    });

    // Touch on right Y price-axis (x >= 325)
    mock.element.dispatch('pointerdown', {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 350,
      clientY: 160
    });
    mock.element.dispatch('pointermove', {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 350,
      clientY: 80
    });
    flushRafQueue(rafQueue);

    assert.equal(mock.getAutoScale(), false, 'Dragging right Y-axis switches Y-axis out of autoScale');
    const scaledRange = mock.getLastPriceRange();
    assert.ok(scaledRange && scaledRange.maxValue - scaledRange.minValue > 100, 'Dragging UP on Y-axis expands price span');

    mock.element.dispatch('pointerup', {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 350,
      clientY: 80
    });
    ctrl.dispose();
  } finally {
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCaf;
  }
});

test('Two-finger pinch gesture zooms horizontal K-line scale smoothly', () => {
  const mock = createTouchChartMock();
  const ctrl = bindKlineGestures(mock.element, mock.chart, mock.series, {
    inputPolicy: 'desktop'
  });

  const initialSpan = mock.getRange().to - mock.getRange().from;

  mock.element.dispatch('pointerdown', {
    pointerId: 10,
    pointerType: 'touch',
    clientX: 130,
    clientY: 180
  });
  mock.element.dispatch('pointerdown', {
    pointerId: 11,
    pointerType: 'touch',
    clientX: 210,
    clientY: 180
  });

  // Spread fingers apart (distance 80 -> 200) => zoom IN (smaller bar span)
  mock.element.dispatch('pointermove', {
    pointerId: 10,
    pointerType: 'touch',
    clientX: 70,
    clientY: 180
  });
  mock.element.dispatch('pointermove', {
    pointerId: 11,
    pointerType: 'touch',
    clientX: 270,
    clientY: 180
  });
  const spreadSpan = mock.getRange().to - mock.getRange().from;
  assert.ok(spreadSpan < initialSpan, `Spreading fingers zoomed in (${spreadSpan} < ${initialSpan})`);

  // Pinch fingers together (distance 80 -> 30) => zoom OUT (larger bar span)
  mock.element.dispatch('pointermove', {
    pointerId: 10,
    pointerType: 'touch',
    clientX: 155,
    clientY: 180
  });
  mock.element.dispatch('pointermove', {
    pointerId: 11,
    pointerType: 'touch',
    clientX: 185,
    clientY: 180
  });
  const pinchedSpan = mock.getRange().to - mock.getRange().from;
  assert.ok(pinchedSpan > initialSpan, `Pinching fingers zoomed out (${pinchedSpan} > ${initialSpan})`);

  mock.element.dispatch('pointerup', { pointerId: 10, pointerType: 'touch', clientX: 155, clientY: 180 });
  mock.element.dispatch('pointerup', { pointerId: 11, pointerType: 'touch', clientX: 185, clientY: 180 });
  ctrl.dispose();
});
