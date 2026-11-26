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
    assert.ok(processed.intradayRadar);
    assert.ok(processed.intradayRadar.tacticalBadge);
    assert.ok(processed.intradayRadar.tacticalPlaybook);
    assert.ok(processed.intradayRadar.costBasis);
    assert.strictEqual(typeof processed.intradayRadar.costBasis.bearVwap, 'number');
    assert.strictEqual(typeof processed.intradayRadar.costBasis.bullVwap, 'number');
    assert.ok(processed.intradayRadar.keyWhales.length > 0);
    assert.ok(processed.intradayRadar.livePrints.length > 0);
  });

  it('processStockItem with quote uses actual stock price (not previous close) as tradFiClose', () => {
    const service = new OnchainStocksService();
    const amdCandidate = ONCHAIN_STOCK_CANDIDATES.find(c => c.symbol === 'AMD');
    const mockAmdQuote = {
      regular: {
        price: 449.04,
        referenceClose: 404.40,
        changePercent: 11.04,
        volume: 45600000
      }
    };
    const processed = service.processStockItem(amdCandidate, mockAmdQuote, 0);

    // 正股对照价必须是 AMD 实际收盘价 449.04，而不是前收盘价 404.40
    assert.strictEqual(processed.tradFiClose, 449.04);
    // 标的自身涨跌幅为 11.04%
    assert.strictEqual(processed.changePercent, 11.04);
    // 链上合约价格围绕 449.04 微幅浮动 (约 450)
    assert.ok(Math.abs(processed.price - 449.04) < 3);
    // 溢折价率必须是链上与正股的微幅价差 (约 0.2% - 0.4%)，绝非 11% 整体涨幅
    assert.ok(Math.abs(processed.premiumPct) < 1.0, `premiumPct (${processed.premiumPct}%) must be < 1.0%`);
    assert.strictEqual(processed.priceDiff, Number((processed.price - processed.tradFiClose).toFixed(2)));
  });

  it('MU (美光) candidate exists and has tailored intradayRadar', () => {
    const service = new OnchainStocksService();
    const muItem = ONCHAIN_STOCK_CANDIDATES.find(c => c.symbol === 'MU');
    assert.ok(muItem, 'MU candidate exists');
    const processed = service.processStockItem(muItem);
    assert.strictEqual(processed.symbol, 'MU');
    assert.match(processed.intradayRadar.tacticalPlaybook, /美光/);
    assert.ok(processed.intradayRadar.costBasis.bearVwap > 0);
  });

  it('getOnchainStocksData returns exactly Top 10 sorted by volume24h descending', async () => {
    const service = new OnchainStocksService();
    const data = await service.getOnchainStocksData({ force: true });

    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.top10.length, 10);
    assert.ok(data.aggregate);
    assert.strictEqual(data.aggregate.totalTrackedCount, 10);
    assert.ok(data.aggregate.totalVolume24h > 0);
    assert.ok(data.assetVolumes && typeof data.assetVolumes === 'object');
    assert.strictEqual(Object.keys(data.assetVolumes).length, ONCHAIN_STOCK_CANDIDATES.length);
    assert.strictEqual(data.assetVolumes[data.top10[0].symbol], data.top10[0].volume24h);
    assert.ok(data.assetVolumes.MSTR > 0, 'Non-Top-10 candidates also include 24h volume in assetVolumes');

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

  it('processStockItem with Hyperliquid hlCtx uses real on-chain markPx, dayNtlVlm, oiUsd, and recalculates negative LONG PnL when price < entryPx', () => {
    const service = new OnchainStocksService();
    const nvdaCandidate = ONCHAIN_STOCK_CANDIDATES.find(c => c.symbol === 'NVDA');
    const mockQuote = {
      regular: {
        price: 136.54,
        referenceClose: 146.20,
        changePercent: -6.61,
        volume: 55000000
      }
    };
    const mockHlCtx = {
      markPx: 136.76,
      oraclePx: 136.54,
      prevDayPx: 146.20,
      dayNtlVlm: 487663201,
      oiUsd: 412228932,
      funding: 0.0000168
    };
    const processed = service.processStockItem(nvdaCandidate, mockQuote, 0, mockHlCtx);

    assert.strictEqual(processed.price, 136.76);
    assert.strictEqual(processed.tradFiClose, 136.54);
    assert.strictEqual(processed.volume24h, 487663201);
    assert.strictEqual(processed.openInterest, 412228932);

    // Every LONG position with entryPx > 136.76 must have negative unrealizedPnl (loss), and every SHORT with entryPx > 136.76 must have positive unrealizedPnl (profit)
    for (const wp of processed.whalePositions) {
      if (wp.side === 'LONG' && wp.entryPx > processed.price) {
        assert.ok(wp.unrealizedPnl < 0, `LONG ${wp.name} @ ${wp.entryPx} vs mark ${processed.price} must show negative PnL (got ${wp.unrealizedPnl})`);
        assert.ok(wp.liquidationPx < processed.price, `LONG ${wp.name} liquidationPx (${wp.liquidationPx}) must be below markPx (${processed.price})`);
      }
      if (wp.side === 'SHORT' && wp.entryPx > processed.price) {
        assert.ok(wp.unrealizedPnl > 0, `SHORT ${wp.name} @ ${wp.entryPx} vs mark ${processed.price} must show positive PnL (got ${wp.unrealizedPnl})`);
        assert.ok(wp.liquidationPx > processed.price, `SHORT ${wp.name} liquidationPx (${wp.liquidationPx}) must be above markPx (${processed.price})`);
      }
    }
  });

  it('reports isLive:false & isFallback:true when all upstreams fail, omits synthetic SOXL whales, and preserves last live snapshot across transient outages', async () => {
    let allowLive = false;
    const service = new OnchainStocksService({
      cacheTtlMs: 60000,
      fetchQuoteFn: async () => null,
      fetchHlFn: async () => {
        if (!allowLive) throw new Error('TLS disconnect');
        return {
          ok: true,
          json: async () => [
            { universe: [{ name: 'xyz:SOXL' }, { name: 'xyz:NVDA' }] },
            [
              { markPx: '25.78', oraclePx: '25.70', prevDayPx: '32.00', dayNtlVlm: '341000000', openInterest: '310000', funding: '0.00001' },
              { markPx: '142.85', oraclePx: '142.80', prevDayPx: '145.00', dayNtlVlm: '378000000', openInterest: '2100000', funding: '0.00001' }
            ]
          ]
        };
      }
    });

    // 1. Offline initial fetch: must report honest isLive:false + isFallback:true and never fabricate SOXL whales
    const offlineFirst = await service.getOnchainStocksData({ force: true });
    assert.strictEqual(offlineFirst.isLive, false);
    assert.strictEqual(offlineFirst.isFallback, true);
    const offlineSoxl = offlineFirst.allStocks.find(s => s.symbol === 'SOXL');
    assert.ok(offlineSoxl);
    assert.strictEqual(offlineSoxl.whalePositions.length, 0, 'Uncurated SOXL must not fabricate synthetic whale rows');

    // 2. Live fetch succeeds -> captures real $25.78 SOXL price
    allowLive = true;
    const liveSnap = await service.getOnchainStocksData({ force: true });
    assert.strictEqual(liveSnap.isLive, true);
    assert.strictEqual(liveSnap.isFallback, false);
    const liveSoxl = liveSnap.allStocks.find(s => s.symbol === 'SOXL');
    assert.strictEqual(liveSoxl.price, 25.78);

    // 3. Subsequent transient total outage -> preserves last live $25.78 snapshot with stale:true instead of clobbering with basePrice
    allowLive = false;
    const staleAfterOutage = await service.getOnchainStocksData({ force: true });
    assert.strictEqual(staleAfterOutage.isLive, false);
    assert.strictEqual(staleAfterOutage.stale, true);
    assert.strictEqual(staleAfterOutage.isFallback, false);
    const staleSoxl = staleAfterOutage.allStocks.find(s => s.symbol === 'SOXL');
    assert.strictEqual(staleSoxl.price, 25.78, 'Must preserve live $25.78 price instead of reverting to hardcoded basePrice');
  });
});
