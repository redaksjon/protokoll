# Feedback Command

Protokoll includes an intelligent `feedback` command that uses an agentic model to understand natural language feedback about your transcripts and take appropriate actions automatically.

## Overview

The feedback command allows you to describe problems with a transcript in plain English, and Protokoll will:

1. **Understand your feedback** using a reasoning model
2. **Take corrective actions** like fixing text, adding terms/people to context, or changing project assignments
3. **Learn for the future** by updating your context to prevent similar issues

## Basic Usage

```bash
protokoll feedback /path/to/transcript.md
```

This prompts you interactively:

```
────────────────────────────────────────────────────────────
[Feedback for: transcript.md]
────────────────────────────────────────────────────────────

Describe what needs to be corrected in natural language.
Examples:
  - "YB should be Wibey"
  - "San Jay Grouper is actually Sanjay Gupta"
  - "This should be in the Quantum Readiness project"
  - "What feedback can I give?" (for help)

What is your feedback? 
```

### Non-Interactive Mode

Provide feedback directly on the command line:

```bash
protokoll feedback /path/to/transcript.md -f "YB should be spelled Wibey"
```

### Preview Changes (Dry Run)

See what would happen without making changes:

```bash
protokoll feedback /path/to/transcript.md --dry-run -v
```

## What You Can Do

### 1. Fix Terms & Abbreviations

When you notice a term or abbreviation was transcribed incorrectly:

```bash
protokoll feedback /path/to/transcript.md
# "Everywhere it says WCMP, that should be WCNP - Walmart's Native Cloud Platform"
```

**What happens:**
1. Replaces "WCMP" with "WCNP" throughout the transcript
2. Adds "WCNP" to your context vocabulary with:
   - The correct spelling
   - The full expansion ("Walmart's Native Cloud Platform")
   - Phonetic variants so it won't be misheard again

### 2. Fix Names

When a person's name was transcribed incorrectly:

```bash
protokoll feedback /path/to/transcript.md
# "San Jay Grouper is actually Sanjay Gupta"
```

**What happens:**
1. Replaces "San Jay Grouper" with "Sanjay Gupta" throughout
2. Looks for variations like "San Jay", "Sanjay Grouper" and fixes those too
3. Adds "Sanjay Gupta" to your people context with phonetic variants

### 3. Change Project Assignment

When a transcript was routed to the wrong project:

```bash
protokoll feedback /path/to/transcript.md
# "This should be in the Quantum Readiness project"
```

**What happens:**
1. Updates the project metadata in the transcript
2. Moves the file to the project's configured destination
3. Renames the file according to the project's filename rules

### 4. Change Title

When you want a more descriptive title:

```bash
protokoll feedback /path/to/transcript.md
# "Change the title to Q1 Planning Session"
```

**What happens:**
1. Updates the document heading to `# Q1 Planning Session`
2. Renames the file to include the slugified title

### 5. General Text Corrections

For any other text that needs fixing:

```bash
protokoll feedback /path/to/transcript.md
# "Replace 'gonna' with 'going to' everywhere"
```

### 6. Get Help

If you're not sure what feedback you can give:

```bash
protokoll feedback --help-me
```

Or ask the system during an interactive session:

```bash
protokoll feedback /path/to/transcript.md
# "What kinds of feedback can I give?"
```

## Command Options

| Option | Short | Description |
|--------|-------|-------------|
| `--feedback <text>` | `-f` | Provide feedback directly (non-interactive) |
| `--model <model>` | `-m` | Reasoning model to use (default: gpt-5.2) |
| `--dry-run` | | Show what would happen without making changes |
| `--verbose` | `-v` | Show detailed output of each action |
| `--help-me` | | Show examples of feedback you can provide |

## How It Works

The feedback command uses an **agentic architecture** with specialized tools:

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Your Feedback  │ ──▶ │  Reasoning Model │ ──▶ │  Tool Calls    │
│  (plain text)   │     │  (understands)   │     │  (executes)    │
└─────────────────┘     └──────────────────┘     └────────────────┘
                                                        │
                        ┌───────────────────────────────┘
                        ▼
         ┌──────────────────────────────────────────────────┐
         │  Available Tools:                                 │
         │  • correct_text - Replace text in transcript     │
         │  • add_term - Add term to context                │
         │  • add_person - Add person to context            │
         │  • change_project - Update project assignment    │
         │  • change_title - Update document title          │
         │  • provide_help - Show helpful information       │
         └──────────────────────────────────────────────────┘
