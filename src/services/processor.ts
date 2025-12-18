import type { Session, ProcessingResult, TranscriptionResult, Env } from '../types/session';
import { downloadVoiceFileWithRetry, downloadImageFileWithRetry } from './telegram';
import { transcribeAudioWithRetry } from './whisper';
import { analyzeConversationWithRetry, analyzeImageWithRetry } from './gpt';

/**
 * Process a session by transcribing voice messages and analyzing the conversation
 *
 * @param env - Cloudflare Workers environment bindings
 * @param session - Session to process
 * @returns Processing result with summary, tasks, and transcriptions
 */
export async function processSession(
  env: Env,
  session: Session
): Promise<ProcessingResult> {
  try {
    // Step 1: Process image messages first (before building Whisper context)
    const imageMessages = session.messages.filter((m) => m.type === 'image');
    const imageDescriptions: Map<number, string> = new Map();

    console.log(`Processing session ${session.chatId}:`);
    console.log(`- Total messages: ${session.messages.length}`);
    console.log(`- Text messages: ${session.messages.filter((m) => m.type === 'text').length}`);
    console.log(`- Voice messages: ${session.messages.filter((m) => m.type === 'voice').length}`);
    console.log(`- Image messages: ${imageMessages.length}`);

    // Process images with Vision API
    for (const msg of imageMessages) {
      if (!msg.fileId) {
        console.warn(`Image message ${msg.id} has no fileId, skipping`);
        continue;
      }

      try {
        console.log(`Downloading image message ${msg.order}...`);

        // Download image file
        const imageBuffer = await downloadImageFileWithRetry(
          env.TELEGRAM_BOT_TOKEN,
          msg.fileId
        );

        console.log(`Analyzing image message ${msg.order} with GPT Vision...`);

        // Analyze image with Vision API
        const analysis = await analyzeImageWithRetry(
          env.OPENAI_API_KEY,
          imageBuffer,
          'image/jpeg' // Telegram photos are typically JPEG
        );

        // Store description mapped by order
        imageDescriptions.set(msg.order, analysis.description);

        console.log(`Image message ${msg.order} analyzed: ${analysis.description}`);
      } catch (error) {
        console.error(`Failed to process image ${msg.order}:`, error);
        // Store error placeholder instead of failing entire session
        imageDescriptions.set(
          msg.order,
          '[Image processing failed - content not available]'
        );
      }
    }

    // Step 2: Extract text messages and image descriptions for Whisper context
    const textMessages = session.messages.filter((m) => m.type === 'text');
    const contextParts: string[] = [];

    // Add text messages
    textMessages.forEach((m) => {
      if (m.content) {
        contextParts.push(m.content);
      }
    });

    // Add image descriptions (in chronological order)
    imageMessages.forEach((m) => {
      const description = imageDescriptions.get(m.order);
      if (description) {
        contextParts.push(`[Image: ${description}]`);
      }
    });

    const textContext = contextParts.join('\n');

    // Step 3: Process voice messages with enhanced context
    const transcriptions: TranscriptionResult[] = [];
    const voiceMessages = session.messages.filter((m) => m.type === 'voice');

    for (const msg of voiceMessages) {
      if (!msg.fileId) {
        console.warn(`Voice message ${msg.id} has no fileId, skipping`);
        continue;
      }

      console.log(`Downloading voice message ${msg.order}...`);

      // Download audio file
      const audioBuffer = await downloadVoiceFileWithRetry(
        env.TELEGRAM_BOT_TOKEN,
        msg.fileId
      );

      console.log(`Transcribing voice message ${msg.order}...`);

      // Transcribe with enhanced context (text + image descriptions)
      const transcribedText = await transcribeAudioWithRetry(
        env.OPENAI_API_KEY,
        audioBuffer,
        textContext
      );

      transcriptions.push({
        order: msg.order,
        text: transcribedText,
        messageId: msg.id,
      });

      console.log(`Voice message ${msg.order} transcribed successfully`);
    }

    // Step 4: Combine all content in chronological order
    const combinedContent = session.messages
      .map((msg) => {
        if (msg.type === 'text') {
          return `[Text message]: ${msg.content}`;
        } else if (msg.type === 'voice') {
          const transcription = transcriptions.find((t) => t.order === msg.order);
          if (transcription) {
            return `[Voice message]: ${transcription.text}`;
          }
          return '';
        } else if (msg.type === 'image') {
          const description = imageDescriptions.get(msg.order);
          if (description) {
            return `[Image]: ${description}`;
          }
          return '';
        }
        return '';
      })
      .filter((content) => content.trim() !== '')
      .join('\n\n');

    console.log('Combined content for analysis:');
    console.log(combinedContent);

    // Step 5: Analyze with GPT-4 (text-only analysis of all content)
    console.log('Analyzing conversation with GPT-4...');
    const analysis = await analyzeConversationWithRetry(
      env.OPENAI_API_KEY,
      combinedContent
    );

    console.log('Analysis complete:', analysis);

    // Return complete result
    return {
      summary: analysis.summary,
      tasks: analysis.tasks,
      transcriptions,
    };
  } catch (error) {
    console.error('Error in processSession:', error);
    throw new Error(
      `Failed to process session: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
