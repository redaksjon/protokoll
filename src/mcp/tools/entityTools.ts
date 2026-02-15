/* eslint-disable import/extensions */
/**
 * Entity Tools - Create, update, delete, and manage context entities
 */
 
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as Context from '@/context';
import type { Person, Project, Term, Company, Entity, EntityRelationship } from '@/context/types';
import { 
    findPersonResilient, 
    findTermResilient, 
    findCompanyResilient, 
    findProjectResilient,
    findIgnoredResilient 
} from '@redaksjon/protokoll-engine';
 
import { formatEntity, slugify, mergeArray } from './shared.js';

// ============================================================================
// Tool Definitions
// ============================================================================

export const addPersonTool: Tool = {
    name: 'protokoll_add_person',
    description:
        'Add a new person to the context. ' +
        'People entries help Protokoll recognize names that Whisper mishears. ' +
        'Include sounds_like variants for phonetic matching.',
    inputSchema: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Full name of the person',
            },
            id: {
                type: 'string',
                description: 'Unique ID (default: slugified name)',
            },
            firstName: {
                type: 'string',
                description: 'First name',
            },
            lastName: {
                type: 'string',
                description: 'Last name',
            },
            company: {
                type: 'string',
                description: 'Company ID this person is associated with',
            },
            role: {
                type: 'string',
                description: 'Role or job title',
            },
            sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Phonetic variants (how Whisper might mishear the name)',
            },
            context: {
                type: 'string',
                description: 'Additional context about this person',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['name'],
    },
};

export const editPersonTool: Tool = {
    name: 'protokoll_edit_person',
    description:
        'Edit an existing person with manual modifications. ' +
        'Allows direct edits: adding specific sounds_like variants, changing company, role, etc. ' +
        'For the sounds_like array, use add_sounds_like to append or remove_sounds_like to delete specific values, ' +
        'or use sounds_like to replace the entire array.',
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: 'Person ID to edit',
            },
            name: {
                type: 'string',
                description: 'Update the display name',
            },
            firstName: {
                type: 'string',
                description: 'Set the first name',
            },
            lastName: {
                type: 'string',
                description: 'Set the last name',
            },
            company: {
                type: 'string',
                description: 'Set the company ID this person is associated with',
            },
            role: {
                type: 'string',
                description: 'Set the role or job title',
            },
            context: {
                type: 'string',
                description: 'Set additional context about this person',
            },
            sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Replace all sounds_like variants with this array',
            },
            add_sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Add these sounds_like variants to existing ones',
            },
            remove_sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Remove these sounds_like variants',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['id'],
    },
};

export const addProjectTool: Tool = {
    name: 'protokoll_add_project',
    description:
        'Add a new project to the context with optional smart assistance for generating metadata. ' +
        'Projects define where transcripts should be routed based on classification signals. ' +
        'Smart assistance auto-generates sounds_like (phonetic variants for transcription correction) and ' +
        'explicit_phrases (content-matching trigger phrases for classification). ' +
        'Provide a source URL or file path to also generate topics and description from content analysis.',
    inputSchema: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Project name (required)',
            },
            id: {
                type: 'string',
                description: 'Unique ID (default: slugified name)',
            },
            source: {
                type: 'string',
                description: 'URL or file path to analyze for generating topics, description, sounds_like, and explicit_phrases (optional)',
            },
            destination: {
                type: 'string',
                description: 'Output directory for this project\'s transcripts',
            },
            structure: {
                type: 'string',
                enum: ['none', 'year', 'month', 'day'],
                description: 'Directory structure (default: month)',
            },
            contextType: {
                type: 'string',
                enum: ['work', 'personal', 'mixed'],
                description: 'Context type for classification (default: work)',
            },
            explicit_phrases: {
                type: 'array',
                items: { type: 'string' },
                description: 'Content-matching trigger phrases for classification (auto-generated if smart assistance enabled)',
            },
            sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Phonetic variants of project NAME for transcription correction (auto-generated if smart assistance enabled)',
            },
            topics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Topic keywords for classification (auto-generated from source if provided)',
            },
            description: {
                type: 'string',
                description: 'Project description (auto-generated from source if provided)',
            },
            useSmartAssist: {
                type: 'boolean',
                description: 'Enable smart assistance for auto-generating metadata (default: true if configured)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['name'],
    },
};

