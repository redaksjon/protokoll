# Interactive Mode

Interactive mode allows Protokoll to learn from you as it processes transcripts.

## Overview

When enabled, Protokoll will:

1. Pause when encountering unknown names
2. Ask for correct spellings
3. Offer to remember new entities
4. Request routing clarification

**Note**: Interactive mode is **enabled by default**. Use `--batch` to disable it for automation.

## Disabling Interactive Mode

For automation or cron jobs, disable interactive prompts:

```bash
protokoll --batch --input-directory ./recordings
```

Or in config:

```yaml
# ~/.protokoll/config.yaml
interactive: false
```

## Clarification Types

### Name Spelling

```
Name Clarification Needed

Context: "...meeting with pre a about..."
Detected: "pre a"
Suggested: "Priya"

? Enter correct spelling: Priya Sharma
? Remember this for future? Yes
```

### New Person

```
New Person Detected

Name: Priya Sharma

? Company (optional): Acme Corp
? Role (optional): Engineering Manager
? Add to context? Yes
```

### Routing Decision

```
Routing Clarification

Content mentions: "quarterly planning"

? Which project should this go to?
  > work
    personal
    quarterly-planning
    (default)
```

## Session Recording

All clarifications are recorded in the session file:

```json
// output/protokoll/260111-1245-abc123-session.json
{
  "requests": [
    {
      "type": "name_spelling",
      "term": "pre a",
      "suggestion": "Priya"
    }
  ],
  "responses": [
    {
      "type": "name_spelling",
      "term": "pre a",
      "response": "Priya Sharma",
      "shouldRemember": true
    }
  ]
}
```

## Non-Interactive Mode (Batch)

For automation, run without prompts using `--batch`:

```bash
protokoll --batch --input-directory ./recordings
```

In non-interactive (batch) mode:
- Uses suggestions when available
- Skips unknown entities
- Uses default routing
- Still generates self-reflection reports

## First-Run Onboarding

On first run with interactive mode (the default) and no existing config:

```
Welcome to Protokoll!

It looks like this is your first time using Protokoll.
Let's set up some basics.

? Default notes directory: ~/notes
? Default structure: month
? Add any projects now? Yes

Project Setup

? Project name: Work
? Destination: ~/work/notes
? Trigger phrases: work, office, meeting
```

## API

### InteractiveInstance

```typescript
interface InteractiveInstance {
  // Session management
  startSession(): void;
  endSession(): InteractiveSession;
  getSession(): InteractiveSession | null;
  
  // Clarification handling
  handleClarification(request: ClarificationRequest): Promise<ClarificationResponse>;
  
  // State
  isEnabled(): boolean;
  
  // Onboarding
  checkNeedsOnboarding(): OnboardingState;
}
```

### ClarificationRequest

```typescript
interface ClarificationRequest {
  type: ClarificationType;
  context: string;
  term: string;
  suggestion?: string;
  options?: string[];
}

type ClarificationType = 
  | 'name_spelling'
  | 'new_person'
  | 'new_project'
  | 'new_company'
  | 'routing_decision'
  | 'first_run_onboarding'
  | 'general';
```

## Session Tracking & Progress

### Per-File Progress Monitoring

Every interactive prompt now shows your progress:

```
[File: recording1.m4a] [Prompts: 5]
(Type 'S' to skip remaining prompts for this file)
```

This helps you understand:
- Which file you're currently working on
- How many questions you've answered for this file
- The option to skip ahead

### Skip Rest of File

When you've had enough prompts for a particular file:

```bash
> S   # or "skip"

[Skipping remaining prompts for this file...]
```

**When to use:**
- File has too many unknown terms
- You want to process it later
- You've answered enough questions already

The file will still be transcribed fully - you just won't get more prompts for it.

### Session Summary Report

At the end of every interactive session, you get a comprehensive summary:

