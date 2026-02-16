/* eslint-disable import/extensions */
/**
 * Transcript Tools - Read, list, edit, combine, and provide feedback on transcripts
 */
 
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { resolve, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import * as Context from '@/context';
import { Reasoning, Transcript } from '@redaksjon/protokoll-engine';
import { DEFAULT_MODEL } from '@/constants';

import { fileExists, getConfiguredDirectory, getContextDirectories, sanitizePath, validatePathWithinDirectory, validatePathWithinOutputDirectory, validateNotRemoteMode, resolveTranscriptPath } from './shared.js';
import * as Metadata from '@redaksjon/protokoll-engine';
import { Transcript as TranscriptUtils } from '@redaksjon/protokoll-engine';
const { ensurePklExtension, transcriptExists } = TranscriptUtils;
import { 
    PklTranscript, 
    readTranscript as readTranscriptFromStorage,
    listTranscripts as listTranscriptsFromStorage,
} from '@redaksjon/protokoll-format';

// ============================================================================
// Helper Functions
// ============================================================================

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
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
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
            entityId: {
                type: 'string',
                description: 'Filter to transcripts that reference this entity ID',
            },
            entityType: {
                type: 'string',
                enum: ['person', 'project', 'term', 'company'],
                description: 'Entity type to filter by (used with entityId to narrow search)',
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
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
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
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
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
                    'Examples: ["meeting-1.pkl", "meeting-2.pkl"] or ["2026/2/01-1325.pkl", "2026/2/01-1400.pkl"]',
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
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
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
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
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
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
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

export const getEnhancementLogTool: Tool = {
    name: 'protokoll_get_enhancement_log',
    description:
        'Get the enhancement log for a transcript. ' +
        'Returns a timestamped audit trail of enhancement pipeline steps (transcribe, enhance, simple-replace phases). ' +
        'Shows what happened during processing: entities found, corrections applied, tools called, etc.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            phase: {
                type: 'string',
                enum: ['transcribe', 'enhance', 'simple-replace'],
                description: 'Optional: Filter to a specific phase',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of entries to return (default: 100)',
            },
            offset: {
                type: 'number',
                description: 'Number of entries to skip for pagination (default: 0)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath'],
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
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);

    // Use protokoll-format storage API directly - returns structured JSON
    const transcriptData = await readTranscriptFromStorage(absolutePath);

    // Convert to relative path for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativePath = await sanitizePath(absolutePath, outputDirectory);

    // Return complete structured JSON for client display
    // Clients should NOT need to parse this - all data is ready to display
    return {
        filePath: relativePath,
        title: transcriptData.metadata.title || '',
        metadata: {
            date: transcriptData.metadata.date?.toISOString() || null,
            recordingTime: transcriptData.metadata.recordingTime || null,
            duration: transcriptData.metadata.duration || null,
            project: transcriptData.metadata.project || null,
            projectId: transcriptData.metadata.projectId || null,
            tags: transcriptData.metadata.tags || [],
            status: transcriptData.metadata.status || 'initial',
            confidence: transcriptData.metadata.confidence || null,
            routing: transcriptData.metadata.routing || null,
            history: transcriptData.metadata.history || [],
            tasks: transcriptData.metadata.tasks || [],
            entities: transcriptData.metadata.entities || {},
        },
        content: transcriptData.content,
        hasRawTranscript: transcriptData.hasRawTranscript,
        contentLength: transcriptData.content.length,
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
    entityId?: string;
    entityType?: 'person' | 'project' | 'term' | 'company';
    contextDirectory?: string;
}) {
    // Get directory from args or config
    const directory = args.directory 
        ? resolve(args.directory)
        : await getConfiguredDirectory('outputDirectory', args.contextDirectory);

    if (!await fileExists(directory)) {
        throw new Error(`Directory not found: ${directory}`);
    }

    // Use protokoll-format storage API directly
    const result = await listTranscriptsFromStorage({
        directory,
        limit: args.limit ?? 50,
        offset: args.offset ?? 0,
        sortBy: args.sortBy ?? 'date',
        startDate: args.startDate,
        endDate: args.endDate,
        search: args.search,
        // entityId: args.entityId,
        // entityType: args.entityType,
    });

    // Convert all paths to relative paths from output directory
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativeTranscripts = await Promise.all(
        result.transcripts.map(async (t) => ({
            path: await sanitizePath(t.filePath, outputDirectory),
            relativePath: t.relativePath,
            title: t.title,
            date: t.date?.toISOString() || null,
            project: t.project || null,
            tags: t.tags,
            status: t.status,
            duration: t.duration || null,
            contentPreview: t.contentPreview,
        }))
    );

    return {
        directory: await sanitizePath(directory, outputDirectory) || '.',
        transcripts: relativeTranscripts,
        pagination: {
            total: result.total,
            limit: args.limit ?? 50,
            offset: args.offset ?? 0,
            hasMore: result.hasMore,
            nextOffset: result.hasMore ? (args.offset ?? 0) + (args.limit ?? 50) : null,
        },
        filters: {
            sortBy: args.sortBy ?? 'date',
            startDate: args.startDate,
            endDate: args.endDate,
            search: args.search,
            entityId: args.entityId,
            entityType: args.entityType,
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
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);

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
    // The editTranscript function handles PKL files directly
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

        // editTranscript handles file operations internally for PKL files
        if (result.outputPath !== absolutePath) {
            wasRenamed = true;
        }
        
        finalOutputPath = result.outputPath;
    }

    // Handle status change using PklTranscript
    let statusChanged = false;
    let previousStatus: string | undefined;
    
    if (args.status) {
        const pklPath = ensurePklExtension(finalOutputPath);
        const transcript = PklTranscript.open(pklPath, { readOnly: false });
        try {
            previousStatus = transcript.metadata.status || 'reviewed';
            
            if (previousStatus !== args.status) {
                transcript.updateMetadata({ status: args.status as Metadata.TranscriptStatus });
                statusChanged = true;
                // eslint-disable-next-line no-console
                console.log('✅ Status update completed successfully');
            }
        } finally {
            transcript.close();
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
    const fsPromises = await import('node:fs/promises');
    const path = await import('node:path');
    
    // Get the output directory
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    
    // Find the transcript (returns absolute path)
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);
    
    // Parse the new date
    const newDate = new Date(args.newDate);
    if (isNaN(newDate.getTime())) {
        throw new Error(`Invalid date format: ${args.newDate}. Use ISO 8601 format (e.g., "2026-01-15" or "2026-01-15T10:30:00Z")`);
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
        // Still update the date in metadata even if not moving
        const pklPath = ensurePklExtension(absolutePath);
        const transcript = PklTranscript.open(pklPath, { readOnly: false });
        try {
            transcript.updateMetadata({ date: newDate });
        } finally {
            transcript.close();
        }
        
        return {
            success: true,
            originalPath: await sanitizePath(pklPath, outputDirectory),
            outputPath: await sanitizePath(pklPath, outputDirectory),
            moved: false,
            message: 'Transcript date updated. No move needed (already in correct directory).',
        };
    }
    
    // Validate that the new path stays within the output directory
    validatePathWithinDirectory(newAbsolutePath, outputDirectory);
    
    // Create the new directory if it doesn't exist
    await mkdir(newDirPath, { recursive: true });
    
    // Check if a file already exists at the destination
    const destExists = await transcriptExists(newAbsolutePath);
    if (destExists.exists) {
        throw new Error(
            `A file already exists at the destination: ${await sanitizePath(destExists.path || newAbsolutePath, outputDirectory)}. ` +
            `Please rename the transcript first or choose a different date.`
        );
    }
    
    // Ensure we're working with PKL files
    const pklPath = ensurePklExtension(absolutePath);
    const newPklPath = ensurePklExtension(newAbsolutePath);
    
    // Update the date in metadata
    const transcript = PklTranscript.open(pklPath, { readOnly: false });
    try {
        transcript.updateMetadata({ date: newDate });
    } finally {
        transcript.close();
    }
    
    // Move the file to the new location
    await fsPromises.rename(pklPath, newPklPath);
    
    // Also move any associated WAL/SHM files if they exist
    const walPath = pklPath + '-wal';
    const shmPath = pklPath + '-shm';
    try {
        await fsPromises.rename(walPath, newPklPath + '-wal');
    } catch { /* ignore if doesn't exist */ }
    try {
        await fsPromises.rename(shmPath, newPklPath + '-shm');
    } catch { /* ignore if doesn't exist */ }
    
    // Convert to relative paths for response
    const relativeOriginalPath = await sanitizePath(pklPath, outputDirectory);
    const relativeOutputPath = await sanitizePath(newPklPath, outputDirectory);
    
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
        const absolute = await resolveTranscriptPath(relativePath, args.contextDirectory);
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

    // The combineTranscripts function in operations.ts now creates the PKL file directly
    // No additional validation or writing needed here - the file is already saved

    // Delete source files
    const fsPromises = await import('node:fs/promises');
    const deletedFiles: string[] = [];
    for (const sourcePath of absolutePaths) {
        try {
            await fsPromises.unlink(sourcePath);
            deletedFiles.push(sourcePath);
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
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);

    // Ensure we're working with a PKL file
    const pklPath = ensurePklExtension(absolutePath);
    
    const transcript = PklTranscript.open(pklPath, { readOnly: false });
    try {
        // Update the content - PklTranscript handles history tracking automatically
        transcript.updateContent(args.content);
    } finally {
        transcript.close();
    }

    // Convert to relative path for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativePath = await sanitizePath(pklPath, outputDirectory);

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
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);

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

    // Ensure we're working with a PKL file
    const pklPath = ensurePklExtension(absolutePath);
    
    const transcript = PklTranscript.open(pklPath, { readOnly: false });
    const transcriptUuid = transcript.metadata.id;
    const projectId = transcript.metadata.project;
    try {
        // Update entities in metadata
        transcript.updateMetadata({ entities });
    } finally {
        transcript.close();
    }

    // Update weight model incrementally
    const { updateTranscriptInWeightModel } = await import('../services/weightModel');
    const allEntityIds = entityReferences.map(e => e.id);
    updateTranscriptInWeightModel(transcriptUuid, allEntityIds, projectId);

    // Convert to relative path for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativePath = await sanitizePath(pklPath, outputDirectory);

    return {
        success: true,
        filePath: relativePath,
        message: 'Transcript entity references updated successfully',
    };
}

export async function handleProvideFeedback(args: {
    transcriptPath: string;
    feedback: string;
    model?: string;
    contextDirectory?: string;
}) {
    // Find the transcript (returns absolute path for file operations)
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);

    // Ensure we're working with a PKL file
    const pklPath = ensurePklExtension(absolutePath);
    
    const transcript = PklTranscript.open(pklPath, { readOnly: false });
    try {
        const transcriptContent = transcript.content;
        const contextDirectories = await getContextDirectories();
        const context = await Context.create({
            startingDir: args.contextDirectory || dirname(pklPath),
            contextDirectories,
        });
        const reasoning = Reasoning.create({ model: args.model || DEFAULT_MODEL });

        // Create a feedback context
        const feedbackCtx: Transcript.FeedbackContext = {
            transcriptPath: pklPath,
            transcriptContent,
            originalContent: transcriptContent,
            context,
            changes: [],
            verbose: false,
            dryRun: true, // Set to dry run so we can apply changes ourselves
        };

        await Transcript.processFeedback(args.feedback, feedbackCtx, reasoning);

        // Apply content changes to the PKL file
        if (feedbackCtx.changes.length > 0) {
            // Update content if it changed
            if (feedbackCtx.transcriptContent !== transcriptContent) {
                transcript.updateContent(feedbackCtx.transcriptContent);
            }
            
            // Handle title changes
            const titleChange = feedbackCtx.changes.find(c => c.type === 'title_changed');
            if (titleChange && titleChange.details.new_title) {
                transcript.updateMetadata({ title: titleChange.details.new_title as string });
            }
            
            // Handle project changes
            const projectChange = feedbackCtx.changes.find(c => c.type === 'project_changed');
            if (projectChange && projectChange.details.project_id) {
                transcript.updateMetadata({ 
                    projectId: projectChange.details.project_id as string,
                    project: projectChange.details.project_name as string | undefined,
                });
            }
        }

        // Convert to relative path for response
        const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
        const relativeOutputPath = await sanitizePath(pklPath, outputDirectory);

        return {
            success: true,
            changesApplied: feedbackCtx.changes.length,
            changes: feedbackCtx.changes.map(c => ({
                type: c.type,
                description: c.description,
            })),
            outputPath: relativeOutputPath,
            moved: false,
        };
    } finally {
        transcript.close();
    }
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
    
    // Use .pkl extension for PKL format
    const filename = `${day}-${hours}${minutes}-${timestamp.substring(0, 14)}-${titleSlug}.pkl`;
    const relativePath = `${year}/${month}/${filename}`;
    const absolutePath = resolve(outputDirectory, relativePath);
    
    // Validate that the path stays within the output directory
    validatePathWithinDirectory(absolutePath, outputDirectory);
    
    // Build metadata
    let projectName: string | undefined;
    
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
                projectName = project.name;
            }
        } catch {
            // Ignore errors - project name is optional
        }
    }
    
    // Build entities
    const entities = {
        people: [] as Metadata.EntityReference[],
        projects: args.projectId && projectName ? [{
            id: args.projectId,
            name: projectName,
            type: 'project' as const,
        }] : [] as Metadata.EntityReference[],
        terms: [] as Metadata.EntityReference[],
        companies: [] as Metadata.EntityReference[],
    };
    
    // Build PKL metadata
    const pklMetadata = {
        id: '', // Will be auto-generated by PklTranscript.create()
        title: args.title,
        date: noteDate,
        projectId: args.projectId,
        project: projectName,
        tags: args.tags || [],
        entities,
        status: 'reviewed' as const, // Default status for new notes
    };
    
    // Create directory if it doesn't exist
    await mkdir(dirname(absolutePath), { recursive: true });
    
    // Create PKL transcript
    const transcript = PklTranscript.create(absolutePath, pklMetadata);
    try {
        if (args.content) {
            transcript.updateContent(args.content);
        }
    } finally {
        transcript.close();
    }
    
    // Convert to relative path for response
    const relativeOutputPath = await sanitizePath(absolutePath, outputDirectory);
    
    return {
        success: true,
        filePath: relativeOutputPath,
        filename: filename,
        message: `Note "${args.title}" created successfully`,
    };
}

export async function handleGetEnhancementLog(args: {
    transcriptPath: string;
    phase?: 'transcribe' | 'enhance' | 'simple-replace';
    limit?: number;
    offset?: number;
    contextDirectory?: string;
}) {
    // Find the transcript (returns absolute path for file operations)
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);

    // Open the transcript in read-only mode
    const transcript = PklTranscript.open(absolutePath, { readOnly: true });
    
    try {
        // Get enhancement log with optional phase filter
        // TODO: Re-enable when getEnhancementLog is available in protokoll-format
        const allEntries: any[] = []; // transcript.getEnhancementLog(args.phase ? { phase: args.phase } : undefined);
        
        // Apply pagination
        const limit = args.limit ?? 100;
        const offset = args.offset ?? 0;
        const total = allEntries.length;
        const entries = allEntries.slice(offset, offset + limit);
        
        // Convert entries to serializable format
        const serializedEntries = entries.map((entry: any) => ({
            id: entry.id,
            timestamp: entry.timestamp.toISOString(),
            phase: entry.phase,
            action: entry.action,
            details: entry.details,
            entities: entry.entities,
        }));
        
        return {
            entries: serializedEntries,
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
        };
    } finally {
        transcript.close();
    }
}
