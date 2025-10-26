NUM_LOG_LINES = 500  # Number of most recent log lines to plot

import re
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.widgets import Button
import threading
import argparse

def extract_data(num_log_lines):
    with open('learning_logs.txt', 'r') as f:
        lines = f.readlines()
    samples = []
    losses = []
    maes = []
    pattern = re.compile(r'Sample (\d+) \| Trade [^|]+ \| Loss: ([\d.]+) \| MAE: ([\d.]+)')
    log_lines = lines[-num_log_lines:] if len(lines) > num_log_lines else lines
    for line in log_lines:
        m = pattern.search(line)
        if m:
            samples.append(int(m.group(1)))
            losses.append(float(m.group(2)))
            maes.append(float(m.group(3)))
    return samples, losses, maes

def plot_data(ax, samples, losses, maes):
    ax.clear()
    ax.plot(samples, losses, label='Loss')
    ax.plot(samples, maes, label='MAE')
    if len(samples) > 1:
        z = np.polyfit(samples, losses, 1)
        p = np.poly1d(z)
        ax.plot(samples, p(samples), 'r--', label='Loss Trend')
    ax.set_xlabel('Sample')
    ax.set_ylabel('Value')
    ax.set_title('Training Loss and MAE over Samples')
    ax.legend()
    ax.grid(True)
    plt.tight_layout()
    plt.draw()


def refresh(event=None):
    samples, losses, maes = extract_data(args.lines)
    plot_data(ax, samples, losses, maes)

def auto_refresh():
    refresh()
    # Schedule next refresh in 5 seconds
    threading.Timer(5.0, auto_refresh).start()


def parse_args():
    parser = argparse.ArgumentParser(description='Plot training loss and MAE from log file.')
    parser.add_argument('--lines', type=int, default=500, help='Number of most recent log lines to plot (default: 500)')
    return parser.parse_args()

if __name__ == '__main__':
    args = parse_args()
    fig, ax = plt.subplots(figsize=(12, 6))
    plt.subplots_adjust(bottom=0.15)
    samples, losses, maes = extract_data(args.lines)
    plot_data(ax, samples, losses, maes)

    ax_refresh = plt.axes([0.8, 0.025, 0.1, 0.04])
    btn_refresh = Button(ax_refresh, 'Refresh')
    btn_refresh.on_clicked(refresh)

    # Start auto-refresh timer
    auto_refresh()

    plt.show()
