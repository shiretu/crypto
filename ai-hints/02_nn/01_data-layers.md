# Data Layers

1. **Trades** — ground truth. Every actual trade on the exchange. Immutable.
2. **Outcomes** — for every trade, what happens if a position is opened at that price with TP X% / SL Y%. Both long and short. Immutable for a given TP/SL config. Exhaustive — every trade is a hypothetical entry point.

Everything else (candles, EMA, MACD, etc.) is derived and can be recomputed.
