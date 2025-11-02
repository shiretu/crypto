import sys
import os

import numpy as np
import json


# Take model name from command line
if len(sys.argv) < 2:
    print(f"Usage: {sys.argv[0]} <model_name>")
    sys.exit(1)
model_name = sys.argv[1]


# Derive architecture.json path: go one folder up from script, then into models
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
ARCH_PATH = os.path.join(PROJECT_ROOT, 'models', model_name, 'architecture.json')
with open(ARCH_PATH, 'r') as f:
    arch = json.load(f)


INPUTS_COUNT = arch['inputs_count']
OUTPUTS_COUNT = arch['outputs_count']
BYTES_PER_SAMPLE = (INPUTS_COUNT + OUTPUTS_COUNT) * 4  # float32

def print_bytes_info(data):
    # Print first 5 and last 5 bytes as integers
    if len(data) < 10:
        print(f"Sample too small: {len(data)} bytes")
        return
    first5 = list(data[:5])
    last5 = list(data[-5:])
    print(f"First 5 bytes: {first5}")
    print(f"Last 5 bytes: {last5}")

if __name__ == "__main__":
    print(f"We expect {BYTES_PER_SAMPLE} bytes per message.")
    while True:
        raw = sys.stdin.buffer.read(BYTES_PER_SAMPLE)
        if not raw or len(raw) < BYTES_PER_SAMPLE:
            print("End of input or incomplete sample.")
            break
        print_bytes_info(raw)
        sys.stdout.flush()
