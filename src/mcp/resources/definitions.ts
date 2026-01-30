/**
 * Resource Definitions
 * 
 * Defines all resource templates and direct resources for the MCP server.
 */

import type { McpResource, McpResourceTemplate } from '../types';

/**
 * Direct resources that can be listed
 * These are populated dynamically based on context
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
    {
        uriTemplate: 'protokoll://audio/inbound?directory={directory}',
        name: 'Inbound Audio Files',
        description: 'List of audio files waiting to be processed',
        mimeType: 'application/json',
    },
    {
        uriTemplate: 'protokoll://audio/processed?directory={directory}',
        name: 'Processed Audio Files',
        description: 'List of audio files that have been processed',
        mimeType: 'application/json',
    },
];
