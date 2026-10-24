// Watchlist Grouping, Persistence, and Migration Model (v2)
// Handles preset groups, global deduplication, 30 unique symbols cap, import/export, and undo.

export const STORAGE_KEY_V1 = 'market-desk-watchlist';
export const STORAGE_KEY_V2 = 'market-desk-watchlist-v2';
export const MAX_UNIQUE_SYMBOLS = 100;

export const SYMBOL_NAMES = {
  // 存储
  NTAP: '美国网存',
  MU: '美光科技',
  SKHY: 'SK海力士',
  WDC: '西部数据',
  P: 'Everpure',
  SNDK: '闪迪',
  KXIAY: 'KIOXIA',
  STX: '希捷科技',

  // 芯片
  NVDA: '英伟达',
  AVGO: '博通',
  TSM: '台积电',
  ASML: '阿斯麦',
  SOXX: '半导体 ETF',
  INTC: '英特尔',
  AMAT: '应用材料',
  CBRS: 'Cerebras Systems',
  AMD: '美国超微公司',
  LRCX: '泛林集团',

  // 光
  POET: 'POET Technologies',
  GLW: '康宁',
  MRVL: '迈威尔科技',
  CIEN: 'Ciena',
  CRDO: 'Credo Technology',
  LITE: 'Lumentum',
  FN: 'Fabrinet',
  AAOI: 'AOI',
  COHR: 'Coherent',

  // 数据中心
  DELL: '戴尔科技',
  NBIS: 'NEBIUS',
  ANET: 'Arista Networks',
  PENG: 'Penguin Solutions',
  VRT: 'Vertiv Holdings',
  IREN: 'IREN Ltd',
  CRWV: 'CoreWeave',
  APLD: 'Applied Digital',
  MOD: '摩丁制造',
  ALAB: 'Astera Labs',
  NVT: 'nVent Electric',
  NOK: '诺基亚',

  // ETF
  SQQQ: '三倍做空纳指',
  YANG: '三倍做空中国',
  TQQQ: '三倍做多纳指',
  MUU: '2倍做多MU',
  '07709.HK': 'XL二南方海力士',
  SNXX: '2倍做多闪迪',
  SOXL: '三倍做多半导体',

  // 万亿市值俱乐部 (1T+ Market Cap)
  AAPL: '苹果',
  MSFT: '微软',
  GOOGL: '谷歌',
  AMZN: '亚马逊',
  META: 'Meta',
  TSLA: '特斯拉',
  'BRK-B': '伯克希尔',
  LLY: '礼来'
};

export function sortWatchlistRows(rows, sortField = 'extChange', sortDirection = 'desc') {
  const dir = sortDirection === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (sortField === 'symbol') {
      const cmp = String(valA || '').localeCompare(String(valB || ''));
      return cmp * dir;
    }

    if (sortField === 'updatedAt') {
      const tA = valA ? Date.parse(valA) : NaN;
      const tB = valB ? Date.parse(valB) : NaN;
      valA = Number.isFinite(tA) ? tA : null;
      valB = Number.isFinite(tB) ? tB : null;
    }

    const hasA = valA !== null && valA !== undefined && Number.isFinite(Number(valA));
    const hasB = valB !== null && valB !== undefined && Number.isFinite(Number(valB));

    // Both unavailable: stable sort by symbol
    if (!hasA && !hasB) return a.symbol.localeCompare(b.symbol);
    // Unavailable values always at the bottom in both asc and desc
    if (!hasA) return 1;
    if (!hasB) return -1;

    const diff = (Number(valA) - Number(valB)) * dir;
    if (diff !== 0) return diff;
    return a.symbol.localeCompare(b.symbol);
  });
}

export const SESSION_NAMES = {
  pre: '盘前',
  regular: '常规',
  post: '盘后',
  overnight: '隔夜',
  closed: '已休市'
};

export const KNOWN_LEVERAGED_ETFS = new Set([
  'SQQQ', 'TQQQ', 'SOXL', 'SOXS', 'YANG', 'YINN',
  'MUU', '07709.HK', 'SNXX', 'NVDL', 'TSLL', 'AAPU',
  'UPRO', 'SPXU', 'SSO', 'SDS', 'TNA', 'TZA',
  'FNGU', 'FNGD', 'LABU', 'LABD', 'TECL', 'TECS',
  'UVXY', 'SVXY', 'BOIL', 'KOLD', 'NUGT', 'DUST',
  'JNUG', 'JDST', 'DPST', 'FAS', 'FAZ'
]);

export function isLeveragedEtf(symbol, name = '') {
  if (!symbol) return false;
  const cleanSym = String(symbol).trim().toUpperCase();
  if (KNOWN_LEVERAGED_ETFS.has(cleanSym)) return true;

  const testName = String(name || SYMBOL_NAMES[cleanSym] || '');
  if (/[23两三]倍|杠杆|做[多空]|XL二|2X|3X|Leveraged|UltraPro|Bull\s*[23]X|Bear\s*[23]X/i.test(testName)) {
    return true;
  }
  return false;
}

