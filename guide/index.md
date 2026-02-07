# Protokoll AI Guide

This directory contains comprehensive documentation designed to help developers and AI assistants understand, integrate, debug, and extend Protokoll - an intelligent audio transcription system.

## What is Protokoll?

Protokoll transforms audio recordings into intelligent, context-enhanced transcriptions. It uses reasoning models to understand names, route notes to appropriate destinations, and build knowledge over time.

**Core Value**: Solves the "context problem" in transcription - when Whisper mishears "Priya" as "pre a", Protokoll recognizes and corrects it based on learned context.

## Guide Contents

### Getting Started
- [**Quick Start**](./quickstart.md): Get Protokoll working in 5 minutes
- [**Configuration**](./configuration.md): All configuration options
- [**Config Command**](./config.md): Interactive configuration editor

### Understanding Protokoll
- [**Architecture**](./architecture.md): System design and data flow
- [**Context System**](./context-system.md): How context storage works
- [**Context Commands**](./context-commands.md): CLI for managing entities
- [**Routing**](./routing.md): Intelligent note routing
- [**Reasoning**](./reasoning.md): Reasoning model integration
- [**Transcript Listing**](./transcript-listing.md): Browse, search, and filter transcripts
- [**Transcript Actions**](./action.md): Edit, combine, and manage transcripts
- [**Lifecycle & Tasks**](./lifecycle.md): Track transcript status and follow-up tasks
- [**Feedback**](./feedback.md): Intelligent feedback for corrections


### AI Integration
- [**MCP Integration**](./mcp-integration.md): Use Protokoll through AI assistants

### Development
- [**Development**](./development.md): Building and testing
- [**Interactive Mode**](./interactive.md): User interaction system

## Quick Reference

### Essential Commands

```bash
# Basic transcription (interactive and self-reflection enabled by default)
protokoll --input-directory ./recordings

# Disable interactive mode (for automation/cron)
protokoll --input-directory ./recordings --batch

# Disable self-reflection
protokoll --input-directory ./recordings --no-self-reflection

# Full debug mode
protokoll --input-directory ./recordings --debug --verbose
```

### Configuration Commands

```bash
# Interactive configuration editor
protokoll config

# List all settings
protokoll config --list

# View a specific setting
protokoll config model

# Set a specific value
protokoll config model gpt-4o-mini
protokoll config debug true
protokoll config outputDirectory ~/my-notes
```

### Context Management Commands

```bash
# List entities
protokoll project list
protokoll person list
protokoll term list
protokoll company list
protokoll ignored list

# Show entity details
protokoll project show <id>
protokoll person show <id>

# Add new entities (interactive)
protokoll project add
protokoll person add
protokoll term add
protokoll company add
protokoll ignored add

# Delete entities
protokoll project delete <id>
protokoll person delete <id> --force

# Context overview
protokoll context status
protokoll context search <query>
```

### Transcript Management

```bash
# List transcripts with search and filtering
protokoll transcript list <directory>
protokoll transcript list ~/notes --search "kubernetes"
protokoll transcript list ~/notes --start-date 2026-01-01 --limit 25

# Compare raw vs enhanced
protokoll transcript compare <file>

# Show transcript info
protokoll transcript info <file>
```

### Transcript Actions

```bash
# Edit a single transcript - change title
protokoll action --title "Time to Celebrate" /path/to/transcript.md

# Edit a single transcript - change project
protokoll action --project client-alpha /path/to/transcript.md

# Combine multiple transcripts (source files are auto-deleted)
protokoll action --title "Full Meeting Notes" --combine "/path/to/file1.md
/path/to/file2.md
/path/to/file3.md"

# Combine and change project
protokoll action --title "Sprint Planning" --project my-project --combine "/path/to/files..."

# Preview without making changes
protokoll action --title "New Title" /path/to/file.md --dry-run --verbose
```

### Lifecycle & Tasks

```bash
# Set transcript status
protokoll status set <path> <status>
protokoll status show <path>

# Manage tasks
protokoll task add <path> "<description>"
protokoll task complete <path> <task-id>
protokoll task delete <path> <task-id>
protokoll task list <path>
```

Valid statuses: `initial`, `enhanced`, `reviewed`, `in_progress`, `closed`, `archived`

### Feedback

