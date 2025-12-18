import type { Session, ProcessingResult, TranscriptionResult, Env } from '../types/session';
import { downloadVoiceFileWithRetry } from './telegram';
import { transcribeAudioWithRetry } from './whisper';
import { analyzeConversationWithRetry } from './gpt';

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
    // Step 1: Extract text messages for context
    const textMessages = session.messages.filter((m) => m.type === 'text');
    const textContext = textMessages.map((m) => m.content).join('\n');

    console.log(`Processing session ${session.chatId}:`);
    console.log(`- Total messages: ${session.messages.length}`);
    console.log(`- Text messages: ${textMessages.length}`);
    console.log(`- Voice messages: ${session.messages.filter((m) => m.type === 'voice').length}`);

    // Step 2: Process voice messages
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

      // Transcribe with context
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

    // Step 3: Combine all content in chronological order
    const combinedContent = session.messages
      .map((msg) => {
        if (msg.type === 'text') {
          return `[Text message]: ${msg.content}`;
        } else {
          const transcription = transcriptions.find((t) => t.order === msg.order);
          if (transcription) {
            return `[Voice message]: ${transcription.text}`;
          }
          return '';
        }
      })
      .filter((content) => content.trim() !== '')
      .join('\n\n');

    console.log('Combined content for analysis:');
    console.log(combinedContent);

    // Step 4: Analyze with GPT-4
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
