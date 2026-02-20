/**
 * Context Management Tools - View and search context entities
 */
// eslint-disable-next-line import/extensions
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ContextInstance } from '@/context';
import type { Entity, EntityType } from '@/context/types';
import { formatEntity, createToolContext } from './shared';
import { 
    findPersonResilient, 
    findCompanyResilient, 
    findTermResilient, 
    findProjectResilient,
    findIgnoredResilient 
} from '@redaksjon/protokoll-engine';

/**
 * Get the context instance from ServerConfig, or create a new one if not available
 */
async function getContextInstance(contextDirectory?: string): Promise<ContextInstance> {
    // Import here to avoid circular dependencies
    const ServerConfig = await import('../serverConfig');
    
    // Validate that contextDirectory is not provided in remote mode
    if (contextDirectory && ServerConfig.isRemoteMode()) {
        throw new Error(
            'contextDirectory parameter is not accepted in remote mode. ' +
            'This server is pre-configured with workspace directories from protokoll-config.yaml. ' +
            'Use the protokoll_info tool to check server configuration.'
        );
    }
    
    // If server has an initialized context, use it
    const serverContext = ServerConfig.getContext();
    if (serverContext) {
        return serverContext;
    }
    
    // Fallback: create context using server config's contextDirectories
    return createToolContext(contextDirectory);
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const contextStatusTool: Tool = {
    name: 'protokoll_context_status',
    description:
        'Get the status of the Protokoll context system. ' +
        'Shows discovered .protokoll directories, entity counts, and configuration status. ' +
        'Use this to understand what context is available for transcription enhancement.',
    inputSchema: {
        type: 'object',
        properties: {
            contextDirectory: {
                type: 'string',
                description: 'Path to start searching for .protokoll directories (default: cwd)',
            },
        },
        required: [],
    },
};

export const listProjectsTool: Tool = {
    name: 'protokoll_list_projects',
    description:
        'List all projects configured in the context. ' +
        'Projects define routing rules for where transcripts should be saved ' +
        'and what classification signals trigger them.',
    inputSchema: {
        type: 'object',
        properties: {
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
            includeInactive: {
                type: 'boolean',
                description: 'Include inactive projects (default: false)',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 50)',
            },
            offset: {
                type: 'number',
                description: 'Number of results to skip for pagination (default: 0)',
            },
            search: {
                type: 'string',
                description: 'Filter by name/ID substring match (case-insensitive)',
            },
        },
        required: [],
    },
};

export const listPeopleTool: Tool = {
    name: 'protokoll_list_people',
    description:
        'List all people configured in the context. ' +
        'People entries help Protokoll recognize and correctly spell names that ' +
        'Whisper might mishear (using sounds_like phonetic variants).',
    inputSchema: {
        type: 'object',
        properties: {
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 50)',
            },
            offset: {
                type: 'number',
                description: 'Number of results to skip for pagination (default: 0)',
            },
            search: {
                type: 'string',
                description: 'Filter by name/ID substring match (case-insensitive)',
            },
        },
        required: [],
    },
};

export const listTermsTool: Tool = {
    name: 'protokoll_list_terms',
    description:
        'List all technical terms and abbreviations in the context. ' +
        'Terms help Protokoll correctly transcribe domain-specific vocabulary.',
    inputSchema: {
        type: 'object',
        properties: {
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 50)',
            },
            offset: {
                type: 'number',
                description: 'Number of results to skip for pagination (default: 0)',
            },
            search: {
                type: 'string',
                description: 'Filter by name/ID substring match (case-insensitive)',
            },
        },
        required: [],
    },
};

export const listCompaniesTool: Tool = {
    name: 'protokoll_list_companies',
    description:
        'List all companies configured in the context. ' +
        'Company entries help recognize organization names in transcripts.',
    inputSchema: {
        type: 'object',
        properties: {
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 50)',
            },
            offset: {
                type: 'number',
                description: 'Number of results to skip for pagination (default: 0)',
            },
            search: {
                type: 'string',
                description: 'Filter by name/ID substring match (case-insensitive)',
            },
        },
        required: [],
    },
};

