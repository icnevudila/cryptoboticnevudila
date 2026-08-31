/**
 * Virtual Position Tracker (Paper Trading) with Exact Dollar P&L
 * Automatically tracks every position recommendation in real-time.
 * Reports when SL or TP1/TP2/TP3 is hit with exact dollar gains/losses.
 */

import { loadState, saveState } from './storage.js';
import { getAll24hrTickers } from './binance.js';
import { calculateDollarRisk } from './positions.js';

export class VirtualTracker {
  constructor(telegramBot) {
    this.bot = telegramBot;
  }

  // Open a virtual position from a position idea
  openVirtualPosition(idea, accountBalance = 1000, riskPercent = 1) {
    const state = loadState();
    if (!state.virtualPositions) state.virtualPositions = [];
    if (!state.positionHistory) state.positionHistory = [];

    // Prevent duplicates (same symbol within 30 min)
    const recent = state.virtualPositions.find(
      p => p.symbol === idea.symbol && p.status === 'OPEN' &&
        Date.now() - new Date(p.openedAt).getTime() < 30 * 60 * 1000
    );
    if (recent) return null;

    const riskCalc = calculateDollarRisk(idea, accountBalance, riskPercent);

    const position = {
      id: Date.now().toString(),
      symbol: idea.symbol,
      direction: idea.direction,
      entry: idea.entry,
      stopLoss: idea.stopLoss,
      tp1: idea.tp1,
      tp2: idea.tp2,
      tp3: idea.tp3,
      suggestedLeverage: idea.suggestedLeverage,
      confidence: idea.confidence,
      sentimentScore: idea.sentimentScore,
      reasoning: idea.reasoning,
      accountBalance,
      riskPercent,
      maxRiskDollar: riskCalc.maxRiskDollar,
      positionValueDollar: riskCalc.positionValueDollar,
      marginRequired: riskCalc.marginRequired,
      status: 'OPEN',          // OPEN, TP1_HIT, TP2_HIT, TP3_HIT, STOPPED
      tp1Hit: false,
      tp2Hit: false,
      tp3Hit: false,
      highestPnl: 0,
      lowestPnl: 0,
      currentPnl: 0,
      currentDollarPnl: 0,
      openedAt: new Date().toISOString(),
      closedAt: null,
      closePrice: null,
      closeReason: null,
      finalDollarPnl: 0
    };

    state.virtualPositions.push(position);
    saveState(state);
    return position;
  }

