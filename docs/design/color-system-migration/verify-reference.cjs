/* Read-only verification of the handoff reference, NOT browser validation. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = __dirname;
const css = fs.readFileSync(path.join(base, 'cobalt.tokens.reference.css'), 'utf8');
const blocks = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({
    selector: selector.trim(),
    tokens: Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
      .map(([, name, value]) => [name, value.trim()]))
  }));
function tokensFor(palette, mode) {
  const tokens = {};
  for (const block of blocks) {
    const cobalt = block.selector.includes('data-palette="cobalt"');
    if (cobalt && palette !== 'cobalt') continue;
    if (block.selector.includes('data-theme="dark"') && mode !== 'dark') continue;
    if (block.selector.includes('data-theme="light"') && mode !== 'light') continue;
    Object.assign(tokens, block.tokens);
  }
  const resolve = (key, seen = []) => {
    if (!tokens[key]) throw Error(`Undefined token ${key}`);
    if (seen.includes(key)) throw Error(`Circular token ${key}`);
    return tokens[key].replace(/var\((--[\w-]+)\)/g, (_, name) => resolve(name, [...seen, key]));
  };
  return Object.fromEntries(Object.keys(tokens).map(key => [key, resolve(key)]));
}
function rgba(value) {
  if (/^#[\da-f]{6}$/i.test(value)) return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)).concat(1);
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) throw Error(`Unsupported color: ${value}`);
  const parts = match[1].split(',').map(Number);
  if (parts.length === 3) parts.push(1);
  return parts;
}
function composite(fg, bg) {
  const a = rgba(fg), b = rgba(bg);
  if (b[3] !== 1) throw Error('Background must be opaque');
  return `rgb(${a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3])).join(',')})`;
}
function luminance(value) {
  const c = rgba(value);
  if (c[3] !== 1) throw Error('Composite transparency before measuring');
  return c.slice(0, 3).reduce((sum, raw, i) => {
    const v = raw / 255;
    return sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
  }, 0);
}
function contrast(a, b) {
  const l = [luminance(a), luminance(b)].sort((a, b) => a - b);
  return (l[1] + .05) / (l[0] + .05);
}
const results = [];
function record(mode, role, fg, bg, threshold) {
  const ratio = contrast(fg, bg);
  results.push({ mode, role, fg, bg, ratio: Number(ratio.toFixed(6)), threshold, pass: ratio >= threshold });
}
const resolved = {};
for (const mode of ['light', 'dark']) {
  const t = tokensFor('cobalt', mode);
  resolved[mode] = t;
  for (const bg of ['--surface-canvas', '--surface-card', '--surface-raised', '--surface-hover', '--surface-sunken']) {
    for (const fg of ['--text-main', '--text-secondary', '--accent-text', '--semantic-up', '--semantic-down', '--semantic-warning']) {
      record(mode, `${fg} on ${bg}`, t[fg], t[bg], 4.5);
    }
  }
  for (const bg of ['--surface-card', '--surface-hover']) {
    for (const [ink, soft] of [['--accent-text', '--accent-soft'], ['--semantic-up', '--semantic-up-soft'], ['--semantic-down', '--semantic-down-soft'], ['--semantic-warning', '--semantic-warning-soft']]) {
      record(mode, `${ink} on ${soft} over ${bg}`, t[ink], composite(t[soft], t[bg]), 4.5);
    }
  }
  record(mode, 'button text', t['--accent-ink'], t['--accent-fill'], 4.5);
  record(mode, 'button hover text', t['--accent-ink'], t['--action-hover-bg'], 4.5);
  record(mode, 'selection text', t['--selection-text'], t['--selection-bg'], 4.5);
  for (const token of ['--chart-up', '--chart-down', '--chart-accent', '--chart-call', '--chart-put']) {
    record(mode, `${token} on chart surface`, t[token], t['--chart-surface'], 3);
  }
  for (const bg of ['--surface-card', '--surface-canvas', '--surface-hover']) {
    record(mode, `focus on ${bg}`, t['--focus-ring'], t[bg], 3);
  }
  record(mode, 'control boundary inside', t['--control-border'], t['--surface-sunken'], 3);
  record(mode, 'control boundary outside', t['--control-border'], t['--surface-card'], 3);
}
const sourcePairs = [
  ['#787878', '#ffffff'], ['#787878', '#e3e3e3'], ['#2976ff', '#ffffff'],
  ['#2976ff', '#2d2d2d'], ['#38ab70', '#ffffff'], ['#df4f46', '#ffffff'],
  ['#95b6f9', '#3f67bf'], ['#a8cef5', '#3f67bf']
].map(([fg, bg]) => ({ fg, bg, ratio: Number(contrast(fg, bg).toFixed(6)) }));
const failures = results.filter(row => !row.pass);
const output = {
  scope: 'Reference tokens only. No CSS cascade, screenshots, browser, Canvas, or application behavior validation.',
  referenceSha256: crypto.createHash('sha256').update(css).digest('hex'),
  testCount: results.length,
  failedCount: failures.length,
  sourcePairs,
  failures,
  results,
  resolvedCobaltTokens: resolved,
  terminalChartTokens: { light: tokensFor('terminal', 'light'), dark: tokensFor('terminal', 'dark') }
};
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
process.exitCode = failures.length ? 1 : 0;
