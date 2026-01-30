# Workspace-Level Configuration

## Overview

Protokoll's MCP server now uses **workspace-level configuration** instead of having each tool navigate up the directory tree to find configuration. This provides:

1. **Better Performance** - Configuration is loaded once at startup
2. **Consistency** - All tools use the same configuration
3. **Simplicity** - No need to pass `contextDirectory` to every tool
4. **Predictability** - Configuration comes from the workspace root

## How It Works

### 1. Server Initialization

When the MCP server starts:

1. It receives workspace roots from the client (via MCP roots capability)
2. It uses the first workspace root to find `.protokoll` configuration
3. It loads the configuration once and caches it
4. All tools use this cached configuration

### 2. Configuration Discovery

The server looks for `.protokoll/config.yaml` in the workspace root:

```
/Users/me/workspace/
  └── .protokoll/
      └── config.yaml
```

### 3. Directory Resolution

Configuration values are resolved relative to the workspace root:

```yaml
# .protokoll/config.yaml
inputDirectory: ./recordings      # → /Users/me/workspace/recordings
outputDirectory: ~/notes          # → /Users/me/notes (absolute)
processedDirectory: ./processed   # → /Users/me/workspace/processed
```

## Configuration Structure

### Workspace Root

The workspace root is determined by:

1. **MCP Roots** (preferred): First root provided by the client
2. **Environment Variable**: `WORKSPACE_ROOT` if set
3. **Fallback**: Current working directory

### Directory Configuration

Three directories are configured at the workspace level:

| Directory | Purpose | Default |
|-----------|---------|---------|
| `inputDirectory` | Where audio files are stored | `./recordings` |
| `outputDirectory` | Where transcripts are saved | `./notes` |
| `processedDirectory` | Where processed audio is moved | `./processed` |

### Context Instance

The server also loads and caches a context instance, providing access to:
- Projects
- People
- Terms
- Companies
- Smart assistance configuration

## Tool Simplification

### Before (Per-Tool Navigation)

Each tool had to:
1. Accept a `contextDirectory` parameter
2. Navigate up the directory tree to find `.protokoll`
3. Load configuration independently
4. Resolve directories relative to the found configuration

**Example**:
```typescript
await client.callTool('protokoll_process_audio', {
  audioFile: 'recording.m4a',
  contextDirectory: '/Users/me/workspace/.protokoll'  // ❌ Required
});
```

### After (Workspace-Level)

Tools now:
1. Use the pre-loaded workspace configuration
2. No need to navigate or search
3. Consistent configuration across all tools
4. Faster execution (no repeated discovery)

**Example**:
```typescript
await client.callTool('protokoll_process_audio', {
  audioFile: 'recording.m4a'  // ✅ Just the filename
});
```

## Removed Parameters

The following parameters have been removed from tools (no longer needed):

### Audio Tools
- `protokoll_process_audio`: Removed `contextDirectory`
- `protokoll_batch_process`: Removed `contextDirectory`

### Transcript Tools
- All transcript tools: `contextDirectory` is now optional and rarely needed

## Server Configuration API

The server exposes a configuration API for internal use:

```typescript
import * as ServerConfig from './serverConfig';

// Get the full configuration
const config = ServerConfig.getServerConfig();
console.log(config.workspaceRoot);
console.log(config.inputDirectory);
console.log(config.outputDirectory);

// Get specific directories
const inputDir = ServerConfig.getInputDirectory();
const outputDir = ServerConfig.getOutputDirectory();
const processedDir = ServerConfig.getProcessedDirectory(); // may be null

// Get the context instance
const context = ServerConfig.getContext();
if (context) {
  const projects = context.getAllProjects();
  const people = context.getAllPeople();
}

// Check if initialized
if (ServerConfig.isInitialized()) {
  // Configuration is ready
}
```

## Configuration Lifecycle

### Initialization

```typescript
// Server startup
const roots = await client.listRoots();
await ServerConfig.initializeServerConfig(roots);
```

### Reload

```typescript
// When workspace changes
const roots = await client.listRoots();
await ServerConfig.reloadServerConfig(roots);
```

### Clear

```typescript
// When shutting down
ServerConfig.clearServerConfig();
```

## Error Handling

### No Context Available

If no `.protokoll` directory is found in the workspace:

```
Protokoll context not available. Ensure .protokoll directory exists in workspace.
```

**Solution**: Create a `.protokoll` directory in your workspace root with a `config.yaml` file.

