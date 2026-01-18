#!/usr/bin/env node
/**
 * Protokoll MCP Server
 * 
 * Exposes intelligent audio transcription as MCP tools for AI coding assistants.
 * Allows AI tools to process audio, manage context, and work with transcripts
 * without needing to understand command-line interfaces.
 * 
 * Key capabilities:
 * - Process audio files with context-aware transcription
 * - Manage context entities (people, projects, terms, companies)
 * - Edit and combine existing transcripts
 * - Provide feedback to improve transcription quality
 */

import 'dotenv/config';
// eslint-disable-next-line import/extensions
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// eslint-disable-next-line import/extensions
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type Tool,
// eslint-disable-next-line import/extensions
} from '@modelcontextprotocol/sdk/types.js';
import { resolve, dirname } from 'node:path';
import { readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { glob } from 'glob';

// Helper for async file existence check
const fileExists = async (path: string): Promise<boolean> => {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
};

// Import Protokoll modules
import * as Context from '@/context';
import * as Pipeline from '@/pipeline';
import * as Media from '@/util/media';
import * as Storage from '@/util/storage';
import * as Reasoning from '@/reasoning';
import { getLogger } from '@/logging';
import * as ProjectAssist from '@/cli/project-assist';
import * as ContentFetcher from '@/cli/content-fetcher';
import {
    DEFAULT_OUTPUT_DIRECTORY,
    DEFAULT_OUTPUT_STRUCTURE,
    DEFAULT_OUTPUT_FILENAME_OPTIONS,
    DEFAULT_MAX_AUDIO_SIZE,
    DEFAULT_INTERMEDIATE_DIRECTORY,
    DEFAULT_MODEL,
    DEFAULT_TRANSCRIPTION_MODEL,
    DEFAULT_REASONING_LEVEL,
    DEFAULT_TEMP_DIRECTORY,
} from '@/constants';
import { parseTranscript, combineTranscripts, editTranscript } from '@/cli/action';
import { processFeedback, applyChanges, type FeedbackContext } from '@/cli/feedback';
import type { Person, Project, Term, Company, IgnoredTerm, Entity, EntityType } from '@/context/types';

// Initialize utilities for MCP server
const logger = getLogger();
const media = Media.create(logger);
const storage = Storage.create({ log: logger.debug.bind(logger) });

/**
 * Get audio file metadata (creation time and hash)
 */
async function getAudioMetadata(audioFile: string): Promise<{ creationTime: Date; hash: string }> {
    // Get creation time from audio file
    let creationTime = await media.getAudioCreationTime(audioFile);
    if (!creationTime) {
        creationTime = new Date();
    }
    
    // Calculate hash of the file
    const hash = (await storage.hashFile(audioFile, 100)).substring(0, 8);
    
    return { creationTime, hash };
}

// ============================================================================
// Types
// ============================================================================

interface ProcessingResult {
    outputPath: string;
    enhancedText: string;
    rawTranscript: string;
    routedProject?: string;
    routingConfidence: number;
    processingTime: number;
    toolsUsed: string[];
    correctionsApplied: number;
}

interface DiscoveredConfig {
    path: string;
    projectCount: number;
    peopleCount: number;
    termsCount: number;
    companiesCount: number;
    outputDirectory?: string;
    model?: string;
}

interface ProjectSuggestion {
    projectId: string;
    projectName: string;
    confidence: number;
    reason: string;
    destination?: string;
}

// ============================================================================
// Configuration Discovery
// ============================================================================

/**
 * Walk up the directory tree from a starting path to find .protokoll directories
 */
async function findProtokolkConfigs(startPath: string, maxLevels: number = 10): Promise<string[]> {
    const configs: string[] = [];
    let currentPath = resolve(startPath);
    let levels = 0;
    
    while (levels < maxLevels) {
        const protokollPath = resolve(currentPath, '.protokoll');
        if (await fileExists(protokollPath)) {
            configs.push(protokollPath);
        }
        
        const parentPath = dirname(currentPath);
        if (parentPath === currentPath) break; // Reached root
        currentPath = parentPath;
        levels++;
    }
    
    return configs;
}

/**
 * Get information about a .protokoll configuration
 */
async function getConfigInfo(protokollPath: string): Promise<DiscoveredConfig> {
    const context = await Context.create({ startingDir: dirname(protokollPath) });
    const config = context.getConfig();
    
    return {
        path: protokollPath,
        projectCount: context.getAllProjects().length,
        peopleCount: context.getAllPeople().length,
        termsCount: context.getAllTerms().length,
        companiesCount: context.getAllCompanies().length,
        outputDirectory: config.outputDirectory as string | undefined,
        model: config.model as string | undefined,
    };
}

/**
 * Suggest which project an audio file might belong to based on its location
 */
async function suggestProjectsForFile(audioFile: string): Promise<{
    configs: DiscoveredConfig[];
    suggestions: ProjectSuggestion[];
    needsUserInput: boolean;
    message: string;
}> {
    const audioPath = resolve(audioFile);
    const audioDir = dirname(audioPath);
    
    // Find all .protokoll configs in the hierarchy
    const configPaths = await findProtokolkConfigs(audioDir);
    
    if (configPaths.length === 0) {
        return {
            configs: [],
            suggestions: [],
            needsUserInput: true,
            message: `No .protokoll configuration found for ${audioFile}. ` +
                'You can either: (1) Create a .protokoll directory with project configuration, ' +
                'or (2) Specify a contextDirectory when calling protokoll_process_audio.',
        };
    }
    
    // Get info about each config
    const configs: DiscoveredConfig[] = [];
    const allSuggestions: ProjectSuggestion[] = [];
    
    for (const configPath of configPaths) {
        const info = await getConfigInfo(configPath);
        configs.push(info);
        
        // Get context to check projects
        const context = await Context.create({ startingDir: dirname(configPath) });
        const projects = context.getAllProjects().filter(p => p.active !== false);
        
        for (const project of projects) {
            // Check if the audio file's path matches any project's destination
            const destination = project.routing?.destination;
            if (destination) {
                const expandedDest = destination.startsWith('~') 
                    ? destination.replace('~', process.env.HOME || '')
                    : destination;
                
                if (audioDir.includes(expandedDest) || expandedDest.includes(audioDir)) {
                    allSuggestions.push({
                        projectId: project.id,
                        projectName: project.name,
                        confidence: 0.9,
                        reason: `Audio file is in or near project destination: ${destination}`,
                        destination,
                    });
                }
            }
            
            // Check if project has associated directories/paths
            if (project.classification?.explicit_phrases) {
                // Check if any phrases match the directory name
                const dirName = audioDir.split('/').pop() || '';
                for (const phrase of project.classification.explicit_phrases) {
                    if (dirName.toLowerCase().includes(phrase.toLowerCase())) {
                        allSuggestions.push({
                            projectId: project.id,
                            projectName: project.name,
                            confidence: 0.7,
                            reason: `Directory name matches project phrase: "${phrase}"`,
                            destination: project.routing?.destination,
                        });
                    }
                }
            }
        }
    }
    
    // Deduplicate and sort suggestions by confidence
    const uniqueSuggestions = allSuggestions
        .filter((s, i, arr) => arr.findIndex(x => x.projectId === s.projectId) === i)
        .sort((a, b) => b.confidence - a.confidence);
    
    if (uniqueSuggestions.length === 0) {
        return {
            configs,
            suggestions: [],
            needsUserInput: configs[0].projectCount > 0,
            message: configs[0].projectCount > 0
                ? `Found ${configs[0].projectCount} projects but couldn't automatically determine which one this file belongs to. ` +
                  'Please specify the project or let me list them for you.'
                : 'Configuration found but no projects defined. Transcripts will use default routing.',
        };
    }
    
    if (uniqueSuggestions.length === 1 && uniqueSuggestions[0].confidence >= 0.8) {
        return {
            configs,
            suggestions: uniqueSuggestions,
            needsUserInput: false,
            message: `Detected project: ${uniqueSuggestions[0].projectName} (${uniqueSuggestions[0].reason})`,
        };
    }
    
    return {
        configs,
        suggestions: uniqueSuggestions,
        needsUserInput: true,
        message: `Found ${uniqueSuggestions.length} possible projects. Please confirm which project this file belongs to.`,
    };
}

// ============================================================================
// Tool Definitions
// ============================================================================

const tools: Tool[] = [
    // ========================================
    // Discovery & Configuration Tools
    // ========================================
    {
        name: 'protokoll_discover_config',
        description:
            'Discover Protokoll configurations for a given file or directory. ' +
            'Walks up the directory tree to find .protokoll directories and returns information about each, ' +
            'including project counts, people, terms, and output settings. ' +
            'ALWAYS call this first when asked to transcribe a file to understand the available context. ' +
            'This helps determine which project configuration to use.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to a file or directory to search from (searches up the tree)',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'protokoll_suggest_project',
        description:
            'Suggest which project(s) an audio file might belong to based on its location. ' +
            'Analyzes the file path against configured projects to determine the best match. ' +
            'Returns suggestions with confidence levels and reasons. ' +
            'If multiple projects match or no clear match is found, the response indicates that user input is needed.',
        inputSchema: {
            type: 'object',
            properties: {
                audioFile: {
                    type: 'string',
                    description: 'Path to the audio file to analyze',
                },
            },
            required: ['audioFile'],
        },
    },

    // ========================================
    // Transcription Tools
    // ========================================
    {
        name: 'protokoll_process_audio',
        description:
            'Process an audio file through Protokoll\'s intelligent transcription pipeline. ' +
            'IMPORTANT: Before calling this, use protokoll_discover_config or protokoll_suggest_project ' +
            'to understand which configuration/project should be used. ' +
            'This tool transcribes audio using Whisper, then enhances it with context-aware processing ' +
            'that corrects names, terms, and routes the output to the appropriate project folder. ' +
            'If no contextDirectory is specified, the tool walks up from the audio file to find .protokoll. ' +
            'Returns the enhanced transcript text and output file path.',
        inputSchema: {
            type: 'object',
            properties: {
                audioFile: {
                    type: 'string',
                    description: 'Absolute path to the audio file to process (m4a, mp3, wav, webm, etc.)',
                },
                contextDirectory: {
                    type: 'string',
                    description: 'Path to the .protokoll context directory. If not specified, walks up from the audio file location to find one.',
                },
                projectId: {
                    type: 'string',
                    description: 'Specific project ID to use for routing (helpful when multiple projects exist)',
                },
                outputDirectory: {
                    type: 'string',
                    description: 'Override the default output directory',
                },
                model: {
                    type: 'string',
                    description: 'LLM model for enhancement (default: gpt-5.2)',
                },
                transcriptionModel: {
                    type: 'string',
                    description: 'Transcription model (default: whisper-1)',
                },
            },
            required: ['audioFile'],
        },
    },
    {
        name: 'protokoll_batch_process',
        description:
            'Process multiple audio files in a directory. ' +
            'Finds all audio files matching the configured extensions and processes them sequentially. ' +
            'Returns a summary of all processed files with their output paths.',
        inputSchema: {
            type: 'object',
            properties: {
                inputDirectory: {
                    type: 'string',
                    description: 'Absolute path to directory containing audio files',
                },
                extensions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Audio file extensions to process (default: [".m4a", ".mp3", ".wav", ".webm"])',
                },
                contextDirectory: {
                    type: 'string',
                    description: 'Path to the .protokoll context directory',
                },
                outputDirectory: {
                    type: 'string',
                    description: 'Override the default output directory',
                },
            },
            required: ['inputDirectory'],
        },
    },

    // ========================================
    // Context Management Tools
    // ========================================
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
        name: 'protokoll_add_term',
        description:
            'Add a new technical term or abbreviation to the context. ' +
            'Terms help Protokoll correctly transcribe domain-specific vocabulary. ' +
            'Include sounds_like variants for phonetic matching.',
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
                    description: 'Domain or field (e.g., engineering, finance)',
                },
                sounds_like: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Phonetic variants (how Whisper might mishear the term)',
                },
                projects: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Associated project IDs',
                },
                contextDirectory: {
                    type: 'string',
                    description: 'Path to the .protokoll context directory',
                },
            },
            required: ['term'],
        },
    },
    {
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
    },
    {
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
    },

    // ========================================
    // Transcript Action Tools
    // ========================================
    {
        name: 'protokoll_edit_transcript',
        description:
            'Edit an existing transcript\'s title and/or project assignment. ' +
            'Changing the project will update metadata and may move the file to a new location ' +
            'based on the project\'s routing configuration.',
        inputSchema: {
            type: 'object',
            properties: {
                transcriptPath: {
                    type: 'string',
                    description: 'Absolute path to the transcript file',
                },
                title: {
                    type: 'string',
                    description: 'New title for the transcript',
                },
                projectId: {
                    type: 'string',
                    description: 'New project ID to assign',
                },
                contextDirectory: {
                    type: 'string',
                    description: 'Path to the .protokoll context directory',
                },
            },
            required: ['transcriptPath'],
        },
    },
    {
        name: 'protokoll_combine_transcripts',
        description:
            'Combine multiple transcripts into a single document. ' +
            'Source files are automatically deleted after combining. ' +
            'Metadata from the first transcript is preserved, and content is organized into sections.',
        inputSchema: {
            type: 'object',
            properties: {
                transcriptPaths: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of transcript file paths to combine',
                },
                title: {
                    type: 'string',
                    description: 'Title for the combined transcript',
                },
                projectId: {
                    type: 'string',
                    description: 'Project ID to assign to the combined transcript',
                },
                contextDirectory: {
                    type: 'string',
                    description: 'Path to the .protokoll context directory',
                },
            },
            required: ['transcriptPaths'],
        },
    },
    {
        name: 'protokoll_read_transcript',
        description:
            'Read a transcript file and parse its metadata and content. ' +
            'Returns structured data including title, metadata, routing info, and content.',
        inputSchema: {
            type: 'object',
            properties: {
                transcriptPath: {
                    type: 'string',
                    description: 'Absolute path to the transcript file',
                },
            },
            required: ['transcriptPath'],
        },
    },
    {
        name: 'protokoll_provide_feedback',
        description:
            'Provide natural language feedback to correct a transcript. ' +
            'The feedback is processed by an agentic model that can: ' +
            '- Fix spelling and term errors ' +
            '- Add new terms, people, or companies to context ' +
            '- Change project assignment ' +
            '- Update the title ' +
            'Example: "YB should be Wibey" or "San Jay Grouper is actually Sanjay Gupta"',
        inputSchema: {
            type: 'object',
            properties: {
                transcriptPath: {
                    type: 'string',
                    description: 'Absolute path to the transcript file',
                },
                feedback: {
                    type: 'string',
                    description: 'Natural language feedback describing corrections needed',
                },
                model: {
                    type: 'string',
                    description: 'LLM model for processing feedback (default: gpt-5.2)',
                },
                contextDirectory: {
                    type: 'string',
                    description: 'Path to the .protokoll context directory',
                },
            },
            required: ['transcriptPath', 'feedback'],
        },
    },
];

