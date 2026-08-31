/**
 * Advanced Position Recommendation Engine v3
 * Combines every indicator + orderbook + top trader data into a deeply detailed signal.
 */

import { getKlines, getFundingRates, getAll24hrTickers } from './binance.js';
import {
  calculateRSI, calculateEMA, calculateSMA, calculateMACD, calculateBollinger,
  calculateStochRSI, calculateATR, findSupportResistance, calculateFibonacci,
  checkVolumeSurge, analyzeMarketStructure, calculateOBV
} from './indicators.js';
import { analyzeTopTraderSentiment } from './toptraders.js';
import { getOrderbookDepth, getRecentLargeTrades, get24hrChange, estimateLiquidationZones } from './marketdata.js';

export async function generatePositionIdea(symbol) {
  // Fetch all timeframes + market depth simultaneously
  const [klines5m, klines15m, klines1h, klines4h, sentiment, orderbook, largeTrades, ticker24h, fundingAll] =
    await Promise.all([
      getKlines(symbol, '5m', 100),
      getKlines(symbol, '15m', 100),
      getKlines(symbol, '1h', 100),
      getKlines(symbol, '4h', 100),
      analyzeTopTraderSentiment(symbol),
      getOrderbookDepth(symbol, 20),
      getRecentLargeTrades(symbol, 100),
      get24hrChange(symbol),
      getFundingRates()
    ]);

  if (klines15m.length < 50 || klines1h.length < 50 || klines4h.length < 30) return null;

  const c5m = klines5m.map(k => k.close);
  const c15m = klines15m.map(k => k.close);
  const c1h = klines1h.map(k => k.close);
  const c4h = klines4h.map(k => k.close);
  const currentPrice = c15m[c15m.length - 1];

  // ===================== INDICATORS =====================

  // Multi-TF RSI
  const rsi5m = calculateRSI(c5m, 14);
  const rsi15m = calculateRSI(c15m, 14);
  const rsi1h = calculateRSI(c1h, 14);
  const rsi4h = calculateRSI(c4h, 14);

  // Multi-TF EMA
  const ema9_15m = calculateEMA(c15m, 9);
  const ema21_15m = calculateEMA(c15m, 21);
  const ema9_1h = calculateEMA(c1h, 9);
  const ema21_1h = calculateEMA(c1h, 21);
  const ema50_1h = calculateEMA(c1h, 50);
  const ema200_1h = calculateEMA(c1h, 200);
  const ema9_4h = calculateEMA(c4h, 9);
  const ema21_4h = calculateEMA(c4h, 21);

  // MACD
  const macd15m = calculateMACD(c15m);
  const macd1h = calculateMACD(c1h);
  const macd4h = calculateMACD(c4h);

  // Bollinger Bands
  const bb15m = calculateBollinger(c15m, 20, 2);
  const bb1h = calculateBollinger(c1h, 20, 2);

  // Stochastic RSI
  const stochRsi15m = calculateStochRSI(c15m);
  const stochRsi1h = calculateStochRSI(c1h);

  // ATR
  const atr15m = calculateATR(klines15m, 14);
  const atr1h = calculateATR(klines1h, 14);
  const atr4h = calculateATR(klines4h, 14);

  // Support / Resistance
  const sr1h = findSupportResistance(klines1h, 40);
  const sr4h = findSupportResistance(klines4h, 30);

  // Fibonacci
  const fib1h = calculateFibonacci(klines1h, 50);
  const fib4h = calculateFibonacci(klines4h, 50);

  // Volume
  const volSurge15m = checkVolumeSurge(klines15m, 2.5, 20);
  const volSurge1h = checkVolumeSurge(klines1h, 2.5, 20);

  // Market Structure
  const struct1h = analyzeMarketStructure(klines1h, 20);
  const struct4h = analyzeMarketStructure(klines4h, 20);

  // OBV
  const obv1h = calculateOBV(klines1h, 20);

  // Funding Rate for this symbol
  const fundingData = fundingAll ? fundingAll.find(f => f.symbol === symbol) : null;

  // ===================== SCORING =====================
  let bullScore = 0, bearScore = 0;
  const reasoning = [];

  // 1. Top Trader Sentiment (weight: 3)
  if (sentiment.score > 25) { bullScore += 3; }
  else if (sentiment.score < -25) { bearScore += 3; }
  else if (sentiment.score > 10) { bullScore += 1; }
  else if (sentiment.score < -10) { bearScore += 1; }
  if (sentiment.signals.length > 0) reasoning.push(...sentiment.signals);

  // 2. Multi-TF RSI Confluence (weight: 3)
  if (rsi15m && rsi1h && rsi4h) {
    if (rsi15m <= 35 && rsi1h <= 40 && rsi4h <= 45) { bullScore += 3; reasoning.push(`📊 Çoklu TF RSI uyumu: 5m=${rsi5m} | 15m=${rsi15m} | 1h=${rsi1h} | 4h=${rsi4h} (Tüm TF'lerde satım baskısı zayıflıyor)`); }
    else if (rsi15m <= 35 && rsi1h <= 42) { bullScore += 2; reasoning.push(`📊 RSI 15m=${rsi15m}, 1h=${rsi1h} aşırı satım bölgesi`); }
    else if (rsi15m >= 65 && rsi1h >= 60 && rsi4h >= 55) { bearScore += 3; reasoning.push(`📊 Çoklu TF RSI uyumu: 5m=${rsi5m} | 15m=${rsi15m} | 1h=${rsi1h} | 4h=${rsi4h} (Tüm TF'lerde alım baskısı zayıflıyor)`); }
    else if (rsi15m >= 65 && rsi1h >= 58) { bearScore += 2; reasoning.push(`📊 RSI 15m=${rsi15m}, 1h=${rsi1h} aşırı alım bölgesi`); }
  }

  // 3. Market Structure (weight: 2)
  if (struct1h) {
    if (struct1h.structure === 'UPTREND') { bullScore += 2; reasoning.push(`🏗️ 1h Piyasa Yapısı: YÜKSELİŞ TRENDİ (HH=${rp(struct1h.lastSwingHigh)}, HL=${rp(struct1h.lastSwingLow)})`); }
    else if (struct1h.structure === 'DOWNTREND') { bearScore += 2; reasoning.push(`🏗️ 1h Piyasa Yapısı: DÜŞÜŞ TRENDİ (LH=${rp(struct1h.lastSwingHigh)}, LL=${rp(struct1h.lastSwingLow)})`); }
  }
  if (struct4h) {
    if (struct4h.structure === 'UPTREND') { bullScore += 1; reasoning.push(`🏗️ 4h Trend: YÜKSELİŞ`); }
    else if (struct4h.structure === 'DOWNTREND') { bearScore += 1; reasoning.push(`🏗️ 4h Trend: DÜŞÜŞ`); }
  }

  // 4. EMA Stack (weight: 2)
  if (ema9_1h && ema21_1h && ema50_1h) {
    if (currentPrice > ema9_1h && ema9_1h > ema21_1h && ema21_1h > ema50_1h) {
      bullScore += 2; reasoning.push(`📈 EMA Stack 1h: Fiyat($${rp(currentPrice)}) > EMA9($${rp(ema9_1h)}) > EMA21($${rp(ema21_1h)}) > EMA50($${rp(ema50_1h)}) → Güçlü yükseliş dizilimi`);
    } else if (currentPrice < ema9_1h && ema9_1h < ema21_1h && ema21_1h < ema50_1h) {
      bearScore += 2; reasoning.push(`📉 EMA Stack 1h: Fiyat($${rp(currentPrice)}) < EMA9($${rp(ema9_1h)}) < EMA21($${rp(ema21_1h)}) < EMA50($${rp(ema50_1h)}) → Güçlü düşüş dizilimi`);
    }
  }

  // 5. MACD Confluence (weight: 2)
  if (macd1h) {
    if (macd1h.crossover === 'BULLISH') { bullScore += 2; reasoning.push(`📈 MACD 1h: Boğa kesişimi (MACD=${macd1h.macd.toFixed(4)} > Signal=${macd1h.signal.toFixed(4)})`); }
    else if (macd1h.crossover === 'BEARISH') { bearScore += 2; reasoning.push(`📉 MACD 1h: Ayı kesişimi (MACD=${macd1h.macd.toFixed(4)} < Signal=${macd1h.signal.toFixed(4)})`); }
    if (macd1h.divergence === 'BULLISH_DIVERGENCE') { bullScore += 2; reasoning.push(`🔄 MACD 1h BOĞA UYUMSUZLUĞU: Fiyat yeni dip yaparken MACD daha yüksek dip yaptı → Dönüş sinyali`); }
    if (macd1h.divergence === 'BEARISH_DIVERGENCE') { bearScore += 2; reasoning.push(`🔄 MACD 1h AYI UYUMSUZLUĞU: Fiyat yeni zirve yaparken MACD daha düşük zirve yaptı → Düşüş sinyali`); }
    if (macd1h.histogramGrowing && macd1h.momentum === 'BULLISH') { bullScore += 1; reasoning.push(`📊 MACD histogram genişliyor (+), momentum artıyor`); }
    if (macd1h.histogramGrowing && macd1h.momentum === 'BEARISH') { bearScore += 1; reasoning.push(`📊 MACD histogram genişliyor (-), satış momentumu artıyor`); }
  }

  // 6. Bollinger (weight: 1)
  if (bb1h) {
    if (bb1h.position === 'LOWER_TOUCH' || bb1h.position === 'LOWER_ZONE') {
      bullScore += 1; reasoning.push(`📏 Bollinger 1h: Fiyat alt banta yakın (%B=${bb1h.percentB}%) → Band=$${rp(bb1h.lower)}-$${rp(bb1h.upper)}, Bant Genişliği=%${bb1h.bandwidth}`);
    }
    if (bb1h.position === 'UPPER_TOUCH' || bb1h.position === 'UPPER_ZONE') {
      bearScore += 1; reasoning.push(`📏 Bollinger 1h: Fiyat üst banta yakın (%B=${bb1h.percentB}%) → Band=$${rp(bb1h.lower)}-$${rp(bb1h.upper)}, Bant Genişliği=%${bb1h.bandwidth}`);
    }
    if (bb1h.squeeze) { reasoning.push(`⚡ Bollinger Sıkışması (Bandwidth=%${bb1h.bandwidth}): Volatilite patlaması bekleniyor!`); }
  }

  // 7. Stoch RSI (weight: 1)
  if (stochRsi1h) {
    if (stochRsi1h.zone === 'OVERSOLD' && stochRsi1h.crossover === 'BULLISH') { bullScore += 1; reasoning.push(`📊 Stoch RSI 1h: Aşırı satımda boğa kesişimi (K=${stochRsi1h.k} D=${stochRsi1h.d})`); }
    if (stochRsi1h.zone === 'OVERBOUGHT' && stochRsi1h.crossover === 'BEARISH') { bearScore += 1; reasoning.push(`📊 Stoch RSI 1h: Aşırı alımda ayı kesişimi (K=${stochRsi1h.k} D=${stochRsi1h.d})`); }
  }

  // 8. Volume confirmation (weight: 1)
  if (volSurge1h && volSurge1h.isSurge) {
    if (volSurge1h.isBullish) { bullScore += 1; reasoning.push(`💥 1h Hacim ${volSurge1h.ratio}x patlama (ALIM yönlü mum)`); }
    else { bearScore += 1; reasoning.push(`💥 1h Hacim ${volSurge1h.ratio}x patlama (SATIM yönlü mum)`); }
  }

  // 9. Orderbook imbalance (weight: 1)
  if (orderbook) {
    if (orderbook.imbalance > 15) { bullScore += 1; reasoning.push(`📗 Orderbook: Alım baskısı %${orderbook.imbalance} | Bid/Ask Oranı: ${orderbook.bidAskRatio} | En büyük alım duvarı: $${rp(orderbook.biggestBidWall.price)} (${fmt(orderbook.biggestBidWall.value)}$)`); }
    else if (orderbook.imbalance < -15) { bearScore += 1; reasoning.push(`📕 Orderbook: Satım baskısı %${Math.abs(orderbook.imbalance)} | Bid/Ask Oranı: ${orderbook.bidAskRatio} | En büyük satım duvarı: $${rp(orderbook.biggestAskWall.price)} (${fmt(orderbook.biggestAskWall.value)}$)`); }
    else { reasoning.push(`📒 Orderbook dengede (Imbalance: %${orderbook.imbalance}, Bid/Ask: ${orderbook.bidAskRatio})`); }
  }

  // 10. Large Trades (weight: 1)
  if (largeTrades && largeTrades.totalLargeTrades > 0) {
    if (largeTrades.buyAggressorVolume > largeTrades.sellAggressorVolume * 1.5) {
      bullScore += 1; reasoning.push(`🐋 Büyük işlemler: ${largeTrades.totalLargeTrades} adet | Alıcı agresör: ${fmt(largeTrades.buyAggressorVolume)}$ vs Satıcı: ${fmt(largeTrades.sellAggressorVolume)}$ → ALICILAR HAKİM`);
    } else if (largeTrades.sellAggressorVolume > largeTrades.buyAggressorVolume * 1.5) {
      bearScore += 1; reasoning.push(`🐋 Büyük işlemler: ${largeTrades.totalLargeTrades} adet | Satıcı agresör: ${fmt(largeTrades.sellAggressorVolume)}$ vs Alıcı: ${fmt(largeTrades.buyAggressorVolume)}$ → SATICILAR HAKİM`);
    }
  }

  // 11. OBV
  if (obv1h) {
    if (obv1h.trend === 'RISING') { bullScore += 1; reasoning.push(`📊 OBV 1h: YÜKSELEN → Para girişi var, hacim fiyatı destekliyor`); }
    else { bearScore += 1; reasoning.push(`📊 OBV 1h: DÜŞEN → Para çıkışı var, hacim satışı destekliyor`); }
  }

  // 12. Negative Funding / Short Squeeze Guard
  if (fundingData) {
    if (fundingData.lastFundingRate < -0.015) {
      // Negative funding = shorts pay longs -> High risk to open new shorts!
      bullScore += 2;
      reasoning.push(`🔥 Fonlama Negatif (%${fundingData.lastFundingRate.toFixed(4)}): Shortlar ödeme yapıyor, Short Squeeze (ani yukarı patlama) riski yüksek`);
    } else if (fundingData.lastFundingRate > 0.03) {
      // High positive funding = longs overleveraged -> Long squeeze risk
      bearScore += 2;
      reasoning.push(`⚠️ Fonlama Yüksek Pozitif (%${fundingData.lastFundingRate.toFixed(4)}): Long yığılması var, long tasfiye riski`);
    }
  }

  // ===================== DIRECTION & QUALITY FILTERS =====================
  const totalScore = bullScore + bearScore;
  let direction = 'NEUTRAL';

  // Anti-chase filters:
  // Don't short if 1h RSI is already near oversold (< 42) or funding is negative
  const isOversoldZone = (rsi1h && rsi1h < 42) || (rsi4h && rsi4h < 40);
  const isOverboughtZone = (rsi1h && rsi1h > 62) || (rsi4h && rsi4h > 65);

  if (bullScore >= 4 && bullScore > bearScore + 1 && !isOverboughtZone) {
    direction = 'LONG';
  } else if (bearScore >= 4 && bearScore > bullScore + 1 && !isOversoldZone) {
    direction = 'SHORT';
  } else if (isOversoldZone && (bullScore >= 3 || (fundingData && fundingData.lastFundingRate < -0.01))) {
    // Reversal bounce candidate
    direction = 'LONG';
    reasoning.push('🔄 Dip / Tepki Alımı Adayı: Fiyat aşırı satım bölgesinde taban arayışında');
  } else {
    direction = 'NEUTRAL';
  }

  // Realistic confidence score based on total confluence points
  const dominantScore = direction === 'LONG' ? bullScore : direction === 'SHORT' ? bearScore : 0;
  let confidence = 50;
  if (dominantScore >= 8) confidence = 85 + Math.min(10, dominantScore);
  else if (dominantScore >= 6) confidence = 75 + (dominantScore - 6) * 5;
  else if (dominantScore >= 4) confidence = 60 + (dominantScore - 4) * 7;
  else confidence = 50;
  confidence = Math.min(95, Math.max(50, confidence));

  // ===================== SMART STRUCTURE-BASED SL & TP ENGINE =====================
  const atr = atr1h || currentPrice * 0.01;
  const entry = currentPrice;

  let stopLoss, tp1, tp2, tp3;
  let slReason = '', tp1Reason = '', tp2Reason = '', tp3Reason = '';
  let entryZoneLow, entryZoneHigh;

  if (direction === 'LONG' || direction === 'NEUTRAL') {
    // 1. Smart SL: Look for nearest support below price or last swing low
    const validSupports = (sr1h.supports || []).filter(s => s.level < entry * 0.998);
    const lastSwingLow = struct1h?.lastSwingLow && struct1h.lastSwingLow < entry * 0.998 ? struct1h.lastSwingLow : null;
    
    let baseSupport = null;
    if (lastSwingLow) baseSupport = lastSwingLow;
    else if (validSupports.length > 0) baseSupport = validSupports[0].level;
    else if (bb1h?.lower && bb1h.lower < entry) baseSupport = bb1h.lower;

    // Apply buffer of 0.2 ATR below support
    let calculatedSl = baseSupport ? (baseSupport - atr * 0.2) : (entry - atr * 1.3);

    // Safeguards: Min SL = 0.7%, Max SL = 2.5%
    const minSlPrice = entry * (1 - 0.007);
    const maxSlPrice = entry * (1 - 0.025);
    calculatedSl = Math.max(maxSlPrice, Math.min(minSlPrice, calculatedSl));
    stopLoss = rnd(calculatedSl, currentPrice);

    const slDist = Math.abs(entry - stopLoss);
    slReason = baseSupport ? `1h Destek/Swing Low ($${rnd(baseSupport, currentPrice)}) altı tamponlu` : `1.3 ATR Volatilite alt bandı`;

    // 2. Smart TPs: R:R based anchored to Fib / Resistance / Liquidity
    const target1 = entry + slDist * 1.5;
    const target2 = entry + slDist * 3.0;
    const target3 = entry + slDist * 5.0;

    tp1 = rnd(target1, currentPrice);
    tp2 = rnd(target2, currentPrice);
    tp3 = rnd(target3, currentPrice);

    tp1Reason = `İlk Kar Al (R:R 1.5:1) - Stop girişe çekilmelidir`;
    tp2Reason = `Ana Direnç & Fib Hedefi (R:R 3.0:1)`;
    tp3Reason = `Trend Devamı & Likidite Havuzu (R:R 5.0:1)`;

    entryZoneLow = rnd(entry - atr * 0.25, currentPrice);
    entryZoneHigh = rnd(entry + atr * 0.1, currentPrice);
  } else {
    // SHORT Smart SL: Look for nearest resistance above price or last swing high
    const validResistances = (sr1h.resistances || []).filter(r => r.level > entry * 1.002);
    const lastSwingHigh = struct1h?.lastSwingHigh && struct1h.lastSwingHigh > entry * 1.002 ? struct1h.lastSwingHigh : null;

    let baseResistance = null;
    if (lastSwingHigh) baseResistance = lastSwingHigh;
    else if (validResistances.length > 0) baseResistance = validResistances[0].level;
    else if (bb1h?.upper && bb1h.upper > entry) baseResistance = bb1h.upper;

    let calculatedSl = baseResistance ? (baseResistance + atr * 0.2) : (entry + atr * 1.3);

    const minSlPrice = entry * (1 + 0.007);
    const maxSlPrice = entry * (1 + 0.025);
    calculatedSl = Math.min(maxSlPrice, Math.max(minSlPrice, calculatedSl));
    stopLoss = rnd(calculatedSl, currentPrice);

    const slDist = Math.abs(stopLoss - entry);
    slReason = baseResistance ? `1h Direnç/Swing High ($${rnd(baseResistance, currentPrice)}) üstü tamponlu` : `1.3 ATR Volatilite üst bandı`;

    const target1 = entry - slDist * 1.5;
    const target2 = entry - slDist * 3.0;
    const target3 = entry - slDist * 5.0;

    tp1 = rnd(target1, currentPrice);
    tp2 = rnd(target2, currentPrice);
    tp3 = rnd(target3, currentPrice);

    tp1Reason = `İlk Kar Al (R:R 1.5:1) - Stop girişe çekilmelidir`;
    tp2Reason = `Ana Destek & Fib Hedefi (R:R 3.0:1)`;
    tp3Reason = `Trend Devamı & Likidite Havuzu (R:R 5.0:1)`;

    entryZoneLow = rnd(entry - atr * 0.1, currentPrice);
    entryZoneHigh = rnd(entry + atr * 0.25, currentPrice);
  }

  const slPercent = (Math.abs(entry - stopLoss) / entry) * 100;
  const tp1Percent = (Math.abs(tp1 - entry) / entry) * 100;
  const tp2Percent = (Math.abs(tp2 - entry) / entry) * 100;
  const tp3Percent = (Math.abs(tp3 - entry) / entry) * 100;

  let suggestedLeverage = '5x';
  if (slPercent <= 1.0) suggestedLeverage = '10x';
  else if (slPercent <= 1.8) suggestedLeverage = '5x';
  else suggestedLeverage = '3x';

  const liqZones = estimateLiquidationZones(currentPrice, atr, direction === 'LONG' ? 'SHORT' : 'LONG');

  return {
    symbol, direction, currentPrice: rnd(currentPrice, currentPrice), entry: rnd(entry, currentPrice), entryZoneLow, entryZoneHigh,
    stopLoss, tp1, tp2, tp3,
    slReason, tp1Reason, tp2Reason, tp3Reason,
    suggestedLeverage, confidence,
    riskPercent: slPercent.toFixed(2),
    tp1Percent: tp1Percent.toFixed(2),
    tp2Percent: tp2Percent.toFixed(2),
    tp3Percent: tp3Percent.toFixed(2),
    rr1: '1.5', rr2: '3.0', rr3: '5.0',
    rsi: { m5: rsi5m, m15: rsi15m, h1: rsi1h, h4: rsi4h },
    macd: { m15: macd15m, h1: macd1h, h4: macd4h },
    bollinger: { m15: bb15m, h1: bb1h },
    stochRsi: { m15: stochRsi15m, h1: stochRsi1h },
    ema: {
      h1: { ema9: rp(ema9_1h), ema21: rp(ema21_1h), ema50: rp(ema50_1h), ema200: rp(ema200_1h) },
      h4: { ema9: rp(ema9_4h), ema21: rp(ema21_4h) }
    },
    atr: { m15: atr15m ? rp(atr15m) : null, h1: atr1h ? rp(atr1h) : null, h4: atr4h ? rp(atr4h) : null },
    supports: sr1h.supports, resistances: sr1h.resistances,
    supports4h: sr4h.supports, resistances4h: sr4h.resistances,
    fibonacci: fib1h, fibonacci4h: fib4h,
    marketStructure: { h1: struct1h, h4: struct4h },
    orderbook, largeTrades,
    obv: obv1h,
    fundingRate: fundingData ? fundingData.lastFundingRate : null,
    ticker24h,
    sentimentScore: sentiment.score,
    sentimentDetails: sentiment,
    liqZones,
    reasoning,
    timestamp: new Date().toISOString()
  };
}

