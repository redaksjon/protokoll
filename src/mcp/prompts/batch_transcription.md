# Batch Transcription Workflow

I want to batch process audio files in: ${directory}

## Step 1: Discover Context Configuration

First, let's understand what context configuration is available:

```
protokoll_discover_config
  startingDirectory: "${directory}"
```

This will show us:
- Which `.protokoll` context directory will be used
- What projects are defined
- What entities (people, terms, companies) are available

## Step 2: List Audio Files

Before processing, let's see what audio files are in the directory:

```
protokoll_batch_process
  inputDirectory: "${directory}"
  dryRun: true  (if you want to preview first)
```

## Step 3: Process the Batch

Once you've confirmed the configuration and files, run:

```
protokoll_batch_process
  inputDirectory: "${directory}"
  contextDirectory: (path from step 1, or omit to auto-discover)
```

## What Happens During Batch Processing

For each audio file:
1. **Transcription**: Whisper transcribes the audio
2. **Enhancement**: The reasoning model corrects names/terms using context
3. **Classification**: Multi-signal routing determines which project it belongs to
4. **Output**: Transcript saved to the appropriate project folder

## Related Tools

- `protokoll_list_transcripts` - View transcripts after processing
- `protokoll_context_status` - Check context configuration
- `protokoll_list_projects` - See available projects
- `protokoll_provide_feedback` - Report issues with transcripts
