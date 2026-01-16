# Configuration Guide

## Configuration Files

### Main Config: `~/.protokoll/config.yaml`

```yaml
# Model settings
model: "gpt-5.2"                   # Reasoning model (default)
transcriptionModel: "whisper-1"    # Audio transcription
reasoningLevel: "medium"           # Reasoning effort: low, medium, high (default: medium)

# Directory settings (Dreadcabinet options)
inputDirectory: "./recordings"      # Where to find audio files
outputDirectory: "~/notes"          # Where to write transcripts
outputStructure: "month"            # Directory structure (none, year, month, day)
outputFilenameOptions:              # Filename components
  - date
  - time
  - subject

# Processing options
processedDirectory: "./processed"   # Move processed audio here (optional)

# Features (flat properties, not nested)
interactive: true                   # Interactive prompts (enabled by default)
selfReflection: true               # Generate reflection reports (enabled by default)
silent: false                      # Sound notifications (enabled by default)

# Advanced
maxAudioSize: 26214400             # Max audio file size in bytes (25MB)
tempDirectory: "/tmp"              # Temporary file storage
contextDirectories: []             # Additional context locations
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
| `--output-directory <dir>` | Default output directory | `./` |
| `--model <model>` | Reasoning model | `gpt-5.2` |
| `--transcription-model <model>` | Whisper model | `whisper-1` |
| `--reasoning-level <level>` | Reasoning effort (low/medium/high) | `medium` |

### Mode Options

| Option | Description | Default |
|--------|-------------|---------|
| `--batch` | Disable interactive mode | `false` (interactive enabled) |
| `--self-reflection` | Generate reflection reports | `true` |
| `--no-self-reflection` | Disable reflection reports | - |
| `--silent` | Disable sound notifications | `false` |
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

## Output Structures

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

## Project-Based Routing

Routing to different destinations is configured via **project files** in the context system, not in the main config.yaml.

### Example Project File

```yaml
# ~/.protokoll/projects/work.yaml
id: work
name: Work Notes
type: project

classification:
  context_type: work
  explicit_phrases:
    - "work note"
    - "about work"
    - "office meeting"
  topics:
    - "standup"
    - "sprint"

routing:
  destination: "~/work/notes"
  structure: "month"
  filename_options:
    - date
    - time
    - subject
  auto_tags:
    - work

active: true
```

See [Context System](./context-system.md) and [Routing](./routing.md) for more details.

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
outputDirectory: "~/notes"
outputStructure: "month"
```

### Work Setup with Processed Directory

```yaml
model: "claude-3-5-sonnet"
inputDirectory: "~/recordings"
outputDirectory: "~/notes"
outputStructure: "month"
processedDirectory: "~/recordings/processed"
selfReflection: true
```

### Batch Processing (Non-Interactive)

```yaml
# For automation/cron jobs
interactive: false
selfReflection: false
```

### Team Shared Context

```yaml
# ~/team-project/.protokoll/config.yaml
# Uses relative path for team portability
outputDirectory: "./notes"
outputStructure: "month"
```

