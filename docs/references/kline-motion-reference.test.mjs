import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  cameraFromRange, rangeFromCamera, pixelFraction, logicalAtPixel,
  pixelAtLogical, anchorCamera, makeZoomState, queueZoom, stepZoom,
  zoomPriceAbout, safeAutoPriceStep, stepFling,
} from './kline-motion-reference.mjs';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
// Compare the geometry to the installed library's real mapping code, not another
// copy of the proposed formula. No browser is launched; no pixels are rendered.
const lwSource = fs.readFileSync(new URL('../../node_modules/lightweight-charts/dist/lightweight-charts.development.mjs', import.meta.url), 'utf8');
const body = lwSource.match(/_internal_indexToCoordinate\(index\) \{([\s\S]*?)\n    \}/)?.[1];
assert.ok(body, 'Re-audit geometry if the installed library changes');
const installedIndexToX = new Function('isInteger', 'index', body);
function libraryX(range, index, width) {
  return installedIndexToX.call({
    _internal_isEmpty: () => false,
    _internal_baseIndex: () => 0,
    _private__rightOffset: range.to,
    _private__width: width,
    _private__barSpacing: width / (range.to - range.from + 1),
  }, Number.isInteger, index);
}

test('range round trip includes one bar and both half-bar boundaries', () => {
  for (const range of [{from:0,to:0},{from:-10.25,to:120.75},{from:50,to:57}]) {
    assert.deepEqual(rangeFromCamera(cameraFromRange(range)), range);
  }
});
test('adapter projects candles exactly like installed Lightweight Charts', () => {
  for (const width of [375,1000,1600]) for (const range of [{from:-.25,to:149.75},{from:50,to:57}]) {
    const camera = cameraFromRange(range);
    for (const index of [0,30,55,100]) near(pixelAtLogical(camera,index,width),libraryX(range,index,width));
  }
});
test('pointer anchor survives zoom according to installed library mapping', () => {
  const range = {from:0,to:119};
  for (const index of [1,30,60,110]) for (const factor of [.2,.94,1.06,3]) {
    const camera = cameraFromRange(range), width=1000;
    const px = libraryX(range,index,width);
    const next = anchorCamera(camera,camera.count*factor,pixelFraction(px,width));
    near(libraryX(rangeFromCamera(next),index,width),px);
  }
});
test('fractional cursor position is continuous between candle centers', () => {
  const camera = cameraFromRange({from:0,to:119});
  const a = logicalAtPixel(camera,500,1000), b = logicalAtPixel(camera,500.25,1000);
  near(b-a,.03);
});
test('right-edge zoom retains the same logical right boundary', () => {
  const state=makeZoomState({from:0,to:119}), boundary=state.display.left+state.display.count;
  queueZoom(state,-100,1); stepZoom(state,1/60);
  near(state.display.left+state.display.count,boundary);
});
test('60 Hz and 120 Hz reach the same range after 200 ms for fixed target', () => {
  const run = hz => {
    const s=makeZoomState({from:0,to:119}); queueZoom(s,-100,.7);
    for(let i=0;i<hz/5;i++) stepZoom(s,1/hz,{settlePx:0});
    return s.display;
  };
  const a=run(60),b=run(120); near(a.count,b.count);near(a.left,b.left);
});
test('wheel events accumulate multiplicatively before a frame', () => {
  const s=makeZoomState({from:0,to:119});
  queueZoom(s,-100,.8);queueZoom(s,-100,.8);
  near(s.targetCount,120*.94*.94); near(s.display.count,120);
});
test('reversal responds on next step instead of paying old zoom debt', () => {
  const s=makeZoomState({from:0,to:119});
  queueZoom(s,-100,.8);stepZoom(s,1/60);
  const before=s.display.count;queueZoom(s,20,.8);stepZoom(s,1/60);
  assert.ok(s.display.count>before);
});
test('new anchor keeps current image in place at input time', () => {
  const s=makeZoomState({from:0,to:119});queueZoom(s,-100,.8);stepZoom(s,1/60);
  const before={...s.display};queueZoom(s,-10,.2);assert.deepEqual(s.display,before);
});
test('clamped zoom target contains no hidden overshoot debt', () => {
  const s=makeZoomState({from:0,to:9});
  for(let i=0;i<30;i++) queueZoom(s,-100,1);
  near(s.targetCount,8);stepZoom(s,1);
  queueZoom(s,100,1);assert.ok(s.targetCount>8);
});
test('price anchor uses its actual value even when it is inside a margin', () => {
  const range={from:100,to:200},anchor=220;
  const before=(anchor-range.from)/(range.to-range.from);
  const next=zoomPriceAbout(range,anchor,.9);
  near((anchor-next.from)/(next.to-next.from),before);
});
test('auto range never excludes a newly visible extreme and contracts gradually', () => {
  const next=safeAutoPriceStep({from:100,to:200},{from:80,to:180},1/60);
  near(next.from,80);assert.ok(next.to>180 && next.to<200);
});
test('fling distance is independent of 60 Hz versus 120 Hz integration', () => {
  const run=hz=>{let v=1000,x=0;for(let i=0;i<hz;i++){const r=stepFling(v,1/hz);v=r.velocity;x+=r.deltaPx;}return{x,v};};
  const a=run(60),b=run(120);near(a.x,b.x);near(a.v,b.v);near(a.x,1000/12*(1-Math.exp(-12)));
});
