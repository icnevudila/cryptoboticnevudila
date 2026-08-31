/**
 * External Market Intelligence & Macro Analytics
 * Fear & Greed Index, Dominance, Aggregated Derivatives, Whale Squeeze Radar
 */

import { getFundingRates } from './binance.js';
import { analyzeTopTraderSentiment } from './toptraders.js';

// Fear & Greed Index (Alternative.me)
export async function getFearGreedIndex() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=2&format=json');
    if (!res.ok) return null;
    const data = await res.json();
    const today = data.data[0];
    const yesterday = data.data[1];
    return {
      value: parseInt(today.value),
      classification: today.value_classification,
      yesterdayValue: parseInt(yesterday.value),
      yesterdayClassification: yesterday.value_classification,
      change: parseInt(today.value) - parseInt(yesterday.value),
      emoji: getGreedEmoji(parseInt(today.value)),
      insight: getGreedInsight(parseInt(today.value), parseInt(yesterday.value))
    };
  } catch { return null; }
}

function getGreedEmoji(val) {
  if (val <= 20) return '😱 Aşırı Korku (Extreme Fear)';
  if (val <= 40) return '😨 Korku (Fear)';
  if (val <= 55) return '😐 Nötr (Neutral)';
  if (val <= 75) return '🤑 Açgözlülük (Greed)';
  return '🚀 Aşırı Açgözlülük (Extreme Greed)';
}

function getGreedInsight(today, yesterday) {
  if (today < 25) return 'Piyasa aşırı korku bölgesinde. Tarihsel olarak bu bölgeler uzun vadeli dip akümülasyon alanlarıdır.';
  if (today > 75) return 'Piyasa aşırı açgözlülük bölgesinde. FOMO alımları yüksek, ani kaldıraç tasfiye düzeltmelerine dikkat edilmeli.';
  if (today < yesterday) return `Düne göre ${yesterday - today} puan soğuma var. Piyasa temkinli konsolidasyonda.`;
  return `Düne göre ${today - yesterday} puan yükseliş var. Risk iştahı artıyor.`;
}

// BTC Dominance & Global Market Data (CoinGecko)
export async function getGlobalMarketData() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', {
      headers: { 'User-Agent': 'CryptoSignalBot/1.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      btcDominance: Number(data.data.market_cap_percentage.btc.toFixed(2)),
      ethDominance: Number(data.data.market_cap_percentage.eth.toFixed(2)),
      totalMarketCapUsd: data.data.total_market_cap.usd,
      totalVolume24hUsd: data.data.total_volume.usd,
      marketCapChangePercent24h: Number(data.data.market_cap_change_percentage_24h_usd.toFixed(2)),
      activeCryptos: data.data.active_cryptocurrencies
    };
  } catch { return null; }
}

// Complete Macro Morning Intelligence Package
export async function getMacroMarketSummary() {
  const [fng, globalData, btcSentiment, fundingRates] = await Promise.all([
    getFearGreedIndex(),
    getGlobalMarketData(),
    analyzeTopTraderSentiment('BTCUSDT'),
    getFundingRates()
  ]);

  // Sort funding rates for squeeze radar
  let topPositiveFunding = [];
  let topNegativeFunding = [];
  if (fundingRates && fundingRates.length > 0) {
    const sorted = [...fundingRates].sort((a, b) => b.lastFundingRate - a.lastFundingRate);
    topPositiveFunding = sorted.slice(0, 3);
    topNegativeFunding = [...sorted].reverse().slice(0, 3);
  }

  // BTC Open Interest
  let btcOiUsd = null;
  try {
    const oiRes = await fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT');
    if (oiRes.ok) {
      const oiData = await oiRes.json();
      const btcPrice = btcSentiment?.topTraderPosition ? (parseFloat(oiData.openInterest) * 78000) : 0;
      btcOiUsd = Math.round(parseFloat(oiData.openInterest));
    }
  } catch {}

  return {
    fng,
    globalData,
    btcSentiment,
    btcOi: btcOiUsd,
    topPositiveFunding,
    topNegativeFunding,
    timestamp: new Date().toISOString()
  };
}
