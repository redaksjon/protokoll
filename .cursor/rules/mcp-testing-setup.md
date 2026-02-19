---
description: MCP server setup for testing the VS Code extension
globs: src/mcp/**/*.ts
alwaysApply: false
---

# MCP Testing Setup

When testing the Protokoll VS Code extension or MCP integration:

**Start the MCP server from the activity directory** (where notes/transcripts live). The server reads config from its working directory.

```bash
cd /Users/tobrien/gitw/tobrien/activity && PORT=3001 protokoll-mcp-http
```

Run in background so the user can start the extension. The extension connects to the MCP server on port 3001.
