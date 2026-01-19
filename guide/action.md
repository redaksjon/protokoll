# Transcript Management

Protokoll provides comprehensive tools for managing your transcript library: listing, searching, editing, and combining transcripts.

## List Transcripts

Browse, search, and filter your transcript library with pagination.

### Basic Usage

```bash
protokoll transcript list <directory>
```

### Examples

```bash
# List recent transcripts (default: 50 most recent, sorted by date)
protokoll transcript list ~/notes

# Search for transcripts containing specific text
protokoll transcript list ~/notes --search "kubernetes"

# Filter by date range
protokoll transcript list ~/notes --start-date 2026-01-01 --end-date 2026-01-31

# Sort by filename or title
protokoll transcript list ~/notes --sort-by title

# Pagination
protokoll transcript list ~/notes --limit 25 --offset 50

# Combine multiple filters
protokoll transcript list ~/notes \
  --search "meeting" \
  --start-date 2026-01-01 \
  --sort-by date \
  --limit 20
```

### Output Example

```
📂 Transcripts in: ~/notes
🔍 Search: "kubernetes"
📊 Showing 1-3 of 12 total

✅ 2026-01-18 14:30 - Setting up Kubernetes Cluster
   2026-01-18-1430_Kubernetes_Setup.md

✅ 2026-01-17 - Kubernetes Deployment Notes
   2026-01-17_K8s_Deploy.md

   2026-01-15 09:00 - DevOps Discussion with Kubernetes
   2026-01-15-0900_DevOps_Talk.md

💡 More results available. Use --offset 20 to see the next page.
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--limit <number>` | Max results to return | 50 |
| `--offset <number>` | Results to skip (pagination) | 0 |
| `--sort-by <field>` | Sort by: date, filename, title | date |
| `--start-date <YYYY-MM-DD>` | Filter from this date | none |
| `--end-date <YYYY-MM-DD>` | Filter to this date | none |
| `--search <text>` | Search filename and content | none |

### Display Format

Each transcript shows:
- **Status indicator**: ✅ = has raw Whisper output, blank = no raw data
- **Date**: Extracted from filename (YYYY-MM-DD)
- **Time**: If present in filename (HH:MM)
- **Title**: Extracted from `# heading` in the document
- **Filename**: The actual file name

### Features

- **Recursive search**: Finds transcripts in all subdirectories
- **Fast text search**: Searches both filename and content
- **Flexible sorting**: Sort by date (newest first), filename, or title
- **Date filtering**: Focus on specific time periods
- **Pagination**: Handle large libraries efficiently

### Entity Metadata in Results

The list command returns entity metadata for each transcript (when available):

```json
{
  "transcripts": [
    {
      "path": "/notes/2026-01-18_Meeting.md",
      "date": "2026-01-18",
      "title": "Meeting with Priya",
      "entities": {
        "people": [
          { "id": "priya-sharma", "name": "Priya Sharma" }
        ],
        "projects": [
          { "id": "project-alpha", "name": "Project Alpha" }
        ],
        "terms": [
          { "id": "kubernetes", "name": "Kubernetes" }
        ]
      }
    }
  ]
}
```

This enables:
- Querying transcripts by entity ("show all transcripts mentioning Priya")
- Building knowledge graphs
- Cross-referencing content
- Automated indexing

### MCP Tool

Also available as `protokoll_list_transcripts` for AI assistants to browse your transcript library programmatically.

### Querying by Entity

Find transcripts that reference specific entities:

```bash
# Search for transcripts mentioning a person
protokoll transcript list ~/notes --search "Priya Sharma"

# Find all transcripts about a project
protokoll transcript list ~/notes --search "Project Alpha"

# Combine with date filters
protokoll transcript list ~/notes \
  --search "kubernetes" \
  --start-date 2026-01-01 \
  --end-date 2026-01-31
```

**Programmatic Access:** Use `parseEntityMetadata()` from `util/metadata.ts` to extract entity references from transcript content.

## Entity Metadata in Transcripts

### Overview

Every transcript automatically includes structured entity metadata at the bottom. This enables powerful querying and knowledge management capabilities.

### Format

```markdown
---

## Entity References

<!-- Machine-readable entity metadata for indexing and querying -->

### People

- `priya-sharma`: Priya Sharma
- `john-smith`: John Smith

### Projects

- `project-alpha`: Project Alpha

### Terms

- `kubernetes`: Kubernetes
- `docker`: Docker
```

### What Gets Tracked

Entities are automatically recorded when:
- **lookup_person** finds a person
- **lookup_project** matches a project
- **verify_spelling** corrects a term
- Any tool references an entity from your context

### Benefits

1. **Find all transcripts mentioning a person:**
   ```bash
   protokoll transcript list ~/notes --search "priya-sharma"
   ```

2. **Find all discussions about a technology:**
   ```bash
   protokoll transcript list ~/notes --search "kubernetes"
   ```

