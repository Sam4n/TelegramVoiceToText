/**
 * Telegram Bot API base URL
 */
const TELEGRAM_API_BASE = 'https://api.telegram.org';

/**
 * Response from Telegram getFile API
 */
interface GetFileResponse {
  ok: boolean;
  result?: {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
  };
  description?: string;
}

/**
 * Get file information from Telegram
 */
async function getFileInfo(
  botToken: string,
  fileId: string
): Promise<string> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/getFile?file_id=${fileId}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Telegram API error: ${response.statusText}`);
  }

  const data = (await response.json()) as GetFileResponse;

  if (!data.ok || !data.result?.file_path) {
    throw new Error(`Failed to get file info: ${data.description || 'Unknown error'}`);
  }

  return data.result.file_path;
}

/**
 * Download a voice file from Telegram
 *
 * @param botToken - Telegram bot API token
 * @param fileId - Telegram file ID
 * @returns ArrayBuffer containing the audio file
 */
export async function downloadVoiceFile(
  botToken: string,
  fileId: string
): Promise<ArrayBuffer> {
  try {
    // Step 1: Get file path
    const filePath = await getFileInfo(botToken, fileId);

    // Step 2: Download the file
    const fileUrl = `${TELEGRAM_API_BASE}/file/bot${botToken}/${filePath}`;
    const response = await fetch(fileUrl);

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error downloading voice file:', error);
    throw new Error(
      `Failed to download voice file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Download a voice file with retry logic
 *
 * @param botToken - Telegram bot API token
 * @param fileId - Telegram file ID
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns ArrayBuffer containing the audio file
 */
export async function downloadVoiceFileWithRetry(
  botToken: string,
  fileId: string,
  maxRetries: number = 3
): Promise<ArrayBuffer> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await downloadVoiceFile(botToken, fileId);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.error(`Download attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to download file after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Download an image file from Telegram
 *
 * @param botToken - Telegram bot API token
 * @param fileId - Telegram file ID
 * @returns ArrayBuffer containing the image file
 */
export async function downloadImageFile(
  botToken: string,
  fileId: string
): Promise<ArrayBuffer> {
  try {
    // Step 1: Get file path (reuse existing getFileInfo function)
    const filePath = await getFileInfo(botToken, fileId);

    // Step 2: Download the file
    const fileUrl = `${TELEGRAM_API_BASE}/file/bot${botToken}/${filePath}`;
    const response = await fetch(fileUrl);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error downloading image file:', error);
    throw new Error(
      `Failed to download image file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Download an image file with retry logic
 *
 * @param botToken - Telegram bot API token
 * @param fileId - Telegram file ID
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns ArrayBuffer containing the image file
 */
export async function downloadImageFileWithRetry(
  botToken: string,
  fileId: string,
  maxRetries: number = 3
): Promise<ArrayBuffer> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await downloadImageFile(botToken, fileId);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.error(`Image download attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to download image after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Send a message to Telegram using the Bot API
 * This works outside the webhook context (e.g., from queue consumers)
 *
 * @param botToken - Telegram bot API token
 * @param chatId - Chat ID to send message to
 * @param text - Message text
 * @param options - Optional message options
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  options?: {
    parse_mode?: 'Markdown' | 'HTML';
    disable_web_page_preview?: boolean;
    reply_to_message_id?: number;
  }
): Promise<void> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text: text,
    ...options,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    throw new Error(
      `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Send a message with retry logic
 *
 * @param botToken - Telegram bot API token
 * @param chatId - Chat ID to send message to
 * @param text - Message text
 * @param options - Optional message options
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 */
export async function sendTelegramMessageWithRetry(
  botToken: string,
  chatId: number,
  text: string,
  options?: {
    parse_mode?: 'Markdown' | 'HTML';
    reply_to_message_id?: number;
  },
  maxRetries: number = 3
): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendTelegramMessage(botToken, chatId, text, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.error(`Send message attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to send message after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}
