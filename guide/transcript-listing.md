# Transcript Listing and Management

Comprehensive guide to browsing, searching, and managing your transcript library.

## Quick Reference

```bash
# List recent transcripts
protokoll transcript list ~/notes

# Search for specific content
protokoll transcript list ~/notes --search "kubernetes"

# Filter by date range
protokoll transcript list ~/notes --start-date 2026-01-01 --end-date 2026-01-31

# Pagination
protokoll transcript list ~/notes --limit 25 --offset 50
```

## Commands

### List Transcripts

Browse your transcript collection with filtering and search.

**Syntax:**
```bash
protokoll transcript list <directory> [options]
```

**Options:**
- `--limit <number>` - Results per page (default: 50)
- `--offset <number>` - Skip N results (default: 0)
- `--sort-by <field>` - Sort by date, filename, or title (default: date)
- `--start-date <YYYY-MM-DD>` - Filter from date
- `--end-date <YYYY-MM-DD>` - Filter to date
- `--search <text>` - Search in filename and content

### Compare Transcripts

See raw Whisper output vs enhanced version.

```bash
protokoll transcript compare <file>
```

See [action.md](./action.md) for details.

### Get Transcript Info

View metadata about a transcript.

```bash
protokoll transcript info <file>
```

## Sorting

### By Date (Default)

Newest transcripts first:

```bash
protokoll transcript list ~/notes --sort-by date
```

Date is extracted from:
1. Filename pattern (YYYY-MM-DD)
2. File creation time (fallback)

Time ordering (when available):
- Filenames with time (YYYY-MM-DD-HHMM) sort by time within the same day
- Newer transcripts appear first

### By Filename

Alphabetical by filename:

```bash
protokoll transcript list ~/notes --sort-by filename
```

Useful when your filenames follow a specific naming convention.

### By Title

Alphabetical by extracted title:

```bash
protokoll transcript list ~/notes --sort-by title
```

## Filtering

### Date Range

Focus on specific time periods:

```bash
# January 2026
protokoll transcript list ~/notes \
  --start-date 2026-01-01 \
  --end-date 2026-01-31

# Last week
protokoll transcript list ~/notes --start-date 2026-01-11

# Before certain date
protokoll transcript list ~/notes --end-date 2025-12-31
```

### Text Search

Find transcripts containing specific content:

```bash
# Search in filename and content
protokoll transcript list ~/notes --search "kubernetes deployment"
```

Search looks in:
1. **Filename**: Fast pattern matching
2. **Content**: Full-text search of transcript
3. **Entity metadata**: Searches entity IDs and names

**Case-insensitive**: Search terms are matched regardless of case.

## Pagination

Handle large transcript collections efficiently.

### Basic Pagination

```bash
# First page (1-50)
protokoll transcript list ~/notes

# Second page (51-100)
protokoll transcript list ~/notes --offset 50

# Third page (101-150)
protokoll transcript list ~/notes --offset 100
```

### Custom Page Size

```bash
# 25 results per page
protokoll transcript list ~/notes --limit 25

# Smaller batches for slower connections
protokoll transcript list ~/notes --limit 10
```

### Navigation Hints

When more results exist, you'll see:

```
💡 More results available. Use --offset 50 to see the next page.
```

Copy and paste the suggested command to continue.

## Entity Metadata

### Viewing Entities

Transcripts that include entity metadata show it in the list output:

```bash
protokoll transcript list ~/notes --search "priya"
```

Returns transcripts with entity data:
```json
{
  "entities": {
    "people": [{ "id": "priya-sharma", "name": "Priya Sharma" }],
    "projects": [{ "id": "project-alpha", "name": "Project Alpha" }],
    "terms": [{ "id": "kubernetes", "name": "Kubernetes" }]
  }
}
```

### Querying by Entity

Find all transcripts referencing a specific entity:

```bash
# By entity ID (precise)
protokoll transcript list ~/notes --search "priya-sharma"

# By entity name (may match content too)
protokoll transcript list ~/notes --search "Priya Sharma"
```

### Entity Types

- **People**: Individuals mentioned in transcripts
- **Projects**: Projects discussed or assigned
- **Terms**: Technical terms, tools, technologies
- **Companies**: Organizations mentioned

See [entity-metadata.md](../docs/entity-metadata.md) for complete details.

## Output Format

### Console Display

```
📂 Transcripts in: ~/notes
📊 Showing 1-3 of 45 total

✅ 2026-01-18 14:30 - Meeting with Priya about Q1 Planning
   2026-01-18-1430_Meeting_with_Priya.md

✅ 2026-01-17 - Quick Ideas for New Feature
   2026-01-17_Quick_Ideas.md

   2026-01-16 09:15 - Sprint Planning Session
   2026-01-16-0915_Sprint_Planning.md
```

**Elements:**
- ✅ = Has raw Whisper transcript
- Date (YYYY-MM-DD format)
- Time (HH:MM if in filename)
- Title (extracted from `# heading`)
- Filename (indented below)

### Programmatic Access

