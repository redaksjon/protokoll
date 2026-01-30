# Protokoll MCP Resources

Protokoll exposes several types of resources through its MCP server, providing AI assistants with read-only access to transcripts, audio files, context entities, and configuration.

## Resource Types

### 1. Audio Resources

#### Inbound Audio Files
**URI Template**: `protokoll://audio/inbound?directory={directory}`

Lists audio files waiting to be processed in the input directory.

**Response Format**:
```json
{
  "directory": "/absolute/path/to/recordings",
  "count": 5,
  "totalSize": 52428800,
  "files": [
    {
      "filename": "recording-2026-01-29.m4a",
      "path": "/absolute/path/to/recordings/recording-2026-01-29.m4a",
      "size": 10485760,
      "sizeHuman": "10.00 MB",
      "modified": "2026-01-29T20:15:30.000Z",
      "extension": "m4a"
    }
  ],
  "supportedExtensions": ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "qta"]
}
```

**Use Cases**:
- Check if there are audio files ready to process
- Determine which files to transcribe next
- Monitor the inbound queue

#### Processed Audio Files
**URI Template**: `protokoll://audio/processed?directory={directory}`

Lists audio files that have been processed and moved to the processed directory.

**Response Format**: Same as inbound audio files

**Use Cases**:
- Track processing history
- Verify files were successfully processed
- Clean up old processed files

### 2. Transcript Resources

#### Individual Transcript
**URI Template**: `protokoll://transcript/{path}`

Reads a specific transcript file.

**Response Format**: Raw markdown content of the transcript

**Use Cases**:
- Review transcript content
- Extract information from transcripts
- Analyze transcript metadata

#### Transcripts List
**URI Template**: `protokoll://transcripts?directory={directory}&startDate={date}&endDate={date}&limit={n}&offset={n}`

Lists transcripts in a directory with filtering and pagination.

**Query Parameters**:
- `directory` (required): Directory to search for transcripts
- `startDate` (optional): Filter transcripts from this date onwards (YYYY-MM-DD)
- `endDate` (optional): Filter transcripts up to this date (YYYY-MM-DD)
- `limit` (optional): Maximum number of results (default: 50)
- `offset` (optional): Number of results to skip (default: 0)

**Response Format**:
```json
{
  "directory": "/path/to/transcripts",
  "transcripts": [
    {
      "uri": "protokoll://transcript/path/to/file.md",
      "path": "/absolute/path/to/file.md",
      "filename": "2026-01-29-1015-meeting-notes.md",
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
  },
  "filters": {
    "startDate": "2026-01-01",
    "endDate": "2026-01-31"
  }
}
```

**Use Cases**:
- Browse recent transcripts
- Search for transcripts by date range
- Paginate through large transcript collections

### 3. Context Entity Resources

#### Individual Entity
**URI Template**: `protokoll://entity/{type}/{id}`

Reads a specific context entity (person, project, term, company, or ignored term).

**Entity Types**:
- `person`: People mentioned in transcripts
- `project`: Projects that affect routing and classification
- `term`: Domain-specific terminology and acronyms
- `company`: Organizations referenced in notes
- `ignored`: Terms that are explicitly ignored

**Response Format**: YAML representation of the entity

**Example** (person):
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
context: Works on the infrastructure team
```

**Use Cases**:
- Look up entity details
- Check phonetic variants for name correction
- Review entity relationships

#### Entities List
**URI Template**: `protokoll://entities/{type}`

Lists all entities of a given type.

**Response Format**:
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

**Use Cases**:
- Browse all people, projects, terms, or companies
- Build entity indexes
- Discover available context

### 4. Configuration Resource

**URI Template**: `protokoll://config` or `protokoll://config/{path}`

Provides information about the Protokoll configuration.

**Response Format**:
```json
{
  "hasContext": true,
  "discoveredDirectories": [
    {
      "path": "/home/user/project/.protokoll",
      "level": 0,
      "isPrimary": true
    },
    {
      "path": "/home/user/.protokoll",
      "level": 1,
      "isPrimary": false
    }
  ],
  "entityCounts": {
    "projects": 5,
    "people": 12,
    "terms": 8,
    "companies": 3,
    "ignored": 2
  },
  "config": {
    "outputDirectory": "~/notes",
    "outputStructure": "month",
    "model": "gpt-5.2",
    "smartAssistance": {
      "enabled": true,
      "phoneticModel": "gpt-5-nano",
      "analysisModel": "gpt-5-mini"
    }
  },
  "resourceUris": {
    "projects": "protokoll://entities/project",
    "people": "protokoll://entities/person",
    "terms": "protokoll://entities/term",
    "companies": "protokoll://entities/company"
  }
}
```

**Use Cases**:
- Understand the current configuration
- Discover available context directories
- Check entity counts before querying

## Dynamic Resources

When you call `resources/list`, Protokoll returns a list of dynamic resources based on the current context:

1. **Current Configuration**: Link to the active configuration
2. **Inbound Audio Files**: Link to audio files waiting to be processed
3. **Processed Audio Files**: Link to processed audio files (if configured)
4. **Entity Lists**: Links to all entity types with counts
5. **Recent Transcripts**: Link to the 10 most recent transcripts

## Usage Examples

### Check for Audio Files to Process

```typescript
// List resources to find inbound audio
const resources = await client.listResources();
const inboundAudio = resources.resources.find(r => 
  r.name === 'Inbound Audio Files'
);

// Read the inbound audio resource
const audioList = await client.readResource(inboundAudio.uri);
const data = JSON.parse(audioList.text);

console.log(`Found ${data.count} audio files to process`);
data.files.forEach(file => {
  console.log(`- ${file.filename} (${file.sizeHuman})`);
});
```

### Browse Recent Transcripts

```typescript
// Get recent transcripts
const resources = await client.listResources();
const recentTranscripts = resources.resources.find(r => 
  r.name === 'Recent Transcripts'
);

const transcriptList = await client.readResource(recentTranscripts.uri);
const data = JSON.parse(transcriptList.text);

// Read the most recent transcript
const latest = data.transcripts[0];
const transcript = await client.readResource(latest.uri);
console.log(transcript.text);
```

### Explore Context Entities

```typescript
// List all projects
const projectsUri = 'protokoll://entities/project';
const projectsList = await client.readResource(projectsUri);
const projects = JSON.parse(projectsList.text);

// Read details for a specific project
const project = projects.entities[0];
const projectDetails = await client.readResource(project.uri);
console.log(projectDetails.text); // YAML format
```

## Resource Discovery Workflow

1. **Start with `resources/list`**: Get dynamic resources for the current context
2. **Check configuration**: Read the config resource to understand the setup
3. **Explore entities**: Use entity list resources to discover available context
4. **Access specific data**: Use individual resource URIs to read specific items

## Notes

- All audio and transcript paths are absolute paths
- File sizes are provided in both bytes and human-readable format
- Transcripts are sorted by date (newest first)
- Entity lists include URIs for easy navigation
- Resources are read-only; use tools for modifications
