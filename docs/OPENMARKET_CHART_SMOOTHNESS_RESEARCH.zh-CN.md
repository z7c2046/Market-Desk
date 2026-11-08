# OpenMarket K 线交互研究与 Market Desk 改造建议

研究日期：2026-11-08（北京时间）。范围：用户提供的视频、OpenMarket 当日公开前端构建、Market Desk 当前工作区代码和本地合成探针。

后续代码实施请以 [Gemini 实施任务书](KLINE_OPENMARKET_GEMINI_IMPLEMENTATION.zh-CN.md) 为准。该任务书补充了 5.2.1 的半柱坐标适配，确定使用时间驱动的跨度收敛与自动价格轴 provider；本报告后文的候选路线用于解释研究过程。

结论：可以在现有 Lightweight Charts 上实现相近的缩放、锚定与惯性机制。OpenMarket 发布资源包含名为 Titan 的独立图表实现及 WebGL2 路径；目前没有查到该引擎可直接引入的官方开源仓库、SDK 和复用许可证。建议先改 Market Desk 的交互控制器和鼠标回调，再用实际帧性能决定是否需要替换绘制引擎。

本次为研究与改造设计，未修改应用运行代码。工作区原有的 `public/app.js`、`public/index.html`、`public/styles.css`、`src/onchain-stocks-service.js` 修改保持原样。

## 1. 视频中能确认的现象

输入文件：`C:\Users\z7c2046\Videos\ShareX\Screenshots\2026-11\chrome_KGDaDAC4eS.mp4`。时长约 40.70 秒，2560×1390，约 29.98 fps。

| 片段 | 当前观察 | 不能由此推出 |
| --- | --- | --- |
| OpenMarket，3.50–4.00 秒 | 连续帧中，K 线间距及屏内内容持续变化；大跌柱逐步离开左侧，细节逐步放大 | 不能仅凭录屏确定应用运行于 60/120 fps，或识别具体输入设备 |
| Market Desk，14.40–14.90 秒 | 中间有大幅范围切换，最新 K 线明显向中间移动，右侧留白随之增加 | 不知道每帧对应的滚轮输入量；停留帧不等同于丢帧 |
| 两个页面的展示负载 | Market Desk 有均线、信号标记及侧栏，OpenMarket 该片段主要展示 K 线和成交量 | 这不是同数据、同视口、同输入序列的性能 A/B |

已按原始逐帧顺序抽取两段各 16 帧。图中 `n/30` 是便于阅读的近似相对时间标注，精确时序应以原视频 PTS 为准。

- [OpenMarket 连续帧](../artifacts/openmarket-chart-audit-2026-11-08/video-openmarket-30fps.jpg)
- [Market Desk 连续帧](../artifacts/openmarket-chart-audit-2026-11-08/video-marketdesk-30fps.jpg)
- [完整视频概览](../artifacts/openmarket-chart-audit-2026-11-08/video-overview.jpg)

本次浏览器控制返回 native pipe/browser host 不可用，未完成现场滚轮复测或 DevTools 性能采样。以下明确区分代码事实、合成复现、设计选择与待测假设。

## 2. OpenMarket 的技术证据

