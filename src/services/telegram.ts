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
