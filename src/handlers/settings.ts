import { InlineKeyboard, type Context } from 'grammy';
import type { Env } from '../types/session';
import {
  LANGUAGE_OPTIONS,
  OUTPUT_MODE_OPTIONS,
  POLISH_MODEL_OPTIONS,
  TRANSCRIBE_MODEL_OPTIONS,
  type ChatSettings,
  type Option,
} from '../utils/config';
import { getChatSettings, resetChatSettings, updateChatSettings } from '../services/settings';
import { isUserAuthorized, sendUnauthorizedMessage } from '../utils/auth';

/**
 * One section of the settings menu
 */
interface Section {
  title: string;
  field: keyof ChatSettings;
  options: Option[];
}

const SECTIONS: Record<string, Section> = {
  t: { title: '🎙️ Transcription model', field: 'transcribeModel', options: TRANSCRIBE_MODEL_OPTIONS },
  l: { title: '🌐 Language', field: 'language', options: LANGUAGE_OPTIONS },
  o: { title: '📝 Output', field: 'outputMode', options: OUTPUT_MODE_OPTIONS },
  p: { title: '✨ Polish model', field: 'polishModel', options: POLISH_MODEL_OPTIONS },
};

interface Menu {
  text: string;
  keyboard: InlineKeyboard;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Options for a section, with the current value added when it is not in the list
 * (a model set in wrangler.toml that the menu does not offer)
 */
function optionsWithCurrent(section: Section, settings: ChatSettings): Option[] {
  const current = settings[section.field];
  return section.options.some((option) => option.value === current)
    ? section.options
    : [...section.options, { value: current, label: current, note: 'from wrangler.toml' }];
}

function labelOf(section: Section, settings: ChatSettings): string {
  const current = settings[section.field];
  return section.options.find((option) => option.value === current)?.label ?? current;
}

function mainMenu(settings: ChatSettings): Menu {
  const sections = settings.outputMode === 'transcript' ? ['t', 'l', 'o'] : ['t', 'l', 'o', 'p'];
  const lines = sections.map((key) => {
    const section = SECTIONS[key];
    return `${section.title}: <b>${escapeHtml(labelOf(section, settings))}</b>`;
  });

  const keyboard = new InlineKeyboard();
  for (const key of sections) {
    keyboard.text(SECTIONS[key].title, `cfg:open:${key}`).row();
  }
  keyboard.text('↺ Reset to defaults', 'cfg:reset').text('✖ Close', 'cfg:close');

  return {
    text: `⚙️ <b>Settings</b>\n\n${lines.join('\n')}\n\n<i>Applies from your next /done.</i>`,
    keyboard,
  };
}

function sectionMenu(key: string, settings: ChatSettings): Menu {
  const section = SECTIONS[key];
  const options = optionsWithCurrent(section, settings);
  const current = settings[section.field];

  const lines = options.map(
    (option) =>
      `${option.value === current ? '✓' : '•'} ${escapeHtml(option.label)}${option.note ? ` — <i>${escapeHtml(option.note)}</i>` : ''}`
  );

  const keyboard = new InlineKeyboard();
  options.forEach((option, index) => {
    keyboard.text(`${option.value === current ? '✓ ' : ''}${option.label}`, `cfg:set:${key}:${index}`).row();
  });
  keyboard.text('« Back', 'cfg:menu');

  return { text: `<b>${section.title}</b>\n\n${lines.join('\n')}`, keyboard };
}

/**
 * Handle /settings: show the settings menu
 */
export async function handleSettings(ctx: Context, env: Env): Promise<void> {
  if (!isUserAuthorized(ctx, env)) {
    await sendUnauthorizedMessage(ctx);
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const menu = mainMenu(await getChatSettings(env, chatId));
  await ctx.reply(menu.text, { parse_mode: 'HTML', reply_markup: menu.keyboard });
}

/**
 * Handle a button press in the settings menu (callback data "cfg:...")
 */
export async function handleSettingsCallback(ctx: Context, env: Env): Promise<void> {
  const data = ctx.callbackQuery?.data ?? '';
  const chatId = ctx.chat?.id;

  if (!isUserAuthorized(ctx, env) || !chatId) {
    await ctx.answerCallbackQuery({ text: 'Not authorized' });
    return;
  }

  const [, action, key, index] = data.split(':');
  let settings = await getChatSettings(env, chatId);
  let menu: Menu | null = null;
  let notice: string | undefined;

  if (action === 'open' && SECTIONS[key]) {
    menu = sectionMenu(key, settings);
  } else if (action === 'set' && SECTIONS[key]) {
    const section = SECTIONS[key];
    const option = optionsWithCurrent(section, settings)[Number(index)];
    if (option) {
      settings = await updateChatSettings(env, chatId, { [section.field]: option.value });
      notice = `${section.title.replace(/^\S+\s/, '')}: ${option.label}`;
    }
    menu = mainMenu(settings);
  } else if (action === 'reset') {
    settings = await resetChatSettings(env, chatId);
    notice = 'Back to defaults';
    menu = mainMenu(settings);
  } else if (action === 'close') {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => ctx.editMessageReplyMarkup());
    return;
  } else {
    menu = mainMenu(settings);
  }

  await ctx.answerCallbackQuery(notice ? { text: notice } : undefined);
  try {
    await ctx.editMessageText(menu.text, { parse_mode: 'HTML', reply_markup: menu.keyboard });
  } catch (error) {
    // Telegram refuses an edit that changes nothing; that is fine
    if (!(error instanceof Error && error.message.includes('message is not modified'))) {
      throw error;
    }
  }
}
