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

Output:
```
Projects (3):

  quarterly-planning Quarterly Planning -> ~/work/planning/notes
  personal Personal Notes -> ~/notes [inactive]
  work Work Notes -> ~/work/notes
```

With verbose output:
```bash
protokoll project list --verbose
```

Shows full YAML for each project.

### Show Project Details

```bash
protokoll project show quarterly-planning
```

Output:
```
Project: Quarterly Planning

id: quarterly-planning
name: Quarterly Planning
type: project
classification:
  context_type: work
  explicit_phrases:
    - quarterly planning
    - Q1 planning
  topics:
    - roadmap
    - budget
routing:
  destination: ~/work/planning/notes
  structure: month
  filename_options:
    - date
    - time
    - subject
active: true

File: /Users/you/.protokoll/projects/quarterly-planning.yaml
```

### Add a Project

```bash
protokoll project add
```

Interactive prompts:
```
[Add New Project]

Project name: Client Alpha
ID (Enter for "client-alpha"): 
Output destination path: ~/clients/alpha/notes
Directory structure (none/year/month/day, Enter for month): month
Context type (work/personal/mixed, Enter for work): work
Trigger phrases (comma-separated): client alpha, alpha project, working on alpha
Topic keywords (comma-separated, Enter to skip): client engagement, consulting
Description (Enter to skip): Primary client project for Q1

Project "Client Alpha" saved successfully.
```

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

Output:
```
People (5):

  john-smith John Smith (acme-corp) - Engineering Lead
  priya-sharma Priya Sharma (acme-corp) - Product Manager
  sarah-chen Sarah Chen - Designer
```

### Show Person Details

```bash
protokoll person show priya-sharma
```

Output:
```
Person: Priya Sharma

id: priya-sharma
name: Priya Sharma
type: person
firstName: Priya
lastName: Sharma
company: acme-corp
role: Product Manager
sounds_like:
  - pre a
  - pria
  - preeya
context: Colleague from product team

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

Output:
```
Terms (4):

  graphql GraphQL (GraphQL Query Language)
  kubernetes Kubernetes (Container orchestration platform)
  react React (JavaScript UI library)
```

### Show Term Details

```bash
protokoll term show kubernetes
```

Output:
```
Term: Kubernetes

id: kubernetes
name: Kubernetes
type: term
expansion: Container orchestration platform
domain: engineering
sounds_like:
  - kube
  - k8s
  - cube er net ease
  - kuber netties
projects:
  - infrastructure

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

Output:
```
Companies (3):

  acme-corp Acme Corporation [Manufacturing]
  techstart TechStart Inc [Technology]
  globalbank Global Bank [Finance]
```

### Show Company Details

```bash
protokoll company show acme-corp
```

Output:
```
Company: Acme Corporation

id: acme-corp
name: Acme Corporation
type: company
fullName: Acme Corporation Ltd.
industry: Manufacturing
sounds_like:
  - acme
  - acme corp
  - a c m e

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

Output:
```
Ignored terms (3):

  um um [ignored 2026-01-12]
  like like [ignored 2026-01-10]
  basically basically [ignored 2026-01-08]
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
