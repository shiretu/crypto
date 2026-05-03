#!/bin/sh

root=$(realpath "$(dirname "$0")/..")
cmdName=$(basename "$0")

(
    cd "$root" || exit 1
    node "$root/src/apps/$cmdName.js" "$@"
)
