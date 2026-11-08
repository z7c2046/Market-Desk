/**
 * TradingView + OpenMarket 风格 K 线图表滚轮与触控板手势输入解析器
 *
 * 职责：
 * 1. CSS 像素单位归一化 (deltaMode=0 px, deltaMode=1 line*16, deltaMode=2 page*paneHeight)
 * 2. 亚像素微量输入累积 (< 1px) 与防抖降噪 (反向清空残余，150ms 超时清零)
 * 3. 触控板平移与滚轮缩放的主轴锁定 (8px 阈值，200ms 序列窗口)
 * 4. 跨轴意图竞争与暂存样本无损重放 (2倍主导幅度，2次以上且累计8px换轴)
 * 5. ctrl+wheel 触控板 pinch 缩放直通
 */

import { clamp, pixelFraction } from './klineGeometry.js';

export function createWheelInputParser(options = {}) {
  const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.platform || navigator.userAgent || '');
  const zoomGain = options.zoomGain ?? (isWindows ? 0.0006 : 0.0002);
  const pinchGain = options.pinchGain ?? 0.00625;
  const microThreshold = options.microThreshold ?? 1.0;
  const microTimeoutMs = options.microTimeoutMs ?? 150;
  const lockThreshold = options.lockThreshold ?? 8.0;
  const sequenceTimeoutMs = options.sequenceTimeoutMs ?? 200;
  const switchDominanceRatio = options.switchDominanceRatio ?? 2.0;
  const switchCountThreshold = options.switchCountThreshold ?? 2;
  const switchDistThreshold = options.switchDistThreshold ?? 8.0;

  let microX = 0;
  let microY = 0;
  let lastMicroTime = 0;

  let lastEventTime = 0;
  let lockedAxis = null; // 'x' | 'y' | null
  let seqAccumX = 0;
  let seqAccumY = 0;

  let candidateCount = 0;
  let candidateDist = 0;
  let pendingSamples = [];

  function reset() {
    microX = 0;
    microY = 0;
    lastMicroTime = 0;
    resetSequence();
  }

  function resetSequence() {
    lastEventTime = 0;
    lockedAxis = null;
    seqAccumX = 0;
    seqAccumY = 0;
    candidateCount = 0;
    candidateDist = 0;
    pendingSamples = [];
  }

  /**
   * 解析原生 wheel 事件并输出执行动作列表
   *
   * @param {WheelEvent} e
   * @param {object} context - { paneWidth, paneHeight, zone, isRulerActive }
   * @returns {{ admitted: boolean, actions: Array<{ type: string, [key: string]: any }> }}
   */
  function parseWheel(e, context = {}) {
    if (!e) return { admitted: false, actions: [] };

    const {
      paneWidth = 800,
      paneHeight = 400,
      zone = 'plot',
      isRulerActive = false
    } = context;

    // 量尺活动时消耗图表内 wheel，避免缩放干扰
    if (isRulerActive) {
      return { admitted: true, actions: [] };
    }

    const now = (typeof e.timeStamp === 'number' && Number.isFinite(e.timeStamp) && e.timeStamp > 0)
      ? e.timeStamp
      : (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // 超时重置微量累积与序列窗口
    if (lastMicroTime > 0 && now - lastMicroTime > microTimeoutMs) {
      microX = 0;
      microY = 0;
    }
    lastMicroTime = now;

    if (lastEventTime > 0 && now - lastEventTime > sequenceTimeoutMs) {
      resetSequence();
    }
    lastEventTime = now;

    // 1. 单位归一化为 CSS px
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? Math.max(paneHeight, 1) : 1;
    const rawDx = (Number.isFinite(e.deltaX) ? e.deltaX : 0) * unit;
    const rawDy = (Number.isFinite(e.deltaY) ? e.deltaY : 0) * unit;

    if (rawDx === 0 && rawDy === 0) {
      return { admitted: false, actions: [] };
    }

    // 2. ctrl+wheel: 触控板 pinch 缩放直通 (不参与主轴竞争)
    if (e.ctrlKey) {
      const x = clamp(e.clientX !== undefined && context.rect ? e.clientX - context.rect.left : (context.localX ?? paneWidth / 2), 0, paneWidth - 1);
      const fraction = pixelFraction(x, paneWidth);
      return {
        admitted: true,
        actions: [{
          type: 'zoom',
          subType: 'pinch',
          delta: rawDy,
          gain: pinchGain,
          fraction,
          anchorType: 'cursor',
          zone,
          originalEvent: e
        }]
      };
    }

    // 3. 价格轴区域直接处理纵向缩放
    if (zone === 'price-axis') {
      const y = clamp(e.clientY !== undefined && context.rect ? e.clientY - context.rect.top : (context.localY ?? paneHeight / 2), 0, paneHeight - 1);
      if (rawDy === 0) return { admitted: false, actions: [] };
      return {
        admitted: true,
        actions: [{
          type: 'price-zoom',
          delta: rawDy,
          pointerY: y,
          gain: zoomGain,
          originalEvent: e
        }]
      };
    }

    // 4. 微量累积与防抖降噪
    let admittedDx = 0;
    let admittedDy = 0;

    if (rawDx !== 0) {
      if (microX !== 0 && Math.sign(rawDx) !== Math.sign(microX)) {
        microX = 0;
      }
      microX += rawDx;
      if (Math.abs(microX) >= microThreshold) {
        admittedDx = microX;
        microX = 0;
      }
    }

    if (rawDy !== 0) {
      if (microY !== 0 && Math.sign(rawDy) !== Math.sign(microY)) {
        microY = 0;
      }
      microY += rawDy;
      if (Math.abs(microY) >= microThreshold) {
        admittedDy = microY;
        microY = 0;
      }
    }

    if (admittedDx === 0 && admittedDy === 0) {
      return { admitted: false, actions: [] };
    }

    seqAccumX += Math.abs(admittedDx);
    seqAccumY += Math.abs(admittedDy);

    const x = clamp(e.clientX !== undefined && context.rect ? e.clientX - context.rect.left : (context.localX ?? paneWidth - 1), 0, paneWidth - 1);
    const useCursorAnchor = !!(e.altKey || e.metaKey);
    const fraction = useCursorAnchor ? pixelFraction(x, paneWidth) : 1.0;
    const anchorType = useCursorAnchor ? 'cursor' : 'right';

    // 5. 主轴竞争与锁定
    let currentIntent = null;
    const actions = [];

    if (lockedAxis === null) {
      if (seqAccumX >= lockThreshold || seqAccumY >= lockThreshold) {
        lockedAxis = seqAccumX >= seqAccumY * 1.2 ? 'x' : 'y';
      }
      currentIntent = (lockedAxis === 'x' || (lockedAxis === null && Math.abs(admittedDx) > Math.abs(admittedDy) * 1.5))
        ? 'pan'
        : 'zoom';
    } else if (lockedAxis === 'y') {
      // 当前锁定为 Y (缩放)，检测是否意图切换到 X (平移)
      if (Math.abs(admittedDx) >= switchDominanceRatio * Math.abs(admittedDy)) {
        candidateCount++;
        candidateDist += Math.abs(admittedDx);
        pendingSamples.push({ dx: admittedDx, dy: admittedDy, fraction, anchorType, event: e });

        if (candidateCount >= switchCountThreshold && candidateDist >= switchDistThreshold) {
          // 满足换轴条件：切换锁定并回放所有暂存样本
          lockedAxis = 'x';
          for (const sample of pendingSamples) {
            actions.push({
              type: 'pan',
              deltaPx: sample.dx,
              originalEvent: sample.event
            });
          }
          pendingSamples = [];
          candidateCount = 0;
          candidateDist = 0;
          return { admitted: true, actions };
        }
      } else {
        // 重置换轴候选
        candidateCount = 0;
        candidateDist = 0;
        pendingSamples = [];
      }
      currentIntent = 'zoom';
    } else {
      // 当前锁定为 X (平移)，检测是否意图切换到 Y (缩放)
      if (Math.abs(admittedDy) >= switchDominanceRatio * Math.abs(admittedDx)) {
        candidateCount++;
        candidateDist += Math.abs(admittedDy);
        pendingSamples.push({ dx: admittedDx, dy: admittedDy, fraction, anchorType, event: e });

        if (candidateCount >= switchCountThreshold && candidateDist >= switchDistThreshold) {
          // 满足换轴条件：切换锁定并回放所有暂存样本
          lockedAxis = 'y';
          for (const sample of pendingSamples) {
            actions.push({
              type: 'zoom',
              subType: 'wheel',
              delta: sample.dy,
              gain: zoomGain,
              fraction: sample.fraction,
              anchorType: sample.anchorType,
              zone,
              originalEvent: sample.event
            });
          }
          pendingSamples = [];
          candidateCount = 0;
          candidateDist = 0;
          return { admitted: true, actions };
        }
      } else {
        candidateCount = 0;
        candidateDist = 0;
        pendingSamples = [];
      }
      currentIntent = 'pan';
    }

    if (currentIntent === 'pan') {
      actions.push({
        type: 'pan',
        deltaPx: admittedDx,
        originalEvent: e
      });
    } else {
      actions.push({
        type: 'zoom',
        subType: 'wheel',
        delta: admittedDy,
        gain: zoomGain,
        fraction,
        anchorType,
        zone,
        originalEvent: e
      });
    }

    return { admitted: true, actions };
  }

  return {
    parseWheel,
    reset,
    resetSequence,
    getLockedAxis: () => lockedAxis,
  };
}

