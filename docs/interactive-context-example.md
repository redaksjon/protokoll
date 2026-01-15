# Interactive Prompt Context Improvements

## Overview
When protokoll encounters an unknown person or project, it now provides rich context about the file being processed, making it easier to make informed decisions.

## Before (Old Output)
```
────────────────────────────────────────────────────────────
[Unknown Person Detected]
Name heard: "Trey Toulson"
Context: Name heard: "Trey Toulson"
────────────────────────────────────────────────────────────

Is the name spelled correctly? (Enter to accept, or type correction): 
```

**Problem:** No file context, duplicate information, unclear what recording this is from.

## After (New Output)
```
────────────────────────────────────────────────────────────
[Unknown Person Detected]
Name heard: "Trey Toulson"

File: meeting-notes-2026-01-15.m4a
Date: Wed, Jan 15, 2026, 07:10 AM

Unknown person mentioned: "Trey Toulson"

Context from transcript:
"I had a really productive meeting with Trey Toulson yesterday. 
He's the new VP of Engineering at Acme Corp and is interested 
in collaborating on the Phoenix Initiative."
────────────────────────────────────────────────────────────

Is the name spelled correctly? (Enter to accept, or type correction): 
```

**Benefits:**
- 📁 **File context:** See which recording this person was mentioned in
- 📅 **Date/time:** Know when the recording was made
- 📝 **Transcript excerpt:** See the sentences around where the name appears
- ✨ **Clear formatting:** Better visual hierarchy and no duplication

Now you can immediately see that Trey is the VP of Engineering at Acme Corp!

## Project/Term Detection

Similar improvements for unknown projects:

```
────────────────────────────────────────────────────────────
[Unknown Project/Term]
Term: "Phoenix Initiative"

File: status-update-2026-01-15.m4a
Date: Wed, Jan 15, 2026, 02:30 PM

Unknown project/term: "Phoenix Initiative"

Context from transcript:
"We're making great progress on the Phoenix Initiative. The team 
has completed the initial architecture design and we're ready to 
start implementation next week."
────────────────────────────────────────────────────────────

Is this a Project or a Term? (P/T, or Enter to skip):
```

You can immediately see this is an active project with progress updates!

## Implementation Details

The improvements were made to:
- `src/agentic/tools/lookup-person.ts` - Added file metadata and transcript context extraction
- `src/agentic/tools/lookup-project.ts` - Added file metadata and transcript context extraction
- `src/interactive/handler.ts` - Enhanced display formatting in wizard prompts

The `ToolContext` interface already provided:
- `sourceFile: string` - Full path to the audio file
- `audioDate: Date` - Recording creation date
- `transcriptText: string` - The full transcript being processed

### Transcript Context Extraction

The tools now include intelligent context extraction that:
1. **Finds the mention:** Searches for the name/term in the transcript (case-insensitive)
2. **Extracts surrounding text:** Captures approximately one sentence before and after
3. **Limits length:** Keeps context under ~300 characters to avoid overwhelming the prompt
4. **Handles edge cases:** Gracefully handles missing mentions or very long sentences

This gives you immediate understanding of who someone is or what a project involves, right from the prompt!
