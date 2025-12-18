import { webhookCallback } from 'grammy';
import { createBot } from './bot';
import { processSession } from './services/processor';
import { getSession, updateSession, deleteSession } from './services/session';
import { sendTelegramMessageWithRetry } from './services/telegram';
import { formatResult } from './utils/formatting';
import type { Env, VoiceProcessingJob } from './types/session';

/**
 * Cloudflare Workers entry point with webhook handler and queue consumer
 */
export default {
  /**
   * HTTP webhook handler (Producer)
   * Receives Telegram updates and commands
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // Create bot instance
      const bot = createBot(env.TELEGRAM_BOT_TOKEN, env);

      // Create webhook handler for Cloudflare Workers
      const handleUpdate = webhookCallback(bot, 'cloudflare-mod');

      // Handle the request
      return await handleUpdate(request);
    } catch (error) {
      console.error('Worker error:', error);

      // Return error response
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
  },

  /**
   * Queue consumer handler (Async processor)
   * Processes voice transcription jobs asynchronously
   */
  async queue(
    batch: MessageBatch<VoiceProcessingJob>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`Processing batch of ${batch.messages.length} job(s)`);

    for (const message of batch.messages) {
      const job = message.body;
      console.log(
        `Processing job for chat ${job.chatId} (attempt ${message.attempts}/${batch.retryAll ? 'retry' : '1'})`
      );

      try {
        // Get session from KV
        const session = await getSession(env.SESSIONS, job.chatId);

        if (!session) {
          console.error(`Session not found for chat ${job.chatId}`);
          message.ack(); // Acknowledge to remove from queue
          continue;
        }

        // Update session status to processing
        session.status = 'processing';
        await updateSession(env.SESSIONS, job.chatId, session);

        // Send "processing started" notification
        await sendTelegramMessageWithRetry(
          env.TELEGRAM_BOT_TOKEN,
          job.chatId,
          '⚙️ Processing started...'
        );

        // Process the session (long-running task - can take 30+ seconds)
        console.log(`Processing ${session.messages.length} messages for chat ${job.chatId}`);
        const result = await processSession(env, session);

        // Format results as multiple messages
        const formattedMessages = formatResult(result);

        // Send each message separately
        for (const message of formattedMessages) {
          await sendTelegramMessageWithRetry(
            env.TELEGRAM_BOT_TOKEN,
            job.chatId,
            message.text,
            {
              parse_mode: 'Markdown',
              reply_to_message_id: message.replyToMessageId,
            }
          );
        }

        // Update session to completed
        session.status = 'completed';
        await updateSession(env.SESSIONS, job.chatId, session);

        // Clean up session
        await deleteSession(env.SESSIONS, job.chatId);

        // Explicitly acknowledge successful processing
        message.ack();

        console.log(`Successfully processed job for chat ${job.chatId}`);
      } catch (error) {
        console.error(`Error processing job for chat ${job.chatId}:`, error);

        // Send error notification to user
        const errorMessage =
          `❌ Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
          `Please try again with /translate`;

        try {
          await sendTelegramMessageWithRetry(env.TELEGRAM_BOT_TOKEN, job.chatId, errorMessage);
        } catch (notifyError) {
          console.error('Failed to send error notification:', notifyError);
        }

        // Reset session status to allow retry
        try {
          const session = await getSession(env.SESSIONS, job.chatId);
          if (session) {
            session.status = 'collecting';
            await updateSession(env.SESSIONS, job.chatId, session);
          }
        } catch (resetError) {
          console.error('Failed to reset session:', resetError);
        }

        // Don't ack - let it retry based on max_retries
        // After max_retries, it will go to dead letter queue
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;
