# Neural Network Architecture for Crypto Trading Signals

## Overview

This document describes the complete design for a neural network that generates buy/sell/hold signals for cryptocurrency trading pairs. The system uses historical trade data aggregated into 1-minute candles with technical indicators to predict profitable trading opportunities.

---

## 1. Data Structure & Input Features

### 1.1 Raw Data
- **Source**: ~230 million trades spanning 4 years of history
- **Candle interval**: 1 minute (aligned to second 0 of each minute)
- **Rationale**: Most Binance trading activity concentrates at minute boundaries

### 1.2 Input Window
- **X candles**: 100 warmup candles (for indicator stabilization)
- **C candles**: 120 input candles (2 hours of data)
- **Total**: X+C = 220 candles extracted per sample

### 1.3 Sampling Strategy
- **Random sampling**: Pick random starting points in the 4-year dataset
- **No sliding windows**: Each sample is independently sampled
- **Rationale**: Prevents temporal overfitting, forces NN to learn patterns not time-of-day/year

### 1.4 Feature Normalization

All features are normalized **per sample** (across the X+C candle window):

#### Price Features (Min-Max Normalization)
```
normalized_price = (actual_price - min_price) / (max_price - min_price)
```
Where `min_price` and `max_price` are computed from all X+C candles.

**Applied to:**
- `opens`: Open prices [0, 1]
- `highs`: High prices [0, 1]
- `lows`: Low prices [0, 1]
- `closes`: Close prices [0, 1]

**Why per-window normalization?**
- Handles huge price regime changes (BTC: $16K → $120K over 4 years)
- NN learns **relative patterns** not absolute price levels
- "Price up 2% relative to recent range" is more meaningful than "$50K BTC"

#### Volume & Trade Features (Min-Max Normalization)
```
normalized = (value - min_value) / (max_value - min_value)
```

**Applied to:**
- `volumes`: Trading volume per candle [0, 1]
- `tradesCount`: Number of trades per candle [0, 1]
- `bodySizes`: |close - open| per candle [0, 1]

#### Temporal Features
- `timestamps`: Minutes from midnight, relative to last candle's midnight [-1439, +1440]
  - Captures intraday patterns (morning dump, evening pump)
  - Prevents learning specific dates ("spike on Dec 22 2024")
- `dayOfWeek`: Day of week [0-6] (per candle)
  - Captures weekly patterns (Monday volatility, Friday position closing)

#### Categorical Features
- `colors`: Candle color [0, 1, 2]
  - 0 = white (|open-close| < epsilon)
  - 1 = red (close < open)
  - 2 = green (close > open)

### 1.5 Technical Indicators (Studies)

**MACD (Moving Average Convergence Divergence)**
- Parameters: EMA(12), EMA(26), Signal(9) - standard settings
- Computed **after** price normalization (on normalized prices)
- Provides 5 values per candle:
  - `macdShort`: Fast EMA (12)
  - `macdLong`: Slow EMA (26)
  - `macdLine`: MACD line (short - long)
  - `macdSignal`: Signal line (EMA of MACD)
  - `macdHistogram`: Histogram (MACD - signal)

**Why compute on normalized prices?**
- Indicators are already in relative scale
- Consistent with price normalization approach
- Same formula works across all price regimes

**Why X=100 warmup candles?**
- EMA(26) needs ~3-4× its period to stabilize
- 3×26 = 78, so X=100 provides safe margin
- Ensures MACD values are stable when entering the C-candle window

### 1.6 Global Context (constant per sample)
- `candleDuration`: 60 seconds (constant)
- `windowSize`: 120 (value of C)
- ~~`positionSize`: $100 (likely not useful, can remove)~~
- ~~`fees`: Binance fees as % (likely not useful, can remove)~~

### 1.7 Total Input Size
```
Per-candle features:
- Prices: 4 (open, high, low, close)
- Volume metrics: 3 (volume, tradesCount, bodySizes)
- Temporal: 2 (timestamp, dayOfWeek)
- Categorical: 1 (colors)
- MACD: 5 (short, long, line, signal, histogram)
= 15 features per candle

Total: 120 candles × 15 features = 1800 features
Plus: ~2 global constants = ~1802 total input features
```

