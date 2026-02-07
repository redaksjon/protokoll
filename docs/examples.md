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

## Scenario 20: Non-Interactive Project Creation

Add projects automatically without confirming AI suggestions.

```bash
# Trust AI suggestions completely
protokoll project add --name "FjellGrunn" --yes

# With a source URL
protokoll project add https://github.com/myorg/myproject --name "My Project" --yes

# With local README
protokoll project add /path/to/README.md --name "Documentation" --yes
```

Result:
- AI generates phonetic variants automatically
- Trigger phrases generated without prompts
- Topics and description extracted (if source provided)
- Project saved immediately with all AI suggestions

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

## Scenario 11: Edit Transcript Title

Rename a transcript with a more meaningful title.

```bash
# Change title (updates document heading and filename)
protokoll action --title "Q1 Budget Review Meeting" ~/notes/2026/01/15-1412-meeting.md

# Preview changes first
protokoll action --title "Q1 Budget Review" ~/notes/file.md --dry-run --verbose
```

Result:
- Document heading changes to `# Q1 Budget Review Meeting`
- File renames to `15-1412-q1-budget-review-meeting.md`

## Scenario 12: Move Transcript to Different Project

Realize a transcript belongs to a different project.

```bash
# Move to different project (updates metadata and routes to project destination)
protokoll action --project client-alpha ~/notes/2026/01/15-1412-meeting.md

# Change both title and project
protokoll action --title "Alpha Kickoff" --project client-alpha ~/notes/file.md
```

Result:
- Metadata updated with new project name and ID
- File moved to project's configured destination
- Original file removed

## Scenario 13: Combine Multiple Transcripts

Merge several related transcripts from a long meeting.

```bash
# Combine with a custom title
protokoll action --title "Full Team Standup" --combine "~/notes/2026/01/15-1412-part1.md
~/notes/2026/01/15-1421-part2.md
~/notes/2026/01/15-1435-part3.md"

# Combine and assign to project
protokoll action --title "Sprint 42 Planning" --project sprint-42 --combine "~/notes/misc1.md
~/notes/misc2.md"

# Preview what would happen
protokoll action --combine "~/notes/files..." --dry-run --verbose
```

Result:
- Single combined transcript with custom title
- Sorted chronologically by timestamp
- Durations summed, tags deduplicated
- Source files automatically deleted

## Scenario 14: Reorganize Scattered Notes

Consolidate notes that were initially routed to the default location.

```bash
# Find notes that mention a specific topic
ls ~/notes/2026/01/*standards*.md

# Combine them into a project
protokoll action --title "Fellow Standards Discussion" --project fellow-standards --combine "~/notes/2026/01/15-1412-ne-4th-st-0.md
~/notes/2026/01/15-1421-dimension-talk.md
~/notes/2026/01/15-1435-standards-continued.md"
```

Result:
- All related notes combined into one comprehensive document
- Routed to the `fellow-standards` project destination
- Original scattered files cleaned up

## Scenario 15: Fix a Misheard Term

A technical term was transcribed incorrectly.

```bash
# The transcript has "WCMP" but should be "WCNP"
protokoll feedback ~/notes/2026/01/15-1412-meeting.md \
  -f "Everywhere it says WCMP, that should be WCNP - Acme's Native Cloud Platform"
```

Result:
- "WCMP" replaced with "WCNP" throughout the transcript
- "WCNP" added to your vocabulary with the full expansion
- Phonetic variants stored so it won't be misheard again

## Scenario 16: Fix a Misheard Name

A person's name was transcribed phonetically.

```bash
# The transcript has "San Jay Grouper" but should be "Sanjay Gupta"
protokoll feedback ~/notes/2026/01/15-1412-meeting.md \
  -f "San Jay Grouper is actually Sanjay Gupta"
```

Result:
- Name corrected throughout the transcript
- Variations like "San Jay" or "Sanjay Grouper" also fixed
- Person added to context for future recognition

## Scenario 17: Reassign to Different Project via Feedback

A transcript was routed to the wrong project.

```bash
# Interactive feedback
protokoll feedback ~/notes/2026/01/15-1412-meeting.md

# When prompted: "This should be in the Quantum Readiness project"
```

Result:
- Project metadata updated in the transcript
- File moved to the project's configured destination
- Filename updated according to project rules

## Scenario 18: Preview Feedback Changes

See what would happen without making changes.

```bash
# Dry run with verbose output
protokoll feedback ~/notes/2026/01/15-1412-meeting.md \
  -f "YB should be Wibey" \
  --dry-run --verbose
```

