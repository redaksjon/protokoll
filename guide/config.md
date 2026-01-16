# Configuration Command

The `config` command provides an easy way to view and edit Protokoll's configuration without manually editing YAML files.

## Basic Usage

### Interactive Mode

Running `protokoll config` without arguments opens an interactive configuration editor:

```bash
protokoll config
```

The editor walks through each setting category, showing:
- Current value (or default if not set)
- Description of what the setting does
- Allowed values or examples
- Prompt to enter a new value

```
╔════════════════════════════════════════════════════════════════╗
║           PROTOKOLL CONFIGURATION EDITOR                       ║
╚════════════════════════════════════════════════════════════════╝

Config file: ~/.protokoll/config.yaml

Press Enter to keep current value, or type a new value.
Type 'q' to quit, 's' to save and exit.

── AI Models ──

  model
  AI model for transcription enhancement
  Examples: gpt-5.2, gpt-4o, gpt-4o-mini, claude-3-5-sonnet
  Current: gpt-5.2
  New value (Enter to skip): gpt-4o
  ✓ Set to: gpt-4o
```

### List All Settings

View all configuration options and their current values:

```bash
protokoll config --list
```

Output:
```
Protokoll Configuration
Config file: ~/.protokoll/config.yaml

  model                    gpt-5.2
  transcriptionModel       whisper-1 (default)
  reasoningLevel           medium (default)
  inputDirectory           ./recordings
  outputDirectory          ~/notes
  ...
```

### View a Specific Setting

Check the current value of any setting:

```bash
protokoll config model
```

Output:
```
model
AI model for transcription enhancement

Value: gpt-5.2
Examples: gpt-5.2, gpt-4o, gpt-4o-mini, claude-3-5-sonnet
```

### Set a Specific Value

Change any setting with a one-line command:

```bash
protokoll config model gpt-4o-mini
```

Output:
```
✓ model = gpt-4o-mini
Saved to: ~/.protokoll/config.yaml
```

### Show Config File Path

Find where your configuration is stored:

```bash
protokoll config --path
```

## Available Settings

### AI Models

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `model` | string | `gpt-5.2` | AI model for transcription enhancement |
| `transcriptionModel` | string | `whisper-1` | Model for audio transcription |
| `reasoningLevel` | string | `medium` | Reasoning effort: `low`, `medium`, or `high` |

### Directories

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `inputDirectory` | path | `./` | Where to read audio files from |
| `outputDirectory` | path | `~/notes` | Where to write transcripts |
| `processedDirectory` | path | `./processed` | Where to move processed audio files |
| `tempDirectory` | path | `/tmp` | Temporary directory for processing |

### Output Format

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `outputStructure` | string | `month` | Directory structure: `none`, `year`, `month`, `day` |
| `outputFilenameOptions` | array | `date,time,subject` | Components in output filenames |
| `timezone` | string | `Etc/UTC` | Timezone for date/time operations |

### Behavior

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `interactive` | boolean | `true` | Enable interactive prompts |
| `selfReflection` | boolean | `true` | Generate self-reflection reports |
| `silent` | boolean | `false` | Disable sound notifications |
| `verbose` | boolean | `false` | Enable verbose logging |
| `debug` | boolean | `false` | Enable debug mode |
| `dryRun` | boolean | `false` | Show what would happen without changes |

### Limits

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `maxAudioSize` | number | `26214400` | Maximum audio file size in bytes (25MB) |

## Examples

### Setting Up for Work

```bash
# Set a work-appropriate model
protokoll config model gpt-4o-mini

# Output to work notes folder
protokoll config outputDirectory ~/work/notes

# Organize by month
protokoll config outputStructure month
```

### Disabling Interactive Mode for Automation

```bash
# Disable interactive prompts (use in cron jobs)
protokoll config interactive false

# Disable sounds
protokoll config silent true
```

### Debugging Issues

```bash
# Enable debug output
protokoll config debug true

# Enable verbose logging
protokoll config verbose true
```

### Configuring Array Values

For array settings like `outputFilenameOptions`, use comma-separated values:

```bash
# Just date and subject (no time)
protokoll config outputFilenameOptions "date,subject"

# All options
protokoll config outputFilenameOptions "date,time,subject"
```

## Configuration Hierarchy

Protokoll uses hierarchical configuration:

1. **Default values** - Built into Protokoll
2. **Global config** - `~/.protokoll/config.yaml`
3. **Project config** - `.protokoll/config.yaml` in any parent directory
4. **Command-line arguments** - Highest priority

The `config` command edits either the global config or the closest project config, depending on which exists.

## See Also

- [Quick Start Guide](./quickstart.md) - Getting started with Protokoll
- [Routing System](./routing.md) - Configure project-specific routing
- [Context System](./context-system.md) - Add people, terms, and projects
