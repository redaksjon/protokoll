# How to Use Protokoll MCP Server

## CRITICAL INSTRUCTIONS FOR AI ASSISTANTS

When working with Protokoll transcripts, you MUST follow these rules:

### ✅ ALWAYS Use Protokoll MCP Tools

**For reading transcripts:**
- Use `protokoll_read_transcript` or read the `protokoll://transcript/...` resource
- DO NOT use Read, Glob, or Grep tools on transcript files directly

**For modifying transcript content (typos, names, terms):**
- Use `protokoll_provide_feedback` with natural language feedback describing corrections
- The tool processes feedback and applies corrections automatically

**For changing transcript title:**
- Use `protokoll_edit_transcript` with the `title` parameter
- This automatically renames the file to match the new title

**For updating metadata (project, tags, status, etc.):**
- Use `protokoll_edit_transcript` with the appropriate parameters
- For date changes specifically, use `protokoll_change_transcript_date`

**For creating new transcripts:**
- Use `protokoll_create_note` to create a new transcript

**For combining transcripts:**
- Use `protokoll_combine_transcripts` to merge multiple transcripts

### ❌ NEVER Use Direct File Tools on Transcripts

**DO NOT use these tools on transcript files:**
- ❌ Read - use `protokoll_read_transcript` instead
- ❌ Write - use Protokoll tools instead
- ❌ StrReplace - use Protokoll tools instead
- ❌ Glob - use `protokoll_list_transcripts` instead
- ❌ Grep - use `protokoll_search_transcripts` instead

### Why This Matters

Transcript files are managed by the Protokoll system and accessed via `protokoll://` URIs through this MCP server. Direct file editing bypasses:
- Proper validation and formatting
- Metadata consistency checks
- File naming conventions
- Resource change notifications
- Context integration

### When You Can Use Other Tools

You ARE free to use other tools for:
- ✅ Web searches to gather context
- ✅ Reading documentation or reference materials
- ✅ Analyzing external sources
- ✅ Any non-transcript file operations

But when it's time to actually modify a transcript file, you MUST route all changes through Protokoll MCP tools.

### Example Workflow

**User asks:** "Change the title of transcript X to Y and fix the speaker names"

**Correct approach:**
1. Use `protokoll_read_transcript` to read the current transcript
2. Use `protokoll_edit_transcript` with `title: "Y"` to change the title
3. Use `protokoll_provide_feedback` with feedback like "Fix speaker names: John Doe should be Jane Smith"

**Incorrect approach:**
1. ❌ Use Read to read the transcript file
2. ❌ Use StrReplace to change the title
3. ❌ Use StrReplace to fix speaker names

### Available Protokoll Tools

Run `tools/list` to see all available Protokoll tools. They all start with `protokoll_`.

Key tools include:
- `protokoll_read_transcript` - Read transcript content
- `protokoll_list_transcripts` - List available transcripts
- `protokoll_edit_transcript` - Edit title, project, tags, or status (renames file when title changes)
- `protokoll_change_transcript_date` - Change transcript date (moves file to new date folder)
- `protokoll_provide_feedback` - Apply corrections using natural language feedback
- `protokoll_update_transcript_content` - Replace transcript body content
- `protokoll_create_note` - Create new transcript
- `protokoll_combine_transcripts` - Combine multiple transcripts

### Getting Help

If you're unsure which tool to use, check the tool descriptions with `tools/list` or ask the user for clarification.

Remember: **When in doubt, use Protokoll MCP tools, not direct file tools.**
