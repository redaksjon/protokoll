# Transcript Listing and Search

## Overview

Protokoll provides powerful tools for browsing, searching, and filtering your transcript library. The `protokoll transcript list` command and `protokoll_list_transcripts` MCP tool enable efficient navigation of large transcript collections with pagination, date filtering, and full-text search.

## CLI Command

### Basic Usage

```bash
protokoll transcript list <directory>
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--limit <number>` | Maximum results to return | 50 |
| `--offset <number>` | Results to skip (pagination) | 0 |
| `--sort-by <field>` | Sort by: date, filename, title | date |
| `--start-date <YYYY-MM-DD>` | Filter from this date | none |
| `--end-date <YYYY-MM-DD>` | Filter to this date | none |
| `--search <text>` | Search filename and content | none |

### Examples

#### List Recent Transcripts

```bash
# Default: 50 most recent, sorted by date
protokoll transcript list ~/notes
```

Output:
```
📂 Transcripts in: ~/notes
📊 Showing 1-3 of 45 total

✅ 2026-01-18 14:30 - Meeting with Priya about Q1 Planning
   2026-01-18-1430_Meeting_with_Priya.md

✅ 2026-01-17 - Quick Ideas for New Feature
   2026-01-17_Quick_Ideas.md

   2026-01-16 09:15 - Sprint Planning Session
   2026-01-16-0915_Sprint_Planning.md

💡 More results available. Use --offset 50 to see the next page.
```

#### Search Transcripts

```bash
# Find all transcripts mentioning "kubernetes"
protokoll transcript list ~/notes --search "kubernetes"
```

Searches in:
- Filename
- Transcript content (full text)
- Entity metadata

#### Filter by Date Range

```bash
# January 2026 transcripts only
protokoll transcript list ~/notes \
  --start-date 2026-01-01 \
  --end-date 2026-01-31
```

#### Pagination

```bash
# First 25
protokoll transcript list ~/notes --limit 25

# Next 25
protokoll transcript list ~/notes --limit 25 --offset 25

# Third page
protokoll transcript list ~/notes --limit 25 --offset 50
```

#### Sort Options

```bash
# Sort by title alphabetically
protokoll transcript list ~/notes --sort-by title

# Sort by filename
protokoll transcript list ~/notes --sort-by filename

# Sort by date (default, newest first)
protokoll transcript list ~/notes --sort-by date
```

#### Combined Filtering

```bash
# Find meetings about Kubernetes in January
protokoll transcript list ~/notes \
  --search "kubernetes meeting" \
  --start-date 2026-01-01 \
  --end-date 2026-01-31 \
  --sort-by date \
  --limit 20
```

## MCP Tool

### protokoll_list_transcripts

AI assistants can browse your transcript library using this tool.

**Parameters:**

```typescript
{
  directory: string;           // Required: directory to search
  limit?: number;              // Default: 50
  offset?: number;             // Default: 0
  sortBy?: 'date' | 'filename' | 'title';  // Default: 'date'
  startDate?: string;          // Format: YYYY-MM-DD
  endDate?: string;            // Format: YYYY-MM-DD
  search?: string;             // Search term
}
```

**Returns:**

```typescript
{
  directory: string;
  transcripts: Array<{
    path: string;
    filename: string;
    date: string;              // YYYY-MM-DD
    time?: string;             // HH:MM if present in filename
    title: string;             // Extracted from # heading
    hasRawTranscript: boolean; // Has raw Whisper output
    entities?: {               // Entity references (if present)
      people?: Array<{ id: string; name: string }>;
      projects?: Array<{ id: string; name: string }>;
      terms?: Array<{ id: string; name: string }>;
      companies?: Array<{ id: string; name: string }>;
    };
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  filters: {
    sortBy: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  };
}
```

### Example: AI Assistant Usage

**User**: "Show me all my transcripts from last week that mention Kubernetes"

**AI**:
```typescript
const lastWeek = calculateLastWeekDates(); // Helper function

const result = await use_mcp_tool('protokoll_list_transcripts', {
  directory: '/Users/me/notes',
  search: 'kubernetes',
  startDate: lastWeek.start,  // '2026-01-11'
  endDate: lastWeek.end,       // '2026-01-18'
  sortBy: 'date'
});

// AI can now analyze the transcripts and respond
```

