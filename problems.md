# Problems to Address

## Fixed
- [x] 3. ~~Monthly files loaded fully into RAM~~ — refactored to daily files
- [x] 7. ~~`data/` folder not in .gitignore~~ — added data/trades and data/candles
- [x] 8. ~~Duplicated `nextDay`/`compareDates`~~ — extracted to src/utils/date.js
- [x] 9. ~~Duplicated `parseDate`/`yesterday`/`fmtDate`~~ — extracted to src/utils/date.js and cli.js
- [x] 10. ~~Unused variable `file` in Trades.readTrades~~ — removed
- [x] 11. ~~`allAssets()` returns duplicates~~ — deduplicated with Set
- [x] 12. ~~`yesterday()` uses local timezone~~ — now uses UTC in date.js
- [x] 13. ~~No bounds check in `readTradeAt`~~ — validates srcId alignment, file bounds, and tsUs match
- [x] 14. ~~Candles/Trades re-fetch empty days~~ — empty files left as sentinels
- [x] 15. ~~Unused dependencies~~ — removed @clickhouse/client and ws
- [x] 16. ~~Unused `#hasDay` in Trades~~ — now used by #ensureDay
- [x] 17. ~~`src/sources/` naming~~ — renamed to src/stores/
- [x] 18. ~~Case-sensitive import in Candles.js~~ — fixed `./trades.js` to `./Trades.js`
- [x] 19. ~~Candle rehydration loses OHLC on same-tsUs trades~~ — tsUs now guaranteed unique at import (sub-ms increment)
- [x] 20. ~~Negative srcId written as unsigned BigInt~~ — srcId now required in constructor, validated non-negative, immutable
- [x] 22. ~~No tests for date.js, cli.js, readTradeAt~~ — added tests for date utils and readTradeAt

## Still Open

### Medium
- [ ] 1. **Downloader interface is implicit** — no enforced contract for downloaders.
- [ ] 21. **No NaN guard on CSV parsing** — malformed CSV lines silently inject garbage.

### Low
- [ ] 4. **Symbol.parse() is fragile** — hardcoded quote list, breaks on edge cases.
- [ ] 23. **Duplicated CSV parsing in BinanceDownloader transform/flush** — identical logic in both callbacks.
- [ ] 24. **`parseDate` accepts invalid dates** — `2024-13-45` passes regex, no semantic validation.
- [ ] 25. **`CandleDuration.js` naming** — PascalCase but not a class. Should be lowercase per convention.
- [ ] 26. **`allAssets()` not sorted** — unlike `Exchange.assets` which sorts alphabetically.
