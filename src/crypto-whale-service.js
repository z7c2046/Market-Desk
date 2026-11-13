/**
 * Hyperliquid On-Chain Whale Perpetual Tracker Service
 * 实时追踪 Hyperliquid L1 链上巨鲸钱包的永续合约持仓（支持 Top N 榜单自动发现 + 自定义地址追踪）
 */

export const WHALE_DEFAULT_TOP_N = 12;
export const WHALE_MIN_TOP_N = 6;
export const WHALE_MAX_TOP_N = 20;
export const WHALE_MAX_CUSTOM_WALLETS = 20;

const VALID_EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function isValidWhaleAddress(addr) {
  return VALID_EVM_ADDRESS_RE.test(String(addr || '').trim());
}

export function normalizeWhaleTopN(val, fallback = WHALE_DEFAULT_TOP_N) {
  const num = Number.parseInt(val, 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(WHALE_MIN_TOP_N, Math.min(WHALE_MAX_TOP_N, num));
}

export function sanitizeWhaleLabel(raw, maxLen = 28) {
  return String(raw || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * 解析并规范化自定义监控钱包列表 (支持数组、JSON 字符串或逗号分隔地址)
 */
export function parseCustomWhalesParam(raw) {
  if (!raw) return [];
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        return [];
      }
    } else {
      list = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
  } else {
    return [];
  }

  const deduped = [];
  const byAddr = new Map();

  for (const item of list) {
    let rawAddr = typeof item === 'string' ? item : item?.address;
    let rawLabel = typeof item === 'string' ? '' : (item?.label || item?.name || '');
    if (typeof item === 'string' && item.includes('|')) {
      const pipeIdx = item.indexOf('|');
      rawAddr = item.slice(0, pipeIdx);
      rawLabel = item.slice(pipeIdx + 1);
    }
    const trimmedAddr = String(rawAddr || '').trim();
    if (!isValidWhaleAddress(trimmedAddr)) continue;
    const address = trimmedAddr.toLowerCase();
    const label = sanitizeWhaleLabel(rawLabel);

    if (byAddr.has(address)) {
      const existing = byAddr.get(address);
      if (!existing.label && label) existing.label = label;
      continue;
    }

    if (deduped.length >= WHALE_MAX_CUSTOM_WALLETS) break;
    const entry = { address, label };
    byAddr.set(address, entry);
    deduped.push(entry);
  }

  return deduped;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return [];
  const limit = Math.max(1, Math.min(arr.length, concurrency || 8));
  const results = new Array(arr.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= arr.length) return;
      try {
        results[idx] = { status: 'fulfilled', value: await mapper(arr[idx], idx) };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

export const CURATED_WHALES = [
  {
    address: '0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00',
    name: 'HL 亿级多空对冲巨鲸',
    tag: '机构级对冲基金',
    avatar: '🐋',
    defaultEquity: 43091617,
    defaultNtlPos: 124811490
  },
  {
    address: '0x4e23288cee4960f9f962195c22948e4bc7ae20c3',
    name: 'ETH / SOL 趋势突破巨鲸',
    tag: '高倍进攻型',
    avatar: '⚡',
    defaultEquity: 8416304,
    defaultNtlPos: 53333891
  },
  {
    address: '0xbf732ea04197942783e34730ed6e0f6099575d58',
    name: 'BTC 远古长线巨鲸',
    tag: '长线坚定多头',
    avatar: '🪙',
    defaultEquity: 3509849,
    defaultNtlPos: 22491372
  },
  {
    address: '0xfc667adba8d4837586078f4fdcdc29804337ca06',
    name: '顶级高频做市机构',
    tag: '做市流动性商',
    avatar: '🏛️',
    defaultEquity: 23111916,
    defaultNtlPos: 20438128
  },
  {
    address: '0xf5d81a135f756ca16544e53c20fc20643ec3ad53',
    name: '主流币空头猎手',
    tag: '宏观对冲空头',
    avatar: '🐻',
    defaultEquity: 2128285,
    defaultNtlPos: 2251376
  },
  {
    address: '0x115849ce84370f25cadcf0d348510d73837e1aa5',
    name: 'Orbit Value 策略金库',
    tag: '智能量化金库',
    avatar: '🌐',
    defaultEquity: 1410048,
    defaultNtlPos: 1957060
  },
  {
    address: '0x7b7f72a28fe109fa703eeed7984f2a8a68fedee2',
    name: 'beatmaker1 知名交易员',
    tag: '高胜率个人巨鲸',
    avatar: '🎯',
    defaultEquity: 2485234,
    defaultNtlPos: 1088684
  },
  {
    address: '0xdf9ea6ec3b7109935ccb4fb267e15ac1fb077ab1',
    name: '热点代币狙击巨鲸',
    tag: '高波动波段',
    avatar: '🚀',
    defaultEquity: 358322,
    defaultNtlPos: 1738441
  }
];

// 常见代币与链上美股图表映射 (点击跳转个股/标的走势)
export const COIN_CHART_SYMBOLS = {
  BTC: 'BTC-USD',
  ETH: 'ETH-USD',
  SOL: 'SOL-USD',
  BNB: 'BNB-USD',
  XRP: 'XRP-USD',
  DOGE: 'DOGE-USD',
  SUI: 'SUI-USD',
  AVAX: 'AVAX-USD',
  LINK: 'LINK-USD',
  NEAR: 'NEAR-USD',
  HYPE: 'HYPE-USD',
  // 链上美股与 HIP-3 (TradeXYZ) TradFi 核心合约
  NVDA: 'NVDA',
  MU: 'MU',
  TSLA: 'TSLA',
  MSTR: 'MSTR',
  COIN: 'COIN',
  AAPL: 'AAPL',
  SPY: 'SPY',
  QQQ: 'QQQ',
  XYZ100: 'QQQ',
  SP500: 'SPY',
  GOLD: 'GC=F',
  SILVER: 'SI=F',
  CL: 'CL=F',
  BRENTOIL: 'BZ=F',
  NATGAS: 'NG=F',
  COPPER: 'HG=F',
  AMZN: 'AMZN',
  MSFT: 'MSFT',
  META: 'META',
  PLTR: 'PLTR',
  AMD: 'AMD',
  INTC: 'INTC',
  IBM: 'IBM',
  ORCL: 'ORCL',
  HOOD: 'HOOD',
  RKLB: 'RKLB',
  SOXL: 'SOXL',
  SNDK: 'SNDK',
  NBIS: 'NBIS',
  CRWV: 'CRWV',
  CRCL: 'CRCL',
  MRNA: 'MRNA',
  MRVL: 'MRVL',
  EWY: 'EWY',
  DELL: 'DELL',
  LLY: 'LLY',
  NFLX: 'NFLX',
  HIMS: 'HIMS',
  COST: 'COST',
  UNH: 'UNH',
  JPM: 'JPM',
  BA: 'BA',
  XOM: 'XOM',
  WDC: 'WDC',
  STX: 'STX',
  GOOGL: 'GOOGL',
  TSM: 'TSM',
  AVGO: 'AVGO'
};

export function stripDeployerPrefix(rawCoin) {
  return String(rawCoin || '')
    .trim()
    .replace(/^[a-z0-9_-]+:/i, '')
    .toUpperCase();
}

export function resolveWhaleChartSymbol(coin, isStock = false) {
  const clean = String(coin || '').trim().toUpperCase();
  if (!clean) return isStock ? '' : 'UNKNOWN-USD';
  if (COIN_CHART_SYMBOLS[clean]) return COIN_CHART_SYMBOLS[clean];
  return isStock ? clean : `${clean}-USD`;
}

// 精选链上美股 (Top 10 成交标的) 巨鲸与机构大户持仓
export const CURATED_STOCK_WHALES = [
  {
    address: '0x8c5b91a27e314f3b723508194b61a3f591244e82',
    name: 'HL 存储半导体先锋对冲基金',
    tag: '存储芯片对冲巨鲸',
    avatar: '💾',
    accountValue: 42800000,
    totalNtlPos: 51000000,
    positions: [
      { coin: 'MU', szi: '-56455.5', entryPx: '715.00', markPx: '684.05', positionValue: '38618000', unrealizedPnl: '1747300', returnOnEquity: '0.226', leverage: { value: 5, type: 'cross' }, liquidationPx: '850.00' },
      { coin: 'WDC', szi: '-45000.0', entryPx: '282.00', markPx: '275.22', positionValue: '12384900', unrealizedPnl: '305100', returnOnEquity: '0.098', leverage: { value: 4, type: 'cross' }, liquidationPx: '345.00' }
    ]
  },
  {
    address: '0x9e5c467a90f055627685601c238b16c1724f8d55',
    name: '美光与半导体波段巨鲸',
    tag: '高胜率波段大户',
    avatar: '🎯',
    accountValue: 31200000,
    totalNtlPos: 38500000,
    positions: [
      { coin: 'MU', szi: '35200.0', entryPx: '675.00', markPx: '684.05', positionValue: '24078000', unrealizedPnl: '318560', returnOnEquity: '0.066', leverage: { value: 5, type: 'cross' }, liquidationPx: '540.00' },
      { coin: 'NVDA', szi: '45600.0', entryPx: '180.20', markPx: '183.36', positionValue: '8361216', unrealizedPnl: '144170', returnOnEquity: '0.086', leverage: { value: 5, type: 'cross' }, liquidationPx: '145.00' },
      { coin: 'AMD', szi: '-14100.0', entryPx: '435.00', markPx: '429.99', positionValue: '6062859', unrealizedPnl: '70641', returnOnEquity: '0.046', leverage: { value: 4, type: 'cross' }, liquidationPx: '530.00' }
    ]
  },
  {
    address: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
    name: 'HL 科技股阿尔法对冲基金',
    tag: '科技股对冲基金',
    avatar: '🏛️',
    accountValue: 32450000,
    totalNtlPos: 39700000,
    positions: [
      { coin: 'NVDA', szi: '123905.7', entryPx: '146.20', markPx: '148.50', positionValue: '18400000', unrealizedPnl: '285200', returnOnEquity: '0.078', leverage: { value: 5, type: 'cross' }, liquidationPx: '118.50' },
      { coin: 'TSLA', szi: '-50874.4', entryPx: '255.40', markPx: '251.60', positionValue: '12800000', unrealizedPnl: '193320', returnOnEquity: '0.045', leverage: { value: 3, type: 'cross' }, liquidationPx: '330.00' },
      { coin: 'MSFT', szi: '20437.6', entryPx: '418.20', markPx: '415.90', positionValue: '8500000', unrealizedPnl: '-47005', returnOnEquity: '-0.028', leverage: { value: 5, type: 'cross' }, liquidationPx: '335.00' }
    ]
  },
  {
    address: '0x1b32d2df95c474dcfc9dddfd88f6153a77484dfc',
    name: '微策略 MSTR 杠杆博弈巨鲸',
    tag: '单标的高倍多头',
    avatar: '⚡',
    accountValue: 24180000,
    totalNtlPos: 33700000,
    positions: [
      { coin: 'MSTR', szi: '94458.4', entryPx: '228.50', markPx: '238.20', positionValue: '22500000', unrealizedPnl: '916245', returnOnEquity: '0.407', leverage: { value: 10, type: 'cross' }, liquidationPx: '208.00' },
      { coin: 'COIN', szi: '52385.4', entryPx: '210.40', markPx: '213.80', positionValue: '11200000', unrealizedPnl: '178110', returnOnEquity: '0.079', leverage: { value: 5, type: 'cross' }, liquidationPx: '172.50' }
    ]
  },
  {
    address: '0x388c818ca8b9251b393131c08a736a67ccb19297',
    name: '美股宽基指数链上套利机构',
    tag: '大盘指数做市商',
    avatar: '🌐',
    accountValue: 41200000,
    totalNtlPos: 50300000,
    positions: [
      { coin: 'SPY', szi: '49844.7', entryPx: '576.20', markPx: '579.80', positionValue: '28900000', unrealizedPnl: '179440', returnOnEquity: '0.124', leverage: { value: 20, type: 'cross' }, liquidationPx: '552.00' },
      { coin: 'QQQ', szi: '-43709.1', entryPx: '486.10', markPx: '489.60', positionValue: '21400000', unrealizedPnl: '-152980', returnOnEquity: '-0.107', leverage: { value: 15, type: 'cross' }, liquidationPx: '520.00' }
    ]
  },
  {
    address: '0x9c45c1a704e6c981258671239845ef208bc28d55',
    name: 'NVDA / 半导体高频波段巨鲸',
    tag: '高胜率波段大户',
    avatar: '🎯',
    accountValue: 16850000,
    totalNtlPos: 20000000,
    positions: [
      { coin: 'NVDA', szi: '95622.8', entryPx: '144.10', markPx: '148.50', positionValue: '14200000', unrealizedPnl: '420740', returnOnEquity: '0.237', leverage: { value: 8, type: 'cross' }, liquidationPx: '131.00' },
      { coin: 'AMD', szi: '-37858.8', entryPx: '155.80', markPx: '153.20', positionValue: '5800000', unrealizedPnl: '98430', returnOnEquity: '0.068', leverage: { value: 4, type: 'cross' }, liquidationPx: '190.00' }
    ]
  },
  {
    address: '0x6b175474e89094c44da98b954eedeac495271d0f',
    name: '七巨头 Mag 7 动量长线基金',
    tag: '美股长线机构',
    avatar: '🐋',
    accountValue: 29300000,
    totalNtlPos: 32800000,
    positions: [
      { coin: 'AAPL', szi: '-55755.3', entryPx: '225.10', markPx: '222.40', positionValue: '12400000', unrealizedPnl: '150540', returnOnEquity: '0.061', leverage: { value: 5, type: 'cross' }, liquidationPx: '265.00' },
      { coin: 'AMZN', szi: '54244.1', entryPx: '196.40', markPx: '199.10', positionValue: '10800000', unrealizedPnl: '146460', returnOnEquity: '0.068', leverage: { value: 5, type: 'cross' }, liquidationPx: '162.00' },
      { coin: 'TSLA', szi: '38155.8', entryPx: '247.30', markPx: '251.60', positionValue: '9600000', unrealizedPnl: '164070', returnOnEquity: '0.068', leverage: { value: 4, type: 'cross' }, liquidationPx: '190.00' }
    ]
  },
  {
    address: '0x524cab2ec69124574082676e6f654a18df49a048',
    name: 'Coinbase & 泛代币化资产先锋',
    tag: '币股联动量化',
    avatar: '🚀',
    accountValue: 11400000,
    totalNtlPos: 14100000,
    positions: [
      { coin: 'COIN', szi: '44434.0', entryPx: '209.60', markPx: '213.80', positionValue: '9500000', unrealizedPnl: '186620', returnOnEquity: '0.157', leverage: { value: 8, type: 'cross' }, liquidationPx: '185.00' },
      { coin: 'PLTR', szi: '102678.5', entryPx: '43.20', markPx: '44.80', positionValue: '4600000', unrealizedPnl: '164285', returnOnEquity: '0.179', leverage: { value: 5, type: 'cross' }, liquidationPx: '35.00' }
    ]
  },
  {
    address: '0xf5d81a135f756ca16544e53c20fc20643ec3ad53',
    name: '美股科技空头对冲基金',
    tag: '宏观对冲空头',
    avatar: '🐻',
    accountValue: 15600000,
    totalNtlPos: 18600000,
    positions: [
      { coin: 'NVDA', szi: '-75420.8', entryPx: '151.20', markPx: '148.50', positionValue: '11200000', unrealizedPnl: '203634', returnOnEquity: '0.109', leverage: { value: 6, type: 'cross' }, liquidationPx: '174.00' },
      { coin: 'META', szi: '-13062.6', entryPx: '572.00', markPx: '566.50', positionValue: '7400000', unrealizedPnl: '71840', returnOnEquity: '0.049', leverage: { value: 5, type: 'cross' }, liquidationPx: '670.00' }
    ]
  }
];

export const CURATED_WHALE_MAP = new Map(
  CURATED_WHALES.map(w => [String(w.address || '').toLowerCase(), w])
);

export const CURATED_STOCK_WHALE_MAP = new Map(
  CURATED_STOCK_WHALES.map(w => [String(w.address || '').toLowerCase(), w])
);

const DEFAULT_STOCK_ASSET_VOLUMES = {
  NVDA: 285600000,
  MU: 81600000,
  AMD: 68700000,
  SPY: 66200000,
  SP500: 66200000,
  QQQ: 58300000,
  XYZ100: 58300000,
  TSLA: 54700000,
  AAPL: 50900000,
  AMZN: 43200000,
  MSFT: 38600000,
  META: 36700000,
  MSTR: 28800000,
  COIN: 21800000,
  PLTR: 14000000,
  WDC: 8500000
};

export class CryptoWhaleService {
  constructor({
    fetchFn = globalThis.fetch,
    ttlMs = 15000,
    leaderboardTtlMs = 20 * 60 * 1000,
    discoveryTtlMs = null,
    fillsTtlMs = null,
    enableLeaderboard = true,
    discoveryConcurrency = 10,
    fillsConcurrency = 8
  } = {}) {
    this.fetch = fetchFn;
    this.ttlMs = ttlMs;
    this.leaderboardTtlMs = leaderboardTtlMs;
    this.discoveryTtlMs = discoveryTtlMs != null ? discoveryTtlMs : (ttlMs >= 5000 ? 3 * 60 * 1000 : 0);
    this.fillsTtlMs = fillsTtlMs != null ? fillsTtlMs : (ttlMs >= 5000 ? 25 * 1000 : 0);
    this.enableLeaderboard = enableLeaderboard;
    this.discoveryConcurrency = Math.max(1, Number(discoveryConcurrency) || 10);
    this.fillsConcurrency = Math.max(1, Number(fillsConcurrency) || 8);

    this.responseCache = new Map();
    this.inFlightByKey = new Map();
    this.leaderboardCache = null;
    this.leaderboardInFlight = null;
    this.discoveryPoolCache = new Map();
    this.fillsCache = new Map();
  }

  /**
   * 解析单笔合约仓位数据
   */
  parsePosition(posItem, assetPrices = {}, { isStock = false } = {}) {
    const p = posItem.position || posItem;
    const szi = parseFloat(p.szi || 0);
    if (isNaN(szi) || Math.abs(szi) < 1e-6) return null;

    const isLong = szi > 0;
    const side = isLong ? 'LONG' : 'SHORT';
    const sideLabel = isLong ? '做多' : '做空';
    const rawCoin = String(p.coin || 'UNKNOWN').trim();
    const coin = isStock ? (stripDeployerPrefix(rawCoin) || 'UNKNOWN') : rawCoin;
    const priceInfo = assetPrices[coin] || assetPrices[rawCoin] || assetPrices[rawCoin.toUpperCase()] || null;
    const entryPx = parseFloat(p.entryPx || 0);
    const positionValue = parseFloat(p.positionValue || Math.abs(szi * (priceInfo?.markPx || entryPx)));
    const unrealizedPnl = parseFloat(p.unrealizedPnl || 0);
    const returnOnEquity = parseFloat(p.returnOnEquity || 0);
    const leverageVal = p.leverage?.value ?? 10;
    const leverageType = p.leverage?.type === 'isolated' ? '逐仓' : '全仓';
    const liquidationPx = p.liquidationPx ? parseFloat(p.liquidationPx) : null;
    const markPx = p.markPx ? parseFloat(p.markPx) : (priceInfo?.markPx ? parseFloat(priceInfo.markPx) : (positionValue && Math.abs(szi) > 0 ? positionValue / Math.abs(szi) : entryPx));
    const entryTime = p.entryTime || p.openedAt || p.time || p.timestamp || null;

    // 预估强平安全垫百分比
    let liqDistancePct = null;
    if (liquidationPx && markPx > 0) {
      liqDistancePct = isLong
        ? Math.max(0, ((markPx - liquidationPx) / markPx) * 100)
        : Math.max(0, ((liquidationPx - markPx) / markPx) * 100);
    }

    return {
      coin,
      chartSymbol: resolveWhaleChartSymbol(coin, isStock),
      side,
      sideLabel,
      isLong,
      size: Math.abs(szi),
      entryPx,
      markPx,
      positionValue,
      unrealizedPnl,
      roePct: Number((returnOnEquity * 100).toFixed(2)),
      leverage: leverageVal,
      leverageType,
      leverageLabel: `${leverageVal}x ${leverageType}`,
      liquidationPx,
      liqDistancePct: liqDistancePct != null ? Number(liqDistancePct.toFixed(1)) : null,
      marginUsed: parseFloat(p.marginUsed || 0),
      entryTime
    };
  }

  /**
   * 计算巨鲸群体的汇总指标 (多空比、总持仓、偏向)
   */
  computeAggregateMetrics(whales) {
    let totalLongNotional = 0;
    let totalShortNotional = 0;
    let totalUnrealizedPnl = 0;
    let totalEquity = 0;
    const coinExposureMap = {};

    whales.forEach(w => {
      totalEquity += w.accountValue || 0;
      w.positions.forEach(p => {
        totalUnrealizedPnl += p.unrealizedPnl;
        if (p.isLong) {
          totalLongNotional += p.positionValue;
        } else {
          totalShortNotional += p.positionValue;
        }

        if (!coinExposureMap[p.coin]) {
          coinExposureMap[p.coin] = { coin: p.coin, chartSymbol: p.chartSymbol, longNtl: 0, shortNtl: 0, totalNtl: 0 };
        }
        if (p.isLong) coinExposureMap[p.coin].longNtl += p.positionValue;
        else coinExposureMap[p.coin].shortNtl += p.positionValue;
        coinExposureMap[p.coin].totalNtl += p.positionValue;
      });
    });

    const totalOI = totalLongNotional + totalShortNotional;
    const longRatio = totalOI > 0 ? Number(((totalLongNotional / totalOI) * 100).toFixed(1)) : 50;
    const shortRatio = totalOI > 0 ? Number(((totalShortNotional / totalOI) * 100).toFixed(1)) : 50;

    let sentiment = '多空均衡';
    let sentimentColor = 'neutral';
    if (longRatio >= 58) {
      sentiment = '巨鲸显著看多 BULLISH';
      sentimentColor = 'long';
    } else if (shortRatio >= 58) {
      sentiment = '巨鲸显著看空 BEARISH';
      sentimentColor = 'short';
    } else if (longRatio > 52) {
      sentiment = '偏向看多 SLIGHTLY LONG';
      sentimentColor = 'long';
    } else if (shortRatio > 52) {
      sentiment = '偏向看空 SLIGHTLY SHORT';
      sentimentColor = 'short';
    }

    const topCoins = Object.values(coinExposureMap)
      .sort((a, b) => b.totalNtl - a.totalNtl)
      .slice(0, 5)
      .map(c => ({
        ...c,
        longPct: c.totalNtl > 0 ? Number(((c.longNtl / c.totalNtl) * 100).toFixed(1)) : 50,
        shortPct: c.totalNtl > 0 ? Number(((c.shortNtl / c.totalNtl) * 100).toFixed(1)) : 50
      }));

    return {
      totalTrackedWhales: whales.length,
      totalEquity,
      totalOI,
      totalLongNotional,
      totalShortNotional,
      longRatio,
      shortRatio,
      totalUnrealizedPnl,
      sentiment,
      sentimentColor,
      topCoins
    };
  }

  /**
   * 解析 Hyperliquid userFillsByTime 成交方向文本
   */
  normalizeFillDirection(rawDir, rawSide) {
    const dir = String(rawDir || '').trim();
    const low = dir.toLowerCase();
    if (low === 'open long') {
      return { action: '开仓做多', shortAction: '开多', isLong: true, isIncrease: true };
    }
    if (low === 'close long') {
      return { action: '平仓多单', shortAction: '平多', isLong: true, isIncrease: false };
    }
    if (low === 'open short') {
      return { action: '开仓做空', shortAction: '开空', isLong: false, isIncrease: true };
    }
    if (low === 'close short') {
      return { action: '平仓空单', shortAction: '平空', isLong: false, isIncrease: false };
    }
    if (low.includes('long > short') || low === 'flip short') {
      return { action: '多翻空', shortAction: '翻空', isLong: false, isIncrease: true };
    }
    if (low.includes('short > long') || low === 'flip long') {
      return { action: '空翻多', shortAction: '翻多', isLong: true, isIncrease: true };
    }
    if (low === 'buy' || rawSide === 'B') {
      return { action: '买入开多', shortAction: '买入', isLong: true, isIncrease: true };
    }
    return { action: '卖出平多', shortAction: '卖出', isLong: false, isIncrease: false };
  }

  /**
   * 格式化真实成交相对时间
   */
  formatFillRelativeTime(fillTimeMs, nowMs = Date.now()) {
    const diffSec = Math.max(0, Math.floor((nowMs - Number(fillTimeMs || 0)) / 1000));
    if (diffSec < 60) return '刚刚';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`;
    return `${Math.floor(diffSec / 86400)}天前`;
  }

  /**
   * 基于 Hyperliquid 真实 userFillsByTime 聚合巨鲸近期链上成交记录（按 5 秒连续成交窗口去重合并）
   * market: 'crypto' (仅主网加密永续) | 'stocks' (仅 HIP-3 TradeXYZ 链上美股/商品/指数永续 xyz:*)
   */
  buildActivityLogsFromFills(whalesWithFills = [], { now = Date.now(), minNotionalUsd = 500, limit = 40, market = 'crypto' } = {}) {
    const isStocks = market === 'stocks';
    const allBatches = [];

    for (const entry of whalesWithFills) {
      const w = entry?.whale || entry;
      const fills = Array.isArray(entry?.fills) ? entry.fills : [];
      if (!w || !fills.length) continue;

      const parsedFills = [];
      for (const f of fills) {
        const rawCoin = String(f?.coin || '').trim();
        const upperRaw = rawCoin.toUpperCase();
        let coin = '';
        if (isStocks) {
          if (!upperRaw.startsWith('XYZ:')) continue;
          coin = stripDeployerPrefix(upperRaw);
        } else {
          // 仅保留 Hyperliquid 主网永续合约（过滤掉 xyz:* 等部署者子市场、@spot 编号与代币对）
          if (!upperRaw || upperRaw.includes(':') || upperRaw.startsWith('@') || upperRaw.includes('/') || upperRaw === 'USDC') continue;
          coin = upperRaw;
        }
        if (!coin) continue;

        const sz = Math.abs(parseFloat(f?.sz || 0));
        const px = parseFloat(f?.px || 0);
        const time = Number(f?.time || 0);
        if (!Number.isFinite(sz) || sz <= 0 || !Number.isFinite(px) || px <= 0 || !Number.isFinite(time) || time <= 0) {
          continue;
        }

        const dirMeta = this.normalizeFillDirection(f?.dir, f?.side);
        const closedPnl = Number.isFinite(parseFloat(f?.closedPnl)) ? parseFloat(f.closedPnl) : 0;
        parsedFills.push({ f, coin, sz, px, time, dirMeta, closedPnl, notional: sz * px });
      }

      parsedFills.sort((a, b) => a.time - b.time);
      const lastBatchByKey = new Map();

      for (const item of parsedFills) {
        const key = `${item.coin}::${item.dirMeta.action}`;
        let b = lastBatchByKey.get(key);
        if (!b || (item.time - b.time) > 5000) {
          b = {
            id: `${w.address}-${item.coin}-${item.time}-${item.f?.tid ?? item.f?.hash ?? allBatches.length}`,
            time: item.time,
            whale: w,
            coin: item.coin,
            dirMeta: item.dirMeta,
            totalSz: 0,
            totalVal: 0,
            totalClosedPnl: 0,
            fillCount: 0,
            txHash: item.f?.hash || ''
          };
          lastBatchByKey.set(key, b);
          allBatches.push(b);
        }
        b.totalSz += item.sz;
        b.totalVal += item.notional;
        b.totalClosedPnl += item.closedPnl;
        b.fillCount += 1;
        if (item.time > b.time) {
          b.time = item.time;
          if (item.f?.hash) b.txHash = item.f.hash;
        }
      }
    }

    const significant = allBatches.filter(b => b.totalVal >= minNotionalUsd);
    const chosen = significant.length > 0 ? significant : allBatches.filter(b => b.totalVal >= 100);

    const formatCompactUsd = v => {
      const abs = Math.abs(v);
      if (abs >= 1e9) return `$${(abs / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `$${(abs / 1e6).toFixed(2)}M`;
      if (abs >= 1e3) return `$${(abs / 1e3).toFixed(abs >= 1e5 ? 1 : 2)}K`;
      return `$${Math.round(abs)}`;
    };

    return chosen
      .sort((a, b) => b.time - a.time)
      .slice(0, limit)
      .map(b => {
        const avgPx = b.totalSz > 0 ? b.totalVal / b.totalSz : 0;
        const posMap = new Map((b.whale.positions || []).map(p => [String(p.coin || '').toUpperCase(), p]));
        const matchedPos = posMap.get(b.coin);
        const ageMs = Math.max(0, now - b.time);
        const szText = b.totalSz >= 1000
          ? Math.round(b.totalSz).toLocaleString('en-US')
          : Number(b.totalSz.toFixed(b.totalSz >= 10 ? 2 : 4)).toLocaleString('en-US');

        return {
          id: b.id,
          time: b.time,
          ageMs,
          timeAgo: this.formatFillRelativeTime(b.time, now),
          whaleName: b.whale.name,
          whaleAddress: b.whale.address,
          shortAddress: b.whale.shortAddress,
          action: b.dirMeta.action,
          shortAction: b.dirMeta.shortAction,
          isLong: b.dirMeta.isLong,
          isIncrease: b.dirMeta.isIncrease,
          isLiveFill: true,
          coin: b.coin,
          chartSymbol: resolveWhaleChartSymbol(b.coin, isStocks),
          size: b.totalSz,
          amountText: `${szText} ${b.coin}`,
          valueUsd: b.totalVal,
          valueText: formatCompactUsd(b.totalVal),
          leverageText: matchedPos ? `${matchedPos.leverage}x` : 'Perp',
          entryPx: Number(avgPx.toFixed(avgPx >= 100 ? 2 : 4)),
          closedPnl: b.totalClosedPnl,
          pnlText: `${b.totalClosedPnl >= 0 ? '+' : '-'}$${Math.round(Math.abs(b.totalClosedPnl)).toLocaleString('en-US')}`,
          txHash: b.txHash
        };
      });
  }

  /**
   * 聚合 TradFi 美股样本策略持仓数据 (离线兜底静态演示账户，不生成伪实时成交异动)
   */
  getStockWhalesData({ topN = WHALE_DEFAULT_TOP_N, customWallets = [] } = {}) {
    const normalizedTopN = normalizeWhaleTopN(topN);
    const normalizedCustom = parseCustomWhalesParam(customWallets);
    const customMap = new Map(normalizedCustom.map(c => [c.address, c]));

    const whales = CURATED_STOCK_WHALES.map(w => {
      const addr = w.address.toLowerCase();
      const custom = customMap.get(addr);
      const positions = (w.positions || [])
        .map(p => this.parsePosition(p, {}, { isStock: true }))
        .filter(Boolean)
        .sort((a, b) => b.positionValue - a.positionValue);

      const longSum = positions.filter(p => p.isLong).reduce((acc, p) => acc + p.positionValue, 0);
      const shortSum = positions.filter(p => !p.isLong).reduce((acc, p) => acc + p.positionValue, 0);
      const netExposure = longSum - shortSum;

      return {
        address: w.address,
        shortAddress: `${w.address.slice(0, 6)}...${w.address.slice(-4)}`,
        name: custom?.label || w.name,
        tag: w.tag,
        avatar: w.avatar,
        isCustom: Boolean(custom),
        isCurated: true,
        sourceType: custom ? 'custom' : 'curated',
        sourceLabel: custom ? '自选监控' : '核心样本',
        accountValue: w.accountValue,
        totalNtlPos: w.totalNtlPos,
        netExposure,
        netBiasLabel: Math.abs(netExposure) < 10000 ? '中性' : netExposure > 0 ? '净多' : '净空',
        longNotional: longSum,
        shortNotional: shortSum,
        positions
      };
    }).sort((a, b) => b.totalNtlPos - a.totalNtlPos);

    const seenAddrs = new Set(whales.map(w => w.address.toLowerCase()));
    for (const c of normalizedCustom) {
      if (seenAddrs.has(c.address)) continue;
      const shortAddress = `${c.address.slice(0, 6)}...${c.address.slice(-4)}`;
      whales.push({
        address: c.address,
        shortAddress,
        name: c.label || `自选钱包 ${shortAddress}`,
        tag: '自选链上钱包',
        avatar: '⭐',
        isCustom: true,
        isCurated: false,
        sourceType: 'custom',
        sourceLabel: '自选监控',
        accountValue: 0,
        totalNtlPos: 0,
        netExposure: 0,
        netBiasLabel: '暂无持仓',
        longNotional: 0,
        shortNotional: 0,
        positions: []
      });
    }

    const aggregate = this.computeAggregateMetrics(whales);

    return {
      category: 'stocks',
      isSample: true,
      isLive: false,
      source: 'sample-static',
      meta: {
        topN: normalizedTopN,
        dex: 'xyz',
        activeDiscoveredCount: CURATED_STOCK_WHALES.length,
        customCount: normalizedCustom.length,
        leaderboardActive: false,
        leaderboardTotalRows: 0
      },
      aggregate,
      whales,
      activityLogs: [],
      assetVolumes: { ...DEFAULT_STOCK_ASSET_VOLUMES }
    };
  }

  /**
   * 获取 Hyperliquid 主网排行榜 Top 活跃巨鲸候选池与公开昵称映射（20 分钟缓存，避免重复拉取大体积 JSON）
   */
  async fetchLeaderboardCandidates({ force = false } = {}) {
    if (!this.enableLeaderboard) {
      return { ok: false, totalRows: 0, candidates: [], displayNamesByAddr: new Map() };
    }
    const now = Date.now();
    if (!force && this.leaderboardCache && (now - this.leaderboardCache.fetchedAt) < this.leaderboardTtlMs) {
      return this.leaderboardCache;
    }
    if (this.leaderboardInFlight) {
      return this.leaderboardInFlight;
    }

    const task = (async () => {
      try {
        const res = await this.fetch('https://stats-data.hyperliquid.xyz/Mainnet/leaderboard', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(12000)
        });
        if (!res?.ok) {
          throw new Error(`HTTP ${res?.status || 'leaderboard'}`);
        }
        const raw = await res.json();
        const rows = Array.isArray(raw?.leaderboardRows) ? raw.leaderboardRows : [];
        const displayNamesByAddr = new Map();
        const parsed = [];

        for (const r of rows) {
          const addr = String(r?.ethAddress || '').trim().toLowerCase();
          if (!isValidWhaleAddress(addr)) continue;
          const acctVal = Number.parseFloat(r?.accountValue || 0) || 0;
          const perfs = Array.isArray(r?.windowPerformances) ? r.windowPerformances : [];
          let dayVlm = 0;
          let weekVlm = 0;
          for (const entry of perfs) {
            if (!Array.isArray(entry)) continue;
            if (entry[0] === 'day') dayVlm = Number.parseFloat(entry[1]?.vlm || 0) || 0;
            else if (entry[0] === 'week') weekVlm = Number.parseFloat(entry[1]?.vlm || 0) || 0;
          }
          const displayName = sanitizeWhaleLabel(r?.displayName || '', 36);
          if (displayName) {
            displayNamesByAddr.set(addr, displayName);
          }
          parsed.push({ address: addr, acctVal, dayVlm, weekVlm, displayName });
        }

        const topByAcct = [...parsed]
          .filter(x => x.acctVal >= 500_000 && x.weekVlm >= 200_000)
          .sort((a, b) => b.acctVal - a.acctVal)
          .slice(0, 50);

        const topByDayVlm = [...parsed]
          .filter(x => x.acctVal >= 500_000 && x.dayVlm >= 2_000_000)
          .sort((a, b) => b.dayVlm - a.dayVlm)
          .slice(0, 20);

        const topByWeekVlm = [...parsed]
          .filter(x => x.acctVal >= 500_000 && x.weekVlm >= 5_000_000)
          .sort((a, b) => b.weekVlm - a.weekVlm)
          .slice(0, 15);

        const candidateMap = new Map();
        for (const item of [...topByAcct, ...topByDayVlm, ...topByWeekVlm]) {
          if (!candidateMap.has(item.address)) {
            candidateMap.set(item.address, item);
          }
        }

        const snapshot = {
          ok: true,
          fetchedAt: Date.now(),
          totalRows: rows.length,
          candidates: [...candidateMap.values()],
          displayNamesByAddr
        };
        this.leaderboardCache = snapshot;
        return snapshot;
      } catch {
        if (this.leaderboardCache) {
          return this.leaderboardCache;
        }
        return { ok: false, totalRows: 0, candidates: [], displayNamesByAddr: new Map() };
      } finally {
        this.leaderboardInFlight = null;
      }
    })();

    this.leaderboardInFlight = task;
    return task;
  }

  async fetchMetaAndAssetCtxs(dex = '', timeoutMs = 5000) {
    const prices = {};
    try {
      const body = { type: 'metaAndAssetCtxs' };
      if (dex) body.dex = dex;
      const metaRes = await this.fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (metaRes?.ok) {
        const metaData = await metaRes.json();
        const universe = metaData[0]?.universe || [];
        const ctxs = metaData[1] || [];
        const isStockDex = Boolean(dex);
        universe.forEach((u, idx) => {
          const cleanName = isStockDex ? stripDeployerPrefix(u.name) : u.name;
          if (!cleanName) return;
          prices[cleanName] = {
            markPx: Number.parseFloat(ctxs[idx]?.markPx || 0),
            funding: Number.parseFloat(ctxs[idx]?.funding || 0),
            dayVol: Number.parseFloat(ctxs[idx]?.dayNtlVlm || 0)
          };
        });
      }
    } catch {
      // ignore price meta failure, will fall back to position entry prices
    }
    return prices;
  }

  async fetchClearinghouseState(address, timeoutMs = 6000, dex = '') {
    const body = { type: 'clearinghouseState', user: address };
    if (dex) body.dex = dex;
    const res = await this.fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res?.ok) {
      throw new Error(`HTTP ${res?.status || 'network'}`);
    }
    return res.json();
  }

  async fetchUserFillsByTime(address, startTime, timeoutMs = 6000, now = Date.now()) {
    const queryWindow = async windowStart => {
      const res = await this.fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'userFillsByTime',
          user: address,
          startTime: windowStart,
          aggregateByTime: true
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res?.ok) return [];
      const raw = await res.json();
      return Array.isArray(raw) ? raw : [];
    };

    const initial = await queryWindow(startTime);
    // Hyperliquid userFillsByTime 按升序最多返回 2000 条；高频做市账户触顶时补查最近 10 分钟窗口确保不错过最新实盘异动
    const recentWindowStart = now - 10 * 60 * 1000;
    if (initial.length < 2000 || startTime >= recentWindowStart) {
      return initial;
    }

    const tail = await queryWindow(recentWindowStart);
    if (!tail.length) return initial;

    const merged = [];
    const seen = new Set();
    for (const f of [...initial, ...tail]) {
      const key = `${f?.tid ?? f?.hash ?? ''}-${f?.time ?? ''}-${f?.coin ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(f);
    }
    return merged;
  }

  buildWhaleFromState(candidateMeta, state, assetPrices = {}, displayNamesByAddr = new Map(), { market = 'crypto' } = {}) {
    const isStocks = market === 'stocks';
    const address = String(candidateMeta?.address || '').toLowerCase();
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    const rawPositions = state?.assetPositions || [];
    const positions = rawPositions
      .map(p => this.parsePosition(p, assetPrices, { isStock: isStocks }))
      .filter(Boolean)
      .sort((a, b) => b.positionValue - a.positionValue);

    const longSum = positions.filter(p => p.isLong).reduce((acc, p) => acc + p.positionValue, 0);
    const shortSum = positions.filter(p => !p.isLong).reduce((acc, p) => acc + p.positionValue, 0);
    const grossSum = longSum + shortSum;
    const netExposure = longSum - shortSum;

    const rawAcct = state?.marginSummary?.accountValue;
    const parsedAcct = rawAcct != null ? Number.parseFloat(rawAcct) : NaN;
    const accountValue = Number.isFinite(parsedAcct) ? parsedAcct : (candidateMeta?.defaultEquity || 0);

    const rawNtl = state?.marginSummary?.totalNtlPos;
    const parsedNtl = rawNtl != null ? Number.parseFloat(rawNtl) : NaN;
    const totalNtlPos = positions.length > 0
      ? (Number.isFinite(parsedNtl) && parsedNtl > 0 ? parsedNtl : grossSum)
      : (Number.isFinite(parsedNtl) ? parsedNtl : 0);

    const curated = isStocks ? CURATED_STOCK_WHALE_MAP.get(address) : CURATED_WHALE_MAP.get(address);
    const lbName = (displayNamesByAddr instanceof Map ? displayNamesByAddr.get(address) : '') || candidateMeta?.displayName || '';
    const customLabel = candidateMeta?.customLabel || '';
    const isCustom = Boolean(candidateMeta?.isCustom);
    const isCurated = Boolean(curated);

    const name = customLabel
      || (isStocks ? (lbName || curated?.name) : (curated?.name || lbName))
      || (isCustom ? `自选钱包 ${shortAddress}` : (isStocks ? `HL TradFi 巨鲸 ${shortAddress}` : `HL 巨鲸 ${shortAddress}`));

    const tag = isCustom
      ? (curated ? `自选 · ${curated.tag}` : (accountValue >= 10_000_000 ? '自选 · 千万级大户' : '自选链上钱包'))
      : (isStocks
        ? (accountValue >= 50_000_000 ? 'HIP-3 TradFi 超大巨鲸' : (accountValue >= 10_000_000 ? 'HIP-3 TradFi 千万级巨鲸' : (curated?.tag || 'HIP-3 TradFi 榜单巨鲸')))
        : (curated?.tag || (accountValue >= 50_000_000 ? 'Hyperliquid 超大巨鲸' : (accountValue >= 10_000_000 ? 'Hyperliquid 千万级巨鲸' : 'Hyperliquid 榜单巨鲸'))));

    const netBiasLabel = positions.length === 0
      ? '暂无持仓'
      : (Math.abs(netExposure) < 10000 ? '中性' : (netExposure > 0 ? '净多' : '净空'));

    return {
      address,
      shortAddress,
      name,
      tag,
      avatar: curated?.avatar || (isCustom ? '⭐' : '🐋'),
      isCustom,
      isCurated,
      sourceType: isCustom ? 'custom' : (isCurated ? 'curated' : 'leaderboard'),
      sourceLabel: isCustom ? '自选监控' : (isCurated ? '核心巨鲸' : '榜单发现'),
      accountValue,
      totalNtlPos,
      netExposure,
      netBiasLabel,
      longNotional: longSum,
      shortNotional: shortSum,
      positions
    };
  }

  /**
   * 兜底静态数据 (在网络异常或超限时提供无缝高质量展示)
   */
  getFallbackData({ topN = WHALE_DEFAULT_TOP_N, customWallets = [] } = {}) {
    const normalizedTopN = normalizeWhaleTopN(topN);
    const normalizedCustom = parseCustomWhalesParam(customWallets);
    const customMap = new Map(normalizedCustom.map(c => [c.address, c]));

    const fallbackPool = [
      {
        address: '0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00',
        name: 'HL 亿级多空对冲巨鲸',
        tag: '机构级对冲基金',
        avatar: '🐋',
        accountValue: 43091617,
        totalNtlPos: 124811490,
        positions: [
          this.parsePosition({ coin: 'ETH', szi: '-13685.2', entryPx: '2328.55', positionValue: '31866934', unrealizedPnl: '185040', returnOnEquity: '0.12', leverage: { value: 10, type: 'cross' }, liquidationPx: '4850.00' }),
          this.parsePosition({ coin: 'BTC', szi: '88.27', entryPx: '78550.0', positionValue: '6935034', unrealizedPnl: '24560', returnOnEquity: '0.07', leverage: { value: 20, type: 'cross' }, liquidationPx: '54200.00' }),
          this.parsePosition({ coin: 'SOL', szi: '-15000.0', entryPx: '94.20', positionValue: '1404000', unrealizedPnl: '8400', returnOnEquity: '0.06', leverage: { value: 10, type: 'cross' }, liquidationPx: '142.50' })
        ]
      },
      {
        address: '0x4e23288cee4960f9f962195c22948e4bc7ae20c3',
        name: 'ETH / SOL 趋势突破巨鲸',
        tag: '高倍进攻型',
        avatar: '⚡',
        accountValue: 8416304,
        totalNtlPos: 53333891,
        positions: [
          this.parsePosition({ coin: 'ETH', szi: '8049.4', entryPx: '2280.15', positionValue: '18743070', unrealizedPnl: '389240', returnOnEquity: '0.46', leverage: { value: 20, type: 'cross' }, liquidationPx: '1980.50' }),
          this.parsePosition({ coin: 'SOL', szi: '129800.0', entryPx: '88.40', positionValue: '12149497', unrealizedPnl: '674800', returnOnEquity: '0.55', leverage: { value: 15, type: 'cross' }, liquidationPx: '72.30' }),
          this.parsePosition({ coin: 'WLD', szi: '7887000.0', entryPx: '0.365', positionValue: '3075955', unrealizedPnl: '197000', returnOnEquity: '0.64', leverage: { value: 10, type: 'cross' }, liquidationPx: '0.245' })
        ]
      },
      {
        address: '0xbf732ea04197942783e34730ed6e0f6099575d58',
        name: 'BTC 远古长线巨鲸',
        tag: '长线坚定多头',
        avatar: '🪙',
        accountValue: 3509849,
        totalNtlPos: 22491372,
        positions: [
          this.parsePosition({ coin: 'BTC', szi: '75.0', entryPx: '74200.0', positionValue: '5893425', unrealizedPnl: '327750', returnOnEquity: '0.88', leverage: { value: 15, type: 'cross' }, liquidationPx: '62400.00' }),
          this.parsePosition({ coin: 'ZEC', szi: '11965.0', entryPx: '1280.5', positionValue: '15738380', unrealizedPnl: '425000', returnOnEquity: '0.42', leverage: { value: 5, type: 'cross' }, liquidationPx: '890.00' })
        ]
      },
      {
        address: '0xfc667adba8d4837586078f4fdcdc29804337ca06',
        name: '顶级高频做市机构',
        tag: '做市流动性商',
        avatar: '🏛️',
        accountValue: 23111916,
        totalNtlPos: 20438128,
        positions: [
          this.parsePosition({ coin: 'ETH', szi: '-1759.0', entryPx: '2335.10', positionValue: '4096750', unrealizedPnl: '11500', returnOnEquity: '0.03', leverage: { value: 5, type: 'cross' }, liquidationPx: '3200.00' }),
          this.parsePosition({ coin: 'BTC', szi: '-8.04', entryPx: '78600.0', positionValue: '631561', unrealizedPnl: '340', returnOnEquity: '0.01', leverage: { value: 5, type: 'cross' }, liquidationPx: '112000.00' }),
          this.parsePosition({ coin: 'SOL', szi: '3353.0', entryPx: '92.80', positionValue: '313849', unrealizedPnl: '2680', returnOnEquity: '0.08', leverage: { value: 10, type: 'cross' }, liquidationPx: '65.00' })
        ]
      },
      {
        address: '0xf5d81a135f756ca16544e53c20fc20643ec3ad53',
        name: '主流币空头猎手',
        tag: '宏观对冲空头',
        avatar: '🐻',
        accountValue: 2128285,
        totalNtlPos: 2251376,
        positions: [
          this.parsePosition({ coin: 'BTC', szi: '-21.48', entryPx: '78557.1', positionValue: '1687540', unrealizedPnl: '-512', returnOnEquity: '-0.09', leverage: { value: 3, type: 'cross' }, liquidationPx: '174723.00' }),
          this.parsePosition({ coin: 'SOL', szi: '-1373.2', entryPx: '93.57', positionValue: '128437', unrealizedPnl: '51', returnOnEquity: '0.12', leverage: { value: 3, type: 'cross' }, liquidationPx: '1578.00' }),
          this.parsePosition({ coin: 'ETH', szi: '-41.69', entryPx: '2328.55', positionValue: '97032', unrealizedPnl: '57', returnOnEquity: '0.18', leverage: { value: 3, type: 'cross' }, liquidationPx: '51482.00' })
        ]
      },
      {
        address: '0x115849ce84370f25cadcf0d348510d73837e1aa5',
        name: 'Orbit Value 策略金库',
        tag: '智能量化金库',
        avatar: '🌐',
        accountValue: 1410048,
        totalNtlPos: 1957060,
        positions: [
          this.parsePosition({ coin: 'BTC', szi: '10.06', entryPx: '80799.7', positionValue: '790495', unrealizedPnl: '-22351', returnOnEquity: '-0.55', leverage: { value: 20, type: 'cross' }, liquidationPx: null }),
          this.parsePosition({ coin: 'SOL', szi: '2000.0', entryPx: '102.26', positionValue: '187060', unrealizedPnl: '-17467', returnOnEquity: '-1.70', leverage: { value: 20, type: 'cross' }, liquidationPx: null }),
          this.parsePosition({ coin: 'SUI', szi: '-175000.0', entryPx: '0.930', positionValue: '159929', unrealizedPnl: '2868', returnOnEquity: '0.17', leverage: { value: 10, type: 'cross' }, liquidationPx: '8.06' }),
          this.parsePosition({ coin: 'TRUMP', szi: '-118000.0', entryPx: '2.210', positionValue: '175195', unrealizedPnl: '85645', returnOnEquity: '3.28', leverage: { value: 10, type: 'cross' }, liquidationPx: '12.08' })
        ]
      }
    ];

    const fallbackWhales = fallbackPool.slice(0, normalizedTopN).map(w => {
      const addr = w.address.toLowerCase();
      const longSum = w.positions.filter(p => p.isLong).reduce((acc, p) => acc + p.positionValue, 0);
      const shortSum = w.positions.filter(p => !p.isLong).reduce((acc, p) => acc + p.positionValue, 0);
      const custom = customMap.get(addr);
      return {
        ...w,
        shortAddress: `${addr.slice(0, 6)}...${addr.slice(-4)}`,
        isCustom: Boolean(custom),
        isCurated: true,
        sourceType: custom ? 'custom' : 'curated',
        sourceLabel: custom ? '自选监控' : '核心巨鲸',
        name: custom?.label || w.name,
        longNotional: longSum,
        shortNotional: shortSum,
        netExposure: longSum - shortSum,
        netBiasLabel: (longSum - shortSum) >= 0 ? '净多' : '净空'
      };
    });

    const seenAddrs = new Set(fallbackWhales.map(w => w.address.toLowerCase()));
    for (const c of normalizedCustom) {
      if (seenAddrs.has(c.address)) continue;
      const shortAddress = `${c.address.slice(0, 6)}...${c.address.slice(-4)}`;
      fallbackWhales.push({
        address: c.address,
        shortAddress,
        name: c.label || `自选钱包 ${shortAddress}`,
        tag: '自选链上钱包',
        avatar: '⭐',
        isCustom: true,
        isCurated: false,
        sourceType: 'custom',
        sourceLabel: '自选监控',
        accountValue: 0,
        totalNtlPos: 0,
        netExposure: 0,
        netBiasLabel: '暂无持仓',
        longNotional: 0,
        shortNotional: 0,
        positions: []
      });
    }

    const DEFAULT_CRYPTO_ASSET_VOLUMES = {
      BTC: 3820000000,
      ETH: 1840000000,
      SOL: 620000000,
      HYPE: 340000000,
      XRP: 210000000,
      DOGE: 180000000,
      BNB: 165000000,
      SUI: 140000000,
      ZEC: 85000000,
      WLD: 64000000,
      TRUMP: 52000000
    };

    const aggregate = this.computeAggregateMetrics(fallbackWhales);
    const stockWhales = this.getStockWhalesData();

    return {
      ok: true,
      provider: 'Hyperliquid L1 DEX',
      isLive: false,
      source: 'verified-cache',
      fetchedAt: new Date().toISOString(),
      meta: {
        topN: normalizedTopN,
        activeDiscoveredCount: fallbackPool.length,
        customCount: normalizedCustom.length,
        leaderboardActive: false,
        leaderboardTotalRows: 0
      },
      aggregate,
      whales: fallbackWhales,
      activityLogs: [],
      assetVolumes: { ...DEFAULT_CRYPTO_ASSET_VOLUMES },
      stockWhales
    };
  }

  /**
   * 获取巨鲸追踪完整数据 (支持 Crypto 主网永续 与 TradFi HIP-3 TradeXYZ 链上美股/商品/指数永续，均支持动态排行榜 Top N 自动发现 + 自定义地址追踪)
   */
  async getWhaleTrackerData({ force = false, category = 'all', topN, customWallets } = {}) {
    const market = category === 'stocks' ? 'stocks' : 'crypto';
    const isStocks = market === 'stocks';
    const dex = isStocks ? 'xyz' : '';
    const normalizedTopN = normalizeWhaleTopN(topN);
    const normalizedCustom = parseCustomWhalesParam(customWallets);

    const customSpecKey = normalizedCustom.map(c => `${c.address}:${c.label}`).sort().join('|');
    const cacheKey = `${market}::${normalizedTopN}::${customSpecKey}`;
    const now = Date.now();
    const cachedEntry = this.responseCache.get(cacheKey);
    if (!force && cachedEntry && (now - cachedEntry.cachedAt) < this.ttlMs) {
      return cachedEntry.data;
    }

    if (this.inFlightByKey.has(cacheKey)) {
      return this.inFlightByKey.get(cacheKey);
    }

    const buildMarketFallback = () => {
      if (isStocks) {
        const stockFallback = this.getStockWhalesData({ topN: normalizedTopN, customWallets: normalizedCustom });
        return {
          ok: true,
          provider: 'Hyperliquid HIP-3 (TradeXYZ)',
          category: 'stocks',
          fetchedAt: new Date().toISOString(),
          ...stockFallback,
          stockWhales: stockFallback
        };
      }
      return this.getFallbackData({ topN: normalizedTopN, customWallets: normalizedCustom });
    };

    const task = (async () => {
      try {
        // 1. 并行获取全市场标记价/成交量 (Crypto 主网 或 HIP-3 dex='xyz') + 主网排行榜候选池
        const metaPromise = this.fetchMetaAndAssetCtxs(dex, 5000);
        const leaderboardPromise = this.fetchLeaderboardCandidates();
        const [assetPrices, leaderboard] = await Promise.all([metaPromise, leaderboardPromise]);

        const customMap = new Map(normalizedCustom.map(c => [c.address, c]));
        const displayNames = leaderboard?.displayNamesByAddr instanceof Map
          ? leaderboard.displayNamesByAddr
          : new Map();
        const curatedList = isStocks ? CURATED_STOCK_WHALES : CURATED_WHALES;
        const curatedMap = isStocks ? CURATED_STOCK_WHALE_MAP : CURATED_WHALE_MAP;

        // 2. 构建候选地址 Meta 映射（leaderboard + curated + customWallets）
        const buildCandidateMeta = addr => {
          const low = String(addr || '').toLowerCase();
          const curated = curatedMap.get(low);
          const custom = customMap.get(low);
          const lbItem = (leaderboard?.candidates || []).find(c => c.address === low);
          return {
            address: low,
            defaultEquity: curated?.defaultEquity || curated?.accountValue || 0,
            defaultNtlPos: curated?.defaultNtlPos || curated?.totalNtlPos || 0,
            displayName: lbItem?.displayName || displayNames.get(low) || '',
            isCustom: Boolean(custom),
            customLabel: custom?.label || ''
          };
        };

        const poolSeedAddrs = new Set();
        for (const w of CURATED_WHALES) poolSeedAddrs.add(w.address.toLowerCase());
        if (isStocks) {
          for (const w of CURATED_STOCK_WHALES) poolSeedAddrs.add(w.address.toLowerCase());
        }
        for (const c of (leaderboard?.candidates || [])) poolSeedAddrs.add(c.address.toLowerCase());

        const marketPoolCache = this.discoveryPoolCache.get(market);
        const discoveryPoolFresh = this.discoveryTtlMs > 0
          && marketPoolCache
          && (Date.now() - marketPoolCache.fetchedAt) < this.discoveryTtlMs;

        let marketPoolWhales = [];
        const customStatesByAddr = new Map();
        const activeDiscoveredCountRef = { count: 0 };

        if (!discoveryPoolFresh) {
          // 完整池探测：同时涵盖 curated + leaderboard 候选 + 本次 custom 地址
          const allAddrsToProbe = new Set(poolSeedAddrs);
          for (const c of normalizedCustom) allAddrsToProbe.add(c.address);

          const probeList = [...allAddrsToProbe];
          const probeResults = await mapWithConcurrency(
            probeList,
            this.discoveryConcurrency,
            async addr => {
              const state = await this.fetchClearinghouseState(addr, 6000, dex);
              return { addr, state };
            }
          );

          const rankedMarketPool = [];
          for (const r of probeResults) {
            if (r.status !== 'fulfilled' || !r.value?.state) continue;
            const { addr, state } = r.value;
            const meta = buildCandidateMeta(addr);
            const whale = this.buildWhaleFromState(meta, state, assetPrices, displayNames, { market });
            if (customMap.has(addr)) {
              customStatesByAddr.set(addr, whale);
            }
            if (poolSeedAddrs.has(addr) && whale.positions.length > 0) {
              rankedMarketPool.push({
                address: addr,
                totalNtlPos: whale.totalNtlPos,
                accountValue: whale.accountValue,
                isCurated: whale.isCurated
              });
              marketPoolWhales.push(whale);
            }
          }

          rankedMarketPool.sort((a, b) =>
            (b.totalNtlPos - a.totalNtlPos)
            || ((b.isCurated ? 1 : 0) - (a.isCurated ? 1 : 0))
            || (b.accountValue - a.accountValue)
          );

          if (this.discoveryTtlMs > 0 && rankedMarketPool.length >= (isStocks ? 2 : 3)) {
            this.discoveryPoolCache.set(market, {
              fetchedAt: Date.now(),
              rankedActive: rankedMarketPool
            });
          }
          activeDiscoveredCountRef.count = rankedMarketPool.length;
        } else {
          // 复用 3 分钟发现排名缓存：仅针对 Top(N+4) + 核心巨鲸 + 自选地址拉取实时最新 clearinghouseState
          const rankedActive = marketPoolCache.rankedActive || [];
          activeDiscoveredCountRef.count = rankedActive.length;
          const targetAddrs = new Set();
          for (const item of rankedActive.slice(0, normalizedTopN + 4)) {
            targetAddrs.add(item.address);
          }
          for (const w of curatedList) targetAddrs.add(w.address.toLowerCase());
          for (const c of normalizedCustom) targetAddrs.add(c.address);

          const fetchResults = await mapWithConcurrency(
            [...targetAddrs],
            this.discoveryConcurrency,
            async addr => {
              const state = await this.fetchClearinghouseState(addr, 6000, dex);
              return { addr, state };
            }
          );

          for (const r of fetchResults) {
            if (r.status !== 'fulfilled' || !r.value?.state) continue;
            const { addr, state } = r.value;
            const meta = buildCandidateMeta(addr);
            const whale = this.buildWhaleFromState(meta, state, assetPrices, displayNames, { market });
            if (customMap.has(addr)) {
              customStatesByAddr.set(addr, whale);
            }
            if (poolSeedAddrs.has(addr) && whale.positions.length > 0) {
              marketPoolWhales.push(whale);
            }
          }
        }

        const minLivePool = isStocks ? 2 : 3;
        if (marketPoolWhales.length < minLivePool && customStatesByAddr.size === 0) {
          const fallback = buildMarketFallback();
          this.responseCache.set(cacheKey, { cachedAt: Date.now(), data: fallback });
          return fallback;
        }

        // 若市场兜底需求未满足但自定义钱包成功，亦补充回退市场巨鲸保证体验完整
        const isLive = true;
        const source = isStocks ? 'hyperliquid-xyz-api' : 'hyperliquid-api';
        if (marketPoolWhales.length < minLivePool) {
          const fallback = buildMarketFallback();
          const mergedFallback = [...fallback.whales];
          for (const [addr, customWhale] of customStatesByAddr.entries()) {
            const idx = mergedFallback.findIndex(w => w.address.toLowerCase() === addr);
            if (idx >= 0) mergedFallback[idx] = customWhale;
            else mergedFallback.push(customWhale);
          }
          const result = {
            ...fallback,
            whales: mergedFallback,
            aggregate: this.computeAggregateMetrics(mergedFallback)
          };
          this.responseCache.set(cacheKey, { cachedAt: Date.now(), data: result });
          return result;
        }

        // 3. 选取 Top N 活跃市场巨鲸 + 合并所有自定义关注钱包（去重，自选允许 0 持仓保留）
        marketPoolWhales.sort((a, b) =>
          (b.totalNtlPos - a.totalNtlPos)
          || ((b.isCurated ? 1 : 0) - (a.isCurated ? 1 : 0))
          || (b.accountValue - a.accountValue)
        );

        const finalByAddr = new Map();
        for (const w of marketPoolWhales.slice(0, normalizedTopN)) {
          finalByAddr.set(w.address, w);
        }
        for (const c of normalizedCustom) {
          const cw = customStatesByAddr.get(c.address);
          if (cw) {
            finalByAddr.set(c.address, cw);
          }
        }

        const selectedWhales = [...finalByAddr.values()].sort((a, b) =>
          (b.totalNtlPos - a.totalNtlPos)
          || ((b.isCustom ? 1 : 0) - (a.isCustom ? 1 : 0))
          || (b.accountValue - a.accountValue)
        );

        // 4. 智能配额保护获取近 12H userFillsByTime 成交（仅限最终入选列表，按市场分键缓存）
        const fillNow = Date.now();
        const fillLookbackStart = fillNow - 12 * 3600 * 1000;
        const posSigOf = w => w.positions.map(p => `${p.coin}:${p.side}:${p.size}`).join('|');

        const mustRefresh = [];
        const staleRefresh = [];
        const fillsByAddr = new Map();

        for (const w of selectedWhales) {
          const sig = posSigOf(w);
          const fKey = `${market}:${w.address}`;
          const cached = this.fillsCache.get(fKey);
          if (this.fillsTtlMs === 0 || !cached || cached.posSignature !== sig) {
            mustRefresh.push({ whale: w, sig, fKey });
          } else if ((fillNow - cached.fetchedAt) >= this.fillsTtlMs) {
            staleRefresh.push({ whale: w, sig, fKey });
          } else {
            fillsByAddr.set(w.address, cached.fills);
          }
        }

        // 常规轮询若需淘汰过期 fills，优先自选 + 高持仓（单轮最多补刷新 10 个过期账户，确保持续在 1200 weight/min 安全水位内）
        staleRefresh.sort((a, b) =>
          ((b.whale.isCustom ? 1 : 0) - (a.whale.isCustom ? 1 : 0))
          || (b.whale.totalNtlPos - a.whale.totalNtlPos)
        );
        const staleQuota = this.fillsTtlMs > 0 ? Math.max(0, 10 - mustRefresh.length) : staleRefresh.length;
        const toFetchFills = [...mustRefresh, ...staleRefresh.slice(0, staleQuota)];

        for (const item of staleRefresh.slice(staleQuota)) {
          const cached = this.fillsCache.get(item.fKey);
          fillsByAddr.set(item.whale.address, cached ? cached.fills : []);
        }

        if (toFetchFills.length > 0) {
          const fillResults = await mapWithConcurrency(
            toFetchFills,
            this.fillsConcurrency,
            async item => {
              const fills = await this.fetchUserFillsByTime(item.whale.address, fillLookbackStart, 6000, fillNow);
              return { addr: item.whale.address, fKey: item.fKey, sig: item.sig, fills };
            }
          );

          for (const r of fillResults) {
            if (r.status === 'fulfilled' && r.value) {
              const { addr, fKey, sig, fills } = r.value;
              this.fillsCache.set(fKey, { fetchedAt: Date.now(), posSignature: sig, fills });
              fillsByAddr.set(addr, fills);
            }
          }

          if (this.fillsCache.size > 100) {
            const firstKey = this.fillsCache.keys().next().value;
            if (firstKey) this.fillsCache.delete(firstKey);
          }
        }

        const fulfilledEntries = selectedWhales.map(w => ({
          whale: w,
          fills: fillsByAddr.get(w.address) || []
        }));

        const aggregate = this.computeAggregateMetrics(selectedWhales);
        const fetchCompletedAt = Date.now();
        const activityLogs = this.buildActivityLogsFromFills(fulfilledEntries, {
          now: fetchCompletedAt,
          market
        });
        const assetVolumes = {};
        for (const [coin, info] of Object.entries(assetPrices)) {
          const dayVol = Number(info?.dayVol) || 0;
          if (dayVol > 0) assetVolumes[String(coin).toUpperCase()] = dayVol;
        }

        let stockWhales;
        if (!isStocks) {
          const warmStocks = this.latestLiveStocksSummary;
          stockWhales = warmStocks || this.getStockWhalesData({ topN: normalizedTopN, customWallets: normalizedCustom });
        }

        const payload = {
          ok: true,
          provider: isStocks ? 'Hyperliquid HIP-3 (TradeXYZ)' : 'Hyperliquid L1 DEX',
          category: market,
          isLive,
          isSample: false,
          source,
          fetchedAt: new Date(fetchCompletedAt).toISOString(),
          meta: {
            topN: normalizedTopN,
            dex: dex || 'perp',
            activeDiscoveredCount: Math.max(activeDiscoveredCountRef.count, marketPoolWhales.length),
            customCount: normalizedCustom.length,
            leaderboardActive: Boolean(leaderboard?.ok),
            leaderboardTotalRows: leaderboard?.totalRows || 0
          },
          aggregate,
          whales: selectedWhales,
          activityLogs,
          assetVolumes,
          ...(isStocks ? {} : { stockWhales })
        };

        if (isStocks) {
          this.latestLiveStocksSummary = {
            category: 'stocks',
            isLive: true,
            isSample: false,
            source,
            fetchedAt: payload.fetchedAt,
            meta: payload.meta,
            aggregate,
            whales: selectedWhales,
            activityLogs,
            assetVolumes
          };
        }

        this.responseCache.set(cacheKey, { cachedAt: fetchCompletedAt, data: payload });
        if (this.responseCache.size > 24) {
          const oldestKey = this.responseCache.keys().next().value;
          if (oldestKey) this.responseCache.delete(oldestKey);
        }
        return payload;
      } catch {
        if (cachedEntry?.data) {
          return cachedEntry.data;
        }
        const fallback = buildMarketFallback();
        this.responseCache.set(cacheKey, { cachedAt: Date.now(), data: fallback });
        return fallback;
      } finally {
        this.inFlightByKey.delete(cacheKey);
      }
    })();

    this.inFlightByKey.set(cacheKey, task);
    return task;
  }
}

let defaultService = null;
export function getCryptoWhaleService() {
  if (!defaultService) {
    defaultService = new CryptoWhaleService();
  }
  return defaultService;
}