// ============================================================================
// Helper Functions
// ============================================================================

const slugify = (text: string): string => {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/--+/g, '-')
        .replace(/^-|-$/g, '');
};

const formatEntity = (entity: Entity): Record<string, unknown> => {
    const result: Record<string, unknown> = {
        id: entity.id,
        name: entity.name,
        type: entity.type,
    };

    if (entity.type === 'person') {
        const person = entity as Person;
        if (person.firstName) result.firstName = person.firstName;
        if (person.lastName) result.lastName = person.lastName;
        if (person.company) result.company = person.company;
        if (person.role) result.role = person.role;
        if (person.sounds_like) result.sounds_like = person.sounds_like;
        if (person.context) result.context = person.context;
    } else if (entity.type === 'project') {
        const project = entity as Project;
        if (project.description) result.description = project.description;
        if (project.classification) result.classification = project.classification;
        if (project.routing) result.routing = project.routing;
        if (project.sounds_like) result.sounds_like = project.sounds_like;
        result.active = project.active !== false;
    } else if (entity.type === 'term') {
        const term = entity as Term;
        if (term.expansion) result.expansion = term.expansion;
        if (term.domain) result.domain = term.domain;
        if (term.sounds_like) result.sounds_like = term.sounds_like;
        if (term.projects) result.projects = term.projects;
    } else if (entity.type === 'company') {
        const company = entity as Company;
        if (company.fullName) result.fullName = company.fullName;
        if (company.industry) result.industry = company.industry;
        if (company.sounds_like) result.sounds_like = company.sounds_like;
    } else if (entity.type === 'ignored') {
        const ignored = entity as IgnoredTerm;
        if (ignored.reason) result.reason = ignored.reason;
        if (ignored.ignoredAt) result.ignoredAt = ignored.ignoredAt;
    }

    return result;
};

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleDiscoverConfig(args: { path: string }) {
    const searchPath = resolve(args.path);
    
    // Check if path exists
    if (!await fileExists(searchPath)) {
        throw new Error(`Path not found: ${searchPath}`);
    }
    
    // Determine if it's a file or directory
    const pathStat = await stat(searchPath);
    const startDir = pathStat.isDirectory() ? searchPath : dirname(searchPath);
    
    // Find all .protokoll configs
    const configPaths = await findProtokolkConfigs(startDir);
    
    if (configPaths.length === 0) {
        return {
            found: false,
            searchedFrom: startDir,
            configs: [],
            message: 'No .protokoll configuration found in the directory hierarchy. ' +
                'To use Protokoll, create a .protokoll directory with your context files (people, projects, terms).',
            suggestion: 'Run "protokoll --init-config" in your project directory to create initial configuration.',
        };
    }
    
    // Get info about each config
    const configs: DiscoveredConfig[] = [];
    for (const configPath of configPaths) {
        const info = await getConfigInfo(configPath);
        configs.push(info);
    }
    
    // Primary config is the one closest to the search path
    const primaryConfig = configs[0];
    
    return {
        found: true,
        searchedFrom: startDir,
        primaryConfig: primaryConfig.path,
        configs,
        summary: {
            totalProjects: configs.reduce((sum, c) => sum + c.projectCount, 0),
            totalPeople: configs.reduce((sum, c) => sum + c.peopleCount, 0),
            totalTerms: configs.reduce((sum, c) => sum + c.termsCount, 0),
            totalCompanies: configs.reduce((sum, c) => sum + c.companiesCount, 0),
        },
        message: configs.length === 1
            ? `Found Protokoll configuration at ${primaryConfig.path}`
            : `Found ${configs.length} Protokoll configurations (using nearest: ${primaryConfig.path})`,
    };
}

