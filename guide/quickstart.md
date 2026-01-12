# Quick Start Guide

Get Protokoll working in 5 minutes.

## Prerequisites

- Node.js 18+
- OpenAI or Anthropic API key
- Audio files to transcribe

## Installation

```bash
npm install -g @redaksjon/protokoll
```

Or from source:

```bash
git clone https://github.com/tobrien/redaksjon-protokoll.git
cd protokoll
npm install
npm run build
npm link
```

## Setup

### 1. Set API Key

```bash
export OPENAI_API_KEY='sk-...'
# or
export ANTHROPIC_API_KEY='sk-ant-...'
```

### 2. Create Config (optional)

```bash
mkdir -p ~/.protokoll
```

```yaml
# ~/.protokoll/config.yaml
model: "gpt-4o-mini"
routing:
  default:
    path: "~/notes"
    structure: "month"
```

## First Transcription

```bash
# Transcribe all audio files in a directory
protokoll --input-directory ~/recordings

# Output goes to ~/notes/2026/01/11-<subject>.md
```

## Interactive Mode

Learn names and projects as you go:

```bash
protokoll --input-directory ~/recordings --interactive
```

Protokoll will ask:
- "Is 'pre a' spelled 'Priya'?"
- "Should I remember this person?"
- "Which project should this note go to?"

## Add Context

Create context files to improve accuracy:

```yaml
# ~/.protokoll/people/priya-sharma.yaml
id: priya-sharma
name: Priya Sharma
sounds_like:
  - "pre a"
  - "pria"
context: "Colleague from engineering"
```

## Check Results

```bash
# View the transcript
cat ~/notes/2026/01/11-meeting-notes.md

# View intermediate files (debug)
ls output/protokoll/
```

## Common Options

```bash
# Verbose output
protokoll --input-directory ~/recordings --verbose

# Debug mode (keeps intermediate files)
protokoll --input-directory ~/recordings --debug

# Self-reflection report
protokoll --input-directory ~/recordings --self-reflection

# Dry run (show what would happen)
protokoll --input-directory ~/recordings --dry-run
```

## Next Steps

- [Configure routing](./routing.md) for different projects
- [Add context](./context-system.md) for known names
- [Enable self-reflection](./reasoning.md) for quality reports
- [Read architecture](./architecture.md) for system understanding

