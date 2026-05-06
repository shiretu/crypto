# NN Runtime Layout & Config

## Config shape (passed to constructor)

```json
{
    "name": "myFirstNn",
    "personality": {
        "name": "littleBoy",
        "data": {
            "symbol": "binance:eth:usdc",
            "candleDuration": 300,
            "lookback": 60,
            "tpPercent": 1,
            "slPercent": 1
        },
        "train": {
            "learningRate": 0.01,
            "epochs": 10,
            "batchSize": 32
        }
    }
}
```

- **name**: selects the architecture folder under `nn/`
- **personality**: a specific training recipe
  - **personality.name**: human-friendly label (not used in fingerprint)
  - **personality.data**: describes the data flavor (symbol, candle size, lookback, TP/SL)
  - **personality.train**: training hyperparameters (learning rate, epochs, batch size)

## Fingerprint

SHA256 of `JSON.stringify({ data, train })`, truncated to 16 hex chars. Captures the full recipe — if any param changes, the fingerprint changes. The personality `name` is excluded from the fingerprint (it's a label, not a parameter).

## Directory layout

```
nn/<name>/
├── arch.json                          # network architecture (layers, shapes, activations)
└── runtime/
    └── <fingerprint>/
        ├── recipe.json                # frozen copy of { data, train } that produced this fingerprint
        └── tensorflow/                # runner-specific files
            ├── model.json             # TF model topology + weight manifest
            └── weights.bin            # trained coefficients
```

- **arch.json**: static, user-defined. Shared across all personalities.
- **runtime/**: gitignored. Contains trained model artifacts.
- **\<fingerprint\>/**: one folder per unique recipe. Same config = same fingerprint = same folder.
- **recipe.json**: frozen snapshot so you can always trace back what produced a given model.
- **tensorflow/**: runner-specific. Other runners (e.g. `pytorch/`) would be siblings here.

## Multiple personalities

Same architecture can be trained with different recipes. Each gets its own fingerprint folder:

```
nn/myFirstNn/
├── arch.json
└── runtime/
    ├── a1b2c3d4e5f67890/       # littleBoy (lr=0.01, 5min candles, 60 lookback)
    │   ├── recipe.json
    │   └── tensorflow/
    └── f0e1d2c3b4a59687/       # theVibeTrader (lr=0.02, 5min candles, 30 lookback)
        ├── recipe.json
        └── tensorflow/
```

## Config files

Stored under `configs/`. The config file format is flexible — the NN constructor only cares about the resolved `{ name, personality }` shape. How you get there (single file, array iteration, CLI selection) is application-level.
