/**
 * Telegram Bot API Client
 */

export class TelegramBot {
  constructor(token) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.offset = 0;
    this.commandHandlers = new Map();
    this.callbackHandlers = new Map();
    this.isRunning = false;
  }

  onCommand(command, handler) {
    this.commandHandlers.set(command.toLowerCase(), handler);
  }

  onCallbackQuery(handler) {
    this.callbackHandlers.set('default', handler);
  }

  async sendMessage(chatId, text, options = {}) {
    try {
      const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...options
      };

      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!data.ok) {
        console.error('Telegram sendMessage failed:', data.description);
      }
      return data;
    } catch (err) {
      console.error('Error sending Telegram message:', err.message);
      return null;
    }
  }

  async startPolling() {
    this.isRunning = true;
    console.log('🤖 Telegram Poller started...');

    while (this.isRunning) {
      try {
        const res = await fetch(`${this.baseUrl}/getUpdates?offset=${this.offset}&timeout=20`);
        if (!res.ok) {
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.offset = update.update_id + 1;
            await this.handleUpdate(update);
          }
        }
      } catch (err) {
        // Network timeout or glitch, wait and retry
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  async handleUpdate(update) {
    // Handle message commands
    if (update.message && update.message.text) {
      const msg = update.message;
      const text = msg.text.trim();
      const chatId = msg.chat.id;

      if (text.startsWith('/')) {
        const parts = text.split(' ');
        const rawCmd = parts[0].toLowerCase().split('@')[0]; // strip bot username if present
        const args = parts.slice(1);

        const handler = this.commandHandlers.get(rawCmd);
        if (handler) {
          await handler({ msg, chatId, args, text });
        } else {
          // Default unrecognized command
          await this.sendMessage(chatId, `❓ Bilinmeyen komut: <code>${rawCmd}</code>\nKomut listesi için /yardim yazabilirsiniz.`);
        }
      }
    }

    // Handle button callbacks if any
    if (update.callback_query) {
      const cb = update.callback_query;
      const handler = this.callbackHandlers.get('default');
      if (handler) {
        await handler(cb);
      }
    }
  }

  stopPolling() {
    this.isRunning = false;
  }
}
