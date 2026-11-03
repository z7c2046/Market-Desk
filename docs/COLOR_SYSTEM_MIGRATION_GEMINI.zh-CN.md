# Market Desk 新增配色移植方案 · Gemini 实施交接

日期：2026-11-03（北京时间）  
项目：`D:\YUXIANZHAO\Code\Market Desk`  
配色来源：`D:\YUXIANZHAO\Code\配色`

后续追加需求：手机端布局与操作重排见 [`MOBILE_WORKSPACE_REDESIGN_GEMINI.zh-CN.md`](MOBILE_WORKSPACE_REDESIGN_GEMINI.zh-CN.md)。本文“不调整布局”的限制仅适用于配色移植本身；合并实施时，手机/紧凑布局按新增方案调整，桌面与既有业务数据继续保留。不要因为本文早先的范围描述跳过用户后来要求的手机重排。

## 1. 已确认的目标与交付边界

用户已明确选择：**保留已经移植的 skeleton 配色，新增一套配色；两套都支持白天和黑夜。**

最终产品应有以下四种组合，配色与显示模式独立选择：

| 配色 ID | 设置中显示名称 | 白天 | 黑夜 |
|---|---|---|---|
| `terminal` | 经典终端 | 现有纯白、浅灰、黑色选中态 | 现有黑曜石、松石绿、珊瑚红 |
| `cobalt` | 蓝灰数据 | 浅灰画布、白卡片、蓝色强调 | 近黑画布、深灰卡片、蓝色强调 |

`Color_System_Visual_Guide.html` 与 `color-system.html` 共同形成 `cobalt` 一套配色，不制造两个几乎相同的菜单选项。没有存储偏好的用户继续使用 `terminal`；不主动替用户切到新配色。

本文是未来实施方案。此次交付仅新增文档、参考 token 文件和核对脚本，**没有把新配色接入运行中的应用**。参考文件位于 `docs/design/color-system-migration/`，没有被 `public/index.html` 引入。

本次不调整页面布局、宽高、字体家族、字号、卡片圆角、排序、时段口径、数据请求、持仓计算、新闻查询或行情服务。现有 K 线与热力图的独立配色偏好继续生效；新闻保留等宽、不同高度的瀑布流。

## 2. 三份 Demo 的分析结论

| 文件 | 源码事实 | 本次角色 |
|---|---|---|
| `market_desk_skeleton_demo.html` | 深色根变量从第 9 行开始；现有 `public/styles.css` 顶部已经引用其颜色体系 | 现有 `terminal` 的回归基线，不覆盖 |
| `Color_System_Visual_Guide.html` | 第 8 行是说明页浅底 `#f4f6f9`；没有深色切换；按基础色、蓝色、红绿和渐变列色卡 | 辅助核对色板及用途，不把说明页皮肤当成完整目标主题 |
| `color-system.html` | 第 9–34 行定义实际浅色/深色变量；第 489–494 行再次给出主题映射；第 577–584 行切换模式 | 新配色的主要依据 |

两处 `market_desk_skeleton_demo.html`（配色目录和项目根目录）的 SHA-256 相同：`4cc2e448f316ff377bab38764a9789b5ce1dd2f9e4b6f73b32bcd04b32ddfc49`。这是文件一致性证据，不等于所有运行组件都已精确复刻 Demo。

### 2.1 必须忠实保留的颜色骨架

| 角色 | 白天原色 | 黑夜原色 | 说明 |
|---|---|---|---|
| 页面画布 | `#e3e3e3` | `#101010` | 新主题的首要识别特征 |
| 卡片背景 | `#ffffff` | `#2d2d2d` | 与画布形成明确层级 |
| 普通主文字 | `#101010` | `#ffffff` | 原 Demo 的 `--text` |
| 强调文字 | `#000000` | `#ffffff` | 原 Demo 的 `--text-strong` |
| 辅助灰原色 | `#787878` | `#afafaf` | 小字号需要再校验，不直接照搬全部用途 |
| 网格/分隔原色 | `#cfcfcf` | `#6c6c6c` | 深色密集网格降低不透明度 |
| 品牌蓝 | `#2976ff` | `#2976ff` | 色板原色；文字与按钮需各自适配 |
| 上涨绿原色 | `#38ab70` | `#38ab70` | 保留色相，不等于所有文字都用这个明度 |
| 下跌红原色 | `#df4f46` | `#df4f46` | 同上 |
| 深海蓝体系 | `#3f67bf / #174789 / #95b6f9 / #a8cef5` | 同一原色组 | 原 Demo 的固定深蓝环形卡和强调元素 |

这不是淡蓝白底主题：新配色白天底色明确是 **`#e3e3e3` 中性浅灰**。不能因为说明页使用 `#f4f6f9`，或已有 HTML 写了 `data-preset="dashboard"`，就把现有和新增主题混成一套。

### 2.2 近似色如何处理

| 原 Demo 颜色 | 方案 |
|---|---|
| `#2976ff`、`#2879ff` | 新主题品牌原色统一 `#2976ff` |
| `#174789`、`#17468a` | 深海蓝统一 `#174789` |
| `#cfcfcf`、`#cecece`、`#cdcdcd` | 对等的灰色分隔用途统一 `#cfcfcf` |
| `#eb587d`、`#ec597f` | 同类粉色渐变终点统一 `#eb587d` |
| `#ffffff`、`#f9f9f9` | 保留，分别做卡片与次级表面 |
| `#000000`、`#101010` | 保留，分别是浅色强调文字与深色画布 |
| `#38ab70`、`#31b869`、`#42b983` | 保留为原色、系列色和渐变色，不当作误差全部合并 |

以上归并只针对新配色，不批量改动旧主题、币种品牌色、K 线方案、均线或热图色阶。

## 3. 当前项目的真实接入位置

以下行号来自此次工作区快照，Gemini 开工时用函数名或选择器重新定位。