export const editProjectTool: Tool = {
    name: 'protokoll_edit_project',
    description:
        'Edit an existing project with manual modifications. Unlike protokoll_update_project (which regenerates from a source), ' +
        'this allows direct edits: adding specific sounds_like variants, changing routing, modifying classification, managing relationships, etc. ' +
        'For array fields (sounds_like, topics, explicit_phrases, associated_people, associated_companies, children, siblings, related_terms), ' +
        'use add_* to append or remove_* to delete specific values, or use the base field name to replace the entire array.',
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: 'Project ID to edit',
            },
            name: {
                type: 'string',
                description: 'Update the project name',
            },
            description: {
                type: 'string',
                description: 'Set the project description',
            },
            destination: {
                type: 'string',
                description: 'Set the output directory for transcripts',
            },
            structure: {
                type: 'string',
                enum: ['none', 'year', 'month', 'day'],
                description: 'Set the directory structure',
            },
            contextType: {
                type: 'string',
                enum: ['work', 'personal', 'mixed'],
                description: 'Set the context type for classification',
            },
            active: {
                type: 'boolean',
                description: 'Set whether the project is active',
            },
            sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Replace all sounds_like variants with this array',
            },
            add_sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Add these sounds_like variants to existing ones',
            },
            remove_sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Remove these sounds_like variants',
            },
            topics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Replace all classification topics with this array',
            },
            add_topics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Add these topics to existing ones',
            },
            remove_topics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Remove these topics',
            },
            explicit_phrases: {
                type: 'array',
                items: { type: 'string' },
                description: 'Replace all explicit trigger phrases with this array',
            },
            add_explicit_phrases: {
                type: 'array',
                items: { type: 'string' },
                description: 'Add these explicit trigger phrases',
            },
            remove_explicit_phrases: {
                type: 'array',
                items: { type: 'string' },
                description: 'Remove these explicit trigger phrases',
            },
            associated_people: {
                type: 'array',
                items: { type: 'string' },
                description: 'Replace all associated people (person IDs) with this array',
            },
            add_associated_people: {
                type: 'array',
                items: { type: 'string' },
                description: 'Add these person IDs to associated people',
            },
            remove_associated_people: {
                type: 'array',
                items: { type: 'string' },
                description: 'Remove these person IDs from associated people',
            },
            associated_companies: {
                type: 'array',
                items: { type: 'string' },
                description: 'Replace all associated companies (company IDs) with this array',
            },
            add_associated_companies: {
                type: 'array',
                items: { type: 'string' },
                description: 'Add these company IDs to associated companies',
            },
            remove_associated_companies: {
                type: 'array',
                items: { type: 'string' },
                description: 'Remove these company IDs from associated companies',
            },
            parent: {
                type: 'string',
                description: 'Set parent project ID (for project relationships)',
            },
            add_children: {
                type: 'array',
                items: { type: 'string' },
                description: 'Add these project IDs as children',
            },
            remove_children: {
                type: 'array',
                items: { type: 'string' },
                description: 'Remove these project IDs from children',
            },
            add_siblings: {
                type: 'array',
                items: { type: 'string' },
                description: 'Add these project IDs as siblings',
            },
            remove_siblings: {
                type: 'array',
                items: { type: 'string' },
                description: 'Remove these project IDs from siblings',
            },
            add_related_terms: {
                type: 'array',
                items: { type: 'string' },
                description: 'Add these term IDs as related terms (for project relationships)',
            },
            remove_related_terms: {
                type: 'array',
                items: { type: 'string' },
                description: 'Remove these term IDs from related terms',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['id'],
    },
};

export const updateProjectTool: Tool = {
    name: 'protokoll_update_project',
    description:
        'Update an existing project by regenerating metadata from a source URL or file. ' +
        'Fetches content and uses LLM to regenerate sounds_like, explicit_phrases, topics, and description.',
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: 'Project ID to update',
            },
            source: {
                type: 'string',
                description: 'URL or file path to analyze for regenerating metadata',
            },
            name: {
                type: 'string',
                description: 'Update project name (optional)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['id', 'source'],
    },
};

export const addTermTool: Tool = {
    name: 'protokoll_add_term',
    description:
        'Add a new technical term or abbreviation to the context. ' +
        'Terms help Protokoll correctly transcribe domain-specific vocabulary and enable topic-based routing. ' +
        'Include sounds_like variants for phonetic matching, description for clarity, and topics for classification.',
    inputSchema: {
        type: 'object',
        properties: {
            term: {
                type: 'string',
                description: 'The term or abbreviation',
            },
            id: {
                type: 'string',
                description: 'Unique ID (default: slugified term)',
            },
            expansion: {
                type: 'string',
                description: 'Full expansion if this is an acronym',
            },
            domain: {
                type: 'string',
                description: 'Domain or field (e.g., devops, engineering, security, finance)',
            },
            description: {
                type: 'string',
                description: 'Clear explanation of what the term means',
            },
            sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Phonetic variants (how Whisper might mishear the term)',
            },
            topics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Related topic keywords for classification (e.g., containers, orchestration, devops)',
            },
            projects: {
                type: 'array',
                items: { type: 'string' },
                description: 'Associated project IDs where this term is relevant',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['term'],
    },
};

export const editTermTool: Tool = {
    name: 'protokoll_edit_term',
    description:
        'Edit an existing term with manual modifications. Unlike protokoll_update_term (which regenerates from a source), ' +
        'this allows direct edits: adding specific sounds_like variants, changing description, modifying topics, etc. ' +
        'For array fields (sounds_like, topics, projects), use add_* to append or remove_* to delete specific values, ' +
        'or use the base field name to replace the entire array.',
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: 'Term ID to edit',
            },
            expansion: {
                type: 'string',
                description: 'Set the expansion (full form if acronym)',
            },
            domain: {
                type: 'string',
                description: 'Set the domain (e.g., devops, engineering)',
            },
            description: {
                type: 'string',
                description: 'Set the description',
            },
            sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Replace all sounds_like variants with this array',
            },
            add_sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Add these sounds_like variants to existing ones',
            },
            remove_sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Remove these sounds_like variants',
            },
            topics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Replace all topics with this array',
            },
            add_topics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Add these topics to existing ones',
            },
            remove_topics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Remove these topics',
            },
            projects: {
                type: 'array',
                items: { type: 'string' },
                description: 'Replace all project associations with this array',
            },
            add_projects: {
                type: 'array',
                items: { type: 'string' },
                description: 'Add these project associations',
            },
            remove_projects: {
                type: 'array',
                items: { type: 'string' },
                description: 'Remove these project associations',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['id'],
    },
};

