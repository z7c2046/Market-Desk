import test from 'node:test';
import assert from 'node:assert/strict';
import { CryptoWhaleService } from '../src/crypto-whale-service.js';
import {
  ASSET_ZH_LABELS,
  getAssetLabel,
  formatWhaleCompactUsd,
  formatSignedWhaleCompactUsd,
  disambiguateWallets,
  computeWhaleSankeyGraph,
  buildAggregatedPositions,
  detectPositionDeltas
} from '../public/composables/whaleSankeyModel.js';

function makeSampleWhales() {
  return [
    {
      address: '0x1111111111111111111111111111111111111111',
      name: '趋势趋势一号',
      tag: '趋势基金',
      avatar: '🐋',
      positions: [
        { coin: 'BTC', chartSymbol: 'BTC-USD', isLong: true, side: 'LONG', positionValue: 40_000_000, unrealizedPnl: 1_200_000 },
        { coin: 'ETH', chartSymbol: 'ETH-USD', isLong: false, side: 'SHORT', positionValue: 15_000_000, unrealizedPnl: -300_000 },
        { coin: 'SOL', chartSymbol: 'SOL-USD', isLong: true, side: 'LONG', positionValue: 10_000_000, unrealizedPnl: 450_000 }
      ]
    },
    {
      address: '0x2222222222222222222222222222222222222222',
      name: '高频波段二号',
      tag: '量化做市',
      avatar: '⚡',
      positions: [
        { coin: 'ETH', chartSymbol: 'ETH-USD', isLong: true, side: 'LONG', positionValue: 28_000_000, unrealizedPnl: 620_000 },
        { coin: 'BTC', chartSymbol: 'BTC-USD', isLong: false, side: 'SHORT', positionValue: 12_000_000, unrealizedPnl: 180_000 }
      ]
    },
    {
      address: '0x9e5c467a90f055627685601c238b16c1724f8d55',
      name: '重复地址策略 A',
      tag: '波段',
      avatar: '🎯',
      positions: [
        { coin: 'HYPE', chartSymbol: 'HYPE-USD', isLong: true, side: 'LONG', positionValue: 9_000_000, unrealizedPnl: 90_000 }
      ]
    },
    {
      address: '0x9e5c467a90f055627685601c238b16c1724f8d55',
      name: '重复地址策略 B',
      tag: '对冲',
      avatar: '🦈',
      positions: [
        { coin: 'XRP', chartSymbol: 'XRP-USD', isLong: false, side: 'SHORT', positionValue: 7_500_000, unrealizedPnl: 50_000 }
      ]
    }
  ];
}

test('formatters and asset labels handle edge cases accurately', () => {
  assert.equal(getAssetLabel('nvda'), '英伟达');
  assert.equal(ASSET_ZH_LABELS.BTC, '比特币');
  assert.equal(formatWhaleCompactUsd(1_450_000_000), '$1.45B');
  assert.equal(formatWhaleCompactUsd(42_500_000), '$42.5M');
  assert.equal(formatWhaleCompactUsd(88_400), '$88K');
  assert.equal(formatSignedWhaleCompactUsd(-12_300_000), '−$12.3M');
  assert.equal(formatSignedWhaleCompactUsd(0), '$0');
});

test('disambiguateWallets preserves unique walletKey even for duplicate addresses and computes notional totals', () => {
  const wallets = disambiguateWallets(makeSampleWhales());
  assert.equal(wallets.length, 4);
  const keys = new Set(wallets.map(w => w.walletKey));
  assert.equal(keys.size, 4, 'All walletKeys must be distinct');
  assert.equal(wallets[2].walletKey, '0x9e5c467a90f055627685601c238b16c1724f8d55');
  assert.equal(wallets[3].walletKey, '0x9e5c467a90f055627685601c238b16c1724f8d55#2');

  assert.equal(wallets[0].longNotional, 50_000_000);
  assert.equal(wallets[0].shortNotional, 15_000_000);
  assert.equal(wallets[0].totalNtlPos, 65_000_000);
  assert.equal(wallets[0].netExposure, 35_000_000);
  assert.equal(wallets[0].unrealizedPnl, 1_350_000);
});

