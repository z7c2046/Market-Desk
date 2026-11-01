# AI 财经新闻检索改进

更新日期：2026-11-01（北京时间）。

## 已实现

- 修复前端发送 `q`、服务只读取 `query` 导致所有搜索退回默认词的问题。前端统一发送 `query`；服务兼容旧的 `q`。
- 默认使用按需补充模式：先 Tavily；符合主题、来源和时间要求的结果不足 8 条时，再依次尝试 Exa、Firecrawl。也可主动选择三引擎同时检索或指定单个引擎。未配置的引擎不发送请求。
- 新增最近 1 小时、24 小时、7 天，以及最新优先、相关性优先。后端排序保持到界面，不再由前端强制改回时间顺序。
- 默认排除时间不明资料；允许勾选纳入，且始终排在有日期的结果之后。日期精度不足的资料不会进入“最近 1 小时”。未来时间不被强行改成当前时间。
- 中文主题与常见公司代码/名称扩展；先检查公司/地区和事件是否匹配，再排序。通胀搜索不再允许 RSS 用普通公司新闻补满结果。CPI 查询不会自动扩成 PCE 查询。
- 官方来源范围加入美联储、BLS、BEA、SEC、财政部、BIS、ECB；RSS 增加美联储货币政策公告及讲话。官方域名与媒体域名严格校验，子串伪装域名不会获得官方标签。
- Firecrawl 迁移至 `/v2/search`，解析 `data.news` / `data.web`。Exa 使用 `type: auto`、发布日期上下界和 highlights，移除旧的 `useAutoprompt`。
- URL 与同日标题去重；使用完整规范化 URL 的哈希作为卡片 ID。不同日期的同名报道保留。多引擎收录只表示多个检索渠道，不表示独立证实。
- 展示真实的引擎原始返回数量、未调用、未配置和失败状态。部分来源失败会提示结果可能不完整。上游错误正文不向浏览器返回，以免意外暴露请求内容或密钥。
- 自动检查默认关闭。勾选后每 5 分钟检查最后一次提交的搜索，仅在新闻检索页可见时运行；新结果暂存，点击“显示更新结果”后替换列表。关闭页面不会继续后台采集。
- 连续搜索会取消旧前端请求，并通过请求序号防止旧响应覆盖新结果。后端缓存 90 秒、RSS 缓存 120 秒，同一请求合并；缓存命中仍重新检查时间范围，全部失败时不返回旧成功快照冒充新结果。

## 使用与配置

进入“新闻资讯 → AI 全网深度检索”。可输入 `NVDA 财报`、`美国通胀`、`CPI`、`伊朗停火`，或点击主题预设。没有新消息时会保留空结果，不自动放宽时间或混入无关新闻。

继续使用项目 `.env` 中的 `TAVILY_API_KEY`、`EXA_API_KEY`、`FIRECRAWL_API_KEY`。本次未更改密钥、添加依赖、提交 Git 或部署。

正在使用 `npm.cmd run dev` 时，Node watch 会重新加载后端；使用 `npm.cmd start` 的进程需重启，再刷新网页。

接口示例：

```text
/api/news/ai-search?query=NVDA&engine=auto&source=authority&timeRange=day&sort=latest&includeUndated=false&limit=16
```

`limit` 限制为 1–20，搜索词最长 400 字符。`source` 可为 `all`、`authority`、`official`、`wsj_reuters`、`social`、`reddit`、`x`。

## 验证

- 语法检查：`npm.cmd run check` 通过；下列相关回归共 53 项通过，0 项失败。`git diff --check` 通过。
- 服务、HTTP 路由、页面 DOM、原有工作台回归：

```powershell
node --preserve-symlinks-main --preserve-symlinks --test test/ai-search-service.test.js test/workspace-ui.test.js test/workspace.test.js test/workspace-http.test.js
```

- 实际密钥请求：2026-11-01 23:24 北京时间，查询 NVDA、最近 7 天、媒体与官方来源、全部引擎。Tavily 返回 10 条，Exa 返回 10 条，Firecrawl 请求成功并返回 0 条；去重、过滤后本次展示 8 条。单次结果只能证明当次接口可用，不证明所有主题的覆盖率或新闻发布延迟。
- 23:30 北京时间，实际中文查询“美国通胀”、最近 24 小时、Tavily、媒体与官方来源：引擎返回 10 条，严格筛选后保留 1 条。响应中的查询词与输入一致，没有退回默认市场查询，也没有自动放宽时间或补满条数。
- 页面 DOM 集成覆盖输入 → 真实本地 HTTP → 服务 → 模拟引擎 → Vue 渲染；另有旧响应竞争、排序、异常提示、自动检查暂停与暂存更新测试。
- 当前浏览器自动化连接两次报告 `The browser access host is unavailable`，未完成真实浏览器截图、响应式外观和焦点行为验证。

## 边界

相关性目前是可解释的关键词/实体规则，并非训练或微调过的模型。别名覆盖有限，复杂自然语言或只在正文中间提及的事实可能漏检。可以在 `src/news-search-policy.js` 扩充实体和主题别名。

来源日期仍可能是搜索供应商估计的发布时间或更新时间；保留 `dateSource` 和 `timePrecision`，不会宣称已核验原文发布时间。`firstSeenAt` 只记录当前服务进程中首次发现时间，不是跨重启新闻数据库。更新后的历史文章可能因原始 URL 日期较旧而被排除，这是最新新闻视图的保守选择。

五分钟是检查间隔，不是新闻到达延迟保证。页面关闭后不采集，没有新增通知推送、全天候后台任务或大模型新闻解读。新闻摘要沿用来源/检索引擎返回内容；社交讨论明确标记为未经核实。

## 接口依据

- [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search)
- [Exa Search](https://exa.ai/docs/reference/search)
- [Firecrawl Search](https://docs.firecrawl.dev/api-reference/endpoint/search)
- [美联储 RSS](https://www.federalreserve.gov/feeds/feeds.htm)
