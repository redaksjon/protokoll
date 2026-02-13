I want to review and improve the transcript: ${transcriptPath}

Focus area: ${focusArea}

## Instructions for AI Assistant

**CRITICAL: Use ONLY Protokoll MCP tools to modify transcripts. NEVER use StrReplace, Write, or direct file editing.**

### Step 1: Read the Transcript
First, call `protokoll_read_transcript` to see the current state:
- transcriptPath: "${transcriptPath}"

### Step 2: Make the Requested Changes

The user will tell you what to change. Use the appropriate tool:

**For title changes:**
Use `protokoll_edit_transcript`:
- transcriptPath: "${transcriptPath}"
- title: "New Title Here"

(This automatically renames the file to match the new title)

**For project assignment:**
Use `protokoll_edit_transcript`:
- transcriptPath: "${transcriptPath}"
- projectId: "project-id"

**For date changes:**
Use `protokoll_change_transcript_date`:
- transcriptPath: "${transcriptPath}"
- newDate: "2026-02-13T14:30:00Z"

**For tags:**
Use `protokoll_edit_transcript`:
- transcriptPath: "${transcriptPath}"
- tagsToAdd: ["tag1", "tag2"]
- tagsToRemove: ["tag3"]

**For status:**
Use `protokoll_edit_transcript`:
- transcriptPath: "${transcriptPath}"
- status: "reviewed"

**For content corrections (typos, names, terms):**
Use `protokoll_provide_feedback`:
- transcriptPath: "${transcriptPath}"
- feedback: "Description of corrections needed"

### Rules:
- ❌ NEVER use StrReplace, Write, or file editing tools on transcripts
- ✅ ALWAYS use the Protokoll MCP tools listed above
- ✅ Read the transcript first if you need to see the current state
- ✅ Make the changes immediately when the user requests them
- ✅ Keep responses brief - just make the change and confirm it's done
