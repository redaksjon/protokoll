/**
 * Status and Task Tools - MCP tools for managing transcript lifecycle status and tasks
 * 
 * PKL-only implementation - all transcripts are stored in PKL format.
 */
// eslint-disable-next-line import/extensions
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { 
    isValidStatus, 
    VALID_STATUSES,
} from '@redaksjon/protokoll-engine';
import { getConfiguredDirectory, sanitizePath, resolveTranscriptPath } from './shared';
import { PklTranscript } from '@redaksjon/protokoll-format';
import type { Task as PklTask, TranscriptStatus } from '@redaksjon/protokoll-format';

// ============================================================================
// Helper Functions
// ============================================================================

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
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
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
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
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
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
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
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
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
    
    const newStatus = args.status as TranscriptStatus;
    
    // Find the transcript
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);
    
    const transcript = PklTranscript.open(absolutePath, { readOnly: false });
    try {
        const oldStatus = transcript.metadata.status || 'reviewed';
        
        // Check if status is actually changing
        if (oldStatus === newStatus) {
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
        
        // Update status
        transcript.updateMetadata({ status: newStatus });
        
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
    } finally {
        transcript.close();
    }
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
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);
    
    const transcript = PklTranscript.open(absolutePath, { readOnly: false });
    try {
        // Create a new task
        const taskId = `task-${Date.now()}`;
        const newTask: PklTask = {
            id: taskId,
            description: args.description.trim(),
            status: 'open',
            created: new Date(),
        };
        
        // Get existing tasks and add the new one
        const existingTasks = transcript.metadata.tasks || [];
        transcript.updateMetadata({ tasks: [...existingTasks, newTask] });
        
        const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
        const relativePath = await sanitizePath(absolutePath, outputDirectory);
        
        return {
            success: true,
            filePath: relativePath,
            task: {
                id: newTask.id,
                description: newTask.description,
                status: newTask.status,
                created: newTask.created.toISOString(),
            },
            message: `Task created: ${newTask.id}`,
        };
    } finally {
        transcript.close();
    }
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
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);
    
    const transcript = PklTranscript.open(absolutePath, { readOnly: false });
    try {
        // Find the task
        const tasks = transcript.metadata.tasks || [];
        const task = tasks.find(t => t.id === args.taskId);
        if (!task) {
            throw new Error(`Task not found: ${args.taskId}`);
        }
        
        // Update the task to done
        const updatedTasks = tasks.map(t => 
            t.id === args.taskId 
                ? { ...t, status: 'done' as const, completed: new Date() }
                : t
        );
        transcript.updateMetadata({ tasks: updatedTasks });
        
        const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
        const relativePath = await sanitizePath(absolutePath, outputDirectory);
        
        return {
            success: true,
            filePath: relativePath,
            taskId: args.taskId,
            description: task.description,
            message: `Task completed: ${args.taskId}`,
        };
    } finally {
        transcript.close();
    }
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
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);
    
    const transcript = PklTranscript.open(absolutePath, { readOnly: false });
    try {
        // Find the task before deleting
        const tasks = transcript.metadata.tasks || [];
        const task = tasks.find(t => t.id === args.taskId);
        if (!task) {
            throw new Error(`Task not found: ${args.taskId}`);
        }
        
        // Remove the task
        const updatedTasks = tasks.filter(t => t.id !== args.taskId);
        transcript.updateMetadata({ tasks: updatedTasks });
        
        const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
        const relativePath = await sanitizePath(absolutePath, outputDirectory);
        
        return {
            success: true,
            filePath: relativePath,
            taskId: args.taskId,
            description: task.description,
            message: `Task deleted: ${args.taskId}`,
        };
    } finally {
        transcript.close();
    }
}

// Export all tools from this module
export const statusTools: Tool[] = [
    setStatusTool,
    createTaskTool,
    completeTaskTool,
    deleteTaskTool,
];
