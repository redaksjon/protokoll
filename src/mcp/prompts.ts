/**
 * MCP Prompts Module
 * 
 * Implements the Prompts capability for the Protokoll MCP server.
 * Prompts provide reusable workflow templates for common operations.
 */

import type {
    McpPrompt,
    McpPromptMessage,
} from './types';
import * as Context from '@/context';
import { resolve, dirname } from 'node:path';
import { stat } from 'node:fs/promises';
import { buildConfigUri, buildEntitiesListUri } from './uri';

// ============================================================================
// Prompt Definitions
// ============================================================================

export const prompts: McpPrompt[] = [
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
];

// ============================================================================
// Handler Functions
// ============================================================================

/**
 * Handle prompts/list request
 */
export async function handleListPrompts(): Promise<{ prompts: McpPrompt[] }> {
    return { prompts };
}

/**
 * Handle prompts/get request
 */
export async function handleGetPrompt(
    name: string,
    args: Record<string, string>
): Promise<{ messages: McpPromptMessage[] }> {
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
        default:
            throw new Error(`Prompt handler not implemented: ${name}`);
    }
}

// ============================================================================
// Prompt Generators (to be implemented)
// ============================================================================

async function generateTranscribePrompt(
    args: Record<string, string>
): Promise<{ messages: McpPromptMessage[] }> {
    const audioFile = args.audioFile;
    const skipDiscovery = args.skipDiscovery === 'true';
    
    if (!audioFile) {
        throw new Error('audioFile is required');
    }

    const messages: McpPromptMessage[] = [];

    // Initial user message
    messages.push({
        role: 'user',
        content: {
            type: 'text',
            text: `I want to transcribe the audio file: ${audioFile}`,
        },
    });

    if (skipDiscovery) {
        messages.push({
            role: 'assistant',
            content: {
                type: 'text',
                text: `I'll transcribe ${audioFile} using the current context configuration.\n\n` +
                    `To proceed, call the \`protokoll_process_audio\` tool with:\n` +
                    `- audioFile: "${audioFile}"\n\n` +
                    `Would you like me to start the transcription?`,
            },
        });
    } else {
        // Perform basic context discovery
        const audioPath = resolve(audioFile);
        let discoveryInfo = '';

        try {
            await stat(audioPath);
            
            const context = await Context.create({
                startingDir: dirname(audioPath),
            });

            if (context.hasContext()) {
                const dirs = context.getDiscoveredDirs();
                const projects = context.getAllProjects().filter(p => p.active !== false);
                
                discoveryInfo = `## Context Discovery\n\n` +
                    `**Configuration:** ${dirs[0]?.path}\n` +
                    `**Projects:** ${projects.length} active\n` +
                    `**Context URI:** ${buildConfigUri(dirs[0]?.path)}\n` +
                    `**Projects URI:** ${buildEntitiesListUri('project')}\n\n` +
                    `Ready to transcribe with context-aware enhancement.`;
            } else {
                discoveryInfo = `## No Context Found\n\nProcessing without context (basic transcription only).`;
            }
        } catch {
            discoveryInfo = `## File Check Failed\n\nUnable to access: ${audioFile}`;
        }

        messages.push({
            role: 'assistant',
            content: {
                type: 'text',
                text: `${discoveryInfo}\n\n` +
                    `To start transcription, call \`protokoll_process_audio\` with:\n` +
                    `- audioFile: "${audioFile}"`,
            },
        });
    }

    return { messages };
}

async function generateSetupProjectPrompt(
    args: Record<string, string>
): Promise<{ messages: McpPromptMessage[] }> {
    const projectName = args.projectName;
    
    if (!projectName) {
        throw new Error('projectName is required');
    }

    const messages: McpPromptMessage[] = [];

    messages.push({
        role: 'user',
        content: {
            type: 'text',
            text: `I want to create a new Protokoll project called: ${projectName}`,
        },
    });

    let assistantText = `I'll help you set up the "${projectName}" project.\n\n`;
    assistantText += `**Steps:**\n`;
    assistantText += `1. Call \`protokoll_create_project\` with:\n`;
    assistantText += `   - projectName: "${projectName}"\n`;
    
    if (args.sourceUrl) {
        assistantText += `   - sourceUrl: "${args.sourceUrl}" (for metadata analysis)\n`;
    }
    if (args.destination) {
        assistantText += `   - destination: "${args.destination}"\n`;
    }
    
    assistantText += `\n2. The tool will create the project YAML file\n`;
    assistantText += `3. Configure routing, trigger phrases, and other metadata as needed\n`;

    messages.push({
        role: 'assistant',
        content: {
            type: 'text',
            text: assistantText,
        },
    });

    return { messages };
}

async function generateReviewTranscriptPrompt(
    args: Record<string, string>
): Promise<{ messages: McpPromptMessage[] }> {
    const transcriptPath = args.transcriptPath;
    
    if (!transcriptPath) {
        throw new Error('transcriptPath is required');
    }

    const messages: McpPromptMessage[] = [];

    messages.push({
        role: 'user',
        content: {
            type: 'text',
            text: `I want to review and improve the transcript at: ${transcriptPath}`,
        },
    });

    let assistantText = `I'll help you review "${transcriptPath}".\n\n`;
    assistantText += `**Focus areas:**\n`;
    
    const focusArea = args.focusArea || 'all';
    assistantText += `- ${focusArea === 'all' ? 'All corrections' : focusArea}\n\n`;
    
    assistantText += `**To proceed:**\n`;
    assistantText += `1. Call \`protokoll_feedback_analyze\` to analyze the transcript\n`;
    assistantText += `2. Review suggested corrections\n`;
    assistantText += `3. Apply corrections using \`protokoll_feedback_apply\`\n`;

    messages.push({
        role: 'assistant',
        content: {
            type: 'text',
            text: assistantText,
        },
    });

    return { messages };
}

async function generateEnrichEntityPrompt(
    args: Record<string, string>
): Promise<{ messages: McpPromptMessage[] }> {
    // TODO: Implement
    return {
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: `I want to add a ${args.entityType} called: ${args.entityName}`,
                },
            },
        ],
    };
}

async function generateBatchTranscriptionPrompt(
    args: Record<string, string>
): Promise<{ messages: McpPromptMessage[] }> {
    // TODO: Implement
    return {
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: `I want to batch process audio files in: ${args.directory}`,
                },
            },
        ],
    };
}

async function generateFindAndAnalyzePrompt(
    args: Record<string, string>
): Promise<{ messages: McpPromptMessage[] }> {
    // TODO: Implement
    return {
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: `I want to search for transcripts in: ${args.directory}`,
                },
            },
        ],
    };
}