test('computeWhaleSankeyGraph enforces strict flow conservation and valid non-NaN geometry', () => {
  const graph = computeWhaleSankeyGraph({ whales: makeSampleWhales(), mode: 'all' });
  assert.equal(graph.isEmpty, false);

  const sumWallets = graph.layout.walletTotals.reduce((s, v) => s + v, 0);
  const sumAssets = graph.layout.assetTotals.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sumWallets - graph.layout.total) < 1e-6, 'Wallet sum equals graph total');
  assert.ok(Math.abs(sumAssets - graph.layout.total) < 1e-6, 'Asset sum equals graph total');

  // Verify each wallet rail height matches sum of its outgoing ribbon heights & stacks contiguously
  for (const wNode of graph.walletNodes) {
    const outLinks = graph.links.filter(l => l.walletKey === wNode.walletKey);
    const linkHeightSum = outLinks.reduce((s, l) => s + l.h, 0);
    assert.ok(Math.abs(linkHeightSum - wNode.h) < 1e-4, `Height conservation holds for wallet ${wNode.name}`);
    let expectedSy = wNode.y;
    for (const link of outLinks) {
      assert.ok(Math.abs(link.sy - expectedSy) < 1e-4, 'Outgoing links pack contiguously inside wallet rail');
      expectedSy += link.h;
    }
  }

  // Verify each asset rail height matches sum of incoming ribbon heights & stacks contiguously
  for (const aNode of graph.assetNodes) {
    const inLinks = graph.links.filter(l => l.assetSymbol === aNode.symbol);
    const linkHeightSum = inLinks.reduce((s, l) => s + l.h, 0);
    assert.ok(Math.abs(linkHeightSum - aNode.h) < 1e-4, `Height conservation holds for asset ${aNode.symbol}`);
    let expectedTy = aNode.y;
    for (const link of inLinks) {
      assert.ok(Math.abs(link.ty - expectedTy) < 1e-4, 'Incoming links pack contiguously inside asset rail');
      expectedTy += link.h;
    }
  }

  // Verify valid SVG paths with zero NaN and in-bounds y coordinates
  for (const link of graph.links) {
    assert.doesNotMatch(link.d, /NaN|Infinity/);
    assert.doesNotMatch(link.spineD, /NaN|Infinity/);
    assert.ok(link.sy >= 0 && link.sy + link.h <= graph.svgHeight);
    assert.ok(link.ty >= 0 && link.ty + link.h <= graph.svgHeight);
  }
});

test('computeWhaleSankeyGraph supports long/short mode switching and filters inactive wallets', () => {
  const longGraph = computeWhaleSankeyGraph({ whales: makeSampleWhales(), mode: 'long' });
  assert.equal(longGraph.walletNodes.some(w => w.name === '重复地址策略 B'), false, 'Short-only wallet excluded in long mode');
  assert.equal(longGraph.total, 87_000_000);

  const shortGraph = computeWhaleSankeyGraph({ whales: makeSampleWhales(), mode: 'short' });
  assert.equal(shortGraph.walletNodes.some(w => w.name === '重复地址策略 A'), false, 'Long-only wallet excluded in short mode');
  assert.equal(shortGraph.total, 34_500_000);
});

