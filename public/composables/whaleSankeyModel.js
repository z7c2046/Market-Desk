/**
 * Whale Position Sankey Layout & Aggregation Model
 * Pure framework-free helper computing geometry, conservation-strict ribbon stacks,
 * wallet disambiguation, and multi-market position summaries for Market Desk.
 */

export const ASSET_ZH_LABELS = {
  // Crypto
  BTC: '比特币',
  ETH: '以太坊',
  SOL: 'Solana',
  HYPE: 'Hyperliquid',
  XRP: '瑞波币',
  DOGE: '狗狗币',
  BNB: '币安币',
  SUI: 'Sui',
  AVAX: '雪崩协议',
  LINK: 'Chainlink',
  ADA: '艾达币',
  NEAR: 'NEAR',
  WLD: 'Worldcoin',
  ZEC: 'Zcash',
  TRUMP: 'TRUMP',
  AAVE: 'Aave',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  UNI: 'Uniswap',
  PEPE: 'Pepe',
  TON: 'Toncoin',
  // TradFi & HIP-3 (TradeXYZ)
  NVDA: '英伟达',
  MU: '美光科技',
  TSLA: '特斯拉',
  AMD: '超威半导体',
  MSFT: '微软',
  AAPL: '苹果',
  AMZN: '亚马逊',
  META: 'Meta',
  GOOGL: '谷歌',
  MSTR: '微策略',
  COIN: 'Coinbase',
  SPY: '标普 500 ETF',
  QQQ: '纳指 100 ETF',
  XYZ100: '纳指 100 合约',
  SP500: '标普 500 合约',
  GOLD: '黄金',
  SILVER: '白银',
  CL: 'WTI 原油',
  BRENTOIL: '布伦特原油',
  NATGAS: '天然气',
  COPPER: '铜',
  INTC: '英特尔',
  IBM: 'IBM',
  SNDK: '闪迪',
  SOXL: '三倍做多半导体',
  SKHX: 'SK 海力士',
  SKHY: 'SK 海力士 ADR',
  SMSN: '三星电子',
  HOOD: 'Robinhood',
  ORCL: '甲骨文',
  DELL: '戴尔',
  CRCL: 'Circle',
  RKLB: 'Rocket Lab',
  LLY: '礼来',
  SPCX: 'SpaceX 指数',
  ANT: 'Anthropic 指数',
  DRAM: '存储指数',
  UNITREE: '宇树科技指数',
  MRNA: 'Moderna',
  EWY: '韩国 ETF',
  KORU: '三倍做多韩国',
  NBIS: 'Nebius',
  CRWV: 'CoreWeave',
  MRVL: '迈威尔科技',
  HIMS: 'Hims & Hers',
  CBRS: 'Cerebras 指数',
  LITE: 'Lumentum',
  PLTR: 'Palantir',
  WDC: '西部数据',
  STX: '希捷科技',
  AVGO: '博通',
  TSM: '台积电',
  NFLX: '奈飞',
  COST: '好市多',
  UNH: '联合健康',
  JPM: '摩根大通',
  BA: '波音',
  XOM: '埃克森美孚',
  OTHER: '其他长尾标的'
};

export function getAssetLabel(symbol) {
  const key = String(symbol || '').toUpperCase();
  return ASSET_ZH_LABELS[key] || '';
}

function stripHexAddressSuffix(name) {
  return String(name || '')
    .replace(/\s*0x[a-f0-9]{4,}\.{3}[a-f0-9]{3,}\s*$/i, '')
    .trim() || 'HL 巨鲸';
}