### Configuration Not Initialized

If tools are called before server initialization:

```
Server configuration not initialized. Call initializeServerConfig() first.
```

**Solution**: This is a server-side error. The server should initialize configuration on startup.

## Fallback Behavior

If configuration cannot be loaded, the server uses defaults:

| Setting | Default |
|---------|---------|
| `workspaceRoot` | Current working directory |
| `inputDirectory` | `./recordings` (relative to workspace) |
| `outputDirectory` | `./notes` (relative to workspace) |
| `processedDirectory` | `./processed` (relative to workspace) |

## Benefits

### 1. Performance

- Configuration loaded once, not on every tool call
- No repeated directory tree navigation
- Faster tool execution

### 2. Consistency

- All tools use the same configuration
- No risk of tools finding different `.protokoll` directories
- Predictable behavior

### 3. Simplicity

- Fewer parameters to pass
- Cleaner tool signatures
- Easier to use

### 4. Workspace Awareness

- Respects workspace boundaries
- Uses workspace-relative paths
- Integrates with IDE/editor workspace concept

## Migration from Per-Tool Configuration

### Code Changes

**Before**:
```typescript
// Every tool needed contextDirectory
await client.callTool('protokoll_process_audio', {
  audioFile: '/path/to/audio.m4a',
  contextDirectory: '/path/to/.protokoll'
});

await client.callTool('protokoll_read_transcript', {
  transcriptPath: '/path/to/transcript.md',
  contextDirectory: '/path/to/.protokoll'
});
```

**After**:
```typescript
// No contextDirectory needed - uses workspace config
await client.callTool('protokoll_process_audio', {
  audioFile: 'audio.m4a'
});

await client.callTool('protokoll_read_transcript', {
  transcriptPath: 'transcript.md'
});
```

### Configuration Changes

No changes needed to your `.protokoll/config.yaml` files. The server automatically discovers and uses them from the workspace root.

## Implementation Details

### Server Configuration Module

New module: `src/mcp/serverConfig.ts`

**Key Functions**:
- `initializeServerConfig(roots)` - Initialize from workspace roots
- `reloadServerConfig(roots)` - Reload when workspace changes
- `getServerConfig()` - Get full configuration
- `getInputDirectory()` - Get input directory
- `getOutputDirectory()` - Get output directory
- `getProcessedDirectory()` - Get processed directory
- `getContext()` - Get context instance
- `getWorkspaceRoot()` - Get workspace root

### Integration Points

1. **Server Startup** (`src/mcp/server.ts`):
   - Initializes configuration from workspace roots
   - Handles WORKSPACE_ROOT environment variable

2. **Tool Handlers** (`src/mcp/tools/*.ts`):
   - Import and use `ServerConfig` module
   - No longer navigate directory tree
   - Use cached configuration

3. **Shared Utilities** (`src/mcp/tools/shared.ts`):
   - `getConfiguredDirectory()` now uses `ServerConfig`
   - Simplified implementation
   - No context parameter needed

## Testing

### Manual Testing

1. Start MCP server in a workspace with `.protokoll/config.yaml`
2. Verify configuration is loaded correctly
3. Call tools without `contextDirectory` parameter
4. Verify tools use workspace configuration

### Unit Testing

Tests should mock the `ServerConfig` module to provide test configuration:

```typescript
import * as ServerConfig from '@/mcp/serverConfig';

// Mock configuration for tests
vi.mock('@/mcp/serverConfig', () => ({
  getInputDirectory: () => '/test/recordings',
  getOutputDirectory: () => '/test/notes',
  getProcessedDirectory: () => '/test/processed',
  getContext: () => mockContext,
}));
```

## Future Enhancements

### Configuration Hot Reload

When workspace roots change, the server could automatically reload configuration:

```typescript
server.onNotification('notifications/roots/list_changed', async () => {
  const roots = await client.listRoots();
  await ServerConfig.reloadServerConfig(roots);
});
```

### Multi-Workspace Support

For workspaces with multiple projects, the server could:
- Detect which project a file belongs to
- Use project-specific configuration
- Switch configuration based on file location

### Configuration Validation

On initialization, validate that:
- Configured directories exist
- Directories are writable
- Audio extensions are valid
- Required dependencies are available

## See Also

- [Smart File Lookup](./MCP_SMART_TRANSCRIPT_LOOKUP.md)
- [MCP Resources](./MCP_RESOURCES.md)
- [MCP Tools](./MCP_TOOLS.md)