```

### Tool Execution Order

For comprehensive corrections, the system typically:

1. **First**: Makes text corrections (`correct_text`)
2. **Then**: Adds entities to context (`add_term`, `add_person`)
3. **Finally**: Updates metadata if needed (`change_project`, `change_title`)

### Example: Complete Term Correction

When you say: *"WCMP should be WCNP - Walmart's Native Cloud Platform"*

The model executes:

```
1. correct_text(find="WCMP", replace="WCNP", replace_all=true)
   → Replaced 3 occurrences

2. add_term(term="WCNP", definition="Walmart's Native Cloud Platform", 
            sounds_like=["WCMP", "W C M P", "double-u see em pee"])
   → Added term to context

3. complete(summary="Fixed WCMP→WCNP (3 occurrences) and added term to vocabulary")
   → Done
```

## Context Learning

When the feedback system adds entities to your context, they're stored in your `.protokoll` directory:

### Terms

```yaml
# ~/.protokoll/terms/wcnp.yaml
id: wcnp
name: WCNP
type: term
expansion: "Walmart's Native Cloud Platform"
sounds_like:
  - WCMP
  - W C M P
  - double-u see en pee
```

### People

```yaml
# ~/.protokoll/people/sanjay-gupta.yaml
id: sanjay-gupta
name: Sanjay Gupta
type: person
sounds_like:
  - San Jay Grouper
  - Sanjay Grouper
  - San Jay
role: Engineer
company: Acme Corp
```

## Verbose Mode

Use `-v` or `--verbose` to see what the system is doing:

```bash
protokoll feedback /path/to/transcript.md -f "YB should be Wibey" -v

[Processing feedback...]

[Executing: correct_text]
  ✓ Replaced "YB" → "Wibey" (2x)

[Executing: add_term]
  ✓ Added term: Wibey = "Correct spelling of YB"
    sounds_like: YB, Y B

[Executing: complete]

────────────────────────────────────────────────────────────
[Changes Applied]
────────────────────────────────────────────────────────────
  ✓ Replaced "YB" with "Wibey" (2 occurrences)
  ✓ Added term "Wibey" to context

File updated: /path/to/transcript.md
```

## Use Cases

### Fixing Common Transcription Errors

```bash
# API pronounced letter-by-letter
protokoll feedback notes.md -f "API should be written as A-P-I"

# Acronyms
protokoll feedback notes.md -f "AWS was transcribed as 'ay double-u ess', fix it"

# Technical terms
protokoll feedback notes.md -f "Kubernetes was written as 'Cooper Netties'"
```

### Fixing Names

```bash
# Full name correction
protokoll feedback notes.md -f "Priya was transcribed as 'pre a'"

# Name with title
protokoll feedback notes.md -f "Doctor Smith was written as 'Doc Tor Smith'"

# International names
protokoll feedback notes.md -f "Mikhail was transcribed as 'Me Kyle'"
```

### Project Reorganization

```bash
# Simple reassignment
protokoll feedback notes.md -f "This belongs in the Q4-planning project"

# With explanation
protokoll feedback notes.md -f "This was incorrectly classified as personal, it's actually work related to the Sales project"
```

## Troubleshooting

### "Text not found in transcript"

The exact text you specified doesn't exist. Try:
- Checking the exact spelling/capitalization in the transcript
- Using a shorter, more unique phrase
- Looking at the transcript preview shown when running the command

### "Project not found"

The project ID you specified doesn't exist. List available projects:

```bash
protokoll project list
```

### Changes Not Taking Effect

Make sure you're not running in `--dry-run` mode. Remove that flag to apply changes.

### Model Not Understanding Feedback

Try being more explicit:
- Instead of: "Fix the name"
- Try: "Replace 'San Jay' with 'Sanjay' everywhere"

## Best Practices

1. **Be specific**: "Replace X with Y" is clearer than "fix X"

2. **Include context**: "WCNP is Walmart's Native Cloud Platform" helps the model add useful metadata

3. **Use --dry-run first**: Preview changes before applying them

4. **Check with --verbose**: See exactly what actions are being taken

5. **Review context files**: Check `~/.protokoll/` to see what was added

## See Also

- [Context System](./context-system.md) - How context storage works
- [Transcript Actions](./action.md) - Other ways to edit transcripts
- [Context Commands](./context-commands.md) - Managing entities directly
