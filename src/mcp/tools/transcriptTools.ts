/* eslint-disable import/extensions */
/**
 * Transcript Tools - Read, list, edit, combine, and provide feedback on transcripts
 */
 
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import * as Context from '@/context';
import * as Reasoning from '@/reasoning';
import { DEFAULT_MODEL } from '@/constants';
import * as Transcript from '@/transcript';

import { fileExists, getConfiguredDirectory, getContextDirectories, sanitizePath, validatePathWithinDirectory, validatePathWithinOutputDirectory, validateNotRemoteMode } from './shared.js';
import * as Metadata from '@/util/metadata';
import { validateOrThrow } from '@/util/validation';

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
    
    let normalizedPath: string;
    let resolvedPath: string;
    
    // Check if the path is absolute
    if (isAbsolute(relativePath)) {
        // If it's an absolute path, try to convert it to relative
        const normalizedAbsolute = resolve(relativePath);
        const normalizedOutputDir = resolve(outputDirectory);
        
        // Check if the absolute path is within the output directory
        if (normalizedAbsolute.startsWith(normalizedOutputDir + '/') || normalizedAbsolute === normalizedOutputDir) {
            // Convert to relative path
            normalizedPath = relative(normalizedOutputDir, normalizedAbsolute);
            resolvedPath = normalizedAbsolute;
        } else {
            // Absolute path outside output directory - extract relative portion
            // Try to find the part that looks like a relative path (e.g., "2026/2/file.md")
            // by looking for common patterns
            const pathParts = relativePath.split(/[/\\]/);
            // Look for patterns like "notes/2026/..." or just "2026/..."
            const notesIndex = pathParts.findIndex(p => p.toLowerCase() === 'notes');
            if (notesIndex >= 0 && notesIndex < pathParts.length - 1) {
                // Extract everything after "notes/"
                normalizedPath = pathParts.slice(notesIndex + 1).join('/');
                resolvedPath = resolve(outputDirectory, normalizedPath);
            } else {
                // Fall back to just the filename
                normalizedPath = pathParts[pathParts.length - 1] || relativePath;
                resolvedPath = resolve(outputDirectory, normalizedPath);
            }
        }
    } else {
        // Normalize the relative path (remove leading slashes, handle backslashes on Windows)
        normalizedPath = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
        // Try to resolve as a relative path from the output directory
        resolvedPath = resolve(outputDirectory, normalizedPath);
    }
    
    // Validate that the resolved path stays within the output directory
    // This prevents path traversal attacks using ../ sequences
    validatePathWithinDirectory(resolvedPath, outputDirectory);
    
    if (await fileExists(resolvedPath)) {
        return resolvedPath;
    }
    
    // If direct path resolution didn't work, try searching by filename
    // Extract just the filename if it's a path
    const searchTerm = normalizedPath.includes('/')
        ? normalizedPath.split('/').pop() || normalizedPath
        : normalizedPath;
    
    const result = await Transcript.listTranscripts({
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
        'Edit an existing transcript\'s title, project assignment, tags, and/or status. ' +
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
            status: {
                type: 'string',
                enum: ['initial', 'enhanced', 'reviewed', 'in_progress', 'closed', 'archived'],
                description: 'New lifecycle status. Status transitions are recorded in history.',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath'],
    },
};

export const changeTranscriptDateTool: Tool = {
    name: 'protokoll_change_transcript_date',
    description:
        'Change the date of an existing transcript. ' +
        'This will move the transcript file to a new location based on the new date and the project\'s routing configuration. ' +
        'The file will be moved to the appropriate YYYY/MM/ directory structure. ' +
        'Path is relative to the configured output directory. ' +
        'WARNING: This may remove the transcript from the current view if it moves to a different date folder.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Relative path to the transcript from the output directory. ' +
                    'Examples: "meeting-notes.md", "2026/2/01-1325-02012026091511.md"',
            },
            newDate: {
                type: 'string',
                description: 
                    'New date for the transcript in ISO 8601 format (YYYY-MM-DD or full ISO datetime). ' +
                    'Examples: "2026-01-15", "2026-01-15T10:30:00Z"',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'newDate'],
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

export const updateTranscriptContentTool: Tool = {
    name: 'protokoll_update_transcript_content',
    description:
        'Update the content section of a transcript file while preserving all metadata. ' +
        'Path is relative to the configured output directory. ' +
        'This tool replaces only the content between the --- delimiters, keeping all metadata intact. ' +
        'IMPORTANT: The content parameter should contain ONLY the transcript body text (the text after the --- delimiter), ' +
        'NOT the full transcript file with headers and metadata. If the full transcript is provided, ' +
        'the tool will automatically extract only the content section to prevent duplication.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Relative path to the transcript from the output directory. ' +
                    'Examples: "meeting-notes.md", "2026/2/01-1325-02012026091511.md"',
            },
            content: {
                type: 'string',
                description: 
                    'New content to replace the transcript body. ' +
                    'Should contain ONLY the body text (content after the --- delimiter). ' +
                    'If the full transcript is provided, the tool will extract only the content section automatically.',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'content'],
    },
};

