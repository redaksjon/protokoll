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

For the best experience, provide the project name on the command line:

```bash
protokoll project add --name "Client Alpha"
```

The streamlined process uses sensible defaults and focuses on the smart assistance features:

```
[Add New Project]

Project name: Client Alpha

[Generating phonetic variants...]
  • Calling AI model...
  (Phonetic variants help when Whisper mishears the project name)
Sounds like (Enter for suggested, or edit):
  client alpha,client alfa,klient alpha,clint alpha,...(+4 more)
> 

[Generating trigger phrases...]
  • Calling AI model...
  (Trigger phrases indicate content belongs to this project)
Trigger phrases (Enter for suggested, or edit):
  client alpha,alpha project,working on alpha,alpha client,...(+8 more)
> 

Topic keywords (Enter for suggested, or edit):
  client engagement,consulting,project management,...(+5 more)
> 

Description (Enter for suggested, or edit):
  Primary client project for Q1
> 

Project "Client Alpha" saved successfully.
```

The project creation now uses these sensible defaults:
- **ID**: Auto-generated from name (e.g., "Client Alpha" → "client-alpha")
- **Context type**: Defaults to "work"
- **Directory structure**: Defaults to "month"
- **Output destination**: Uses your configured default

You can override any default using command-line options:

```bash
protokoll project add --name "Personal Notes" \
  --context personal \
  --structure day \
  --destination ~/personal-notes
```

#### Non-Interactive Mode

If you want to accept all AI-generated suggestions automatically without being prompted, use the `--yes` flag:

```bash
protokoll project add --name "FjellGrunn" --yes
```

This will generate phonetic variants, trigger phrases, topics, and description using AI, then immediately save the project without waiting for your confirmation. Output looks like:

```
[Add New Project]

[Generating phonetic variants...]
  • Calling AI model...
  (Phonetic variants help when Whisper mishears the project name)
  fyellgruhn,feelgrun,feellgrun,fyellgrunn,fyehlgrunn,fjehlgrun,...(+16 more)
  ✓ Accepted (--yes mode)

[Generating trigger phrases...]
  • Calling AI model...
  (Trigger phrases indicate content belongs to this project)
  fjellgrunn,fjell grunn project,working on fjellgrunn,...(+12 more)
  ✓ Accepted (--yes mode)

Project "FjellGrunn" saved successfully.
```

This mode is useful for:
- **Automation**: Scripts that create projects without manual intervention
- **Trusting the AI**: When you're confident the AI will generate good suggestions
- **Speed**: Quickly creating multiple projects in a batch

You can combine `--yes` with other flags:

```bash
# Non-interactive with source URL
protokoll project add https://github.com/myorg/myproject --name "My Project" --yes

# Non-interactive with local README
protokoll project add /path/to/README.md --name "Documentation" --yes
```

#### Project Field Reference

| Field | How Set | Purpose | Examples |
|-------|---------|---------|----------|
| **Name** | Prompted (or `--name` flag) | Display name for the project | "Client Alpha", "Personal Notes" |
| **ID** | Auto-generated from name | Filename and reference identifier | "client-alpha", "personal-notes" |
| **Context type** | Auto: "work" (override with `--context`) | Nature of content | work, personal, mixed |
| **Directory structure** | Auto: "month" (override with `--structure`) | Date-based folder organization | none, year, month, day |
| **Output destination** | Auto: configured default (override with `--destination`) | Where transcripts are saved | "~/clients/alpha/notes" |
| **Sounds like** | AI-suggested (editable) | Phonetic variants for misheard names | "protocol" for "Protokoll" |
| **Trigger phrases** | AI-suggested (editable) | High-confidence matching phrases | "client alpha", "working on alpha" |
| **Topic keywords** | AI-suggested (editable) | Lower-confidence theme associations | "budget", "roadmap" |
| **Description** | AI-suggested (editable) | Your reference note | "Primary client project for Q1" |

