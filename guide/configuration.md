# Configuration Guide

## Configuration Files

### Main Config: `~/.protokoll/config.yaml`

```yaml
# Model settings
model: "gpt-5.2"                   # Reasoning model (default)
transcriptionModel: "whisper-1"    # Audio transcription

# Context
context:
  directory: "~/.protokoll"
  autoCreate: true

# Routing
routing:
  default:
    path: "~/notes"
    structure: "month"
    filename:
      - date
      - time
      - subject
  
  projects:
    - projectId: "work"
      destination:
        path: "~/work/notes"
        structure: "month"
      triggers:
        - "work note"
        - "about work"

# Output
output:
  intermediateDir: "./output/protokoll"
  keepIntermediates: true

# Features
features:
  interactive: false               # Disabled by default
  selfReflection: true            # Enabled by default
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (required) |
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude models) |
| `PROTOKOLL_MODEL` | Override default model |
| `PROTOKOLL_CONFIG_DIR` | Config directory |

## Command Line Options

### Basic Options

| Option | Description | Default |
|--------|-------------|---------|
| `--input-directory <dir>` | Directory with audio files | Required |
| `--output-directory <dir>` | Default output directory | `~/notes` |
| `--model <model>` | Reasoning model | `gpt-5.2` |
| `--transcription-model <model>` | Whisper model | `whisper-1` |

### Mode Options

| Option | Description | Default |
|--------|-------------|---------|
| `--interactive` | Enable interactive clarifications | `false` |
| `--self-reflection` | Generate reflection reports | `true` |
| `--no-self-reflection` | Disable reflection reports | - |
| `--dry-run` | Show what would happen | `false` |
| `--verbose` | Enable verbose logging | `false` |
| `--debug` | Enable debug mode | `false` |

### Advanced Options

| Option | Description | Default |
|--------|-------------|---------|
| `--context-directories <dirs...>` | Additional context locations | `[]` |
| `--max-audio-size <bytes>` | Maximum audio file size | `26214400` (25MB) |
| `--temp-directory <dir>` | Temporary file storage | OS temp dir |
| `--processed-directory <dir>` | Move processed files here | - |
| `--overrides` | Allow config overrides | `false` |

## Routing Structures

Protokoll uses Dreadcabinet structure codenames:

| Structure | Example Path |
|-----------|--------------|
| `none` | `notes/meeting.md` |
| `year` | `notes/2026/meeting.md` |
| `month` | `notes/2026/01/meeting.md` |
| `day` | `notes/2026/01/11/meeting.md` |

## Filename Options

| Option | Example |
|--------|---------|
| `date` | `260111` (YYMMDD format) |
| `time` | `1430` (HHmm format) |
| `subject` | `meeting-notes` |

Combined: `260111-1430-meeting-notes.md`

## Hierarchical Configuration

Protokoll walks up the directory tree looking for `.protokoll/` directories:

```
~/work/project-a/recordings/
  ↓ looks for .protokoll/ in:
~/work/project-a/.protokoll/    # Project-specific
~/work/.protokoll/               # Work-specific  
~/.protokoll/                    # Global
```

Lower directories take precedence for conflicting settings.

## Model Selection

### Reasoning Models

| Model | Provider | Notes |
|-------|----------|-------|
| `gpt-5.2` | OpenAI | **Default** - High reasoning capability |
| `gpt-5.1` | OpenAI | High reasoning, balanced |
| `gpt-5` | OpenAI | Fast and capable |
| `gpt-4o` | OpenAI | Previous gen, still capable |
| `gpt-4o-mini` | OpenAI | Fast, lower cost |
| `o1` | OpenAI | Reasoning-focused |
| `o1-mini` | OpenAI | Faster reasoning |
| `claude-3-5-sonnet` | Anthropic | Recommended for complex transcripts |
| `claude-3-opus` | Anthropic | Highest capability |
| `claude-3-haiku` | Anthropic | Fast, cost-effective |

### Transcription Models

| Model | Notes |
|-------|-------|
| `whisper-1` | Standard Whisper (default) |
| `gpt-4o-transcribe` | Newer model with prompting support |

> **Note**: Protokoll accepts any model string without restrictions. Model validation happens at the API level, ensuring future compatibility.

## Example Configurations

### Personal Notes

```yaml
model: "gpt-5.2"
routing:
  default:
    path: "~/notes"
    structure: "month"
```

### Work Projects

```yaml
model: "claude-3-5-sonnet"
routing:
  default:
    path: "~/notes/personal"
    structure: "month"
  projects:
    - projectId: "work"
      destination:
        path: "~/work/notes"
        structure: "day"
      triggers:
        - "work"
        - "office"
        - "meeting"
```

### Team Shared Context

```yaml
# ~/team-project/.protokoll/config.yaml
context:
  directory: "./.protokoll"
routing:
  default:
    path: "./notes"
    structure: "month"
```

### Batch Processing (No Self-Reflection)

```yaml
features:
  selfReflection: false
  interactive: false
```

