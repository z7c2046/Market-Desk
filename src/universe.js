// Curated Nasdaq 100 & US Tech Universe (科技股精选池)
export const NASDAQ_100_TECH_UNIVERSE = [
  // Mega-cap Tech
  "NVDA",
  "AAPL",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "AVGO",
  // Semiconductor & Hardware Leaders
  "AMD",
  "QCOM",
  "TXN",
  "AMAT",
  "MU",
  "LRCX",
  "ADI",
  "KLAC",
  "ASML",
  "ARM",
  "MRVL",
  "NXPI",
  "ON",
  "MCHP",
  "MPWR",
  "GFS",
  "SMCI",
  "INTC",
  // Enterprise Cloud, AI & Software
  "ADBE",
  "CRM",
  "ORCL",
  "INTU",
  "NOW",
  "PLTR",
  "PANW",
  "CRWD",
  "SNOW",
  "DDOG",
  "ZS",
  "FTNT",
  "TEAM",
  "WDAY",
  "CDNS",
  "SNPS",
  "ANSS",
  "NET",
  "LITE",
  // Internet, Media & Digital Platforms
  "NFLX",
  "ABNB",
  "DASH",
  "UBER",
  "SHOP",
  "COIN",
  "MSTR",
  "PYPL",
  "ROKU",
  "RBLX",
  "SNDK"
];

export const DEFAULT_US_UNIVERSE = NASDAQ_100_TECH_UNIVERSE;

export function parseSymbolList(value, fallback = NASDAQ_100_TECH_UNIVERSE) {
  const raw = String(value || "")
    .split(/[\s,;|]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  const source = raw.length ? raw : fallback;
  return [...new Set(source)]
    .filter((symbol) => /^[A-Z0-9:.\\-]{1,24}$/.test(symbol))
    .slice(0, 100);
}
