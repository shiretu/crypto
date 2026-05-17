# Order Book Data — L1/L2 from Diff-Depth Stream

## Why not `@bookTicker` for L1

Binance Spot `@bookTicker` is **event-driven and timestamp-less**. Wire payload:

```json
{"u":17496797021,"s":"ETHUSDC","b":"2255.08","B":"6.86","a":"2255.09","A":"22.27"}
```

No `E` (server event time) and no `T` (transaction time). The only time you can attach to a record is **local receive time**, which equals `T_server + mean_latency + jitter`.

### The leakage problem

For NN training, samples pair a candle (server-time-precise) with the most recent L1 state at or before the candle's close. If L1 records are stamped with local receive time, jitter can place an event that *actually* happened **after** the candle close into the "before close" bucket. Once that future-leaked L1 is fed to the NN, the model learns to use information it won't have at inference time — val_acc collapses on live data.

Mean latency you can subtract. **Jitter is the killer**: positive jitter (fast packets) is precisely what punches future events into the past. The bias is directional, not symmetric — you can't average it out.

### The three axes

| Axis | Question | `@bookTicker` | `@depth@100ms` |
|---|---|---|---|
| **Correctness** | Are statements made from this data *true*? | ❌ local time ≠ server time | ✅ `E` is real |
| **Accuracy / precision** | How fine-grained can I be? | sub-ms cadence, wrong clock | 100ms cadence, right clock |
| **Completeness** | Is enough state present for future questions? | ❌ only BBO | ✅ full top-N book |

For an NN where causality matters, `@depth@100ms` wins on the two axes that count. The 100ms accuracy ceiling is the price of admission.

## The stream we use: `@depth@100ms`

Binance Spot diff-depth at 100ms cadence. Wire payload:

```json
{
  "e":"depthUpdate","E":1778847878833,"s":"ETHUSDC",
  "U":17497004763,"u":17497004765,
  "b":[["2255.85","14.27"],["2255.54","0.00"],["2255.53","0.67"]],
  "a":[]
}
```

- `E` — server emit time in **milliseconds** (ground truth for record time).
- `U` / `u` — first / last `updateId` in this batch.
- `b` / `a` — arrays of `[price, qty]` deltas for bids and asks across **all levels** that changed in the 100ms window (not just top-of-book; scattered, not sorted).
- **`qty == 0` ⇒ remove that price level** from the book. **`qty != 0` ⇒ set the level to that quantity.**
- **Empty batches don't fire** — if nothing changed in a 100ms slot, no event arrives. Gap between consecutive `E` values can exceed 100ms during quiet periods.

### Numeric representation: scaled int64, scale embedded per record

All prices and quantities are stored and compared as **signed 64-bit integers, scaled by `10^scaleExp`** where `scaleExp ∈ [0, 15]` is encoded in the record header (see *Byte 7 layout* below). Default for Binance Spot is `scaleExp = 8` (matches the 8-decimal wire format).

- f64 cannot exactly represent most decimal fractions (0.1, 0.2, 2255.43, …). Two values that should be equal can diverge by ±ε under arithmetic or comparison; map keys become unstable. Unacceptable for a canonical order-book store.
- Scaled int64 is **mathematically exact** for every wire value within its scale, supports native integer compare, and uses the same 8 bytes per number as f64.
- `int64` max is `2^63 − 1 ≈ 9.22 × 10^18`. Max representable real value at scale `10^N` is `9.22 × 10^(18−N)`. At `N=8` that's `9.22 × 10^10`, comfortably above any Binance price × qty.
- **Scale is per-record, conventionally constant across a file.** Readers assert all records share the same scale; a mixed-scale file is a writer bug.
- Use **`BigInt`** in JS, encoded LE as int64 on disk via `Buffer.writeBigInt64LE`.

Scale ↔ max-representable-real-value table:

| `scaleExp` | scale | max real value | typical use |
|---|---|---|---|
| 0 | 1 | 9.22 × 10¹⁸ | pure integers |
| 6 | 10⁶ | 9.22 × 10¹² | FX, some venues |
| 8 | 10⁸ | 9.22 × 10¹⁰ | **Binance Spot default** |
| 10 | 10¹⁰ | 9.22 × 10⁸ | high precision but caps qty |
| 15 | 10¹⁵ | 9.22 × 10³ | exotic / tiny values |

