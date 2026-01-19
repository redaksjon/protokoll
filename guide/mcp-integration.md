# MCP Integration Guide

Protokoll exposes its capabilities as an MCP (Model Context Protocol) server, allowing AI assistants to directly transcribe audio, manage context, and work with transcripts through natural conversation.

## Why MCP?

Traditional CLI usage requires you to:
1. Open a terminal
2. Navigate to the right directory  
3. Remember command syntax
4. Run commands manually

With MCP, you can use natural language:
- "Can you transcribe this recording?"
- "Add Sanjay Gupta as a person - Whisper keeps mishearing it as 'San Jay Grouper'"
- "This transcript should be in the Quantum Readiness project"

The AI assistant handles all the details.

## Setup

### 1. Install Protokoll

```bash
npm install -g @redaksjon/protokoll
```

### 2. Configure Your AI Assistant

Add the Protokoll MCP server to your AI tool's configuration.

**For Cursor (Claude)**

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "protokoll": {
      "command": "protokoll-mcp"
    }
  }
}
```

**For Claude Desktop**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on your platform:

```json
{
  "mcpServers": {
    "protokoll": {
      "command": "protokoll-mcp"
    }
  }
}
```

### 3. Set Environment Variables

The MCP server needs API keys to function:

```bash
export OPENAI_API_KEY="sk-..."        # Required for transcription & enhancement
export ANTHROPIC_API_KEY="sk-ant-..." # Optional, for Claude-based enhancement
```

## Project-Aware Configuration

**Important**: Protokoll supports multiple project configurations. When you have different `.protokoll` directories for different projects, the MCP server needs to know which configuration to use.

### How Configuration Discovery Works

When you ask to transcribe a file, the MCP server:

1. **Walks up the directory tree** from the audio file's location
2. **Finds all `.protokoll` directories** in the hierarchy
3. **Analyzes projects** to suggest which one the file belongs to
4. **Asks for clarification** if there's ambiguity

### Example Scenarios

**Scenario 1: File in a Project Directory**

```
~/projects/
├── client-alpha/
│   ├── .protokoll/           # Client Alpha's config
│   │   ├── config.yaml
│   │   ├── people/
│   │   └── projects/
│   └── recordings/
│       └── meeting.m4a       # ← You ask to transcribe this
```

The AI will automatically use `client-alpha/.protokoll` configuration.

**Scenario 2: Ambiguous Location**

```
~/Documents/
├── .protokoll/               # Global config with multiple projects
│   ├── projects/
│   │   ├── client-alpha.yaml
│   │   └── internal-notes.yaml
│   └── ...
└── Downloads/
    └── recording.m4a         # ← Where does this go?