async function handleSuggestProject(args: { audioFile: string }) {
    const audioFile = resolve(args.audioFile);
    
    if (!await fileExists(audioFile)) {
        throw new Error(`Audio file not found: ${audioFile}`);
    }
    
    const result = await suggestProjectsForFile(audioFile);
    
    return {
        audioFile,
        ...result,
        instructions: result.needsUserInput
            ? 'Please specify which project this file belongs to, or let me list available projects.'
            : 'Ready to process with the detected project configuration.',
    };
}

async function handleProcessAudio(args: {
    audioFile: string;
    contextDirectory?: string;
    projectId?: string;
    outputDirectory?: string;
    model?: string;
    transcriptionModel?: string;
}): Promise<ProcessingResult> {
    const audioFile = resolve(args.audioFile);

    if (!await fileExists(audioFile)) {
        throw new Error(`Audio file not found: ${audioFile}`);
    }

    // Initialize context
    const context = await Context.create({
        startingDir: args.contextDirectory || dirname(audioFile),
    });

    // Get configuration from context
    const config = context.getConfig();
    const outputDirectory = args.outputDirectory || (config.outputDirectory as string) || DEFAULT_OUTPUT_DIRECTORY;
    const outputStructure = (config.outputStructure as string) || DEFAULT_OUTPUT_STRUCTURE;
    const outputFilenameOptions = (config.outputFilenameOptions as string[]) || DEFAULT_OUTPUT_FILENAME_OPTIONS;

    // Get audio file metadata (creation time and hash)
    const { creationTime, hash } = await getAudioMetadata(audioFile);

    // Create pipeline
    const pipeline = await Pipeline.create({
        model: args.model || DEFAULT_MODEL,
        transcriptionModel: args.transcriptionModel || DEFAULT_TRANSCRIPTION_MODEL,
        reasoningLevel: DEFAULT_REASONING_LEVEL,
        interactive: false, // MCP is non-interactive
        selfReflection: false,
        silent: true,
        debug: false,
        dryRun: false,
        contextDirectory: args.contextDirectory,
        intermediateDir: DEFAULT_INTERMEDIATE_DIRECTORY,
        keepIntermediates: false,
        outputDirectory,
        outputStructure,
        outputFilenameOptions,
        maxAudioSize: DEFAULT_MAX_AUDIO_SIZE,
        tempDirectory: DEFAULT_TEMP_DIRECTORY,
    });

    // Process through pipeline
    const result = await pipeline.process({
        audioFile,
        creation: creationTime,
        hash,
    });

    return {
        outputPath: result.outputPath,
        enhancedText: result.enhancedText,
        rawTranscript: result.rawTranscript,
        routedProject: result.routedProject ?? undefined,
        routingConfidence: result.routingConfidence,
        processingTime: result.processingTime,
        toolsUsed: result.toolsUsed,
        correctionsApplied: result.correctionsApplied,
    };
}

