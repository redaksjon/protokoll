# Protokoll: Intelligent Audio Transcription

> **Transform voice memos into perfectly organized, context-aware notes—without the transcription chaos.**

## The Problem

You record voice memos constantly. Quick thoughts, meeting notes, ideas to remember. But the reality:

- Whisper mishears names: "Priya" becomes "pre a", "kubernetes" becomes "cube er net ease"
- Notes go everywhere: Work notes end up in personal folders, client calls get mixed with internal meetings
- You spend 30% of your time organizing and fixing what transcription services got wrong
- Every tool forces you to choose between *accuracy* and *volume*

Protokoll solves this.

## What Makes Protokoll Different

Protokoll is an intelligent audio transcription system that uses advanced reasoning models to create highly accurate, context-enhanced transcripts. Unlike basic transcription tools, Protokoll:

- **Learns Your World**: Maintains a knowledge base of people, projects, and organizations you mention. When Whisper mishears someone, Protokoll recognizes and corrects it using phonetic variants and context awareness
- **Routes Intelligently**: Multi-signal classification sends notes to the right destination—work notes stay in your work folder, client calls go to client projects, personal thoughts go to personal notes
- **Preserves Everything**: This is NOT a summarizer. Protokoll preserves the full content of what you said while cleaning up filler words, false starts, and obvious transcription errors
- **Improves Over Time**: The more you use it, the smarter it gets. Build context incrementally and watch transcription quality improve session after session
- **Zero Configuration Start**: Works out of the box with sensible defaults. No API wrestling, no complex setup—just transcribe

## The Core Philosophy: Context You Own and Control

**The most important feature of Protokoll is not transcription—it's learning.**

When you first start using Protokoll, it doesn't know anything about you. It doesn't know that "Project Alpha" is a client engagement you're working on, that "Priya" is your colleague, or that notes about "skiing" should go to your personal folder while notes about "quarterly planning" should go to a work project.

**But that's the point.** Protokoll is designed to learn from you:

1. **Interactive Discovery**: When you run `protokoll` (interactive by default) and mention "Project Alpha" for the first time, the system recognizes it doesn't know what that is. It asks: *"Is Project Alpha a new project? Where should notes about it be stored?"* You tell it, and from that moment forward, every note mentioning Project Alpha routes correctly.

2. **Context Files You Own**: Unlike cloud transcription services that keep your data in their black box, Protokoll stores everything it learns in simple YAML files in your `.protokoll/context/` directory:

   ```yaml
   # .protokoll/context/projects/project-alpha.yaml
   id: project-alpha
   name: Project Alpha
   classification:
     context_type: work
     explicit_phrases: ["project alpha", "update on alpha"]  # Routes when these appear in audio
     topics: ["client engagement", "Q1 planning"]            # Lower-confidence associations
   routing:
     destination: ~/notes/projects/alpha
     structure: month
   sounds_like: ["project alfa"]  # Phonetic variants for misheard project names
   ```

   **You can read these files. You can edit them. You can version control them.** This is YOUR context, not a proprietary model hidden in someone else's cloud.

3. **Feedback That Teaches**: Made a mistake? Run `protokoll feedback --recent` to review recent classifications. Tell the system "this note should have gone to Project Alpha because I said 'update on Alpha' at the beginning." Protokoll uses AI to analyze your feedback and automatically update its classification rules.

4. **Transparent Reasoning**: Every routing decision includes a reasoning trace. You can see exactly WHY a note was classified the way it was—which phrases matched, which signals contributed, what the confidence level was. No black boxes.

### Why This Matters