```

The AI will ask: *I found 2 projects in your configuration. Which project is this recording for?*

**Scenario 3: No Configuration Found**

If no `.protokoll` directory exists in the hierarchy, the AI will:
1. Explain that no configuration was found
2. Offer to help you set one up
3. Process with defaults if you prefer

## Available MCP Tools

### Discovery Tools

| Tool | Description |
|------|-------------|
| `protokoll_discover_config` | Find and analyze .protokoll configurations |
| `protokoll_suggest_project` | Determine which project a file belongs to |

### Transcription Tools

| Tool | Description |
|------|-------------|
| `protokoll_process_audio` | Process a single audio file |
| `protokoll_batch_process` | Process all audio files in a directory |

### Context Management Tools

| Tool | Description |
|------|-------------|
| `protokoll_context_status` | Get overview of context (projects, people, terms) |
| `protokoll_list_projects` | List all configured projects |
| `protokoll_list_people` | List all people in context |
| `protokoll_list_terms` | List all technical terms |
| `protokoll_list_companies` | List all companies |
| `protokoll_search_context` | Search across all context types |
| `protokoll_get_entity` | Get details of a specific entity |

### Entity Management Tools

| Tool | Description |
|------|-------------|
| `protokoll_add_person` | Add a new person to context |
| `protokoll_add_project` | Add a new project with smart assistance |
| `protokoll_add_term` | Add a technical term with smart assistance |
| `protokoll_add_company` | Add a company |
| `protokoll_delete_entity` | Remove an entity |

### Entity Editing Tools

| Tool | Description |
|------|-------------|
| `protokoll_edit_person` | Edit person: add sounds_like variants, change role/company, etc. |
| `protokoll_edit_term` | Edit term: add sounds_like variants, topics, projects, domain, etc. |
| `protokoll_edit_project` | Edit project: add sounds_like variants, phrases, routing config, etc. |
| `protokoll_update_term` | Regenerate term metadata from source URL/file (uses LLM) |
| `protokoll_update_project` | Regenerate project metadata from source URL/file (uses LLM) |
| `protokoll_merge_terms` | Merge duplicate terms into one |
| `protokoll_suggest_project_metadata` | Generate project suggestions without creating |
| `protokoll_suggest_term_metadata` | Generate term suggestions without creating |

### Transcript Tools

| Tool | Description |
|------|-------------|
| `protokoll_list_transcripts` | List/search transcripts with pagination and filtering |
| `protokoll_read_transcript` | Read a transcript and parse its metadata |
| `protokoll_edit_transcript` | Change transcript title or project |
| `protokoll_combine_transcripts` | Merge multiple transcripts |
| `protokoll_provide_feedback` | Correct transcription errors |

#### protokoll_list_transcripts

Browse and search your transcript library with pagination, sorting, and filtering.

**Parameters:**
- `directory` (required): Directory to search (recursive)
- `limit` (optional): Max results to return (default: 50)
- `offset` (optional): Skip N results for pagination (default: 0)
- `sortBy` (optional): Sort by "date" (default), "filename", or "title"
- `startDate` (optional): Filter from date (YYYY-MM-DD)
- `endDate` (optional): Filter to date (YYYY-MM-DD)
- `search` (optional): Search text in filename and content

**Returns:**
- `transcripts[]`: Array of transcript items with:
  - `path`: Full file path
  - `filename`: File name
  - `date`: Date from filename (YYYY-MM-DD)
  - `time`: Time from filename if present (HH:MM)
  - `title`: Extracted from `# heading`
  - `hasRawTranscript`: Whether raw Whisper output exists
- `pagination`: Total count, limit, offset, hasMore, nextOffset
- `filters`: Applied filters

**Example:**
```typescript
// List recent transcripts
const result = await use_mcp_tool('protokoll_list_transcripts', {
  directory: '/Users/me/notes',
  limit: 10
});

// Search for specific content
const meetings = await use_mcp_tool('protokoll_list_transcripts', {
  directory: '/Users/me/notes',
  search: 'kubernetes deployment',
  startDate: '2026-01-01'
});
```

## Example Conversations

### Basic Transcription

**User**: Can you transcribe the meeting recording at ~/Downloads/standup.m4a?

**AI**: *Calls `protokoll_discover_config` to find configuration*
*Calls `protokoll_suggest_project` to determine project*

I found your Protokoll configuration at `~/.protokoll`. You have 3 projects configured. Based on the file location, I'm not sure which project this belongs to. Is this for:
1. Client Alpha
2. Internal Notes  
3. Personal

**User**: It's for Client Alpha

**AI**: *Calls `protokoll_process_audio` with projectId: "client-alpha"*

Done! I've transcribed the standup recording. The transcript is saved at `~/notes/client-alpha/2026-01/standup-a3f2b1c8.md`. 

Key highlights:
- Discussed sprint progress with Sarah and Marcus
- Mentioned the API integration deadline
- Applied 4 name corrections using your context

Would you like me to make any changes to the transcript?

### Adding Context

**User**: Whisper keeps mishearing 'Priya Sharma' as 'pre a Sharma'. Can you add her to my context?

**AI**: *Calls `protokoll_add_person`*

I've added Priya Sharma to your context with the phonetic variant 'pre a'. Future transcripts will automatically correct this. Would you like to add any other information about Priya (role, company, etc.)?

### Providing Feedback

**User**: In the transcript at ~/notes/meeting.md, 'WCMP' should be 'WCNP' and this should be in the Infrastructure project

**AI**: *Calls `protokoll_provide_feedback`*

