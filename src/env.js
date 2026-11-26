// Zero-dependency .env loader. Import for its side effect — it reads the
// project-root .env once and copies any keys that are not already present in
// process.env (real environment variables always win). Missing .env is fine.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env");

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq === -1) return null;
  const key = trimmed.slice(0, eq).trim();
  if (!key) return null;
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadEnv() {
  let text;
  try {
    text = fs.readFileSync(envPath, "utf8");
  } catch {
    return; // no .env file — rely on the real environment
  }
  for (const line of text.split(/\r?\n/)) {
    const entry = parseLine(line);
    if (entry && !(entry.key in process.env)) process.env[entry.key] = entry.value;
  }
}

function normalizeProxyUrl(raw) {
  const val = String(raw || "").trim();
  if (!val) return "";
  if (/^https?:\/\//i.test(val)) return val;
  if (/^[a-z0-9+.-]+:\/\//i.test(val)) return val;
  return `http://${val}`;
}

export function parseWindowsProxyOutput(stdout) {
  const text = String(stdout || "");
  const enableMatch = text.match(/^\s*ProxyEnable\s+REG_DWORD\s+(0x[0-9a-f]+|\d+)/im);
  if (!enableMatch) return null;
  const enableVal = Number(enableMatch[1]);
  if (!Number.isFinite(enableVal) || enableVal !== 1) return null;

  const serverMatch = text.match(/^\s*ProxyServer\s+REG_SZ\s+(.+)$/im);
  const rawServer = serverMatch ? serverMatch[1].trim() : "";
  if (!rawServer) return null;

  let httpProxy = "";
  let httpsProxy = "";
  if (rawServer.includes("=")) {
    for (const part of rawServer.split(";")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const proto = part.slice(0, idx).trim().toLowerCase();
      const target = part.slice(idx + 1).trim();
      if (!target) continue;
      if (proto === "http") httpProxy = normalizeProxyUrl(target);
      else if (proto === "https") httpsProxy = normalizeProxyUrl(target);
    }
    if (!httpsProxy && httpProxy) httpsProxy = httpProxy;
    if (!httpProxy && httpsProxy) httpProxy = httpsProxy;
  } else {
    const unified = normalizeProxyUrl(rawServer);
    httpProxy = unified;
    httpsProxy = unified;
  }

  if (!httpProxy && !httpsProxy) return null;

  const overrideMatch = text.match(/^\s*ProxyOverride\s+REG_SZ\s+(.+)$/im);
  const overrides = overrideMatch
    ? overrideMatch[1].split(/[;,]/).map(s => s.trim()).filter(s => s && s !== "<local>")
    : [];

  return { httpProxy, httpsProxy, overrides };
}

export function applyWindowsSystemProxy() {
  if (process.platform !== "win32") return false;
  if (process.env.NO_SYSTEM_PROXY === "1") return false;
  if (process.env.NODE_ENV === "test") return false;
  if (Array.isArray(process.execArgv) && process.execArgv.includes("--test")) return false;
  if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
    return false;
  }

  try {
    const out = execFileSync(
      "reg",
      ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"],
      { encoding: "utf8", timeout: 800, windowsHide: true }
    );
    const parsed = parseWindowsProxyOutput(out);
    if (!parsed) return false;

    if (parsed.httpProxy) process.env.HTTP_PROXY = parsed.httpProxy;
    if (parsed.httpsProxy) process.env.HTTPS_PROXY = parsed.httpsProxy;
    process.env.NODE_USE_ENV_PROXY = process.env.NODE_USE_ENV_PROXY || "1";

    const existingNoProxy = String(process.env.NO_PROXY || process.env.no_proxy || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const mergedNoProxy = Array.from(new Set([...existingNoProxy, "localhost", "127.0.0.1", "::1", ...parsed.overrides]));
    process.env.NO_PROXY = mergedNoProxy.join(",");
    return true;
  } catch {
    return false;
  }
}

loadEnv();
applyWindowsSystemProxy();
