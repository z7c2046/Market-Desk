/**
 * Market Desk Theme Model
 * Pure logic and contracts for UI Palettes ('terminal' | 'cobalt') and Themes ('light' | 'dark').
 */

export const VALID_PALETTES = Object.freeze(['terminal', 'cobalt']);
export const VALID_THEMES = Object.freeze(['light', 'dark']);
export const DEFAULT_PALETTE = 'terminal';
export const DEFAULT_THEME = 'light';

export const META_THEME_COLORS = Object.freeze({
  terminal: {
    light: '#ffffff',
    dark: '#111316'
  },
  cobalt: {
    light: '#ffffff',
    dark: '#2d2d2d'
  }
});

export const FALLBACK_CHART_TOKENS = Object.freeze({
  terminal: {
    light: {
      surface: '#FFFFFF',
      text: '#111111',
      muted: '#626477',
      grid: '#f0f0f3',
      up: '#10b981',
      down: '#ef4444',
      accent: '#2563eb',
      tooltipBg: '#ffffff',
      tooltipBorder: '#eeeeee',
      klineSurface: '#FFFFFF',
      klineGrid: 'rgba(0, 0, 0, 0.07)',
      crosshair: '#eeeeee',
      call: '#2563eb',
      put: '#7c3aed'
    },
    dark: {
      surface: '#15181c',
      text: '#eef1f4',
      muted: '#8b949f',
      grid: '#20252b',
      up: '#31c39a',
      down: '#f06e75',
      accent: '#548afa',
      tooltipBg: '#15181c',
      tooltipBorder: '#262b31',
      klineSurface: '#000000',
      klineGrid: 'rgba(255, 255, 255, 0.09)',
      crosshair: '#262b31',
      call: '#60a3fb',
      put: '#996ee2'
    }
  },
  cobalt: {
    light: {
      surface: '#ffffff',
      text: '#101010',
      muted: '#626262',
      grid: '#cfcfcf',
      up: '#38ab70',
      down: '#df4f46',
      accent: '#2976ff',
      tooltipBg: '#ffffff',
      tooltipBorder: '#cfcfcf',
      klineSurface: '#ffffff',
      klineGrid: '#cfcfcf',
      crosshair: '#787878',
      call: '#2976ff',
      put: '#9846ec'
    },
    dark: {
      surface: '#2d2d2d',
      text: '#ffffff',
      muted: '#afafaf',
      grid: 'rgba(108, 108, 108, 0.45)',
      up: '#38ab70',
      down: '#df4f46',
      accent: '#2976ff',
      tooltipBg: '#2d2d2d',
      tooltipBorder: '#6c6c6c',
      klineSurface: '#2d2d2d',
      klineGrid: 'rgba(108, 108, 108, 0.45)',
      crosshair: '#afafaf',
      call: '#2976ff',
      put: '#b88af4'
    }
  }
});

/**
 * Normalizes palette ID; invalid values fall back to 'terminal'.
 */
export function normalizePalette(raw) {
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toLowerCase();
    if (VALID_PALETTES.includes(trimmed)) return trimmed;
  }
  return DEFAULT_PALETTE;
}

/**
 * Normalizes theme mode; invalid values fall back to null (indicating follow system).
 */
export function normalizeTheme(raw) {
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toLowerCase();
    if (VALID_THEMES.includes(trimmed)) return trimmed;
  }
  return null;
}

/**
 * Get topbar meta theme-color for palette and mode.
 */
export function getMetaThemeColor(palette, mode) {
  const p = normalizePalette(palette);
  const m = mode === 'dark' ? 'dark' : 'light';
  return META_THEME_COLORS[p]?.[m] || META_THEME_COLORS.terminal[m];
}

/**
 * Safely applies theme & palette attributes to root element and syncs browser meta.
 */
export function applyThemeToDOM({ palette, mode, root = document?.documentElement, metaEl = document?.getElementById('theme-color') }) {
  if (!root) return;
  const p = normalizePalette(palette);
  const isDark = mode === 'dark';
  const m = isDark ? 'dark' : 'light';

  root.setAttribute('data-palette', p);
  root.setAttribute('data-theme', m);
  root.classList.toggle('dark', isDark);
  if (root.style) {
    root.style.colorScheme = m;
  }

  const metaColor = getMetaThemeColor(p, m);
  if (metaEl) {
    metaEl.setAttribute('content', metaColor);
  }
  return { palette: p, mode: m, metaColor };
}

/**
 * Reads computed CSS chart tokens, falling back to guaranteed values for the current palette & mode.
 */
export function readChartTokens(root = document?.documentElement, fallbackTokens = null) {
  const palette = normalizePalette(root?.getAttribute?.('data-palette'));
  const isDark = root?.classList?.contains('dark') || root?.getAttribute?.('data-theme') === 'dark';
  const mode = isDark ? 'dark' : 'light';
  const fallback = fallbackTokens || FALLBACK_CHART_TOKENS[palette]?.[mode] || FALLBACK_CHART_TOKENS.terminal[mode];

  if (!root || typeof getComputedStyle !== 'function') {
    return { ...fallback };
  }

  const style = getComputedStyle(root);
  const getProp = (propName, fallbackVal) => {
    const val = style.getPropertyValue(propName)?.trim();
    if (!val || val.includes('var(')) return fallbackVal;
    return val;
  };

  return {
    surface: getProp('--chart-surface', fallback.surface),
    text: getProp('--chart-text', fallback.text),
    muted: getProp('--chart-muted', fallback.muted),
    grid: getProp('--chart-grid', fallback.grid),
    up: getProp('--chart-up', fallback.up),
    down: getProp('--chart-down', fallback.down),
    accent: getProp('--chart-accent', fallback.accent),
    tooltipBg: getProp('--chart-tooltip-bg', fallback.tooltipBg),
    tooltipBorder: getProp('--chart-tooltip-border', fallback.tooltipBorder),
    klineSurface: getProp('--chart-kline-surface', fallback.klineSurface),
    klineGrid: getProp('--chart-kline-grid', fallback.klineGrid),
    crosshair: getProp('--chart-kline-crosshair', fallback.crosshair),
    call: getProp('--chart-call', fallback.call),
    put: getProp('--chart-put', fallback.put)
  };
}
