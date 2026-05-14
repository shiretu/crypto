# Rules

Uncategorized brain-dump of rules, conventions, and constraints. Drop entries here as they come to mind — categorize/split later.

## Naming

- **Ordered files use `NN_` prefix** (two-digit number + underscore, not hyphen). Applies anywhere ordering matters: `ai-hints/01_generic/01_folder-structure.md`, `tests/00_Day.test.js`, etc. Excludes `old/` (frozen history).

## JavaScript style

- **Use arrow functions, not the `function` keyword.** Top-level helpers become `const foo = (...) => {...}` (or `export const foo = ...`). Class methods stay as methods. Applies to all code outside `old/`.
