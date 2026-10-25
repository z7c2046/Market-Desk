import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anchorZoom,
  latestAnchoredRange,
  latestBarFraction,
  latestZoom,
  logZoom,
  pricePan,
  priceZoomAtY,
  spanOf,
  timePan,
  wheelPixelDelta
} from '../public/composables/klineGeometry.js';

const near = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const last = 1199;
const loc = (r) => (last - r.from) / spanOf(r);

test('Kline Geometry: 近景最后一根 K 线居中 x=50%', () => {
  near(loc(latestAnchoredRange(last, 24)), 0.5);
  near(loc(latestAnchoredRange(last, 30)), 0.5);
});

test('Kline Geometry: 远景最后一根 K 线靠右 x=94%', () => {
  near(loc(latestAnchoredRange(last, 300)), 0.94);
  near(loc(latestAnchoredRange(last, 400)), 0.94);
});

test('Kline Geometry: 最新K线锚点随跨度单调平滑移动', () => {
  let prev = 0;
  for (const s of [8, 16, 30, 40, 80, 110, 150, 220, 300, 900]) {
    const f = latestBarFraction(s);
    assert.ok(f >= prev && f >= 0.5 && f <= 0.94 + 1e-10);
    prev = f;
  }
});

test('Kline Geometry: 正反方向滚轮的逻辑可逆性', () => {
  const old = latestAnchoredRange(last, 90);
  const mid = latestZoom(old, last, 2, 8, 50000);
  const next = latestZoom(mid, last, 0.5, 8, 50000);
  near(next.from, old.from);
  near(next.to, old.to);
});

test('Kline Geometry: 向上放大(factor<1), 向下缩小(factor>1)', () => {
  assert.ok(logZoom(-100, 0.0017) < 1 && logZoom(100, 0.0017) > 1);
});

test('Kline Geometry: 横向平移不修改跨度', () => {
  assert.deepEqual(timePan({ from: 20, to: 120 }, 100, 1000), { from: 10, to: 110 });
});

test('Kline Geometry: 纵向平移不修改跨度', () => {
  assert.deepEqual(pricePan({ from: 100, to: 200 }, 100, 500), { from: 120, to: 220 });
});

test('Kline Geometry: 历史探索围绕当前鼠标锚点', () => {
  const old = { from: 20, to: 120 };
  const next = anchorZoom(old, 0.25, 0.5, 8, 50000);
  near(next.from + spanOf(next) * 0.25, 45);
});

test('Kline Geometry: 右侧价格轴滚轮只改变 Y 范围且锚定指针价格', () => {
  const old = { from: 400, to: 600 };
  const next = priceZoomAtY(old, 0.25, 0.5, 0.001, 10000);
  near(next.to - spanOf(next) * 0.25, 550);
  near(spanOf(next), 100);
});

test('Kline Geometry: 滚轮 deltaMode 归一化', () => {
  assert.equal(wheelPixelDelta({ deltaY: 3, deltaMode: 1 }, 700), 48);
  assert.equal(wheelPixelDelta({ deltaY: 1, deltaMode: 2 }, 700), 300);
});
