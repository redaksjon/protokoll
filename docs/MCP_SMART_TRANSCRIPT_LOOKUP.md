# Smart File Lookup

## Overview

Protokoll's MCP tools now support **smart file lookup** for both transcripts and audio files, making them much easier to work with. Instead of requiring full absolute paths, you can now use:

- **Filenames**: `"meeting-notes.md"` or `"recording.m4a"`
- **Partial filenames**: `"2026-01-29"` or `"meeting"`
- **Absolute paths**: `/full/path/to/file.md` (still supported)

The system automatically searches the configured directories and finds the files you're looking for.

## How It Works

### 1. Automatic Directory Discovery

When you don't specify a directory, tools use the configured directories from your `.protokoll/config.yaml`:

```yaml
inputDirectory: ~/recordings    # For audio files
outputDirectory: ~/notes         # For transcripts
processedDirectory: ~/processed  # For processed audio
```

This means you never have to remember or specify paths - the system knows where your files are.

### 2. Intelligent Search

When you provide a filename or partial filename, the system:

1. Checks if it's already an absolute path that exists
2. If not, searches the output directory recursively
3. Matches against filenames and content
4. Returns the best match

### 3. Disambiguation

If multiple transcripts match your query:
- **Exact filename match**: Returns that transcript
- **Multiple matches**: Lists all matches and asks you to be more specific

## Affected Tools

### Transcript Tools

All transcript tools now support smart lookup:

### `protokoll_read_transcript`

**Before** (required absolute path):
```json
{
  "transcriptPath": "/Users/me/notes/2026/01/2026-01-29-1015-meeting-notes.md"
}
```

**After** (filename or partial):
```json
{
  "transcriptPath": "meeting-notes.md"
}
```

or

```json
{
  "transcriptPath": "2026-01-29"
}
```

### `protokoll_edit_transcript`

**Before**:
```json
{
  "transcriptPath": "/Users/me/notes/2026/01/2026-01-29-1015-meeting-notes.md",
  "title": "Updated Meeting Notes"
}
```

**After**:
```json
{
  "transcriptPath": "meeting-notes",
  "title": "Updated Meeting Notes"
}
```

### `protokoll_combine_transcripts`

**Before**:
```json
{
  "transcriptPaths": [
    "/Users/me/notes/2026/01/2026-01-29-1015-meeting-1.md",
    "/Users/me/notes/2026/01/2026-01-29-1030-meeting-2.md"
  ]
}
```

**After**:
```json
{
  "transcriptPaths": ["meeting-1", "meeting-2"]
}
```

or

```json
{
  "transcriptPaths": ["2026-01-29-1015", "2026-01-29-1030"]
}
```

### `protokoll_provide_feedback`

**Before**:
```json
{
  "transcriptPath": "/Users/me/notes/2026/01/2026-01-29-1015-meeting-notes.md",
  "feedback": "Change 'John' to 'Jon'"
}
```

**After**:
```json
{
  "transcriptPath": "meeting-notes",
  "feedback": "Change 'John' to 'Jon'"
}
```

### `protokoll_list_transcripts`

Now **directory is optional**:

**Before**:
```json
{
  "directory": "/Users/me/notes"
}
```

**After** (uses configured output directory):
```json
{}
```

or with search:

```json
{
  "search": "meeting"
}
```

### Audio Tools

Audio processing tools now support smart lookup:

### `protokoll_process_audio`

**Before** (required absolute path):
```json
{
  "audioFile": "/Users/me/recordings/2026-01-29-meeting.m4a"
}
```

**After** (filename or partial):
```json
{
  "audioFile": "meeting.m4a"
}
```

or

```json
{
  "audioFile": "2026-01-29"
}
```

### `protokoll_batch_process`

Now **directory is optional**:

**Before**:
```json
{
  "inputDirectory": "/Users/me/recordings"
}
```

**After** (uses configured input directory):
```json
{}
```

## Examples

### Transcript Examples

#### Example 1: Read Today's Transcript

```typescript
// Just use today's date
const result = await client.callTool('protokoll_read_transcript', {
  transcriptPath: '2026-01-29'
});
```

#### Example 2: Edit a Transcript by Partial Name

