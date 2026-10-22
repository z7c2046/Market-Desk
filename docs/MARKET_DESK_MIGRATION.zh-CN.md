# Market Desk 产品迁移与开源调研

日期：2026-10-22。范围：将当前 Node.js + Vue 3 项目改成美股信息与分析辅助站，停止发展拐点算法。

## 选型结果

检查的是 GitHub 实际 README、许可证与适用代码，不是仅根据项目名称选择。星数只记录检查时的快照，不用它保证质量。

| 项目 | 检查时情况 | 本次使用 |
| --- | --- | --- |
| [G|Flows](https://github.com/aaguiar10/gflows) | 115 stars；MIT；Python/Dash；提供 Cboe 期权、Greeks、到期日筛选 | 将接入/聚合逻辑改写为现有 Node 服务，保留版权和 MIT 文件 |
| [Apache ECharts](https://github.com/apache/echarts) | 67,571 stars；Apache-2.0；浏览器可视化库 | 实际安装固定版本 6.1.0，使用其 treemap/candlestick/bar/scatter |
| [OpenStock](https://github.com/Open-Dev-Society/OpenStock) | 20,742 stars；AGPL-3.0；Next.js/React、MongoDB、Finnhub/TradingView | 借鉴总览、自选、行情、新闻的产品结构；不引入账户系统，不复制代码 |
| [OpenBB](https://github.com/openbq-org/OpenBB) | 74,532 stars；原 OpenBB-finance/OpenBB 跳转到该地址；LICENSE 明确 Apache-2.0（API 元数据为 NOASSERTION） | 参考数据适配层；不为当前轻量项目引入完整 Python 平台 |
| [EzOptions](https://github.com/EazyDuz1t/EzOptions) | Python/Streamlit 期权分析；未取得可确认的 LICENSE | 仅调研功能，未复制 |
| [gex-tracker](https://github.com/Matteo-Ferrara/gex-tracker) | 222 stars；简单 Python GEX；未取得许可证 | 未复制 |

选择按模块融合：当前 Vue/Node 基础无需重写成 React，也不必为一个期权页面启动第二套 Python 服务。实际源代码改写来自 G|Flows；OpenStock/OpenBB 是产品与架构参考，两者的使用方式明确区分。

## 实际改动

- 全中文 Market Desk 入口、横向大盘卡片、市场热力图、板块排行、新闻速读。按用户要求恢复原系统 UI：灰白 / 深灰主题、蓝色强调色、毛玻璃圆角面板、310px 侧栏和内嵌顶栏；手机端恢复底部导航与抽屉。
- 明暗主题默认跟随系统，支持手动切换并本地保存；图表坐标轴、提示框和配色同步切换。手机抽屉支持背景隔离、Escape 关闭、焦点回归和 Tab 焦点循环。
- 搜索代码、自选增删、本地保存和已有 Notion 手动导入；不在页面启动时读取私人 Notion。
- 图表之间按标的联动；新闻以原文标题、来源、发布时间、外链展示。
- 行情、新闻、期权分别请求，不要求全部数据源同时成功；缺失行情名单独显示。
- 停用买卖信号、拐点识别、雷达、胜率与策略回测入口，旧 API 明确 410；旧前端与 README 备份，算法模块作为历史源文件保留。
- 新增严格股票代码校验、静态文件路径边界、响应大小/超时限制、同请求合并、缓存和旧快照状态。保留 `.env` 并补齐忽略规则。
- 浏览器依赖由本地 npm 包提供；`package-lock.json` 固定版本。新增第三方来源与许可证说明。

## 移植时改进了什么

G|Flows 的 Cboe 数据和按行权价汇总方式适合迁移，但不原样保留所有假设：

1. 不依赖源数组 Call/Put 交替排列。逐条识别 OCC 合约后汇总，避免顺序变化污染结果。
2. 行权价保留千分位编码，不丢弃小数行权价。
3. 标准期权与调整后合约根代码严格区分。当前只支持标准 100 股乘数模型。
4. 即使临近到期，仍使用 OI 作为持仓，不以 volume 替代 OI。
5. 缺失数据保持 `null`；全零不生成墙；并列墙全部保留；缺失 OI/Gamma 的汇总不显示伪精确数字。
6. 明确 GEX 的 100 股乘数、1% 现货变化和正负符号假设。未将 GEX 命名为真实资金流。
7. 不移植 Vanna/Charm、未验证利率回退或 Gamma flip 扫描，避免把未接入的功能包装为已完成。

## 真实数据验证

本地服务 `http://localhost:5186` 的 HTTP 验证：

| 接口 | 结果 |
| --- | --- |
| market/overview | HTTP 200；5 个市场指标、11 个板块 ETF、18 只股票，无缺失；约 2.5 秒 |
| market/chart?symbol=NVDA&range=3mo | HTTP 200；65 根 K 线；最近交易时间来自源站 |
| news | HTTP 200；40 条；CNBC 和 MarketWatch 均返回 |
| options?symbol=SPY | HTTP 200；默认到期日 2026-10-22；292 份合约记录；成功计算 Call/Put 墙 |
| market/chart?symbol=AAPL&range=1d | HTTP 200；79 根 5 分钟 K 线 |
| news?symbol=NVDA | HTTP 200；20 条个股新闻 |
| options?symbol=NVDA | HTTP 200；182 份合约记录、91 个行权价 |
| options?symbol=SPY&expiration=all | HTTP 200；12,430 份合约记录、491 个行权价 |

以上只是检查时的真实响应，不保证公开接口将来持续可用，也不证明实时市场数据授权。15 分钟缓存不是“保证仅延迟 15 分钟”。

## 验证边界

- 语法检查通过；最终全量 **61/61** 测试通过，其中新版工作台相关 **17/17**。
- 新增单元/API/DOM 集成测试，涵盖数值、前收盘基准、期权单位、缺失值、过期日、并列墙、RSS、CSV、请求缓存、静态路径、旧 API 停用和页面交互。
- 全量测试也保留并运行原策略的历史测试；它们不意味着新产品仍提供策略功能。
- DOM 集成使用 JSDOM 和图表接口替身，验证 Vue 模板可挂载、页面切换、数据接线和旧请求不覆盖新标的；不能证明 Canvas 实际渲染或移动端视觉效果。
- UI 还原后重新通过语法检查及 **3/3** 页面交互测试，新增主题持久化、图表主题更新、手机抽屉开合与焦点回归断言。
- UI 还原已通过真实 Chrome 桌面明暗主题截图检查；在 390×844 模拟视口验证底部导航、抽屉、浅色切换与期权图表加载，页面无横向溢出。移动端截图工具输出存在缩放异常，因此移动端主要通过 DOM 尺寸与交互验证，未代替真实触屏设备验收。响应断点为 1200 / 1024 / 767px，370px 以下隐藏时钟。桌面截图保存于 `artifacts/ui-restored-light.jpg`。
- 未验证真实 CSV 提供者的数据准确性；未读取私人 Notion 自选；未部署、提交或推送。

## 剩余数据接入边界

真实 ETF 净申赎目前通过用户 CSV 接入，默认只显示板块成交活跃度。若后续需要自动净申赎、期权逐笔大单流、完整全市场市值热图，应接入有授权的数据源并明确延迟、字段和配额。当前不捏造这些数据。基础功能的公开数据接入已能本地运行。
