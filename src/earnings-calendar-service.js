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
const LARGE_CAP_THRESHOLD = 10_000_000_000;

// Curated AI supply chain & bellwether tickers (classifications only, never demo schedules/figures).
for (const [symbol, name, sectorId, sectorName, aiTag, isAiSupplyChain = true] of [
  ['NVDA', '英伟达', 'chips', 'AI 算力与芯片', 'AI GPU', true],
  ['TSM', '台积电', 'chips', 'AI 算力与芯片', '先进制程', true],
  ['AVGO', '博通', 'chips', 'AI 算力与芯片', '定制芯片与互联', true],
  ['MU', '美光', 'memory', '存储与 HBM', 'HBM 存储', true],
  ['TSLA', '特斯拉', 'cloud', '云计算与大模型', '自动驾驶与智算', true],
  ['NBIS', 'Nebius', 'cloud', '云计算与大模型', 'AI GPU 云基建', true],
  ['CRWV', 'CoreWeave', 'cloud', '云计算与大模型', 'AI 算力云', true],
  ['PANW', 'Palo Alto', 'cloud', '云计算与大模型', 'AI 网络安全', true],
  ['CRWD', 'CrowdStrike', 'cloud', '云计算与大模型', '端点安全云', true],
  ['SNOW', 'Snowflake', 'cloud', '云计算与大模型', 'AI 数据云', true],
  ['ZS', 'Zscaler', 'cloud', '云计算与大模型', '零信任安全', true],
  ['FTNT', '飞塔信息', 'network', '高速互联与通信', '网络安全硬件', true],
  ['INTU', 'Intuit', 'cloud', '云计算与大模型', 'AI 财税软件', false],
  ['KEYS', '是德科技', 'datacenter', '数据中心与制冷', '高速光通信测试', true],
  ['VEEV', 'Veeva', 'cloud', '云计算与大模型', '医药行业云', false],
  ['RKLB', 'Rocket Lab', 'broad', '大盘核心标', '商业航天', false],
  ['VST', 'Vistra Energy', 'energy', '电力与能源', 'AI 数据中心供电', true],
  ['OKLO', 'Oklo', 'energy', '电力与能源', '小型核电 SMR', true],
  ['SMR', 'NuScale', 'energy', '电力与能源', '小型模块化核电', true],
  ['WMT', '沃尔玛', 'broad', '大盘核心标', '零售风向标', false],
  ['HD', '家得宝', 'broad', '大盘核心标', '家居消费龙头', false],
  ['LOW', '劳氏', 'broad', '大盘核心标', '家居零售', false],
  ['TGT', '塔吉特', 'broad', '大盘核心标', '综合零售', false],
  ['BIDU', '百度', 'cloud', '云计算与大模型', '文心大模型 / AI 云', true],
  ['BABA', '阿里巴巴', 'cloud', '云计算与大模型', '通义大模型 / 阿里云', true],
  ['PDD', '拼多多', 'broad', '大盘核心标', '跨境电商龙头', false],
  ['JD', '京东', 'broad', '大盘核心标', '电商物流', false],
  ['NTES', '网易', 'broad', '大盘核心标', '互动娱乐', false],
  ['TCOM', '携程', 'broad', '大盘核心标', '在线旅游', false],
  ['SE', 'Sea Limited', 'broad', '大盘核心标', '东南亚电商游戏', false],
  ['NU', 'Nu Holdings', 'broad', '大盘核心标', '拉美数字银行', false],
  ['TTWO', 'Take-Two', 'broad', '大盘核心标', '游戏发行巨头', false],
  ['KKR', 'KKR', 'broad', '大盘核心标', '另类资产管理', false],
  ['OXY', '西方石油', 'broad', '大盘核心标', '传统能源上游', false]
]) companies.set(symbol, { name, sectorId, sectorName, aiTag, isAiSupplyChain });
const dayIds = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function number(value) {
  if (value == null || !String(value).trim()) return null;
  const text = String(value).trim();
  const parsed = Number(text.replace(/[$,()]/g, ''));
  return Number.isFinite(parsed) ? (/^\(.*\)$/.test(text) ? -Math.abs(parsed) : parsed) : null;
}

function parseMarketCap(value) {
  if (value == null || !String(value).trim()) return null;
  const parsed = Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatMarketCapTag(marketCap) {
  if (!Number.isFinite(marketCap) || marketCap <= 0) return '大盘核心标';
  if (marketCap >= 1e12) return `市值 $${(marketCap / 1e12).toFixed(2)}T`;
  return `市值 $${Math.round(marketCap / 1e9)}B`;
}

function resolveCompanyMeta(row, symbol) {
  const curated = companies.get(symbol);
  if (curated) return curated;
  const marketCap = parseMarketCap(row.marketCap);
  if (marketCap == null || marketCap < LARGE_CAP_THRESHOLD) return null;
  const rawName = String(row.name || '').trim();
  return {
    name: rawName || symbol,
    sectorId: 'broad',
    sectorName: '大盘核心标',
    isAiSupplyChain: false,
    aiTag: formatMarketCapTag(marketCap)
  };
}

export function normalizeEarningsRows(rows, date, sourceAsOf, fetchedAt) {
  const unique = new Map();
  const seenBaseSymbols = new Set();
  for (const row of rows) {
    const symbol = String(row.symbol || '').trim().toUpperCase();
    if (!symbol) continue;
    const baseSymbol = symbol.includes('.') ? symbol.split('.')[0] : symbol;
    const curated = companies.get(symbol);
    if (!curated && symbol.includes('.') && seenBaseSymbols.has(baseSymbol)) continue;
    const company = resolveCompanyMeta(row, symbol);
    if (!company) continue;
    seenBaseSymbols.add(baseSymbol);
    const actual = number(row.eps), forecast = number(row.epsForecast);
    const timing = row.time === 'time-pre-market' ? 'BMO' : row.time === 'time-after-hours' ? 'AMC' : 'UNKNOWN';
    const reportStatus = actual == null ? 'pending' : forecast == null || actual === forecast ? 'reported' : actual > forecast ? 'beat' : 'miss';
    const metric = value => value == null ? null : `$${value.toFixed(2)}`;
    unique.set(symbol, {
      ...company, symbol, day: dayIds[new Date(`${date}T12:00:00Z`).getUTCDay()], fullDate: date, timing,
      reportStatus, statusBadgeText: actual == null ? '来源尚未提供实际 EPS' : forecast == null ? '实际 EPS 已更新' : actual === forecast ? 'EPS 符合预期' : actual > forecast ? 'EPS 超预期' : 'EPS 低于预期',
      epsActual: metric(actual), epsConsensus: metric(forecast), epsPrev: metric(number(row.lastYearEPS)),
      marketCap: row.marketCap && String(row.marketCap).trim() ? String(row.marketCap).trim() : null,
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
