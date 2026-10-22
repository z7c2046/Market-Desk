import test from 'node:test';
import assert from 'node:assert/strict';
import { WatchlistManager, STORAGE_KEY_V1, STORAGE_KEY_V2, MAX_UNIQUE_SYMBOLS } from '../public/watchlist-model.js';

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
  assert.equal(groups.length, 5); // default, tech, defensive, pharma, etf
  const defaultGroup = manager.getGroup('default');
  assert.deepEqual(defaultGroup.symbolIds, ['AAPL', 'TSLA', 'NVDA']);

  // v1 key is preserved in storage
  assert.ok(storage.getItem(STORAGE_KEY_V1));
  // v2 key is created
  assert.ok(storage.getItem(STORAGE_KEY_V2));
});

test('WatchlistManager: 30 unique symbols limit enforced, multiple groups permitted', () => {
  const storage = new MockStorage();
  const manager = new WatchlistManager({ storage });
  // Clear initial 5 symbols for exact limit testing
  manager.getGroup('default').symbolIds = [];
  manager.save();

  // Add 30 symbols to default group
  for (let i = 1; i <= 30; i++) {
    const res = manager.addSymbol(`SYM${i}`, 'default');
    assert.ok(res.ok, `Should add SYM${i}`);
  }
  assert.equal(manager.getAllUniqueSymbols().length, 30);

  // Adding 31st unique symbol fails
  const res31 = manager.addSymbol('SYM31', 'default');
  assert.equal(res31.ok, false);
  assert.match(res31.error, /已达上限/);

  // But adding an ALREADY EXISTING symbol to another group (e.g. 'tech') succeeds!
  const resTech = manager.addSymbol('SYM1', 'tech');
  assert.equal(resTech.ok, true);
  assert.equal(manager.getAllUniqueSymbols().length, 30);
  assert.ok(manager.getGroup('tech').symbolIds.includes('SYM1'));
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
