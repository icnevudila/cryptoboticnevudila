/**
 * Binance Futures Data - Orderbook Depth, Large Trades, Liquidations
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json'
};

const BASE = 'https://fapi.binance.com';

// Orderbook Depth (bid/ask walls)
export async function getOrderbookDepth(symbol, limit = 20) {
  try {
    const res = await fetch(`${BASE}/fapi/v1/depth?symbol=${symbol}&limit=${limit}`, { headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();

    const bids = data.bids.map(([price, qty]) => ({ price: parseFloat(price), qty: parseFloat(qty), value: parseFloat(price) * parseFloat(qty) }));
    const asks = data.asks.map(([price, qty]) => ({ price: parseFloat(price), qty: parseFloat(qty), value: parseFloat(price) * parseFloat(qty) }));

    const biggestBid = bids.reduce((max, b) => b.value > max.value ? b : max, bids[0]);
    const biggestAsk = asks.reduce((max, a) => a.value > max.value ? a : max, asks[0]);

    const totalBidValue = bids.reduce((s, b) => s + b.value, 0);
    const totalAskValue = asks.reduce((s, a) => s + a.value, 0);
    const bidAskRatio = totalBidValue / (totalAskValue || 1);
    const imbalance = ((totalBidValue - totalAskValue) / ((totalBidValue + totalAskValue) || 1)) * 100;

    return {
      biggestBidWall: { price: biggestBid.price, value: Math.round(biggestBid.value) },
      biggestAskWall: { price: biggestAsk.price, value: Math.round(biggestAsk.value) },
      totalBidValue: Math.round(totalBidValue),
      totalAskValue: Math.round(totalAskValue),
      bidAskRatio: Number(bidAskRatio.toFixed(2)),
      imbalance: Number(imbalance.toFixed(1)),
      pressure: imbalance > 10 ? 'ALIM BASKISI' : imbalance < -10 ? 'SATIM BASKISI' : 'DENGEDE',
      spread: Number((asks[0].price - bids[0].price).toFixed(8)),
      bestBid: bids[0].price,
      bestAsk: asks[0].price
    };
  } catch { return null; }
}

// Recent Large Trades (Aggressor Trades > threshold)
export async function getRecentLargeTrades(symbol, limit = 100) {
  try {
    const res = await fetch(`${BASE}/fapi/v1/trades?symbol=${symbol}&limit=${limit}`, { headers: HEADERS });
    if (!res.ok) return null;
    const trades = await res.json();

    const values = trades.map(t => parseFloat(t.price) * parseFloat(t.qty));
    const avgValue = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const threshold = avgValue * 4;

    const largeTrades = trades
      .filter(t => parseFloat(t.price) * parseFloat(t.qty) > threshold)
      .map(t => ({
        price: parseFloat(t.price),
        qty: parseFloat(t.qty),
        value: Math.round(parseFloat(t.price) * parseFloat(t.qty)),
        isBuyerMaker: t.isBuyerMaker,
        time: new Date(t.time).toLocaleTimeString('tr-TR')
      }));

    const buyAggressor = largeTrades.filter(t => !t.isBuyerMaker);
    const sellAggressor = largeTrades.filter(t => t.isBuyerMaker);

    return {
      totalLargeTrades: largeTrades.length,
      buyAggressorCount: buyAggressor.length,
      sellAggressorCount: sellAggressor.length,
      buyAggressorVolume: buyAggressor.reduce((s, t) => s + t.value, 0),
      sellAggressorVolume: sellAggressor.reduce((s, t) => s + t.value, 0),
      dominantSide: buyAggressor.length >= sellAggressor.length ? 'ALICILAR' : 'SATICILAR',
      trades: largeTrades.slice(-5)
    };
  } catch { return null; }
}

// 24hr stats for context
export async function get24hrChange(symbol) {
  try {
    const res = await fetch(`${BASE}/fapi/v1/ticker/24hr?symbol=${symbol}`, { headers: HEADERS });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      lastPrice: parseFloat(d.lastPrice),
      priceChange: parseFloat(d.priceChange),
      priceChangePercent: parseFloat(d.priceChangePercent),
      highPrice: parseFloat(d.highPrice),
      lowPrice: parseFloat(d.lowPrice),
      volume: parseFloat(d.volume),
      quoteVolume: parseFloat(d.quoteVolume),
      weightedAvgPrice: parseFloat(d.weightedAvgPrice),
      count: d.count
    };
  } catch { return null; }
}

// Liquidation Level Estimation
export function estimateLiquidationZones(currentPrice, atr) {
  const atrBuffer = atr || currentPrice * 0.015;
  return [
    { leverage: '100x', price: Number((currentPrice * 1.01).toFixed(2)), label: '100x Liq' },
    { leverage: '50x', price: Number((currentPrice * 1.02).toFixed(2)), label: '50x Liq' },
    { leverage: '25x', price: Number((currentPrice * 1.04).toFixed(2)), label: '25x Liq' },
    { leverage: '10x', price: Number((currentPrice * 1.10).toFixed(2)), label: '10x Liq' },
    { leverage: '5x', price: Number((currentPrice * 1.20).toFixed(2)), label: '5x Liq' }
  ];
}
