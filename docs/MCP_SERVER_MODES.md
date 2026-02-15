# MCP Server Modes: Local vs Remote

Protokoll's MCP server can operate in two distinct modes that affect how directory parameters are handled.

## Server Modes

### Remote Mode

**When:** HTTP server (`protokoll-mcp-http`) with pre-configured workspace

**Characteristics:**
- Server is initialized with a workspace root and `protokoll-config.yaml`
- All directory paths (`inputDirectory`, `outputDirectory`, `contextDirectories`) are pre-configured
- Tools **DO NOT** accept `contextDirectory` parameters
- Attempting to provide directory parameters will result in an error

**Use Case:** Production deployments where the server manages a specific workspace

**Example:**
```bash
# Server starts with workspace at /path/to/workspace
PORT=4000 protokoll-mcp-http

# Tools use pre-configured directories automatically
# No contextDirectory parameter needed or accepted
```

### Local Mode

**When:** stdio server (`protokoll-mcp`) or dynamic discovery

**Characteristics:**
- Server performs dynamic configuration discovery
- Tools **MAY** accept optional `contextDirectory` parameters
- If no directory is provided, falls back to current working directory or discovery

**Use Case:** Development, CLI usage, or environments without fixed workspace

**Example:**
```bash
# Server runs without pre-configured workspace
protokoll-mcp

# Tools can optionally specify contextDirectory
# Falls back to discovery if not provided
```

## Checking Server Mode

Use the `protokoll_info` tool to determine the server's mode:

```json
{
  "mode": "remote",
  "modeDescription": "Server is running in remote mode with pre-configured workspace directories",
  "acceptsDirectoryParameters": false,
  "workspaceRoot": "/path/to/workspace",
  "inputDirectory": "/path/to/workspace/recordings",
  "outputDirectory": "/path/to/workspace/notes",
  "contextDirectories": ["/path/to/workspace/context"]
}
```

## Tool Behavior

### In Remote Mode

All tools that would normally accept `contextDirectory` will:
1. Use the pre-configured workspace directories
2. Reject any `contextDirectory` parameter with an error message
3. Direct users to check `protokoll_info` for configuration

**Error Example:**
```
Error: contextDirectory parameter is not accepted in remote mode. 
This server is pre-configured with workspace directories from protokoll-config.yaml. 
Use the protokoll_info tool to check server configuration.
```

### In Local Mode

Tools accept optional `contextDirectory` parameters:
- If provided: Use the specified directory
- If not provided: Fall back to discovery or current working directory

## Implementation Details

### Server Initialization

**HTTP Server (Remote Mode):**
```typescript
await ServerConfig.initializeServerConfig(initialRoots, 'remote');
```

**stdio Server (Local Mode):**
```typescript
await ServerConfig.initializeServerConfig(initialRoots, 'local');
// or defaults to 'local' if not specified
```

### Tool Validation

Tools validate the mode before processing:

```typescript
// In remote mode, this throws an error if contextDirectory is provided
await validateNotRemoteMode(args.contextDirectory);
```

### Context Instance Resolution

The `getContextInstance` helper prioritizes server context:

```typescript
async function getContextInstance(contextDirectory?: string): Promise<ContextInstance> {
    // Validate remote mode
    if (contextDirectory && ServerConfig.isRemoteMode()) {
        throw new Error('contextDirectory not accepted in remote mode');
    }
    
    // Use server context if available
    const serverContext = ServerConfig.getContext();
    if (serverContext) {
        return serverContext;
    }
    
    // Fallback to new context (local mode)
    return Context.create({
        startingDir: contextDirectory || process.cwd(),
    });
}
```

## Best Practices

1. **Always check `protokoll_info` first** when connecting to a new server
2. **In remote mode:** Don't provide directory parameters
3. **In local mode:** Provide directory parameters only when needed
4. **Error handling:** Catch and display mode-related errors to users clearly

## Migration Notes

Existing tools continue to work:
- Remote mode servers ignore the `contextDirectory` parameter (with error)
- Local mode servers accept it as optional (backwards compatible)
- The `protokoll_info` tool provides clear guidance to clients
