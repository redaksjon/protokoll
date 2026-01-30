# Protokoll MCP Server - Overview

## Introduction

Protokoll provides a comprehensive MCP (Model Context Protocol) server that enables AI assistants to intelligently process audio files, manage transcripts, and work with context entities. The server is designed to be intuitive, requiring minimal configuration and supporting natural interactions.

## Key Features

### 1. Workspace-Level Configuration

The MCP server uses workspace-level configuration, eliminating the need to pass directory paths to every tool:

- Configuration loaded once at startup from workspace root
- All tools share the same configuration
- No need to navigate directory trees
- Faster and more consistent

[Learn more →](./MCP_WORKSPACE_CONFIG.md)

### 2. Smart File Lookup

Tools support natural file references instead of requiring absolute paths:

- Use filenames: `"recording.m4a"`, `"meeting-notes.md"`
- Use partial names: `"2026-01-29"`, `"meeting"`
- Use absolute paths: `/full/path/to/file.md` (still supported)

The system automatically searches configured directories and finds the files you're looking for.

[Learn more →](./MCP_SMART_TRANSCRIPT_LOOKUP.md)

### 3. Comprehensive Resources

Resources provide discoverable, queryable access to:

- **Audio files** (inbound and processed)
- **Transcripts** (with filtering and pagination)
- **Context entities** (people, projects, terms, companies)
- **Configuration** (workspace settings)

Resources enable AI assistants to explore and understand what's available before taking action.

[Learn more →](./MCP_RESOURCES.md) | [Quick Start →](./MCP_RESOURCES_QUICK_START.md)

## Quick Start

### 1. Setup

Ensure you have a `.protokoll` directory in your workspace:

```bash
mkdir .protokoll
```

Create a `config.yaml`:

```yaml
inputDirectory: ./recordings
outputDirectory: ./notes
processedDirectory: ./processed
outputStructure: month
model: gpt-5.2
```

### 2. Start the MCP Server

The server is automatically started by MCP-compatible clients (Cursor, Claude Desktop, etc.) when configured in their settings.

### 3. Discover Available Data

```typescript
// List all available resources
const resources = await client.listResources();

// You'll see:
// - Inbound Audio Files (5 files)
// - Recent Transcripts (10 transcripts)
// - All Projects (3 projects)
// - All People (12 people)
// - etc.
```

### 4. Process Audio

```typescript
// Process by filename (no paths needed!)
const result = await client.callTool('protokoll_process_audio', {
  audioFile: 'recording.m4a'
});
```

### 5. Work with Transcripts

```typescript
// Read by filename
const transcript = await client.callTool('protokoll_read_transcript', {
  transcriptPath: 'meeting-notes'
});

// Edit by filename
await client.callTool('protokoll_edit_transcript', {
  transcriptPath: 'meeting-notes',
  title: 'Updated Meeting Notes'
});
```

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server                              │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │         Workspace Configuration                     │   │
│  │  - Loaded once at startup                          │   │
│  │  - Shared across all tools                         │   │
│  │  - Cached context instance                         │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Resources  │  │    Tools     │  │   Prompts    │   │
│  │              │  │              │  │              │   │
│  │ - Audio      │  │ - Audio      │  │ - Transcribe │   │
│  │ - Transcripts│  │ - Transcripts│  │ - Review     │   │
│  │ - Entities   │  │ - Entities   │  │ - Setup      │   │
│  │ - Config     │  │ - Discovery  │  │ - Analyze    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │         Smart File Lookup                           │   │
│  │  - Finds files by name or partial name             │   │
│  │  - Searches configured directories                 │   │
│  │  - Handles disambiguation                          │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Client starts server
   ↓
2. Server requests workspace roots
   ↓
3. Server loads configuration from workspace
   ↓
4. Server caches context and directories
   ↓
5. Tools use cached configuration
   ↓
