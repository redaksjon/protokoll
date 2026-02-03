/**
 * Status and Task Tools - MCP tools for managing transcript lifecycle status and tasks
 */
// eslint-disable-next-line import/extensions
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { readFile, writeFile } from 'node:fs/promises';
import { 
    parseTranscriptContent, 
    stringifyTranscript,
    TranscriptStatus,
} from '@/util/frontmatter';
import { 
    updateStatus, 
    isValidStatus, 
    VALID_STATUSES,
    addTask,
    completeTask as completeTaskUtil,
    deleteTask as deleteTaskUtil,
} from '@/util/metadata';
import { fileExists, getConfiguredDirectory, sanitizePath, validatePathWithinDirectory } from './shared';
import { resolve, isAbsolute } from 'node:path';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find a transcript by relative path (relative to output directory)
 * Returns absolute path for internal file operations
 */
async function findTranscriptPath(
    relativePath: string,
    contextDirectory?: string
): Promise<string> {
    if (!relativePath || typeof relativePath !== 'string') {
        throw new Error('transcriptPath is required and must be a non-empty string');
    }
    
    const outputDirectory = await getConfiguredDirectory('outputDirectory', contextDirectory);
    
    let resolvedPath: string;
    
    if (isAbsolute(relativePath)) {
        const normalizedAbsolute = resolve(relativePath);
        const normalizedOutputDir = resolve(outputDirectory);
        
        if (normalizedAbsolute.startsWith(normalizedOutputDir + '/') || normalizedAbsolute === normalizedOutputDir) {
            resolvedPath = normalizedAbsolute;
        } else {
            throw new Error(`Path must be within output directory: ${outputDirectory}`);
        }
    } else {
        const normalizedPath = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
        resolvedPath = resolve(outputDirectory, normalizedPath);
    }
    
    validatePathWithinDirectory(resolvedPath, outputDirectory);
    
    if (!await fileExists(resolvedPath)) {
        throw new Error(`Transcript not found: ${relativePath}`);
    }
    
    return resolvedPath;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const setStatusTool: Tool = {
    name: 'protokoll_set_status',
    description:
        'Change the lifecycle status of a transcript. ' +
        'Valid statuses: initial, enhanced, reviewed, in_progress, closed, archived. ' +
        'Status transitions are recorded in history with timestamps. ' +
        'Use this to track transcript progress through your workflow.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description:
                    'Relative path to the transcript from the output directory. ' +
                    'Examples: "meeting-notes.md", "2026/2/01-1325.md"',
            },
            status: {
                type: 'string',
                enum: VALID_STATUSES,
                description:
                    'New status to set. ' +
                    'initial/enhanced: Pipeline states. ' +
                    'reviewed: User has reviewed. ' +
                    'in_progress: Has tasks to complete. ' +
                    'closed: All work done. ' +
                    'archived: Long-term storage.',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'status'],
    },
};

export const createTaskTool: Tool = {
    name: 'protokoll_create_task',
    description:
        'Add a new task to a transcript. Tasks are follow-up actions to complete. ' +
        'Returns the generated task ID for later reference.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description:
                    'Relative path to the transcript from the output directory. ' +
                    'Examples: "meeting-notes.md", "2026/2/01-1325.md"',
            },
            description: {
                type: 'string',
                description: 'Description of the task (1-2 sentences)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'description'],
    },
};

export const completeTaskTool: Tool = {
    name: 'protokoll_complete_task',
    description: 'Mark a task as done. Sets the completed timestamp.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description:
                    'Relative path to the transcript from the output directory. ' +
                    'Examples: "meeting-notes.md", "2026/2/01-1325.md"',
            },
            taskId: {
                type: 'string',
                description: 'ID of the task to complete (e.g., "task-1234567890-abc123")',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'taskId'],
    },
};

export const deleteTaskTool: Tool = {
    name: 'protokoll_delete_task',
    description: 'Remove a task from a transcript permanently.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description:
                    'Relative path to the transcript from the output directory. ' +
                    'Examples: "meeting-notes.md", "2026/2/01-1325.md"',
            },
            taskId: {
                type: 'string',
                description: 'ID of the task to delete (e.g., "task-1234567890-abc123")',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'taskId'],
    },
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleSetStatus(args: {
    transcriptPath: string;
    status: string;
    contextDirectory?: string;
}) {
    // Validate status
    if (!isValidStatus(args.status)) {
        throw new Error(
            `Invalid status "${args.status}". ` +
            `Valid statuses are: ${VALID_STATUSES.join(', ')}`
        );
    }
    
    const newStatus: TranscriptStatus = args.status;
    
    // Find the transcript
    const absolutePath = await findTranscriptPath(args.transcriptPath, args.contextDirectory);
    
    // Read current content
    const content = await readFile(absolutePath, 'utf-8');
    
    // Parse the transcript
    const parsed = parseTranscriptContent(content);
    const oldStatus = parsed.metadata.status || 'reviewed';
    
    // Check if status is actually changing
    if (oldStatus === newStatus) {
        // No change needed - return early
        const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
        const relativePath = await sanitizePath(absolutePath, outputDirectory);
        
        return {
            success: true,
            filePath: relativePath,
            previousStatus: oldStatus,
            newStatus: newStatus,
            changed: false,
            message: `Status is already '${newStatus}'`,
        };
    }
    
    // Update status (records transition in history)
    const updatedMetadata = updateStatus(parsed.metadata, newStatus);
    
    // Write updated transcript
    const updatedContent = stringifyTranscript(updatedMetadata, parsed.body);
    await writeFile(absolutePath, updatedContent, 'utf-8');
    
    // Convert to relative path for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativePath = await sanitizePath(absolutePath, outputDirectory);
    
    return {
        success: true,
        filePath: relativePath,
        previousStatus: oldStatus,
        newStatus: newStatus,
        changed: true,
        message: `Status changed from '${oldStatus}' to '${newStatus}'`,
    };
}

