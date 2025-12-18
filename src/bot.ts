import { Bot } from 'grammy';
import type { Env } from './types/session';
import { handleTranslate, handleDone, handleCancel, handleStatus } from './handlers/commands';
import { handleVoiceMessage, handleTextMessage } from './handlers/messages';

/**
 * Create and configure the Telegram bot
 *
 * @param token - Telegram bot token
 * @param env - Cloudflare Workers environment bindings
 * @returns Configured grammY bot instance
 */
export function createBot(token: string, env: Env): Bot {
  const bot = new Bot(token);

  // Command handlers
  bot.command('start', async (ctx) => {
    await ctx.reply(
      'Welcome to Voice-to-Text Bot!\n\n' +
        'I can transcribe voice messages and analyze conversations.\n\n' +
        'Commands:\n' +
        '/translate - Start collecting messages for transcription\n' +
        '/done - Process collected messages\n' +
        '/cancel - Cancel current session\n\n' +
        'Send /translate to begin!'
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      'Voice-to-Text Bot Help\n\n' +
        'How to use:\n' +
        '1. Send /translate to start a session\n' +
        '2. Forward or send 4-5 messages (voice or text)\n' +
        '3. Send /done to process them\n\n' +
        'Features:\n' +
        '- Context-aware voice transcription\n' +
        '- Conversation summary\n' +
        '- Task list extraction\n\n' +
        'Commands:\n' +
        '/translate - Start collecting messages\n' +
        '/done - Process collected messages\n' +
        '/status - Check current session status\n' +
        '/cancel - Cancel current session\n' +
        '/help - Show this help message'
    );
  });

  bot.command('translate', (ctx) => handleTranslate(ctx, env));
  bot.command('done', (ctx) => handleDone(ctx, env));
  bot.command('status', (ctx) => handleStatus(ctx, env));
  bot.command('cancel', (ctx) => handleCancel(ctx, env));

  // Message handlers
  bot.on('message:voice', (ctx) => handleVoiceMessage(ctx, env));
  bot.on('message:text', (ctx) => handleTextMessage(ctx, env));

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
