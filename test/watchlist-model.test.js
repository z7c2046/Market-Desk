import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WatchlistManager,
  sortWatchlistRows,
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
  MAX_UNIQUE_SYMBOLS,
  STOCK_MARKET_CAPS,
  getStockMarketCap,
  sortSymbolsByMarketCap
} from '../public/watchlist-model.js';

class MockStorage {
  constructor(init = {}) { this.store = new Map(Object.entries(init)); }
  getItem(k) { return this.store.get(k) ?? null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
}

test('WatchlistManager: migrations from v1 array and creates preset groups', () => {
  const storage = new MockStorage({
    [STORAGE_KEY_V1]: JSON.stringify(['AAPL', 'TSLA', 'NVDA'])
  });

  const manager = new WatchlistManager({ storage });
  const groups = manager.getGroups();
  assert.equal(groups.length, 7); // default, storage, chips, optics, datacenter, etf, trillion
  const defaultGroup = manager.getGroup('default');
  assert.deepEqual(defaultGroup.symbolIds, ['AAPL', 'TSLA', 'NVDA']);

  // v1 key is preserved in storage
  assert.ok(storage.getItem(STORAGE_KEY_V1));
  // v2 key is created
  assert.ok(storage.getItem(STORAGE_KEY_V2));
});

test('WatchlistManager: unique symbols limit enforced, multiple groups permitted', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager({ storage });
  // Clear initial symbols for exact limit testing
  for (const g of manager.getGroups()) g.symbolIds = [];
  manager.save();

  // Add MAX_UNIQUE_SYMBOLS symbols to default group
  for (let i = 1; i <= MAX_UNIQUE_SYMBOLS; i++) {
    const res = manager.addSymbol(`SYM${i}`, 'default');
    assert.ok(res.ok, `Should add SYM${i}`);
  }
  assert.equal(manager.getAllUniqueSymbols().length, MAX_UNIQUE_SYMBOLS);

  // Adding one more unique symbol fails
  const resOver = manager.addSymbol(`SYM${MAX_UNIQUE_SYMBOLS + 1}`, 'default');
  assert.equal(resOver.ok, false);
  assert.match(resOver.error, /已达上限/);

  // But adding an ALREADY EXISTING symbol to another group (e.g. 'chips') succeeds!
  const resChips = manager.addSymbol('SYM1', 'chips');
  assert.equal(resChips.ok, true);
  assert.equal(manager.getAllUniqueSymbols().length, MAX_UNIQUE_SYMBOLS);
  assert.ok(manager.getGroup('chips').symbolIds.includes('SYM1'));
});

test('WatchlistManager: deleteGroup moves orphaned symbols to default with one-step undo', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager({ storage });

  // Create a custom group
  const createRes = manager.createGroup('自定义组合');
  assert.ok(createRes.ok);
  const groupId = createRes.group.id;

  // Add a unique symbol to this group only
  const addRes = manager.addSymbol('UNQ', groupId);
  assert.ok(addRes.ok);
  assert.ok(manager.getGroup(groupId).symbolIds.includes('UNQ'));
  assert.ok(!manager.getGroup('default').symbolIds.includes('UNQ'));

  // Delete group
  const delRes = manager.deleteGroup(groupId);
  assert.ok(delRes.ok);
  assert.equal(delRes.movedSymbolsCount, 1);
  assert.ok(manager.getGroup('default').symbolIds.includes('UNQ'));
  assert.equal(manager.getGroup(groupId), undefined);

  // Undo delete
  const undoRes = manager.undoDeleteGroup();
  assert.ok(undoRes);
  assert.ok(manager.getGroup(groupId));
  assert.ok(manager.getGroup(groupId).symbolIds.includes('UNQ'));
  assert.ok(!manager.getGroup('default').symbolIds.includes('UNQ'));
});