export function getSelectedExtQuote(quote, extMode = 'auto', currentSession = null) {
  if (!quote) return { price: null, changePercent: null, session: 'none', label: '—', status: '无数据' };

  let target = extMode;
  let isCurrent = true;

  if (extMode === 'auto') {
    const active = currentSession?.session;
    if (active === 'pre' && quote.pre?.price != null) {
      target = 'pre';
    } else if (active === 'post' && quote.post?.price != null) {
      target = 'post';
    } else if (active === 'overnight' && quote.overnight?.price != null) {
      target = 'overnight';
    } else {
      if (quote.post?.price != null) {
        target = 'post';
        isCurrent = false;
      } else if (quote.overnight?.price != null) {
        target = 'overnight';
        isCurrent = false;
      } else if (quote.pre?.price != null) {
        target = 'pre';
        isCurrent = false;
      } else {
        target = 'post';
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

export const PRESET_GROUPS = [
  {
    id: 'storage',
    name: '存储',
    collapsed: false,
    order: 0,
    symbolIds: ['NTAP', 'MU', 'SKHY', 'WDC', 'P', 'SNDK', 'KXIAY', 'STX']
  },
  {
    id: 'chips',
    name: '芯片',
    collapsed: false,
    order: 1,
    symbolIds: ['NVDA', 'AVGO', 'TSM', 'ASML', 'SOXX', 'INTC', 'AMAT', 'CBRS', 'AMD', 'LRCX']
  },
  {
    id: 'optics',
    name: '光',
    collapsed: false,
    order: 2,
    symbolIds: ['POET', 'GLW', 'MRVL', 'CIEN', 'CRDO', 'LITE', 'FN', 'AAOI', 'COHR']
  },
  {
    id: 'datacenter',
    name: '数据中心',
    collapsed: false,
    order: 3,
    symbolIds: ['DELL', 'NBIS', 'ANET', 'PENG', 'VRT', 'IREN', 'CRWV', 'APLD', 'MOD', 'ALAB', 'NVT', 'NOK']
  },
  {
    id: 'etf',
    name: 'ETF',
    collapsed: false,
    order: 4,
    symbolIds: ['SQQQ', 'YANG', 'TQQQ', 'MUU', '07709.HK', 'SNXX', 'SOXL']
  },
  {
    id: 'trillion',
    name: '万亿市值',
    collapsed: false,
    order: 5,
    symbolIds: ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSM', 'AVGO', 'TSLA', 'BRK-B', 'LLY']
  },
  {
    id: 'default',
    name: '未分组',
    collapsed: false,
    order: 6,
    symbolIds: []
  }
];

export function validSymbol(s) {
  return typeof s === 'string' && /^\^?[A-Z0-9][A-Z0-9.-]{0,11}$/.test(s.trim().toUpperCase());
}

export function createInitialWatchlistData(existingSymbols = null) {
  if (Array.isArray(existingSymbols) && existingSymbols.length > 0) {
    const cleanSymbols = [...new Set(existingSymbols.filter(validSymbol).map(s => s.trim().toUpperCase()))].slice(0, MAX_UNIQUE_SYMBOLS);
    return {
      version: 2,
      groups: PRESET_GROUPS.map(g => ({
        ...g,
        symbolIds: g.id === 'default' ? cleanSymbols : []
      })),
      preferences: {
        currentGroup: 'all', // 'all' or groupId
        viewMode: 'grouped', // 'grouped' | 'all'
        sortField: 'extChange', // 'symbol' | 'regularPrice' | 'regularChange' | 'extPrice' | 'extChange' | 'updatedAt'
        sortDirection: 'desc', // 'asc' | 'desc'
        extMode: 'auto', // 'auto' | 'pre' | 'post' | 'overnight'
        autoResort: true,
        freezeResort: false,
        compactPanelOpen: false
      }
    };
  }

  return {
    version: 2,
    groups: PRESET_GROUPS.map(g => ({
      ...g,
      symbolIds: [...g.symbolIds]
    })),
    preferences: {
      currentGroup: 'all', // 'all' or groupId
      viewMode: 'grouped', // 'grouped' | 'all'
      sortField: 'extChange', // 'symbol' | 'regularPrice' | 'regularChange' | 'extPrice' | 'extChange' | 'updatedAt'
      sortDirection: 'desc', // 'asc' | 'desc'
      extMode: 'auto', // 'auto' | 'pre' | 'post' | 'overnight'
      autoResort: true,
      freezeResort: false,
      compactPanelOpen: false
    }
  };
}

function getStorage(custom) {
  if (custom && typeof custom.getItem === 'function') return custom;
  if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
    return localStorage;
  }
  return null;
}

export class WatchlistManager {
  constructor({ storage } = {}) {
    this.storage = getStorage(storage);
    this.data = this.load();
    this.undoDeletion = null; // Stash for 1-step undo
  }

  load() {
    if (!this.storage || typeof this.storage.getItem !== 'function') return createInitialWatchlistData();

    // 1. Try reading v2
    try {
      const rawV2 = this.storage.getItem(STORAGE_KEY_V2);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        if (parsed && parsed.version === 2 && Array.isArray(parsed.groups)) {
          // If stored groups still contain old placeholder groups (tech, defensive, pharma), upgrade to new observation groups
          const hasOldPlaceholders = parsed.groups.some(g => ['tech', 'defensive', 'pharma'].includes(g.id));
          if (hasOldPlaceholders) {
            const upgraded = createInitialWatchlistData();
            this.save(upgraded);
            return upgraded;
          }
          // If existing groups lack the 'etf' group, inject it automatically
          if (!parsed.groups.some(g => g.id === 'etf')) {
            const etfGroup = PRESET_GROUPS.find(g => g.id === 'etf');
            if (etfGroup) {
              const insertIdx = Math.max(0, parsed.groups.length - 1);
              parsed.groups.splice(insertIdx, 0, {
                ...etfGroup,
                symbolIds: [...etfGroup.symbolIds]
              });
            }
          }
          // If existing groups lack the 'trillion' group, inject it automatically
          if (!parsed.groups.some(g => g.id === 'trillion')) {
            const trillionGroup = PRESET_GROUPS.find(g => g.id === 'trillion');
            if (trillionGroup) {
              const insertIdx = Math.max(0, parsed.groups.length - 1);
              parsed.groups.splice(insertIdx, 0, {
                ...trillionGroup,
                symbolIds: [...trillionGroup.symbolIds]
              });
            }
          }
          const sanitized = this.sanitizeData(parsed);
          this.save(sanitized);
          return sanitized;
        }
      }
    } catch (err) {
      console.warn('Failed to parse watchlist v2 storage:', err);
    }

    // 2. Fallback / Migration from v1
    try {
      const rawV1 = this.storage.getItem(STORAGE_KEY_V1);
      if (rawV1) {
        const parsedV1 = JSON.parse(rawV1);
        if (Array.isArray(parsedV1)) {
          const migrated = createInitialWatchlistData(parsedV1);
          this.save(migrated);
          return migrated;
        }
      }
    } catch (err) {
      console.warn('Failed to parse watchlist v1 storage:', err);
    }

    // 3. Defaults
    const initial = createInitialWatchlistData();
    this.save(initial);
    return initial;
  }

  save(data = this.data) {
    this.data = data;
    if (!this.storage || typeof this.storage.setItem !== 'function') return;
    try {
      this.storage.setItem(STORAGE_KEY_V2, JSON.stringify(data));
      // Keep legacy v1 array in sync for backward compatibility
      this.storage.setItem(STORAGE_KEY_V1, JSON.stringify(this.getAllUniqueSymbols()));
    } catch (err) {
      console.error('Failed to save watchlist storage:', err);
    }
  }

  sanitizeData(parsed) {
    const groups = [];
    const seenGroupIds = new Set();
    const allSymbols = new Set();

    for (const g of parsed.groups || []) {
      if (!g || typeof g.id !== 'string') continue;
      const id = g.id.trim();
      if (!id || seenGroupIds.has(id)) continue;
      seenGroupIds.add(id);

      const symbolIds = [];
      for (const s of g.symbolIds || []) {
        if (validSymbol(s)) {
          const clean = s.trim().toUpperCase();
          if (allSymbols.size < MAX_UNIQUE_SYMBOLS || allSymbols.has(clean)) {
            allSymbols.add(clean);
            if (!symbolIds.includes(clean)) symbolIds.push(clean);
          }
        }
      }

      groups.push({
        id,
        name: typeof g.name === 'string' ? g.name.trim() : id,
        collapsed: Boolean(g.collapsed),
        order: Number.isFinite(g.order) ? g.order : groups.length,
        symbolIds
      });
    }

    // Ensure 'default' group exists
    if (!seenGroupIds.has('default')) {
      groups.unshift({ id: 'default', name: '未分组', collapsed: false, order: 0, symbolIds: [] });
    }

    return {
      version: 2,
      groups: groups.sort((a, b) => a.order - b.order),
      preferences: {
        currentGroup: parsed.preferences?.currentGroup || 'all',
        viewMode: parsed.preferences?.viewMode === 'all' ? 'all' : 'grouped',
        sortField: parsed.preferences?.sortField || 'extChange',
        sortDirection: parsed.preferences?.sortDirection === 'asc' ? 'asc' : 'desc',
        extMode: ['auto', 'pre', 'post', 'overnight'].includes(parsed.preferences?.extMode) ? parsed.preferences.extMode : 'auto',
        autoResort: parsed.preferences?.autoResort !== false,
        freezeResort: Boolean(parsed.preferences?.freezeResort),
        compactPanelOpen: Boolean(parsed.preferences?.compactPanelOpen)
      }
    };
  }

  getGroups() {
    return this.data.groups;
  }

  getGroup(groupId) {
    return this.data.groups.find(g => g.id === groupId);
  }

  getAllUniqueSymbols() {
    const set = new Set();
    for (const g of this.data.groups) {
      for (const s of g.symbolIds) set.add(s);
    }
    return Array.from(set);
  }

  getSymbolsForGroup(groupId) {
    if (groupId === 'all') return this.getAllUniqueSymbols();
    const g = this.getGroup(groupId);
    return g ? [...g.symbolIds] : [];
  }

  getGroupsForSymbol(symbol) {
    const clean = symbol.trim().toUpperCase();
    return this.data.groups.filter(g => g.symbolIds.includes(clean)).map(g => g.name);
  }

  addSymbol(symbol, targetGroupId = 'default') {
    if (!validSymbol(symbol)) return { ok: false, error: '请输入有效的美股代码' };
    const clean = symbol.trim().toUpperCase();
    const unique = this.getAllUniqueSymbols();

    if (!unique.includes(clean) && unique.length >= MAX_UNIQUE_SYMBOLS) {
      return { ok: false, error: `自选股数量已达上限（最多 ${MAX_UNIQUE_SYMBOLS} 支），请先移除部分标的` };
    }

    let targetGroup = this.getGroup(targetGroupId);
    if (!targetGroup) targetGroup = this.getGroup('default');

    if (!targetGroup.symbolIds.includes(clean)) {
      targetGroup.symbolIds.push(clean);
      this.save();
    }

    return { ok: true, symbol: clean };
  }

  removeSymbolFromGroup(symbol, groupId) {
    const clean = symbol.trim().toUpperCase();
    const group = this.getGroup(groupId);
    if (!group) return false;
    group.symbolIds = group.symbolIds.filter(s => s !== clean);
    this.save();
    return true;
  }

  removeSymbolGlobally(symbol) {
    const clean = symbol.trim().toUpperCase();
    for (const g of this.data.groups) {
      g.symbolIds = g.symbolIds.filter(s => s !== clean);
    }
    this.save();
    return true;
  }

  createGroup(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, error: '分组名称不能为空' };
    const id = 'group_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newGroup = {
      id,
      name: trimmed,
      collapsed: false,
      order: this.data.groups.length,
      symbolIds: []
    };
    this.data.groups.push(newGroup);
    this.save();
    return { ok: true, group: newGroup };
  }

  renameGroup(groupId, newName) {
    const trimmed = String(newName || '').trim();
    if (!trimmed) return { ok: false, error: '分组名称不能为空' };
    const group = this.getGroup(groupId);
    if (!group) return { ok: false, error: '分组不存在' };
    group.name = trimmed;
    this.save();
    return { ok: true };
  }

  deleteGroup(groupId) {
    if (groupId === 'default') return { ok: false, error: '默认分组“未分组”不可删除' };
    const index = this.data.groups.findIndex(g => g.id === groupId);
    if (index === -1) return { ok: false, error: '分组不存在' };

    const deletedGroup = this.data.groups[index];
    const defaultGroup = this.getGroup('default');

    // Symbols that only exist in this group move to 'default'
    const movedSymbols = [];
    for (const sym of deletedGroup.symbolIds) {
      const otherGroups = this.data.groups.filter(g => g.id !== groupId && g.symbolIds.includes(sym));
      if (!otherGroups.length) {
        if (!defaultGroup.symbolIds.includes(sym)) {
          defaultGroup.symbolIds.push(sym);
          movedSymbols.push(sym);
        }
      }
    }

    // Save undo snapshot
    this.undoDeletion = {
      group: JSON.parse(JSON.stringify(deletedGroup)),
      index,
      movedSymbols
    };

    this.data.groups.splice(index, 1);
    this.save();
    return { ok: true, movedSymbolsCount: movedSymbols.length };
  }

  undoDeleteGroup() {
    if (!this.undoDeletion) return false;
    const { group, index, movedSymbols } = this.undoDeletion;
    const defaultGroup = this.getGroup('default');

    // Re-insert group
    this.data.groups.splice(index, 0, group);

    // Remove moved symbols from default if they were only there due to the deletion
    if (defaultGroup && movedSymbols.length) {
      defaultGroup.symbolIds = defaultGroup.symbolIds.filter(s => !movedSymbols.includes(s));
    }

    this.undoDeletion = null;
    this.save();
    return true;
  }

  toggleGroupCollapse(groupId) {
    const group = this.getGroup(groupId);
    if (!group) return;
    group.collapsed = !group.collapsed;
    this.save();
  }

  exportJson() {
    return JSON.stringify(this.data, null, 2);
  }

  importJson(jsonString) {
    try {
      if (typeof jsonString !== 'string' || jsonString.length > 100000) {
        return { ok: false, error: '文件过大或格式错误' };
      }
      const parsed = JSON.parse(jsonString);
      if (parsed?.version !== 2 || !Array.isArray(parsed?.groups)) {
        return { ok: false, error: '无效的分组备份格式（须为 version: 2）' };
      }
      const sanitized = this.sanitizeData(parsed);
      this.save(sanitized);
      return { ok: true, groupCount: sanitized.groups.length, symbolCount: this.getAllUniqueSymbols().length };
    } catch (err) {
      return { ok: false, error: `导入失败: ${err.message}` };
    }
  }
}

