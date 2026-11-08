# 给 Gemini：将 OpenMarket 的缩放交互机制适配到 Market Desk

日期：2026-11-08。目标工作区：`D:\YUXIANZHAO\Code\Market Desk`。

本文件是具体代码实施任务书。请在当前工作区实现并验证，不要只返回另一个方案。保留 Lightweight Charts 5.2.1、现有数据源、主题、成交量、均线、DEMA、信号标记和量尺，将下面的输入归一化、累计缩放目标、时间驱动缓动、稳定锚点、价格轴平滑与拖拽惯性接入真实主 K 线链路。

这是根据 OpenMarket 公开发布代码中已确认的机制，为本项目重新设计的实现。不要声称是 Titan 源码移植或已达到相同帧率。业务算法、行情内容、自选列表和新闻功能不在修改范围。

交付时应有实际代码、必要测试、真实图表交互记录和中文变更说明。当前文档及附带数学样例尚未接入应用。

## 1. 已研究到什么，以及这次具体实现什么

OpenMarket 页面构建：`25539-1fb32274`，版本 `1.77.695`。研究的是此构建，不将它泛化为以后所有版本。

一手资源：

- [图表入口](https://openmarket.xyz/chart/)
- [图表核心发布文件](https://assets.openmarket.xyz/chart/assets/titan-core-G4TvS5Pa.js)
- [输入处理相关常量文件](https://assets.openmarket.xyz/chart/assets/titan-constants-CpcBIYJg.js)

以下是机制摘要，不是复制第三方函数。核心文件中可定位缩放队列、帧推进、轴范围缓动和拖拽速度处理；详细研究及视频连续帧见 [研究报告](OPENMARKET_CHART_SMOOTHNESS_RESEARCH.zh-CN.md)。

| 源码已确认的机制 | 本项目的实现决策 |
| --- | --- |
| 输入分单位归一化，区分横向平移和纵向缩放 | 新建输入解析器，使用 CSS 像素；细小输入累积后处理 |
| 连续缩放按倍率累计，再由帧循环消费 | 维护显示范围与目标跨度，不在每次 wheel 里立即跳到目标 |
| 指数时间系数驱动跨度收敛 | 默认速率 21.5/s；固定目标时，60/120 Hz 在相同时间达到相同跨度 |
| 默认右侧缩放锚点，也有指针锚点分支 | 默认固定绘图区右边界，Alt/Meta + wheel 固定鼠标位置；明确与自动追随最新分离 |
| 手势输入和自动价格轴分别处理 | 自动 Y 保持原库自动缩放，通过 provider 适配平滑；手动 Y 使用真实指针价格 |
| 松手后的速度指数衰减 | 鼠标拖拽增加水平惯性，使用时间积分；触控板 wheel 不叠加第二套惯性 |
| 直接响应与缓动路径可按成本切换 | 首版默认缓动，保留调试用 direct 对照；运行库的真实 paint 成本尚不可直接读取，不伪造自动判定 |

源站还包含 WebGL2 绘制和复杂的绘制缓存/退让机制。本次适配上述交互机制，不引入它的运行时或 WebGL 重写。

## 2. 当前代码锚点与改动清单

行号为研究时快照，实施时以函数名复核。当前已有多处未提交修改；保留这些修改，不执行 reset、checkout、commit、push 或部署。

| 文件 / 入口 | 当前事实 | 要做的修改 |
| --- | --- | --- |
| `public/app.js:6539`，`renderPrice()` | 主 K 线真实入口 | 拆开数据更新和样式更新，接入新控制器参数与缓存 |
| `public/app.js:6610` | 原生滚动、缩放、惯性均关闭 | 最终仍由自定义控制器独占范围写入，不混开原生控制 |
| `public/app.js:6677` | 十字光标回调捕获创建时 bars | 改为读取当前数据版本，回调只查索引、提交读数 |
| `public/app.js:6459`，`updateReadoutFromCrosshair()` | 开启信号时反复整段计算 | 移除算法重算和每次创建日期格式器 |
| `public/app.js:470 / 485` | 标记、DEMA 各自计算 | 共用相同数据 revision 下的派生结果 |
| `public/app.js:6685` | 创建手势控制器 | 接入单一调度器、导航状态、数据版本与几何更新 |
| `public/app.js:562`，`disposePriceChart()` | 已释放现有手势 | 新增解除 provider、订阅和所有动画任务；销毁必须幂等 |
| `public/app.js:5915 / 5931` | `request()` / `loadChart()` | 请求开始取消旧运动，只有被序列号接受的响应才能替换数据版本 |
| `public/app.js:749` | 开启量尺 | 开启时立即停止缩放和惯性；绘制量尺期间不改变视口 |
| `public/app.js:913 / 1028` 附近 | 展开图表、响应布局改变 | 更新输入策略与几何，取消旧像素坐标下的动画 |
| `public/composables/klineGesture.js` | 输入和范围直接写入耦合 | 保留对外 facade，重构为输入分派与状态转换 |
| `public/composables/klineGeometry.js` | 目前按 `to-from` 计算、最新蜡烛近景居中 | 新增符合 5.2.1 坐标语义的 helpers；旧居中逻辑退出默认滚轮路径 |
| `test/workspace-ui.test.js:143` 附近 | JSDOM 用字符串替换 imports | 新增 app imports 时同步维护测试装载器，不能直接引入未处理 import 后让全套测试失效 |
| `package.json` 的 `check` | 未覆盖所有新模块 | 将新 JS 文件加入语法检查 |

新增文件建议：

1. `public/composables/klineWheelInput.js`：单位归一化、微量输入累积、轴方向锁定。
2. `public/composables/klineViewportMotion.js`：唯一 rAF 调度器、目标跨度、惯性、取消与重置。
3. `public/composables/klinePriceMotion.js`：自动价格轴 provider 和手动 Y 数学适配，使用同一个帧调度器。
4. `public/composables/chartDerivedData.js`：数据 revision 与派生计算缓存。

使用现有浏览器 ES Modules，避免裸包导入和无必要的动画依赖。不要修改未在主链路使用的 `public/composables/useChart.js` 来充当完成。

## 3. 用户可见行为合同

| 操作 | 修改后行为 |
| --- | --- |
| 绘图区或时间轴普通 wheel | 横向范围连续缩放，右边界固定，保留当前显示范围作为起点 |
| Alt/Meta + wheel | 指针所指逻辑位置固定；不与 Shift 量尺快捷键冲突 |
| 触控板以横向 delta 为主 | 平移时间轴，不误触纵向缩放；使用系统发来的连续输入，不追加惯性 |
| 图表内 ctrl+wheel | 作为触控板 pinch 类缩放处理；图表外不拦截浏览器默认行为 |
| 价格轴 wheel / 拖动 | 仅变更 Y，使用实际指针价格作为锚点；进入手动价格轴模式 |
| 绘图区拖动 | 保留二维拖动；只有有效纵向拖动才进入手动 Y，纯横向拖动继续自动 Y |
| 鼠标横向快速拖动后松手 | 短暂减速滑行；新输入立即终止旧滑行 |
| 双击绘图区/时间轴、重置按钮 | 立即取消运动并回完整数据视图，Y 恢复自动 |
| 双击价格轴 | 只恢复自动 Y，X 保持原位 |
| 返回最新 | 显式恢复追随最新；不能由 hover、离开或动画结束隐式触发 |
| 手机阅读模式 | 保留页面纵向滚动；展开模式保留现有单指图表控制 |
| 减少动态效果偏好 | 取消尾部缓动和松手惯性，缩放和平移仍然可用 |

右边界固定不等于“最新一根蜡烛永远处于同一像素”。本次默认采用源站的右侧锚点语义；右侧现有空白也属于视口。去掉的是当前随跨度从 94% 强制移到 50% 的额外居中策略。不能通过改变 OHLC 或插入虚假 K 线填掉空白。

原来的 near-view 居中测试记录的是旧策略，应保留为 legacy helper 的测试或明确更新为新的产品合同，不要靠删测试掩盖行为变化。

## 4. 状态设计：只有一个视口写入者

所有高频运动状态保存在普通 JS 对象中，不放进 Vue 深层响应式对象。Vue 只接收导航模式、手动/自动轴模式和稳定的读数结果。

建议状态：

```ts
type MotionState = {
  epoch: number;                 // 取消、reset、切数据、dispose 使旧任务失效
  disposed: boolean;
  navigation: 'follow-latest' | 'history';
  phase: 'idle' | 'wheel' | 'drag' | 'axis-drag' | 'fling' | 'resetting';
  inputPolicy: 'desktop' | 'reading' | 'expanded';
  priceMode: 'auto' | 'manual';   // 用户意图，不能由瞬时 hover 覆写
  display: { left: number; count: number };
  targetCount: number;
  anchorLogical: number;
  anchorFraction: number;
  velocityX: number;             // CSS px/s
  rafId: number;
  lastFrameAt: number | null;
  dataRevision: number;
  geometryRevision: number;
};
```

这里的 `display` 是控制器已提交的摄像机模型，不宣称浏览器已经呈现。另存库回调确认的 `observedRange`；不要把同步 mock 的行为当成真实 Lightweight Charts 行为。

控制器 facade 保持已有 `focusLatest / showAll / reset / resetPriceScale / zoomIn / zoomOut / setInputPolicy / getInputPolicy / isFollowingLatest / notifyLatestBarChanged / dispose`，增加：

- `cancelMotion(reason)`：冻结于当前模型、清目标债务与速度，增加 epoch，不冲到旧目标。
- `replaceData({revision, symbol, interval, bars})`：新数据上下文，取消旧运动并按业务规则重置/接续。
- `invalidateGeometry(reason)`：更新 CSS 像素几何；需要时从实际范围重新播种。
- `getState()`：返回只读诊断快照。

`onState` 输出结构化 `{navigation, phase, priceMode}`。不再使用 `state === 'history' ? 'history' : 'follow-latest'`；该写法会把历史浏览中的普通 hover 显示成“最新”。

所有 X 范围变更，包括按钮、reset、返回最新和新数据追随，都经过 facade。每帧最多提交一次 X 范围、一次手动 Y 范围。自动 Y 只修改 provider 中的显示状态，由原库计算并绘制。

## 5. 时间坐标适配：先解决半根 K 线偏移

这是本项目必须处理的细节。已检查本地 5.2.1 开发构建：

- 可见范围长度按 `to - from + 1` 决定柱间距。
- 蜡烛中心有半柱偏移。
- 当前构建的 `coordinateToLogical()` 最终会取整，不能当成连续的指针锚点反算器。
- `logicalToCoordinate()` 的当前内部实现要求整数索引；不要用它查询任意小数并假设返回正确坐标。

规范化摄像机：

```text
N = to - from + 1
L = from - 0.5
from = L + 0.5
to   = L + N - 0.5

f = (x + 1) / W             // x 是绘图区内 CSS px，限定到 [0, W-1]
A = L + f × N               // 连续逻辑锚点
Lnext = A - f × Nnext
```

`W` 使用 `chart.paneSize(0).width`，不得包含价格轴。只在 adapter 中集中这些 5.2.1 语义，不让业务函数散落半柱补丁。安装版本变化时先重新验证。

本次附有原创数学参考文件 [kline-motion-reference.mjs](references/kline-motion-reference.mjs)，及 [配套测试](references/kline-motion-reference.test.mjs)。其中的投影测试会读取本地库真实的柱中心计算函数作为对照；测试工具中的动态函数提取不得复制进生产代码。

`minCount=8`、`maxCount=min(50000, W/0.5)` 作为起始约束，统一以 N 为单位。还要遵守库在窄屏上的实际最大柱宽约束，收到库修正后的范围必须重同步。若可用宽度无法满足最小柱数与柱间距的组合，优先保持有限合法范围并结束越界运动，禁止持续振荡。

## 6. wheel 解析与目标累计

### 6.1 单位、方向和微量输入

1. `deltaMode=0` 原值为 CSS px；行模式乘 16；页模式按图表 pane 高度换算。本项目不把整个页面高度作为图表缩放基准，这是对源站的适配。
2. 同时保留 deltaX、deltaY，拒绝 NaN/Infinity。不要乘 devicePixelRatio；Canvas backing store 的像素和 DOM 输入的 CSS 像素是两套单位。
3. 对绝对值小于 1 px 的输入按轴累积；同方向累到约 1 px 放行。反向时丢弃旧方向微量残余，避免触控板静止噪声继续摇晃。约 150 ms 无输入后清零。
4. 一次输入序列以约 200 ms 间隔划分。累计绝对量达到约 8 px 后锁定主轴；初始小输入以显著横向量判 pan，其余判 zoom。
5. 已锁定方向后，另一轴至少两次占主导、幅度约为当前轴的两倍且累计超过约 8 px 才换轴；暂存样本必须在换轴时补交，不丢失有效输入。跨区域、reset、取消或新序列清空暂存。
6. ctrl+wheel 直接进入 pinch 类缩放，不经过主轴竞争。必须能通过配置统一调节输入增益，不能声称能可靠识别每种硬件。

`preventDefault()` 只在图表确实接管该区域输入时调用，并检查 cancelable；微量输入被内部吸收时仍需阻止页面随动。价格/时间轴交界角落不处理。量尺活动时先取消运动，冻结视口并消费图表内 wheel，避免一边量尺一边缩放。

### 6.2 逐样本累乘，逐帧写入

普通 Windows wheel 起始增益 `gain=0.0006 / CSS px`，参考源站 Windows 输入放大与缩放系数的组合；其他平台起始 `0.0002`。这只是相应平台配置的初值，最终需真实鼠标/触控板验证。pinch 类输入可从 `0.00625` 开始单独校准。

```text
step = clamp(deltaPixels × gain, -0.10, +0.10)
targetCount = clamp(targetCount × (1 + step), minCount, maxCount)
```

每个放行样本先改变目标，再合并至一帧提交。不要先对所有 delta 求和再统一截断，否则不同事件频率会改变目标。

例如 Windows -100：单次目标倍率约 0.94；连续两次为 0.94²。当前项目 -100 一次为约 0.844，此处既降低单次幅度，也增加连续过渡。

相等正负 delta 的倍率不是严格互逆，这是上述乘法模型的性质。只对 `factor` 与 `1/factor` 测精确可逆，不写错误的“+d/-d 后必须完全回原位”断言。

### 6.3 反向与锚点切换

- 当新 step 与尚未完成的 `targetCount-display.count` 方向相反，先令目标等于当前显示跨度，再施加新输入。这样下一帧就能反向，不先消耗旧方向积压。
- 指针锚点变化时，以当前显示范围重新计算 A，保留目标跨度；重设锚点本身不得改变显示范围。
- 到达 min/max 时立即截断目标，不保留越界的“缩放债务”。
- 从 `fitContent` 或外部范围进入滚轮时，以当前真实范围播种，禁止先调用旧的 `latestAnchoredRange`。
- 普通 wheel 不改变 navigation；指针锚点缩放进入 history；水平 pan/drag 进入 history。返回最新只能由显式操作恢复。

## 7. 帧循环、停止阈值与调度

使用一个控制器 rAF。旧 `queue(fn)` 的单槽调度不能与新循环并存，否则拖拽、wheel、Y 缓动会互相覆盖。

```text
dt = (now - lastFrameAt) / 1000
alpha = 1 - exp(-21.5 × dt)
display.count += (targetCount - display.count) × alpha
display.left = anchorLogical - anchorFraction × display.count
```

这是对源站“累计剩余倍率、每帧消费一部分”机制的等价跨度表达。在固定锚点与固定目标、没有截断时，它按实际经过时间收敛。源码里的指数时间系数不是普通 CSS transition。

帧内顺序固定为：消费最新输入状态 → 推进 X/惯性 → 推进各系列自动 Y 显示状态或手动 Y → 提交一次视口 → 提交去重后的读数/量尺更新 → 有剩余工作才排下一帧。

实施约束：

- 第一帧用本次输入序列的时间戳初始化 lastFrameAt，不能因为 dt=0 额外空转一帧；用 performance.now() 同一时间源。
- 以最大屏幕残差约 0.25 CSS px 为停止阈值，到阈值后一次精确写目标并停止。不能永远追一个浮点尾差。
- 常规 dt 上限可取 50 ms；若间隔超过 250 ms，或 document.hidden，取消尾部运动并清时间基准。恢复后不补偿整段后台时间。
- reduced-motion 直接提交目标，无尾部动画；拖拽仍按实际指针位置即时跟随。
- 每次排帧捕获 epoch；回调先核对 epoch、disposed 和图表实例是否仍是当前实例。
- 不能从价格 provider、库 range 回调里同步再写范围；回调最多更新目标/标记待处理，交给下一次统一帧提交。

源站有条件启用每帧缩放步长限制。本项目首版不额外开启固定 3%/帧上限，否则 60/120 Hz 的手感会不同。若性能记录证明必须限速，使用时间归一化上限，例如扩张上限 `1.03^(dt×60)`，并单独验证输入延迟。

### 7.1 库内部延迟与实际范围确认

`setVisibleLogicalRange()` 在 5.2.1 中排队设置目标，立即读取不保证得到刚提交的值。保留 `submittedRange` 与 `observedRange`，动画期间从自己的模型计算下一帧；空闲启动、显式 reset 完成和 resize 后再从库播种。

统一处理 `subscribeVisibleLogicalRangeChange`：对已提交范围的正常确认只更新 observed；若库因边界/尺寸修正为不同范围，取消失效的剩余目标并采用合法范围。不要把自己的确认当成外部干预，导致每帧都取消动画。

所有 app 里的独立 `fitContent` 和重复 reset rAF 都需收敛为 facade 内的一次命令。`renderPrice()` 中目前的重复调用要删除/合并，不能保留一个下一帧突然复位的旧闭包。

## 8. 自动价格轴：使用原生 autoscaleInfoProvider 适配

采用这条明确路线，避免另写不完整的可见极值引擎：

1. 为蜡烛、MA、DEMA 等位于 `right` 价格轴的系列各安装一个稳定的 `autoscaleInfoProvider`。成交量轴不安装。
2. provider 调用原库传入的 `original()`，保留完整的 margins 与其他字段。它包含原生系列及 primitive 的自动范围信息，不能丢掉信号箭头留白。
3. 每个系列各维护 `{displayRange, targetRange, dataRevision, active}`。不要在不同系列回调间拼一半新、一半旧的全局极值；最终合并继续交给原库。
4. provider 只采集原生目标、读取当前显示范围并返回结果；不计算信号、不写范围、不推进时间。多次 provider 调用不能使同一帧加速。
5. 唯一 motion loop 每帧推进这些记录。Y 扩张立即包含新极值，Y 收缩按约 20/s 缓动，避免进入新高低点时图像被裁掉。此“扩张保护”是项目适配选择，不声称逐项照搬源站。

核心返回规则：

```text
raw = original()
若 raw 或 raw.priceRange 为空：保持原返回值，不造虚假范围
若是手动模式/不支持的价格模式：直接返回 raw
首次进入当前数据版本：display = raw.priceRange
target = raw.priceRange
返回 {...raw, priceRange: union(display, raw.priceRange)}
```

帧循环推进：

```text
nextLow  = min(targetLow,  lerp(displayLow,  targetLow,  alphaY))
nextHigh = max(targetHigh, lerp(displayHigh, targetHigh, alphaY))
```

这样扩张当帧就可见，收缩有过渡。目标变动只依据原始 raw，不把被平滑过的返回结果再次当目标，避免自反馈。

如何让 Y-only 的尾部过渡继续绘制：5.2.1 没有专门暴露轻量 invalidate API。adapter 在需要 Y 尾部帧且 X 没变时，可通过同一个 writer 提交一次当前逻辑范围；本地源码中该入口会重算 pane 并发起 light update。把这封装为 `requestAutoscaleFrame()`，不得访问 `_private__` 或每帧 setData。必须用真实 5.2.1 验证重复范围提交确实触发 provider，且没有改变 X。

这里存在实测门槛：不得把该适配声称为零成本。若 Y-only 的刷新明显增加长帧，记录其独立耗时，在调试开关中暂时回退原生自动 Y，继续交付已经验证的 X 改进，并明确报告 Y 验收未通过；不能静默宣称整套完成。不要换用每帧 full update 掩盖问题。

显示某条 MA、切换信号、修改标记、dataRevision 改变时，更新/清除对应记录；隐藏系列不应让动画循环永久运行。`resetPriceScale()` 清掉平滑历史再恢复原生 auto。

## 9. 手动价格轴与二维拖拽

已确认 5.2.1 的 `priceScale.setVisibleRange()` 会自动关闭 autoScale。自动 Y 路径不得调用它；手动 Y 路径调用时必须同步 `priceMode='manual'`。

价格轴缩放：

```text
P = candleSeries.coordinateToPrice(pointerY)
lowNext  = P + (lowCurrent  - P) × factor
highNext = P + (highCurrent - P) × factor
```

不要用 `pointerY / paneHeight` 作为价格范围中的比例。当前顶部 8%、底部 22% 留白，以及标记占用的像素，会让这个比例失真。P 处在范围外的留白中也是合法锚点，不要强行 clamp 回 high/low。

手动 Y 拖拽用 pointerdown 时两个相邻 CSS y 的 `coordinateToPrice()` 差值得到价格/像素斜率，按指针实际 dy 更新；不要用包含留白的总高度直接除价差。首版限正常线性价格模式；如检测到对数/百分比等模式，回退原生相应交互或关闭此自定义 Y 功能并保留有效 X，不将线性公式误用于非线性模式。

X 拖动用 `deltaLogical = -dx × N/W`。水平拖动不关闭自动 Y；有效纵向位移超过约 3 CSS px 后才切手动 Y。进入手动前停止 provider 尾部动画，从当前实际 Y 范围播种。量尺、非左键和另一 pointer 已占有时不能进入拖动。

Y-only 改变也必须更新量尺坐标；当前只订阅时间范围不足以覆盖这个场景。

## 10. 拖拽惯性

只对用户实际鼠标拖拽结束添加水平惯性，触控板 wheel 已带系统惯性，不再次追加。垂直拖动松手后不继续飞，避免手动价格位置漂移。

在有效拖动过程中，记录最近约 80–100 ms 的指针样本，以 CSS px/s 估计 vx。采样可做简单时间加权回归或稳健平均，使用 coalesced events 时不要重复计入主事件。释放距离最后有效移动超过 120 ms，不启动惯性。

起始参数：friction=12/s，最小启动/停止速度约 18 px/s，最大速度 `min(3000, paneWidth × 1/s)`。均为待真机验证的初值。

```text
decay = exp(-friction × dt)
dx = velocity / friction × (1 - decay)
velocity *= decay
```

采用精确时间积分，避免不同刷新率产生不同滑行距离。这是对指数阻尼机制的独立实现。每次根据当前 count/W 把 dx 转为逻辑位移。

碰到当前图表允许的边界、range 不再改变、速度低于阈值、发生新输入、pointercancel、lostpointercapture、Escape、隐藏页面、dispose 时立即停止。`pointercancel` 与失去捕获绝不能被当成正常 pointerup 触发 fling。手动 releasePointerCapture 引发的 lostpointercapture 必须幂等处理。

## 11. 派生数据与读数缓存，必须和运动一起改

`chartDerivedData.js` 建议导出 `createChartDerivedData()`，仅保留当前数据上下文，避免无限缓存不同 symbol。

```ts
type DerivedSnapshot = {
  dataRevision: number;
  algorithmRevision: string;
  symbol: string;
  interval: string;
  bars: readonly Bar[];
  indexByTime: Map<number, number>;
  maByKey: Record<string, readonly LinePoint[]>;
  fastDema: readonly (number | null)[];
  slowDema: readonly (number | null)[];
  signals: readonly Signal[];
  signalsByTime: Map<number, readonly Signal[]>;
  markers: readonly Marker[];
};
```

缓存失效条件：被接受的新响应、同长度最后一根 OHLCV 更新、历史补数、数据校正、symbol/interval/range 改变、算法参数版本改变。不能只用数组引用或 length。当来自数据层的更新被接受时递增 revision；不要在每个 hover 中做 JSON.stringify/hash 来判断数据是否变了。

信号开关从关变开时允许按需算一次；重复 hover、缩放、拖动、主题变化不得重新计算。不要在热路径启动异步请求。

注意同一时间可能有多个信号。现在读数用 `.find()` 取第一个，而标记保留全部。用 Map 时必须保留列表及原始顺序，不能让“最后一个覆盖前一个”改变语义。DEMA warmup 的 null 不改成 0。

`applyInflectionMarkers()`、`applyDemaLinesData()`、均线 setData、hover 共用同一 snapshot。这个改动不改变任何信号算法公式、门槛、交易含义或标记顺序。

读数实现：复用一个 Intl.DateTimeFormat；同一 bar + 同一 snapshot + 同一可见性/主题版本只更新一次。跨 bar 时查缓存，修改必要文字节点；如暂时保留 innerHTML，也必须按内容去重、统一帧提交。不得把每次 hover 推成整个应用响应式更新。

接收新数据时再 setData；只换主题/颜色时 applyOptions，不重复 setData、重算均线和重置范围。

## 12. 生命周期与数据更新顺序

| 事件 | 必须执行 |
| --- | --- |
| loadChart 开始 | cancelMotion，增加上下文 epoch，清理待提交读数；保持现有请求序列和 abort 规则 |
| 新 symbol/周期数据被接受 | 取消旧任务 → 更新 revision/派生数据 → 一次提交各系列数据 → 一次 reset → 从真实范围播种 |
| 同 symbol 最后一根更新 | 更新缓存；history 不重定位；follow-latest 只在新增 bar 时按索引增量平移 display/target/anchor，替换同时间 bar 不移动 X |
| 补历史数据 | 以时间标识保存视口锚点，索引整体移动后重映射；不能让旧索引指向另一根 bar |
| reset / showAll | 取消所有运动，恢复自动 Y，一次 fitContent；若需延后读范围，保存可取消任务并检查 epoch，不叠加多层无主 rAF |
| resize / 价格轴宽度改变 | 更新 pane 几何；取消旧像素手势和惯性，保留可解释的当前范围，重新播种 |
| 量尺打开 | 立即取消运动；不等待下一次 pointerdown |
| page 切走 / document.hidden | 停止 rAF、清速度与残余目标，解除活动捕获；不产生 fling |
| reduced-motion 改变 | 取消旧动画，根据新策略提交/冻结，移除监听器时保持幂等 |
| dispose | 先停调度器与输入，再退订 range/crosshair、恢复/解除 provider，最后 chart.remove |

当前 `autoSize:true` 与外部 ResizeObserver 并存。保留原生 autoSize 管理尺寸，外部 observer 只做几何失效和必要量尺更新；不要同时调用重复 resize。用实际回调次数确认没有尺寸反馈环。

几何读取按帧/有效事件集中：一个处理过程获取一次 rect/paneSize，传给 hit-test、坐标转换和限幅。页面滚动、尺寸变化或轴宽改变需要失效。缓存不能永久不更新；也不要把“减少读取”误报为已经解决 forced layout。

## 13. 输入能力与稳定性边界

本次必交范围为鼠标 wheel/拖动、触控板横向/纵向输入、现有触屏单指与阅读模式兼容。触屏真实双指 pinch 不在本次必交范围，不能把现有单 pointer 捕获包装成已支持。

保持业务界面不出现调试参数。可使用仅开发时生效的配置 `motion=legacy|eased|direct` 对照，切换时先 dispose 旧控制器，保证没有双监听器/双范围写入者。调试配置使用独立内存状态或查询参数，不能覆盖 `market-desk-theme`、用户配色、自选数据等已有存储键。

不要用 CSS transform 缩放整个 canvas 来模拟 K 线缩放；这会同时拉伸文字、影响十字线命中和轴布局。视觉变化必须来自真实视口与价格范围。

## 14. 实施批次

1. **缓存批次**：派生数据快照、当前 bars 绑定、读数去重。比较输出与原算法完全一致，先消除 hover 重计算。
2. **X 缩放批次**：坐标 adapter、wheel 归一化、目标累计、右侧/指针锚点、反向立即响应、单一调度器、reset 收敛。
3. **Y 批次**：provider 适配与扩张保护、自动/手动模式、真实价格锚点、量尺同步。
4. **拖拽批次**：二维拖拽、水平惯性、输入打断、取消与边界。
5. **集成批次**：切标的/周期、数据更新、resize、阅读/展开模式、减少动态效果。
6. **性能验收批次**：真实浏览器同数据 A/B 与录屏，决定是否启用额外限速或直接响应分支。

每一批都要有可回退代码边界，但不要提交 Git 或部署。不能交付只调小 wheelSensitivity 或只增加一个动画 duration 的修复。

## 15. 自动测试与真实浏览器验收

### 15.1 必须补的行为测试

| 类别 | 具体断言 |
| --- | --- |
| 半柱坐标 | 新范围下整数蜡烛中心投影与 5.2.1 一致，指针锚点误差小于 0.5 CSS px |
| 帧率独立 | 固定目标经过相同 200 ms，60/120 Hz 的跨度一致；帧 cap 关闭时精确比较 |
| 输入累计 | 同帧连续输入按倍率累乘、只发生一次提交 |
| 即时反向 | 未完成缩放中反向，新帧即朝新方向变化 |
| 触控板 | 横向移动不缩放；小量抖动不切换主轴；方向切换时暂存量不丢失 |
| 边界 | 到达 min/max 后下一次反向有效，不消耗旧债务、不振荡 |
| 锚点 | 切换修饰键/指针位置不会当场跳图；reset 后首个 wheel 不强制居中 |
| 自动 Y | 始终处于原生 auto；新极值不裁掉；收缩有中间状态；volume 不受影响；margins 保留 |
| 手动 Y | 指针处价格不漂，含上下留白；横向 wheel 不擅自恢复 auto |
| 惯性 | 60/120 Hz 积分距离一致；暂停后松手不 fling；cancel/lostcapture 不 fling；wheel 不叠加二次惯性 |
| 取消 | 动画中换 symbol/周期、reset、resize、切页面、dispose，旧帧无法写新实例 |
| 库异步模型 | fake adapter 将范围应用延后一帧；不能只测 setter 同步可读的 mock |
| 缓存 | 连续 hover 1000 次不额外调用信号计算；同长度末 bar 修改会更新；同 time 多信号顺序不变 |
| 数据追随 | 替换末 bar 不平移，新 bar 在 follow 时平移，history 不动；补历史后时间锚点正确 |
| 手机/无动画 | reading touch 不阻塞页面，expanded 保留单指；reduced-motion 无尾部帧泄漏 |

测试放在 `test/kline-motion.test.js`、`test/kline-wheel-input.test.js`、`test/kline-price-motion.test.js`、`test/chart-derived-data.test.js`，以及现有几何/移动测试。将参考文件中的数学用例迁入实际模块测试，不能只运行 docs 的参考实现测试就宣布 app 修好。

更新 `workspace-ui.test.js` 的 import 替换和 controller mock；增加至少一组实际走 Lightweight Charts 分支的 stub 测试。现有 mount 默认提供 ECharts，许多通过结果不能证明主 K 线集成正确。

必要检查：新文件 `node --check`、`npm run check`、针对性 Node tests、`npm run test:workspace`。Windows 若项目实际依赖目录的符号链接引起模块解析问题，记录原因后沿用仓库已验证的 `--preserve-symlinks` 路径，不能将环境错误伪装成通过。

### 15.2 真实画面验收

固定同一 symbol/interval、同一 OHLCV fixture、相同图表尺寸与指标，比较 legacy/eased/direct。另单独对照 OpenMarket 视频的交互表现；不同数据/不同负载不能直接比较 FPS。

至少覆盖 120、500、2000 根 K 线，指标关/开，普通鼠标和触控板；记录 DPR、浏览器缩放和刷新率。脚本注入的 wheel 可以验证逻辑，但不能代替真实硬件手感。

记录 wheel→提交、rAF 间隔 p50/p95、超过两帧预算的比例、主线程长任务、派生算法调用次数。提交时间不是 paint 时间；最终结合 Performance trace 的绘制/合成及连续录屏判断输入到画面的延迟。

建议门槛：

- 缓存后，交互期间整段信号重算次数为 0；相同数据下读数内容与改前一致。
- 普通 -100 的一次 wheel 有连续过渡、无反向/过冲，约 140 ms 完成 95% 的跨度变化（21.5/s 的数学结果，不含浏览器排队）。
- 主体交互在 60 Hz 下以 16.7 ms、120 Hz 下以 8.3 ms 为帧预算。与基线比较长帧比例和输入拖尾，不能只报告平均 FPS。
- 默认缩放锚点连续；Alt/Meta 指针锚点的代表性 candle 中心移动误差不超过 0.5 CSS px，边界修正情况单独标记。
- 停止操作后不会持续占用 rAF，不会被行情、hover、旧 reset 闭包重新跳走。
- 可见高低点、信号标记和量尺不被错误裁剪，手机页面滚动保持正常。

如果浏览器环境仍不可用，完成能验证的代码与单元测试，明确列出真实交互未验收项，并保留开关供复测；不能写“已经和 OpenMarket 一样丝滑”。

## 16. 本任务书已经验证的范围

- 已检查源站发布代码的相关交互分支和本地 5.2.1 的范围/坐标 API 实现。
- [原创数学参考文件](references/kline-motion-reference.mjs) 的 [13 项测试](references/kline-motion-reference.test.mjs) 已通过，覆盖坐标、锚点、时间收敛、反向、边界与惯性积分。
- 参考实现是独立的纯数学样例，没有完整 DOM 输入、provider 集成、异步库调度或性能证明。它不在生产 import 路径中。
- 本任务书编写没有修改应用运行代码；当前真实图表仍是原实现。

官方接口参考：[时间轴](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/ITimeScaleApi)、[价格轴](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/IPriceScaleApi)、[系列配置](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/SeriesOptionsCommon)。实现细节以项目固定的 5.2.1 为准。

Gemini 最终回复请提供：改动文件与理由、保留/变更的交互行为、测试实际结果、改前/改后录屏或 trace 路径、性能数据及剩余未验收项。完成到这里才是这个任务的交付。
