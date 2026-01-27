# Review and Improve Transcript

I want to review and improve the transcript at: ${transcriptPath}

I'll help you review "${transcriptPath}".

**Focus areas:**
- ${focusArea}

## CRITICAL: Use ONLY Protokoll MCP Tools to Alter Transcripts

**YOU MUST use Protokoll MCP tools to make ANY changes to the transcript. NEVER directly edit transcript files.**

You are free to use other tools for research, web searches, or gathering context to inform your suggestions. However, when it comes time to actually modify the transcript file itself, you MUST route all changes through Protokoll MCP tools.

### For Content Corrections (typos, names, terms):
1. Call `protokoll_feedback_analyze` to analyze the transcript
2. Review suggested corrections
3. Apply corrections using `protokoll_feedback_apply`

### For Title Changes:
- **DO NOT** edit the file directly to change the title
- **DO** use `protokoll_transcript_rename` to change both the filename and title together
- This ensures the file is properly renamed and the title metadata is updated

### For Metadata Changes (Project, Time, etc.):
- **DO NOT** edit the file directly
- **DO** use `protokoll_transcript_update` to update metadata fields

### What NOT to Do:
❌ Do NOT use StrReplace, Write, or any file editing tools to modify the transcript
❌ Do NOT directly edit the transcript markdown file
❌ Do NOT bypass Protokoll tools when changing the transcript

### What TO Do:
✅ Use any tools needed for research, web searches, or gathering context
✅ Always use `protokoll_feedback_analyze` to review transcript content
✅ Always use `protokoll_feedback_apply` to apply content corrections to the transcript
✅ Always use `protokoll_transcript_rename` to change the transcript title/filename
✅ Always use `protokoll_transcript_update` to change transcript metadata
