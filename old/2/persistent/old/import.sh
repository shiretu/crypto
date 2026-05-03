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
    baseQty,
    quoteQty,
    if(length(time_ms) > 13,
        toUInt64(time_ms),
        toUInt64(time_ms) * 1000
    ) AS ts,
    toUInt8(lower(isBuyerMaker) = 'true') AS isBuyerMaker,
    toUInt8(lower(isBestMatch)  = 'true') AS isBestMatch
FROM input(
    'id UInt64,
    price Decimal(38,18),
    baseQty Decimal(38,18),
    quoteQty Decimal(38,18),
    time_ms String,
    isBuyerMaker String,
    isBestMatch String'
) FORMAT CSV
"
