/**
 * Binance Futures Data - Orderbook Depth, Large Trades, Liquidations
 */

const BASE = 'https://fapi.binance.com';

// Orderbook Depth (bid/ask walls)
export async function getOrderbookDepth(symbol, limit = 20) {
  try {
    const res = await fetch(`${BASE}/fapi/v1/depth?symbol=${symbol}&limit=${limit}`);
    if (!res.ok) return null;
    const data = await res.json();

    const bids = data.bids.map(([price, qty]) => ({ price: parseFloat(price), qty: parseFloat(qty), value: parseFloat(price) * parseFloat(qty) }));
    const asks = data.asks.map(([price, qty]) => ({ price: parseFloat(price), qty: parseFloat(qty), value: parseFloat(price) * parseFloat(qty) }));

    // Find largest bid/ask walls
    const biggestBid = bids.reduce((max, b) => b.value > max.value ? b : max, bids[0]);
    const biggestAsk = asks.reduce((max, a) => a.value > max.value ? a : max, asks[0]);

    // Total bid vs ask depth
    const totalBidValue = bids.reduce((s, b) => s + b.value, 0);
    const totalAskValue = asks.reduce((s, a) => s + a.value, 0);
    const bidAskRatio = totalBidValue / totalAskValue;

    // Imbalance
    const imbalance = ((totalBidValue - totalAskValue) / (totalBidValue + totalAskValue)) * 100;

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
    const res = await fetch(`${BASE}/fapi/v1/trades?symbol=${symbol}&limit=${limit}`);
    if (!res.ok) return null;
    const trades = await res.json();

    // Calculate average trade value
    const values = trades.map(t => parseFloat(t.price) * parseFloat(t.qty));
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
    const threshold = avgValue * 5; // 5x average = "large" trade

    const largeTrades = trades
      .filter(t => parseFloat(t.price) * parseFloat(t.qty) > threshold)
      .map(t => ({
        price: parseFloat(t.price),
        qty: parseFloat(t.qty),
        value: Math.round(parseFloat(t.price) * parseFloat(t.qty)),
        isBuyerMaker: t.isBuyerMaker, // true = seller aggressor (sell market order)
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
      dominantSide: buyAggressor.length > sellAggressor.length ? 'ALICILAR' : 'SATICILAR',
      trades: largeTrades.slice(-5) // last 5 large trades
    };
  } catch { return null; }
}

// 24hr stats for context
export async function get24hrChange(symbol) {
  try {
    const res = await fetch(`${BASE}/fapi/v1/ticker/24hr?symbol=${symbol}`);
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
      count: d.count // number of trades
    };
  } catch { return null; }
}

// Liquidation estimation based on funding + OI change
export function estimateLiquidationZones(currentPrice, atr, direction) {
  // Common liquidation clusters based on typical leverage
  const zones = [];
  if (direction === 'LONG') {
    zones.push({ leverage: '100x', price: Number((currentPrice * 0.99).toFixed(6)), label: '100x Liq' });
    zones.push({ leverage: '50x', price: Number((currentPrice * 0.98).toFixed(6)), label: '50x Liq' });
    zones.push({ leverage: '25x', price: Number((currentPrice * 0.96).toFixed(6)), label: '25x Liq' });
    zones.push({ leverage: '10x', price: Number((currentPrice * 0.90).toFixed(6)), label: '10x Liq' });
    zones.push({ leverage: '5x', price: Number((currentPrice * 0.80).toFixed(6)), label: '5x Liq' });
  } else {
    zones.push({ leverage: '100x', price: Number((currentPrice * 1.01).toFixed(6)), label: '100x Liq' });
    zones.push({ leverage: '50x', price: Number((currentPrice * 1.02).toFixed(6)), label: '50x Liq' });
    zones.push({ leverage: '25x', price: Number((currentPrice * 1.04).toFixed(6)), label: '25x Liq' });
    zones.push({ leverage: '10x', price: Number((currentPrice * 1.10).toFixed(6)), label: '10x Liq' });
    zones.push({ leverage: '5x', price: Number((currentPrice * 1.20).toFixed(6)), label: '5x Liq' });
  }
  return zones;
}
