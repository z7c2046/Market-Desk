/**
 * Market Desk Mobile Quote View Projection
 * Ensures session-consistent quotes without mismatched price and change values.
 */

/**
 * Format session key to human-readable label
 */
export function formatSessionLabel(sessionKey) {
  switch (sessionKey) {
    case 'pre':
      return '盘前';
    case 'regular':
      return '常规';
    case 'post':
      return '盘后';
    case 'overnight':
      return '隔夜';
    default:
      return sessionKey || null;
  }
}

/**
 * Projects a raw watchlist row & quote dictionary into a session-consistent mobile view model.
 *
 * @param {object} row - Row from WatchlistManager / sorted list
 * @param {object} options
 * @param {object} [options.quotes] - Quote store dictionary keyed by symbol
 * @param {string} [options.session] - Requested session: 'auto' | 'regular' | 'pre' | 'post' | 'overnight'
 * @param {string} [options.currentMarketSession] - Current detected market session: 'pre' | 'regular' | 'post' | 'closed'
 * @returns {object} MobileQuoteView
 */
export function toMobileQuoteView(row, options = {}) {
  const symbol = row?.symbol || '';
  const name = row?.name || row?.companyName || '';
  const quotes = options.quotes || {};
  const quoteData = quotes[symbol] || row?.quote || null;

  const requestedSession = options.session || 'auto';
  const marketSession = options.currentMarketSession || 'regular';

  // Extract reference regular values
  const regularPrice = (quoteData && typeof quoteData.regularPrice === 'number' && Number.isFinite(quoteData.regularPrice))
    ? quoteData.regularPrice
    : (typeof row?.regularPrice === 'number' && Number.isFinite(row.regularPrice))
      ? row.regularPrice
      : (typeof row?.price === 'number' && Number.isFinite(row.price))
        ? row.price
        : null;

  const regularChange = (quoteData && typeof quoteData.regularChangePercent === 'number' && Number.isFinite(quoteData.regularChangePercent))
    ? quoteData.regularChangePercent
    : (typeof row?.regularChangePercent === 'number' && Number.isFinite(row.regularChangePercent))
      ? row.regularChangePercent
      : (typeof row?.changePercent === 'number' && Number.isFinite(row.changePercent))
        ? row.changePercent
        : null;

  const referenceRegular = {
    price: regularPrice,
    changePercent: regularChange
  };

  // Determine target session
  let targetSession = requestedSession;
  if (targetSession === 'auto') {
    if (marketSession === 'pre') targetSession = 'pre';
    else if (marketSession === 'post') targetSession = 'post';
    else targetSession = 'regular';
  }

  let finalPrice = null;
  let finalChange = null;
  let displayedSession = null;
  let sourceTime = null;
  let status = 'missing';

  if (!quoteData && !row) {
    return {
      symbol,
      name,
      requestedSession,
      displayedSession: null,
      price: null,
      changePercent: null,
      sourceTime: null,
      receivedAt: null,
      status: 'missing',
      referenceRegular
    };
  }

  const extQuote = quoteData?.ext || row?.ext || null;
  const isExtRequested = targetSession === 'pre' || targetSession === 'post' || targetSession === 'overnight';

  if (isExtRequested) {
    // Extended session requested: look for matching session in ext quote
    const extPrice = extQuote && typeof extQuote.price === 'number' && Number.isFinite(extQuote.price) ? extQuote.price : null;
    const extChange = extQuote && typeof extQuote.changePercent === 'number' && Number.isFinite(extQuote.changePercent) ? extQuote.changePercent : null;
    const extSessionType = extQuote?.session || targetSession;

    if (extPrice !== null) {
      finalPrice = extPrice;
      finalChange = extChange;
      displayedSession = formatSessionLabel(extSessionType);
      sourceTime = extQuote.sourceTime || extQuote.time || quoteData?.sourceTime || null;
      status = 'available';
    } else {
      // Extended price is missing for this target session!
      // HARD RULE: Do not substitute regular price as the primary extended price!
      finalPrice = null;
      finalChange = null;
      displayedSession = formatSessionLabel(targetSession);
      sourceTime = null;
      status = 'missing';
    }
  } else {
    // Regular session requested or auto regular
    if (regularPrice !== null) {
      finalPrice = regularPrice;
      finalChange = regularChange;
      displayedSession = formatSessionLabel('regular');
      sourceTime = quoteData?.sourceTime || row?.sourceTime || null;
      status = 'available';
    } else {
      finalPrice = null;
      finalChange = null;
      displayedSession = formatSessionLabel('regular');
      sourceTime = null;
      status = 'missing';
    }
  }

  // Check delayed/stale status
  if (status === 'available') {
    if (quoteData?.isDelayed || row?.isDelayed) {
      status = 'delayed';
    } else if (quoteData?.isStale || row?.isStale) {
      status = 'stale';
    }
  }

  return {
    symbol,
    name,
    requestedSession,
    displayedSession,
    price: finalPrice,
    changePercent: finalChange,
    sourceTime,
    receivedAt: quoteData?.receivedAt || row?.receivedAt || null,
    status,
    referenceRegular
  };
}
