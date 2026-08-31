/**
 * Binance Futures Data - Top Traders, Long/Short Ratios, Open Interest, Liquidations
 * All public endpoints, no API key required.
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json'
};

const BASE = 'https://fapi.binance.com';
const FUTURES_DATA = 'https://fapi.binance.com/futures/data';

// Top Traders Long/Short Position Ratio (by position size, not account count)
export async function getTopTraderPositionRatio(symbol, period = '15m', limit = 10) {
  try {
    const res = await fetch(`${FUTURES_DATA}/topLongShortPositionRatio?symbol=${symbol}&period=${period}&limit=${limit}`, { headers: HEADERS });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// Top Traders Long/Short Account Ratio (by number of accounts)
export async function getTopTraderAccountRatio(symbol, period = '15m', limit = 10) {
  try {
    const res = await fetch(`${FUTURES_DATA}/topLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=${limit}`, { headers: HEADERS });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// Global Long/Short Account Ratio (all traders)
export async function getGlobalLongShortRatio(symbol, period = '15m', limit = 10) {
  try {
    const res = await fetch(`${FUTURES_DATA}/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=${limit}`, { headers: HEADERS });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// Taker Buy/Sell Volume Ratio (Aggressive buyers vs sellers)
export async function getTakerBuySellRatio(symbol, period = '15m', limit = 10) {
  try {
    const res = await fetch(`${FUTURES_DATA}/takerlongshortRatio?symbol=${symbol}&period=${period}&limit=${limit}`, { headers: HEADERS });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// Open Interest (total open position value)
export async function getOpenInterest(symbol) {
  try {
    const res = await fetch(`${BASE}/fapi/v1/openInterest?symbol=${symbol}`, { headers: HEADERS });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Open Interest Statistics (historical)
export async function getOpenInterestHist(symbol, period = '15m', limit = 10) {
  try {
    const res = await fetch(`${FUTURES_DATA}/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`, { headers: HEADERS });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// Comprehensive Top Trader & Smart Money Sentiment Analysis
export async function analyzeTopTraderSentiment(symbol) {
  const [posRatio, accRatio, globalRatio, takerRatio, oiHist] = await Promise.all([
    getTopTraderPositionRatio(symbol, '15m', 5),
    getTopTraderAccountRatio(symbol, '15m', 5),
    getGlobalLongShortRatio(symbol, '15m', 5),
    getTakerBuySellRatio(symbol, '15m', 5),
    getOpenInterestHist(symbol, '15m', 5)
  ]);

  let score = 0;
  const signals = [];

  // 1. Top Trader Position Ratio
  let topTraderPosition = null;
  if (posRatio.length > 0) {
    const latest = posRatio[posRatio.length - 1];
    const longRatio = parseFloat(latest.longPosition || latest.longAccount);
    const shortRatio = parseFloat(latest.shortPosition || latest.shortAccount);
    const ratio = parseFloat(latest.longShortRatio);

    topTraderPosition = { longRatio, shortRatio, ratio };

    if (ratio > 1.5) {
      score += 30;
      signals.push(`🐋 Top Traderlar ağırlıklı LONG pozisyonda (${(longRatio * 100).toFixed(1)}% Long / ${(shortRatio * 100).toFixed(1)}% Short, Oran: ${ratio.toFixed(2)})`);
    } else if (ratio < 0.67) {
      score -= 30;
      signals.push(`🐋 Top Traderlar ağırlıklı SHORT pozisyonda (${(shortRatio * 100).toFixed(1)}% Short / ${(longRatio * 100).toFixed(1)}% Long, Oran: ${ratio.toFixed(2)})`);
    } else if (ratio > 1.1) {
      score += 15;
      signals.push(`📈 Top Traderlar LONG'a meyilli (Oran: ${ratio.toFixed(2)})`);
    } else if (ratio < 0.9) {
      score -= 15;
      signals.push(`📉 Top Traderlar SHORT'a meyilli (Oran: ${ratio.toFixed(2)})`);
    }
  }

  // 2. Retail vs Smart Money Divergence
  let globalSentiment = null;
  if (globalRatio.length > 0 && posRatio.length > 0) {
    const latestGlobal = globalRatio[globalRatio.length - 1];
    const globalLong = parseFloat(latestGlobal.longAccount);
    const globalShort = parseFloat(latestGlobal.shortAccount);
    globalSentiment = { long: globalLong, short: globalShort, ratio: parseFloat(latestGlobal.longShortRatio) };

    const topRatio = topTraderPosition ? topTraderPosition.ratio : 1;
    const gRatio = globalSentiment.ratio;

    if (topRatio > 1.3 && gRatio < 0.9) {
      score += 25;
      signals.push(`⚡ DIVERGENCE: Balinalar LONG açarken kalabalık/perakende SHORT tarafında (Klasik Likidite Tuzağı)`);
    } else if (topRatio < 0.77 && gRatio > 1.1) {
      score -= 25;
      signals.push(`⚡ DIVERGENCE: Balinalar SHORT açarken kalabalık/perakende LONG tarafında (Klasik Boğa Tuzağı)`);
    }
  }

  // 3. Taker Buy/Sell Volume Ratio
  let takerAggression = null;
  if (takerRatio.length > 0) {
    const latest = takerRatio[takerRatio.length - 1];
    const buyVol = parseFloat(latest.buyVol);
    const sellVol = parseFloat(latest.sellVol);
    const ratio = parseFloat(latest.buySellRatio);
    takerAggression = { buyVol, sellVol, ratio };

    if (ratio > 1.3) {
      score += 20;
      signals.push(`💪 Agresif alıcılar baskın (Taker Buy > Sell, Oran: ${ratio.toFixed(2)})`);
    } else if (ratio < 0.77) {
      score -= 20;
      signals.push(`🩸 Agresif satıcılar baskın (Taker Sell > Buy, Oran: ${ratio.toFixed(2)})`);
    }
  }

  // 4. Open Interest Trend
  let oiTrend = null;
  if (oiHist.length >= 2) {
    const latest = parseFloat(oiHist[oiHist.length - 1].sumOpenInterestValue);
    const older = parseFloat(oiHist[0].sumOpenInterestValue);
    const oiChangePct = ((latest - older) / older) * 100;
    oiTrend = { recent: latest, older, changePercent: oiChangePct.toFixed(2) };

    if (oiChangePct > 5) {
      signals.push(`📊 OI artıyor (+%${oiChangePct.toFixed(1)}) - Yeni pozisyonlar açılıyor`);
    } else if (oiChangePct < -5) {
      signals.push(`📊 OI düşüyor (%${oiChangePct.toFixed(1)}) - Pozisyonlar kapanıyor`);
    }
  }

  return {
    symbol,
    topTraderPosition,
    topTraderAccounts: accRatio.length > 0 ? { ratio: parseFloat(accRatio[accRatio.length - 1].longShortRatio) } : null,
    globalSentiment,
    takerAggression,
    oiTrend,
    score: Math.max(-100, Math.min(100, score)),
    signals
  };
}