test('WatchlistManager: deleteGroup transfers all group symbols directly to default', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager({ storage });

  const createRes = manager.createGroup('存储');
  assert.ok(createRes.ok);
  const groupId = createRes.group.id;

  manager.addSymbol('MU', groupId);
  manager.addSymbol('SNDK', groupId);
  manager.addSymbol('WDC', groupId);
  assert.equal(manager.getGroup(groupId).symbolIds.length, 3);

  const delRes = manager.deleteGroup(groupId);
  assert.ok(delRes.ok);
  const def = manager.getGroup('default');
  assert.ok(def.symbolIds.includes('MU'));
  assert.ok(def.symbolIds.includes('SNDK'));
  assert.ok(def.symbolIds.includes('WDC'));
});

test('WatchlistManager: JSON export and import validation', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager({ storage });
  manager.addSymbol('SPY', 'default');

  const jsonStr = manager.exportJson();
  assert.match(jsonStr, /"version": 2/);
  assert.match(jsonStr, /SPY/);

  // Import invalid JSON
  const invalidRes = manager.importJson('{ invalid }');
  assert.equal(invalidRes.ok, false);

  // Import non-v2 JSON
  const wrongVerRes = manager.importJson(JSON.stringify({ version: 1, groups: [] }));
  assert.equal(wrongVerRes.ok, false);

  // Import valid JSON
  const validRes = manager.importJson(jsonStr);
  assert.equal(validRes.ok, true);
});

test('sortWatchlistRows: unavailable values at end in both asc and desc; 0 handled correctly', async () => {
  const { sortWatchlistRows } = await import('../public/watchlist-model.js');
  const rows = [
    { symbol: 'C', extChange: null },
    { symbol: 'A', extChange: 5.5 },
    { symbol: 'D', extChange: undefined },
    { symbol: 'B', extChange: -2.1 },
    { symbol: 'E', extChange: 0 }
  ];

  // Descending: 5.5, 0, -2.1, then C and D at bottom
  const desc = sortWatchlistRows(rows, 'extChange', 'desc');
  assert.deepEqual(desc.map(r => r.symbol), ['A', 'E', 'B', 'C', 'D']);

  // Ascending: -2.1, 0, 5.5, then C and D at bottom
  const asc = sortWatchlistRows(rows, 'extChange', 'asc');
  assert.deepEqual(asc.map(r => r.symbol), ['B', 'E', 'A', 'C', 'D']);
});

test('isLeveragedEtf: identifies leveraged ETFs and preserves regular stocks and index ETFs', async () => {
  const { isLeveragedEtf } = await import('../public/watchlist-model.js');
  // Leveraged ETFs in watchlist and market
  assert.equal(isLeveragedEtf('SQQQ'), true);
  assert.equal(isLeveragedEtf('TQQQ'), true);
  assert.equal(isLeveragedEtf('SOXL'), true);
  assert.equal(isLeveragedEtf('YANG'), true);
  assert.equal(isLeveragedEtf('MUU'), true);
  assert.equal(isLeveragedEtf('07709.HK'), true);
  assert.equal(isLeveragedEtf('SNXX'), true);
  assert.equal(isLeveragedEtf('NVDL'), true);
  assert.equal(isLeveragedEtf('TSLL'), true);
  assert.equal(isLeveragedEtf('CUSTOM', '2倍做多半导体'), true);
  assert.equal(isLeveragedEtf('CUSTOM2', '3倍做空纳指'), true);

  // Regular operating stocks and 1x ETFs
  assert.equal(isLeveragedEtf('NVDA'), false);
  assert.equal(isLeveragedEtf('AAPL'), false);
  assert.equal(isLeveragedEtf('MU'), false);
  assert.equal(isLeveragedEtf('SOXX'), false);
  assert.equal(isLeveragedEtf('SPY'), false);
  assert.equal(isLeveragedEtf('QQQ'), false);
  assert.equal(isLeveragedEtf('XLK'), false);
});

