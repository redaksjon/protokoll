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

import { fileExists, getConfiguredDirectory, sanitizePath } from './shared.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find a transcript by relative path (relative to output directory)
 * Returns absolute path for internal file operations
 */
async function findTranscript(
    relativePath: string,
    contextDirectory?: string
): Promise<string> {
    // Guard against undefined/null/empty values
    if (!relativePath || typeof relativePath !== 'string') {
        throw new Error('transcriptPath is required and must be a non-empty string');
    }
    
    // Get the output directory from config
    const outputDirectory = await getConfiguredDirectory('outputDirectory', contextDirectory);
    
    // Normalize the relative path (remove leading slashes, handle backslashes on Windows)
    const normalizedPath = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    
    // Try to resolve as a relative path from the output directory
    const resolvedPath = resolve(outputDirectory, normalizedPath);
    if (await fileExists(resolvedPath)) {
        return resolvedPath;
    }
    
    // If direct path resolution didn't work, try searching by filename
    // Extract just the filename if it's a path
    const searchTerm = normalizedPath.includes('/')
        ? normalizedPath.split('/').pop() || normalizedPath
        : normalizedPath;
    
    const result = await listTranscripts({
        directory: outputDirectory,
        search: searchTerm,
        limit: 10,
    });

    if (result.transcripts.length === 0) {
        throw new Error(
            `No transcript found matching "${relativePath}" in output directory. ` +
            `Try using protokoll_list_transcripts to see available transcripts.`
        );
    }

    if (result.transcripts.length === 1) {
        return result.transcripts[0].path;
    }

    // Multiple matches - try exact match by relative path
    const outputDirNormalized = outputDirectory.replace(/\\/g, '/');
    const exactMatch = result.transcripts.find(t => {
        const tPathNormalized = t.path.replace(/\\/g, '/');
        const tRelative = tPathNormalized.replace(outputDirNormalized + '/', '');
        return tRelative === normalizedPath || t.filename === searchTerm;
    });
    
    if (exactMatch) {
        return exactMatch.path;
    }

    // Multiple matches and no exact match
    const matches = result.transcripts.map(t => t.filename).join(', ');
    throw new Error(
        `Multiple transcripts match "${relativePath}": ${matches}. ` +
        `Please be more specific.`
    );
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const readTranscriptTool: Tool = {
    name: 'protokoll_read_transcript',
    description:
        'Read a transcript file and parse its metadata and content. ' +
        'Path is relative to the configured output directory. ' +
        'Returns structured data including title, metadata, routing info, and content.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Relative path to the transcript from the output directory. ' +
                    'Examples: "meeting-notes.md", "2026/2/01-1325-02012026091511.md"',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath'],
    },
};

export const listTranscriptsTool: Tool = {
    name: 'protokoll_list_transcripts',
    description:
        'List transcripts with pagination, filtering, and search. ' +
        'If no directory is specified, uses the configured output directory. ' +
        'Returns transcript metadata including date, time, title, and file path. ' +
        'Supports sorting by date (default), filename, or title. ' +
        'Can filter by date range and search within transcript content.',
    inputSchema: {
        type: 'object',
        properties: {
            directory: {
                type: 'string',
                description: 
                    'Optional: Directory to search for transcripts (searches recursively). ' +
                    'If not specified, uses the configured output directory.',
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
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: [],
    },
};

export const editTranscriptTool: Tool = {
    name: 'protokoll_edit_transcript',
    description:
        'Edit an existing transcript\'s title, project assignment, and/or tags. ' +
        'Path is relative to the configured output directory. ' +
        'IMPORTANT: When you change the title, this tool RENAMES THE FILE to match the new title (slugified). ' +
        'Always use this tool instead of directly editing transcript files when changing titles. ' +
        'Changing the project will update metadata and may move the file to a new location ' +
        'based on the project\'s routing configuration.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Relative path to the transcript from the output directory. ' +
                    'Examples: "meeting-notes.md", "2026/2/01-1325-02012026091511.md"',
            },
            title: {
                type: 'string',
                description: 'New title for the transcript. This will RENAME the file to match the slugified title.',
            },
            projectId: {
                type: 'string',
                description: 'New project ID to assign',
            },
            tagsToAdd: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags to add to the transcript (will be deduplicated with existing tags)',
            },
            tagsToRemove: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags to remove from the transcript',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath'],
    },
};

export const combineTranscriptsTool: Tool = {
    name: 'protokoll_combine_transcripts',
    description:
        'Combine multiple transcripts into a single document. ' +
        'Paths are relative to the configured output directory. ' +
        'Source files are automatically deleted after combining. ' +
        'Metadata from the first transcript is preserved, and content is organized into sections.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPaths: {
                type: 'array',
                items: { type: 'string' },
                description: 
                    'Array of relative paths from the output directory. ' +
                    'Examples: ["meeting-1.md", "meeting-2.md"] or ["2026/2/01-1325.md", "2026/2/01-1400.md"]',
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
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPaths'],
    },
};

