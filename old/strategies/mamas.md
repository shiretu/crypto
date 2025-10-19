# 📈 maPriceClose5 / maPriceClose30 BUY-Only Strategy

This document defines a simple **moving average crossover strategy** designed for **BUY-only (long)** trading.

The strategy uses **maPriceClose5** as a *fast* (short-term) signal line and **maPriceClose30** as a *slow* (trend) confirmation line.

---

## 🧠 Concept

- **maPriceClose5** reacts quickly to recent price changes.
- **maPriceClose30** reflects the broader trend.
- When **maPriceClose5** crosses above **maPriceClose30**, short-term momentum turns bullish within a larger upward trend.

The system only takes **BUY** trades — never shorts — and exits when the short-term trend weakens.

---

## ⚙️ Indicators Used

| Indicator        | Description                                 | Purpose                  |
| ---------------- | ------------------------------------------- | ------------------------ |
| `maPriceClose5`  | Simple Moving Average of the last 5 closes  | Fast (momentum)          |
| `maPriceClose30` | Simple Moving Average of the last 30 closes | Slow (trend)             |
| `volume`         | Current candle volume                       | Confirmation of strength |
| `maVolume20`     | Average of last 20 volumes                  | Baseline for comparison  |

---

## ✅ BUY Condition

Enter a **long (BUY)** when **all** of the following are true:

```js
BUY =
(
    (maPriceClose5Prev < maPriceClose30Prev) // 1. Bullish crossover trigger
 && (maPriceClose5Now  > maPriceClose30Now)  // 2. Fast MA crosses above slow MA
 && (priceNow > maPriceClose30Now)           // 3. Price confirmed above slow MA
 && (volumeNow > maVolume20)                 // 4. High volume confirms strength
 && (priceCloseNow > priceOpenNow)           // 5. Candle closed green
)
```

### Notes
- Wait for candle **close** before confirming the crossover.
- Optional: require maPriceClose5 to stay above maPriceClose30 for 1–2 candles to avoid false crosses.

---

## 🔴 SELL / EXIT Condition

Exit the position (or stop BUYs) when **any** of these is true:

```js
SELL =
(
    (maPriceClose5Now < maPriceClose30Now) // 1. Bearish crossover
 || (priceNow < maPriceClose30Now)         // 2. Price fell below slow MA
)
```

This helps lock in profits and avoid drawdowns during reversals.

---

## ⚪ HOLD Condition

Maintain an open BUY position as long as the trend remains valid:

```js
HOLD =
(
    (maPriceClose5Now > maPriceClose30Now)
 && (priceNow >= maPriceClose30Now)
)
```

In practice, you continue holding as long as both moving averages show an aligned uptrend and the price stays above the slow MA.

---

## 🧩 Optional Filters and Enhancements

These improve accuracy and reduce false signals.

### ✅ Trend confirmation
Avoid buying in flat or weak markets by requiring an upward slope on maPriceClose30:

```js
slope30 = maPriceClose30Now - maPriceClose30Prev;
BUY = BUY && (slope30 > 0);
```

This ensures the broader trend is rising.

---

### ✅ Crossover persistence
Require maPriceClose5 to remain above maPriceClose30 for at least 2 candles before entering:

```js
BUY = BUY && MA5_above_MA30_for_at_least(2_candles);
```

This filters out whipsaws during sideways markets.

---

### ✅ Volume consistency
Optionally, you can normalize volume conditions:

```js
avg_volume_longer = average(volume over last 50 candles);
BUY = BUY && (volumeNow > 1.2 * avg_volume_longer);
```

This ensures that breakouts are supported by sustained participation.

---

## 📊 Typical Parameters

| Parameter       | Value             | Description                |
| --------------- | ----------------- | -------------------------- |
| Fast MA         | 5                 | Short-term momentum        |
| Slow MA         | 30                | Trend direction            |
| Volume baseline | 20-candle average | Volume confirmation window |

---

## 🧠 Trading Psychology

- **Golden Cross** → maPriceClose5 rises above maPriceClose30: momentum shifts up → BUY.
- **Death Cross** → maPriceClose5 falls below maPriceClose30: trend weakening → EXIT.
- Always trade **with the trend** (price above maPriceClose30).

---

## ⚠️ Notes

- Works best in **trending markets**, not sideways ranges.
- Avoid entries during low volume or flat maPriceClose30.
- Combine with proper **risk management** and **stop-loss** (e.g., below maPriceClose30 or previous swing low).

---

## 🧪 Pseudocode Summary

```js
// BUY rule
BUY =
(
    (maPriceClose5Prev < maPriceClose30Prev)
 && (maPriceClose5Now  > maPriceClose30Now)
 && (priceNow > maPriceClose30Now)
 && (volumeNow > maVolume20)
 && (priceCloseNow > priceOpenNow)
);

// SELL rule
SELL =
(
    (maPriceClose5Now < maPriceClose30Now)
 || (priceNow < maPriceClose30Now)
);

// HOLD rule
HOLD =
(
    (maPriceClose5Now > maPriceClose30Now)
 && (priceNow >= maPriceClose30Now)
);

// Optional filters
slope30 = maPriceClose30Now - maPriceClose30Prev;
BUY = BUY && (slope30 > 0);
BUY = BUY && MA5_above_MA30_for_at_least(2_candles);
```

---

## 🏁 Summary Table

| Condition                                                                                             | Meaning             | Action |
| ----------------------------------------------------------------------------------------------------- | ------------------- | ------ |
| maPriceClose5 crosses **above** maPriceClose30, price above maPriceClose30, volume high, green candle | Start long position | ✅ BUY  |
| maPriceClose5 crosses **below** maPriceClose30 OR price < maPriceClose30                              | Trend reversal      | 🔴 SELL |
| maPriceClose5 > maPriceClose30 and price ≥ maPriceClose30                                             | Trend intact        | ⚪ HOLD |

---

**Author:** Based on maPriceClose5/maPriceClose30 crossover principles  
**Recommended timeframe:** 1m to 1h depending on volatility  
**Applies to:** Binance / TradingView / Custom bot backtesting