##### Understanding Trigger Phrases vs Sounds Like vs Topics

- **Trigger phrases** (`explicit_phrases`): High-confidence content matching. If someone says "working on the alpha project" in a recording, and "alpha project" is a trigger phrase, the transcript routes to this project. These match the *content* being discussed.

- **Sounds like** (`sounds_like`): Phonetic variants for when Whisper mishears the *project name itself*. If your project is named "Protokoll" (Norwegian), Whisper might transcribe it as "protocol" or "pro to call". Add these variants so lookups still find the project.

- **Topic keywords** (`topics`): Lower-confidence associations. If a transcript mentions "budget" and your project has "budget" as a topic, it's a weaker signal than a trigger phrase. Topics help with classification but shouldn't be relied on alone.

#### Smart Project Creation

Protokoll can use AI assistance to automatically generate sounds_like, trigger phrases, topics, and descriptions:

**Basic Smart Creation**

```bash
# AI generates sounds_like and trigger phrases from project name
protokoll project add

[Add New Project]

Project name: Protokoll
ID (Enter for "protokoll"): 

[Generating phonetic variants...]
Sounds like (Enter for suggested, or edit):
  protocol,pro to call,proto call,protocolle,...

[Generating trigger phrases...]
Trigger phrases (Enter for suggested, or edit):
  protokoll,working on protokoll,protokoll project,protokoll meeting,...
```

**With Source Content**

```bash
# Provide URL or file for full context analysis
protokoll project add https://github.com/myorg/myproject

[Fetching content from source...]
Found: github - myorg/myproject

[Analyzing content...]

Project name (Enter for "MyProject"): 
ID (Enter for "myproject"): 

[Generating phonetic variants...]
[Generating trigger phrases...]

Topic keywords (Enter for suggested, or edit):
  typescript,automation,api,github,...

Description (Enter for suggested, or edit):
  MyProject is a comprehensive automation toolkit...
```

**Command-Line Options**

```bash
# Skip prompts with arguments
protokoll project add --name "My Project"
protokoll project add --name "My Project" --context work

# Combine with source
protokoll project add https://github.com/org/repo --name "Repo Name"

# Control smart assistance
protokoll project add --smart       # Force enable
protokoll project add --no-smart    # Force disable
```

**Supported Source Types**

| Type | Description | Example |
|------|-------------|---------|
| GitHub URL | Fetches raw README.md | `https://github.com/org/repo` |
| Web URL | Fetches page content | `https://example.com/docs` |
| Local file | Reads file content | `./README.md` |
| Directory | Finds README in directory | `./my-project/` |

**Configuration**

```yaml
# .protokoll/config.yaml
smartAssistance:
  enabled: true                   # Enable AI-assisted project creation
  phoneticModel: "gpt-5-nano"     # Fast model for phonetic variants
  analysisModel: "gpt-5-mini"     # Model for content analysis
  soundsLikeOnAdd: true           # Auto-generate phonetic variants
  triggerPhrasesOnAdd: true       # Auto-generate trigger phrases
  promptForSource: true           # Ask for URL/file when creating projects
```

**How It Works**

1. Enter project name
2. AI generates sounds_like (phonetic variants for transcription correction)
3. AI generates trigger phrases (content-matching for classification)
4. Optionally provide URL/file for topics and description
5. All suggestions are editable before saving

**Smart Relationship Suggestions**

When adding a project interactively, Protokoll analyzes existing projects and suggests relationships:

```
[Add New Project]

Project name: Kronologi

[Generating phonetic variants...]
...

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
  2. History (mentioned in description)
Add related terms? (Enter numbers comma-separated, or Enter to skip): 1
  ✓ Added 1 related terms

Project "Kronologi" saved successfully.
```

**How suggestions work:**

