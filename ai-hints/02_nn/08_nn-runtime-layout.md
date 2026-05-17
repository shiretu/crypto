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
            "windowSize": 60,
            "tpPercent": 1.5,
            "slPercent": 1,
            "randomWindowPosition": true,
            "startDay": "2023-01-01",
            "endDay": "2023-12-31",
            "samplesCount": 1000000
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
  - **personality.data**: describes the data flavor (symbol, candle size, window/sampling, TP/SL, date range, samples count)
  - **personality.train**: training hyperparameters (learning rate, epochs, batch size)

The on-disk config file (`configs/nn/config.json`) has a different, application-level shape: `{ neuralNetworks: [...], personalities: [...] }`. The `nn` CLI selects one `<arch>:<personality>` pair from it and constructs the `{ name, personality }` object above.

## Fingerprint

Computed via [`Fingerprint.compute()`](../../src/utils/Fingerprint.js): SHA256 of canonicalised JSON (recursive key-sort), truncated to 16 hex chars.

For a network runtime the fingerprint covers `{ data, train }` — if any param changes, the fingerprint changes. The personality `name` is excluded (it's a label, not a parameter).

## Directory layout

Architecture and runtime live in **different roots** — the arch is config (small, hand-edited, in git), the runtime is generated data (large, outside the repo via the `data` symlink).

```
configs/nn/<name>/
└── arch.json                          # network architecture (layers, shapes, activations)

data/nn/runtimes/<name>/
└── <fingerprint>/
    ├── recipe.json                    # frozen copy of { data, train } that produced this fingerprint
    └── tensorflow/                    # runner-specific files
        ├── model.json                 # TF model topology + weight manifest
        └── weights.bin                # trained coefficients
```

- **arch.json**: static, user-defined. Shared across all personalities.
- **data/nn/**: lives outside the repo (`data` is a symlink to `../crypto_data`). Not in git, not subject to `git clean`.
- **data/nn/runtimes/**: trained model artifacts. Datasets live as siblings under `data/nn/datasets/`.
- **\<fingerprint\>/**: one folder per unique recipe. Same config = same fingerprint = same folder.
- **recipe.json**: frozen snapshot so you can always trace back what produced a given model.
- **tensorflow/**: runner-specific. Other runners (e.g. `pytorch/`) would be siblings here.

## Multiple personalities

Same architecture can be trained with different recipes. Each gets its own fingerprint folder under `data/nn/runtimes/<name>/`:

```
configs/nn/myFirstNn/
└── arch.json

data/nn/runtimes/myFirstNn/
├── a1b2c3d4e5f67890/       # littleBoy (lr=0.01, 5min candles, 60 lookback)
│   ├── recipe.json
│   └── tensorflow/
└── f0e1d2c3b4a59687/       # theVibeTrader (lr=0.02, 5min candles, 30 lookback)
    ├── recipe.json
    └── tensorflow/
```

## Config files

Stored under `configs/nn/` — `configs/nn/config.json` for the active config, `configs/nn/<name>/arch.json` for architectures. The NN constructor only cares about the resolved `{ name, personality }` shape — how you get there (single file, array iteration, CLI selection) is application-level.

## Datasets

A **dataset** is the materialised collection of (features, labels) **samples** drawn from raw candles/outcomes per the `personality.data` block. It lives **separately** from the NN runtime so multiple personalities sharing the same `data` block reuse the same dataset on disk.

Managed by [`DataSet`](../../src/nn/DataSet.js) (`src/nn/DataSet.js`):

- Constructed with the `personality.data` block alone.
- Fingerprint is `Fingerprint.compute(data)` — only the data block, **not** train hyperparameters.
- Public surface is a single `async load()` method. Internally it checks if `data/nn/datasets/<fingerprint>/` exists; if not, it produces it; then it reads and returns it.
- Exposes geometry getters (populated after `load()`):
  - `samplesCount` — number of samples
  - `featuresCount` / `featureSize` — number and byte-size of input features per sample
  - `labelsCount` / `labelSize` — number and byte-size of output labels per sample
  - Total payload bytes: `samplesCount * (featuresCount * featureSize + labelsCount * labelSize)`

Folder layout:

```
data/nn/datasets/<dataset-fingerprint>/
├── recipe.json                    # frozen copy of the data block
└── samples.bin                    # packed (features || labels) records (little-endian)
```

Note: the **dataset fingerprint** (`data` only) is distinct from the **runtime fingerprint** (`{ data, train }`). Two personalities with the same data but different training hyperparameters produce two runtime folders pointing at the same dataset folder.
