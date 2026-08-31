/**
 * Advanced Technical Indicators
 * MACD, Bollinger Bands, Support/Resistance, Fibonacci, Stochastic, ADX, OBV, VWAP
 */

// RSI
export function calculateRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses += Math.abs(diff);
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) { avgGain = (avgGain * (period - 1) + diff) / period; avgLoss = (avgLoss * (period - 1)) / period; }
    else { avgGain = (avgGain * (period - 1)) / period; avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period; }
  }
  if (avgLoss === 0) return 100;
  return Number((100 - (100 / (1 + avgGain / avgLoss))).toFixed(2));
}

// EMA
export function calculateEMA(closes, period) {
  if (!closes || closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = (closes[i] * k) + (ema * (1 - k));
  return Number(ema.toFixed(8));
}

// SMA
export function calculateSMA(values, period) {
  if (!values || values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// MACD (12, 26, 9)
export function calculateMACD(closes) {
  if (!closes || closes.length < 35) return null;
  const ema12 = calculateEMAArray(closes, 12);
  const ema26 = calculateEMAArray(closes, 26);
  if (!ema12 || !ema26) return null;

  const macdLine = [];
  const startIdx = 25; // ema26 starts producing values at index 25
  for (let i = startIdx; i < closes.length; i++) {
    macdLine.push(ema12[i] - ema26[i]);
  }

  if (macdLine.length < 9) return null;
  const signalLine = calculateEMAFromArray(macdLine, 9);
  const currentMacd = macdLine[macdLine.length - 1];
  const prevMacd = macdLine[macdLine.length - 2];
  const currentSignal = signalLine[signalLine.length - 1];
  const prevSignal = signalLine[signalLine.length - 2];
  const histogram = currentMacd - currentSignal;
  const prevHistogram = prevMacd - prevSignal;

  let crossover = null;
  if (prevMacd <= prevSignal && currentMacd > currentSignal) crossover = 'BULLISH';
  if (prevMacd >= prevSignal && currentMacd < currentSignal) crossover = 'BEARISH';

  // Divergence: price making new low but MACD making higher low (bullish div) etc.
  let divergence = null;
  if (macdLine.length >= 10) {
    const recentCloses = closes.slice(-10);
    const recentMacd = macdLine.slice(-10);
    const priceNewLow = recentCloses[recentCloses.length - 1] < Math.min(...recentCloses.slice(0, 5));
    const macdHigherLow = recentMacd[recentMacd.length - 1] > Math.min(...recentMacd.slice(0, 5));
    const priceNewHigh = recentCloses[recentCloses.length - 1] > Math.max(...recentCloses.slice(0, 5));
    const macdLowerHigh = recentMacd[recentMacd.length - 1] < Math.max(...recentMacd.slice(0, 5));

    if (priceNewLow && macdHigherLow) divergence = 'BULLISH_DIVERGENCE';
    if (priceNewHigh && macdLowerHigh) divergence = 'BEARISH_DIVERGENCE';
  }

  return {
    macd: Number(currentMacd.toFixed(6)),
    signal: Number(currentSignal.toFixed(6)),
    histogram: Number(histogram.toFixed(6)),
    prevHistogram: Number(prevHistogram.toFixed(6)),
    histogramGrowing: Math.abs(histogram) > Math.abs(prevHistogram),
    crossover,
    divergence,
    momentum: histogram > 0 ? 'BULLISH' : 'BEARISH'
  };
}

// Bollinger Bands (20, 2)
export function calculateBollinger(closes, period = 20, stdDev = 2) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const std = Math.sqrt(variance);

  const upper = sma + (std * stdDev);
  const lower = sma - (std * stdDev);
  const currentPrice = closes[closes.length - 1];
  const bandwidth = ((upper - lower) / sma) * 100;
  const percentB = ((currentPrice - lower) / (upper - lower)) * 100;

  let position = 'MID';
  if (percentB >= 90) position = 'UPPER_TOUCH';
  else if (percentB >= 75) position = 'UPPER_ZONE';
  else if (percentB <= 10) position = 'LOWER_TOUCH';
  else if (percentB <= 25) position = 'LOWER_ZONE';

  return {
    upper: Number(upper.toFixed(6)),
    middle: Number(sma.toFixed(6)),
    lower: Number(lower.toFixed(6)),
    bandwidth: Number(bandwidth.toFixed(2)),
    percentB: Number(percentB.toFixed(1)),
    position,
    squeeze: bandwidth < 3 // Tight squeeze = volatility expansion incoming
  };
}

// Stochastic RSI
export function calculateStochRSI(closes, rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3) {
  if (!closes || closes.length < rsiPeriod + stochPeriod + 5) return null;

  // Calculate RSI for each point
  const rsiValues = [];
  for (let i = rsiPeriod + 1; i <= closes.length; i++) {
    const rsi = calculateRSI(closes.slice(0, i), rsiPeriod);
    if (rsi !== null) rsiValues.push(rsi);
  }

  if (rsiValues.length < stochPeriod) return null;

  const stochK = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const window = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const min = Math.min(...window);
    const max = Math.max(...window);
    const k = max === min ? 50 : ((rsiValues[i] - min) / (max - min)) * 100;
    stochK.push(k);
  }

  if (stochK.length < kSmooth) return null;

  // Smooth K
  const smoothedK = [];
  for (let i = kSmooth - 1; i < stochK.length; i++) {
    const avg = stochK.slice(i - kSmooth + 1, i + 1).reduce((a, b) => a + b, 0) / kSmooth;
    smoothedK.push(avg);
  }

  // D line
  const dLine = [];
  for (let i = dSmooth - 1; i < smoothedK.length; i++) {
    const avg = smoothedK.slice(i - dSmooth + 1, i + 1).reduce((a, b) => a + b, 0) / dSmooth;
    dLine.push(avg);
  }

  const k = smoothedK[smoothedK.length - 1];
  const d = dLine[dLine.length - 1];

  let zone = 'NEUTRAL';
  if (k <= 20 && d <= 20) zone = 'OVERSOLD';
  else if (k >= 80 && d >= 80) zone = 'OVERBOUGHT';

  return {
    k: Number(k.toFixed(1)),
    d: Number(d.toFixed(1)),
    zone,
    crossover: k > d ? 'BULLISH' : 'BEARISH'
  };
}

// ATR (Average True Range)
export function calculateATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// Support & Resistance (Pivot Points from recent swing highs/lows)
export function findSupportResistance(candles, lookback = 30) {
  if (!candles || candles.length < lookback) return { supports: [], resistances: [] };

  const recent = candles.slice(-lookback);
  const supports = [];
  const resistances = [];

  // Find local minima (supports) and maxima (resistances)
  for (let i = 2; i < recent.length - 2; i++) {
    const isSwingLow = recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low &&
                        recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low;
    const isSwingHigh = recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high &&
                         recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high;

    if (isSwingLow) supports.push(recent[i].low);
    if (isSwingHigh) resistances.push(recent[i].high);
  }

  // Cluster nearby levels (within 0.3%)
  const clusterLevels = (levels) => {
    if (levels.length === 0) return [];
    levels.sort((a, b) => a - b);
    const clusters = [[levels[0]]];
    for (let i = 1; i < levels.length; i++) {
      const lastCluster = clusters[clusters.length - 1];
      const lastAvg = lastCluster.reduce((a, b) => a + b, 0) / lastCluster.length;
      if (Math.abs(levels[i] - lastAvg) / lastAvg < 0.003) {
        lastCluster.push(levels[i]);
      } else {
        clusters.push([levels[i]]);
      }
    }
    return clusters
      .map(c => ({ level: Number((c.reduce((a, b) => a + b, 0) / c.length).toFixed(6)), touches: c.length }))
      .sort((a, b) => b.touches - a.touches)
      .slice(0, 3);
  };

  return {
    supports: clusterLevels(supports),
    resistances: clusterLevels(resistances)
  };
}

// Fibonacci Retracement from recent high-low range
export function calculateFibonacci(candles, lookback = 50) {
  if (!candles || candles.length < lookback) return null;

  const recent = candles.slice(-lookback);
  let highPrice = -Infinity, lowPrice = Infinity;
  let highIdx = 0, lowIdx = 0;

  for (let i = 0; i < recent.length; i++) {
    if (recent[i].high > highPrice) { highPrice = recent[i].high; highIdx = i; }
    if (recent[i].low < lowPrice) { lowPrice = recent[i].low; lowIdx = i; }
  }

  const range = highPrice - lowPrice;
  const isUptrend = highIdx > lowIdx; // recent high is after recent low

  const levels = {
    high: highPrice,
    low: lowPrice,
    isUptrend,
    fib236: Number((highPrice - range * 0.236).toFixed(6)),
    fib382: Number((highPrice - range * 0.382).toFixed(6)),
    fib500: Number((highPrice - range * 0.500).toFixed(6)),
    fib618: Number((highPrice - range * 0.618).toFixed(6)),
    fib786: Number((highPrice - range * 0.786).toFixed(6))
  };

  return levels;
}

// Volume Surge Detector
export function checkVolumeSurge(candles, multiplier = 3.0, period = 20) {
  if (!candles || candles.length < period + 1) return null;
  const volumes = candles.map(c => c.volume);
  const currentVolume = volumes[volumes.length - 1];
  const avgVolume = calculateSMA(volumes.slice(-period - 1, -1), period);
  if (avgVolume > 0 && currentVolume >= avgVolume * multiplier) {
    const ratio = Number((currentVolume / avgVolume).toFixed(1));
    const currentCandle = candles[candles.length - 1];
    return { isSurge: true, ratio, isBullish: currentCandle.close >= currentCandle.open, currentVolume, avgVolume };
  }
  return null;
}

// EMA Cross Detector
export function checkEMACross(closes) {
  if (!closes || closes.length < 25) return null;
  const cur9 = calculateEMA(closes, 9), cur21 = calculateEMA(closes, 21);
  const prev9 = calculateEMA(closes.slice(0, -1), 9), prev21 = calculateEMA(closes.slice(0, -1), 21);
  if (!cur9 || !cur21 || !prev9 || !prev21) return null;
  if (prev9 <= prev21 && cur9 > cur21) return { type: 'BULLISH_CROSS', ema9: cur9, ema21: cur21 };
  if (prev9 >= prev21 && cur9 < cur21) return { type: 'BEARISH_CROSS', ema9: cur9, ema21: cur21 };
  return null;
}

// OBV (On-Balance Volume)
export function calculateOBV(candles, period = 20) {
  if (!candles || candles.length < period) return null;
  const recent = candles.slice(-period);
  let obv = 0;
  const obvValues = [0];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].close > recent[i - 1].close) obv += recent[i].volume;
    else if (recent[i].close < recent[i - 1].close) obv -= recent[i].volume;
    obvValues.push(obv);
  }
  const trend = obvValues[obvValues.length - 1] > obvValues[Math.floor(obvValues.length / 2)] ? 'RISING' : 'FALLING';
  return { current: obv, trend };
}

