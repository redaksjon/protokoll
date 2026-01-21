/* eslint-disable import/extensions */
/**
 * Transcript Tools - Read, list, edit, combine, and provide feedback on transcripts
 */
 
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { resolve, dirname } from 'node:path';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import * as Context from '@/context';
import * as Reasoning from '@/reasoning';
import { parseTranscript, combineTranscripts, editTranscript } from '@/cli/action';
import { listTranscripts } from '@/cli/transcript';
import { processFeedback, applyChanges, type FeedbackContext } from '@/cli/feedback';
import { DEFAULT_MODEL } from '@/constants';
 
import { fileExists } from './shared.js';

// ============================================================================
// Tool Definitions
// ============================================================================

export const readTranscriptTool: Tool = {
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
};

export const listTranscriptsTool: Tool = {
    name: 'protokoll_list_transcripts',
    description:
        'List transcripts in a directory with pagination, filtering, and search. ' +
        'Returns transcript metadata including date, time, title, and file path. ' +
        'Supports sorting by date (default), filename, or title. ' +
        'Can filter by date range and search within transcript content.',
    inputSchema: {
        type: 'object',
        properties: {
            directory: {
                type: 'string',
                description: 'Directory to search for transcripts (searches recursively)',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 50)',
                default: 50,
            },
            offset: {
                type: 'number',
                description: 'Number of results to skip for pagination (default: 0)',
                default: 0,
            },
            sortBy: {
                type: 'string',
                enum: ['date', 'filename', 'title'],
                description: 'Field to sort by (default: date)',
                default: 'date',
            },
            startDate: {
                type: 'string',
                description: 'Filter transcripts from this date onwards (YYYY-MM-DD format)',
            },
            endDate: {
                type: 'string',
                description: 'Filter transcripts up to this date (YYYY-MM-DD format)',
            },
            search: {
                type: 'string',
                description: 'Search for transcripts containing this text (searches filename and content)',
            },
        },
        required: ['directory'],
    },
};

export const editTranscriptTool: Tool = {
    name: 'protokoll_edit_transcript',
    description:
        'Edit an existing transcript\'s title and/or project assignment. ' +
        'IMPORTANT: When you change the title, this tool RENAMES THE FILE to match the new title (slugified). ' +
        'Always use this tool instead of directly editing transcript files when changing titles. ' +
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
                description: 'New title for the transcript. This will RENAME the file to match the slugified title.',
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
};

export const combineTranscriptsTool: Tool = {
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
};

export const provideFeedbackTool: Tool = {
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
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleReadTranscript(args: { transcriptPath: string }) {
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

export async function handleListTranscripts(args: {
    directory: string;
    limit?: number;
    offset?: number;
    sortBy?: 'date' | 'filename' | 'title';
    startDate?: string;
    endDate?: string;
    search?: string;
}) {
    const directory = resolve(args.directory);

    if (!await fileExists(directory)) {
        throw new Error(`Directory not found: ${directory}`);
    }

    const result = await listTranscripts({
        directory,
        limit: args.limit ?? 50,
        offset: args.offset ?? 0,
        sortBy: args.sortBy ?? 'date',
        startDate: args.startDate,
        endDate: args.endDate,
        search: args.search,
    });

    return {
        directory,
        transcripts: result.transcripts.map(t => ({
            path: t.path,
            filename: t.filename,
            date: t.date,
            time: t.time,
            title: t.title,
            hasRawTranscript: t.hasRawTranscript,
        })),
        pagination: {
            total: result.total,
            limit: result.limit,
            offset: result.offset,
            hasMore: result.hasMore,
            nextOffset: result.hasMore ? result.offset + result.limit : null,
        },
        filters: {
            sortBy: args.sortBy ?? 'date',
            startDate: args.startDate,
            endDate: args.endDate,
            search: args.search,
        },
    };
}

export async function handleEditTranscript(args: {
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

export async function handleCombineTranscripts(args: {
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

export async function handleProvideFeedback(args: {
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
