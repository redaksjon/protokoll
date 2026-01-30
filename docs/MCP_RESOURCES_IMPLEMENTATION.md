# MCP Resources Implementation Summary

## Overview

This document describes the implementation of comprehensive MCP resources for Protokoll, providing AI assistants with discoverable, queryable access to audio files, transcripts, and context entities.

## What Was Implemented

### 1. Audio Resources

#### Inbound Audio Resource
- **URI**: `protokoll://audio/inbound?directory={directory}`
- **Purpose**: Lists audio files waiting to be processed
- **Features**:
  - Automatic directory discovery from config
  - File metadata (size, modified date, extension)
  - Human-readable file sizes
  - Sorted by modification time (newest first)
  - Supports all configured audio extensions

#### Processed Audio Resource
- **URI**: `protokoll://audio/processed?directory={directory}`
- **Purpose**: Lists audio files that have been processed
- **Features**: Same as inbound audio resource

### 2. Enhanced Dynamic Resources

The `resources/list` endpoint now returns dynamic resources based on the current context:

1. **Current Configuration**: Active Protokoll configuration
2. **Inbound Audio Files**: Audio files ready to process
3. **Processed Audio Files**: Previously processed audio files
4. **Entity Lists**: All entity types (projects, people, terms, companies) with counts
5. **Recent Transcripts**: 10 most recent transcripts in the output directory

This makes resources discoverable without requiring the client to know specific URIs.

### 3. Type System Updates

#### New Resource Types
- `audio-inbound`: Inbound audio files
- `audio-processed`: Processed audio files

#### New URI Types
- `AudioInboundUri`: Parsed inbound audio URI
- `AudioProcessedUri`: Parsed processed audio URI

### 4. URI Parser Enhancements

Added support for parsing audio URIs:
- `protokoll://audio/inbound`
- `protokoll://audio/inbound?directory=/path`
- `protokoll://audio/processed`
- `protokoll://audio/processed?directory=/path`

### 5. URI Builder Functions

New builder functions:
- `buildAudioInboundUri(directory?: string)`
- `buildAudioProcessedUri(directory?: string)`

### 6. Resource Reader Functions

New reader functions:
- `readAudioInboundResource(directory?: string)`
- `readAudioProcessedResource(directory?: string)`
- `listAudioFiles(directory: string)` (helper)
- `formatBytes(bytes: number)` (utility)

## File Changes

### Modified Files

1. **src/mcp/resources.ts**
   - Added audio resource templates
   - Enhanced `getDynamicResources()` to include audio and entity list resources
   - Added `listAudioFiles()` helper function
   - Added `readAudioInboundResource()` and `readAudioProcessedResource()`
   - Added `formatBytes()` utility function
   - Updated `handleReadResource()` to handle audio resources

2. **src/mcp/types.ts**
   - Added `audio-inbound` and `audio-processed` to `ResourceType`
   - Added `AudioInboundUri` interface
   - Added `AudioProcessedUri` interface

3. **src/mcp/uri.ts**
   - Added imports for new URI types
   - Added `parseAudioUri()` function
   - Updated `parseUri()` to handle audio URIs
   - Added `buildAudioInboundUri()` function
   - Added `buildAudioProcessedUri()` function
   - Updated `getResourceType()` to recognize audio URIs

4. **tests/mcp/uri.test.ts**
   - Added tests for parsing audio URIs (5 tests)
   - Added tests for building audio URIs (4 tests)
   - Added tests for `getResourceType()` with audio URIs (2 tests)
   - Total: 39 tests (all passing)

### New Files

1. **docs/MCP_RESOURCES.md**
   - Comprehensive documentation of all resource types
   - Usage examples
   - Response format specifications
   - Resource discovery workflow

2. **docs/MCP_RESOURCES_IMPLEMENTATION.md** (this file)
   - Implementation summary
   - Technical details
   - Design decisions

## Design Decisions

### 1. Audio File Discovery

Audio files are discovered by:
1. Reading the directory specified in the URI parameter
2. Falling back to the config's `inputDirectory` or `processedDirectory`
3. Filtering files by extension using `DEFAULT_AUDIO_EXTENSIONS`
4. Sorting by modification time (newest first)

### 2. Dynamic Resource Generation

