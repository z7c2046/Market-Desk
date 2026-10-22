import "./env.js"; // loads .env into process.env before anything reads it
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareStrategyBacktests } from "./backtest.js";
import { fetchWatchlistSymbols } from "./notion.js";
import { scanRadar } from "./radar.js";
import { getMarketSnapshot } from "./snapshot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const port = Number(process.env.PORT || 5174);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"]
]);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(safePath);
  const target = path.normalize(path.join(publicDir, decoded));

  if (!target.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error("not_file");
    const ext = path.extname(target).toLowerCase();
    const body = await fs.readFile(target);
    res.writeHead(200, {
      "Content-Type": mimeTypes.get(ext) || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(body);
  } catch (_) {
    if (path.extname(target)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    await serveStatic(req, res, "/index.html");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, ts: new Date().toISOString() });
    return;
  }

  if (url.pathname === "/api/watchlist") {
    try {
      const force = url.searchParams.get("force") === "1";
      const result = await fetchWatchlistSymbols({ force });
      sendJson(res, 200, { ok: true, count: result.symbols.length, ...result });
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message,
        hint: "Set NOTION_TOKEN and NOTION_DATABASE_ID in .env, and share the database with the integration."
      });
    }
    return;
  }

  if (url.pathname === "/api/market/snapshot") {
    try {
      const snapshot = await getMarketSnapshot(Object.fromEntries(url.searchParams));
      sendJson(res, 200, snapshot);
    } catch (error) {
      const isBadParam = error.message && error.message.includes("not supported");
      sendJson(res, isBadParam ? 400 : 502, {
        ok: false,
        error: error.message,
        hint: isBadParam
          ? "RSI + Volume mode runs exclusively on 1d daily timeframe."
          : "TradingView public endpoints are best-effort and may require outbound network access."
      });
    }
    return;
  }

  if (url.pathname === "/api/radar") {
    try {
      const result = await scanRadar(Object.fromEntries(url.searchParams));
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message,
        hint: "Radar scans multiple TradingView websocket snapshots. Use fewer symbols or a larger timeframe if public endpoints throttle."
      });
    }
    return;
  }

  if (url.pathname === "/api/backtest") {
    try {
      const result = await compareStrategyBacktests(Object.fromEntries(url.searchParams));
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message,
        hint: "Backtest uses TradingView public daily bars and the local signal engine."
      });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  await serveStatic(req, res, url.pathname);
});

server.listen(port, () => {
  console.log(`Inflection Hunter running at http://localhost:${port}`);
});
