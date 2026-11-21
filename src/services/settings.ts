import type { Env } from '../types/session';
import { getConfig, sanitizeSettings, type ChatSettings } from '../utils/config';

/**
 * KV key for a chat's settings. Only the values the chat changed are stored,
 * so a chat follows the Worker's defaults for everything else.
 */
function getSettingsKey(chatId: number): string {
  return `settings:${chatId}`;
}

async function getOverrides(env: Env, chatId: number): Promise<Partial<ChatSettings>> {
  const stored = await env.SESSIONS.get(getSettingsKey(chatId), 'json');
  return (stored ?? {}) as Partial<ChatSettings>;
}

/**
 * Settings for a chat: its own choices over the Worker's defaults
 */
export async function getChatSettings(env: Env, chatId: number): Promise<ChatSettings> {
  const defaults = getConfig(env);
  return sanitizeSettings({ ...defaults, ...(await getOverrides(env, chatId)) }, defaults);
}

/**
 * Change some of a chat's settings
 */
export async function updateChatSettings(
  env: Env,
  chatId: number,
  patch: Partial<ChatSettings>
): Promise<ChatSettings> {
  const overrides = { ...(await getOverrides(env, chatId)), ...patch };
  await env.SESSIONS.put(getSettingsKey(chatId), JSON.stringify(overrides));
  return getChatSettings(env, chatId);
}

/**
 * Go back to the Worker's defaults
 */
export async function resetChatSettings(env: Env, chatId: number): Promise<ChatSettings> {
  await env.SESSIONS.delete(getSettingsKey(chatId));
  return getChatSettings(env, chatId);
}