6. Resources use cached configuration
```

## Tools

### Audio Processing

| Tool | Description |
|------|-------------|
| `protokoll_process_audio` | Process a single audio file |
| `protokoll_batch_process` | Process all audio in directory |

### Transcript Management

| Tool | Description |
|------|-------------|
| `protokoll_read_transcript` | Read and parse a transcript |
| `protokoll_list_transcripts` | List transcripts with filtering |
| `protokoll_edit_transcript` | Edit title or project assignment |
| `protokoll_combine_transcripts` | Combine multiple transcripts |
| `protokoll_provide_feedback` | Correct transcript with natural language |

### Context Management

| Tool | Description |
|------|-------------|
| `protokoll_add_person` | Add a person to context |
| `protokoll_add_project` | Add a project to context |
| `protokoll_add_term` | Add a term to context |
| `protokoll_add_company` | Add a company to context |
| `protokoll_edit_person` | Edit an existing person |
| `protokoll_edit_project` | Edit an existing project |
| `protokoll_edit_term` | Edit an existing term |
| `protokoll_list_people` | List all people |
| `protokoll_list_projects` | List all projects |
| `protokoll_list_terms` | List all terms |
| `protokoll_list_companies` | List all companies |
| `protokoll_search_context` | Search across all entities |
| `protokoll_get_entity` | Get detailed entity information |
| `protokoll_delete_entity` | Delete an entity |

### Discovery & Assistance

| Tool | Description |
|------|-------------|
| `protokoll_discover_config` | Discover available configurations |
| `protokoll_suggest_project` | Suggest which project an audio belongs to |
| `protokoll_suggest_project_metadata` | Generate project metadata suggestions |
| `protokoll_suggest_term_metadata` | Generate term metadata suggestions |
| `protokoll_context_status` | Get context system status |

### System

| Tool | Description |
|------|-------------|
| `protokoll_get_version` | Get Protokoll version information |

## Resources

### Audio Resources

| Resource | Description |
|----------|-------------|
| `protokoll://audio/inbound` | List audio files waiting to be processed |
| `protokoll://audio/processed` | List processed audio files |

### Transcript Resources

| Resource | Description |
|----------|-------------|
| `protokoll://transcript/{path}` | Read a specific transcript |
| `protokoll://transcripts?directory={dir}` | List transcripts with filtering |

### Entity Resources

| Resource | Description |
|----------|-------------|
| `protokoll://entity/{type}/{id}` | Read a specific entity |
| `protokoll://entities/{type}` | List all entities of a type |

### Configuration Resource

| Resource | Description |
|----------|-------------|
| `protokoll://config` | Get workspace configuration |

## Prompts

| Prompt | Description |
|--------|-------------|
| `transcribe_with_context` | Transcribe audio with context awareness |
| `review_transcript` | Review and improve a transcript |
| `setup_project` | Interactive project setup |
| `find_and_analyze` | Find and analyze transcripts |
| `enrich_entity` | Enrich entity metadata |
| `edit_entity` | Edit entity with guidance |
| `batch_transcription` | Batch process multiple audio files |

## Common Workflows

### Workflow 1: Process New Audio

```typescript
// 1. Check what's available
const audio = await client.readResource('protokoll://audio/inbound');
const files = JSON.parse(audio.text);

// 2. Process by filename
const result = await client.callTool('protokoll_process_audio', {
  audioFile: files.files[0].filename
});

// 3. Read the transcript
const transcript = await client.callTool('protokoll_read_transcript', {
  transcriptPath: result.outputPath
});
```

### Workflow 2: Batch Process Everything

```typescript
// Process all audio in the input directory
const result = await client.callTool('protokoll_batch_process', {});

console.log(`Processed ${result.processed.length} files`);
console.log(`Errors: ${result.errors.length}`);
```

### Workflow 3: Review and Correct

```typescript
// 1. List recent transcripts
const list = await client.callTool('protokoll_list_transcripts', {
  limit: 5
});

// 2. Read the latest
const transcript = await client.callTool('protokoll_read_transcript', {
  transcriptPath: list.transcripts[0].filename
});

// 3. Provide feedback
await client.callTool('protokoll_provide_feedback', {
  transcriptPath: list.transcripts[0].filename,
  feedback: 'Change "John" to "Jon" throughout'
});
```

