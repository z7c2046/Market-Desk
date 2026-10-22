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

export function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "...";
  return n.toFixed(digits);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function getDateOffset(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function getYtdIso() {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
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
  const side = String(signal.side || "");
  const isBuy = side.includes("B");
  const isEarly = side.startsWith("e");
  const isWeakness = signal.kind === "structural_weakness" || side === "eS";

  return {
    time: Number(signal.time),
    position: isBuy ? "belowBar" : "aboveBar",
    color: isBuy
      ? (isEarly ? "#0284c7" : "#10b981")
      : (isWeakness ? "#f59e0b" : "#ef4444"),
    shape: isBuy ? "arrowUp" : "arrowDown",
    text: side,
    size: isEarly ? 1 : 2
  };
}

export function reasonLabel(reason) {
  const r = String(reason || "");
  const map = {
    consolidation_launch_observation: "强势整理启动观察 (eB)",
    consolidation_launch_confirmed: "突破20日高点启动 (B)",
    pullback_reversal_confirmed: "20SMA缩量回调转强 (B)",
    breakdown_volume_weakness_warning: "放量跌破5日低点转弱 (eS)",
    atr_trailing_stop_exit: "跌破3xATR跟踪线止损 (S)",
    setup_invalidation_exit: "形态失效止损退出 (S)",
    top_divergence_warning: "RSI顶背离预警 (eS)",
    top_divergence_confirmed: "RSI顶背离确认 (S)",
    bottom_divergence_warning: "RSI底背离观察 (eB)",
    bottom_divergence_confirmed: "RSI底背离确认 (B)",
    oversold_volume_observation: "超卖巨量止跌观察 (eB)",
    oversold_volume_confirmed: "超卖反转确认 (B)",
    panic_bottom_observation: "恐慌放量底部观察 (eB)",
    panic_bottom_confirmed: "恐慌底恢复确认 (B)",
    exhaustion_top_observation: "高位缩量动能衰竭 (eS)",
    exhaustion_top_confirmed: "高位转弱顶部确认 (S)",
    momentum_breakout_confirmed: "放量突破20日新高 (B)"
  };
  return map[r] || r;
}
