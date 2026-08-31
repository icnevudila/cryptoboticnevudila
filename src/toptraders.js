/**
 * Binance Futures Data - Top Traders, Long/Short Ratios, Open Interest, Liquidations
 * All public endpoints, no API key required.
 */

const BASE = 'https://fapi.binance.com';
const FUTURES_DATA = 'https://fapi.binance.com/futures/data';

// Top Traders Long/Short Position Ratio (by position size, not account count)
export async function getTopTraderPositionRatio(symbol, period = '15m', limit = 10) {
  try {
    const res = await fetch(`${FUTURES_DATA}/topLongShortPositionRatio?symbol=${symbol}&period=${period}&limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// Top Traders Long/Short Account Ratio (by number of accounts)
export async function getTopTraderAccountRatio(symbol, period = '15m', limit = 10) {
  try {
    const res = await fetch(`${FUTURES_DATA}/topLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// Global Long/Short Account Ratio (all traders)
export async function getGlobalLongShortRatio(symbol, period = '15m', limit = 10) {
  try {
    const res = await fetch(`${FUTURES_DATA}/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// Taker Buy/Sell Volume Ratio (Aggressive buyers vs sellers)
export async function getTakerBuySellRatio(symbol, period = '15m', limit = 10) {
  try {
    const res = await fetch(`${FUTURES_DATA}/takerlongshortRatio?symbol=${symbol}&period=${period}&limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// Open Interest (total open position value)
export async function getOpenInterest(symbol) {
  try {
    const res = await fetch(`${BASE}/fapi/v1/openInterest?symbol=${symbol}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Open Interest Statistics (historical)
export async function getOpenInterestHist(symbol, period = '15m', limit = 10) {
  try {
    const res = await fetch(`${FUTURES_DATA}/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

/**
 * Comprehensive Top Trader Analysis for a symbol
 * Fetches all data sources and produces a unified scoring
 */
export async function analyzeTopTraderSentiment(symbol) {
  const [
    topPosRatio,
    topAccRatio,
    globalRatio,
    takerRatio,
    oiHist
  ] = await Promise.all([
    getTopTraderPositionRatio(symbol, '1h', 5),
    getTopTraderAccountRatio(symbol, '1h', 5),
    getGlobalLongShortRatio(symbol, '1h', 5),
    getTakerBuySellRatio(symbol, '1h', 5),
    getOpenInterestHist(symbol, '1h', 5)
  ]);

  const result = {
    symbol,
    topTraderPosition: null,    // What are top traders holding? (Long or Short bias)
    topTraderAccounts: null,    // How many top accounts are Long vs Short
    globalSentiment: null,      // What does the crowd think?
    takerAggression: null,      // Are aggressive buyers or sellers dominating?
    oiTrend: null,              // Is open interest growing or shrinking?
    score: 0,                   // -100 (ultra bearish) to +100 (ultra bullish)
    signals: []
  };

  // 1. Top Trader Position Ratio (most important - what are whales holding)
  if (topPosRatio.length > 0) {
    const latest = topPosRatio[topPosRatio.length - 1];
    const longRatio = parseFloat(latest.longAccount || latest.longPosition || 0);
    const shortRatio = parseFloat(latest.shortAccount || latest.shortPosition || 0);
    const ratio = parseFloat(latest.longShortRatio);

    result.topTraderPosition = { longRatio, shortRatio, ratio };

    if (ratio > 1.8) {
      result.score += 30;
      result.signals.push('🐋 Top Traderlar ağırlıklı LONG pozisyonda');
    } else if (ratio > 1.3) {
      result.score += 15;
      result.signals.push('📈 Top Traderlar LONG\'a meyilli');
    } else if (ratio < 0.6) {
      result.score -= 30;
      result.signals.push('🐋 Top Traderlar ağırlıklı SHORT pozisyonda');
    } else if (ratio < 0.8) {
      result.score -= 15;
      result.signals.push('📉 Top Traderlar SHORT\'a meyilli');
    }
  }

  // 2. Top Trader Account Ratio
  if (topAccRatio.length > 0) {
    const latest = topAccRatio[topAccRatio.length - 1];
    const ratio = parseFloat(latest.longShortRatio);
    result.topTraderAccounts = { ratio };

    if (ratio > 1.5) {
      result.score += 15;
    } else if (ratio < 0.7) {
      result.score -= 15;
    }
  }

  // 3. Global Sentiment (Crowd - often contrarian indicator)
  if (globalRatio.length > 0) {
    const latest = globalRatio[globalRatio.length - 1];
    const ratio = parseFloat(latest.longShortRatio);
    result.globalSentiment = { ratio };

    // Contrarian: if crowd is too long, it can be bearish
    if (ratio > 2.5) {
      result.score -= 10;
      result.signals.push('⚠️ Kalabalık aşırı LONG (Kontrarian dikkat!)');
    } else if (ratio < 0.5) {
      result.score += 10;
      result.signals.push('⚠️ Kalabalık aşırı SHORT (Kontrarian fırsat?)');
    }
  }

  // 4. Taker Buy/Sell Ratio (Aggressive market orders)
  if (takerRatio.length > 0) {
    const latest = takerRatio[takerRatio.length - 1];
    const ratio = parseFloat(latest.buySellRatio);
    result.takerAggression = { ratio };

    if (ratio > 1.3) {
      result.score += 20;
      result.signals.push('💪 Agresif alıcılar baskın (Taker Buy > Sell)');
    } else if (ratio < 0.7) {
      result.score -= 20;
      result.signals.push('💪 Agresif satıcılar baskın (Taker Sell > Buy)');
    }
  }

  // 5. Open Interest Trend
  if (oiHist.length >= 3) {
    const recent = parseFloat(oiHist[oiHist.length - 1].sumOpenInterestValue);
    const older = parseFloat(oiHist[0].sumOpenInterestValue);
    const change = ((recent - older) / older) * 100;
    result.oiTrend = { recent, older, changePercent: change.toFixed(2) };

    if (change > 5) {
      result.score += 10;
      result.signals.push(`📊 OI artıyor (+%${change.toFixed(1)}) - Yeni pozisyonlar açılıyor`);
    } else if (change < -5) {
      result.signals.push(`📊 OI düşüyor (%${change.toFixed(1)}) - Pozisyonlar kapanıyor`);
    }
  }

  // Clamp score
  result.score = Math.max(-100, Math.min(100, result.score));

  return result;
}