test('computeWhaleSankeyGraph buckets tail assets into OTHER and promotes off-rank selected wallet', () => {
  const manyWallets = [];
  for (let i = 0; i < 8; i++) {
    manyWallets.push({
      address: `0x000000000000000000000000000000000000000${i}`,
      name: `巨鲸 ${i + 1}`,
      positions: [
        { coin: `COIN${i + 1}`, isLong: true, side: 'LONG', positionValue: (10 - i) * 1_000_000 },
        { coin: 'EXTRA', isLong: false, side: 'SHORT', positionValue: 500_000 }
      ]
    });
  }
  const eighthKey = manyWallets[7].address;
  const graph = computeWhaleSankeyGraph({
    whales: manyWallets,
    maxWallets: 6,
    maxAssets: 5,
    selectedWalletKey: eighthKey
  });

  assert.equal(graph.walletNodes.length, 6);
  const promoted = graph.walletNodes.find(w => w.walletKey === eighthKey);
  assert.ok(promoted && promoted.selected, 'Selected off-rank wallet is promoted into Sankey nodes');

  const otherAsset = graph.assetNodes.find(a => a.symbol === 'OTHER');
  assert.ok(otherAsset && otherAsset.isOther, 'Tail assets beyond maxAssets collapse into OTHER bucket');
  const expectedTotal = graph.walletNodes.reduce((s, w) => s + w.totalVal, 0);
  assert.ok(Math.abs(graph.total - expectedTotal) < 1e-6, 'Total notional remains conserved with OTHER bucket');
});

test('buildAggregatedPositions and detectPositionDeltas produce accurate outputs and handle empty state', () => {
  const agg = buildAggregatedPositions(makeSampleWhales());
  assert.equal(agg[0].symbol, 'BTC');
  assert.equal(agg[0].longVal, 40_000_000);
  assert.equal(agg[0].shortVal, 12_000_000);
  assert.equal(agg[0].totalVal, 52_000_000);
  assert.equal(agg[0].walletCount, 2);

  const prev = makeSampleWhales();
  const next = makeSampleWhales();
  next[3].positions[0].positionValue = 11_000_000; // +3.5M short on duplicate-address wallet B
  next[0].positions[0].positionValue = 40_005_000; // +5K sub-threshold jitter

  const deltas = detectPositionDeltas(prev, next, { minDeltaUsd: 50_000 });
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].whaleName, '重复地址策略 B');
  assert.equal(deltas[0].actionText, '加空');
  assert.equal(deltas[0].deltaAbs, 3_500_000);

  const emptyGraph = computeWhaleSankeyGraph({ whales: [] });
  assert.equal(emptyGraph.isEmpty, true);
  assert.deepEqual(emptyGraph.links, []);
});

test('computeWhaleSankeyGraph renders thick non-zero ribbons on full Crypto & TradFi production datasets across all modes', () => {
  const svc = new CryptoWhaleService();
  const datasets = [
    ['crypto', svc.getFallbackData().whales],
    ['tradfi', svc.getStockWhalesData().whales]
  ];

  for (const [label, whales] of datasets) {
    for (const mode of ['all', 'long', 'short']) {
      const firstWallet = disambiguateWallets(whales)[0];
      const firstCoin = firstWallet.positions[0].coin.toUpperCase();
      const pulseMap = new Map([[`${firstWallet.walletKey}::${firstCoin}`, { isLong: true, isIncrease: false }]]);

      const graph = computeWhaleSankeyGraph({
        whales,
        mode,
        pulseKeys: pulseMap,
        maxWallets: 6,
        maxAssets: 5,
        svgWidth: 1280
      });

      assert.equal(graph.isEmpty, false, `${label} (${mode}) must not be empty`);
      assert.ok(graph.layout.scale > 0, `${label} (${mode}) scale must be > 0`);
      assert.equal(graph.svgWidth, 1280);
      assert.ok(graph.svgHeight >= 450 && graph.svgHeight <= 620, `${label} (${mode}) height ${graph.svgHeight} stays proportional`);
      assert.ok(graph.links.length > 0, `${label} (${mode}) produces links`);
      for (const link of graph.links) {
        assert.ok(link.h > 0.1, `${label} (${mode}) link ${link.id} height ${link.h} must never collapse to 0`);
        assert.ok(link.sy + link.h <= graph.svgHeight && link.ty + link.h <= graph.svgHeight, 'Link stays within SVG viewBox bounds');
      }
      if (mode === 'all') {
        const pulsed = graph.links.find(l => l.isPulseActive);
        assert.ok(pulsed, `${label} pulse link activated`);
        assert.equal(pulsed.pulseIsIncrease, false, 'Direction flag preserved from pulse Map');
      }
    }
  }
});