Dynamic resources are generated when `resources/list` is called:
- Provides immediate visibility into available data
- Includes entity counts to help clients decide whether to query
- Uses the current context to determine what's available
- Returns empty list if no context is found (graceful degradation)

### 3. Error Handling

- Returns empty array if directory doesn't exist (ENOENT)
- Throws error if context is not available
- Validates URI format and throws descriptive errors
- Handles missing optional parameters gracefully

### 4. File Size Formatting

Human-readable file sizes are provided alongside raw bytes:
- Makes it easier for AI assistants to communicate with users
- Uses standard units (B, KB, MB, GB)
- Rounds to 2 decimal places

### 5. URI Structure

Audio URIs follow the pattern:
- `protokoll://audio/{type}?directory={path}`
- Type is either `inbound` or `processed`
- Directory parameter is optional (falls back to config)

This structure:
- Groups related resources under `/audio`
- Clearly distinguishes between inbound and processed
- Allows directory override without requiring config changes

## Testing

### Test Coverage

- 39 URI tests (all passing)
- 100% coverage of URI parsing and building functions
- Tests for:
  - Parsing audio URIs with and without directory
  - Building audio URIs with and without directory
  - Resource type detection for audio URIs
  - Invalid audio type handling

### Manual Testing Checklist

- [ ] List resources returns audio resources when context is available
- [ ] Read inbound audio resource returns correct file list
- [ ] Read processed audio resource returns correct file list
- [ ] Audio files are sorted by modification time
- [ ] File sizes are formatted correctly
- [ ] Directory parameter override works
- [ ] Fallback to config directories works
- [ ] Empty directory returns empty file list
- [ ] Non-existent directory returns empty file list
- [ ] Invalid audio type throws error

## Integration Points

### 1. Context System

Resources integrate with the context system to:
- Discover input and output directories
- Load entity data for entity list resources
- Determine if context is available

### 2. Configuration

Resources use configuration to:
- Get default input directory (`inputDirectory`)
- Get processed directory (`processedDirectory`)
- Get output directory for transcripts (`outputDirectory`)

### 3. Audio Tools

Audio resources complement the audio tools:
- Tools process audio files
- Resources discover and list audio files
- Together they provide complete audio workflow visibility

## Future Enhancements

### Potential Additions

1. **Audio File Metadata Resource**
   - `protokoll://audio/file/{path}`
   - Detailed metadata for a specific audio file
   - Duration, format, bitrate, etc.

2. **Transcript Search Resource**
   - `protokoll://transcripts/search?query={text}`
   - Full-text search across transcripts
   - Returns matching transcripts with context

3. **Entity Search Resource**
   - `protokoll://entities/search?query={text}`
   - Search across all entity types
   - Returns matching entities with relevance scores

4. **Recent Activity Resource**
   - `protokoll://activity/recent?limit={n}`
   - Recent transcriptions, entity changes, etc.
   - Provides activity timeline

5. **Statistics Resource**
   - `protokoll://stats`
   - Aggregate statistics (total transcripts, audio files, entities)
   - Processing history and trends

### Subscription Support

Currently, resources have `subscribe: false` in the server capabilities. Future versions could support:
- Notifications when new audio files appear
- Notifications when transcripts are created
- Notifications when entities are modified

This would enable real-time monitoring and reactive workflows.

## Performance Considerations

### Current Implementation

- File listing uses `readdir()` with `withFileTypes: true` for efficiency
- Stat calls are made only for matching audio files
- Sorting is done in-memory (acceptable for typical directory sizes)
- No caching (resources are read fresh each time)

### Scalability

For large directories (1000+ files):
- Consider adding pagination to audio resources
- Consider adding file count limits
- Consider caching with TTL
- Consider background indexing for search

## Conclusion

This implementation provides comprehensive resource discovery for Protokoll's MCP server. AI assistants can now:

1. **Discover available data** through dynamic resources
2. **Query audio files** waiting to be processed or already processed
3. **Browse transcripts** with filtering and pagination
4. **Explore context entities** to understand available knowledge
5. **Access configuration** to understand the current setup

The implementation follows MCP best practices:
- Resources are read-only (modifications use tools)
- URIs are structured and predictable
- Response formats are consistent and well-documented
- Error handling is graceful and informative
- Type system is comprehensive and type-safe

This foundation enables powerful workflows where AI assistants can autonomously discover, query, and process audio files and transcripts.
