# Rules

Uncategorized brain-dump of rules, conventions, and constraints. Drop entries here as they come to mind — categorize/split later.

## Naming

- **Ordered files use `NN_` prefix** (two-digit number + underscore, not hyphen). Applies anywhere ordering matters: `ai-hints/01_generic/01_folder-structure.md`, `tests/00_Day.test.js`, etc. Excludes `old/` (frozen history).

## JavaScript style

- **Use arrow functions, not the `function` keyword.** Top-level helpers become `const foo = (...) => {...}` (or `export const foo = ...`). Class methods stay as methods. Applies to all code outside `old/`.

## Data directory is read-only

**Never delete, rename, or overwrite anything under `data/`** without explicit permission from the user. This applies to **all** subtrees: `data/trades/`, `data/candles/`, `data/outcomes/`, `data/nn/`, and anything added later.

- That folder contains expensive-to-produce assets (downloaded trade history, computed candles, computed outcomes, produced datasets, trained runtimes).
- Do **not** `rm`, `rm -rf`, `mv` over existing files, `fs.unlink`, `fs.rm`, `fs.writeFileSync` to an existing path, or any other destructive operation against paths under `data/` — not even to clean up after a failed run, not even "obviously empty" or "obviously corrupt" files.
- If a file there looks wrong (0 bytes, malformed, stale), **report it to the user and stop**. Let them decide whether to keep, regenerate, or remove it.
- Code under `src/stores/` is allowed to create new files under `data/` as part of its normal compute-on-miss flow — that's append-only behavior, not deletion. The rule above is about agent-initiated cleanup, not about runtime writes performed by the stores themselves.

## Commits

When the user asks for a git commit (e.g. "commit", "commit and push", "let's make a milestone"), **do these steps first, in order**, before running `git add`/`commit`/`push`:

1. **Update `ai-hints/`** so every doc that touches the affected area reflects the new code. Cross-check at minimum:
   - `01_generic/01_folder-structure.md` if any folder layout / convention changed.
   - The relevant `02_nn/*.md` (or other topical) file if NN / data / config shape changed.
   - Any code path mentioned by a fenced example in a hint file.
2. **Update unit tests** under `tests/`:
   - Add tests for new public classes / functions / CLI shapes.
   - Update existing tests whose subject changed (renames, signature changes, new fields).
   - **Numbering is dependency order and must be contiguous.** Lower-numbered tests must remain passing before higher ones are run, AND the sequence `NN_*.test.js` must have no gaps (`00_…` through `NN_…` with every number present). When inserting a test in the middle, `git mv` higher-numbered tests up to make room. When removing or merging tests, `git mv` higher-numbered tests down to close the gap. Never leave an unused slot just because higher-numbered tests once occupied it.
3. **Run `npm test`** and confirm everything passes (and report the count).

Only after these three steps proceed with the commit.