| 文件 / 锚点 | 已确认情况 | 实施动作 |
|---|---|---|
| `public/styles.css:8`、`:122` | 现有浅/深色语义 token 已存在 | 保留，新增配色文件通过更具体的根选择器覆盖 |
| `public/index.html:1` | 根节点已有 `data-preset="dashboard"`，以及 Vue 风格 `:data-theme`、`:class` | 不把 `data-preset` 当新开关；根节点改为真实属性，由统一函数写入 |
| `public/index.html:7`、`:8` | 浏览器栏颜色使用两个固定值的 media meta | 改为一个 `id="theme-color"`，同步实际配色和模式 |
| `public/index.html:14`、`:26` | 样式和模块脚本版本为 `2.8.4` | 加入主题启动脚本、配色 CSS，更新相关缓存版本 |
| `public/app.js:211` | 读取 `market-desk-theme`，生成 `isDark` | 原模式兼容；增加独立 `uiPalette` |
| `public/app.js:585` | `themeOverride`、`toggleTheme()`、系统模式回调 | 合并根属性、存储和 meta 更新路径 |
| `public/app.js:4552` | `updateChartTheme()` 直接按 `isDark` 写死图表颜色 | 从已生效 CSS token 读取图表颜色 |
| `public/app.js:4863`、`:5034` | 真正的 K 线由 `renderPrice()` 创建/更新 Lightweight Charts | 仅更新背景、网格、轴字和十字线，保留实例与视区 |
| `public/app.js:5332` | `renderOptions()` 单独写死 Call/Put 蓝紫 | 与 CSS 图例共用新图表 token |
| `public/app.js:5354` | Crypto 图表通过 ECharts 设置背景和系列 | 同步外观，保留 K 线配色及缩放 |
| `public/app.js:5497` | 日夜 watcher 当前调用 `render()` | 改为监听配色与模式，并走外观更新路径 |
| `public/index.html:3461` | 偏好设置已有白天/黑夜卡片 | 在这一区域前新增“界面配色”两张选择卡 |
| `test/workspace-ui.test.js:14` | JSDOM mount 手动移除脚本、替换模块 import，ECharts 是 stub | 增加主题状态测试时同步修改 harness，不当作真实绘图验收 |

当前 `public/composables/useChart.js` 不是这里的活动 K 线渲染入口。`public/flows.js` 是 CSV 解析模块，也不是资金图表外观的修改位置。不要修改这两处来代替修复 `public/app.js` 的实际调用路径。

### 3.1 不是只改根变量就能完成

文本扫描发现 `public/styles.css` 约 13,119 行，包含 1,163 次颜色字面量、422 个不同字面量；`public/index.html` 104 次；`public/app.js` 226 次。**统计包含注释、重复值、预览色卡和有意固定的金融色，不代表这些都是缺陷或必须替换。**

确认需要处理的覆盖点：

| 锚点 | 当前表现来源 | Cobalt 要求 |
|---|---|---|
| `styles.css:6765–6818`，`.tiny-btn`、`.mobile-range-pill` | 日间激活态强制 `#111111 !important` | 新主题使用蓝色选中态 |
| `styles.css:9601–9611`，`.badge-pro` | 顶栏标记有黑白/旧蓝硬编码 | 新主题使用 `accent-soft` 和 `accent-text` |
| `styles.css:9805–9848`，`.rail-nav-item` 及图标子元素 | 父级与子级都设置固定颜色和 `!important` | 同时覆盖父级、图标、文字；保留现有尺寸 |
| `styles.css:10883–10919`，`.rw-grp-pill` | 日间黑底、夜间旧灰色 | 统一新主题分组选择态 |
| `styles.css:9212–9301`，新闻 `.dark` 规则 | 卡片、筛选、搜索、标签各有独立深色规则 | 全部核对，避免灰黑新外壳里残留旧冷蓝卡片 |
| `styles.css:7811`，`.dark .ai-search-options select` | 直接写了 `#20242b / #e5e7eb / #444` | 新主题使用输入框/文字/控件边框 token |
| `styles.css:10456–11238`，右侧自选 | 侧栏、搜索、组头、股票行独立 `.dark` 分支 | 覆盖选中、hover、分隔和文字 |
| `styles.css:11817–12358`，行情看板 | 高亮列、扩展时段、分组、涨跌胶囊独立设置 | 使用语义映射，时段身份不要变成涨跌方向 |
| `styles.css:6666–6688`，图表宿主 | CSS 背景与 Canvas 内背景分别设置 | 新主题两者一致；不能只让外框换色 |
| `styles.css:12397` 起，骨架屏 | 骨架专用 token 已存在 | 换颜色，保留结构、加载条件和动画 |
| `styles.css:12705` 起，Tree 新闻 | 控制台、状态标签、来源侧边条、卡片和空态有独立规则 | 检查与普通新闻不同的这套 DOM；来源身份色保留，正文/表面/警告适配 |

这些是明确的优先锚点，不是全部选择器名单。最终仍需按第 12 节全页验收。

### 3.2 日夜状态存在一个源码层面的同步风险

Vue 实际挂载在 `#app`（`app.js:5658`），`<html>` 位于挂载范围外，因此根节点上的 `:data-theme` 不能被当作有效的 Vue 响应式绑定。当前手动 `toggleTheme()` 会写 `data-theme`，但 `followSystemTheme()` 只改 `isDark`，对应 watcher 只改 `.dark`。从代码可推导出：系统自动切换时，两种主题标识可能不同步。

这是静态分析发现，本次没有浏览器复现。新增配色应顺手消除这个集成风险：**所有主题入口都调用同一个根节点同步函数**。

## 4. 状态模型、存储契约与默认行为

### 4.1 四个偏好保持独立

```text
market-desk-ui-palette     JSON string: "terminal" | "cobalt"  （新增）
market-desk-theme          JSON string: "light" | "dark"     （沿用）
market-desk-kline-scheme   现有 K 线配色 ID                   （沿用）
market-desk-heatmap-scheme 现有热力图配色 ID                  （沿用）
```

