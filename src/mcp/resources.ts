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
import { parseUri, buildTranscriptUri, buildEntityUri, buildConfigUri, buildTranscriptsListUri, buildEntitiesListUri } from './uri';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as Context from '@/context';
import * as yaml from 'js-yaml';
import { listTranscripts } from '@/cli/transcript';

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
export async function handleListResources(contextDirectory?: string): Promise<{
    resources: McpResource[];
    resourceTemplates?: McpResourceTemplate[];
}> {
    // Get dynamic resources from context if available
    const dynamicResources = await getDynamicResources(contextDirectory);
    
    return {
        resources: [...directResources, ...dynamicResources],
        resourceTemplates,
    };
}

async function getDynamicResources(contextDirectory?: string): Promise<McpResource[]> {
    const resources: McpResource[] = [];
    
    try {
        const context = await Context.create({
            startingDir: contextDirectory || process.cwd(),
        });

        if (!context.hasContext()) {
            return resources;
        }

        // Add config resource
        const dirs = context.getDiscoveredDirs();
        const configPath = dirs[0]?.path;
        if (configPath) {
            resources.push({
                uri: buildConfigUri(configPath),
                name: 'Current Configuration',
                description: `Protokoll configuration at ${configPath}`,
                mimeType: 'application/json',
            });
        }

        // Could add more dynamic resources here
        // (e.g., recently accessed transcripts, favorite entities)

    } catch {
        // Context not available, return empty
    }

    return resources;
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

export async function readConfigResource(
    configPath?: string
): Promise<McpResourceContents> {
    const startDir = configPath || process.cwd();
    
    const context = await Context.create({
        startingDir: startDir,
    });

    if (!context.hasContext()) {
        throw new Error(`No Protokoll context found at or above: ${startDir}`);
    }

    const dirs = context.getDiscoveredDirs();
    const config = context.getConfig();

    const configData = {
        hasContext: true,
        discoveredDirectories: dirs.map(d => ({
            path: d.path,
            level: d.level,
            isPrimary: d.level === 0,
        })),
        entityCounts: {
            projects: context.getAllProjects().length,
            people: context.getAllPeople().length,
            terms: context.getAllTerms().length,
            companies: context.getAllCompanies().length,
            ignored: context.getAllIgnored().length,
        },
        config: {
            outputDirectory: config.outputDirectory,
            outputStructure: config.outputStructure,
            model: config.model,
            smartAssistance: context.getSmartAssistanceConfig(),
        },
        // Include URIs for easy navigation
        resourceUris: {
            projects: buildEntitiesListUri('project'),
            people: buildEntitiesListUri('person'),
            terms: buildEntitiesListUri('term'),
            companies: buildEntitiesListUri('company'),
        },
    };

    return {
        uri: buildConfigUri(configPath),
        mimeType: 'application/json',
        text: JSON.stringify(configData, null, 2),
    };
}

export async function readTranscriptsListResource(options: {
    directory: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}): Promise<McpResourceContents> {
    const { directory, startDate, endDate, limit = 50, offset = 0 } = options;

    if (!directory) {
        throw new Error('Directory is required for transcripts list');
    }

    const result = await listTranscripts({
        directory,
        limit,
        offset,
        sortBy: 'date',
        startDate,
        endDate,
    });

    // Convert to resource format with URIs
    const transcriptsWithUris = result.transcripts.map(t => ({
        uri: buildTranscriptUri(t.path),
        path: t.path,
        filename: t.filename,
        date: t.date,
        time: t.time,
        title: t.title,
    }));

    const responseData = {
        directory,
        transcripts: transcriptsWithUris,
        pagination: {
            total: result.total,
            limit: result.limit,
            offset: result.offset,
            hasMore: result.hasMore,
        },
        filters: {
            startDate,
            endDate,
        },
    };

    return {
        uri: buildTranscriptsListUri(options),
        mimeType: 'application/json',
        text: JSON.stringify(responseData, null, 2),
    };
}

export async function readEntitiesListResource(
    entityType: string,
    contextDirectory?: string
): Promise<McpResourceContents> {
    const context = await Context.create({
        startingDir: contextDirectory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No Protokoll context found');
    }

    let entities: Array<{ id: string; name: string; [key: string]: unknown }>;
    
    switch (entityType) {
        case 'person':
            entities = context.getAllPeople().map(p => ({
                uri: buildEntityUri('person', p.id),
                id: p.id,
                name: p.name,
                company: p.company,
                role: p.role,
            }));
            break;
        case 'project':
            entities = context.getAllProjects().map(p => ({
                uri: buildEntityUri('project', p.id),
                id: p.id,
                name: p.name,
                active: p.active !== false,
                destination: p.routing?.destination,
            }));
            break;
        case 'term':
            entities = context.getAllTerms().map(t => ({
                uri: buildEntityUri('term', t.id),
                id: t.id,
                name: t.name,
                expansion: t.expansion,
                domain: t.domain,
            }));
            break;
        case 'company':
            entities = context.getAllCompanies().map(c => ({
                uri: buildEntityUri('company', c.id),
                id: c.id,
                name: c.name,
                fullName: c.fullName,
                industry: c.industry,
            }));
            break;
        case 'ignored':
            entities = context.getAllIgnored().map(i => ({
                uri: buildEntityUri('ignored', i.id),
                id: i.id,
                name: i.name,
                reason: i.reason,
            }));
            break;
        default:
            throw new Error(`Unknown entity type: ${entityType}`);
    }

    const responseData = {
        entityType,
        count: entities.length,
        entities,
    };

    return {
        uri: buildEntitiesListUri(entityType as any),
        mimeType: 'application/json',
        text: JSON.stringify(responseData, null, 2),
    };
}