export function formatWhaleCompactUsd(val) {
  if (val == null || Number.isNaN(Number(val))) return '$0';
  const num = Math.abs(Number(val));
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${Math.round(num)}`;
}

export function formatSignedWhaleCompactUsd(val) {
  const num = Number(val) || 0;
  if (Math.abs(num) < 1) return '$0';
  return `${num < 0 ? '−' : '+'}${formatWhaleCompactUsd(Math.abs(num))}`;
}

export function truncateText(str, maxLen = 13) {
  const s = String(str || '').trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

export function truncateVisualText(str, maxUnits = 28) {
  const s = String(str || '').trim();
  let totalUnits = 0;
  for (let i = 0; i < s.length; i++) {
    totalUnits += s.charCodeAt(i) > 255 ? 2 : 1;
  }
  if (totalUnits <= maxUnits) return s;
  const budget = Math.max(2, maxUnits - 2);
  let used = 0;
  let end = 0;
  while (end < s.length) {
    const w = s.charCodeAt(end) > 255 ? 2 : 1;
    if (used + w > budget) break;
    used += w;
    end++;
  }
  return `${s.slice(0, end)}…`;
}

export function isPositionLong(p) {
  if (!p) return false;
  if (p.isLong === true || p.isLong === 'true') return true;
  if (p.isLong === false || p.isLong === 'false') return false;
  const side = String(p.side || '').toUpperCase();
  if (side === 'LONG' || side === 'BUY') return true;
  if (side === 'SHORT' || side === 'SELL') return false;
  const sideLabel = String(p.sideLabel || '');
  if (sideLabel.includes('多') || sideLabel.includes('买')) return true;
  if (sideLabel.includes('空') || sideLabel.includes('卖')) return false;
  const szi = parseFloat(p.szi);
  if (Number.isFinite(szi) && Math.abs(szi) > 1e-6) return szi > 0;
  return false;
}

/**
 * Ensures every wallet in the active dataset has a deterministic unique `walletKey`,
 * even if upstream data reuses an address across distinct curated strategies.
 */
export function disambiguateWallets(whales = []) {
  const counts = new Map();
  return (Array.isArray(whales) ? whales : []).map((w, idx) => {
    const rawAddr = String(w?.address || `wallet-${idx}`);
    const seen = (counts.get(rawAddr) || 0) + 1;
    counts.set(rawAddr, seen);
    const walletKey = seen === 1 ? rawAddr : `${rawAddr}#${seen}`;
    const shortAddress = w?.shortAddress || (
      rawAddr.length > 10 ? `${rawAddr.slice(0, 6)}...${rawAddr.slice(-4)}` : rawAddr
    );
    const rawPositions = Array.isArray(w?.positions) ? w.positions : [];
    let longSum = 0;
    let shortSum = 0;
    let unrealizedPnl = 0;
    const positions = rawPositions.map(p => {
      const isLong = isPositionLong(p);
      const val = Math.max(0, Number(p?.positionValue) || 0);
      if (isLong) longSum += val;
      else shortSum += val;
      unrealizedPnl += Number(p?.unrealizedPnl) || 0;
      return {
        ...p,
        isLong,
        side: p?.side || (isLong ? 'LONG' : 'SHORT'),
        sideLabel: p?.sideLabel || (isLong ? '做多' : '做空'),
        positionValue: val
      };
    });
    const grossPos = longSum + shortSum;
    const totalNtl = Number(w?.totalNtlPos) > 0 && grossPos === 0 ? Number(w.totalNtlPos) : grossPos;
    const longPct = totalNtl > 0 ? Math.round((longSum / totalNtl) * 100) : 50;

    return {
      ...w,
      walletKey,
      shortAddress,
      positions,
      longNotional: longSum,
      shortNotional: shortSum,
      grossPositionNotional: grossPos,
      totalNtlPos: totalNtl,
      netExposure: longSum - shortSum,
      unrealizedPnl,
      walletLongPct: longPct,
      walletShortPct: 100 - longPct
    };
  });
}

function normalizeWalletCoinMap(wallet) {
  const map = new Map();
  for (const p of (wallet?.positions || [])) {
    const coin = String(p?.coin || '').trim().toUpperCase();
    if (!coin) continue;
    const val = Math.max(0, Number(p?.positionValue) || 0);
    if (val <= 0) continue;
    const isLong = isPositionLong(p);
    if (!map.has(coin)) {
      map.set(coin, {
        coin,
        chartSymbol: p?.chartSymbol || coin,
        longVal: 0,
        shortVal: 0
      });
    }
    const entry = map.get(coin);
    if (isLong) entry.longVal += val;
    else entry.shortVal += val;
  }
  return map;
}

function measurePair(entry, mode) {
  if (!entry) return 0;
  if (mode === 'long') return entry.longVal;
  if (mode === 'short') return entry.shortVal;
  return entry.longVal + entry.shortVal;
}

function buildRibbonPath(sx, sy, tx, ty, h) {
  const bend = (tx - sx) * 0.48;
  return `M${sx.toFixed(2)},${sy.toFixed(2)} C${(sx + bend).toFixed(2)},${sy.toFixed(2)} ${(tx - bend).toFixed(2)},${ty.toFixed(2)} ${tx.toFixed(2)},${ty.toFixed(2)} L${tx.toFixed(2)},${(ty + h).toFixed(2)} C${(tx - bend).toFixed(2)},${(ty + h).toFixed(2)} ${(sx + bend).toFixed(2)},${(sy + h).toFixed(2)} ${sx.toFixed(2)},${(sy + h).toFixed(2)}Z`;
}

function buildSpinePath(sx, cyS, tx, cyT) {
  const bend = (tx - sx) * 0.48;
  return `M${sx.toFixed(2)},${cyS.toFixed(2)} C${(sx + bend).toFixed(2)},${cyS.toFixed(2)} ${(tx - bend).toFixed(2)},${cyT.toFixed(2)} ${tx.toFixed(2)},${cyT.toFixed(2)}`;
}

function sum(arr) {
  let acc = 0;
  for (let i = 0; i < arr.length; i++) acc += arr[i];
  return acc;
}