export const updateTermTool: Tool = {
    name: 'protokoll_update_term',
    description:
        'Update an existing term by regenerating metadata from a source URL or file. ' +
        'Fetches content and uses LLM to regenerate description, topics, domain, and sounds_like.',
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: 'Term ID to update',
            },
            source: {
                type: 'string',
                description: 'URL or file path to analyze for regenerating metadata',
            },
            expansion: {
                type: 'string',
                description: 'Update expansion (optional)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['id', 'source'],
    },
};

export const mergeTermsTool: Tool = {
    name: 'protokoll_merge_terms',
    description:
        'Merge two duplicate terms into one. Combines metadata (sounds_like, topics, projects) and deletes the source term.',
    inputSchema: {
        type: 'object',
        properties: {
            sourceId: {
                type: 'string',
                description: 'ID of the term to merge from (will be deleted)',
            },
            targetId: {
                type: 'string',
                description: 'ID of the term to merge into (will be kept and updated)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['sourceId', 'targetId'],
    },
};

export const addCompanyTool: Tool = {
    name: 'protokoll_add_company',
    description:
        'Add a new company to the context. ' +
        'Company entries help recognize organization names in transcripts.',
    inputSchema: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Company name',
            },
            id: {
                type: 'string',
                description: 'Unique ID (default: slugified name)',
            },
            fullName: {
                type: 'string',
                description: 'Full legal name',
            },
            industry: {
                type: 'string',
                description: 'Industry or sector',
            },
            sounds_like: {
                type: 'array',
                items: { type: 'string' },
                description: 'Phonetic variants',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['name'],
    },
};

export const deleteEntityTool: Tool = {
    name: 'protokoll_delete_entity',
    description:
        'Delete an entity from the context. ' +
        'Removes the entity\'s YAML file from the context directory.',
    inputSchema: {
        type: 'object',
        properties: {
            entityType: {
                type: 'string',
                enum: ['project', 'person', 'term', 'company', 'ignored'],
                description: 'Type of entity to delete',
            },
            entityId: {
                type: 'string',
                description: 'ID of the entity to delete',
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

export async function handleAddPerson(args: {
    name: string;
    id?: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    role?: string;
    sounds_like?: string[];
    context?: string;
    contextDirectory?: string;
}) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No .protokoll directory found. Initialize context first.');
    }

    const id = args.id || slugify(args.name);

    if (context.getPerson(id)) {
        throw new Error(`Person with ID "${id}" already exists`);
    }

    const person: Person = {
        id,
        name: args.name,
        type: 'person',
        ...(args.firstName && { firstName: args.firstName }),
        ...(args.lastName && { lastName: args.lastName }),
        ...(args.company && { company: args.company }),
        ...(args.role && { role: args.role }),
        ...(args.sounds_like && { sounds_like: args.sounds_like }),
        ...(args.context && { context: args.context }),
    };

    await context.saveEntity(person);

    return {
        success: true,
        message: `Person "${args.name}" added successfully`,
        entity: formatEntity(person),
    };
}

export async function handleEditPerson(args: {
    id: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    role?: string;
    context?: string;
    sounds_like?: string[];
    add_sounds_like?: string[];
    remove_sounds_like?: string[];
    contextDirectory?: string;
}) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No .protokoll directory found. Initialize context first.');
    }

    const existingPerson = findPersonResilient(context, args.id);

    const updatedSoundsLike = mergeArray(
        existingPerson.sounds_like,
        args.sounds_like,
        args.add_sounds_like,
        args.remove_sounds_like
    );

    // Build updated person
    const updatedPerson: Person = {
        ...existingPerson,
        ...(args.name !== undefined && { name: args.name }),
        ...(args.firstName !== undefined && { firstName: args.firstName }),
        ...(args.lastName !== undefined && { lastName: args.lastName }),
        ...(args.company !== undefined && { company: args.company }),
        ...(args.role !== undefined && { role: args.role }),
        ...(args.context !== undefined && { context: args.context }),
        updatedAt: new Date(),
    };

    // Handle sounds_like array
    if (updatedSoundsLike !== undefined) {
        updatedPerson.sounds_like = updatedSoundsLike;
    } else if (existingPerson.sounds_like && (args.sounds_like !== undefined || args.remove_sounds_like)) {
        delete updatedPerson.sounds_like;
    }

    await context.saveEntity(updatedPerson, true);

    // Build summary of changes
    const changes: string[] = [];
    if (args.name !== undefined) changes.push(`name: "${args.name}"`);
    if (args.firstName !== undefined) changes.push(`firstName: "${args.firstName}"`);
    if (args.lastName !== undefined) changes.push(`lastName: "${args.lastName}"`);
    if (args.company !== undefined) changes.push(`company: "${args.company}"`);
    if (args.role !== undefined) changes.push(`role: "${args.role}"`);
    if (args.context !== undefined) changes.push(`context updated`);
    if (args.sounds_like !== undefined) changes.push(`sounds_like replaced with ${args.sounds_like.length} items`);
    if (args.add_sounds_like?.length) changes.push(`added ${args.add_sounds_like.length} sounds_like variants`);
    if (args.remove_sounds_like?.length) changes.push(`removed ${args.remove_sounds_like.length} sounds_like variants`);

    return {
        success: true,
        message: `Updated person "${existingPerson.name}"`,
        changes,
        person: formatEntity(updatedPerson),
    };
}

export async function handleAddProject(args: {
    name: string;
    id?: string;
    source?: string;
    destination?: string;
    structure?: 'none' | 'year' | 'month' | 'day';
    contextType?: 'work' | 'personal' | 'mixed';
    explicit_phrases?: string[];
    sounds_like?: string[];
    topics?: string[];
    description?: string;
    useSmartAssist?: boolean;
    contextDirectory?: string;
}) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No .protokoll directory found. Initialize context first.');
    }

    const id = args.id || slugify(args.name);

    if (context.getProject(id)) {
        throw new Error(`Project with ID "${id}" already exists`);
    }

    // Smart assistance integration
    const smartConfig = context.getSmartAssistanceConfig();
    const useSmartAssist = args.useSmartAssist !== false && smartConfig.enabled;

    const soundsLike = args.sounds_like || [];
    const triggerPhrases = args.explicit_phrases || [];
    const topics = args.topics || [];
    const description = args.description;
    const suggestedName: string | undefined = undefined;

    if (useSmartAssist) {
        // ProjectAssist temporarily unavailable - needs extraction from CLI
        throw new Error('Smart assistance temporarily unavailable');
        
        /* Unreachable code - commented out until ProjectAssist is re-implemented
        // const assist = ProjectAssist.create(smartConfig);

        // Analyze source if provided
        if (args.source) {
            const suggestions = await assist.analyzeSource(args.source, args.name);

            // Only use suggestions for fields not explicitly provided (undefined, not just empty)
            if (args.sounds_like === undefined) {
                soundsLike = suggestions.soundsLike;
            }
            if (args.explicit_phrases === undefined) {
                triggerPhrases = suggestions.triggerPhrases;
            }
            if (args.topics === undefined && suggestions.topics) {
                topics = suggestions.topics;
            }
            if (!args.description && suggestions.description) {
                description = suggestions.description;
            }
            if (suggestions.name) {
                suggestedName = suggestions.name;
            }
        } else {
            // Generate sounds_like and trigger phrases from name even without source
            if (args.sounds_like === undefined) {
                soundsLike = await assist.generateSoundsLike(args.name);
            }
            if (args.explicit_phrases === undefined) {
                triggerPhrases = await assist.generateTriggerPhrases(args.name);
            }
        }
        */
    }

    const project: Project = {
        id,
        name: args.name,
        type: 'project',
        classification: {
            context_type: args.contextType || 'work',
            explicit_phrases: triggerPhrases,
            ...(topics.length && { topics }),
        },
        routing: {
            ...(args.destination && { destination: args.destination }),
            structure: args.structure || 'month',
            filename_options: ['date', 'time', 'subject'],
        },
        // Include sounds_like if explicitly provided (even if empty) or if generated
        ...((args.sounds_like !== undefined || soundsLike.length) && { sounds_like: soundsLike }),
        ...(description && { description }),
        active: true,
    };

    await context.saveEntity(project);

    return {
        success: true,
        message: `Project "${args.name}" added successfully`,
        entity: formatEntity(project),
        smartAssistUsed: useSmartAssist,
        ...(suggestedName ? { suggestedName } : {}),
        generated: {
            soundsLike,
            triggerPhrases,
            topics,
            description,
        },
    };
}

