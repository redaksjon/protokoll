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
- [**Transcript Actions**](./action.md): Post-processing commands (combine, etc.)
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

Instead of CLI commands, you can talk to an AI assistant:

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

## Current Defaults

| Setting | Default Value |
|---------|---------------|
| Reasoning Model | `gpt-5.2` |
| Reasoning Level | `medium` |
| Transcription Model | `whisper-1` |
| Self-Reflection | `true` (enabled) |
| Interactive Mode | `true` (enabled, use `--batch` to disable) |
| Output Structure | `month` |