const ASSET_VOLUME_ALIASES = {
  XYZ100: 'QQQ',
  QQQ: 'XYZ100',
  SP500: 'SPY',
  SPY: 'SP500'
};

function readAssetVolume(assetVolumeMap, symbol) {
  if (!assetVolumeMap || !symbol) return 0;
  const key = String(symbol).trim().toUpperCase();
  if (!key) return 0;
  const alias = ASSET_VOLUME_ALIASES[key] || '';
  if (typeof assetVolumeMap.get === 'function' && typeof assetVolumeMap.entries === 'function') {
    const direct = Number(assetVolumeMap.get(key) ?? assetVolumeMap.get(symbol));
    if (Number.isFinite(direct) && direct > 0) return direct;
    if (alias) {
      const aliasVal = Number(assetVolumeMap.get(alias));
      if (Number.isFinite(aliasVal) && aliasVal > 0) return aliasVal;
    }
    for (const [k, v] of assetVolumeMap.entries()) {
      const kUpper = String(k || '').trim().toUpperCase();
      if (kUpper === key || (alias && kUpper === alias)) {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : 0;
      }
    }
    return 0;
  }
  if (typeof assetVolumeMap === 'object') {
    const direct = Number(assetVolumeMap[key] ?? assetVolumeMap[symbol]);
    if (Number.isFinite(direct) && direct > 0) return direct;
    if (alias) {
      const aliasVal = Number(assetVolumeMap[alias]);
      if (Number.isFinite(aliasVal) && aliasVal > 0) return aliasVal;
    }
    for (const [k, v] of Object.entries(assetVolumeMap)) {
      const kUpper = String(k || '').trim().toUpperCase();
      if (kUpper === key || (alias && kUpper === alias)) {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : 0;
      }
    }
  }
  return 0;
}

/**
 * Computes full Sankey graph coordinates and conservation-strict link stacks.
 */
