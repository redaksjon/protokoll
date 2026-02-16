# Audio Upload & Transcription

Upload audio files and have them automatically transcribed, enhanced, and routed -- without babysitting the process.

## Overview

Protokoll offers three ways to get audio transcribed:

| Method | Best For | Processing |
|--------|----------|------------|
| **HTTP Upload** | Remote clients, automation, web integrations | Background (async) |
| **CLI** | Quick one-off files, scripts, cron jobs | Foreground (sync) |
| **MCP Tools** | AI assistants (Cursor, VS Code, macOS app) | Foreground (sync) |

All three methods feed into the same pipeline: Whisper transcription, context-aware enhancement, and intelligent routing.

## HTTP Upload (Background Processing)

The MCP HTTP server includes upload endpoints for fire-and-forget audio processing. Upload a file, get a UUID, and check back later.

### Starting the Server

```bash
# Production
protokoll-mcp-http

# Or via npm
npm run mcp:http

# Development (auto-reload)
npm run mcp:http:dev
```

The server starts on `http://127.0.0.1:3000` by default. Override with environment variables:

```bash
# In order of priority
export MCP_PORT=8080
export PROTOKOLL_MCP_PORT=8080
export PORT=8080
```

### Uploading a File

```bash
curl -X POST http://127.0.0.1:3000/audio/upload \
  -F "audio=@/path/to/meeting.m4a"
```

Response:

```json
{
  "success": true,
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "Audio uploaded successfully. Use protokoll_get_transcript_by_uuid to track progress.",
  "filename": "meeting.m4a",
  "size": 4521984
}
```

Save the `uuid` -- you'll use it to check status and retrieve the transcript.

### Supported Formats

`mp3`, `m4a`, `wav`, `webm`, `mp4`, `aac`, `ogg`, `flac`

Maximum file size: **25 MB**

### How Background Processing Works

1. File is saved to `{outputDirectory}/uploads/` with a content-hash filename
2. A PKL transcript is created with `uploaded` status and a UUID
3. The **background worker** polls every 5 seconds for new uploads
4. When it finds one, it processes sequentially:
   - Marks status as `transcribing`
   - Runs through the full pipeline (Whisper + enhancement + routing)
   - Sets status to `initial` on success, `error` on failure

The worker starts automatically with the HTTP server.

### Checking Status

```bash
# Check overall queue
curl http://127.0.0.1:3000/health
```

