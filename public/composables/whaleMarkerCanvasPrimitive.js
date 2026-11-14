/**
 * Native LightweightCharts Series Primitive for rendering whale entry dots
 * inside the exact same canvas paint pass as candlesticks (0-frame drag lag).
 */

export function createWhaleDotCanvasPrimitive({
  getMarkers,
  getHighlightedKey = () => '',
  getActiveKey = () => '',
  getIsolatedKey = () => '',
  getSchemeColors = () => ({ up: '#0ecb81', down: '#f6465d' }),
  radius = 5
} = {}) {
  let _chart = null;
  let _series = null;
  let _requestUpdate = null;
  let _dots = [];

  function computeDots() {
    if (!_chart || !_series || typeof getMarkers !== 'function') {
      _dots = [];
      return;
    }
    const markers = getMarkers();
    if (!markers || typeof markers.values !== 'function') {
      _dots = [];
      return;
    }

    const timeScale = typeof _chart.timeScale === 'function' ? _chart.timeScale() : null;
    if (!timeScale || typeof timeScale.timeToCoordinate !== 'function' || typeof _series.priceToCoordinate !== 'function') {
      _dots = [];
      return;
    }

    let paneW = 0;
    let paneH = 0;
    if (typeof _chart.paneSize === 'function') {
      try {
        const ps = _chart.paneSize(0);
        paneW = Number(ps?.width) || 0;
        paneH = Number(ps?.height) || 0;
      } catch (_) {}
    }
    if (!paneW && typeof timeScale.width === 'function') {
      paneW = Number(timeScale.width()) || 0;
    }

    const highlightedKey = String(getHighlightedKey?.() || '').toLowerCase();
    const activeKey = String(getActiveKey?.() || '').toLowerCase();
    const isolatedKey = String(getIsolatedKey?.() || '').toLowerCase();
    const scheme = getSchemeColors?.() || { up: '#0ecb81', down: '#f6465d' };

    const nextDots = [];
    for (const entry of markers.values()) {
      const whale = entry?.whale;
      const time = entry?.time;
      if (!whale || !time) continue;

      const cx = timeScale.timeToCoordinate(time);
      if (typeof cx !== 'number' || !Number.isFinite(cx)) continue;
      if (cx < 4 || (paneW > 0 && cx > paneW - 4)) continue;

      let cy = null;
      const entryPx = Number(whale.entryPx);
      if (Number.isFinite(entryPx) && entryPx > 0) {
        cy = _series.priceToCoordinate(entryPx);
      }
      if ((typeof cy !== 'number' || !Number.isFinite(cy)) && entry.bar) {
        const fallbackPx = entry.isLong ? entry.bar.low : entry.bar.high;
        if (Number.isFinite(fallbackPx)) {
          cy = _series.priceToCoordinate(fallbackPx);
        }
      }
      if (typeof cy !== 'number' || !Number.isFinite(cy)) continue;
      if (cy < 4 || (paneH > 0 && cy > paneH - 4)) continue;

      const addr = String(whale.address || '').toLowerCase();
      const posKey = String(whale.posKey || `${addr}:${whale.side || ''}`).toLowerCase();
      const isActive = Boolean(activeKey && (activeKey === posKey || activeKey === addr));
      const isHighlighted = Boolean(highlightedKey && (highlightedKey === posKey || highlightedKey === addr));
      const isDimmed = Boolean(isolatedKey && posKey !== isolatedKey);
      const color = entry.color || (entry.isLong ? (scheme.up || '#0ecb81') : (scheme.down || '#f6465d'));

      nextDots.push({
        x: cx,
        y: cy,
        color,
        isActive,
        isHighlighted,
        isDimmed
      });
    }

    // Draw dimmed dots first, normal dots next, highlighted/active dots last on top
    nextDots.sort((a, b) => {
      const rank = d => ((d.isActive || d.isHighlighted) ? 2 : (d.isDimmed ? 0 : 1));
      return rank(a) - rank(b);
    });
    _dots = nextDots;
  }

  const paneView = {
    zOrder() {
      return 'top';
    },
    renderer() {
      return {
        draw(target) {
          if (!_dots.length || !target || typeof target.useBitmapCoordinateSpace !== 'function') return;
          target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
            const hpr = Number(horizontalPixelRatio) || 1;
            const vpr = Number(verticalPixelRatio) || 1;
            const xAlign = (Math.max(1, Math.floor(hpr)) % 2) / 2;
            const avgRatio = (hpr + vpr) / 2;

            context.save();
            for (const dot of _dots) {
              const bx = Math.round(dot.x * hpr) + xAlign;
              const by = dot.y * vpr;
              const emphasized = dot.isActive || dot.isHighlighted;
              const r = radius * (emphasized ? 1.38 : 1) * avgRatio;

              context.globalAlpha = dot.isDimmed && !emphasized ? 0.28 : 1;

              if (emphasized) {
                context.beginPath();
                context.arc(bx, by, r + 4.5 * avgRatio, 0, Math.PI * 2);
                context.fillStyle = dot.color;
                context.globalAlpha = 0.24;
                context.fill();
                context.globalAlpha = 1;
              }

              // White ring
              context.beginPath();
              context.arc(bx, by, r + 1.25 * avgRatio, 0, Math.PI * 2);
              context.fillStyle = '#ffffff';
              context.fill();

              // Colored dot core
              context.beginPath();
              context.arc(bx, by, r * 0.78, 0, Math.PI * 2);
              context.fillStyle = dot.color;
              context.fill();
            }
            context.restore();
          });
        }
      };
    }
  };

  return {
    attached({ chart, series, requestUpdate }) {
      _chart = chart || null;
      _series = series || null;
      _requestUpdate = typeof requestUpdate === 'function' ? requestUpdate : null;
      computeDots();
    },
    detached() {
      _chart = null;
      _series = null;
      _requestUpdate = null;
      _dots = [];
    },
    updateAllViews() {
      computeDots();
    },
    paneViews() {
      return [paneView];
    },
    requestUpdate() {
      computeDots();
      _requestUpdate?.();
    }
  };
}