export async function handleEditProject(args: {
    id: string;
    name?: string;
    description?: string;
    destination?: string;
    structure?: 'none' | 'year' | 'month' | 'day';
    contextType?: 'work' | 'personal' | 'mixed';
    active?: boolean;
    sounds_like?: string[];
    add_sounds_like?: string[];
    remove_sounds_like?: string[];
    topics?: string[];
    add_topics?: string[];
    remove_topics?: string[];
    explicit_phrases?: string[];
    add_explicit_phrases?: string[];
    remove_explicit_phrases?: string[];
    associated_people?: string[];
    add_associated_people?: string[];
    remove_associated_people?: string[];
    associated_companies?: string[];
    add_associated_companies?: string[];
    remove_associated_companies?: string[];
    parent?: string;
    add_children?: string[];
    remove_children?: string[];
    add_siblings?: string[];
    remove_siblings?: string[];
    add_related_terms?: string[];
    remove_related_terms?: string[];
    contextDirectory?: string;
}) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No .protokoll directory found. Initialize context first.');
    }

    const existingProject = findProjectResilient(context, args.id);

    const updatedSoundsLike = mergeArray(
        existingProject.sounds_like,
        args.sounds_like,
        args.add_sounds_like,
        args.remove_sounds_like
    );

    const updatedTopics = mergeArray(
        existingProject.classification?.topics,
        args.topics,
        args.add_topics,
        args.remove_topics
    );

    const updatedExplicitPhrases = mergeArray(
        existingProject.classification?.explicit_phrases,
        args.explicit_phrases,
        args.add_explicit_phrases,
        args.remove_explicit_phrases
    );

    const updatedAssociatedPeople = mergeArray(
        existingProject.classification?.associated_people,
        args.associated_people,
        args.add_associated_people,
        args.remove_associated_people
    );

    const updatedAssociatedCompanies = mergeArray(
        existingProject.classification?.associated_companies,
        args.associated_companies,
        args.add_associated_companies,
        args.remove_associated_companies
    );

    // Handle relationships
    // Helper functions for relationships
    const createEntityUri = (type: string, id: string): string => `redaksjon://${type}/${id}`;
    const getIdFromUri = (uri: string): string | null => {
        const match = uri.match(/^redaksjon:\/\/[^/]+\/(.+)$/);
        return match ? match[1] : null;
    };
    const getEntityIdsByRelationshipType = (relationships: EntityRelationship[] | undefined, relationshipType: string): string[] => {
        if (!relationships) return [];
        return relationships
            .filter(r => r.relationship === relationshipType)
            .map(r => getIdFromUri(r.uri))
            .filter((id): id is string => id !== null);
    };
    const setRelationships = (relationships: EntityRelationship[] | undefined, type: string, entityType: string, entityIds: string[]): EntityRelationship[] => {
        const rels = relationships || [];
        const filtered = rels.filter(r => r.relationship !== type);
        const newRels = entityIds.map(id => ({ uri: createEntityUri(entityType, id), relationship: type }));
        return [...filtered, ...newRels];
    };
    const addRelationship = (relationships: EntityRelationship[] | undefined, type: string, entityType: string, entityId: string): EntityRelationship[] => {
        const rels = relationships || [];
        const uri = createEntityUri(entityType, entityId);
        const filtered = rels.filter(r => !(r.relationship === type && r.uri === uri));
        return [...filtered, { uri, relationship: type }];
    };

    const existingChildren = getEntityIdsByRelationshipType(existingProject.relationships, 'child');
    const updatedChildren = mergeArray(
        existingChildren,
        undefined,
        args.add_children,
        args.remove_children
    );

    const existingSiblings = getEntityIdsByRelationshipType(existingProject.relationships, 'sibling');
    const updatedSiblings = mergeArray(
        existingSiblings,
        undefined,
        args.add_siblings,
        args.remove_siblings
    );

    const existingRelatedTerms = getEntityIdsByRelationshipType(existingProject.relationships, 'related_term');
    const updatedRelatedTerms = mergeArray(
        existingRelatedTerms,
        undefined,
        args.add_related_terms,
        args.remove_related_terms
    );

    // Build updated project
    const updatedProject: Project = {
        ...existingProject,
        ...(args.name !== undefined && { name: args.name }),
        ...(args.description !== undefined && { description: args.description }),
        ...(args.active !== undefined && { active: args.active }),
        classification: {
            ...existingProject.classification,
            ...(args.contextType !== undefined && { context_type: args.contextType }),
        },
        routing: {
            ...existingProject.routing,
            ...(args.destination !== undefined && { destination: args.destination }),
            ...(args.structure !== undefined && { structure: args.structure }),
        },
        updatedAt: new Date(),
    };

    // Handle sounds_like at project level
    if (updatedSoundsLike !== undefined) {
        updatedProject.sounds_like = updatedSoundsLike;
    } else if (existingProject.sounds_like && (args.sounds_like !== undefined || args.remove_sounds_like)) {
        delete updatedProject.sounds_like;
    }

    // Handle classification arrays
    if (updatedTopics !== undefined) {
        updatedProject.classification.topics = updatedTopics;
    } else if (existingProject.classification?.topics && (args.topics !== undefined || args.remove_topics)) {
        delete updatedProject.classification.topics;
    }

    if (updatedExplicitPhrases !== undefined) {
        updatedProject.classification.explicit_phrases = updatedExplicitPhrases;
    } else if (existingProject.classification?.explicit_phrases && (args.explicit_phrases !== undefined || args.remove_explicit_phrases)) {
        delete updatedProject.classification.explicit_phrases;
    }

    if (updatedAssociatedPeople !== undefined) {
        updatedProject.classification.associated_people = updatedAssociatedPeople;
    } else if (existingProject.classification?.associated_people && (args.associated_people !== undefined || args.remove_associated_people)) {
        delete updatedProject.classification.associated_people;
    }

    if (updatedAssociatedCompanies !== undefined) {
        updatedProject.classification.associated_companies = updatedAssociatedCompanies;
    } else if (existingProject.classification?.associated_companies && (args.associated_companies !== undefined || args.remove_associated_companies)) {
        delete updatedProject.classification.associated_companies;
    }

    // Handle relationships
    let relationships: EntityRelationship[] = existingProject.relationships ? [...existingProject.relationships] : [];
    
    if (args.parent !== undefined) {
        relationships = addRelationship(relationships, 'parent', 'project', args.parent);
    }
    
    if (updatedChildren !== undefined && updatedChildren !== existingChildren) {
        relationships = setRelationships(relationships, 'child', 'project', updatedChildren);
    }
    
    if (updatedSiblings !== undefined && updatedSiblings !== existingSiblings) {
        relationships = setRelationships(relationships, 'sibling', 'project', updatedSiblings);
    }
    
    if (updatedRelatedTerms !== undefined && updatedRelatedTerms !== existingRelatedTerms) {
        relationships = setRelationships(relationships, 'related_term', 'term', updatedRelatedTerms);
    }
    
    if (args.parent !== undefined || updatedChildren !== undefined || updatedSiblings !== undefined || updatedRelatedTerms !== undefined) {
        updatedProject.relationships = relationships.length > 0 ? relationships : undefined;
    }

    await context.saveEntity(updatedProject, true);

    // Build summary of changes
    const changes: string[] = [];
    if (args.name !== undefined) changes.push(`name: "${args.name}"`);
    if (args.description !== undefined) changes.push(`description updated`);
    if (args.destination !== undefined) changes.push(`destination: "${args.destination}"`);
    if (args.structure !== undefined) changes.push(`structure: "${args.structure}"`);
    if (args.contextType !== undefined) changes.push(`context_type: "${args.contextType}"`);
    if (args.active !== undefined) changes.push(`active: ${args.active}`);
    if (args.sounds_like !== undefined) changes.push(`sounds_like replaced with ${args.sounds_like.length} items`);
    if (args.add_sounds_like?.length) changes.push(`added ${args.add_sounds_like.length} sounds_like variants`);
    if (args.remove_sounds_like?.length) changes.push(`removed ${args.remove_sounds_like.length} sounds_like variants`);
    if (args.topics !== undefined) changes.push(`topics replaced with ${args.topics.length} items`);
    if (args.add_topics?.length) changes.push(`added ${args.add_topics.length} topics`);
    if (args.remove_topics?.length) changes.push(`removed ${args.remove_topics.length} topics`);
    if (args.explicit_phrases !== undefined) changes.push(`explicit_phrases replaced with ${args.explicit_phrases.length} items`);
    if (args.add_explicit_phrases?.length) changes.push(`added ${args.add_explicit_phrases.length} explicit phrases`);
    if (args.remove_explicit_phrases?.length) changes.push(`removed ${args.remove_explicit_phrases.length} explicit phrases`);
    if (args.associated_people !== undefined) changes.push(`associated_people replaced with ${args.associated_people.length} items`);
    if (args.add_associated_people?.length) changes.push(`added ${args.add_associated_people.length} associated people`);
    if (args.remove_associated_people?.length) changes.push(`removed ${args.remove_associated_people.length} associated people`);
    if (args.associated_companies !== undefined) changes.push(`associated_companies replaced with ${args.associated_companies.length} items`);
    if (args.add_associated_companies?.length) changes.push(`added ${args.add_associated_companies.length} associated companies`);
    if (args.remove_associated_companies?.length) changes.push(`removed ${args.remove_associated_companies.length} associated companies`);
    if (args.parent !== undefined) changes.push(`parent: "${args.parent}"`);
    if (args.add_children?.length) changes.push(`added ${args.add_children.length} children`);
    if (args.remove_children?.length) changes.push(`removed ${args.remove_children.length} children`);
    if (args.add_siblings?.length) changes.push(`added ${args.add_siblings.length} siblings`);
    if (args.remove_siblings?.length) changes.push(`removed ${args.remove_siblings.length} siblings`);
    if (args.add_related_terms?.length) changes.push(`added ${args.add_related_terms.length} related terms`);
    if (args.remove_related_terms?.length) changes.push(`removed ${args.remove_related_terms.length} related terms`);

    return {
        success: true,
        message: `Updated project "${existingProject.name}"`,
        changes,
        project: formatEntity(updatedProject),
    };
}

