# Timestamp Normalization

## Goal
Preserve time-of-day patterns, remove calendar date knowledge to avoid overfitting on specific real-world events.

## Method
- Take the first timestamp in the dataset/window
- Compute 00:00 UTC of that day
- Subtract that anchor from all timestamps in the window
- Result: hours since midnight of the first day (can exceed 24 for multi-day spans)

## Example (window starting Monday 14:00 UTC)
- Anchor: Monday 00:00 UTC
- Monday 14:00 → 14.0h
- Monday 23:30 → 23.5h
- Tuesday 02:15 → 26.25h

## What this preserves
- Intraday volume/volatility patterns
- Session awareness (Asia, Europe, US)
- Relative timing between data points

## What this removes
- Which year/month/day it is
- Correlation with specific news events (elections, hacks, etc.)
- Seasonal overfitting