---

## 2. Output Labels & Training Strategy

### 2.1 Trading Parameters
- **Take Profit (TP)**: +2%
- **Stop Loss (SL)**: -1%
- **Risk/Reward**: 1:2 ratio
- **Max Duration**: 120 minutes (1-2 hours)
- **Position Strategy**: Single position at a time

### 2.2 Label Generation Process

For each sample (after the C candles), simulate **both** a LONG and SHORT order:

#### LONG Order Simulation
```
Entry price = close of last candle in C
Track next 120 candles:
  - If price hits +2% before -1% → outcome = 'TP', record minute
  - If price hits -1% before +2% → outcome = 'SL', record minute
  - If neither within 120 min → outcome = 'TIMEOUT', record minute
```

#### SHORT Order Simulation
```
Entry price = close of last candle in C
Track next 120 candles:
  - If price hits -2% before +1% → outcome = 'TP', record minute
  - If price hits +1% before -2% → outcome = 'SL', record minute
  - If neither within 120 min → outcome = 'TIMEOUT', record minute
```

### 2.3 Confidence Score Calculation

**Unified confidence formula:**
```javascript
function computeConfidence(result) {
  let timeConfidence = 1 - (result.closeMinute / 120);
  
  if (result.outcome === 'TP') {
    return timeConfidence;      // Positive: +1 to 0
  } else if (result.outcome === 'SL') {
    return -timeConfidence;     // Negative: -1 to 0
  } else {
    return 0;                   // Timeout: neutral
  }
}
```

**Examples:**
- TP hit at minute 10: confidence = +0.92 (strong signal)
- TP hit at minute 100: confidence = +0.17 (weak signal)
- SL hit at minute 10: confidence = -0.92 (strong anti-signal)
- SL hit at minute 100: confidence = -0.17 (weak anti-signal)
- Timeout: confidence = 0 (no clear direction)

**Philosophy:**
- Speed = magnitude of confidence
- Outcome (TP/SL) = sign of confidence
- Fast resolutions = strong patterns
- Slow resolutions = weak patterns
- Negative confidence suggests opposite direction may be valid

### 2.4 Soft Label Conversion

Convert confidence scores to 3-class probability distribution:

```javascript
function computeSoftLabel(longResult, shortResult) {
  let longConf = computeConfidence(longResult);   // -1 to +1
  let shortConf = computeConfidence(shortResult); // -1 to +1
  
  // Use positive confidence + opposite's negative confidence
  let longScore = Math.max(longConf, 0) + Math.max(-shortConf, 0) * 0.3;
  let shortScore = Math.max(shortConf, 0) + Math.max(-longConf, 0) * 0.3;
  let holdScore = 0.2;  // Base hold probability
  
  // If both failed, boost HOLD
  if (longConf < 0 && shortConf < 0) {
    holdScore = 0.8;
    longScore = 0.1;
    shortScore = 0.1;
  }
  
  // Normalize to sum to 1
  let sum = longScore + shortScore + holdScore;
  return [holdScore/sum, longScore/sum, shortScore/sum];
}
```

**Output format:** `[P_hold, P_long, P_short]`

**Examples:**
- LONG TP fast, SHORT SL fast: `[0.05, 0.90, 0.05]` - strong LONG
- Both timeout: `[0.70, 0.15, 0.15]` - HOLD
- Both hit SL: `[0.80, 0.10, 0.10]` - strong HOLD
- LONG TP slow, SHORT timeout: `[0.30, 0.60, 0.10]` - weak LONG

### 2.5 Loss Function

**Categorical Cross-Entropy:**
```
Loss = -Σ(actual_i × log(predicted_i))
```

Where i ∈ {HOLD, LONG, SHORT}

**Why this works with soft labels:**
- High confidence labels create large gradients when NN is wrong
- Low confidence labels create small gradients
- NN learns to prioritize fast, clear patterns
- Naturally weights learning by signal quality

