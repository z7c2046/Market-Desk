# Market Desk · 美股观察工作台

**Market Desk** 是一个专为美股交易者打造的桌面级信息与分析辅助工作台。产品围绕实时行情、宏观指标与恐慌贪婪指数、加密资产看板、财经快讯、板块热力图、资金观察和期权持仓组织信息，提供流畅专业的数据看板与分析辅助。

界面采用现代金融终端设计语言、生动明快的配色体系、毛玻璃圆角面板和 Bento 网格布局；支持高刷新交互与全维度图表联动。主题默认跟随系统，手动切换后在本地保存。

## 启动

需要 Node.js 22 或更高版本。

```powershell
npm.cmd ci
npm.cmd start
```

默认访问 **http://localhost:5174**。已有 `.env` 中的 `PORT` 优先；本次迁移保留原 `.env`。默认只监听 `127.0.0.1`。示例配置见 [.env.example](.env.example)。开发时使用 `npm.cmd run dev`。

不需要为基础功能申请 API Key。Yahoo/Cboe/RSS 是尽力可用的公开端点，可能限流、延迟或改变接口；失败会明确显示错误，存在有效旧缓存时会注明“旧快照”。不生成演示行情填充失败的数据。

## 当前功能

| 模块 | 能做什么 | 数据边界 |
| --- | --- | --- |
| 市场总览 | SPY、QQQ、DIA、IWM、VIX；11 大板块 ETF；样本涨跌分布 | ETF 为对应指数代理；不是完整市场宽度 |
| 热力图 | 精选 18 只美股；按板块筛选、成交额/等面积切换；点击进入个股 | 面积为最新价 × 当日股数的估算成交额，不是市值或净流入 |
| 个股行情 | 搜索代码；日内 5 分钟、1/3/6/12 月日 K；成交量与缩放 | 最新一根可能未收盘，标注交易时间，可能延迟 |
| 资金观察 | 11 个板块 ETF 涨跌/成交额散点图；导入真实净申赎 CSV | 默认未接 ETF 净申赎服务，不能从 OHLCV 推算真实资金净流入 |
| 期权墙 | Cboe 链；到期日选择；Call/Put OI 墙、持仓比、估算 GEX；行权价范围筛选 | 公开延迟快照，持仓量通常每日更新；GEX 含仓位方向假设 |
| 新闻 | CNBC、MarketWatch 市场新闻；Yahoo 个股 RSS；原文链接 | 保留原文标题，不内置新闻翻译或 AI 摘要 |
| 自选 | 本地保存、增删；手动合并已有 Notion 自选 | 本地浏览器保存，不自动跨设备同步 |

## GitHub 项目融合

- **[G|Flows](https://github.com/aaguiar10/gflows) · MIT**：已将 Cboe 接入与按行权价汇总 GEX 的逻辑移植为 Node.js；补充合约逐条解析、小数行权价、缺失值保护、并列墙、明确单位，未照搬其成交量替代 OI 的行为。
- **[Apache ECharts](https://github.com/apache/echarts) · Apache-2.0**：已直接集成，驱动热力图、K 线、成交量、散点与期权柱状图。Vue 与图表包从本地依赖提供，页面不依赖外部脚本 CDN。
- **[OpenStock](https://github.com/Open-Dev-Society/OpenStock)** 与 **[OpenBB](https://github.com/openbq-org/OpenBB)**：参考市场工作台的信息组织与数据提供者分层，没有复制应用代码或引入完整 React/Python 服务。

选型与排除原因：[GitHub 调研和迁移说明](docs/MARKET_DESK_MIGRATION.zh-CN.md)。归属和许可证：[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 数据口径

1. **涨跌幅**：最新价相对前一交易日收盘，不使用长区间首日收盘冒充昨日收盘。
2. **估算成交额**：最新价 × 当日成交股数，只用于相对活跃度；不是逐笔成交金额汇总。
3. **OI 墙**：所选到期日内、全部行权价中 Call 或 Put 持仓量最大的价格。并列全部保留；全零不生成墙。图上筛选 ±15% 不改变墙的计算范围。
4. **GEX**：`gamma × OI × 100 × spot² × 0.01`，单位为标的变动 1% 时的美元 Delta 敞口变化。假定 Call 正、Put 负；不能据此声称实际做市商仓位。缺少 OI/Gamma 时受影响汇总为 `null`，不当作 0。仅标准 100 股合约，拒绝不同/调整后根代码。未实现重新定价的 Gamma flip 曲线。
5. **时间**：界面交易时间转北京时间，顶部时钟为纽约。Cboe 无时区的时间字段保留原值，不擅自推定。过往到期日排除，当日链在纽约 16:15 后排除（保守覆盖 ETF 延后收盘）。
6. **缓存**：行情 60 秒、RSS 5 分钟、期权链 15 分钟；相同请求合并。源站故障时最多使用保存于 1 小时内的旧快照并明确标注；缓存时间不是源站数据时间。

## 导入净申赎

“资金观察 → ETF 净申赎 → 导入 CSV”，UTF-8 格式：

```csv
date,symbol,netFlowUsd,source
```

在表头之后填写真实数据。日期格式 `YYYY-MM-DD`；金额为美元、可正可负；来源必填；同代码同日不能重复；来源不要包含逗号。每次导入替换本地已导入数据，最多 2000 行、500 KB，不上传到服务器。浏览器保留原 CSV，界面可清空。系统不独立核验用户提供的数值。

## API

| GET 路径 | 参数 |
| --- | --- |
| `/api/health` | 产品版本与健康状态 |
| `/api/market/overview` | 大盘、板块、精选股、缺失列表 |
| `/api/market/chart` | `symbol=NVDA&range=3mo`；range 为 `1d/1mo/3mo/6mo/1y` |
| `/api/news` | 空参数为市场新闻；`symbol=AAPL` 为个股 |
| `/api/options` | `symbol=SPY`；`expiration=YYYY-MM-DD` 或 `all`，省略默认最近有效日 |
| `/api/watchlist` | 复用已有 Notion 接入，只有点击导入时使用 |

旧 `/api/radar`、`/api/backtest`、`/api/market/snapshot` 返回 **410 Gone**。算法模块保留历史用途，新服务器不加载。迁移前 UI、服务入口和说明见 [archive/inflection-v0.2](archive/inflection-v0.2/ARCHIVE.md)。

## 验证

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run test:workspace
```

如在受限 Windows 沙箱出现父目录 `lstat EPERM`，仅为当前终端设置：

```powershell
$env:NODE_OPTIONS='--preserve-symlinks --preserve-symlinks-main'
```

测试覆盖计算、缓存、解析、安全路径、API 失败、Vue 页面挂载、导航、图表数据接线及异步旧响应覆盖保护。DOM 测试使用明确的测试夹具，不作为应用数据；它们不能替代真实浏览器截图或设备测试。当前验证记录见 [迁移说明](docs/MARKET_DESK_MIGRATION.zh-CN.md)。

当前交付为本地工作区修改，未部署、未提交或推送 GitHub。对外发布前需落实数据供应商允许的数据使用方式。