export const NASDAQ100_STOCKS = [
  // 科技
  { symbol: 'NVDA', name: '英伟达 (NVIDIA)', sector: '科技', price: 142.80, changePercent: 2.15, volume: 48000000 },
  { symbol: 'AAPL', name: '苹果 (Apple)', sector: '科技', price: 231.40, changePercent: -0.14, volume: 38000000 },
  { symbol: 'MSFT', name: '微软 (Microsoft)', sector: '科技', price: 428.15, changePercent: 0.66, volume: 22000000 },
  { symbol: 'AVGO', name: '博通 (Broadcom)', sector: '科技', price: 178.60, changePercent: -0.48, volume: 16000000 },
  { symbol: 'AMD', name: '超微半导体 (AMD)', sector: '科技', price: 156.30, changePercent: 1.74, volume: 26000000 },
  { symbol: 'QCOM', name: '高通 (Qualcomm)', sector: '科技', price: 168.40, changePercent: 0.82, volume: 12000000 },
  { symbol: 'TXN', name: '德州仪器 (TI)', sector: '科技', price: 202.10, changePercent: -0.35, volume: 8000000 },
  { symbol: 'INTC', name: '英特尔 (Intel)', sector: '科技', price: 22.80, changePercent: -1.20, volume: 35000000 },
  { symbol: 'AMAT', name: '应用材料 (AMAT)', sector: '科技', price: 208.50, changePercent: 0.44, volume: 9000000 },
  { symbol: 'MU', name: '美光科技 (Micron)', sector: '科技', price: 108.90, changePercent: 2.46, volume: 24000000 },
  { symbol: 'LRCX', name: '泛林集团 (Lam)', sector: '科技', price: 812.40, changePercent: 0.95, volume: 6000000 },
  { symbol: 'ASML', name: '阿斯麦 (ASML)', sector: '科技', price: 735.20, changePercent: 0.72, volume: 5000000 },
  { symbol: 'KLAC', name: '科磊 (KLA)', sector: '科技', price: 720.50, changePercent: 1.12, volume: 4000000 },
  { symbol: 'SNPS', name: '新思科技 (Synopsys)', sector: '科技', price: 540.20, changePercent: -0.25, volume: 3500000 },
  { symbol: 'CDNS', name: '楷登电子 (Cadence)', sector: '科技', price: 295.40, changePercent: 0.15, volume: 3800000 },
  { symbol: 'MRVL', name: '迈威尔 (Marvell)', sector: '科技', price: 84.60, changePercent: 1.65, volume: 14000000 },
  { symbol: 'ADI', name: '亚德诺半导体 (ADI)', sector: '科技', price: 218.30, changePercent: -0.42, volume: 4500000 },
  { symbol: 'NXPI', name: '恩智浦 (NXP)', sector: '科技', price: 242.10, changePercent: 0.55, volume: 4200000 },
  { symbol: 'CRWD', name: 'CrowdStrike', sector: '科技', price: 312.80, changePercent: 2.80, volume: 7500000 },
  { symbol: 'PANW', name: 'Palo Alto Networks', sector: '科技', price: 368.50, changePercent: 1.40, volume: 6200000 },
  { symbol: 'FTNT', name: 'Fortinet', sector: '科技', price: 78.40, changePercent: -0.85, volume: 8500000 },
  { symbol: 'WDAY', name: 'Workday', sector: '科技', price: 254.20, changePercent: 0.65, volume: 4100000 },
  { symbol: 'ADBE', name: 'Adobe', sector: '科技', price: 505.30, changePercent: -0.55, volume: 5200000 },

  // 通信服务
  { symbol: 'GOOGL', name: '谷歌 (Alphabet)', sector: '通信服务', price: 168.20, changePercent: -1.24, volume: 28000000 },
  { symbol: 'META', name: 'Meta (Facebook)', sector: '通信服务', price: 588.60, changePercent: -0.96, volume: 18000000 },
  { symbol: 'NFLX', name: '奈飞 (Netflix)', sector: '通信服务', price: 742.30, changePercent: 1.85, volume: 9500000 },
  { symbol: 'TMUS', name: 'T-Mobile US', sector: '通信服务', price: 214.50, changePercent: 0.35, volume: 6200000 },
  { symbol: 'CMCSA', name: '康卡斯特 (Comcast)', sector: '通信服务', price: 42.10, changePercent: -0.62, volume: 15000000 },
  { symbol: 'CHTR', name: '特许通讯 (Charter)', sector: '通信服务', price: 345.80, changePercent: -1.45, volume: 2200000 },
  { symbol: 'DASH', name: 'DoorDash', sector: '通信服务', price: 152.40, changePercent: 2.25, volume: 4600000 },

  // 可选消费
  { symbol: 'AMZN', name: '亚马逊 (Amazon)', sector: '可选消费', price: 186.40, changePercent: -0.95, volume: 32000000 },
  { symbol: 'TSLA', name: '特斯拉 (Tesla)', sector: '可选消费', price: 218.50, changePercent: -0.63, volume: 45000000 },
  { symbol: 'COST', name: '好市多 (Costco)', sector: '可选消费', price: 898.20, changePercent: 0.48, volume: 5500000 },
  { symbol: 'BKNG', name: 'Booking Holdings', sector: '可选消费', price: 4320.00, changePercent: 0.75, volume: 1800000 },
  { symbol: 'SBUX', name: '星巴克 (Starbucks)', sector: '可选消费', price: 97.40, changePercent: -0.32, volume: 8800000 },
  { symbol: 'ABNB', name: '爱彼迎 (Airbnb)', sector: '可选消费', price: 135.60, changePercent: 1.15, volume: 6400000 },
  { symbol: 'MELI', name: '美客多 (MercadoLibre)', sector: '可选消费', price: 2045.00, changePercent: 1.95, volume: 1200000 },
  { symbol: 'LULU', name: '露露乐蒙 (Lululemon)', sector: '可选消费', price: 312.40, changePercent: -1.10, volume: 3200000 },
  { symbol: 'ORLY', name: '奥莱利汽车 (O\'Reilly)', sector: '可选消费', price: 1180.00, changePercent: 0.35, volume: 1100000 },
  { symbol: 'MAR', name: '万豪国际 (Marriott)', sector: '可选消费', price: 258.40, changePercent: 0.82, volume: 2400000 },

  // 医疗保健
  { symbol: 'ISRG', name: '直觉外科 (Intuitive)', sector: '医疗保健', price: 512.30, changePercent: 2.10, volume: 4200000 },
  { symbol: 'AMGN', name: '安进 (Amgen)', sector: '医疗保健', price: 315.60, changePercent: -0.45, volume: 5100000 },
  { symbol: 'GILD', name: '吉利德科学 (Gilead)', sector: '医疗保健', price: 86.40, changePercent: 0.65, volume: 7800000 },
  { symbol: 'VRTX', name: '福泰制药 (Vertex)', sector: '医疗保健', price: 468.20, changePercent: 0.88, volume: 3100000 },
  { symbol: 'REGN', name: '再生元 (Regeneron)', sector: '医疗保健', price: 985.40, changePercent: -0.72, volume: 1800000 },
  { symbol: 'IDXX', name: '爱德士生物 (IDEXX)', sector: '医疗保健', price: 420.50, changePercent: 0.40, volume: 1500000 },
  { symbol: 'DXCM', name: '德康医疗 (DexCom)', sector: '医疗保健', price: 74.80, changePercent: -1.65, volume: 4800000 },

  // 必需消费
  { symbol: 'PEP', name: '百事可乐 (PepsiCo)', sector: '必需消费', price: 172.50, changePercent: 0.18, volume: 7200000 },
  { symbol: 'MDLZ', name: '亿滋国际 (Mondelez)', sector: '必需消费', price: 68.20, changePercent: -0.28, volume: 8500000 },
  { symbol: 'KDP', name: 'Keurig Dr Pepper', sector: '必需消费', price: 36.40, changePercent: 0.15, volume: 9200000 },

  // 工业与公用
  { symbol: 'HON', name: '霍尼韦尔 (Honeywell)', sector: '工业', price: 208.40, changePercent: 0.35, volume: 5400000 },
  { symbol: 'ADP', name: '自动数据处理 (ADP)', sector: '工业', price: 288.60, changePercent: 0.52, volume: 3200000 },
  { symbol: 'CSX', name: 'CSX 运输', sector: '工业', price: 34.50, changePercent: -0.42, volume: 11000000 },
  { symbol: 'PCAR', name: '帕卡汽车 (PACCAR)', sector: '工业', price: 104.20, changePercent: 0.85, volume: 3100000 },
  { symbol: 'CEG', name: '星座能源 (Constellation)', sector: '公用事业', price: 268.40, changePercent: 3.40, volume: 6800000 },
  { symbol: 'XEL', name: '埃克西尔能源 (Xcel)', sector: '公用事业', price: 62.80, changePercent: 0.22, volume: 4500000 }
];

