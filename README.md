# Protokoll: Intelligent Audio Transcription

## Overview

Protokoll is a focused command-line utility that transforms audio recordings into intelligent, context-enhanced transcriptions. It uses AI to transcribe and enhance audio content, making it more useful and actionable.

## How It Works

Protokoll processes each audio file through a streamlined workflow:

1. **Locate**: Scans your input directory to find audio files
2. **Transcribe**: Uses OpenAI's Whisper to convert speech to text, enhanced with context

## Installation

### Global Installation

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

## Quick Start

```bash
# Set your OpenAI API key
export OPENAI_API_KEY='your-key-here'

# Process audio files
protokoll --input-directory ./recordings --output-directory ./notes

# Or use npx without installing
npx @redaksjon/protokoll --input-directory ./recordings --output-directory ./notes
```

## Output

Protokoll generates enhanced markdown notes for each processed audio file with intelligent formatting and structure.

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--input-directory <dir>` | Directory containing audio files | Required |
| `--output-directory <dir>` | Where to save output files | Required |
| `--recursive` | Process subdirectories | `false` |
| `--model <model>` | OpenAI model for enhancement | `gpt-4o-mini` |
| `--transcription-model <model>` | Whisper model | `whisper-1` |
| `--config-dir <dir>` | Configuration directory | `~/.protokoll` |
| `--context-directories <dirs>` | Directories with context files | None |
| `--verbose` | Enable verbose logging | `false` |
| `--debug` | Enable debug mode | `false` |
| `--dry-run` | Show what would be done | `false` |

> **Note on Model Selection**: Protokoll accepts any OpenAI model string without restrictions. You can use `gpt-5-mini`, `o1-preview`, or any other model supported by your OpenAI API. Model validation happens at the API level, ensuring future compatibility.

## Examples

```bash
# Process current directory
protokoll --input-directory . --output-directory ./notes

# Process recursively with verbose output
protokoll --input-directory ./recordings --output-directory ./notes --recursive --verbose

# Use a specific model
protokoll --model gpt-5-mini --input-directory ./recordings

# Use a specific transcription model
protokoll --transcription-model whisper-1 --input-directory ./recordings
```

## License

Apache-2.0

## Author

Tim O'Brien <tobrien@discursive.com>
