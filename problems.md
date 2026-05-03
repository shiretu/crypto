# Problems to Address

- [ ] 1. **Downloader interface is implicit** — No enforced contract for `downloadMonth(symbol, year, month, writeStream)`. A future exchange with a different data model (monthly ZIPs, paginated API) would break the assumption.

- [ ] 2. **TradeStore mixes fetching and reading** — `ensureMonth` (download) and `readTrades` (read) are two different concerns in the same class.

- [ ] 3. **Monthly files loaded fully into RAM** — `readTrades` uses `fs.readFileSync`, loading an entire month (~1-2GB for BTC) into memory at once.

- [ ] 4. **Symbol.parse() is fragile** — Guesses quote asset by suffix matching a hardcoded list. Edge cases like `USDCUSDT` would parse incorrectly. May be unnecessary since exchanges define symbols explicitly.

- [ ] 5. **No runtime shape check for downloaders** — Exchange constructor accepts any object as downloader without verifying it has the required methods.

- [ ] 6. **`src/sources/` naming is stale** — Only contains `TradeStore.js`. Name no longer reflects content. Consider `storage/` or moving TradeStore to `core/`.

- [ ] 7. **`data/` folder not in .gitignore** — Binary trade files should not be committed.
