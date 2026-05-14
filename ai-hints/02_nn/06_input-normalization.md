# Input Normalization

## Principle
All NN inputs should be normalized to a consistent range (typically -1 to +1 or 0 to 1) so no single feature dominates the gradient during training.

## Per-feature approach

### Timestamps
- Already anchored to 00:00 UTC of first day (see 05_timestamp-normalization.md)
- Normalize to -1/+1 based on the window's min/max hours

### Prices (OHLC)
- Normalize relative to current price (e.g., percent change from current)
- Or min/max within the lookback window → -1/+1
- Don't use absolute prices — $3400 vs $95000 shouldn't matter

### Volumes
- Normalize relative to window average or min/max
- Volume patterns matter, absolute values don't

### Instruments (EMA, SMA, MACD)
- Express as distance from current price (in %)
- Or normalize to window range

## Key rule
The NN should never see absolute prices, absolute timestamps, or absolute volumes. Only relative/normalized values. This ensures the model generalizes across different price levels and time periods.