export function computeWhaleSankeyGraph({
  whales = [],
  mode = 'all',
  selectedWalletKey = '',
  hoveredWalletKey = '',
  searchQuery = '',
  pulseKeys = new Set(),
  assetVolumeMap = null,
  maxWallets = 6,
  maxAssets = 5,
  topAssetsLimit = 0,
  svgWidth = 1280,
  baseHeight = 462
} = {}) {
  const activeMode = mode === 'long' || mode === 'short' ? mode : 'all';
  const q = String(searchQuery || '').trim().toUpperCase();
  const normalizedWallets = disambiguateWallets(whales);

  // Filter & rank wallets active in current mode/search
  const candidates = [];
  for (const w of normalizedWallets) {
    if (q) {
      const mName = String(w.name || '').toUpperCase().includes(q);
      const mAddr = String(w.address || '').toUpperCase().includes(q);
      const mTag = String(w.tag || '').toUpperCase().includes(q);
      const mCoin = (w.positions || []).some(p => String(p.coin || '').toUpperCase().includes(q));
      if (!mName && !mAddr && !mTag && !mCoin) continue;
    }
    const coinMap = normalizeWalletCoinMap(w);
    let modeTotal = 0;
    let modeLong = 0;
    let modeShort = 0;
    for (const pair of coinMap.values()) {
      modeLong += pair.longVal;
      modeShort += pair.shortVal;
      modeTotal += measurePair(pair, activeMode);
    }
    if (modeTotal <= 0) continue;
    candidates.push({
      ...w,
      coinMap,
      modeTotal,
      modeLong,
      modeShort
    });
  }

  candidates.sort((a, b) => b.modeTotal - a.modeTotal);

  if (!candidates.length) {
    return {
      isEmpty: true,
      mode: activeMode,
      svgWidth,
      svgHeight: 340,
      walletNodes: [],
      assetNodes: [],
      links: [],
      layout: { walletTotals: [], assetTotals: [], total: 0, scale: 0, source: [], target: [], links: [] }
    };
  }

  // Aggregate asset totals across all eligible candidate wallets first so wallet filtering/ranking
  // stays consistent with the scoped Top N asset pool (prevents $0 ghost wallets in Sankey).
  const assetAggregate = new Map();
  for (const w of candidates) {
    for (const pair of w.coinMap.values()) {
      const mVal = measurePair(pair, activeMode);
      if (mVal <= 0) continue;
      if (!assetAggregate.has(pair.coin)) {
        assetAggregate.set(pair.coin, {
          symbol: pair.coin,
          chartSymbol: pair.chartSymbol,
          label: getAssetLabel(pair.coin) || pair.coin,
          onchainVolume: readAssetVolume(assetVolumeMap, pair.coin),
          longVal: 0,
          shortVal: 0,
          modeTotal: 0,
          hasSearchMatch: q ? pair.coin.includes(q) : false
        });
      }
      const agg = assetAggregate.get(pair.coin);
      agg.longVal += pair.longVal;
      agg.shortVal += pair.shortVal;
      agg.modeTotal += mVal;
    }
  }

  const sortedAssets = [...assetAggregate.values()].sort((a, b) => {
    if (a.hasSearchMatch !== b.hasSearchMatch) return a.hasSearchMatch ? -1 : 1;
    if (b.onchainVolume !== a.onchainVolume) return b.onchainVolume - a.onchainVolume;
    return b.modeTotal - a.modeTotal;
  });

  if (!sortedAssets.length) {
    return {
      isEmpty: true,
      mode: activeMode,
      svgWidth,
      svgHeight: 340,
      walletNodes: [],
      assetNodes: [],
      links: [],
      layout: { walletTotals: [], assetTotals: [], total: 0, scale: 0, source: [], target: [], links: [] }
    };
  }

  // When topAssetsLimit is specified and no search query, strictly limit the asset pool to top N assets by on-chain volume
  const eligibleAssets = (topAssetsLimit > 0 && !q && sortedAssets.length > topAssetsLimit)
    ? sortedAssets.slice(0, topAssetsLimit)
    : sortedAssets;
  const eligibleSymbolSet = new Set(eligibleAssets.map(a => a.symbol));

  // Rank wallets by their position value inside the eligible asset pool and drop zero-contribution wallets
  // (unless explicitly selected) so Sankey never displays empty "$0" wallet slots.
  const scopedCandidates = candidates
    .map(w => {
      let scopedTotal = 0;
      for (const sym of eligibleSymbolSet) {
        const pair = w.coinMap.get(sym);
        if (pair) scopedTotal += measurePair(pair, activeMode);
      }
      return { ...w, scopedTotal };
    })
    .filter(w => w.scopedTotal > 0 || (selectedWalletKey && w.walletKey === selectedWalletKey))
    .sort((a, b) => (b.scopedTotal - a.scopedTotal) || (b.modeTotal - a.modeTotal));

  if (!scopedCandidates.length) {
    return {
      isEmpty: true,
      mode: activeMode,
      svgWidth,
      svgHeight: 340,
      walletNodes: [],
      assetNodes: [],
      links: [],
      layout: { walletTotals: [], assetTotals: [], total: 0, scale: 0, source: [], target: [], links: [] }
    };
  }

  // Pick top N active wallets in scoped assets; guarantee selectedWalletKey is included if user explicitly selected it
  let displayWallets = scopedCandidates.slice(0, maxWallets);
  if (selectedWalletKey && !displayWallets.some(w => w.walletKey === selectedWalletKey)) {
    const picked = scopedCandidates.find(w => w.walletKey === selectedWalletKey);
    if (picked) {
      if (displayWallets.length >= maxWallets) {
        displayWallets = [...displayWallets.slice(0, maxWallets - 1), picked];
      } else {
        displayWallets = [...displayWallets, picked];
      }
    }
  }

  let displayAssets = eligibleAssets;
  let otherSymbols = null;
  if (eligibleAssets.length > maxAssets) {
    const head = eligibleAssets.slice(0, maxAssets);
    const tail = eligibleAssets.slice(maxAssets);
    otherSymbols = new Set(tail.map(t => t.symbol));
    const otherBucket = {
      symbol: 'OTHER',
      chartSymbol: head[0]?.chartSymbol || 'BTC-USD',
      label: `其他 ${tail.length} 个标的`,
      onchainVolume: 0,
      longVal: sum(tail.map(t => t.longVal)),
      shortVal: sum(tail.map(t => t.shortVal)),
      modeTotal: sum(tail.map(t => t.modeTotal)),
      isOther: true
    };
    displayAssets = [...head, otherBucket];
  }

  // Construct strict matrix[walletIdx][assetIdx] with exact conservation
  const matrix = displayWallets.map(w => {
    return displayAssets.map(a => {
      if (a.isOther && otherSymbols) {
        let longVal = 0;
        let shortVal = 0;
        let value = 0;
        for (const sym of otherSymbols) {
          const p = w.coinMap.get(sym);
          if (p) {
            longVal += p.longVal;
            shortVal += p.shortVal;
            value += measurePair(p, activeMode);
          }
        }
        return { value, longVal, shortVal };
      }
      const p = w.coinMap.get(a.symbol);
      if (!p) return { value: 0, longVal: 0, shortVal: 0 };
      return {
        value: measurePair(p, activeMode),
        longVal: p.longVal,
        shortVal: p.shortVal
      };
    });
  });

  const walletTotals = matrix.map(row => sum(row.map(c => c.value)));
  const assetTotals = displayAssets.map((_, j) => sum(matrix.map(row => row[j].value)));
  const total = sum(walletTotals);

  const maxNodes = Math.max(displayWallets.length, displayAssets.length);
  const topY = 50;
  const bottomPad = 18;
  const gap = maxNodes >= 6 ? 12 : 20;
  const minSourceSlot = 52;
  const minTargetSlot = 42;

  const minSourceColH = displayWallets.length * minSourceSlot + Math.max(0, displayWallets.length - 1) * gap;
  const minTargetColH = displayAssets.length * minTargetSlot + Math.max(0, displayAssets.length - 1) * gap;
  const minRequiredH = Math.max(minSourceColH, minTargetColH);
  const flowHeadroom = maxNodes <= 2 ? 105 : Math.max(95, maxNodes * 16);
  const availableH = Math.max(baseHeight - topY - bottomPad, minRequiredH + flowHeadroom);
  const svgHeight = Math.round(topY + availableH + bottomPad);

  // Binary search scale so both columns stay within vertical bounds while guaranteeing generous ribbon thickness
  const targetFillCap = maxNodes <= 2
    ? Math.min(availableH * 0.72, maxNodes * 115)
    : availableH;

  let low = 0;
  let high = targetFillCap / (total || 1);
  for (let iter = 0; iter < 36; iter++) {
    const k = (low + high) / 2;
    const sourceUsed = sum(walletTotals.map(v => Math.max(minSourceSlot, v * k))) + Math.max(0, displayWallets.length - 1) * gap;
    const targetUsed = sum(assetTotals.map(v => Math.max(minTargetSlot, v * k))) + Math.max(0, displayAssets.length - 1) * gap;
    if (Math.max(sourceUsed, targetUsed) <= availableH) low = k;
    else high = k;
  }
  const scale = low;

  const computeSlots = (totals, minSlot) => {
    const used = sum(totals.map(v => Math.max(minSlot, v * scale))) + Math.max(0, totals.length - 1) * gap;
    let cursorY = topY + Math.max(0, (availableH - used) / 2);
    return totals.map(v => {
      const h = v * scale;
      const slot = Math.max(minSlot, h);
      const y = cursorY + (slot - h) / 2;
      const slotMiddleY = cursorY + slot / 2;
      cursorY += slot + gap;
      return { y, h, middleY: y + h / 2, slotMiddleY };
    });
  };

  const sourceSlots = computeSlots(walletTotals, minSourceSlot);
  const targetSlots = computeSlots(assetTotals, minTargetSlot);

  const sx = 232;
  const tx = 1020;
  const targetOffsets = targetSlots.map(s => s.y);
  const links = [];
  const layoutLinksMatrix = [];
  let activePulseIdx = 0;

  for (let i = 0; i < displayWallets.length; i++) {
    let sourceOffset = sourceSlots[i].y;
    const rowLinks = [];
    const w = displayWallets[i];
    for (let j = 0; j < displayAssets.length; j++) {
      const cell = matrix[i][j];
      const h = cell.value * scale;
      const sy = sourceOffset;
      const ty = targetOffsets[j];
      sourceOffset += h;
      targetOffsets[j] += h;
      rowLinks.push({ sy, ty, h, value: cell.value });

      if (cell.value > 0) {
        const a = displayAssets[j];
        const isLongDominant = cell.longVal >= cell.shortVal;
        const activeFocusKey = selectedWalletKey || hoveredWalletKey;
        const isSelectedWallet = Boolean(selectedWalletKey && w.walletKey === selectedWalletKey);
        const isFocus = Boolean(activeFocusKey && w.walletKey === activeFocusKey);
        const isDimmed = Boolean(selectedWalletKey && w.walletKey !== selectedWalletKey);
        const pulseKey = `${w.walletKey}::${a.symbol}`;
        let isPulseActive = false;
        let pulseIsIncrease = true;
        if (pulseKeys && typeof pulseKeys.get === 'function') {
          let meta = pulseKeys.get(pulseKey);
          if (!meta && a.isOther && otherSymbols) {
            for (const sym of otherSymbols) {
              meta = pulseKeys.get(`${w.walletKey}::${sym}`);
              if (meta) break;
            }
          }
          if (meta) {
            isPulseActive = true;
            pulseIsIncrease = meta.isIncrease !== false;
          }
        } else if (pulseKeys && typeof pulseKeys.has === 'function') {
          isPulseActive = pulseKeys.has(pulseKey)
            || Boolean(a.isOther && otherSymbols && [...otherSymbols].some(sym => pulseKeys.has(`${w.walletKey}::${sym}`)));
        }
        const pulseDelay = isPulseActive ? `${((activePulseIdx++) % 4) * 0.55}s` : '0s';

        links.push({
          id: `${w.walletKey}__${a.symbol}`,
          walletKey: w.walletKey,
          walletName: w.name,
          assetSymbol: a.symbol,
          assetLabel: a.label,
          chartSymbol: a.chartSymbol,
          value: cell.value,
          longVal: cell.longVal,
          shortVal: cell.shortVal,
          isLongDominant,
          sideLabel: activeMode === 'long' ? '多仓' : activeMode === 'short' ? '空仓' : (cell.longVal > 0 && cell.shortVal > 0 ? '多空合计' : (isLongDominant ? '多仓' : '空仓')),
          walletSharePct: walletTotals[i] > 0 ? Math.round((cell.value / walletTotals[i]) * 100) : 0,
          assetSharePct: assetTotals[j] > 0 ? Math.round((cell.value / assetTotals[j]) * 100) : 0,
          sy,
          ty,
          h,
          d: buildRibbonPath(sx, sy, tx, ty, h),
          spineD: buildSpinePath(sx, sy + h / 2, tx, ty + h / 2),
          isSelectedWallet,
          isFocus,
          isDimmed,
          isPulseActive,
          pulseIsIncrease,
          pulseDelay
        });
      }
    }
    layoutLinksMatrix.push(rowLinks);
  }

  const selectedIndex = selectedWalletKey
    ? displayWallets.findIndex(w => w.walletKey === selectedWalletKey)
    : -1;

  const walletNodes = displayWallets.map((w, i) => {
    const slot = sourceSlots[i];
    const totalW = walletTotals[i];
    const selected = w.walletKey === selectedWalletKey;
    const dimmed = Boolean(selectedWalletKey && !selected);
    const middleY = slot.slotMiddleY;
    return {
      walletKey: w.walletKey,
      address: w.address,
      shortAddress: w.shortAddress,
      name: stripHexAddressSuffix(w.name),
      displayName: truncateVisualText(stripHexAddressSuffix(w.name), 28),
      tagText: truncateVisualText(w.tag || '巨鲸', 28),
      rankBadge: String(i + 1).padStart(2, '0'),
      avatar: w.avatar || '🐋',
      totalVal: totalW,
      formattedVal: formatWhaleCompactUsd(totalW),
      longVal: w.modeLong,
      shortVal: w.modeShort,
      y: slot.y,
      h: slot.h,
      middleY,
      selected,
      dimmed
    };
  });

  const assetNodes = displayAssets.map((a, j) => {
    const slot = targetSlots[j];
    const totalA = assetTotals[j];
    const contribCell = selectedIndex >= 0 ? matrix[selectedIndex][j] : null;
    const contribVal = contribCell ? contribCell.value : 0;
    const grossPair = a.longVal + a.shortVal;
    const longShare = grossPair > 0 ? a.longVal / grossPair : 0.5;
    const dimmed = Boolean(selectedWalletKey && contribVal <= 0);
    const middleY = slot.slotMiddleY;
    const volVal = a.isOther ? 0 : (a.onchainVolume || 0);
    const formattedVolume = volVal > 0 ? formatWhaleCompactUsd(volVal) : '';
    const cleanLabel = a.isOther
      ? a.label
      : (a.label && a.label !== a.symbol ? a.label : '');
    const subLabel = formattedVolume
      ? (a.label && a.label !== a.symbol ? `${a.label} · 量 ${formattedVolume}` : `量 ${formattedVolume}`)
      : a.label;

    const displayTotalVal = activeMode === 'long'
      ? a.longVal
      : (activeMode === 'short' ? a.shortVal : grossPair);

    return {
      symbol: a.symbol,
      displaySymbol: a.isOther ? '其他' : a.symbol,
      label: a.label,
      cleanLabel,
      volumeVal: volVal,
      formattedVolume,
      subLabel,
      chartSymbol: a.chartSymbol,
      isOther: Boolean(a.isOther),
      totalVal: displayTotalVal,
      formattedVal: formatWhaleCompactUsd(displayTotalVal),
      flowVal: totalA,
      formattedFlowVal: formatWhaleCompactUsd(totalA),
      longVal: a.longVal,
      shortVal: a.shortVal,
      longPct: Math.round(longShare * 100),
      longBarW: Number((48 * longShare).toFixed(1)),
      selectedContribVal: contribVal,
      selectedContribText: contribVal > 0 ? `占 ${displayTotalVal > 0 ? Math.round((contribVal / displayTotalVal) * 100) : 0}% · ${formatWhaleCompactUsd(contribVal)}` : '',
      y: slot.y,
      h: slot.h,
      middleY,
      dimmed
    };
  });

  return {
    isEmpty: false,
    mode: activeMode,
    svgWidth,
    svgHeight,
    total,
    totalLong: sum(displayAssets.map(a => a.longVal)),
    totalShort: sum(displayAssets.map(a => a.shortVal)),
    walletNodes,
    assetNodes,
    links,
    layout: {
      walletTotals,
      assetTotals,
      total,
      scale,
      source: sourceSlots,
      target: targetSlots,
      links: layoutLinksMatrix
    }
  };
}

