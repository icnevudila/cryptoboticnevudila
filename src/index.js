import { TelegramBot } from './telegram.js';
import { MarketScanner } from './scanner.js';
import { CONFIG } from './config.js';
import { loadState, saveState } from './storage.js';
import { getTopFuturesSymbols, getKlines, getFundingRates, getAll24hrTickers } from './binance.js';
import { calculateRSI, checkVolumeSurge } from './indicators.js';
import { analyzeTopTraderSentiment } from './toptraders.js';
import { generatePositionIdea, findBestPositions, calculateDollarRisk } from './positions.js';
import { VirtualTracker } from './virtualtracker.js';
import { runBacktest } from './backtest.js';
import { getFearGreedIndex, getGlobalMarketData } from './intelligence.js';

console.log('🚀 Starting Crypto Signal Bot v3.5 Professional ...');

const bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN);
const scanner = new MarketScanner(bot);
const tracker = new VirtualTracker(bot);

// =============================================
// TELEGRAM COMMANDS
// =============================================

// /start
bot.onCommand('/start', async ({ chatId, msg }) => {
  const state = loadState();
  if (!state.subscribers.includes(chatId)) {
    state.subscribers.push(chatId);
    saveState(state);
  }

  const welcome = `👋 <b>Hoş Geldiniz, ${msg.from.first_name || 'Trader'}!</b>\n\n` +
    `🤖 <b>Kripto Sinyal, Analiz & Otomasyon Botu v3.5 Devrede!</b>\n` +
    `Binance Futures canlı verileri, Top Trader duyarlılığı, Orderbook derinliği, Sanal Takip ve Backtest motoru aktif.\n\n` +
    `📌 <b>Hızlı Komutlar:</b>\n` +
    `• 🎯 /pozisyon - Anlık en iyi Long/Short fırsatları (Net $ Kazanç/Kayıp ile)\n` +
    `• 🌅 /sabah - Günlük sabah özeti (Piyasa Duyarlılığı, Backtest Sonuçları & Sinyaller)\n` +
    `• 💼 /kasa <code>[MİKTAR]</code> - Kasa bakiyenizi belirleyin (Örn: <code>/kasa 1000</code>)\n` +
    `• ⚠️ /risk <code>[YÜZDE]</code> - İşlem başına risk yüzdesi (Örn: <code>/risk 1</code>)\n` +
    `• 🐋 /toptrader <code>[COIN]</code> - Top Trader & Balina analizi (Örn: /toptrader BTC)\n` +
    `• 📊 /analiz <code>[COIN]</code> - Çoklu zaman dilimli ultra detaylı analiz\n` +
    `• 📈 /canlipozisyonlar - Açık pozisyonların canlı fiyatı, mesafesi ve anlık $ P&L'i\n` +
    `• 🏆 /performans - Toplam TP, SL ve Net $ Kâr/Zarar karnesi\n` +
    `• 📋 /gecmis - Kapanan tüm sanal işlemlerin dökümü\n` +
    `• 📉 /backtest <code>[COIN]</code> - Geçmiş veri üzerinde strateji testi\n` +
    `• 🔍 /tara - 15m RSI & Hacim patlaması radarı\n` +
    `• 💰 /fonlama - Canlı Funding Rate radarı\n` +
    `• ⏰ /alarm <code>[COIN] [FİYAT]</code> - Fiyat alarmı kur\n` +
    `• ❓ /yardim - Detaylı kullanım rehberi`;

  await bot.sendMessage(chatId, welcome);
});

// /yardim
bot.onCommand('/yardim', async ({ chatId }) => {
  const helpText = `📖 <b>DETAYLI KOMUT REHBERİ v3.5</b>\n\n` +
    `💼 <b>/kasa [MİKTAR]</b>\nKasa bakiyenizi ayarlar. Tüm pozisyonlarda kaç $ margin ile girileceği, stop olunca tam kaç $ gideceği ve TP'de kaç $ kâr alınacağı buna göre hesaplanır.\nÖrnek: <code>/kasa 2500</code>\n\n` +
    `⚠️ <b>/risk [YÜZDE]</b>\nİşlem başına kasanızın max yüzde kaçını riske atacağınızı belirler (Örn: %1 veya %2).\nÖrnek: <code>/risk 1.5</code>\n\n` +
    `🎯 <b>/pozisyon</b>\nTop 20 vadeli coin arasında tüm teknik indikatörler, orderbook ve top trader verisiyle en güçlü fırsatları seçer. Giriş, Margin, SL ($ kayıp), TP1/2/3 ($ kazanç) verir ve otomatik sanal pozisyon açar.\n\n` +
    `🌅 <b>/sabah</b>\nHer sabah yapılan piyasa durum raporu, Fear & Greed endeksi, BTC dominansı, coinlerin son backtest başarı oranları ve günün en iyi sinyallerini döker.\n\n` +
    `📡 <b>/canlipozisyonlar (veya /canli)</b>\nŞu an açık olan tüm sanal pozisyonların anlık canlı Binance fiyatlarını, TP ve SL'e kalan mesafelerini ve anlık Net $ kâr/zararlarını gösterir.\n\n` +
    `🏆 <b>/performans</b>\nBotun bugüne kadar verdiği tüm sinyallerin toplam TP sayısı, SL sayısı, Net Dolar Kâr/Zararı ve Kazanma Oranını raporlar.\n\n` +
    `📋 <b>/gecmis</b>\nKapanan son 10 sanal işlemin giriş, çıkış fiyatları ve net kazanç/kayıp detayları.\n\n` +
    `📉 <b>/backtest [COIN] [ZAMAN_DİLİMİ]</b>\nÖrnek: <code>/backtest BTC 1h</code> veya <code>/backtest ETH 4h</code>`;

  await bot.sendMessage(chatId, helpText);
});