3. **Build knowledge graphs:** Connect people, projects, and topics

4. **Create indexes:** Programmatically build searchable databases

5. **Cross-reference:** Find related content based on shared entities

### Example Transcript with Metadata

```markdown
# Meeting Notes

## Metadata

**Date**: January 18, 2026
**Project**: Project Alpha

---

Discussion content here...

---

## Entity References

### People

- `priya-sharma`: Priya Sharma

### Projects

- `project-alpha`: Project Alpha

### Terms

- `kubernetes`: Kubernetes
```

### Programmatic Usage

```typescript
import { parseEntityMetadata } from '@/util/metadata';
import { readFile } from 'fs/promises';

const content = await readFile('transcript.md', 'utf-8');
const entities = parseEntityMetadata(content);

// Query by entity
if (entities?.people) {
  const hasPriya = entities.people.some(p => p.id === 'priya-sharma');
  console.log('Priya mentioned:', hasPriya);
}
```

### Integration with List Command

The `protokoll transcript list` command automatically includes entity metadata in results, enabling queries like:

```typescript
const results = await listTranscripts({
  directory: '~/notes',
  search: 'kubernetes'
});

// Filter to only transcripts that mention Priya
const priyaKubernetes = results.transcripts.filter(t =>
  t.entities?.people?.some(p => p.id === 'priya-sharma') &&
  t.entities?.terms?.some(term => term.id === 'kubernetes')
);
```

## Edit & Combine

The `action` command provides editing and combining capabilities:

| Mode | Usage | Description |
|------|-------|-------------|
| **Edit** | `protokoll action [options] <file>` | Edit a single transcript (title, project) |
| **Combine** | `protokoll action --combine "<files>"` | Merge multiple transcripts into one |

### Edit a Single Transcript

## Edit Mode

Edit a single transcript to change its title and/or project.

### Basic Usage

```bash
protokoll action [options] <file>
```

Where `<file>` is the path to the transcript to edit.

### Examples

#### Change the Title

```bash
protokoll action --title "Time to Celebrate" /path/to/transcript.md
```

This will:
1. Update the document heading to `# Time to Celebrate`
2. Rename the file to `15-1412-time-to-celebrate.md` (preserving timestamp)

#### Change the Project

```bash
protokoll action --project client-alpha /path/to/transcript.md
```

This will:
1. Update the project metadata in the document
2. Move the file to the project's configured destination

#### Change Both Title and Project

```bash
protokoll action --title "Q1 Planning Session" --project quarterly-planning /path/to/transcript.md
```

#### Preview Changes (Dry Run)

```bash
protokoll action --title "New Title" /path/to/transcript.md --dry-run --verbose
```

Shows what would happen without making any changes.

## Combine Mode

Merge multiple related transcripts into a single document. When combining, source files are **automatically deleted** after the combined file is created.

### Basic Usage

```bash
protokoll action --combine "<files>"
```

Where `<files>` is a newline-separated list of transcript file paths.

### Examples

#### Combine with Custom Title

```bash
protokoll action --title "Time to Celebrate" --combine "/path/to/part1.md
/path/to/part2.md
/path/to/part3.md"
```

This creates a combined transcript and deletes the source files.

#### Combine and Change Project

```bash
protokoll action --title "Full Meeting Notes" --project client-alpha --combine "/path/to/part1.md
/path/to/part2.md"
```

This will:
1. Combine the transcripts
2. Set the custom title
3. Update the metadata to reflect the new project
4. Route the output to the project's configured destination
5. Delete the source files

#### Preview Changes (Dry Run)

```bash
protokoll action --combine "/path/to/files..." --dry-run --verbose
```

Shows what would happen without making any changes.

### Command Options

| Option | Short | Description |
|--------|-------|-------------|
| `--title <title>` | `-t` | Set a custom title for the document and filename |
| `--project <id>` | `-p` | Change to a different project (updates metadata and routing) |
| `--combine <files>` | `-c` | Combine multiple files (newline-separated list) |
| `--dry-run` | | Show what would happen without making changes |
| `--verbose` | `-v` | Show detailed output |

## How It Works

### Edit Mode

1. **Parses the transcript**: Extracts title, metadata, and content
2. **Updates title**: If `--title` is provided, changes the document heading
3. **Updates project**: If `--project` is provided, updates metadata and destination
4. **Renames/moves file**: If title or project changed, moves to new location
5. **Deletes original**: If file was renamed, removes the old file

### Combine Mode

1. **Parses all transcripts**: Extracts metadata, title, and content from each file
2. **Sorts chronologically**: Orders transcripts by filename (which includes timestamp)
3. **Merges metadata**: Uses the first transcript's date/time, combines durations, deduplicates tags
4. **Creates sections**: Each source transcript becomes a section with its original title
5. **Routes intelligently**: If `--project` is specified, uses that project's routing configuration
6. **Cleans up**: Automatically deletes source files after successful combine

