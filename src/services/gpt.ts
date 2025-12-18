import type { AnalysisResult } from '../types/session';

/**
 * OpenAI Chat Completions API endpoint
 */
const GPT_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * GPT model to use for analysis
 */
const GPT_MODEL = 'gpt-5-mini-2025-08-07';

/**
 * Timeout for GPT API calls in milliseconds (30 seconds)
 */
const GPT_TIMEOUT = 30000;

/**
 * System prompt for conversation analysis
 */
const SYSTEM_PROMPT = `You are a conversation analyzer. Given a conversation transcript (which may include both text messages and voice transcriptions), you need to:

1. Provide a concise summary of the conversation (2-3 sentences)
2. Extract a bullet-point list of action items, tasks, and to-dos mentioned in the conversation

Format your response as JSON with the following structure:
{
  "summary": "Brief 2-3 sentence summary of the conversation",
  "tasks": ["task 1", "task 2", "task 3"]
}

If no tasks are mentioned, return an empty array for tasks.
Be specific and actionable in your task extraction.`;

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
 * Analyze conversation using GPT-4
 *
 * @param apiKey - OpenAI API key
 * @param conversationText - Combined conversation text
 * @returns Analysis result with summary and tasks
 */
export async function analyzeConversation(
  apiKey: string,
  conversationText: string
): Promise<AnalysisResult> {
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GPT_TIMEOUT);

  try {
    // Prepare request body
    const requestBody: GPTRequest = {
      model: GPT_MODEL,
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
      response_format: { type: 'json_object' },
      temperature: 0.3,
    };

    console.log(`Making GPT API call (timeout: ${GPT_TIMEOUT}ms)...`);

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
      throw new Error(`GPT API error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as GPTResponse;

    if (!result.choices || result.choices.length === 0) {
      throw new Error('No response from GPT API');
    }

    const content = result.choices[0].message.content;

    // Parse JSON response
    const analysis = JSON.parse(content) as AnalysisResult;

    // Validate response structure
    if (!analysis.summary || !Array.isArray(analysis.tasks)) {
      throw new Error('Invalid response format from GPT API');
    }

    console.log('GPT API call successful');
    return analysis;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout errors
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`GPT API timeout after ${GPT_TIMEOUT}ms`);
      throw new Error(
        `GPT API timeout after ${GPT_TIMEOUT / 1000} seconds. Conversation may be too long.`
      );
    }

    console.error('Error analyzing conversation:', error);
    throw new Error(
      `Failed to analyze conversation: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Analyze conversation with retry logic
 *
 * @param apiKey - OpenAI API key
 * @param conversationText - Combined conversation text
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Analysis result with summary and tasks
 */
export async function analyzeConversationWithRetry(
  apiKey: string,
  conversationText: string,
  maxRetries: number = 2
): Promise<AnalysisResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await analyzeConversation(apiKey, conversationText);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.error(`Analysis attempt ${attempt}/${maxRetries} failed:`, lastError.message);

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
    `Failed to analyze conversation after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}
