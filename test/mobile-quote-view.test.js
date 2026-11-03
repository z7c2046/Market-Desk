import test from 'node:test';
import assert from 'node:assert/strict';
import { toMobileQuoteView, formatSessionLabel } from '../public/mobile-quote-view.js';

test('Mobile Quote View: Formats session labels correctly', () => {
  assert.equal(formatSessionLabel('pre'), '盘前');
  assert.equal(formatSessionLabel('regular'), '常规');
  assert.equal(formatSessionLabel('post'), '盘后');
  assert.equal(formatSessionLabel('overnight'), '隔夜');
  assert.equal(formatSessionLabel('custom'), 'custom');
  assert.equal(formatSessionLabel(null), null);
});

test('Mobile Quote View: Consistent regular session quote projection', () => {
  const row = { symbol: 'AAPL', name: 'Apple Inc.' };
  const quotes = {
    AAPL: {
      regularPrice: 220.5,
      regularChangePercent: 1.85,
      sourceTime: '16:00:00 EST',
      receivedAt: '2026-11-03T20:00:00Z'
    }
  };

  const view = toMobileQuoteView(row, { quotes, session: 'regular' });
  assert.equal(view.symbol, 'AAPL');
  assert.equal(view.name, 'Apple Inc.');
  assert.equal(view.price, 220.5);
  assert.equal(view.changePercent, 1.85);
  assert.equal(view.displayedSession, '常规');
  assert.equal(view.sourceTime, '16:00:00 EST');
  assert.equal(view.status, 'available');
  assert.deepEqual(view.referenceRegular, { price: 220.5, changePercent: 1.85 });
});

test('Mobile Quote View: Extended session quote projection when ext quote exists', () => {
  const row = { symbol: 'NVDA', name: 'NVIDIA' };
  const quotes = {
    NVDA: {
      regularPrice: 140.0,
      regularChangePercent: -0.5,
      ext: {
        price: 145.2,
        changePercent: 3.71,
        session: 'pre',
        sourceTime: '08:30:00 EST'
      }
    }
  };

  const view = toMobileQuoteView(row, { quotes, session: 'pre' });
  assert.equal(view.price, 145.2);
  assert.equal(view.changePercent, 3.71);
  assert.equal(view.displayedSession, '盘前');
  assert.equal(view.sourceTime, '08:30:00 EST');
  assert.equal(view.status, 'available');
  assert.deepEqual(view.referenceRegular, { price: 140.0, changePercent: -0.5 });
});

test('Mobile Quote View: Hard rule - missing ext quote does NOT substitute regular price into primary quote', () => {
  const row = { symbol: 'MSFT', name: 'Microsoft' };
  const quotes = {
    MSFT: {
      regularPrice: 420.0,
      regularChangePercent: 0.8,
      ext: null // No pre-market quote!
    }
  };

  const view = toMobileQuoteView(row, { quotes, session: 'pre' });
  assert.equal(view.price, null, 'Primary price must be null when pre-market quote is missing');
  assert.equal(view.changePercent, null);
  assert.equal(view.displayedSession, '盘前');
  assert.equal(view.status, 'missing');
  assert.deepEqual(view.referenceRegular, { price: 420.0, changePercent: 0.8 }, 'Regular price stays in referenceRegular');
});

test('Mobile Quote View: Valid zero price is preserved and not treated as missing', () => {
  const row = { symbol: 'ZERO', name: 'Zero Stock' };
  const quotes = {
    ZERO: {
      regularPrice: 0,
      regularChangePercent: 0,
      sourceTime: '16:00:00'
    }
  };

  const view = toMobileQuoteView(row, { quotes, session: 'regular' });
  assert.strictEqual(view.price, 0);
  assert.strictEqual(view.changePercent, 0);
  assert.equal(view.status, 'available');
});

test('Mobile Quote View: Detects delayed and stale statuses', () => {
  const delayedRow = { symbol: 'DLY', name: 'Delayed' };
  const delayedQuotes = {
    DLY: {
      regularPrice: 50.0,
      regularChangePercent: -1.2,
      isDelayed: true
    }
  };
  const dlyView = toMobileQuoteView(delayedRow, { quotes: delayedQuotes, session: 'regular' });
  assert.equal(dlyView.status, 'delayed');

  const staleRow = { symbol: 'STL', name: 'Stale' };
  const staleQuotes = {
    STL: {
      regularPrice: 60.0,
      regularChangePercent: 0.5,
      isStale: true
    }
  };
  const stlView = toMobileQuoteView(staleRow, { quotes: staleQuotes, session: 'regular' });
  assert.equal(stlView.status, 'stale');
});
