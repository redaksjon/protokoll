# Protokoll MCP Resources - Quick Start

## TL;DR

Protokoll now exposes comprehensive resources for discovering and querying:
- **Audio files** (inbound and processed)
- **Transcripts** (with filtering and pagination)
- **Context entities** (people, projects, terms, companies)
- **Configuration** (settings and discovered directories)

## Quick Examples

### 1. Discover What's Available

```typescript
// List all available resources
const response = await client.listResources();

// You'll see:
// - Current Configuration
// - Inbound Audio Files (with count)
// - Processed Audio Files (if configured)
// - All Projects (with count)
// - All People (with count)
// - All Terms (with count)
// - All Companies (with count)
// - Recent Transcripts (10 most recent)
```

### 2. Check for Audio Files to Process

```typescript
// Find the inbound audio resource
const inbound = response.resources.find(r => 
  r.name === 'Inbound Audio Files'
);

// Read it
const audioData = await client.readResource(inbound.uri);
const files = JSON.parse(audioData.text);

console.log(`${files.count} files ready to process`);
files.files.forEach(f => {
  console.log(`- ${f.filename} (${f.sizeHuman})`);
});
```

### 3. Browse Recent Transcripts

```typescript
// Find recent transcripts resource
const recent = response.resources.find(r => 
  r.name === 'Recent Transcripts'
);

// Read the list
const transcriptData = await client.readResource(recent.uri);
const transcripts = JSON.parse(transcriptData.text);

// Read the latest transcript
const latest = transcripts.transcripts[0];
const content = await client.readResource(latest.uri);
console.log(content.text); // Markdown content
```

### 4. Explore Context Entities

```typescript
// Find all projects resource
const projects = response.resources.find(r => 
  r.name === 'All Projects'
);

// Read the list
const projectData = await client.readResource(projects.uri);
const projectList = JSON.parse(projectData.text);

// Read a specific project
const project = projectList.entities[0];
const projectDetails = await client.readResource(project.uri);
console.log(projectDetails.text); // YAML format
```

### 5. Check Configuration

```typescript
// Find config resource
const config = response.resources.find(r => 
  r.name === 'Current Configuration'
);

// Read it
const configData = await client.readResource(config.uri);
const settings = JSON.parse(configData.text);

console.log('Output directory:', settings.config.outputDirectory);
console.log('Entity counts:', settings.entityCounts);
console.log('Discovered directories:', settings.discoveredDirectories);
```

## Resource URI Patterns

### Audio Resources
```
protokoll://audio/inbound                          # Use config's inputDirectory
protokoll://audio/inbound?directory=/custom/path   # Override directory
protokoll://audio/processed                        # Use config's processedDirectory
protokoll://audio/processed?directory=/custom/path # Override directory
```

### Transcript Resources
```
protokoll://transcript/path/to/file.md                      # Single transcript
protokoll://transcripts?directory=/path                     # List all
protokoll://transcripts?directory=/path&limit=10            # Paginate
protokoll://transcripts?directory=/path&startDate=2026-01-01 # Filter by date
```

### Entity Resources
```
protokoll://entity/person/john-smith      # Single person
protokoll://entity/project/redaksjon      # Single project
protokoll://entity/term/kubernetes        # Single term
protokoll://entity/company/acme-corp      # Single company
protokoll://entities/person               # List all people
protokoll://entities/project              # List all projects
protokoll://entities/term                 # List all terms
protokoll://entities/company              # List all companies
```

### Configuration Resource
```
protokoll://config                        # Current configuration
protokoll://config/path/to/.protokoll     # Specific config path
```

## Response Formats

### Audio Files
```json
{
  "directory": "/absolute/path",
  "count": 5,
  "totalSize": 52428800,
  "files": [
    {
      "filename": "recording.m4a",
      "path": "/absolute/path/recording.m4a",
      "size": 10485760,
      "sizeHuman": "10.00 MB",
      "modified": "2026-01-29T20:15:30.000Z",
      "extension": "m4a"
    }
  ],
  "supportedExtensions": ["mp3", "m4a", "wav", "webm", ...]
}
```

### Transcript List
```json
{
  "directory": "/path/to/transcripts",
  "transcripts": [
    {
      "uri": "protokoll://transcript/path/to/file.md",
      "path": "/absolute/path/to/file.md",
      "filename": "2026-01-29-1015-meeting.md",
      "date": "2026-01-29",
      "time": "10:15",
      "title": "Meeting Notes"
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

### Entity List
```json
{
  "entityType": "person",
  "count": 25,
  "entities": [
    {
      "uri": "protokoll://entity/person/john-smith",
      "id": "john-smith",
      "name": "John Smith",
      "company": "acme-corp",
      "role": "Engineering Manager"
    }
  ]
}
```

### Individual Entity (YAML)
```yaml
id: john-smith
name: John Smith
type: person
firstName: John
lastName: Smith
company: acme-corp
role: Engineering Manager
sounds_like:
  - jon smith
  - john smyth
```

### Configuration
```json
{
  "hasContext": true,
  "discoveredDirectories": [
    {
      "path": "/home/user/project/.protokoll",
      "level": 0,
      "isPrimary": true
    }
  ],
  "entityCounts": {
    "projects": 5,
    "people": 12,
    "terms": 8,
    "companies": 3
  },
  "config": {
    "outputDirectory": "~/notes",
    "outputStructure": "month",
    "model": "gpt-5.2"
  }
}
```

## Common Workflows

### Workflow 1: Process Waiting Audio Files

1. List resources to find inbound audio
2. Read inbound audio resource to get file list
3. For each file, use `protokoll_process_audio` tool
4. Verify processed files appear in processed audio resource

### Workflow 2: Review Recent Work

1. List resources to find recent transcripts
2. Read recent transcripts resource
3. For each transcript, read the full content
4. Analyze or summarize the transcripts

### Workflow 3: Explore Context

1. List resources to see entity counts
2. Read entity list resources (projects, people, terms)
3. Read specific entities for detailed information
4. Use entity data to improve transcription quality

### Workflow 4: Monitor Processing

1. Check inbound audio count
2. Check processed audio count
3. Check recent transcripts count
4. Compare to identify any stuck processing

## Tips

1. **Start with `resources/list`**: Always begin by listing resources to see what's available
2. **Check counts**: Entity counts help you decide whether to query
3. **Use URIs from responses**: Resources include URIs for easy navigation
4. **Handle missing data gracefully**: Empty arrays indicate no data, not errors
5. **Combine with tools**: Resources are read-only; use tools to modify data

## See Also

- [Full Resources Documentation](./MCP_RESOURCES.md)
- [Implementation Details](./MCP_RESOURCES_IMPLEMENTATION.md)
- [MCP Tools Documentation](./MCP_TOOLS.md)
