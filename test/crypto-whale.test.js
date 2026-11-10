import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CryptoWhaleService,
  getCryptoWhaleService,
  CURATED_WHALES,
  COIN_CHART_SYMBOLS,
  isValidWhaleAddress,
  normalizeWhaleTopN,
  sanitizeWhaleLabel,
  parseCustomWhalesParam,
  WHALE_DEFAULT_TOP_N,
  WHALE_MIN_TOP_N,
  WHALE_MAX_TOP_N,
  WHALE_MAX_CUSTOM_WALLETS
} from '../src/crypto-whale-service.js';
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
  assert.equal(data.isLive, false);
  assert.equal(data.source, 'verified-cache');
  assert.ok(data.whales.length >= 6);
  assert.ok(data.aggregate.totalOI > 0);
  assert.deepEqual(data.activityLogs, []);
  assert.ok(data.assetVolumes && data.assetVolumes.BTC > data.assetVolumes.ETH);
});

test('CryptoWhaleService: fetches real userFillsByTime, batches split executions, filters non-mainnet perps, and marks isLive', async () => {
  const now = Date.now();
  const mockFetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.type === 'metaAndAssetCtxs') {
      return {
        ok: true,
        json: async () => [
          { universe: [{ name: 'BTC' }, { name: 'ETH' }, { name: 'SOL' }] },
          [
            { markPx: '80000', dayNtlVlm: '3500000000' },
            { markPx: '2500', dayNtlVlm: '1600000000' },
            { markPx: '150', dayNtlVlm: '700000000' }
          ]
        ]
      };
    }
    if (body.type === 'clearinghouseState') {
      return {
        ok: true,
        json: async () => ({
          marginSummary: { accountValue: '5000000', totalNtlPos: '15000000' },
          assetPositions: [
            {
              position: {
                coin: 'BTC',
                szi: '125',
                entryPx: '79000',
                positionValue: '10000000',
                unrealizedPnl: '125000',
                returnOnEquity: '0.12',
                leverage: { type: 'cross', value: 10 },
                liquidationPx: '58000'
              }
            }
          ]
        })
      };
    }
    if (body.type === 'userFillsByTime') {
      if (body.user.toLowerCase() !== CURATED_WHALES[0].address.toLowerCase()) {
        return { ok: true, json: async () => [] };
      }
      // Two child fills within 5s bucket + one closed short + one deployer-submarket fill that must be filtered out
      return {
        ok: true,
        json: async () => [
          { coin: 'BTC', px: '80000', sz: '0.5', time: now - 45_000, dir: 'Open Long', side: 'B', closedPnl: '0', hash: '0xaaa1', tid: 1 },
          { coin: 'BTC', px: '80000', sz: '0.75', time: now - 44_000, dir: 'Open Long', side: 'B', closedPnl: '0', hash: '0xaaa2', tid: 2 },
          { coin: 'ETH', px: '2500', sz: '40', time: now - 180_000, dir: 'Close Short', side: 'B', closedPnl: '12500', hash: '0xbbb1', tid: 3 },
          { coin: 'xyz:NVDA', px: '150', sz: '500', time: now - 10_000, dir: 'Open Long', side: 'B', closedPnl: '0', hash: '0xccc1', tid: 4 },
          { coin: '@107', px: '20', sz: '500', time: now - 10_000, dir: 'Buy', side: 'B', closedPnl: '0', hash: '0xddd1', tid: 5 }
        ]
      };
    }
    throw new Error(`Unexpected body type ${body.type}`);
  };

  const service = new CryptoWhaleService({ fetchFn: mockFetch, ttlMs: 1000 });
  const data = await service.getWhaleTrackerData({ force: true });

  assert.equal(data.isLive, true);
  assert.equal(data.source, 'hyperliquid-api');
  assert.equal(data.assetVolumes.BTC, 3500000000);
  // 2 batched mainnet perp fills only (xyz:NVDA and @107 filtered out)
  assert.equal(data.activityLogs.length, 2);
  assert.equal(data.activityLogs[0].coin, 'BTC');
  assert.equal(data.activityLogs[0].action, '开仓做多');
  assert.equal(data.activityLogs[0].shortAction, '开多');
  assert.equal(data.activityLogs[0].isLong, true);
  assert.equal(data.activityLogs[0].isIncrease, true);
  assert.equal(data.activityLogs[0].isLiveFill, true);
  assert.equal(data.activityLogs[0].valueUsd, 100000); // 1.25 * 80000 combined across 5s bucket
  assert.equal(data.activityLogs[0].timeAgo, '刚刚');
  assert.equal(data.activityLogs[1].coin, 'ETH');
  assert.equal(data.activityLogs[1].action, '平仓空单');
  assert.equal(data.activityLogs[1].shortAction, '平空');
  assert.equal(data.activityLogs[1].isLong, false);
  assert.equal(data.activityLogs[1].isIncrease, false);
  assert.equal(data.activityLogs[1].closedPnl, 12500);
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

  // Verify NVDA, TSLA, MSTR, MU are tracked
  const allCoins = stockWhales.whales.flatMap(w => w.positions.map(p => p.coin));
  assert.ok(allCoins.includes('NVDA'));
  assert.ok(allCoins.includes('TSLA'));
  assert.ok(allCoins.includes('MSTR'));
  assert.ok(allCoins.includes('MU'));

  // TradFi static sample portfolios carry honest metadata and no fabricated live fills
  assert.equal(stockWhales.isSample, true);
  assert.equal(stockWhales.isLive, false);
  assert.equal(stockWhales.source, 'sample-static');
  assert.deepEqual(stockWhales.activityLogs, []);
});

