# 财报日历：卡片旋转、放大、展开的 Gemini 改进方案

日期：2026-11-04（北京时间）  
项目：`D:\YUXIANZHAO\Code\Market Desk`  
范围：代码诊断、开源选型与实施交接。本文没有修改应用行为，没有安装动画依赖，没有提交、推送或部署。

## 1. 用户真正要的效果

点击一张公司卡片后，用户应能一直认出“就是刚才那张卡片”：它从日历中的原位置浮起，明显旋转，连续移向中央并放大，最后展开为完整财报。关闭时沿对应路径收回原位置。

建议默认采用 **Y 轴半圈翻转（0° → 180°）＋从源卡片到详情面板的连续位置/尺寸变化**。正面是公司 Logo、股票代码和现有状态角标，背面是财报详情。半圈是本方案的设计选择，目的是满足用户强调的可见旋转；不要求反复转圈。

打开总时长先定为约 820ms，旋转与放大部分重叠，详情内容在后段出现。最终仍用现有财报详情布局，不把所有文字先缩成一团再放大。具体时长需要真浏览器录屏微调，不能只凭参数宣布达标。

```text
日历原卡片 → 浮起并开始转动 → 可见的斜面/侧面 + 连续放大
          → 转到背面并到达详情尺寸 → 内容稳定可读

关闭：详情内容收起 → 反向旋转、缩小、回到原卡片 → 恢复点击前焦点
```

## 2. 当前实现为什么像“中间被省略了”

以下行号来自本次结束前复核的工作区快照。期间观察到其它任务更新了部分 HTML/CSS/测试文件，行号有移动；财报入口、打开/关闭函数与关键帧内容经复核仍保持下述逻辑。Gemini 开始前应按函数名/选择器重新定位，保留工作区已有修改。

| 证据 | 当前行为 | 对观感的影响 |
| --- | --- | --- |
| `public/index.html:2296`、`:2337` | BMO 和 AMC 都调用 `openEarningsModal(item)`，没有传入事件或源元素 | 无法从被点击卡片的真实位置、尺寸开始 |
| `public/app.js:2989` | 仅设置选中数据、将 `showEarningsModal` 置为 true | 源卡片与详情框没有几何过渡关系 |
| `public/index.html:4390` | 用 `v-if` 新建独立详情弹层 | 当前所谓“展开”实际是另一个 DOM 面板入场 |
| `public/styles.css:7581` | 起点 `opacity:0; rotateY(-24deg); scale(.72)`，60% 时已经 `rotateY(3deg); scale(1.015)` | 最大倾斜时完全透明，且一开始就是接近详情尺寸的大面板 |
| `public/styles.css:7636` | 360ms，`cubic-bezier(.16,1,.3,1)` | 强烈前快后慢，把主要动作挤到最初几十毫秒 |
| `public/styles.css:7061` | 原卡片 hover 只有 `translateY(-3px) scale(1.02)` | 原卡片本身没有点击后的旋转展开过程 |
| `public/app.js:2994` | 关闭直接把显示状态置为 false | `v-if` 立即移除，没有收回原卡片的退出过程 |

**确认结论：缺失的是从源卡片到详情的连续动画机制。仅将 0.36s 改成 0.8s，无法补出源位置、前后两面、连续展开和退出回收。**

`flippedEarningsCards` / `toggleCardFlip` 等旧翻卡状态仍在 `app.js`，但当前两组卡片入口调用的是 `openEarningsModal`。不要只修旧翻卡函数，然后误以为当前用户路径已修复。

### 2.1 当前 CSS 的时间分布：静态计算，不是录屏测量

按现有 keyframes 和 easing 计算，transform 在 0–60% 和 60–100% 两段分别插值；opacity 只有首尾关键帧，使用完整 360ms 区间。

| 动画时间 | Y 轴角度 | 相对最终尺寸的 scale | opacity |
| --- | ---: | ---: | ---: |
| 0ms | -24.00° | 0.7200 | 0.0000 |
| 36ms | -5.48° | 0.9224 | 0.4944 |
| 72ms | +0.38° | 0.9863 | 0.7521 |
| 108ms | +2.24° | 1.0067 | 0.8772 |
| 216ms | +3.00° | 1.0150 | 0.9880 |
| 360ms | 0.00° | 1.0000 | 1.0000 |