export async function handleUpdateProject(args: {
    id: string;
    source: string;
    name?: string;
    contextDirectory?: string;
}) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No .protokoll directory found. Initialize context first.');
    }

    // Verify project exists
    findProjectResilient(context, args.id);

    const smartConfig = context.getSmartAssistanceConfig();
    if (!smartConfig.enabled) {
        throw new Error('Smart assistance is disabled in configuration.');
    }

    // ProjectAssist temporarily unavailable - needs extraction from CLI
    throw new Error('Smart assistance temporarily unavailable');
    
    /* Unreachable code - commented out until ProjectAssist is re-implemented
    // const assist = ProjectAssist.create(smartConfig);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const projectName = args.name || existingProject.name;

    // Analyze source for new metadata
    const suggestions = await assist.analyzeSource(args.source, projectName);

    // Update project with regenerated metadata
    const updatedProject: Project = {
        ...existingProject,
        ...(args.name && { name: args.name }),
        ...(suggestions.description && { description: suggestions.description }),
        ...(suggestions.soundsLike.length > 0 && { sounds_like: suggestions.soundsLike }),
        classification: {
            ...existingProject.classification,
            ...(suggestions.triggerPhrases.length > 0 && { explicit_phrases: suggestions.triggerPhrases }),
            ...(suggestions.topics && suggestions.topics.length > 0 && { topics: suggestions.topics }),
        },
        updatedAt: new Date(),
    };

    await context.saveEntity(updatedProject, true);

    return {
        success: true,
        message: `Updated project "${existingProject.name}" from source`,
        project: formatEntity(updatedProject),
        generated: {
            soundsLike: suggestions.soundsLike,
            triggerPhrases: suggestions.triggerPhrases,
            topics: suggestions.topics,
            description: suggestions.description,
        },
    };
    */
}

