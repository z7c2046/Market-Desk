# Inflection Hunter

> Clean-room Node.js + Vue 3 inflection-point signal scanner powered by TradingView public market data.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Signal Engine Algorithm](#signal-engine-algorithm)
   - [Data Pipeline](#data-pipeline)
   - [Indicators](#indicators)
   - [Composite Score](#composite-score)
   - [Signal State Machine](#signal-state-machine)
   - [Adaptive Features](#adaptive-features)
4. [Backtest Engine](#backtest-engine)
5. [Radar Scanner](#radar-scanner)
6. [API Reference](#api-reference)
7. [Module Reference](#module-reference)
8. [Backtest Results](#backtest-results)
9. [Disclaimer](#disclaimer)

---

## Quick Start

```bash
npm run dev
```

Open in browser:

```
http://localhost:5174
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Vue 3)                         │
│  public/index.html · public/app.js · public/styles.css      │
│  public/composables/useChart.js  (Lightweight Charts)       │
└──────────────────────────┬──────────────────────────────────┘
                           │  HTTP  (localhost)
┌──────────────────────────▼──────────────────────────────────┐
│                   src/server.js  (Node HTTP)                 │
│                                                             │
│  /api/market/snapshot  ──►  src/snapshot.js                 │
│  /api/radar            ──►  src/radar.js                    │
│  /api/backtest         ──►  src/backtest.js                 │
│  /api/health                                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
       ┌───────────────────┼────────────────────┐
       ▼                   ▼                    ▼
  src/snapshot.js    src/radar.js         src/backtest.js
       │                   │
       ▼                   ▼
  src/tradingview.js  (WebSocket → TradingView public feed)
       │
       ▼
  src/indicators.js   (DEMA, ATR, Williams %R, Mutant, …)
  src/signals.js      (composite score → state machine)
  src/universe.js     (default symbol list)
```

The backend runs a **plain Node.js HTTP server** with no external framework. It connects to TradingView's public market-data WebSocket to fetch OHLCV bars, applies the signal engine locally, and returns JSON to the frontend.

---

## Signal Engine Algorithm

The core of Inflection Hunter is a multi-factor composite score that generates **directional inflection signals** on any timeframe.

### Data Pipeline

```
TradingView WebSocket
        │
        ▼  OHLCV bars (up to 3000 bars per request)
  normalizeBars()           ← round to 6dp, numeric coercion
        │
        ├── DEMA(14)        ← fast trend line  (emaFast)
        ├── DEMA(30)        ← slow trend line  (aux)
        ├── ATR(14)         ← volatility normaliser
        ├── Williams %R(9)  ← zero-lag overbought/oversold
        ├── VolumeSurge(20) ← volume vs 20-bar rolling avg
        └── Mutant(260,5)   ← normalised annualised momentum
                │
                ▼
        computeSignals()    ← composite score → state machine → signal list
```

### Indicators

#### Double EMA (DEMA)

Standard EMA has lag proportional to its period. DEMA halves that lag:

```
DEMA(n) = 2 × EMA(n) − EMA(EMA(n))
```

The second EMA pass estimates the lag error of the first; subtracting it brings the line close to price while keeping smoothness. Inflection Hunter uses:

| Line | Period | Role |
|------|--------|------|
| `emaFast` | DEMA(14) | Short-term trend direction |
| `aux` | DEMA(30) | Medium-term trend anchor |

#### ATR (Average True Range)

Rolling average of True Range over 14 bars. Used as the **volatility normaliser** for all score components — dividing raw distances by ATR makes the score dimensionless and regime-stable.

```
TrueRange = max(High − Low, |High − PrevClose|, |Low − PrevClose|)
ATR(14)   = rolling mean of last 14 TrueRanges
```

#### Williams %R

Zero-lag overbought/oversold oscillator. Unlike RSI (which carries ~7-bar Wilder-smoothing lag), `%R` uses raw High/Low extremes:

```
%R = (HighestHigh − Close) / (HighestHigh − LowestLow) × −100
```

Range `[−100, 0]`.  
- ≥ −15 → overbought (blocks new long signals)  
- ≤ −85 → oversold (blocks new short signals)

Inflection Hunter uses **period = 9** (tighter than the common 14-period RSI proxy).

#### Volume Surge Ratio

```
VolumeSurge[i] = volume[i] / rollingAvg(volume, 20)
```

Used as a **signal quality multiplier**:

| Surge ratio | Score factor |
|-------------|-------------|
| ≥ 1.5× | ×1.15 (boost) |
| 1.0 – 1.5× | ×1.00 |
| 0.7 – 1.0× | ×0.85 |
| < 0.7× | ×0.70 (penalise thin volume) |

#### Mutant (Normalised Momentum)

An annualised log-return momentum oscillator, smoothed and normalised to `[−1, +1]`:

```
rawReturn[i]    = log(close[i] / close[i-1]) × 260   // annualised
smoothed        = EMA(rawReturn, 5)
scale           = 95th-percentile of |smoothed|
mutant[i]       = clamp(smoothed[i] / scale, −1, +1)
```

The 260× factor converts daily log-returns to an approximate annualised rate. The 95th-percentile normalisation prevents outlier events from permanently dominating the scale.

---

### Composite Score

Each bar receives a scalar **composite score** built from five components:

```
spreadScore = (DEMA_fast − DEMA_slow) / ATR      // DEMA spread (trend direction)
priceScore  = (close − DEMA_fast)    / ATR      // price vs fast line (proximity)
slopeScore  = (DEMA_fast[i] − DEMA_fast[i-2]) / ATR   // 2-bar DEMA slope (momentum)
velocity    = (close[i] − close[i-1]) / ATR     // 1-bar price speed (leading)
mutant      = Mutant[i]                         // normalised annualised momentum

rawScore = 0.45 × spreadScore
         + 0.25 × priceScore
         + 0.15 × slopeScore
         + 0.08 × velocity
         + mWeight × mutant

score = rawScore × volFactor
```

**Weight rationale:**

| Component | Weight | Rationale |
|-----------|--------|-----------|
| DEMA spread | 0.45 | Primary trend-direction signal |
| Price vs DEMA | 0.25 | Proximity confirmation |
| DEMA slope | 0.15 | Rate-of-change, momentum |
| Price velocity | 0.08 | Lightweight leading indicator |
| Mutant | adaptive | Annualised momentum — amplified when consistent |

The **Mutant weight** (`mWeight`) is not fixed. It adapts based on how consistently directional Mutant has been over the last 5 bars:

```
consistency = fraction of last 5 bars where sign(mutant) == sign(current mutant)
mWeight     = baseWeight × (0.6 + consistency × 0.8)   // range ≈ [0.108, 0.324]
```

---

### Signal State Machine

The signal engine is an event-driven state machine operating on four states:

```
regime ∈ { −1 (DOWN), 0 (neutral), +1 (UP) }
```

**Per-bar logic:**

```
1. Compute adaptive thresholds (enterThreshold, exitThreshold)
2. Compute composite score
3. Derive target regime from score vs thresholds
4. Apply Williams %R block (prevents new signals at extremes)
5. If target == regime → reset pending, continue
6. If target == 0      → reset pending, continue
7. If pending != target → record Early signal (eB / eS), start confirmation counter
8. If pendingCount >= dynConfirm → emit Confirmed signal (B / S), flip regime
```

**Signal sides:**

| Side | Meaning |
|------|---------|
| `eB` | Early Buy — first bar where score crosses the enter threshold upward |
| `B` | Confirmed Buy — signal held for `confirmBars` consecutive bars |
| `eS` | Early Sell — first bar where score crosses the enter threshold downward |
| `S` | Confirmed Sell — signal held for `confirmBars` consecutive bars |

Only **B** and **S** signals are used for backtesting. **eB** / **eS** provide early-warning overlays on the chart.

**Confirmation window:**  
Default is **2 bars** (conservative). This drops to **1 bar** only when:
- All 4 confluence factors agree (score = 4), **AND**
- `|score| ≥ enterThreshold × 2.2`

---

### Adaptive Features

#### Adaptive Entry / Exit Thresholds

The enter and exit thresholds scale with the **ATR percentile** over the last 60 bars:

```
ratio = clamp((ATR_current − ATR_p50) / (ATR_p90 − ATR_p50), 0, 1)
scale = 1 + ratio × 0.6          // 1.0 in quiet markets, up to 1.6× in volatile

enterThreshold = baseEnter × scale   // default base: 0.22
exitThreshold  = baseExit  × scale   // default base: 0.08
```

This prevents false signals in quiet regimes (thresholds too loose) and chasing extended moves in volatile regimes (thresholds too tight).

#### Confluence Counter

Up to 4 independent factors are checked to measure agreement:

| Factor | Condition |
|--------|-----------|
| DEMA spread | `spreadScore × direction > 0.05` |
| DEMA slope | `slopeScore × direction > 0.02` |
| Williams %R side | `sign(%R + 50) == direction` (positive above −50) |
| Volume surge | `volSurge ≥ 1.2×` |

`confluence ∈ {0, 1, 2, 3, 4}` is attached to every signal and used to:
1. Drive the adaptive confirmation window
2. Scale confirmed-signal **strength**: `0.6 + confluence × 0.1` (range 0.6 – 1.0)

---

## Backtest Engine

`src/backtest.js` provides a multi-strategy walk-forward backtest for a given symbol and timeframe.

### Strategies Compared

| ID | Name | Entry | Exit |
|----|------|-------|------|
| `early` | eB / eS | Early Buy | Early Sell |
| `confirmed` | B / S | Confirmed Buy | Confirmed Sell |
| `buy_hold` | Buy & Hold | First bar open | Last bar close |

### Fill Model

Signals are generated on the signal bar. Fills are executed at the **open of the next bar** (`signal_next_bar_open`).

### Metrics

| Metric | Description |
|--------|-------------|
| `totalReturn` | Net equity return over the period |
| `finalEquity` | Ending equity (starting = 1.0) |
| `maxDrawdown` | Maximum peak-to-trough drawdown |
| `winRate` | Fraction of closed trades with positive PnL |
| `expectancy` | Average PnL per trade |
| `avgWin` | Average gain on winning trades |
| `avgLoss` | Average loss on losing trades |
| `exposurePct` | Fraction of bars spent in a position |
| `costBps` | Round-trip transaction cost in basis points (default 0, configurable) |

---

## Radar Scanner

`src/radar.js` runs the signal engine across a universe of symbols concurrently (default: top-50 liquid US stocks) and returns symbols with **fresh signals** within the last N bars.

- Concurrency: 4 parallel WebSocket connections
- Cache TTL: 30 s (intraday TF) / 120 s (daily)
- Output sorted by: confirmed > early, then by age (freshest first), then by strength

---

## API Reference

### `GET /api/health`

Liveness check.

```json
{ "ok": true, "ts": "2026-06-07T12:00:00.000Z" }
```

---

### `GET /api/market/snapshot`

Fetch OHLCV bars, compute all indicators, signals, pulse, risk, and backtest for one symbol.

**Query parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `symbol` | `TSLA` | Ticker symbol (e.g. `AAPL`, `NASDAQ:NVDA`) |
| `tf` | `1d` | Timeframe: `15m`, `30m`, `1h`, `4h`, `1d` |
| `limit` | `600` | Number of bars to fetch (50 – 3000) |

**Example:**
```
/api/market/snapshot?symbol=TSLA&tf=1d&limit=600
```

**Response fields:**

| Field | Description |
|-------|-------------|
| `bars` | OHLCV array `[{time, open, high, low, close, volume}]` |
| `ema_series` | DEMA(14) series `[{time, value}]` |
| `aux_series` | DEMA(30) series `[{time, value}]` |
| `signals` | Signal list `[{time, price, side, regime, reason, strength, score, confluence, wr, volSurge}]` |
| `mutant` | Mutant oscillator series `[{time, value}]` |
| `pulse` | Market pulse `{score, label, bull, bear, neutral, netInflow}` |
| `risk` | ATR-based risk levels `{entry, stop, target1, target2, atr, confidence}` |
| `backtest` | Quick backtest summary `{trades, winRate, expectancy, avgWin, avgLoss, maxDrawdown, totalReturn}` |

---

### `GET /api/radar`

Scan a universe of symbols for fresh inflection signals.

**Query parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `tf` | `15m` | Timeframe |
| `lookback` | `4` | Max age (bars) for a signal to be considered fresh |
| `max` | `36` | Max symbols to scan (up to 80) |
| `symbols` | Default universe | Comma-separated override list |

**Examples:**
```
/api/radar?tf=15m&lookback=4&max=36
/api/radar?tf=15m&lookback=4&symbols=TSLA,LITE,NVDA,AMD
```

**Response fields:**

| Field | Description |
|-------|-------------|
| `bullish` | Symbols with fresh eB or B signals, sorted by quality |
| `bearish` | Symbols with fresh eS or S signals, sorted by quality |
| `scanned` | Number of symbols scanned |
| `elapsedMs` | Wall-clock time for the scan |
| `errors` | Any symbols that failed to fetch |

---

### `GET /api/backtest`

Multi-strategy backtest for one symbol over a date range.

**Query parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `symbol` | `TSLA` | Ticker symbol |
| `tf` | `15m` | Timeframe |
| `start` | `2026-01-01` | Start date `YYYY-MM-DD` |
| `end` | today | End date `YYYY-MM-DD` |
| `costBps` | `0` | Round-trip cost in basis points |
| `limit` | TF-dependent | Bar limit (120 – 3000) |

---

## Module Reference

| File | Exports | Description |
|------|---------|-------------|
| `src/server.js` | — | HTTP server, routing |
| `src/snapshot.js` | `getMarketSnapshot(query)` | Full data pipeline for one symbol |
| `src/signals.js` | `computeSignals(bars, fast, aux, opts)` · `backtestSignals(bars, signals, opts)` | Signal engine + quick backtest |
| `src/indicators.js` | `ema`, `dema`, `atrSeries`, `williamsRSeries`, `volumeSurgeSeries`, `rsiSeries`, `computeMutant`, `deriveMarketPulse`, `deriveRisk`, `regressionSlope`, `clamp`, `round` | All technical indicators |
| `src/backtest.js` | `compareStrategyBacktests(query)` | Full multi-strategy backtest |
| `src/radar.js` | `scanRadar(query)` | Parallel universe scanner |
| `src/tradingview.js` | `fetchTradingViewBars(opts)` · `resolveTradingViewSymbol(sym)` · `mapTimeframe(tf)` | TradingView WebSocket client |
| `src/universe.js` | `DEFAULT_US_UNIVERSE` · `parseSymbolList(value, fallback)` | Symbol universe |

---

## Backtest Results

Results from a 15-minute, 3000-bar walk-forward comparison between the old EMA+RSI engine and the current DEMA+Williams%R engine (8 bps/leg round-trip cost):

### B/S Confirmed Signals

| Symbol | Old Trades | Old WR | Old Return | New Trades | New WR | New Return | Change |
|--------|-----------|--------|-----------|-----------|--------|-----------|--------|
| AAPL | 29 | 28% | +4.8% | 38 | 42% | +9.1% | ✅ |
| TSM | 26 | 46% | +20.3% | 34 | 65% | +31.7% | ✅ |
| COHR | 33 | 36% | −18.9% | 35 | 49% | +25.1% | ✅ |
| AAOI | 31 | 42% | +99.5% | 37 | 57% | +328.3% | ✅ |
| NVDA | 28 | 32% | +3.3% | 36 | 53% | +8.4% | ✅ |

> **Summary (14 symbols):** Win rate improved from **40% → 50%**. 7 of 14 symbols showed improved total return.

### eB/eS Early Signals

8 of 14 symbols showed improved total return with the early signal mode.

---

## Disclaimer

- This is **not investment advice**.
- TradingView public endpoints are not an official licensed data API. They are best-effort and subject to change or throttling.
- For production use, replace `src/tradingview.js` with a licensed data vendor.
- The signal engine is a clean-room algorithmic implementation. Past backtest performance does not guarantee future results.