Encode wire string → scaled BigInt (scale-aware):

```js
export const encodeScaled = (wireStr, scaleExp) => {
  // "2255.43" at scaleExp=8 → 225_543_000_000n
  const SCALE = 10n ** BigInt(scaleExp)
  const [intPart, fracPart = ''] = wireStr.split('.')
  if (fracPart.length > scaleExp) {
    throw new Error(`value "${wireStr}" has more decimals than scaleExp=${scaleExp}`)
  }
  const padded = (fracPart + '0'.repeat(scaleExp)).slice(0, scaleExp)
  return BigInt(intPart) * SCALE + BigInt(padded)
}
```

Decode scaled BigInt → display string (trailing zeros trimmed):

```js
export const decodeScaled = (n, scaleExp) => {
  const SCALE = 10n ** BigInt(scaleExp)
  const neg = n < 0n
  const abs = neg ? -n : n
  const intPart = abs / SCALE
  const fracDigits = (abs % SCALE).toString().padStart(scaleExp, '0').replace(/0+$/, '')
  return (neg ? '-' : '') + intPart + (fracDigits ? '.' + fracDigits : '')
}
```

### Reconstructing the book

The diff stream **doesn't carry BBO directly**; you maintain a local book and read top-of-book after each batch is applied.

```js
bids = new Map()  // priceScaled (bigint) → qtyScaled (bigint)
asks = new Map()  // priceScaled (bigint) → qtyScaled (bigint)
```

Per batch event, atomically (where `scaleExp` is chosen at collector startup, e.g. `8` for Binance Spot):

```js
for (const [p, q] of event.b) {
  const price = encodeScaled(p, scaleExp)
  const qty   = encodeScaled(q, scaleExp)
  if (qty === 0n) bids.delete(price)
  else            bids.set(price, qty)
}
for (const [p, q] of event.a) {
  const price = encodeScaled(p, scaleExp)
  const qty   = encodeScaled(q, scaleExp)
  if (qty === 0n) asks.delete(price)
  else            asks.set(price, qty)
}
// then read top-of-book from the maps
```

- **Map keys are BigInts** — canonical by value, exact equality, no collision risk.
- BBO read = `max([...bids.keys()])` / `min([...asks.keys()])` — native BigInt compare.
- **Apply the whole batch before reading BBO.** Don't read intermediate state.
- Removing a price not in the map (because it was beyond your bootstrap snapshot depth) is a silent no-op.

### Bootstrap protocol

Per Binance docs:

1. Open WS, start buffering events.
2. `GET https://api.binance.com/api/v3/depth?symbol=ETHUSDC&limit=5000` → returns `{lastUpdateId, bids, asks}`. Seed both maps.
3. Discard buffered events with `u < lastUpdateId`.
4. Verify first applied event satisfies `U <= lastUpdateId + 1 <= u`. If not, snapshot was stale — re-fetch.
5. Apply events in order. Check `U === previous.u + 1` for each subsequent event. **Any gap ⇒ desync; re-bootstrap from scratch.**

## Causal pairing rule for samples

For a sample anchored at trade-of-interest `T_t`:

- **X1**: 60 closed candles ending at `C_n` with `C_n.closeTime <= T_t`.
- **X2**: the trade at `T_t` itself (price, qty, side). Trade events carry their own server time `T`.
- **X3**: order-book state reconstructed from the most recent record with **`E < T_t` (strict)**.
- **Y**: forward outcome (unchanged from existing pipeline).

### Why strict `<`, not `<=`

When a trade lands at `T_t`, its consumption of liquidity is reflected in the **next** depth batch (the one with smallest `E ≥ T_t`). If `T_t` happens to coincide with a batch boundary, `E <= T_t` could pick that batch and include the trade's *own effect* — i.e. leak the answer. Strict `E < T_t` keeps the OB strictly pre-trade every time.

Trade-off: max OB staleness becomes ~200ms (worst case: trade lands 1ms after a batch close, then 100ms to next batch, plus a possible quiet gap). For 5-min features this is invisible.

### Staleness quality flag

`T_t − T_o` is worth tracking per sample. Typical values on a liquid pair (ETH/USDC):

