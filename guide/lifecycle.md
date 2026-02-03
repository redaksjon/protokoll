# Transcript Lifecycle & Task Management

## Overview

Protokoll tracks the lifecycle of each transcript through states that help you manage your workflow and know what needs attention. You can also attach follow-up tasks to any transcript.

## Lifecycle States

| Status | Description |
|--------|-------------|
| `initial` | Whisper transcription complete |
| `enhanced` | Context-aware enhancement complete |
| `reviewed` | User has reviewed the transcript |
| `in_progress` | Has outstanding tasks to complete |
| `closed` | All work complete, no pending tasks |
| `archived` | Archived for long-term storage |

### State Flow

```
initial → enhanced → reviewed → closed → archived
                         ↓
                    in_progress
                         ↓
                       closed
```

- Backwards transitions are allowed (e.g., reopen a closed transcript)
- Status changes are recorded with timestamps in the transition history

## CLI Commands

### Status Management

```bash
# Set transcript status
protokoll status set <path> <status>

# Show transcript status and history
protokoll status show <path>
```

**Examples:**

```bash
protokoll status set meeting-notes.md closed
protokoll status set 2026/02/03-meeting.md in_progress
protokoll status show planning-session.md
```

### Task Management

```bash
# Add a task
protokoll task add <path> "<description>"

# Complete a task
protokoll task complete <path> <task-id>

# Delete a task
protokoll task delete <path> <task-id>

# List tasks
protokoll task list <path>
```

**Examples:**

```bash
protokoll task add meeting.md "Write follow-up email"
protokoll task complete meeting.md task-1234567890-abc123
protokoll task list meeting.md
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `protokoll_set_status` | Change transcript status |
| `protokoll_create_task` | Add a task |
| `protokoll_complete_task` | Mark task done |
| `protokoll_delete_task` | Remove a task |

### Tool Schemas

**protokoll_set_status:**
```json
{
  "transcriptPath": "path/to/transcript.md",
  "status": "in_progress"
}
```

**protokoll_create_task:**
```json
{
  "transcriptPath": "path/to/transcript.md",
  "description": "Follow up with client"
}
```

**protokoll_complete_task / protokoll_delete_task:**
```json
{
  "transcriptPath": "path/to/transcript.md",
  "taskId": "task-1234567890-abc123"
}
```

## File Format

Lifecycle data is stored in YAML frontmatter:

```yaml
---
title: Meeting Notes
status: in_progress
history:
  - from: reviewed
    to: in_progress
    at: "2026-02-03T10:00:00Z"
tasks:
  - id: task-1234567890-abc123
    description: Send meeting summary
    status: open
    created: "2026-02-03T10:00:00Z"
entities:
  people:
    - id: john-doe
      name: John Doe
      type: person
---

Transcript content here...
```

## Programmatic API

### Types

```typescript
type TranscriptStatus = 'initial' | 'enhanced' | 'reviewed' | 'in_progress' | 'closed' | 'archived';

interface StatusTransition {
  from: TranscriptStatus;
  to: TranscriptStatus;
  at: string; // ISO 8601 timestamp
}

interface Task {
  id: string;
  description: string;
  status: 'open' | 'done';
  created: string;
  changed?: string;
  completed?: string;
}
```

### Functions (from `@/util/metadata`)

```typescript
// Update status with automatic history tracking
updateStatus(metadata: TranscriptMetadata, newStatus: TranscriptStatus): TranscriptMetadata

// Create a new task
createTask(description: string): Task

// Add task to metadata
addTask(metadata: TranscriptMetadata, description: string): { metadata: TranscriptMetadata; task: Task }

// Complete a task
completeTask(metadata: TranscriptMetadata, taskId: string): TranscriptMetadata

// Delete a task
deleteTask(metadata: TranscriptMetadata, taskId: string): TranscriptMetadata
```

## Workflow Examples

### AI Assistant Workflow

```typescript
// After reviewing a transcript, determine next action
const transcript = await callTool('protokoll_read_transcript', { transcriptPath: path });

if (hasActionItems(transcript.content)) {
  // Has action items - create tasks and move to in_progress
  await callTool('protokoll_create_task', { 
    transcriptPath: path, 
    description: 'Review action items' 
  });
  await callTool('protokoll_set_status', { 
    transcriptPath: path, 
    status: 'in_progress' 
  });
} else {
  // No action needed - close
  await callTool('protokoll_set_status', { 
    transcriptPath: path, 
    status: 'closed' 
  });
}
```

### Filtering by Status

In the VS Code extension, filter transcripts by status to focus on what needs attention:
- `reviewed` - Ready for action
- `in_progress` - Active work
- `closed` - Completed work
