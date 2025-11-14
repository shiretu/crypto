# Real-Time Trading Neural Network Architecture

## 🏗️ Network Architecture Overview

**Input**: 2,163 features → **Output**: 2 values (grossBuy, grossSell)

The network uses a maximum precision 8-layer dense architecture with 76M+ parameters:
- **Sequential dense layers** for progressive feature extraction
- **Dropout regularization** to prevent overfitting
- **Linear output** for dual trading predictions
- **Real-time WebSocket training** for continuous learning

## 📊 Input Feature Structure

The 2,163 input features are organized as follows:

### Feature Breakdown
```javascript
// Total input: [batch_size, 2163]
// Feature composition:

candleData = input[:, 0:1079]       // 1080 candle features (120 × 9)
  ├── opens, highs, lows, closes: 480 features
  ├── volumes, timestamps: 240 features  
  ├── colors, bodySizes: 240 features
  └── tradesCount: 120 features ✅ NEW!
studyData = input[:, 1080:1919]     // 840 study features (120 × 7) 
patternData = input[:, 1920:2156]   // 237 pattern features (placeholder zeros)
globalData = input[:, 2157:2162]    // 6 global context features

// All features are pre-normalized to neural network friendly ranges
```

### Data Preprocessing
```javascript
// Features are normalized during data preparation:
// - Price data: scaled relative to recent ranges
// - Volume data: log-normalized
// - Technical indicators: standardized
// - Timestamps: converted to relative values
```

## 🧠 Network Architecture

The network uses a straightforward 6-layer dense architecture as defined in `models/myFirstModel/architecture.json`:

### Layer Structure (Maximum Precision Architecture)
```javascript
// Layer 1: Primary Feature Extraction
Dense(8192, activation='relu') + Dropout(0.5)

// Layer 2: Secondary Feature Processing
Dense(6144, activation='relu') + Dropout(0.5)

// Layer 3: Tertiary Feature Processing
Dense(4096, activation='relu') + Dropout(0.4)

// Layer 4: Pattern Recognition
Dense(2048, activation='relu') + Dropout(0.4)

// Layer 5: Feature Fusion
Dense(1024, activation='relu') + Dropout(0.3)

// Layer 6: Decision Processing
Dense(512, activation='relu') + Dropout(0.2)

// Layer 7: Signal Extraction
Dense(256, activation='relu') + Dropout(0.1)

// Layer 8: Signal Refinement
Dense(128, activation='relu')

// Layer 9: Final Processing
Dense(64, activation='relu')

// Layer 10: Trading Outcomes
Dense(2, activation='linear')  // grossBuy, grossSell
```

### Network Definition
The architecture is defined in `models/myFirstModel/architecture.json` and loaded dynamically by the training server.

## 🎯 Output Structure

### Dual Trading Predictions
```javascript
// Network outputs 2 values:
output = [grossBuy, grossSell]

// grossBuy: Expected outcome for BUY position
// grossSell: Expected outcome for SELL position
// Values are continuous predictions of profit/loss
```

### Training Targets
```javascript
// Training samples include both outcomes:
{
  features: [2043 normalized values],
  labels: [grossBuy_actual, grossSell_actual]
}

// The network learns to predict both scenarios simultaneously
// Decision logic chooses the action with highest predicted return
```

## 📋 Model Creation and Training

### Architecture Loading
The model is created dynamically from `architecture.json` configuration. The training server loads the JSON specification and builds the TensorFlow.js model with the defined layers, activations, and dropout rates.

### Real-Time Training
Training occurs via WebSocket API where clients send batches of samples. Each sample contains 2,043 features and 2 target labels (grossBuy, grossSell outcomes). The model trains immediately on received data using single epochs for continuous learning.

## 📊 Model Statistics

### Architecture Summary
```
Input Features: 2,163
Output Features: 2 (grossBuy, grossSell)
Total Parameters: ~76.1M parameters (maximum precision)

Layer Distribution:
- Dense(8192): ~17.7M parameters (primary feature extraction)
- Dense(6144): ~50.3M parameters (secondary processing) 
- Dense(4096): ~25.2M parameters (tertiary processing)
- Dense(2048): ~8.4M parameters (pattern recognition)
- Dense(1024): ~2.1M parameters (feature fusion)
- Dense(512): ~524K parameters (decision processing)
- Dense(256): ~131K parameters (signal extraction)
- Dense(128): ~33K parameters (signal refinement)
- Dense(64): ~8K parameters (final processing)
- Dense(2): ~130 parameters (trading outcomes)

Memory Usage: ~300MB for model weights
Training Memory: ~3-10GB (depends on batch size)
```

### Real-Time Training Configuration
```javascript
// From src/train.js and architecture.json configuration
const config = {
    optimizer: 'rmsprop',
    learningRate: 0.000005,      // Ultra-low for maximum precision
    batchSize: 32,
    epochs: 1,                   // Single epoch for streaming
    validationSplit: 0.0,        // No validation for real-time
    modelName: 'myFirstModel'
}

// Performance Metrics (actual results)
const performanceStats = {
    samplesPerSecond: 810,       // Sustained throughput (76M params)
    totalSamplesTrained: 743000, // Historical total
    lossReduction: 99.89,        // Percentage improvement
    concurrentConnections: 20,   // WebSocket capacity
    dataAvailable: 1821158      // Total candles (4+ years BTCUSDC)
}
```

## 🎯 Key Design Decisions

### 1. **Simplicity Over Complexity**
- **Dense layers only**: Simpler than LSTM/attention approaches
- **Sequential architecture**: Easier to debug and modify  
- **Direct feature processing**: No feature grouping complexity

### 2. **Real-Time Training Focus**
- **Single epoch per batch**: Optimized for streaming data
- **No validation split**: All data used for training
- **Immediate model updates**: Learn from every sample

### 3. **Dual Output Strategy**
- **Simultaneous predictions**: Both BUY and SELL outcomes
- **Comparative learning**: Network learns which action is better
- **Risk assessment**: Both negative outputs indicate no-trade

### 4. **Regularization Strategy** 
- **Dropout only**: Simple and effective overfitting prevention
- **Progressive rates**: Higher dropout (0.3) early, lower (0.2) later
- **No batch normalization**: Reduces complexity for real-time training

### 5. **Output Design**
- **Linear activation**: Unbounded predictions for profit/loss
- **Dual outputs**: Independent BUY/SELL outcome predictions  
- **MSE loss**: Regression approach for continuous outcomes

## This architecture is designed to:
- ✅ Handle 2,043-feature trading data efficiently
- ✅ Learn from both BUY and SELL scenarios simultaneously  
- ✅ Provide real-time training via WebSocket API
- ✅ Scale to high-frequency trading applications
- ✅ Maintain performance with continuous learning