export async function handleAddTerm(args: {
    term: string;
    id?: string;
    expansion?: string;
    domain?: string;
    description?: string;
    sounds_like?: string[];
    topics?: string[];
    projects?: string[];
    contextDirectory?: string;
}) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No .protokoll directory found. Initialize context first.');
    }

    const id = args.id || slugify(args.term);

    if (context.getTerm(id)) {
        throw new Error(`Term with ID "${id}" already exists`);
    }

    const term: Term = {
        id,
        name: args.term,
        type: 'term',
        ...(args.expansion && { expansion: args.expansion }),
        ...(args.domain && { domain: args.domain }),
        ...(args.description && { description: args.description }),
        ...(args.sounds_like && { sounds_like: args.sounds_like }),
        ...(args.topics && { topics: args.topics }),
        ...(args.projects && { projects: args.projects }),
    };

    await context.saveEntity(term);

    return {
        success: true,
        message: `Term "${args.term}" added successfully`,
        entity: formatEntity(term),
    };
}

export async function handleEditTerm(args: {
    id: string;
    expansion?: string;
    domain?: string;
    description?: string;
    sounds_like?: string[];
    add_sounds_like?: string[];
    remove_sounds_like?: string[];
    topics?: string[];
    add_topics?: string[];
    remove_topics?: string[];
    projects?: string[];
    add_projects?: string[];
    remove_projects?: string[];
    contextDirectory?: string;
}) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No .protokoll directory found. Initialize context first.');
    }

    const existingTerm = context.getTerm(args.id);
    if (!existingTerm) {
        throw new Error(`Term "${args.id}" not found`);
    }

    const updatedSoundsLike = mergeArray(
        existingTerm.sounds_like,
        args.sounds_like,
        args.add_sounds_like,
        args.remove_sounds_like
    );

    const updatedTopics = mergeArray(
        existingTerm.topics,
        args.topics,
        args.add_topics,
        args.remove_topics
    );

    const updatedProjects = mergeArray(
        existingTerm.projects,
        args.projects,
        args.add_projects,
        args.remove_projects
    );

    // Build updated term
    const updatedTerm: Term = {
        ...existingTerm,
        ...(args.expansion !== undefined && { expansion: args.expansion }),
        ...(args.domain !== undefined && { domain: args.domain }),
        ...(args.description !== undefined && { description: args.description }),
        updatedAt: new Date(),
    };

    // Handle array fields - only set if they have values
    if (updatedSoundsLike !== undefined) {
        updatedTerm.sounds_like = updatedSoundsLike;
    } else if (existingTerm.sounds_like && (args.sounds_like !== undefined || args.remove_sounds_like)) {
        delete updatedTerm.sounds_like;
    }

    if (updatedTopics !== undefined) {
        updatedTerm.topics = updatedTopics;
    } else if (existingTerm.topics && (args.topics !== undefined || args.remove_topics)) {
        delete updatedTerm.topics;
    }

    if (updatedProjects !== undefined) {
        updatedTerm.projects = updatedProjects;
    } else if (existingTerm.projects && (args.projects !== undefined || args.remove_projects)) {
        delete updatedTerm.projects;
    }

    await context.saveEntity(updatedTerm, true);

    // Build summary of changes
    const changes: string[] = [];
    if (args.expansion !== undefined) changes.push(`expansion: "${args.expansion}"`);
    if (args.domain !== undefined) changes.push(`domain: "${args.domain}"`);
    if (args.description !== undefined) changes.push(`description updated`);
    if (args.sounds_like !== undefined) changes.push(`sounds_like replaced with ${args.sounds_like.length} items`);
    if (args.add_sounds_like?.length) changes.push(`added ${args.add_sounds_like.length} sounds_like variants`);
    if (args.remove_sounds_like?.length) changes.push(`removed ${args.remove_sounds_like.length} sounds_like variants`);
    if (args.topics !== undefined) changes.push(`topics replaced with ${args.topics.length} items`);
    if (args.add_topics?.length) changes.push(`added ${args.add_topics.length} topics`);
    if (args.remove_topics?.length) changes.push(`removed ${args.remove_topics.length} topics`);
    if (args.projects !== undefined) changes.push(`projects replaced with ${args.projects.length} items`);
    if (args.add_projects?.length) changes.push(`added ${args.add_projects.length} project associations`);
    if (args.remove_projects?.length) changes.push(`removed ${args.remove_projects.length} project associations`);

    return {
        success: true,
        message: `Updated term "${existingTerm.name}"`,
        changes,
        term: formatEntity(updatedTerm),
    };
}

