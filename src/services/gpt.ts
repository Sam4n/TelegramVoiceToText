import type { ImageAnalysisResult } from '../types/session';

/**
 * OpenAI Chat Completions API endpoint
 */
const GPT_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Model used for image analysis (the polishing model comes from POLISH_MODEL, see src/utils/config.ts)
 */
const GPT_MODEL = 'gpt-5-mini-2025-08-07';

/**
 * Reasoning models accept reasoning_effort; older chat models reject it
 */
function isReasoningModel(model: string): boolean {
  return /^(gpt-[5-9]|o[0-9])/.test(model);
}

/**
 * Timeout for GPT API calls in milliseconds (90 seconds)
 * The reply is the whole polished text, so long conversations need the time
 */
const GPT_TIMEOUT = 90000;

/**
 * Timeout for Vision API calls in milliseconds (45 seconds)
 * Longer than text-only due to image processing
 */
const VISION_TIMEOUT = 45000;

/**
 * System prompt for the polished version of a conversation
 */
const SYSTEM_PROMPT = `You are an editor. The user message holds one conversation, in order, as labelled parts: "[Voice message]:" is a speech-to-text transcription, "[Text message]:" is typed text, and "[Image]:" describes a photo.

Write a polished version of the voice and text parts, as one text, the way a careful writer would put it:
- Keep the original language of each part. Never translate. Keep product and technical names as they are.
- Keep every point, fact, name, number, date and the speaker's intent. Do not summarize, drop content, or add information.
- Fix a speech-to-text mistake only when the context leaves a single sensible reading. Otherwise keep the word as transcribed. Never replace a name with a different name.
- Use standard written grammar, spelling and punctuation, in a natural, friendly tone. For Persian, write standard written Persian with correct half-spaces rather than colloquial spoken forms.
- Remove filler words, false starts and repetition. Split run-on speech into clear sentences and short paragraphs.
- Use the image descriptions only as context; do not include them.

Reply with the polished text only: no title, no labels, no commentary, no Markdown formatting.`;

/**
 * System prompt for image analysis
 */
const VISION_SYSTEM_PROMPT = `You are an image analysis assistant. Describe the image content clearly and concisely for use as context in voice transcription.

Focus on:
1. Main subjects/objects in the image
2. Any visible text (signs, labels, documents)
3. Scene/setting context
4. Actions or activities shown

Keep the description factual, concise (2-4 sentences), and relevant for understanding conversation context.`;

/**
 * GPT API request body
 */
interface GPTRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  response_format?: { type: string };
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
  temperature?: number;
}

/**
 * GPT API response
 */
interface GPTResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Turn the conversation into one polished text
 *
 * @param apiKey - OpenAI API key
 * @param conversationText - Combined conversation text, one labelled part per message
 * @param model - Text model
 * @returns The polished text
 */
export async function polishConversation(
  apiKey: string,
  conversationText: string,
  model: string
): Promise<string> {
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GPT_TIMEOUT);

  try {
    const requestBody: GPTRequest = {
      model,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: conversationText,
        },
      ],
      // Reasoning models only support the default temperature (1)
      ...(isReasoningModel(model) ? { reasoning_effort: 'low' as const } : {}),
    };

    console.log(`Making polish call with ${model} (timeout: ${GPT_TIMEOUT}ms)...`);

    const response = await fetch(GPT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GPT API error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as GPTResponse;

    if (!result.choices || result.choices.length === 0) {
      throw new Error('No response from GPT API');
    }

    const text = (result.choices[0].message.content || '').trim();
    if (!text) {
      throw new Error('Empty response from GPT API');
    }

    console.log('GPT API call successful');
    return text;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout errors
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`GPT API timeout after ${GPT_TIMEOUT}ms`);
      throw new Error(
        `GPT API timeout after ${GPT_TIMEOUT / 1000} seconds. Conversation may be too long.`
      );
    }

    console.error('Error polishing conversation:', error);
    throw new Error(
      `Failed to polish conversation: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Polish conversation with retry logic
 *
 * @param apiKey - OpenAI API key
 * @param conversationText - Combined conversation text
 * @param model - Text model
 * @param maxRetries - Maximum number of attempts (default: 2)
 * @returns The polished text
 */
export async function polishConversationWithRetry(
  apiKey: string,
  conversationText: string,
  model: string,
  maxRetries: number = 2
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await polishConversation(apiKey, conversationText, model);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.error(`Polish attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      // Don't retry on certain errors
      if (
        lastError.message.includes('401') || // Invalid API key
        lastError.message.includes('400') || // Bad request
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
    `Failed to polish conversation after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Analyze an image using GPT Vision
 *
 * @param apiKey - OpenAI API key
 * @param imageBuffer - Image file as ArrayBuffer
 * @param imageType - MIME type of image (e.g., 'image/jpeg', 'image/png')
 * @returns Image description and analysis
 */
export async function analyzeImage(
  apiKey: string,
  imageBuffer: ArrayBuffer,
  imageType: string = 'image/jpeg'
): Promise<ImageAnalysisResult> {
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VISION_TIMEOUT);

  try {
    // Convert ArrayBuffer to base64
    const bytes = new Uint8Array(imageBuffer);
    const base64Image = btoa(String.fromCharCode(...bytes));
    const dataUrl = `data:${imageType};base64,${base64Image}`;

    // Prepare request body with multimodal content
    const requestBody = {
      model: GPT_MODEL, // gpt-5-mini-2025-08-07 supports vision
      messages: [
        {
          role: 'system',
          content: VISION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this image and provide a clear, concise description.',
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
                detail: 'auto', // 'auto' lets GPT choose detail level
              },
            },
          ],
        },
      ],
      max_tokens: 500, // Limit response length
    };

    console.log(`Making GPT Vision API call (timeout: ${VISION_TIMEOUT}ms)...`);

    // Make API request with timeout
    const response = await fetch(GPT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GPT Vision API error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as GPTResponse;

    if (!result.choices || result.choices.length === 0) {
      throw new Error('No response from GPT Vision API');
    }

    const description = result.choices[0].message.content.trim();

    console.log('GPT Vision API call successful');

    // Return structured result
    return {
      description,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout errors
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`GPT Vision API timeout after ${VISION_TIMEOUT}ms`);
      throw new Error(
        `GPT Vision API timeout after ${VISION_TIMEOUT / 1000} seconds. Image may be too large.`
      );
    }

    console.error('Error analyzing image:', error);
    throw new Error(
      `Failed to analyze image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Analyze image with retry logic
 *
 * @param apiKey - OpenAI API key
 * @param imageBuffer - Image file as ArrayBuffer
 * @param imageType - MIME type of image
 * @param maxRetries - Maximum number of retry attempts (default: 2)
 * @returns Image description and analysis
 */
export async function analyzeImageWithRetry(
  apiKey: string,
  imageBuffer: ArrayBuffer,
  imageType: string = 'image/jpeg',
  maxRetries: number = 2
): Promise<ImageAnalysisResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await analyzeImage(apiKey, imageBuffer, imageType);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.error(`Image analysis attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      // Don't retry on certain errors
      if (
        lastError.message.includes('401') || // Invalid API key
        lastError.message.includes('400') || // Bad request
        lastError.message.includes('timeout') // Timeout
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
    `Failed to analyze image after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}