  // Check all open virtual positions against current prices
  async checkPositions() {
    const state = loadState();
    if (!state.virtualPositions || state.virtualPositions.length === 0) return;

    const openPositions = state.virtualPositions.filter(p => p.status === 'OPEN');
    if (openPositions.length === 0) return;

    let tickers;
    try {
      tickers = await getAll24hrTickers();
    } catch { return; }

    let stateChanged = false;

    for (const pos of openPositions) {
      const ticker = tickers[pos.symbol];
      if (!ticker) continue;

      const currentPrice = ticker.lastPrice;
      const isLong = pos.direction === 'LONG';

      // Calculate unrealized price PnL %
      const pnlPercent = isLong
        ? ((currentPrice - pos.entry) / pos.entry) * 100
        : ((pos.entry - currentPrice) / pos.entry) * 100;

      // Dollar PnL = positionValueDollar * (pnlPercent / 100)
      const dollarPnl = (pos.positionValueDollar || (pos.accountBalance || 1000) * 10) * (pnlPercent / 100);

      pos.currentPnl = Number(pnlPercent.toFixed(2));
      pos.currentDollarPnl = Number(dollarPnl.toFixed(2));

      if (pnlPercent > pos.highestPnl) pos.highestPnl = Number(pnlPercent.toFixed(2));
      if (pnlPercent < pos.lowestPnl) pos.lowestPnl = Number(pnlPercent.toFixed(2));

      // Check Stop-Loss
      const slHit = isLong ? currentPrice <= pos.stopLoss : currentPrice >= pos.stopLoss;
      if (slHit) {
        pos.status = 'STOPPED';
        pos.closedAt = new Date().toISOString();
        pos.closePrice = currentPrice;
        pos.closeReason = 'STOP_LOSS';
        pos.finalDollarPnl = Number((-pos.maxRiskDollar).toFixed(2));
        stateChanged = true;
        await this.notifyClose(pos, currentPrice);
        continue;
      }

      // Check TP3
      const tp3Hit = isLong ? currentPrice >= pos.tp3 : currentPrice <= pos.tp3;
      if (tp3Hit && !pos.tp3Hit) {
        pos.tp3Hit = true;
        pos.tp2Hit = true;
        pos.tp1Hit = true;
        pos.status = 'TP3_HIT';
        pos.closedAt = new Date().toISOString();
        pos.closePrice = currentPrice;
        pos.closeReason = 'TP3';
        const finalDollar = (pos.positionValueDollar || 10000) * (Math.abs(pos.tp3 - pos.entry) / pos.entry);
        pos.finalDollarPnl = Number(finalDollar.toFixed(2));
        stateChanged = true;
        await this.notifyClose(pos, currentPrice);
        continue;
      }

      // Check TP2
      const tp2Hit = isLong ? currentPrice >= pos.tp2 : currentPrice <= pos.tp2;
      if (tp2Hit && !pos.tp2Hit) {
        pos.tp2Hit = true;
        pos.tp1Hit = true;
        stateChanged = true;
        await this.notifyTP(pos, 2, currentPrice);
      }

      // Check TP1
      const tp1Hit = isLong ? currentPrice >= pos.tp1 : currentPrice <= pos.tp1;
      if (tp1Hit && !pos.tp1Hit) {
        pos.tp1Hit = true;
        stateChanged = true;
        await this.notifyTP(pos, 1, currentPrice);
      }
    }

    if (stateChanged) {
      // Move closed positions to history
      const closed = state.virtualPositions.filter(p => p.status !== 'OPEN');
      const stillOpen = state.virtualPositions.filter(p => p.status === 'OPEN');

      if (!state.positionHistory) state.positionHistory = [];
      state.positionHistory.push(...closed);
      state.virtualPositions = stillOpen;
      saveState(state);
    } else {
      saveState(state);
    }
  }

  async notifyTP(pos, tpLevel, currentPrice) {
    const state = loadState();
    const pnl = pos.direction === 'LONG'
      ? ((currentPrice - pos.entry) / pos.entry * 100).toFixed(2)
      : ((pos.entry - currentPrice) / pos.entry * 100).toFixed(2);

    const dollarGain = (pos.positionValueDollar || 1000) * (parseFloat(pnl) / 100);

    const msg = `🎯 <b>SANAL İŞLEM - TP${tpLevel} HEDEFİ ALINDI!</b>\n━━━━━━━━━━━━━━━━━━━\n\n` +
      `🪙 <b>#${pos.symbol}</b> ${pos.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}\n` +
      `📍 Giriş: <code>$${pos.entry}</code> → Şu an: <code>$${currentPrice}</code>\n` +
      `💰 Fiyat Değişimi: <code>+%${pnl}</code>\n` +
      `💵 <b>Kâr Miktarı:</b> <code>+$${dollarGain.toFixed(2)}</code> (Kasa: $${pos.accountBalance || 1000})\n\n` +
      `<i>📌 Pozisyon takip ediliyor. Sonraki hedef: TP${tpLevel + 1}</i>`;

    for (const chatId of state.subscribers) {
      await this.bot.sendMessage(chatId, msg);
    }
  }