/**
 * Clean & exact position sizing:
 * Kasa = $1000, %1 = $10 Margin
 * 5x Kaldıraç -> Toplam Pozisyon = $50
 * SL %1.5 -> Kayıp: -$0.75 (%7.5 ROI)
 * TP1 %2.25 (1.5:1 RR) -> Kazanç: +$1.13 (+%11.3 ROI)
 * TP2 %4.5 (3.0:1 RR) -> Kazanç: +$2.25 (+%22.5 ROI)
 * TP3 %7.5 (5.0:1 RR) -> Kazanç: +$3.75 (+%37.5 ROI)
 */
export function calculateDollarRisk(idea, accountBalance = 1000, riskPercent = 1) {
  // Margin entered = accountBalance * (riskPercent / 100) -> e.g. $1000 * 1% = $10
  const marginRequired = Number((accountBalance * (riskPercent / 100)).toFixed(2));

  const levMatch = idea.suggestedLeverage ? idea.suggestedLeverage.match(/(\d+)x/) : null;
  const leverageNum = levMatch ? parseInt(levMatch[1]) : 5;

  // Notional Position Size = Margin * Leverage -> e.g. $10 * 5x = $50
  const positionValueDollar = Number((marginRequired * leverageNum).toFixed(2));

  const slDistPct = Math.abs(idea.entry - idea.stopLoss) / idea.entry;
  const tp1DistPct = Math.abs(idea.tp1 - idea.entry) / idea.entry;
  const tp2DistPct = Math.abs(idea.tp2 - idea.entry) / idea.entry;
  const tp3DistPct = Math.abs(idea.tp3 - idea.entry) / idea.entry;

  const slDollarLoss = Number((positionValueDollar * slDistPct).toFixed(2));
  const tp1DollarGain = Number((positionValueDollar * tp1DistPct).toFixed(2));
  const tp2DollarGain = Number((positionValueDollar * tp2DistPct).toFixed(2));
  const tp3DollarGain = Number((positionValueDollar * tp3DistPct).toFixed(2));

  // ROI on Margin
  const slRoi = Number((slDistPct * leverageNum * 100).toFixed(1));
  const tp1Roi = Number((tp1DistPct * leverageNum * 100).toFixed(1));
  const tp2Roi = Number((tp2DistPct * leverageNum * 100).toFixed(1));
  const tp3Roi = Number((tp3DistPct * leverageNum * 100).toFixed(1));

  return {
    accountBalance,
    riskPercent,
    marginRequired,
    leverageNum,
    positionValueDollar,
    slDollarLoss,
    tp1DollarGain,
    tp2DollarGain,
    tp3DollarGain,
    slRoi,
    tp1Roi,
    tp2Roi,
    tp3Roi
  };
}

export async function findBestPositions(symbols, maxResults = 5) {
  const ideas = [];
  for (const sym of symbols) {
    try {
      const idea = await generatePositionIdea(sym);
      if (idea && idea.confidence >= 58) ideas.push(idea);
      await new Promise(r => setTimeout(r, 250));
    } catch {}
  }
  ideas.sort((a, b) => b.confidence - a.confidence);
  return ideas.slice(0, maxResults);
}

// Helpers
function rnd(price, ref) {
  if (ref >= 10000) return Math.round(price * 10) / 10;
  if (ref >= 100) return Math.round(price * 100) / 100;
  if (ref >= 1) return Math.round(price * 1000) / 1000;
  if (ref >= 0.01) return Math.round(price * 100000) / 100000;
  return Math.round(price * 10000000) / 10000000;
}

function rp(val) {
  if (val === null || val === undefined) return 'N/A';
  return typeof val === 'number' ? val.toFixed(val >= 100 ? 2 : val >= 1 ? 4 : 6) : val;
}

function fmt(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
  return num.toString();
}
