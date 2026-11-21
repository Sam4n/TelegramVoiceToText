/**
 * OpenAI speech-to-text endpoint (whisper-1, gpt-4o-transcribe, gpt-transcribe, ...)
 */
const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * Maximum context length for Whisper prompt (approximately 224 tokens ~ 1000 characters)
 */
const MAX_CONTEXT_LENGTH = 1000;

/**
 * Timeout for Whisper API calls in milliseconds (30 seconds)
 */
const WHISPER_TIMEOUT = 30000;

/**
 * Whisper API response
 */
interface WhisperResponse {
  text: string;
}

/**
 * Transcribe audio using an OpenAI speech-to-text model
 *
 * @param apiKey - OpenAI API key
 * @param audioBuffer - Audio file as ArrayBuffer
 * @param contextText - Optional context to improve transcription accuracy
 * @param model - Speech-to-text model
 * @param language - ISO-639-1 code of the spoken language, or "auto"
 * @returns Transcribed text
 */
export async function transcribeAudio(
  apiKey: string,
  audioBuffer: ArrayBuffer,
  contextText: string = '',
  model: string = 'whisper-1',
  language: string = 'auto'
): Promise<string> {
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WHISPER_TIMEOUT);

  try {
    // Prepare form data
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'audio.ogg');
    formData.append('model', model);
    if (language && language !== 'auto') {
      formData.append('language', language);
    }
    formData.append('response_format', 'json');

    // Add context as prompt if provided (truncate to max length)
    if (contextText.trim()) {
      const prompt = contextText.slice(0, MAX_CONTEXT_LENGTH);
      formData.append('prompt', prompt);
    }

    console.log(`Making transcription call with ${model} (timeout: ${WHISPER_TIMEOUT}ms)...`);

    // Make API request with timeout
    const response = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as WhisperResponse;

    if (!result.text) {
      throw new Error('No transcription text received from Whisper API');
    }

    console.log('Whisper API call successful');
    return result.text.trim();
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout errors
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Whisper API timeout after ${WHISPER_TIMEOUT}ms`);
      throw new Error(
        `Whisper API timeout after ${WHISPER_TIMEOUT / 1000} seconds. Voice file may be too long.`
      );
    }

    console.error('Error transcribing audio:', error);
    throw new Error(
      `Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Transcribe audio with retry logic
 *
 * @param apiKey - OpenAI API key
 * @param audioBuffer - Audio file as ArrayBuffer
 * @param contextText - Optional context to improve transcription accuracy
 * @param model - Speech-to-text model
 * @param language - ISO-639-1 code of the spoken language, or "auto"
 * @param maxRetries - Maximum number of attempts (default: 2)
 * @returns Transcribed text
 */
export async function transcribeAudioWithRetry(
  apiKey: string,
  audioBuffer: ArrayBuffer,
  contextText: string = '',
  model: string = 'whisper-1',
  language: string = 'auto',
  maxRetries: number = 2
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await transcribeAudio(apiKey, audioBuffer, contextText, model, language);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.error(`Transcription attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      // Don't retry on certain errors
      if (
        lastError.message.includes('401') || // Invalid API key
        lastError.message.includes('400') || // Bad request (invalid file)
        lastError.message.includes('timeout') // Timeout - retrying won't help
      ) {
        throw lastError;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to transcribe audio after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}