test('WatchlistManager: toggleGroupCollapse toggles and persists collapsed state', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager({ storage });

  const storageGroup = manager.getGroup('storage');
  assert.equal(storageGroup.collapsed, false);

  manager.toggleGroupCollapse('storage');
  assert.equal(manager.getGroup('storage').collapsed, true);

  // Verifying persistence by re-instantiating
  const manager2 = new WatchlistManager({ storage });
  assert.equal(manager2.getGroup('storage').collapsed, true);

  manager2.toggleGroupCollapse('storage');
  assert.equal(manager2.getGroup('storage').collapsed, false);
});

test('sortWatchlistRows: sorts by symbol ascending and descending', () => {
  const rows = [
    { symbol: 'TSLA' },
    { symbol: 'AAPL' },
    { symbol: 'NVDA' },
    { symbol: 'AMD' }
  ];
  const asc = sortWatchlistRows(rows, 'symbol', 'asc');
  assert.deepEqual(asc.map(r => r.symbol), ['AAPL', 'AMD', 'NVDA', 'TSLA']);

  const desc = sortWatchlistRows(rows, 'symbol', 'desc');
  assert.deepEqual(desc.map(r => r.symbol), ['TSLA', 'NVDA', 'AMD', 'AAPL']);
});

test('WatchlistManager: moveSymbolWithinGroup reorders symbols within group', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager({ storage });
  const storageGroup = manager.getGroup('storage');
  // Initial storage: ['NTAP', 'MU', 'SKHY', 'WDC', 'P', 'SNDK', 'KXIAY', 'STX']
  assert.equal(storageGroup.symbolIds[6], 'KXIAY');

  // Drag KXIAY before NTAP
  const res = manager.moveSymbolWithinGroup('storage', 'KXIAY', 'NTAP', 'before');
  assert.ok(res);
  assert.equal(manager.getGroup('storage').symbolIds[0], 'KXIAY');
  assert.equal(manager.getGroup('storage').symbolIds[1], 'NTAP');

  // Drag KXIAY after MU
  manager.moveSymbolWithinGroup('storage', 'KXIAY', 'MU', 'after');
  assert.equal(manager.getGroup('storage').symbolIds[0], 'NTAP');
  assert.equal(manager.getGroup('storage').symbolIds[1], 'MU');
  assert.equal(manager.getGroup('storage').symbolIds[2], 'KXIAY');
});

test('WatchlistManager: moveSymbolBetweenGroups moves symbol across groups with auto-expansion', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager({ storage });
  
  // Collapse chips group to test auto-expansion
  manager.getGroup('chips').collapsed = true;
  assert.ok(manager.getGroup('storage').symbolIds.includes('KXIAY'));
  assert.ok(!manager.getGroup('chips').symbolIds.includes('KXIAY'));

  // Drag KXIAY from storage to chips before NVDA
  const res = manager.moveSymbolBetweenGroups('storage', 'chips', 'KXIAY', 'NVDA', 'before');
  assert.ok(res);
  assert.ok(!manager.getGroup('storage').symbolIds.includes('KXIAY'));
  assert.equal(manager.getGroup('chips').symbolIds[0], 'KXIAY');
  assert.equal(manager.getGroup('chips').symbolIds[1], 'NVDA');
  assert.equal(manager.getGroup('chips').collapsed, false); // auto-expanded
});

test('sortWatchlistRows: manual mode preserves exact array sequence', () => {
  const rows = [
    { symbol: 'KXIAY', regularPrice: 7.99 },
    { symbol: 'MU', regularPrice: 877.55 },
    { symbol: 'NTAP', regularPrice: 215.48 }
  ];
  const manual = sortWatchlistRows(rows, 'manual');
  assert.deepEqual(manual.map(r => r.symbol), ['KXIAY', 'MU', 'NTAP']);
});

