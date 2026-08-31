/**
 * Binance Futures & Multi-Exchange Fallback API Integration
 * Supports Binance mirrors + Bybit fallback to prevent cloud datacenter / 451 geoblocks
 */

const BINANCE_HOSTS = [
  'https://fapi.binance.com',
  'https://fapi1.binance.com',
  'https://fapi2.binance.com',
  'https://fapi3.binance.com'
];

async function fetchWithFallback(path) {
  let lastError = null;
  for (const host of BINANCE_HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
      if (res.ok) return await res.json();
      if (res.status === 451) {
        lastError = new Error(`451 (Binance US Geoblock - Render Region Frankfurt/Singapore olmalı)`);
        break; // don't retry same blocked IP across mirrors
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

// Fetch 24hr Tickers for all USDT-M Futures
export async function getTopFuturesSymbols(limit = 30) {
  try {
    const data = await fetchWithFallback('/fapi/v1/ticker/24hr');
    const usdtPairs = data
      .filter(item => item.symbol.endsWith('USDT') && !item.symbol.includes('_'))
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, limit)
      .map(item => item.symbol);

    return usdtPairs;
  } catch (err) {
    console.error('Failed to fetch top symbols:', err.message);
    // Fallback static top 20 list if network/geo issue
    return [
      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 
      'DOGEUSDT', 'SUIUSDT', 'PEPEUSDT', 'NEARUSDT', 'AVAXUSDT', 
      'LINKUSDT', 'ADAUSDT', 'APTUSDT', 'RENDERUSDT', 'FTMUSDT', 
      'WIFUSDT', 'SHIBUSDT', 'LTCUSDT', 'DOTUSDT', 'TAOUSDT'
    ];
  }
}

// Fetch Klines (Candles) for a symbol
export async function getKlines(symbol, interval = '15m', limit = 50) {
  try {
    const raw = await fetchWithFallback(`/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    return raw.map(k => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
      quoteVolume: parseFloat(k[7]),
      trades: k[8]
    }));
  } catch (err) {
    console.error(`Failed to fetch klines for ${symbol}:`, err.message);
    return [];
  }
}

// Fetch Premium Index & Funding Rates
export async function getFundingRates() {
  try {
    const data = await fetchWithFallback('/fapi/v1/premiumIndex');
    return data
      .filter(item => item.symbol.endsWith('USDT'))
      .map(item => ({
        symbol: item.symbol,
        markPrice: parseFloat(item.markPrice),
        lastFundingRate: parseFloat(item.lastFundingRate) * 100,
        nextFundingTime: item.nextFundingTime
      }));
  } catch (err) {
    console.error('Failed to fetch funding rates:', err.message);
    return [];
  }
}

// Fetch All 24hr Tickers Map
export async function getAll24hrTickers() {
  try {
    const data = await fetchWithFallback('/fapi/v1/ticker/24hr');
    const map = {};
    for (const item of data) {
      if (item.symbol.endsWith('USDT')) {
        map[item.symbol] = {
          symbol: item.symbol,
          lastPrice: parseFloat(item.lastPrice),
          priceChangePercent: parseFloat(item.priceChangePercent),
          highPrice: parseFloat(item.highPrice),
          lowPrice: parseFloat(item.lowPrice),
          volume: parseFloat(item.volume),
          quoteVolume: parseFloat(item.quoteVolume),
          weightedAvgPrice: parseFloat(item.weightedAvgPrice)
        };
      }
    }
    return map;
  } catch (err) {
    console.error('Failed to fetch tickers:', err.message);
    return {};
  }
}
