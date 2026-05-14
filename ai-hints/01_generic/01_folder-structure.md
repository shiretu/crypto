# Project Folder Structure

## Top level

```
crypto/
├── data -> ../crypto_data     # symlink to sibling repo holding raw trade/candle/outcome binary files + NN runtimes
├── package.json               # ESM, type=module, @tensorflow/tfjs-node, mocha + chai
├── problems.md                # running log of fixed/open issues
├── ai-hints/                  # documentation aimed at AI assistants working on this repo
├── configs/                   # project-wide config files (NN configs and arches; not NN-specific)
├── old/                       # retired code from previous iterations (1, 2, 3)
├── scripts/                   # shell entry points that wrap `node src/apps/*.js`
├── src/                       # production source
└── tests/                     # Mocha test files, numbered in dependency order (00..NN)
```

## ai-hints/

Documentation for AI assistants. Organized by topic:

```
ai-hints/
├── 01_generic/                # project-wide hints (folder layout, conventions, etc.)
└── 02_nn/                     # neural-net-related hints
```

## configs/

```
configs/
└── nn/                        # NN configs and architectures
```

## src/

```
src/
├── apps/                      # CLI entry points (process.argv-driven)
├── core/                      # domain primitives (no I/O)
├── exchanges/                 # exchange-specific adapters
├── nn/                        # neural net classes
├── stores/                    # persistence layer over data/
└── utils/
```

## old/

Retired code from earlier iterations. Kept for reference, not imported by current source.

```
old/
├── 1/                         # earliest version: had its own python/ NN, JS infra, ensemble models
├── 2/                         # second version: configs/, persistent/, src/{ai,core,instruments,signals,sources,utils}/
└── 3/                         # third version: most recent ancestor; the v5 NN was ported from old/3/nn/
```

## data/ (symlink target)

`data -> ../crypto_data`. Holds raw binary records plus generated NN runtimes:

```
data/
├── trades/                    # per-symbol/day trade record files
├── candles/                   # per-symbol/day candle record files
├── outcomes/                  # per-symbol/day outcome record files
└── nn/                        # NN-related generated artifacts
    ├── runtimes/              # trained model artifacts (per arch / fingerprint)
    └── datasets/              # prepared dataset binaries (per dataset name)
```

### Why it's a symlink (not a folder inside the repo)

The data is **large and expensive to reproduce** (downloads + multi-day computation). It can't live in git:

- Adding it would bloat history and make pushes/clones impractical.
- `.gitignore`-ing it inside the repo keeps it out of commits, but then `git clean -fdx` would silently delete it — irrecoverably.

The chosen solution: keep the real folder **outside** the repo (`../crypto_data`) and expose it via a symlink. `git clean` won't touch the symlink target, the path stays ergonomic (`data/...` everywhere in code), and there's no accidental-deletion risk.

## Conventions

- **ESM throughout** (`"type": "module"`); imports use `.js` extensions.
- **Private fields** with `#`; abstract base classes throw `'... not implemented'`.
- **Binary records** are little-endian, fixed-size, accessed via Buffer views (no per-record allocation).
- **Tests are dependency-ordered**; lower-numbered tests must remain passing before higher ones are run.
- **Timestamps** are microseconds since Unix epoch (`tsUs`), stored as UInt64LE.
- **Record layout invariant**: every store's binary record begins with its `tsUs` in the first 8 bytes (UInt64LE). `Store` relies on this to read timestamps generically without depending on the record class shape. The value `0` is reserved as a sentinel for "uninitialized" (e.g. empty candle slots filling cadence gaps); `findByTsUs` skips sentinel slots during binary search.
- **Symbol IDs** are formatted as `<exchange>:<base>:<quote>` (e.g. `binance:eth:usdc`).
- **NN runtime artifacts** live in `data/nn/runtimes/...` (outside the repo via the `data` symlink); architectures are in `configs/nn/...`; prepared datasets in `data/nn/datasets/...`.
- **Fingerprints** (stable short hashes of JSON-serialisable configs) are computed via `src/utils/Fingerprint.js`. Both `NeuralNetwork` (over `{data, train}`) and `DataSet` (over `data`) use it.