export const updateTranscriptEntityReferencesTool: Tool = {
    name: 'protokoll_update_transcript_entity_references',
    description:
        'Update the Entity References section of a transcript file while preserving all other content. ' +
        'Path is relative to the configured output directory. ' +
        'This tool replaces only the Entity References section at the end of the transcript, ' +
        'preserving the title, metadata, and body content.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Relative path to the transcript from the output directory. ' +
                    'Examples: "meeting-notes.md", "2026/2/01-1325-02012026091511.md"',
            },
            entities: {
                type: 'object',
                description: 'Entity references to update',
                properties: {
                    people: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Entity ID (slugified identifier)' },
                                name: { type: 'string', description: 'Display name' },
                            },
                            required: ['id', 'name'],
                        },
                    },
                    projects: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Entity ID (slugified identifier)' },
                                name: { type: 'string', description: 'Display name' },
                            },
                            required: ['id', 'name'],
                        },
                    },
                    terms: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Entity ID (slugified identifier)' },
                                name: { type: 'string', description: 'Display name' },
                            },
                            required: ['id', 'name'],
                        },
                    },
                    companies: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Entity ID (slugified identifier)' },
                                name: { type: 'string', description: 'Display name' },
                            },
                            required: ['id', 'name'],
                        },
                    },
                },
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'entities'],
    },
};

