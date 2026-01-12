# Protokoll: Intelligent Audio Transcription

## Overview

Protokoll is an intelligent audio transcription system that uses reasoning models to create highly accurate, context-enhanced transcripts. Unlike basic transcription tools, Protokoll:

- **Learns your vocabulary**: Recognizes and correctly spells names, projects, and organizations
- **Routes intelligently**: Sends notes to the right directories based on content
- **Preserves full content**: Cleans up transcripts without summarizing
- **Improves over time**: Builds context that makes future transcriptions more accurate

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Command Line Options](#command-line-options)
- [Key Features](#key-features)
- [Context System](#context-system)
- [Routing System](#routing-system)
- [Interactive Mode](#interactive-mode)
- [Self-Reflection Reports](#self-reflection-reports)
- [Output Structure](#output-structure)
- [Supported Models](#supported-models)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)

## Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Version 8 or higher
- **API Key**: OpenAI API key (required for transcription and reasoning)
  - Optionally: Anthropic API key for Claude models

### Getting an API Key

1. **OpenAI**: Sign up at [platform.openai.com](https://platform.openai.com) and create an API key
2. **Anthropic** (optional): Sign up at [console.anthropic.com](https://console.anthropic.com) for Claude models

## Installation

### From npm (Recommended)

```bash
npm install -g @redaksjon/protokoll
```

### From Source

```bash
git clone https://github.com/tobrien/redaksjon-protokoll.git
cd protokoll
npm install
npm run build
npm link
```

### Verify Installation

```bash
protokoll --version
```

## Getting Started

### Step 1: Set Up Environment

Create a `.env` file in your project directory or set environment variables:

```bash
# Required for transcription
export OPENAI_API_KEY='sk-your-openai-key'

# Optional: For Claude reasoning models
export ANTHROPIC_API_KEY='sk-ant-your-anthropic-key'
```

Or create `~/.env` or `.env` in your working directory:

```env
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
```

### Step 2: First Run (Zero-Config Start)

Protokoll works out of the box with sensible defaults:

```bash
# Transcribe all audio files in a directory
protokoll --input-directory ~/recordings
```

On first run with `--interactive`, Protokoll will guide you through initial setup:

```bash
protokoll --input-directory ~/recordings --interactive
```

### Step 3: Create Your First Context (Optional)

Create a `.protokoll` directory to store context:

```bash
mkdir -p ~/.protokoll/people
mkdir -p ~/.protokoll/projects
mkdir -p ~/.protokoll/companies
mkdir -p ~/.protokoll/terms
```

Add a person:

```bash
cat > ~/.protokoll/people/john-smith.yaml << EOF
id: john-smith
name: John Smith
firstName: John
lastName: Smith
company: acme-corp
role: Product Manager
sounds_like:
  - "john"
  - "jon smith"
context: "Colleague from product team"
EOF
```

### Step 4: Transcribe with Context

Now when you transcribe, Protokoll will recognize "john" or "jon smith" and correct it:

```bash
protokoll --input-directory ~/recordings --verbose
```

## Configuration

Protokoll uses hierarchical configuration discovery. It walks up the directory tree looking for `.protokoll/` directories, merging configs with local taking precedence.

### Configuration File Location

- **Global**: `~/.protokoll/config.yaml`
- **Project-specific**: `./protokoll/config.yaml` (in any parent directory)

### Full Configuration Example

Create `~/.protokoll/config.yaml`:

```yaml
# Model settings
model: "gpt-5.2"               # Reasoning model (default with high reasoning)
transcriptionModel: "whisper-1" # Transcription model

# Feature flags
interactive: false              # Enable by default?
selfReflection: false          # Generate reports by default?
debug: false                   # Debug mode

# Output settings
output:
  intermediateDir: "./output/protokoll"
  keepIntermediates: true
  timestampFormat: "YYMMDD-HHmm"

# Default routing
routing:
  default:
    path: "~/notes"
    structure: "month"          # none, year, month, or day
    filename_options:
      - date
      - time
      - subject
  
  conflict_resolution: "primary"  # ask, primary, or all
  
  projects:
    - projectId: "work"
      destination:
        path: "~/work/notes"
        structure: "month"
        filename_options:
          - date
          - subject
      classification:
        context_type: "work"
        explicit_phrases:
          - "work note"
          - "this is about work"
        associated_people:
          - "john-smith"
      active: true
```

### Directory Structure Options

Protokoll uses Dreadcabinet patterns for organizing output:

| Structure | Example Path |
|-----------|--------------|
| `none` | `~/notes/transcript.md` |
| `year` | `~/notes/2026/transcript.md` |
| `month` | `~/notes/2026/01/transcript.md` |
| `day` | `~/notes/2026/01/11/transcript.md` |

### Filename Options

Control what's included in output filenames:

| Option | Example |
|--------|---------|
| `date` | `260111` (YYMMDD) |
| `time` | `1430` (HHmm) |
| `subject` | `meeting-notes` |

Combined example: `260111-1430-meeting-notes.md`

## Command Line Options

### Basic Options

| Option | Description | Default |
|--------|-------------|---------|
| `--input-directory <dir>` | Directory with audio files | Required |
| `--output-directory <dir>` | Default output directory | `~/notes` |
| `--model <model>` | Reasoning model | `gpt-5.2` |
| `--transcription-model <model>` | Whisper model | `whisper-1` |

### Mode Options

| Option | Description |
|--------|-------------|
| `--interactive` | Enable interactive clarifications |
| `--batch` | Disable interactivity (batch processing) |
| `--self-reflection` | Generate reflection reports |
| `--dry-run` | Show what would happen |
| `--verbose` | Enable verbose logging |
| `--debug` | Enable debug mode with intermediate files |

### Advanced Options

| Option | Description | Default |
|--------|-------------|---------|
| `--context-directory <dir>` | Context storage location | `~/.protokoll` |
| `--intermediate-dir <dir>` | Intermediate file storage | `./output/protokoll` |
| `--recursive` | Process subdirectories | `false` |
| `--max-audio-size <bytes>` | Max file size before splitting | `25MB` |
| `--temp-directory <dir>` | Temp files for audio splitting | System temp |

## Key Features

### Intelligent Name Recognition

Protokoll maintains a knowledge base of people, companies, and projects you frequently mention. When Whisper mishears "Priya" as "pre a", Protokoll recognizes and corrects it using:

- **Exact matching**: Direct name lookup
- **Phonetic matching**: `sounds_like` variants
- **Context awareness**: Associated companies and projects

### Smart Routing

Configure different destinations for different projects based on:

- **Explicit phrases**: "This is a work note"
- **Associated people**: Notes mentioning John go to work folder
- **Associated companies**: Client mentions route to client folder
- **Topic detection**: Keywords trigger specific routing

### Full Content Preservation

This is **NOT** a summarizer. Protokoll preserves everything you say while:

- Cleaning up filler words ("um", "uh", "like")
- Removing false starts
- Fixing obvious transcription errors
- Maintaining speaker intent

### Interactive Learning

Run in interactive mode to teach Protokoll about new names and projects:

```bash
protokoll --input-directory ~/recordings --interactive
```

### Self-Reflection

Generate detailed reports showing transcription quality:

```bash
protokoll --input-directory ~/recordings --self-reflection
```

## Context System

Protokoll uses a hierarchical context system that walks up the directory tree looking for `.protokoll/` directories.

### Hierarchy Example

```
~/
├── .protokoll/           # Global context
│   ├── config.yaml
│   ├── people/
│   └── companies/
└── projects/
    └── client-work/
        └── .protokoll/   # Project-specific context (overrides global)
            ├── config.yaml
            ├── people/
            └── terms/
```

### Context Types

#### People

```yaml
# ~/.protokoll/people/priya-sharma.yaml
id: priya-sharma
name: Priya Sharma
firstName: Priya
lastName: Sharma
company: acme-corp
role: Engineering Manager
sounds_like:
  - "pre a"
  - "pria"
  - "pria shar ma"
context: "Colleague from engineering team"
```

#### Projects

```yaml
# ~/.protokoll/projects/quarterly-planning.yaml
id: quarterly-planning
name: Quarterly Planning
category: work
destination: "~/work/planning/notes"
structure: "month"
triggers:
  - "quarterly planning"
  - "Q1 planning"
  - "roadmap review"
active: true
```

#### Companies

```yaml
# ~/.protokoll/companies/acme-corp.yaml
id: acme-corp
name: Acme Corporation
sounds_like:
  - "acme"
  - "acme corp"
  - "a c m e"
context: "Primary client"
```

#### Terms

```yaml
# ~/.protokoll/terms/kubernetes.yaml
id: kubernetes
term: Kubernetes
sounds_like:
  - "kube"
  - "k8s"
  - "kubernetes"
  - "cube er net ease"
context: "Container orchestration platform"
```

## Routing System

### Multi-Signal Classification

Protokoll uses multiple signals to determine where notes should go:

1. **Explicit phrases** (highest weight): "This is a work note"
2. **Associated people**: Mentions of specific people
3. **Associated companies**: Company name detection
4. **Topic keywords**: Domain-specific terms
5. **Context type**: work vs personal vs mixed

### Confidence Scoring

Each signal contributes to a confidence score. Notes route to the project with highest confidence above threshold (default: 0.5).

### Conflict Resolution

When multiple projects match:

| Mode | Behavior |
|------|----------|
| `ask` | Prompt user to choose (interactive only) |
| `primary` | Use highest confidence match |
| `all` | Copy to all matching destinations |

## Interactive Mode

When you run with `--interactive`, Protokoll will stop and ask questions:

```
Name Clarification Needed

Context: "...meeting with pre a about..."
Detected: "pre a"
Suggested: "Priya"

? Enter correct spelling: Priya Sharma
? Remember this for future? Yes

New Person Detected

? Company (optional): Acme Corp
? Role (optional): Engineering Manager
? Add to context? Yes
```

### First-Run Onboarding

On first run with `--interactive` and no existing config:

```
Welcome to Protokoll!

? Where should notes go by default? ~/notes
? How should notes be organized? month
? Do you have a specific project to set up? Yes
? Project name: Work Notes
? Project destination: ~/work/notes
? Trigger phrases (comma-separated): work note, about work

Configuration saved to ~/.protokoll/config.yaml
```

## Self-Reflection Reports

Enable with `--self-reflection` to generate detailed reports:

```markdown
# Protokoll - Self-Reflection Report

## Summary
- Audio File: meeting-recording.m4a
- Duration: 8.3s
- Iterations: 12
- Tool Calls: 7
- Confidence: 92.5%

## Tool Effectiveness
| Tool | Calls | Success Rate |
|------|-------|--------------|
| lookup_person | 3 | 100% |
| lookup_project | 2 | 100% |
| route_note | 1 | 100% |
| verify_spelling | 1 | 100% |

## Quality Assessment
- Names resolved: 3/3 (100%)
- Routing confidence: 95%
- Overall quality: HIGH

## Recommendations
- Consider adding phonetic variants for "kubernetes"
- Add context for frequently mentioned "Project X"
```

## Output Structure

### Default Output

```
~/notes/
└── 2026/
    └── 01/
        └── 260111-1430-meeting-notes.md
```

### Debug Mode Output

With `--debug`, intermediate files are preserved:

```
./output/protokoll/
├── 260111-1430-meeting-notes/
│   ├── raw-transcript.json        # Whisper output
│   ├── reasoning-request.json     # LLM request
│   ├── reasoning-response.json    # LLM response
│   ├── reflection-report.md       # Self-reflection
│   └── session.json               # Interactive session log
```

## Supported Models

### Reasoning Models

| Model | Provider | Notes |
|-------|----------|-------|
| `gpt-5.2` | OpenAI | **Default** - High reasoning, best quality |
| `gpt-5.1` | OpenAI | High reasoning, balanced |
| `gpt-5` | OpenAI | Fast and capable |
| `gpt-4o` | OpenAI | Previous gen, still capable |
| `gpt-4o-mini` | OpenAI | Fast, lower cost |
| `gpt-5` | OpenAI | Latest generation |
| `o1` | OpenAI | Reasoning-focused |
| `o1-mini` | OpenAI | Faster reasoning |
| `claude-3-5-sonnet` | Anthropic | Recommended for quality |
| `claude-3-opus` | Anthropic | Highest capability |

### Transcription Models

| Model | Notes |
|-------|-------|
| `whisper-1` | Default, reliable |
| `gpt-4o-transcribe` | Newer, supports prompting |

> **Note**: Protokoll accepts any model string without restrictions. Model validation happens at the API level, ensuring future compatibility.

## Troubleshooting

### Common Issues

#### "OPENAI_API_KEY not set"

```bash
# Set in environment
export OPENAI_API_KEY='sk-your-key'

# Or create .env file
echo "OPENAI_API_KEY=sk-your-key" > .env
```

#### "Audio file too large"

Files over 25MB are automatically split. If splitting fails:

```bash
# Increase limit or use smaller files
protokoll --max-audio-size 50000000 --input-directory ~/recordings
```

#### "No .protokoll directory found"

Run with `--interactive` for first-run setup, or create manually:

```bash
mkdir -p ~/.protokoll/{people,projects,companies,terms}
```

#### "Rate limit exceeded"

Add delays between files or use batch mode with fewer concurrent requests.

#### "Name not recognized"

Add to context with `sounds_like` variants:

```yaml
sounds_like:
  - "exactly as whisper hears it"
  - "another variant"
```

### Debug Mode

Run with `--debug` to see all intermediate files:

```bash
protokoll --input-directory ~/recordings --debug --verbose
```

Check `./output/protokoll/` for:
- Raw transcripts
- LLM requests/responses
- Routing decisions

## Architecture

Protokoll is built with a modular architecture designed for extensibility:

```
┌─────────────────────────────────────────────────────────────┐
│                     Pipeline Orchestrator                    │
├─────────────┬─────────────┬─────────────┬─────────────┬─────┤
│   Context   │   Routing   │ Transcription│  Reasoning  │Tools│
│   System    │   System    │   Service   │ Integration │     │
├─────────────┼─────────────┼─────────────┼─────────────┼─────┤
│ Interactive │   Output    │ Self-       │             │     │
│    Mode     │  Manager    │ Reflection  │             │     │
└─────────────┴─────────────┴─────────────┴─────────────┴─────┘
```

### Core Modules

| Module | Purpose |
|--------|---------|
| **Context System** | Hierarchical config discovery (Cardigantime patterns) |
| **Routing System** | Multi-signal classification (Dreadcabinet structures) |
| **Transcription Service** | OpenAI Whisper integration |
| **Reasoning Integration** | LLM-powered enhancement |
| **Agentic Tools** | Context lookup, routing, verification |
| **Interactive Mode** | Session management, onboarding |
| **Output Manager** | Intermediate files (kodrdriv patterns) |
| **Self-Reflection** | Quality assessment, recommendations |
| **Pipeline** | Orchestrates all modules |

## Examples

### Basic Transcription

```bash
protokoll --input-directory ~/recordings
```

### Project-Specific Notes

```bash
protokoll --input-directory ~/recordings \
  --output-directory ~/work/notes \
  --model gpt-5.2
```

### Full Interactive Session

```bash
protokoll --input-directory ~/recordings \
  --interactive \
  --self-reflection \
  --verbose
```

### Batch Processing

```bash
protokoll --input-directory ~/inbox \
  --batch \
  --recursive
```

### Debug Mode

```bash
protokoll --input-directory ~/recordings \
  --debug \
  --verbose \
  --self-reflection
```

## License

Apache-2.0

## Author

Tim O'Brien <tobrien@discursive.com>