72ms 时角度已接近正面，尺寸已接近最终大小。这与“轻微动一下就展开”的描述相符。表格不等于实测帧率，不包含透视投影后的像素边界、主线程阻塞、实际首帧时间或浏览器覆盖样式。

计算脚本与 JSON 位于 `docs/diagnostics/earnings-card-motion-2026-11-04/`。规则参考 [MDN animation-timing-function](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timing-function)。

### 2.2 仍需运行时核实的项目

- `prefers-reduced-motion`：CSS 多处存在关闭或极短动画的规则，例如 `styles.css:5705`、`:8354`。必须检查当前浏览器 `matchMedia('(prefers-reduced-motion: reduce)').matches`，目前不知道用户是否启用。尊重这项偏好，不删除全站规则强行动画。
- 16px 背景模糊、大阴影是否导致掉帧：目前只是性能检查项，没有实测依据，不能称为根因。
- 实际服务是否与工作区代码一致、缓存是否陈旧、是否有 CSS 覆盖：需要浏览器 Network / Computed Styles 确认。
- `.modal-backdrop` 在移动端有通用定位规则；当前财报面板没有 `.modal-card` 类，不能误称通用 `.modal-card` 动画已覆盖它。新的容器应有独立类名，避免未来混用。

本次尝试连接浏览器时，工具返回 `The browser access host is unavailable`，本机截图接口同时返回 native pipe unavailable。因此没有本次真实点击录像、逐帧截图、浏览器性能 trace，也没有宣称复现浏览器掉帧。用户给的是静态截图，只能确认入口和布局。

## 3. 开源检索结论与复用边界

检索和许可证查阅日期：2026-11-04。下列演示链接来自作者；本次能阅读页面和源码文本，不能现场播放验证。没有找到经本次运行验证、能直接装进当前 Vue 页面并完整满足所有动作的现成组件。

