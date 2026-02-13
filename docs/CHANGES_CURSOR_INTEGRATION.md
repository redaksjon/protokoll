# Changes for Cursor Integration - February 2026

## Problem Statement

When using Cursor's Chat feature with the Protokoll MCP HTTP server, AI assistants were attempting to use direct file editing tools (Read, Write, StrReplace) on transcript files instead of using the proper Protokoll MCP tools. This resulted in:

- "I don't have access to that file" errors
- Bypassing proper validation and formatting
- Inconsistent metadata
- Missing resource change notifications

## Root Cause

The AI assistants in Cursor were not aware that:
1. Transcript files should be accessed via `protokoll://` URIs through the MCP server
2. Specific Protokoll MCP tools exist for transcript operations
3. Direct file editing tools should NOT be used on transcript files

## Solution Implemented

We've implemented a multi-layered approach to ensure AI assistants understand how to properly interact with Protokoll:

### 1. Enhanced Server Description

**File:** `src/mcp/server-http.ts`

**Change:** Updated the MCP server description to include explicit instructions for AI assistants:

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

**Impact:** AI assistants will see this description when they connect to the MCP server, providing immediate context about proper usage.

### 2. New "How To Use" Prompt

**Files:**
- `src/mcp/prompts/index.ts` - Added prompt definition and handler
- `src/mcp/prompts/how_to_use_protokoll.md` - Comprehensive usage guide

**Change:** Created a new MCP prompt that AI assistants can invoke to learn how to properly use Protokoll:

**Prompt name:** `how_to_use_protokoll`

**Description:** "Essential instructions for AI assistants on how to properly interact with Protokoll. READ THIS FIRST before working with transcripts. Explains which tools to use and which to avoid."

**Content includes:**
- ✅ Which Protokoll tools to use for different operations
- ❌ Which tools to avoid (Read, Write, StrReplace on transcripts)
- Why this matters (validation, metadata, notifications)
- When other tools CAN be used (web searches, documentation)
- Example workflows
- Complete tool reference

**Impact:** AI assistants can invoke this prompt at any time to get comprehensive guidance on proper Protokoll usage.

### 3. Enhanced Workflow Prompts

**File:** `src/mcp/prompts/review_transcript.md`

**Change:** Added explicit reference to the `how_to_use_protokoll` prompt at the beginning:

```markdown
**IMPORTANT: Before proceeding, if you haven't already, invoke the `how_to_use_protokoll` prompt to understand how to properly work with Protokoll transcripts. You MUST use Protokoll MCP tools, not direct file editing tools.**
```

**Impact:** AI assistants using workflow prompts will be reminded to check the usage guide first.

### 4. Documentation

**Files:**
- `docs/CURSOR_INTEGRATION.md` - Comprehensive integration guide
- `docs/CHANGES_CURSOR_INTEGRATION.md` - This file

**Content:**
- Overview of the problem and solution
- Configuration instructions for Cursor
- Test cases to verify correct behavior
- Troubleshooting guide
- Best practices for users and AI assistants
- Complete tool reference

**Impact:** Users and developers have clear documentation on how to configure and use Protokoll with Cursor.

## Files Changed

1. `src/mcp/server-http.ts` - Enhanced server description
2. `src/mcp/prompts/index.ts` - Added `how_to_use_protokoll` prompt
3. `src/mcp/prompts/how_to_use_protokoll.md` - New prompt template
4. `src/mcp/prompts/review_transcript.md` - Added reference to usage guide
5. `docs/CURSOR_INTEGRATION.md` - New integration documentation
6. `docs/CHANGES_CURSOR_INTEGRATION.md` - This change log

## Testing

### Build Verification

```bash
npm run build
```

Result: ✅ Build successful with no errors

### Manual Testing Required

1. **Test Case 1: Reading a Transcript**
   - User: "Show me transcript X"
   - Expected: AI uses `protokoll_read_transcript` or resource URI
   - Not: AI uses Read tool on file path

2. **Test Case 2: Editing a Transcript**
   - User: "Change the title to Y"
   - Expected: AI uses `protokoll_edit_transcript` with `title` parameter
   - Not: AI uses StrReplace or Write

3. **Test Case 3: Fixing Content**
   - User: "Fix the speaker names"
   - Expected: AI uses `protokoll_provide_feedback` with natural language corrections
   - Not: AI uses StrReplace to manually fix

4. **Test Case 4: Prompt Invocation**
   - User: "How do I work with Protokoll?"
   - Expected: AI can invoke `how_to_use_protokoll` prompt
   - Result: AI receives comprehensive usage guide

## Deployment

1. Build the project: `npm run build`
2. Restart the MCP HTTP server
3. Verify Cursor can connect to the server
4. Test with the scenarios above

## Future Improvements

1. **MCP Protocol Enhancement**: Consider proposing an `instructions` field in the MCP protocol specification for server-level AI guidance
2. **Cursor Configuration**: Work with Cursor team to add server-specific instructions in their MCP configuration
3. **Automatic Prompt Invocation**: Explore ways to automatically invoke `how_to_use_protokoll` when a session starts
4. **Tool Descriptions**: Enhance individual tool descriptions to reinforce proper usage
5. **Resource Descriptions**: Add usage guidance to resource descriptions

## Related Issues

- Original issue: Chat complaining about not having access to transcript source
- Root cause: AI attempting to use direct file tools instead of MCP tools
- Impact: Users unable to edit transcripts through Chat interface

## References

- MCP Specification: https://modelcontextprotocol.io/
- Protokoll MCP Documentation: `docs/MCP_OVERVIEW.md`
- Cursor Integration Guide: `docs/CURSOR_INTEGRATION.md`

## Author

Changes implemented on February 13, 2026 in response to user feedback about Chat not understanding how to interact with the Protokoll MCP server.