### Workflow 4: Explore Context

```typescript
// 1. Get configuration
const config = await client.readResource('protokoll://config');
const settings = JSON.parse(config.text);

// 2. List projects
const projects = await client.readResource('protokoll://entities/project');
const projectList = JSON.parse(projects.text);

// 3. Read project details
const project = await client.readResource(projectList.entities[0].uri);
console.log(project.text); // YAML format
```

## Configuration Reference

### Minimal Configuration

```yaml
# .protokoll/config.yaml
inputDirectory: ./recordings
outputDirectory: ./notes
```

### Full Configuration

```yaml
# .protokoll/config.yaml
inputDirectory: ./recordings
outputDirectory: ./notes
processedDirectory: ./processed
outputStructure: month  # none, year, month, day
outputFilenameOptions:
  - date
  - time
  - subject

model: gpt-5.2
transcriptionModel: whisper-1
reasoningLevel: medium

smartAssistance:
  enabled: true
  phoneticModel: gpt-5-nano
  analysisModel: gpt-5-mini
  soundsLikeOnAdd: true
  triggerPhrasesOnAdd: true
  promptForSource: true
  termsEnabled: true
  termSoundsLikeOnAdd: true
  termDescriptionOnAdd: true
  termTopicsOnAdd: true
  termProjectSuggestions: true
```

## Best Practices

### 1. Use Resources for Discovery

Always start by listing resources to see what's available:

```typescript
const resources = await client.listResources();
```

### 2. Use Smart Lookup

Prefer filenames over absolute paths:

```typescript
// Good ✅
audioFile: 'recording.m4a'

// Less ideal (but still works)
audioFile: '/full/path/to/recording.m4a'
```

### 3. Handle Ambiguity

If you get "multiple matches" errors, be more specific:

```typescript
// Too vague
audioFile: 'recording'

// Better
audioFile: '2026-01-29-recording'
```

### 4. Use Batch Processing

For multiple files, use batch processing:

```typescript
// Process everything
await client.callTool('protokoll_batch_process', {});
```

### 5. Leverage Context

Use context entities to improve transcription quality:

```typescript
// Add people before transcribing
await client.callTool('protokoll_add_person', {
  name: 'John Smith',
  sounds_like: ['jon smith', 'john smyth']
});

// Then transcribe
await client.callTool('protokoll_process_audio', {
  audioFile: 'meeting.m4a'
});
```

## Troubleshooting

### Configuration Not Found

**Error**: `Protokoll context not available`

**Solution**: Create `.protokoll/config.yaml` in your workspace root.

### File Not Found

**Error**: `No audio file found matching "xyz"`

**Solution**: Use the `protokoll://audio/inbound` resource to see available files.

### Multiple Matches

**Error**: `Multiple files match "xyz"`

**Solution**: Be more specific with your filename (include date, time, or more keywords).

## Documentation Index

- **[Workspace Configuration](./MCP_WORKSPACE_CONFIG.md)** - How workspace-level config works
- **[Smart File Lookup](./MCP_SMART_TRANSCRIPT_LOOKUP.md)** - Using filenames instead of paths
- **[Resources](./MCP_RESOURCES.md)** - Complete resource documentation
- **[Resources Quick Start](./MCP_RESOURCES_QUICK_START.md)** - Quick reference for resources
- **[Resources Implementation](./MCP_RESOURCES_IMPLEMENTATION.md)** - Technical implementation details

## Getting Help

### Check Configuration

```typescript
const config = await client.readResource('protokoll://config');
console.log(JSON.parse(config.text));
```

### List Available Files

```typescript
// Audio files
const audio = await client.readResource('protokoll://audio/inbound');

// Transcripts
const transcripts = await client.callTool('protokoll_list_transcripts', {});
```

### Check Context Status

```typescript
const status = await client.callTool('protokoll_context_status', {});
```

## Version Information

This documentation is for Protokoll MCP Server v0.1.0+

For the latest updates, see the [Protokoll repository](https://github.com/redaksjon/protokoll).