```bash
# Provide feedback interactively
protokoll feedback /path/to/transcript.md

# Provide feedback directly
protokoll feedback /path/to/transcript.md -f "YB should be Wibey"

# Fix a name and add to context
protokoll feedback /path/to/transcript.md -f "San Jay Grouper is actually Sanjay Gupta"

# Change project assignment
protokoll feedback /path/to/transcript.md -f "This should be in the Quantum Readiness project"

# Preview changes
protokoll feedback /path/to/transcript.md -f "WCMP should be WCNP" --dry-run -v

# Get help on feedback options
protokoll feedback --help-me
```

### MCP / AI Integration

Instead of CLI commands, you can use natural language with an AI assistant:

```
"Can you transcribe ~/Downloads/meeting.m4a?"
"Add Sanjay Gupta as a person - Whisper mishears it as 'San Jay Grouper'"
"This transcript should be in the Quantum Readiness project"
"WCMP should be WCNP in this transcript"
```

See [MCP Integration Guide](./mcp-integration.md) for setup.

### Key Directories

```
~/.protokoll/              # Configuration
├── config.yaml            # Main config
├── people/                # People context
├── projects/              # Project context
├── companies/             # Company context
└── terms/                 # Terminology

./output/protokoll/        # Intermediate files
```

### Environment Variables

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

### System Requirements

- **Node.js 18+** and **npm 9+**
- **ffmpeg** for audio format conversion (install with `brew install ffmpeg`, `apt-get install ffmpeg`, or from [ffmpeg.org](https://ffmpeg.org))
- **OpenAI API key** (required for transcription)

## For AI Assistants

If you're an AI helping someone use Protokoll:

1. **Start with** [`quickstart.md`](./quickstart.md) for basics
2. **Read** [`architecture.md`](./architecture.md) for system understanding
3. **Reference** [`configuration.md`](./configuration.md) for settings
4. **Check** [`context-system.md`](./context-system.md) for knowledge base questions

## Key Capabilities

1. **Context-Aware Transcription**: Corrects names based on learned context
2. **Intelligent Routing**: Sends notes to right directories
3. **Interactive Learning**: Asks questions, remembers answers
4. **Self-Reflection**: Reports on tool effectiveness (enabled by default)
5. **Full Preservation**: Not a summarizer - keeps all content
6. **Smart Projects**: AI-assisted project configuration with phonetic variants
7. **Proactive Phonetic**: Integration with Observasjon for improved transcription accuracy

## Current Defaults

| Setting | Default Value |
|---------|---------------|
| Reasoning Model | `gpt-5.2` |
| Reasoning Level | `medium` |
| Transcription Model | `whisper-1` |
| Self-Reflection | `true` (enabled) |
| Interactive Mode | `true` (enabled, use `--batch` to disable) |
| Smart Projects | `true` (enabled) |
| Output Structure | `month` |

## Integration with Observasjon

Protokoll's project data is automatically used by [Observasjon](https://github.com/redaksjon/observasjon) to improve transcription accuracy through **Proactive Phonetic Enhancement**:

### How It Works

1. **You define projects in Protokoll** with names and phonetic variations:
   ```bash
   protokoll project add
   # Name: "Observasjon"
   # Sounds like: "observation", "observashun"
   ```

2. **Observasjon automatically detects your projects** from `~/.protokoll/context/projects/`

3. **Project names are sent during transcription** (not after) so Whisper gets them right from the start

4. **Results**: "Observasjon" transcribed correctly instead of "observation"

### Benefits

- **Better accuracy**: Project names spelled correctly in initial transcription
- **Lower cost**: Fix names during transcription, not in post-processing
- **No configuration**: Works automatically if you use both tools

### Smart Projects Feature

The Smart Projects feature (enabled by default) helps you configure projects with AI assistance:

```bash
# Interactive mode (review AI suggestions)
protokoll project add

# Non-interactive mode (trust AI suggestions)
protokoll project add --name "My Project" --yes

# AI automatically suggests:
# - Phonetic variations for the project name
# - Classification signals (trigger phrases)
# - Common mishearings to watch for
```

This makes it easy to set up proactive phonetic enhancement without manually thinking through all the ways Whisper might mishear your project names. Use `--yes` for automation or when you trust the AI completely.

