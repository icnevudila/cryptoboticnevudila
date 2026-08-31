/**
 * Binance Futures & Spot API Integration (Public Endpoints, No API Key Required)
 */

const BASE_FUTURES_URL = 'https://fapi.binance.com';

// Fetch 24hr Tickers for all USDT-M Futures
export async function getTopFuturesSymbols(limit = 40) {
  try {
    const res = await fetch(`${BASE_FUTURES_URL}/fapi/v1/ticker/24hr`);
    if (!res.ok) throw new Error(`Binance error: ${res.status}`);
    const data = await res.json();
    
    // Filter only USDT pairs and sort by 24h quoteVolume descending
    const usdtPairs = data
      .filter(item => item.symbol.endsWith('USDT') && !item.symbol.includes('_'))
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, limit)
      .map(item => item.symbol);

    return usdtPairs;
  } catch (err) {
    console.error('Failed to fetch top symbols:', err.message);
    return [];
  }
}

// Fetch Klines (Candles) for a symbol
export async function getKlines(symbol, interval = '15m', limit = 50) {
  try {
    const res = await fetch(`${BASE_FUTURES_URL}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    if (!res.ok) throw new Error(`Klines error: ${res.status}`);
    const raw = await res.json();

    // Map into clean candlestick objects
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
    const res = await fetch(`${BASE_FUTURES_URL}/fapi/v1/premiumIndex`);
    if (!res.ok) throw new Error(`Funding error: ${res.status}`);
    const data = await res.json();
    
    return data
      .filter(item => item.symbol.endsWith('USDT'))
      .map(item => ({
        symbol: item.symbol,
        markPrice: parseFloat(item.markPrice),
        lastFundingRate: parseFloat(item.lastFundingRate) * 100, // as percentage
        nextFundingTime: item.nextFundingTime
      }));
  } catch (err) {
    console.error('Failed to fetch funding rates:', err.message);
    return [];
  }
}

// Fetch 24hr ticker data for a single or all symbols
export async function getAll24hrTickers() {
  try {
    const res = await fetch(`${BASE_FUTURES_URL}/fapi/v1/ticker/24hr`);
    if (!res.ok) throw new Error(`Ticker error: ${res.status}`);
    const data = await res.json();
    
    const tickerMap = {};
    for (const item of data) {
      tickerMap[item.symbol] = {
        symbol: item.symbol,
        lastPrice: parseFloat(item.lastPrice),
        priceChangePercent: parseFloat(item.priceChangePercent),
        highPrice: parseFloat(item.highPrice),
        lowPrice: parseFloat(item.lowPrice),
        volume: parseFloat(item.volume),
        quoteVolume: parseFloat(item.quoteVolume)
      };
    }
    return tickerMap;
  } catch (err) {
    console.error('Failed to fetch tickers:', err.message);
    return {};
  }
}
