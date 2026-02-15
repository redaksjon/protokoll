# Cursor Integration with Protokoll MCP Server

## Overview

This document explains how to properly configure Cursor to work with the Protokoll MCP HTTP server, ensuring that AI assistants understand how to interact with transcripts correctly.

## The Problem

When using Cursor with the Protokoll MCP server, AI assistants may attempt to use direct file editing tools (Read, Write, StrReplace) on transcript files instead of using the proper Protokoll MCP tools. This bypasses:

- Proper validation and formatting
- Metadata consistency checks
- File naming conventions
- Resource change notifications
- Context integration

## The Solution

We've implemented multiple layers of guidance to ensure AI assistants use the correct tools:

### 1. Server Description

The MCP server's description field includes explicit instructions for AI assistants:

```typescript
description:
    'Intelligent audio transcription with context-aware enhancement. ' +
    'Process audio files through a pipeline that transcribes with Whisper, ' +
    'then enhances using LLMs with knowledge of your people, projects, and terminology. ' +
    'Manage context entities (people, projects, terms) to improve recognition. ' +
    'Edit and combine existing transcripts. ' +
    '\n\n**IMPORTANT FOR AI ASSISTANTS**: When working with transcripts, you MUST use the ' +
    'Protokoll MCP tools (protokoll_*) to read and modify transcript files. ' +
    'DO NOT use direct file editing tools like Read, Write, or StrReplace on transcript files. ' +
    'Use protokoll_read_transcript to read, protokoll_edit_transcript to change title/project/tags/status, ' +
    'protokoll_provide_feedback for content corrections, and protokoll_change_transcript_date for date changes. ' +
    'The transcript files are accessed via protokoll:// URIs through this MCP server.',
```

### 2. How To Use Prompt

We provide a dedicated prompt that AI assistants should read before working with transcripts:

**Prompt name:** `how_to_use_protokoll`

**Description:** "Essential instructions for AI assistants on how to properly interact with Protokoll. READ THIS FIRST before working with transcripts. Explains which tools to use and which to avoid."

This prompt provides comprehensive guidance on:
- Which Protokoll tools to use for different operations
- Which tools to avoid
- Why this matters
- Example workflows

### 3. Prompt-Level Instructions

Each workflow prompt (like `review_transcript`) includes explicit instructions to use only Protokoll MCP tools. For example:

```markdown
## CRITICAL: Use ONLY Protokoll MCP Tools to Alter Transcripts

**YOU MUST use Protokoll MCP tools to make ANY changes to the transcript. NEVER directly edit transcript files.**

### What NOT to Do:
❌ Do NOT use StrReplace, Write, or any file editing tools to modify the transcript
❌ Do NOT directly edit the transcript markdown file
❌ Do NOT bypass Protokoll tools when changing the transcript

### What TO Do:
✅ Use any tools needed for research, web searches, or gathering context
✅ Always use `protokoll_provide_feedback` to apply content corrections
✅ Always use `protokoll_edit_transcript` to change title/project/tags/status
✅ Always use `protokoll_change_transcript_date` to change the date
```

## MCP Server Configuration

### Starting the Server

```bash
# Default port (3000)
node dist/mcp/server-http.js

# Custom port
MCP_PORT=3001 node dist/mcp/server-http.js

# With workspace root
WORKSPACE_ROOT=/path/to/workspace node dist/mcp/server-http.js
```

### Cursor MCP Configuration

Add to your Cursor MCP settings (`.cursor/mcp.json` or global settings):

```json
{
  "mcpServers": {
    "protokoll": {
      "url": "http://127.0.0.1:3000/mcp",
      "transport": "http"
    }
  }
}
```

## Verifying Correct Behavior

### Test Case 1: Reading a Transcript

**User request:** "Show me the content of transcript X"

**Correct behavior:**
- AI uses `protokoll_read_transcript` or reads the `protokoll://transcript/...` resource
- AI does NOT use Read tool on the file path

**Incorrect behavior:**
- AI uses Read tool directly on the transcript file path
- AI complains about not having access to the source

### Test Case 2: Editing a Transcript

