import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhaleDotCanvasPrimitive } from '../public/composables/whaleMarkerCanvasPrimitive.js';

test('whaleMarkerCanvasPrimitive draws dots in bitmap space in the same canvas pass and respects highlight/dim/clip', () => {
  let coordsX = { 1000: 120.4, 2000: 420.6, 3000: 900 };
  let coordsY = { 150: 85.25, 175: 210.5, 250: -10 };
  let updateCalls = 0;

  const markers = new Map([
    ['0xaaa:LONG', {
      whale: { address: '0xaaa', side: 'LONG', entryPx: 150, posKey: '0xaaa:LONG' },
      time: 1000,
      isLong: true,
      color: '#0ecb81'
    }],
    ['0xbbb:SHORT', {
      whale: { address: '0xbbb', side: 'SHORT', entryPx: 175, posKey: '0xbbb:SHORT' },
      time: 2000,
      isLong: false,
      color: '#f6465d'
    }],
    ['0xccc:LONG', {
      whale: { address: '0xccc', side: 'LONG', entryPx: 250, posKey: '0xccc:LONG' },
      time: 3000,
      isLong: true,
      color: '#0ecb81'
    }]
  ]);

  let isolatedKey = '0xaaa:LONG';
  const primitive = createWhaleDotCanvasPrimitive({
    getMarkers: () => markers,
    getIsolatedKey: () => isolatedKey,
    getActiveKey: () => '0xaaa:LONG',
    radius: 5
  });

  const mockChart = {
    paneSize: () => ({ width: 700, height: 400 }),
    timeScale: () => ({
      timeToCoordinate: (t) => coordsX[t] ?? null
    })
  };
  const mockSeries = {
    priceToCoordinate: (px) => coordsY[px] ?? null
  };

  primitive.attached({
    chart: mockChart,
    series: mockSeries,
    requestUpdate: () => { updateCalls++; }
  });

  const views = primitive.paneViews();
  assert.equal(views.length, 1);
  assert.equal(views[0].zOrder(), 'top');

  const arcs = [];
  const alphas = [];
  const fillStyles = [];
  const target = {
    useBitmapCoordinateSpace(cb) {
      cb({
        context: {
          save() {},
          restore() {},
          beginPath() {},
          arc(x, y, r) { arcs.push({ x, y, r }); },
          fill() {
            alphas.push(this.globalAlpha);
            fillStyles.push(this.fillStyle);
          },
          set globalAlpha(v) { this._alpha = v; },
          get globalAlpha() { return this._alpha ?? 1; },
          fillStyle: ''
        },
        horizontalPixelRatio: 2,
        verticalPixelRatio: 2
      });
    }
  };

  // Dragging moves coordinates synchronously before LightweightCharts invokes updateAllViews + draw
  coordsX[1000] = 188.4;
  coordsY[150] = 112.75;
  primitive.updateAllViews();
  views[0].renderer().draw(target);

  // Dot 3 (x=900, y=-10) is clipped; Dot 2 (dimmed: 2 arcs) + Dot 1 (active: 3 arcs) are drawn without dark outer rim
  assert.equal(arcs.length, 5, 'Draws crisp white ring + core (plus halo for active dot) without outer dark rim');
  assert.equal(fillStyles.includes('rgba(15, 23, 42, 0.72)'), false, 'No dark outer border drawn around whale dots');
  assert.equal(alphas[0], 0.28, 'Non-isolated dot draws dimmed');
  const lastArc = arcs[arcs.length - 1];
  assert.equal(lastArc.x, Math.round(188.4 * 2), 'Active dot X aligns at updated bitmap coordinate');
  assert.equal(lastArc.y, 112.75 * 2, 'Active dot Y tracks exact subpixel bitmap coordinate');

  primitive.requestUpdate();
  assert.equal(updateCalls, 1);

  primitive.detached();
});
