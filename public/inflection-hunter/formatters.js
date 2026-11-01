/**
 * Inflection Hunter R1: Chart Visual Marker Formatter
 * Formats signals for Lightweight Charts & ECharts visual overlay
 */

/**
 * Maps raw inflection signals into visual markers for TradingView Lightweight Charts
 * @param {Array<import('./types.d.ts').InflectionSignal>} signals
 * @returns {Array<import('./types.d.ts').ChartMarker>}
 */
export function formatSignalMarkers(signals) {
  if (!Array.isArray(signals)) return [];

  const markers = [];
  for (const s of signals) {
    const isBuy = s.side.includes('B');
    const isEarly = s.side.startsWith('e') || s.side.startsWith('E');

    // Color Palette:
    // EB: Sky Blue (#38bdf8), B: Emerald Green (#10b981)
    // ES: Amber (#f59e0b), S: Crimson Red (#ef4444)
    const color = isBuy
      ? (isEarly ? '#38bdf8' : '#10b981')
      : (isEarly ? '#f59e0b' : '#ef4444');

    const shape = isBuy ? 'arrowUp' : 'arrowDown';
    const position = isBuy ? 'belowBar' : 'aboveBar';

    markers.push({
      time: s.time,
      position,
      color,
      shape,
      text: s.side,
      size: isEarly ? 1 : 2
    });
  }

  // Ensure strict chronological ordering
  markers.sort((a, b) => a.time - b.time);
  return markers;
}

