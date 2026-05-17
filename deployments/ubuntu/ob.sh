#!/bin/sh

set -e

symbol="$1"
if [ -z "${symbol}" ]; then
    echo "usage: $0 <symbol>  (e.g., binance:btc:usdc)" >&2
    exit 2
fi

rootPath=$(realpath "$(dirname "$(realpath "${0}")")"/../..)

cd "${rootPath}"
npm i
exec ./scripts/getOrderBook -s "${symbol}" --data-dir /mnt/storage/fast/crypto --data-watchdog 30