// /kasa [MIKTAR]
bot.onCommand('/kasa', async ({ chatId, args }) => {
  const state = loadState();
  if (!state.userSettings) state.userSettings = {};

  if (args.length === 0) {
    const bal = state.userSettings[chatId]?.accountBalance || CONFIG.DEFAULT_ACCOUNT_BALANCE;
    const risk = state.userSettings[chatId]?.riskPercent || CONFIG.DEFAULT_RISK_PERCENT;
    await bot.sendMessage(chatId, `💼 <b>KASA & RİSK AYARLARINIZ:</b>\n\n` +
      `💰 Kayıtlı Bakiye: <code>$${bal}</code>\n` +
      `⚠️ İşlem Başına Risk: <code>%${risk}</code> (Maksimum Kayıp: <b>$${(bal * risk / 100).toFixed(2)}</b>)\n\n` +
      `<i>Değiştirmek için: <code>/kasa 5000</code> veya <code>/risk 2</code> yazabilirsiniz.</i>`);
    return;
  }

  const amount = parseFloat(args[0].replace(',', '.'));
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, `❌ Geçersiz miktar. Örnek: <code>/kasa 1000</code>`);
    return;
  }

  if (!state.userSettings[chatId]) state.userSettings[chatId] = {};
  state.userSettings[chatId].accountBalance = amount;
  saveState(state);

  const risk = state.userSettings[chatId].riskPercent || CONFIG.DEFAULT_RISK_PERCENT;
  await bot.sendMessage(chatId, `✅ <b>Kasa Bakiyeniz Güncellendi!</b>\n\n` +
    `💰 Yeni Bakiye: <code>$${amount}</code>\n` +
    `⚠️ İşlem Başına Risk: <code>%${risk}</code> (Max Kayıp: <b>$${(amount * risk / 100).toFixed(2)}</b>)\n\n` +
    `<i>Tüm sinyallerde bu bakiyeye göre tam dolar hesabı yapılacaktır.</i>`);
});

// /risk [YUZDE]
bot.onCommand('/risk', async ({ chatId, args }) => {
  if (args.length === 0) {
    await bot.sendMessage(chatId, `⚠️ Kullanım: <code>/risk 1</code> veya <code>/risk 2</code> (Max %10)`);
    return;
  }

  const pct = parseFloat(args[0].replace(',', '.'));
  if (isNaN(pct) || pct <= 0 || pct > 10) {
    await bot.sendMessage(chatId, `❌ Risk oranı %0.1 ile %10 arasında olmalıdır.`);
    return;
  }

  const state = loadState();
  if (!state.userSettings) state.userSettings = {};
  if (!state.userSettings[chatId]) state.userSettings[chatId] = {};
  state.userSettings[chatId].riskPercent = pct;
  saveState(state);

  const bal = state.userSettings[chatId].accountBalance || CONFIG.DEFAULT_ACCOUNT_BALANCE;
  await bot.sendMessage(chatId, `✅ <b>Risk Oranı Güncellendi!</b>\n\n` +
    `⚠️ Yeni Risk: <code>%${pct}</code>\n` +
    `💰 Kasa: <code>$${bal}</code>\n` +
    `💸 Stop Başına Max Kayıp: <code>$${(bal * pct / 100).toFixed(2)}</code>`);
});

// 🌅 /sabah (Morning Digest: Fear/Greed, BTC Dominance, Backtest Results, Virtual Stats, Top Signals)
bot.onCommand('/sabah', async ({ chatId }) => {
  await sendMorningReportToChat(chatId);
});

