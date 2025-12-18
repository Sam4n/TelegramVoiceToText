import type { Context } from 'grammy';
import type { Env } from '../types/session';
import {
  createSession,
  getSession,
  deleteSession,
  sessionExists,
  setSessionStatus,
} from '../services/session';
import { processSession } from '../services/processor';
import { formatResult } from '../utils/formatting';

/**
 * Handle /translate command
 * Starts a new session for collecting messages
 */
export async function handleTranslate(ctx: Context, env: Env): Promise<void> {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;

  if (!chatId || !userId) {
    await ctx.reply('Error: Could not identify chat or user.');
    return;
  }

  // Check if session already exists
  const existingSession = await getSession(env.SESSIONS, chatId);
  if (existingSession) {
    // If session is stuck in processing or completed, auto-clean it
    if (existingSession.status !== 'collecting') {
      await deleteSession(env.SESSIONS, chatId);
      await ctx.reply('Previous session was stuck. Starting a fresh session...');
    } else {
      // Session is in collecting state
      await ctx.reply(
        `You already have an active session with ${existingSession.messages.length} message(s) collected.\n\n` +
          'Send /done to process it, or /cancel to start over.'
      );
      return;
    }
  }

  // Create new session
  try {
    await createSession(env.SESSIONS, chatId, userId);
    await ctx.reply(
      'Session started! Forward or send me your messages (voice or text).\n\n' +
        'When you\'re done, send /done to process them.\n' +
        'To cancel, send /cancel.'
    );
  } catch (error) {
    console.error('Error creating session:', error);
    await ctx.reply('Error creating session. Please try again.');
  }
}

/**
 * Handle /done command
 * Triggers processing of collected messages
 */
export async function handleDone(ctx: Context, env: Env): Promise<void> {
  const chatId = ctx.chat?.id;

  if (!chatId) {
    await ctx.reply('Error: Could not identify chat.');
    return;
  }

  try {
    const session = await getSession(env.SESSIONS, chatId);

    if (!session) {
      await ctx.reply('No active session found. Use /translate to start one.');
      return;
    }

    if (session.status !== 'collecting') {
      await ctx.reply('Session is already being processed or completed.');
      return;
    }

    if (session.messages.length === 0) {
      await ctx.reply(
        'No messages collected yet. Please send some messages first, or use /cancel to end the session.'
      );
      return;
    }

    // Update status to processing
    await setSessionStatus(env.SESSIONS, chatId, 'processing');

    // Send processing message
    await ctx.reply(
      `Processing ${session.messages.length} message(s)...\n` +
        'This may take a moment.'
    );

    // Process the session
    const result = await processSession(env, session);

    // Format and send result
    const formattedMessage = formatResult(result);
    await ctx.reply(formattedMessage, { parse_mode: 'Markdown' });

    // Update status to completed and set short TTL for cleanup
    await setSessionStatus(env.SESSIONS, chatId, 'completed');

    // Clean up session after successful processing
    await deleteSession(env.SESSIONS, chatId);
  } catch (error) {
    console.error('Error processing session:', error);

    // Try to reset session status so user can retry
    try {
      await setSessionStatus(env.SESSIONS, chatId, 'collecting');
    } catch (e) {
      // Ignore if session no longer exists
    }

    await ctx.reply(
      'Error processing messages. Please try again with /done, or use /cancel to start over.\n\n' +
        `Error details: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Handle /cancel command
 * Cancels the current session
 */
export async function handleCancel(ctx: Context, env: Env): Promise<void> {
  const chatId = ctx.chat?.id;

  if (!chatId) {
    await ctx.reply('Error: Could not identify chat.');
    return;
  }

  try {
    const session = await getSession(env.SESSIONS, chatId);

    if (!session) {
      await ctx.reply('No active session to cancel.');
      return;
    }

    await deleteSession(env.SESSIONS, chatId);
    await ctx.reply('Session cancelled. Use /translate to start a new one.');
  } catch (error) {
    console.error('Error cancelling session:', error);
    await ctx.reply('Error cancelling session. Please try again.');
  }
}

/**
 * Handle /status command
 * Shows current session status
 */
export async function handleStatus(ctx: Context, env: Env): Promise<void> {
  const chatId = ctx.chat?.id;

  if (!chatId) {
    await ctx.reply('Error: Could not identify chat.');
    return;
  }

  try {
    const session = await getSession(env.SESSIONS, chatId);

    if (!session) {
      await ctx.reply('No active session.\n\nUse /translate to start a new session.');
      return;
    }

    const voiceCount = session.messages.filter((m) => m.type === 'voice').length;
    const textCount = session.messages.filter((m) => m.type === 'text').length;

    await ctx.reply(
      `Session Status:\n\n` +
        `Status: ${session.status}\n` +
        `Total messages: ${session.messages.length}\n` +
        `- Voice messages: ${voiceCount}\n` +
        `- Text messages: ${textCount}\n\n` +
        (session.status === 'collecting'
          ? 'Send /done to process, or /cancel to cancel.'
          : 'Session is stuck. Send /translate to reset and start over.')
    );
  } catch (error) {
    console.error('Error getting session status:', error);
    await ctx.reply('Error getting session status. Please try again.');
  }
}
