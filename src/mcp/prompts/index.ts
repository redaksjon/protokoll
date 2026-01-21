/**
 * MCP Prompt Handlers
 *
 * Provides workflow templates via MCP prompts.
 * Prompts are loaded from external markdown files in this directory.
 */

// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { McpPrompt, McpPromptMessage } from '../types';
import * as Context from '@/context';
import { buildConfigUri, buildEntitiesListUri } from '../uri';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Helper to resolve the prompts directory path
 */
function getPromptsDir(): string {
    const isBundled = __dirname.includes('/dist') || __dirname.endsWith('dist') ||
                      __filename.includes('dist/mcp-server.js') || __filename.includes('dist\\mcp-server.js');

    if (isBundled) {
        const promptsDir = resolve(__dirname, 'mcp/prompts');
        return promptsDir;
    }
    return __dirname;
}

/**
 * Helper to load a prompt template from a markdown file
 */
function loadTemplate(name: string): string {
    const promptsDir = getPromptsDir();
    const path = resolve(promptsDir, `${name}.md`);
    try {
        return readFileSync(path, 'utf-8').trim();
    } catch (error) {
        throw new Error(`Failed to load prompt template "${name}" from ${path}: ${error}`);
    }
}

/**
 * Helper to replace placeholders in a template
 */
function fillTemplate(template: string, args: Record<string, string>): string {
    return template.replace(/\${(\w+)}/g, (_, key) => {
        return args[key] || '';
    });
}

/**
 * Get all available prompts
 */
export function getPrompts(): McpPrompt[] {
    return [
        {
            name: 'transcribe_with_context',
            description: 'Intelligently transcribe audio with context discovery and project routing. ' +
                'Guides you through finding the right configuration and confirms before processing.',
            arguments: [
                {
                    name: 'audioFile',
                    description: 'Absolute path to the audio file to transcribe',
                    required: true,
                },
                {
                    name: 'skipDiscovery',
                    description: 'Skip context discovery if you already know the configuration',
                    required: false,
                },
            ],
        },
        {
            name: 'setup_project',
            description: 'Create a new project with smart assistance for generating metadata. ' +
                'Analyzes source content to suggest sounds_like, trigger phrases, topics, and description.',
            arguments: [
                {
                    name: 'projectName',
                    description: 'Name of the project to create',
                    required: true,
                },
                {
                    name: 'sourceUrl',
                    description: 'URL or file path to analyze for metadata suggestions',
                    required: false,
                },
                {
                    name: 'destination',
                    description: 'Output directory for transcripts',
                    required: false,
                },
            ],
        },
        {
            name: 'review_transcript',
            description: 'Analyze a transcript and suggest corrections based on context. ' +
                'Identifies potential name/term errors and offers to apply fixes.',
            arguments: [
                {
                    name: 'transcriptPath',
                    description: 'Path to the transcript to review',
                    required: true,
                },
                {
                    name: 'focusArea',
                    description: 'What to focus on: names, terms, technical, or all',
                    required: false,
                },
            ],
        },
        {
            name: 'enrich_entity',
            description: 'Add or update an entity with smart assistance for generating metadata.',
            arguments: [
                {
                    name: 'entityType',
                    description: 'Type: person, project, term, or company',
                    required: true,
                },
                {
                    name: 'entityName',
                    description: 'Name of the entity',
                    required: true,
                },
                {
                    name: 'sourceUrl',
                    description: 'URL or file path to analyze for metadata',
                    required: false,
                },
            ],
        },
        {
            name: 'batch_transcription',
            description: 'Set up and execute batch transcription for a directory of audio files.',
            arguments: [
                {
                    name: 'directory',
                    description: 'Directory containing audio files',
                    required: true,
                },
                {
                    name: 'extensions',
                    description: 'Comma-separated file extensions (default: m4a,mp3,wav,webm)',
                    required: false,
                },
            ],
        },
        {
            name: 'find_and_analyze',
            description: 'Search for transcripts and analyze their content.',
            arguments: [
                {
                    name: 'directory',
                    description: 'Directory to search',
                    required: true,
                },
                {
                    name: 'query',
                    description: 'Search query',
                    required: false,
                },
                {
                    name: 'startDate',
                    description: 'Filter from date (YYYY-MM-DD)',
                    required: false,
                },
                {
                    name: 'endDate',
                    description: 'Filter to date (YYYY-MM-DD)',
                    required: false,
                },
            ],
        },
        {
            name: 'edit_entity',
            description: 'Edit an existing entity (person, term, or project) with manual modifications. ' +
                'Unlike update tools that regenerate from sources, this allows direct edits like ' +
                'adding specific sounds_like variants, changing fields, or modifying array properties.',
            arguments: [
                {
                    name: 'entityType',
                    description: 'Type of entity to edit: person, term, or project',
                    required: true,
                },
                {
                    name: 'entityId',
                    description: 'ID of the entity to edit',
                    required: true,
                },
                {
                    name: 'modification',
                    description: 'What to modify (e.g., "add sounds_like variant", "change domain", "add topics")',
                    required: false,
                },
            ],
        },
    ];
}

