import crypto from "node:crypto";
import https from "node:https";
import tls from "node:tls";

const TV_HOST = "data.tradingview.com";
const TV_PATH = "/socket.io/websocket";

function cleanSymbolPart(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .trim()
    .toUpperCase();
}

function httpsJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 InflectionHunter/0.1",
        "Accept": "application/json,text/plain,*/*",
        "Origin": "https://www.tradingview.com",
        "Referer": "https://www.tradingview.com/"
      },
      timeout: timeoutMs
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`http_${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`json_parse_failed: ${error.message}`));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("request_timeout"));
    });
    req.on("error", reject);
  });
}

export async function resolveTradingViewSymbol(symbol) {
  const raw = cleanSymbolPart(symbol || "SNDK");
  if (raw.includes(":")) return raw;

  const stockUrl = new URL("https://symbol-search.tradingview.com/symbol_search/");
  stockUrl.searchParams.set("text", raw);
  stockUrl.searchParams.set("type", "stock");
  stockUrl.searchParams.set("hl", "1");
  stockUrl.searchParams.set("exchange", "");
  stockUrl.searchParams.set("lang", "en");
  stockUrl.searchParams.set("domain", "production");

  try {
    const results = await httpsJson(stockUrl.toString(), 8000);
    const list = Array.isArray(results) ? results : [];
    const exact = list.find((item) => cleanSymbolPart(item.symbol) === raw) || list[0];
    if (exact) {
      const fullName = cleanSymbolPart(exact.full_name || exact.pro_name);
      if (fullName.includes(":")) return fullName;
      const exchange = cleanSymbolPart(exact.exchange || exact.prefix);
      const itemSymbol = cleanSymbolPart(exact.symbol || raw);
      if (exchange && itemSymbol) return `${exchange}:${itemSymbol}`;
    }
  } catch (_) {
    // Fallback below keeps common US tickers usable when symbol search is unavailable.
  }

  if (/^[A-Z]{2,6}USD(T)?$/.test(raw)) return `BINANCE:${raw.replace("USD", "USDT")}`;
  return `NASDAQ:${raw}`;
}

export function mapTimeframe(tf) {
  const value = String(tf || "1d").trim().toLowerCase();
  const table = {
    "1": "1",
    "5": "5",
    "5m": "5",
    "15": "15",
    "15m": "15",
    "30": "30",
    "30m": "30",
    "1h": "60",
    "60": "60",
    "4h": "240",
    "240": "240",
    "1d": "D",
    "d": "D",
    "1w": "W",
    "w": "W",
    "1m": "M",
    "1mo": "M",
    "m": "M"
  };
  return table[value] || "D";
}

function encodeWsFrame(text) {
  const payload = Buffer.from(text);
  const mask = crypto.randomBytes(4);
  let header;

  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = 0x80 | payload.length;
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }

  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    masked[i] = payload[i] ^ mask[i % 4];
  }

  return Buffer.concat([header, mask, masked]);
}

function decodeWsFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const b1 = buffer[offset];
    const b2 = buffer[offset + 1];
    const opcode = b1 & 0x0f;
    const masked = (b2 & 0x80) !== 0;
    let length = b2 & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (buffer.length - offset < 4) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (buffer.length - offset < 10) break;
      const n = buffer.readBigUInt64BE(offset + 2);
      if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("websocket_frame_too_large");
      length = Number(n);
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (buffer.length - offset < frameLength) break;

    let payload = buffer.subarray(offset + headerLength + maskLength, offset + frameLength);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      const unmasked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i += 1) {
        unmasked[i] = payload[i] ^ mask[i % 4];
      }
      payload = unmasked;
    }

    messages.push({ opcode, payload });
    offset += frameLength;
  }

  return { messages, rest: buffer.subarray(offset) };
}

function tvPayload(method, params) {
  const json = JSON.stringify({ m: method, p: params });
  return `~m~${Buffer.byteLength(json)}~m~${json}`;
}

function parseTradingViewPackets(text, state, sendText, onPacket) {
  state.tvBuffer += text;

  while (state.tvBuffer.length) {
    if (state.tvBuffer.startsWith("~h~")) {
      const next = state.tvBuffer.indexOf("~m~", 3);
      const heartbeat = next === -1 ? state.tvBuffer : state.tvBuffer.slice(0, next);
      sendText(heartbeat);
      state.tvBuffer = next === -1 ? "" : state.tvBuffer.slice(next);
      continue;
    }

    if (!state.tvBuffer.startsWith("~m~")) {
      const nextM = state.tvBuffer.indexOf("~m~");
      const nextH = state.tvBuffer.indexOf("~h~");
      const candidates = [nextM, nextH].filter((n) => n >= 0);
      if (!candidates.length) {
        state.tvBuffer = "";
        return;
      }
      state.tvBuffer = state.tvBuffer.slice(Math.min(...candidates));
      continue;
    }

    const lenEnd = state.tvBuffer.indexOf("~m~", 3);
    if (lenEnd === -1) return;

    const length = Number(state.tvBuffer.slice(3, lenEnd));
    if (!Number.isFinite(length)) {
      state.tvBuffer = state.tvBuffer.slice(lenEnd + 3);
      continue;
    }

    const bodyStart = lenEnd + 3;
    const bodyEnd = bodyStart + length;
    if (state.tvBuffer.length < bodyEnd) return;

    const body = state.tvBuffer.slice(bodyStart, bodyEnd);
    state.tvBuffer = state.tvBuffer.slice(bodyEnd);

    try {
      onPacket(JSON.parse(body));
    } catch (_) {
      // Ignore malformed telemetry packets.
    }
  }
}

function parseBarsFromPacket(packet) {
  if (packet?.m !== "timescale_update") return null;
  const data = packet?.p?.[1]?.s1;
  const rows = data?.s;
  if (!Array.isArray(rows)) return null;

  return rows
    .map((row) => {
      const v = row?.v || [];
      return {
        time: Number(v[0]),
        open: Number(v[1]),
        high: Number(v[2]),
        low: Number(v[3]),
        close: Number(v[4]),
        volume: Number(v[5] || 0)
      };
    })
    .filter((bar) => Number.isFinite(bar.time) && Number.isFinite(bar.close))
    .sort((a, b) => a.time - b.time);
}

export async function fetchTradingViewBars({ symbol, tf = "1d", limit = 600, timeoutMs = 20000 }) {
  const resolvedSymbol = await resolveTradingViewSymbol(symbol);
  const interval = mapTimeframe(tf);
  const count = Math.max(50, Math.min(5000, Number(limit || 600)));

  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString("base64");
    const chartSession = `cs_${crypto.randomBytes(6).toString("hex")}`;
    const state = { handshake: false, rawBuffer: Buffer.alloc(0), tvBuffer: "" };
    let done = false;

    const socket = tls.connect(443, TV_HOST, { servername: TV_HOST }, () => {
      const request = [
        `GET ${TV_PATH} HTTP/1.1`,
        `Host: ${TV_HOST}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        "Origin: https://www.tradingview.com",
        "User-Agent: Mozilla/5.0 InflectionHunter/0.1",
        "",
        ""
      ].join("\r\n");
      socket.write(request);
    });

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      socket.destroy();
      reject(new Error("tradingview_timeout"));
    }, timeoutMs);

    function finish(error, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.end();
      if (error) reject(error);
      else resolve(result);
    }

    function sendText(text) {
      if (!socket.destroyed) socket.write(encodeWsFrame(text));
    }

    function send(method, params) {
      sendText(tvPayload(method, params));
    }

    function sendInit() {
      const symbolConfig = JSON.stringify({
        symbol: resolvedSymbol,
        adjustment: "splits",
        session: "regular"
      });

      send("chart_create_session", [chartSession, ""]);
      send("resolve_symbol", [chartSession, "symbol_1", `=${symbolConfig}`]);
      send("create_series", [chartSession, "s1", "s1", "symbol_1", interval, count]);
    }

    socket.on("data", (chunk) => {
      try {
        if (!state.handshake) {
          state.rawBuffer = Buffer.concat([state.rawBuffer, chunk]);
          const text = state.rawBuffer.toString("latin1");
          const splitAt = text.indexOf("\r\n\r\n");
          if (splitAt === -1) return;

          const header = text.slice(0, splitAt);
          if (!/^HTTP\/1\.1 101/i.test(header)) {
            finish(new Error(`websocket_upgrade_failed: ${header.split("\r\n")[0]}`));
            return;
          }

          const leftover = state.rawBuffer.subarray(splitAt + 4);
          state.rawBuffer = Buffer.alloc(0);
          state.handshake = true;
          sendInit();
          if (!leftover.length) return;
          chunk = leftover;
        }

        state.rawBuffer = Buffer.concat([state.rawBuffer, chunk]);
        const decoded = decodeWsFrames(state.rawBuffer);
        state.rawBuffer = decoded.rest;

        for (const frame of decoded.messages) {
          if (frame.opcode === 8) {
            finish(new Error("websocket_closed"));
            return;
          }
          if (frame.opcode === 9) {
            continue;
          }
          if (frame.opcode !== 1) continue;

          parseTradingViewPackets(frame.payload.toString("utf8"), state, sendText, (packet) => {
            if (packet?.m === "series_error" || packet?.m === "symbol_error" || packet?.m === "critical_error") {
              finish(new Error(`tradingview_${packet.m}: ${JSON.stringify(packet.p || [])}`));
              return;
            }

            if (packet?.m === "symbol_resolved") {
              const meta = packet.p?.[2] || {};
              state.resolvedExchange = meta.exchange || meta.listed_exchange || "";
              state.resolvedCurrency = meta.currency_code || meta.currency || "USD";
            }

            const bars = parseBarsFromPacket(packet);
            if (bars && bars.length) {
              const parts = resolvedSymbol.split(":");
              const fallbackExchange = parts.length > 1 ? parts[0] : "US";
              const rawTicker = parts.length > 1 ? parts[1] : resolvedSymbol;

              finish(null, {
                symbol: resolvedSymbol,
                rawTicker,
                exchange: state.resolvedExchange || fallbackExchange,
                currency: state.resolvedCurrency || "USD",
                session: "regular",
                adjustment: "splits",
                interval,
                bars
              });
            }
          });
        }
      } catch (error) {
        finish(error);
      }
    });

    socket.on("error", (error) => {
      finish(error);
    });

    socket.on("close", () => {
      if (!done) finish(new Error("tradingview_socket_closed"));
    });
  });
}
