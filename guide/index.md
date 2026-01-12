# Protokoll AI Guide

This directory contains comprehensive documentation designed to help developers and AI assistants understand, integrate, debug, and extend Protokoll - an intelligent audio transcription system.

## What is Protokoll?

Protokoll transforms audio recordings into intelligent, context-enhanced transcriptions. It uses reasoning models to understand names, route notes to appropriate destinations, and build knowledge over time.

**Core Value**: Solves the "context problem" in transcription - when Whisper mishears "Priya" as "pre a", Protokoll recognizes and corrects it based on learned context.

## Guide Contents

### Getting Started
- [**Quick Start**](./quickstart.md): Get Protokoll working in 5 minutes
- [**Configuration**](./configuration.md): All configuration options

### Understanding Protokoll
- [**Architecture**](./architecture.md): System design and data flow
- [**Context System**](./context-system.md): How context storage works
- [**Routing**](./routing.md): Intelligent note routing
- [**Reasoning**](./reasoning.md): Reasoning model integration

### Development
- [**Development**](./development.md): Building and testing
- [**Interactive Mode**](./interactive.md): User interaction system

## Quick Reference

### Essential Commands

```bash
# Basic transcription (self-reflection enabled by default)
protokoll --input-directory ./recordings

# Interactive mode for learning
protokoll --input-directory ./recordings --interactive

# Disable self-reflection
protokoll --input-directory ./recordings --no-self-reflection

# Full debug mode
protokoll --input-directory ./recordings --debug --verbose
```

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
| Transcription Model | `whisper-1` |
| Self-Reflection | `true` (enabled) |
| Interactive Mode | `false` (disabled) |
| Output Structure | `month` |

