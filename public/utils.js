export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "...";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function percent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "...";
  return `${Math.round(n * 100)}%`;
}

export function signedPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "...";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function formatTimeFor(tf, time) {
  const n = Number(time);
  if (!Number.isFinite(n)) return "";
  const date = new Date(n * 1000);
  const intraday = ["5m", "15m", "30m", "1h", "4h"].includes(String(tf || "").toLowerCase());
  if (!intraday) return date.toISOString().slice(0, 10);
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function toChartBar(bar) {
  return {
    time: Number(bar.time),
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close)
  };
}

export function markerFor(signal) {
  const isBuy = signal.side.includes("B");
  const isEarly = signal.side.startsWith("e");
  return {
    time: Number(signal.time),
    position: isBuy ? "belowBar" : "aboveBar",
    color: isBuy ? "#2976ff" : "#df4f46",
    shape: isBuy ? "arrowUp" : "arrowDown",
    text: signal.side,
    size: isEarly ? 1 : 2
  };
}
