# MCP Resources Refactoring

## Overview

The MCP resources module has been refactored from a single large file (`resources.ts`, 644 lines) into a modular structure matching the patterns used by `tools/` and `prompts/`.

## New Structure

```
src/mcp/resources/
├── index.ts                    # Main exports and handlers
├── definitions.ts              # Resource templates and direct resources
├── discovery.ts                # Dynamic resource discovery
├── transcriptResources.ts      # Transcript reading and listing
├── entityResources.ts          # Entity reading and listing
├── audioResources.ts           # Audio file listing (inbound/processed)
└── configResource.ts           # Configuration reading
```

## Module Breakdown

### `index.ts` (Main Entry Point)
- Re-exports all resource modules
- Provides main handler functions:
  - `handleListResources()` - Lists available resources
  - `handleReadResource()` - Reads a specific resource by URI
- Routes resource reads to appropriate module based on resource type

### `definitions.ts` (Resource Definitions)
- Defines `directResources` array (static resources)
- Defines `resourceTemplates` array (URI templates)
- Contains all 7 resource template definitions:
  - Transcript
  - Entity
  - Configuration
  - Transcripts List
  - Entities List
  - Inbound Audio Files
  - Processed Audio Files

### `discovery.ts` (Dynamic Discovery)
- `getDynamicResources()` - Discovers available resources from context
- Generates dynamic resource list based on:
  - Current configuration
  - Available entities (projects, people, terms, companies)
  - Configured directories (input, output, processed)
  - Recent transcripts

### `transcriptResources.ts` (Transcript Resources)
- `readTranscriptResource()` - Reads a single transcript file
- `readTranscriptsListResource()` - Lists transcripts with filtering
- Handles both absolute and relative paths
- Supports pagination and date filtering

### `entityResources.ts` (Entity Resources)
- `readEntityResource()` - Reads a single entity (person, project, term, company)
- `readEntitiesListResource()` - Lists all entities of a given type
- Returns entities in YAML format for readability
- Includes entity metadata and URIs

### `audioResources.ts` (Audio Resources)
- `readAudioInboundResource()` - Lists inbound audio files
- `readAudioProcessedResource()` - Lists processed audio files
- `listAudioFiles()` - Helper to scan directories for audio files
- `formatBytes()` - Utility for human-readable file sizes
- Includes file metadata: size, modified date, extension

### `configResource.ts` (Configuration Resource)
- `readConfigResource()` - Reads Protokoll configuration
- Returns comprehensive config information:
  - Discovered directories
  - Entity counts
  - Configuration settings
  - Smart assistance config
  - Resource URIs for navigation

## Benefits

### 1. Modularity
- Each resource type has its own focused module
- Easier to understand and maintain
- Clear separation of concerns

### 2. Consistency
- Matches the structure of `tools/` and `prompts/`
- Follows established project patterns
- Predictable organization

### 3. Maintainability
- Smaller files are easier to navigate
- Changes to one resource type don't affect others
- Clearer git history and diffs

### 4. Testability
- Individual modules can be tested in isolation
- Easier to mock dependencies
- More focused unit tests

### 5. Discoverability
- Clear file names indicate purpose
- Easy to find specific resource implementations
- Better IDE navigation

## Migration

### Before
```typescript
import * as Resources from './resources';

// All functions in one file
Resources.handleListResources();
Resources.readTranscriptResource();
Resources.readEntityResource();
// etc.
```

### After
```typescript
import * as Resources from './resources';

// Same API, modular implementation
Resources.handleListResources();
Resources.readTranscriptResource();
Resources.readEntityResource();
// etc.
```

**No breaking changes** - The public API remains identical. All imports continue to work as before.

## File Size Comparison

| File | Lines | Purpose |
|------|-------|---------|
| **Before** | | |
| `resources.ts` | 644 | Everything |
| **After** | | |
| `index.ts` | 89 | Main handlers and exports |
| `definitions.ts` | 58 | Resource templates |
| `discovery.ts` | 127 | Dynamic discovery |
| `transcriptResources.ts` | 87 | Transcript resources |
| `entityResources.ts` | 139 | Entity resources |
| `audioResources.ts` | 160 | Audio resources |
| `configResource.ts` | 63 | Configuration resource |
| **Total** | 723 | (includes module overhead) |

## Testing

All existing tests pass without modification:
- ✅ 83 test files
- ✅ 2252 tests passed
- ✅ 20 tests skipped
- ✅ No breaking changes

## Related Patterns

This refactoring follows the same pattern as:

### Tools Module
```
src/mcp/tools/
├── index.ts
├── audioTools.ts
├── transcriptTools.ts
├── entityTools.ts
├── contextTools.ts
├── discoveryTools.ts
├── assistTools.ts
├── systemTools.ts
└── shared.ts
```

### Prompts Module
```
src/mcp/prompts/
├── index.ts
├── transcribe_with_context.md
├── setup_project.md
├── review_transcript.md
├── enrich_entity.md
├── batch_transcription.md
├── find_and_analyze.md
└── edit_entity.md
```

## Future Enhancements

With this modular structure, future improvements are easier:

1. **Add New Resource Types** - Just create a new module
2. **Resource-Specific Tests** - Test each module independently
3. **Resource Caching** - Add caching per resource type
4. **Resource Validation** - Validate resources before returning
5. **Resource Streaming** - Stream large resources instead of loading all at once

## See Also

- [MCP Resources Documentation](./MCP_RESOURCES.md)
- [MCP Resources Quick Start](./MCP_RESOURCES_QUICK_START.md)
- [MCP Resources Implementation](./MCP_RESOURCES_IMPLEMENTATION.md)
- [MCP Overview](./MCP_OVERVIEW.md)