test('computeWhaleSankeyGraph & buildAggregatedPositions sort assets by on-chain 24h volume descending with OTHER pinned last', () => {
  const whales = [
    {
      address: '0xaaaa000000000000000000000000000000000001',
      name: 'W1',
      positions: [
        { coin: 'MU', isLong: false, side: 'SHORT', positionValue: 60_000_000 },
        { coin: 'MSTR', isLong: true, side: 'LONG', positionValue: 30_000_000 },
        { coin: 'SPY', isLong: true, side: 'LONG', positionValue: 25_000_000 }
      ]
    },
    {
      address: '0xaaaa000000000000000000000000000000000002',
      name: 'W2',
      positions: [
        { coin: 'NVDA', isLong: true, side: 'LONG', positionValue: 18_000_000 },
        { coin: 'QQQ', isLong: false, side: 'SHORT', positionValue: 21_000_000 },
        { coin: 'TSLA', isLong: true, side: 'LONG', positionValue: 15_000_000 },
        { coin: 'AMD', isLong: false, side: 'SHORT', positionValue: 6_000_000 }
      ]
    }
  ];

  const volumeMap = new Map([
    ['NVDA', 285_600_000],
    ['MU', 81_600_000],
    ['SPY', 66_200_000],
    ['AMD', 64_700_000],
    ['QQQ', 58_900_000],
    ['TSLA', 54_700_000],
    ['MSTR', 24_700_000]
  ]);

  const graph = computeWhaleSankeyGraph({
    whales,
    mode: 'all',
    assetVolumeMap: volumeMap,
    maxWallets: 6,
    maxAssets: 5
  });

  // Top 5 must strictly follow on-chain 24h volume descending (NVDA #1, AMD #4 above QQQ & MSTR), OTHER at bottom
  assert.deepEqual(
    graph.assetNodes.map(a => a.symbol),
    ['NVDA', 'MU', 'SPY', 'AMD', 'QQQ', 'OTHER']
  );
  assert.equal(graph.assetNodes[0].formattedVolume, '$285.6M');
  assert.equal(graph.assetNodes[0].subLabel, '英伟达 · 量 $285.6M');
  assert.equal(graph.assetNodes[5].isOther, true);
  assert.equal(graph.assetNodes[5].volumeVal, 0);
  assert.equal(graph.assetNodes[5].subLabel, '其他 2 个标的');

  // Flow conservation holds under volume-sorted targets
  for (const aNode of graph.assetNodes) {
    const inLinks = graph.links.filter(l => l.assetSymbol === aNode.symbol);
    const linkHeightSum = inLinks.reduce((s, l) => s + l.h, 0);
    assert.ok(Math.abs(linkHeightSum - aNode.h) < 1e-4, `Conservation holds for volume-sorted asset ${aNode.symbol}`);
  }

  // Plain object with lowercase key & equal-volume tie-breaking by OI
  const agg = buildAggregatedPositions(whales, {
    assetVolumeMap: { nvda: 285_600_000, mu: 81_600_000, spy: 66_200_000, amd: 64_700_000 }
  });
  assert.deepEqual(
    agg.map(r => r.symbol),
    ['NVDA', 'MU', 'SPY', 'AMD', 'MSTR', 'QQQ', 'TSLA']
  );
  assert.equal(agg[0].subLabel, '英伟达 · 量 $285.6M');
});