- **Parent**: Detected from naming patterns (e.g., "Redaksjon Tools" suggests "Redaksjon"), `{parent}-subproject` topics, or destination subdirectories
- **Siblings**: Projects sharing the same parent or with significant topic overlap
- **Related Terms**: Terms that appear in project name, description, or share topics

**Confidence levels:**
- `high` - Very likely correct (e.g., explicit subproject topic)
- `medium` - Probably correct (e.g., naming pattern match)
- `low` - Possibly correct (shown but with lower confidence)

**Requirements**

- `OPENAI_API_KEY` environment variable set
- Network access for URL fetching and API calls

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

### Edit a Project

Edit project fields incrementally without regenerating from source.

#### CLI Usage

```bash
# Add classification elements
protokoll project edit redaksjon \
  --add-topic publishing \
  --add-phrase "redaksjon note" \
  --add-person priya-sharma \
  --add-company acme-corp

# Manage relationships
protokoll project edit kronologi \
  --parent redaksjon \
  --add-sibling protokoll \
  --add-sibling observasjon \
  --add-term git

# Update routing
protokoll project edit client-alpha \
  --destination ~/work/clients/alpha \
  --structure day

# Remove elements
protokoll project edit work \
  --remove-topic old-topic \
  --remove-phrase "outdated phrase"

# Combine operations
protokoll project edit utilarium \
  --add-child utilarium-monitoring \
  --add-term dreadcabinet \
  --add-topic infrastructure
```

**Classification Options:**
- `--add-topic <topic>` - Add classification topic (repeat for multiple)
- `--remove-topic <topic>` - Remove classification topic
- `--add-phrase <phrase>` - Add trigger phrase (repeat for multiple)
- `--remove-phrase <phrase>` - Remove trigger phrase
- `--add-person <id>` - Associate person ID (repeat for multiple)
- `--remove-person <id>` - Remove associated person
- `--add-company <id>` - Associate company ID (repeat for multiple)
- `--remove-company <id>` - Remove associated company

**Relationship Options:**
- `--parent <id>` - Set parent project
- `--add-child <id>` - Add child project (repeat for multiple)
- `--remove-child <id>` - Remove child project
- `--add-sibling <id>` - Add sibling project (repeat for multiple)
- `--remove-sibling <id>` - Remove sibling project
- `--add-term <id>` - Add related term (repeat for multiple)
- `--remove-term <id>` - Remove related term

**Other Options:**
- `--name <name>` - Update project name
- `--description <text>` - Update description
- `--destination <path>` - Update routing destination
- `--structure <type>` - Update directory structure
- `--context-type <type>` - Update context type (work/personal/mixed)
- `--active <bool>` - Set active status (true/false)

#### MCP Usage

The `protokoll_edit_project` MCP tool provides the same functionality:

```typescript
// Add classification elements
await use_mcp_tool('protokoll_edit_project', {
  id: 'redaksjon',
  add_topics: ['publishing', 'norwegian-tools'],
  add_explicit_phrases: ['redaksjon note'],
  add_associated_people: ['priya-sharma'],
  add_associated_companies: ['acme-corp']
});

// Manage relationships
await use_mcp_tool('protokoll_edit_project', {
  id: 'kronologi',
  parent: 'redaksjon',
  add_siblings: ['protokoll', 'observasjon'],
  add_related_terms: ['git', 'history']
});

// Update routing
await use_mcp_tool('protokoll_edit_project', {
  id: 'quarterly-planning',
  add_explicit_phrases: ['Q2 planning', 'quarterly review'],
  add_topics: ['budget', 'roadmap']
});

// Deactivate a project
await use_mcp_tool('protokoll_edit_project', {
  id: 'old-project',
  active: false
});
```

**Available MCP fields:**

*Basic:*
- `name`, `description`, `destination`, `structure`, `contextType`, `active`