HTML 示例：

```html
<html lang="zh-CN" data-script="zh" data-preset="dashboard"
      data-palette="cobalt" data-theme="dark" class="dark">
```

`data-preset="dashboard"` 保持原用途；新增 `data-palette` 才控制这次的两套配色。不要把 `dark-cobalt`、`light-terminal` 存成新的 `market-desk-theme` 值，不要让新增设置误改 K 线、热图的存储键。

### 4.2 读取与选择规则

1. 配色未存、JSON 无效、类型错误或值不在白名单内：使用 `terminal`。
2. 日夜模式沿用现有逻辑：有效的用户选择优先，否则跟随 `prefers-color-scheme`；无 `matchMedia` 时回退白天。
3. 选择 `cobalt` 不意味着用户选择了日夜模式：不能顺带设 `themeOverride=true`。
4. 只有用户明确点白天、黑夜或日夜按钮时，才写模式键并设显式覆盖。
5. 跟随系统的变化只更新内存和 DOM，不能把自动结果写成用户模式偏好。
6. 存储不可写时，本页仍能正常切换，沿用现有存储错误提示；不要阻断界面。
7. 点已经选中的配色/模式是空操作，不触发数据加载或重复图表初始化。
8. 原有全部用户存储保留，不用 `localStorage.clear()`，不重建自选数据。

本轮不新增“跟随系统”的第三个 UI 选项，也不扩展设置同步服务；保留已有的无显式设置时跟随系统的能力即可。

## 5. 新配色 Token 契约

可复制的完整参考表：[`design/color-system-migration/cobalt.tokens.reference.css`](design/color-system-migration/cobalt.tokens.reference.css)。

该附件有两部分：第一部分精确记录现有图表外观，供 `terminal` 兼容；第二部分仅在 `data-palette="cobalt"` 时覆盖新配色。实现时复制为 `public/color-palettes.css`，完成组件接入后才算移植。

配套核对脚本：[`verify-reference.cjs`](design/color-system-migration/verify-reference.cjs)；本次结果：[`verification-results.json`](design/color-system-migration/verification-results.json)。脚本检查引用变量是否存在/循环，以及 102 组指定的文字、按钮、方向图形、控件边界和 soft 背景配对；本次为 **102 组通过，0 组失败**。结果文件保存原 Demo 对比值、解析后的完整 token 和参考 CSS 的 SHA-256。它是文档附件检查器，不是应用测试或完整 CSS 解析器。

重新计算（不修改运行代码）：

```powershell
node --preserve-symlinks-main --preserve-symlinks docs/design/color-system-migration/verify-reference.cjs
```

### 5.1 表面、结构与文字

| Token | Cobalt 白天 | Cobalt 黑夜 | 来源 / 用途 |
|---|---|---|---|
| `--surface-canvas` | `#e3e3e3` | `#101010` | 原 Demo，页面底 |
| `--surface-card` | `#ffffff` | `#2d2d2d` | 原 Demo，主面板 |
| `--surface-raised` | `#f9f9f9` | `#383838` | 浅色来自色板；深色为新增层级 |
| `--surface-hover` | `#eeeeee` | `#404040` | 新增交互表面 |
| `--surface-sunken` | `#e8e8e8` | `#202020` | 浅色轨道原色；深色输入框使用确定的不透明底 |
| `--sidebar-bg` | `#f9f9f9` | `#101010` | 导航/移动抽屉 |
| `--topbar-bg` | `#ffffff` | `#2d2d2d` | 顶栏 |
| `--border-subtle` | `#e8e8e8` | `#444444` | 装饰性分隔，不承担唯一控件识别 |
| `--border-strong` | `#cfcfcf` | `#6c6c6c` | 表格、组头、浮层 |
| `--control-border` | `#787878` | `#878787` | 需要靠边界识别的输入框 |
| `--text-main / primary` | `#101010` | `#ffffff` | 普通内容 |
| `--text-strong` | `#000000` | `#ffffff` | 标题与重要数字 |
| `--text-secondary / muted / tertiary` | `#626262` | `#afafaf` | 来源、时间、次级说明、placeholder |

三个次级文字 token 暂时同值是有意收敛：利用既有字号、位置、字重体现层级，不为 10–12px 小字制造更多更淡的灰。`#787878` 仍保留为 `--cs-sub-light` 原色记录，不能作为白底小字默认色。

深色 Demo 的 `--track: rgba(255,255,255,.10)` 是轨道色，不是万能输入框背景。本方案为输入框定义 `#202020`，避免透明底在不同父容器上产生不确定结果；装饰性进度轨道如有需要可单独定义，不与输入框共用一个角色。

### 5.2 品牌、动作、选择与方向

| Token | 白天 | 黑夜 | 用法 |
|---|---|---|---|
| `--accent-primary` | `#2976ff` | `#2976ff` | 原品牌蓝，色板和部分装饰/图形 |
| `--accent-text` | `#174789` | `#a8cef5` | 链接、文字强调 |
| `--accent-fill` | `#3f67bf` | `#3f67bf` | 主按钮实底 |
| `--accent-ink` | `#ffffff` | `#ffffff` | 实底按钮文字 |
| `--accent-soft` | 蓝原色 10% | 蓝原色 18% | 非实底提示/轻选中背景 |
| `--selection-bg / text` | `#3f67bf / #ffffff` | `#3f67bf / #ffffff` | 导航、分段、分组当前项 |
| `--selection-border` | `#3f67bf` | `#95b6f9` | 深色增加可辨识边界 |
| `--focus-ring` | `#3f67bf` | `#95b6f9` | 键盘聚焦轮廓，不只靠柔光 |
| `--semantic-up` | `#17683f` | `#70d6a0` | DOM 涨幅数字/正向状态文字 |
| `--semantic-down` | `#ad302b` | `#ff9991` | DOM 跌幅数字/错误文字 |
| `--semantic-up-chart` | `#2e9b63` | `#38ab70` | 普通统计系列/方向图形 |
| `--semantic-down-chart` | `#df4f46` | `#df4f46` | 同上 |
| `--semantic-warning` | `#835000` | `#ffbe88` | 警告、延迟、不可用提示 |

