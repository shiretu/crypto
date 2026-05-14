# Minimum Viable Training Sample

## Structure
- **Input**: N candles (lookback window)
- **Label**: outcome at the close of the last candle (1 = long TP hit, 0 = long SL hit)

```
[candle_1, candle_2, ..., candle_N] → did a long opened at candle_N's close hit TP?
```

## Per-candle features (all normalized)
- Open, High, Low, Close, Volume, Timestamp

## Alignment
- The outcome must correspond to a trade at (or very near) the close of the last candle
- Use the candle's close trade and look up its outcome
- The candle already stores the close trade reference (tsUs + srcId)

## Architecture choice
- **Feedforward NN**: sees candles as a flat bag of numbers, benefits from pre-computed instruments (EMA, MACD)
- **1D CNN / LSTM**: understands sequence, can learn EMA-like features from raw candles, instruments less critical
- **Recommendation**: start with raw candles only using 1D CNN, add instruments later if needed

## Why raw candles first
- EMA, MACD are derived from price — not independent information
- Redundant correlated inputs can slow convergence
- If the baseline works, the signal is in the data
- Adding instruments later tells you if the NN couldn't derive them itself
