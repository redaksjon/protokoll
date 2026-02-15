/**
 * Protokoll Public API
 * 
 * This module exports the core programmatic API for the Protokoll library.
 * Most functionality is now in @redaksjon/protokoll-engine.
 * 
 * For CLI usage, use the `protokoll-cli` package instead.
 * For MCP integration, see the MCP server modules.
 */

// Re-export from @redaksjon/context
export * as Context from '@redaksjon/context';

// Re-export from @redaksjon/protokoll-engine
export { 
    Routing,
    Transcript,
    Pipeline,
    Phases,
    Agentic,
    Reasoning,
    Transcription,
    Feedback,
    Reflection
} from '@redaksjon/protokoll-engine';

// Export constants (already exported by engine, so skip to avoid duplicates)

