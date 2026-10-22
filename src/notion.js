import { DEFAULT_US_UNIVERSE } from "./universe.js";

const NOTION_VERSION = "2022-06-28";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes — the watchlist rarely changes

let cache = null; // { symbols, source, fetchedAt }

/**
 * Accept a raw 32-char id, a dashed UUID, or a full Notion URL and return the
 * bare 32-hex id that the API expects.
 */
function normalizeDbId(raw) {
  const str = String(raw || "").trim();
  const match = str.replace(/-/g, "").match(/[0-9a-fA-F]{32}/);
  return match ? match[0] : "";
}

function symbolFromPage(page) {
  // The WatchList database keeps the ticker in its single "title" property.
  const props = page?.properties || {};
  const titleProp = Object.values(props).find((p) => p?.type === "title");
  const text = (titleProp?.title || []).map((t) => t.plain_text).join("").trim();
  return text.toUpperCase();
}

async function queryAllPages(token, dbId) {
  const symbols = [];
  let cursor;

  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      signal: AbortSignal.timeout(12000),
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 })
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Notion query failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }

    const data = await res.json();
    for (const page of data.results || []) {
      const symbol = symbolFromPage(page);
      if (symbol) symbols.push(symbol);
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return symbols;
}

/**
 * Fetch the watchlist symbols from the configured Notion database.
 * Cached for CACHE_TTL. Degrades gracefully: if Notion is unconfigured or
 * unreachable it returns the last good cache, or the bundled default universe,
 * so the rest of the app keeps working.
 *
 * @returns {Promise<{ symbols: string[], source: "notion"|"fallback", cached?: boolean, stale?: boolean, error?: string }>}
 */
export async function fetchWatchlistSymbols({ force = false } = {}) {
  const token = process.env.NOTION_TOKEN;
  const dbId = normalizeDbId(process.env.NOTION_DATABASE_ID);

  if (!token || !dbId) {
    return { symbols: [...DEFAULT_US_UNIVERSE], source: "fallback", error: "notion_not_configured" };
  }

  const now = Date.now();
  if (!force && cache && now - cache.fetchedAt < CACHE_TTL) {
    return { symbols: cache.symbols, source: cache.source, cached: true };
  }

  try {
    const symbols = [...new Set(await queryAllPages(token, dbId))];
    if (!symbols.length) throw new Error("Notion watchlist is empty");
    cache = { symbols, source: "notion", fetchedAt: now };
    return { symbols, source: "notion" };
  } catch (error) {
    if (cache) return { symbols: cache.symbols, source: cache.source, stale: true, error: error.message };
    return { symbols: [...DEFAULT_US_UNIVERSE], source: "fallback", error: error.message };
  }
}
