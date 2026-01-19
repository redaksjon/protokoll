# Context System

The context system is Protokoll's knowledge base for improving transcription accuracy.

## Overview

Protokoll uses hierarchical configuration discovery to find context:

1. Walks up directory tree from input location
2. Finds all `.protokoll/` directories
3. Merges context with local taking precedence

## Directory Structure

```
~/.protokoll/
├── config.yaml          # Main configuration
├── people/              # Person definitions
│   └── *.yaml
├── projects/            # Project definitions
│   └── *.yaml
├── companies/           # Company definitions
│   └── *.yaml
└── terms/               # Terminology definitions
    └── *.yaml
```

## Entity Types

### People

```yaml
# ~/.protokoll/people/priya-sharma.yaml
id: priya-sharma
name: Priya Sharma
firstName: Priya
lastName: Sharma
company: acme-corp
role: Engineering Manager
sounds_like:
  - "pre a"
  - "pria"
  - "preeya sharma"
context: "Colleague from engineering team"
```

### Projects

```yaml
# ~/.protokoll/projects/quarterly-planning.yaml
id: quarterly-planning
name: Quarterly Planning
type: project

classification:
  context_type: work
  explicit_phrases:
    - "quarterly planning"
    - "Q1 planning"
    - "Q2 planning"
  topics:
    - "roadmap"
    - "budget"

routing:
  destination: "~/work/planning/notes"
  structure: "month"
  filename_options:
    - date
    - time
    - subject

active: true
```

### Companies

```yaml
# ~/.protokoll/companies/acme-corp.yaml
id: acme-corp
name: Acme Corporation
sounds_like:
  - "acme"
  - "acme corp"
  - "a.c.m.e."
context: "Client company in manufacturing"
```

### Terms

```yaml
# ~/.protokoll/terms/kubernetes.yaml
id: kubernetes
name: Kubernetes
type: term
expansion: "K8s"  # For acronyms
domain: devops
description: "Container orchestration platform"
sounds_like:
  - "kube"
  - "k8s"
  - "kuber netties"
topics:
  - containers
  - orchestration
projects:
  - infrastructure
```

---

## Project Relationships (Optional)

**Most users don't need this.** Only use if you have a clear parent/child project hierarchy.

For modeling project hierarchies:

```yaml
# Parent project
id: redaksjon
name: Redaksjon
relationships:
  children:
    - protokoll
    - kronologi
    - observasjon

# Child project
id: kronologi
name: Kronologi
relationships:
  parent: redaksjon
  siblings:
    - protokoll
    - observasjon
  relatedTerms:
    - git
    - history
```

**Relationship types:**
- `parent` - Parent project ID
- `children` - Array of child project IDs
- `siblings` - Related peer projects
- `relatedTerms` - Terms strongly associated with this project

**When useful:**
- You have a main project with clear subprojects
- Project names are similar and need disambiguation
- Want related projects to boost each other in search

**Example:** Parent "Redaksjon" with children "Protokoll", "Kronologi", "Observasjon"

## Phonetic Aliases (sounds_like)

The `sounds_like` field maps how Whisper transcribes things to correct spellings. Works for everything:

```yaml
# Single words
sounds_like:
  - "pre a"         # Whisper might hear "Priya" as "pre a"
  - "pria"          # Or as "pria"

# Multi-word terms (e.g., "DreadCabinet")
sounds_like:
  - "dread cabinet"  # How Whisper splits CamelCase
  - "thread cabinet" # Common mishearing

# Technical terms
sounds_like:
  - "kube"           # Short form
  - "k8s"            # Abbreviation
  - "coober netties" # Phonetic mishearing
```

When Protokoll sees any of these in a transcript, it corrects them to the canonical name.

## Hierarchical Discovery

Context is discovered by walking up the directory tree:

```
~/work/project-a/recordings/audio.m4a
  ↓
~/work/project-a/.protokoll/     # Project-specific context
~/work/.protokoll/                # Work-specific context
~/.protokoll/                     # Global context
```

### Merge Behavior

- **People, Companies, Terms**: All are loaded, local IDs override global
- **Projects**: All are loaded, local definitions take precedence
- **Config**: Deep merged, local settings override global

## API

### ContextInstance

```typescript
interface ContextInstance {
  // Get merged configuration
  getConfig(): HierarchicalConfig;
  
  // Entity lookup
  getPerson(id: string): Person | undefined;
  getProject(id: string): Project | undefined;
  getCompany(id: string): Company | undefined;
  getTerm(id: string): Term | undefined;
  
  // Get all entities
  getAllPeople(): Person[];
  getAllProjects(): Project[];
  getAllCompanies(): Company[];
  getAllTerms(): Term[];
  
  // Basic search
  search(query: string): Entity[];
  findBySoundsLike(phonetic: string): Entity | undefined;
  
  // Context-aware search (prefers entities related to context project)
  searchWithContext(query: string, contextProjectId?: string): Entity[];
  
  // Relationship queries
  getRelatedProjects(projectId: string, maxDistance?: number): Project[];
  
  // State
  hasContext(): boolean;
  
  // Persistence
  saveEntity(entity: Entity): Promise<void>;
  deleteEntity(entity: Entity): Promise<boolean>;
}
```

### Context-Aware Search

The `searchWithContext` method prefers entities related to a context project:

```typescript
// Standard search - returns all matches
const results = context.search("protokoll");

// Context-aware search - prioritizes related projects
const results = context.searchWithContext("protokoll", "redaksjon");
// Scores: Protokoll (child of redaksjon) gets +100 bonus
```

**Relationship scoring:**
- Same project: +150
- Parent/child: +100
- Sibling: +50
- Term associated with project: +100

### Relationship Queries

```typescript
// Get all related projects within distance 2
const related = context.getRelatedProjects("redaksjon", 2);
// Returns: [protokoll (distance 1), kronologi (distance 1), ...]

// Check relationship distance
import { getProjectRelationshipDistance } from '@/context/types';
const distance = getProjectRelationshipDistance(redaksjon, kronologi);
// Returns: 1 (parent-child)
```

## Usage in Agentic Tools

### lookup_person

```typescript
// Tool looks up person by name or phonetic
const person = context.findByPhonetic("pre a");
// Returns: { id: "priya-sharma", name: "Priya Sharma", ... }
```

### lookup_project

```typescript
// Tool finds project by trigger phrase
const projects = context.getAllProjects();
const match = projects.find(p => 
  p.triggers?.some(t => text.toLowerCase().includes(t))
);
```

### store_context

```typescript
// Tool saves new person to context
await context.savePerson({
  id: "new-person",
  name: "New Person",
  sounds_like: ["new per son"]
});
```

## Best Practices

1. **Use descriptive IDs**: `priya-sharma` not `person1`
2. **Add multiple sounds_like**: Cover common mishearings
3. **Include context**: Helps with disambiguation
4. **Organize by project**: Use project-specific `.protokoll/` directories
5. **Keep global context minimal**: Only truly global entities

## Troubleshooting

### Context Not Found

```bash
# Check discovery with verbose mode
protokoll --verbose --input-directory ./recordings

# Look for: "Found .protokoll at: ..."
```

### Wrong Entity Matched

1. Check `sounds_like` for conflicts
2. Add more specific phonetic patterns
3. Use `--debug` to see matching decisions

### Performance Issues

1. Keep context files small
2. Use project-specific context
3. Avoid duplicate entries