// 🎯 /pozisyon (Best Real-Time Position Signals with Exact Dollar Sizing)
bot.onCommand('/pozisyon', async ({ chatId }) => {
  const state = loadState();
  const userBal = state.userSettings?.[chatId]?.accountBalance || CONFIG.DEFAULT_ACCOUNT_BALANCE;
  const userRisk = state.userSettings?.[chatId]?.riskPercent || CONFIG.DEFAULT_RISK_PERCENT;

  await bot.sendMessage(chatId, `🔎 <i>En hacimli 20 coin taranıyor (Kasa: $${userBal} | Risk: %${userRisk})...\nLütfen 15-20 saniye bekleyin.</i>`);

  try {
    const symbols = await getTopFuturesSymbols(20);
    const ideas = await findBestPositions(symbols, 5);

    if (ideas.length === 0) {
      await bot.sendMessage(chatId, `⚖️ <b>Şu an yeterli güven seviyesinde (≥%58) pozisyon oluşmadı.</b>\nPiyasa yatay seyrediyor. Uyum sağlandığında otomatik alarm gelecektir.\n\n💡 İstediğiniz coini tek tek incelemek için: <code>/analiz BTC</code>`);
      return;
    }

    await bot.sendMessage(chatId, `🎯 <b>CANLI POZİSYON FIRSATLARI (${ideas.length} adet)</b>\n` +
      `<i>Kasa: $${userBal} | İşlem Başına Risk: %${userRisk} ($${(userBal * userRisk / 100).toFixed(2)})</i>\n━━━━━━━━━━━━━━━━━━━`);

    for (const idea of ideas) {
      const msgs = formatPositionMessage(idea, userBal, userRisk);
      for (const m of msgs) {
        await bot.sendMessage(chatId, m);
        await new Promise(r => setTimeout(r, 200));
      }

      // Automatically open virtual position
      const vp = tracker.openVirtualPosition(idea, userBal, userRisk);
      if (vp) {
        await bot.sendMessage(chatId, `📈 <i>↳ #${idea.symbol} sanal işlem portföyüne eklendi. SL/TP canlı izlenecek.</i>`);
      }

      await new Promise(r => setTimeout(r, 300));
    }

    await bot.sendMessage(chatId, `⚠️ <i>Bilgilendirme: Risk yönetimi kuralınıza sadık kalınız. Kasa ayarı için /kasa komutunu kullanabilirsiniz.</i>`);
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Hata: ${err.message}`);
  }
});

// /analiz [COIN]
bot.onCommand('/analiz', async ({ chatId, args }) => {
  let symbol = 'BTCUSDT';
  if (args.length > 0) {
    symbol = args[0].toUpperCase();
    if (!symbol.endsWith('USDT')) symbol += 'USDT';
  }

  const state = loadState();
  const userBal = state.userSettings?.[chatId]?.accountBalance || CONFIG.DEFAULT_ACCOUNT_BALANCE;
  const userRisk = state.userSettings?.[chatId]?.riskPercent || CONFIG.DEFAULT_RISK_PERCENT;

  await bot.sendMessage(chatId, `⏳ <i>${symbol} için tüm göstergeler, orderbook ve top trader verileri toplanıyor...</i>`);

  try {
    const idea = await generatePositionIdea(symbol);
    if (!idea) {
      await bot.sendMessage(chatId, `⚖️ <b>#${symbol}</b> için şu an net bir trend veya yön sinyali bulunmuyor.\n\nSadece Top Trader duyarlılığına bakmak için: <code>/toptrader ${symbol.replace('USDT', '')}</code>`);
      return;
    }

    const msgs = formatPositionMessage(idea, userBal, userRisk);
    for (const m of msgs) {
      await bot.sendMessage(chatId, m);
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Hata: ${err.message}`);
  }
});

// /toptrader [COIN]
bot.onCommand('/toptrader', async ({ chatId, args }) => {
  let symbol = 'BTCUSDT';
  if (args.length > 0) {
    symbol = args[0].toUpperCase();
    if (!symbol.endsWith('USDT')) symbol += 'USDT';
  }

  await bot.sendMessage(chatId, `⏳ <i>${symbol} Top Trader ve Balina verisi çekiliyor...</i>`);

  try {
    const analysis = await analyzeTopTraderSentiment(symbol);
    let emoji, text;
    if (analysis.score > 30) { emoji = '🟢'; text = 'GÜÇLÜ YÜKSELİŞ'; }
    else if (analysis.score > 10) { emoji = '📈'; text = 'YÜKSELİŞ EĞİLİMİ'; }
    else if (analysis.score > -10) { emoji = '⚖️'; text = 'NÖTR / KARARSIZ'; }
    else if (analysis.score > -30) { emoji = '📉'; text = 'DÜŞÜŞ EĞİLİMİ'; }
    else { emoji = '🔴'; text = 'GÜÇLÜ DÜŞÜŞ'; }

    let msg = `🐋 <b>TOP TRADER & BALİNA ANALİZİ: #${symbol}</b>\n\n` +
      `${emoji} <b>Duyarlılık:</b> ${text} (Skor: ${analysis.score}/100)\n` +
      `━━━━━━━━━━━━━━━━━━━\n`;

    if (analysis.topTraderPosition) msg += `📊 <b>Top Trader Pozisyon Oranı:</b> <code>${analysis.topTraderPosition.ratio.toFixed(2)}</code>\n`;
    if (analysis.topTraderAccounts) msg += `👥 <b>Top Trader Hesap Oranı:</b> <code>${analysis.topTraderAccounts.ratio.toFixed(2)}</code>\n`;
    if (analysis.globalSentiment) msg += `🌍 <b>Global Long/Short Oranı:</b> <code>${analysis.globalSentiment.ratio.toFixed(2)}</code>\n`;
    if (analysis.takerAggression) msg += `⚡ <b>Taker Alım/Satım Oranı:</b> <code>${analysis.takerAggression.ratio.toFixed(2)}</code>\n`;
    if (analysis.oiTrend) msg += `📈 <b>Açık Pozisyon (OI) Değişimi:</b> <code>%${analysis.oiTrend.changePercent}</code>\n`;

    if (analysis.signals.length > 0) {
      msg += `━━━━━━━━━━━━━━━━━━━\n🔍 <b>Tespit Edilen Önemli Noktalar:</b>\n`;
      analysis.signals.forEach(s => { msg += `${s}\n`; });
    }

    msg += `\n⏰ <i>${new Date().toLocaleTimeString('tr-TR')}</i>`;
    await bot.sendMessage(chatId, msg);
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Hata: ${err.message}`);
  }
});

// 📈 /canlipozisyonlar (and aliases: /canli, /canlipoz, /sanal, /pozisyonlar, /acikpozisyonlar)
const handleLivePositions = async ({ chatId }) => {
  const state = loadState();
  const open = state.virtualPositions || [];

  if (open.length === 0) {
    await bot.sendMessage(chatId, `📭 <b>Şu an canlı izlenen açık pozisyon bulunmuyor.</b>\n\n` +
      `💡 <b>Nasıl Başlatılır?</b>\n` +
      `<code>/pozisyon</code> komutunu çalıştırdığınızda en iyi fırsatlar taranır ve otomatik olarak canlı izleme listesine eklenir.`);
    return;
  }

  await bot.sendMessage(chatId, `📡 <i>${open.length} adet açık pozisyonun canlı fiyatları ve kâr/zarar durumları çekiliyor...</i>`);

  let tickers;
  try { tickers = await getAll24hrTickers(); } catch { tickers = {}; }

  let totalUnrealizedDollar = 0;
  let msg = `📡 <b>CANLI POZİSYON İZLEME PANELİ (${open.length} Aktif)</b>\n━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let i = 0; i < open.length; i++) {
    const pos = open[i];
    const ticker = tickers[pos.symbol];
    const currentPrice = ticker ? ticker.lastPrice : pos.entry;
    const isLong = pos.direction === 'LONG';

    const pnlPct = isLong
      ? ((currentPrice - pos.entry) / pos.entry * 100)
      : ((pos.entry - currentPrice) / pos.entry * 100);

    const dollarPnl = (pos.positionValueDollar || 1000) * (pnlPct / 100);
    totalUnrealizedDollar += dollarPnl;

    const pnlSign = pnlPct >= 0 ? '+' : '';
    const dollarSign = dollarPnl >= 0 ? '+' : '';
    const dirEmoji = isLong ? '🟢' : '🔴';
    const statusEmoji = pnlPct >= 0 ? '📈' : '📉';

    const duration = Math.round((Date.now() - new Date(pos.openedAt).getTime()) / 60000);
    const durText = duration > 60 ? `${Math.floor(duration / 60)}s ${duration % 60}dk` : `${duration}dk`;

    // Visual progress towards TP1 or SL
    const tp1DistPct = isLong ? ((pos.tp1 - currentPrice) / currentPrice * 100) : ((currentPrice - pos.tp1) / currentPrice * 100);
    const slDistPct = isLong ? ((currentPrice - pos.stopLoss) / currentPrice * 100) : ((pos.stopLoss - currentPrice) / currentPrice * 100);

    msg += `<b>${i + 1}. ${dirEmoji} #${pos.symbol} (${pos.direction})</b>\n`;
    msg += `   📍 <b>Giriş:</b> <code>$${pos.entry}</code> → ⚡ <b>Anlık:</b> <code>$${currentPrice}</code>\n`;
    msg += `   ${statusEmoji} <b>Anlık P&L:</b> <code>${pnlSign}%${pnlPct.toFixed(2)}</code> (<b>${dollarSign}$${dollarPnl.toFixed(2)}</b>)\n`;
    msg += `   🎯 <b>Hedefler:</b> TP1: $${pos.tp1} ${pos.tp1Hit ? '✅' : `(Kalan: %${tp1DistPct.toFixed(1)})`}`;
    if (pos.tp2Hit) msg += ` | TP2: ✅`;
    msg += `\n`;
    msg += `   🛡️ <b>Stop-Loss:</b> $${pos.stopLoss} (Uzaklık: %${slDistPct.toFixed(1)})\n`;
    msg += `   💼 <b>Margin:</b> $${pos.marginRequired || 100} (${pos.suggestedLeverage || '10x'}) | <b>Kasa:</b> $${pos.accountBalance || 1000}\n`;
    msg += `   ⏱️ <b>Süre:</b> ${durText} | 🔝 <b>Max Kâr:</b> <code>+%${pos.highestPnl}</code>\n\n`;
  }

  const totalSign = totalUnrealizedDollar >= 0 ? '+' : '';
  const totalEmoji = totalUnrealizedDollar >= 0 ? '🟢' : '🔴';
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `${totalEmoji} <b>Toplam Açık P&L:</b> <code>${totalSign}$${totalUnrealizedDollar.toFixed(2)}</code>\n\n`;
  msg += `<i>🔔 Sistem bu pozisyonları 30 saniyede bir denetler. TP veya SL seviyesine ulaşıldığında anında bildirim gönderilir.</i>`;

  await bot.sendMessage(chatId, msg);
};

bot.onCommand('/canlipozisyonlar', handleLivePositions);
bot.onCommand('/canli', handleLivePositions);
bot.onCommand('/canlipoz', handleLivePositions);
bot.onCommand('/sanal', handleLivePositions);
bot.onCommand('/pozisyonlar', handleLivePositions);
bot.onCommand('/acikpozisyonlar', handleLivePositions);

// 🏆 /performans - Performance Scorecard
bot.onCommand('/performans', async ({ chatId }) => {
  const state = loadState();
  const userBal = state.userSettings?.[chatId]?.accountBalance || CONFIG.DEFAULT_ACCOUNT_BALANCE;
  const stats = tracker.getPerformanceStats(userBal);

  if (!stats) {
    await bot.sendMessage(chatId, `📊 <b>Henüz tamamlanmış sanal işlem bulunmuyor.</b>\n<code>/pozisyon</code> ile sinyal ürettikçe bot otomatik pozisyon açıp TP ve SL sonuçlarını buraya işleyecektir.`);
    return;
  }

  const winBar = '🟩'.repeat(Math.round(parseFloat(stats.winRate) / 10)) + '🟥'.repeat(10 - Math.round(parseFloat(stats.winRate) / 10));
  const pnlEmoji = parseFloat(stats.totalDollarPnl) >= 0 ? '🟢' : '🔴';

  let msg = `🏆 <b>BOT SANAL İŞLEM KARNESİ & PERFORMANS</b>\n━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `📊 <b>Toplam Tamamlanan İşlem:</b> <code>${stats.totalTrades}</code>\n`;
  msg += `✅ <b>Başarılı (TP):</b> <code>${stats.wins}</code> | ❌ <b>Stop (SL):</b> <code>${stats.losses}</code>\n`;
  msg += `📈 <b>Kazanma Oranı:</b> <code>%${stats.winRate}</code> ${winBar}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `${pnlEmoji} <b>Toplam Net Kâr/Zarar:</b> <code>${parseFloat(stats.totalDollarPnl) >= 0 ? '+' : ''}$${stats.totalDollarPnl}</code>\n`;
  msg += `📊 <b>Kasa Büyümesi:</b> <code>${parseFloat(stats.totalPercentPnl) >= 0 ? '+' : ''}%${stats.totalPercentPnl}</code>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🎯 <b>Hedef Ulaşma Detayı:</b>\n`;
  msg += `• TP1 Alanlar: <code>${stats.tp1Count}</code> adet\n`;
  msg += `• TP2 Alanlar: <code>${stats.tp2Count}</code> adet\n`;
  msg += `• TP3 Alanlar: <code>${stats.tp3Count}</code> adet\n`;
  msg += `• Stop-Loss (SL): <code>${stats.slCount}</code> adet\n\n`;
  msg += `<i>Geçmiş tüm işlemleri tek tek görmek için: /gecmis</i>`;

  await bot.sendMessage(chatId, msg);
});

// 📋 /gecmis - Trade History
bot.onCommand('/gecmis', async ({ chatId }) => {
  const state = loadState();
  const history = state.positionHistory || [];

  if (history.length === 0) {
    await bot.sendMessage(chatId, `📭 Henüz kapanmış işlem geçmişi yok.`);
    return;
  }

  const last10 = history.slice(-10).reverse();
  let msg = `📋 <b>SON ${last10.length} İŞLEM GEÇMİŞİ:</b>\n━━━━━━━━━━━━━━━━━━━\n\n`;

  last10.forEach((p, i) => {
    const isWin = p.closeReason !== 'STOP_LOSS';
    const icon = isWin ? '✅' : '❌';
    const resText = isWin ? p.closeReason : 'SL';
    const dollar = p.finalDollarPnl !== undefined ? p.finalDollarPnl : 0;
    const sign = dollar >= 0 ? '+' : '';

    msg += `${i + 1}. ${icon} <b>#${p.symbol}</b> ${p.direction} → <b>${resText}</b>\n`;
    msg += `   Giriş: $${p.entry} | Çıkış: $${p.closePrice}\n`;
    msg += `   Net: <code>${sign}$${dollar}</code> | Tarih: <i>${new Date(p.closedAt || p.openedAt).toLocaleDateString('tr-TR')}</i>\n\n`;
  });

  await bot.sendMessage(chatId, msg);
});

// 📉 /backtest [COIN] [INTERVAL]
bot.onCommand('/backtest', async ({ chatId, args }) => {
  let symbol = 'BTCUSDT';
  let interval = '1h';

  if (args.length > 0) {
    symbol = args[0].toUpperCase();
    if (!symbol.endsWith('USDT')) symbol += 'USDT';
  }
  if (args.length > 1 && ['15m', '30m', '1h', '4h'].includes(args[1])) {
    interval = args[1];
  }

  await bot.sendMessage(chatId, `📉 <i>${symbol} için ${interval} zaman diliminde son 500 mumluk backtest simülasyonu yapılıyor...</i>`);

  try {
    const result = await runBacktest(symbol, interval, 500);
    if (result.error) {
      await bot.sendMessage(chatId, `❌ ${result.error}`);
      return;
    }

    const pnlEmoji = parseFloat(result.totalPnl) >= 0 ? '🟢' : '🔴';
    const winBar = '🟩'.repeat(Math.round(parseFloat(result.winRate) / 10)) + '🟥'.repeat(10 - Math.round(parseFloat(result.winRate) / 10));

    let msg = `📉 <b>BACKTEST RAPORU: #${symbol} (${interval})</b>\n━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📅 <b>Test Dönemi:</b> <code>${result.periodStart.slice(0, 10)}</code> → <code>${result.periodEnd.slice(0, 10)}</code>\n`;
    msg += `📊 <b>Toplam Mum:</b> ${result.totalCandles} | <b>Oluşan İşlem:</b> ${result.totalTrades}\n\n`;
    msg += `✅ <b>Kazanan:</b> <code>${result.wins}</code> | ❌ <b>Stop:</b> <code>${result.losses}</code> | ⏱️ <b>Timeout:</b> <code>${result.timeouts}</code>\n`;
    msg += `📈 <b>Win Rate:</b> <code>%${result.winRate}</code> ${winBar}\n\n`;
    msg += `${pnlEmoji} <b>Toplam Strateji P&L:</b> <code>${parseFloat(result.totalPnl) >= 0 ? '+' : ''}%${result.totalPnl}</code>\n`;
    msg += `📈 <b>Ortalama Kazanç:</b> <code>+%${result.avgWin}</code>\n`;
    msg += `📉 <b>Ortalama Kayıp:</b> <code>%${result.avgLoss}</code>\n`;
    msg += `⚖️ <b>Profit Factor:</b> <code>${result.profitFactor}</code>\n`;
    msg += `📉 <b>Maksimum Drawdown:</b> <code>%${result.maxDrawdown}</code>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🎯 <b>Hedef Başarı Oranları:</b>\n`;
    msg += `• TP1 İsabeti: <code>%${result.tp1HitRate}</code>\n`;
    msg += `• TP2 İsabeti: <code>%${result.tp2HitRate}</code>\n`;
    msg += `• TP3 İsabeti: <code>%${result.tp3HitRate}</code>\n\n`;

    const last5 = result.trades.slice(-5);
    if (last5.length > 0) {
      msg += `<b>Son 5 Backtest İşlemi:</b>\n`;
      last5.forEach(t => {
        const icon = t.result === 'STOP_LOSS' ? '❌' : '✅';
        msg += `${icon} ${t.direction} $${t.entry.toFixed(2)} → ${t.result} (${t.pnl >= 0 ? '+' : ''}%${t.pnl})\n`;
      });
    }

    await bot.sendMessage(chatId, msg);
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Backtest hatası: ${err.message}`);
  }
});

// /tara
bot.onCommand('/tara', async ({ chatId }) => {
  await bot.sendMessage(chatId, `⏳ <i>Piyasa taranıyor...</i>`);
  try {
    const symbols = await getTopFuturesSymbols(25);
    const results = [];

    for (const sym of symbols) {
      const klines = await getKlines(sym, '15m', 40);
      if (klines.length < 25) continue;
      const closes = klines.map(k => k.close);
      const currentPrice = closes[closes.length - 1];
      const rsi = calculateRSI(closes, 14);
      const vol = checkVolumeSurge(klines, 2.5, 20);

      let tag = null;
      if (rsi && rsi <= 32) tag = `🟢 Aşırı Satım (RSI: ${rsi})`;
      else if (rsi && rsi >= 68) tag = `🔴 Aşırı Alım (RSI: ${rsi})`;
      else if (vol && vol.isSurge) tag = `💥 Hacim (${vol.ratio}x ${vol.isBullish ? '📈' : '📉'})`;
      if (tag) results.push(`• <b>#${sym}</b>: $${currentPrice} → ${tag}`);
    }

    if (results.length === 0) {
      await bot.sendMessage(chatId, `✅ Piyasa sakin, 15m'de aşırı uç bölgede coin yok.`);
    } else {
      await bot.sendMessage(chatId, `🎯 <b>PİYASA RADARI (15m):</b>\n\n${results.join('\n')}\n\n⏰ <i>${new Date().toLocaleTimeString('tr-TR')}</i>`);
    }
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Hata: ${err.message}`);
  }
});

// /fonlama
bot.onCommand('/fonlama', async ({ chatId }) => {
  try {
    const rates = await getFundingRates();
    if (rates.length === 0) { await bot.sendMessage(chatId, `❌ Veri alınamadı.`); return; }
    rates.sort((a, b) => b.lastFundingRate - a.lastFundingRate);
    const topPos = rates.slice(0, 5);
    const topNeg = [...rates].reverse().slice(0, 5);

    let msg = `📊 <b>CANLI FUTURES FONLAMA ORANLARI:</b>\n\n🔥 <b>En Pozitif (Long Yığılması):</b>\n`;
    topPos.forEach(r => { msg += `• <b>#${r.symbol}</b>: <code>+%${r.lastFundingRate.toFixed(4)}</code> ($${r.markPrice})\n`; });
    msg += `\n❄️ <b>En Negatif (Short Squeeze Adayları):</b>\n`;
    topNeg.forEach(r => { msg += `• <b>#${r.symbol}</b>: <code>%${r.lastFundingRate.toFixed(4)}</code> ($${r.markPrice})\n`; });
    msg += `\n💡 <i>Negatif fonlama yüksekse ani yukarı patlama riski fazladır.</i>`;
    await bot.sendMessage(chatId, msg);
  } catch (err) { await bot.sendMessage(chatId, `❌ Hata: ${err.message}`); }
});