The `listTranscripts()` function returns structured data:

```typescript
{
  transcripts: TranscriptListItem[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}
```

See [CLI API](#cli-api) below.

## Common Workflows

### Finding Recent Meetings

```bash
# Last 10 meetings (assuming they have "meeting" in title/content)
protokoll transcript list ~/notes --search "meeting" --limit 10
```

### Weekly Review

```bash
# This week's transcripts
protokoll transcript list ~/notes --start-date 2026-01-13 --end-date 2026-01-19
```

### Project-Specific Transcripts

```bash
# All Project Alpha transcripts
protokoll transcript list ~/notes --search "project-alpha"
```

### Technology Research

```bash
# All Kubernetes discussions
protokoll transcript list ~/notes --search "kubernetes"

# Compare adoption over time
protokoll transcript list ~/notes --search "kubernetes" --start-date 2025-01-01 --end-date 2025-12-31
protokoll transcript list ~/notes --search "kubernetes" --start-date 2026-01-01
```

### Building Indexes

```bash
# Export all transcripts for indexing
protokoll transcript list ~/notes --limit 10000 > transcripts-index.json

# Process with jq or custom tools
cat transcripts-index.json | jq '.transcripts[].entities.people[].name' | sort | uniq
```

## CLI API

### TypeScript Usage

```typescript
import { listTranscripts, type ListTranscriptsOptions } from '@/cli/transcript';

const results = await listTranscripts({
  directory: '~/notes',
  limit: 50,
  offset: 0,
  sortBy: 'date',
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  search: 'kubernetes'
});

// Access results
console.log(`Found ${results.total} transcripts`);
for (const transcript of results.transcripts) {
  console.log(transcript.title);
  if (transcript.entities?.people) {
    console.log('People:', transcript.entities.people.map(p => p.name));
  }
}
```

### Types

```typescript
interface ListTranscriptsOptions {
  directory: string;
  limit?: number;          // Default: 50
  offset?: number;         // Default: 0
  sortBy?: 'date' | 'filename' | 'title';  // Default: 'date'
  startDate?: string;      // Format: YYYY-MM-DD
  endDate?: string;        // Format: YYYY-MM-DD
  search?: string;
}

interface TranscriptListItem {
  path: string;
  filename: string;
  date: string;            // YYYY-MM-DD
  time?: string;           // HH:MM
  title: string;
  hasRawTranscript: boolean;
  createdAt: Date;
  entities?: {
    people?: Array<{ id: string; name: string }>;
    projects?: Array<{ id: string; name: string }>;
    terms?: Array<{ id: string; name: string }>;
    companies?: Array<{ id: string; name: string }>;
  };
}

interface ListTranscriptsResult {
  transcripts: TranscriptListItem[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}
```

## MCP Integration

The list functionality is also available as an MCP tool for AI assistants.

### Tool: protokoll_list_transcripts

See [mcp-integration.md](./mcp-integration.md#protokoll_list_transcripts) for complete documentation.

**Example AI usage:**

```typescript
// AI assistant can browse transcripts
const recent = await call_tool('protokoll_list_transcripts', {
  directory: '/Users/me/notes',
  limit: 10
});

// AI can search for relevant content
const kubernetes = await call_tool('protokoll_list_transcripts', {
  directory: '/Users/me/notes',
  search: 'kubernetes deployment',
  startDate: '2026-01-01'
});
```

## Performance Considerations

### Large Directories

For directories with thousands of transcripts:

1. **Use date filters**: Narrow the search range
2. **Search specific subdirectories**: Don't search from root if possible
3. **Increase limit carefully**: Default 50 is optimized for most use cases
4. **Consider archiving**: Move old transcripts to archive directories

### Search Performance

- **Filename search**: Very fast (milliseconds)
- **Content search**: Slower for large files (requires reading)
- **Entity search**: Fast (parsed on demand)

**Tip**: For frequent queries, consider building a search index.

## Troubleshooting

### No Transcripts Found

Check:
1. Directory path is correct and absolute
2. Directory contains `.md` files
3. Files aren't in ignored directories (node_modules, .git, etc.)

### Search Not Finding Expected Results

Remember search is:
- Case-insensitive
- Exact substring matching
- Searches filename AND content

Try:
- Simplify search term
- Check spelling
- Use entity IDs (e.g., `kubernetes` vs `Kubernetes`)

### Entity Metadata Missing

Entity metadata only appears in transcripts created after this feature was added. To add to existing transcripts:

1. Reprocess through Protokoll
2. Use feedback command to add entities
3. Manually add following the format

### Slow Performance

For 10,000+ transcripts:
- Use more specific directory paths
- Apply date range filters
- Search in batches with pagination
- Consider creating a search index

## See Also

- [Entity Metadata](../docs/entity-metadata.md) - Complete entity metadata documentation
- [Action Commands](./action.md) - Editing and combining transcripts
- [MCP Integration](./mcp-integration.md) - Using from AI assistants
- [Context System](./context-system.md) - Understanding the context that powers entity tracking