test('HTTP API /api/crypto/whales?category=stocks returns static sample payload even when offline', async () => {
  const offlineService = new CryptoWhaleService({
    fetchFn: async () => { throw new Error('offline'); },
    ttlMs: 1000
  });
  const server = createServer({ whaleService: offlineService });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/crypto/whales?category=stocks`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.isSample, true);
    assert.equal(json.isLive, false);
    assert.deepEqual(json.activityLogs, []);
    assert.ok(json.whales.some(w => w.positions.some(p => p.coin === 'NVDA')));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
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

test('Whale address & parameter helpers validate, clamp, deduplicate and sanitize cleanly', () => {
  assert.equal(isValidWhaleAddress('0x0123456789abcdef0123456789abcdef01234567'), true);
  assert.equal(isValidWhaleAddress('0xABCDEF0123456789ABCDEF0123456789ABCDEF01'), true);
  assert.equal(isValidWhaleAddress('0x123'), false);
  assert.equal(isValidWhaleAddress('not-an-address'), false);

  assert.equal(normalizeWhaleTopN(undefined), WHALE_DEFAULT_TOP_N);
  assert.equal(normalizeWhaleTopN('2'), WHALE_MIN_TOP_N);
  assert.equal(normalizeWhaleTopN('99'), WHALE_MAX_TOP_N);
  assert.equal(normalizeWhaleTopN('16'), 16);

  assert.equal(sanitizeWhaleLabel('  Smart <script> Money \n 01  '), 'Smart script Money 01');

  const addrA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const addrB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const parsedPipe = parseCustomWhalesParam(`bad,${addrA.toUpperCase()},${addrA}|Alpha Vault,${addrB}|Beta Desk`);
  assert.deepEqual(parsedPipe, [
    { address: addrA, label: 'Alpha Vault' },
    { address: addrB, label: 'Beta Desk' }
  ]);

  const overCap = Array.from({ length: 25 }, (_, i) => `0x${String(i + 1).padStart(40, '0')}`).join(',');
  assert.equal(parseCustomWhalesParam(overCap).length, WHALE_MAX_CUSTOM_WALLETS);
});

test('CryptoWhaleService: discovers Top N active leaderboard whales, filters dormant wallets, and merges zero-position custom wallets', async () => {
  const lbWhale1 = '0x1111111111111111111111111111111111111111';
  const lbWhale2 = '0x2222222222222222222222222222222222222222';
  const lbDormant = '0x3333333333333333333333333333333333333333';
  const customZero = '0x4444444444444444444444444444444444444444';
  const curated0 = CURATED_WHALES[0].address.toLowerCase();

  const stateByAddr = {
    [lbWhale1]: { value: 90_000_000, equity: 25_000_000, coin: 'BTC', szi: '1125', entryPx: '80000' },
    [lbWhale2]: { value: 45_000_000, equity: 12_000_000, coin: 'ETH', szi: '-18000', entryPx: '2500' },
    [lbDormant]: { value: 0, equity: 10_000_000, coin: null, szi: '0', entryPx: '0' },
    [customZero]: { value: 0, equity: 320_000, coin: null, szi: '0', entryPx: '0' }
  };
  CURATED_WHALES.forEach((cw, idx) => {
    stateByAddr[cw.address.toLowerCase()] = {
      value: (30 - idx * 2) * 1_000_000,
      equity: (10 - idx) * 1_000_000,
      coin: 'SOL',
      szi: String(Math.round(((30 - idx * 2) * 1_000_000) / 150)),
      entryPx: '150'
    };
  });

  const mockFetch = async (url, opts) => {
    if (String(url).includes('/Mainnet/leaderboard')) {
      return {
        ok: true,
        json: async () => ({
          leaderboardRows: [
            {
              ethAddress: lbWhale1,
              accountValue: '25000000',
              displayName: 'ApexQuantFund',
              windowPerformances: [['day', { vlm: '12000000' }], ['week', { vlm: '48000000' }]]
            },
            {
              ethAddress: lbWhale2,
              accountValue: '12000000',
              displayName: 'EthGammaDesk',
              windowPerformances: [['day', { vlm: '8000000' }], ['week', { vlm: '19000000' }]]
            },
            {
              ethAddress: lbDormant,
              accountValue: '10000000',
              displayName: 'DormantBridgeVault',
              windowPerformances: [['day', { vlm: '4000000' }], ['week', { vlm: '10000000' }]]
            }
          ]
        })
      };
    }

    const body = JSON.parse(opts.body);
    if (body.type === 'metaAndAssetCtxs') {
      return {
        ok: true,
        json: async () => [
          { universe: [{ name: 'BTC' }, { name: 'ETH' }, { name: 'SOL' }] },
          [
            { markPx: '80000', dayNtlVlm: '4000000000' },
            { markPx: '2500', dayNtlVlm: '1800000000' },
            { markPx: '150', dayNtlVlm: '900000000' }
          ]
        ]
      };
    }
    if (body.type === 'clearinghouseState') {
      const info = stateByAddr[body.user.toLowerCase()];
      if (!info || !info.coin) {
        return {
          ok: true,
          json: async () => ({
            marginSummary: { accountValue: String(info?.equity || 0), totalNtlPos: '0' },
            assetPositions: []
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          marginSummary: { accountValue: String(info.equity), totalNtlPos: String(info.value) },
          assetPositions: [
            {
              position: {
                coin: info.coin,
                szi: info.szi,
                entryPx: info.entryPx,
                positionValue: String(info.value),
                unrealizedPnl: '150000',
                returnOnEquity: '0.1',
                leverage: { type: 'cross', value: 10 },
                liquidationPx: '0'
              }
            }
          ]
        })
      };
    }
    if (body.type === 'userFillsByTime') {
      return { ok: true, json: async () => [] };
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const service = new CryptoWhaleService({ fetchFn: mockFetch, ttlMs: 60000 });

  // 1) Top 6 vs Top 10 cache isolation and dormant filtering
  const top6 = await service.getWhaleTrackerData({ topN: 6 });
  assert.equal(top6.isLive, true);
  assert.equal(top6.whales.length, 6);
  assert.equal(top6.meta.topN, 6);
  assert.equal(top6.meta.leaderboardActive, true);
  assert.equal(top6.meta.leaderboardTotalRows, 3);
  assert.equal(top6.whales[0].address, lbWhale1);
  assert.equal(top6.whales[0].name, 'ApexQuantFund');
  assert.equal(top6.whales[0].sourceType, 'leaderboard');
  assert.ok(!top6.whales.some(w => w.address === lbDormant), 'Zero-position leaderboard whale must be filtered out of Top N');

  // 2) Adding zero-position custom address + custom label override on already-discovered curated whale
  const customQuery = `${customZero}|My Cold Watch,${curated0}|My Curated Override`;
  const withCustom = await service.getWhaleTrackerData({ topN: 6, customWallets: customQuery });
  assert.equal(withCustom.meta.customCount, 2);
  assert.equal(withCustom.whales.length, 7, '6 Top N whales + 1 external zero-pos custom wallet (curated0 deduplicated)');

  const zeroEntry = withCustom.whales.find(w => w.address === customZero);
  assert.ok(zeroEntry, 'Zero-position custom wallet is retained in tracked list');
  assert.equal(zeroEntry.isCustom, true);
  assert.equal(zeroEntry.sourceType, 'custom');
  assert.equal(zeroEntry.name, 'My Cold Watch');
  assert.equal(zeroEntry.accountValue, 320_000);
  assert.equal(zeroEntry.totalNtlPos, 0);
  assert.deepEqual(zeroEntry.positions, []);

  const overriddenCurated = withCustom.whales.filter(w => w.address === curated0);
  assert.equal(overriddenCurated.length, 1, 'Duplicate address in custom + curated pool must deduplicate cleanly');
  assert.equal(overriddenCurated[0].isCustom, true);
  assert.equal(overriddenCurated[0].name, 'My Curated Override');
});

test('HTTP API /api/crypto/whales forwards topN and custom query params to whaleService', async () => {
  const receivedCalls = [];
  const mockWhaleService = {
    getWhaleTrackerData: async opts => {
      receivedCalls.push(opts);
      return {
        ok: true,
        provider: 'Hyperliquid L1 DEX',
        isLive: true,
        meta: { topN: Number(opts.topN) || 12, customCount: 1 },
        whales: [],
        aggregate: { totalTrackedWhales: 0, totalOI: 0, longRatio: 50, shortRatio: 50, topCoins: [] },
        activityLogs: []
      };
    }
  };

  const server = createServer({ whaleService: mockWhaleService });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const customAddr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|Desk Main';
    const res = await fetch(`http://127.0.0.1:${port}/api/crypto/whales?topN=16&force=1&custom=${encodeURIComponent(customAddr)}`);
    assert.equal(res.status, 200);
    await res.json();
    assert.equal(receivedCalls.length, 1);
    assert.equal(receivedCalls[0].force, true);
    assert.equal(receivedCalls[0].topN, '16');
    assert.equal(receivedCalls[0].customWallets, customAddr);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('CryptoWhaleService: discovers live HIP-3 (xyz) TradFi whales, strips xyz: prefixes, maps chart symbols, and recovers truncated 2000 fills', async () => {
  const now = Date.now();
  const lbStocks1 = '0x7111111111111111111111111111111111111111';
  const lbStocks2 = '0x7222222222222222222222222222222222222222';
  const lbStocksDormant = '0x7333333333333333333333333333333333333333';
  const customTradfiZero = '0x7444444444444444444444444444444444444444';

  const seenBodies = [];
  let lb1FillsQueries = 0;

  const mockFetch = async (url, opts) => {
    if (String(url).includes('/Mainnet/leaderboard')) {
      return {
        ok: true,
        json: async () => ({
          leaderboardRows: [
            {
              ethAddress: lbStocks1,
              accountValue: '42000000',
              displayName: 'XyzSemiDesk',
              windowPerformances: [['day', { vlm: '15000000' }], ['week', { vlm: '80000000' }]]
            },
            {
              ethAddress: lbStocks2,
              accountValue: '18000000',
              displayName: 'XyzIndexArb',
              windowPerformances: [['day', { vlm: '6000000' }], ['week', { vlm: '30000000' }]]
            },
            {
              ethAddress: lbStocksDormant,
              accountValue: '9000000',
              displayName: 'CryptoOnlyWhale',
              windowPerformances: [['day', { vlm: '5000000' }], ['week', { vlm: '20000000' }]]
            }
          ]
        })
      };
    }

    const body = JSON.parse(opts.body);
    seenBodies.push(body);

    if (body.type === 'metaAndAssetCtxs') {
      assert.equal(body.dex, 'xyz', 'stocks category queries HIP-3 dex=xyz metadata');
      return {
        ok: true,
        json: async () => [
          {
            universe: [
              { name: 'xyz:NVDA' },
              { name: 'xyz:XYZ100' },
              { name: 'xyz:SP500' },
              { name: 'xyz:RKLB' },
              { name: 'xyz:GOLD' }
            ]
          },
          [
            { markPx: '188.5', dayNtlVlm: '654000000' },
            { markPx: '26100', dayNtlVlm: '447000000' },
            { markPx: '6750', dayNtlVlm: '365000000' },
            { markPx: '32.5', dayNtlVlm: '42000000' },
            { markPx: '3420', dayNtlVlm: '190000000' }
          ]
        ]
      };
    }

    if (body.type === 'clearinghouseState') {
      assert.equal(body.dex, 'xyz', 'stocks clearinghouseState requests dex=xyz');
      const addr = body.user.toLowerCase();
      if (addr === lbStocks1) {
        return {
          ok: true,
          json: async () => ({
            marginSummary: { accountValue: '42000000', totalNtlPos: '65000000' },
            assetPositions: [
              {
                position: {
                  coin: 'xyz:XYZ100',
                  szi: '1500',
                  entryPx: '25800',
                  positionValue: '39150000',
                  unrealizedPnl: '450000',
                  returnOnEquity: '0.14',
                  leverage: { type: 'isolated', value: 10 },
                  liquidationPx: '22000'
                }
              },
              {
                position: {
                  coin: 'xyz:RKLB',
                  szi: '-800000',
                  entryPx: '33.1',
                  positionValue: '25850000',
                  unrealizedPnl: '480000',
                  returnOnEquity: '0.19',
                  leverage: { type: 'cross', value: 5 },
                  liquidationPx: '41.0'
                }
              }
            ]
          })
        };
      }
      if (addr === lbStocks2) {
        return {
          ok: true,
          json: async () => ({
            marginSummary: { accountValue: '18000000', totalNtlPos: '24000000' },
            assetPositions: [
              {
                position: {
                  coin: 'xyz:NVDA',
                  szi: '127320',
                  entryPx: '185.0',
                  positionValue: '24000000',
                  unrealizedPnl: '445000',
                  returnOnEquity: '0.21',
                  leverage: { type: 'cross', value: 10 },
                  liquidationPx: '152.0'
                }
              }
            ]
          })
        };
      }
      if (addr === customTradfiZero) {
        return {
          ok: true,
          json: async () => ({
            marginSummary: { accountValue: '510000', totalNtlPos: '0' },
            assetPositions: []
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          marginSummary: { accountValue: '9000000', totalNtlPos: '0' },
          assetPositions: []
        })
      };
    }

    if (body.type === 'userFillsByTime') {
      if (body.user.toLowerCase() !== lbStocks1) {
        return { ok: true, json: async () => [] };
      }
      lb1FillsQueries++;
      const recentCutoff = now - 10 * 60 * 1000;
      if (body.startTime < recentCutoff) {
        // Simulate 2000 older mainnet fills capping the initial 12h lookback query
        return {
          ok: true,
          json: async () => Array.from({ length: 2000 }, (_, i) => ({
            coin: 'BTC',
            px: '80000',
            sz: '0.25',
            time: now - 11 * 3600 * 1000 + i * 1000,
            dir: 'Open Long',
            side: 'B',
            closedPnl: '0',
            hash: `0xold${i}`,
            tid: i + 1
          }))
        };
      }
      // Tail catch-up query (now - 10m): latest xyz fills + one BTC fill (must be filtered out)
      return {
        ok: true,
        json: async () => [
          { coin: 'xyz:XYZ100', px: '26100', sz: '10', time: now - 25_000, dir: 'Open Long', side: 'B', closedPnl: '0', hash: '0xxyz1', tid: 9001 },
          { coin: 'xyz:NVDA', px: '188.5', sz: '800', time: now - 90_000, dir: 'Open Short', side: 'A', closedPnl: '0', hash: '0xxyz2', tid: 9002 },
          { coin: 'BTC', px: '80000', sz: '2', time: now - 15_000, dir: 'Open Long', side: 'B', closedPnl: '0', hash: '0xbtc9', tid: 9003 }
        ]
      };
    }

    throw new Error(`Unexpected body: ${JSON.stringify(body)}`);
  };

  const service = new CryptoWhaleService({ fetchFn: mockFetch, ttlMs: 60000 });
  const data = await service.getWhaleTrackerData({
    category: 'stocks',
    topN: 8,
    customWallets: `${customTradfiZero}|My TradFi Watch`
  });

  assert.equal(data.ok, true);
  assert.equal(data.category, 'stocks');
  assert.equal(data.isLive, true);
  assert.equal(data.isSample, false);
  assert.equal(data.source, 'hyperliquid-xyz-api');
  assert.equal(data.provider, 'Hyperliquid HIP-3 (TradeXYZ)');
  assert.equal(data.meta.dex, 'xyz');
  assert.equal(data.meta.topN, 8);
  assert.equal(data.whales.length, 3, '2 active xyz whales + 1 zero-position custom TradFi wallet');

  const topWhale = data.whales[0];
  assert.equal(topWhale.name, 'XyzSemiDesk');
  assert.equal(topWhale.positions[0].coin, 'XYZ100');
  assert.equal(topWhale.positions[0].chartSymbol, 'QQQ');
  assert.equal(topWhale.positions[1].coin, 'RKLB');
  assert.equal(topWhale.positions[1].chartSymbol, 'RKLB', 'TradFi tickers must never get -USD suffix');
  assert.equal(data.whales[1].positions[0].coin, 'NVDA');
  assert.equal(data.whales[1].positions[0].chartSymbol, 'NVDA');

  const customZeroEntry = data.whales.find(w => w.address === customTradfiZero);
  assert.ok(customZeroEntry && customZeroEntry.isCustom && customZeroEntry.accountValue === 510000);

  assert.equal(data.assetVolumes.XYZ100, 447000000);
  assert.equal(data.assetVolumes.GOLD, 190000000);

  assert.equal(lb1FillsQueries, 2, 'Triggers 10m tail query when 12h userFillsByTime hits 2000 limit');
  assert.equal(data.activityLogs.length, 2, 'Only xyz:* fills retained in TradFi activity logs');
  assert.equal(data.activityLogs[0].coin, 'XYZ100');
  assert.equal(data.activityLogs[0].chartSymbol, 'QQQ');
  assert.equal(data.activityLogs[1].coin, 'NVDA');
  assert.ok(!data.activityLogs.some(l => l.coin === 'BTC'), 'Mainnet crypto fills filtered from TradFi logs');
});

