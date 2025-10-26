#!/bin/bash

# bail on error
set -e

# Create Python virtual environment and run the plotter
VENV_DIR=".venv"
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"

# Upgrade pip and install required packages
pip install --upgrade pip
pip install matplotlib

# Run the plotter script
python3 plot_learning_log.py "$@"
