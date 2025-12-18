import type { Context } from 'grammy';
import type { Env, CollectedMessage, MessageType } from '../types/session';
import { getSession, addMessageToSession, MAX_MESSAGES_PER_SESSION } from '../services/session';
import { isUserAuthorized } from '../utils/auth';

/**
 * Maximum voice file size in bytes (20MB)
 */
const MAX_VOICE_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Maximum image file size in bytes (10MB)
 */
const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Handle collection of voice or text messages
 */
async function handleMessageCollection(
  ctx: Context,
  env: Env,
  messageType: MessageType
): Promise<void> {
  // Check authorization (silently ignore unauthorized users for messages)
  if (!isUserAuthorized(ctx, env)) {
    return;
  }

  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;

  if (!chatId || !messageId) {
    return;
  }

  try {
    // Get active session or create new one
    let session = await getSession(env.SESSIONS, chatId);

    // Auto-create session if none exists
    if (!session) {
      const userId = ctx.from?.id;
      if (!userId) return;

      const { createSession } = await import('../services/session');
      session = await createSession(env.SESSIONS, chatId, userId);
      await ctx.reply(
        '✨ Session started automatically!\n\nSend more messages (voice, text, or images), then send /done when ready to process.',
        { reply_to_message_id: messageId }
      );
    }

    // Only collect messages in 'collecting' status
    if (session.status !== 'collecting') {
      return;
    }

    // Check message limit
    if (session.messages.length >= MAX_MESSAGES_PER_SESSION) {
      await ctx.reply(
        `Maximum ${MAX_MESSAGES_PER_SESSION} messages reached. Send /done to process or /cancel to start over.`,
        { reply_to_message_id: messageId }
      );
      return;
    }

    // Prepare message object
    const message: CollectedMessage = {
      id: messageId,
      type: messageType,
      order: session.messages.length + 1,
      timestamp: Date.now(),
    };

    // Handle voice messages
    if (messageType === 'voice' && ctx.message?.voice) {
      const voice = ctx.message.voice;

      // Check file size
      if (voice.file_size && voice.file_size > MAX_VOICE_FILE_SIZE) {
        await ctx.reply(
          'Voice message is too large (max 20MB). Please send a smaller file.',
          { reply_to_message_id: messageId }
        );
        return;
      }

      message.fileId = voice.file_id;
      message.fileSize = voice.file_size;
      message.duration = voice.duration;
    }
    // Handle text messages
    else if (messageType === 'text' && ctx.message?.text) {
      message.content = ctx.message.text;
    } else {
      // Shouldn't happen, but handle gracefully
      return;
    }

    // Add message to session
    await addMessageToSession(env.SESSIONS, chatId, message);

    // Send acknowledgment
    const emoji = messageType === 'voice' ? '🎙️' : '📝';
    await ctx.reply(`${emoji} Message ${message.order} collected`, {
      reply_to_message_id: messageId,
    });
  } catch (error) {
    console.error('Error handling message:', error);

    // Send error message
    await ctx.reply(
      `Error collecting message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { reply_to_message_id: messageId }
    );
  }
}

/**
 * Handle voice messages
 */
export async function handleVoiceMessage(ctx: Context, env: Env): Promise<void> {
  await handleMessageCollection(ctx, env, 'voice');
}

/**
 * Handle text messages
 */
export async function handleTextMessage(ctx: Context, env: Env): Promise<void> {
  await handleMessageCollection(ctx, env, 'text');
}

/**
 * Handle document messages (check if it's an image file)
 */
export async function handleDocumentMessage(ctx: Context, env: Env): Promise<void> {
  // Check authorization (silently ignore unauthorized users for messages)
  if (!isUserAuthorized(ctx, env)) {
    return;
  }

  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;

  if (!chatId || !messageId) {
    return;
  }

  const document = ctx.message?.document;
  if (!document) {
    return;
  }

  // Check if document is an image (by MIME type or file extension)
  const isImage =
    document.mime_type?.startsWith('image/') ||
    document.file_name?.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);

  if (!isImage) {
    return; // Not an image document, ignore silently
  }

  try {
    // Get active session or create new one
    let session = await getSession(env.SESSIONS, chatId);

    // Auto-create session if none exists
    if (!session) {
      const userId = ctx.from?.id;
      if (!userId) return;

      const { createSession } = await import('../services/session');
      session = await createSession(env.SESSIONS, chatId, userId);
      await ctx.reply(
        '✨ Session started automatically!\n\nSend more messages (voice, text, or images), then send /done when ready to process.',
        { reply_to_message_id: messageId }
      );
    }

    // Only collect messages in 'collecting' status
    if (session.status !== 'collecting') {
      return;
    }

    // Check message limit
    if (session.messages.length >= MAX_MESSAGES_PER_SESSION) {
      await ctx.reply(
        `Maximum ${MAX_MESSAGES_PER_SESSION} messages reached. Send /done to process or /cancel to start over.`,
        { reply_to_message_id: messageId }
      );
      return;
    }

    // Check file size
    if (document.file_size && document.file_size > MAX_IMAGE_FILE_SIZE) {
      await ctx.reply(
        'Image file is too large (max 10MB). Please send a smaller image.',
        { reply_to_message_id: messageId }
      );
      return;
    }

    // Prepare message object
    const message: CollectedMessage = {
      id: messageId,
      type: 'image',
      fileId: document.file_id,
      fileSize: document.file_size,
      order: session.messages.length + 1,
      timestamp: Date.now(),
    };

    // Add message to session
    await addMessageToSession(env.SESSIONS, chatId, message);

    // Send acknowledgment
    await ctx.reply(`🖼️ Image file ${message.order} collected`, {
      reply_to_message_id: messageId,
    });
  } catch (error) {
    console.error('Error handling document image:', error);

    // Send error message
    await ctx.reply(
      `Error collecting image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { reply_to_message_id: messageId }
    );
  }
}