| 项目 | 匹配点 | 许可证及适配结论 |
| --- | --- | --- |
| [TahaSh/card-to-modal-transition](https://github.com/TahaSh/card-to-modal-transition) | 原生 JS，卡片从原位置连续变成详情；作者提供测量前后布局、反向变换、关闭还原的示例 | **首选复用基础，MIT**。复用几何过渡和占位方法；补充 3D、Vue 生命周期、中断处理与可访问性 |
| [juliangarnier/anime](https://github.com/juliangarnier/anime) | 动画时间线，能统一安排旋转、移动、缩放和内容出现 | **推荐直接使用的动画引擎，MIT**。与 Vue 无强耦合；它本身不是财报展开组件 |
| [aholachek/react-flip-toolkit](https://github.com/aholachek/react-flip-toolkit) | 布局位置、尺寸过渡，包含子元素反缩放思路；也有框架无关的 `flip-toolkit` 包 | MIT。可做备选，但不为当前 Vue 项目引入 React；默认方案无需再叠加第二套布局引擎 |
| [alexpate/aperto](https://github.com/alexpate/aperto) | App Store 风格卡片到详情、关闭回原位置 | MIT；React，作者标注 early preview。适合看交互方向，本次不选作直接依赖 |
| [claudiocalautti/card-expansion](https://github.com/claudiocalautti/card-expansion) | Codrops 的卡片扩展效果，有整段展开演示 | 作者 README 明确为 **GPLv3**，不是 MIT。本方案不复制其代码，避免把“README 鸣谢”误当全部复用条件 |

优先查看：

- [Taha 作者演示](https://codepen.io/tahazsh/pen/MWPMEyB)：重点看卡片与详情的连续联系。
- [Taha 原文](https://tahazsh.com/blog/smooth-card-to-modal-transition/)：解释 First / Last / Invert / Play 的布局过渡方法。这里的 **FLIP 是算法缩写，不是 3D 翻面**；需要另外增加 Y 轴旋转。
- [Anime.js 时间线文档](https://animejs.com/documentation/timeline/) 与 [控制方法](https://animejs.com/documentation/timeline/timeline-methods/)：用于统一驱动与中断。
- [Codrops 演示](https://tympanus.net/Development/CardExpansion/)：仅作为展开观感参考。

### 3.1 明确复用什么

Taha 示例的 `collectInitialProperties`、`collectFinalProperties`、`setInvertedTransformAndOpacity`、`clipCardContent` 展示了源/目标测量和视觉连续性的做法。按其 MIT 许可改编需要的部分，并在代码与说明中写清来源。不要整页搬过来。

必须改写示例中不适合本项目的部分：全局单例变量、仅锁 `document.body` 的滚动处理、无中断状态机、关闭时使用旧坐标，以及将整个 `element.style` 清空的清理方式。当前项目桌面主滚动区域是 `.workspace-content`（`styles.css:11220`），只锁 body 不够。

Anime.js 负责唯一动画时间线。不要再让 CSS keyframes、CSS transition 和 JS 动画同时写同一个节点的 transform。安装时选择并固定实际验证的 4.x 精确版本；更新 lockfile。API 示例与资源路径必须按所安装版本检查，不照抄旧版 `anime.timeline()`。

## 4. 建议实现结构

### 4.1 文件分工

| 文件 | Gemini 要做的改动 |
| --- | --- |
| `public/earnings-card-motion.js`（新增） | 几何测量、时间线、状态机、取消与恢复；与财报数据计算解耦 |
| `public/app.js` | 现有打开/关闭函数接入控制器；管理选中数据、Vue refs 和 nextTick；股票跳转先清理动画 |
| `public/index.html` | BMO/AMC 都传 `$event`；卡片改用语义按钮或等效键盘入口；独立挂载动画舞台和详情面 |
| `public/styles.css` | 替换旧 `heroCard3dExpand` 路径；新增定位层、3D 旋转层、前后面及内容层规则 |
| `package.json`、lockfile | 固定 Anime.js 版本；为新 JS 加语法检查 |
| `src/server.js` | 若沿用现有 vendor 路由，只添加明确的动画库文件映射，不开放整个 node_modules |
| `test/workspace-ui.test.js` | 更新新增 import 的测试加载方式；补充打开/关闭/清理状态验证 |
| `test/earnings-card-motion.test.js`（新增） | 几何计算、状态转移、取消后恢复等纯逻辑测试 |
| 浏览器 E2E 用例（新增） | 真实中间帧、连续点击、滚动后关闭、移动端、减少动态效果 |
| `README.md`、`THIRD_PARTY_NOTICES.md`、许可证文件 | 实际采用后记录来源、固定版本/commit、改编范围和许可原文 |

本项目使用 Vue 全局运行时、浏览器 ES modules、Node 静态服务，没有现成 React/Vite 构建入口。浏览器不能直接解析 `import ... from 'animejs'` 这种裸包名。选择已验证的浏览器 ESM 入口并通过现有 vendor 白名单服务，或采用该版本的独立浏览器构建。先确认其内部相对 import 均可加载，不能只映射一个仍依赖其他文件的入口。

### 4.2 DOM：让移动、旋转、内容滚动各管一层

```text
Teleport to body
└─ earnings-motion-overlay（固定覆盖视口；对话框语义、焦点管理）
   ├─ earnings-motion-backdrop（独立遮罩；可选静态 blur）
   └─ earnings-motion-positioner（源 → 目标的平移/缩放）
      └─ earnings-motion-perspective（提供 perspective）
         └─ earnings-motion-rotor（只负责 rotateY；preserve-3d）
            ├─ earnings-motion-front（源卡片外观；backface hidden）
            └─ earnings-motion-back（固定 rotateY(180deg)）
               └─ earnings-detail-scroll（现有财报详情；内部滚动）
```

原网格中的卡片留作占位，仅临时 `visibility:hidden`，不 `display:none`，不移动原节点导致网格重排。舞台里的前面由同一份 `selectedEarningsItem`、现有 Logo SVG 和角标渲染，不截取整个页面当贴图。新旧外观必须一致，第一帧没有“双份卡片”。如果复制 SVG，检查内部 ID 和 `url(#...)` 引用唯一性。

overlay 放到 body 下面，避免日历列、主内容滚动裁剪和祖先 transform 干扰。背景遮罩与旋转层是兄弟关系；动画前半段不要把源卡片位置先盖成一片不透明灰色。

3D 容器保持 `overflow:visible`、`opacity:1`、不加 filter；圆角裁剪与滚动放到面板内部。`overflow:hidden`、opacity/filter 等属性可能压平 preserve-3d，具体约束参考 [MDN transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-style)。单独对内容层做淡入，不对整个旋转物体从 0 淡入。

建议 perspective 初始值约 1400–1800px，最终根据面板尺寸录屏调节；必须看到明显斜面，但不出现近边巨大拉伸。

### 4.3 源与目标的测量合同

两处入口一致更新，例如：

```html
@click="openEarningsModal(item, $event)"
```

同步保存 `event.currentTarget`，不要使用可能落在 SVG/path 上的 `event.target`。不要在 `await nextTick()` 之后再从事件里取 currentTarget。

1. 验证源元素仍连接 DOM，读取 `getBoundingClientRect()`，保存当前焦点、滚动位置与需要恢复的 inline 样式。
2. 测量必须基于用户看到的 hover 姿态；目前 hover 有 1.02 缩放和 -3px 位移。可以保留该起点，然后平滑进入时间线；不能先突然取消 hover 再量一个不一致的框。
3. 先设置选中数据和“已挂载但准备中”的舞台，`await nextTick()` 后测量最终详情尺寸。准备态不得闪现最终大面板。
4. 最终宽度沿用约 860px 上限，窄屏保留左右至少 12–16px；最终高度由真实内容和可用高度约束，内容在详情内部滚动。短屏不要让 `min-height:520px` 压过可用高度。
5. 固定在视口坐标系的舞台使用 DOMRect 坐标，不能再次加 window.scrollY；移动端 visualViewport 的尺寸/偏移必须保持同一坐标系并测试。
6. 先把舞台定位成源卡片外观，再隐藏原卡片；动画启动与 Vue flush 对齐。若使用 CSS 过渡需建立可见初始帧；若用 JS 时间线则明确设置初值，不能先显示终值再 seek 回 0。

设源框 S、目标框 D，位置层以 D 为布局尺寸并设 `transform-origin:50% 50%`，则不含旋转的起始变换为：

```js
const from = {
  x: (S.left + S.width / 2) - (D.left + D.width / 2),
  y: (S.top + S.height / 2) - (D.top + D.height / 2),
  scaleX: S.width / D.width,
  scaleY: S.height / D.height,
};
// positioner 在 D.left / D.top，宽高为 D.width / D.height。
// 外层从 from 动到 { x:0, y:0, scaleX:1, scaleY:1 }。
// 内层 rotor 独立从 rotateY(0deg) 动到 rotateY(180deg)。
```

该公式只定义无透视旋转时的几何端点，不能把旋转后的 boundingClientRect 当作新的自然布局框反复算回去。

前后尺寸比例不一致时，外壳可做非等比缩放，**Logo 和文字不能跟着拉扁**：前面品牌组使用反向补偿/独立的等比品牌变换；背面真实正文在接近最终尺寸后再出现。品牌子元素也要测量其独立起终点。不要把 scaleX 简单复制给 scaleY，导致第一帧高度不匹配；也不要把所有财报正文塞进缩小的外壳里直接暴露。

若团队改用 width/height 动画，需要在真实负载下证明布局成本可接受。默认不对页面网格做逐帧布局动画，不以“用了 transform”作为自动达到 60fps 的证明。

## 5. 动作编排与状态机

### 5.1 建议时间线（设计目标，尚未浏览器验证）

| 时间 | 外壳/位置 | 旋转与可见内容 |
| --- | --- | --- |
| 0ms | 精确覆盖源卡片 | 0°；Logo、代码、角标完全可见 |
| 0–100ms | 轻微浮起，约 1.04 倍的感知放大 | 0° → 18°；此时已能看出点击响应 |
| 100–340ms | 连续向中央移动、尺寸向目标增长 | 18° → 约 82°；主要旋转必须可见 |
| 340–460ms | 持续移动/放大，不能突然变成最终尺寸 | 穿过侧面，约 82° → 126°；背面品牌与外壳接上 |
| 460–680ms | 达到最终位置、尺寸、圆角 | 126° → 180°，稳稳落位 |
| 680–820ms | 面板几何保持稳定 | 正文/KPI/操作淡入；避免所有区域同时抢动画 |

约 90° 时投影自然变窄，这是翻面的正常现象；不要在侧面停顿一大段时间。感知上的“变大”按外壳几何判断，不能要求旋转时屏幕投影宽度严格单调增长。

遮罩约 0–220ms 渐入，源卡片代理保持不透明。前半段采用平衡的加减速，不沿用当前极强的前快后慢曲线。打开只使用一条主时间线，并行子段由它统一安排；不要用多个 setTimeout 拼接阶段。

关闭建议 560–640ms：先收起正文，再缩小/反转。退出沿同一几何模型；如果源位置发生变化则重新生成退出终点。

### 5.2 状态与对象生命周期

```text
idle → preparing → opening → open → closing → idle
             ↘ cancel/route change/invalid source → cleanup → idle
```

不要继续用 `showEarningsModal` 一个布尔值承担所有生命周期。可保留它作为“弹层是否挂载”的派生值，但至少需要以下概念：

```js
// 合同草图；不是已实现的可直接粘贴代码。
{
  phase: 'idle',
  itemKey: null,       // week + symbol + timing，避免周切换后的误匹配
  desiredState: 'closed',
  generation: 0,       // 每次作废异步流程时递增
  sourceElement: null,
  sourceRect: null,
  destinationRect: null,
  timeline: null,      // 主时间线唯一所有者
  restoreFocusTo: null,
  restoreRecords: []   // 样式、inert、滚动、监听器的精确恢复记录
}
```

接口建议：`prepareOpen({item,sourceElement})`、`startOpen()`、`requestClose(reason)`、`finishAt(endpoint)`、`dispose(reason)`。控制器只修改它拥有的节点和样式；Vue 只管理数据与挂载，不每帧写响应式状态。

Vue 接入伪代码：

```js
async function openEarningsModal(item, event) {
  const source = event?.currentTarget;
  if (!source || motion.phase !== 'idle') return;
  const operation = motion.prepareOpen({ item, sourceElement: source });
  selectedEarningsItem.value = item;
  earningsOverlayMounted.value = true;
  await nextTick();
  if (!motion.isCurrent(operation)) return;
  try {
    motion.attachAndMeasure(overlayRefs);
    motion.startOpen();
  } catch (error) {
    motion.dispose('prepare-failed');
    earningsOverlayMounted.value = false;
    selectedEarningsItem.value = null;
    reportMotionError(error);
  }
}

function closeEarningsModal() {
  motion.requestClose('user');
  // 不在这里卸载 DOM 或清空 selectedEarningsItem。
}

function onMotionClosed() {
  // 只接受当前 generation 的最终关闭通知。
  earningsOverlayMounted.value = false;
  selectedEarningsItem.value = null;
}
```

代码草图中的方法需要 Gemini 实现，不能当作现有项目 API。库的完成回调、取消语义、反向完成语义按固定版本验证。将“到达 open/closed 哪个端点”作为业务判断，避免反向播放触发前进回调时重新置为 open。

### 5.3 必须处理的打断场景

- preparing 时关闭：作废 generation，取消 nextTick 之后的后续工作，恢复所有临时状态。
- opening 时关闭：从当前进度平滑回到源，不跳到完全打开再关闭。可利用时间线反向控制；不能重置到 0 后重新播退出。
- 重复点击/双击：同一轮只创建一个弹层、一个时间线。弹层期间背景 inert，不额外打开第二家公司。
- closing 时再关闭：幂等；不能重复释放滚动锁、恢复错误焦点。
- 从财报跳转个股：统一通过 `dispose` 或可靠结束流程，再执行 `selectSymbol`；保留导航意图，不把焦点强制送回已离开页面。
- 切换页面/卸载：清理所有动画、rAF、监听器、ResizeObserver、临时样式和 inert。不能遗留隐藏的源卡片。
- 周次/筛选变化使源卡片消失：根据稳定 itemKey 查找新元素；没有有效目标时执行短淡出并恢复状态，不飞往屏幕左上角。
- resize、方向变化：打开完毕可重新布局并更新目标；动画中先停止当前写入，再从当前姿态重定向，或安全收敛到已打开状态。不能启动两条时间线争写 transform。
- reduced motion：跳过 3D 和长距离移动，直接进入稳定详情或短淡入；同样具备关闭、滚动恢复和焦点管理。运行时偏好变化也要能安全收敛。

关闭前重新读取原卡片**当前**位置，先确认其仍可见、尺寸有效、处于同一周次。若只是重新查询到屏幕外的卡片，不自动滚动整个页面强迫它出现；安全淡出更合理。

## 6. 保留内容与可访问性

沿用当前详情数据、EPS/营收比较、披露时段、公司 Logo、状态角标、跳转个股功能。此次不要调整财报数值计算、新闻检索、自选分组、热力图、K 线或其它已有模块。

源卡片优先使用 `button type="button"`，补齐 reset 样式，保留当前视觉；支持 Enter/Space，显示焦点环。弹层具有 dialog 语义和可访问名称。

弹层挂载后将焦点放到可聚焦的对话框容器，完成后可移到关闭按钮；Tab 焦点约束在弹层，Escape 可靠关闭。原有 `@keydown.esc` 依赖焦点位于该子树，仅写这条监听并不保证有效。

对背景应用 inert 时注意 overlay 已 Teleport 到 body，不能把自己的对话框一起 inert。可访问性树中只暴露当前有效内容面；背面未可见时的交互控件不可聚焦。关闭后恢复原焦点，源不存在时回到财报日历合理入口。

滚动锁必须覆盖实际主滚动区域并准确还原原值；不要直接清空其他模块拥有的 body 样式。保存并恢复 `.workspace-content` 的 scrollTop。右侧自选与背景不应在弹层期间被滚动到意外位置。

## 7. 验证方式与验收标准

### 7.1 Gemini 先记录旧实现，再验收新实现

在真实页面“新闻 → 科技与 AI 财报周历”进入，分别点击 BMO、AMC 中一张卡片。当前本轮没有浏览器录像，Gemini 必须补齐。

记录：源卡片矩形、最终面板矩形、视口大小、系统动态偏好、服务代码版本、打开/关闭录像，以及 `performance.now()` 对应的时间线进度。通过只在开发环境开启的调试接口暂停/seek 到中间进度，而不是用任意 sleep 截一张可能已经结束的图。

至少保存 0、100、340、460、680、820ms 的打开画面和对应关闭画面。看见实际旋转、放大、展开过程后，才能说视觉缺陷已修复。

### 7.2 核心验收

| 场景 | 通过标准 |
| --- | --- |
| 首帧 | 动画前面与点击时源卡片的位置/尺寸吻合，正常桌面缩放下误差目标 ≤2 CSS px；没有最终详情闪现 |
| 中间帧 | 100–680ms 之间可见多个不同姿态，至少有清楚的 35–75° 斜面；放大和移动未提前瞬间完成 |
| 同一卡片连续性 | 前面保留原 Logo、代码和状态，没有原卡片与代理同时可见，没有内容换成另一家公司 |
| 终点 | 面板稳定可读，正文不镜像、不被拉扁；不超出视口，内部滚动正常 |
| 退出 | 原卡片仍在时回到其当前位置；没有原卡片重影、布局跳动、突然消失 |
| 打断 | 在打开约 25%、50%、75% 时关闭均连续；重复操作后没有悬挂弹层、滚动锁或隐藏卡片 |
| 键盘 | Tab 可达卡片，Enter/Space 打开，Escape 关闭，焦点能回到正确入口 |
| 减少动态效果 | 不播放 3D，功能与清理完整，不等待不会触发的 animationend |
| 回归 | 原筛选、周切换、主题、股票跳转、自选数据、K 线和热力图行为保持 |

几何测试对“未旋转的位置层”计算源/目标映射；不要用侧面投影的 boundingClientRect 推断放大速度或要求宽度单调递增。

### 7.3 测试层次

- 单元：几何映射端点、非等比尺寸、零尺寸拒绝、状态机、取消幂等、generation 失效。
- jsdom：点击后选择正确公司，closing 期间 DOM 保留，完成后卸载，异常/导航恢复状态。现有 `test/workspace-ui.test.js` 明确是 DOM 集成测试，不会证明 3D 或流畅度。
- 真浏览器：中间帧、hover 起点、滚动后点击、顶部/底部/边缘卡片、连续开关至少 10 次、长内容、低高度窗口、横竖屏、reduce。桌面建议覆盖 1440×900 和用户截图接近的宽屏，移动端覆盖约 390×844。
- 性能：在真实页面后台行情/新闻更新仍运行时记录主线程和动画；定位长任务、布局与绘制成本。不要只在空白 demo 上运行就宣称生产 60fps。

基础回归命令（实施后执行）：

```powershell
npm.cmd run check
node --test test/earnings-calendar.test.js test/workspace-ui.test.js test/earnings-card-motion.test.js
```

新增模块必须纳入 check。若本机 Node 再次出现路径 `EPERM: lstat`，可在确认原因后尝试 `node --preserve-symlinks-main --preserve-symlinks --test ...`。不要因为测试加载器暂不认识新 import 就移除相关集成覆盖。

## 8. README 与第三方说明

实际接入后再增加下列说明；本轮只做方案，不提前在 README 声称已采用。

```markdown
### 财报卡片展开动效

卡片以源位置为起点，连续旋转、放大为财报详情，关闭时返回原卡片。

- Card-to-modal 几何过渡参考并改编自 Taha Shashtari 的
  https://github.com/TahaSh/card-to-modal-transition （MIT）。
- 动画时间线使用 Anime.js：
  https://github.com/juliangarnier/anime （MIT，版本见 lockfile）。
- 本项目补充 Vue 生命周期、3D 前后面、中断恢复、滚动锁、
  键盘焦点和 prefers-reduced-motion 支持。
- 第三方版权与许可全文见 THIRD_PARTY_NOTICES.md 及对应许可证文件。
```

保留实际复制版本的版权声明和 MIT 许可全文；在改编代码顶部标注来源、commit 与改动范围。Taha 仓库许可标明 Copyright (c) 2023 Taha Shashtari；Anime.js 的版权年份与文本按实际采用版本原样保留。仅写“感谢某仓库”不替代许可文件要求。不要复制演示中的外部照片或其整站样式。

## 9. 给 Gemini 的执行顺序

1. 检查当前 diff，保护用户已有改动；按本文函数名重新定位，不覆盖整份 app.js/styles.css。
2. 在真实页面记录旧动画，核实 reduced-motion、服务版本及 Computed Styles。
3. 锁定开源来源与动画库版本，完成几何层、3D 层和阶段时间线；先验证单张卡片全过程。
4. 接入两组卡片入口与原详情内容，处理退出/取消/页面切换/尺寸变化/键盘路径。
5. 运行相应测试，提供正常速度录像和中间帧证据，完成 README 与许可说明。
6. 最终报告明确列出修改文件、真实通过的检查、浏览器与视口、已知限制。不要将“代码已写”表述为“视觉已验证”。

可直接给 Gemini 的任务摘要：

> 请按本文实现财报日历卡片的连续 3D 展开。现在点击只是挂载一个以 72% 尺寸起步的独立弹窗，强 ease-out 在约 72ms 内已几乎完成旋转和缩放。请采用源卡片到详情的几何过渡，叠加清楚可见的 Y 轴半圈翻转，完整处理打开、关闭和中断。优先改编 MIT 的 TahaSh/card-to-modal-transition，并使用 Anime.js 统一时间线。保留现有财报内容与其它功能，在 README 和第三方说明中标注实际复用来源。必须提供真浏览器中间帧与关闭回收证据，不接受只拉长现有 CSS duration 的修补。

## 10. 本轮交付和验证边界

- 已检查当前两组卡片入口、打开/关闭函数、详情模板、相关 CSS、静态服务方式与现有测试加载器。
- 已核实推荐仓库、作者演示/文章、MIT/GPL 许可区别和动画引擎文档。
- 已提供可重跑的 CSS 时间分布计算脚本与结果，结果仅说明当前声明的数学行为。
- 未修改业务代码、未接入库、未运行实施后的回归测试、未取得浏览器逐帧证据。
- 本次工作区原本有 `public/app.js`、`public/index.html`、`public/styles.css`、`src/server.js`、`test/workspace-ui.test.js` 修改，以及 crypto-whale 相关未跟踪文件。它们不属于本轮动效方案的实现产物。
- 工作期间还观察到 `public/watchlist-model.js` 出现修改及上述若干文件的外部更新。本轮工具写入范围仅为本文和 `docs/diagnostics/earnings-card-motion-2026-11-04/`；没有回退、覆盖这些并行改动。