// ============================================================================
// Task Handlers
// ============================================================================

export async function handleCreateTask(args: {
    transcriptPath: string;
    description: string;
    contextDirectory?: string;
}) {
    if (!args.description || typeof args.description !== 'string' || args.description.trim() === '') {
        throw new Error('Task description is required and must be a non-empty string');
    }
    
    // Find the transcript
    const absolutePath = await findTranscriptPath(args.transcriptPath, args.contextDirectory);
    
    // Read current content
    const content = await readFile(absolutePath, 'utf-8');
    
    // Parse the transcript
    const parsed = parseTranscriptContent(content);
    
    // Add the task
    const { metadata: updatedMetadata, task } = addTask(parsed.metadata, args.description.trim());
    
    // Write updated transcript
    const updatedContent = stringifyTranscript(updatedMetadata, parsed.body);
    await writeFile(absolutePath, updatedContent, 'utf-8');
    
    // Convert to relative path for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativePath = await sanitizePath(absolutePath, outputDirectory);
    
    return {
        success: true,
        filePath: relativePath,
        task: {
            id: task.id,
            description: task.description,
            status: task.status,
            created: task.created,
        },
        message: `Task created: ${task.id}`,
    };
}

export async function handleCompleteTask(args: {
    transcriptPath: string;
    taskId: string;
    contextDirectory?: string;
}) {
    if (!args.taskId || typeof args.taskId !== 'string') {
        throw new Error('Task ID is required');
    }
    
    // Find the transcript
    const absolutePath = await findTranscriptPath(args.transcriptPath, args.contextDirectory);
    
    // Read current content
    const content = await readFile(absolutePath, 'utf-8');
    
    // Parse the transcript
    const parsed = parseTranscriptContent(content);
    
    // Find the task
    const task = parsed.metadata.tasks?.find(t => t.id === args.taskId);
    if (!task) {
        throw new Error(`Task not found: ${args.taskId}`);
    }
    
    // Complete the task
    const updatedMetadata = completeTaskUtil(parsed.metadata, args.taskId);
    
    // Write updated transcript
    const updatedContent = stringifyTranscript(updatedMetadata, parsed.body);
    await writeFile(absolutePath, updatedContent, 'utf-8');
    
    // Convert to relative path for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativePath = await sanitizePath(absolutePath, outputDirectory);
    
    return {
        success: true,
        filePath: relativePath,
        taskId: args.taskId,
        description: task.description,
        message: `Task completed: ${args.taskId}`,
    };
}

export async function handleDeleteTask(args: {
    transcriptPath: string;
    taskId: string;
    contextDirectory?: string;
}) {
    if (!args.taskId || typeof args.taskId !== 'string') {
        throw new Error('Task ID is required');
    }
    
    // Find the transcript
    const absolutePath = await findTranscriptPath(args.transcriptPath, args.contextDirectory);
    
    // Read current content
    const content = await readFile(absolutePath, 'utf-8');
    
    // Parse the transcript
    const parsed = parseTranscriptContent(content);
    
    // Find the task before deleting (for the response)
    const task = parsed.metadata.tasks?.find(t => t.id === args.taskId);
    if (!task) {
        throw new Error(`Task not found: ${args.taskId}`);
    }
    
    // Delete the task
    const updatedMetadata = deleteTaskUtil(parsed.metadata, args.taskId);
    
    // Write updated transcript
    const updatedContent = stringifyTranscript(updatedMetadata, parsed.body);
    await writeFile(absolutePath, updatedContent, 'utf-8');
    
    // Convert to relative path for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativePath = await sanitizePath(absolutePath, outputDirectory);
    
    return {
        success: true,
        filePath: relativePath,
        taskId: args.taskId,
        description: task.description,
        message: `Task deleted: ${args.taskId}`,
    };
}

// Export all tools from this module
export const statusTools: Tool[] = [
    setStatusTool,
    createTaskTool,
    completeTaskTool,
    deleteTaskTool,
];
