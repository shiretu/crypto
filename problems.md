# Problems to Address

## Fixed
- [x] 3. ~~Monthly files loaded fully into RAM~~ — refactored to daily files
- [x] 7. ~~`data/` folder not in .gitignore~~ — added data/trades and data/candles
- [x] 8. ~~Duplicated `nextDay`/`compareDates`~~ — extracted to src/utils/dateUtils.js
- [x] 9. ~~Duplicated `parseDate`/`yesterday`/`fmtDate`~~ — extracted to src/utils/dateUtils.js and cliUtils.js
- [x] 10. ~~Unused variable `file` in TradeStore.readTrades~~ — removed
- [x] 11. ~~`allAssets()` returns duplicates~~ — deduplicated with Set
- [x] 15. ~~Unused dependencies~~ — removed @clickhouse/client and ws
- [x] 16. ~~Unused `#hasDay` in TradeStore~~ — now used by #ensureDay

## Still Open
- [ ] 1. **Downloader interface is implicit** — no enforced contract for downloaders.
- [ ] 4. **Symbol.parse() is fragile** — hardcoded quote list, breaks on edge cases.
- [ ] 13. **No bounds check in `readTradeAt`** — corrupt srcId silently reads garbage.
- [ ] 14. **CandleStore re-downloads empty days** — no sentinel file for days with 0 trades.
- [ ] 17. **`src/sources/` naming** — "stores" or "storage" would be more accurate.
