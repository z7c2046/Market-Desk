import test from 'node:test';
import assert from 'node:assert/strict';
import { WatchlistManager, sortWatchlistRows, STORAGE_KEY_V1, STORAGE_KEY_V2, MAX_UNIQUE_SYMBOLS } from '../public/watchlist-model.js';

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
