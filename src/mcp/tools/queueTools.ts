/**
 * Queue Management Tools
 * 
 * MCP tools for monitoring and managing the audio upload transcription queue.
 * Provides visibility into pending uploads, processing status, and recent completions.
 */

// eslint-disable-next-line import/extensions
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PklTranscript } from '@redaksjon/protokoll-format';
import type { TranscriptMetadata } from '@redaksjon/protokoll-format';
import { Transcript } from '@redaksjon/protokoll-engine';

const { 
    findUploadedTranscripts,
    findTranscribingTranscripts,
    resetTranscriptToUploaded,
    findTranscriptByUuid,
} = Transcript;
import { getOutputDirectory } from '../serverConfig';
import { sanitizePath } from './shared';
import { unlink } from 'node:fs/promises';
import type { TranscriptionWorker } from '../worker/transcription-worker';

// Worker instance will be set by server
let workerInstance: TranscriptionWorker | null = null;

export function setWorkerInstance(worker: TranscriptionWorker | null): void {
    workerInstance = worker;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const queueStatusTool: Tool = {
    name: 'protokoll_queue_status',
    description: 'Get current upload queue status - pending transcriptions, processing, and recent completions. Shows what audio files are waiting to be transcribed and which are currently being processed.',
    inputSchema: {
        type: 'object',
        properties: {},
    },
};

export const getTranscriptByUuidTool: Tool = {
    name: 'protokoll_get_transcript_by_uuid',
    description: 'Get transcript metadata and status by UUID. Accepts either full UUID or 8-character prefix. Useful for checking upload status after receiving UUID from upload endpoint.',
    inputSchema: {
        type: 'object',
        properties: {
            uuid: {
                type: 'string',
                description: 'UUID or 8-character UUID prefix',
            },
            includeContent: {
                type: 'boolean',
                description: 'Include transcript content (default: false). Only works for transcripts in initial/enhanced/reviewed status.',
            },
        },
        required: ['uuid'],
    },
};

export const retryTranscriptionTool: Tool = {
    name: 'protokoll_retry_transcription',
    description: 'Retry a failed transcription by resetting status from error to uploaded. The transcript will be re-queued for processing.',
    inputSchema: {
        type: 'object',
        properties: {
            uuid: {
                type: 'string',
                description: 'UUID of transcript to retry',
            },
        },
        required: ['uuid'],
    },
};

export const cancelTranscriptionTool: Tool = {
    name: 'protokoll_cancel_transcription',
    description: 'Cancel a pending or processing transcription. Optionally delete the PKL file.',
    inputSchema: {
        type: 'object',
        properties: {
            uuid: {
                type: 'string',
                description: 'UUID of transcript to cancel',
            },
            deleteFile: {
                type: 'boolean',
                description: 'Also delete the PKL file (default: false)',
            },
        },
        required: ['uuid'],
    },
};

export const workerStatusTool: Tool = {
    name: 'protokoll_worker_status',
    description: 'Get background transcription worker status and statistics. Shows if worker is running, current task, total processed, and uptime.',
    inputSchema: {
        type: 'object',
        properties: {},
    },
};

export const restartWorkerTool: Tool = {
    name: 'protokoll_restart_worker',
    description: 'Restart the background transcription worker. Useful if worker is stuck or needs to reload configuration.',
    inputSchema: {
        type: 'object',
        properties: {},
    },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get transcribing start time from metadata history
 */
function getTranscribingStartTime(metadata: TranscriptMetadata): string {
    if (!metadata.history || metadata.history.length === 0) {
        return metadata.date?.toISOString() || '';
    }
    
    // Find the most recent transition to 'transcribing' status
    const transcribingTransition = metadata.history
        .filter(h => h.to === 'transcribing')
        .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    
    return transcribingTransition?.at.toISOString() || metadata.date?.toISOString() || '';
}

/**
 * Get completion time from metadata
 */
function getCompletionTime(metadata: TranscriptMetadata): string {
    if (!metadata.history || metadata.history.length === 0) {
        return '';
    }
    
    // Find the most recent status transition
    const lastTransition = metadata.history
        .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    
    return lastTransition?.at.toISOString() || '';
}

/**
 * Find recent transcripts (completed in last 24 hours)
 */
async function findRecentTranscripts(
    searchDirectories: string[],
    limit: number
): Promise<Array<{ uuid: string; filePath: string; metadata: TranscriptMetadata }>> {
    const results: Array<{ uuid: string; filePath: string; metadata: TranscriptMetadata }> = [];
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Import glob here to avoid issues
    const { glob } = await import('glob');
    
    for (const dir of searchDirectories) {
        const files = await glob('????????-*.pkl', { cwd: dir, absolute: true });
        
        for (const file of files) {
            try {
                const transcript = PklTranscript.open(file, { readOnly: true });
                const metadata = transcript.metadata;
                
                // Include if completed recently (status changed in last 24h)
                const recentlyCompleted = metadata.history?.some(h => 
                    h.at >= oneDayAgo && 
                    ['initial', 'enhanced', 'reviewed', 'error'].includes(h.to)
                );
                
                if (recentlyCompleted) {
                    results.push({ 
                        uuid: metadata.id, 
                        filePath: file, 
                        metadata 
                    });
                }
                
                await transcript.close();
            } catch (error) {
                // Skip files that can't be opened
                // eslint-disable-next-line no-console
                console.warn(`Failed to open transcript ${file}:`, error);
            }
        }
    }
    
    // Sort by most recent first
    results.sort((a, b) => {
        const aTime = a.metadata.history?.[a.metadata.history.length - 1]?.at.getTime() || 0;
        const bTime = b.metadata.history?.[b.metadata.history.length - 1]?.at.getTime() || 0;
        return bTime - aTime;
    });
    
    return results.slice(0, limit);
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Get current queue status
 */
export async function handleQueueStatus(): Promise<{
    pending: Array<{ uuid: string; filename: string; uploadedAt: string }>;
    processing: Array<{ uuid: string; filename: string; startedAt: string }>;
    recent: Array<{ uuid: string; filename: string; completedAt: string; status: string }>;
    totalPending: number;
}> {
    const outputDir = getOutputDirectory();
    
    const uploaded = await findUploadedTranscripts([outputDir]);
    const transcribing = await findTranscribingTranscripts([outputDir]);
    const recent = await findRecentTranscripts([outputDir], 10);
    
    return {
        pending: uploaded.map(t => ({
            uuid: t.uuid,
            filename: t.metadata.audioFile || 'unknown',
            uploadedAt: t.metadata.date?.toISOString() || '',
        })),
        processing: transcribing.map(t => ({
            uuid: t.uuid,
            filename: t.metadata.audioFile || 'unknown',
            startedAt: getTranscribingStartTime(t.metadata),
        })),
        recent: recent.map(t => ({
            uuid: t.uuid,
            filename: t.metadata.audioFile || t.metadata.title || 'unknown',
            completedAt: getCompletionTime(t.metadata),
            status: t.metadata.status || 'unknown',
        })),
        totalPending: uploaded.length,
    };
}

/**
 * Get transcript by UUID
 */
export async function handleGetTranscriptByUuid(args: {
    uuid: string;
    includeContent?: boolean;
}): Promise<{
    found: boolean;
    uuid?: string;
    filePath?: string;
    metadata?: TranscriptMetadata;
    content?: string;
    error?: string;
}> {
    try {
        const outputDir = getOutputDirectory();
        const filePath = await findTranscriptByUuid(args.uuid, [outputDir]);
        
        if (!filePath) {
            return { found: false, error: `No transcript found for UUID: ${args.uuid}` };
        }
        
        const transcript = PklTranscript.open(filePath, { readOnly: true });
        const metadata = transcript.metadata;
        
        const result: {
            found: boolean;
            uuid?: string;
            filePath?: string;
            metadata?: TranscriptMetadata;
            content?: string;
        } = {
            found: true,
            uuid: metadata.id,
            filePath: await sanitizePath(filePath, outputDir),
            metadata,
        };
        
        if (args.includeContent && ['initial', 'enhanced', 'reviewed'].includes(metadata.status || '')) {
            result.content = transcript.content || '';
        }
        
        await transcript.close();
        return result;
    } catch (error) {
        return { found: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Retry a failed transcription
 */
export async function handleRetryTranscription(args: {
    uuid: string;
}): Promise<{
    success: boolean;
    message: string;
    error?: string;
}> {
    try {
        const outputDir = getOutputDirectory();
        const filePath = await findTranscriptByUuid(args.uuid, [outputDir]);
        
        if (!filePath) {
            return { 
                success: false, 
                message: '',
                error: `No transcript found for UUID: ${args.uuid}` 
            };
        }
        
        // Check current status
        const transcript = PklTranscript.open(filePath, { readOnly: true });
        const metadata = transcript.metadata;
        await transcript.close();
        
        if (metadata.status !== 'error') {
            return {
                success: false,
                message: '',
                error: `Transcript is not in error status (current: ${metadata.status})`,
            };
        }
        
        // Reset to uploaded
        await resetTranscriptToUploaded(filePath);
        
        return {
            success: true,
            message: `Transcript ${args.uuid} reset to uploaded status and re-queued`,
        };
    } catch (error) {
        return { 
            success: false, 
            message: '',
            error: error instanceof Error ? error.message : String(error) 
        };
    }
}

/**
 * Cancel a transcription
 */
export async function handleCancelTranscription(args: {
    uuid: string;
    deleteFile?: boolean;
}): Promise<{
    success: boolean;
    message: string;
    error?: string;
}> {
    try {
        const outputDir = getOutputDirectory();
        const filePath = await findTranscriptByUuid(args.uuid, [outputDir]);
        
        if (!filePath) {
            return { 
                success: false, 
                message: '',
                error: `No transcript found for UUID: ${args.uuid}` 
            };
        }
        
        // Check current status
        const transcript = PklTranscript.open(filePath, { readOnly: true });
        const metadata = transcript.metadata;
        await transcript.close();
        
        if (!['uploaded', 'transcribing'].includes(metadata.status || '')) {
            return {
                success: false,
                message: '',
                error: `Cannot cancel transcript in ${metadata.status} status. Only uploaded/transcribing can be cancelled.`,
            };
        }
        
        if (args.deleteFile) {
            // Delete the file
            await unlink(filePath);
            return {
                success: true,
                message: `Transcript ${args.uuid} cancelled and file deleted`,
            };
        } else {
            // Just mark as error
            const transcriptToUpdate = PklTranscript.open(filePath);
            transcriptToUpdate.updateMetadata({ 
                status: 'error',
                errorDetails: 'Cancelled by user',
            });
            await transcriptToUpdate.close();
            
            return {
                success: true,
                message: `Transcript ${args.uuid} cancelled (marked as error)`,
            };
        }
    } catch (error) {
        return { 
            success: false, 
            message: '',
            error: error instanceof Error ? error.message : String(error) 
        };
    }
}

/**
 * Get worker status
 */
export async function handleWorkerStatus(): Promise<{
    isRunning: boolean;
    currentTask?: string;
    totalProcessed: number;
    lastProcessed?: string;
    uptime: number;
}> {
    if (!workerInstance) {
        return {
            isRunning: false,
            totalProcessed: 0,
            uptime: 0,
        };
    }

    return {
        isRunning: workerInstance.isActive(),
        currentTask: workerInstance.getCurrentTask(),
        totalProcessed: workerInstance.getProcessedCount(),
        lastProcessed: workerInstance.getLastProcessedTime(),
        uptime: workerInstance.getUptime(),
    };
}

/**
 * Restart worker
 */
export async function handleRestartWorker(): Promise<{
    success: boolean;
    message: string;
    error?: string;
}> {
    if (!workerInstance) {
        return {
            success: false,
            message: '',
            error: 'Worker not initialized',
        };
    }

    try {
        await workerInstance.stop();
        await workerInstance.start();
        return {
            success: true,
            message: 'Worker restarted successfully',
        };
    } catch (error) {
        return {
            success: false,
            message: '',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