```typescript
// Find by partial filename
const result = await client.callTool('protokoll_edit_transcript', {
  transcriptPath: 'standup',
  title: 'Daily Standup - Updated'
});
```

#### Example 3: Combine Multiple Transcripts

```typescript
// Use date patterns to find related transcripts
const result = await client.callTool('protokoll_combine_transcripts', {
  transcriptPaths: [
    '2026-01-29-morning',
    '2026-01-29-afternoon'
  ],
  title: 'Full Day Notes'
});
```

#### Example 4: List Recent Transcripts

```typescript
// No directory needed - uses config
const result = await client.callTool('protokoll_list_transcripts', {
  limit: 10,
  sortBy: 'date'
});
```

#### Example 5: Search and Edit

```typescript
// First, search for transcripts
const list = await client.callTool('protokoll_list_transcripts', {
  search: 'project review'
});

// Then edit using just the filename
const edit = await client.callTool('protokoll_edit_transcript', {
  transcriptPath: list.transcripts[0].filename,
  projectId: 'new-project'
});
```

### Audio Examples

#### Example 6: Process Today's Recording

```typescript
// Just use today's date or partial filename
const result = await client.callTool('protokoll_process_audio', {
  audioFile: '2026-01-29'
});
```

#### Example 7: Process by Filename

```typescript
// Use just the filename
const result = await client.callTool('protokoll_process_audio', {
  audioFile: 'meeting.m4a'
});
```

#### Example 8: Batch Process All Audio

```typescript
// No directory needed - uses configured input directory
const result = await client.callTool('protokoll_batch_process', {});
```

#### Example 9: Check Audio Files, Then Process

```typescript
// First, check what's available using resources
const audioList = await client.readResource('protokoll://audio/inbound');
const files = JSON.parse(audioList.text);

// Then process a specific file by name
const result = await client.callTool('protokoll_process_audio', {
  audioFile: files.files[0].filename
});
```

## Error Messages

### No Match Found (Transcripts)

```
No transcript found matching "xyz" in /Users/me/notes.
Try using protokoll_list_transcripts to see available transcripts.
```

**Solution**: Use `protokoll_list_transcripts` to browse available transcripts.

### No Match Found (Audio)

```
No audio file found matching "xyz" in /Users/me/recordings.
Try using the protokoll://audio/inbound resource to see available audio files.
```

**Solution**: Use the `protokoll://audio/inbound` resource to browse available audio files.

### Multiple Matches (Transcripts)

```
Multiple transcripts match "meeting": 
  - 2026-01-29-meeting-notes.md
  - 2026-01-28-meeting-notes.md
  - 2026-01-27-meeting-notes.md
Please be more specific.
```

**Solution**: Add more detail to your query (e.g., include the date: `"2026-01-29-meeting"`).

### Multiple Matches (Audio)

```
Multiple audio files match "recording": 
  - 2026-01-29-recording.m4a
  - 2026-01-28-recording.m4a
Please be more specific.
```

**Solution**: Add more detail to your query (e.g., include the date or time: `"2026-01-29-recording"`).

## Best Practices

### 1. Use Date Patterns for Recent Work

```typescript
// Today's files
transcriptPath: '2026-01-29'
audioFile: '2026-01-29'

// This week's files
search: '2026-01'
```

### 2. Use Descriptive Keywords

```typescript
// Good - specific
transcriptPath: 'standup-notes'
audioFile: 'meeting-recording'

// Less specific
transcriptPath: 'notes'
audioFile: 'recording'
```

### 3. Combine with Resources for Discovery

```typescript
// For transcripts - discover first
const list = await client.callTool('protokoll_list_transcripts', {
  search: 'meeting',
  limit: 5
});

// Then use the exact filename
const transcript = await client.callTool('protokoll_read_transcript', {
  transcriptPath: list.transcripts[0].filename
});

// For audio - use resources
const audioList = await client.readResource('protokoll://audio/inbound');
const files = JSON.parse(audioList.text);

// Then process by filename
const result = await client.callTool('protokoll_process_audio', {
  audioFile: files.files[0].filename
});
```

### 4. Override Directory When Needed

```typescript
// Use a specific directory instead of config
const transcripts = await client.callTool('protokoll_list_transcripts', {
  directory: '/custom/path/to/transcripts'
});

const batch = await client.callTool('protokoll_batch_process', {
  inputDirectory: '/custom/path/to/audio'
});
```

