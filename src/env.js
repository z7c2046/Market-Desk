// Zero-dependency .env loader. Import for its side effect — it reads the
// project-root .env once and copies any keys that are not already present in
// process.env (real environment variables always win). Missing .env is fine.
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

loadEnv();