- Median: ~50ms
- p95: ~100ms
- Tail: multi-second during dead-quiet periods

Recommend either dropping samples where the gap exceeds a threshold (e.g. 500ms), or feeding the gap itself as an input feature so the NN can learn to discount stale snapshots.

## On-disk archival format

The store keeps the **raw stream**: a chronological log of diff records, with **periodic snapshots** interleaved to bound replay distance and support random access.

### Record layout

Every record begins with a 7-byte ASCII **magic** and a 1-byte **type**, then a fixed 40-byte tail, then variable-length payload:

| offset | size | field |
|---|---|---|
| 0 | 7 | `magic` = `"magic07"` |
| 7 | 1 | `scaleAndFlags` — high nibble = `scaleExp` (0..15), low nibble = flags (bit 0 = snapshot/delta, bits 1-3 reserved) |
| 8 | 8 | `E` server time, **u64 LE μs** |
| 16 | 8 | `prevSnapshotOffset` u64 LE |
| 24 | 8 | `U` firstUpdateId u64 LE |
| 32 | 8 | `u` lastUpdateId u64 LE |
| 40 | 2 | `bidCount` u16 LE |
| 42 | 2 | `askCount` u16 LE |
| 44 | 4 | reserved (zero) |
| 48 | `bidCount × 16` | bids: (price **i64 LE × 10^scaleExp**, qty **i64 LE × 10^scaleExp**) pairs |
| … | `askCount × 16` | asks: (price **i64 LE × 10^scaleExp**, qty **i64 LE × 10^scaleExp**) pairs |

**Total record size = `48 + 16 × (bidCount + askCount)`** — always a multiple of 8, so every record starts on an 8-byte aligned offset. **No padding is ever required**, and any code that writes records must `assert(totalSize % 8 === 0)` before flushing.

