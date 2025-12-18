# Deployment Guide - Async Queue-Based Bot

This guide explains how to deploy the updated Telegram bot with Cloudflare Queues for async processing.

## What Changed?

The bot now uses **Cloudflare Queues** to process voice messages asynchronously, solving the 10-second timeout issue.

### Before (Synchronous):
```
/done → Process immediately → Timeout after 10s ❌
```

### After (Asynchronous):
```
/done → Queue job → Reply instantly ✅
Queue consumer → Process (30+ seconds allowed) → Send results ✅
```

## Prerequisites

- Cloudflare account with Workers enabled
- Telegram Bot Token (from @BotFather)
- OpenAI API Key (from platform.openai.com)
- Node.js 18+ installed
- Wrangler CLI installed (`npm install -g wrangler`)

## Step-by-Step Deployment

### 1. Create Cloudflare Queues

Run these commands in your project directory:

```bash
# Create the main processing queue
npx wrangler queues create voice-processing-queue

# Create the dead letter queue (for failed jobs)
npx wrangler queues create voice-processing-dlq

# Generate TypeScript types for the queues
npx wrangler types
```

Expected output:
```
✅ Created queue voice-processing-queue
✅ Created queue voice-processing-dlq
```

### 2. Verify wrangler.toml

The `wrangler.toml` file should already be configured with queue bindings. Verify it contains:

```toml
[[queues.producers]]
queue = "voice-processing-queue"
binding = "VOICE_QUEUE"

[[queues.consumers]]
queue = "voice-processing-queue"
max_batch_size = 1
max_batch_timeout = 1
max_retries = 3
dead_letter_queue = "voice-processing-dlq"
```

### 3. Deploy to Cloudflare Workers

```bash
npm run deploy
```

Or:

```bash
npx wrangler deploy
```

Expected output:
```
✨ Compiled Worker successfully
✨ Uploaded Worker successfully
✨ Deployed telegram-voice-bot to Cloudflare
   https://telegram-voice-bot.your-subdomain.workers.dev
```

### 4. Test the Bot

1. **Start a session:**
   ```
   /translate
   ```

2. **Send messages:**
   - Forward text message (for context)
   - Send voice message (2+ minutes is fine now!)

3. **Trigger processing:**
   ```
   /done
   ```

4. **Verify async behavior:**
   - Bot should reply **immediately**: "🔄 Processing 2 message(s)..."
   - Within 10-30 seconds, bot sends "⚙️ Processing started..."
   - Then bot sends the final results with transcription, summary, and tasks

### 5. Monitor Logs

Watch real-time logs:

```bash
npm run tail
```

Or:

```bash
npx wrangler tail
```

Look for these log messages:
```
Job queued for chat 123456 with 2 messages
Processing batch of 1 job(s)
Processing job for chat 123456
Processing 2 messages for chat 123456
Successfully processed job for chat 123456
```

### 6. Check Queue Status

```bash
npx wrangler queues list
```

Output:
```
┌────────────────────────────┬──────────┬────────────┐
│ Queue Name                 │ Messages │ Consumers  │
├────────────────────────────┼──────────┼────────────┤
│ voice-processing-queue     │ 0        │ 1          │
│ voice-processing-dlq       │ 0        │ 0          │
└────────────────────────────┴──────────┴────────────┘
```

- `Messages`: Jobs currently in queue (should be 0 when idle)
- `Consumers`: Active consumers (should be 1)

## Troubleshooting

### Issue: "Queue not found" error

**Solution:** Create the queues first:
```bash
npx wrangler queues create voice-processing-queue
npx wrangler queues create voice-processing-dlq
```

### Issue: Bot replies but no results arrive

**Check logs:**
```bash
npx wrangler tail
```

Look for errors in queue consumer. Common issues:
- Invalid OpenAI API key
- Session expired (30-minute TTL)
- Voice file too large (>20MB)

### Issue: Jobs going to dead letter queue

Check why jobs are failing:
```bash
npx wrangler tail --filter dead-letter
```

Failed jobs go to DLQ after 3 retry attempts.

### Issue: TypeScript errors about Queue types

Run:
```bash
npx wrangler types
```

This generates `worker-configuration.d.ts` with queue type definitions.

## Performance Expectations

### Synchronous (Old):
- ❌ Timeout at 10 seconds for long voice files
- ❌ User waits with loading indicator
- ❌ No partial results on failure

### Asynchronous (New):
- ✅ Instant response (<1 second)
- ✅ Can process voice files of any length (up to 20MB)
- ✅ User notified when processing starts
- ✅ Automatic retries on failure (3 attempts)
- ✅ Failed jobs go to dead letter queue for investigation

## Cost Estimates

**Cloudflare Queues:**
- $0.40 per million operations
- 1 job = ~3 operations (write, read, delete)
- 100 jobs/day = ~$0.004/month (essentially free)

**OpenAI API:**
- Whisper: $0.006/minute of audio
- GPT-5.2: ~$0.01-0.03/conversation
- 100 sessions/day ≈ $5-10/month

**Total: ~$5-10/month** (mostly OpenAI)

## Rollback Plan

If you need to roll back to synchronous processing:

1. Checkout previous commit:
   ```bash
   git log --oneline
   git checkout <commit-before-queue-changes>
   ```

2. Deploy:
   ```bash
   npm run deploy
   ```

3. Note: Synchronous version will still timeout on long voice files

## Next Steps

- ✅ Bot is now deployed with async processing
- ✅ Can handle long voice messages (2+ minutes)
- ✅ No more timeout errors
- ✅ Automatic retries on failures

Test it with a 2-3 minute voice message to verify it works!