官网入口：[OpenMarket Chart](https://openmarket.xyz/chart/)。当日 HTML 标记构建 `25539-1fb32274`、应用版本 `1.77.695`，预加载 `chart-engine`、`titan-core`、`titan-shared` 等模块。资源通过 HTTPS 获取后仅作为文本检查，没有执行下载的脚本。

| 已观察到的机制 | 证据含义 |
| --- | --- |
| WebGL2 上下文与实例化绘制 | 图表核心包含 GPU 绘制能力，同时存在 Canvas 2D 路径；不能据此宣称全部元素都由 GPU 绘制 |
| 输入归一化、方向判断、缩放输入合并 | 滚轮、触控板横向移动与缩放走不同处理分支 |
| 缩放直接/缓动两种路径 | 配置与帧开销会影响路径选择；不能说视频中的每次滚轮都在播放缓动 |
| 价格范围缓动、拖拽动量 | 横向导航之外，纵轴变化及松手后的运动也有专门控制 |
| 帧调度与绘制成本记录 | 有针对交互负载的调度与退让机制；这不是本次实测的性能保证 |

主要一手资源：[chart-engine](https://assets.openmarket.xyz/chart/assets/chart-engine-DGYJny2Z.js)、[titan-core](https://assets.openmarket.xyz/chart/assets/titan-core-G4TvS5Pa.js)、[titan-shared](https://assets.openmarket.xyz/chart/assets/titan-shared-DTXK05D9.js)。本地副本与哈希保存在研究目录。

定位原始 `titan-core` 时，可搜索 `getContext`、`drawArraysInstanced`、`queueZoom`、`openZoomStreak`、`easeAutoScale`、`panVelocityPxPerSec`。这些名称用于定位证据，不是建议直接复制其实现。

GitHub 搜索 `titan-charts`、`kiyotaka-ai` 组织仓库及该组织内相应代码，没有找到可复用的 Titan 图表仓库。检索到的 [kiyotaka-api-js](https://github.com/kiyotaka-ai/kiyotaka-api-js) 是数据 API 客户端，不能当成图表引擎。此结论仅指本次检索范围，不证明其没有私有 SDK 或商业授权。

## 3. 当前项目的具体问题

实际链路是 `public/index.html → public/app.js::renderPrice → Lightweight Charts 5.2.1 → bindKlineGestures`。`public/composables/useChart.js` 不是本次主 K 线的修改入口。图表没有落到 ECharts 的正常原因是：页面已加载 Lightweight Charts，`renderPrice()` 首先选择这一分支。

### A. 已复现：合并到一帧，不等于有跨帧过渡

位置：`public/composables/klineGesture.js:349` 的 `commitWheel()`、`:382` 的 `onWheel()`；`klineGeometry.js:114` 的归一化、`:122` 的指数倍率。

现有实现收集 wheel delta，到下一次 rAF 一次性调用 `setVisibleLogicalRange()`。没有目标范围与显示范围之间的持续插值。已有 rAF 批处理是有效优化，不应把它误报为“完全没有节流”。

直接导入现有控制器、使用假时钟和假 chart 的探针结果：

| 输入（像素模式，合成） | 新范围 / 原范围 | 范围写入 | 后续待执行帧 |
| --- | --- | --- | --- |
| 单次 -100 | 0.843665，即一次缩小约 15.6% | 1 次 | 0 |
| 单次 -120 | 0.815462，即一次缩小约 18.5% | 1 次 | 0 |
| 同帧三次 -120 | 0.542265，即一次缩小约 45.8% | 1 次 | 0 |

这证明了控制器的离散范围变化，不代表某个型号鼠标每格一定产生上述 delta。

### B. 设计选择：放大时让最后一根 K 线移向中央

位置：`klineGeometry.js:26` 的 `latestBarFraction()`、`klineGesture.js:170` 的 `scaleTimeFrom()`。

当前 `followLatest` 模式把最新 K 线的位置从远景的 94% 逐步移到近景的 50%。已有单元测试明确要求这个行为。它是此前的交互策略，不能直接定性成计算错误。

但该策略意味着用户滚轮放大同时还在经历水平平移，鼠标所在历史点也不会固定。在初始 `fitContent()` 范围与该策略之间，首个滚轮还可能额外发生锚点切换。

合成例子：可见范围 `[-0.5, 125]`、最后索引 119，一次 -100 后，最后一根的位置从 95.2% 移到 75.1%。这是给定初始状态的可复现几何效果，未声称真实页面每次初始范围都恰好如此。

建议把“追随最新数据”和“滚轮缩放锚点”拆成两个状态。初始缩放从当前屏幕范围接续；默认保留稳定右侧位置，历史查看或指定修饰键采用鼠标锚点。自动居中可以作为显式偏好，不能在底层数学修改时悄悄改变旧测试的含义。

### C. 已确认的条件性开销：十字光标触发全量信号计算

位置：`public/app.js:6459` 的 `updateReadoutFromCrosshair()`，尤其 `:6520`；注册入口 `:6677`。算法本体在 `public/inflection-hunter/engine.js:24`。

当 `showInflectionSignals` 开启时，每次回调都会调用整段 `computeInflectionSignals(bars)`；部分数据缺失分支还会重算 DEMA。另外每次创建日期格式器，并重写读数 DOM。视频里的 Market Desk 确实显示了信号标记，但具体每一帧算法被调用几次仍需浏览器采样。

本机 Node v25.7.0、合成 OHLCV、预热 3 次后测 15 次，单次信号计算中位数：120 根约 1.51 ms、500 根约 15.33 ms、2000 根约 74.41 ms。这是 CPU 函数微基准，既不包含 Canvas 绘制，也不是视频里的真实行情测量。

优先把信号与 DEMA 的计算放到数据版本变化时；hover 只按时间读取缓存。缓存键至少包括 symbol、interval、数据 revision、算法配置 revision。同长度数组内最后一根 OHLCV 改变也要失效，不能仅按长度或数组引用缓存。

同时修正回调对创建图表时 `bars` 的闭包引用：切换标的/周期后，应读取当前版本数据，避免 fallback 与信号读数继续使用第一次的数据。

### D. 已确认的配置，以及尚未量化的影响

- `public/app.js:6610` 关闭了原生滚动、缩放、pinch 和惯性，交互由自定义控制器独占。因此直接改 `kineticScroll.mouse=true` 不会给自定义拖拽自动增加惯性。
- 单次合成滚轮流程触发 5 次 `getBoundingClientRect()`。可以把同一次输入处理需要的几何信息集中读取，但本次没有证明这些读取造成强制同步布局。
- `autoSize:true` 与外层 `ResizeObserver → resize()` 同时存在。需要核对实际回调和库的自动尺寸策略；没有证据表明它是滚轮卡顿主因。
- `onState` 只把字面量 `history` 映射为历史，其余状态全映射为最新。历史浏览时 `plot` 或 `wheel-zoom-x` 会让标签与控制器真实状态不一致，应从控制器的持久导航状态投影 UI。
- `renderPrice()` 会全量 `setData`，但当前代码并不是每个 wheel 都调用 `renderPrice()`。不能把该函数的存在当成“滚轮时每帧全量重建”的证据。
- 外层控制器 rAF 后，Lightweight Charts 自己还通过 rAF 排队绘制。存在多层调度，需要真实时间戳验证输入到呈现的延迟，不能仅凭源码断言恒定多延迟一帧。

## 4. 建议的实施顺序

### 第一阶段：保留引擎，修热路径并建立对照

1. 将数据派生结果集中在数据更新路径生成：信号数组、按 time 的信号索引、DEMA 序列、bar 索引。均线、标记、顶部读数共用同一版本结果。
2. hover 相同 bar/相同数据版本不重复更新；日期格式器复用。多次鼠标事件只提交本帧最新读数。鼠标离开时读当前数据最后一根。
3. 独立比较三组：当前控制器、Lightweight Charts 原生控制、改进控制器。原生组必须卸载自定义监听器，避免两个控制器同时写视口。原生组只是诊断对照，其轴行为不必与最终产品一致。
4. 使用同一组 K 线和相同指标负载，先看问题有多少来自宿主回调，再评价绘制引擎。

### 第二阶段：实现持续、可打断的缩放

建议新增 `public/composables/klineViewportMotion.js`，由现有 `klineGesture.js` 负责输入解析和状态衔接。不要搬入 Titan 的打包脚本。

建议状态包含：显示范围、目标范围、当前锚点、最后帧时间、输入类型、导航模式、价格轴模式、销毁标记与数据版本。

- 新 wheel 修改累计目标，不反复用滞后的已显示范围重建目标；反向输入立即改变目标方向。
- 跨帧插值使用时间差，而非固定“每帧移动百分之几”，以适配 60/120/144 Hz。正跨度可以在对数空间插值，保证跨度始终为正。
- 候选参数可从约 100–160 ms 的主体收敛时间开始做 A/B；它是待调试的设计范围，不是已经验证的最佳参数。触控板连续输入可采用更直接的跟随，避免人为增加拖尾。
- 锚点应稳定。变换时保持同一逻辑点与屏幕比例；指针移动后重设锚点应从当前显示状态接续，不能跳到旧目标。
- 同一帧至多向时间轴写一次范围；保留原库的内部绘制调度，并测量组合后的延迟。
- 到达 min/max 范围时截断目标并清掉多余动量，防止反向滚动先“消耗积压”。
- pointerdown、轴拖拽、量尺开始、双击重置、切标的、切周期、resize、切移动输入策略、隐藏页面、dispose 都必须明确取消/接续动画；旧回调不能写新图表。
- `prefers-reduced-motion` 时取消尾部过渡与松手惯性，保留立即可用的缩放。

### 第三阶段：价格轴与松手惯性

先修横轴、收集数据，再引入纵轴缓动。原生自动价格范围变化也会影响视觉连续性，但当前没有测量它贡献了多少卡顿。

- 使用现有 5.2.1 的公开价格范围 API；自动与手动 Y 模式必须独立保存。价格轴拖拽后不能被下一次横向 wheel 偷偷恢复自动。
- 自动 Y 目标考虑当前可见 K 线、可见且属于该价格轴的指标及现有边距；成交量保持独立价格轴。避免缓动时裁掉新进入视口的极值。
- reset 应恢复当前产品约定的完整视图及自动轴；取消所有旧动画。
- 若保留自定义二维拖拽，惯性也由这一控制器维护。速度从最近一段有效指针样本估计，按真实时间衰减，设置最大速度和停止阈值；不能同时开启另一套原生惯性。
- 手机阅读模式继续允许页面滚动；展开图表才接管精细手势。当前单 pointer 控制器没有完整双指缩放，不能把“开启 touch”写成已经支持 pinch。

### 第四阶段：只有测出绘制瓶颈才考虑 GPU 迁移

若优化回调与交互后，合理数据规模下的 Canvas 绘制仍持续超出帧预算，再评估 WebGL 引擎。迁移需覆盖成交量独立轴、MA/DEMA、标记、十字光标读数、量尺、主题、轴拖拽、重置、移动手势、增量更新、历史补数和销毁流程。应先提供统一 chart adapter 与可回退开关，保持数据源和持久化用户数据不变。

不建议仅为滚轮手感就整体重写图表。现有 [Lightweight Charts](https://github.com/tradingview/lightweight-charts) 是 Apache-2.0 项目，本地安装为 5.2.1；其[惯性选项](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/KineticScrollOptions)服务于原生手势，不能替代自定义缩放动画。沿用它时继续保留现有署名与链接要求。

## 5. 验收与证据边界

建议在真实浏览器记录 wheel 时间戳、viewport 写入时间、rAF 间隔、长任务、读数回调与算法耗时。范围变化回调不代表该帧已经呈现；输入到画面的结论应结合 Performance trace 的绘制/合成与高帧率录屏。

顺序执行以下验证：

1. 120 / 500 / 2000 根，同数据、同视口，分别关闭与开启全部现有指标；普通滚轮与触控板单独测。完整记录屏幕刷新率、缩放比例、DPR。
2. 缩放途中反向、到极限后反向、指针换位置、横向双指移动、量尺中 wheel、轴拖拽后 wheel、双击 reset。
3. 动画中切标的/周期、切页面、resize、手机旋转、关闭展开图表，再次打开。不得出现旧视口回写和泄漏监听器。
4. 同长度最后一根更新、补历史数据、信号参数变化：缓存正确失效；行情不变时连续 hover 不再全量重算。
5. 以 60 Hz 的 16.7 ms、120 Hz 的 8.3 ms 为帧预算参考；比较 p50/p95 帧间隔与超过两帧预算的比例，而非只看平均 FPS。目标是在交互段减少长帧，同时不增加明显的输入拖尾。
6. 保存改前/改后原始 trace 与相同操作片段。未取得这些证据前，结论只能是“实现并通过功能检查”，不能写“已达到 OpenMarket 的丝滑度”。

本次运行已有几何/移动手势测试，13/13 通过。它们验证数学与输入策略，不验证画面连续性。研究探针与结果：

- [可重复的探针](../artifacts/openmarket-chart-audit-2026-11-08/characterize-local.mjs)
- [结果 JSON](../artifacts/openmarket-chart-audit-2026-11-08/local-characterization.json)
- [资源清单与哈希](../artifacts/openmarket-chart-audit-2026-11-08/evidence-manifest.json)

`artifacts/` 已在项目 gitignore 中，包含视频派生图片及公开资源研究副本；该目录未作为生产依赖接入。文档中的行号对应本次工作区快照，后续修改时应同时按函数名定位。
