# Market Desk · 美股、宏观与链上巨鲸量化观察工作台

> **Market Desk** 是一套面向专业美股交易者、宏观研究员与链上量化交易员设计的高性能轻量级全端金融研究工作台（支持桌面终端大屏与移动端自适应布局）。  
> 系统零打包构建、冷启动即用，深度融合**美股多时段实时行情**、**CBOE 波动率联动矩阵**、**TradingView 级自研 60fps 惯性手势 K 线引擎**、**Hyperliquid & HIP-3（TradFi 链上美股）巨鲸资金流向桑基图与 Bybit 同款 K 线复合精确定位标点**、**CBOE 期权 Gamma 持仓蝴蝶墙**、**Tree News 毫秒级突发快讯**以及 **AI 多源财经检索与 Nasdaq 财报日历**。

---

## 目录

- [1. 核心技术架构与设计理念](#1-核心技术架构与设计理念)
- [2. 快速安装与启动](#2-快速安装与启动)
- [3. 八大核心功能模块详解](#3-八大核心功能模块详解)
  - [3.1 市场总览、宏观矩阵与波动率双卡](#31-市场总览宏观矩阵与波动率双卡)
  - [3.2 专业 K 线主屏与自研手势交互引擎](#32-专业-k-线主屏与自研手势交互引擎)
  - [3.3 链上巨鲸与 TradFi 资金流工作区（桑基图 · Bybit 复合精确定位标点）](#33-链上巨鲸与-tradfi-资金流工作区桑基图--bybit-复合精确定位标点)
  - [3.4 多时段自选看板与混合数据源](#34-多时段自选看板与混合数据源)
  - [3.5 美股核心板块热力图](#35-美股核心板块热力图)
  - [3.6 期权 Gamma 持仓分布与蝴蝶 OI 墙](#36-期权-gamma-持仓分布与蝴蝶-oi-墙)
  - [3.7 实时突发快讯、AI 智能财经搜索与财报日历](#37-实时突发快讯ai-智能财经搜索与财报日历)
  - [3.8 视觉主题、多配色系统与移动端专版](#38-视觉主题多配色系统与移动端专版)
- [4. 项目目录与核心文件说明](#4-项目目录与核心文件说明)
- [5. HTTP & SSE API 接口清单](#5-http--sse-api-接口清单)
- [6. 环境变量配置指南（.env）](#6-环境变量配置指南env)
- [7. 快捷键与高效交互指南](#7-快捷键与高效交互指南)
- [8. 自动化测试与工程质量验证](#8-自动化测试与工程质量验证)
- [9. 许可与第三方声明](#9-许可与第三方声明)

---

## 1. 核心技术架构与设计理念

| 维度 | 选型与实现 |
| :--- | :--- |
| **后端运行时** | 原生 **Node.js ESM** (`http` + `fs/promises` + SSE 长连接 + `ws` 客户端逻辑)，无 Express/Fastify 等重框架依赖 |
| **前端框架** | **Vue 3** (`3.5.44`, 渐进式免打包 ESM) + 模块化 Composable 状态/数学模型层 (`public/composables/`) |
| **图表引擎** | **TradingView Lightweight Charts** (`^5.2.1`) 驱动 K 线交互 + **Apache ECharts** (`6.1.0`) 驱动矩阵/辅助图表 + 自研 SVG 桑基图/期权蝴蝶图/测距尺交互层 |
| **行情连接层** | 支持 **Longbridge (长桥 OpenAPI)**、**Interactive Brokers (IBKR Gateway)**、**Hyperliquid Info API**、**CBOE 期权链**、**Nasdaq 日历** 与公共备用源自动切换及多级超时保护 |
| **工程规范** | `npm run check`（39 个核心前后端脚本静态检查）+ Node Test Runner + JSDOM 全链路端到端 UI 自动化测试（261 项） |

### 核心设计原则
1. **高信噪比与真实口径**：缺失字段显示 `--` / `—`，不使用伪造默认值冒充真实数据；常规涨跌幅、盘前/盘后/隔夜（`EXT%`）以及链上合约相对正股溢折价严格按独立时间基准核算。
2. **真·零延迟跟手图表交互**：自研独立的价格轴/时间轴惯性动量引擎，价格轴缩放自动防闪烁锁定，悬浮标点 60fps 随视口实时追踪且不强制吸附边缘。
3. **优雅降级与骨架屏体验**：所有异步模块配备对应结构骨架屏与局部错误隔离提示，外部节点离线时自动安全回落并在界面清晰标识。

---

## 2. 快速安装与启动

### 环境要求
- **Node.js**：推荐 **v22.0.0** 或以上版本（项目使用原生 ES Modules 与内置 `node --test` 运行器）。
- **操作系统**：支持 Windows / macOS / Linux。

### 启动步骤

```bash
# 1. 克隆仓库并进入工作目录
git clone https://github.com/z7c2046/Market-Desk.git
cd Market-Desk

# 2. 安装项目依赖
npm install

# 3. 复制环境变量模板（可选：如暂不接入 IBKR / Longbridge / Notion / AI Search 可跳过）
cp .env.example .env

# 4. 启动生产模式服务（默认监听 http://127.0.0.1:5174）
npm start

# 或启动开发文件监听热重载模式
npm run dev
```

启动完成后，直接在浏览器打开 **`http://localhost:5174`** 即可进入工作台。

---

## 3. 八大核心功能模块详解

### 3.1 市场总览、宏观矩阵与波动率双卡
- **大盘与宏观资产全景**：实时追踪标普 500（`SPY`）、纳斯达克 100（`QQQ`）、道指（`DIA`）、罗素 2000（`IWM`）、美元兑离岸人民币及现货黄金（含自动换算 `¥/克`）。
- **美债收益率曲线与利差监控**：涵盖 2Y / 10Y / 20Y / 30Y 期限，自动核算 `10Y-2Y` 与 `30Y-10Y` 利差并提示曲线倒挂状态。
- **CBOE 波动率双卡矩阵（VIX vs VXN）**：
  - 首屏并排对比标普 500 恐慌指数（`VIX`）与纳指 100 波动率（`VXN`），搭配拟态呼吸光晕（Glow Mask）指示多空波幅方向。
  - 点击卡片呼出**波动率全景分析弹窗**，呈现历史利差比值、期限结构诊断与风险提示。
- **CNN 恐慌与贪婪指数**：展示实时综合分值与市场动能、避险需求、垃圾债利差、期权偏度等底层驱动因子。

### 3.2 专业 K 线主屏与自研手势交互引擎
位于 `#chart`（「个股行情」），复刻桌面专业金融终端图表体验：
- **多周期与独立时间范围解耦**：
  - 支持 **15 分钟（`15m`）**、**1 小时（`1h`）**、**4 小时（`4h`）** 与 **日 K 线（`1d`）** 独立切换；时间范围可选 `15分(1d)`、`1月`、`3月`、`6月`、`1年`、`2年`。
  - **4 小时精准重采样引擎**：严格对齐美股正规交易时段（早盘 `09:30–13:30` 与午盘 `13:30–16:00`），避免隔夜盘外碎片截断破坏 4H K 线结构。
- **TradingView 风格垂直绘图工具栏 & 测距尺（`📐`）**：
  - 支持点击两点或按住 **`Shift` + 鼠标拖拽** 直接拉出双向测量框（区分上涨/下跌配色、虚线箭头与统计卡片）。
  - 实时统计**涨跌百分比（±%）**、**价格绝对差额（±$）**、**涵盖 K 线根数**与**时间跨度**，缩放平移视图时锚点 100% 吸附 K 线坐标。
- **拐点猎手算法（Inflection Hunter R1）与均线矩阵**：
  - 图例栏支持一键开关 `MA5`、`MA20`、`MA60`、`MA120`、`MA250` 与 `成交量（VOL）`。
  - 一键启用 `⚡ 拐点 (EB/B/ES/S)`，基于 DEMA14 快线与 DEMA30 慢线计算多空拐点评分并在 K 线标注极佳买点（`EB`）、买点（`B`）、极佳卖点（`ES`）与卖点（`S`）。
- **自研 60fps 惯性手势控制器（`klineGesture` + `klinePriceMotion` + `klineViewportMotion`）**：
  - 区分鼠标悬停区域智能分发滚轮事件：主图区横向缩放/惯性平移，右侧价格轴纵坐标独立缩放且自动禁用高频重绘引起的画布闪烁，双击画布或点 `⟲ 复位` 自动复位视角。
- **全屏巨鲸时空分析工作台（`🐋 巨鲸点位`）**：
  - 点击顶部图例栏 `🐋 巨鲸点位` 开关（或由 `#crypto` 迷你抽屉点击 `⤢ 大屏分析` 跳转），主屏自动进入 **`4小时 · 1个月`** 预设（后续仍可自由手动切换任意周期），右侧展开 **`340px` 可折叠巨鲸持仓洞察侧栏**。
  - **Crypto + TradFi 全市场打通**：统一映射链上美股别名（如 `SP500 -> SPY`、`XYZ100 -> QQQ`、`GOLD -> GC=F`）与加密永续交易对（`BTC-USD` / `ETH-USD` / `SOL-USD` / `ZEC-USD` / `HYPE-USD` 等，后端 `chart()` 为 `-USD` 自动提供 Hyperliquid `candleSnapshot` 4H 兜底）。
  - **单鲸聚焦、垂直开仓时间线与精准 `PriceLine`**：未锁定具体席位时绘制多/空加权均价参考线；点击侧栏卡片或图表买卖点可聚焦该席位，弱化其余标记、显示开仓均价与预估强平价格线，并在画布拉出**垂直开仓时间虚线及持仓时长胶囊**；点击空白区域或按 `Esc` 关闭 HUD 浮窗。

### 3.3 链上巨鲸与 TradFi 资金流工作区（桑基图 · Bybit 复合精确定位标点）
位于 `#crypto`（「加密货币」/「TradFi」双赛道工作区），是全网独创的链上衍生品主力行为穿透系统：
- **双市场卡片切换**：在**加密货币主流永续**（BTC/ETH/SOL/ZEC 等）与 **HIP-3（xyz）TradFi 链上美股**（NVDA/MU/TSLA/SOXL/QQQ(XYZ100)/SPY(SP500)/MSTR/黄金/原油等）之间毫秒级切换。
- **多空分布桑基图（Sankey Flow Diagram）**：
  - 左列展示巨鲸钱包、右列展示持仓标的、中间贝塞尔流向带宽映射资金流向与多空净敞口比例。
  - **严格多空汇总口径**：支持「**全部（多+空）**」「**多仓**」「**空仓**」三模式切换；在全量合法候选钱包范围内汇总多头加空头总持仓额，精准识别仅有 `szi` 正负数量或中文方向标签的原始仓位。
  - **Top N 动态发现 + 自定义钱包管理 + 15 秒真相门控轮询**：支持按排行榜 Top 12 / 20 等动态发现活跃实盘巨鲸、自主添加/删除任意跟踪地址，每 15 秒轮询上游 `userFillsByTime` 与持仓变化并在发生真实新成交或仓位变动时触发连线脉冲动画。
- **展开式时空 K 线双甲板与 Bybit 风格高精度复合标点**：
  - 点击资金流向矩阵中任意标的，行内展开双甲板分析抽屉：
    - 默认高度 `380px`，支持一键 **`⤢ 展开大图`** 扩展至 **`520px`**（再点 `⤡ 还原`）以及右上角 **`⤢ 大屏分析`** 按钮直接跳转 `#chart`（`4小时 · 1个月`）全屏巨鲸工作台，配合多空加权成本与正股基准价格线（含链上合约相对美股正股的**实时溢折价率**）。
    - **Bybit 复合高精度标点**：
      1. **K 线原位白边精准成交圆点（`8px` 高对比白框圆点）**：按开仓均价精确锚定到匹配 K 线的**上影线、实体或下影线真实价格位置**；
      2. **K 线外侧方向五边形盾牌（做多绿色朝上 `B` / 做空红色朝下 `S`）**：同根 K 线多笔仓位自动按垂直阶梯错开防遮挡；
      3. **垂直虚线指引**：在悬停、激活或点位偏离蜡烛时清晰连接盾牌与精准成交点，颜色随系统 `KLINE_SCHEMES` 设置实时切换；
      4. **真实随图滑出零吸边**：拖拽或缩放 Y 轴使 K 线移出可视范围时，标点与卡片随之平滑滑出隐藏，绝不卡死停留在图表边缘。
    - **严谨点击弹窗（HUD Popover）与开仓时间追踪**：悬停点位或表格行仅做双向高亮同步，**点击圆点、盾牌或表格行**才会浮出包含钱包地址、杠杆倍数、开仓均价、当前现价、名义仓位、预估强平价、**精确开仓时间（`MM-DD HH:mm:ss`）**、**已持仓时长**与未实现盈亏的半透明 HUD 详单；点击卡片外任意空白处自动关闭。底部明细表同步展示精确开仓时间并支持全字段升/降序排序。

### 3.4 多时段自选看板与混合数据源
- 位于 `#watchlist`（「自选看板」）及全站右侧可折叠速览侧栏（支持拖拽排序、搜索过滤与自定义分组，默认折叠并可通过顶部栏或悬浮标签展开）。
- **四时段状态精准识别**：实时区分**常规交易（☀️）**、**盘前（🌅）**、**盘后（🌇）**、**隔夜（🌙）**及加密货币 **24/7** 连续行情。
- **严格交易口径**：盘中交易时间掩蔽过时的延展涨跌数字，收盘后恢复完整显示延展涨跌幅度（`EXT%`）与日内振幅条；支持经 SSE 长连接（`/api/watchlist/stream`）实时推送 **Longbridge** 或 **IBKR** 报价。

### 3.5 美股核心板块热力图
- 在首页总览与市场板块采用 Treemap 树状热力图呈现大盘核心权重股（含标普 500 精选范围）。
- 严格锁定正常开盘交易时段（Regular Trading Hours）成交表现，磁贴居中双行展示涨跌幅与估算成交额，全市场最高成交额标的授予金色 **`Rank #1`** 徽章。
- 拥有**独立热力图配色体系（`HEATMAP_SCHEMES` 5 套方案）**，与 K 线走势配色解耦持久化。

### 3.6 期权 Gamma 持仓分布与蝴蝶 OI 墙
- 位于 `#options`（「期权墙」），直连 CBOE 期权链实时计算各到期日合约。
- **双侧蝴蝶式 OI 分布图（Butterfly OI Bars）**：行权价居中排布（Spot 现价严格处于视觉焦点行 `.is-spot-row`），左侧展开 Call OI、右侧展开 Put OI，加载期间展示严格对称的蝴蝶骨架屏。
- 自动提取最高 Call Wall、Put Wall、Put/Call Ratio 及做市商总 Gamma 敞口（GEX）；与自选股选中标的保持同步联动。

### 3.7 实时突发快讯、AI 智能财经搜索与财报日历
- **Tree News（Tree of Alpha）WebSocket 实时电报**：全天候监听毫秒级全球突发资讯，服务端以 200 条环形队列缓存并通过 SSE（`/api/news/live/stream`）实时推送前端。
- **AI 财经检索引擎**：整合 Tavily、Firecrawl、Exa（可选配置 Key），严格实行域名白名单校验、日期正文防伪造、去重与相关性过滤，支持按近一小时 / 近一日 / 近一周检索财报及宏观动态。
- **科技与 AI 财报日历弹窗**：按美东时间计算本周/上周/下周日程，自动匹配企业官方徽标与披露时段（盘前/盘后），卡片平滑缩放弹出（支持 `Esc` 关闭）。

### 3.8 视觉主题、多配色系统与移动端专版
- **双重外观维度的组合定制**：
  - **昼夜模式**：深色暗黑 / 浅色明亮模式一键切换（`theme-bootstrap.js` 零闪白初始化）。
  - **界面配色盘（UI Palette）**：经典终端（`terminal`）与蓝灰数据（`cobalt`）两套主题规范。
  - **K 线 & 热力图 5 大独立配色方案**：**经典绿红（`classic`）**、**荧光极光（`neon`）**、**赛博霓虹（`cyberpunk`）**、**极光蓝紫（`bluepurple`）**、**深邃蓝紫（`deepbluepurple`）**。
- **移动端重塑专版**：`< 768px` 视口自动切换为移动端专用布局（5 个底部导航标签、独立搜索浮层、更多功能抽屉面板与单指滑动行情卡），无需额外适配端即可在手机浏览器顺畅看盘。

---

## 4. 项目目录与核心文件说明

```text
Market Desk/
├── src/                                  # Node.js ESM 服务端与量化数据源引擎
│   ├── server.js                         # HTTP 服务器入口、静态托管与 API/SSE 路由分发
│   ├── env.js                            # .env 环境变量加载器
│   ├── market-workspace.js               # 市场工作台主协调层（总览/K线及Hyperliquid兜底/新闻/期权聚合）
│   ├── workspace-data.js                 # 行情指标与基准数据底座
│   ├── market-data.js                    # K 线周期拉取与 4 小时常规交易时段重采样引擎
│   ├── market-sessions.js                # 美股美东交易时段、夏令时与节假日状态机
│   ├── watchlist-quotes.js               # 自选股实时报价服务、SSE 广播与数据源路由
│   ├── quote-providers/
│   │   ├── longbridge.js                 # 长桥 OpenAPI 实盘报价适配器（含夜盘支撑）
│   │   └── ibkr.js                       # Interactive Brokers (IBKR Gateway) 行情适配器
│   ├── crypto-whale-service.js           # Hyperliquid 加密与 HIP-3 (xyz) 链上巨鲸追踪服务
│   ├── onchain-stocks-service.js         # 链上美股 Top 10 成交与正股溢折价核算服务
│   ├── options-wall.js                   # CBOE 期权链解析、OI 墙与 GEX Gamma 敞口模型
│   ├── tree-news-service.js              # Tree News WebSocket 客户端与 200 条环形缓存 SSE 推流
│   ├── ai-search-service.js              # AI 财经搜索多源调度、并发去重与域名合规校验
│   ├── news-search-policy.js             # 搜索日期窗口边界与相关性过滤策略
│   ├── news-source-utils.js              # 资讯域名信任等级识别与 RSS 清洗工具
│   ├── earnings-calendar-service.js      # Nasdaq 财报周历加载与 10 分钟/24 小时双级缓存
│   ├── notion.js                         # 可选：Notion 自选股数据库双向读取集成
│   ├── indicators.js / pivots.js         # 技术指标、枢轴点、主力信号与回测研究模块
│   ├── inflection-hunter/index.js        # 拐点猎手 R1 核心计算与信号聚合导出
│   └── ...
│
├── public/                               # 浏览器端零编译 Vue 3 前端与视觉资产
│   ├── index.html                        # 主 SPA 视图模板与各专业模块布局结构
│   ├── app.js                            # 前端全局状态机、视图控制器与事件调度中心
│   ├── styles.css                        # 桌面金融终端全局样式、毛玻璃浮窗与复合标点 CSS
│   ├── mobile-layout.css                 # 移动端响应式专用样式与底部栏规范
│   ├── color-palettes.css                # 经典终端 / 钴蓝数据双主题语义 Token
│   ├── theme-bootstrap.js / theme-model.js # 首屏防闪烁主题启动与配色偏好读写模型
│   ├── watchlist-model.js                # 自选股分组、3 态排序与延展盘算模型
│   ├── flows.js                          # 板块资金流与市场轮动辅助数据模型
│   ├── earnings-calendar-model.js        # 财报周历前端格式化与公司徽标映射
│   ├── inflection-signals.js             # DEMA14/30 计算与图表 Signal Marker 转换
│   ├── mobile-workspace.js / mobile-quote-view.js # 移动端卡片视图、手势与导航模型
│   ├── composables/                      # 高度解耦的纯函数图形与交互引擎模块
│   │   ├── whaleSankeyModel.js           # 巨鲸桑基图拓扑布局、方向判定与增量变化检测
│   │   ├── klineGesture.js               # 主图拖拽/缩放/价格轴惯性动量集成手势引擎
│   │   ├── klinePriceMotion.js           # 价格轴 Y 轴动画与防闪烁自动缩放门禁器
│   │   ├── klineViewportMotion.js        # X 轴逻辑视野惯性平滑运动求解器
│   │   ├── klineWheelInput.js            # 滚轮触控板横向/纵向手势意图识别与平滑整形
│   │   ├── klineGeometry.js              # K 线屏幕坐标、拟合条数与锚点几何演算
│   │   └── chartDerivedData.js           # MA / DEMA 与读数提示条记忆化派生缓存
│   └── inflection-hunter/                # 拐点算法浏览器端常量、特征与引擎分片
│
├── test/                                 # 自动化测试套件（264 项单测与 JSDOM E2E 测试）
│   ├── workspace-ui.test.js              # 全工作区前端交互、图表桩与 DOM 回归验证
│   ├── crypto-whale.test.js              # 链上巨鲸解析、Top N 与 HIP-3 集成测试
│   ├── whale-sankey-model.test.js        # 桑基图分布、多空汇总边界与差分脉冲单测
│   ├── onchain-stocks-service.test.js    # 链上美股合约榜单与溢折率逻辑测试
│   ├── kline-*.test.js                   # K 线几何、手势、滚轮、动量与移动端手势单测
│   └── ...                               # 期权墙、新闻搜索、财报、自选 API 等全模块测试
│
├── docs/                                 # 设计蓝图、迁移规范、诊断笔记与第三方声明
├── licenses/                             # 依赖与扩展模块许可证文件
├── .env.example                          # 环境变量配置模板
└── package.json                          # 依赖清单与启动 / 检查 / 测试脚本
```

---

## 5. HTTP & SSE API 接口清单

| 协议 / 方法 | 端点路径与常用查询参数 | 核心功能说明 |
| :--- | :--- | :--- |
| `GET` | `/api/health` | 返回服务运行状态与版本号 `{ ok, product, version }` |
| `GET` | `/api/market/overview` | 大盘股指、美债曲线、VIX/VXN 指标及板块热力图全景数据 |
| `GET` | `/api/market/chart?symbol=SPY&range=3mo&interval=1d` | 个股 K 线接口；支持 `range` (`1d`/`1mo`/`3mo`/`6mo`/`1y`/`2y`) 与 `interval` (`15m`/`1h`/`4h`/`1d`) |
| `GET` | `/api/macro` | 宏观行情大宗、外汇与汇率即时切片指标 |
| `GET` | `/api/crypto` | 主流加密货币 24/7 实时行情列表 |
| `GET` | `/api/crypto/whales?category=stocks&topN=12&custom=0x...&force=1` | 巨鲸与 TradFi 数据入口；支持切换 `stocks`/`crypto`、Top N 数量、自定义钱包拼接与强制刷新 |
| `GET` | `/api/crypto/onchain-stocks?force=1` | 链上美股成交榜单、正股对比基准与资金流水 |
| `GET` | `/api/options?symbol=NVDA` | CBOE 期权链持仓分布、多到期 OI 墙及做市商 Gamma 计算 |
| `GET` | `/api/watchlist?force=1` | 读取自选股列表与 Notion 同步状态（如已配置） |
| `GET` | `/api/watchlist/quotes?symbols=NVDA,TSLA` | 批量拉取自选标的常规及盘前/盘后/隔夜多时段报价 |
| `GET` | `/api/watchlist/stream?symbols=NVDA,TSLA` | **SSE 实时推流**：推送来自 Longbridge 或 IBKR 的自选实时报价变动 |
| `GET` | `/api/ibkr/status` | 检查 IBKR Gateway 连接状态与诊断原因 |
| `GET` | `/api/ibkr/reconnect` | 触发 IBKR Gateway 客户端主动重连 |
| `GET` | `/api/earnings/calendar?weekStart=2026-11-02&force=1` | Nasdaq 财报周历数据；`weekStart` 为美东周一日期，支持缓存控制与强刷 |
| `GET` | `/api/news?symbol=NVDA` | 个股及市场新闻流列表 |
| `GET` | `/api/news/ai-search?query=...` | AI 多源财经检索聚合（Tavily / Firecrawl / Exa + RSS） |
| `GET` | `/api/news/live/stream` | **SSE 实时推流**：广播 Tree News 毫秒级突发快讯 |
| `GET` | `/api/news/live/history` | 获取 Tree News 内存环形缓冲区近期快讯历史 |
| `GET` | `/api/news/live/status` | 查询 Tree News WebSocket 上游连接存活状态 |

---

## 6. 环境变量配置指南（`.env`）

默认零配置即可使用公共数据源与链上数据源；如需接入实盘券商报价、AI 财经搜索或 Notion 自选，可在 `.env` 中配置以下可选项：

| 分类 | 变量名 | 默认值 / 示例 | 用途说明 |
| :--- | :--- | :--- | :--- |
| **基础服务** | `PORT` / `HOST` | `5174` / `127.0.0.1` | 后端 HTTP 监听端口与绑定地址 |
| **数据源偏好** | `QUOTE_PROVIDER` | `longbridge` / `ibkr` | 手动指定优先使用的自选实时报价通道 |
| **长桥 OpenAPI** | `LONGBRIDGE_APP_KEY` / `LONGBRIDGE_APP_SECRET` / `LONGBRIDGE_ACCESS_TOKEN` | 选填（亦兼容 `LONGPORT_*` 前缀） | 接入长桥实时推送（支持盘前盘后与隔夜报价，`LONGBRIDGE_ENABLE_OVERNIGHT=false` 可关闭夜盘） |
| **IBKR 盈透** | `IB_GATEWAY_HOST` / `IB_GATEWAY_PORT` / `IB_CLIENT_ID` | `127.0.0.1` / `4001` / `1` | 对接本地或内网 IBKR TWS / Gateway 获取美股流式报价（含 `IB_CONNECT_TIMEOUT` / `IB_AUTO_RECONNECT`） |
| **AI 新闻检索** | `TAVILY_API_KEY` / `FIRECRAWL_API_KEY` / `EXA_API_KEY` | 选填 | 启用多引擎财经智能新闻检索（未配置时仍保留合规 RSS 回退） |
| **突发快讯源** | `TREE_NEWS_WS_URL` / `TREE_NEWS_REST_URL` / `TREE_NEWS_API_KEY` | Tree of Alpha 公开端点 | 可自定义 Tree News 连接地址或认证 Key |
| **Notion 同步** | `NOTION_TOKEN` / `NOTION_DATABASE_ID` | 选填 | 复用现有 Notion 自选列表作为默认自选池来源 |

---

## 7. 快捷键与高效交互指南

- **K 线主图手势**：
  - `鼠标左键拖拽`：平滑时间轴历史平移（具备动量惯性）；自动切入 `历史` 状态并在点击 `⟲ 复位` 时回到 `最新`；
  - `画布内滚轮`：以光标位置为锚点平滑缩放可见 K 线密度；
  - `右侧价格纵坐标拖拽 / 滚轮`：脱离自动缩放，自由拉伸纵轴观察细微价格结构；
  - `双击 K 线画布`：快速自适应复位图表视角。
- **TradingView 测距尺（`📐`）**：
  - 点击左侧工具栏 `📐` 启用，或直接按住 **`Shift` + 鼠标拖拽** 拉出涨跌幅与周期统计卡片；
  - 按 **`Esc`** 键快速退出测距工具或清除当前测量。
- **巨鲸点位与 HUD 详单**：
  - 鼠标悬停表格行或图表标记时双向联动高亮定位；
  - **左键点击** K 线白边成交圆点、`B`/`S` 盾牌或表格行，在该点位旁呼出详情 HUD 浮窗（含开仓时间与持仓时长）；再次点击同一目标或点击画布空白区域即关闭浮窗。

---

## 8. 自动化测试与工程质量验证

项目采用极高密度自动化测试保障前后端状态、图表渲染与手势算法零退化：

```bash
# 1. 对 src/ 与 public/ 共 39 个核心 JavaScript 文件执行语法静态检查
npm run check

# 2. 运行全量自动化测试套件（包含 264 项单测、API 测试与 JSDOM UI 端到端测试）
npm test

# 3. 仅运行工作台及 UI 交互专项测试
npm run test:workspace

# 4. 仅运行 AI 财经搜索策略测试
npm run test:news
```

* 当前全量基线：**39 个脚本文件静态语法校验通过**，**264 项自动化测试 100% 通过（0 失败，0 跳过）**。

---

## 9. 许可与第三方声明

- 第三方组件与开源协议说明请参阅 [docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md) 及 [licenses/gflows-MIT.txt](licenses/gflows-MIT.txt)。