export const provideFeedbackTool: Tool = {
    name: 'protokoll_provide_feedback',
    description:
        'Provide natural language feedback to correct a transcript. ' +
        'Path is relative to the configured output directory. ' +
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
                description: 
                    'Relative path to the transcript from the output directory. ' +
                    'Examples: "meeting-notes.md", "2026/2/01-1325-02012026091511.md"',
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
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'feedback'],
    },
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleReadTranscript(args: { 
    transcriptPath: string;
    contextDirectory?: string;
}) {
    // Find the transcript (returns absolute path for file operations)
    const absolutePath = await findTranscript(args.transcriptPath, args.contextDirectory);

    const parsed = await parseTranscript(absolutePath);

    // Convert to relative path for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativePath = await sanitizePath(absolutePath, outputDirectory);

    return {
        filePath: relativePath,
        title: parsed.title,
        metadata: parsed.metadata,
        content: parsed.content,
        contentLength: parsed.content.length,
    };
}

export async function handleListTranscripts(args: {
    directory?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'date' | 'filename' | 'title';
    startDate?: string;
    endDate?: string;
    search?: string;
    contextDirectory?: string;
}) {
    // Get directory from args or config
    const directory = args.directory 
        ? resolve(args.directory)
        : await getConfiguredDirectory('outputDirectory', args.contextDirectory);

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

    // Convert all paths to relative paths from output directory
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativeTranscripts = await Promise.all(
        result.transcripts.map(async (t) => ({
            path: t.path ? await sanitizePath(t.path, outputDirectory) : t.filename || '',
            filename: t.filename,
            date: t.date,
            time: t.time,
            title: t.title,
            hasRawTranscript: t.hasRawTranscript,
        }))
    );

    return {
        directory: await sanitizePath(directory, outputDirectory) || '.',
        transcripts: relativeTranscripts,
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
    tagsToAdd?: string[];
    tagsToRemove?: string[];
    contextDirectory?: string;
}) {
    // Find the transcript (returns absolute path for file operations)
    const absolutePath = await findTranscript(args.transcriptPath, args.contextDirectory);

    if (!args.title && !args.projectId && !args.tagsToAdd && !args.tagsToRemove) {
        throw new Error('Must specify at least one of: title, projectId, tagsToAdd, or tagsToRemove');
    }

    const result = await editTranscript(absolutePath, {
        title: args.title,
        projectId: args.projectId,
        tagsToAdd: args.tagsToAdd,
        tagsToRemove: args.tagsToRemove,
        contextDirectory: args.contextDirectory,
    });

    // Write the updated content
    await mkdir(dirname(result.outputPath), { recursive: true });
    await writeFile(result.outputPath, result.content, 'utf-8');

    // Delete original if path changed
    if (result.outputPath !== absolutePath) {
        await unlink(absolutePath);
    }

    // Convert to relative paths for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativeOriginalPath = await sanitizePath(absolutePath || '', outputDirectory);
    const relativeOutputPath = await sanitizePath(result.outputPath || absolutePath || '', outputDirectory);

    return {
        success: true,
        originalPath: relativeOriginalPath,
        outputPath: relativeOutputPath,
        renamed: result.outputPath !== absolutePath,
        message: result.outputPath !== absolutePath
            ? `Transcript updated and moved to: ${relativeOutputPath}`
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

    // Find all transcripts (returns absolute paths for file operations)
    const absolutePaths: string[] = [];
    for (const relativePath of args.transcriptPaths) {
        const absolute = await findTranscript(relativePath, args.contextDirectory);
        absolutePaths.push(absolute);
    }

    const result = await combineTranscripts(absolutePaths, {
        title: args.title,
        projectId: args.projectId,
        contextDirectory: args.contextDirectory,
    });

    // Write the combined transcript
    await mkdir(dirname(result.outputPath), { recursive: true });
    await writeFile(result.outputPath, result.content, 'utf-8');

    // Delete source files
    const deletedFiles: string[] = [];
    for (const path of absolutePaths) {
        try {
            await unlink(path);
            deletedFiles.push(path);
        } catch {
            // Ignore deletion errors
        }
    }

    // Convert to relative paths for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativeOutputPath = await sanitizePath(result.outputPath || '', outputDirectory);
    const relativeSourceFiles = await Promise.all(
        absolutePaths.map(p => sanitizePath(p || '', outputDirectory))
    );
    const relativeDeletedFiles = await Promise.all(
        deletedFiles.map(p => sanitizePath(p || '', outputDirectory))
    );

    return {
        success: true,
        outputPath: relativeOutputPath,
        sourceFiles: relativeSourceFiles,
        deletedFiles: relativeDeletedFiles,
        message: `Combined ${absolutePaths.length} transcripts into: ${relativeOutputPath}`,
    };
}

export async function handleProvideFeedback(args: {
    transcriptPath: string;
    feedback: string;
    model?: string;
    contextDirectory?: string;
}) {
    // Find the transcript (returns absolute path for file operations)
    const absolutePath = await findTranscript(args.transcriptPath, args.contextDirectory);

    const transcriptContent = await readFile(absolutePath, 'utf-8');
    const context = await Context.create({
        startingDir: args.contextDirectory || dirname(absolutePath),
    });
    const reasoning = Reasoning.create({ model: args.model || DEFAULT_MODEL });

    const feedbackCtx: FeedbackContext = {
        transcriptPath: absolutePath,
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

    // Convert to relative path for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const finalAbsolutePath = result?.newPath || absolutePath || '';
    const relativeOutputPath = await sanitizePath(finalAbsolutePath, outputDirectory);

    return {
        success: true,
        changesApplied: feedbackCtx.changes.length,
        changes: feedbackCtx.changes.map(c => ({
            type: c.type,
            description: c.description,
        })),
        outputPath: relativeOutputPath,
        moved: result?.moved || false,
    };
}