export const createNoteTool: Tool = {
    name: 'protokoll_create_note',
    description:
        'Create a new note/transcript file in the configured output directory. ' +
        'The file will be created with proper metadata formatting and placed in a date-based directory structure (YYYY/MM/). ' +
        'Returns the relative path to the created file.',
    inputSchema: {
        type: 'object',
        properties: {
            title: {
                type: 'string',
                description: 'Title for the note/transcript',
            },
            content: {
                type: 'string',
                description: 'Content/body text for the note (optional, can be empty)',
                default: '',
            },
            projectId: {
                type: 'string',
                description: 'Optional: Project ID to assign to the note',
            },
            tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional: Tags to add to the note',
            },
            date: {
                type: 'string',
                description: 'Optional: Date for the note (ISO 8601 format, e.g., "2026-02-02"). Defaults to current date.',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['title'],
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

    const parsed = await Transcript.parseTranscript(absolutePath);

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

    const result = await Transcript.listTranscripts({
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
    status?: string;
    contextDirectory?: string;
}) {
    // Validate that contextDirectory is not provided in remote mode
    await validateNotRemoteMode(args.contextDirectory);
    
    // Get the output directory first to ensure consistent validation
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    
    // Find the transcript (returns absolute path for file operations)
    const absolutePath = await findTranscript(args.transcriptPath, args.contextDirectory);

    // Validate status if provided
    if (args.status && !Metadata.isValidStatus(args.status)) {
        throw new Error(
            `Invalid status "${args.status}". ` +
            `Valid statuses are: ${Metadata.VALID_STATUSES.join(', ')}`
        );
    }

    if (!args.title && !args.projectId && !args.tagsToAdd && !args.tagsToRemove && !args.status) {
        throw new Error('Must specify at least one of: title, projectId, tagsToAdd, tagsToRemove, or status');
    }

    let finalOutputPath = absolutePath;
    let wasRenamed = false;
    
    // Handle title/project/tags changes via existing editTranscript function
    if (args.title || args.projectId || args.tagsToAdd || args.tagsToRemove) {
        // Get context directories from server config (from protokoll-config.yaml)
        const contextDirectories = await getContextDirectories();
        
        const result = await Transcript.editTranscript(absolutePath, {
            title: args.title,
            projectId: args.projectId,
            tagsToAdd: args.tagsToAdd,
            tagsToRemove: args.tagsToRemove,
            contextDirectory: args.contextDirectory,
            contextDirectories,
        });

        // Validate that the output path stays within the output directory
        validatePathWithinDirectory(result.outputPath, outputDirectory);

        // Validate the content before writing (using shared validation utility)
        try {
            validateOrThrow(result.content);
            // eslint-disable-next-line no-console
            console.log('✅ Transcript content validated successfully');
        } catch (validationError) {
            // eslint-disable-next-line no-console
            console.error('❌ Transcript validation failed:', validationError);
            // eslint-disable-next-line no-console
            console.error('Generated content (first 500 chars):', result.content.substring(0, 500));
            throw new Error(
                `Transcript validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}. ` +
                `This is a bug in the transcript generation logic. The file was NOT saved to prevent corruption.`
            );
        }
        
        // Write the updated content
        await mkdir(dirname(result.outputPath), { recursive: true });
        await writeFile(result.outputPath, result.content, 'utf-8');

        // Delete original if path changed
        if (result.outputPath !== absolutePath) {
            await unlink(absolutePath);
            wasRenamed = true;
        }
        
        finalOutputPath = result.outputPath;
    }

    // Handle status change using frontmatter utilities
    let statusChanged = false;
    let previousStatus: string | undefined;
    
    if (args.status) {
        const content = await readFile(finalOutputPath, 'utf-8');
        const { parseTranscriptContent, stringifyTranscript } = await import('@/util/frontmatter');
        const parsed = parseTranscriptContent(content);
        
        previousStatus = parsed.metadata.status || 'reviewed';
        
        if (previousStatus !== args.status) {
            const updatedMetadata = Metadata.updateStatus(parsed.metadata, args.status as Metadata.TranscriptStatus);
            const updatedContent = stringifyTranscript(updatedMetadata, parsed.body);
            
            // Validate before writing
            try {
                const validation = parseTranscriptContent(updatedContent);
                if (!validation.metadata) {
                    throw new Error('Generated content has no parseable metadata');
                }
                if (!updatedContent.trim().startsWith('---')) {
                    throw new Error('Generated content does not start with YAML frontmatter (---)');
                }
                // eslint-disable-next-line no-console
                console.log('✅ Status update content validated successfully');
            } catch (validationError) {
                // eslint-disable-next-line no-console
                console.error('❌ Status update validation failed:', validationError);
                // eslint-disable-next-line no-console
                console.error('Generated content (first 500 chars):', updatedContent.substring(0, 500));
                throw new Error(
                    `Status update validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}. ` +
                    `The file was NOT saved to prevent corruption.`
                );
            }
            
            await writeFile(finalOutputPath, updatedContent, 'utf-8');
            statusChanged = true;
        }
    }

    // Convert to relative paths for response
    const relativeOriginalPath = await sanitizePath(absolutePath || '', outputDirectory);
    const relativeOutputPath = await sanitizePath(finalOutputPath || '', outputDirectory);

    // Build message
    const changes: string[] = [];
    if (wasRenamed) changes.push(`moved to ${relativeOutputPath}`);
    if (args.title) changes.push(`title updated`);
    if (args.projectId) changes.push(`project changed`);
    if (args.tagsToAdd?.length) changes.push(`${args.tagsToAdd.length} tag(s) added`);
    if (args.tagsToRemove?.length) changes.push(`${args.tagsToRemove.length} tag(s) removed`);
    if (statusChanged) changes.push(`status: ${previousStatus} → ${args.status}`);
    if (!statusChanged && args.status) changes.push(`status unchanged (already ${args.status})`);

    return {
        success: true,
        originalPath: relativeOriginalPath,
        outputPath: relativeOutputPath,
        renamed: wasRenamed,
        statusChanged,
        message: changes.length > 0 ? `Transcript updated: ${changes.join(', ')}` : 'No changes made',
    };
}

export async function handleChangeTranscriptDate(args: {
    transcriptPath: string;
    newDate: string;
    contextDirectory?: string;
}) {
    const { readFile, writeFile, mkdir, unlink } = await import('node:fs/promises');
    const path = await import('node:path');
    
    // Get the output directory
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    
    // Find the transcript (returns absolute path)
    const absolutePath = await findTranscript(args.transcriptPath, args.contextDirectory);
    
    // Parse the new date
    const newDate = new Date(args.newDate);
    if (isNaN(newDate.getTime())) {
        throw new Error(`Invalid date format: ${args.newDate}. Use ISO 8601 format (e.g., "2026-01-15" or "2026-01-15T10:30:00Z")`);
    }
    
    // Read the transcript content
    const content = await readFile(absolutePath, 'utf-8');
    
    // Parse the transcript to get metadata
    const { parseTranscriptContent } = await import('@/util/frontmatter');
    const parsed = parseTranscriptContent(content);
    
    if (!parsed.metadata) {
        throw new Error('Could not parse transcript metadata');
    }
    
    // Determine the new directory structure based on the date
    // Use YYYY/M structure (month-level organization, no zero-padding to match router convention)
    // Use UTC methods to avoid timezone issues with date-only strings
    const year = newDate.getUTCFullYear();
    const month = (newDate.getUTCMonth() + 1).toString(); // No zero-padding (e.g., "8" not "08")
    const newDirPath = path.join(outputDirectory, String(year), month);
    
    // Get the filename from the original path
    const filename = path.basename(absolutePath);
    const newAbsolutePath = path.join(newDirPath, filename);
    
    // Check if the file would move to a different location
    if (absolutePath === newAbsolutePath) {
        return {
            success: true,
            originalPath: await sanitizePath(absolutePath, outputDirectory),
            outputPath: await sanitizePath(newAbsolutePath, outputDirectory),
            moved: false,
            message: 'Transcript date matches the target directory structure. No move needed.',
        };
    }
    
    // Validate that the new path stays within the output directory
    validatePathWithinDirectory(newAbsolutePath, outputDirectory);
    
    // Create the new directory if it doesn't exist
    await mkdir(newDirPath, { recursive: true });
    
    // Check if a file already exists at the destination
    try {
        await readFile(newAbsolutePath, 'utf-8');
        throw new Error(
            `A file already exists at the destination: ${await sanitizePath(newAbsolutePath, outputDirectory)}. ` +
            `Please rename the transcript first or choose a different date.`
        );
    } catch (error) {
        // File doesn't exist, which is what we want
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }
    
    // Update the date in the transcript's front-matter
    const { updateTranscript } = await import('@/util/frontmatter');
    const updatedContent = updateTranscript(content, {
        metadata: {
            date: newDate,
        },
    });
    
    // Move the file to the new location with updated content
    await writeFile(newAbsolutePath, updatedContent, 'utf-8');
    await unlink(absolutePath);
    
    // Convert to relative paths for response
    const relativeOriginalPath = await sanitizePath(absolutePath, outputDirectory);
    const relativeOutputPath = await sanitizePath(newAbsolutePath, outputDirectory);
    
    return {
        success: true,
        originalPath: relativeOriginalPath,
        outputPath: relativeOutputPath,
        moved: true,
        message: `Transcript moved from ${relativeOriginalPath} to ${relativeOutputPath}`,
    };
}

export async function handleCombineTranscripts(args: {
    transcriptPaths: string[];
    title?: string;
    projectId?: string;
    contextDirectory?: string;
}) {
    // Validate that contextDirectory is not provided in remote mode
    await validateNotRemoteMode(args.contextDirectory);
    
    if (args.transcriptPaths.length < 2) {
        throw new Error('At least 2 transcript files are required');
    }

    // Find all transcripts (returns absolute paths for file operations)
    const absolutePaths: string[] = [];
    for (const relativePath of args.transcriptPaths) {
        const absolute = await findTranscript(relativePath, args.contextDirectory);
        absolutePaths.push(absolute);
    }

    // Get context directories from server config (from protokoll-config.yaml)
    const contextDirectories = await getContextDirectories();
    
    const result = await Transcript.combineTranscripts(absolutePaths, {
        title: args.title,
        projectId: args.projectId,
        contextDirectory: args.contextDirectory,
        contextDirectories,
    });

    // Validate that the output path stays within the output directory
    // This prevents project routing from writing files outside the allowed directory
    await validatePathWithinOutputDirectory(result.outputPath, args.contextDirectory);

    // Validate the combined content before writing
    try {
        const { parseTranscriptContent } = await import('@/util/frontmatter');
        const validation = parseTranscriptContent(result.content);
        
        if (!validation.metadata) {
            throw new Error('Combined content has no parseable metadata');
        }
        if (!result.content.trim().startsWith('---')) {
            throw new Error('Combined content does not start with YAML frontmatter (---)');
        }
        // eslint-disable-next-line no-console
        console.log('✅ Combined transcript content validated successfully');
    } catch (validationError) {
        // eslint-disable-next-line no-console
        console.error('❌ Combined transcript validation failed:', validationError);
        // eslint-disable-next-line no-console
        console.error('Generated content (first 500 chars):', result.content.substring(0, 500));
        throw new Error(
            `Combined transcript validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}. ` +
            `The file was NOT saved to prevent corruption.`
        );
    }
    
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

export async function handleUpdateTranscriptContent(args: {
    transcriptPath: string;
    content: string;
    contextDirectory?: string;
}) {
    // Find the transcript (returns absolute path for file operations)
    const absolutePath = await findTranscript(args.transcriptPath, args.contextDirectory);

    // Read the original file content
    const originalContent = await readFile(absolutePath, 'utf-8');

    // Replace the content section while preserving metadata
    const updatedContent = replaceTranscriptContent(originalContent, args.content);

    // Validate before writing
    try {
        const { parseTranscriptContent } = await import('@/util/frontmatter');
        const validation = parseTranscriptContent(updatedContent);
        
        if (!validation.metadata) {
            throw new Error('Updated content has no parseable metadata');
        }
        if (!updatedContent.trim().startsWith('---')) {
            throw new Error('Updated content does not start with YAML frontmatter (---)');
        }
        // eslint-disable-next-line no-console
        console.log('✅ Updated transcript content validated successfully');
    } catch (validationError) {
        // eslint-disable-next-line no-console
        console.error('❌ Transcript content update validation failed:', validationError);
        // eslint-disable-next-line no-console
        console.error('Generated content (first 500 chars):', updatedContent.substring(0, 500));
        throw new Error(
            `Transcript content update validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}. ` +
            `The file was NOT saved to prevent corruption.`
        );
    }

    // Write the updated content back to the file
    await writeFile(absolutePath, updatedContent, 'utf-8');

    // Convert to relative path for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativePath = await sanitizePath(absolutePath, outputDirectory);

    return {
        success: true,
        filePath: relativePath,
        message: 'Transcript content updated successfully',
    };
}

export async function handleUpdateTranscriptEntityReferences(args: {
    transcriptPath: string;
    entities: {
        people?: Array<{ id: string; name: string }>;
        projects?: Array<{ id: string; name: string }>;
        terms?: Array<{ id: string; name: string }>;
        companies?: Array<{ id: string; name: string }>;
    };
    contextDirectory?: string;
}) {
    // Find the transcript (returns absolute path for file operations)
    const absolutePath = await findTranscript(args.transcriptPath, args.contextDirectory);

    // Read the original file content
    const originalContent = await readFile(absolutePath, 'utf-8');

    // Validate and sanitize entity IDs
    const validateEntityId = (id: string, name: string, type: string): string => {
        if (!id || typeof id !== 'string') {
            throw new Error(`Invalid entity ID for ${type} "${name}": ID must be a non-empty string`);
        }
        
        // Check for common JSON parsing errors
        if (id.includes('},') || id.includes('{') || id.includes('}') || id.includes(',')) {
            throw new Error(
                `Invalid entity ID "${id}" for ${type} "${name}". ` +
                `Entity IDs should be slugified identifiers (e.g., "jack-smith", "discursive"), ` +
                `not JSON syntax. Please provide a valid slugified ID.`
            );
        }
        
        // Basic validation: entity IDs should be alphanumeric with hyphens/underscores
        if (!/^[a-z0-9_-]+$/i.test(id)) {
            throw new Error(
                `Invalid entity ID "${id}" for ${type} "${name}". ` +
                `Entity IDs should only contain letters, numbers, hyphens, and underscores.`
            );
        }
        
        return id.trim();
    };

    // Convert incoming entities to EntityReference format with validation
    const entityReferences: Metadata.EntityReference[] = [];
    
    if (args.entities.people) {
        entityReferences.push(...args.entities.people.map(e => ({
            id: validateEntityId(e.id, e.name, 'person'),
            name: e.name.trim(),
            type: 'person' as const,
        })));
    }
    
    if (args.entities.projects) {
        entityReferences.push(...args.entities.projects.map(e => ({
            id: validateEntityId(e.id, e.name, 'project'),
            name: e.name.trim(),
            type: 'project' as const,
        })));
    }
    
    if (args.entities.terms) {
        entityReferences.push(...args.entities.terms.map(e => ({
            id: validateEntityId(e.id, e.name, 'term'),
            name: e.name.trim(),
            type: 'term' as const,
        })));
    }
    
    if (args.entities.companies) {
        entityReferences.push(...args.entities.companies.map(e => ({
            id: validateEntityId(e.id, e.name, 'company'),
            name: e.name.trim(),
            type: 'company' as const,
        })));
    }

    // Group by type
    const entities: NonNullable<Metadata.TranscriptMetadata['entities']> = {
        people: entityReferences.filter(e => e.type === 'person'),
        projects: entityReferences.filter(e => e.type === 'project'),
        terms: entityReferences.filter(e => e.type === 'term'),
        companies: entityReferences.filter(e => e.type === 'company'),
    };

    // Create minimal metadata object with only entities for formatting
    // formatEntityMetadataMarkdown only uses the entities property
    const metadataForFormatting: Metadata.TranscriptMetadata = {
        entities,
    };

    // Replace Entity References section in the file
    const updatedContent = replaceEntityReferences(originalContent, metadataForFormatting);

    // Validate before writing
    try {
        const { parseTranscriptContent } = await import('@/util/frontmatter');
        const validation = parseTranscriptContent(updatedContent);
        
        if (!validation.metadata) {
            throw new Error('Updated content has no parseable metadata');
        }
        if (!updatedContent.trim().startsWith('---')) {
            throw new Error('Updated content does not start with YAML frontmatter (---)');
        }
        // eslint-disable-next-line no-console
        console.log('✅ Entity references update validated successfully');
    } catch (validationError) {
        // eslint-disable-next-line no-console
        console.error('❌ Entity references update validation failed:', validationError);
        // eslint-disable-next-line no-console
        console.error('Generated content (first 500 chars):', updatedContent.substring(0, 500));
        throw new Error(
            `Entity references update validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}. ` +
            `The file was NOT saved to prevent corruption.`
        );
    }

    // Write the updated content back to the file
    await writeFile(absolutePath, updatedContent, 'utf-8');

    // Convert to relative path for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativePath = await sanitizePath(absolutePath, outputDirectory);

    return {
        success: true,
        filePath: relativePath,
        message: 'Transcript entity references updated successfully',
    };
}

/**
 * Replace the content section of a transcript file while preserving metadata
 * Transcript structure: [metadata section]\n---\n[content section]
 * We preserve everything before and including the --- delimiter, and replace only the content after it
 * 
 * This function is smart enough to detect if the incoming content includes headers/metadata
 * and extract only the actual content section to prevent duplication.
 */
function replaceTranscriptContent(originalText: string, newContent: string): string {
    // Check if newContent appears to contain metadata/headers (common mistake from clients)
    const hasTitle = newContent.trim().startsWith('# ');
    const hasMetadata = /##\s+Metadata/i.test(newContent);
    
    if (hasTitle || hasMetadata) {
        // Extract only the content section from newContent (everything after the first --- delimiter)
        const newContentLines = newContent.split('\n');
        let contentDelimiterIndex = -1;
        
        // Find the first --- delimiter in newContent
        for (let i = 0; i < newContentLines.length; i++) {
            if (newContentLines[i].trim() === '---') {
                contentDelimiterIndex = i;
                break;
            }
        }
        
        if (contentDelimiterIndex >= 0) {
            // Found delimiter - extract only content after it
            let contentStartIndex = contentDelimiterIndex + 1;
            // Skip empty lines after delimiter
            while (contentStartIndex < newContentLines.length && newContentLines[contentStartIndex].trim() === '') {
                contentStartIndex++;
            }
            
            // Find where content ends (before Entity References section if present)
            let contentEndIndex = newContentLines.length;
            for (let i = contentStartIndex; i < newContentLines.length; i++) {
                if (newContentLines[i].trim() === '## Entity References' || 
                    newContentLines[i].trim().startsWith('## Entity References')) {
                    contentEndIndex = i;
                    break;
                }
            }
            
            // Use only the content section (stop before Entity References)
            newContent = newContentLines.slice(contentStartIndex, contentEndIndex).join('\n').trim();
        } else {
            // Has headers/metadata but no delimiter - this is invalid
            // Try to find where content might start (after Entity References section)
            const entityRefsMatch = newContent.match(/##\s+Entity\s+References[\s\S]*?\n\n([\s\S]*)$/i);
            if (entityRefsMatch) {
                newContent = entityRefsMatch[1].trim();
            } else {
                // If we can't extract content, throw an error
                throw new Error(
                    'The content parameter appears to include headers/metadata but no content delimiter (---) was found. ' +
                    'Please provide only the transcript body content (text after the --- delimiter), not the full transcript file.'
                );
            }
        }
    }
    
    // Now proceed with normal replacement logic
    // Split by lines to find the exact --- delimiter line in original
    const lines = originalText.split('\n');
    let delimiterIndex = -1;
    
    // Find the line that is exactly "---" (possibly with whitespace)
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            delimiterIndex = i;
            break;
        }
    }
    
    if (delimiterIndex >= 0) {
        // Found the delimiter - preserve everything up to and including it
        const metadataLines = lines.slice(0, delimiterIndex + 1);
        
        // Find Entity References section in original (if present) to preserve it
        let entityRefsStartIndex = -1;
        for (let i = delimiterIndex + 1; i < lines.length; i++) {
            if (lines[i].trim() === '## Entity References' || 
                lines[i].trim().startsWith('## Entity References')) {
                entityRefsStartIndex = i;
                break;
            }
        }
        
        // Reconstruct: metadata section (including ---) + new content + Entity References (if present)
        let result = metadataLines.join('\n') + '\n' + newContent;
        
        if (entityRefsStartIndex >= 0) {
            // Preserve Entity References section from original
            result += '\n\n' + lines.slice(entityRefsStartIndex).join('\n');
        }
        
        return result;
    }

    // Fallback: if no --- delimiter found, preserve the entire file structure
    // This shouldn't happen in normal transcripts, but handle it gracefully
    // Try to detect if there's a metadata section pattern
    const hasMetadataSection = originalText.match(/##\s+Metadata/i);
    if (hasMetadataSection) {
        // Has metadata section but no delimiter - add one before new content
        // Find where metadata likely ends (before content would start)
        const entityRefsMatch = originalText.match(/^([\s\S]*?##\s+Entity\s+References[\s\S]*?\n\n)([\s\S]*)$/i);
        if (entityRefsMatch) {
            return `${entityRefsMatch[1]}---\n\n${newContent}`;
        }
    }
    
    // Last resort: append delimiter and new content
    return `${originalText}\n\n---\n\n${newContent}`;
}

/**
 * Replace the Entity References section of a transcript file while preserving all other content
 * Transcript structure: [title]\n[metadata]\n---\n[content]\n---\n## Entity References\n[entities]
 */
function replaceEntityReferences(originalText: string, metadata: Metadata.TranscriptMetadata): string {
    const lines = originalText.split('\n');
    
    // Find where Entity References section starts
    let entityRefsStartIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '## Entity References' || 
            lines[i].trim().startsWith('## Entity References')) {
            entityRefsStartIndex = i;
            break;
        }
    }
    
    // Generate new Entity References section
    const newEntityRefsSection = Metadata.formatEntityMetadataMarkdown(metadata);
    
    if (entityRefsStartIndex >= 0) {
        // Entity References section exists - replace it
        // Find the content section delimiter (---) before Entity References
        // We want to preserve everything up to and including the content section
        let contentDelimiterIndex = -1;
        for (let i = entityRefsStartIndex - 1; i >= 0; i--) {
            if (lines[i].trim() === '---') {
                contentDelimiterIndex = i;
                break;
            }
        }
        
        if (contentDelimiterIndex >= 0) {
            // Found content delimiter - preserve everything up to end of content
            // Find where content actually ends (before Entity References)
            let contentEndIndex = entityRefsStartIndex;
            // Go backwards to find the last non-empty line before Entity References
            while (contentEndIndex > contentDelimiterIndex && 
                   (lines[contentEndIndex - 1].trim() === '' || 
                    lines[contentEndIndex - 1].trim() === '---')) {
                contentEndIndex--;
            }
            
            // Reconstruct: everything before Entity References + new Entity References section
            const beforeEntityRefs = lines.slice(0, contentEndIndex).join('\n');
            return beforeEntityRefs + newEntityRefsSection;
        } else {
            // No content delimiter found - replace from Entity References onwards
            return lines.slice(0, entityRefsStartIndex).join('\n') + newEntityRefsSection;
        }
    } else {
        // No Entity References section exists - append it
        // Find the content section delimiter (---) to append after content
        let contentDelimiterIndex = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].trim() === '---') {
                contentDelimiterIndex = i;
                break;
            }
        }
        
        if (contentDelimiterIndex >= 0) {
            // Found delimiter - append Entity References after content
            // Find where content ends (last non-empty line)
            let contentEndIndex = lines.length;
            for (let i = lines.length - 1; i > contentDelimiterIndex; i--) {
                if (lines[i].trim() !== '') {
                    contentEndIndex = i + 1;
                    break;
                }
            }
            
            const beforeEntityRefs = lines.slice(0, contentEndIndex).join('\n');
            return beforeEntityRefs + '\n' + newEntityRefsSection;
        } else {
            // No delimiter found - just append
            return originalText + '\n' + newEntityRefsSection;
        }
    }
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
    const contextDirectories = await getContextDirectories();
    const context = await Context.create({
        startingDir: args.contextDirectory || dirname(absolutePath),
        contextDirectories,
    });
    const reasoning = Reasoning.create({ model: args.model || DEFAULT_MODEL });

    const feedbackCtx: Transcript.FeedbackContext = {
        transcriptPath: absolutePath,
        transcriptContent,
        originalContent: transcriptContent,
        context,
        changes: [],
        verbose: false,
        dryRun: false,
    };

    await Transcript.processFeedback(args.feedback, feedbackCtx, reasoning);

    let result: { newPath: string; moved: boolean } | null = null;
    if (feedbackCtx.changes.length > 0) {
        result = await Transcript.applyChanges(feedbackCtx);
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

export async function handleCreateNote(args: {
    title: string;
    content?: string;
    projectId?: string;
    tags?: string[];
    date?: string;
    contextDirectory?: string;
}) {
    // Get the output directory
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    
    // Parse the date or use current date
    const noteDate = args.date ? new Date(args.date) : new Date();
    const year = noteDate.getFullYear();
    const month = String(noteDate.getMonth() + 1).padStart(2, '0');
    const day = String(noteDate.getDate()).padStart(2, '0');
    const hours = String(noteDate.getHours()).padStart(2, '0');
    const minutes = String(noteDate.getMinutes()).padStart(2, '0');
    const timestamp = String(noteDate.getTime());
    
    // Create a slug from the title for the filename
    const titleSlug = args.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50); // Limit length
    
    const filename = `${day}-${hours}${minutes}-${timestamp.substring(0, 14)}-${titleSlug}.md`;
    const relativePath = `${year}/${month}/${filename}`;
    const absolutePath = resolve(outputDirectory, relativePath);
    
    // Validate that the path stays within the output directory
    validatePathWithinDirectory(absolutePath, outputDirectory);
    
    // Build metadata
    const metadata: Metadata.TranscriptMetadata = {
        title: args.title,
        date: noteDate,
        projectId: args.projectId,
        tags: args.tags,
    };
    
    // If projectId is provided, try to get project name from context
    if (args.projectId) {
        try {
            const contextDirectories = await getContextDirectories();
            const context = await Context.create({
                startingDir: args.contextDirectory || process.cwd(),
                contextDirectories,
            });
            const project = await context.getProject(args.projectId);
            if (project) {
                metadata.project = project.name;
            }
        } catch {
            // Ignore errors - project name is optional
        }
    }
    
    // Build entities for frontmatter
    const entities: Metadata.TranscriptMetadata['entities'] = {
        people: [],
        projects: args.projectId && metadata.project ? [{
            id: args.projectId,
            name: metadata.project,
            type: 'project' as const,
        }] : [],
        terms: [],
        companies: [],
    };
    
    // Build full metadata with entities
    const fullMetadata: Metadata.TranscriptMetadata = {
        ...metadata,
        entities,
        status: 'reviewed' as const, // Default status for new notes
    };
    
    // Use frontmatter stringification for proper YAML format
    const transcriptContent = await import('@/util/frontmatter').then(fm => 
        fm.stringifyTranscript(fullMetadata, args.content || '')
    );
    
    // Create directory if it doesn't exist
    await mkdir(dirname(absolutePath), { recursive: true });
    
    // Write the file
    await writeFile(absolutePath, transcriptContent, 'utf-8');
    
    // Convert to relative path for response
    const relativeOutputPath = await sanitizePath(absolutePath, outputDirectory);
    
    return {
        success: true,
        filePath: relativeOutputPath,
        filename: filename,
        message: `Note "${args.title}" created successfully`,
    };
}