// /alarm & /alarmlar & /alarmtemizle
bot.onCommand('/alarm', async ({ chatId, args }) => {
  if (args.length < 2) {
    await bot.sendMessage(chatId, `⚠️ Kullanım: <code>/alarm COIN FIYAT</code>\nÖrn: <code>/alarm BTC 64500</code>`);
    return;
  }
  let rawSym = args[0].toUpperCase();
  if (!rawSym.endsWith('USDT')) rawSym += 'USDT';
  const targetPrice = parseFloat(args[1].replace(',', '.'));
  if (isNaN(targetPrice) || targetPrice <= 0) { await bot.sendMessage(chatId, `❌ Geçersiz fiyat.`); return; }

  try {
    const tickers = await getAll24hrTickers();
    const current = tickers[rawSym];
    if (!current) { await bot.sendMessage(chatId, `❌ <code>${rawSym}</code> bulunamadı.`); return; }
    const currentPrice = current.lastPrice;
    const direction = targetPrice > currentPrice ? 'ABOVE' : 'BELOW';
    const state = loadState();
    if (!state.alerts) state.alerts = [];
    state.alerts.push({ id: Date.now().toString(), chatId, symbol: rawSym, targetPrice, direction, createdPrice: currentPrice, createdAt: new Date().toISOString() });
    saveState(state);
    const dirText = direction === 'ABOVE' ? '📈 ≥' : '📉 ≤';
    await bot.sendMessage(chatId, `✅ <b>ALARM KURULDU!</b>\n🪙 <b>#${rawSym}</b> ${dirText} <code>$${targetPrice}</code>\n⚡ Anlık: <code>$${currentPrice}</code>`);
  } catch (err) { await bot.sendMessage(chatId, `❌ Hata: ${err.message}`); }
});