test('buildAggregatedPositions supports sorting by longVal, shortVal, totalVal (desc/asc) with deterministic tie-breaking', () => {
  const whales = [
    {
      address: '0x0001',
      name: 'W1',
      positions: [
        { coin: 'BTC', isLong: true, side: 'LONG', positionValue: 12_000_000 },
        { coin: 'BTC', isLong: false, side: 'SHORT', positionValue: 5_000_000 },
        { coin: 'ETH', isLong: false, side: 'SHORT', positionValue: 30_000_000 }
      ]
    },
    {
      address: '0x0002',
      name: 'W2',
      positions: [
        { coin: 'SOL', isLong: true, side: 'LONG', positionValue: 20_000_000 },
        { coin: 'DOGE', isLong: true, side: 'LONG', positionValue: 4_000_000 },
        { coin: 'DOGE', isLong: false, side: 'SHORT', positionValue: 9_000_000 }
      ]
    }
  ];
  const volumeMap = { BTC: 500e6, ETH: 300e6, SOL: 150e6, DOGE: 50e6 };

  // Default (no sortField): volume desc
  assert.deepEqual(
    buildAggregatedPositions(whales, { assetVolumeMap: volumeMap }).map(r => r.symbol),
    ['BTC', 'ETH', 'SOL', 'DOGE']
  );

  // longVal desc: SOL ($20M) > BTC ($12M) > DOGE ($4M) > ETH ($0)
  assert.deepEqual(
    buildAggregatedPositions(whales, { assetVolumeMap: volumeMap, sortField: 'longVal', sortDir: 'desc' }).map(r => r.symbol),
    ['SOL', 'BTC', 'DOGE', 'ETH']
  );

  // longVal asc: ETH ($0) < DOGE ($4M) < BTC ($12M) < SOL ($20M)
  assert.deepEqual(
    buildAggregatedPositions(whales, { assetVolumeMap: volumeMap, sortField: 'longVal', sortDir: 'asc' }).map(r => r.symbol),
    ['ETH', 'DOGE', 'BTC', 'SOL']
  );

  // shortVal desc: ETH ($30M) > DOGE ($9M) > BTC ($5M) > SOL ($0)
  assert.deepEqual(
    buildAggregatedPositions(whales, { assetVolumeMap: volumeMap, sortField: 'shortVal', sortDir: 'desc' }).map(r => r.symbol),
    ['ETH', 'DOGE', 'BTC', 'SOL']
  );

  // shortVal asc: SOL ($0) < BTC ($5M) < DOGE ($9M) < ETH ($30M)
  assert.deepEqual(
    buildAggregatedPositions(whales, { assetVolumeMap: volumeMap, sortField: 'shortVal', sortDir: 'asc' }).map(r => r.symbol),
    ['SOL', 'BTC', 'DOGE', 'ETH']
  );

  // totalVal desc / asc: ETH ($30M), SOL ($20M), BTC ($17M), DOGE ($13M)
  assert.deepEqual(
    buildAggregatedPositions(whales, { assetVolumeMap: volumeMap, sortField: 'totalVal', sortDir: 'desc' }).map(r => r.symbol),
    ['ETH', 'SOL', 'BTC', 'DOGE']
  );
  assert.deepEqual(
    buildAggregatedPositions(whales, { assetVolumeMap: volumeMap, sortField: 'totalVal', sortDir: 'asc' }).map(r => r.symbol),
    ['DOGE', 'BTC', 'SOL', 'ETH']
  );
});

