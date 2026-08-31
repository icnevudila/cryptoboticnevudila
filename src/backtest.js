/**
 * Backtest Engine
 * Tests the position strategy on historical Binance kline data.
 * Simulates entry, SL, TP1/TP2/TP3 on past candles.
 */

import { getKlines } from './binance.js';
import { calculateRSI, calculateEMA, checkVolumeSurge } from './indicators.js';

/**
 * Run a backtest on a symbol over historical data.
 * @param {string} symbol - e.g. 'BTCUSDT'
 * @param {string} interval - e.g. '1h'
 * @param {number} limit - number of candles to fetch (max ~1000)
 * @returns {object} Backtest results
 */
export async function runBacktest(symbol, interval = '1h', limit = 500) {
  const klines = await getKlines(symbol, interval, limit);
  if (klines.length < 100) {
    return { error: 'Yeterli veri bulunamadı.' };
  }

  const trades = [];
  let i = 50; // start after enough warmup data

  while (i < klines.length - 1) {
    const windowCloses = klines.slice(0, i + 1).map(k => k.close);
    const currentPrice = windowCloses[windowCloses.length - 1];

    // Calculate indicators at this point
    const rsi = calculateRSI(windowCloses, 14);
    const ema9 = calculateEMA(windowCloses, 9);
    const ema21 = calculateEMA(windowCloses, 21);
    const ema50 = calculateEMA(windowCloses, 50);

    if (!rsi || !ema9 || !ema21) { i++; continue; }

    // Entry conditions
    let direction = null;
    let score = 0;

    // LONG conditions
    if (rsi <= 35 && currentPrice > ema21) { direction = 'LONG'; score += 2; }
    else if (rsi <= 30) { direction = 'LONG'; score += 2; }
    else if (ema9 > ema21 && ema21 > (ema50 || 0) && rsi < 55 && rsi > 35) { direction = 'LONG'; score += 1; }

    // SHORT conditions
    if (!direction) {
      if (rsi >= 65 && currentPrice < ema21) { direction = 'SHORT'; score += 2; }
      else if (rsi >= 70) { direction = 'SHORT'; score += 2; }
      else if (ema9 < ema21 && ema21 < (ema50 || Infinity) && rsi > 45 && rsi < 65) { direction = 'SHORT'; score += 1; }
    }

    if (!direction || score < 2) { i++; continue; }

    // Calculate ATR for SL/TP
    const atrCandles = klines.slice(Math.max(0, i - 14), i + 1);
    let atr = 0;
    for (let a = 1; a < atrCandles.length; a++) {
      const tr = Math.max(
        atrCandles[a].high - atrCandles[a].low,
        Math.abs(atrCandles[a].high - atrCandles[a - 1].close),
        Math.abs(atrCandles[a].low - atrCandles[a - 1].close)
      );
      atr += tr;
    }
    atr /= (atrCandles.length - 1) || 1;

    const entry = currentPrice;
    let sl, tp1, tp2, tp3;

    if (direction === 'LONG') {
      sl = entry - atr * 1.5;
      tp1 = entry + atr * 1.5;
      tp2 = entry + atr * 2.5;
      tp3 = entry + atr * 4.0;
    } else {
      sl = entry + atr * 1.5;
      tp1 = entry - atr * 1.5;
      tp2 = entry - atr * 2.5;
      tp3 = entry - atr * 4.0;
    }

    // Simulate forward
    let result = null;
    let tp1Hit = false, tp2Hit = false, tp3Hit = false;
    let exitPrice = entry;
    let exitIdx = i;
    const maxHoldBars = 48; // max hold 48 bars

    for (let j = i + 1; j < Math.min(i + maxHoldBars, klines.length); j++) {
      const candle = klines[j];

      if (direction === 'LONG') {
        // Check SL first (pessimistic)
        if (candle.low <= sl) {
          result = 'STOP_LOSS';
          exitPrice = sl;
          exitIdx = j;
          break;
        }
        if (candle.high >= tp3 && !tp3Hit) { tp3Hit = true; tp2Hit = true; tp1Hit = true; result = 'TP3'; exitPrice = tp3; exitIdx = j; break; }
        if (candle.high >= tp2 && !tp2Hit) { tp2Hit = true; tp1Hit = true; }
        if (candle.high >= tp1 && !tp1Hit) { tp1Hit = true; }
      } else {
        if (candle.high >= sl) {
          result = 'STOP_LOSS';
          exitPrice = sl;
          exitIdx = j;
          break;
        }
        if (candle.low <= tp3 && !tp3Hit) { tp3Hit = true; tp2Hit = true; tp1Hit = true; result = 'TP3'; exitPrice = tp3; exitIdx = j; break; }
        if (candle.low <= tp2 && !tp2Hit) { tp2Hit = true; tp1Hit = true; }
        if (candle.low <= tp1 && !tp1Hit) { tp1Hit = true; }
      }
    }

    // If no result, close at last candle
    if (!result) {
      if (tp2Hit) { result = 'TP2'; exitPrice = tp2; }
      else if (tp1Hit) { result = 'TP1'; exitPrice = tp1; }
      else {
        result = 'TIMEOUT';
        exitPrice = klines[Math.min(exitIdx + maxHoldBars - 1, klines.length - 1)].close;
      }
    }

    const pnl = direction === 'LONG'
      ? ((exitPrice - entry) / entry) * 100
      : ((entry - exitPrice) / entry) * 100;

    trades.push({
      direction,
      entry,
      exitPrice: Number(exitPrice.toFixed(6)),
      sl,
      tp1, tp2, tp3,
      result,
      tp1Hit, tp2Hit, tp3Hit,
      pnl: Number(pnl.toFixed(2)),
      rsiAtEntry: rsi,
      entryTime: new Date(klines[i].openTime).toISOString(),
      exitTime: new Date(klines[exitIdx].openTime).toISOString(),
      barsHeld: exitIdx - i
    });

    // Skip forward to avoid overlapping trades
    i = exitIdx + 3;
  }

  // Calculate stats
  const wins = trades.filter(t => t.result !== 'STOP_LOSS' && t.result !== 'TIMEOUT');
  const losses = trades.filter(t => t.result === 'STOP_LOSS');
  const timeouts = trades.filter(t => t.result === 'TIMEOUT');

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;

  const maxDrawdown = calculateMaxDrawdown(trades);
  const consecutiveWins = maxConsecutive(trades, true);
  const consecutiveLosses = maxConsecutive(trades, false);

  return {
    symbol,
    interval,
    totalCandles: klines.length,
    periodStart: new Date(klines[0].openTime).toISOString(),
    periodEnd: new Date(klines[klines.length - 1].openTime).toISOString(),
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    timeouts: timeouts.length,
    winRate: trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) : '0',
    totalPnl: totalPnl.toFixed(2),
    avgWin: avgWin.toFixed(2),
    avgLoss: avgLoss.toFixed(2),
    profitFactor: avgLoss !== 0 ? Math.abs(avgWin / avgLoss).toFixed(2) : 'N/A',
    maxDrawdown: maxDrawdown.toFixed(2),
    maxConsecutiveWins: consecutiveWins,
    maxConsecutiveLosses: consecutiveLosses,
    tp1HitRate: trades.length > 0 ? ((trades.filter(t => t.tp1Hit).length / trades.length) * 100).toFixed(1) : '0',
    tp2HitRate: trades.length > 0 ? ((trades.filter(t => t.tp2Hit).length / trades.length) * 100).toFixed(1) : '0',
    tp3HitRate: trades.length > 0 ? ((trades.filter(t => t.tp3Hit).length / trades.length) * 100).toFixed(1) : '0',
    trades // full trade list
  };
}

function calculateMaxDrawdown(trades) {
  let peak = 0;
  let cumPnl = 0;
  let maxDD = 0;

  for (const t of trades) {
    cumPnl += t.pnl;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function maxConsecutive(trades, isWin) {
  let max = 0;
  let current = 0;
  for (const t of trades) {
    const win = t.result !== 'STOP_LOSS' && t.result !== 'TIMEOUT';
    if (win === isWin) {
      current++;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return max;
}
