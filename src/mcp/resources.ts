/**
 * MCP Resources Module
 * 
 * Implements the Resources capability for the Protokoll MCP server.
 * Resources provide read-only access to transcripts, entities, and configuration.
 */

import type {
    McpResource,
    McpResourceTemplate,
    McpResourceContents,
} from './types';

// ============================================================================
// Resource Definitions
// ============================================================================

/**
 * Direct resources that can be listed
 */
export const directResources: McpResource[] = [
    // Will be populated dynamically based on context
];

/**
 * Resource templates for parameterized access
 */
export const resourceTemplates: McpResourceTemplate[] = [
    {
        uriTemplate: 'protokoll://transcript/{path}',
        name: 'Transcript',
        description: 'A processed transcript file',
        mimeType: 'text/markdown',
    },
    {
        uriTemplate: 'protokoll://entity/{type}/{id}',
        name: 'Context Entity',
        description: 'A context entity (person, project, term, company)',
        mimeType: 'application/yaml',
    },
    {
        uriTemplate: 'protokoll://config',
        name: 'Configuration',
        description: 'Protokoll configuration for a directory',
        mimeType: 'application/json',
    },
    {
        uriTemplate: 'protokoll://transcripts?directory={directory}',
        name: 'Transcripts List',
        description: 'List of transcripts in a directory',
        mimeType: 'application/json',
    },
    {
        uriTemplate: 'protokoll://entities/{type}',
        name: 'Entities List',
        description: 'List of entities of a given type',
        mimeType: 'application/json',
    },
];

// ============================================================================
// Handler Functions
// ============================================================================

/**
 * Handle resources/list request
 */
export async function handleListResources(): Promise<{
    resources: McpResource[];
    resourceTemplates?: McpResourceTemplate[];
}> {
    // TODO: Implement dynamic resource listing
    return {
        resources: directResources,
        resourceTemplates,
    };
}

/**
 * Handle resources/read request
 */
export async function handleReadResource(uri: string): Promise<McpResourceContents> {
    // TODO: Implement resource reading
    throw new Error(`Resource reading not yet implemented: ${uri}`);
}

// ============================================================================
// Resource Readers (to be implemented)
// ============================================================================

export async function readTranscriptResource(transcriptPath: string): Promise<McpResourceContents> {
    // TODO: Implement
    throw new Error('Not implemented');
}

export async function readEntityResource(
    entityType: string,
    entityId: string
): Promise<McpResourceContents> {
    // TODO: Implement
    throw new Error('Not implemented');
}

export async function readConfigResource(configPath?: string): Promise<McpResourceContents> {
    // TODO: Implement
    throw new Error('Not implemented');
}

export async function readTranscriptsListResource(options: {
    directory: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}): Promise<McpResourceContents> {
    // TODO: Implement
    throw new Error('Not implemented');
}

export async function readEntitiesListResource(
    entityType: string
): Promise<McpResourceContents> {
    // TODO: Implement
    throw new Error('Not implemented');
}
