/* eslint-disable import/extensions */
/**
 * Smart Assistance Tools - Generate metadata suggestions for entities
 */
 
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as Context from '@/context';
import * as ProjectAssist from '@/cli/project-assist';
import * as TermAssist from '@/cli/term-assist';
import * as TermContext from '@/cli/term-context';
import * as ContentFetcher from '@/cli/content-fetcher';

// ============================================================================
// Tool Definitions
// ============================================================================

export const suggestProjectMetadataTool: Tool = {
    name: 'protokoll_suggest_project_metadata',
    description:
        'Generate project metadata suggestions without creating the project. ' +
        'Returns sounds_like (phonetic variants for transcription), explicit_phrases (content-matching trigger phrases), ' +
        'topics and description from source content. Useful for interactive workflows where ' +
        'AI assistant presents suggestions for user review before creating the project.',
    inputSchema: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Project name for generating sounds_like and trigger phrases',
            },
            source: {
                type: 'string',
                description: 'URL or file path to analyze for topics, description, and suggested name',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
    },
};

export const suggestTermMetadataTool: Tool = {
    name: 'protokoll_suggest_term_metadata',
    description:
        'Generate term metadata suggestions without creating the term. ' +
        'Returns sounds_like (phonetic variants), description, topics, domain, and suggested projects. ' +
        'Useful for interactive workflows where AI assistant presents suggestions for user review before creating the term.',
    inputSchema: {
        type: 'object',
        properties: {
            term: {
                type: 'string',
                description: 'Term name for generating metadata',
            },
            source: {
                type: 'string',
                description: 'URL or file path to analyze for richer suggestions (optional)',
            },
            expansion: {
                type: 'string',
                description: 'Full expansion if acronym (helps with analysis)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['term'],
    },
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleSuggestProjectMetadata(args: {
    name?: string;
    source?: string;
    contextDirectory?: string;
}) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    const smartConfig = context.getSmartAssistanceConfig();

    if (!smartConfig.enabled) {
        throw new Error('Smart assistance is disabled in configuration.');
    }

    const assist = ProjectAssist.create(smartConfig);

    const result: {
        soundsLike?: string[];
        triggerPhrases?: string[];
        topics?: string[];
        description?: string;
        suggestedName?: string;
    } = {};

    // Generate sounds_like and trigger phrases if name provided
    if (args.name) {
        // Generate in parallel for efficiency
        const [soundsLike, triggerPhrases] = await Promise.all([
            assist.generateSoundsLike(args.name),
            assist.generateTriggerPhrases(args.name),
        ]);
        result.soundsLike = soundsLike;
        result.triggerPhrases = triggerPhrases;
    }

    // Analyze source if provided
    if (args.source) {
        const suggestions = await assist.analyzeSource(args.source, args.name);

        if (!args.name && suggestions.name) {
            result.suggestedName = suggestions.name;
            result.soundsLike = suggestions.soundsLike;
            result.triggerPhrases = suggestions.triggerPhrases;
        }
        result.topics = suggestions.topics;
        result.description = suggestions.description;
    }

    return {
        success: true,
        data: result,
    };
}

export async function handleSuggestTermMetadata(args: {
    term: string;
    source?: string;
    expansion?: string;
    contextDirectory?: string;
}) {
    const context = await Context.create({
        startingDir: args.contextDirectory || process.cwd(),
    });

    const smartConfig = context.getSmartAssistanceConfig();

    if (!smartConfig.enabled || smartConfig.termsEnabled === false) {
        throw new Error('Term smart assistance is disabled in configuration.');
    }

    const termAssist = TermAssist.create(smartConfig);
    const termContextHelper = TermContext.create(context);
    const contentFetcher = ContentFetcher.create();

    // Gather internal context
    const internalContext = termContextHelper.gatherInternalContext(args.term, args.expansion);

    // Fetch external content if source provided
    let fetchResult: ContentFetcher.FetchResult | undefined;
    if (args.source) {
        fetchResult = await contentFetcher.fetch(args.source);
    }

    // Build analysis context
    const analysisContext = TermContext.buildAnalysisContext(
        args.term,
        args.expansion,
        fetchResult,
        internalContext
    );

    // Generate suggestions
    const suggestions = await termAssist.generateAll(args.term, analysisContext);

    // Find related projects based on generated topics
    let suggestedProjects: string[] = [];
    if (suggestions.topics && suggestions.topics.length > 0) {
        const projects = termContextHelper.findProjectsByTopic(suggestions.topics);
        suggestedProjects = projects.map(p => p.id);
    }

    return {
        success: true,
        data: {
            soundsLike: suggestions.soundsLike,
            description: suggestions.description,
            topics: suggestions.topics,
            domain: suggestions.domain,
            suggestedProjects,
        },
    };
}
