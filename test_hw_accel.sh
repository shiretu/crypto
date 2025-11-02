#!/bin/bash
# Setup Python environment and run hardware detection script
topdir="$(dirname "$0")"
source "$topdir/setup_python.sh"
python3 test_hw_accel.py "$@"
