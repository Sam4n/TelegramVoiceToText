import { Bot } from 'grammy';
import type { Env } from './types/session';
import { handleTranslate, handleDone, handleCancel, handleStatus } from './handlers/commands';
import { handleVoiceMessage, handleTextMessage, handleImageMessage, handleDocumentMessage } from './handlers/messages';
import { handleSettings, handleSettingsCallback } from './handlers/settings';

/**
 * Create and configure the Telegram bot
 *
 * @param token - Telegram bot token
 * @param env - Cloudflare Workers environment bindings
 * @returns Configured grammY bot instance
 */
export function createBot(token: string, env: Env): Bot {
  const bot = new Bot(token);

  // Set up bot commands menu (appears when user types "/")
  bot.api.setMyCommands([
    { command: 'start', description: 'Start the bot and see welcome message' },
    { command: 'translate', description: 'Start collecting messages for transcription' },
    { command: 'done', description: 'Process collected messages' },
    { command: 'status', description: 'Check current session status' },
    { command: 'cancel', description: 'Cancel current session' },
    { command: 'settings', description: 'Choose the AI model, language and output' },
    { command: 'help', description: 'Show help message' },
  ]).catch((err) => {
    console.error('Failed to set bot commands:', err);
  });

  // Command handlers
  bot.command('start', async (ctx) => {
    await ctx.reply(
      'Welcome to Voice-to-Text Bot!\n\n' +
        'I transcribe your voice messages into text.\n\n' +
        'Commands:\n' +
        '/translate - Start collecting messages (voice, text, or images)\n' +
        '/done - Process collected messages\n' +
        '/cancel - Cancel current session\n' +
        '/settings - Choose the AI model, language and output\n\n' +
        'Send /translate to begin!'
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      'Voice-to-Text Bot Help\n\n' +
        'How to use:\n' +
        '1. Send /translate to start a session\n' +
        '2. Forward or send 4-5 messages (voice, text, or images)\n' +
        '3. Send /done to process them\n\n' +
        'Features:\n' +
        '- Context-aware voice transcription\n' +
        '- Image analysis for additional context\n' +
        '- Transcript of everything you sent\n' +
        '- /settings: AI model, language, and transcript or polished output\n\n' +
        'Commands:\n' +
        '/translate - Start collecting messages\n' +
        '/done - Process collected messages\n' +
        '/status - Check current session status\n' +
        '/cancel - Cancel current session\n' +
        '/settings - Choose the AI model, language and output\n' +
        '/help - Show this help message'
    );
  });

  bot.command('translate', (ctx) => handleTranslate(ctx, env));
  bot.command('done', (ctx) => handleDone(ctx, env));
  bot.command('status', (ctx) => handleStatus(ctx, env));
  bot.command('cancel', (ctx) => handleCancel(ctx, env));
  bot.command('settings', (ctx) => handleSettings(ctx, env));
  bot.callbackQuery(/^cfg:/, (ctx) => handleSettingsCallback(ctx, env));

  // Message handlers
  bot.on('message:voice', (ctx) => handleVoiceMessage(ctx, env));
  bot.on('message:text', (ctx) => handleTextMessage(ctx, env));
  bot.on('message:photo', (ctx) => handleImageMessage(ctx, env));
  bot.on('message:document', (ctx) => handleDocumentMessage(ctx, env));

  // Error handler
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error('Bot error:', err.error);

    // Try to notify user of error
    ctx.reply(
      'An unexpected error occurred. Please try again or use /cancel to reset your session.'
    ).catch((e) => {
      console.error('Failed to send error message to user:', e);
    });
  });

  return bot;
}