test('WatchlistManager: moveGroup reorders groups before and after', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager(storage);
  const initialGroupIds = manager.getGroups().map(g => g.id);
  assert.ok(initialGroupIds.length >= 3);

  const firstId = initialGroupIds[0];
  const secondId = initialGroupIds[1];
  const thirdId = initialGroupIds[2];

  // Move third group before first group
  const res1 = manager.moveGroup(thirdId, firstId, 'before');
  assert.ok(res1.ok);
  assert.equal(manager.getGroups()[0].id, thirdId);

  // Move thirdId after secondId
  const res2 = manager.moveGroup(thirdId, secondId, 'after');
  assert.ok(res2.ok);
  const updatedIds = manager.getGroups().map(g => g.id);
  const idxThird = updatedIds.indexOf(thirdId);
  const idxSecond = updatedIds.indexOf(secondId);
  assert.equal(idxThird, idxSecond + 1);
});

test('WatchlistManager: moveGroupOrder swaps group up and down', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager(storage);
  const groups = manager.getGroups();
  const g0 = groups[0].id;
  const g1 = groups[1].id;

  // Move g0 down
  const resDown = manager.moveGroupOrder(g0, 'down');
  assert.ok(resDown.ok);
  assert.equal(manager.getGroups()[0].id, g1);
  assert.equal(manager.getGroups()[1].id, g0);

  // Move g0 up
  const resUp = manager.moveGroupOrder(g0, 'up');
  assert.ok(resUp.ok);
  assert.equal(manager.getGroups()[0].id, g0);
  assert.equal(manager.getGroups()[1].id, g1);
});

test('WatchlistManager: sortGroups sorts by name and avgChange', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager(storage);

  // Sort by name asc
  manager.sortGroups('name', 'asc');
  const names = manager.getGroups().filter(g => g.id !== 'default').map(g => g.name);
  for (let i = 1; i < names.length; i++) {
    assert.ok(names[i - 1].localeCompare(names[i], 'zh-CN') <= 0);
  }

  // Sort by avgChange desc
  const averagesMap = {
    storage: { avg: 2.5 },
    chips: { avg: 5.8 },
    datacenter: { avg: -1.2 },
    optics: { avg: 3.1 },
    etf: { avg: 0.5 },
    mega_cap: { avg: 1.0 },
    default: { avg: 0 }
  };
  manager.sortGroups('avgChange', 'desc', averagesMap);
  const topNonDefault = manager.getGroups()[0];
  assert.equal(topNonDefault.id, 'chips'); // 5.8 is highest
});

test('WatchlistManager: trillion group is sorted strictly descending by market cap', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager({ storage });
  const trillionGroup = manager.getGroup('trillion');
  assert.ok(trillionGroup, 'Trillion group should exist');
  
  const expectedOrder = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSM', 'BRK-B', 'TSLA', 'AVGO', 'LLY'];
  assert.deepEqual(trillionGroup.symbolIds, expectedOrder);

  // Check each symbol market cap is strictly descending
  for (let i = 1; i < trillionGroup.symbolIds.length; i++) {
    const prevCap = getStockMarketCap(trillionGroup.symbolIds[i - 1]).value;
    const currCap = getStockMarketCap(trillionGroup.symbolIds[i]).value;
    assert.ok(prevCap >= currCap, `${trillionGroup.symbolIds[i - 1]} (${prevCap}) should have higher or equal market cap than ${trillionGroup.symbolIds[i]} (${currCap})`);
  }
});

test('WatchlistManager: migrations re-sort pre-existing stored trillion group by market cap', () => {
  const legacyData = {
    version: 2,
    groups: [
      { id: 'trillion', name: '万亿市值', collapsed: false, order: 5, symbolIds: ['LLY', 'AVGO', 'NVDA', 'BRK-B', 'AAPL', 'TSLA'] }
    ],
    preferences: {}
  };
  const storage = new MockStorage({
    [STORAGE_KEY_V2]: JSON.stringify(legacyData)
  });

  const manager = new WatchlistManager({ storage });
  const trillionGroup = manager.getGroup('trillion');
  assert.deepEqual(trillionGroup.symbolIds, ['NVDA', 'AAPL', 'BRK-B', 'TSLA', 'AVGO', 'LLY']);
});