### Title Slugification

When you provide a custom title, it's converted to a filename-safe format:

| Title | Filename |
|-------|----------|
| `Time to Celebrate` | `time-to-celebrate` |
| `Meeting: Q1 Planning & Review!` | `meeting-q1-planning-review` |
| `Sprint 42 Retrospective` | `sprint-42-retrospective` |

The slug is limited to 50 characters and preserves the timestamp prefix from the original file.

## Output Format

### Edit Mode Output

When editing a single transcript:

```markdown
# New Title Here

## Metadata

**Date**: January 15, 2026
**Time**: 02:12 PM

**Project**: New Project Name
**Project ID**: `new-project-id`

### Routing
...

---

[Original content preserved]
```

### Combine Mode Output

When combining transcripts:

```markdown
# Combined Title

## Metadata

**Date**: January 15, 2026
**Time**: 02:12 PM

**Project**: Project Name
**Project ID**: `project-id`

### Routing
...

**Tags**: `tag1`, `tag2`, `tag3`

**Duration**: 15m 30s

---

## First Part Title
*Source: 15-1412-first-part.md*

First part content...

## Second Part Title
*Source: 15-1421-second-part.md*

Second part content...
```

## Project Routing

When using `--project`, the action command leverages Protokoll's routing system:

### Project Configuration

Projects are configured in `.protokoll/projects/`:

```yaml
# ~/.protokoll/projects/client-alpha.yaml
id: client-alpha
name: Client Alpha
type: project

classification:
  context_type: work
  explicit_phrases:
    - "client alpha"

routing:
  destination: "~/clients/alpha/notes"
  structure: "month"
  filename_options:
    - date
    - time
    - subject
  auto_tags:
    - client
    - alpha

active: true
```

### Routing Behavior

When you specify `--project client-alpha`:

1. **Metadata Update**: Project name and ID are updated in the transcript
2. **Destination**: Output goes to `~/clients/alpha/notes/2026/01/` (based on structure)
3. **Filename**: Built using the project's filename options (or slugified title if provided)
4. **Tags**: Project's `auto_tags` are added to the combined tags

## Use Cases

### 1. Rename a Transcript

You want to give a transcript a more meaningful title:

```bash
protokoll action --title "Q1 Budget Review Meeting" /path/to/15-1412-meeting.md
```

### 2. Move to Different Project

You realize a transcript belongs to a different project:

```bash
protokoll action --project client-beta /path/to/15-1412-meeting.md
```

### 3. Consolidate Meeting Notes

You recorded a long meeting in multiple segments:

```bash
protokoll action --title "Full Team Standup" --combine "/path/to/part1.md
/path/to/part2.md
/path/to/part3.md"
```

### 4. Reorganize by Project

Combine transcripts that were initially routed to the default location:

```bash
protokoll action --title "Sprint 42 Planning" --project sprint-42 --combine "/path/to/misc1.md
/path/to/misc2.md"
```

## Troubleshooting

### File Not Found

```
Error: File not found: /path/to/file.md
```

Ensure the file path is correct and accessible. Use absolute paths to avoid ambiguity.

### Project Not Found

```
Error: Project not found: my-project
```

Verify the project exists:

```bash
protokoll project list
protokoll project show my-project
```

### Must Specify Title or Project

```
Error: Must specify --title and/or --project when editing a single file.
```

When editing a single file (not combining), you must provide at least one of `--title` or `--project`.

### At Least 2 Files Required

```
Error: At least 2 transcript files are required for --combine.
```

The combine mode requires at least 2 transcripts. For single files, use edit mode instead.

## Best Practices

1. **Use `--dry-run` first**: Always preview changes before committing

2. **Verify project routing**: Check project configuration before using `--project`

3. **Use absolute paths**: Avoid relative paths to prevent confusion

4. **Meaningful titles**: When combining, provide a descriptive title that captures the full session

## API Reference

For programmatic use, the action module exports:

```typescript
import {
  parseTranscript,
  combineTranscripts,
  editTranscript,
  parseFilePaths,
  extractTimestampFromFilename,
  formatMetadataMarkdown,
  slugifyTitle,
} from '@redaksjon/protokoll/cli/action';

// Parse a single transcript
const parsed = await parseTranscript('/path/to/transcript.md');

// Edit a transcript
const edited = await editTranscript('/path/to/file.md', {
  title: 'New Title',
  projectId: 'my-project',
});

// Combine multiple transcripts
const combined = await combineTranscripts(
  ['/path/to/file1.md', '/path/to/file2.md'],
  { title: 'Combined Title', projectId: 'my-project' }
);

// Slugify a title for use in filenames
const slug = slugifyTitle('New Approach to Life'); // 'new-approach-to-life'
```

## See Also

- [Routing System](./routing.md) - How project routing works
- [Context Commands](./context-commands.md) - Managing projects and entities
- [Configuration](./configuration.md) - Setting up Protokoll
