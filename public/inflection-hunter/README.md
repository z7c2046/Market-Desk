# Inflection Hunter R1 算法模块

独立封装的高性能趋势转折与拐点识别算法引擎，完全基于 [Inflection_Hunter_R1_Algorithm_Spec.md](../../Inflection_Hunter_R1_Algorithm_Spec.md) 规格文档实现。

---

## 模块架构与文件组织

```
public/inflection-hunter/
├── index.js          # 统一公共 API 导出入口（纯原生 ESM，零外部运行时依赖）
├── types.d.ts        # 完整 TypeScript 类型定义与接口声明
├── constants.js      # R1 冻结基准研究参数与约束配置（Section 4）
├── indicators.js     # 数值稳定递推 EMA、DEMA (14/30)、ATR (14)、TR 与中位数基准
├── features.js       # 三项方向特征 (x_T, x_A, x_M)、保留零点稳健分位尺度 (s_i, z_i) 与综合评分 S
├── efficiency.js     # 路径效率比 (ERprev) 与动态自适应确认门槛 (H_t)
├── accumulator.js    # 带衰减的双侧证据累积器 (E+, E-)
├── engine.js         # 候选事件 (SETUP)、突破确认 (B+, B-)、结构止损与核心信号 (EB, B, ES, S)
├── formatters.js     # Lightweight Charts 与 ECharts 视觉标记转换器
└── README.md         # 模块设计文档
```

---

## 核心算法规格映射

| 算法组件 | 数学定义 | 规格章节 |
| :--- | :--- | :--- |
| **稳定递推 EMA** | $EMA_t = EMA_{t-1} + \alpha (x_t - EMA_{t-1}),\ \alpha = 2/(n+1)$ | § 3 |
| **DEMA 14 / 30** | $DEMA_n(x) = 2 EMA_n(x) - EMA_n(EMA_n(x))$ | § 3 |
| **ATR 14 尺度** | $\sigma_t = \max(ATR_{t-1}, tick)$（严格使用前根防止前瞻） | § 5 |
| **趋势位置特征** | $x_{T,t} = (F_t - G_t) / \sigma_t$ | § 5.1 |
| **趋势差变化特征** | $J_t = EMA_3(D_t - D_{t-1}),\ x_{A,t} = J_t / \sigma_t$ | § 5.2 |
| **方向性成交量动量** | $U_t = g_t (C_t - C_{t-1}),\ g_t = 1 + \gamma \tanh(\ln(V_t / Vbase_t))$ | § 5.3 |
| **保留零点稳健尺度** | $s_{i,t} = \max(Q_{0.75}(\|x_i\|), \epsilon),\ z_i = \tanh(x_i / s_i)$ | § 6 |
| **综合评分** | $S_t = (z_{T,t} + z_{A,t} + z_{M,t}) / 3 \in [-1, 1]$ | § 6 |
| **路径效率与动态门槛**| $ERprev_t = \frac{\|C_{t-1}-C_{t-21}\|}{\sum \| \Delta C \|},\ H_t = H0 [1 + \lambda_{ER}(1 - ER)^2]$ | § 7 |
| **带衰减双侧累积器** | $E^+_t = \max(0, \rho E^+_{t-1} + S_t - k),\ E^-_t = \max(0, \rho E^-_{t-1} - S_t - k)$ | § 8 |
| **候选与确认机制** | 候选生成 EB / ES，5 根内通过结构突破与偏离度检验生成 B / S | § 9 |

---

## 性能与适用性说明（为什么选择现代原生 ESM + TypeScript 声明）

1. **零运行时开销，V8 原生高速执行**：
   无需经过 Webpack/Vite/Babel/tsc 额外编译打包，由 V8 引擎直接编译为原生机器码执行，充分利用 CPU 缓存与连续数组优化。
2. **前后端同构复用**：
   - 前端：浏览器直接以 `<script type="module">` 加载，毫秒级热刷新；
   - 后端：Node.js 22 直接运行与测试，与 `node --test` 完美契合。
3. **严格的类型保障**：
   附带 [types.d.ts](./types.d.ts)，在 VS Code 及任何 TypeScript/JavaScript 环境下均具备完整的类型提示、代码自动补全与类型检查。

