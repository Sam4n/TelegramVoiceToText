# Telegram Voice-to-Text Bot

A Telegram bot that transcribes voice messages using OpenAI's Whisper API with context-aware processing and conversation analysis.

## Features

- **Context-Aware Transcription**: Uses text messages as context to improve voice transcription accuracy
- **Conversation Summary**: Generates concise summaries of your conversations
- **Task Extraction**: Automatically identifies and lists action items and tasks
- **Multi-Message Support**: Process up to 10 messages (voice and text) in a single session
- **Serverless Deployment**: Runs on Cloudflare Workers for free (up to 1M requests/day)

## How It Works

1. Send `/translate` to start a session
2. Forward or send 4-5 messages (mix of voice and text)
3. Send `/done` to process
4. Receive transcriptions, summary, and task list

## Prerequisites

- Node.js 18+ installed
- Cloudflare account (free tier works)
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- OpenAI API Key (from [platform.openai.com](https://platform.openai.com))

## Setup Instructions

### 1. Get Required API Keys

#### Telegram Bot Token
1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow the instructions
3. Save the bot token provided

#### OpenAI API Key
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Save the key securely

### 2. Install Dependencies

```bash
npm install
```

### 3. Create Cloudflare KV Namespace

```bash
npm run kv:create
```

This will output a namespace ID. Copy it and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SESSIONS"
id = "paste-your-namespace-id-here"
```

### 4. Set Secrets

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
# Paste your Telegram bot token when prompted

wrangler secret put OPENAI_API_KEY
# Paste your OpenAI API key when prompted
```

### 5. Deploy to Cloudflare Workers

```bash
npm run deploy
```

After deployment, you'll get a URL like: `https://telegram-voice-bot.your-subdomain.workers.dev`

### 6. Register Webhook with Telegram

Replace `<YOUR_BOT_TOKEN>` and `<YOUR_WORKER_URL>` with your actual values:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>"
```

Example:
```bash
curl "https://api.telegram.org/bot123456:ABC-DEF/setWebhook?url=https://telegram-voice-bot.your-subdomain.workers.dev"
```

You should see a response like: `{"ok":true,"result":true}`

## Usage

### Commands

- `/start` - Welcome message and bot introduction
- `/help` - Show help message
- `/translate` - Start a new session for message collection
- `/done` - Process collected messages
- `/cancel` - Cancel current session

### Example Workflow

1. Send `/translate` to the bot
2. The bot replies: "Session started! Forward or send me your messages..."
3. Forward or type 4-5 messages (can be voice or text)
4. Bot acknowledges each message: "🎙️ Message 1 collected"
5. Send `/done` when ready
6. Bot processes and replies with:
   - Conversation summary
   - Task list
   - Individual voice transcriptions

## Development

### Local Development

```bash
npm run dev
```

This starts a local development server with hot reload.

### View Logs

```bash
npm run tail
```

## Project Structure

```
telegram-voice-bot/
├── src/
│   ├── index.ts              # Cloudflare Worker entry point
│   ├── bot.ts                # Bot initialization
│   ├── handlers/
│   │   ├── commands.ts       # Command handlers
│   │   └── messages.ts       # Message collectors
│   ├── services/
│   │   ├── session.ts        # Session management (KV)
│   │   ├── telegram.ts       # File downloads
│   │   ├── whisper.ts        # Voice transcription
│   │   ├── gpt.ts            # Conversation analysis
│   │   └── processor.ts      # Main orchestrator
│   ├── types/
│   │   └── session.ts        # TypeScript interfaces
│   └── utils/
│       └── formatting.ts     # Response formatting
├── wrangler.toml             # Cloudflare config
├── package.json
└── tsconfig.json
```

## Configuration

### Session Settings

Edit `src/services/session.ts` to modify:
- `SESSION_TTL`: Session timeout (default: 30 minutes)
- `MAX_MESSAGES_PER_SESSION`: Message limit (default: 10)

### Voice File Limits

Edit `src/handlers/messages.ts` to modify:
- `MAX_VOICE_FILE_SIZE`: Maximum file size (default: 20MB)

### GPT Model

Edit `src/services/gpt.ts` to change:
- `GPT_MODEL`: AI model (default: gpt-4o-mini)

## Costs

### Cloudflare Workers
- Free tier: 100,000 requests/day
- Paid: $5/month for 10M requests

### OpenAI API
- Whisper: $0.006 per minute of audio
- GPT-4: ~$0.01-0.03 per conversation
- Example: 100 sessions with 5 voice messages each ≈ $5-10

## Troubleshooting

### Bot doesn't respond
1. Check webhook is set: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
2. View logs: `npm run tail`
3. Verify secrets: `wrangler secret list`

### Transcription errors
- Check OpenAI API key is valid
- Verify audio file is under 20MB
- Check supported formats (OGG, MP3, WAV, M4A)

### Session not found
- Sessions expire after 30 minutes
- Use `/translate` to start a new session

## Security Notes

- Never commit `.env` files
- Store secrets using `wrangler secret put`
- KV data is encrypted at rest
- Sessions auto-expire after 30 minutes

## License

MIT

## Support

For issues and feature requests, please open an issue on GitHub.