/**
 * Get a prompt by name
 */
export async function getPrompt(
    name: string,
    args: Record<string, string>
): Promise<McpPromptMessage[]> {
    // Validate prompt exists
    const prompts = getPrompts();
    const prompt = prompts.find(p => p.name === name);

    if (!prompt) {
        throw new Error(`Unknown prompt: ${name}`);
    }

    // Validate required arguments
    for (const arg of prompt.arguments || []) {
        if (arg.required && !args[arg.name]) {
            throw new Error(`Missing required argument: ${arg.name}`);
        }
    }

    // Generate messages based on prompt type
    switch (name) {
        case 'transcribe_with_context':
            return generateTranscribePrompt(args);
        case 'setup_project':
            return generateSetupProjectPrompt(args);
        case 'review_transcript':
            return generateReviewTranscriptPrompt(args);
        case 'enrich_entity':
            return generateEnrichEntityPrompt(args);
        case 'batch_transcription':
            return generateBatchTranscriptionPrompt(args);
        case 'find_and_analyze':
            return generateFindAndAnalyzePrompt(args);
        case 'edit_entity':
            return generateEditEntityPrompt(args);
        default:
            throw new Error(`Prompt handler not implemented: ${name}`);
    }
}

// ============================================================================
// Prompt Generators
// ============================================================================

async function generateTranscribePrompt(
    args: Record<string, string>
): Promise<McpPromptMessage[]> {
    const audioFile = args.audioFile;
    const skipDiscovery = args.skipDiscovery === 'true';

    if (!audioFile) {
        throw new Error('audioFile is required');
    }

    let discoverySection = '';

    if (skipDiscovery) {
        discoverySection = `I'll transcribe ${audioFile} using the current context configuration.\n\nWould you like me to start the transcription?`;
    } else {
        // Perform basic context discovery
        const audioPath = resolve(audioFile);

        try {
            await stat(audioPath);

            const context = await Context.create({
                startingDir: dirname(audioPath),
            });

            if (context.hasContext()) {
                const dirs = context.getDiscoveredDirs();
                const projects = context.getAllProjects().filter(p => p.active !== false);

                discoverySection = `## Context Discovery\n\n` +
                    `**Configuration:** ${dirs[0]?.path}\n` +
                    `**Projects:** ${projects.length} active\n` +
                    `**Context URI:** ${buildConfigUri(dirs[0]?.path)}\n` +
                    `**Projects URI:** ${buildEntitiesListUri('project')}\n\n` +
                    `Ready to transcribe with context-aware enhancement.`;
            } else {
                discoverySection = `## No Context Found\n\nProcessing without context (basic transcription only).`;
            }
        } catch {
            discoverySection = `## File Check Failed\n\nUnable to access: ${audioFile}`;
        }
    }

    const template = loadTemplate('transcribe_with_context');
    const content = fillTemplate(template, { audioFile, discoverySection });

    return [
        {
            role: 'user',
            content: {
                type: 'text',
                text: content,
            },
        },
    ];
}

async function generateSetupProjectPrompt(
    args: Record<string, string>
): Promise<McpPromptMessage[]> {
    const projectName = args.projectName;

    if (!projectName) {
        throw new Error('projectName is required');
    }

    const sourceUrlLine = args.sourceUrl
        ? `\n   - sourceUrl: "${args.sourceUrl}" (for metadata analysis)`
        : '';
    const destinationLine = args.destination
        ? `\n   - destination: "${args.destination}"`
        : '';

    const template = loadTemplate('setup_project');
    const content = fillTemplate(template, {
        projectName,
        sourceUrlLine,
        destinationLine
    });

    return [
        {
            role: 'user',
            content: {
                type: 'text',
                text: content,
            },
        },
    ];
}

async function generateReviewTranscriptPrompt(
    args: Record<string, string>
): Promise<McpPromptMessage[]> {
    const transcriptPath = args.transcriptPath;

    if (!transcriptPath) {
        throw new Error('transcriptPath is required');
    }

    const focusArea = args.focusArea || 'all';
    const focusText = focusArea === 'all' ? 'All corrections' : focusArea;

    const template = loadTemplate('review_transcript');
    const content = fillTemplate(template, {
        transcriptPath,
        focusArea: focusText
    });

    return [
        {
            role: 'user',
            content: {
                type: 'text',
                text: content,
            },
        },
    ];
}

async function generateEnrichEntityPrompt(
    args: Record<string, string>
): Promise<McpPromptMessage[]> {
    const template = loadTemplate('enrich_entity');
    const content = fillTemplate(template, args);

    return [
        {
            role: 'user',
            content: {
                type: 'text',
                text: content,
            },
        },
    ];
}

