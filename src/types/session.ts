/**
 * Session status represents the current state of a user's session
 */
export type SessionStatus = 'collecting' | 'queued' | 'processing' | 'completed';

/**
 * Type of message collected during a session
 */
export type MessageType = 'voice' | 'text' | 'image';

/**
 * Represents a collected message (voice or text) during a session
 */
export interface CollectedMessage {
  /** Telegram message ID */
  id: number;

  /** Type of message */
  type: MessageType;

  /** Text content (for text messages) */
  content?: string;

  /** Telegram file ID (for voice messages) */
  fileId?: string;

  /** File size in bytes (for voice messages) */
  fileSize?: number;

  /** Duration in seconds (for voice messages) */
  duration?: number;

  /** Image description from Vision analysis (for image messages) */
  imageDescription?: string;

  /** Sequence number to maintain chronological order */
  order: number;

  /** Timestamp when message was collected */
  timestamp: number;
}

/**
 * Represents a user session for message collection and processing
 */
export interface Session {
  /** Telegram chat ID */
  chatId: number;

  /** Telegram user ID */
  userId: number;

  /** Current session status */
  status: SessionStatus;

  /** Array of collected messages */
  messages: CollectedMessage[];

  /** Unix timestamp when session was created */
  startTime: number;
}

/**
 * Result of voice transcription
 */
export interface TranscriptionResult {
  /** Sequence order of the message */
  order: number;

  /** Transcribed text */
  text: string;

  /** Original message ID for reply-to */
  messageId: number;
}

/**
 * Result of image analysis using GPT Vision
 */
export interface ImageAnalysisResult {
  /** Descriptive text of image content */
  description: string;
}

/**
 * Complete processing result
 */
export interface ProcessingResult {
  /** Voice transcriptions and text messages in order, as said (empty when there was none) */
  transcript: string;

  /** Polished version of the transcript, or null when not requested or polishing failed */
  polished: string | null;

  /** Individual transcriptions */
  transcriptions: TranscriptionResult[];
}

/**
 * Formatted message ready to be sent to Telegram
 */
export interface FormattedMessage {
  /** Message text */
  text: string;

  /** Optional message ID to reply to */
  replyToMessageId?: number;
}

/**
 * Queue job for voice processing
 */
export interface VoiceProcessingJob {
  /** Telegram chat ID */
  chatId: number;

  /** Timestamp when job was queued */
  timestamp: number;

  /** Number of messages to process */
  messageCount: number;
}

/**
 * Environment bindings for Cloudflare Workers
 */
export interface Env {
  /** Telegram Bot API token */
  TELEGRAM_BOT_TOKEN: string;

  /** OpenAI API key */
  OPENAI_API_KEY: string;

  /** Cloudflare KV namespace for session storage */
  SESSIONS: KVNamespace;

  /** Cloudflare Queue for async voice processing */
  VOICE_QUEUE: Queue<VoiceProcessingJob>;

  /** Cloudflare Queue for failed jobs (Dead Letter Queue) */
  VOICE_DLQ: Queue<VoiceProcessingJob>;

  /** Optional: Comma-separated list of allowed usernames or chat IDs (e.g., "Sam4nFox,123456789") */
  ALLOWED_USERS?: string;

  /** Optional: speech-to-text model (default in src/utils/config.ts) */
  TRANSCRIBE_MODEL?: string;

  /** Optional: text model for the polished version (default in src/utils/config.ts) */
  POLISH_MODEL?: string;

  /** Optional: "transcript", "polished" or "both" (default "transcript") */
  OUTPUT_MODE?: string;

  /** Optional: spoken language as an ISO-639-1 code, or "auto" (default "auto") */
  LANGUAGE?: string;
}
