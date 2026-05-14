# Rules

Uncategorized brain-dump of rules, conventions, and constraints. Drop entries here as they come to mind — categorize/split later.

## Naming

- **Ordered files use `NN_` prefix** (two-digit number + underscore, not hyphen). Applies anywhere ordering matters: `ai-hints/01_generic/01_folder-structure.md`, `tests/00_Day.test.js`, etc. Excludes `old/` (frozen history).

## JavaScript style

- **Use arrow functions, not the `function` keyword.** Top-level helpers become `const foo = (...) => {...}` (or `export const foo = ...`). Class methods stay as methods. Applies to all code outside `old/`.

## Commits

When the user asks for a git commit (e.g. "commit", "commit and push", "let's make a milestone"), **do these steps first, in order**, before running `git add`/`commit`/`push`:

1. **Update `ai-hints/`** so every doc that touches the affected area reflects the new code. Cross-check at minimum:
   - `01_generic/01_folder-structure.md` if any folder layout / convention changed.
   - The relevant `02_nn/*.md` (or other topical) file if NN / data / config shape changed.
   - Any code path mentioned by a fenced example in a hint file.
2. **Update unit tests** under `tests/`:
   - Add tests for new public classes / functions / CLI shapes.
   - Update existing tests whose subject changed (renames, signature changes, new fields).
   - Preserve dependency ordering (lower-numbered tests must remain passing before higher ones are run). If a new dependency must run before an existing test, **renumber with `git mv`** rather than appending out of order.
3. **Run `npm test`** and confirm everything passes (and report the count).

Only after these three steps proceed with the commit.
