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

- **name**: selects the architecture folder under `configs/nn/`
- **personality**: a specific training recipe
  - **personality.name**: human-friendly label (not used in fingerprint)
  - **personality.data**: describes the data flavor (symbol, candle size, lookback, TP/SL)
  - **personality.train**: training hyperparameters (learning rate, epochs, batch size)

## Fingerprint

SHA256 of `JSON.stringify({ data, train })`, truncated to 16 hex chars. Captures the full recipe — if any param changes, the fingerprint changes. The personality `name` is excluded from the fingerprint (it's a label, not a parameter).

## Directory layout

Architecture and runtime live in **different roots** — the arch is config (small, hand-edited, in git), the runtime is generated data (large, outside the repo via the `data` symlink).

```
configs/nn/<name>/
└── arch.json                          # network architecture (layers, shapes, activations)

data/nn/<name>/
└── <fingerprint>/
    ├── recipe.json                    # frozen copy of { data, train } that produced this fingerprint
    └── tensorflow/                    # runner-specific files
        ├── model.json                 # TF model topology + weight manifest
        └── weights.bin                # trained coefficients
```

- **arch.json**: static, user-defined. Shared across all personalities.
- **data/nn/**: lives outside the repo (`data` is a symlink to `../crypto_data`). Not in git, not subject to `git clean`.
- **\<fingerprint\>/**: one folder per unique recipe. Same config = same fingerprint = same folder.
- **recipe.json**: frozen snapshot so you can always trace back what produced a given model.
- **tensorflow/**: runner-specific. Other runners (e.g. `pytorch/`) would be siblings here.

## Multiple personalities

Same architecture can be trained with different recipes. Each gets its own fingerprint folder under `data/nn/<name>/`:

```
configs/nn/myFirstNn/
└── arch.json

data/nn/myFirstNn/
├── a1b2c3d4e5f67890/       # littleBoy (lr=0.01, 5min candles, 60 lookback)
│   ├── recipe.json
│   └── tensorflow/
└── f0e1d2c3b4a59687/       # theVibeTrader (lr=0.02, 5min candles, 30 lookback)
    ├── recipe.json
    └── tensorflow/
```

## Config files

Stored under `configs/nn/` — `configs/nn/config.json` for the active config, `configs/nn/<name>/arch.json` for architectures. The NN constructor only cares about the resolved `{ name, personality }` shape — how you get there (single file, array iteration, CLI selection) is application-level.
