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
    TranscriptUri,
    EntityUri,
    ConfigUri,
    TranscriptsListUri,
    EntitiesListUri,
} from './types';
import { parseUri, buildTranscriptUri, buildEntityUri } from './uri';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as Context from '@/context';
import * as yaml from 'js-yaml';

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
    const parsed = parseUri(uri);

    switch (parsed.resourceType) {
        case 'transcript':
            return readTranscriptResource((parsed as TranscriptUri).transcriptPath);
        case 'entity': {
            const entityUri = parsed as EntityUri;
            return readEntityResource(entityUri.entityType, entityUri.entityId);
        }
        case 'config':
            return readConfigResource((parsed as ConfigUri).configPath);
        case 'transcripts-list': {
            const listUri = parsed as TranscriptsListUri;
            return readTranscriptsListResource({
                directory: listUri.directory,
                startDate: listUri.startDate,
                endDate: listUri.endDate,
                limit: listUri.limit,
                offset: listUri.offset,
            });
        }
        case 'entities-list':
            return readEntitiesListResource((parsed as EntitiesListUri).entityType);
        default:
            throw new Error(`Unknown resource type: ${parsed.resourceType}`);
    }
}

// ============================================================================
// Resource Readers (to be implemented)
// ============================================================================

export async function readTranscriptResource(transcriptPath: string): Promise<McpResourceContents> {
    // Handle both absolute and relative paths
    const fullPath = transcriptPath.startsWith('/')
        ? transcriptPath
        : resolve(process.cwd(), transcriptPath);

    try {
        const content = await readFile(fullPath, 'utf-8');
        
        return {
            uri: buildTranscriptUri(transcriptPath),
            mimeType: 'text/markdown',
            text: content,
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Transcript not found: ${fullPath}`);
        }
        throw error;
    }
}

export async function readEntityResource(
    entityType: string,
    entityId: string,
    contextDirectory?: string
): Promise<McpResourceContents> {
    const context = await Context.create({
        startingDir: contextDirectory || process.cwd(),
    });

    let entity;
    switch (entityType) {
        case 'person':
            entity = context.getPerson(entityId);
            break;
        case 'project':
            entity = context.getProject(entityId);
            break;
        case 'term':
            entity = context.getTerm(entityId);
            break;
        case 'company':
            entity = context.getCompany(entityId);
            break;
        case 'ignored':
            entity = context.getIgnored(entityId);
            break;
        default:
            throw new Error(`Unknown entity type: ${entityType}`);
    }

    if (!entity) {
        throw new Error(`${entityType} "${entityId}" not found`);
    }

    // Convert to YAML for readability
    const yamlContent = yaml.dump(entity);

    return {
        uri: buildEntityUri(entityType as any, entityId),
        mimeType: 'application/yaml',
        text: yamlContent,
    };
}

export async function readConfigResource(_configPath?: string): Promise<McpResourceContents> {
    // TODO: Implement
    throw new Error('Not implemented');
}

export async function readTranscriptsListResource(_options: {
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
    _entityType: string
): Promise<McpResourceContents> {
    // TODO: Implement
    throw new Error('Not implemented');
}