/**
 * Builds aggregated asset breakdown across all provided wallets (`全部钱包 · 持仓明细`).
 */
export function buildAggregatedPositions(whales = [], { mode = 'all', searchQuery = '', assetVolumeMap = null, sortField = '', sortDir = 'desc', topAssetsLimit = 0 } = {}) {
  const activeMode = mode === 'long' || mode === 'short' ? mode : 'all';
  const q = String(searchQuery || '').trim().toUpperCase();
  const normalizedField = (sortField === 'longVal' || sortField === 'shortVal' || sortField === 'totalVal' || sortField === 'volume') ? sortField : '';
  const normalizedDir = sortDir === 'asc' ? 'asc' : 'desc';
  const byCoin = new Map();

  for (const w of (Array.isArray(whales) ? whales : [])) {
    for (const p of (w?.positions || [])) {
      const symbol = String(p?.coin || '').trim().toUpperCase();
      if (!symbol) continue;
      if (q && !symbol.includes(q) && !getAssetLabel(symbol).toUpperCase().includes(q)) {
        // Keep asset visible if wallet matched query, OR only match symbol? Wait: if searching wallet name, keep all its coins!
        const walletMatched = String(w?.name || '').toUpperCase().includes(q)
          || String(w?.address || '').toUpperCase().includes(q)
          || String(w?.tag || '').toUpperCase().includes(q);
        if (!walletMatched) continue;
      }
      const val = Math.max(0, Number(p?.positionValue) || 0);
      if (val <= 0) continue;
      const isLong = isPositionLong(p);
      if (activeMode === 'long' && !isLong) continue;
      if (activeMode === 'short' && isLong) continue;

      if (!byCoin.has(symbol)) {
        byCoin.set(symbol, {
          symbol,
          label: getAssetLabel(symbol),
          chartSymbol: p?.chartSymbol || symbol,
          longVal: 0,
          shortVal: 0,
          totalVal: 0,
          longCount: 0,
          shortCount: 0,
          walletCount: 0,
          _wallets: new Set()
        });
      }
      const agg = byCoin.get(symbol);
      if (isLong) {
        agg.longVal += val;
        agg.longCount += 1;
      } else {
        agg.shortVal += val;
        agg.shortCount += 1;
      }
      agg.totalVal += val;
      agg._wallets.add(w.walletKey || w.address);
    }
  }

  let items = [...byCoin.values()]
    .map(item => {
      const longPct = item.totalVal > 0 ? Math.round((item.longVal / item.totalVal) * 100) : 50;
      const volume24h = readAssetVolume(assetVolumeMap, item.symbol);
      const formattedVolume = volume24h > 0 ? formatWhaleCompactUsd(volume24h) : '';
      const subLabel = formattedVolume
        ? (item.label && item.label !== item.symbol ? `${item.label} · 量 ${formattedVolume}` : `量 ${formattedVolume}`)
        : item.label;
      return {
        symbol: item.symbol,
        label: item.label,
        volume24h,
        formattedVolume,
        subLabel,
        chartSymbol: item.chartSymbol,
        longVal: item.longVal,
        shortVal: item.shortVal,
        totalVal: item.totalVal,
        longPct,
        shortPct: 100 - longPct,
        walletCount: item._wallets.size
      };
    });

  // When topAssetsLimit is specified and no search query, filter to top N assets by on-chain 24h volume
  if (topAssetsLimit > 0 && !q && items.length > topAssetsLimit) {
    items.sort((a, b) => (b.volume24h - a.volume24h) || (b.totalVal - a.totalVal) || a.symbol.localeCompare(b.symbol));
    items = items.slice(0, topAssetsLimit);
  }

  return items.sort((a, b) => {
      if (normalizedField === 'longVal' || normalizedField === 'shortVal' || normalizedField === 'totalVal') {
        const diff = (Number(a[normalizedField]) || 0) - (Number(b[normalizedField]) || 0);
        if (diff !== 0) {
          return normalizedDir === 'asc' ? diff : -diff;
        }
      } else if (normalizedField === 'volume') {
        const diff = (Number(a.volume24h) || 0) - (Number(b.volume24h) || 0);
        if (diff !== 0) {
          return normalizedDir === 'asc' ? diff : -diff;
        }
      }
      return (b.volume24h - a.volume24h) || (b.totalVal - a.totalVal) || a.symbol.localeCompare(b.symbol);
    });
}