  async notifyClose(pos, currentPrice) {
    const state = loadState();
    const pnl = pos.direction === 'LONG'
      ? ((currentPrice - pos.entry) / pos.entry * 100).toFixed(2)
      : ((pos.entry - currentPrice) / pos.entry * 100).toFixed(2);

    const isWin = pos.closeReason !== 'STOP_LOSS';
    const emoji = isWin ? '✅' : '❌';
    const resultText = isWin ? `TP${pos.closeReason.replace('TP', '')} HEDEF TAMAMLANDI` : 'STOP-LOSS TETİKLENDİ';

    const dollarPnl = isWin
      ? ((pos.positionValueDollar || 1000) * (Math.abs(currentPrice - pos.entry) / pos.entry)).toFixed(2)
      : (-pos.maxRiskDollar || -10).toFixed(2);

    let tpStatus = '';
    if (pos.tp1Hit) tpStatus += '✅TP1 ';
    if (pos.tp2Hit) tpStatus += '✅TP2 ';
    if (pos.tp3Hit) tpStatus += '✅TP3 ';
    if (pos.closeReason === 'STOP_LOSS') tpStatus += '❌SL';

    const duration = Math.round((new Date(pos.closedAt) - new Date(pos.openedAt)) / 60000);
    const durationText = duration > 60 ? `${Math.floor(duration / 60)}s ${duration % 60}dk` : `${duration}dk`;

    const msg = `${emoji} <b>SANAL İŞLEM SONUCU → ${resultText}</b>\n━━━━━━━━━━━━━━━━━━━\n\n` +
      `🪙 <b>#${pos.symbol}</b> ${pos.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}\n` +
      `📍 Giriş: <code>$${pos.entry}</code> | Çıkış: <code>$${currentPrice}</code>\n` +
      `📊 Fiyat P&L: <code>${parseFloat(pnl) >= 0 ? '+' : ''}%${pnl}</code>\n` +
      `💵 <b>Net Dolar Kazanç/Kayıp:</b> <code>${parseFloat(dollarPnl) >= 0 ? '+' : ''}$${dollarPnl}</code>\n` +
      `🎯 Ulaşılan Hedefler: ${tpStatus}\n` +
      `📈 Max Görülen Kâr: <code>+%${pos.highestPnl}</code>\n` +
      `⏱️ Pozisyon Süresi: ${durationText}\n` +
      `💼 Kasa: <code>$${pos.accountBalance || 1000}</code> (Risk: %${pos.riskPercent || 1})`;

    for (const chatId of state.subscribers) {
      await this.bot.sendMessage(chatId, msg);
    }
  }

  // Get performance statistics
  getPerformanceStats(accountBalance = 1000) {
    const state = loadState();
    const history = state.positionHistory || [];
    if (history.length === 0) return null;

    const wins = history.filter(p => p.closeReason !== 'STOP_LOSS');
    const losses = history.filter(p => p.closeReason === 'STOP_LOSS');

    let totalDollarPnl = 0;
    history.forEach(p => {
      if (p.finalDollarPnl !== undefined && p.finalDollarPnl !== null) {
        totalDollarPnl += p.finalDollarPnl;
      } else {
        const isLong = p.direction === 'LONG';
        const pnlPct = isLong ? (p.closePrice - p.entry) / p.entry : (p.entry - p.closePrice) / p.entry;
        totalDollarPnl += (p.positionValueDollar || 1000) * pnlPct;
      }
    });

    const totalPercentPnl = history.reduce((sum, p) => {
      const pnl = p.direction === 'LONG'
        ? ((p.closePrice - p.entry) / p.entry) * 100
        : ((p.entry - p.closePrice) / p.entry) * 100;
      return sum + pnl;
    }, 0);

    const tp1Count = history.filter(p => p.tp1Hit).length;
    const tp2Count = history.filter(p => p.tp2Hit).length;
    const tp3Count = history.filter(p => p.tp3Hit).length;
    const slCount = losses.length;

    return {
      totalTrades: history.length,
      wins: wins.length,
      losses: losses.length,
      winRate: ((wins.length / history.length) * 100).toFixed(1),
      totalDollarPnl: totalDollarPnl.toFixed(2),
      totalPercentPnl: totalPercentPnl.toFixed(2),
      tp1Count,
      tp2Count,
      tp3Count,
      slCount,
      history
    };
  }
}
