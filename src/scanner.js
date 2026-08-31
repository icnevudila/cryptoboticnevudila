import { getTopFuturesSymbols, getKlines, getFundingRates, getAll24hrTickers } from './binance.js';
import { calculateRSI, checkVolumeSurge, checkEMACross } from './indicators.js';
import { CONFIG } from './config.js';
import { loadState, saveState } from './storage.js';
import { generatePositionIdea, calculateDollarRisk } from './positions.js';

export class MarketScanner {
  constructor(telegramBot) {
    this.bot = telegramBot;
    this.isScanning = false;
  }

  async runScan() {
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      const state = loadState();
      const subscribers = state.subscribers || [];
      if (subscribers.length === 0) {
        this.isScanning = false;
        return;
      }

      // 1. Check custom price alerts
      await this.checkPriceAlerts(state);

      // 2. Fetch top volume futures symbols
      const symbols = await getTopFuturesSymbols(30);
      if (symbols.length === 0) {
        this.isScanning = false;
        return;
      }

      const now = Date.now();
      const cooldownMs = CONFIG.COOLDOWN_MINUTES * 60 * 1000;

      for (const symbol of symbols) {
        try {
          // Fetch 15m klines
          const klines = await getKlines(symbol, '15m', 50);
          if (klines.length < 30) continue;

          const closes = klines.map(k => k.close);
          const currentPrice = closes[closes.length - 1];

          // Indicator 1: RSI (14)
          const rsi = calculateRSI(closes, CONFIG.RSI_PERIOD);

          // Indicator 2: Volume Surge (3x 20-candle SMA)
          const volumeSurge = checkVolumeSurge(klines, CONFIG.VOLUME_MULTIPLIER, 20);

          // Indicator 3: EMA 9/21 Cross
          const emaCross = checkEMACross(closes);

          // Helper to get quick position setup
          const getQuickSetup = async (direction) => {
            try {
              const idea = await generatePositionIdea(symbol);
              if (idea && idea.direction !== 'NEUTRAL') return idea;
            } catch {}
            // Fallback quick ATR calc
            const atrEst = currentPrice * 0.012;
            const isLong = direction === 'LONG';
            const sl = isLong ? currentPrice - atrEst : currentPrice + atrEst;
            const tp1 = isLong ? currentPrice + atrEst * 1.5 : currentPrice - atrEst * 1.5;
            const tp2 = isLong ? currentPrice + atrEst * 3.0 : currentPrice - atrEst * 3.0;
            const tp3 = isLong ? currentPrice + atrEst * 5.0 : currentPrice - atrEst * 5.0;
            const slPct = ((Math.abs(currentPrice - sl) / currentPrice) * 100).toFixed(2);
            return {
              symbol, direction, entry: currentPrice, currentPrice,
              stopLoss: sl, tp1, tp2, tp3,
              suggestedLeverage: '5x', riskPercent: slPct,
              tp1Percent: (parseFloat(slPct) * 1.5).toFixed(2),
              tp2Percent: (parseFloat(slPct) * 3.0).toFixed(2),
              tp3Percent: (parseFloat(slPct) * 5.0).toFixed(2)
            };
          };

          // --- SIGNAL 1: RSI Oversold (Long Candidate) ---
          if (rsi && rsi <= CONFIG.RSI_OVERSOLD) {
            const key = `${symbol}_RSI_OVERSOLD`;
            if (!state.cooldowns[key] || now - state.cooldowns[key] > cooldownMs) {
              state.cooldowns[key] = now;
              saveState(state);
              const idea = await getQuickSetup('LONG');
              await this.broadcastSignal(subscribers, {
                title: '🟢 RSI AŞIRI SATIM RADARI (LONG FIRSATI)',
                symbol,
                badge: '📈 DİPTEN DÖNÜŞ ADAYI',
                reason: `15m RSI: ${rsi} (< 30) aşırı satım bölgesine ulaştı.`,
                idea
              });
            }
          }

          // --- SIGNAL 2: RSI Overbought (Short Candidate) ---
          if (rsi && rsi >= CONFIG.RSI_OVERBOUGHT) {
            const key = `${symbol}_RSI_OVERBOUGHT`;
            if (!state.cooldowns[key] || now - state.cooldowns[key] > cooldownMs) {
              state.cooldowns[key] = now;
              saveState(state);
              const idea = await getQuickSetup('SHORT');
              await this.broadcastSignal(subscribers, {
                title: '🔴 RSI AŞIRI ALIM RADARI (SHORT FIRSATI)',
                symbol,
                badge: '📉 TEPEDEN DÜZELTME ADAYI',
                reason: `15m RSI: ${rsi} (> 70) aşırı alım bölgesinde yoruldu.`,
                idea
              });
            }
          }

          // --- SIGNAL 3: Volume Spike (Balina / Ani Hacim Girişi) ---
          if (volumeSurge && volumeSurge.isSurge) {
            const dir = volumeSurge.isBullish ? 'LONG' : 'SHORT';
            const key = `${symbol}_VOL_SURGE`;
            if (!state.cooldowns[key] || now - state.cooldowns[key] > cooldownMs) {
              state.cooldowns[key] = now;
              saveState(state);
              const idea = await getQuickSetup(dir);
              await this.broadcastSignal(subscribers, {
                title: `⚡ ANİ HACİM PATLAMASI (${volumeSurge.ratio}x Ort.)`,
                symbol,
                badge: volumeSurge.isBullish ? '💥 BOĞA HACİM GİRİŞİ' : '💥 AYI SATIŞ BASKISI',
                reason: `Normalin ${volumeSurge.ratio} katı agresif hacim patlaması gerçekleşti.`,
                idea
              });
            }
          }

          // --- SIGNAL 4: EMA Golden / Death Cross ---
          if (emaCross) {
            const isBull = emaCross.type === 'BULLISH_CROSS';
            const key = `${symbol}_${emaCross.type}`;
            if (!state.cooldowns[key] || now - state.cooldowns[key] > cooldownMs) {
              state.cooldowns[key] = now;
              saveState(state);
              const idea = await getQuickSetup(isBull ? 'LONG' : 'SHORT');
              await this.broadcastSignal(subscribers, {
                title: isBull ? '✨ EMA 9/21 GOLDEN CROSS (YÜKSELİŞ TRENDİ)' : '⚠️ EMA 9/21 DEATH CROSS (DÜŞÜŞ TRENDİ)',
                symbol,
                badge: isBull ? '🚀 YÜKSELİŞ TRENDİ BAŞLADI' : '🔻 DÜŞÜŞ TRENDİ BAŞLADI',
                reason: isBull ? 'EMA 9, EMA 21 ortalamasını yukarı yönlü kesti.' : 'EMA 9, EMA 21 ortalamasını aşağı yönlü kesti.',
                idea
              });
            }
          }

          // Tiny delay between symbols to prevent rate limit
          await new Promise(r => setTimeout(r, 100));
        } catch (e) {
          // Symbol error, continue
        }
      }
    } catch (err) {
      console.error('Scan error:', err.message);
    } finally {
      this.isScanning = false;
    }
  }

  // Check Custom Price Alerts
  async checkPriceAlerts(state) {
    if (!state.alerts || state.alerts.length === 0) return;

    try {
      const tickers = await getAll24hrTickers();
      const remainingAlerts = [];

      for (const alert of state.alerts) {
        const ticker = tickers[alert.symbol];
        if (!ticker) {
          remainingAlerts.push(alert);
          continue;
        }

        let triggered = false;
        if (alert.direction === 'ABOVE' && ticker.lastPrice >= alert.targetPrice) {
          triggered = true;
        } else if (alert.direction === 'BELOW' && ticker.lastPrice <= alert.targetPrice) {
          triggered = true;
        }

        if (triggered) {
          const msg = `🎯 <b>FİYAT ALARMI TETİKLENDİ!</b>\n\n` +
            `🔹 <b>Sembol:</b> <code>#${alert.symbol}</code>\n` +
            `📍 <b>Hedef Fiyat:</b> <code>$${alert.targetPrice}</code>\n` +
            `⚡ <b>Anlık Fiyat:</b> <code>$${ticker.lastPrice}</code>\n` +
            `📊 <b>24s Değişim:</b> <code>%${ticker.priceChangePercent > 0 ? '+' : ''}${ticker.priceChangePercent.toFixed(2)}</code>\n\n` +
            `⏰ <i>Alarm başarıyla tamamlandı ve kaldırıldı.</i>`;

          await this.bot.sendMessage(alert.chatId, msg);
        } else {
          remainingAlerts.push(alert);
        }
      }

      if (remainingAlerts.length !== state.alerts.length) {
        state.alerts = remainingAlerts;
        saveState(state);
      }
    } catch (err) {
      console.error('Alert check error:', err.message);
    }
  }

  async broadcastSignal(subscribers, signal) {
    const state = loadState();
    const idea = signal.idea;

    for (const chatId of subscribers) {
      const bal = state.userSettings?.[chatId]?.accountBalance || CONFIG.DEFAULT_ACCOUNT_BALANCE;
      const risk = state.userSettings?.[chatId]?.riskPercent || CONFIG.DEFAULT_RISK_PERCENT;
      const riskCalc = calculateDollarRisk(idea, bal, risk);

      const dirEmoji = idea.direction === 'LONG' ? '🟢' : '🔴';
      const dirText = idea.direction === 'LONG' ? 'LONG (AL)' : 'SHORT (SAT)';

      let text = `<b>${signal.title}</b>\n`;
      text += `🪙 <b>#${signal.symbol} → ${dirEmoji} ${dirText}</b>\n`;
      text += `🏷️ <b>Durum:</b> ${signal.badge}\n`;
      text += `⚡ <b>Anlık Fiyat:</b> <code>$${idea.currentPrice || idea.entry}</code>\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      text += `💡 <b>Sinyal Nedeni:</b> <i>${signal.reason}</i>\n\n`;

      text += `💼 <b>ÖNERİLEN İŞLEM KURGUSU (Kasa: $${bal}):</b>\n`;
      text += `• 💵 <b>Margin:</b> <code>$${riskCalc.marginRequired}</code> (%${risk}) | <b>Kaldıraç:</b> <code>${riskCalc.leverageNum}x</code>\n`;
      text += `• 🔥 <b>Toplam Pozisyon:</b> <code>$${riskCalc.positionValueDollar}</code> ($${riskCalc.marginRequired} × ${riskCalc.leverageNum}x)\n\n`;

      text += `📍 <b>FİYAT & HEDEFLER:</b>\n`;
      text += `• 🎯 <b>Giriş:</b> <code>$${idea.entry}</code>\n`;
      text += `• 🛡️ <b>Stop-Loss (SL):</b> <code>$${idea.stopLoss}</code> (-%${idea.riskPercent}) → <b>-$${riskCalc.slDollarLoss}</b> (-%${riskCalc.slRoi} Margin)\n\n`;

      text += `🎯 <b>KÂR AL HEDEFLERİ:</b>\n`;
      text += `• <b>TP1:</b> <code>$${idea.tp1}</code> (+%${idea.tp1Percent}) [R:R 1.5:1] → <b>+$${riskCalc.tp1DollarGain}</b> (+%${riskCalc.tp1Roi} Margin)\n`;
      text += `• <b>TP2:</b> <code>$${idea.tp2}</code> (+%${idea.tp2Percent}) [R:R 3.0:1] → <b>+$${riskCalc.tp2DollarGain}</b> (+%${riskCalc.tp2Roi} Margin)\n`;
      text += `• <b>TP3:</b> <code>$${idea.tp3}</code> (+%${idea.tp3Percent}) [R:R 5.0:1] → <b>+$${riskCalc.tp3DollarGain}</b> (+%${riskCalc.tp3Roi} Margin)\n\n`;

      text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `🔗 <a href="https://www.binance.com/tr/futures/${signal.symbol}">Binance'de Aç ↗</a> | ⏰ <i>${new Date().toLocaleTimeString('tr-TR')}</i>`;

      await this.bot.sendMessage(chatId, text);
      await new Promise(r => setTimeout(r, 200));
    }
  }
}
