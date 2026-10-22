// Explicitly user-provided net subscriptions/redemptions, never inferred from volume.
export function parseFlows(text) {
  if (text.length > 500000) throw new Error('文件过大，请控制在 500 KB 内。');
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.shift()?.trim() !== 'date,symbol,netFlowUsd,source') throw new Error('CSV 表头应为 date,symbol,netFlowUsd,source');
  if (!lines.length || lines.length > 2000) throw new Error('需要 1–2000 条数据。');
  const seen = new Set();
  return lines.map((line, i) => {
    const fields = line.split(',');
    if (fields.length !== 4) throw new Error(`第 ${i + 2} 行须有 4 列；来源名请勿包含逗号。`);
    const [date, rawSymbol, rawValue, source] = fields.map(x => x.trim());
    const symbol = rawSymbol.toUpperCase(); const netFlowUsd = Number(rawValue);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`第 ${i + 2} 行日期无效。`);
    if (!/^[A-Z][A-Z0-9.-]{0,10}$/.test(symbol) || !rawValue || !Number.isFinite(netFlowUsd) || !source || source.length > 120) throw new Error(`第 ${i + 2} 行代码、金额或来源无效。`);
    const key = `${date}:${symbol}`;
    if (seen.has(key)) throw new Error(`重复数据：${key}。每个代码每天仅保留一条。`);
    seen.add(key); return { date, symbol, netFlowUsd, source };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol));
}