I've made the corrections:
1. Changed 'WCMP' to 'WCNP' (2 occurrences)
2. Moved the transcript to the Infrastructure project at `~/notes/infrastructure/meeting.md`

I also noticed 'WCNP' isn't in your terms. Would you like me to add it so future transcripts get it right?

### Combining Transcripts

**User**: Can you combine all the meeting parts in ~/notes/client-alpha/2026-01/ into a single transcript?

**AI**: *Lists files, then calls `protokoll_combine_transcripts`*

I found 3 meeting parts. Combined them into 'Full Meeting Notes' at `~/notes/client-alpha/2026-01/full-meeting-notes.md`. The original part files have been removed.

### Editing Entities

**User**: I need to add "Cartesian Time" as a sounds_like variant for the "cardigantime" term

**AI**: *Uses the edit_entity prompt or calls `protokoll_edit_term` directly*

I'll add that sounds_like variant for you.

*Calls `protokoll_edit_term` with:*
- id: "cardigantime"
- add_sounds_like: ["Cartesian Time"]

Done! I've added "Cartesian Time" as a phonetic variant for "cardigantime". Future transcripts will recognize this variant and correct it automatically.

**User**: Can you also change Priya's company to "new-corp"?

**AI**: *Calls `protokoll_edit_person`*

Updated Priya's company from "acme-corp" to "new-corp".

## Best Practices

### 1. Set Up Project Configurations

Create `.protokoll` directories at appropriate levels:

```
~/work/
├── .protokoll/              # Shared work context (common terms, companies)
│   ├── config.yaml
│   ├── terms/               # Industry terminology
│   └── companies/           # All clients
│
├── client-alpha/
│   └── .protokoll/          # Client-specific context
│       ├── people/          # Client Alpha contacts
│       └── projects/        # Client Alpha projects
│
└── client-beta/
    └── .protokoll/          # Client Beta context
```

### 2. Use Project Routing

Configure projects with destinations so transcripts automatically land in the right place:

```yaml
# .protokoll/projects/client-alpha.yaml
id: client-alpha
name: Client Alpha
routing:
  destination: ~/notes/client-alpha
classification:
  explicit_phrases:
    - "alpha"
    - "Project Alpha"
```

### 3. Build Context Incrementally

When the AI asks about corrections:
- Accept suggestions to add names to people context
- Accept suggestions to add terms
- This improves future transcriptions automatically

### 4. Use Feedback for Corrections

Instead of manually editing transcripts:
- Tell the AI what's wrong in natural language
- It will fix the transcript AND update context to prevent future errors

## Troubleshooting

### "No configuration found"

Create a `.protokoll` directory:
```bash
mkdir ~/.protokoll
protokoll config  # Interactive setup
```

Or ask the AI to help set one up.

### "Multiple projects - which one?"

This is expected behavior. The AI needs clarification when:
- File location doesn't clearly belong to one project
- Multiple projects could apply

Simply specify which project to use.

### "API key not set"

Ensure your shell exports the necessary keys:
```bash
export OPENAI_API_KEY="sk-..."
```

The MCP server inherits environment from how it was launched.

### Slow First Transcription

The first transcription may be slower because:
1. Whisper model loads
2. Context files are parsed
3. LLM connections initialize

Subsequent transcriptions are faster.

## Advanced: Multiple Workspaces

If you work across completely separate contexts (e.g., work vs personal), you have options:

### Option A: Nested Configurations

```
~/.protokoll/                # Base config (shared terms)
~/work/.protokoll/           # Work overlay
~/personal/.protokoll/       # Personal overlay
```

The nearest `.protokoll` takes precedence.

### Option B: Environment-Based Switching

```bash
# Work profile
export PROTOKOLL_CONFIG=~/.protokoll-work

# Personal profile  
export PROTOKOLL_CONFIG=~/.protokoll-personal
```

## See Also

- [Configuration](./configuration.md) - All configuration options
- [Context System](./context-system.md) - How context storage works
- [Routing](./routing.md) - Project routing configuration
- [Feedback](./feedback.md) - How feedback corrections work
