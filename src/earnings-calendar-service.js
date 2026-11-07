import {
  DEFAULT_TECH_EARNINGS, CURRENT_WEEK_EARNINGS, NEXT_WEEK_EARNINGS,
  getEarningsCalendarDate, getEarningsWeeks
} from '../public/earnings-calendar-model.js';

const SOURCE = 'Nasdaq 财报日历';
const SOURCE_URL = 'https://www.nasdaq.com/market-activity/earnings';
// Reuse company classifications only, never the old schedule or financial figures.
const companies = new Map([...DEFAULT_TECH_EARNINGS, ...CURRENT_WEEK_EARNINGS, ...NEXT_WEEK_EARNINGS].map(item => [item.symbol, {
  name: item.name, sectorId: item.sectorId, sectorName: item.sectorName,
  isAiSupplyChain: item.isAiSupplyChain, aiTag: item.aiTag
}]));
// Core names can report outside the three weeks in the archived demo catalogue.
for (const [symbol, name, sectorId, sectorName, aiTag] of [
  ['NVDA', '英伟达', 'chips', 'AI 算力与芯片', 'AI GPU'],
  ['TSM', '台积电', 'chips', 'AI 算力与芯片', '先进制程'],
  ['AVGO', '博通', 'chips', 'AI 算力与芯片', '定制芯片与互联'],
  ['MU', '美光', 'memory', '存储与 HBM', 'HBM 存储'],
  ['TSLA', '特斯拉', 'cloud', '云计算与大模型', '自动驾驶']
]) companies.set(symbol, { name, sectorId, sectorName, aiTag, isAiSupplyChain: true });
const dayIds = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function number(value) {
  if (value == null || !String(value).trim()) return null;
  const text = String(value).trim();
  const parsed = Number(text.replace(/[$,()]/g, ''));
  return Number.isFinite(parsed) ? (/^\(.*\)$/.test(text) ? -Math.abs(parsed) : parsed) : null;
}

export function normalizeEarningsRows(rows, date, sourceAsOf, fetchedAt) {
  const unique = new Map();
  for (const row of rows) {
    const symbol = String(row.symbol || '').trim().toUpperCase();
    const company = companies.get(symbol);
    if (!company) continue;
    const actual = number(row.eps), forecast = number(row.epsForecast);
    const timing = row.time === 'time-pre-market' ? 'BMO' : row.time === 'time-after-hours' ? 'AMC' : 'UNKNOWN';
    const reportStatus = actual == null ? 'pending' : forecast == null || actual === forecast ? 'reported' : actual > forecast ? 'beat' : 'miss';
    const metric = value => value == null ? null : `$${value.toFixed(2)}`;
    unique.set(symbol, {
      ...company, symbol, day: dayIds[new Date(`${date}T12:00:00Z`).getUTCDay()], fullDate: date, timing,
      reportStatus, statusBadgeText: actual == null ? '来源尚未提供实际 EPS' : forecast == null ? '实际 EPS 已更新' : actual === forecast ? 'EPS 符合预期' : actual > forecast ? 'EPS 超预期' : 'EPS 低于预期',
      epsActual: metric(actual), epsConsensus: metric(forecast), epsPrev: metric(number(row.lastYearEPS)),
      revActual: null, revConsensus: null, revPrev: null, revYoy: null, revQoq: null, aiCatalyst: null,
      fiscalQuarter: row.fiscalQuarterEnding || null, source: SOURCE, sourceUrl: `${SOURCE_URL}?date=${date}`,
      sourceAsOf, fetchedAt, scheduleStatus: 'provider-calendar'
    });
  }
  return [...unique.values()];
}

export function createEarningsCalendarService({ fetchImpl = fetch, now = () => new Date(), ttlMs = 10 * 60_000 } = {}) {
  const cache = new Map(), pending = new Map();
  async function loadDay(date, force) {
    const previous = cache.get(date);
    if (!force && previous && now().getTime() - Date.parse(previous.fetchedAt) < ttlMs) return { ...previous, status: 'ready' };
    if (pending.has(date)) return pending.get(date);
    const task = (async () => {
      try {
        const response = await fetchImpl(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.nasdaq.com/' },
          signal: AbortSignal.timeout(10_000)
        });
        if (!response.ok) throw new Error(`Nasdaq HTTP ${response.status}`);
        const payload = await response.json();
        if (payload.status?.rCode !== 200 || !payload.data || !Array.isArray(payload.data.rows)) throw new Error('Nasdaq 暂未提供该日有效数据');
        const fetchedAt = now().toISOString();
        const result = { date, fetchedAt, sourceAsOf: payload.data.asOf || null,
          items: normalizeEarningsRows(payload.data.rows, date, payload.data.asOf || null, fetchedAt) };
        cache.set(date, result);
        while (cache.size > 40) cache.delete(cache.keys().next().value);
        return { ...result, status: 'ready' };
      } catch (error) {
        if (previous && now().getTime() - Date.parse(previous.fetchedAt) < 24 * 60 * 60_000) return { ...previous, status: 'stale', error: error.message };
        return { date, items: [], status: 'unavailable', fetchedAt: null, error: error.message };
      } finally { pending.delete(date); }
    })();
    pending.set(date, task);
    return task;
  }

  return {
    async getWeek({ weekStart, force = false } = {}) {
      const requested = weekStart || getEarningsWeeks(now()).current.weekStart;
      const parsed = new Date(`${requested}T12:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(requested) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== requested || parsed.getUTCDay() !== 1) {
        throw Object.assign(new Error('weekStart 必须是有效的周一日期 YYYY-MM-DD'), { status: 400 });
      }
      const week = getEarningsWeeks(requested).current;
      const days = [];
      // Limit concurrent upstream requests; refreshes share in-flight requests.
      for (let i = 0; i < week.days.length; i += 2) {
        days.push(...await Promise.all(week.days.slice(i, i + 2).map(day => loadDay(day.fullDate, force))));
      }
      const ready = days.filter(day => day.status === 'ready').length;
      const status = ready === 5 ? 'ready' : days.every(day => day.status === 'unavailable') ? 'unavailable' : 'partial';
      return { weekStart: requested, weekEnd: week.weekEnd, timeZone: 'America/New_York', today: getEarningsCalendarDate(now()),
        source: SOURCE, sourceUrl: SOURCE_URL, status,
        checkedAt: now().toISOString(), fetchedAt: days.map(day => day.fetchedAt).filter(Boolean).sort()[0] || null,
        days: days.map(({ items, ...day }) => day),
        items: days.flatMap(day => day.items.map(item => ({ ...item, stale: day.status === 'stale' }))) };
    }
  };
}
