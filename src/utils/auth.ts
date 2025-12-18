import type { Context } from 'grammy';
import type { Env } from '../types/session';

/**
 * Check if a user is authorized to use the bot
 *
 * @param ctx - grammY context
 * @param env - Environment bindings
 * @returns true if user is authorized, false otherwise
 */
export function isUserAuthorized(ctx: Context, env: Env): boolean {
  // If no whitelist is configured, allow everyone
  if (!env.ALLOWED_USERS) {
    return true;
  }

  const chatId = ctx.chat?.id;
  const username = ctx.from?.username;
  const userId = ctx.from?.id;

  if (!chatId || !userId) {
    return false;
  }

  // Parse whitelist (comma-separated usernames and chat IDs)
  const allowedUsers = env.ALLOWED_USERS.split(',').map((item) => item.trim());

  // Check if username matches (without @ prefix)
  if (username) {
    const usernameMatch = allowedUsers.some(
      (allowed) =>
        allowed.toLowerCase() === username.toLowerCase() ||
        allowed.toLowerCase() === `@${username.toLowerCase()}`
    );
    if (usernameMatch) {
      return true;
    }
  }

  // Check if chat ID or user ID matches
  const chatIdStr = chatId.toString();
  const userIdStr = userId.toString();
  const idMatch = allowedUsers.some(
    (allowed) => allowed === chatIdStr || allowed === userIdStr
  );

  return idMatch;
}

/**
 * Send unauthorized message to user
 *
 * @param ctx - grammY context
 */
export async function sendUnauthorizedMessage(ctx: Context): Promise<void> {
  await ctx.reply(
    '🚫 You are not authorized to use this bot.\n\n' +
      'Please contact the bot administrator if you believe this is an error.'
  );
}
