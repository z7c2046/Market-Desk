# Inflection Hunter

> Clean-room Node.js + Vue 3 美股日线波段拐点研究工具，基于 TradingView 公发行情数据。集成日线 RSI 背离、成交量衰减与放量止跌识别、三面板图表联动及严格多仓回测。

---

## 目录

1. [快速开始 (Quick Start)](#快速开始)
2. [架构与日线数据流 (Architecture)](#架构与日线数据流)
3. [策略算法体系 (Strategies)](#策略算法体系)
   - [策略一：RSI + 成交量拐点 (`rsi_volume_v1`)](#策略一rsi--成交量拐点-rsi_volume_v1)
     - [分支 A：顶部 RSI 背离 + 量能衰减 (DV-S)](#分支-a顶部-rsi-背离--量能衰减-dv-s)
     - [分支 B：底部 RSI 背离 + 下跌量能衰减 (DV-B)](#分支-b底部-rsi-背离--下跌量能衰减-dv-b)
     - [分支 C：超卖放量止跌 (AV-B, 专门覆盖无Bull标签底部)](#分支-c超卖放量止跌-av-b)
   - [策略二：原版趋势拐点 (`legacy_v2` 修正版 / `legacy_v1` 基准)](#策略二原版趋势拐点-legacy_v2--legacy_v1)
4. [共同计算约定与技术指标 (Indicators & Pivots)](#共同计算约定与技术指标)
   - [Wilder RSI(14) 与边界约定](#wilder-rsi14-与边界约定)
   - [Wilder ATR(14)](#wilder-atr14)
   - [相对成交量 RVOL20 (排除当日)](#相对成交量-rvol20-排除当日)
   - [收盘位置 CLV (Close Location Value)](#收盘位置-clv)
   - [严格高低点 Pivot (Left 3 / Right 2, p+2 确认)](#严格高低点-pivot)
5. [回测引擎与执行模型 (Backtest Engine)](#回测引擎与执行模型)
   - [纯信号比较与次日开盘成交](#纯信号比较与次日开盘成交)
   - [未平仓持仓与已平仓胜率严格分离](#未平仓持仓与已平仓胜率严格分离)
   - [收盘盯市净值最大回撤](#收盘盯市净值最大回撤)
   - [5 策略基准对照](#5-策略基准对照)
6. [前端交互与三面板同步图表 (Frontend UI)](#前端交互与三面板同步图表)
7. [API 参考 (API Reference)](#api-参考)
8. [自动化测试与验证 (Verification)](#自动化测试与验证)
9. [免责声明 (Disclaimer)](#免责声明)

---

## 快速开始

```bash
# 语法检查所有模块
npm run check

# 运行自动化单元测试套件
npm test

# 启动本地服务
npm run dev
```

在浏览器中打开：
```
http://localhost:5174
```

首次打开默认进入日线 (1D) 模式、`RSI + 成交量拐点` 策略，图表默认展示最近约 180 个交易日。

---

## 架构与日线数据流

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Vue 3)                         │
│  public/index.html · public/app.js · public/styles.css      │
│  public/composables/useChart.js (Lightweight Charts 4.1.3)   │
│  [价格面板 420px] ── [成交量面板 120px] ── [RSI面板 150px]    │
│  [当前信号证据卡] ── [5策略日线回测对照表] ── [信号雷达]       │
└──────────────────────────┬──────────────────────────────────┘
                           │  HTTP /api/
┌──────────────────────────▼──────────────────────────────────┐
│                   src/server.js (Node HTTP)                 │
│  /api/market/snapshot  ──►  src/snapshot.js                 │
│  /api/radar            ──►  src/radar.js                    │
│  /api/backtest         ──►  src/backtest.js                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼────────────────────┐
        ▼                  ▼                    ▼
   src/snapshot.js    src/radar.js         src/backtest.js
        │                  │                    │
        ▼                  ▼                    ▼
   src/market-data.js (美股日历、已完成交易日判断、前缀一致性)
        │
        ├─► src/rsi-volume-signals.js (纯函数: 分支A/B/C、冻结阈值、真实可知时间)
        ├─► src/signals.js (原版趋势拐点: legacy_v1 基准与 legacy_v2 修正版)
        ├─► src/indicators.js (Wilder RSI, Wilder ATR, RVOL20, CLV, DEMA)
        ├─► src/pivots.js (Left 3 / Right 2 严格极值，最近 5..60 根配对)
        └─► src/tradingview.js (TradingView Public WebSocket 行情源)
```

系统使用原生 Node.js（无第三方重量级依赖），所有指标计算、形态识别和回测均为纯函数，严禁前视偏差 (Lookahead Bias) 与历史回画 (Repainting)。

---

## 策略算法体系

### 策略一：RSI + 成交量拐点 (`rsi_volume_v1`)

针对美股日线波段设计，解决原版趋势均线信号滞后、无法捕捉动能衰竭与放量承接的缺陷。包含三大独立分支：

#### 分支 A：顶部 RSI 背离 + 量能衰减 (DV-S)
识别价格继续创出新高、但动能衰竭且买盘参与度减弱的顶部风险：
1. **价格新高**：第二高点 $H(p_2) \ge H(p_1) + \varepsilon$，其中 $\varepsilon = \max(H(p_1) \times 0.003, \text{ATR}(p_2) \times 0.15)$。
2. **动能衰退**：$\text{RSI}(p_2) \le \text{RSI}(p_1) - 4$（绝对点数下降 $\ge 4$ 点）。
3. **超买背景**：$\max(\text{RSI}(p_1), \text{RSI}(p_2)) \ge 70$（至少一个高点处于超买区）。
4. **量能衰减**：$Q(p_2) / Q(p_1) \le 0.85$（第二高点附近三日均量明显低于第一高点）。

- **确认机制**：在 $p_2$ 确认日 $d = p_2 + 2$ 生成“顶部预警”。冻结确认价 $\min(L_{p_2-2}, L_{p_2-1}, L_{p_2})$ 与失效价 $H(p_2) + 0.5 \times \text{ATR}(p_2)$。在 $d \sim d+7$ 内收盘跌破确认价且 RSI 下行时，确认 **DV-S**，多仓退出到现金。若收盘高于失效价则预警失效。

#### 分支 B：底部 RSI 背离 + 下跌量能衰减 (DV-B)
识别价格创出新低、但下跌动能与空头抛压参与度衰竭的底部拐点：
1. **价格新低**：第二低点 $L(p_2) \le L(p_1) - \varepsilon$。
2. **动能抬升**：$\text{RSI}(p_2) \ge \text{RSI}(p_1) + 4$。
3. **超卖背景**：$\min(\text{RSI}(p_1), \text{RSI}(p_2)) \le 30$。
4. **下跌缩量**：$Q(p_2) / Q(p_1) \le 0.85$。

- **确认机制**：在 $d = p_2 + 2$ 生成“底部预警”。冻结确认价 $\max(H_{p_2-2}, H_{p_2-1}, H_{p_2})$ 与失效价 $L(p_2) - 0.5 \times \text{ATR}(p_2)$。在 $d \sim d+7$ 内收盘突破确认价、RSI > 30 且 RSI 回升时，确认 **DV-B** 买入。

#### 分支 C：超卖放量止跌 (AV-B, 专门覆盖无Bull标签底部)
不依赖双底或 RSI 底背离形态，专门捕捉急跌后的大幅放量、承接止跌与价格恢复：
1. **阶段一（超卖放量观察 $t_0$）**：
   - $\text{RSI}(t_0) \le 30$
   - $\text{RVOL20}(t_0) \ge 1.8$（相对近20日均量放大 1.8 倍以上）
   - $L(t_0) \le \min(L_{t_0-20} \dots L_{t_0-1}) + 0.25 \times \text{ATR}(t_0)$（创出或接近近20日新低）
   - 当天仅生成观察事件，冻结参考价 $L_0, H_0, A_0$，失效价 $L_0 - 0.35 \times A_0$。**严禁在放量大阴线当日直接买入。**
2. **阶段二（承接止跌检验 $t_0+2$ 或 $t_0+3$）**：
   - $t_0$ 后续最低价不跌破失效价（至少观察2根完整日线）；
   - 当日收盘价高于 $C(t_0)$；
   - 当日收盘位置 $\text{CLV} = (Close - Low) / (High - Low) \ge 0.60$；
   - 当日 $\text{RSI} \ge \text{RSI}(t_0) + 3$。
   - 最早满足日记为 $s$。
3. **阶段三（突破确认）**：
   - 在 $s \sim s+7$ 内，收盘突破 $H_0$、RSI > 30 且上升，正式确认 **AV-B**。

---

### 策略二：原版趋势拐点 (`legacy_v2` / `legacy_v1`)

采用 DEMA(14/30) 双均线斜率、差值、Williams %R(9) 及 Mutant(260, 5) 动量评分。

#### 现有关键缺陷修复（P0 / P1）
- **`legacy_v1`（未经修改基准）**：保留原有实现，用于历史回测对照。
- **`legacy_v2`（已修正版本）**：
  1. **超卖不挡多仓退出（P0）**：修复原版在 `regime === 1`（已有多仓）时因价格急跌进入 %R 超卖（$\le -85$）而阻止向 DOWN 切换的 Bug。修正后多仓退出不再被超卖错误封锁。
  2. **1根确认修复（P1）**：修复 `lastEarlyAt !== bar.time` 导致动态确认数要求为 1 时首根仍无法确认的问题，允许首根完成确认并保留当日早期事件。

---

## 共同计算约定与技术指标

### Wilder RSI(14) 与边界约定
- 采用 Wilder 平滑算法，首根由前 14 个涨跌差的均值初始化。
- **边界约定**：
  - 全程横盘（平均涨跌均为 0）：约定 $\text{RSI} = 50$；
  - 仅有上涨（平均跌为 0）：$\text{RSI} = 100$；
  - 仅有下跌（平均涨为 0）：$\text{RSI} = 0$；
  - 预热不足 15 根：返回 `null`。

### 相对成交量 RVOL20 (排除当日)
$$\text{RVOL20}(i) = \frac{V(i)}{\frac{1}{20}\sum_{k=i-20}^{i-1} V(k)}$$
- **严格排除当日成交量**，避免自相关性分母污染。
- 窗口内若存在未知量、停牌零成交量，返回 `null`。

### 收盘位置 CLV
$$\text{CLV} = \frac{\text{Close} - \text{Low}}{\text{High} - \text{Low}} \in [0, 1]$$
- 当 $\text{High} = \text{Low}$ 时约定为 0.5。

### 严格高低点 Pivot
- 窗口：左 3 根、右 2 根。
- 价格严格大于（或小于）邻域内所有价格，相等价格不构成新 Pivot。
- 确认日：第二点 $p_2$ 必须在右侧 2 根走完后确认，即 $d = p_2 + 2$（**真实可知时间**）。
- 仅配对距 $p_2$ 在 5～60 根内、最近的一个同类已确认 Pivot $p_1$。

---

## 回测引擎与执行模型

回测引擎采用纯函数设计，只做多/持有现金（Long-Only Cash），无前视偏差。

1. **成交模型**：
   - 底部正式确认（DV-B / AV-B / B）后的**下一有效交易日开盘价**买入：
     $$\text{FillPrice}_{\text{buy}} = \text{Open}_{\text{next}} \times (1 + \text{SlippageRate})$$
   - 顶部正式确认（DV-S / S）后的**下一有效交易日开盘价**退出到现金：
     $$\text{FillPrice}_{\text{sell}} = \text{Open}_{\text{next}} \times (1 - \text{SlippageRate})$$
   - 默认费率：每腿佣金 5 bps，每腿滑点 5 bps（总双边成本约 20 bps）。
2. **严格分离已平仓与未平仓**：
   - 期末未平仓持仓仅按期末收盘价盯市计入净值曲线与 `openPosition`，**严禁混入 `closedTrades` 计算已平仓胜率**。
   - 0 笔已平仓交易时胜率显示为 `—`，不显示为 0%。
3. **每日收盘盯市最大回撤**：
   - 最大回撤按每个交易日收盘盯市净值连续计算，而非仅在交易平仓点更新。
4. **5 策略基准对照表**：
   - `RSI + 成交量确认` (`rsi_volume_v1`)
   - `原版 B/S 基准` (`legacy_v1`)
   - `原版 eB/eS 基准` (`legacy_v1_early`)
   - `趋势修正版 B/S` (`legacy_v2`)
   - `Buy & Hold`（区间首根开盘买入并持有）

---

## 前端交互与三面板同步图表

采用 Lightweight Charts 4.1.3 构建三面板联动图表系统：
1. **主价格面板 (~420px)**：K线、DV-B/AV-B/DV-S 确认实心标记、预警空心标记、可选 DEMA 均线。
2. **真实成交量面板 (~120px)**：涨跌对应颜色柱状图、20日成交量移动平均线。
3. **RSI 面板 (~150px)**：Wilder RSI(14) 曲线、70/50/30 水平参考线、锚点背离连线。
4. **交互特性**：
   - 三面板可见逻辑范围与十字光标实时同步联动；
   - 独立的两个顶级策略切换按钮：`[ 原版趋势拐点 (已修正) ]` 与 `[ RSI + 成交量拐点 ● ]`；
   - 当前信号证据卡展示形态锚点价差、RSI 差值、均量比与冻结阈值；
   - 针对 1440px、1366px、768px、390px 均经过视口适配，无水平溢出滚动。

---

## API 参考

### `GET /api/market/snapshot`
获取标的市场快照、多面板数据序列、形态证据及快速回测。
- `symbol`：股票代码（默认 `SNDK`）
- `tf`：时间周期（`rsi_volume_v1` 仅支持 `1d`）
- `algorithm`：`rsi_volume_v1`（默认）、`legacy_v2`、`legacy_v1`
- `limit`：K线数量（默认 900）

### `GET /api/radar`
按当前策略扫描自选池或预设美股标的最近 4 个交易日的形态：
- `lookback`：回看交易日数（默认 4）
- `algorithm`：所选策略算法
- 返回分组：`bottomConfirmed`（底部确认）、`topConfirmed`（顶部确认）、`candidates`（观察中）

### `GET /api/backtest`
执行多策略统一口径日线对比回测：
- `symbol`：股票代码
- `start` / `end`：日期区间（默认近 1 年）
- `feeBps`：每腿佣金（默认 5）
- `slippageBps`：每腿滑点（默认 5）

---

## 自动化测试与验证

本项目通过 Node.js 原生测试套件保证质量：

```bash
npm run check
npm test
```

测试覆盖范围：
- **`test/indicators.test.js`**：Wilder RSI 边界约定（横盘 50、单边 100/0、不足 null）、Wilder ATR、RVOL20（排除当日及零值判断）、CLV。
- **`test/pivots.test.js`**：Left 3 / Right 2 严格极值判定、p+2 确认时间、5～60 根最近同类配对。
- **`test/signals.test.js`**：分支 A 顶背离正反例、分支 C 放量止跌与跌破失效检验、逐日前缀一致性测试（输入截至 t 序列与全量计算在 t 之前完全一致）。
- **`test/legacy-fixes.test.js`**：`legacy_v2` 超卖退出修复、首根 1-bar 确认修复。
- **`test/backtest.test.js`**：次日开盘撮合、费用与滑点手算精度、未平仓与已平仓胜率严格分离。

---

## 免责声明

1. 本项目为量化波段技术分析研究工具，**不构成任何投资建议或证券推介**。
2. 历史回测结果不代表未来收益，不同市场环境与标的波动率可能导致策略表现差异。
3. 依赖公开行情源的数据质量，对于停牌、异常跳空等情况应保持审慎核实。
