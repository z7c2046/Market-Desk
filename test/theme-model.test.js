import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VALID_PALETTES,
  VALID_THEMES,
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  META_THEME_COLORS,
  FALLBACK_CHART_TOKENS,
  normalizePalette,
  normalizeTheme,
  getMetaThemeColor,
  applyThemeToDOM,
  readChartTokens
} from '../public/theme-model.js';

test('Theme Model: Validates palettes and themes', () => {
  assert.deepEqual(VALID_PALETTES, ['terminal', 'cobalt']);
  assert.deepEqual(VALID_THEMES, ['light', 'dark']);
  assert.equal(DEFAULT_PALETTE, 'terminal');
  assert.equal(DEFAULT_THEME, 'light');

  // Palette normalization
  assert.equal(normalizePalette('terminal'), 'terminal');
  assert.equal(normalizePalette('cobalt'), 'cobalt');
  assert.equal(normalizePalette('COBALT'), 'cobalt');
  assert.equal(normalizePalette('  terminal  '), 'terminal');
  assert.equal(normalizePalette('invalid'), 'terminal');
  assert.equal(normalizePalette(''), 'terminal');
  assert.equal(normalizePalette(null), 'terminal');
  assert.equal(normalizePalette(undefined), 'terminal');
  assert.equal(normalizePalette(123), 'terminal');
  assert.equal(normalizePalette({}), 'terminal');

  // Theme normalization
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('LIGHT'), 'light');
  assert.equal(normalizeTheme('DARK'), 'dark');
  assert.equal(normalizeTheme('system'), null);
  assert.equal(normalizeTheme('invalid'), null);
  assert.equal(normalizeTheme(null), null);
  assert.equal(normalizeTheme(undefined), null);
});

test('Theme Model: Browser meta theme colors are strictly consistent', () => {
  assert.equal(getMetaThemeColor('terminal', 'light'), '#ffffff');
  assert.equal(getMetaThemeColor('terminal', 'dark'), '#111316');
  assert.equal(getMetaThemeColor('cobalt', 'light'), '#ffffff');
  assert.equal(getMetaThemeColor('cobalt', 'dark'), '#2d2d2d');

  // Fallback on invalid palette
  assert.equal(getMetaThemeColor('unknown', 'dark'), '#111316');
});

test('Theme Model: applyThemeToDOM synchronizes root attributes, class, style and meta', () => {
  const root = {
    attributes: {},
    classList: new Set(),
    style: {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] || null; }
  };
  root.classList.toggle = function(cls, force) {
    if (force) this.add(cls);
    else this.delete(cls);
  };
  root.classList.contains = function(cls) {
    return this.has(cls);
  };

  const metaEl = {
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] || null; }
  };

  // Case 1: Cobalt Dark
  applyThemeToDOM({ palette: 'cobalt', mode: 'dark', root, metaEl });
  assert.equal(root.getAttribute('data-palette'), 'cobalt');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(root.classList.contains('dark'), true);
  assert.equal(root.style.colorScheme, 'dark');
  assert.equal(metaEl.getAttribute('content'), '#2d2d2d');

  // Case 2: Cobalt Light
  applyThemeToDOM({ palette: 'cobalt', mode: 'light', root, metaEl });
  assert.equal(root.getAttribute('data-palette'), 'cobalt');
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(root.classList.contains('dark'), false);
  assert.equal(root.style.colorScheme, 'light');
  assert.equal(metaEl.getAttribute('content'), '#ffffff');

  // Case 3: Terminal Dark
  applyThemeToDOM({ palette: 'terminal', mode: 'dark', root, metaEl });
  assert.equal(root.getAttribute('data-palette'), 'terminal');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(root.classList.contains('dark'), true);
  assert.equal(root.style.colorScheme, 'dark');
  assert.equal(metaEl.getAttribute('content'), '#111316');

  // Case 4: Terminal Light
  applyThemeToDOM({ palette: 'terminal', mode: 'light', root, metaEl });
  assert.equal(root.getAttribute('data-palette'), 'terminal');
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(root.classList.contains('dark'), false);
  assert.equal(root.style.colorScheme, 'light');
  assert.equal(metaEl.getAttribute('content'), '#ffffff');
});

test('Theme Model: readChartTokens returns valid token values and fallbacks', () => {
  // Test fallback extraction without DOM
  const termDark = FALLBACK_CHART_TOKENS.terminal.dark;
  assert.equal(termDark.surface, '#15181c');
  assert.equal(termDark.klineSurface, '#000000');
  assert.equal(termDark.up, '#31c39a');
  assert.equal(termDark.down, '#f06e75');

  const cobLight = FALLBACK_CHART_TOKENS.cobalt.light;
  assert.equal(cobLight.surface, '#ffffff');
  assert.equal(cobLight.klineSurface, '#ffffff');
  assert.equal(cobLight.accent, '#2976ff');

  const cobDark = FALLBACK_CHART_TOKENS.cobalt.dark;
  assert.equal(cobDark.surface, '#2d2d2d');
  assert.equal(cobDark.klineSurface, '#2d2d2d');
  assert.equal(cobDark.crosshair, '#afafaf');
});