bot.onCommand('/alarmlar', async ({ chatId }) => {
  const state = loadState();
  const my = (state.alerts || []).filter(a => a.chatId === chatId);
  if (my.length === 0) { await bot.sendMessage(chatId, `📭 Aktif alarm yok.`); return; }
  let msg = `📋 <b>AKTİF ALARMLAR (${my.length}):</b>\n\n`;
  my.forEach((a, i) => { msg += `${i + 1}. <b>#${a.symbol}</b> → <code>${a.direction === 'ABOVE' ? '≥' : '≤'} $${a.targetPrice}</code>\n`; });
  await bot.sendMessage(chatId, msg);
});

bot.onCommand('/alarmtemizle', async ({ chatId }) => {
  const state = loadState();
  const count = (state.alerts || []).filter(a => a.chatId === chatId).length;
  state.alerts = (state.alerts || []).filter(a => a.chatId !== chatId);
  saveState(state);
  await bot.sendMessage(chatId, `🗑️ ${count} alarm silindi.`);
});

// /durum
bot.onCommand('/durum', async ({ chatId }) => {
  const state = loadState();
  const open = (state.virtualPositions || []).length;
  const history = (state.positionHistory || []).length;
  const uptimeMinutes = Math.floor(process.uptime() / 60);
  await bot.sendMessage(chatId, `🤖 <b>BOT v3.5 DURUMU:</b>\n\n` +
    `🟢 Durum: Aktif & Taramada\n` +
    `⏱️ Çalışma Süresi: ${uptimeMinutes} dk\n` +
    `👥 Kayıtlı Kullanıcı: ${state.subscribers.length}\n` +
    `📈 Açık Sanal İşlem: ${open} | 📋 Tamamlanan: ${history}\n` +
    `⏰ Bekleyen Alarmlar: ${(state.alerts || []).length}\n` +
    `📡 Tarama Periyodu: ${CONFIG.SCAN_INTERVAL_SECONDS}s\n` +
    `🌐 Borsa: Binance USDT-M Futures\n` +
    `🧠 Fear/Greed & Backtest Motoru: Aktif`);
});

