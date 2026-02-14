/**
 * Protokoll Public API
 * 
 * This module exports the core programmatic API for the Protokoll library.
 * For CLI usage, use the `protokoll-cli` package instead.
 * For MCP integration, see the MCP server modules.
 */

// Export context and entity management
export * as Context from './context/index';
export * from './context/types';

// Export pipeline and transcription
// export { process } from './processor'; // Processor exports create() not process()

// Export utilities
export * from './util/metadata';

// Export routing
export * as Routing from './routing/index';

// Export constants
export * from './constants';

// Export transcript operations
export * as Transcript from './transcript';

