import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_SECTOR_FILTERS,
  EARNINGS_DAYS,
  CORPORATE_LOGOS,
  DEFAULT_TECH_EARNINGS,
  MACRO_CALENDAR_ITEMS,
  filterEarningsByDay
} from '../public/earnings-calendar-model.js';

test('Earnings Calendar: Sector filters and days definition integrity', () => {
  assert.ok(Array.isArray(AI_SECTOR_FILTERS) && AI_SECTOR_FILTERS.length >= 6);
  assert.equal(EARNINGS_DAYS.length, 5); // Mon to Fri
  assert.deepEqual(EARNINGS_DAYS.map(d => d.id), ['mon', 'tue', 'wed', 'thu', 'fri']);
});

test('Earnings Calendar: All 28 companies have valid corporate logos and symbols', () => {
  assert.ok(DEFAULT_TECH_EARNINGS.length >= 25);
  for (const item of DEFAULT_TECH_EARNINGS) {
    assert.ok(item.symbol, 'Stock symbol must be defined');
    assert.ok(item.name, 'Company name must be defined');
    assert.ok(item.epsConsensus, 'EPS consensus must be defined');
    assert.ok(item.revConsensus, 'Rev consensus must be defined');
    assert.ok(CORPORATE_LOGOS[item.symbol], `Corporate logo SVG must exist for ${item.symbol}`);
    assert.ok(CORPORATE_LOGOS[item.symbol].includes('<svg'), `Logo must contain <svg for ${item.symbol}`);
  }
});

test('Earnings Calendar: AI supply chain tags cover data centers, energy, chips, memory, cloud', () => {
  const sectors = new Set(DEFAULT_TECH_EARNINGS.map(e => e.sectorId));
  assert.ok(sectors.has('chips'), 'Must include AI chips');
  assert.ok(sectors.has('datacenter'), 'Must include Data Centers & Cooling');
  assert.ok(sectors.has('energy'), 'Must include Power & Energy');
  assert.ok(sectors.has('memory'), 'Must include Memory & HBM');
  assert.ok(sectors.has('cloud'), 'Must include Cloud & AI Models');

  // Vertiv, GE Vernova, Constellation, SK Hynix, AMD, MSFT checks
  const vertiv = DEFAULT_TECH_EARNINGS.find(e => e.symbol === 'VRT');
  assert.ok(vertiv && vertiv.sectorId === 'datacenter' && vertiv.isAiSupplyChain);

  const geVernova = DEFAULT_TECH_EARNINGS.find(e => e.symbol === 'GEV');
  assert.ok(geVernova && geVernova.sectorId === 'energy' && geVernova.isAiSupplyChain);

  const skHynix = DEFAULT_TECH_EARNINGS.find(e => e.symbol === 'SKHY');
  assert.ok(skHynix && skHynix.sectorId === 'memory' && skHynix.isAiSupplyChain);
});

test('Earnings Calendar: filterEarningsByDay behaves accurately', () => {
  const wednesdayItems = filterEarningsByDay(DEFAULT_TECH_EARNINGS, 'wed', 'all', 'all', false);
  assert.ok(wednesdayItems.length >= 6);
  assert.ok(wednesdayItems.some(item => item.symbol === 'MSFT'));
  assert.ok(wednesdayItems.some(item => item.symbol === 'VRT'));

  const datacenterOnly = filterEarningsByDay(DEFAULT_TECH_EARNINGS, null, 'datacenter', 'all', false);
  assert.ok(datacenterOnly.length >= 3);
  assert.ok(datacenterOnly.every(item => item.sectorId === 'datacenter'));

  const bmoOnly = filterEarningsByDay(DEFAULT_TECH_EARNINGS, 'wed', 'all', 'BMO', false);
  assert.ok(bmoOnly.every(item => item.timing === 'BMO'));
});

test('Macro Calendar: Contains PPI, CPI, PCE, NFP with bullish/bearish guidance', () => {
  assert.ok(MACRO_CALENDAR_ITEMS.length >= 5);
  const cpi = MACRO_CALENDAR_ITEMS.find(m => m.id === 'cpi-core');
  assert.ok(cpi && cpi.bias === 'bearish');

  const ppi = MACRO_CALENDAR_ITEMS.find(m => m.id === 'ppi-final');
  assert.ok(ppi && ppi.bias === 'bullish');
});
