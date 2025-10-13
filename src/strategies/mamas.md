# 📈 MA(5) / MA(30) BUY-Only Strategy

This document defines a simple **moving average crossover strategy** designed for **BUY-only (long)** trading.

The strategy uses **MA(5)** as a *fast* (short-term) signal line and **MA(30)** as a *slow* (trend) confirmation line.

---

## 🧠 Concept

- **MA(5)** reacts quickly to recent price changes.
- **MA(30)** reflects the broader trend.
- When **MA(5)** crosses above **MA(30)**, short-term momentum turns bullish within a larger upward trend.

The system only takes **BUY** trades — never shorts — and exits when the short-term trend weakens.

---

## ⚙️ Indicators Used

| Indicator | Description | Purpose |
|------------|--------------|----------|
| `MA(5)` | Simple Moving Average of the last 5 closes | Fast (momentum) |
| `MA(30)` | Simple Moving Average of the last 30 closes | Slow (trend) |
| `volume` | Current candle volume | Confirmation of strength |
| `avg_volume(20)` | Average of last 20 volumes | Baseline for comparison |

---

## ✅ BUY Condition

Enter a **long (BUY)** when **all** of the following are true:

```js
BUY =
(
    (MA5_prev < MA30_prev)            // 1. Bullish crossover trigger
 && (MA5_now  > MA30_now)             //    Fast MA crosses above slow MA
 && (price_now > MA30_now)            // 2. Price confirmed above slow MA
 && (volume_now > avg_volume)         // 3. High volume confirms strength
 && (close_now > open_now)            // 4. Candle closed green
)
```

### Notes
- Wait for candle **close** before confirming the crossover.
- Optional: require MA(5) to stay above MA(30) for 1–2 candles to avoid false crosses.

---

## 🔴 SELL / EXIT Condition

Exit the position (or stop BUYs) when **any** of these is true:

```js
SELL =
(
    (MA5_now < MA30_now)              // 1. Bearish crossover
 || (price_now < MA30_now)            // 2. Price fell below slow MA
)
```

This helps lock in profits and avoid drawdowns during reversals.

---

## ⚪ HOLD Condition

Maintain an open BUY position as long as the trend remains valid:

```js
HOLD =
(
    (MA5_now > MA30_now)
 && (price_now >= MA30_now)
)
```

In practice, you continue holding as long as both moving averages show an aligned uptrend and the price stays above the slow MA.

---

## 🧩 Optional Filters and Enhancements

These improve accuracy and reduce false signals.

### ✅ Trend confirmation
Avoid buying in flat or weak markets by requiring an upward slope on MA(30):

```js
slope30 = MA30_now - MA30_prev;
BUY = BUY && (slope30 > 0);
```

This ensures the broader trend is rising.

---

### ✅ Crossover persistence
Require MA(5) to remain above MA(30) for at least 2 candles before entering:

```js
BUY = BUY && MA5_above_MA30_for_at_least(2_candles);
```

This filters out whipsaws during sideways markets.

---

### ✅ Volume consistency
Optionally, you can normalize volume conditions:

```js
avg_volume_longer = average(volume over last 50 candles);
BUY = BUY && (volume_now > 1.2 * avg_volume_longer);
```

This ensures that breakouts are supported by sustained participation.

---

## 📊 Typical Parameters

| Parameter | Value | Description |
|------------|--------|-------------|
| Fast MA | 5 | Short-term momentum |
| Slow MA | 30 | Trend direction |
| Volume baseline | 20-candle average | Volume confirmation window |

---

## 🧠 Trading Psychology

- **Golden Cross** → MA(5) rises above MA(30): momentum shifts up → BUY.
- **Death Cross** → MA(5) falls below MA(30): trend weakening → EXIT.
- Always trade **with the trend** (price above MA(30)).

---

## ⚠️ Notes

- Works best in **trending markets**, not sideways ranges.
- Avoid entries during low volume or flat MA(30).
- Combine with proper **risk management** and **stop-loss** (e.g., below MA(30) or previous swing low).

---

## 🧪 Pseudocode Summary

```js
// BUY rule
BUY =
(
    (MA5_prev < MA30_prev)
 && (MA5_now  > MA30_now)
 && (price_now > MA30_now)
 && (volume_now > avg_volume)
 && (close_now > open_now)
);

// SELL rule
SELL =
(
    (MA5_now < MA30_now)
 || (price_now < MA30_now)
);

// HOLD rule
HOLD =
(
    (MA5_now > MA30_now)
 && (price_now >= MA30_now)
);

// Optional filters
slope30 = MA30_now - MA30_prev;
BUY = BUY && (slope30 > 0);
BUY = BUY && MA5_above_MA30_for_at_least(2_candles);
```

---

## 🏁 Summary Table

| Condition | Meaning | Action |
|------------|----------|--------|
| MA(5) crosses **above** MA(30), price above MA(30), volume high, green candle | Start long position | ✅ BUY |
| MA(5) crosses **below** MA(30) OR price < MA(30) | Trend reversal | 🔴 SELL |
| MA(5) > MA(30) and price ≥ MA(30) | Trend intact | ⚪ HOLD |

---

**Author:** Based on MA(5)/MA(30) crossover principles  
**Recommended timeframe:** 1m to 1h depending on volatility  
**Applies to:** Binance / TradingView / Custom bot backtesting
