# MCP Session Recovery Pattern

This document captures the session-recovery strategy used between `protokoll` (MCP server) and `protokoll-vscode` (HTTP client).

## Goals

- Keep MCP interactions resilient when session state drifts.
- Avoid hard failures on stale or missing session ids.
- Let clients recover transparently without user intervention.

## Three-step approach

1. **Always return effective session id**
   - Server sets `Mcp-Session-Id` on successful `POST /mcp` responses.
   - Client treats response header as authoritative and rotates local session id when it changes.

2. **Server auto-recovers stale/missing sessions**
   - For non-`initialize` requests, if the incoming session id is unknown, server creates a replacement session instead of returning `Session not found`.
   - If no session id is provided, server also creates a session and continues.

3. **Client retries once on session-loss errors**
   - Client detects session-loss responses (`Session not found`, `Missing Mcp-Session-Id header`, `-32000`).
   - Client re-initializes once, re-establishes SSE, re-subscribes known resources, then retries the original request once.
   - Generic `HTTP 404` only triggers recovery if client already had a session id, to avoid retrying unrelated routes.

## Why this split

- Server-side tolerance handles the common stale-session edge quickly.
- Client-side recovery covers race conditions and transport-level failures.
- One retry prevents loops while still making failures far less disruptive.
