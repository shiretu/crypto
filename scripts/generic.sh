#!/bin/sh

root=$(realpath "$(dirname "$0")/..")
cmdName=$(basename "$0")

export UV_THREADPOOL_SIZE=${UV_THREADPOOL_SIZE:-128}

cd "$root" || exit 1
exec node "$root/src/apps/$cmdName.js" "$@"