## Display Format

### Status Indicator

- ✅ = Has raw Whisper transcript (enables comparison with `protokoll transcript compare`)
- (blank) = No raw transcript available

### Date and Time

- **Date**: Extracted from filename (YYYY-MM-DD)
- **Time**: Extracted if present in filename (HH:MM format)
- Falls back to file creation time if not in filename

### Title Extraction

Protokoll extracts the title from the first `# heading` in the markdown file. If no heading exists, uses the first line of content (truncated to 100 characters).

### Entity Metadata

When a transcript includes entity references in the footer, those are returned in the `entities` field:

```json
{
  "entities": {
    "people": [
      { "id": "priya-sharma", "name": "Priya Sharma" }
    ],
    "terms": [
      { "id": "kubernetes", "name": "Kubernetes" },
      { "id": "docker", "name": "Docker" }
    ]
  }
}
```

This enables powerful queries like:
- "Show all transcripts that mention Priya"
- "Find discussions about Kubernetes"
- "List Project Alpha transcripts"

## Performance

### Recursive Search

The list command searches recursively through all subdirectories:

```
~/notes/
├── 2026/
│   ├── 01/
│   │   ├── file1.md ← Found
│   │   └── file2.md ← Found
│   └── 02/
│       └── file3.md ← Found
└── archive/
    └── old.md ← Found
```

### Exclusions

Automatically excludes:
- `**/node_modules/**`
- `**/.git/**`
- `**/.transcript/**` (raw transcript storage)

### Search Performance

- Text search scans both filename and content
- Entity metadata is parsed only when needed
- Results are paginated to avoid memory issues with large collections

## Common Use Cases

### Find Transcripts by Person

```bash
# All transcripts mentioning Priya Sharma
protokoll transcript list ~/notes --search "Priya Sharma"
```

The search will find matches in:
1. Filename
2. Transcript content
3. Entity References section (if present)

### Find Transcripts by Project

```bash
# All transcripts about Project Alpha
protokoll transcript list ~/notes --search "Project Alpha"
```

### Browse by Date Range

```bash
# Q1 2026 transcripts
protokoll transcript list ~/notes \
  --start-date 2026-01-01 \
  --end-date 2026-03-31
```

### Recent Activity

```bash
# Last 10 transcripts
protokoll transcript list ~/notes --limit 10
```

### Build a Knowledge Index

```bash
# Export all transcripts with entity metadata for indexing
protokoll transcript list ~/notes --limit 1000 > transcripts-index.json
```

The JSON output includes entity references, enabling you to build:
- Person-to-transcript mappings
- Project knowledge bases
- Term frequency analysis
- Cross-reference graphs

## Integration with Other Tools

### With Feedback Command

```bash
# Find transcript, then provide feedback
protokoll transcript list ~/notes --search "meeting with John"
# Note the path, then:
protokoll feedback --file ~/notes/2026/01/meeting.md "John Smith should be John Doe"
```

### With Action Command

```bash
# Find transcripts to combine
protokoll transcript list ~/notes --search "sprint planning" --start-date 2026-01-15
# Then combine them:
protokoll action --combine "path1.md
path2.md
path3.md" --title "Complete Sprint Planning"
```

### With Context Commands

Search results show which entities are referenced, helping you understand what context you already have:

```bash
protokoll transcript list ~/notes --search "kubernetes"
# See that many transcripts reference it
# Check if term is already in context:
protokoll context list terms
```

## Troubleshooting

### No Results Found

Check:
1. Directory path is correct
2. Markdown files (`.md`) exist in directory
3. Search term spelling
4. Date range isn't too narrow

### Slow Performance

For very large directories (10,000+ files):
- Use more specific date ranges
- Search in specific subdirectories
- Reduce limit to smaller batches

### Entity Metadata Not Showing

Entity metadata only appears if:
1. Transcript was processed with entity tracking enabled (recent feature)
2. Entities were actually referenced during processing
3. Transcript includes the "## Entity References" footer

Older transcripts won't have entity metadata until reprocessed.

## Future Enhancements

Planned improvements:
- **Entity-specific filters**: `--person priya-sharma`, `--project alpha`
- **Export formats**: JSON, CSV, SQLite database
- **Fuzzy search**: Typo-tolerant searching
- **Smart suggestions**: "Transcripts like this one"
