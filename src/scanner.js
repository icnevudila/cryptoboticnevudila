import { getTopFuturesSymbols, getKlines, getFundingRates, getAll24hrTickers } from './binance.js';
import { calculateRSI, checkVolumeSurge, checkEMACross } from './indicators.js';
import { CONFIG } from './config.js';
import { loadState, saveState } from './storage.js';

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

          // --- SIGNAL 1: RSI Oversold (Long Candidate) ---
          if (rsi && rsi <= CONFIG.RSI_OVERSOLD) {
            const key = `${symbol}_RSI_OVERSOLD`;
            if (!state.cooldowns[key] || now - state.cooldowns[key] > cooldownMs) {
              state.cooldowns[key] = now;
              saveState(state);
              await this.broadcastSignal(subscribers, {
                title: '🟢 RSI AŞIRI SATIM (LONG ADAYI)',
                symbol,
                price: currentPrice,
                details: `• <b>RSI (15m):</b> <code>${rsi}</code> (Aşırı Satış Seviyesi &lt; 30)\n• <b>Fiyat:</b> <code>$${currentPrice}</code>\n• <b>Tavsiye:</b> Tepki yükselişi ve dönüş mumu beklenebilir.`,
                badge: '📈 ALIM BÖLGESİ'
              });
            }
          }

          // --- SIGNAL 2: RSI Overbought (Short Candidate) ---
          if (rsi && rsi >= CONFIG.RSI_OVERBOUGHT) {
            const key = `${symbol}_RSI_OVERBOUGHT`;
            if (!state.cooldowns[key] || now - state.cooldowns[key] > cooldownMs) {
              state.cooldowns[key] = now;
              saveState(state);
              await this.broadcastSignal(subscribers, {
                title: '🔴 RSI AŞIRI ALIM (SHORT ADAYI)',
                symbol,
                price: currentPrice,
                details: `• <b>RSI (15m):</b> <code>${rsi}</code> (Aşırı Alım Seviyesi &gt; 70)\n• <b>Fiyat:</b> <code>$${currentPrice}</code>\n• <b>Tavsiye:</b> Düzeltme veya kâr satışı riski yüksek.`,
                badge: '📉 SATIŞ BÖLGESİ'
              });
            }
          }

          // --- SIGNAL 3: Volume Spike (Balina / Ani Hacim Girişi) ---
          if (volumeSurge && volumeSurge.isSurge) {
            const direction = volumeSurge.isBullish ? '🟢 ALIM' : '🔴 SATIM';
            const key = `${symbol}_VOL_SURGE`;
            if (!state.cooldowns[key] || now - state.cooldowns[key] > cooldownMs) {
              state.cooldowns[key] = now;
              saveState(state);
              await this.broadcastSignal(subscribers, {
                title: `⚡ ANİ HACİM PATLAMASI (${volumeSurge.ratio}x)`,
                symbol,
                price: currentPrice,
                details: `• <b>Hacim Artışı:</b> <code>Ortalamanın ${volumeSurge.ratio} katı</code>\n• <b>Mum Yönü:</b> ${direction}\n• <b>Fiyat:</b> <code>$${currentPrice}</code>\n• <b>Tavsiye:</b> Güçlü hareket başladı, volatilite yüksek.`,
                badge: '💥 VOLATİLİTE ALARMI'
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
              await this.broadcastSignal(subscribers, {
                title: isBull ? '✨ EMA 9/21 GOLDEN CROSS (YÜKSELİŞ)' : '⚠️ EMA 9/21 DEATH CROSS (DÜŞÜŞ)',
                symbol,
                price: currentPrice,
                details: `• <b>Kesişim Türü:</b> ${isBull ? '🟢 EMA 9, EMA 21\'i yukarı kesti' : '🔴 EMA 9, EMA 21\'i aşağı kesti'}\n• <b>Fiyat:</b> <code>$${currentPrice}</code>\n• <b>Zaman Dilimi:</b> 15 Dakikalık Trend`,
                badge: isBull ? '🚀 YÜKSELİŞ TRENDİ' : '🔻 DÜŞÜŞ TRENDİ'
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
    const text = `<b>${signal.title}</b>\n\n` +
      `🪙 <b>Coin:</b> <code>#${signal.symbol}</code>\n` +
      `🏷️ <b>Durum:</b> ${signal.badge}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `${signal.details}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🔗 <a href="https://www.binance.com/tr/futures/${signal.symbol}">Binance'de Aç ↗</a> | ⏰ <i>${new Date().toLocaleTimeString('tr-TR')}</i>`;

    for (const chatId of subscribers) {
      await this.bot.sendMessage(chatId, text);
    }
  }
}
