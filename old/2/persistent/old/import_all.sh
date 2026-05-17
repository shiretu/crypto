#!/bin/sh

set -e

root_dir=$(dirname $(realpath "$0"))

for zipFile in $(find "${root_dir}"/downloaded/zip -type f -name "*.zip" | sort -n); do
    echo "Importing ${zipFile} ..."
    "${root_dir}"/import.sh "${zipFile}"
done