async function generateBatchTranscriptionPrompt(
    args: Record<string, string>
): Promise<McpPromptMessage[]> {
    const template = loadTemplate('batch_transcription');
    const content = fillTemplate(template, args);

    return [
        {
            role: 'user',
            content: {
                type: 'text',
                text: content,
            },
        },
    ];
}

async function generateFindAndAnalyzePrompt(
    args: Record<string, string>
): Promise<McpPromptMessage[]> {
    const template = loadTemplate('find_and_analyze');
    const content = fillTemplate(template, args);

    return [
        {
            role: 'user',
            content: {
                type: 'text',
                text: content,
            },
        },
    ];
}

async function generateEditEntityPrompt(
    args: Record<string, string>
): Promise<McpPromptMessage[]> {
    const entityType = args.entityType;
    const entityId = args.entityId;
    const modification = args.modification || '';

    if (!entityType || !entityId) {
        throw new Error('entityType and entityId are required');
    }

    const userMessage = modification
        ? `I want to edit the ${entityType} "${entityId}": ${modification}`
        : `I want to edit the ${entityType} "${entityId}"`;

    let entityGuidance = '';

    // Provide guidance based on entity type
    if (entityType === 'person') {
        entityGuidance = `**Available modifications for people:**\n` +
            `- \`name\`, \`firstName\`, \`lastName\` - Update name fields\n` +
            `- \`company\`, \`role\`, \`context\` - Update association info\n` +
            `- \`sounds_like\` - Replace all phonetic variants\n` +
            `- \`add_sounds_like\` - Add new phonetic variants\n` +
            `- \`remove_sounds_like\` - Remove specific variants\n\n` +
            `**To proceed:**\n` +
            `1. First, call \`protokoll_get_entity\` to see current values:\n` +
            `   - entityType: "person"\n` +
            `   - entityId: "${entityId}"\n\n` +
            `2. Then call \`protokoll_edit_person\` with the changes:\n` +
            `   - id: "${entityId}"\n` +
            `   - [your modifications]\n`;
    } else if (entityType === 'term') {
        entityGuidance = `**Available modifications for terms:**\n` +
            `- \`expansion\`, \`domain\`, \`description\` - Update basic fields\n` +
            `- \`sounds_like\` - Replace all phonetic variants\n` +
            `- \`add_sounds_like\` - Add new phonetic variants\n` +
            `- \`remove_sounds_like\` - Remove specific variants\n` +
            `- \`topics\` / \`add_topics\` / \`remove_topics\` - Modify topic keywords\n` +
            `- \`projects\` / \`add_projects\` / \`remove_projects\` - Modify project associations\n\n` +
            `**To proceed:**\n` +
            `1. First, call \`protokoll_get_entity\` to see current values:\n` +
            `   - entityType: "term"\n` +
            `   - entityId: "${entityId}"\n\n` +
            `2. Then call \`protokoll_edit_term\` with the changes:\n` +
            `   - id: "${entityId}"\n` +
            `   - [your modifications]\n`;
    } else if (entityType === 'project') {
        entityGuidance = `**Available modifications for projects:**\n` +
            `- \`name\`, \`description\` - Update basic info\n` +
            `- \`destination\`, \`structure\` - Update routing\n` +
            `- \`contextType\`, \`active\` - Update classification\n` +
            `- \`sounds_like\` / \`add_sounds_like\` / \`remove_sounds_like\` - Phonetic variants\n` +
            `- \`topics\` / \`add_topics\` / \`remove_topics\` - Topic keywords\n` +
            `- \`explicit_phrases\` / \`add_explicit_phrases\` / \`remove_explicit_phrases\` - Trigger phrases\n\n` +
            `**To proceed:**\n` +
            `1. First, call \`protokoll_get_entity\` to see current values:\n` +
            `   - entityType: "project"\n` +
            `   - entityId: "${entityId}"\n\n` +
            `2. Then call \`protokoll_edit_project\` with the changes:\n` +
            `   - id: "${entityId}"\n` +
            `   - [your modifications]\n`;
    } else {
        entityGuidance = `**Note:** Entity type "${entityType}" does not support direct editing.\n` +
            `Supported types: person, term, project\n`;
    }

    const modificationNote = modification
        ? `\n**Requested modification:** "${modification}"\nWould you like me to retrieve the current entity and apply this change?`
        : '';

    const template = loadTemplate('edit_entity');
    const content = fillTemplate(template, {
        userMessage,
        entityType,
        entityId,
        entityGuidance,
        modificationNote
    });

    return [
        {
            role: 'user',
            content: {
                type: 'text',
                text: content,
            },
        },
    ];
}

// ============================================================================
// MCP Protocol Handlers
// ============================================================================

/**
 * Export prompts list for testing and handler
 */
export const prompts = getPrompts();

/**
 * Handle ListPrompts request
 */
export function handleListPrompts() {
    return { prompts };
}

/**
 * Handle GetPrompt request
 */
export async function handleGetPrompt(name: string, args: Record<string, string>) {
    const messages = await getPrompt(name, args);
    return { messages };
}