/**
 * Compares two snapshots of disambiguated whales and returns genuine position delta events.
 * When positions carry contract `size` (or `szi`), deltas are computed strictly from quantity
 * changes so mark-price fluctuations alone never trigger false rebalance signals.
 */
export function detectPositionDeltas(prevWhales = [], nextWhales = [], { minDeltaUsd = 100000, now = Date.now() } = {}) {
  if (!Array.isArray(prevWhales) || !prevWhales.length || !Array.isArray(nextWhales) || !nextWhales.length) {
    return [];
  }

  const normalizePos = p => {
    const val = Math.max(0, Number(p?.positionValue) || 0);
    const isLong = Boolean(p?.isLong || String(p?.side || '').toUpperCase() === 'LONG');
    const rawSize = p?.size ?? (p?.szi != null ? Math.abs(Number(p.szi)) : null);
    const parsedSize = rawSize != null ? Math.abs(Number(rawSize)) : NaN;
    const hasSize = Number.isFinite(parsedSize) && parsedSize > 0;
    const size = hasSize ? parsedSize : 0;
    const rawMark = Number(p?.markPx);
    const rawEntry = Number(p?.entryPx);
    const unitPx = (Number.isFinite(rawMark) && rawMark > 0)
      ? rawMark
      : ((Number.isFinite(rawEntry) && rawEntry > 0)
          ? rawEntry
          : (hasSize && val > 0 ? val / size : 0));
    return {
      val,
      isLong,
      hasSize,
      size,
      unitPx,
      chartSymbol: p?.chartSymbol || String(p?.coin || '').toUpperCase()
    };
  };

  const prevByKey = new Map();
  for (const w of disambiguateWallets(prevWhales)) {
    const pMap = new Map();
    for (const p of (w.positions || [])) {
      const coin = String(p?.coin || '').toUpperCase();
      if (!coin) continue;
      const np = normalizePos(p);
      if (np.val > 0 || np.hasSize) {
        pMap.set(coin, np);
      }
    }
    prevByKey.set(w.walletKey, pMap);
  }

  const events = [];
  for (const w of disambiguateWallets(nextWhales)) {
    const oldMap = prevByKey.get(w.walletKey);
    if (!oldMap) continue;

    const newMap = new Map();
    for (const p of (w.positions || [])) {
      const coin = String(p?.coin || '').toUpperCase();
      if (!coin) continue;
      const np = normalizePos(p);
      if (np.val > 0 || np.hasSize) {
        newMap.set(coin, np);
      }
    }

    const coins = new Set([...oldMap.keys(), ...newMap.keys()]);
    for (const coin of coins) {
      const oldPos = oldMap.get(coin) || null;
      const nextPos = newMap.get(coin) || null;
      if (!oldPos && !nextPos) continue;

      const useSize = Boolean(
        (!oldPos || oldPos.hasSize) &&
        (!nextPos || nextPos.hasSize) &&
        (oldPos?.hasSize || nextPos?.hasSize)
      );

      let deltaAbs = 0;
      let isLong = nextPos ? nextPos.isLong : oldPos.isLong;
      let isIncrease = true;
      let actionText = '';

      if (oldPos && !nextPos) {
        deltaAbs = useSize
          ? (oldPos.unitPx > 0 ? oldPos.size * oldPos.unitPx : oldPos.val)
          : oldPos.val;
        isLong = oldPos.isLong;
        isIncrease = false;
        actionText = oldPos.isLong ? '平多' : '平空';
      } else if (!oldPos && nextPos) {
        deltaAbs = useSize
          ? (nextPos.unitPx > 0 ? nextPos.size * nextPos.unitPx : nextPos.val)
          : nextPos.val;
        isLong = nextPos.isLong;
        isIncrease = true;
        actionText = nextPos.isLong ? '开多' : '开空';
      } else if (oldPos && nextPos && oldPos.isLong !== nextPos.isLong) {
        deltaAbs = useSize
          ? (nextPos.unitPx > 0 ? nextPos.size * nextPos.unitPx : nextPos.val)
          : nextPos.val;
        isLong = nextPos.isLong;
        isIncrease = true;
        actionText = nextPos.isLong ? '反手多' : '反手空';
      } else if (oldPos && nextPos) {
        if (useSize) {
          const sizeDiff = nextPos.size - oldPos.size;
          if (Math.abs(sizeDiff) <= 1e-8) continue;
          const px = nextPos.unitPx || oldPos.unitPx || (nextPos.val / nextPos.size) || 0;
          deltaAbs = Math.abs(sizeDiff) * px;
          isIncrease = sizeDiff > 0;
        } else {
          const valDiff = nextPos.val - oldPos.val;
          deltaAbs = Math.abs(valDiff);
          isIncrease = valDiff > 0;
        }
        isLong = nextPos.isLong;
        actionText = `${isIncrease ? '加' : '减'}${isLong ? '多' : '空'}`;
      }

      if (deltaAbs >= minDeltaUsd && actionText) {
        events.push({
          id: `delta-${w.walletKey}-${coin}-${now}`,
          walletKey: w.walletKey,
          whaleName: w.name,
          coin,
          chartSymbol: (nextPos || oldPos).chartSymbol || coin,
          isLong,
          isIncrease,
          deltaAbs,
          actionText,
          timeAgo: '刚刚',
          detectedAt: now
        });
      }
    }
  }
  return events.sort((a, b) => b.deltaAbs - a.deltaAbs);
}

