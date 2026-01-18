# Context Management Commands

Protokoll provides a complete CLI for managing context entities directly from the command line. These commands let you list, view, add, and delete people, projects, terms, companies, and ignored terms without manually editing YAML files.

## Overview

Context management uses subcommands:

```bash
protokoll <entity-type> <action> [options]
```

### Entity Types

| Command | Description |
|---------|-------------|
| `project` | Manage projects (routing destinations) |
| `person` | Manage people (name recognition) |
| `term` | Manage technical terms |
| `company` | Manage companies |
| `ignored` | Manage ignored terms (won't prompt for these) |
| `context` | Overall context system management |

### Actions

Each entity type supports the same actions:

| Action | Description |
|--------|-------------|
| `list` | List all entities of this type |
| `show <id>` | Show full details for an entity |
| `add` | Interactively add a new entity |
| `delete <id>` | Delete an entity |

## Project Commands

Projects define routing destinations and classification rules.

### List Projects

```bash
protokoll project list
```

Output (compact table with row numbers):
```
Projects (3):

┌─────┬────────────────────┬────────────────────┬───────────────────────────┐
│ #   │ ID                 │ Name               │ Info                      │
├─────┼────────────────────┼────────────────────┼───────────────────────────┤
│ 1   │ personal           │ Personal Notes     │ INACTIVE → ~/notes        │
├─────┼────────────────────┼────────────────────┼───────────────────────────┤
│ 2   │ quarterly-planning │ Quarterly Planning │ → ~/work/planning/notes   │
├─────┼────────────────────┼────────────────────┼───────────────────────────┤
│ 3   │ work               │ Work Notes         │ → ~/work/notes            │
└─────┴────────────────────┴────────────────────┴───────────────────────────┘

Use "project show <id>" or "project show <#>" to see full details for any entry.
```

The table uses fixed column widths and truncates long paths intelligently. For full details including descriptions, trigger phrases, and all configuration, use either the ID or row number:
```bash
protokoll project show walmart    # By ID
protokoll project show 6          # By row number from list
```

Or for verbose output with full YAML details:
```bash
protokoll project list --verbose
```

### Show Project Details

You can show details using either the ID or the row number from the list:

```bash
protokoll project show quarterly-planning    # By ID
protokoll project show 2                     # By row number
```

Output (formatted table):
```
Project: Quarterly Planning

┌─────────────────────┬────────────────────────────────────────────┐
│ ID                  │ quarterly-planning                         │
├─────────────────────┼────────────────────────────────────────────┤
│ Name                │ Quarterly Planning                         │
├─────────────────────┼────────────────────────────────────────────┤
│ Type                │ project                                    │
├─────────────────────┼────────────────────────────────────────────┤
│ Context Type        │ work                                       │
├─────────────────────┼────────────────────────────────────────────┤
│ Trigger Phrases     │   • quarterly planning                     │
│                     │   • Q1 planning                            │
├─────────────────────┼────────────────────────────────────────────┤
│ Topics              │   • roadmap                                │
│                     │   • budget                                 │
├─────────────────────┼────────────────────────────────────────────┤
│ Destination         │ ~/work/planning/notes                      │
├─────────────────────┼────────────────────────────────────────────┤
│ Directory Structure │ month                                      │
├─────────────────────┼────────────────────────────────────────────┤
│ Filename Options    │   • date                                   │
│                     │   • time                                   │
│                     │   • subject                                │
├─────────────────────┼────────────────────────────────────────────┤
│ Sounds Like         │   • quarterly plan                         │
│                     │   • quarter planning                       │
├─────────────────────┼────────────────────────────────────────────┤
│ Active              │ true                                       │
└─────────────────────┴────────────────────────────────────────────┘

File: /Users/you/.protokoll/projects/quarterly-planning.yaml
```

The formatted output makes it easy to read all fields. Arrays are displayed as bullet points, and nested objects are expanded in a readable format.

### Add a Project

```bash
protokoll project add
```

The interactive prompt guides you through each field with explanations:

```
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
Trigger phrases (comma-separated): client alpha, alpha project, working on alpha

  Sounds-like variants help when Whisper mishears the project name.
  Useful for non-English names (Norwegian, etc.) that may be transcribed differently.
  Examples for "Protokoll": "protocol", "pro to call", "proto call"
Sounds like (comma-separated, Enter to skip): 

  Topic keywords are themes/subjects associated with this project.
  These provide additional context for classification but are lower-confidence
  than trigger phrases. Examples: "budget", "roadmap", "client engagement"
Topic keywords (comma-separated, Enter to skip): client engagement, consulting

  Description is a brief note about this project for your reference.
Description (Enter to skip): Primary client project for Q1

Project "Client Alpha" saved successfully.
```

#### Project Field Reference

| Field | Purpose | Examples |
|-------|---------|----------|
| **Name** | Display name for the project | "Client Alpha", "Personal Notes" |
| **ID** | Filename and reference identifier | "client-alpha", "personal-notes" |
| **Output destination** | Where transcripts are saved | "~/clients/alpha/notes" |
| **Directory structure** | Date-based folder organization | none, year, month, day |
| **Context type** | Nature of content | work, personal, mixed |
| **Trigger phrases** | High-confidence matching phrases | "client alpha", "working on alpha" |
| **Sounds like** | Phonetic variants for misheard names | "protocol" for "Protokoll" |
| **Topic keywords** | Lower-confidence theme associations | "budget", "roadmap" |
| **Description** | Your reference note | "Primary client project for Q1" |

##### Understanding Trigger Phrases vs Sounds Like vs Topics

- **Trigger phrases** (`explicit_phrases`): High-confidence content matching. If someone says "working on the alpha project" in a recording, and "alpha project" is a trigger phrase, the transcript routes to this project. These match the *content* being discussed.

- **Sounds like** (`sounds_like`): Phonetic variants for when Whisper mishears the *project name itself*. If your project is named "Protokoll" (Norwegian), Whisper might transcribe it as "protocol" or "pro to call". Add these variants so lookups still find the project.

- **Topic keywords** (`topics`): Lower-confidence associations. If a transcript mentions "budget" and your project has "budget" as a topic, it's a weaker signal than a trigger phrase. Topics help with classification but shouldn't be relied on alone.

### Delete a Project

```bash
protokoll project delete client-alpha
```

With confirmation:
```
About to delete project: Client Alpha (client-alpha)
Are you sure? (y/N): y
Project "client-alpha" deleted.
```

Skip confirmation:
```bash
protokoll project delete client-alpha --force
```

## Person Commands

People are used for name recognition and correction in transcripts.

### List People

```bash
protokoll person list
```

Output (compact table with row numbers):
```
People (3):

┌─────┬──────────────┬──────────────┬────────────────────────────┐
│ #   │ ID           │ Name         │ Info                       │
├─────┼──────────────┼──────────────┼────────────────────────────┤
│ 1   │ john-smith   │ John Smith   │ Engineering Lead · @acme   │
├─────┼──────────────┼──────────────┼────────────────────────────┤
│ 2   │ priya-sharma │ Priya Sharma │ Product Manager · @acme    │
├─────┼──────────────┼──────────────┼────────────────────────────┤
│ 3   │ sarah-chen   │ Sarah Chen   │ Designer                   │
└─────┴──────────────┴──────────────┴────────────────────────────┘

Use "person show <id>" or "person show <#>" to see full details for any entry.
```

### Show Person Details

```bash
protokoll person show priya-sharma    # By ID
protokoll person show 2               # By row number
```

Output (formatted table):
```
Person: Priya Sharma

┌─────────────┬──────────────────────────────────────────┐
│ ID          │ priya-sharma                             │
├─────────────┼──────────────────────────────────────────┤
│ Name        │ Priya Sharma                             │
├─────────────┼──────────────────────────────────────────┤
│ Type        │ person                                   │
├─────────────┼──────────────────────────────────────────┤
│ First Name  │ Priya                                    │
├─────────────┼──────────────────────────────────────────┤
│ Last Name   │ Sharma                                   │
├─────────────┼──────────────────────────────────────────┤
│ Company     │ acme-corp                                │
├─────────────┼──────────────────────────────────────────┤
│ Role        │ Product Manager                          │
├─────────────┼──────────────────────────────────────────┤
│ Sounds Like │   • pre a                                │
│             │   • pria                                 │
│             │   • preeya                               │
├─────────────┼──────────────────────────────────────────┤
│ Context     │ Colleague from product team              │
└─────────────┴──────────────────────────────────────────┘

File: /Users/you/.protokoll/people/priya-sharma.yaml
```

### Add a Person

```bash
protokoll person add
```

Interactive prompts:
```
[Add New Person]

Full name: John Smith
ID (Enter for "john-smith"): 
First name (Enter to skip): John
Last name (Enter to skip): Smith
Company ID (Enter to skip): acme-corp
Role (Enter to skip): Engineering Lead
Sounds like (comma-separated, Enter to skip): john, jon smith, john s
Context notes (Enter to skip): Team lead for backend services

Person "John Smith" saved successfully.
```

### Delete a Person

```bash
protokoll person delete john-smith
```

```bash
protokoll person delete john-smith --force
```

## Term Commands

Terms define technical vocabulary and their phonetic variants.

### List Terms

```bash
protokoll term list
```

Output (compact table with row numbers):
```
Terms (3):

┌─────┬────────────┬────────────┬──────────────────────────────────┐
│ #   │ ID         │ Name       │ Info                             │
├─────┼────────────┼────────────┼──────────────────────────────────┤
│ 1   │ graphql    │ GraphQL    │ GraphQL Query Language           │
├─────┼────────────┼────────────┼──────────────────────────────────┤
│ 2   │ kubernetes │ Kubernetes │ Container orchestration platform │
├─────┼────────────┼────────────┼──────────────────────────────────┤
│ 3   │ react      │ React      │ JavaScript UI library            │
└─────┴────────────┴────────────┴──────────────────────────────────┘

Use "term show <id>" or "term show <#>" to see full details for any entry.
```

Long expansions are truncated in the table view. For verbose output with full YAML details:
```bash
protokoll term list --verbose
```

### Show Term Details

```bash
protokoll term show kubernetes    # By ID
protokoll term show 2             # By row number
```

Output (formatted table):
```
Term: Kubernetes

┌─────────────┬────────────────────────────────────────┐
│ ID          │ kubernetes                             │
├─────────────┼────────────────────────────────────────┤
│ Name        │ Kubernetes                             │
├─────────────┼────────────────────────────────────────┤
│ Type        │ term                                   │
├─────────────┼────────────────────────────────────────┤
│ Expansion   │ Container orchestration platform       │
├─────────────┼────────────────────────────────────────┤
│ Domain      │ engineering                            │
├─────────────┼────────────────────────────────────────┤
│ Sounds Like │   • kube                               │
│             │   • k8s                                │
│             │   • cube er net ease                   │
│             │   • kuber netties                      │
├─────────────┼────────────────────────────────────────┤
│ Projects    │   • infrastructure                     │
└─────────────┴────────────────────────────────────────┘

File: /Users/you/.protokoll/terms/kubernetes.yaml
```

### Add a Term

```bash
protokoll term add
```

Interactive prompts:
```
[Add New Term]

Term: GraphQL
ID (Enter for "graphql"): 
Expansion (if acronym, Enter to skip): GraphQL Query Language
Domain (e.g., engineering, finance, Enter to skip): engineering
Sounds like (comma-separated, Enter to skip): graph ql, graph q l, graphical
Associated project IDs (comma-separated, Enter to skip): api-project

Term "GraphQL" saved successfully.
```

### Delete a Term

```bash
protokoll term delete graphql
```

## Company Commands

Companies are used for organization recognition and can be linked to people.

### List Companies

```bash
protokoll company list
```

Output (compact table with row numbers):
```
Companies (3):

┌─────┬────────────┬──────────────────┬──────────────┐
│ #   │ ID         │ Name             │ Info         │
├─────┼────────────┼──────────────────┼──────────────┤
│ 1   │ acme-corp  │ Acme Corporation │ Manufacturing│
├─────┼────────────┼──────────────────┼──────────────┤
│ 2   │ globalbank │ Global Bank      │ Finance      │
├─────┼────────────┼──────────────────┼──────────────┤
│ 3   │ techstart  │ TechStart Inc    │ Technology   │
└─────┴────────────┴──────────────────┴──────────────┘

Use "company show <id>" or "company show <#>" to see full details for any entry.
```

### Show Company Details

```bash
protokoll company show acme-corp    # By ID
protokoll company show 1            # By row number
```

Output (formatted table):
```
Company: Acme Corporation

┌─────────────┬──────────────────────────┐
│ ID          │ acme-corp                │
├─────────────┼──────────────────────────┤
│ Name        │ Acme Corporation         │
├─────────────┼──────────────────────────┤
│ Type        │ company                  │
├─────────────┼──────────────────────────┤
│ Full Name   │ Acme Corporation Ltd.    │
├─────────────┼──────────────────────────┤
│ Industry    │ Manufacturing            │
├─────────────┼──────────────────────────┤
│ Sounds Like │   • acme                 │
│             │   • acme corp            │
│             │   • a c m e              │
└─────────────┴──────────────────────────┘

File: /Users/you/.protokoll/companies/acme-corp.yaml
```

### Add a Company

```bash
protokoll company add
```

Interactive prompts:
```
[Add New Company]

Company name: TechStart Inc
ID (Enter for "techstart-inc"): techstart
Full legal name (Enter to skip): TechStart Incorporated
Industry (Enter to skip): Technology
Sounds like (comma-separated, Enter to skip): tech start, techstart

Company "TechStart Inc" saved successfully.
```

### Delete a Company

```bash
protokoll company delete techstart
```

## Ignored Terms Commands

Ignored terms are words or phrases that Protokoll won't ask about during interactive mode. Use this to suppress prompts for common words or terms you don't want to add as context.

### List Ignored Terms

```bash
protokoll ignored list
```

Output (compact table with row numbers):
```
Ignored terms (3):

┌─────┬───────────┬───────────┬──────────────┐
│ #   │ ID        │ Name      │ Info         │
├─────┼───────────┼───────────┼──────────────┤
│ 1   │ basically │ basically │ 1/8/2026     │
├─────┼───────────┼───────────┼──────────────┤
│ 2   │ like      │ like      │ 1/10/2026    │
├─────┼───────────┼───────────┼──────────────┤
│ 3   │ um        │ um        │ 1/12/2026    │
└─────┴───────────┴───────────┴──────────────┘

Use "ignored show <id>" to see full details for any entry.
```

### Show Ignored Term Details

```bash
protokoll ignored show um
```

Output:
```
Ignored: um

id: um
name: um
type: ignored
ignoredAt: 2026-01-12T10:30:00.000Z
reason: Filler word, not meaningful

File: /Users/you/.protokoll/ignored/um.yaml
```

### Add an Ignored Term

```bash
protokoll ignored add
```

Interactive prompts:
```
[Add Ignored Term]

Term to ignore: um
Reason for ignoring (Enter to skip): Filler word, not meaningful

"um" added to ignore list.
```

### Delete from Ignore List

```bash
protokoll ignored delete um
```

This removes the term from the ignore list, so Protokoll may prompt about it again.

## Context Overview Commands

The `context` command provides system-wide context management.

### Context Status

See the overall status of your context system:

```bash
protokoll context status
```

Output:
```
[Context System Status]

Discovered context directories:
  → /Users/you/.protokoll (level 0)
    /Users/you/work/.protokoll (level 1)

Loaded entities:
  Projects:  5
  People:    12
  Terms:     8
  Companies: 3
  Ignored:   15
```

The arrow (→) indicates the primary context directory.

### Search Across All Entities

Search for entities by name or content:

```bash
protokoll context search "acme"
```

Output:
```
Results for "acme" (4):

  [company] acme-corp Acme Corporation [Manufacturing]
  [person] john-smith John Smith (acme-corp) - Engineering Lead
  [person] priya-sharma Priya Sharma (acme-corp) - Product Manager
  [project] acme-project Acme Project -> ~/clients/acme/notes
```

## Command Options

### Global Options

These options work with all entity commands:

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show full details (for `list` command) |
| `-f, --force` | Skip confirmation prompts (for `delete` command) |

### Examples

```bash
# List all projects with full details
protokoll project list --verbose

# Delete without confirmation
protokoll person delete john-smith --force

# Search for anything related to "kubernetes"
protokoll context search kubernetes
```

## Workflow Examples

### Setting Up a New Project

```bash
# 1. Add the project
protokoll project add

# 2. Add people associated with the project
protokoll person add

# 3. Add technical terms for the domain
protokoll term add

# 4. Verify everything is loaded
protokoll context status
```

### Cleaning Up Context

```bash
# Find everything related to an old client
protokoll context search "old-client"

# Delete the entities
protokoll project delete old-client-project --force
protokoll person delete old-client-contact --force
protokoll company delete old-client-corp --force
```

### Managing Ignored Terms

```bash
# List what's currently ignored
protokoll ignored list

# Remove something from ignore list (to start prompting again)
protokoll ignored delete some-term

# Add a term you're tired of being asked about
protokoll ignored add
```

## Requirements

Context commands require a `.protokoll` directory to exist. If you haven't set up context yet:

```bash
# Initialize configuration
protokoll --init-config

# Or create manually
mkdir -p ~/.protokoll/{people,projects,companies,terms,ignored}
```

## File Locations

Entities are stored as YAML files:

```
~/.protokoll/
├── people/
│   └── *.yaml
├── projects/
│   └── *.yaml
├── companies/
│   └── *.yaml
├── terms/
│   └── *.yaml
└── ignored/
    └── *.yaml
```

Each entity command's `show` action displays the file path, making it easy to find and manually edit files if needed.

## Tips

1. **Use meaningful IDs**: IDs are auto-generated from names but can be customized. Use `john-smith` not `person1`.

2. **Add sounds_like variants**: The more phonetic variants you add, the better transcription correction works.

3. **Link people to companies**: Setting a company ID on a person helps with context during transcription.

4. **Use the search command**: Before adding new entities, search to see if similar ones exist.

5. **Review ignored terms periodically**: You might want to un-ignore terms after adding them as proper context.

## See Also

- [Transcript Actions](./action.md) - Edit transcripts to change their project or title after creation
- [Routing](./routing.md) - How project routing works
- [Context System](./context-system.md) - How context storage works
