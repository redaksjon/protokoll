# Routing System

The routing system determines where transcribed notes should be saved.

## Overview

Protokoll uses multi-signal classification to route notes:

1. Analyzes transcript text for project signals
2. Matches against configured triggers in project files
3. Builds output path using Dreadcabinet patterns

## Default Output Configuration

The default output location is set in the main config:

```yaml
# ~/.protokoll/config.yaml
outputDirectory: "~/notes"
outputStructure: "month"
outputFilenameOptions:
  - date
  - time
  - subject
```

This is where notes go when no project matches.

## Project-Specific Routing

To route notes to different destinations based on content, create **project files** in your context directory:

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
    - "roadmap"
  associated_people:
    - "colleague-id"
  associated_companies:
    - "acme-corp"

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

### Another Example

```yaml
# ~/.protokoll/projects/personal.yaml
id: personal
name: Personal Notes
type: project

classification:
  context_type: personal
  explicit_phrases:
    - "personal note"
    - "reminder to self"
    - "shopping list"

routing:
  destination: "~/notes/personal"
  structure: "day"
  filename_options:
    - date
    - subject

active: true
```

## Structures

Protokoll uses Dreadcabinet structure codenames:

| Structure | Example Path | Description |
|-----------|--------------|-------------|
| `none` | `notes/meeting.md` | Flat directory |
| `year` | `notes/2026/meeting.md` | Year subdirectory |
| `month` | `notes/2026/01/meeting.md` | Year/month subdirectories |
| `day` | `notes/2026/01/11/meeting.md` | Year/month/day subdirectories |

## Filename Options

| Option | Example | Description |
|--------|---------|-------------|
| `date` | `260111` | YYMMDD format |
| `time` | `1430` | HHmm format |
| `subject` | `meeting-notes` | Derived from content |

Combined example: `260111-1430-meeting-notes.md`

## Classification Signals

The classifier looks for multiple signals in project files:

### 1. Explicit Phrases

High-confidence trigger phrases:

```yaml
classification:
  explicit_phrases:
    - "work note"           # Exact phrase
    - "about project alpha" # Project mention
```

### 2. Associated People

If a person is mentioned and linked to a project:

```yaml
classification:
  associated_people:
    - "priya-sharma"  # Person ID
```

Mentioning that person increases confidence for the project.

### 3. Topic Keywords

General topic keywords:

```yaml
classification:
  topics:
    - "budget"
    - "roadmap"
    - "quarterly"
```

### 4. Context Type

General category:

```yaml
classification:
  context_type: "work"  # or "personal", "mixed"
```

## Confidence Scoring

Each signal contributes to a confidence score:

| Signal | Weight |
|--------|--------|
| Explicit phrase match | 0.8 |
| Associated person | 0.3 |
| Topic keyword | 0.2 |
| Context type match | 0.1 |

The project with highest confidence wins.

## API

### RoutingInstance

```typescript
interface RoutingInstance {
  // Route based on context
  route(context: RoutingContext): RouteDecision;
  
  // Build output path from decision
  buildOutputPath(decision: RouteDecision, context: RoutingContext): string;
}

interface RouteDecision {
  projectId: string | null;
  destination: RouteDestination;
  confidence: number;
  signals: ClassificationSignal[];
  reasoning: string;
}
```

## Examples

### Work vs Personal

Main config (default destination):

```yaml
# ~/.protokoll/config.yaml
outputDirectory: "~/notes/personal"
outputStructure: "month"
```

Work project file:

```yaml
# ~/.protokoll/projects/work.yaml
id: work
name: Work
type: project

classification:
  context_type: work
  explicit_phrases:
    - "work"
    - "office"
    - "standup"
    - "meeting with"

routing:
  destination: "~/work/notes"
  structure: "day"
  filename_options:
    - date
    - time
    - subject

active: true
```

Recording: "This is a note about the standup meeting..."
→ Routes to: `~/work/notes/2026/01/11/260111-0930-standup-meeting.md`

Recording: "Reminder to buy groceries..."
→ Routes to: `~/notes/personal/2026/01/260111-groceries.md` (default)

### Multiple Projects

```yaml
# ~/.protokoll/projects/project-alpha.yaml
id: project-alpha
name: Project Alpha
type: project

classification:
  context_type: work
  explicit_phrases:
    - "project alpha"
    - "alpha team"

routing:
  destination: "~/work/alpha/notes"
  structure: "month"
  filename_options:
    - date
    - time
    - subject

active: true
```

```yaml
# ~/.protokoll/projects/project-beta.yaml
id: project-beta
name: Project Beta
type: project

classification:
  context_type: work
  explicit_phrases:
    - "project beta"
    - "beta launch"

routing:
  destination: "~/work/beta/notes"
  structure: "month"
  filename_options:
    - date
    - time
    - subject

active: true
```

## Troubleshooting

### Notes Going to Wrong Project

1. Check `explicit_phrases` match your speech patterns
2. Add more specific phrases
3. Use `--debug` to see classification scores

### Notes Going to Default

1. Verify project files are in `.protokoll/projects/`
2. Check `active: true` is set
3. Ensure phrases are case-insensitive matches
4. Add more phrase variations

### Path Not Created

Directories are created automatically. If they're not:

1. Check write permissions on parent directory
2. Use `--verbose` to see directory creation logs

## See Also

- [Transcript Actions](./action.md) - Edit transcripts and change their project routing after creation
- [Context System](./context-system.md) - How context storage works
- [Configuration](./configuration.md) - All configuration options
