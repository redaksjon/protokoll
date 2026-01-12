# Routing System

The routing system determines where transcribed notes should be saved.

## Overview

Protokoll uses multi-signal classification to route notes:

1. Analyzes transcript text for project signals
2. Matches against configured triggers
3. Builds output path using Dreadcabinet patterns

## Configuration

### Default Routing

```yaml
# ~/.protokoll/config.yaml
routing:
  default:
    path: "~/notes"
    structure: "month"
    filename:
      - date
      - time
      - subject
```

### Project-Specific Routing

```yaml
routing:
  projects:
    - projectId: "work"
      destination:
        path: "~/work/notes"
        structure: "month"
      triggers:
        - "work note"
        - "about work"
        - "office meeting"
      priority: 10
    
    - projectId: "personal"
      destination:
        path: "~/notes/personal"
        structure: "day"
      triggers:
        - "personal note"
        - "reminder to self"
      priority: 5
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

The classifier looks for multiple signals:

### 1. Explicit Triggers

```yaml
triggers:
  - "work note"           # Exact phrase
  - "about project alpha" # Project mention
```

### 2. Associated People

If a person is associated with a project:

```yaml
# Person file
company: acme-corp
projects:
  - quarterly-planning
```

Mentioning that person increases confidence for those projects.

### 3. Topic Keywords

Projects can define topic keywords:

```yaml
topics:
  - "budget"
  - "roadmap"
  - "quarterly"
```

### 4. Context Type

```yaml
category: "work"  # or "personal", "mixed"
```

## Confidence Scoring

Each signal contributes to a confidence score:

| Signal | Weight |
|--------|--------|
| Explicit trigger match | 0.8 |
| Associated person | 0.3 |
| Topic keyword | 0.2 |
| Context type match | 0.1 |

The project with highest confidence wins.

## API

### RoutingInstance

```typescript
interface RoutingInstance {
  // Classify text for project signals
  classify(text: string): ProjectClassification[];
  
  // Route to destination
  route(text: string, config: RoutingConfig): RouteDestination;
}

interface RouteDestination {
  projectId: string | null;
  path: string;
  structure: FilesystemStructure;
  confidence: number;
}
```

## Examples

### Work vs Personal

```yaml
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
        - "standup"
        - "meeting with"
```

Recording: "This is a note about the standup meeting..."
→ Routes to: `~/work/notes/2026/01/11/standup-meeting.md`

Recording: "Reminder to buy groceries..."
→ Routes to: `~/notes/personal/2026/01/groceries.md`

### Multiple Projects

```yaml
routing:
  projects:
    - projectId: "project-alpha"
      destination:
        path: "~/work/alpha/notes"
      triggers:
        - "project alpha"
        - "alpha team"
      priority: 10
    
    - projectId: "project-beta"
      destination:
        path: "~/work/beta/notes"
      triggers:
        - "project beta"
        - "beta launch"
      priority: 10
```

## Troubleshooting

### Notes Going to Wrong Project

1. Check trigger phrases match your speech patterns
2. Add more specific triggers
3. Use `--debug` to see classification scores

### Notes Going to Default

1. Verify project config is loaded
2. Check triggers are case-insensitive matches
3. Add more trigger variations

### Path Not Created

```yaml
routing:
  default:
    createDirectories: true  # Ensure this is set
```

