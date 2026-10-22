/**
 * Pivot Point Detection & Pairing
 * Strictly implements left 3 / right 2 window, right-side confirmation at p+2,
 * and nearest predecessor pairing within 5 to 60 bars.
 */

export function findPivots(bars, options = {}) {
  const left = options.leftBars ?? 3;
  const right = options.rightBars ?? 2;
  const highs = [];
  const lows = [];

  if (!Array.isArray(bars) || bars.length < left + right + 1) {
    return { highs, lows, all: [] };
  }

  for (let p = left; p < bars.length - right; p += 1) {
    const bar = bars[p];
    const h = Number(bar?.high);
    const l = Number(bar?.low);
    if (!Number.isFinite(h) || !Number.isFinite(l)) continue;

    // Check strict high: H(p) > all high in [p - left .. p - 1] and [p + 1 .. p + right]
    let isHigh = true;
    for (let k = p - left; k <= p + right; k += 1) {
      if (k === p) continue;
      const otherH = Number(bars[k]?.high);
      if (!Number.isFinite(otherH) || h <= otherH) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      highs.push({
        type: "high",
        pivotIndex: p,
        pivotTime: Number(bar.time),
        price: h,
        confirmedIndex: p + right,
        confirmedTime: Number(bars[p + right].time)
      });
    }

    // Check strict low: L(p) < all low in [p - left .. p - 1] and [p + 1 .. p + right]
    let isLow = true;
    for (let k = p - left; k <= p + right; k += 1) {
      if (k === p) continue;
      const otherL = Number(bars[k]?.low);
      if (!Number.isFinite(otherL) || l >= otherL) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      lows.push({
        type: "low",
        pivotIndex: p,
        pivotTime: Number(bar.time),
        price: l,
        confirmedIndex: p + right,
        confirmedTime: Number(bars[p + right].time)
      });
    }
  }

  const all = [...highs, ...lows].sort((a, b) => {
    if (a.confirmedIndex !== b.confirmedIndex) return a.confirmedIndex - b.confirmedIndex;
    return a.pivotIndex - b.pivotIndex;
  });

  return { highs, lows, all };
}

/**
 * Finds the nearest previous confirmed pivot of the same type within [minDistance, maxDistance]
 * for a pivot p2 confirmed on bar d.
 */
export function pairPivot(p2, pivotList, minDistance = 5, maxDistance = 60) {
  if (!p2 || !Array.isArray(pivotList)) return null;

  let nearest = null;
  for (const p1 of pivotList) {
    if (p1.type !== p2.type) continue;
    if (p1.confirmedIndex >= p2.confirmedIndex) continue; // Must be already confirmed
    const dist = p2.pivotIndex - p1.pivotIndex;
    if (dist >= minDistance && dist <= maxDistance) {
      if (!nearest || p1.pivotIndex > nearest.pivotIndex) {
        nearest = p1; // Closest preceding pivot
      }
    }
  }

  return nearest ? { p1: nearest, p2 } : null;
}
