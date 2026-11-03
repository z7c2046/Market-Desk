import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_SECTOR_FILTERS,
  EARNINGS_DAYS,
  CORPORATE_LOGOS,
  DEFAULT_TECH_EARNINGS,
  CURRENT_WEEK_EARNINGS,
  EARNINGS_WEEKS,
  CURRENT_WEEK_DAYS,
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

test('Earnings Calendar: Current week (11/02 - 11/06) integrity, logos and today marker', () => {
  assert.ok(Array.isArray(CURRENT_WEEK_EARNINGS) && CURRENT_WEEK_EARNINGS.length >= 20);
  for (const item of CURRENT_WEEK_EARNINGS) {
    assert.ok(item.symbol, 'Stock symbol must be defined');
    assert.ok(item.name, 'Company name must be defined');
    assert.ok(item.epsConsensus, 'EPS consensus must be defined');
    assert.ok(item.revConsensus, 'Rev consensus must be defined');
    assert.ok(CORPORATE_LOGOS[item.symbol], `Corporate logo SVG must exist for ${item.symbol}`);
    assert.ok(CORPORATE_LOGOS[item.symbol].includes('<svg'), `Logo must contain <svg for ${item.symbol}`);
  }

  // Key stock symbols check for current week
  const symbols = new Set(CURRENT_WEEK_EARNINGS.map(e => e.symbol));
  assert.ok(symbols.has('PLTR'), 'Current week must include Palantir');
  assert.ok(symbols.has('QCOM'), 'Current week must include Qualcomm');
  assert.ok(symbols.has('ARM'), 'Current week must include ARM Holdings');
  assert.ok(symbols.has('SMCI'), 'Current week must include Super Micro');
  assert.ok(symbols.has('ANET'), 'Current week must include Arista Networks');
  assert.ok(symbols.has('DDOG'), 'Current week must include Datadog');
  assert.ok(symbols.has('NET'), 'Current week must include Cloudflare');

  // Multi-week switcher definition check
  assert.ok(EARNINGS_WEEKS.current, 'EARNINGS_WEEKS must have current week');
  assert.ok(EARNINGS_WEEKS.prev, 'EARNINGS_WEEKS must have previous week');
  assert.ok(EARNINGS_WEEKS.next, 'EARNINGS_WEEKS must have next week');

  // Today marker check on Tuesday Nov 3
  const tue = CURRENT_WEEK_DAYS.find(d => d.id === 'tue');
  assert.ok(tue && tue.isToday === true, 'Tuesday Nov 3 must be marked as isToday');
});

test('Earnings Calendar: 3D Flip Card metrics, glowing corner masks (beat/miss/pending) and sub-column separation', () => {
  // Test both current week and previous week datasets
  const allDatasets = [CURRENT_WEEK_EARNINGS, DEFAULT_TECH_EARNINGS];
  
  for (const dataset of allDatasets) {
    for (const item of dataset) {
      assert.ok(['beat', 'miss', 'pending'].includes(item.reportStatus), `reportStatus must be beat, miss, or pending for ${item.symbol}`);
      assert.ok(item.statusBadgeText, `statusBadgeText must be present for ${item.symbol}`);
      assert.ok(item.epsConsensus, `epsConsensus must exist for ${item.symbol}`);
      assert.ok(item.revConsensus, `revConsensus must exist for ${item.symbol}`);
      assert.ok(CORPORATE_LOGOS[item.symbol], `Corporate SVG logo must exist for ${item.symbol}`);
      
      // If reported (beat or miss), must contain actual figures and QoQ/YoY
      if (item.reportStatus === 'beat' || item.reportStatus === 'miss') {
        assert.ok(item.epsActual, `Reported stock ${item.symbol} must have epsActual`);
        assert.ok(item.revActual, `Reported stock ${item.symbol} must have revActual`);
        assert.ok(item.revQoq, `Reported stock ${item.symbol} must have revQoq`);
      }
    }
  }

  // Check sub-column separation: BMO and AMC filtering
  const monBmo = CURRENT_WEEK_EARNINGS.filter(e => e.day === 'mon' && e.timing === 'BMO');
  const monAmc = CURRENT_WEEK_EARNINGS.filter(e => e.day === 'mon' && e.timing === 'AMC');
  assert.strictEqual(Array.isArray(monBmo), true);
  assert.ok(monAmc.length > 0, 'Monday AMC must have items like PLTR');
  assert.ok(monAmc.some(e => e.symbol === 'PLTR' && e.reportStatus === 'beat'), 'PLTR on Monday AMC must be beat');
  
  // Verify AMD and INTC are marked as 'miss' (爆雷/承压)
  const amd = DEFAULT_TECH_EARNINGS.find(e => e.symbol === 'AMD');
  const intc = DEFAULT_TECH_EARNINGS.find(e => e.symbol === 'INTC');
  assert.strictEqual(amd?.reportStatus, 'miss', 'AMD must be miss');
  assert.strictEqual(intc?.reportStatus, 'miss', 'INTC must be miss');
});
