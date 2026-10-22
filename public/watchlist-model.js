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
  SOXL: '三倍做多半导体'
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
    id: 'default',
    name: '未分组',
    collapsed: false,
    order: 5,
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
        compactPanelOpen: true
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
      compactPanelOpen: true
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
              const sanitized = this.sanitizeData(parsed);
              this.save(sanitized);
              return sanitized;
            }
          }
          return this.sanitizeData(parsed);
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
        compactPanelOpen: parsed.preferences?.compactPanelOpen !== false
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