// =============================================
// INSTITUTIONAL-GRADE MORNING BRIEFING
// =============================================

async function sendMorningReportToChat(chatId) {
  const state = loadState();
  const userBal = state.userSettings?.[chatId]?.accountBalance || CONFIG.DEFAULT_ACCOUNT_BALANCE;
  const userRisk = state.userSettings?.[chatId]?.riskPercent || CONFIG.DEFAULT_RISK_PERCENT;

  await bot.sendMessage(chatId, `🌅 <i>Kurumsal Düzey Günlük Sabah Raporu hazırlanıyor (Makro Veriler, Türev Piyasası, Squeeze Radarı, Backtestler & Sinyaller)...</i>`);

  try {
    // 1. Fetch Macro Summary (Fear/Greed, CoinGecko, BTC Sentiment, Funding)
    const { getMacroMarketSummary } = await import('./intelligence.js');
    const macro = await getMacroMarketSummary();

    let rep = `🌅 <b>GÜNLÜK PİYASA & MAKRO TRADING BÜLTENİ</b>\n` +
      `📅 <i>${new Date().toLocaleDateString('tr-TR')} | Saat: ${new Date().toLocaleTimeString('tr-TR')}</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // A. Sentiment
    if (macro.fng) {
      rep += `🧠 <b>1. PİYASA DUYARLILIĞI & KORKU ENDEKSİ:</b>\n`;
      rep += `• Korku & Açgözlülük: <code>${macro.fng.value}/100</code> (${macro.fng.emoji})\n`;
      rep += `• Dünkü Değer: <code>${macro.fng.yesterdayValue}/100</code> (${macro.fng.change >= 0 ? '+' : ''}${macro.fng.change} puan)\n`;
      rep += `• 💡 <i>Analiz: ${macro.fng.insight}</i>\n\n`;
    }

    // B. Dominance & Liquidity
    if (macro.globalData) {
      const g = macro.globalData;
      rep += `👑 <b>2. PİYASA HAKİMİYETİ & MAKRO LİKİDİTE:</b>\n`;
      rep += `• BTC Dominansı (BTC.D): <code>%${g.btcDominance}</code> ${g.btcDominance > 58 ? '(Altcoinler baskı altında)' : '(Altcoin hareketi uygun)'}\n`;
      rep += `• ETH Dominansı (ETH.D): <code>%${g.ethDominance}</code>\n`;
      rep += `• Toplam Kripto Büyüklüğü: <code>${fmtNum(g.totalMarketCapUsd)}$</code> (${g.marketCapChangePercent24h > 0 ? '+' : ''}%${g.marketCapChangePercent24h})\n`;
      rep += `• 24s Toplam Hacim: <code>${fmtNum(g.totalVolume24hUsd)}$</code>\n\n`;
    }

    // C. BTC Derivatives & Smart Money Skew
    if (macro.btcSentiment) {
      const bs = macro.btcSentiment;
      rep += `🐋 <b>3. VADELİ TÜREV & BALİNA POZİSYONLARI (BTC):</b>\n`;
      if (bs.topTraderPosition) rep += `• Top Trader (Akıllı Para) L/S: <code>${bs.topTraderPosition.ratio.toFixed(2)}</code> (%${(bs.topTraderPosition.long * 100).toFixed(1)} Long)\n`;
      if (bs.globalSentiment) rep += `• Global (Perakende) L/S: <code>${bs.globalSentiment.ratio.toFixed(2)}</code> (%${(bs.globalSentiment.long * 100).toFixed(1)} Long)\n`;
      if (bs.takerAggression) rep += `• Taker Alım/Satım Baskısı: <code>${bs.takerAggression.ratio.toFixed(2)}</code>\n`;
      if (bs.oiTrend) rep += `• Açık Pozisyon (OI) Değişimi: <code>%${bs.oiTrend.changePercent}</code>\n`;
      rep += `\n`;
    }

    // D. Funding & Squeeze Radar
    if (macro.topNegativeFunding.length > 0 || macro.topPositiveFunding.length > 0) {
      rep += `⚡ <b>4. FONLAMA & SQUEEZE RADARI:</b>\n`;
      if (macro.topNegativeFunding.length > 0) {
        rep += `🔥 <i>Short Squeeze Adayları (En Negatif):</i>\n`;
        macro.topNegativeFunding.forEach(f => {
          rep += `   • #${f.symbol}: <code>%${f.lastFundingRate.toFixed(4)}</code> ($${f.markPrice})\n`;
        });
      }
      if (macro.topPositiveFunding.length > 0) {
        rep += `⚠️ <i>Long Yığılması (Düzeltme Riski):</i>\n`;
        macro.topPositiveFunding.forEach(f => {
          rep += `   • #${f.symbol}: <code>+%${f.lastFundingRate.toFixed(4)}</code> ($${f.markPrice})\n`;
        });
      }
      rep += `\n`;
    }

    // E. Backtest Health Check on Majors
    rep += `🧪 <b>5. STRATEJİ BACKTEST KARNESİ (1h - Son 300 Mum):</b>\n`;
    const testCoins = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    for (const tc of testCoins) {
      try {
        const bt = await runBacktest(tc, '1h', 300);
        if (bt && !bt.error) {
          const sign = parseFloat(bt.totalPnl) >= 0 ? '+' : '';
          rep += `• <b>#${tc}:</b> Win Rate: <code>%${bt.winRate}</code> | P&L: <code>${sign}%${bt.totalPnl}</code> (TP1: %${bt.tp1HitRate})\n`;
        }
      } catch {}
    }
    rep += `\n`;

    // F. Bot Virtual Portfolio Performance
    const stats = tracker.getPerformanceStats(userBal);
    if (stats && stats.totalTrades > 0) {
      const sign = parseFloat(stats.totalDollarPnl) >= 0 ? '+' : '';
      rep += `🏆 <b>6. SANAL PORTFÖY & BOT BAŞARI ÖZETİ (Kasa: $${userBal}):</b>\n`;
      rep += `• Toplam İşlem: <code>${stats.totalTrades}</code> | Win Rate: <code>%${stats.winRate}</code>\n`;
      rep += `• TP Alanlar: <code>${stats.wins}</code> | Stop (SL): <code>${stats.losses}</code>\n`;
      rep += `• Net Kâr/Zarar: <code>${sign}$${stats.totalDollarPnl}</code> (Kasa %${stats.totalPercentPnl})\n\n`;
    }

    rep += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    await bot.sendMessage(chatId, rep);

    // G. Top Recommended Position Signals for the Morning
    const symbols = await getTopFuturesSymbols(15);
    const ideas = await findBestPositions(symbols, 3);

    if (ideas.length > 0) {
      await bot.sendMessage(chatId, `🎯 <b>GÜNÜN EN İYİ POZİSYON FIRSATLARI (${ideas.length} adet):</b>\n━━━━━━━━━━━━━━━━━━━━━━━━`);
      for (const idea of ideas) {
        const msgs = formatPositionMessage(idea, userBal, userRisk);
        for (const m of msgs) {
          await bot.sendMessage(chatId, m);
          await new Promise(r => setTimeout(r, 200));
        }
        tracker.openVirtualPosition(idea, userBal, userRisk);
      }
    } else {
      await bot.sendMessage(chatId, `⚖️ <i>Günün açılışında net kırılım sağlayan pozisyon bulunamadı. Gün boyu tarama devam edecektir.</i>`);
    }

  } catch (err) {
    await bot.sendMessage(chatId, `❌ Sabah raporu oluşturulurken hata: ${err.message}`);
  }
}

