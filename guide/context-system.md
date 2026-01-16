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
term: Kubernetes
sounds_like:
  - "kube"
  - "k8s"
  - "kuber netties"
  - "kubernetes"
context: "Container orchestration platform"
```

## Phonetic Aliases (sounds_like)

The `sounds_like` field maps common mishearings to correct spellings:

```yaml
sounds_like:
  - "pre a"         # Whisper might hear "Priya" as "pre a"
  - "pria"          # Or as "pria"
  - "preeya"        # Or as "preeya"
```

When Protokoll sees any of these in a transcript, it knows to correct them.

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
  
  // Phonetic lookup
  findByPhonetic(sounds_like: string): Entity | undefined;
  
  // State
  hasContext(): boolean;
  
  // Persistence
  savePerson(person: Person): Promise<void>;
  saveProject(project: Project): Promise<void>;
}
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

