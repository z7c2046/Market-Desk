// US Equity Market Trading Sessions and Change Percentage Calculations
// Timezone: America/New_York for session schedule; Asia/Shanghai for display; UTC for timestamps.

export const SESSION_TYPES = {
  PRE: 'pre',
  REGULAR: 'regular',
  POST: 'post',
  OVERNIGHT: 'overnight',
  CLOSED: 'closed'
};

export const SESSION_NAMES = {
  pre: '盘前',
  regular: '常规',
  post: '盘后',
  overnight: '隔夜',
  closed: '已休市'
};

/**
 * Returns formatted New York time components for a given Date:
 * { year, month, day, hour, minute, second, dayOfWeek, dateStr, timeStr }
 */
export function getNyTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short'
  });
  const parts = Object.fromEntries(formatter.formatToParts(d).map(p => [p.type, p.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const weekday = parts.weekday; // Mon, Tue, Wed, Thu, Fri, Sat, Sun
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const minutesOfDay = hour * 60 + minute;
  return { year, month, day, hour, minute, second, weekday, dateStr, minutesOfDay, parts };
}

/**
 * Determine the current market session based on America/New_York clock.
 * Common Standard Windows (NY Time):
 * - Pre-market: 04:00 - 09:30 (240 - 570 mins)
 * - Regular (RTH): 09:30 - 16:00 (570 - 960 mins)
 * - Post-market: 16:00 - 20:00 (960 - 1200 mins)
 * - Overnight: 20:00 - 04:00 next day (1200 - 1440 or 0 - 240 mins)
 * Weekend rules:
 * - Friday post-market ends at 20:00 NY. Friday overnight typically not open (or closed by Fri 20:00).
 * - Saturday: Closed all day.
 * - Sunday: Closed until Sunday 20:00 NY (when Sunday overnight / Asian morning starts).
 */
export function getCurrentSession(date = new Date()) {
  const ny = getNyTime(date);
  const { weekday, minutesOfDay, dateStr } = ny;

  // Weekend checks
  if (weekday === 'Sat') {
    return { session: SESSION_TYPES.CLOSED, isExt: false, tradeDate: dateStr, desc: '周末休市' };
  }
  if (weekday === 'Sun') {
    if (minutesOfDay >= 1200) {
      // Sunday 20:00+ NY begins Overnight for Monday trade date
      return { session: SESSION_TYPES.OVERNIGHT, isExt: true, tradeDate: dateStr, desc: '周日隔夜时段' };
    }
    return { session: SESSION_TYPES.CLOSED, isExt: false, tradeDate: dateStr, desc: '周末休市' };
  }
  if (weekday === 'Fri' && minutesOfDay >= 1200) {
    // Friday after 20:00 NY is closed for the weekend
    return { session: SESSION_TYPES.CLOSED, isExt: false, tradeDate: dateStr, desc: '周末休市' };
  }

  // Weekday Monday to Friday
  if (minutesOfDay >= 240 && minutesOfDay < 570) {
    // 04:00 - 09:30 Pre-market
    return { session: SESSION_TYPES.PRE, isExt: true, tradeDate: dateStr, desc: '盘前交易' };
  }
  if (minutesOfDay >= 570 && minutesOfDay < 960) {
    // 09:30 - 16:00 Regular Market (RTH)
    return { session: SESSION_TYPES.REGULAR, isExt: false, tradeDate: dateStr, desc: '常规交易' };
  }
  if (minutesOfDay >= 960 && minutesOfDay < 1200) {
    // 16:00 - 20:00 Post-market
    return { session: SESSION_TYPES.POST, isExt: true, tradeDate: dateStr, desc: '盘后交易' };
  }
  if (minutesOfDay >= 1200) {
    // 20:00 - 24:00 Overnight evening
    return { session: SESSION_TYPES.OVERNIGHT, isExt: true, tradeDate: dateStr, desc: '隔夜交易' };
  }
  if (minutesOfDay < 240) {
    // 00:00 - 04:00 Overnight early morning (Tuesday - Friday)
    return { session: SESSION_TYPES.OVERNIGHT, isExt: true, tradeDate: dateStr, desc: '隔夜交易' };
  }

  return { session: SESSION_TYPES.CLOSED, isExt: false, tradeDate: dateStr, desc: '休市' };
}

/**
 * Calculate percentage change safely:
 * formula: (price / referenceClose - 1) * 100
 * Only valid if both price and referenceClose are finite and referenceClose > 0.
 * Otherwise returns null.
 */
export function calcChangePercent(price, referenceClose) {
  if (price == null || referenceClose == null) return null;
  const p = Number(price);
  const ref = Number(referenceClose);
  if (!Number.isFinite(p) || !Number.isFinite(ref) || ref <= 0) return null;
  return (p / ref - 1) * 100;
}

/**
 * Determine benchmark reference close for each session type according to the specification:
 * - Regular: Relative to previous completed RTH close.
 * - Post-market EXT: Relative to today's completed RTH close.
 * - Overnight EXT: Relative to the most recent completed RTH close before overnight started.
 *   (Crucial: Overnight crossing midnight does NOT reset the benchmark!).
 * - Pre-market EXT: Relative to the upcoming trading day's previous completed RTH close.
 *
 * Example verification from handoff doc:
 * Previous RTH close = 100
 * Today's RTH close = 103 -> Regular change = (103/100 - 1)*100 = +3.00%
 * Post-market price = 104 -> Post EXT change = (104/103 - 1)*100 ≈ +0.97%
 * Overnight price = 105 (following same RTH day 103) -> Overnight EXT = (105/103 - 1)*100 ≈ +1.94%
 */
export function resolveExtReferenceClose({
  session = SESSION_TYPES.POST,
  todayRthClose = null,
  prevRthClose = null
}) {
  switch (session) {
    case SESSION_TYPES.POST:
      // Post-market relative to today's RTH close
      return todayRthClose ?? prevRthClose ?? null;
    case SESSION_TYPES.OVERNIGHT:
      // Overnight relative to the most recent completed RTH close
      return todayRthClose ?? prevRthClose ?? null;
    case SESSION_TYPES.PRE:
      // Pre-market relative to previous completed RTH close
      return prevRthClose ?? todayRthClose ?? null;
    case SESSION_TYPES.REGULAR:
    default:
      // Regular relative to previous trading day's RTH close
      return prevRthClose ?? null;
  }
}

/**
 * Format timestamp in Beijing time (Asia/Shanghai) with explicit suffix.
 */
export function formatBeijingTime(dateOrTimestamp) {
  if (!dateOrTimestamp) return '时间未提供';
  const d = typeof dateOrTimestamp === 'number' ? new Date(dateOrTimestamp) : new Date(String(dateOrTimestamp));
  if (isNaN(d.getTime())) return '时间未提供';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d) + ' 北京';
}

/**
 * Formats a multi-session quote row model with fallback for missing values.
 */
export function buildMultiSessionQuote({
  symbol,
  name,
  regularPrice = null,
  regularPrevClose = null,
  regularVolume = null,
  regularTime = null,
  prePrice = null,
  preVolume = null,
  preTime = null,
  postPrice = null,
  postVolume = null,
  postTime = null,
  overnightPrice = null,
  overnightVolume = null,
  overnightTime = null,
  todayRthClose = null,
  provider = 'Longbridge',
  coverage = 'US LV1',
  delayStatus = 'realtime', // 'realtime' | 'delayed' | 'indicative' | 'unconfirmed'
  status = 'active', // 'active' | 'closed' | 'unconfigured' | 'error'
  statusReason = ''
}) {
  const regChange = calcChangePercent(regularPrice, regularPrevClose);

  // Benchmarks for EXT sessions
  const postRef = resolveExtReferenceClose({ session: SESSION_TYPES.POST, todayRthClose, prevRthClose: regularPrevClose });
  const postChange = calcChangePercent(postPrice, postRef);

  const overnightRef = resolveExtReferenceClose({ session: SESSION_TYPES.OVERNIGHT, todayRthClose, prevRthClose: regularPrevClose });
  const overnightChange = calcChangePercent(overnightPrice, overnightRef);

  const preRef = resolveExtReferenceClose({ session: SESSION_TYPES.PRE, todayRthClose, prevRthClose: regularPrevClose });
  const preChange = calcChangePercent(prePrice, preRef);

  return {
    symbol,
    name: name || symbol,
    regular: {
      price: regularPrice,
      referenceClose: regularPrevClose,
      changePercent: regChange,
      volume: regularVolume,
      priceType: 'trade',
      sourceTime: regularTime,
      tradeDate: regularTime ? getNyTime(new Date(regularTime)).dateStr : null
    },
    pre: {
      price: prePrice,
      referenceClose: preRef,
      changePercent: preChange,
      volume: preVolume,
      priceType: 'trade',
      sourceTime: preTime,
      tradeDate: preTime ? getNyTime(new Date(preTime)).dateStr : null
    },
    post: {
      price: postPrice,
      referenceClose: postRef,
      changePercent: postChange,
      volume: postVolume,
      priceType: 'trade',
      sourceTime: postTime,
      tradeDate: postTime ? getNyTime(new Date(postTime)).dateStr : null
    },
    overnight: {
      price: overnightPrice,
      referenceClose: overnightRef,
      changePercent: overnightChange,
      volume: overnightVolume,
      priceType: 'trade',
      sourceTime: overnightTime,
      tradeDate: overnightTime ? getNyTime(new Date(overnightTime)).dateStr : null
    },
    meta: {
      provider,
      coverage,
      delayStatus,
      status,
      statusReason,
      updatedAt: new Date().toISOString()
    }
  };
}

/**
 * Helper to select the active EXT quote based on extMode:
 * extMode: 'auto' | 'pre' | 'post' | 'overnight'
 * In 'auto' mode, picks the currently active session or the latest available completed EXT.
 */
export function getSelectedExtQuote(quote, extMode = 'auto', currentSession = null) {
  if (!quote) return { price: null, changePercent: null, session: 'none', label: '—', status: '无数据' };

  let target = extMode;
  let isCurrent = true;

  if (extMode === 'auto') {
    const active = currentSession?.session;
    if (active === SESSION_TYPES.PRE && quote.pre?.price != null) {
      target = SESSION_TYPES.PRE;
    } else if (active === SESSION_TYPES.POST && quote.post?.price != null) {
      target = SESSION_TYPES.POST;
    } else if (active === SESSION_TYPES.OVERNIGHT && quote.overnight?.price != null) {
      target = SESSION_TYPES.OVERNIGHT;
    } else {
      // In regular hours or closed: fallback to most recent completed EXT with price
      if (quote.post?.price != null) {
        target = SESSION_TYPES.POST;
        isCurrent = false;
      } else if (quote.overnight?.price != null) {
        target = SESSION_TYPES.OVERNIGHT;
        isCurrent = false;
      } else if (quote.pre?.price != null) {
        target = SESSION_TYPES.PRE;
        isCurrent = false;
      } else {
        target = SESSION_TYPES.POST;
        isCurrent = false;
      }
    }
  }

  const sessionData = quote[target] || {};
  const hasTrade = sessionData.price != null && Number.isFinite(sessionData.price);
  const sessionName = SESSION_NAMES[target] || target;
  const dateStr = sessionData.tradeDate ? ` (${sessionData.tradeDate.slice(5)})` : '';
  const statusLabel = hasTrade ? (isCurrent ? sessionName : `${sessionName}已结${dateStr}`) : '无成交';

  return {
    price: sessionData.price ?? null,
    changePercent: sessionData.changePercent ?? null,
    volume: sessionData.volume ?? null,
    session: target,
    isCurrent,
    label: sessionName,
    status: statusLabel,
    sourceTime: sessionData.sourceTime ?? null
  };
}