**Example:**
```
Actual: [0.10, 0.85, 0.05]  (strong LONG)
NN predicts: [0.20, 0.50, 0.30]  (weak LONG)

Loss = -(0.10×log(0.20) + 0.85×log(0.50) + 0.05×log(0.30))
     = high loss → large gradient → strong learning

vs.

Actual: [0.30, 0.50, 0.20]  (weak LONG)
NN predicts: [0.20, 0.50, 0.30]  (close)

Loss = -(0.30×log(0.20) + 0.50×log(0.50) + 0.20×log(0.30))
     = lower loss → small gradient → weak learning
```

---

## 3. Neural Network Architectures

Three architectures have been designed, saved in `/models/`:

### 3.1 LSTM Architecture (`/models/lstm/arch.json`)

**Purpose:** Learn long-term temporal dependencies in sequential candlestick data

**Structure:**
```
Input: (120, 15)
  ↓
LSTM: 64 units, return_sequences=True
  ↓
Dropout: 0.3
  ↓
LSTM: 32 units, return_sequences=False
  ↓
Dropout: 0.3
  ↓
Dense: 16 units, ReLU
  ↓
Output: 3 units, Softmax
```

**Advantages:**
- Designed for sequences - maintains "memory" across candles
- Proven for financial time series
- Captures long-term dependencies
- Learns which past candles matter most

**Disadvantages:**
- Slower to train
- Can be tricky to tune
- Risk of vanishing gradients

**Best for:** Learning how patterns evolve over the 2-hour window

### 3.2 CNN Architecture (`/models/cnn/arch.json`)

**Purpose:** Detect local patterns and candlestick formations

**Structure:**
```
Input: (120, 15)
  ↓
Conv1D: 64 filters, kernel=3, ReLU
  ↓
MaxPooling1D: pool=2
  ↓
Conv1D: 128 filters, kernel=3, ReLU
  ↓
MaxPooling1D: pool=2
  ↓
Conv1D: 256 filters, kernel=3, ReLU
  ↓
GlobalAveragePooling1D
  ↓
Dense: 128 units, ReLU
  ↓
Dropout: 0.4
  ↓
Dense: 64 units, ReLU
  ↓
Output: 3 units, Softmax
```

**Advantages:**
- Fast to train
- Good at detecting chart patterns (3-candle formations, etc.)
- Translation invariant - same pattern recognized anywhere
- Efficient computation

**Disadvantages:**
- Less effective at very long-term dependencies
- Requires careful kernel size selection

**Best for:** Recognizing candlestick patterns, chart formations, indicator crossovers

### 3.3 Hybrid CNN-LSTM Architecture (`/models/hybrid/arch.json`)

**Purpose:** Combine local pattern detection with temporal learning

**Structure:**
```
Input: (120, 15)
  ↓
Conv1D: 64 filters, kernel=5, ReLU
  ↓
MaxPooling1D: pool=2
  ↓
Conv1D: 128 filters, kernel=3, ReLU
  ↓
MaxPooling1D: pool=2
  ↓
LSTM: 64 units, return_sequences=False
  ↓
Dropout: 0.3
  ↓
Dense: 32 units, ReLU
  ↓
Output: 3 units, Softmax
```

**Advantages:**
- Best of both worlds
- CNN extracts patterns, LSTM learns their temporal relationships
- More efficient than pure LSTM (CNN reduces dimensionality first)
- Strong for complex, multi-scale patterns

**Disadvantages:**
- More complex to tune
- Longer training time than CNN alone

**Best for:** Complex scenarios requiring both pattern recognition and temporal reasoning

### 3.4 Recommended Starting Point

**Start with LSTM** because:
1. Data is fundamentally sequential (time matters)
2. Battle-tested for financial time series
3. Good baseline - if it works, you're done
4. Easier to interpret what the network learns

If LSTM doesn't perform well, try CNN or Hybrid.

---

## 4. Training Configuration

### 4.1 Common Settings (all architectures)