// =============================================
// FORMAT POSITION MESSAGE (PRECISE DOLLAR RISK)
// =============================================

function formatPositionMessage(idea, accountBalance = 1000, riskPercent = 1) {
  const riskCalc = calculateDollarRisk(idea, accountBalance, riskPercent);

  const isNeutral = idea.direction === 'NEUTRAL';
  const dirEmoji = idea.direction === 'LONG' ? '🟢' : idea.direction === 'SHORT' ? '🔴' : '⚖️';
  const dirText = idea.direction === 'LONG' ? 'LONG (AL)' : idea.direction === 'SHORT' ? 'SHORT (SAT)' : 'NÖTR (BEKLEMEDE)';
  const filled = Math.round(idea.confidence / 10);
  const confBar = isNeutral ? '⚖️ İŞLEM İÇİN UYGUN DEĞİL' : ('🟩'.repeat(filled) + '⬜'.repeat(10 - filled));

  let m = `${dirEmoji} <b>#${idea.symbol} → ${dirText}</b>\n`;
  m += `⚡ <b>Canlı Fiyat:</b> <code>$${idea.currentPrice || idea.entry}</code> | Güven: <b>%${idea.confidence}</b> ${isNeutral ? '' : confBar}\n`;
  m += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (isNeutral) {
    m += `⚠️ <b>NEDEN İŞLEME GİRİLMİYOR?</b>\n`;
    m += `• Fiyat şu an ara konsolidasyon bölgesindedir (Net kırılım yok).\n`;
    if (idea.reasoning && idea.reasoning.length > 0) {
      m += `• ${idea.reasoning.slice(0, 2).join('\n• ')}\n`;
    }
    m += `\n📍 <b>İZLENECEK KRİTİK SEVİYELER:</b>\n`;
    m += `• 🟢 Alım (Destek): <code>$${idea.entryZoneLow}</code>\n`;
    m += `• 🔴 Satış (Direnç): <code>$${idea.entryZoneHigh}</code>\n`;
  } else {
    m += `💼 <b>KASA & POZİSYON HESABI:</b>\n`;
    m += `• Kasa: <code>$${accountBalance}</code> (Giriş: %${riskPercent})\n`;
    m += `• 💵 <b>Margin:</b> <code>$${riskCalc.marginRequired}</code> | <b>Kaldıraç:</b> <code>${riskCalc.leverageNum}x</code>\n`;
    m += `• 🔥 <b>Toplam Pozisyon:</b> <code>$${riskCalc.positionValueDollar}</code> ($${riskCalc.marginRequired} × ${riskCalc.leverageNum}x)\n\n`;

    m += `📍 <b>FİYAT VE GİRİŞ:</b>\n`;
    m += `• 🎯 <b>Giriş (Entry):</b> <code>$${idea.entry}</code> (Aralık: $${idea.entryZoneLow} - $${idea.entryZoneHigh})\n\n`;

    m += `🛡️ <b>STOP-LOSS (SL):</b> <code>$${idea.stopLoss}</code> (-%${idea.riskPercent})\n`;
    m += `↳ <b>Net Kayıp:</b> <code>-$${riskCalc.slDollarLoss}</code> (-%${riskCalc.slRoi} Margin) | <i>${idea.slReason || ''}</i>\n\n`;

    m += `🎯 <b>HEDEFLER (Kâr Al):</b>\n`;
    m += `• <b>TP1:</b> <code>$${idea.tp1}</code> (+%${idea.tp1Percent || '1.5'}) [R:R 1.5:1] → <b>+$${riskCalc.tp1DollarGain}</b> (+%${riskCalc.tp1Roi} Margin)\n`;
    m += `  ↳ <i>${idea.tp1Reason || 'İlk Kar Al'}</i>\n`;
    m += `• <b>TP2:</b> <code>$${idea.tp2}</code> (+%${idea.tp2Percent || '3.0'}) [R:R 3.0:1] → <b>+$${riskCalc.tp2DollarGain}</b> (+%${riskCalc.tp2Roi} Margin)\n`;
    m += `  ↳ <i>${idea.tp2Reason || 'Ana Hedef'}</i>\n`;
    m += `• <b>TP3:</b> <code>$${idea.tp3}</code> (+%${idea.tp3Percent || '5.0'}) [R:R 5.0:1] → <b>+$${riskCalc.tp3DollarGain}</b> (+%${riskCalc.tp3Roi} Margin)\n`;
    m += `  ↳ <i>${idea.tp3Reason || 'Runner'}</i>\n\n`;

    m += `🔍 <b>NEDEN BU İŞLEM? (Özet Gerekçeler):</b>\n`;
    const topReasons = (idea.reasoning || []).slice(0, 3);
    topReasons.forEach((r, i) => { m += `${i + 1}. ${r}\n`; });
  }

  if (idea.ticker24h) {
    m += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    m += `📊 24s Değişim: <code>${idea.ticker24h.priceChangePercent > 0 ? '+' : ''}%${idea.ticker24h.priceChangePercent.toFixed(2)}</code> | Hacim: ${fmtNum(idea.ticker24h.quoteVolume)}$ | Funding: <code>${idea.fundingRate ? (idea.fundingRate > 0 ? '+' : '') + '%' + idea.fundingRate.toFixed(4) : 'N/A'}</code>\n`;
  }

  m += `🔗 <a href="https://www.binance.com/tr/futures/${idea.symbol}">Binance'de Aç ↗</a> | ⏰ ${new Date().toLocaleTimeString('tr-TR')}`;

  return [m];
}

