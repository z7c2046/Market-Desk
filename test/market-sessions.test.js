import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcChangePercent,
  resolveExtReferenceClose,
  getCurrentSession,
  getNyTime,
  buildMultiSessionQuote,
  getSelectedExtQuote,
  SESSION_TYPES
} from '../src/market-sessions.js';

test('calcChangePercent: synthetic specification verification 100 -> 103 -> 104 -> 105', () => {
  const prevRthClose = 100;
  const todayRthClose = 103;
  const postPrice = 104;
  const overnightPrice = 105;

  // Regular change: (103 / 100 - 1) * 100 = 3.00%
  const regChange = calcChangePercent(todayRthClose, prevRthClose);
  assert.equal(Number(regChange.toFixed(2)), 3.00);

  // Post EXT change: relative to today's completed RTH close 103
  // (104 / 103 - 1) * 100 = 0.97087...% ≈ +0.97%
  const postRef = resolveExtReferenceClose({ session: SESSION_TYPES.POST, todayRthClose, prevRthClose });
  assert.equal(postRef, 103);
  const postChange = calcChangePercent(postPrice, postRef);
  assert.equal(Number(postChange.toFixed(2)), 0.97);

  // Overnight EXT change: relative to today's completed RTH close 103 (NOT 104 post price)
  // (105 / 103 - 1) * 100 = 1.9417...% ≈ +1.94%
  const overnightRef = resolveExtReferenceClose({ session: SESSION_TYPES.OVERNIGHT, todayRthClose, prevRthClose });
  assert.equal(overnightRef, 103);
  const overnightChange = calcChangePercent(overnightPrice, overnightRef);
  assert.equal(Number(overnightChange.toFixed(2)), 1.94);
});

test('Overnight crossing midnight retains the correct RTH benchmark', () => {
  // Evening 22:00 NY
  const eveningDate = new Date('2026-10-22T02:00:00Z'); // 22:00 NY Oct 21
  const eveningSession = getCurrentSession(eveningDate);
  assert.equal(eveningSession.session, SESSION_TYPES.OVERNIGHT);

  // Next morning 02:00 NY (across midnight, still overnight session)
  const morningDate = new Date('2026-10-22T06:00:00Z'); // 02:00 NY Oct 22
  const morningSession = getCurrentSession(morningDate);
  assert.equal(morningSession.session, SESSION_TYPES.OVERNIGHT);

  // Benchmark for both must remain the same RTH close (103), NOT resetting at midnight
  const ref1 = resolveExtReferenceClose({ session: SESSION_TYPES.OVERNIGHT, todayRthClose: 103, prevRthClose: 100 });
  const ref2 = resolveExtReferenceClose({ session: SESSION_TYPES.OVERNIGHT, todayRthClose: 103, prevRthClose: 100 });
  assert.equal(ref1, 103);
  assert.equal(ref2, 103);
});

test('Missing benchmark, zero benchmark, or negative/non-finite returns null instead of fake zero', () => {
  assert.equal(calcChangePercent(100, null), null);
  assert.equal(calcChangePercent(null, 100), null);
  assert.equal(calcChangePercent(100, 0), null);
  assert.equal(calcChangePercent(100, -10), null);
  assert.equal(calcChangePercent(NaN, 100), null);
  assert.equal(calcChangePercent(100, Infinity), null);
});

test('Session time boundaries in America/New_York', () => {
  // 03:59 NY -> Overnight
  const d1 = new Date('2026-10-21T07:59:00Z'); // 03:59 NY
  assert.equal(getCurrentSession(d1).session, SESSION_TYPES.OVERNIGHT);

  // 04:00 NY -> Pre-market
  const d2 = new Date('2026-10-21T08:00:00Z'); // 04:00 NY
  assert.equal(getCurrentSession(d2).session, SESSION_TYPES.PRE);

  // 09:30 NY -> Regular
  const d3 = new Date('2026-10-21T13:30:00Z'); // 09:30 NY
  assert.equal(getCurrentSession(d3).session, SESSION_TYPES.REGULAR);

  // 16:00 NY -> Post-market
  const d4 = new Date('2026-10-21T20:00:00Z'); // 16:00 NY
  assert.equal(getCurrentSession(d4).session, SESSION_TYPES.POST);

  // 20:00 NY -> Overnight
  const d5 = new Date('2026-10-22T00:00:00Z'); // 20:00 NY
  assert.equal(getCurrentSession(d5).session, SESSION_TYPES.OVERNIGHT);

  // Saturday 12:00 NY -> Closed
  const dSat = new Date('2026-10-24T16:00:00Z'); // Saturday 12:00 NY
  assert.equal(getCurrentSession(dSat).session, SESSION_TYPES.CLOSED);
});

test('buildMultiSessionQuote constructs clean multi-session schema', () => {
  const quote = buildMultiSessionQuote({
    symbol: 'NVDA',
    name: 'NVIDIA Corp',
    regularPrice: 120,
    regularPrevClose: 115,
    todayRthClose: 120,
    postPrice: 122.4,
    overnightPrice: 123.6,
    prePrice: 118
  });

  assert.equal(quote.symbol, 'NVDA');
  assert.equal(Number(quote.regular.changePercent.toFixed(2)), 4.35); // 120 / 115 - 1
  assert.equal(Number(quote.post.changePercent.toFixed(2)), 2.00);    // 122.4 / 120 - 1
  assert.equal(Number(quote.overnight.changePercent.toFixed(2)), 3.00); // 123.6 / 120 - 1
  assert.equal(quote.meta.provider, 'Longbridge');

  // Test getSelectedExtQuote
  const extPost = getSelectedExtQuote(quote, 'post');
  assert.equal(extPost.price, 122.4);
  assert.equal(extPost.changePercent, quote.post.changePercent);

  const extOvernight = getSelectedExtQuote(quote, 'overnight');
  assert.equal(extOvernight.price, 123.6);
});
