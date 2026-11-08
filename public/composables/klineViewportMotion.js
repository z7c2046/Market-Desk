/**
 * Unified Viewport Motion Controller (Single-rAF)
 *
 * 规范化 5.2.1 半柱摄像机投影模型：
 * N = to - from + 1
 * L = from - 0.5
 * 
 * 核心特性：
 * 1. 指数时间收敛 (默认 rate = 21.5/s)，跨 60Hz / 120Hz 刷新率无缝等时收敛
 * 2. 逐样本乘法目标累计与反向即时截断债务
 * 3. 稳定右侧 (fraction = 1.0) 与光标连续逻辑锚点
 * 4. 水平拖拽松手精准时间积分阻尼惯性 (friction = 12/s)
 * 5. 0.25 CSS px 停动阈值与边界限幅
 */

import {
  clamp,
  cameraFromRange,
  rangeFromCamera,
  easeAlpha,
  stepFling,
  finiteRange
} from './klineGeometry.js';

export function createViewportMotionController(options = {}) {
  const timeScale = options.timeScale;
  const getWidth = options.getWidth || (() => 800);
  const rate = options.rate ?? 21.5;
  const friction = options.friction ?? 12.0;
  const settlePx = options.settlePx ?? 0.25;
  const minFlingVelocity = options.minFlingVelocity ?? 18.0;
  const maxFlingVelocity = options.maxFlingVelocity ?? 3000.0;
  const onFrameTick = options.onFrameTick || null;
  const onPhaseChange = options.onPhaseChange || null;

  let epoch = 0;
  let disposed = false;
  let rafId = 0;
  let lastFrameAt = null;

  const requestFrame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(() => cb(typeof performance !== 'undefined' ? performance.now() : Date.now()), 16);
  const cancelFrame = typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame
    : (id) => clearTimeout(id);

  let display = { left: 0, count: 180 };
  let targetCount = 180;
  let anchorFraction = 1.0;
  let anchorLogical = 180;

  let velocityX = 0; // CSS px/s
  let phase = 'idle'; // 'idle' | 'wheel' | 'drag' | 'fling' | 'resetting'
  let navigation = 'follow-latest'; // 'follow-latest' | 'history'

  let submittedRange = null;
  let observedRange = null;

  function setPhase(nextPhase) {
    if (phase !== nextPhase) {
      phase = nextPhase;
      onPhaseChange?.({ phase, navigation });
    }
  }

  function setNavigation(nextNav) {
    if (navigation !== nextNav) {
      navigation = nextNav;
      onPhaseChange?.({ phase, navigation });
    }
  }

  function seedFromRange(range) {
    if (!finiteRange(range)) return;
    try {
      display = cameraFromRange(range);
      targetCount = display.count;
      anchorFraction = 1.0;
      anchorLogical = display.left + display.count;
      velocityX = 0;
      submittedRange = { ...range };
      observedRange = { ...range };
    } catch (_) {}
  }

  function isReducedMotion() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }

  function cancelMotion(reason = 'manual') {
    epoch++;
    if (rafId) {
      cancelFrame(rafId);
      rafId = 0;
    }
    lastFrameAt = null;
    velocityX = 0;
    targetCount = display.count;
    if (phase !== 'drag') {
      setPhase('idle');
    }
  }

  function queueZoom(deltaPixels, fraction = 1.0, zoomOpts = {}) {
    if (!Number.isFinite(deltaPixels) || deltaPixels === 0) return;
    const gain = zoomOpts.gain ?? 0.0006;
    const minCount = Math.max(zoomOpts.minCount ?? 8, 2);
    const maxCount = Math.max(zoomOpts.maxCount ?? 50000, minCount);

    const step = clamp(deltaPixels * gain, -0.1, 0.1);
    const debt = targetCount - display.count;

    // 反向输入立即取消旧方向积压债务
    if (debt * step < 0) {
      targetCount = display.count;
    }

    anchorFraction = clamp(fraction, 0, 1);
    anchorLogical = display.left + display.count * anchorFraction;
    targetCount = clamp(targetCount * (1 + step), minCount, maxCount);

    if (zoomOpts.anchorType === 'cursor') {
      setNavigation('history');
    }

    if (isReducedMotion()) {
      display = {
        left: anchorLogical - anchorFraction * targetCount,
        count: targetCount
      };
      commitDisplay();
      setPhase('idle');
      return;
    }

    setPhase('wheel');
    scheduleFrame();
  }

  function panPx(deltaPx, width = getWidth()) {
    if (!Number.isFinite(deltaPx) || deltaPx === 0) return;
    const w = Math.max(width, 1);
    const deltaLogical = -deltaPx * display.count / w;

    display = {
      left: display.left + deltaLogical,
      count: display.count
    };
    targetCount = display.count;
    anchorLogical += deltaLogical;

    setNavigation('history');
    commitDisplay();
  }

  function startFling(initialVelocityPx, width = getWidth()) {
    if (isReducedMotion()) return;
    if (!Number.isFinite(initialVelocityPx)) return;
    const maxV = Math.min(maxFlingVelocity, Math.max(width, 1) * 3);
    const v = clamp(initialVelocityPx, -maxV, maxV);
    if (Math.abs(v) < minFlingVelocity) return;

    velocityX = v;
    setNavigation('history');
    setPhase('fling');
    scheduleFrame();
  }

  function commitDisplay() {
    if (!timeScale || typeof timeScale.setVisibleLogicalRange !== 'function') return;
    try {
      const range = rangeFromCamera(display);
      submittedRange = range;
      timeScale.setVisibleLogicalRange(range);
    } catch (_) {}
  }

  function scheduleFrame() {
    if (rafId || disposed) return;
    const capturedEpoch = epoch;

    rafId = requestFrame((now) => {
      rafId = 0;
      if (disposed || capturedEpoch !== epoch) return;
      stepMotion(now);
    });
  }

  function stepMotion(now) {
    if (lastFrameAt === null) {
      lastFrameAt = now;
      scheduleFrame();
      return;
    }

    let dt = (now - lastFrameAt) / 1000;
    lastFrameAt = now;

    // 页面不可见或跨度异常过长时重置时间基准并停止尾部运动
    if (dt > 0.25 || (typeof document !== 'undefined' && document.hidden)) {
      cancelMotion('gap-timeout');
      return;
    }
    if (dt > 0.05) dt = 0.05;

    const width = Math.max(getWidth(), 1);
    let hasWork = false;

    // 1. 推进缩放缓动 (Zoom convergence)
    const countDebt = targetCount - display.count;
    if (Math.abs(countDebt) > 1e-4) {
      const alpha = easeAlpha(rate, dt);
      let nextCount = display.count + countDebt * alpha;
      const remainingPx = Math.abs(targetCount - nextCount) * width / nextCount;

      if (remainingPx <= settlePx) {
        nextCount = targetCount;
      } else {
        hasWork = true;
      }

      display = {
        left: anchorLogical - anchorFraction * nextCount,
        count: nextCount
      };
    }

    // 2. 推进水平惯性滑行 (Fling momentum)
    if (Math.abs(velocityX) >= minFlingVelocity) {
      const flingStep = stepFling(velocityX, dt, friction);
      velocityX = flingStep.velocity;
      const deltaLogical = -flingStep.deltaPx * display.count / width;

      display = {
        left: display.left + deltaLogical,
        count: display.count
      };
      anchorLogical += deltaLogical;

      if (Math.abs(velocityX) >= minFlingVelocity) {
        hasWork = true;
      } else {
        velocityX = 0;
      }
    } else {
      velocityX = 0;
    }

    // 3. 提交视口范围
    commitDisplay();

    // 4. 通知价格轴等下游帧任务推进
    if (typeof onFrameTick === 'function') {
      const providerWantsFrame = onFrameTick({ dt, display, hasWork });
      if (providerWantsFrame) {
        hasWork = true;
      }
    }

    if (hasWork) {
      scheduleFrame();
    } else {
      lastFrameAt = null;
      setPhase('idle');
    }
  }

  function handleObservedRangeChange(range) {
    observedRange = range;
    if (!range) return;

    // 若非动画期间或由外部/resize等引发的变更，同步到内部 display
    if (phase === 'idle') {
      try {
        display = cameraFromRange(range);
        targetCount = display.count;
        anchorLogical = display.left + display.count * anchorFraction;
      } catch (_) {}
    }
  }

  function dispose() {
    disposed = true;
    cancelMotion('dispose');
  }

  return {
    seedFromRange,
    queueZoom,
    panPx,
    startFling,
    cancelMotion,
    commitDisplay,
    handleObservedRangeChange,
    getState: () => ({
      epoch,
      phase,
      navigation,
      display: { ...display },
      targetCount,
      anchorLogical,
      anchorFraction,
      velocityX,
      submittedRange,
      observedRange
    }),
    setNavigation,
    setPhase,
    dispose
  };
}