export const SP500_STOCKS = [
  // 科技
  { symbol: 'NVDA', name: '英伟达 (NVIDIA)', sector: '科技', price: 142.80, changePercent: 2.15, volume: 48000000 },
  { symbol: 'AAPL', name: '苹果 (Apple)', sector: '科技', price: 231.40, changePercent: -0.14, volume: 38000000 },
  { symbol: 'MSFT', name: '微软 (Microsoft)', sector: '科技', price: 428.15, changePercent: 0.66, volume: 22000000 },
  { symbol: 'AVGO', name: '博通 (Broadcom)', sector: '科技', price: 178.60, changePercent: -0.48, volume: 16000000 },
  { symbol: 'AMD', name: '超微半导体 (AMD)', sector: '科技', price: 156.30, changePercent: 1.74, volume: 26000000 },
  { symbol: 'ORCL', name: '甲骨文 (Oracle)', sector: '科技', price: 176.20, changePercent: 1.45, volume: 14000000 },
  { symbol: 'CRM', name: '赛富时 (Salesforce)', sector: '科技', price: 288.40, changePercent: 0.35, volume: 8200000 },
  { symbol: 'CSCO', name: '思科 (Cisco)', sector: '科技', price: 56.40, changePercent: 0.42, volume: 18000000 },
  { symbol: 'IBM', name: '国际商业机器 (IBM)', sector: '科技', price: 232.50, changePercent: 1.15, volume: 6200000 },
  { symbol: 'ACN', name: '埃森哲 (Accenture)', sector: '科技', price: 368.20, changePercent: -0.38, volume: 4100000 },

  // 金融
  { symbol: 'JPM', name: '摩根大通 (JPMorgan)', sector: '金融', price: 224.50, changePercent: 0.85, volume: 16000000 },
  { symbol: 'V', name: '维萨 (Visa)', sector: '金融', price: 284.20, changePercent: 0.28, volume: 9500000 },
  { symbol: 'MA', name: '万事达卡 (Mastercard)', sector: '金融', price: 508.60, changePercent: 0.45, volume: 5200000 },
  { symbol: 'BAC', name: '美国银行 (BofA)', sector: '金融', price: 42.80, changePercent: -0.35, volume: 32000000 },
  { symbol: 'WFC', name: '富国银行 (Wells Fargo)', sector: '金融', price: 65.40, changePercent: 0.62, volume: 14000000 },
  { symbol: 'GS', name: '高盛集团 (Goldman Sachs)', sector: '金融', price: 524.80, changePercent: 1.12, volume: 4500000 },
  { symbol: 'MS', name: '摩根士丹利 (Morgan Stanley)', sector: '金融', price: 118.20, changePercent: 0.75, volume: 8100000 },
  { symbol: 'BLK', name: '贝莱德 (BlackRock)', sector: '金融', price: 985.60, changePercent: 0.92, volume: 1800000 },
  { symbol: 'AXP', name: '美国运通 (Amex)', sector: '金融', price: 274.50, changePercent: 0.55, volume: 4200000 },
  { symbol: 'PGR', name: '前进保险 (Progressive)', sector: '金融', price: 254.10, changePercent: 1.35, volume: 3200000 },

  // 医疗保健
  { symbol: 'LLY', name: '礼来制药 (Eli Lilly)', sector: '医疗保健', price: 912.40, changePercent: 1.65, volume: 6500000 },
  { symbol: 'UNH', name: '联合健康 (UnitedHealth)', sector: '医疗保健', price: 588.20, changePercent: -0.85, volume: 7200000 },
  { symbol: 'JNJ', name: '强生 (Johnson & Johnson)', sector: '医疗保健', price: 162.80, changePercent: -0.25, volume: 11000000 },
  { symbol: 'ABBV', name: '艾伯维 (AbbVie)', sector: '医疗保健', price: 188.50, changePercent: 0.45, volume: 8500000 },
  { symbol: 'MRK', name: '默克制药 (Merck)', sector: '医疗保健', price: 106.40, changePercent: -0.65, volume: 9800000 },
  { symbol: 'TMO', name: '赛默飞世尔 (Thermo Fisher)', sector: '医疗保健', price: 548.20, changePercent: 0.35, volume: 2800000 },
  { symbol: 'ABT', name: '雅培 (Abbott Labs)', sector: '医疗保健', price: 116.50, changePercent: 0.15, volume: 7500000 },
  { symbol: 'PFE', name: '辉瑞 (Pfizer)', sector: '医疗保健', price: 28.60, changePercent: -0.45, volume: 28000000 },

  // 可选消费
  { symbol: 'AMZN', name: '亚马逊 (Amazon)', sector: '可选消费', price: 186.40, changePercent: -0.95, volume: 32000000 },
  { symbol: 'TSLA', name: '特斯拉 (Tesla)', sector: '可选消费', price: 218.50, changePercent: -0.63, volume: 45000000 },
  { symbol: 'HD', name: '家得宝 (Home Depot)', sector: '可选消费', price: 405.80, changePercent: 0.45, volume: 6500000 },
  { symbol: 'MCD', name: '麦当劳 (McDonald\'s)', sector: '可选消费', price: 298.40, changePercent: -0.15, volume: 4800000 },
  { symbol: 'NKE', name: '耐克 (Nike)', sector: '可选消费', price: 81.20, changePercent: -1.45, volume: 12000000 },
  { symbol: 'LOW', name: '劳氏 (Lowe\'s)', sector: '可选消费', price: 268.50, changePercent: 0.55, volume: 3800000 },
  { symbol: 'TJX', name: 'TJX Companies', sector: '可选消费', price: 118.40, changePercent: 0.72, volume: 5500000 },

  // 必需消费
  { symbol: 'WMT', name: '沃尔玛 (Walmart)', sector: '必需消费', price: 82.50, changePercent: 0.38, volume: 18000000 },
  { symbol: 'PG', name: '宝洁 (Procter & Gamble)', sector: '必需消费', price: 171.20, changePercent: -0.18, volume: 9500000 },
  { symbol: 'COST', name: '好市多 (Costco)', sector: '必需消费', price: 898.20, changePercent: 0.48, volume: 5500000 },
  { symbol: 'KO', name: '可口可乐 (Coca-Cola)', sector: '必需消费', price: 68.40, changePercent: 0.12, volume: 15000000 },
  { symbol: 'PEP', name: '百事可乐 (PepsiCo)', sector: '必需消费', price: 172.50, changePercent: 0.18, volume: 7200000 },
  { symbol: 'PM', name: '菲利普莫里斯 (Philip Morris)', sector: '必需消费', price: 128.60, changePercent: 1.25, volume: 6200000 },
  { symbol: 'CL', name: '高露洁 (Colgate-Palmolive)', sector: '必需消费', price: 102.40, changePercent: 0.25, volume: 5100000 },

  // 能源
  { symbol: 'XOM', name: '埃克森美孚 (ExxonMobil)', sector: '能源', price: 121.80, changePercent: 1.85, volume: 22000000 },
  { symbol: 'CVX', name: '雪佛龙 (Chevron)', sector: '能源', price: 154.20, changePercent: 1.45, volume: 12000000 },
  { symbol: 'COP', name: '康菲石油 (ConocoPhillips)', sector: '能源', price: 108.60, changePercent: 1.62, volume: 8500000 },
  { symbol: 'SLB', name: '斯伦贝谢 (SLB)', sector: '能源', price: 43.80, changePercent: 2.10, volume: 11000000 },
  { symbol: 'EOG', name: 'EOG 资源', sector: '能源', price: 128.50, changePercent: 1.35, volume: 5400000 },

  // 工业
  { symbol: 'CAT', name: '卡特彼勒 (Caterpillar)', sector: '工业', price: 388.40, changePercent: -0.75, volume: 5800000 },
  { symbol: 'GE', name: '通用电气航天 (GE Aerospace)', sector: '工业', price: 188.50, changePercent: 1.25, volume: 8200000 },
  { symbol: 'UNP', name: '联合太平洋 (Union Pacific)', sector: '工业', price: 238.60, changePercent: 0.15, volume: 4100000 },
  { symbol: 'RTX', name: '雷神科技 (RTX Corp)', sector: '工业', price: 124.20, changePercent: 0.82, volume: 6800000 },
  { symbol: 'BA', name: '波音 (Boeing)', sector: '工业', price: 156.40, changePercent: -1.85, volume: 14000000 },
  { symbol: 'DE', name: '迪尔股份 (Deere & Co)', sector: '工业', price: 412.50, changePercent: 0.45, volume: 2900000 },
  { symbol: 'HON', name: '霍尼韦尔 (Honeywell)', sector: '工业', price: 208.40, changePercent: 0.35, volume: 5400000 },

  // 通信服务
  { symbol: 'GOOGL', name: 'Alphabet A', sector: '通信服务', price: 168.20, changePercent: -1.24, volume: 28000000 },
  { symbol: 'META', name: 'Meta Platforms', sector: '通信服务', price: 588.60, changePercent: -0.96, volume: 18000000 },
  { symbol: 'NFLX', name: 'Netflix', sector: '通信服务', price: 742.30, changePercent: 1.85, volume: 9500000 },
  { symbol: 'DIS', name: '迪士尼 (Walt Disney)', sector: '通信服务', price: 96.50, changePercent: 0.45, volume: 11000000 },
  { symbol: 'VZ', name: '威瑞森电信 (Verizon)', sector: '通信服务', price: 43.80, changePercent: -0.25, volume: 21000000 },
  { symbol: 'T', name: 'AT&T', sector: '通信服务', price: 21.60, changePercent: 0.35, volume: 29000000 },

  // 公用事业
  { symbol: 'NEE', name: '新纪元能源 (NextEra Energy)', sector: '公用事业', price: 82.40, changePercent: 0.55, volume: 12000000 },
  { symbol: 'SO', name: '南方电力 (Southern Co)', sector: '公用事业', price: 91.20, changePercent: 0.25, volume: 6200000 },
  { symbol: 'DUK', name: '杜克能源 (Duke Energy)', sector: '公用事业', price: 115.60, changePercent: 0.18, volume: 5100000 },
  { symbol: 'CEG', name: '星座能源 (Constellation)', sector: '公用事业', price: 268.40, changePercent: 3.40, volume: 6800000 },

  // 原材料
  { symbol: 'LIN', name: '林德气体 (Linde)', sector: '原材料', price: 462.50, changePercent: -0.32, volume: 2800000 },
  { symbol: 'SHW', name: '宣伟涂料 (Sherwin-Williams)', sector: '原材料', price: 378.20, changePercent: 0.65, volume: 2100000 },
  { symbol: 'FCX', name: '自由港麦克莫兰 (Freeport-McMoRan)', sector: '原材料', price: 47.80, changePercent: 1.85, volume: 16000000 },

  // 房地产
  { symbol: 'PLD', name: '安博 (Prologis)', sector: '房地产', price: 124.60, changePercent: 0.15, volume: 4800000 },
  { symbol: 'AMT', name: '美洲电塔 (American Tower)', sector: '房地产', price: 222.80, changePercent: -0.45, volume: 3200000 },
  { symbol: 'EQIX', name: '易昆尼克斯 (Equinix)', sector: '房地产', price: 885.20, changePercent: 0.85, volume: 1400000 }
];
