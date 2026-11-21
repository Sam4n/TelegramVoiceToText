import type { ProcessingResult, FormattedMessage } from '../types/session';
import type { OutputMode } from './config';

/**
 * Telegram message character limit
 */
const TELEGRAM_MESSAGE_LIMIT = 4096;

/**
 * Room kept for a section label on the first message of a section
 */
const LABEL_ROOM = 64;

const TRANSCRIPT_LABEL = '🎙️ <b>Transcript</b>\n\n';
const POLISHED_LABEL = '✨ <b>Polished</b>\n\n';

/**
 * Format processing result as Telegram messages
 *
 * - both: the transcript, then the polished version, each labelled
 *   (the transcript alone when polishing failed)
 * - polished: the polished version only (the transcript when polishing failed)
 * - transcript: the transcript only
 *
 * A section longer than Telegram's limit continues in the next message.
 *
 * @param result - Processing result
 * @param mode - Output mode
 * @returns Array of formatted messages
 */
export function formatResult(result: ProcessingResult, mode: OutputMode): FormattedMessage[] {
  const transcript = result.transcript.trim();
  const polished = result.polished?.trim() || null;

  if (!transcript) {
    return [{ text: '<i>No voice or text messages to transcribe.</i>' }];
  }

  if (mode === 'transcript' || (mode === 'polished' && !polished)) {
    return section(transcript);
  }
  if (mode === 'polished') {
    return section(polished as string);
  }

  // both
  if (!polished) {
    return section(transcript);
  }
  return [...section(transcript, TRANSCRIPT_LABEL), ...section(polished, POLISHED_LABEL)];
}

/**
 * One section as messages, with an optional label on the first message
 */
function section(text: string, label: string = ''): FormattedMessage[] {
  const chunks = splitForTelegram(text, TELEGRAM_MESSAGE_LIMIT - (label ? LABEL_ROOM : 0));
  return chunks.map((chunk, index) => ({ text: index === 0 ? label + chunk : chunk }));
}

/**
 * Split text into escaped chunks that each fit in one Telegram message,
 * breaking at a paragraph, line, sentence or word boundary where possible
 *
 * @param text - Unescaped text
 * @param limit - Maximum escaped length of a chunk
 * @returns Escaped chunks, in order
 */
export function splitForTelegram(text: string, limit: number = TELEGRAM_MESSAGE_LIMIT): string[] {
  const chunks: string[] = [];
  let rest = text;

  while (rest) {
    if (escapeHtml(rest).length <= limit) {
      chunks.push(escapeHtml(rest));
      break;
    }

    // Longest prefix whose escaped form fits
    let fit = 0;
    let escapedLength = 0;
    while (fit < rest.length) {
      const charLength = escapeHtml(rest[fit]).length;
      if (escapedLength + charLength > limit) break;
      escapedLength += charLength;
      fit++;
    }

    // Prefer a natural break in the second half of the prefix
    const prefix = rest.slice(0, fit);
    const minimum = Math.floor(fit / 2);
    let cut = fit;
    for (const separator of ['\n\n', '\n', '. ', ' ']) {
      const index = prefix.lastIndexOf(separator);
      if (index >= minimum) {
        cut = index + separator.length;
        break;
      }
    }

    chunks.push(escapeHtml(rest.slice(0, cut).trimEnd()));
    rest = rest.slice(cut).trimStart();
  }

  return chunks;
}

/**
 * Escape special characters for Telegram HTML formatting
 * Prevents HTML injection and parsing errors
 *
 * @param text - Text to escape
 * @returns Escaped text safe for HTML parse mode
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')   // Ampersand (must be first)
    .replace(/</g, '&lt;')    // Less than
    .replace(/>/g, '&gt;');   // Greater than
}

/**
 * Format error message for user
 *
 * @param error - Error object or message
 * @returns Formatted error message
 */
export function formatError(error: Error | string): string {
  const errorMessage = error instanceof Error ? error.message : error;
  return `<b>❌ An error occurred:</b>\n\n${escapeHtml(errorMessage)}\n\nPlease try again or contact support if the issue persists.`;
}
