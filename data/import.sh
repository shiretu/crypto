#!/bin/sh

set -e

zip_file="${1}"
sym="$(basename "$zip_file" | sed -E 's/^([A-Z0-9]+)-.*/\1/')"

unzip -p "$zip_file" | ch_cl --query "
INSERT INTO market.trades
SELECT
    '${sym}' AS symbol,
    id,
    price,
    qty,
    quoteQty AS quote_qty,
    -- Auto-detect micros vs millis
    toDateTime64(
        if(length(time_ms) > 13,
           toUInt64(time_ms) / 1000000.0,
           toUInt64(time_ms) / 1000.0),
        3
    ) AS ts,
    toUInt8(lower(isBuyerMaker) = 'true') AS is_buyer_maker,
    toUInt8(lower(isBestMatch)  = 'true') AS is_best_match
FROM input(
    'id UInt64,
     price Decimal(20,8),
     qty Decimal(38,18),
     quoteQty Decimal(38,18),
     time_ms String,
     isBuyerMaker String,
     isBestMatch String'
) FORMAT CSV
"

# ch_cl --query "
# SELECT
#     symbol,
#     count(),
#     min(ts),
#     max(ts)
# FROM market.trades
# GROUP BY symbol;
# "