*Classification (routing signals):*
- **Trigger phrases**: `explicit_phrases`, `add_explicit_phrases`, `remove_explicit_phrases`
- **Topics**: `topics`, `add_topics`, `remove_topics`
- **People**: `associated_people`, `add_associated_people`, `remove_associated_people`
- **Companies**: `associated_companies`, `add_associated_companies`, `remove_associated_companies`
- **Phonetics**: `sounds_like`, `add_sounds_like`, `remove_sounds_like`

*Relationships (advanced):*
- `parent` - Set parent project ID
- `add_children`, `remove_children` - Manage child projects
- `add_siblings`, `remove_siblings` - Manage sibling projects
- `add_related_terms`, `remove_related_terms` - Manage term associations

### Understanding Classification

Classification determines HOW notes are routed to projects. When you run `project show`, you'll see the classification section:

```
┌─────────────────────┬────────────────────────────────────────────┐
│ Context Type        │ work                                       │
├─────────────────────┼────────────────────────────────────────────┤
│ Trigger Phrases     │   • quarterly planning                     │
│                     │   • Q1 planning                            │
│                     │   • Q2 planning                            │
├─────────────────────┼────────────────────────────────────────────┤
│ Topics              │   • roadmap                                │
│                     │   • budget                                 │
│                     │   • planning                               │
├─────────────────────┼────────────────────────────────────────────┤
│ Associated People   │   • priya-sharma                           │
│                     │   • john-smith                             │
├─────────────────────┼────────────────────────────────────────────┤
│ Associated Companies│   • acme-corp                              │
└─────────────────────┴────────────────────────────────────────────┘
```

#### Classification Fields Explained

| Field | Weight | Purpose | Example |
|-------|--------|---------|---------|
| **Trigger Phrases** | High (90%) | High-confidence content matching | "quarterly planning", "Q1 review" |
| **Associated People** | Medium (60%) | Routes when specific people mentioned | `priya-sharma`, `john-smith` |
| **Associated Companies** | Medium (60%) | Routes when companies mentioned | `acme-corp`, `client-alpha-inc` |
| **Topics** | Low (30%) | Theme-based matching | `roadmap`, `budget`, `strategy` |
| **Context Type** | Modifier | Nature of content | `work`, `personal`, `mixed` |

#### When to Use Each Field

**Trigger Phrases (explicit_phrases):**
```bash
# Use for: High-confidence phrases that definitively indicate this project
protokoll project edit quarterly-planning \
  --add-phrase "quarterly planning" \
  --add-phrase "Q1 planning" \
  --add-phrase "roadmap review"
```

**Topics:**
```bash
# Use for: Theme keywords that suggest (but don't guarantee) this project
protokoll project edit quarterly-planning \
  --add-topic roadmap \
  --add-topic budget \
  --add-topic strategy
```

**Associated People:**
```bash
# Use for: When mentions of specific people indicate this project
# (e.g., "Priya" always means work project, not personal)
protokoll project edit work \
  --add-person priya-sharma \
  --add-person john-smith
```

**Associated Companies:**
```bash
# Use for: When company mentions route to specific projects
# (e.g., "Acme Corp" always means client-alpha project)
protokoll project edit client-alpha \
  --add-company acme-corp
```

#### How Routing Scores Are Calculated

When Protokoll analyzes a transcript:

1. **Scans for trigger phrases** - If found, project gets 90% confidence immediately
2. **Detects people** - Each associated person found adds 60% weight
3. **Detects companies** - Each associated company found adds 60% weight
4. **Matches topics** - Each topic keyword found adds 30% weight
5. **Combines signals** - Highest-scoring project wins (if above threshold)

**Example transcript:** "Meeting with Priya about roadmap and budget planning"

**Project: Quarterly Planning**
- Trigger phrase: "planning" → 90%
- Topic: "roadmap" → +30%
- Topic: "budget" → +30%
- Associated person: "priya-sharma" → +60%
- **Total: 210% confidence** → Routes here

**Project: Personal Notes**
- No matches
- **Total: 0%** → Doesn't route here

