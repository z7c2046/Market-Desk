export const DEFAULT_US_UNIVERSE = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "META",
  "GOOGL",
  "GOOG",
  "TSLA",
  "AVGO",
  "AMD",
  "NFLX",
  "PLTR",
  "SMCI",
  "COIN",
  "MSTR",
  "ARM",
  "MU",
  "CRWD",
  "PANW",
  "SNOW",
  "SHOP",
  "UBER",
  "ABNB",
  "RBLX",
  "SOFI",
  "HOOD",
  "ROKU",
  "SQ",
  "PYPL",
  "INTC",
  "QCOM",
  "ORCL",
  "CRM",
  "ADBE",
  "NOW",
  "LLY",
  "UNH",
  "JPM",
  "BAC",
  "XOM",
  "CVX",
  "BA",
  "CAT",
  "GE",
  "LITE",
  "MRVL",
  "NET",
  "DDOG",
  "ZS",
  "UPST"
];

export function parseSymbolList(value, fallback = DEFAULT_US_UNIVERSE) {
  const raw = String(value || "")
    .split(/[\s,;|]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  const source = raw.length ? raw : fallback;
  return [...new Set(source)]
    .filter((symbol) => /^[A-Z0-9:.\\-]{1,24}$/.test(symbol))
    .slice(0, 100);
}
