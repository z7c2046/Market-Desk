// Read-only source analysis. This is NOT a browser trace or a visual test.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../../', import.meta.url);
const paths = ['public/app.js', 'public/index.html', 'public/styles.css', 'src/server.js', 'test/workspace-ui.test.js'];
const sources = Object.fromEntries(paths.map(path => [path, fs.readFileSync(new URL(path, root), 'utf8')]));
const css = sources['public/styles.css'];
const keyframes = css.match(/@keyframes heroCard3dExpand\s*\{([\s\S]*?)\n\}/)?.[1];
const declaration = css.match(/animation:\s*heroCard3dExpand\s+([\d.]+)s\s+cubic-bezier\(([^)]+)\)\s+forwards/);
if (!keyframes || !declaration) throw new Error('Current animation changed; inspect source before reusing this calculation.');
const keys = [...keyframes.matchAll(/(\d+)%\s*\{([^}]+)\}/g)].map(([, pct, body]) => ({
  offset: Number(pct) / 100,
  angle: Number(body.match(/rotateY\(([-\d.]+)deg\)/)?.[1]),
  scale: Number(body.match(/scale\(([-\d.]+)\)/)?.[1]),
  opacity: body.match(/opacity:\s*([\d.]+)/) ? Number(body.match(/opacity:\s*([\d.]+)/)[1]) : null
}));
if (keys.length !== 3 || keys[0].offset !== 0 || keys[2].offset !== 1 || keys[1].opacity !== null) {
  throw new Error('Keyframe structure changed; update the model.');
}
const durationMs = Number(declaration[1]) * 1000;
const [x1, y1, x2, y2] = declaration[2].split(',').map(Number);
const bezier = (t, p1, p2) => 3 * (1-t)**2 * t * p1 + 3 * (1-t) * t*t * p2 + t**3;
function ease(x) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const t = (lo + hi) / 2;
    if (bezier(t, x1, x2) < x) lo = t; else hi = t;
  }
  return bezier((lo + hi) / 2, y1, y2);
}
const rounded = x => Number(x.toFixed(4));
const samples = [0, .1, .2, .3, .4, .5, .6, .75, 1].map(fraction => {
  const [a, b] = fraction <= keys[1].offset ? keys.slice(0, 2) : keys.slice(1, 3);
  const p = ease((fraction-a.offset)/(b.offset-a.offset));
  return {
    timeMs: rounded(fraction * durationMs),
    rotateYDegrees: rounded(a.angle + (b.angle-a.angle)*p),
    scale: rounded(a.scale + (b.scale-a.scale)*p),
    opacity: rounded(keys[0].opacity + (keys[2].opacity-keys[0].opacity)*ease(fraction))
  };
});
const hash = path => createHash('sha256').update(fs.readFileSync(new URL(path, root))).digest('hex');
console.log(JSON.stringify({
  kind: 'static-css-interpolation-analysis',
  documentDate: '2026-11-04 Asia/Shanghai',
  browserVerified: false,
  assumptions: [
    'The declared animation runs normally, without reduced-motion or other overriding styles.',
    'Transform easing applies independently across each adjacent transform keyframe interval.',
    'Opacity has only 0% and 100% keyframes, so it uses the entire duration.',
    'These are transform parameters, not projected pixel bounds, rendered frames, or measured FPS.'
  ],
  sourceHashes: Object.fromEntries(paths.map(path => [path, hash(path)])),
  durationMs,
  cubicBezier: [x1, y1, x2, y2],
  keyframes: keys,
  samples
}, null, 2));
