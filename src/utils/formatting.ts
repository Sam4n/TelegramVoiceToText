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

  // Message 1: Summary
  const summaryText = `*Conversation Summary:*\n${result.summary}`;
  messages.push({
    text: truncateMessage(summaryText, TELEGRAM_MESSAGE_LIMIT),
  });

  // Message 2+: Tasks (split into multiple messages if needed)
  if (result.tasks.length > 0) {
    const taskMessages = splitTasksIntoMessages(result.tasks);
    messages.push(...taskMessages);
  } else {
    messages.push({
      text: '*Tasks Identified:*\n_No specific tasks found_',
    });
  }

  // Message N+: Individual transcriptions (each as a reply to the original voice message)
  if (result.transcriptions.length > 0) {
    result.transcriptions.forEach((trans) => {
      messages.push({
        text: `🎙️ *Voice ${trans.order} Transcription:*\n\n${trans.text}`,
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
  const header = '*Tasks Identified:*\n';
  let currentMessage = header;
  let currentTaskNumber = 1;
  let messageCount = 1;

  for (let i = 0; i < tasks.length; i++) {
    const taskLine = `${currentTaskNumber}. ${tasks[i]}\n`;

    // Check if adding this task would exceed the limit
    if (currentMessage.length + taskLine.length > TELEGRAM_MESSAGE_LIMIT - 100) {
      // Save current message and start a new one
      messages.push({ text: currentMessage.trim() });
      messageCount++;
      currentMessage = `*Tasks Identified (continued ${messageCount}):*\n`;
    }

    currentMessage += taskLine;
    currentTaskNumber++;
  }

  // Add the last message if it has content
  if (currentMessage.trim() !== header.trim() && currentMessage.trim() !== `*Tasks Identified (continued ${messageCount}):*`) {
    messages.push({ text: currentMessage.trim() });
  }

  return messages;
}

/**
 * Escape special characters for Telegram Markdown (simplified version)
 * Only escapes characters that would actually break Markdown formatting
 *
 * @param text - Text to escape
 * @returns Escaped text
 */
function escapeMarkdown(text: string): string {
  // Only escape the most critical Markdown characters
  // Don't escape periods, numbers, or common punctuation
  return text
    .replace(/\*/g, '\\*')  // Asterisk (bold)
    .replace(/_/g, '\\_')   // Underscore (italic)
    .replace(/`/g, '\\`');  // Backtick (code)
}

/**
 * Truncate message to fit within Telegram's character limit
 *
 * @param message - Original message
 * @param maxLength - Maximum length (default: 4096)
 * @returns Truncated message with notice
 */
function truncateMessage(message: string, maxLength: number = TELEGRAM_MESSAGE_LIMIT): string {
  const truncateNotice = '\n\n_[Message truncated due to length]_';
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
  return `An error occurred:\n\n${errorMessage}\n\nPlease try again or contact support if the issue persists.`;
}
