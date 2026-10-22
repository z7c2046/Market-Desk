// Cboe adapter and per-strike exposure calculation ported/adapted from
// aaguiar10/gflows (MIT), modules/ticker_dwn.py and modules/calc.py.
// Copyright (c) 2023 - present aaguiar10. See licenses/gflows-MIT.txt.
// Changes: parse each OCC contract independently, preserve fractional strikes,
// never substitute volume for OI, and make 100 shares x 1% scaling explicit.
import { number, nyDate } from './workspace-data.js';

export function parseContract(row, expectedRoot) {
  const match = String(row.option || '').match(/^([A-Z.]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!match || (expectedRoot && match[1] !== expectedRoot)) return null;
  const [, root, yy, mm, dd, type, strike] = match;
  const expiration = `20${yy}-${mm}-${dd}`;
  if (Number.isNaN(Date.parse(expiration)) || new Date(expiration).toISOString().slice(0, 10) !== expiration) return null;
  const oi = number(row.open_interest), gamma = number(row.gamma), volume = number(row.volume);
  return { root, expiration, type, strike: Number(strike) / 1000,
    oi: oi !== null && oi >= 0 ? oi : null, gamma: gamma !== null && gamma >= 0 ? gamma : null,
    volume: volume !== null && volume >= 0 ? volume : null };
}

export function buildOptionsWall(payload, { symbol, expiration = '', now = new Date() }) {
  const spot = number(payload?.data?.current_price);
  if (!(spot > 0) || !Array.isArray(payload?.data?.options)) throw new Error('期权链数据格式不可用。');
  const root = symbol.replace(/^\^/, '').replace('-', '.');
  const parsed = payload.data.options.map(row => parseContract(row, root)).filter(Boolean);
  const today = nyDate(now);
  const nyTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  // 16:15 ET conservatively covers the later ETF closing session. Do not keep
  // displaying today's expired chain after that cutoff just because it is cached.
  const contracts = parsed.filter(x => x.expiration > today || (x.expiration === today && nyTime < '16:15'));
  const expirations = [...new Set(contracts.map(x => x.expiration))].sort();
  const selected = expiration || expirations[0];
  if (!selected || (selected !== 'all' && !expirations.includes(selected))) {
    throw Object.assign(new Error('没有该到期日的有效期权链，请刷新到期日列表。'), { status: expiration ? 400 : 502 });
  }
  const rows = contracts.filter(x => selected === 'all' || x.expiration === selected);
  const strikes = new Map(); let missingOi = 0; let missingGamma = 0;
  for (const row of rows) {
    if (!strikes.has(row.strike)) strikes.set(row.strike, { strike: row.strike, callOi: 0, putOi: 0, callVolume: 0, putVolume: 0, callGex: 0, putGex: 0 });
    const bucket = strikes.get(row.strike); const side = row.type === 'C' ? 'call' : 'put';
    if (row.oi === null) missingOi++; else bucket[`${side}Oi`] += row.oi;
    bucket[`${side}Volume`] += row.volume ?? 0;
    if (row.gamma === null && row.oi !== 0) missingGamma++;
    if (row.oi !== null && row.gamma !== null) bucket[`${side}Gex`] += row.gamma * row.oi * 100 * spot * spot * 0.01 * (row.type === 'C' ? 1 : -1);
  }
  const completeOi = missingOi === 0; const completeGex = completeOi && missingGamma === 0;
  const all = [...strikes.values()].sort((a, b) => a.strike - b.strike).map(row => ({ ...row, netGex: completeGex ? row.callGex + row.putGex : null }));
  const sum = key => all.reduce((total, row) => total + row[key], 0);
  const wall = key => { const peak = Math.max(0, ...all.map(row => row[key])); return completeOi && peak > 0 ? all.filter(row => row[key] === peak).map(row => row.strike) : []; };
  const callOi = completeOi ? sum('callOi') : null; const putOi = completeOi ? sum('putOi') : null;
  return { symbol, spot, expiration: selected, expirations, rows: all, callWall: wall('callOi'), putWall: wall('putOi'),
    callOi, putOi, putCallRatio: callOi > 0 ? putOi / callOi : null,
    netGex: completeGex ? sum('netGex') : null, missingOi, missingGamma, contracts: rows.length,
    asOf: payload.timestamp || null, asOfTimezone: '源站原始时间', source: 'Cboe 延迟期权链', delay: '延迟快照',
    methodology: 'OI 墙 = 所选到期日中持仓量最大的行权价（并列全部保留）。GEX = gamma × OI × 100 × spot² × 1%；Call 正、Put 负仅为模型假设，不代表已知做市商仓位。持仓量通常每日更新。',
  };
}