export async function handleUpdateTerm(args: {
    id: string;
    source: string;
    expansion?: string;
    contextDirectory?: string;
}) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No .protokoll directory found. Initialize context first.');
    }

    // Verify term exists
    findTermResilient(context, args.id);

    const smartConfig = context.getSmartAssistanceConfig();
    if (!smartConfig.enabled || smartConfig.termsEnabled === false) {
        throw new Error('Term smart assistance is disabled in configuration.');
    }

    // ContentFetcher, TermAssist, TermContext temporarily unavailable
    throw new Error('Term assistance temporarily unavailable - business logic needs extraction from CLI');
    
    /* Unreachable code - commented out until modules are re-implemented
    // Fetch content from source
    const ContentFetcher = await import('@/cli/content-fetcher');
    const contentFetcher = ContentFetcher.create();
    const fetchResult = await contentFetcher.fetch(args.source);

    if (!fetchResult.success) {
        throw new Error(`Failed to fetch source: ${fetchResult.error}`);
    }

    // Gather context and generate suggestions
    const TermAssist = await import('@/cli/term-assist');
    const TermContext = await import('@/cli/term-context');

    const termAssist = TermAssist.create(smartConfig);
    const termContextHelper = TermContext.create(context);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const internalContext = termContextHelper.gatherInternalContext(
        existingTerm.name,
        args.expansion || existingTerm.expansion
    );

    const analysisContext = TermContext.buildAnalysisContext(
        existingTerm.name,
        args.expansion || existingTerm.expansion,
        fetchResult,
        internalContext
    );

    const suggestions = await termAssist.generateAll(existingTerm.name, analysisContext);

    // Update term with regenerated metadata
    const updatedTerm: Term = {
        ...existingTerm,
        ...(args.expansion && { expansion: args.expansion }),
        ...(suggestions.description && { description: suggestions.description }),
        ...(suggestions.domain && { domain: suggestions.domain }),
        ...(suggestions.soundsLike.length > 0 && { sounds_like: suggestions.soundsLike }),
        ...(suggestions.topics.length > 0 && { topics: suggestions.topics }),
        updatedAt: new Date(),
    };

    // Suggest projects based on topics
    let suggestedProjects: string[] = [];
    if (suggestions.topics.length > 0) {
        const projects = termContextHelper.findProjectsByTopic(suggestions.topics);
        suggestedProjects = projects.map((p: any) => p.id);
    }

    await context.saveEntity(updatedTerm, true);

    return {
        success: true,
        message: `Updated term "${existingTerm.name}" from source`,
        term: formatEntity(updatedTerm),
        generated: {
            soundsLike: suggestions.soundsLike,
            description: suggestions.description,
            topics: suggestions.topics,
            domain: suggestions.domain,
            suggestedProjects,
        },
    };
    */
}