#### Managing Classification via CLI

```bash
# View current classification
protokoll project show quarterly-planning

# Add high-confidence triggers
protokoll project edit quarterly-planning \
  --add-phrase "Q2 planning" \
  --add-phrase "quarterly review"

# Add people who indicate this project
protokoll project edit client-alpha \
  --add-person sarah-chen \
  --add-person mike-johnson

# Add companies that route here
protokoll project edit client-work \
  --add-company acme-corp \
  --add-company beta-industries

# Add theme keywords
protokoll project edit infrastructure \
  --add-topic kubernetes \
  --add-topic docker \
  --add-topic devops

# Remove outdated elements
protokoll project edit old-project \
  --remove-phrase "outdated phrase" \
  --remove-topic "old-topic"
```

#### Managing Classification via MCP

```typescript
// Add classification elements
await use_mcp_tool('protokoll_edit_project', {
  id: 'quarterly-planning',
  add_explicit_phrases: ['Q2 planning', 'quarterly review'],
  add_associated_people: ['sarah-chen', 'mike-johnson'],
  add_associated_companies: ['acme-corp'],
  add_topics: ['roadmap', 'budget', 'planning']
});

// Remove elements
await use_mcp_tool('protokoll_edit_project', {
  id: 'old-project',
  remove_explicit_phrases: ['outdated phrase'],
  remove_topics: ['old-topic']
});
```

#### Best Practices

**Trigger Phrases:**
- Use specific, uncommon phrases ("Q1 planning" not just "planning")
- Include variations ("quarterly planning", "quarter planning")
- Test that they don't match other projects

**Topics:**
- Use broad theme keywords
- Keep list short (5-10 topics max)
- Avoid overlap with other projects if possible

**Associated People:**
- Only associate people who STRONGLY indicate this project
- Don't over-associate (person mentioned everywhere = no routing signal)

**Associated Companies:**
- Use when company name definitively routes to project
- Perfect for client projects

#### Common Patterns

**Client Project:**
```yaml
classification:
  context_type: work
  explicit_phrases:
    - "acme project"
    - "working on acme"
  associated_companies:
    - acme-corp
  associated_people:
    - priya-sharma  # Acme point of contact
  topics:
    - client-engagement
    - consulting
```

**Personal Notes:**
```yaml
classification:
  context_type: personal
  explicit_phrases:
    - "personal note"
    - "journal entry"
  topics:
    - journaling
    - ideas
```

**Internal Project:**
```yaml
classification:
  context_type: work
  explicit_phrases:
    - "infrastructure work"
    - "devops task"
  associated_people:
    - dev-team-lead
  topics:
    - kubernetes
    - docker
    - infrastructure
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

### Edit a Person (MCP Only)

The `protokoll_edit_person` MCP tool allows manual edits to existing people:

```typescript
// Add sounds_like variants
await use_mcp_tool('protokoll_edit_person', {
  id: 'priya-sharma',
  add_sounds_like: ['pre a sharma', 'preeya']
});

// Update multiple fields
await use_mcp_tool('protokoll_edit_person', {
  id: 'john-smith',
  company: 'new-company',
  role: 'Senior Engineer',
  add_sounds_like: ['john smyth']
});

// Remove sounds_like variants
await use_mcp_tool('protokoll_edit_person', {
  id: 'jane-doe',
  remove_sounds_like: ['outdated-variant']
});
```

**Available fields:**
- `name`, `firstName`, `lastName`, `company`, `role`, `context` - Simple text updates
- `sounds_like` - Replace entire array
- `add_sounds_like` - Add to existing array
- `remove_sounds_like` - Remove from array

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

### Update a Term from Source

Regenerate term metadata by analyzing updated documentation:

```bash
protokoll term update kubernetes https://kubernetes.io/docs/concepts/overview/
```

This will:
- Fetch content from the URL
- Regenerate description, topics, domain using LLM
- Generate new sounds_like variants
- Suggest relevant projects based on topics
- Update the term file with new metadata

**Use case**: The Kubernetes project has evolved significantly. Update the term definition to reflect current documentation.

### Edit a Term

Edit term fields incrementally.

#### CLI Usage

```bash
# Add sounds_like variants (works for everything - single words, multi-word, etc.)
protokoll term edit kubernetes \
  --add-sound kube \
  --add-sound k8s \
  --add-sound "coober netties"