/**
 * Handle photo/image messages
 */
export async function handleImageMessage(ctx: Context, env: Env): Promise<void> {
  // Check authorization (silently ignore unauthorized users for messages)
  if (!isUserAuthorized(ctx, env)) {
    return;
  }

  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;

  if (!chatId || !messageId) {
    return;
  }

  try {
    // Get active session or create new one
    let session = await getSession(env.SESSIONS, chatId);

    // Auto-create session if none exists
    if (!session) {
      const userId = ctx.from?.id;
      if (!userId) return;

      const { createSession } = await import('../services/session');
      session = await createSession(env.SESSIONS, chatId, userId);
      await ctx.reply(
        '✨ Session started automatically!\n\nSend more messages (voice, text, or images), then send /done when ready to process.',
        { reply_to_message_id: messageId }
      );
    }

    // Only collect messages in 'collecting' status
    if (session.status !== 'collecting') {
      return;
    }

    // Check message limit
    if (session.messages.length >= MAX_MESSAGES_PER_SESSION) {
      await ctx.reply(
        `Maximum ${MAX_MESSAGES_PER_SESSION} messages reached. Send /done to process or /cancel to start over.`,
        { reply_to_message_id: messageId }
      );
      return;
    }

    // Get photo array (Telegram sends multiple sizes)
    const photos = ctx.message?.photo;
    if (!photos || photos.length === 0) {
      return;
    }

    // Select highest quality image (largest file_size)
    // Telegram provides photos in ascending size order, so last element is largest
    const photo = photos[photos.length - 1];

    // Check file size
    if (photo.file_size && photo.file_size > MAX_IMAGE_FILE_SIZE) {
      await ctx.reply(
        'Image is too large (max 10MB). Please send a smaller image.',
        { reply_to_message_id: messageId }
      );
      return;
    }

    // Prepare message object
    const message: CollectedMessage = {
      id: messageId,
      type: 'image',
      fileId: photo.file_id,
      fileSize: photo.file_size,
      order: session.messages.length + 1,
      timestamp: Date.now(),
    };

    // Add message to session
    await addMessageToSession(env.SESSIONS, chatId, message);

    // Send acknowledgment
    await ctx.reply(`🖼️ Image ${message.order} collected`, {
      reply_to_message_id: messageId,
    });
  } catch (error) {
    console.error('Error handling image message:', error);

    // Send error message
    await ctx.reply(
      `Error collecting image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { reply_to_message_id: messageId }
    );
  }
}