```
═══════════════════════════════════════════════════════════
  INTERACTIVE SESSION SUMMARY
═══════════════════════════════════════════════════════════

Duration: 12m 34s
Total prompts answered: 18

────────────────────────────────────────────────────────────
  FILES PROCESSED
────────────────────────────────────────────────────────────

1. /recordings/meeting1.m4a
   Prompts answered: 8
   Status: Completed
   Transcript: ~/notes/2026/01/2026-01-18_Meeting_Notes.md
   Audio moved to: ~/archive/2026/01/meeting1.m4a

2. /recordings/ideas.m4a
   Prompts answered: 5
   Status: SKIPPED (user requested)
   Transcript: ~/notes/2026/01/2026-01-18_Quick_Ideas.md

3. /recordings/project-update.m4a
   Prompts answered: 5
   Status: Completed
   Transcript: ~/notes/2026/01/2026-01-18_Project_Update.md

────────────────────────────────────────────────────────────
  CHANGES MADE
────────────────────────────────────────────────────────────

✓ Terms added (5):
  - Kubernetes
  - Docker
  - GraphQL
  - React
  - PostgreSQL

✓ Terms updated (2):
  - AWS
  - API

✓ Projects added (2):
  - Project Alpha
  - Client Beta

✓ Aliases created (3):
  - "K8s" → "Kubernetes"
  - "Postgres" → "PostgreSQL"
  - "Chronology" → "Kronologi"

✓ People added (1):
  - Priya Sharma

═══════════════════════════════════════════════════════════
```

**Summary includes:**
- Session duration and total prompts
- Each file with prompt counts, status, and output paths
- All changes made to context (terms, projects, people, aliases)

### Mid-Session Stop

Press `Ctrl+C` at any time to stop and see the summary:

```bash
^C
[Session interrupted by user]

═══════════════════════════════════════════════════════════
  INTERACTIVE SESSION SUMMARY
═══════════════════════════════════════════════════════════
...
```

All progress is automatically saved. Resume processing later.

## Streamlined Learning Flow

### Smart Similarity Matching

Protokoll automatically detects similar existing terms:

```
────────────────────────────────────────────────────────────
[Unknown: "Chronology"]
────────────────────────────────────────────────────────────

Found similar term(s): Kronologi
Is "Chronology" the same as "Kronologi"? (Y/N): Y

info: Added alias "Chronology" → "Kronologi"
```

Prevents duplicate entries for similar spellings!

### Automated Content Analysis

Instead of answering multiple questions manually, provide documentation:

```
────────────────────────────────────────────────────────────
[Unknown: "Cursor"]
────────────────────────────────────────────────────────────

[How should I learn about this?]
Options:
  1. Provide a file path
  2. Provide a URL
  3. Paste text directly
  4. Enter details manually

Enter 1-4, or paste path/URL directly: https://cursor.com

Fetching and analyzing...

────────────────────────────────────────────────────────────
[Analysis Results]
Type: TERM
Name: Cursor
Description: AI-powered code editor built on VS Code
Topics: ai, code-editor, vscode, development
Confidence: high
────────────────────────────────────────────────────────────

Use this? (Y/N): Y

Which project(s)?
  1. FjellGrunn
  2. Redaksjon
  3. Grunnverk
  
Enter numbers: 2

info: Added term "Cursor" to Redaksjon
```

**Three input methods:**

1. **File path**: `~/docs/project-info.md`
2. **URL**: `https://kubernetes.io/docs`
3. **Paste text**: Multi-line input

AI automatically extracts:
- Entity type (Project/Term)
- Correct name
- Description
- Topics
- Acronym expansions (if any)

**95% automated** - just point to documentation!

### Clean Project Selection

Project lists show only names:

```
Which project(s) is this related to?
  1. FjellGrunn
  2. Grunnverk
  3. Redaksjon
  N. Create new project
```

Much cleaner than long descriptions!

## Best Practices

1. **Start with interactive mode**: Build context quickly
2. **Use URL/file analysis**: Point to docs instead of typing
3. **Skip when overwhelmed**: Use 'S' to skip rest of file
4. **Review session summary**: See what was learned
5. **Periodic interactive runs**: Catch new names and terms

## Troubleshooting

### No Prompts Appearing

1. Check `--batch` flag is NOT set
2. Check config doesn't have `interactive: false`
3. Verify terminal supports prompts (TTY environment required)

### Too Many Prompts

1. Use 'S' to skip rest of current file
2. Add more context entries beforehand
3. Run with `--batch` for known content
4. Use URL/file analysis for bulk additions

### Session Summary Not Showing

1. Summary prints automatically at end of session
2. Press `Ctrl+C` to trigger summary mid-session
3. Check that interactive mode is enabled

### Analysis Failing

1. Ensure OPENAI_API_KEY is set
2. Check URL/file is accessible
3. Verify file format is supported (.md, .txt, .yaml, etc.)
4. Fall back to manual entry if needed

