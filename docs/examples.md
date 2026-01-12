# Protokoll Usage Examples

## Scenario 1: Daily Voice Notes

You record voice notes during your commute. Want them organized by date.

```bash
# Simple daily processing
protokoll --input-directory ~/Voice\ Memos --output-directory ~/notes

# Result: ~/notes/2026/01/11-commute-thoughts.md
```

## Scenario 2: Work Project Notes

Notes about specific work projects should go to project directories.

```yaml
# ~/.protokoll/config.yaml
routing:
  projects:
    - projectId: "projectA"
      destination:
        path: "~/work/projectA/notes"
        structure: "month"
      triggers:
        - "projectA note"
        - "about projectA"
```

```bash
# Your recording: "This is a note about projectA..."
protokoll --input-directory ~/recordings

# Result: ~/work/projectA/notes/2026/01-meeting.md
```

## Scenario 3: Learning New Names

First time mentioning a colleague in recordings.

```bash
# Interactive mode
protokoll --input-directory ~/recordings --interactive

# Protokoll asks:
# "Unknown name 'Sarah Chen'. Correct spelling?"
# You answer, it remembers for next time
```

## Scenario 4: Debugging Issues

Something isn't working right.

```bash
protokoll --input-directory ~/recordings \
  --debug \
  --self-reflection \
  --verbose

# Check output/protokoll/ for:
# - Raw Whisper output
# - LLM requests/responses
# - Self-reflection report
```

## Scenario 5: Multiple Projects

You work on several projects and want automatic routing.

```yaml
# ~/.protokoll/config.yaml
routing:
  default:
    path: "~/notes/personal"
    structure: "month"
  
  projects:
    - projectId: "work"
      destination:
        path: "~/work/notes"
        structure: "month"
      triggers:
        - "work note"
        - "office meeting"
        - "standup"
    
    - projectId: "side-project"
      destination:
        path: "~/projects/side-project/notes"
        structure: "day"
      triggers:
        - "side project"
        - "weekend coding"
```

```bash
# All recordings get routed automatically
protokoll --input-directory ~/recordings --recursive
```

## Scenario 6: Team Context

Share context across a team project.

```yaml
# ~/team-project/.protokoll/people/alice.yaml
id: alice
name: Alice Johnson
role: Tech Lead
sounds_like:
  - "alice"
  - "al"
context: "Project tech lead"

# ~/team-project/.protokoll/people/bob.yaml
id: bob
name: Bob Smith
role: Designer
sounds_like:
  - "bob"
  - "bobby"
context: "UI/UX designer"
```

```bash
# Process from within project directory
cd ~/team-project
protokoll --input-directory ./recordings

# Protokoll finds .protokoll/ context automatically
```

## Scenario 7: Batch Processing

Process a backlog of recordings overnight.

```bash
# Process all recordings without interaction
protokoll --input-directory ~/backlog \
  --batch \
  --recursive \
  --output-directory ~/processed-notes

# Or with a delay to avoid rate limits
protokoll --input-directory ~/backlog --batch
```

## Scenario 8: Quality Review

Review transcription quality after processing.

```bash
# Enable self-reflection
protokoll --input-directory ~/recordings --self-reflection

# Check the reflection report
cat output/protokoll/*-reflection.md
```

Example output:
```markdown
# Protokoll - Self-Reflection Report

## Summary
- Duration: 12.5s
- Iterations: 8
- Tool Calls: 5
- Confidence: 94.2%

## Recommendations
### 🟢 Low Priority
1. **Processing took 12.5s**
   - Consider reducing max iterations for shorter transcripts
```

## Scenario 9: Custom Model Selection

Use different models for different quality/speed tradeoffs.

```bash
# Fast processing with smaller model
protokoll --input-directory ~/quick-notes --model gpt-4o-mini

# High quality with larger model
protokoll --input-directory ~/important-meetings --model claude-3-5-sonnet

# Use latest transcription model
protokoll --input-directory ~/recordings --transcription-model gpt-4o-transcribe
```

## Scenario 10: Hierarchical Context

Use global and project-specific context together.

```
~/.protokoll/                    # Global context
├── config.yaml
├── people/
│   └── family-members.yaml
└── terms/
    └── common-terms.yaml

~/work/.protokoll/               # Work-specific context
├── config.yaml                  # Overrides global
├── people/
│   └── colleagues.yaml
└── projects/
    └── current-project.yaml

~/work/project-a/.protokoll/     # Project-specific context
├── people/
│   └── project-team.yaml
└── terms/
    └── project-jargon.yaml
```

```bash
# When processing from ~/work/project-a/recordings/
# Protokoll merges context from all three levels
cd ~/work/project-a
protokoll --input-directory ./recordings
```

