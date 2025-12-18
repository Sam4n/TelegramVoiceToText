import type { ProcessingResult } from '../types/session';

/**
 * Telegram message character limit
 */
const TELEGRAM_MESSAGE_LIMIT = 4096;

/**
 * Format processing result as a Telegram message
 *
 * @param result - Processing result with summary, tasks, and transcriptions
 * @returns Formatted message string (Markdown format)
 */
export function formatResult(result: ProcessingResult): string {
  const sections: string[] = [];

  // Summary section
  sections.push('*Conversation Summary:*');
  sections.push(result.summary);
  sections.push('');

  // Tasks section
  if (result.tasks.length > 0) {
    sections.push('*Tasks Identified:*');
    result.tasks.forEach((task, index) => {
      sections.push(`${index + 1}\\. ${escapeMarkdown(task)}`);
    });
  } else {
    sections.push('*Tasks Identified:*');
    sections.push('_No specific tasks found_');
  }
  sections.push('');

  // Transcriptions section
  if (result.transcriptions.length > 0) {
    sections.push('*Voice Transcriptions:*');
    result.transcriptions.forEach((trans) => {
      sections.push(`*Voice ${trans.order}:* ${escapeMarkdown(trans.text)}`);
      sections.push('');
    });
  }

  // Join all sections
  let message = sections.join('\n').trim();

  // Check if message exceeds Telegram's limit
  if (message.length > TELEGRAM_MESSAGE_LIMIT) {
    message = truncateMessage(message, TELEGRAM_MESSAGE_LIMIT);
  }

  return message;
}

/**
 * Escape special characters for Telegram Markdown
 *
 * @param text - Text to escape
 * @returns Escaped text
 */
function escapeMarkdown(text: string): string {
  // Escape special Markdown characters
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

/**
 * Truncate message to fit within Telegram's character limit
 *
 * @param message - Original message
 * @param maxLength - Maximum length (default: 4096)
 * @returns Truncated message with notice
 */
function truncateMessage(message: string, maxLength: number = TELEGRAM_MESSAGE_LIMIT): string {
  const truncateNotice = '\n\n_\\[Message truncated due to length\\]_';
  const truncateLength = maxLength - truncateNotice.length;

  if (message.length <= maxLength) {
    return message;
  }

  return message.substring(0, truncateLength) + truncateNotice;
}

/**
 * Format error message for user
 *
 * @param error - Error object or message
 * @returns Formatted error message
 */
export function formatError(error: Error | string): string {
  const errorMessage = error instanceof Error ? error.message : error;
  return `An error occurred:\\n\\n${escapeMarkdown(errorMessage)}\\n\\nPlease try again or contact support if the issue persists\\.`;
}
