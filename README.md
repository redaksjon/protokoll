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

- **🧠 Learns Your World**: Maintains a knowledge base of people, projects, and organizations you mention. When Whisper mishears someone, Protokoll recognizes and corrects it using phonetic variants and context awareness
- **🎯 Routes Intelligently**: Multi-signal classification sends notes to the right destination—work notes stay in your work folder, client calls go to client projects, personal thoughts go to personal notes
- **📝 Preserves Everything**: This is NOT a summarizer. Protokoll preserves the full content of what you said while cleaning up filler words, false starts, and obvious transcription errors
- **📚 Improves Over Time**: The more you use it, the smarter it gets. Build context incrementally and watch transcription quality improve session after session
- **⚡ Zero Configuration Start**: Works out of the box with sensible defaults. No API wrestling, no complex setup—just transcribe

## The Core Philosophy: Context You Own and Control

**The most important feature of Protokoll is not transcription—it's learning.**

When you first start using Protokoll, it doesn't know anything about you. It doesn't know that "Project Alpha" is a client engagement you're working on, that "Priya" is your colleague, or that notes about "skiing" should go to your personal folder while notes about "quarterly planning" should go to a work project.

**But that's the point.** Protokoll is designed to learn from you:

1. **Interactive Discovery**: When you run `protokoll --interactive` and mention "Project Alpha" for the first time, the system recognizes it doesn't know what that is. It asks: *"Is Project Alpha a new project? Where should notes about it be stored?"* You tell it, and from that moment forward, every note mentioning Project Alpha routes correctly.

2. **Context Files You Own**: Unlike cloud transcription services that keep your data in their black box, Protokoll stores everything it learns in simple YAML files in your `.protokoll/context/` directory:

   ```yaml
   # .protokoll/context/projects/project-alpha.yaml
   id: project-alpha
   name: Project Alpha
   classification:
     context_type: work
     explicit_phrases: ["project alpha", "update on alpha"]
     topics: ["client engagement", "Q1 planning"]
   routing:
     destination: ~/notes/projects/alpha
     structure: month
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

✅ **Product Managers**: Record customer conversations, feature ideas, meeting notes—Protokoll routes them to projects automatically

✅ **Researchers**: Capture interview insights, lab notes, findings—build a growing knowledge base that improves over time

✅ **Authors & Creators**: Dictate ideas, chapter notes, research—get organized files without manual organization

✅ **Managers**: Record 1-on-1s, team meetings, strategy sessions—automatic routing means they're never lost

✅ **Teams**: Self-hosted means your transcripts never leave your server—perfect for regulated industries

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
destination: ~/work/notes
triggers:
  - "work note"
  - "work meeting"
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

### How to Enable Interactive Mode

```bash
# Single run with interactive mode
protokoll --input-directory ~/recordings --interactive

# Set as default in config
echo "interactive: true" >> ~/.protokoll/config.yaml
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
