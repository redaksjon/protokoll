/**
 * Context Management Tools - View and search context entities
 */
// eslint-disable-next-line import/extensions
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as Context from '@/context';
import type { Entity, EntityType } from '@/context/types';
import { formatEntity } from './shared';

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

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleContextStatus(args: { contextDirectory?: string }) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

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

export async function handleListProjects(args: { contextDirectory?: string; includeInactive?: boolean }) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    let projects = context.getAllProjects();
    if (!args.includeInactive) {
        projects = projects.filter(p => p.active !== false);
    }

    return {
        count: projects.length,
        projects: projects.map(p => ({
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

export async function handleListPeople(args: { contextDirectory?: string }) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    const people = context.getAllPeople();

    return {
        count: people.length,
        people: people.map(p => ({
            id: p.id,
            name: p.name,
            company: p.company,
            role: p.role,
            sounds_like: p.sounds_like,
        })),
    };
}

export async function handleListTerms(args: { contextDirectory?: string }) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    const terms = context.getAllTerms();

    return {
        count: terms.length,
        terms: terms.map(t => ({
            id: t.id,
            name: t.name,
            expansion: t.expansion,
            domain: t.domain,
            sounds_like: t.sounds_like,
        })),
    };
}

export async function handleListCompanies(args: { contextDirectory?: string }) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    const companies = context.getAllCompanies();

    return {
        count: companies.length,
        companies: companies.map(c => ({
            id: c.id,
            name: c.name,
            fullName: c.fullName,
            industry: c.industry,
            sounds_like: c.sounds_like,
        })),
    };
}

export async function handleSearchContext(args: { query: string; contextDirectory?: string }) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    const results = context.search(args.query);

    return {
        query: args.query,
        count: results.length,
        results: results.map(formatEntity),
    };
}

export async function handleGetEntity(args: { entityType: EntityType; entityId: string; contextDirectory?: string }) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    let entity: Entity | undefined;
    switch (args.entityType) {
        case 'project':
            entity = context.getProject(args.entityId);
            break;
        case 'person':
            entity = context.getPerson(args.entityId);
            break;
        case 'term':
            entity = context.getTerm(args.entityId);
            break;
        case 'company':
            entity = context.getCompany(args.entityId);
            break;
        case 'ignored':
            entity = context.getIgnored(args.entityId);
            break;
    }

    if (!entity) {
        throw new Error(`${args.entityType} "${args.entityId}" not found`);
    }

    const filePath = context.getEntityFilePath(entity);

    return {
        ...formatEntity(entity),
        filePath,
    };
}