function fmtNum(num) {
  if (num === null || num === undefined) return 'N/A';
  if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
  return num.toString();
}

// =============================================
// BACKGROUND SCHEDULERS
// =============================================

// Market scanner (RSI, Volume alerts) every 60s
setInterval(() => { scanner.runScan(); }, CONFIG.SCAN_INTERVAL_SECONDS * 1000);
setTimeout(() => { scanner.runScan(); }, 5000);

// Virtual position checker every 30s
setInterval(() => { tracker.checkPositions(); }, 30 * 1000);
setTimeout(() => { tracker.checkPositions(); }, 10000);

// Daily morning report at 09:00 (Turkey time)
(function scheduleDailyReports() {
  let lastHour = -1;
  setInterval(async () => {
    const h = new Date().getHours();
    const m = new Date().getMinutes();
    if ((h === 9 || h === 21) && m === 0 && lastHour !== h) {
      lastHour = h;
      const state = loadState();
      for (const chatId of state.subscribers) {
        await sendMorningReportToChat(chatId);
      }
    }
  }, 60000);
})();

// =============================================
// BOOT & CLOUD HEALTH CHECK SERVER
// =============================================

import http from 'http';

const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', name: 'Crypto Signal Bot v4.0', time: new Date().toISOString() }));
});

server.listen(PORT, () => {
  console.log(`🌐 Health check server listening on port ${PORT}`);
});

bot.startPolling();
console.log('✅ Bot v4.0 is running with full dollar calculations, morning reports, and deep backtesting!');