// Market Structure: Higher Highs / Lower Lows
export function analyzeMarketStructure(candles, lookback = 20) {
  if (!candles || candles.length < lookback) return null;
  const recent = candles.slice(-lookback);
  const swingHighs = [], swingLows = [];

  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high &&
        recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high) {
      swingHighs.push(recent[i].high);
    }
    if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low &&
        recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low) {
      swingLows.push(recent[i].low);
    }
  }

  let structure = 'RANGING';
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const hhCount = swingHighs.slice(1).filter((h, i) => h > swingHighs[i]).length;
    const hlCount = swingLows.slice(1).filter((l, i) => l > swingLows[i]).length;
    const lhCount = swingHighs.slice(1).filter((h, i) => h < swingHighs[i]).length;
    const llCount = swingLows.slice(1).filter((l, i) => l < swingLows[i]).length;

    if (hhCount >= 1 && hlCount >= 1) structure = 'UPTREND';
    else if (lhCount >= 1 && llCount >= 1) structure = 'DOWNTREND';
  }

  return {
    structure,
    swingHighs: swingHighs.slice(-3),
    swingLows: swingLows.slice(-3),
    lastSwingHigh: swingHighs[swingHighs.length - 1] || null,
    lastSwingLow: swingLows[swingLows.length - 1] || null
  };
}

// --- internal helpers ---
function calculateEMAArray(closes, period) {
  if (!closes || closes.length < period) return null;
  const k = 2 / (period + 1);
  const result = new Array(closes.length).fill(null);
  result[period - 1] = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    result[i] = (closes[i] * k) + (result[i - 1] * (1 - k));
  }
  return result;
}

function calculateEMAFromArray(values, period) {
  if (!values || values.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = (values[i] * k) + (ema * (1 - k));
    result.push(ema);
  }
  return result;
}
