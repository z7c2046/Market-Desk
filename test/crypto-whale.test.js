import test from 'node:test';
import assert from 'node:assert/strict';
import { CryptoWhaleService, getCryptoWhaleService, CURATED_WHALES, COIN_CHART_SYMBOLS } from '../src/crypto-whale-service.js';
import { createServer } from '../src/server.js';

test('CryptoWhaleService: parsePosition correctly parses long and short contracts', () => {
  const service = new CryptoWhaleService();

  // Test Long BTC
  const longRaw = {
    position: {
      coin: 'BTC',
      szi: '10.5',
      entryPx: '78500.0',
      positionValue: '824250.0',
      unrealizedPnl: '25000.0',
      returnOnEquity: '0.303',
      leverage: { type: 'cross', value: 20 },
      liquidationPx: '62000.0',
      marginUsed: '41212.5'
    }
  };
  const longPos = service.parsePosition(longRaw, { BTC: { markPx: 78600 } });
  assert.equal(longPos.coin, 'BTC');
  assert.equal(longPos.chartSymbol, 'BTC-USD');
  assert.equal(longPos.side, 'LONG');
  assert.equal(longPos.isLong, true);
  assert.equal(longPos.size, 10.5);
  assert.equal(longPos.entryPx, 78500);
  assert.equal(longPos.positionValue, 824250);
  assert.equal(longPos.unrealizedPnl, 25000);
  assert.equal(longPos.roePct, 30.3);
  assert.equal(longPos.leverage, 20);
  assert.equal(longPos.leverageType, '全仓');
  assert.equal(longPos.liquidationPx, 62000);
  assert.ok(longPos.liqDistancePct > 0);

  // Test Short ETH
  const shortRaw = {
    position: {
      coin: 'ETH',
      szi: '-500.0',
      entryPx: '2350.0',
      positionValue: '1165000.0',
      unrealizedPnl: '10000.0',
      returnOnEquity: '0.086',
      leverage: { type: 'cross', value: 10 },
      liquidationPx: '3200.0'
    }
  };
  const shortPos = service.parsePosition(shortRaw, { ETH: { markPx: 2330 } });
  assert.equal(shortPos.coin, 'ETH');
  assert.equal(shortPos.chartSymbol, 'ETH-USD');
  assert.equal(shortPos.side, 'SHORT');
  assert.equal(shortPos.isLong, false);
  assert.equal(shortPos.size, 500);
  assert.equal(shortPos.leverage, 10);
  assert.equal(shortPos.liquidationPx, 3200);

  // Zero position returns null
  assert.equal(service.parsePosition({ position: { szi: '0' } }), null);
});

test('CryptoWhaleService: computeAggregateMetrics accurately calculates Long/Short Ratio and Market Sentiment', () => {
  const service = new CryptoWhaleService();
  const mockWhales = [
    {
      address: '0x1',
      accountValue: 10000000,
      positions: [
        { coin: 'BTC', chartSymbol: 'BTC-USD', isLong: true, positionValue: 60000000, unrealizedPnl: 500000 },
        { coin: 'SOL', chartSymbol: 'SOL-USD', isLong: true, positionValue: 10000000, unrealizedPnl: 100000 }
      ]
    },
    {
      address: '0x2',
      accountValue: 5000000,
      positions: [
        { coin: 'ETH', chartSymbol: 'ETH-USD', isLong: false, positionValue: 30000000, unrealizedPnl: -200000 }
      ]
    }
  ];

  const agg = service.computeAggregateMetrics(mockWhales);
  assert.equal(agg.totalTrackedWhales, 2);
  assert.equal(agg.totalEquity, 15000000);
  assert.equal(agg.totalLongNotional, 70000000);
  assert.equal(agg.totalShortNotional, 30000000);
  assert.equal(agg.totalOI, 100000000);
  assert.equal(agg.longRatio, 70.0);
  assert.equal(agg.shortRatio, 30.0);
  assert.equal(agg.totalUnrealizedPnl, 400000);
  assert.match(agg.sentiment, /BULLISH/);
  assert.equal(agg.sentimentColor, 'long');
  assert.equal(agg.topCoins[0].coin, 'BTC');
  assert.equal(agg.topCoins[0].totalNtl, 60000000);
});

test('CryptoWhaleService: fallback mechanism provides robust verified data when offline', async () => {
  // Service with simulated failing fetch
  const service = new CryptoWhaleService({
    fetchFn: async () => { throw new Error('Simulated network timeout'); },
    ttlMs: 1000
  });

  const data = await service.getWhaleTrackerData();
  assert.equal(data.ok, true);
  assert.equal(data.provider, 'Hyperliquid L1 DEX');
  assert.ok(data.whales.length >= 6);
  assert.ok(data.aggregate.totalOI > 0);
  assert.ok(data.activityLogs.length > 0);
});

test('HTTP API /api/crypto/whales returns 200 and valid JSON schema', async () => {
  const mockWhaleService = {
    getWhaleTrackerData: async () => ({
      ok: true,
      provider: 'Hyperliquid L1 DEX',
      isLive: true,
      whales: [
        {
          address: '0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00',
          shortAddress: '0xecb6...2b00',
          name: 'HL 亿级多空对冲巨鲸',
          tag: '机构级对冲基金',
          avatar: '🐋',
          accountValue: 43000000,
          totalNtlPos: 124000000,
          positions: []
        }
      ],
      aggregate: {
        totalTrackedWhales: 1,
        totalOI: 124000000,
        longRatio: 45,
        shortRatio: 55,
        sentiment: '偏向看空 SLIGHTLY SHORT',
        sentimentColor: 'short',
        topCoins: []
      },
      activityLogs: []
    })
  };

  const server = createServer({ whaleService: mockWhaleService });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/crypto/whales`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.provider, 'Hyperliquid L1 DEX');
    assert.equal(json.whales.length, 1);
    assert.equal(json.whales[0].name, 'HL 亿级多空对冲巨鲸');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('CryptoWhaleService: getStockWhalesData returns verified on-chain US stock whales', () => {
  const service = new CryptoWhaleService();
  const stockWhales = service.getStockWhalesData();
  assert.ok(stockWhales.whales.length >= 6);
  assert.ok(stockWhales.aggregate.totalOI > 0);
  assert.ok(stockWhales.aggregate.topCoins.length > 0);

  // Verify NVDA, TSLA, MSTR are tracked
  const allCoins = stockWhales.whales.flatMap(w => w.positions.map(p => p.coin));
  assert.ok(allCoins.includes('NVDA'));
  assert.ok(allCoins.includes('TSLA'));
  assert.ok(allCoins.includes('MSTR'));

  // Verify activity logs generated
  assert.ok(stockWhales.activityLogs.length > 0);
});

test('HTTP API /api/crypto/whales?category=stocks returns on-chain US stock whales payload', async () => {
  const service = new CryptoWhaleService();
  const server = createServer({ whaleService: service });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/crypto/whales?category=stocks`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.ok(json.whales.length >= 6);
    assert.ok(json.whales.some(w => w.positions.some(p => p.coin === 'NVDA')));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

