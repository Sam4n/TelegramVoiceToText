import type { ProcessingResult, FormattedMessage } from '../types/session';

/**
 * Telegram message character limit
 */
const TELEGRAM_MESSAGE_LIMIT = 4096;

/**
 * Format processing result as multiple Telegram messages
 *
 * @param result - Processing result with summary, tasks, and transcriptions
 * @returns Array of formatted messages (summary, tasks, and transcripts as separate messages)
 */
export function formatResult(result: ProcessingResult): FormattedMessage[] {
  const messages: FormattedMessage[] = [];

  // Message 1: Summary (using HTML for safe formatting)
  const summaryText = `<b>📋 Conversation Summary:</b>\n${escapeHtml(result.summary)}`;
  messages.push({
    text: truncateMessage(summaryText, TELEGRAM_MESSAGE_LIMIT),
  });

  // Message 2+: Tasks (split into multiple messages if needed)
  if (result.tasks.length > 0) {
    const taskMessages = splitTasksIntoMessages(result.tasks);
    messages.push(...taskMessages);
  } else {
    messages.push({
      text: '<b>✅ Tasks Identified:</b>\n<i>No specific tasks found</i>',
    });
  }

  // Message N+: Individual transcriptions (each as a reply to the original voice message)
  if (result.transcriptions.length > 0) {
    result.transcriptions.forEach((trans) => {
      messages.push({
        text: `🎙️ <b>Voice ${trans.order} Transcription:</b>\n\n${escapeHtml(trans.text)}`,
        replyToMessageId: trans.messageId,
      });
    });
  }

  return messages;
}

/**
 * Split tasks into multiple messages if they exceed the character limit
 *
 * @param tasks - Array of task strings
 * @returns Array of formatted messages containing tasks
 */
function splitTasksIntoMessages(tasks: string[]): FormattedMessage[] {
  const messages: FormattedMessage[] = [];
  const header = '<b>✅ Tasks Identified:</b>\n';
  let currentMessage = header;
  let currentTaskNumber = 1;
  let messageCount = 1;

  for (let i = 0; i < tasks.length; i++) {
    const taskLine = `${currentTaskNumber}. ${escapeHtml(tasks[i])}\n`;

    // Check if adding this task would exceed the limit
    if (currentMessage.length + taskLine.length > TELEGRAM_MESSAGE_LIMIT - 100) {
      // Save current message and start a new one
      messages.push({ text: currentMessage.trim() });
      messageCount++;
      currentMessage = `<b>✅ Tasks Identified (continued ${messageCount}):</b>\n`;
    }

    currentMessage += taskLine;
    currentTaskNumber++;
  }

  // Add the last message if it has content
  if (currentMessage.trim() !== header.trim() && currentMessage.trim() !== `<b>✅ Tasks Identified (continued ${messageCount}):</b>`) {
    messages.push({ text: currentMessage.trim() });
  }

  return messages;
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
 * Truncate message to fit within Telegram's character limit
 *
 * @param message - Original message
 * @param maxLength - Maximum length (default: 4096)
 * @returns Truncated message with notice
 */
function truncateMessage(message: string, maxLength: number = TELEGRAM_MESSAGE_LIMIT): string {
  const truncateNotice = '\n\n<i>[Message truncated due to length]</i>';
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
  return `<b>❌ An error occurred:</b>\n\n${escapeHtml(errorMessage)}\n\nPlease try again or contact support if the issue persists.`;
}
