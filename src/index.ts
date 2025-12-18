import { webhookCallback } from 'grammy';
import { createBot } from './bot';
import type { Env } from './types/session';

/**
 * Cloudflare Workers entry point
 */
export default {
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
};