```json
{
  "loss": "categorical_crossentropy",
  "optimizer": {
    "type": "adam",
    "learning_rate": 0.001,
    "beta_1": 0.9,
    "beta_2": 0.999
  },
  "metrics": ["accuracy", "categorical_crossentropy"],
  "batch_size": 32,
  "epochs": 100,
  "validation_split": 0.2,
  "early_stopping": {
    "monitor": "val_loss",
    "patience": 10,
    "restore_best_weights": true
  }
}
```

### 4.2 Class Imbalance Considerations

Expected distribution:
- ~70% HOLD (most patterns don't lead to clear TP)
- ~15% LONG
- ~15% SHORT

**This is desirable** - teaches the NN to be selective and only signal when confident.

**Monitoring:**
- Watch for NN predicting only HOLD (underfitting)
- May need to adjust HOLD probability in soft labels if this occurs
- Consider class weights if severe imbalance

---

## 5. Implementation Notes

### 5.1 Data Pipeline

```javascript
// Current structure in MakeFlat.js
return [
  // Candles (120 × 9 features)
  ...inputs.candles.opens,
  ...inputs.candles.highs,
  ...inputs.candles.lows,
  ...inputs.candles.closes,
  ...inputs.candles.volumes,
  ...inputs.candles.timestamps,
  ...inputs.candles.colors,
  ...inputs.candles.bodySizes,
  ...inputs.candles.tradesCount,
  
  // Studies (120 × 5 features)
  ...inputs.studies.macdShort,
  ...inputs.studies.macdLong,
  ...inputs.studies.macdLine,
  ...inputs.studies.macdSignal,
  ...inputs.studies.macdHistogram,
  
  // Global (2 features - positionSize/fees can be removed)
  inputs.global.candleDuration,
  inputs.global.windowSize,
  
  // Output (3 soft labels)
  ...(output ? output : [])
]
```

**To add:**
- `dayOfWeek` per candle (in candles section)
- Remove `positionSize` and `fees` (not useful)

### 5.2 Architecture Files

All architectures stored as JSON in `/models/` for framework-agnostic implementation:
- `/models/lstm/arch.json`
- `/models/cnn/arch.json`
- `/models/hybrid/arch.json`

These can be parsed by TensorFlow, PyTorch, or custom implementations.

### 5.3 Inference (Trading)

```javascript
// Get NN output
let [p_hold, p_long, p_short] = model.predict(inputFeatures);

// Apply confidence threshold
const CONFIDENCE_THRESHOLD = 0.70;

if (p_long > CONFIDENCE_THRESHOLD && p_long > p_short) {
  // Open LONG position
  // TP: +2%, SL: -1%
} else if (p_short > CONFIDENCE_THRESHOLD && p_short > p_long) {
  // Open SHORT position
  // TP: +2%, SL: -1%
} else {
  // HOLD - do nothing
}
```

**Confidence threshold:**
- Start with 0.70 (70% probability)
- Tune based on backtesting results
- Higher = fewer trades, higher quality
- Lower = more trades, potentially more noise

---

## 6. Key Design Decisions & Rationale

### 6.1 Why Per-Window Normalization?
- **Problem:** BTC went from $16K to $120K over 4 years
- **Solution:** Normalize relative to each window
- **Result:** NN learns "price up 2%" not "price = $50K"
- **Benefit:** Generalizes across all price regimes

### 6.2 Why Compute MACD on Normalized Prices?
- **Alternative:** Pre-compute MACD globally, then normalize
- **Problem:** Can't normalize MACD after the fact (mathematically inconsistent)
- **Solution:** Normalize prices first, then compute MACD
- **Result:** MACD values are already in relative scale
- **Benefit:** All features (prices + indicators) use same reference frame

### 6.3 Why Random Sampling (No Sliding Windows)?
- **Alternative:** Slide window forward 1 candle at a time
- **Problem:** NN learns "morning patterns", "Monday patterns", specific dates
- **Solution:** Random sampling across 4 years
- **Result:** NN must learn universal patterns, not time-specific ones
- **Benefit:** Better generalization to future (unseen) data

### 6.4 Why Soft Labels (Not Hard 0/1/2)?
- **Alternative:** Label = 0 (HOLD) or 1 (LONG) or 2 (SHORT)
- **Problem:** Doesn't convey signal quality (fast TP vs slow TP)
- **Solution:** Soft probabilities based on outcome speed
- **Result:** NN learns strongly from clear patterns, weakly from marginal ones
- **Benefit:** Automatic quality weighting via cross-entropy gradients

### 6.5 Why Symmetric TP/SL Confidence?
- **Alternative:** Only reward TP, ignore SL timing
- **Problem:** Loses information about failure patterns
- **Solution:** `confidence = ±(1 - minute/120)`, sign from TP/SL
- **Result:** Fast SL = strong anti-signal = boost opposite direction
- **Benefit:** Richer learning signal, no hard zeros, teaches "what to avoid"

### 6.6 Why 3 Classes (Not Binary Long/Short)?
- **Alternative:** Just LONG vs SHORT (2 classes)
- **Problem:** Forces NN to always pick a direction
- **Solution:** Add HOLD class
- **Result:** NN can say "not confident, don't trade"
- **Benefit:** Prevents overtrading in choppy/uncertain markets

---

## 7. Future Enhancements (Potential)

### 7.1 Additional Features
- Order book data (bid/ask spreads, depth)
- Funding rates (for perpetual futures)
- Open interest changes
- Other technical indicators (RSI, Bollinger Bands, Stochastic)
- Multi-timeframe analysis (5m, 15m, 1h patterns)

### 7.2 Advanced Architectures
- Transformer/Attention mechanisms
- Multi-task learning (predict direction + magnitude + timing)
- Ensemble of multiple models
- Online learning / continual adaptation

### 7.3 Trading Logic
- Dynamic position sizing based on confidence
- Multiple concurrent positions (different pairs)
- Adaptive TP/SL based on volatility
- Risk management rules (max drawdown, daily loss limits)

### 7.4 Validation
- Walk-forward testing
- Out-of-sample validation on unseen pairs
- Paper trading before live deployment
- A/B testing against baseline strategies

---

## 8. Success Metrics

### 8.1 Model Metrics
- **Accuracy**: Overall classification accuracy
- **Precision/Recall per class**: Especially for LONG/SHORT
- **Confusion matrix**: Where is the model wrong?
- **Confidence calibration**: Are 80% predictions actually 80% correct?

### 8.2 Trading Metrics
- **Win rate**: % of trades hitting TP vs SL
- **Profit factor**: Total wins / Total losses
- **Sharpe ratio**: Risk-adjusted returns
- **Max drawdown**: Largest peak-to-trough decline
- **Trade frequency**: How often does it signal?

### 8.3 Validation Approach
```
1. Train on 2021-2023 data
2. Validate on 2024 data (unseen)
3. Test on different crypto pairs (unseen assets)
4. Backtest with realistic slippage/fees
5. Paper trade for 2-4 weeks
6. Live trade with small position sizes
```

---

## 9. Risk Warnings

⚠️ **This is experimental** - no guarantee of profitability

⚠️ **Past performance ≠ future results** - markets change

⚠️ **Overfitting risk** - model may memorize training data patterns that don't repeat

⚠️ **Market regime changes** - a pattern that worked in 2023 may fail in 2025

⚠️ **Black swan events** - NN can't predict unprecedented events

⚠️ **Technical failures** - exchange outages, network issues, bugs

⚠️ **Start small** - test with minimal capital before scaling

---

## 10. Summary

This system uses:
- **4 years of trade data** aggregated into 1-minute candles
- **120-candle windows** (2 hours) with normalized features
- **MACD indicators** computed on normalized prices
- **Random sampling** to prevent temporal overfitting
- **Soft labels** encoding outcome speed and direction
- **3-class output** (HOLD/LONG/SHORT) with confidence scores
- **LSTM/CNN/Hybrid architectures** for pattern recognition

The goal: Learn which 2-hour candlestick patterns reliably predict 2% moves (TP) before 1% reversals (SL) within 1-2 hours, while avoiding false signals in choppy markets.

**Key innovation:** Confidence scoring based on resolution speed creates rich training signals that teach the NN to prioritize fast, decisive patterns over slow, marginal ones.
