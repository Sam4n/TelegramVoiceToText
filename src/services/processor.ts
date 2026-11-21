import type { Session, ProcessingResult, TranscriptionResult, Env } from '../types/session';
import { downloadVoiceFileWithRetry, downloadImageFileWithRetry } from './telegram';
import { transcribeAudioWithRetry } from './whisper';
import { polishConversationWithRetry, analyzeImageWithRetry } from './gpt';
import type { ChatSettings } from '../utils/config';

/**
 * Process a session: transcribe voice messages and, when the output asks for it,
 * polish the conversation into one text
 *
 * @param env - Cloudflare Workers environment bindings
 * @param session - Session to process
 * @param config - The chat's settings (models, language, output)
 * @returns Processing result with the transcript, the polished text and the transcriptions
 */
export async function processSession(
  env: Env,
  session: Session,
  config: ChatSettings
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
        textContext,
        config.transcribeModel,
        config.language
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

    // Voice and text content without labels: the transcript, close to what was said
    const transcript = session.messages
      .map((msg) => {
        if (msg.type === 'text') return msg.content?.trim() ?? '';
        if (msg.type === 'voice') {
          return transcriptions.find((t) => t.order === msg.order)?.text ?? '';
        }
        return '';
      })
      .filter((content) => content !== '')
      .join('\n\n');

    if (!transcript || config.outputMode === 'transcript') {
      return { transcript, polished: null, transcriptions };
    }

    // Step 5: Polish everything into one text (images are context only)
    console.log(`Polishing conversation with ${config.polishModel}...`);
    let polished: string | null = null;
    try {
      polished = await polishConversationWithRetry(
        env.OPENAI_API_KEY,
        combinedContent,
        config.polishModel
      );
      console.log('Polishing complete');
    } catch (error) {
      // Send the transcript alone rather than fail the job and re-run transcription on retry
      console.error('Polishing failed, sending the transcript only:', error);
    }

    return { transcript, polished, transcriptions };
  } catch (error) {
    console.error('Error in processSession:', error);
    throw new Error(
      `Failed to process session: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
