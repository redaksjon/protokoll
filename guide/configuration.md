# Configuration Guide

## Configuration Files

### Main Config: `~/.protokoll/config.yaml`

```yaml
# Model settings
model: "gpt-4o-mini"              # Reasoning model
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
  interactive: false
  selfReflection: false
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `PROTOKOLL_MODEL` | Override default model |
| `PROTOKOLL_CONFIG_DIR` | Config directory |

## Command Line Options

### Basic Options

| Option | Description | Default |
|--------|-------------|---------|
| `--input-directory <dir>` | Directory with audio files | Required |
| `--output-directory <dir>` | Default output directory | `~/notes` |
| `--model <model>` | Reasoning model | `gpt-4o-mini` |
| `--transcription-model <model>` | Whisper model | `whisper-1` |

### Mode Options

| Option | Description |
|--------|-------------|
| `--interactive` | Enable interactive clarifications |
| `--batch` | Disable interactivity |
| `--self-reflection` | Generate reflection reports |
| `--dry-run` | Show what would happen |
| `--verbose` | Enable verbose logging |
| `--debug` | Enable debug mode |

### Advanced Options

| Option | Description | Default |
|--------|-------------|---------|
| `--context-directory <dir>` | Context storage location | `~/.protokoll` |
| `--intermediate-dir <dir>` | Intermediate file storage | `./output/protokoll` |
| `--recursive` | Process subdirectories | `false` |

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
| `date` | `2026-01-11` |
| `time` | `1430` |
| `subject` | `meeting-notes` |

Combined: `2026-01-11-1430-meeting-notes.md`

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

- `gpt-4o-mini` - Fast, cost-effective (default)
- `gpt-4o` - Better quality
- `claude-3-5-sonnet` - Recommended for complex transcripts
- `claude-3-opus` - Highest quality
- `gpt-5` - Latest GPT
- `o1`, `o1-mini` - Reasoning-focused

### Transcription Models

- `whisper-1` - Standard Whisper (default)
- `gpt-4o-transcribe` - Newer model with prompting support

## Example Configurations

### Personal Notes

```yaml
model: "gpt-4o-mini"
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