Output:
```
[Dry Run] Would apply the following changes:
  - Replaced "YB" with "Wibey" (3 occurrences)
  - Added term "Wibey" to context
```

## Scenario 19: Managing Project Classification

Modify how transcripts are matched and routed to projects.

```bash
# View current classification
protokoll project show work

# Add high-confidence trigger phrases
protokoll project edit work \
  --add-phrase "work meeting" \
  --add-phrase "office discussion" \
  --add-phrase "team standup"

# Add theme-based topics
protokoll project edit work \
  --add-topic sprint \
  --add-topic planning \
  --add-topic retrospective

# Associate people (when they're mentioned, route here)
protokoll project edit client-alpha \
  --add-person priya-sharma \
  --add-person john-smith

# Associate companies (when mentioned, route here)
protokoll project edit client-alpha \
  --add-company acme-corp

# Remove outdated elements
protokoll project edit work \
  --remove-phrase "old phrase" \
  --remove-topic "deprecated-topic"
```

Result:
- Classification rules updated
- Future transcripts use new matching criteria
- View with `protokoll project show work` to verify

## Scenario 19b: Get Help with Feedback

Not sure what feedback you can give.

```bash
# Show feedback examples
protokoll feedback --help-me

# Or during interactive session
protokoll feedback ~/notes/meeting.md
# Enter: "What kinds of feedback can I give?"
```

---

## Optional: Project Relationships

Use only if you have a clear parent/child hierarchy.

## Scenario 20: Parent-Child Project Relationships

You have a main project with subprojects.

```yaml
# Parent: ~/.protokoll/projects/redaksjon.yaml
id: redaksjon
name: Redaksjon
type: project
relationships:
  children:
    - protokoll
    - kronologi
    - observasjon
routing:
  destination: ~/work/redaksjon/notes
  structure: month
  filename_options: [date, time, subject]

# Child: ~/.protokoll/projects/kronologi.yaml  
id: kronologi
name: Kronologi
type: project
relationships:
  parent: redaksjon
  siblings:
    - protokoll
    - observasjon
classification:
  context_type: work
  topics:
    - git
    - history
  explicit_phrases:
    - "working on kronologi"
routing:
  destination: ~/work/redaksjon/kronologi/notes
  structure: month
  filename_options: [date, time, subject]
```

**Manage relationships:**
```bash
# Set parent and siblings
protokoll project edit kronologi \
  --parent redaksjon \
  --add-sibling protokoll \
  --add-sibling observasjon

# Add children to parent
protokoll project edit redaksjon \
  --add-child kronologi
```

Result:
- When transcribing in Redaksjon context, child projects get relationship bonus
- Helps disambiguation when projects have similar names
- View with `protokoll project show redaksjon` to see hierarchy

## Scenario 21: Smart Relationship Suggestions

When creating a new project, Protokoll analyzes existing projects and suggests relationships.

```bash
# Create a project with topics that suggest relationships
protokoll project add --name "Kronologi"
```

Interactive flow with smart suggestions:

```
[Add New Project]

Project name: Kronologi

[Generating phonetic variants...]
  • Calling AI model...
  kronologi,chronology,krono-logi,...(+8 more)

Sounds like (Enter for suggested, or edit):
> 

[Generating trigger phrases...]
  working on kronologi,kronologi project,...(+10 more)

Trigger phrases (Enter for suggested, or edit):
> 

Topic keywords:
  git,history,analysis
> 

[Suggested parent project: Redaksjon]
  Reason: topic "redaksjon-subproject" indicates subproject
  Confidence: high
Set "Redaksjon" as parent? (Y/n): y
  ✓ Parent set to "Redaksjon"

[Suggested sibling projects:]
  1. Protokoll (shares parent "redaksjon")
  2. Observasjon (shares parent "redaksjon")
Add siblings? (Enter numbers comma-separated, or Enter to skip): 1,2
  ✓ Added 2 siblings

[Suggested related terms:]
  1. Git (matches project topic)
  2. History (matches project topic)
Add related terms? (Enter numbers comma-separated, or Enter to skip): 1
  ✓ Added 1 related terms

Project "Kronologi" saved successfully.
```

Result:
- Relationships automatically suggested based on naming and topics
- Parent detected from "{parent}-subproject" topic pattern
- Siblings found by shared parent
- Related terms matched from project topics
- User can accept/reject each suggestion

**How it detects relationships:**
- **Parent**: Names containing parent name, `{parent}-subproject` topics, subdirectory destinations
- **Siblings**: Shared parent, significant topic overlap, same destination directory
- **Related Terms**: Terms in project name/description, matching topics