`semantic-up/down` 是新主题的金融文字颜色；**K 线 candle、均线、热图彩色块继续使用它们自己的方案**。Call/Put 使用蓝/紫，不按上涨/下跌文字色替换。

新主题的 `--apple-blue`、`--demo-blue` 兼容别名指向可读的 `--accent-text`，而不是一概指向品牌原色。确实需要图形原蓝的位置改用 `--chart-accent` 或 `--cs-blue`，避免一个旧别名同时承担文字和图形的全部工作。

**这要求同时检查别名的消费端。** 当前 `.week-tab-btn.active` 等多个按钮把 `--apple-blue` 当背景并固定白字；在 Cobalt 黑夜下若只改别名，会变成浅蓝底白字。所有这类实底动作在 Cobalt 范围改用 `--accent-fill + --accent-ink`，所有选择态改用 `--selection-bg + --selection-text`。同理，旧规则中同时使用 `background:var(--accent-fill)` 和 `color:var(--accent-text)` 的控件需要改为正确的按钮前景角色。源码锚点包括 `styles.css:368、485、2873、3251、3268、3580、4603、5483、5663、5720、5815、6204、6454`；按当前类名逐项确认，不机械批量替换。纯提示小圆点、拖拽插入线等图形保留图形角色。

### 5.3 阴影、骨架与渐变

主卡片阴影保留 Demo 值：白天 `0 2px 14px rgba(0,0,0,.07)`；黑夜 `0 4px 18px rgba(0,0,0,.45)`。密集表格行不额外加阴影。新配色的环境 wash 默认透明，避免新灰底被旧主题光晕染色。

骨架：白天 `#e8e8e8 / #cfcfcf`，黑夜 `#383838 / #444444`。保留现有骨架 DOM、出现条件、尺寸和减少动态效果的处理。

橙、紫、洋红、粉红渐变完整记录在附件中，但不是要求把全部渐变都放上首页。只给现有且语义合适的装饰性进度条使用；不用于涨跌%、新闻可信度、数据实时性或行情状态。此次不新增假“进度/达成率”业务数据。

深蓝卡片原色同样保留为 `--feature-*`。当前没有合适的同构环形卡时，仅归档 token，不为展示颜色新增一整块业务。若使用 `#3f67bf` 卡片，其正文和小标签用白色；原 `#95b6f9`、`#a8cef5` 更适合环线/图形，不直接当小字。

## 6. 对比度：明确保留什么、调整什么

以下为实色对比度的本地数值计算，不是截图估测，也不是全站无障碍认证。

| 前景 / 背景 | 计算结果 | 判断 |
|---|---:|---|
| 原辅助灰 `#787878` / 白色 | 4.4151:1 | 未达到普通文字 4.5:1 |
| 原辅助灰 `#787878` / 浅灰画布 | 3.4402:1 | 不适合来源、时间等小字 |
| 原蓝 `#2976ff` / 白色 | 4.0938:1 | 小字/蓝按钮白字不能直接照搬 |
| 原蓝 `#2976ff` / 深灰卡片 | 3.3641:1 | 适合部分图形，不能当默认小字 |
| 原绿 `#38ab70` / 白色 | 2.9057:1 | 小字和必要细线都需调整 |
| 原红 `#df4f46` / 白色 | 3.9293:1 | 可作必要图形，普通小字需调整 |
| `#626262` / 浅灰画布 | 4.7529:1 | 新次级文字 |
| 白字 / `#3f67bf` | 5.3794:1 | 新主按钮和实底选中项 |
| `#174789` / 浅灰画布 | 7.1176:1 | 新浅色文字蓝 |
| `#a8cef5` / 深色 hover `#404040` | 6.3257:1 | 新深色文字蓝 |
| `#17683f` / 浅灰画布 | 5.2983:1 | 新浅色上涨文字 |
| `#70d6a0` / 深色 hover | 5.8335:1 | 新深色上涨文字 |
| `#ff9991` / 深色 hover | 5.0446:1 | 新深色下跌文字 |
| `#a8cef5` / 蓝色 soft 叠加深色 hover | 5.4726:1 | 透明叠加后的文字蓝 |
| `#70d6a0` / 上涨 soft 叠加深色 hover | 4.8850:1 | 透明叠加后的上涨文字 |
| `#95b6f9` / 深海蓝卡片 | 2.6480:1 | 原深蓝卡标题色不用于小字 |

