# NN Design Direction

## Goal
At any point in time, answer: "Should I open a long position right now?"

## Model
- **Input**: N values describing current market state
- **Output**: single value 0-1 (confidence that long will hit TP before SL)
- **Label**: 1 if longOrder.profitPercent > 0, else 0

## Input candidates
- **Candles** (preferred starting point): OHLC + volume over a lookback window
- **Instruments**: EMA, SMA, MACD — distilled trend/momentum signals
- **Raw trades**: maximum resolution but irregular, harder to structure

## Recommended starting input
Based on ~5.5h average outcome duration:
- 5-min candles × 60 lookback = 5h of history
- Plus instrument values (EMA12, EMA26, MACD line/signal/histogram)
- Normalized relative to current price

## Key insight
The model should be **selective** — not trade everything, only high-confidence entries.
The baseline is already ~70% in bullish markets; the model needs to work in bearish/sideways too.
