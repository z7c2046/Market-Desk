import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OnchainStocksService, ONCHAIN_STOCK_CANDIDATES } from '../src/onchain-stocks-service.js';
import { createServer } from '../src/server.js';

describe('OnchainStocksService', () => {
  it('candidates list contains at least 10 valid on-chain stocks', () => {
    assert.ok(ONCHAIN_STOCK_CANDIDATES.length >= 10);
    for (const c of ONCHAIN_STOCK_CANDIDATES) {
      assert.ok(c.symbol);
      assert.ok(c.name);
      assert.ok(c.baseVolume24h > 0);
      assert.ok(c.basePrice > 0);
    }
  });

  it('processStockItem accurately calculates netFlow, buyRatio, and premiumPct', () => {
    const service = new OnchainStocksService();
    const item = ONCHAIN_STOCK_CANDIDATES[0]; // NVDA
    const processed = service.processStockItem(item);

    assert.strictEqual(processed.symbol, 'NVDA');
    assert.strictEqual(processed.volume24h, item.baseVolume24h);
    assert.strictEqual(processed.inflow24h + processed.outflow24h, processed.volume24h);
    assert.strictEqual(processed.netFlow, processed.inflow24h - processed.outflow24h);
    assert.ok(processed.buyRatio >= 0 && processed.buyRatio <= 100);
    assert.strictEqual(typeof processed.premiumPct, 'number');
  });

  it('getOnchainStocksData returns exactly Top 10 sorted by volume24h descending', async () => {
    const service = new OnchainStocksService();
    const data = await service.getOnchainStocksData({ force: true });

    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.top10.length, 10);
    assert.ok(data.aggregate);
    assert.strictEqual(data.aggregate.totalTrackedCount, 10);
    assert.ok(data.aggregate.totalVolume24h > 0);

    // Check rank order and descending volume
    for (let i = 0; i < data.top10.length; i++) {
      assert.strictEqual(data.top10[i].rank, i + 1);
      if (i > 0) {
        assert.ok(
          data.top10[i - 1].volume24h >= data.top10[i].volume24h,
          `Item at ${i - 1} volume (${data.top10[i - 1].volume24h}) must be >= item at ${i} volume (${data.top10[i].volume24h})`
        );
      }
    }
  });

  it('computeAggregateMetrics correctly aggregates volume and calculates sentiment', () => {
    const service = new OnchainStocksService();
    const mockStocks = [
      {
        symbol: 'NVDA',
        volume24h: 10000000,
        inflow24h: 6000000,
        outflow24h: 4000000,
        netFlow: 2000000,
        openInterest: 5000000,
        premiumPct: 0.5
      },
      {
        symbol: 'TSLA',
        volume24h: 8000000,
        inflow24h: 5000000,
        outflow24h: 3000000,
        netFlow: 2000000,
        openInterest: 4000000,
        premiumPct: 1.2
      }
    ];

    const agg = service.computeAggregateMetrics(mockStocks);
    assert.strictEqual(agg.totalVolume24h, 18000000);
    assert.strictEqual(agg.totalInflow24h, 11000000);
    assert.strictEqual(agg.totalOutflow24h, 7000000);
    assert.strictEqual(agg.totalNetFlow24h, 4000000);
    assert.strictEqual(agg.totalOpenInterest, 9000000);
    assert.strictEqual(agg.overallBuyRatio, 61.1);
    assert.strictEqual(agg.sentimentClass, 'bullish');
    assert.ok(agg.maxPremiumSymbol.includes('TSLA'));
  });

  it('caching debounces calls within TTL', async () => {
    const service = new OnchainStocksService({ cacheTtlMs: 5000 });
    const first = await service.getOnchainStocksData();
    const second = await service.getOnchainStocksData();

    assert.strictEqual(first, second);
    assert.strictEqual(first.fetchedAt, second.fetchedAt);
  });

  it('HTTP API /api/crypto/onchain-stocks returns 200 and valid JSON schema', async () => {
    const mockService = {
      getOnchainStocksData: async () => ({
        ok: true,
        provider: 'On-Chain DEX & RWA Aggregator',
        isLive: true,
        fetchedAt: new Date().toISOString(),
        aggregate: {
          totalTrackedCount: 10,
          totalVolume24h: 300000000,
          totalNetFlow24h: 40000000,
          overallBuyRatio: 60.5,
          overallSentiment: '多头净流入 BULLISH INFLOW',
          sentimentClass: 'bullish',
          topInflowSymbol: 'NVDA (+$18.4M)',
          maxPremiumSymbol: 'TSLA (+1.13%)'
        },
        top10: [
          {
            rank: 1,
            symbol: 'NVDA',
            name: '英伟达',
            volume24h: 64820000,
            price: 148.5,
            netFlow: 18400000,
            buyRatio: 64.2,
            sellRatio: 35.8,
            premiumPct: 0.47
          }
        ]
      })
    };

    const server = createServer({ onchainStockService: mockService });
    await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/crypto/onchain-stocks`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.ok, true);
      assert.strictEqual(json.provider, 'On-Chain DEX & RWA Aggregator');
      assert.strictEqual(json.top10.length, 1);
      assert.strictEqual(json.top10[0].symbol, 'NVDA');
      assert.strictEqual(json.aggregate.totalTrackedCount, 10);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