Most AI tools are black boxes. They work (or don't), and you have no visibility into why. When they make mistakes, you can't fix them—you just have to hope the next model update is better.

Protokoll takes a different approach: **AI-assisted learning with human control**. The reasoning models help discover patterns and suggest classifications, but the knowledge lives in files you control. When the system makes mistakes, you correct them, and those corrections persist in your context files forever.

This means:
- **Your context travels with you**: Switch computers? Copy your `.protokoll` directory.
- **Team sharing**: Work on a team? Share context files so everyone's notes route correctly.
- **Auditability**: Need to know why something was classified a certain way? Check the context files.
- **No vendor lock-in**: Your knowledge isn't trapped in someone else's database.

The goal is simple: **After a few weeks of use, Protokoll should understand your world well enough to route notes perfectly with minimal intervention.**

## Table of Contents

- [The Problem](#the-problem)
- [What Makes Protokoll Different](#what-makes-protokoll-different)
- [The Core Philosophy: Context You Own and Control](#the-core-philosophy-context-you-own-and-control)
- [Why Protokoll](#why-protokoll)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Getting Started](#getting-started)
  - [Progress Tracking](#progress-tracking)
  - [Transcription Summary](#transcription-summary)
- [Configuration](#configuration)
  - [Interactive Configuration Editor](#interactive-configuration-editor)
  - [Quick Configuration Commands](#quick-configuration-commands)
- [Command Line Options](#command-line-options)
- [Context Management Commands](#context-management-commands)
  - [Smart Project Creation](#smart-project-creation)
- [Transcript Actions](#transcript-actions)
- [Feedback Command](#feedback-command)
- [Key Features](#key-features)
- [Context System](#context-system)
- [Routing System](#routing-system)
- [Interactive Mode](#interactive-mode)
- [Self-Reflection Reports](#self-reflection-reports)
- [Output Structure](#output-structure)
- [Supported Models](#supported-models)
- [Troubleshooting](#troubleshooting)
- [MCP Server Integration](#mcp-server-integration)
- [Architecture](#architecture)
- [Examples](#examples)

## Why Protokoll

### For Knowledge Workers

You're drowning in voice memos but can't use them because they're disorganized. Protokoll fixes this:

- **One command**: `protokoll --input-directory ~/recordings` and you're done
- **Smart naming**: Files are automatically named with date, time, and detected topic
- **Automatic routing**: Work goes to work, personal goes to personal, project notes go to projects
- **Growing context**: Each session teaches Protokoll about your people, projects, and vocabulary

### Compared to Other Tools

| Feature | Protokoll | Basic Whisper | Otter | Temi |
|---------|-----------|---------------|-------|------|
| Name Recognition | ✓ Learns yours | ✗ | Limited | Limited |
| Smart Routing | ✓ Automatic | ✗ | ✗ | ✗ |
| Full Content | ✓ Preserved | ✓ | Summarized | Summarized |
| Reasoning Mode | ✓ Optional | ✗ | Limited | Limited |
| Self-Hosted Context | ✓ Your data | ✗ | Cloud | Cloud |
| Cost-Effective | ✓ ~$0.01/min | ~$0.10/min | $10-30/mo | $10-25/mo |
| Privacy | ✓ Your files | ✓ Offline | Cloud | Cloud |

### Who Should Use Protokoll

**Product Managers**: Record customer conversations, feature ideas, meeting notes—Protokoll routes them to projects automatically

**Researchers**: Capture interview insights, lab notes, findings—build a growing knowledge base that improves over time

**Authors & Creators**: Dictate ideas, chapter notes, research—get organized files without manual organization

**Managers**: Record 1-on-1s, team meetings, strategy sessions—automatic routing means they're never lost

**Teams**: Self-hosted means your transcripts never leave your server—perfect for regulated industries

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
git clone https://github.com/redaksjon/protokoll.git
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

### 2-Minute Quickstart

**Option 1: No Setup Required**

```bash
# Just install and use
npm install -g @redaksjon/protokoll
export OPENAI_API_KEY='sk-your-key'

# Start transcribing (outputs to ~/notes by default)
protokoll --input-directory ~/recordings --verbose
```

Done. Your transcripts are in `~/notes` organized by month with full names corrected and auto-detected routing.

**Option 2: With Interactive Onboarding**

```bash
# First run: answers a few setup questions
protokoll --input-directory ~/recordings --interactive

# Future runs: use your learned context automatically
protokoll --input-directory ~/recordings
```

**Option 3: The Controlled Approach (5 minutes)**

Create your context before transcribing:

```bash
# 1. Create context directory
mkdir -p ~/.protokoll/people ~/.protokoll/projects

# 2. Add someone you mention frequently
cat > ~/.protokoll/people/john-smith.yaml << EOF
id: john-smith
name: John Smith
sounds_like:
  - "john"
  - "jon smith"
EOF

# 3. Add a project
cat > ~/.protokoll/projects/work.yaml << EOF
id: work
name: Work Notes
type: project
classification:
  context_type: work
  explicit_phrases:
    - "work note"
    - "work meeting"
routing:
  destination: ~/work/notes
  structure: month
  filename_options:
    - date
    - time
    - subject
active: true
EOF

# 4. Now transcribe - names are corrected, routing is automatic
protokoll --input-directory ~/recordings
```

### What Happens Next

1. **Transcription**: Your audio is sent to OpenAI Whisper (transcription model)
2. **Enhancement**: Protokoll uses a reasoning model (gpt-5.2 by default) to:
   - Recognize and correct names using your context knowledge base
   - Clean up transcription artifacts
   - Add proper formatting
   - Preserve your exact wording
3. **Routing**: Notes automatically go to the right folder based on content
4. **Output**: You get markdown files with perfect names, proper organization, and full content

### Progress Tracking

When processing multiple files, Protokoll shows clear progress indicators so you always know where you are:

```
Found 11 file(s) to process in ~/recordings
[1/11] Starting: ~/recordings/meeting-notes.m4a
[1/11] Transcribing audio...
[1/11] Transcription: 2847 chars in 3.2s
[1/11] Enhancing with gpt-5.2...
[1/11] Enhancement: 3 iterations, 2 tools, 4.1s
[1/11] Output: ~/notes/2026/01/260115-1412-meeting-notes.md (7.3s total)
[1/11] Completed: ~/recordings/meeting-notes.m4a -> ~/notes/2026/01/260115-1412-meeting-notes.md
[2/11] Starting: ~/recordings/quick-thought.m4a
...
```

The `[X/Y]` prefix on every log message tells you exactly which file you're on and how many remain—no more wondering if the system is making progress during long batch runs.

### Transcription Summary

When batch processing completes, Protokoll prints a summary of all processed files:

```
============================================================
TRANSCRIPTION SUMMARY
============================================================
Processed 11 file(s)

Input Files:
/Users/me/recordings/meeting-notes.m4a
/Users/me/recordings/quick-thought.m4a
/Users/me/recordings/client-call.m4a

Output Files:
/Users/me/notes/2026/01/260115-1412-meeting-notes.md
/Users/me/notes/2026/01/260115-1430-quick-thought.md
/Users/me/notes/2026/01/260115-1500-client-call.md

============================================================
```

Each file path is printed on its own line, making it easy to copy and paste to the command line for further processing—like reviewing transcripts, sending them for feedback, or moving them to a different location.

### Where Are My Files?

```bash
~/notes/2026/01/              # Default location
├── 260111-1430-meeting.md     # date-time-subject
├── 260111-1530-brainstorm.md
└── 260112-0900-client-call.md

~/work/notes/2026/01/         # Project-specific routing
└── 260111-1530-project-alpha.md
```

### The Learning Loop

Protokoll gets smarter with every file you process:

```bash
# First file: names might not be perfect
protokoll --input-directory ~/recordings

# Interactive mode: correct the ones that were wrong
protokoll --input-directory ~/recordings --interactive

# Future files: those corrections are remembered
protokoll --input-directory ~/recordings
```

Try it with `--interactive` once, fix a few names or add a new project, then run normally. You'll see the difference immediately.

## Configuration

Protokoll uses hierarchical configuration discovery. It walks up the directory tree looking for `.protokoll/` directories, merging configs with local taking precedence.

### Configuration File Location

- **Global**: `~/.protokoll/config.yaml`
- **Project-specific**: `./protokoll/config.yaml` (in any parent directory)

### Interactive Configuration Editor

The easiest way to configure Protokoll is with the interactive config command:

```bash
# Launch interactive configuration editor
protokoll config
```

This opens a guided editor that walks through each setting:

```
╔════════════════════════════════════════════════════════════════╗
║           PROTOKOLL CONFIGURATION EDITOR                       ║
╚════════════════════════════════════════════════════════════════╝

Config file: ~/.protokoll/config.yaml

── AI Models ──

  model
  AI model for transcription enhancement
  Examples: gpt-5.2, gpt-4o, gpt-4o-mini, claude-3-5-sonnet
  Current: default: gpt-5.2
  New value (Enter to skip): 
```

### Quick Configuration Commands

Set individual values directly from the command line:

```bash
# View all settings
protokoll config --list

# View a specific setting
protokoll config model

# Set a specific value
protokoll config model gpt-4o-mini
protokoll config debug true
protokoll config outputDirectory ~/my-notes
protokoll config outputFilenameOptions "date,time,subject"

# Show config file path
protokoll config --path
```

### Full Configuration Example

Create `~/.protokoll/config.yaml`:

```yaml
# Model settings
model: "gpt-5.2"               # Reasoning model (default with high reasoning)
transcriptionModel: "whisper-1" # Transcription model

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

# Feature flags (flat, not nested)
interactive: true              # Interactive prompts (enabled by default)
selfReflection: true          # Generate reports by default
silent: false                 # Sound notifications
debug: false                  # Debug mode

# Smart assistance for project creation
smartAssistance:
  enabled: true                   # Enable AI-assisted project creation
  phoneticModel: "gpt-5-nano"     # Fast model for phonetic variant generation
  analysisModel: "gpt-5-mini"     # Model for content analysis and suggestions
  soundsLikeOnAdd: true           # Auto-generate phonetic variants
  triggerPhrasesOnAdd: true       # Auto-generate content-matching phrases
  promptForSource: true           # Ask for URL/file when creating projects

# Advanced
maxAudioSize: 26214400        # Max audio file size in bytes (25MB)
tempDirectory: "/tmp"         # Temporary file storage
```

**Note**: Project-specific routing is configured in **project files** (e.g., `~/.protokoll/projects/work.yaml`), not in the main config. See [Routing System](#routing-system) for details.

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
| `--batch` | Disable interactive mode (for automation) |
| `--self-reflection` | Generate reflection reports (default: true) |
| `--no-self-reflection` | Disable reflection reports |
| `--silent` | Disable sound notifications |
| `--dry-run` | Show what would happen |
| `--verbose` | Enable verbose logging |
| `--debug` | Enable debug mode with intermediate files |

> **Note**: Interactive mode is **enabled by default**. Use `--batch` to disable it for automation/cron jobs.

### Advanced Options

| Option | Description | Default |
|--------|-------------|---------|
| `--context-directory <dir>` | Context storage location | `~/.protokoll` |
| `--intermediate-dir <dir>` | Intermediate file storage | `./output/protokoll` |
| `--recursive` | Process subdirectories | `false` |
| `--max-audio-size <bytes>` | Max file size before splitting | `25MB` |
| `--temp-directory <dir>` | Temp files for audio splitting | System temp |

## Context Management Commands

Protokoll includes a complete CLI for managing context entities directly from the command line. Instead of manually editing YAML files, you can use these subcommands to list, view, add, and delete entities.

### Entity Types

| Command | Description |
|---------|-------------|
| `project` | Manage projects (routing destinations) |
| `person` | Manage people (name recognition) |
| `term` | Manage technical terms |
| `company` | Manage companies |
| `ignored` | Manage ignored terms (won't prompt for these) |
| `context` | Overall context system management |

### Common Actions

Each entity type supports the same actions:

```bash
# List all entities of a type
protokoll project list
protokoll person list
protokoll term list
protokoll company list
protokoll ignored list

# Show details for a specific entity
protokoll project show <id>
protokoll person show priya-sharma

# Add a new entity (interactive)
protokoll project add
protokoll person add
protokoll term add

# Add term with command-line arguments
protokoll term add --term "Kubernetes" --domain "devops" \
  --description "Container orchestration platform" \
  --topics "containers,orchestration,cloud-native" \
  --projects "infrastructure"

# Update existing entity with new content (regenerates metadata)
protokoll project update redaksjon https://github.com/user/redaksjon/README.md
protokoll term update kubernetes https://kubernetes.io/docs/concepts/overview/

# Merge duplicate terms
protokoll term merge kubernetes-old kubernetes  # Combines metadata, deletes source

# Delete an entity
protokoll project delete <id>
protokoll person delete john-smith --force
```

### Context Overview

```bash
# Show context system status (discovered directories, entity counts)
protokoll context status

# Search across all entity types
protokoll context search "acme"
```

### Example: Adding a Person

```bash
$ protokoll person add

[Add New Person]

Full name: Priya Sharma
ID (Enter for "priya-sharma"): 
First name (Enter to skip): Priya
Last name (Enter to skip): Sharma
Company ID (Enter to skip): acme-corp
Role (Enter to skip): Product Manager
Sounds like (comma-separated, Enter to skip): pre a, pria, preeya
Context notes (Enter to skip): Colleague from product team

Person "Priya Sharma" saved successfully.
```

### Smart Project Creation

Protokoll can use AI assistance to help create projects faster by automatically generating:

- **Sounds like**: Phonetic variants of your project NAME for when Whisper mishears it (e.g., "Protokoll" → "protocol", "pro to call")
- **Trigger phrases**: Content-matching phrases that indicate audio content belongs to this project (e.g., "working on protokoll", "protokoll meeting")
- **Topic keywords**: Relevant keywords extracted from project documentation
- **Description**: A contextual description of your project

#### Understanding Sounds Like vs Trigger Phrases

| Field | Purpose | Example for "Protokoll" |
|-------|---------|------------------------|
| **Sounds like** | Correct misheard project NAME | "protocol", "pro to call" |
| **Trigger phrases** | Match content to project | "working on protokoll", "protokoll meeting" |

- `sounds_like` is used during transcription to correct the project name when Whisper mishears it
- `trigger phrases` are used during classification to route content to the right project

#### Basic Usage

```bash
# Interactive mode with smart assistance (default when configured)
protokoll project add

# With a source URL for full context analysis
protokoll project add https://github.com/myorg/myproject

# With a local file or directory
protokoll project add ./README.md
protokoll project add /path/to/project
```

#### Command-Line Options

```bash
protokoll project add [source] [options]

Arguments:
  source                    URL or file path to analyze for project context

Options:
  --name <name>            Project name (skips name prompt)
  --id <id>                Project ID (auto-generated from name if not provided)
  --context <type>         Context type: work, personal, or mixed (default: work)
  --destination <path>     Output destination path for transcripts
  --structure <type>       Directory structure: none, year, month, day (default: month)
  --smart                  Force enable smart assistance
  --no-smart               Force disable smart assistance
  -y, --yes                Accept all AI-generated suggestions without prompting (non-interactive)
```

#### Examples

```bash
# Quick project from GitHub repo
protokoll project add https://github.com/myorg/myproject --name "My Project"

# Create project with pre-set options
protokoll project add --name "Quarterly Planning" --context work

# Analyze local documentation
protokoll project add ./docs/README.md --name "Documentation"

# Non-interactive mode: accept all AI suggestions automatically
protokoll project add https://github.com/myorg/myproject --name "My Project" --yes

# Disable smart assistance for manual entry
protokoll project add --no-smart
```

#### How It Works

1. **Name Entry**: When you provide a project name, smart assistance generates:
   - **Sounds like**: Phonetic variants for when Whisper mishears the name
   - **Trigger phrases**: Content-matching phrases for classification

2. **Content Analysis**: When you provide a URL or file path, smart assistance:
   - Fetches the content (supports GitHub repos, web pages, local files)
   - Analyzes it to suggest topic keywords and description

3. **Editable Suggestions**: All suggestions are presented as defaults that you can accept (press Enter) or edit

4. **Non-Interactive Mode**: Use the `--yes` flag to automatically accept all AI-generated suggestions without prompting. This is useful for automation or when you want to trust the AI completely

#### Configuration

Enable or disable smart assistance globally in your `.protokoll/config.yaml`:

```yaml
smartAssistance:
  enabled: true                   # Enable smart assistance globally
  phoneticModel: "gpt-5-nano"     # Fast model for phonetic variant generation (default)
  analysisModel: "gpt-5-mini"     # Model for content analysis and suggestions (default)
  soundsLikeOnAdd: true           # Auto-generate phonetic variants
  triggerPhrasesOnAdd: true       # Auto-generate content-matching phrases
  promptForSource: true           # Ask about URL/file when not provided
```

Override per-command with `--smart` or `--no-smart` flags.

#### Requirements

- OpenAI API key set in environment (`OPENAI_API_KEY`)
- Network access for URL fetching and API calls

### Example: Adding a Project

The interactive prompt guides you through each field with explanations:

```bash
$ protokoll project add

[Add New Project]

Projects define where transcripts are filed and how they're classified.
Each field helps Protokoll route your audio notes to the right place.

Project name: Client Alpha

  ID is used for the filename to store project info (e.g., "client-alpha.yaml")
  and as a reference when linking other entities to this project.
ID (Enter for "client-alpha"): 

  Output destination is where transcripts for this project will be saved.
  Leave blank to use the configured default: ~/notes
Output destination path (Enter for default): ~/clients/alpha/notes

  Directory structure determines how transcripts are organized by date:
    none:  output/transcript.md
    year:  output/2025/transcript.md
    month: output/2025/01/transcript.md
    day:   output/2025/01/15/transcript.md
Directory structure (none/year/month/day, Enter for month): month

  Context type helps classify the nature of this project:
    work:     Professional/business content
    personal: Personal notes and ideas
    mixed:    Contains both work and personal content
Context type (work/personal/mixed, Enter for work): work

  Trigger phrases are words/phrases that identify content belongs to this project.
  When these phrases appear in your audio, Protokoll routes it here.
  Examples: "client alpha", "alpha project", "working on alpha"
Trigger phrases (comma-separated): client alpha, alpha project

  Sounds-like variants help when Whisper mishears the project name.
  Useful for non-English names (Norwegian, etc.) that may be transcribed differently.
  Examples for "Protokoll": "protocol", "pro to call", "proto call"
Sounds like (comma-separated, Enter to skip): 

  Topic keywords are themes/subjects associated with this project.
  These provide additional context for classification but are lower-confidence
  than trigger phrases. Examples: "budget", "roadmap", "client engagement"
Topic keywords (comma-separated, Enter to skip): client engagement

  Description is a brief note about this project for your reference.
Description (Enter to skip): Primary client project

Project "Client Alpha" saved successfully.
```

#### Project Field Reference

| Field | Purpose |
|-------|---------|
| **Trigger phrases** | High-confidence matching - routes transcripts when these phrases appear in audio |
| **Sounds like** | Phonetic variants for when Whisper mishears the project name (useful for non-English names) |
| **Topic keywords** | Lower-confidence theme associations for classification |

### Options

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show full details (for `list` commands) |
| `-f, --force` | Skip confirmation (for `delete` commands) |

For complete documentation, see the [Context Commands Guide](./guide/context-commands.md).

## Transcript Actions

Protokoll includes the `action` command for editing and combining existing transcripts. This is useful for post-processing, organizing, and managing your transcript library.

### Edit a Single Transcript

Change the title and/or project of an existing transcript:

```bash
# Change the title (updates document heading and filename)
protokoll action --title "Time to Celebrate" /path/to/transcript.md

# Change the project (updates metadata and moves to project's destination)
protokoll action --project client-alpha /path/to/transcript.md

# Change both title and project
protokoll action --title "Q1 Planning Session" --project quarterly-planning /path/to/transcript.md

# Preview what would happen without making changes
protokoll action --title "New Title" /path/to/transcript.md --dry-run --verbose
```

### Combine Multiple Transcripts

Merge multiple related transcripts into a single document. When combining, source files are automatically deleted after the combined file is created.

```bash
# Combine transcripts with a custom title
protokoll action --title "Time to Celebrate" --combine "/path/to/transcript1.md
/path/to/transcript2.md
/path/to/transcript3.md"

# Combine and change project
protokoll action --title "Full Meeting Notes" --project my-project --combine "/path/to/part1.md
/path/to/part2.md"

# Preview what would happen without making changes
protokoll action --combine "/path/to/files..." --dry-run --verbose
```

#### What Combine Does

1. **Parses all transcripts**: Extracts metadata, title, and content from each file
2. **Sorts chronologically**: Orders transcripts by filename (which includes timestamp)
3. **Merges metadata**: Uses the first transcript's date/time, combines durations, deduplicates tags
4. **Creates sections**: Each source transcript becomes a section with its original title
5. **Routes intelligently**: If `--project` is specified, uses that project's routing configuration
6. **Cleans up**: Automatically deletes source files after successful combine

#### Action Options

| Option | Description |
|--------|-------------|
| `-t, --title <title>` | Set a custom title (also affects the output filename) |
| `-p, --project <id>` | Change to a different project (updates metadata and routing) |
| `-c, --combine <files>` | Combine multiple files (newline-separated list) |
| `--dry-run` | Show what would happen without making changes |
| `-v, --verbose` | Show detailed output |

#### Title Slugification

When you provide a custom title with `--title`, it's automatically converted to a filename-safe slug:

| Title | Filename |
|-------|----------|
| `Time to Celebrate` | `15-1412-time-to-celebrate.md` |
| `Meeting: Q1 Planning & Review!` | `15-1412-meeting-q1-planning-review.md` |
| `Sprint 42 Retrospective` | `15-1412-sprint-42-retrospective.md` |

The slug preserves the original timestamp prefix and is limited to 50 characters.

#### Common Use Cases

```bash
# Rename a transcript with a more meaningful title
protokoll action --title "Q1 Budget Review Meeting" ~/notes/2026/01/15-1412-meeting.md

# Move a transcript to a different project
protokoll action --project client-beta ~/notes/2026/01/15-1412-meeting.md

# Consolidate a long meeting recorded in segments
protokoll action --title "Full Team Standup" --combine "~/notes/part1.md
~/notes/part2.md
~/notes/part3.md"

# Reorganize scattered notes into a project
protokoll action --title "Sprint 42 Planning" --project sprint-42 --combine "~/notes/misc1.md
~/notes/misc2.md"
```

#### Example Output

When combining transcripts, the output looks like:

```markdown
# Meeting Notes Part 1 (Combined)

## Metadata

**Date**: January 15, 2026
**Time**: 02:12 PM

**Project**: AI Safety
**Project ID**: `ai-safety`

### Routing

**Destination**: /Users/you/notes/ai-safety
**Confidence**: 85.0%

**Tags**: `work`, `ai`, `safety`, `meeting`

**Duration**: 15m 30s

---

## Meeting Notes Part 1
*Source: 15-1412-meeting-part-1.md*

First part of the meeting content...

## Meeting Notes Part 2
*Source: 15-1421-meeting-part-2.md*

Second part of the meeting content...
```

For complete documentation, see the [Action Commands Guide](./guide/action.md).

## Feedback Command

The `feedback` command uses an agentic model to understand natural language feedback and take corrective actions automatically.

### Basic Usage

```bash
# Interactive feedback
protokoll feedback /path/to/transcript.md

# Direct feedback
protokoll feedback /path/to/transcript.md -f "YB should be Wibey"

# Preview changes
protokoll feedback /path/to/transcript.md -f "WCMP should be WCNP" --dry-run -v
```

### What You Can Do

#### Fix Terms & Abbreviations

```bash
protokoll feedback notes.md -f "WCMP should be WCNP - Walmart's Native Cloud Platform"
```

This will:
1. Replace "WCMP" with "WCNP" throughout the transcript
2. Add "WCNP" to your vocabulary with the full expansion
3. Store phonetic variants so it won't be misheard again

#### Fix Names

```bash
protokoll feedback notes.md -f "San Jay Grouper is actually Sanjay Gupta"
```

This will:
1. Replace the name throughout the transcript
2. Fix variations like "San Jay" or "Sanjay Grouper"
3. Add the person to context for future recognition

#### Change Project Assignment

```bash
protokoll feedback notes.md -f "This should be in the Quantum Readiness project"
```

This will:
1. Update the project metadata
2. Move the file to the project's destination
3. Rename the file according to project rules

### Feedback Options

| Option | Short | Description |
|--------|-------|-------------|
| `--feedback <text>` | `-f` | Provide feedback directly (non-interactive) |
| `--model <model>` | `-m` | Reasoning model to use (default: gpt-5.2) |
| `--dry-run` | | Show what would happen without making changes |
| `--verbose` | `-v` | Show detailed output |
| `--help-me` | | Show examples of feedback you can provide |

### Get Help

```bash
# Show feedback examples
protokoll feedback --help-me
```

For complete documentation, see the [Feedback Guide](./guide/feedback.md).

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
type: project

classification:
  context_type: work
  # Trigger phrases: high-confidence content matching
  # When these phrases appear in audio, route to this project
  explicit_phrases:
    - "quarterly planning"
    - "Q1 planning"
    - "roadmap review"
  # Topic keywords: lower-confidence theme associations
  topics:
    - "roadmap"
    - "budget"

routing:
  destination: "~/work/planning/notes"
  structure: "month"
  filename_options:
    - date
    - time
    - subject

# Phonetic variants: how Whisper might mishear the project name
# Useful for non-English names (Norwegian, etc.)
sounds_like:
  - "quarterly plan"
  - "quarter planning"

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
name: Kubernetes
type: term
expansion: ""  # For acronyms (e.g., "K8s" → "Kubernetes")
domain: devops  # E.g., devops, engineering, security, finance
description: "Container orchestration platform that automates deployment, scaling, and management"
sounds_like:
  - "kube"
  - "k8s"
  - "kubernetes"
  - "cube er net ease"
topics:  # Related keywords for classification
  - containers
  - orchestration
  - cloud-native
  - devops
projects:  # Associated project IDs where this term is relevant
  - infrastructure
  - myapp
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

When you run with `--interactive`, Protokoll will ask clarification questions and confirm important decisions:

### What Protokoll Asks About

#### 1. Names and Spelling
Protokoll detects potential misspellings and asks for corrections:

```
[Name Spelling Clarification]
Context: "...meeting with pre a about..."
Heard: "pre a"
Suggested correction: "Priya"

Enter correct spelling (or press Enter to accept suggestion):
> Priya Sharma
✓ Remembered! "Priya Sharma" will be recognized in future transcripts.
```

#### 2. New People
When encountering unknown people:

```
[New Person Detected]
Context: "...meeting with Priya about..."
Name heard: "Priya"

Who is this person? (brief description, or press Enter to skip):
> Engineering manager at Acme Corp
✓ Remembered! "Engineering manager at Acme Corp" will be recognized in future transcripts.
```

#### 3. New Projects
When encountering unknown projects:

```
[New Project Detected]
Context: "...working on Project Alpha..."
Project name: "Project Alpha"

What is this project? (brief description, or press Enter to skip):
> Client engagement for Q1 2026
✓ Remembered! "Client engagement for Q1 2026" will be recognized in future transcripts.
```

#### 4. Technical Terms and Vocabulary
Protokoll learns domain-specific vocabulary:

```
[New Term Found]
Context: "...we built this using GraphQL..."
Term: "GraphQL"

What does this term mean? (brief description, or press Enter to skip):
> Query language for APIs
✓ Remembered! "Query language for APIs" will be recognized in future transcripts.
```

**Key Feature**: Once you define a term, Protokoll won't ask about it again. It's remembered forever.

#### 5. Routing Confirmation
When routing confidence is low (< 70%), Protokoll asks for confirmation:

```
[Confirm Note Routing]
Confidence: 65%
This note seems like it should go to:
"/home/user/work/notes"

Detected signals: client-meeting, quarterly-budget

Is this correct? (Y/Enter to accept, or enter different path):
> y
```

### How to Use Interactive Mode

Interactive mode is **enabled by default**. Simply run:

```bash
protokoll --input-directory ~/recordings
```

To disable interactive mode (for automation/cron jobs):

```bash
protokoll --input-directory ~/recordings --batch

# Or set in config
echo "interactive: false" >> ~/.protokoll/config.yaml
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

## Transcript Metadata

Every transcript includes structured metadata at the top in Markdown format. This makes your notes immediately actionable:

### Metadata Sections

Each transcript includes:

```markdown
# Meeting Title

## Metadata

**Date**: January 12, 2026
**Time**: 02:30 PM

**Project**: Project Alpha
**Project ID**: `proj-alpha`

### Routing

**Destination**: /home/user/work/notes
**Confidence**: 95.0%

**Classification Signals**:
- explicit phrase: "work meeting" (90% weight)
- associated person: "John Smith" (60% weight)

**Reasoning**: Matched by explicit phrase and associated person

**Tags**: `work`, `meeting`, `Q1-planning`

**Duration**: 12m 45s

---

# Your Transcript Content Here
```

### Metadata Fields

| Field | Description |
|-------|-------------|
| **Title** | Auto-detected from content or audio filename |
| **Date** | Recording date in human-readable format |
| **Time** | Recording time with AM/PM |
| **Project** | Detected project if matched by routing |
| **Project ID** | Internal project identifier |
| **Destination** | Final routing location |
| **Confidence** | Routing confidence score (0-100%) |
| **Classification Signals** | Individual signals that influenced routing with weights |
| **Reasoning** | Explanation of routing decision |
| **Tags** | Auto-extracted from signals (people, companies, topics) |
| **Duration** | Audio duration in human-readable format |

### Using Metadata

The metadata section helps you:

- **Understand routing decisions**: See exactly why a note went to that folder
- **Track confidence**: Low confidence (< 70%) might need manual review
- **Find related notes**: Tags make searching across your note collection easier
- **Verify accuracy**: Check if the right project was detected
- **Archive intelligently**: Metadata makes automated archiving and organization possible

### Example: Routing Confidence

```markdown
**Confidence**: 65.2%
```

A low confidence score means:
- Note might need manual sorting
- Consider adding more context (people, projects) to improve detection
- Could be a boundary case between multiple projects

High confidence (> 85%) means:
- Routing is highly reliable
- Automatic processes can trust this decision

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

#### Smart Project Creation Issues

**"Smart assistance not available"**
- Ensure `OPENAI_API_KEY` is set in your environment
- Check that smart assistance is enabled in config or use `--smart` flag

**Slow sounds_like/trigger phrase generation**
- The first call may take a few seconds as the model generates variations
- Subsequent calls are typically faster
- Both sounds_like and trigger phrases are generated in parallel for efficiency

**URL fetch failing**
- Ensure network connectivity
- For private repositories, use local file paths instead
- Check that the URL is accessible (not behind authentication)

**Sounds like variants not matching your project**
- For Norwegian or non-English project names, you may need to manually add English phonetic variants
- Example: "Protokoll" might need "protocol", "pro to call" added manually

**Suggestions don't match my project**
- You can edit all suggestions before saving
- Try providing more context with a README or documentation file
- Adjust the topics and description manually as needed

### Debug Mode

Run with `--debug` to see all intermediate files:

```bash
protokoll --input-directory ~/recordings --debug --verbose
```

Check `./output/protokoll/` for:
- Raw transcripts
- LLM requests/responses
- Routing decisions

## MCP Server Integration

Protokoll can run as an MCP (Model Context Protocol) server, allowing AI assistants like Cursor and Claude to interact with transcription and context management directly—without needing to understand command-line interfaces.

### Why MCP?

Traditional workflow:
1. Open terminal
2. Navigate to directory
3. Remember command syntax
4. Copy-paste file paths
5. Run commands

With MCP, you can use natural language:
- *"Can you transcribe this meeting recording?"*
- *"Add Sanjay Gupta as a person - Whisper mishears him as 'San Jay Grouper'"*  
- *"This should be in the Quantum Readiness project"*

The AI handles all the details.

### Project-Aware Configuration

**Important**: Protokoll supports multiple project configurations. When you have different `.protokoll` directories for different projects, the MCP server intelligently discovers and uses the right configuration.

#### How It Works

When you ask to transcribe a file, the AI:

1. **Discovers configurations** - Walks up the directory tree to find `.protokoll` directories
2. **Suggests projects** - Analyzes the file path to determine which project it likely belongs to
3. **Asks for clarification** - If ambiguous, asks which project to use
4. **Processes with context** - Uses the appropriate configuration for transcription

#### Example: Ambiguous Location

```
User: Can you transcribe ~/Downloads/meeting.m4a?

AI: I found your Protokoll configuration with 3 projects configured. 
    Based on the file location in Downloads, I can't automatically 
    determine which project this belongs to. Is this for:
    1. Client Alpha
    2. Internal Notes
    3. Personal
    Which project should I use?

User: It's for Client Alpha

AI: Got it! Processing with Client Alpha configuration...
    [transcribes and routes to ~/notes/client-alpha/]
```

#### Example: Clear Location

```
User: Transcribe ~/work/client-alpha/recordings/standup.m4a

AI: Found Client Alpha configuration nearby. Processing...
    [automatically uses the right config and routing]
```

### Available MCP Tools

| Tool | Purpose |
|------|---------|
| **Discovery** | |
| `protokoll_discover_config` | Find .protokoll configurations for a file/directory |
| `protokoll_suggest_project` | Determine which project a file belongs to |
| **Transcription** | |
| `protokoll_process_audio` | Process a single audio file |
| `protokoll_batch_process` | Process all audio files in a directory |
| **Context Management** | |
| `protokoll_context_status` | Get status of the context system |
| `protokoll_list_projects` | List all configured projects |
| `protokoll_list_people` | List all people in context |
| `protokoll_list_terms` | List technical terms |
| `protokoll_list_companies` | List companies |
| `protokoll_search_context` | Search across all entity types |
| `protokoll_get_entity` | Get detailed info about an entity |
| `protokoll_add_person` | Add a new person to context |
| `protokoll_add_project` | Add a new project |
| `protokoll_add_term` | Add a technical term |
| `protokoll_add_company` | Add a company |
| `protokoll_delete_entity` | Delete an entity |
| **Transcript Actions** | |
| `protokoll_read_transcript` | Read and parse a transcript file |
| `protokoll_edit_transcript` | Edit title or change project |
| `protokoll_combine_transcripts` | Combine multiple transcripts |
| `protokoll_provide_feedback` | Natural language feedback to correct transcripts |

### Setup

Add Protokoll to your MCP configuration:

**One-Time Setup (works for all projects):**

```json
{
  "mcpServers": {
    "protokoll": {
      "command": "npx",
      "args": ["-y", "-p", "@redaksjon/protokoll", "protokoll-mcp"]
    }
  }
}
```

Or if installed globally (`npm install -g @redaksjon/protokoll`):

```json
{
  "mcpServers": {
    "protokoll": {
      "command": "protokoll-mcp"
    }
  }
}
```

**For Cursor:** Add to `~/.cursor/mcp.json`

**For Claude Desktop:** Add to `~/Library/Application Support/Claude/claude_desktop_config.json`

### Example Conversations

**Basic Transcription:**
```
User: Transcribe ~/recordings/standup.m4a

AI: [discovers config, suggests project]

Done! Transcript saved to ~/notes/2026/01/16-0900-standup.md
    Project: Daily Standups (95% confidence)
    People recognized: Sarah Chen, Mike Johnson
```

**Add Context:**
```
User: "San Jay" should be "Sanjay Gupta" - he's a product manager at Acme

AI: [calls protokoll_add_person]

Added Sanjay Gupta to your context. Future transcripts will 
    recognize "San Jay", "Sanjay", and similar variations.
```

**Provide Feedback:**
```
User: In that last transcript, WCMP should be WCNP

AI: [calls protokoll_provide_feedback]

Fixed! I replaced "WCMP" with "WCNP" (3 occurrences) and added 
    WCNP to your vocabulary for future transcripts.
```

**Combine Transcripts:**
```
User: Combine these three meeting parts into one:
      ~/notes/meeting-part1.md
      ~/notes/meeting-part2.md
      ~/notes/meeting-part3.md

AI: [calls protokoll_combine_transcripts]

Combined into ~/notes/16-1400-full-meeting.md
    The source files have been deleted.
```

### Configuration Hierarchy

The MCP server respects Protokoll's hierarchical configuration:

```
~/
├── .protokoll/              # Global config (shared context)
│   ├── config.yaml
│   ├── people/              # People you mention across all projects
│   └── companies/
└── work/
    └── client-alpha/
        └── .protokoll/      # Project-specific (overrides global)
            ├── config.yaml  # Client-specific settings
            ├── people/      # Client Alpha contacts
            └── projects/    # Routing for this client
```

When processing a file, the nearest `.protokoll` takes precedence, but inherits from parent directories.

### Best Practices

1. **Create project-specific configs** when you have different routing needs
2. **Use global config** for shared context (common terms, general contacts)
3. **Let the AI discover** - it will ask when clarification is needed
4. **Accept context suggestions** - when the AI offers to add terms/people, accept the suggestions

For complete documentation, see the [MCP Integration Guide](./guide/mcp-integration.md).

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

### Real-World Scenarios

#### Scenario 1: Product Manager with Multiple Projects

You're juggling three client projects. You record a 10-minute voice memo about budget discussions with Acme Corp and a feature request from their engineering lead Priya.

```bash
protokoll --input-directory ~/inbox
```

**What happens:**
- Whisper mishears "Priya" as "pria"
- Your context has `sounds_like: ["pria", "pre a"]` → Correctly expanded to "Priya Sharma"
- Content mentions Acme Corp → Automatically routes to `~/clients/acme-corp/notes/2026/01/`
- File created: `260112-1430-budget-and-feature-request.md`
- You spend 0 seconds organizing—it's already perfect

#### Scenario 2: Research Interviews

You're doing research interviews with 15 participants. Names are hard, contexts matter, you want participant notes grouped by topic.

```bash
# First interview: interactive mode to set up participants
protokoll --input-directory ~/interviews/batch-1 --interactive

# Subsequent interviews: automatic
protokoll --input-directory ~/interviews/batch-2
protokoll --input-directory ~/interviews/batch-3
```

**What happens:**
- Each participant is in your context with phonetic variants
- Topics (like "business model" or "user retention") are detected
- Files organize by date: `~/interviews/2026/01/260111-1430-participant-03.md`
- All names are perfectly spelled, all context is preserved

#### Scenario 3: Engineering Team

Your team records technical discussions. You want them automatically organized by project.

```bash
# Team context: shared ~team/.protokoll/projects/
protokoll --input-directory ~/team/recordings
```

**What happens:**
- Discussion mentions "Project Atlas" → Routes to `~/projects/atlas/notes/`
- Team members (Sarah, Dmitri, etc.) are in context → Names are correct
- Technical terms (Kubernetes, gRPC, etc.) are in vocabulary → Spelled correctly
- Entire team's recordings automatically organized by project

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