Note that `E` is stored in **microseconds** (matching the project's `tsUs` convention), even though the wire format gives milliseconds. Multiply by 1000 on write.

Price and qty are stored as **signed int64 little-endian, scaled by `10^scaleExp`** where `scaleExp` is encoded in byte 7 (see *Byte 7 layout* below). Writers use `Buffer.writeBigInt64LE`; readers use `Buffer.readBigInt64LE` and keep BigInts throughout the pipeline.

### Byte 7 layout — scale + flags

```
bit:   7 6 5 4   3 2 1 0
       └─scale─┘ └─flags─┘
       high nibble        low nibble
       scaleExp (0..15)   flag bits
```

- **High nibble = `scaleExp`** — exponent of the int64 scale (`stored_value = real_value × 10^scaleExp`). Lets readers decode prices/qtys without external metadata.
- **Low nibble = flags:**
  - `bit 0`: **`0`** = snapshot, **`1`** = delta
  - `bits 1-3`: reserved, **must be `0`**. Writers enforce; readers reject if non-zero.

Examples (in hex):

| byte 7 | meaning |
|---|---|
| `0x80` | snapshot, scale 10⁸ |
| `0x81` | delta, scale 10⁸ |
| `0x60` | snapshot, scale 10⁶ |
| `0xA1` | delta, scale 10¹⁰ |

**Reader contract:**

```js
const sf       = buf.readUInt8(off + 7)
const scaleExp = (sf >> 4) & 0x0f       // 0..15
const flags    = sf & 0x0f
const isDelta  = (flags & 0x01) === 1
if ((flags & 0b1110) !== 0) throw new Error('reserved flag bits set')
```

**Writer contract:**

```js
const sf = (scaleExp << 4) | (isDelta ? 0x01 : 0x00)
buf.writeUInt8(sf, off + 7)
```

**Per-file invariant:** all records in a single day file must use the same `scaleExp`. On open, the reader records the scale of the first record and asserts every subsequent record matches; mismatch is a fatal error indicating a writer bug. If we ever need to change scale for a venue, we start a fresh day file.

### The magic and what it buys

- **Forensic recovery**: `grep -aob "magic07" damaged.bin` lists every record boundary in a torn or truncated file. Read the 48-byte header at each hit, validate (`scaleExp ≤ 15`, reserved flag bits zero, monotonically increasing `E`, sane counts), and concatenate survivors.
- **Index-free binary search**: mmap, jump to mid-file, scan forward for `"magic07"` (only at 8-aligned offsets — 8× fewer comparisons than naive), read `E`, recurse on the right half. Worst-case scan distance is bounded by max record size.
- **Grep-ability**: the ASCII magic is visible in `strings` / `xxd` / hex dumps. Debugging is much nicer than with a binary sync word.

False-match probability in payload: `1/256^7 ≈ 10^-17` per byte window. At ~200MB/day = ~2×10^8 windows, expected accidental matches per day ≈ `2×10^-9` (i.e. never).

### Snapshot policy

- **First record of every day file is a snapshot.** This makes each day file self-bootstrapping — no cross-file replay needed for random access.
- **In-day re-snapshot every 5 minutes.** Bounds maximum replay distance to ~5 min of deltas.
- **Snapshot depth: top 1000 levels per side.** Covers any feature that touches the LOB beyond top-of-book (microprice, OFI, queue position up to multiple percent from BBO). Once collection starts at top-1000, anything deeper is permanently absent from history — the only choice that's hard to reverse later.
- **Snapshot source: live in-memory book.** No extra REST hit during normal operation; REST is only used for initial bootstrap and gap-recovery.

### Resync on sequence gap

If any incoming event has `U !== prev.u + 1`:

1. Stop applying events; buffer incoming.
2. REST `GET /api/v3/depth?symbol=...&limit=5000`.
3. Re-seed in-memory book from the snapshot.
4. Drop buffered events with `u < snapshot.lastUpdateId`.
5. Verify first applicable event matches the snapshot range; if not, repeat from step 2.
6. Resume normal apply loop.
7. Write a fresh snapshot record to the day file immediately after recovery, with `prevSnapshotOffset` updated for subsequent deltas.

### Day rotation

At midnight UTC:

1. Flush and close the current day file.
2. Open the new day file.
3. Write a snapshot of the current in-memory book as the first record. Its `prevSnapshotOffset` is its own offset (i.e. 0).
4. Continue applying live events, writing deltas with `prevSnapshotOffset` pointing at the day's first snapshot.

## Storage paths

Following the existing convention (`data/candles/binance/<base>/<quote>/YYYY/MM/DD.bin`):

```
data/orderBooks/binance/<base>/<quote>/YYYY/MM/DD.bin
```

One file per symbol per UTC day.

## Read path: book state at time T

1. Open day file containing `T`.
2. Binary search by `E` (using the magic-based aligned scan) → land at the record `R` with the largest `E < T`.
3. Read `R.prevSnapshotOffset` → seek there → load the anchor snapshot into a `Map` per side.
4. Forward-scan from anchor+1 to `R` inclusive, applying each delta to the maps.
5. The maps now hold the exact book state at `E_R`. By construction, `E_R < T`, so causality is guaranteed.

Worst-case replay distance: one snapshot interval (~5 min of deltas).

## Bandwidth estimates (ETH/USDC, baseline)

- Deltas: ~130–200MB/day (rate ~8 batches/sec when active, ~6–10 levels per batch on average).
- Snapshots: ~9MB/day (288 snapshots/day × ~33KB each at top-1000 × 2 sides).
- Total disk: ~150–220MB/day per symbol.

## Co-location note

The 100ms quantization in `@depth` is Binance's design choice and cannot be reduced on Spot. The only way to push the timing uncertainty below ms-level — relevant only for microstructure features, not for 5-min features — is to **co-locate the collector in AWS Tokyo `ap-northeast-1`** (Binance's matching-engine region). A `t3.nano` is ~$5/mo; RTT drops to 1–2ms with sub-ms jitter, and local receive time becomes a near-perfect proxy for server emit time even on streams that lack `E`. Not needed for the current NN; document as the long-term path.

## Files and naming

Following existing patterns (`Candle.js` + `Candles.js`, `Trade.js` + `Trades.js`):

- `src/core/OrderBook.js` — record format helpers (magic, header layout, snapshot/delta read/write, alignment assertion).
- `src/stores/OrderBooks.js` — `Store` subclass for read-side access (binary search by `E`, book reconstruction at time `T`).
- `src/apps/getOrderBook.js` — collector daemon, one process per symbol (mirrors the existing `getCandles` / `getTrades` shape).
- `scripts/getOrderBook` — symlink → `generic.sh`.