test('detectPositionDeltas ignores mark-price fluctuations when contract size is unchanged and detects size trims/closes/flips', () => {
  const prev = [
    {
      address: '0xaaa1',
      name: 'W1',
      positions: [
        { coin: 'BTC', chartSymbol: 'BTC-USD', isLong: true, side: 'LONG', size: 100, markPx: 80000, positionValue: 8_000_000 },
        { coin: 'ETH', chartSymbol: 'ETH-USD', isLong: false, side: 'SHORT', size: 2000, markPx: 2500, positionValue: 5_000_000 },
        { coin: 'SOL', chartSymbol: 'SOL-USD', isLong: true, side: 'LONG', size: 10000, markPx: 150, positionValue: 1_500_000 }
      ]
    }
  ];

  // 1. Mark price swings by +20% on BTC without any contract size change -> ZERO rebalance deltas
  const markOnlyNext = [
    {
      address: '0xaaa1',
      name: 'W1',
      positions: [
        { coin: 'BTC', chartSymbol: 'BTC-USD', isLong: true, side: 'LONG', size: 100, markPx: 96000, positionValue: 9_600_000 },
        { coin: 'ETH', chartSymbol: 'ETH-USD', isLong: false, side: 'SHORT', size: 2000, markPx: 2650, positionValue: 5_300_000 },
        { coin: 'SOL', chartSymbol: 'SOL-USD', isLong: true, side: 'LONG', size: 10000, markPx: 165, positionValue: 1_650_000 }
      ]
    }
  ];
  assert.deepEqual(detectPositionDeltas(prev, markOnlyNext, { minDeltaUsd: 10_000 }), []);

  // 2. Real contract executions: trim ETH short by 500 (-$1.25M), close SOL long (-$1.5M), open DOGE long (+$300K)
  const executedNext = [
    {
      address: '0xaaa1',
      name: 'W1',
      positions: [
        { coin: 'BTC', chartSymbol: 'BTC-USD', isLong: true, side: 'LONG', size: 100, markPx: 96000, positionValue: 9_600_000 },
        { coin: 'ETH', chartSymbol: 'ETH-USD', isLong: false, side: 'SHORT', size: 1500, markPx: 2500, positionValue: 3_750_000 },
        { coin: 'DOGE', chartSymbol: 'DOGE-USD', isLong: true, side: 'LONG', size: 1_000_000, markPx: 0.3, positionValue: 300_000 }
      ]
    }
  ];
  const nowTs = 1_794_300_123_000;
  const deltas = detectPositionDeltas(prev, executedNext, { minDeltaUsd: 10_000, now: nowTs });
  const byCoin = new Map(deltas.map(d => [d.coin, d]));

  assert.equal(byCoin.has('BTC'), false, 'BTC unchanged contract count produces no delta');
  assert.equal(byCoin.get('ETH')?.actionText, '减空');
  assert.equal(byCoin.get('ETH')?.isIncrease, false);
  assert.equal(byCoin.get('ETH')?.deltaAbs, 1_250_000);
  assert.equal(byCoin.get('ETH')?.detectedAt, nowTs);
  assert.equal(byCoin.get('SOL')?.actionText, '平多');
  assert.equal(byCoin.get('SOL')?.isIncrease, false);
  assert.equal(byCoin.get('SOL')?.deltaAbs, 1_500_000);
  assert.equal(byCoin.get('DOGE')?.actionText, '开多');
  assert.equal(byCoin.get('DOGE')?.isIncrease, true);
  assert.equal(byCoin.get('DOGE')?.deltaAbs, 300_000);

  // 3. Position flips side from LONG -> SHORT
  const flippedNext = [
    {
      address: '0xaaa1',
      name: 'W1',
      positions: [
        { coin: 'BTC', chartSymbol: 'BTC-USD', isLong: false, side: 'SHORT', size: 25, markPx: 80000, positionValue: 2_000_000 }
      ]
    }
  ];
  const flipDeltas = detectPositionDeltas(prev, flippedNext, { minDeltaUsd: 10_000, now: nowTs });
  const btcFlip = flipDeltas.find(d => d.coin === 'BTC');
  assert.equal(btcFlip?.actionText, '反手空');
  assert.equal(btcFlip?.isLong, false);
  assert.equal(btcFlip?.isIncrease, true);
  assert.equal(btcFlip?.deltaAbs, 2_000_000);
});