async function handleBatchProcess(args: {
    inputDirectory: string;
    extensions?: string[];
    contextDirectory?: string;
    outputDirectory?: string;
}): Promise<{ processed: ProcessingResult[]; errors: { file: string; error: string }[] }> {
    const inputDir = resolve(args.inputDirectory);
    const extensions = args.extensions || ['.m4a', '.mp3', '.wav', '.webm'];

    if (!await fileExists(inputDir)) {
        throw new Error(`Input directory not found: ${inputDir}`);
    }

    const patterns = extensions.map(ext => `**/*${ext}`);
    const files = await glob(patterns, { cwd: inputDir, nodir: true, absolute: true });

    if (files.length === 0) {
        return { processed: [], errors: [] };
    }

    const processed: ProcessingResult[] = [];
    const errors: { file: string; error: string }[] = [];

    for (const file of files) {
        try {
            const result = await handleProcessAudio({
                audioFile: file,
                contextDirectory: args.contextDirectory,
                outputDirectory: args.outputDirectory,
            });
            processed.push(result);
        } catch (error) {
            errors.push({
                file,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return { processed, errors };
}

async function handleContextStatus(args: { contextDirectory?: string }) {
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

async function handleListProjects(args: { contextDirectory?: string; includeInactive?: boolean }) {
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

async function handleListPeople(args: { contextDirectory?: string }) {
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

async function handleListTerms(args: { contextDirectory?: string }) {
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

async function handleListCompanies(args: { contextDirectory?: string }) {
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

async function handleSearchContext(args: { query: string; contextDirectory?: string }) {
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

async function handleGetEntity(args: { entityType: EntityType; entityId: string; contextDirectory?: string }) {
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

async function handleAddPerson(args: {
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

async function handleAddProject(args: {
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

    let soundsLike = args.sounds_like || [];
    let triggerPhrases = args.explicit_phrases || [];
    let topics = args.topics || [];
    let description = args.description;
    let suggestedName: string | undefined;

    if (useSmartAssist) {
        const assist = ProjectAssist.create(smartConfig);
        const fetcher = ContentFetcher.create();

        // Fetch and analyze content if source provided
        if (args.source) {
            const fetchResult = await fetcher.fetch(args.source);

            if (fetchResult.success && fetchResult.content) {
                const suggestions = await assist.analyzeContent(fetchResult.content, args.name);

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
        ...(suggestedName && { suggestedName }),
        generated: {
            soundsLike,
            triggerPhrases,
            topics,
            description,
        },
    };
}

async function handleAddTerm(args: {
    term: string;
    id?: string;
    expansion?: string;
    domain?: string;
    sounds_like?: string[];
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
        ...(args.sounds_like && { sounds_like: args.sounds_like }),
        ...(args.projects && { projects: args.projects }),
    };

    await context.saveEntity(term);

    return {
        success: true,
        message: `Term "${args.term}" added successfully`,
        entity: formatEntity(term),
    };
}

async function handleAddCompany(args: {
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

async function handleDeleteEntity(args: { entityType: EntityType; entityId: string; contextDirectory?: string }) {
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

    const deleted = await context.deleteEntity(entity);

    if (!deleted) {
        throw new Error(`Failed to delete ${args.entityType} "${args.entityId}"`);
    }

    return {
        success: true,
        message: `${args.entityType} "${args.entityId}" deleted successfully`,
    };
}

async function handleEditTranscript(args: {
    transcriptPath: string;
    title?: string;
    projectId?: string;
    contextDirectory?: string;
}) {
    const transcriptPath = resolve(args.transcriptPath);

    if (!await fileExists(transcriptPath)) {
        throw new Error(`Transcript not found: ${transcriptPath}`);
    }

    if (!args.title && !args.projectId) {
        throw new Error('Must specify title and/or projectId');
    }

    const result = await editTranscript(transcriptPath, {
        title: args.title,
        projectId: args.projectId,
    });

    // Write the updated content
    await mkdir(dirname(result.outputPath), { recursive: true });
    await writeFile(result.outputPath, result.content, 'utf-8');

    // Delete original if path changed
    if (result.outputPath !== transcriptPath) {
        await unlink(transcriptPath);
    }

    return {
        success: true,
        originalPath: transcriptPath,
        outputPath: result.outputPath,
        renamed: result.outputPath !== transcriptPath,
        message: result.outputPath !== transcriptPath
            ? `Transcript updated and moved to: ${result.outputPath}`
            : 'Transcript updated',
    };
}

async function handleCombineTranscripts(args: {
    transcriptPaths: string[];
    title?: string;
    projectId?: string;
    contextDirectory?: string;
}) {
    if (args.transcriptPaths.length < 2) {
        throw new Error('At least 2 transcript files are required');
    }

    // Validate all files exist
    for (const path of args.transcriptPaths) {
        const resolved = resolve(path);
        if (!await fileExists(resolved)) {
            throw new Error(`Transcript not found: ${resolved}`);
        }
    }

    const resolvedPaths = args.transcriptPaths.map(p => resolve(p));

    const result = await combineTranscripts(resolvedPaths, {
        title: args.title,
        projectId: args.projectId,
    });

    // Write the combined transcript
    await mkdir(dirname(result.outputPath), { recursive: true });
    await writeFile(result.outputPath, result.content, 'utf-8');

    // Delete source files
    const deletedFiles: string[] = [];
    for (const path of resolvedPaths) {
        try {
            await unlink(path);
            deletedFiles.push(path);
        } catch {
            // Ignore deletion errors
        }
    }

    return {
        success: true,
        outputPath: result.outputPath,
        sourceFiles: resolvedPaths,
        deletedFiles,
        message: `Combined ${resolvedPaths.length} transcripts into: ${result.outputPath}`,
    };
}

async function handleReadTranscript(args: { transcriptPath: string }) {
    const transcriptPath = resolve(args.transcriptPath);

    if (!await fileExists(transcriptPath)) {
        throw new Error(`Transcript not found: ${transcriptPath}`);
    }

    const parsed = await parseTranscript(transcriptPath);

    return {
        filePath: transcriptPath,
        title: parsed.title,
        metadata: parsed.metadata,
        content: parsed.content,
        contentLength: parsed.content.length,
    };
}

async function handleProvideFeedback(args: {
    transcriptPath: string;
    feedback: string;
    model?: string;
    contextDirectory?: string;
}) {
    const transcriptPath = resolve(args.transcriptPath);

    if (!await fileExists(transcriptPath)) {
        throw new Error(`Transcript not found: ${transcriptPath}`);
    }

    const transcriptContent = await readFile(transcriptPath, 'utf-8');
    const context = await Context.create({
        startingDir: args.contextDirectory || dirname(transcriptPath),
    });
    const reasoning = Reasoning.create({ model: args.model || DEFAULT_MODEL });

    const feedbackCtx: FeedbackContext = {
        transcriptPath,
        transcriptContent,
        originalContent: transcriptContent,
        context,
        changes: [],
        verbose: false,
        dryRun: false,
    };

    await processFeedback(args.feedback, feedbackCtx, reasoning);

    let result: { newPath: string; moved: boolean } | null = null;
    if (feedbackCtx.changes.length > 0) {
        result = await applyChanges(feedbackCtx);
    }

    return {
        success: true,
        changesApplied: feedbackCtx.changes.length,
        changes: feedbackCtx.changes.map(c => ({
            type: c.type,
            description: c.description,
        })),
        outputPath: result?.newPath || transcriptPath,
        moved: result?.moved || false,
    };
}

async function handleSuggestProjectMetadata(args: {
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
    const fetcher = ContentFetcher.create();

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
        const fetchResult = await fetcher.fetch(args.source);

        if (fetchResult.success && fetchResult.content) {
            const suggestions = await assist.analyzeContent(fetchResult.content, args.name);

            if (!args.name && suggestions.name) {
                result.suggestedName = suggestions.name;
                result.soundsLike = suggestions.soundsLike;
                result.triggerPhrases = suggestions.triggerPhrases;
            }
            result.topics = suggestions.topics;
            result.description = suggestions.description;
        } else {
            throw new Error(`Could not fetch content: ${fetchResult.error}`);
        }
    }

    return {
        success: true,
        data: result,
    };
}

// ============================================================================
// Server Setup
// ============================================================================

async function main() {
    const server = new Server(
        {
            name: 'protokoll',
            version: '0.0.1',
            description:
                'Intelligent audio transcription with context-aware enhancement. ' +
                'Process audio files through a pipeline that transcribes with Whisper, ' +
                'then enhances using LLMs with knowledge of your people, projects, and terminology. ' +
                'Manage context entities (people, projects, terms) to improve recognition. ' +
                'Edit and combine existing transcripts.',
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools,
    }));

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            let result: unknown;

            switch (name) {
                // Discovery & Configuration
                case 'protokoll_discover_config':
                    result = await handleDiscoverConfig(args as Parameters<typeof handleDiscoverConfig>[0]);
                    break;
                case 'protokoll_suggest_project':
                    result = await handleSuggestProject(args as Parameters<typeof handleSuggestProject>[0]);
                    break;

                // Transcription
                case 'protokoll_process_audio':
                    result = await handleProcessAudio(args as Parameters<typeof handleProcessAudio>[0]);
                    break;
                case 'protokoll_batch_process':
                    result = await handleBatchProcess(args as Parameters<typeof handleBatchProcess>[0]);
                    break;

                // Context Status
                case 'protokoll_context_status':
                    result = await handleContextStatus(args as Parameters<typeof handleContextStatus>[0]);
                    break;

                // Context Listing
                case 'protokoll_list_projects':
                    result = await handleListProjects(args as Parameters<typeof handleListProjects>[0]);
                    break;
                case 'protokoll_list_people':
                    result = await handleListPeople(args as Parameters<typeof handleListPeople>[0]);
                    break;
                case 'protokoll_list_terms':
                    result = await handleListTerms(args as Parameters<typeof handleListTerms>[0]);
                    break;
                case 'protokoll_list_companies':
                    result = await handleListCompanies(args as Parameters<typeof handleListCompanies>[0]);
                    break;
                case 'protokoll_search_context':
                    result = await handleSearchContext(args as Parameters<typeof handleSearchContext>[0]);
                    break;
                case 'protokoll_get_entity':
                    result = await handleGetEntity(args as Parameters<typeof handleGetEntity>[0]);
                    break;

                // Context Modification
                case 'protokoll_add_person':
                    result = await handleAddPerson(args as Parameters<typeof handleAddPerson>[0]);
                    break;
                case 'protokoll_add_project':
                    result = await handleAddProject(args as Parameters<typeof handleAddProject>[0]);
                    break;
                case 'protokoll_add_term':
                    result = await handleAddTerm(args as Parameters<typeof handleAddTerm>[0]);
                    break;
                case 'protokoll_add_company':
                    result = await handleAddCompany(args as Parameters<typeof handleAddCompany>[0]);
                    break;
                case 'protokoll_delete_entity':
                    result = await handleDeleteEntity(args as Parameters<typeof handleDeleteEntity>[0]);
                    break;
                case 'protokoll_suggest_project_metadata':
                    result = await handleSuggestProjectMetadata(args as Parameters<typeof handleSuggestProjectMetadata>[0]);
                    break;

                // Transcript Actions
                case 'protokoll_edit_transcript':
                    result = await handleEditTranscript(args as Parameters<typeof handleEditTranscript>[0]);
                    break;
                case 'protokoll_combine_transcripts':
                    result = await handleCombineTranscripts(args as Parameters<typeof handleCombineTranscripts>[0]);
                    break;
                case 'protokoll_read_transcript':
                    result = await handleReadTranscript(args as Parameters<typeof handleReadTranscript>[0]);
                    break;
                case 'protokoll_provide_feedback':
                    result = await handleProvideFeedback(args as Parameters<typeof handleProvideFeedback>[0]);
                    break;

                default:
                    return {
                        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                        isError: true,
                    };
            }

            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Error: ${message}` }],
                isError: true,
            };
        }
    });

    // Start server
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

// Only run main when this is the entry point, not when imported for testing
if (require.main === module) {
    main().catch((error) => {
        // eslint-disable-next-line no-console
        console.error(error);
        process.exit(1);
    });
}

// ============================================================================
// Exports for Testing
// ============================================================================

export {
    // Types
    type ProcessingResult,
    type DiscoveredConfig,
    type ProjectSuggestion,
    
    // Utility Functions
    fileExists,
    getAudioMetadata,
    
    // Configuration Discovery
    findProtokolkConfigs,
    getConfigInfo,
    suggestProjectsForFile,
    
    // Tool Handlers
    handleDiscoverConfig,
    handleSuggestProject,
    handleProcessAudio,
    handleBatchProcess,
    handleContextStatus,
    handleListProjects,
    handleListPeople,
    handleListTerms,
    handleListCompanies,
    handleSearchContext,
    handleGetEntity,
    handleAddPerson,
    handleAddProject,
    handleAddTerm,
    handleAddCompany,
    handleDeleteEntity,
    handleReadTranscript,
    handleEditTranscript,
    handleCombineTranscripts,
    handleProvideFeedback,
    
    // Tool definitions
    tools,
    
    // Main function for integration testing
    main,
};