test('sortWatchlistRows: sorts by marketCap and marketCapNum descending and ascending', () => {
  const rows = [
    { symbol: 'TSLA', marketCapNum: 850000000000 },
    { symbol: 'NVDA', marketCapNum: 3520000000000 },
    { symbol: 'AAPL', marketCapNum: 3480000000000 },
    { symbol: 'UNKNOWN', marketCapNum: null }
  ];

  const desc = sortWatchlistRows(rows, 'marketCap', 'desc');
  assert.deepEqual(desc.map(r => r.symbol), ['NVDA', 'AAPL', 'TSLA', 'UNKNOWN']);

  const asc = sortWatchlistRows(rows, 'marketCap', 'asc');
  assert.deepEqual(asc.map(r => r.symbol), ['TSLA', 'AAPL', 'NVDA', 'UNKNOWN']);
});

test('sortWatchlistRows: sorts by regularChange descending and ascending (in-group 3-state sorting)', () => {
  const storageGroupRows = [
    { symbol: 'NTAP', regularChange: 1.40 },
    { symbol: 'MU', regularChange: 2.46 },
    { symbol: 'SKHY', regularChange: 4.05 },
    { symbol: 'WDC', regularChange: -2.97 },
    { symbol: 'P', regularChange: 1.76 },
    { symbol: 'SNDK', regularChange: -1.82 },
    { symbol: 'KXIAY', regularChange: 5.13 },
    { symbol: 'STX', regularChange: -1.81 },
    { symbol: 'NOCONTRACT', regularChange: null }
  ];

  // 1st click: 降序 (highest positive change first, nulls at bottom)
  const desc = sortWatchlistRows(storageGroupRows, 'regularChange', 'desc');
  assert.deepEqual(desc.map(r => r.symbol), [
    'KXIAY', 'SKHY', 'MU', 'P', 'NTAP', 'STX', 'SNDK', 'WDC', 'NOCONTRACT'
  ]);

  // 2nd click: 升序 (biggest loss / negative change first, nulls at bottom)
  const asc = sortWatchlistRows(storageGroupRows, 'regularChange', 'asc');
  assert.deepEqual(asc.map(r => r.symbol), [
    'WDC', 'SNDK', 'STX', 'NTAP', 'P', 'MU', 'SKHY', 'KXIAY', 'NOCONTRACT'
  ]);

  // 3rd click: 恢复默认顺序 (manual array order)
  const defaultOrder = sortWatchlistRows(storageGroupRows, 'manual');
  assert.deepEqual(defaultOrder.map(r => r.symbol), [
    'NTAP', 'MU', 'SKHY', 'WDC', 'P', 'SNDK', 'KXIAY', 'STX', 'NOCONTRACT'
  ]);
});

test('WatchlistManager: default group order can be manually reordered by drag-and-drop and persists', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager({ storage });
  const storageGroup = manager.getGroup('storage');
  assert.ok(storageGroup);

  // Original order starts with NTAP, MU, SKHY...
  assert.equal(storageGroup.symbolIds[0], 'NTAP');

  // Drag KXIAY to the top (before NTAP)
  manager.moveSymbolWithinGroup('storage', 'KXIAY', 'NTAP', 'before');
  assert.equal(manager.getGroup('storage').symbolIds[0], 'KXIAY');
  assert.equal(manager.getGroup('storage').symbolIds[1], 'NTAP');

  // Drag WDC to after MU
  manager.moveSymbolWithinGroup('storage', 'WDC', 'MU', 'after');
  const symbols = manager.getGroup('storage').symbolIds;
  const idxMU = symbols.indexOf('MU');
  const idxWDC = symbols.indexOf('WDC');
  assert.equal(idxWDC, idxMU + 1);
});