test('TradFi Top 10 filter: computeWhaleSankeyGraph & buildAggregatedPositions strictly limit to top 10 assets by volume (top 5 individual + other 5, excluding ranks 11+)', () => {
  // Create 15 distinct assets with descending on-chain volumes
  const coins = ['NVDA', 'SKHX', 'XYZ100', 'SOXL', 'SP500', 'AMD', 'QQQ', 'TSLA', 'AAPL', 'MSTR', 'COIN', 'META', 'AMZN', 'MSFT', 'PLTR'];
  const volumeMap = new Map();
  coins.forEach((c, idx) => {
    volumeMap.set(c, (1000 - idx * 50) * 1_000_000); // NVDA $1000M, SKHX $950M ... PLTR $300M
  });

  const whales = [
    {
      address: '0x1001',
      name: 'HL Whale 1',
      positions: coins.map((c, i) => ({
        coin: c,
        isLong: i % 2 === 0,
        side: i % 2 === 0 ? 'LONG' : 'SHORT',
        positionValue: (i + 1) * 1_000_000
      }))
    },
    {
      address: '0x1002',
      name: 'HL Whale 2',
      positions: coins.map((c, i) => ({
        coin: c,
        isLong: true,
        side: 'LONG',
        positionValue: 2_000_000
      }))
    }
  ];

  // 1. computeWhaleSankeyGraph with topAssetsLimit=10, maxAssets=5
  const graph = computeWhaleSankeyGraph({
    whales,
    mode: 'all',
    assetVolumeMap: volumeMap,
    maxWallets: 6,
    maxAssets: 5,
    topAssetsLimit: 10
  });

  // Verify exactly 6 target nodes: top 5 individual + 1 OTHER
  assert.equal(graph.assetNodes.length, 6);
  assert.deepEqual(
    graph.assetNodes.slice(0, 5).map(a => a.symbol),
    ['NVDA', 'SKHX', 'XYZ100', 'SOXL', 'SP500']
  );

  const otherNode = graph.assetNodes[5];
  assert.equal(otherNode.symbol, 'OTHER');
  assert.equal(otherNode.isOther, true);
  assert.equal(otherNode.subLabel, '其他 5 个标的');

  // Verify rank 11+ (COIN, META, AMZN, MSFT, PLTR) are strictly excluded from graph links
  const targetSymbols = new Set(graph.links.map(l => l.assetSymbol));
  for (const excluded of ['COIN', 'META', 'AMZN', 'MSFT', 'PLTR']) {
    assert.equal(targetSymbols.has(excluded), false, `${excluded} (rank 11+) must be excluded from Sankey links`);
  }

  // Verify OTHER node value equals sum of positions in ranks 6-10 (AMD, QQQ, TSLA, AAPL, MSTR)
  const rank6to10 = ['AMD', 'QQQ', 'TSLA', 'AAPL', 'MSTR'];
  let expectedOtherVal = 0;
  for (const w of whales) {
    for (const p of w.positions) {
      if (rank6to10.includes(p.coin)) expectedOtherVal += p.positionValue;
    }
  }
  assert.equal(otherNode.totalVal, expectedOtherVal);

  // Verify strict flow conservation: sum of wallet totals === sum of asset totals === graph.total
  const sumWallets = graph.walletNodes.reduce((s, w) => s + w.totalVal, 0);
  const sumAssets = graph.assetNodes.reduce((s, a) => s + a.totalVal, 0);
  assert.ok(Math.abs(sumWallets - sumAssets) < 1e-6);
  assert.ok(Math.abs(graph.total - sumAssets) < 1e-6);

  // 2. buildAggregatedPositions with topAssetsLimit=10
  const agg = buildAggregatedPositions(whales, {
    assetVolumeMap: volumeMap,
    topAssetsLimit: 10
  });

  // Exactly 10 rows returned, strictly matching top 10 on-chain volume
  assert.equal(agg.length, 10);
  assert.deepEqual(
    agg.map(r => r.symbol),
    ['NVDA', 'SKHX', 'XYZ100', 'SOXL', 'SP500', 'AMD', 'QQQ', 'TSLA', 'AAPL', 'MSTR']
  );

  // Sorting by longVal sorts within these 10 assets
  const aggSortedByLong = buildAggregatedPositions(whales, {
    assetVolumeMap: volumeMap,
    topAssetsLimit: 10,
    sortField: 'longVal',
    sortDir: 'desc'
  });
  assert.equal(aggSortedByLong.length, 10);
  for (const item of aggSortedByLong) {
    assert.ok(coins.slice(0, 10).includes(item.symbol), 'Must remain within top 10 assets');
  }
});