export const searchContextTool: Tool = {
    name: 'protokoll_search_context',
    description:
        'Search across all context entity types (projects, people, terms, companies). ' +
        'Returns matching entities with their type and key details.',
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Search query to match against entity names, IDs, and sounds_like variants',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 50)',
            },
            offset: {
                type: 'number',
                description: 'Number of results to skip for pagination (default: 0)',
            },
        },
        required: ['query'],
    },
};

export const getEntityTool: Tool = {
    name: 'protokoll_get_entity',
    description:
        'Get detailed information about a specific context entity. ' +
        'Returns the full YAML configuration including sounds_like variants, routing, etc.',
    inputSchema: {
        type: 'object',
        properties: {
            entityType: {
                type: 'string',
                enum: ['project', 'person', 'term', 'company', 'ignored'],
                description: 'Type of entity to retrieve',
            },
            entityId: {
                type: 'string',
                description: 'ID of the entity to retrieve',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['entityType', 'entityId'],
    },
};

export const predictEntitiesTool: Tool = {
    name: 'protokoll_predict_entities',
    description:
        'Predict likely entities based on transcript context using weight model. ' +
        'Returns ranked entity suggestions based on co-occurrence patterns and project affinity. ' +
        'Useful for intelligent entity correction suggestions.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 'Path to the transcript file',
            },
            maxPredictions: {
                type: 'number',
                description: 'Maximum number of predictions to return (default: 10)',
                minimum: 1,
                maximum: 50,
            },
            minScore: {
                type: 'number', 
                description: 'Minimum prediction score (default: 1)',
                minimum: 0,
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath'],
    },
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleContextStatus(args: { contextDirectory?: string }) {
    const context = await getContextInstance(args.contextDirectory);

    const dirs = context.getDiscoveredDirs();
    const config = context.getConfig();

    return {
        hasContext: context.hasContext(),
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
        },
    };
}

export async function handleListProjects(args: { 
    contextDirectory?: string; 
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
    search?: string;
}) {
    const context = await getContextInstance(args.contextDirectory);

    let projects = context.getAllProjects();
    if (!args.includeInactive) {
        projects = projects.filter(p => p.active !== false);
    }

    // Apply search filter
    if (args.search) {
        const searchLower = args.search.toLowerCase();
        projects = projects.filter(p => 
            p.name.toLowerCase().includes(searchLower) ||
            p.id.toLowerCase().includes(searchLower)
        );
    }

    const total = projects.length;
    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;

    // Apply pagination
    const paginatedProjects = projects.slice(offset, offset + limit);

    return {
        total,
        limit,
        offset,
        count: paginatedProjects.length,
        projects: paginatedProjects.map(p => ({
            id: p.id,
            name: p.name,
            active: p.active !== false,
            destination: p.routing?.destination,
            structure: p.routing?.structure,
            contextType: p.classification?.context_type,
            triggerPhrases: p.classification?.explicit_phrases,
        })),
    };
}

export async function handleListPeople(args: { 
    contextDirectory?: string;
    limit?: number;
    offset?: number;
    search?: string;
}) {
    const context = await getContextInstance(args.contextDirectory);

    let people = context.getAllPeople();

    // Apply search filter
    if (args.search) {
        const searchLower = args.search.toLowerCase();
        people = people.filter(p => 
            p.name.toLowerCase().includes(searchLower) ||
            p.id.toLowerCase().includes(searchLower) ||
            p.sounds_like?.some(s => s.toLowerCase().includes(searchLower))
        );
    }

    const total = people.length;
    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;

    // Apply pagination
    const paginatedPeople = people.slice(offset, offset + limit);

    return {
        total,
        limit,
        offset,
        count: paginatedPeople.length,
        people: paginatedPeople.map(p => ({
            id: p.id,
            name: p.name,
            company: p.company,
            role: p.role,
            sounds_like: p.sounds_like,
        })),
    };
}

export async function handleListTerms(args: { 
    contextDirectory?: string;
    limit?: number;
    offset?: number;
    search?: string;
}) {
    const context = await getContextInstance(args.contextDirectory);

    let terms = context.getAllTerms();

    // Apply search filter
    if (args.search) {
        const searchLower = args.search.toLowerCase();
        terms = terms.filter(t => 
            t.name.toLowerCase().includes(searchLower) ||
            t.id.toLowerCase().includes(searchLower) ||
            t.sounds_like?.some(s => s.toLowerCase().includes(searchLower))
        );
    }

    const total = terms.length;
    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;

    // Apply pagination
    const paginatedTerms = terms.slice(offset, offset + limit);

    return {
        total,
        limit,
        offset,
        count: paginatedTerms.length,
        terms: paginatedTerms.map(t => ({
            id: t.id,
            name: t.name,
            expansion: t.expansion,
            domain: t.domain,
            sounds_like: t.sounds_like,
        })),
    };
}

export async function handleListCompanies(args: { 
    contextDirectory?: string;
    limit?: number;
    offset?: number;
    search?: string;
}) {
    const context = await getContextInstance(args.contextDirectory);

    let companies = context.getAllCompanies();

    // Apply search filter
    if (args.search) {
        const searchLower = args.search.toLowerCase();
        companies = companies.filter(c => 
            c.name.toLowerCase().includes(searchLower) ||
            c.id.toLowerCase().includes(searchLower) ||
            c.sounds_like?.some(s => s.toLowerCase().includes(searchLower))
        );
    }

    const total = companies.length;
    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;

    // Apply pagination
    const paginatedCompanies = companies.slice(offset, offset + limit);

    return {
        total,
        limit,
        offset,
        count: paginatedCompanies.length,
        companies: paginatedCompanies.map(c => ({
            id: c.id,
            name: c.name,
            fullName: c.fullName,
            industry: c.industry,
            sounds_like: c.sounds_like,
        })),
    };
}

export async function handleSearchContext(args: { 
    query: string; 
    contextDirectory?: string;
    limit?: number;
    offset?: number;
}) {
    const context = await getContextInstance(args.contextDirectory);

    const results = context.search(args.query);

    const total = results.length;
    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;

    // Apply pagination
    const paginatedResults = results.slice(offset, offset + limit);

    return {
        query: args.query,
        total,
        limit,
        offset,
        count: paginatedResults.length,
        results: paginatedResults.map(formatEntity),
    };
}

export async function handleGetEntity(args: { entityType: EntityType; entityId: string; contextDirectory?: string }) {
    const context = await getContextInstance(args.contextDirectory);

    let entity: Entity;
    switch (args.entityType) {
        case 'project':
            entity = findProjectResilient(context, args.entityId);
            break;
        case 'person':
            entity = findPersonResilient(context, args.entityId);
            break;
        case 'term':
            entity = findTermResilient(context, args.entityId);
            break;
        case 'company':
            entity = findCompanyResilient(context, args.entityId);
            break;
        case 'ignored':
            entity = findIgnoredResilient(context, args.entityId);
            break;
        default:
            throw new Error(`Unknown entity type: ${args.entityType}`);
    }

    const filePath = context.getEntityFilePath(entity);

    return {
        ...formatEntity(entity),
        filePath,
    };
}

export async function handlePredictEntities(args: {
    transcriptPath: string;
    maxPredictions?: number;
    minScore?: number;
    contextDirectory?: string;
}) {
    // Import transcript utilities
    const { resolveTranscriptPath } = await import('./shared');
    const { Transcript: TranscriptUtils } = await import('@redaksjon/protokoll-engine');
    const { ensurePklExtension } = TranscriptUtils;
    const { PklTranscript } = await import('@redaksjon/protokoll-format');
    
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);
    const pklPath = ensurePklExtension(absolutePath);
    
    const transcript = PklTranscript.open(pklPath, { readOnly: true });
    const projectId = transcript.metadata.project;
    const entities = transcript.metadata.entities || {};
    
    // Extract entity IDs from transcript metadata
    const knownEntityIds = [
        ...(entities.people || []).map(e => e.id),
        ...(entities.projects || []).map(e => e.id), 
        ...(entities.terms || []).map(e => e.id),
        ...(entities.companies || []).map(e => e.id)
    ];
    
    transcript.close();
    
    const { getWeightModelService } = await import('../services/weightModel');
    const service = getWeightModelService();
    
    if (!service?.isReady || !service.provider) {
        return { success: true, predictions: [] };
    }
    
    const predictions = service.provider.predictLikelyEntities({
        knownEntityIds,
        projectId,
        maxPredictions: args.maxPredictions || 10,
        minScore: args.minScore ?? 1
    });
    
    return { success: true, predictions };
}
