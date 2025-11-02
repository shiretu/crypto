#!/bin/bash

# bail on error
set -e

# Source unified Python environment setup
source "$(dirname "$0")/setup_python.sh"

# Run the plotter script
python3 plot_learning_log.py "$@"