验收口径：普通文本至少 4.5:1，大号文本至少 3:1，按实际 CSS 字号判断。来源：[W3C 文字对比度说明](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。必要控件识别、聚焦/选中状态和有意义图形至少 3:1，相邻颜色都要考虑；装饰分隔线不套用同一要求。来源：[W3C 非文字对比度说明](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)。

透明 soft 背景要先与真实父背景合成再计算。不能把上述实色配对的结果写成“所有状态已通过”。附件核对脚本覆盖一组明确的 token 配对；最终 CSS 级联、透明背景、禁用态和截图仍需浏览器验证。

## 7. 建议修改文件与组织方式

| 文件 | 动作 | 原因 |
|---|---|---|
| `public/color-palettes.css` | 新增 | 完整配色 token、图表兼容 token、新主题组件覆盖 |
| `public/theme-bootstrap.js` | 新增，普通同步脚本 | 在第一帧前恢复配色、模式和 meta |
| `public/theme-model.js` | 新增轻量 ES module | 偏好值校验、DOM 同步、图表颜色读取等纯逻辑/边界逻辑 |
| `public/index.html` | 精确修改 | 加载顺序、真实根属性、设置选项和必要内联色 |
| `public/app.js` | 精确修改 | 配色状态、选择函数、watcher、Canvas 主题更新 |
| `public/styles.css` | 尽量不改；遇内联/高优先级等再精确处理 | 避免破坏 Terminal；不进行全文件格式化 |
| `test/theme-model.test.js` | 新增 | 归一化、存储异常、DOM 标识、主题颜色契约 |
| `test/workspace-ui.test.js` | 补充 | 真实设置按钮行为、旧偏好保留、图表更新调用 |

不安装新框架、不引入 Tailwind、不重写现有 Vue 应用、不添加第二个全局 store。

## 8. 首屏恢复与运行时切换的具体要求

### 8.1 HTML 加载顺序

```html
<meta name="theme-color" id="theme-color" content="#ffffff">
<script src="/theme-bootstrap.js?v=新的统一版本"></script>
<link rel="stylesheet" href="/styles.css?v=新的统一版本">
<link rel="stylesheet" href="/color-palettes.css?v=新的统一版本">
<!-- 保持原 Vue/ECharts/Lightweight Charts 和 app.js 的正确执行依赖 -->
```

启动脚本不能 `defer`、`async` 或改成等待模块 import 后才执行。脚本小且只做本地偏好读取与根属性更新，不发 API、不初始化 Vue、不创建图表。保留 v-cloak 机制。

启动读取使用现有 JSON 格式；`localStorage` 访问、`JSON.parse`、`matchMedia` 都处理异常。核心伪代码：

```js
const palette = normalizePalette(readJson('market-desk-ui-palette', null));
const savedMode = normalizeExplicitMode(readJson('market-desk-theme', null));
const mode = savedMode || (safeSystemDark() ? 'dark' : 'light');
applyRootAttributes({ palette, mode });
```

同步写入 `data-palette`、`data-theme`、`.dark`、`style.colorScheme` 和唯一的 theme-color meta。首屏 meta 色按外壳顶栏：Terminal 白天 `#ffffff`、黑夜 `#111316`；Cobalt 白天 `#ffffff`、黑夜 `#2d2d2d`。这四个首屏常量是为 CSS 尚未加载而设的明确例外，测试必须检查它们和 token 一致。

`theme-bootstrap.js` 与模块校验规则必须相同。可以只在 bootstrap 中重复非常短的白名单校验，随后通过测试保证行为一致；不要为了共享几行逻辑引入阻塞网络依赖。应用初始化时重新读有效值，保证脚本未执行的测试场景也有回退。

### 8.2 Vue 中增加的最小接口

```js
const uiPalette = ref(normalizePalette(readStorage('market-desk-ui-palette', null)));
const uiPaletteOptions = [
  { id: 'terminal', label: '经典终端' },
  { id: 'cobalt', label: '蓝灰数据' },
];

function setUiPalette(value) {
  const next = normalizePalette(value);
  if (next === uiPalette.value) return;
  uiPalette.value = next;
  persist('market-desk-ui-palette', next);
}
```

上面是接口示例，不是完整补丁。`uiPalette`、选项和 setter 要出现在 setup 的 return 中。白天/黑夜选项建议共用幂等 `setThemeMode('light'|'dark')`，顶栏 `toggleTheme()` 调用它，避免多条路径各自写 DOM。

初始化调用一次同步函数；随后统一监听 `[uiPalette, isDark]`。每次更新执行顺序：

1. 写真实根属性和 `.dark`，确保它们一致。
2. 更新 `color-scheme`，保证原生下拉菜单/滚动条跟随。
3. `await nextTick()` 后读取新 CSS；根据实际 token 更新浏览器 meta。
4. 只更新已经存在的图表外观；未来创建的图表读取当前 token。

watcher 不重复持久化；显式选择时由 setter 持久化。系统回调只设置 `isDark`。删除/合并旧 `watch(isDark, ...)`，不留下两条互相触发的外观更新链。

切换配色不得调用 `loadOverview()`、`loadChart()`、`loadCrypto()`、`loadOptions()`、`loadNews()`、`fetchWatchlistQuotes()`，不得断开 SSE 或重启轮询。

### 8.3 过渡与减少动态效果

沿用现有短过渡；只针对背景、边框、文字，建议 120–180ms，不能给所有元素套 `transition: all`。Canvas 更新即时执行。首屏恢复不播放过渡；减少动态效果时禁用新增过渡。测试截图需等过渡结束后读取最终色值。

## 9. CSS 迁移方式与组件逐项映射

### 9.1 隔离原则

新 token 用 `:root[data-palette="cobalt"]` 和 `:root[data-palette="cobalt"][data-theme="dark"]`。新组件覆盖用 `:root[data-palette="cobalt"] .组件`。放在原样式之后加载。

不要仅在文件末尾增加一个无条件 `:root { --accent-primary: #2976ff }`。那会污染 Terminal。也不要只靠加载顺序：旧规则有 `!important`、`:root:not(.dark)` 和子元素颜色，需要匹配实际优先级。

例如旧导航选择规则带 `!important`，新主题可在**限定范围内**保留对应强制声明：

```css
:root[data-palette="cobalt"] .rail-nav-item.active {
  background: var(--selection-bg) !important;
  border-color: var(--selection-border) !important;
  color: var(--selection-text) !important;
  box-shadow: none !important;
}
:root[data-palette="cobalt"] .rail-nav-item.active .rail-text,
:root[data-palette="cobalt"] .rail-nav-item.active .rail-icon {
  color: var(--selection-text) !important;
  fill: var(--selection-text) !important;
  stroke: var(--selection-text) !important;
}
```

该例只处理导航 active，不能当成全部完成。`.tiny-btn.selected`、`.tiny-btn.active`、`.mobile-range-pill.active`、`.rw-grp-pill.active` 都需覆盖对应状态。避免用 `:where()` 把需要压过旧规则的特异性意外归零。

### 9.2 组件目标表

| 区域 | 背景 / 边界 | 字色 / 状态 | 验收重点 |
|---|---|---|---|
| body、主工作区 | canvas | main | 白天灰底而不是白底；暗夜近黑 |
| `.nav-rail`、移动 `.sidebar` | sidebar-bg；subtle 边界 | secondary，active 使用 selection | 旧 CSS 的 canvas 背景要改为新导航角色 |
| 顶栏、右侧自选外壳 | topbar-bg / card | main / secondary | 浏览器栏颜色和实际顶栏一致 |
| 普通 panel、KPI、新闻卡 | card | main | 不把所有卡片都刷成 raised |
| 组头、表头、次级区 | raised；strong 分隔 | secondary/strong | 分组清楚，不新增阴影叠层 |
| 搜索、下拉、文本框 | sunken；control-border | main；placeholder secondary | 正常、hover、focus、禁用 |
| 主按钮 | accent-fill | accent-ink | hover 用 action-hover-bg；聚焦有 focus-ring |
| 导航、时间范围、分组已选项 | selection-bg/border | selection-text | 实底蓝、白字；不残留日间黑底 |
| 普通按钮、未选标签 | raised 或透明 | secondary；hover main | 与旧几何一致 |
| 自选/看板股票行 | card；hover surface-hover | 名称 main，时间 secondary | 不整行染红绿；涨跌数值使用 semantic |
| 财报日历、宏观事件 | card/raised | 时间 secondary，今天标记 accent | 保留当前周、筛选、展开状态 |
| 新闻来源/时间/筛选 | card/raised | secondary；操作 accent-text | 保留图片、原链接和瀑布流尺寸 |
| AI 搜索结果、provider 状态 | card；提示 soft | main / secondary / warning | 失败、部分成功、无结果仍可区分 |
| modal、下拉菜单、toast | card；strong 边界；float 阴影 | main | 遮罩 overlay-scrim；无旧暗蓝块 |
| skeleton | skeleton-base/high | 不承载文本 | 不改变加载行为和原动画 |
| 表格空值、无数据、旧快照 | 原容器 | secondary 或 warning | 空值绝不显示为上涨/下跌 |

DOM 中行内 `style="color:#..."`、`:style` 对象和 SVG 的 `fill`/`stroke` 要按用途检查：普通 UI 色改为 token；K 线预览、热图预览、币种 Logo 的固定身份色保留。每个保留项在交付里说明理由，不以“全仓库无 HEX”作为成功标准。

正文使用新主题 `#afafaf` 时，避免再套 `opacity:.5`；那会破坏配对的对比度。方向徽章的 transparent soft 背景必须计算叠加后的结果。

## 10. Canvas / SVG 图表必须一起迁移

### 10.1 统一读取真实 token

`updateChartTheme()` 改为读取 `getComputedStyle(document.documentElement)`。同一次外观变更只读取一份快照，不在每条数据、每个点、每次 formatter 中重复读取。

```js
// Interface example: fallback must depend on the validated palette + mode.
function readChartTheme(root, fallback) {
  const css = getComputedStyle(root);
  const value = (name, fallbackValue) => {
    const raw = css.getPropertyValue(name).trim();
    return raw && !raw.includes('var(') ? raw : fallbackValue;
  };
  return {
    surface: value('--chart-surface', fallback.surface),
    text: value('--chart-text', fallback.text),
    muted: value('--chart-muted', fallback.muted),
    grid: value('--chart-grid', fallback.grid),
    up: value('--chart-up', fallback.up),
    down: value('--chart-down', fallback.down),
    accent: value('--chart-accent', fallback.accent),
    tooltipBg: value('--chart-tooltip-bg', fallback.tooltipBg),
    tooltipBorder: value('--chart-tooltip-border', fallback.tooltipBorder),
    klineSurface: value('--chart-kline-surface', fallback.klineSurface),
    klineGrid: value('--chart-kline-grid', fallback.klineGrid),
    crosshair: value('--chart-kline-crosshair', fallback.crosshair),
    call: value('--chart-call', fallback.call),
    put: value('--chart-put', fallback.put),
  };
}
```

ECharts/Lightweight Charts 需要实际颜色字符串，不能把 `var(--chart-text)` 原样交给 Canvas。`rgb()`、`rgba()`、十六进制都应接受；不要错误地仅接受 6 位 HEX。fallback 不可无条件退回 Terminal，否则测试或 CSS 加载失败会掩盖 Cobalt 未生效。

### 10.2 各图表的改动边界

| 路径 | 要改 | 保留 |
|---|---|---|
| `updateChartTheme()` | muted、gridColor、chartText、chartSurface、green/red/blue、axis、tooltip 使用快照 | 轴格式化、单位、数据字段 |
| `renderPrice()` | chartBg、gridColorValue、textThemeColor、crosshair 使用快照 | 当前 KLINE_SCHEMES、成交量 alpha、MA/DEMA 颜色、指标开关、手势 |
| Lightweight Charts `applyOptions` | 新建与已有实例都更新 crosshair；不能只在 createChart 配一次 | 同一实例、时间/价格可见区、autoScale 用户状态 |
| K 线的 ECharts fallback | 对应背景/网格/轴字/tooltip 也接入 | fallback 业务数据、缩放逻辑 |
| `renderCryptoChart()` | K 线表面/网格、图例/tooltip、无数据标题 | Kline scheme、coin、timeframe、dataZoom |
| `renderRotation()` / `renderFlows()` | 普通统计系列使用 chart-up/down；阴影由当前色导出 | 数据、排序、单位、点击股票事件 |
| `renderOptions()` | Call=chart-call、Put=chart-put；图例/蝶形条与图表一致 | OI/GEX 值、符号和范围 |
| `renderHeatmap()` | tooltip、外围说明/控件和图例文字跟随 | HEATMAP_SCHEMES、颜色分段、色块含义、布局、分组、钻取 |

热图 `getHeatmapBracketStyle()` 的色阶和对应标签色不纳入全局替换，也不强制跟随 `semantic-up/down`。这里已有对比度或中性色问题如需另修，应单独记录，不能顺手改掉用户原有热图方案。

现有 Terminal 的 K 线 Canvas 深色背景实际是 `#000000`，外层 panel 是 `#15181c`。参考 CSS 为两者分别保留 token。**不能统一成一个背景而改变 Terminal 原样。** Cobalt 则统一使用卡片 `#ffffff / #2d2d2d`。

### 10.3 更新主题不丢图表状态

当前 `makeChart()` 使用 `setOption(config, true)`（`app.js:4545`）。如果主题切换仍走完整 render，可能重建 ECharts option 和交互状态。新增主题需要明确规避这条风险：

1. 建立 `applyChartAppearance()` 外观专用路径，复用现有实例。
2. Lightweight Charts 仅 `applyOptions()`，不 `disposePriceChart()`、不重新 `setData()`、不 `fitContent()`、不调用手势 reset/focusLatest。
3. ECharts 对外观做合并 patch，使用系列稳定 `id` 或已确认的 `name` 定位。patch 不包含数据、初始 `dataZoom`、默认 `legend.selected`。确保覆盖直接写在单点 `itemStyle` 上的普通统计颜色。
4. 如果必须完整重渲染某张 ECharts，先记录实际 `getOption()` 中的 dataZoom、legend selection 和该图特有状态，再按对应组件恢复；不能只恢复第一条横轴缩放。热图尤其不可无条件 reset。
5. 隐藏页面不新建图表。再次进入该页时，正常渲染读取当前主题。
6. 阻止同一变更执行重复的旧 watcher render 和新 applyChartAppearance；允许同一 tick 的变更合并为一次更新。

是否保留了时间范围、价格轴和 treemap 浏览状态需要真实浏览器操作验证，JSDOM 的 `setOption` stub 无法证明。

## 11. 设置界面的具体设计

在当前“白天 / 黑夜外观模式”前面新增“界面配色”。采用两张现有风格的选择卡：

- **经典终端**：说明“纯白与黑曜石，沿用当前外观”。
- **蓝灰数据**：说明“中性灰底与蓝色强调，来自配色演示”。

每张卡同时展示浅色、深色两行小色条，让用户知道日夜兼容。色条是主题预览的固定颜色，不能继承当前主题导致两张卡看起来一样。可以使用专用预览类/局部变量，不改变 `data-palette` 全局状态来绘制缩略图。

每行只需要画布、卡片、主色三个样本。Terminal 预览采用当前浅/深色原值，Cobalt 采用本方案原值。使用真实 `button type="button"`、可见文本和 `aria-pressed`；分组容器有明确 accessible label。键盘 Tab 可访问、Enter/Space 可选择。

保留下一块白天/黑夜设置。文案改成配色无关的“适合明亮环境 / 适合较暗环境”，去掉新配色下失真的“纯白背景 / 纯黑背景 / 图一底色规范”。顶栏日夜按钮继续只切模式，不能轮换整套配色。

切换立刻生效，不增加“保存”弹窗。保留设置弹窗打开状态、滚动位置和焦点；不重新挂载 `#app`。移动端复用同一偏好入口，两张卡窄屏纵排，无横向滚动。

## 12. Gemini 的实施顺序与验收清单

### 阶段 A：冻结当前行为，建立两套配色框架

1. 读取当前 `git diff`；核对有没有本方案之后的新改动。
2. 把当前 Terminal 的四类颜色证据保存：DOM computed style、ECharts options、Lightweight Charts options、关键截图。不能只保存 CSS 变量值。
3. 新增 token 文件、bootstrap 和主题小模块；加入 `uiPalette`；新增设置卡。
4. 验证刷新恢复、非法偏好回退、系统自动变化和手动覆盖。
5. 确认 Terminal 白天/黑夜外观和存储保持原行为。

### 阶段 B：按区域覆盖旧硬编码

顺序：外壳与导航 → 输入和按钮 → 自选/行情 → 财报/宏观 → 新闻/AI → 弹窗/移动 → 骨架。

每一块都完成正常、hover、active、focus、disabled、loading、empty/error 的用色；颜色是按角色映射，不能全局将 `#111111` 替换为蓝色。

### 阶段 C：同步图表外观

按第 10 节更新所有活动渲染路径。先检查当前价图（Lightweight Charts），再检查 Crypto、资金、期权，最后核对热图外围。保留独立金融色板与视图状态。

### 阶段 D：测试与真实浏览器验收

| 测试层 | 必测内容 | 不足以证明的内容 |
|---|---|---|
| 纯逻辑测试 | whitelist、JSON 异常、storage 不可用、系统/手动优先级、根属性一致 | 实际 CSS 和 Canvas 颜色 |
| JSDOM 集成 | 设置卡点击、4 组合持久化、旧图表偏好不变、主题切换不发业务请求 | hover/focus 视觉、真实缩放保持 |
| CSS/颜色核对 | 新主题精确 token、组件 computed style、对比度 | 图表内像素和交互 |
| 浏览器操作 | 实际图表、滚动/焦点、移动弹窗、刷新首帧 | 全部线上提供商数据质量 |

主题集成测试至少包含：

1. 只保存旧 `market-desk-theme='dark'`，无新键：Terminal 黑夜。
2. 四种合法组合刷新后保持。
3. 新键存为无效 JSON、数组、对象、未知字符串：Terminal 回退，不崩溃。
4. 无显式模式时系统日夜切换：`isDark`、`.dark`、`data-theme`、meta 同步。
5. 仅切配色后仍跟随系统；手动选模式后不再被系统事件覆盖。
6. localStorage 读/写抛错：界面依然可用，写错提示保留。
7. 选择新主题不改变 Kline/heatmap scheme、MA/grid、当前页、symbol、timeframe、分组/收藏/排序/新闻查询。
8. ECharts 更新获得新色值，切换不增加 init/dispose 调用；不重新请求业务 API。
9. Lightweight Charts 现有实例 crosshair 也改变；不用重新创建实例。
10. 从 Cobalt 切回 Terminal 后，与改动前的各个实际颜色和状态一致。

修改 test harness 时注意：现有测试手工去掉 `<script>` 并通过字符串替换加载 `app.js`，新增 import 必须正确接入；bootstrap 单独执行测试。JSDOM 不完整支持真实 CSS 级联和绘图，应注入明确的 computed-token fixture 测调用契约，再在浏览器核验真实 CSS。不要让测试只检测“源码里出现了 cobalt”。

建议命令（实施后执行）：

```powershell
npm.cmd run check
node --preserve-symlinks-main --preserve-symlinks --check public/theme-bootstrap.js
node --preserve-symlinks-main --preserve-symlinks --check public/theme-model.js
node --preserve-symlinks-main --preserve-symlinks --test test/theme-model.test.js test/workspace-ui.test.js test/kline-geometry.test.js test/earnings-calendar.test.js
```

主题两个新文件还应加入 `package.json` 的 check 脚本。如正常 Node 能运行可省略 preserve-symlinks flags；它们是此工作区曾出现路径 `EPERM` 时的兼容方式，不是修改依赖的理由。需要 HTTP 启动验收时用项目现有 `npm.cmd start`，先检查端口，保留正在运行的用户进程。

#### 浏览器覆盖矩阵

| 维度 | 覆盖要求 |
|---|---|
| 配色 × 模式 | Terminal Light / Dark、Cobalt Light / Dark |
| 主页面 | 市场全景、行情看板、K 线、Crypto、资金、期权、新闻、财报/宏观日历、数据说明 |
| 浮层 | 偏好设置、自选新增/分组、新闻 AI 搜索、任一详情 modal、下拉菜单、toast |
| 视口 | 1440×900；390×844；补查 768px 导航切换边界 |
| 数据状态 | 有数据、加载骨架、空结果、请求失败、部分数据、旧快照 |
| 交互态 | hover、选中、键盘 focus、禁用 |

优先完整截图：两套配色 × 两个模式 × 桌面全景，以及两套配色 × 两个模式 × 移动设置。其余页用相同固定 fixture 和视口记录差异，避免行情数字变化造成误判。

图表专项：先平移时间轴、缩放横轴、拖动价格轴、切 MA、调整 Crypto 的两个 dataZoom、期权滑块和图例，再切换配色/日夜；操作状态应保持。热图既有色板、切换股票、缩放、重置行为保持。保存前后状态证据，而不只截图一个静态图。

验收不能只问“看起来是否蓝了”。至少检查：新浅色画布是否 `#e3e3e3`、新深色卡片是否 `#2d2d2d`、日间导航是否已经蓝底、来源时间是否清楚、Canvas 是否同步、新旧偏好是否独立、切回 Terminal 是否还原。

## 13. 现有改动的保护与本次验证边界

审计开始时工作区已有以下未提交修改：

```text
public/app.js
public/earnings-calendar-model.js
public/index.html
public/styles.css
test/earnings-calendar.test.js
test/workspace-ui.test.js
```

这些是用户已有工作。Gemini 不得 reset/checkout 覆盖；实现时在当前内容上增量修改，不按本文行号机械覆盖旧版本，不重构财报逻辑，不把无关变更纳入主题改造。

交付前哈希复核还发现 `public/app.js`、`public/styles.css`、`public/index.html` 在本次审计期间有并行更新。重新读取确认：K 线方案已将原 `obsidian` 条目换为 `deepbluepurple`，相关预览和样式也已更新；主题初始化、`updateChartTheme()`、`renderPrice()`、`renderOptions()`、`renderCryptoChart()` 和日夜 watcher 的关键入口仍与本文一致。**以实施时实际的 KLINE_SCHEMES 为准，不把新方案退回旧列表。** 文中颜色数量和部分 CSS 行号是开始审计时的快照；函数名、选择器和职责才是定位依据。此次交付没有修改这些运行文件。

本次已完成：三份 Demo 源码核对、当前主题/图表/设置/测试入口核对、两份 skeleton 文件哈希对照、颜色字面量统计、指定实色和透明 soft 背景配对计算、可复制 token 附件与移植方案。

本次未完成：应用配色实施、真实浏览器视觉验证、图表状态回归、线上部署。浏览器工具返回访问 host 不可用，原生 UI 通道也不可用；因此本文不声称已经看过实际四种组合或截图。原应用测试没有因本次仅文档交付而重复执行，实施后的测试命令列于上节。

## 14. 可直接交给 Gemini 的执行指令

> 请按 `docs/COLOR_SYSTEM_MIGRATION_GEMINI.zh-CN.md` 完成配色移植。保留现有 `terminal` 配色，新增 `cobalt`“蓝灰数据”，两套均支持独立日夜切换。颜色以 `配色/color-system.html` 为主要依据，`Color_System_Visual_Guide.html` 辅助核对；使用 `docs/design/color-system-migration/cobalt.tokens.reference.css` 的原色、适配值和语义映射。该附件尚未接入应用，请完成实际 CSS、首屏恢复、设置卡和 Canvas 图表接入。
>
> 先读当前 git diff，保留已有财报等改动。界面配色只新增 `market-desk-ui-palette`，沿用日夜存储格式，不覆盖 K 线/热图色板和任何用户数据。不要只改 `:root`：完成正文列出的硬编码覆盖点，统一根节点主题同步，处理 ECharts 和 Lightweight Charts。主题切换不重新请求数据、不重建图表、不重置视区和筛选。
>
> 按文档顺序实现与验证，补充必要的状态/集成测试，运行相关语法和回归检查；完成四种组合的桌面/移动真实浏览器验收与图表状态保持检查。交付说明列出修改文件、实际测试结果、截图和仍未验证部分。不要仅凭 JSDOM 或 token 表宣称视觉验收通过。此次不需要提交、推送或部署。
