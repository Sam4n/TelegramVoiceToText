import type { Env } from '../types/session';

/**
 * What the bot sends back after /done
 * - transcript: the transcript only (no polishing call)
 * - polished: a polished version only
 * - both: the transcript, then a polished version
 */
export type OutputMode = 'transcript' | 'polished' | 'both';

/**
 * Settings that apply to one chat. Defaults come from the Worker's vars
 * (wrangler.toml [vars]); each chat can change them with /settings.
 */
export interface ChatSettings {
  /** Speech-to-text model */
  transcribeModel: string;

  /** Spoken language as an ISO-639-1 code, or "auto" to detect it */
  language: string;

  /** What to send back */
  outputMode: OutputMode;

  /** Text model for the polished version (used unless outputMode is "transcript") */
  polishModel: string;
}

export interface Option {
  value: string;
  label: string;
  note?: string;
}

/** Speech-to-text models offered in /settings, best first */
export const TRANSCRIBE_MODEL_OPTIONS: Option[] = [
  { value: 'gpt-transcribe', label: 'gpt-transcribe', note: 'newest, most accurate' },
  { value: 'gpt-4o-transcribe', label: 'gpt-4o-transcribe', note: 'accurate' },
  { value: 'gpt-4o-mini-transcribe', label: 'gpt-4o-mini-transcribe', note: 'faster, cheaper' },
  { value: 'whisper-1', label: 'whisper-1', note: 'original Whisper' },
];

/** Spoken languages offered in /settings */
export const LANGUAGE_OPTIONS: Option[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'fa', label: 'فارسی (Persian)' },
  { value: 'en', label: 'English' },
];

/** Output modes offered in /settings */
export const OUTPUT_MODE_OPTIONS: Option[] = [
  { value: 'transcript', label: 'Transcript', note: 'what was said' },
  { value: 'polished', label: 'Polished', note: 'clean, well-written version' },
  { value: 'both', label: 'Both', note: 'transcript, then polished' },
];

/** Text models offered in /settings for the polished version */
export const POLISH_MODEL_OPTIONS: Option[] = [
  { value: 'gpt-6.2-sol', label: 'gpt-6.2-sol', note: 'best tested, fast' },
  { value: 'gpt-6.1-terra', label: 'gpt-6.1-terra' },
  { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini', note: 'cheapest' },
];

/** Defaults used when the Worker's vars do not set them */
export const DEFAULT_SETTINGS: ChatSettings = {
  transcribeModel: 'gpt-transcribe',
  language: 'auto',
  outputMode: 'transcript',
  polishModel: 'gpt-6.2-sol',
};

function isOutputMode(value: string): value is OutputMode {
  return OUTPUT_MODE_OPTIONS.some((option) => option.value === value);
}

/**
 * Keep only valid values; anything else falls back to the given defaults
 */
export function sanitizeSettings(
  value: Partial<ChatSettings>,
  defaults: ChatSettings = DEFAULT_SETTINGS
): ChatSettings {
  const text = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback;
  const mode = text(value.outputMode, defaults.outputMode).toLowerCase();
  const language = text(value.language, defaults.language).toLowerCase();

  return {
    transcribeModel: text(value.transcribeModel, defaults.transcribeModel),
    language: language === 'auto' || /^[a-z]{2}$/.test(language) ? language : defaults.language,
    outputMode: isOutputMode(mode) ? mode : defaults.outputMode,
    polishModel: text(value.polishModel, defaults.polishModel),
  };
}

/**
 * Default settings for every chat, from the Worker's vars
 */
export function getConfig(env: Env): ChatSettings {
  return sanitizeSettings({
    transcribeModel: env.TRANSCRIBE_MODEL,
    language: env.LANGUAGE,
    outputMode: env.OUTPUT_MODE as OutputMode | undefined,
    polishModel: env.POLISH_MODEL,
  });
}
