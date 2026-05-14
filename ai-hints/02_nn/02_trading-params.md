# Trading Parameters

- **Strategy**: long only (holding USDC, buying base asset)
- **TP/SL**: 1% / 1%
- **Fees**: 0.1% per trade (0.2% round trip)
- **Net**: win = +0.8%, loss = -1.2%
- **Break-even win rate**: 60%

## Why 1%/1%
- 1.5% swings are rare, longer durations
- Can't go below 1% TP because 0.2% is eaten by fees
- Symmetric TP/SL simplifies the model