### 5. Batch Process Without Parameters

```typescript
// Process all audio in the configured input directory
const result = await client.callTool('protokoll_batch_process', {});
```

## Configuration

### Setting Directories

In your `.protokoll/config.yaml`:

```yaml
inputDirectory: ~/recordings        # Where audio files are stored
outputDirectory: ~/notes            # Where transcripts are saved
processedDirectory: ~/processed     # Where processed audio is moved
outputStructure: month              # or 'none', 'year', 'day'
```

### Hierarchical Configuration

If you have multiple `.protokoll` directories, the closest one takes precedence:

```
/home/user/
  └── .protokoll/config.yaml
      inputDirectory: ~/recordings
      outputDirectory: ~/notes
      
/home/user/projects/work/
  └── .protokoll/config.yaml
      inputDirectory: ~/work-recordings
      outputDirectory: ~/work-notes
```

When working in `/home/user/projects/work/`, the system uses:
- `~/work-recordings` for audio input
- `~/work-notes` for transcript output

## Technical Details

### Search Algorithm (Transcripts)

1. **Exact path check**: If the input is an absolute path that exists, use it
2. **Directory discovery**: Load the configured output directory
3. **Search**: Use `protokoll_list_transcripts` with the input as search term
4. **Match selection**:
   - 0 matches: Error with helpful message
   - 1 match: Return that transcript
   - Multiple matches: Try exact filename match, otherwise error with list

### Search Algorithm (Audio)

1. **Exact path check**: If the input is an absolute path that exists, use it
2. **Directory discovery**: Load the configured input directory
3. **File scan**: Read directory and filter by audio extensions
4. **Match selection**:
   - Exact filename match
   - Partial filename match
   - Basename match (without extension)
5. **Result**:
   - 0 matches: Error with helpful message
   - 1 match: Return that audio file
   - Multiple matches: Error with list of matches

### Performance

- Transcript search is recursive and may be slow for very large collections
- Audio search is single-directory and fast
- Consider using more specific queries for large directories
- Results are not cached between tool calls

### Limitations

- Requires a valid `.protokoll` context
- Only searches in configured directories (or specified directories)
- Partial matches must be unique or include enough detail to disambiguate
- Audio search only looks in the top-level input directory (not recursive)

## Migration Guide

### For Existing Workflows

If you have existing code using absolute paths, it will continue to work. The system detects absolute paths and uses them directly.

### Updating to Use Smart Lookup

Replace absolute paths with filenames:

**Before (Transcripts)**:
```typescript
const path = '/Users/me/notes/2026/01/2026-01-29-1015-meeting.md';
await client.callTool('protokoll_read_transcript', { transcriptPath: path });
```

**After**:
```typescript
await client.callTool('protokoll_read_transcript', { 
  transcriptPath: '2026-01-29-meeting' 
});
```

**Before (Audio)**:
```typescript
const path = '/Users/me/recordings/2026-01-29-meeting.m4a';
await client.callTool('protokoll_process_audio', { audioFile: path });
```

**After**:
```typescript
await client.callTool('protokoll_process_audio', { 
  audioFile: '2026-01-29-meeting' 
});
```

### Handling Ambiguity

If you get "multiple matches" errors, add more detail:

```typescript
// Too vague
transcriptPath: 'meeting'  // ❌ Might match many files
audioFile: 'recording'     // ❌ Might match many files

// Better
transcriptPath: '2026-01-29-meeting'  // ✅ More specific
audioFile: '2026-01-29-recording'     // ✅ More specific

// Even better
transcriptPath: '2026-01-29-1015-meeting'  // ✅ Very specific
audioFile: '2026-01-29-1015-recording'     // ✅ Very specific
```

### Simplifying Batch Operations

**Before**:
```typescript
await client.callTool('protokoll_batch_process', {
  inputDirectory: '/Users/me/recordings'
});
```

**After**:
```typescript
// Just use empty object - uses config
await client.callTool('protokoll_batch_process', {});
```

## See Also

- [MCP Tools Documentation](./MCP_TOOLS.md)
- [MCP Resources Documentation](./MCP_RESOURCES.md)
- [Configuration Guide](../README.md#configuration)