/* c8 ignore start */
export async function handleMergeTerms(args: {
    sourceId: string;
    targetId: string;
    contextDirectory?: string;
}) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No .protokoll directory found. Initialize context first.');
    }

    const sourceTerm = findTermResilient(context, args.sourceId);
    const targetTerm = findTermResilient(context, args.targetId);

    // Merge metadata
    const mergedTerm: Term = {
        ...targetTerm,
        sounds_like: [
            ...(targetTerm.sounds_like || []),
            ...(sourceTerm.sounds_like || []),
        ].filter((v, i, arr) => arr.indexOf(v) === i),
        topics: [
            ...(targetTerm.topics || []),
            ...(sourceTerm.topics || []),
        ].filter((v, i, arr) => arr.indexOf(v) === i),
        projects: [
            ...(targetTerm.projects || []),
            ...(sourceTerm.projects || []),
        ].filter((v, i, arr) => arr.indexOf(v) === i),
        description: targetTerm.description || sourceTerm.description,
        domain: targetTerm.domain || sourceTerm.domain,
        expansion: targetTerm.expansion || sourceTerm.expansion,
        updatedAt: new Date(),
    };

    // Remove empty arrays
    if (mergedTerm.sounds_like && mergedTerm.sounds_like.length === 0) {
        delete mergedTerm.sounds_like;
    }
    if (mergedTerm.topics && mergedTerm.topics.length === 0) {
        delete mergedTerm.topics;
    }
    if (mergedTerm.projects && mergedTerm.projects.length === 0) {
        delete mergedTerm.projects;
    }

    // Save merged term and delete source
    await context.saveEntity(mergedTerm);
    await context.deleteEntity(sourceTerm);

    return {
        success: true,
        message: `Merged "${sourceTerm.name}" into "${targetTerm.name}"`,
        mergedTerm: formatEntity(mergedTerm),
        deletedTerm: args.sourceId,
    };
}
/* c8 ignore stop */

export async function handleAddCompany(args: {
    name: string;
    id?: string;
    fullName?: string;
    industry?: string;
    sounds_like?: string[];
    contextDirectory?: string;
}) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No .protokoll directory found. Initialize context first.');
    }

    const id = args.id || slugify(args.name);

    if (context.getCompany(id)) {
        throw new Error(`Company with ID "${id}" already exists`);
    }

    const company: Company = {
        id,
        name: args.name,
        type: 'company',
        ...(args.fullName && { fullName: args.fullName }),
        ...(args.industry && { industry: args.industry }),
        ...(args.sounds_like && { sounds_like: args.sounds_like }),
    };

    await context.saveEntity(company);

    return {
        success: true,
        message: `Company "${args.name}" added successfully`,
        entity: formatEntity(company),
    };
}

export async function handleDeleteEntity(args: { entityType: string; entityId: string; contextDirectory?: string }) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

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

    const deleted = await context.deleteEntity(entity);

    if (!deleted) {
        throw new Error(`Failed to delete ${args.entityType} "${args.entityId}"`);
    }

    return {
        success: true,
        message: `${args.entityType} "${args.entityId}" deleted successfully`,
    };
}