Or use MCP tools (see [Queue Management](#queue-management-mcp-tools) below).

### Downloading Original Audio

```bash
curl -O http://127.0.0.1:3000/audio/a1b2c3d4
```

The UUID can be the full value or an 8-character prefix.

## CLI Processing (Foreground)

Process audio files directly from the command line. The command blocks until transcription and enhancement are complete.

### Single File

```bash
protokoll process /path/to/meeting.m4a
```

Options:

```bash
protokoll process meeting.m4a \
  --project my-project \
  --output ~/notes \
  --model gpt-5.2 \
  --transcription-model whisper-1
```

Timeout: 10 minutes.

### Batch Processing

```bash
# Process all audio in a directory
protokoll batch ~/recordings

# Filter by extension
protokoll batch ~/recordings --extensions .m4a,.mp3,.wav

# Custom output
protokoll batch ~/recordings --output ~/notes
```

Timeout: 30 minutes.

## MCP Tools (AI Assistant Integration)

These tools are available to any MCP client -- Cursor, the VS Code extension, the macOS app, or any other client connected to the Protokoll MCP server.

### Audio Processing Tools

#### `protokoll_process_audio`

Process a single audio file through the full pipeline.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `audioFile` | Yes | -- | Filename, partial filename, or absolute path |
| `projectId` | No | -- | Force routing to a specific project |
| `outputDirectory` | No | workspace default | Override output location |
| `model` | No | `gpt-5.2` | LLM model for enhancement |
| `transcriptionModel` | No | `whisper-1` | Transcription model |

Returns the enhanced transcript text, output path, routed project, routing confidence, processing time, and corrections applied.

#### `protokoll_batch_process`

Process all audio files in a directory.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `inputDirectory` | No | workspace input dir | Directory to scan |
| `extensions` | No | `.m4a, .mp3, .wav, .webm` | File types to include |
| `outputDirectory` | No | workspace default | Override output location |

### Queue Management MCP Tools

These tools manage the background upload queue (HTTP upload workflow only).

#### `protokoll_queue_status`

View pending, processing, and recently completed transcriptions. No parameters.

Returns counts and details for pending uploads, active processing, and the last 10 completions (within 24 hours).

#### `protokoll_get_transcript_by_uuid`

Look up a specific transcript by UUID.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `uuid` | Yes | -- | Full UUID or 8-character prefix |
| `includeContent` | No | `false` | Include transcript text (only for `initial`/`enhanced`/`reviewed` status) |

#### `protokoll_retry_transcription`

Retry a failed transcription. Resets status from `error` back to `uploaded` so the worker picks it up again.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `uuid` | Yes | -- | UUID of the failed transcript |

#### `protokoll_cancel_transcription`

Cancel a pending or in-progress transcription.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `uuid` | Yes | -- | UUID of the transcript |
| `deleteFile` | No | `false` | Also delete the PKL file (otherwise marks as `error`) |

#### `protokoll_worker_status`

Check the background worker's health. No parameters.

Returns whether the worker is running, what it's currently processing, total processed count, and uptime.

#### `protokoll_restart_worker`

Restart the background worker if it gets stuck. No parameters.

## Transcript Status Lifecycle

Audio uploads follow this status progression:

```
uploaded → transcribing → initial → enhanced → reviewed → closed
                ↓
              error  ←→  (retry resets to uploaded)
```

| Status | Meaning |
|--------|---------|
| `uploaded` | Audio received, waiting in queue |
| `transcribing` | Worker is actively processing |
| `initial` | Transcription complete, ready for enhancement |
| `enhanced` | Context-aware enhancement applied |
| `reviewed` | Human has reviewed the transcript |
| `closed` | Final state |
| `error` | Processing failed (retryable) |

## macOS App

The Protokoll macOS app (`protokoll-osx`) provides a native interface:

- **Drag-and-drop** or **file picker** to select audio files
- Processing queue view with real-time status updates
- Settings for model selection, output directory, and context directory

The app calls `protokoll_process_audio` via MCP under the hood.

## Configuration

### Default Models

| Setting | Default | Environment |
|---------|---------|-------------|
| Enhancement model | `gpt-5.2` | Config or `--model` flag |
| Transcription model | `whisper-1` | Config or `--transcription-model` flag |

### Worker Settings

The background worker uses these defaults (configured in server code):

| Setting | Default |
|---------|---------|
| Scan interval | 5 seconds |
| Reasoning level | `medium` |
| Output structure | `month` |
| Filename pattern | `date`, `time`, `subject` |
| Max audio size (worker) | 100 MB |
| Max audio size (upload endpoint) | 25 MB |

### Output Location

Transcripts are routed to your configured output directory, organized by the `outputStructure` setting (default: `month`):

```
~/notes/
├── 2026/
│   ├── 01/
│   │   ├── 260115-0930-sprint-planning.md
│   │   └── 260115-1400-client-call.md
│   └── 02/
│       └── 260201-team-standup.md
└── uploads/          # Original audio files (HTTP uploads)
```

## Troubleshooting

### Upload returns "Unsupported file type"

Only these extensions are accepted: `mp3`, `m4a`, `wav`, `webm`, `mp4`, `aac`, `ogg`, `flac`. Convert other formats with ffmpeg:

```bash
ffmpeg -i recording.opus -c:a libmp3lame recording.mp3
```

### Upload returns "No audio file provided"

The multipart form field must be named `audio`:

```bash
# Correct
curl -F "audio=@file.m4a" http://127.0.0.1:3000/audio/upload

# Wrong
curl -F "file=@file.m4a" http://127.0.0.1:3000/audio/upload
```

### Transcript stuck in `uploaded` status

The background worker may not be running. Check with `protokoll_worker_status` or restart it with `protokoll_restart_worker`. If using the HTTP server, the worker starts automatically -- verify the server is running.

### Transcript stuck in `transcribing` status

The worker may have crashed mid-processing. Restart the server or use `protokoll_restart_worker`. On restart, the worker recovers `transcribing` transcripts and reprocesses them.

### File too large

The HTTP upload endpoint has a 25 MB limit. For larger files, use the CLI which supports up to 100 MB, or split the audio first:

```bash
# Split into 20-minute chunks
ffmpeg -i large-recording.m4a -f segment -segment_time 1200 -c copy chunk_%03d.m4a
```

## Next Steps

- [Quick Start](./quickstart.md): Initial setup and first transcription
- [Context System](./context-system.md): Add people, projects, and terms for better accuracy
- [Routing](./routing.md): How transcripts get routed to the right project
- [Lifecycle & Tasks](./lifecycle.md): Track transcript status and follow-ups
- [MCP Integration](./mcp-integration.md): Connect AI assistants to Protokoll