**User request:** "Change the title of transcript X to Y"

**Correct behavior:**
- AI uses `protokoll_edit_transcript` tool with `title` parameter
- AI provides the new title and confirms the change

**Incorrect behavior:**
- AI uses StrReplace to modify the file directly
- AI uses Write to rewrite the entire file

### Test Case 3: Fixing Content

**User request:** "Fix the speaker names in transcript X"

**Correct behavior:**
- AI uses `protokoll_provide_feedback` with natural language corrections
- Example: `protokoll_provide_feedback` with feedback: "Change 'John Doe' to 'Jane Smith'"

**Incorrect behavior:**
- AI uses StrReplace to manually fix each occurrence
- AI uses Write to rewrite sections of the file

## Troubleshooting

### Issue: AI says it can't access the transcript

**Symptoms:**
- "I don't have access to that file"
- "I can't read that transcript"
- Attempts to use Read tool fail

**Solution:**
1. Verify the MCP server is running and accessible
2. Check that the transcript URI is correct (should be `protokoll://transcript/...`)
3. Remind the AI to use `protokoll_read_transcript` or the resource URI
4. Invoke the `how_to_use_protokoll` prompt to re-educate the AI

### Issue: AI uses direct file editing tools

**Symptoms:**
- AI uses Read, Write, or StrReplace on transcript files
- Changes bypass Protokoll validation
- Metadata becomes inconsistent

**Solution:**
1. Stop the AI immediately
2. Invoke the `how_to_use_protokoll` prompt
3. Explicitly request the AI to use Protokoll MCP tools
4. If needed, invoke the specific workflow prompt (e.g., `review_transcript`)

### Issue: AI doesn't know which tool to use

**Symptoms:**
- AI asks which tool to use
- AI uses wrong tool for the operation

**Solution:**
1. Invoke the `how_to_use_protokoll` prompt
2. Refer to the tool list in the prompt response
3. Use the appropriate workflow prompt for the task

## Best Practices

### For Users

1. **Start with a workflow prompt** - Use prompts like `review_transcript`, `transcribe_with_context`, etc. rather than free-form requests
2. **Be explicit** - If the AI seems confused, explicitly mention "use Protokoll MCP tools"
3. **Invoke how_to_use_protokoll** - If the AI forgets, invoke this prompt to remind it
4. **Use protokoll:// URIs** - When referencing transcripts, use the URI format

### For AI Assistants

1. **Read how_to_use_protokoll first** - Before working with transcripts, invoke this prompt
2. **Always use Protokoll tools** - Never use direct file editing tools on transcripts
3. **Check tool descriptions** - Use `tools/list` to see available Protokoll tools
4. **Follow workflow prompts** - The workflow prompts contain important instructions

## Available Protokoll Tools

Key tools for transcript operations:

- `protokoll_read_transcript` - Read transcript content
- `protokoll_list_transcripts` - List available transcripts
- `protokoll_edit_transcript` - Edit title, project, tags, or status (renames file when title changes)
- `protokoll_change_transcript_date` - Change transcript date (moves file to new date folder)
- `protokoll_provide_feedback` - Apply content corrections using natural language
- `protokoll_update_transcript_content` - Replace transcript body content
- `protokoll_create_note` - Create new transcript
- `protokoll_combine_transcripts` - Combine multiple transcripts

For a complete list, use the MCP `tools/list` request.

## Resources

Protokoll exposes transcripts as MCP resources with `protokoll://` URIs:

- `protokoll://transcript/{relativePath}` - Individual transcript
- `protokoll://transcripts/list?directory={dir}` - List of transcripts
- `protokoll://config` - Configuration
- `protokoll://entities/{type}` - Entity lists

## Summary

The key principle is simple: **When working with Protokoll transcripts, always use Protokoll MCP tools, never direct file editing tools.**

This ensures:
- ✅ Proper validation and formatting
- ✅ Metadata consistency
- ✅ File naming conventions
- ✅ Resource change notifications
- ✅ Context integration
- ✅ Correct operation

If you're an AI assistant reading this: invoke the `how_to_use_protokoll` prompt before working with transcripts!