# For multi-word terms like "DreadCabinet", add split versions to sounds_like
protokoll term edit dreadcabinet \
  --add-sound "dread cabinet" \
  --add-sound "thread cabinet"

# Associate with projects
protokoll term edit whisper \
  --add-project protokoll \
  --add-project observasjon

# Update metadata
protokoll term edit kubernetes \
  --description "Container orchestration platform" \
  --domain devops \
  --add-topic containers \
  --add-topic orchestration

# Remove elements
protokoll term edit kubernetes \
  --remove-sound "old variant" \
  --remove-topic "deprecated"

# Combine operations
protokoll term edit graphql \
  --description "Query language for APIs" \
  --domain web-development \
  --add-topic api \
  --add-topic backend \
  --add-project backend-api
```

**Options:**
- `--description <text>` - Update description
- `--domain <domain>` - Update domain
- `--expansion <text>` - Update expansion
- `--add-sound <variant>` - Add sounds_like variant (repeatable)
- `--remove-sound <variant>` - Remove sounds_like variant (repeatable)
- `--add-topic <topic>` - Add topic (repeatable)
- `--remove-topic <topic>` - Remove topic (repeatable)
- `--add-project <id>` - Associate with project (repeatable)
- `--remove-project <id>` - Remove project association (repeatable)

#### MCP Usage

```typescript
// Same functionality via MCP
await use_mcp_tool('protokoll_edit_term', {
  id: 'kubernetes',
  add_sounds_like: ['kube', 'k8s'],
  add_topics: ['containers', 'orchestration'],
  add_projects: ['infrastructure']
});
```

### Merge Duplicate Terms

```bash
protokoll term merge kubernetes-dupe kubernetes
```

This will:
- Combine sounds_like arrays (deduplicated)
- Combine topics arrays (deduplicated)
- Combine projects arrays (deduplicated)
- Keep target's description/domain (fall back to source if missing)
- Delete the source term
- Save the merged term

**Use case**: You accidentally created "kubernetes" and "k8s" as separate terms. Merge them into one.

### Delete a Term

```bash
protokoll term delete graphql
```

### Edit a Term (MCP Only)

The `protokoll_edit_term` MCP tool allows manual edits to existing terms without requiring LLM calls. Unlike `update` which regenerates metadata from a source, `edit` lets you make specific changes:

```typescript
// Add a specific sounds_like variant
await use_mcp_tool('protokoll_edit_term', {
  id: 'cardigantime',
  add_sounds_like: ['Cartesian Time', 'card again time']
});

// Update multiple fields
await use_mcp_tool('protokoll_edit_term', {
  id: 'kubernetes',
  domain: 'devops',
  description: 'Container orchestration platform',
  add_topics: ['containers', 'orchestration']
});

// Replace sounds_like entirely
await use_mcp_tool('protokoll_edit_term', {
  id: 'graphql',
  sounds_like: ['graph ql', 'graph q l']  // Replaces all existing
});

// Remove specific topics
await use_mcp_tool('protokoll_edit_term', {
  id: 'docker',
  remove_topics: ['obsolete-topic']
});
```

**Available fields:**
- `expansion`, `domain`, `description` - Simple text updates
- `sounds_like`, `topics`, `projects` - Replace entire array
- `add_sounds_like`, `add_topics`, `add_projects` - Add to existing array
- `remove_sounds_like`, `remove_topics`, `remove_projects` - Remove from array

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
