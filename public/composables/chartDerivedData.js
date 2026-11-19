/**
 * Chart Derived Data and Readout Cache Manager
 *
 * 集中管理当前图表上下文（symbol, interval, range, dataRevision）的派生数据计算与读数格式化。
 * 避免在 hover、十字光标移动、缩放或拖拽期间重复调用全量 computeInflectionSignals / dema 计算。
 */

export function createChartDerivedData(options = {}) {
  const defaultComputeSignals = options.computeSignals || null;
  const defaultFormatMarkers = options.formatMarkers || null;
  const defaultDema = options.dema || null;

  let cachedSnapshot = null;
  let cachedReadout = {
    barTime: null,
    snapshotRevision: -1,
    showSignals: null,
    klineSchemeKey: '',
    isDark: null,
    html: '',
  };

  const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const nyDayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  function calcMA(bars, period) {
    if (!bars || bars.length < period) return [];
    const result = [];
    let sum = 0;
    for (let i = 0; i < bars.length; i++) {
      sum += bars[i].close;
      if (i >= period) sum -= bars[i - period].close;
      if (i + 1 >= period) {
        result.push({ time: bars[i].time, value: Number((sum / period).toFixed(2)) });
      }
    }
    return result;
  }

  function calcVWAP(bars, interval) {
    if (!bars || !bars.length) return [];
    const isIntraday = interval && interval !== '1d';
    const result = [];
    let curDay = '';
    let cumPV = 0;
    let cumVol = 0;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (isIntraday && b.time) {
        const day = nyDayFormatter.format(new Date(b.time * 1000));
        if (day !== curDay) {
          curDay = day;
          cumPV = 0;
          cumVol = 0;
        }
      }
      const tp = (Number(b.high) + Number(b.low) + Number(b.close)) / 3;
      const vol = Number(b.volume) > 0 ? Number(b.volume) : 0;
      if (vol > 0) {
        cumPV += tp * vol;
        cumVol += vol;
      } else if (cumVol === 0) {
        cumPV += tp;
        cumVol += 1;
      }
      const val = cumVol > 0 ? cumPV / cumVol : tp;
      if (Number.isFinite(val)) {
        result.push({ time: b.time, value: Number(val.toFixed(4)) });
      }
    }
    return result;
  }

  function calcPrevDayHighLow(bars, interval) {
    if (!bars || bars.length < 2) return null;
    const isIntraday = interval && interval !== '1d';
    if (!isIntraday) {
      const prev = bars[bars.length - 2];
      const pdh = Number(prev?.high);
      const pdl = Number(prev?.low);
      if (!(pdh > 0 && pdl > 0)) return null;
      return { pdh, pdl, date: prev?.time ? nyDayFormatter.format(new Date(prev.time * 1000)) : '' };
    }
    const dayStats = [];
    let curDay = '';
    let curObj = null;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (!b?.time) continue;
      const day = nyDayFormatter.format(new Date(b.time * 1000));
      if (day !== curDay) {
        curDay = day;
        curObj = { date: day, pdh: Number(b.high), pdl: Number(b.low) };
        dayStats.push(curObj);
      } else if (curObj) {
        if (Number(b.high) > curObj.pdh) curObj.pdh = Number(b.high);
        if (Number(b.low) < curObj.pdl) curObj.pdl = Number(b.low);
      }
    }
    if (dayStats.length < 2) return null;
    const prev = dayStats[dayStats.length - 2];
    if (!(prev.pdh > 0 && prev.pdl > 0)) return null;
    return prev;
  }

  function getSnapshot(context = {}, bars = [], calcDeps = {}) {
    const computeSignals = calcDeps.computeSignals || defaultComputeSignals;
    const formatMarkers = calcDeps.formatMarkers || defaultFormatMarkers;
    const demaCalc = calcDeps.dema || defaultDema;

    const symbol = context.symbol || '';
    const interval = context.interval || '';
    const range = context.range || '';
    const dataRevision = context.dataRevision || 0;
    const algorithmRevision = context.algorithmRevision || 0;
    const showSignals = !!context.showSignals;

    const isMatch = cachedSnapshot &&
      cachedSnapshot.symbol === symbol &&
      cachedSnapshot.interval === interval &&
      cachedSnapshot.range === range &&
      cachedSnapshot.dataRevision === dataRevision &&
      cachedSnapshot.algorithmRevision === algorithmRevision &&
      cachedSnapshot.showSignals === showSignals &&
      cachedSnapshot.bars === bars;

    if (isMatch) {
      return cachedSnapshot;
    }

    const safeBars = bars || [];
    const indexByTime = new Map();
    for (let i = 0; i < safeBars.length; i++) {
      indexByTime.set(safeBars[i].time, i);
    }

    const maPeriods = { ma5: 5, ma20: 20, ma60: 60, ma120: 120, ma250: 250 };
    const maByKey = {};
    for (const [key, p] of Object.entries(maPeriods)) {
      maByKey[key] = calcMA(safeBars, p);
    }
    const vwapLineData = calcVWAP(safeBars, interval);
    const prevDayHighLow = calcPrevDayHighLow(safeBars, interval);

    let fastDema = [];
    let slowDema = [];
    const fastDemaLineData = [];
    const slowDemaLineData = [];
    let signals = [];
    const signalsByTime = new Map();
    let markers = [];
    let latestStopSignal = null;

    if (showSignals && safeBars.length) {
      const closes = safeBars.map(b => Number(b.close));
      if (typeof demaCalc === 'function') {
        fastDema = demaCalc(closes, 14);
        slowDema = demaCalc(closes, 30);
        for (let i = 0; i < safeBars.length; i++) {
          if (fastDema[i] !== null && fastDema[i] !== undefined && Number.isFinite(fastDema[i])) {
            fastDemaLineData.push({ time: safeBars[i].time, value: Number(fastDema[i].toFixed(2)) });
          }
          if (slowDema[i] !== null && slowDema[i] !== undefined && Number.isFinite(slowDema[i])) {
            slowDemaLineData.push({ time: safeBars[i].time, value: Number(slowDema[i].toFixed(2)) });
          }
        }
      }

      if (typeof computeSignals === 'function') {
        signals = computeSignals(safeBars) || [];
        for (const s of signals) {
          if (s && s.time != null) {
            let list = signalsByTime.get(s.time);
            if (!list) {
              list = [];
              signalsByTime.set(s.time, list);
            }
            list.push(s);
          }
          if (s && (s.side === 'B' || s.side === 'S') && Number.isFinite(Number(s.stopPrice)) && Number(s.stopPrice) > 0) {
            latestStopSignal = s;
          }
        }
      }

      if (typeof formatMarkers === 'function') {
        markers = formatMarkers(signals) || [];
      }
    }

    cachedSnapshot = {
      symbol,
      interval,
      range,
      dataRevision,
      algorithmRevision,
      showSignals,
      bars: safeBars,
      indexByTime,
      maByKey,
      vwapLineData,
      prevDayHighLow,
      fastDema,
      slowDema,
      fastDemaLineData,
      slowDemaLineData,
      signals,
      signalsByTime,
      markers,
      latestStopSignal,
    };

    return cachedSnapshot;
  }

  function formatReadoutHtml(bar, snapshot, displayOptions = {}) {
    if (!bar) return '';
    const { klineScheme = {}, klineSchemeKey = 'classic', isDark = true, showSignals = false } = displayOptions;

    if (
      cachedReadout.barTime === bar.time &&
      cachedReadout.snapshotRevision === (snapshot?.dataRevision ?? -1) &&
      cachedReadout.showSignals === showSignals &&
      cachedReadout.klineSchemeKey === klineSchemeKey &&
      cachedReadout.isDark === isDark &&
      cachedReadout.html
    ) {
      return cachedReadout.html;
    }

    const o = Number(bar.open).toFixed(2);
    const h = Number(bar.high).toFixed(2);
    const l = Number(bar.low).toFixed(2);
    const c = Number(bar.close).toFixed(2);
    const diff = Number(bar.close - bar.open).toFixed(2);
    const diffPct = bar.open > 0 ? ((bar.close - bar.open) / bar.open * 100).toFixed(2) + '%' : '0.00%';
    const toneColor = bar.close >= bar.open ? (klineScheme.up || '#10b981') : (klineScheme.down || '#ef4444');

    const dateStr = bar.time
      ? dateTimeFormatter.format(new Date(bar.time * 1000))
      : '';

    let demaReadout = '';
    let inflectionTag = '';

    if (showSignals && snapshot) {
      const idx = snapshot.indexByTime.get(bar.time);
      if (idx !== undefined) {
        const fVal = snapshot.fastDema[idx];
        const sVal = snapshot.slowDema[idx];
        if (fVal !== null && fVal !== undefined && Number.isFinite(fVal) &&
            sVal !== null && sVal !== undefined && Number.isFinite(sVal)) {
          demaReadout = ` <span style="color:#38bdf8;font-weight:600;margin-left:8px;">快(DEMA14) <b>${fVal.toFixed(2)}</b></span>` +
            ` <span style="color:#fb923c;font-weight:600;margin-left:6px;">慢(DEMA30) <b>${sVal.toFixed(2)}</b></span>`;
        }
      }

      const sigList = snapshot.signalsByTime.get(bar.time);
      if (sigList && sigList.length > 0) {
        const sig = sigList[0];
        const isBuy = sig.side.includes('B');
        const isEarly = sig.side.startsWith('e') || sig.side.startsWith('E');
        const sigColor = isBuy ? (isEarly ? '#38bdf8' : '#10b981') : (isEarly ? '#f59e0b' : '#ef4444');
        const sigLabel = sig.side === 'EB' ? 'EB 买入观察' : sig.side === 'B' ? 'B 确认买入' : sig.side === 'ES' ? 'ES 卖出观察' : 'S 确认卖出';
        const stopHint = Number.isFinite(Number(sig.stopPrice)) && Number(sig.stopPrice) > 0 ? ` · 止损 ${Number(sig.stopPrice).toFixed(2)}` : '';
        inflectionTag = ` <span style="background:${sigColor}22;color:${sigColor};border:1px solid ${sigColor}55;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:700;margin-left:6px;">⚡ ${sigLabel}${stopHint}</span>`;
      }
    }

    const html = `<span style="color:var(--text-tertiary);margin-right:8px;">${dateStr}</span>` +
      `开 <b style="color:var(--text-primary)">${o}</b> 高 <b style="color:var(--text-primary)">${h}</b> ` +
      `低 <b style="color:var(--text-primary)">${l}</b> 收 <b style="color:${toneColor}">${c}</b> ` +
      `涨跌 <b style="color:${toneColor}">${diff} (${diffPct})</b>` +
      demaReadout +
      inflectionTag;

    cachedReadout = {
      barTime: bar.time,
      snapshotRevision: snapshot?.dataRevision ?? -1,
      showSignals,
      klineSchemeKey,
      isDark,
      html,
    };

    return html;
  }

  function invalidate() {
    cachedSnapshot = null;
    cachedReadout = {
      barTime: null,
      snapshotRevision: -1,
      showSignals: null,
      klineSchemeKey: '',
      isDark: null,
      html: '',
    };
  }

  return {
    getSnapshot,
    formatReadoutHtml,
    invalidate,
  };
}

