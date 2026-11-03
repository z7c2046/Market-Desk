import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPhone,
  isCompact,
  getRecentSymbols,
  addRecentSymbol,
  clearRecentSymbols,
  createHistoryState,
  captureViewState,
  getViewState,
  clearViewState
} from '../public/mobile-workspace.js';

function createMockStorage() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear()
  };
}

test('Mobile Workspace: Breakpoints are correctly evaluated', () => {
  assert.equal(isPhone(375), true);
  assert.equal(isPhone(767), true);
  assert.equal(isPhone(768), false);
  assert.equal(isPhone(1024), false);

  assert.equal(isCompact(375), true);
  assert.equal(isCompact(768), true);
  assert.equal(isCompact(1023), true);
  assert.equal(isCompact(1024), false);
  assert.equal(isCompact(1440), false);
});

test('Mobile Workspace: Recent symbols handles add, deduplicate, limit, and clear', () => {
  const storage = createMockStorage();

  assert.deepEqual(getRecentSymbols(storage), []);

  addRecentSymbol('AAPL', storage);
  assert.deepEqual(getRecentSymbols(storage), ['AAPL']);

  addRecentSymbol('NVDA', storage);
  assert.deepEqual(getRecentSymbols(storage), ['NVDA', 'AAPL']);

  // Deduplication: pushing AAPL again brings it to the front
  addRecentSymbol('AAPL', storage);
  assert.deepEqual(getRecentSymbols(storage), ['AAPL', 'NVDA']);

  // Pushing 12 symbols should cap at 10
  const symbols = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12'];
  for (const s of symbols) {
    addRecentSymbol(s, storage);
  }
  const result = getRecentSymbols(storage);
  assert.equal(result.length, 10);
  assert.equal(result[0], 'S12');

  // Clear
  clearRecentSymbols(storage);
  assert.deepEqual(getRecentSymbols(storage), []);
});

test('Mobile Workspace: createHistoryState builds valid market-desk state', () => {
  const state = createHistoryState({
    page: 'chart',
    symbol: 'TSLA',
    sourcePage: 'watchlist',
    overlay: null
  });

  assert.deepEqual(state, {
    owner: 'market-desk',
    version: 1,
    page: 'chart',
    symbol: 'TSLA',
    sourcePage: 'watchlist',
    overlay: null
  });
});

test('Mobile Workspace: View state cache stores and restores entry state', () => {
  clearViewState();

  captureViewState('watchlist', { scrollY: 350, group: 'tech' });
  assert.deepEqual(getViewState('watchlist')?.scrollY, 350);
  assert.deepEqual(getViewState('watchlist')?.group, 'tech');

  // Partial update
  captureViewState('watchlist', { scrollY: 500 });
  assert.deepEqual(getViewState('watchlist')?.scrollY, 500);
  assert.deepEqual(getViewState('watchlist')?.group, 'tech');

  clearViewState('watchlist');
  assert.equal(getViewState('watchlist'), null);
});
