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
import Logging from '@fjell/logging';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FileStorageProvider, StorageFileMetadata } from '../storage/fileProviders';

const { 
    findUploadedTranscripts,
    findTranscribingTranscripts,
    resetTranscriptToUploaded,
    findTranscriptByUuid,
} = Transcript;
import { getOutputDirectory, getOutputStorage } from '../serverConfig';
import { sanitizePath } from './shared';
import { unlink } from 'node:fs/promises';
import type { TranscriptionWorker } from '../worker/transcription-worker';
import { buildTranscriptStatusUri, buildTranscriptUri } from '../uri';

// Worker instance will be set by server
let workerInstance: TranscriptionWorker | null = null;
const logger = Logging.getLogger('@redaksjon/protokoll-mcp').get('queue-tools');

const READY_STATUSES = new Set(['initial', 'enhanced', 'reviewed', 'in_progress', 'closed', 'archived']);

export interface TranscriptStatusActivity {
    phase?: string;
    action?: string;
    label: string;
    at?: string;
    details?: Record<string, unknown>;
}

export interface TranscriptStatusView {
    uuid: string;
    displayName: string;
    originalFilename?: string;
    storedAudioFile?: string;
    fileSizeBytes?: number;
    status: string;
    stage: 'queued' | 'transcribing' | 'enhancing' | 'completed' | 'failed' | 'cancelled' | 'unknown';
    statusLabel: string;
    statusDetail: string;
    uploadedAt?: string;
    startedAt?: string;
    completedAt?: string;
    lastUpdatedAt?: string;
    queuePosition?: number;
    activity?: TranscriptStatusActivity;
    transcriptPath?: string;
    transcriptUri?: string;
    transcriptStatusUri: string;
    title?: string;
    project?: string;
    projectId?: string;
    errorDetails?: string;
    canCancel: boolean;
    canRetry: boolean;
}

type QueueTranscriptRecord = {
    uuid: string;
    filePath: string;
    metadata: TranscriptMetadata;
};

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

function getDisplayName(metadata: TranscriptMetadata): string {
    return metadata.originalFilename
        || metadata.audioFile
        || metadata.title
        || 'Untitled audio';
}

function parseUploadInfoArtifact(raw: Buffer | null | undefined): {
    originalFilename?: string;
    audioSizeBytes?: number;
} {
    if (!raw) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
        return {
            originalFilename: typeof parsed.originalFilename === 'string' ? parsed.originalFilename : undefined,
            audioSizeBytes: typeof parsed.audioSizeBytes === 'number' ? parsed.audioSizeBytes : undefined,
        };
    } catch {
        return {};
    }
}

function normalizeStatus(status?: string): string {
    return status || 'unknown';
}

function humanizeToolName(toolName: unknown): string {
    if (typeof toolName !== 'string' || toolName.trim().length === 0) {
        return 'context tool';
    }
    return toolName
        .replace(/^protokoll_/, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function describeLatestActivity(
    status: string,
    metadata: TranscriptMetadata,
    enhancementEntries: Array<{
        timestamp: Date;
        phase: string;
        action: string;
        details?: Record<string, unknown>;
    }>
): {
    stage: TranscriptStatusView['stage'];
    label: string;
    detail: string;
    at?: string;
    details?: Record<string, unknown>;
} {
    const latest = enhancementEntries[enhancementEntries.length - 1];

    if (status === 'uploaded') {
        return {
            stage: 'queued',
            label: 'Queued for transcription',
            detail: 'Upload complete. Waiting for the transcription worker to start.',
            at: metadata.date?.toISOString(),
        };
    }

    if (status === 'error') {
        const cancelled = metadata.errorDetails === 'Cancelled by user';
        return {
            stage: cancelled ? 'cancelled' : 'failed',
            label: cancelled ? 'Cancelled' : 'Transcription failed',
            detail: metadata.errorDetails || 'The transcript could not be processed.',
            at: getCompletionTime(metadata) || undefined,
        };
    }

    if (READY_STATUSES.has(status)) {
        return {
            stage: 'completed',
            label: 'Transcript ready',
            detail: status === 'enhanced'
                ? 'Enhanced transcript is ready to review.'
                : 'Transcript is ready.',
            at: getCompletionTime(metadata) || undefined,
        };
    }

    if (latest) {
        const at = latest.timestamp?.toISOString?.() || undefined;
        const details = latest.details;

        if (latest.phase === 'enhance' && latest.action === 'tool_start') {
            const toolLabel = humanizeToolName(details?.tool);
            return {
                stage: 'enhancing',
                label: 'Using context tools',
                detail: `Checking ${toolLabel} while refining the transcript.`,
                at,
                details,
            };
        }

        if (latest.phase === 'enhance' && latest.action === 'llm_refinement_start') {
            return {
                stage: 'enhancing',
                label: 'Refining transcript',
                detail: 'Raw transcription is complete. The LLM is applying project, people, and terminology context.',
                at,
                details,
            };
        }

        if (latest.phase === 'enhance' && latest.action === 'simple_replace_start') {
            return {
                stage: 'enhancing',
                label: 'Applying known corrections',
                detail: 'Checking known sounds-like corrections before LLM refinement.',
                at,
                details,
            };
        }

        if (latest.phase === 'enhance' && latest.action === 'model_call_start') {
            return {
                stage: 'enhancing',
                label: 'Refining transcript',
                detail: 'Applying project, people, and terminology context.',
                at,
                details,
            };
        }

        if (latest.phase === 'transcribe' && latest.action === 'conversion_start') {
            return {
                stage: 'transcribing',
                label: 'Preparing audio',
                detail: 'Converting the uploaded audio to a transcription-friendly format.',
                at,
                details,
            };
        }

        if (latest.phase === 'transcribe' && latest.action === 'conversion_complete') {
            return {
                stage: 'transcribing',
                label: 'Audio prepared',
                detail: 'Audio conversion finished. Preparing to send audio to the transcription model.',
                at,
                details,
            };
        }

        if (latest.phase === 'transcribe' && latest.action === 'split_start') {
            return {
                stage: 'transcribing',
                label: 'Splitting audio',
                detail: 'The audio is too large for one transcription request, so it is being split into chunks.',
                at,
                details,
            };
        }

        if (latest.phase === 'transcribe' && latest.action === 'split_complete') {
            const totalChunks = typeof details?.totalChunks === 'number' ? details.totalChunks : null;
            return {
                stage: 'transcribing',
                label: 'Audio split complete',
                detail: totalChunks
                    ? `Audio was split into ${totalChunks} chunks. Transcription requests are starting.`
                    : 'Audio splitting finished. Transcription requests are starting.',
                at,
                details,
            };
        }

        if (latest.phase === 'transcribe' && latest.action === 'chunk_start') {
            const chunkIndex = typeof details?.chunkIndex === 'number' ? details.chunkIndex : null;
            const totalChunks = typeof details?.totalChunks === 'number' ? details.totalChunks : null;
            return {
                stage: 'transcribing',
                label: chunkIndex && totalChunks ? `Transcribing chunk ${chunkIndex} of ${totalChunks}` : 'Transcribing audio chunk',
                detail: chunkIndex && totalChunks
                    ? `Whisper is processing chunk ${chunkIndex} of ${totalChunks}.`
                    : 'Whisper is processing one audio chunk.',
                at,
                details,
            };
        }

        if (latest.phase === 'transcribe' && latest.action === 'raw_transcription_complete') {
            const characterCount = typeof details?.characterCount === 'number' ? details.characterCount : null;
            return {
                stage: 'enhancing',
                label: 'Raw transcript captured',
                detail: characterCount
                    ? `Whisper returned ${characterCount.toLocaleString()} characters. Context refinement is starting.`
                    : 'Whisper returned the raw transcript. Context refinement is starting.',
                at,
                details,
            };
        }

        if (latest.phase === 'simple-replace' && latest.action === 'phase_complete') {
            const totalReplacements = typeof details?.totalReplacements === 'number'
                ? details.totalReplacements
                : null;
            return {
                stage: 'enhancing',
                label: 'Applying known corrections',
                detail: totalReplacements && totalReplacements > 0
                    ? `Applied ${totalReplacements} known corrections from context.`
                    : 'Applying known corrections from context.',
                at,
                details,
            };
        }

        if (latest.phase === 'enhance' && latest.action === 'enhancement_complete') {
            return {
                stage: 'completed',
                label: 'Transcript ready',
                detail: 'Transcript processing finished successfully.',
                at,
                details,
            };
        }

        if (latest.phase === 'transcribe' && latest.action === 'transcription_complete') {
            return {
                stage: 'enhancing',
                label: 'Raw transcript captured',
                detail: 'The audio has been transcribed. Final cleanup and enrichment are in progress.',
                at,
                details,
            };
        }
    }

    if (status === 'transcribing') {
        return {
            stage: 'transcribing',
            label: 'Transcribing audio',
            detail: 'The worker is converting audio into text.',
            at: getTranscribingStartTime(metadata) || undefined,
        };
    }

    return {
        stage: 'unknown',
        label: 'Processing',
        detail: 'Transcript activity is in progress.',
    };
}

function isQueueCandidatePath(pathValue: string): boolean {
    const normalized = pathValue.replace(/^\/+/, '').replace(/\\/g, '/');
    if (!normalized.toLowerCase().endsWith('.pkl')) {
        return false;
    }
    if (normalized.startsWith('uploads/') || normalized.includes('/uploads/')) {
        return false;
    }
    if (normalized.startsWith('.intermediate/') || normalized.includes('/.intermediate/')) {
        return false;
    }
    return true;
}

/**
 * Upload placeholder transcripts use a root-level `*-upload.pkl` naming convention.
 */
function isUploadPlaceholderPath(pathValue: string): boolean {
    const normalized = pathValue.replace(/^\/+/, '').replace(/\\/g, '/').toLowerCase();
    if (!normalized.endsWith('-upload.pkl')) {
        return false;
    }
    return !normalized.includes('/');
}

async function listFilesWithMetadataCompat(
    provider: FileStorageProvider,
    prefix: string,
    pattern?: string,
): Promise<StorageFileMetadata[]> {
    const withMetadata = (provider as {
        listFilesWithMetadata?: (prefix: string, pattern?: string) => Promise<StorageFileMetadata[]>;
    }).listFilesWithMetadata;
    if (typeof withMetadata === 'function') {
        return withMetadata.call(provider, prefix, pattern);
    }
    const listed = await provider.listFiles(prefix, pattern);
    return listed.map((pathValue) => ({
        path: pathValue,
        size: 1,
        updatedAt: null,
    }));
}

async function materializeTranscriptFromStorage(
    outputStorage: FileStorageProvider,
    transcriptPath: string,
): Promise<string> {
    const fileName = transcriptPath.split('/').pop() || 'transcript.pkl';
    const tempPath = join(
        tmpdir(),
        `protokoll-queue-pkl-${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`,
    );
    const contents = await outputStorage.readFile(transcriptPath);
    await fs.writeFile(tempPath, contents);
    return tempPath;
}

async function findTranscriptRecordByUuid(
    uuid: string,
    outputDir: string,
    outputStorage: FileStorageProvider,
): Promise<QueueTranscriptRecord | null> {
    if (outputStorage.name !== 'gcs') {
        const filePath = await findTranscriptByUuid(uuid, [outputDir]);
        if (!filePath) {
            return null;
        }
        const transcript = PklTranscript.open(filePath, { readOnly: true });
        try {
            return {
                uuid: transcript.metadata.id,
                filePath,
                metadata: transcript.metadata,
            };
        } finally {
            await transcript.close();
        }
    }

    const files = await listFilesWithMetadataCompat(outputStorage, '', '.pkl');
    const candidates = files
        .map((metadata) => metadata.path.replace(/^\/+/, '').replace(/\\/g, '/'))
        .filter(isQueueCandidatePath);

    for (const filePath of candidates) {
        let tempPath: string | null = null;
        try {
            tempPath = await materializeTranscriptFromStorage(outputStorage, filePath);
            const transcript = PklTranscript.open(tempPath, { readOnly: true });
            const metadata = transcript.metadata;
            await transcript.close();
            if (metadata.id === uuid) {
                return {
                    uuid: metadata.id,
                    filePath,
                    metadata,
                };
            }
        } catch {
            // Ignore unreadable transcripts while scanning for a UUID match.
        } finally {
            if (tempPath) {
                await fs.rm(tempPath, { force: true });
            }
        }
    }

    return null;
}

async function buildTranscriptStatusView(
    record: QueueTranscriptRecord,
    outputDir: string,
    outputStorage: FileStorageProvider,
    options?: {
        transcriptPath?: string;
        queuePosition?: number;
    },
): Promise<TranscriptStatusView> {
    const transcriptStatusUri = buildTranscriptStatusUri(record.uuid);
    const transcriptPath = options?.transcriptPath
        ?? await sanitizePath(record.filePath, outputDir);
    const transcriptUri = transcriptPath ? buildTranscriptUri(transcriptPath.replace(/\.pkl$/i, '')) : undefined;

    let enhancementEntries: Array<{
        timestamp: Date;
        phase: string;
        action: string;
        details?: Record<string, unknown>;
    }> = [];
    let uploadInfo: { originalFilename?: string; audioSizeBytes?: number } = {};

    if (outputStorage.name !== 'gcs') {
        const transcript = PklTranscript.open(record.filePath, { readOnly: true });
        try {
            enhancementEntries = transcript.getEnhancementLog();
            uploadInfo = parseUploadInfoArtifact(transcript.getArtifact('upload_info')?.data);
        } finally {
            await transcript.close();
        }
    } else {
        let tempPath: string | null = null;
        try {
            tempPath = await materializeTranscriptFromStorage(outputStorage, record.filePath);
            const transcript = PklTranscript.open(tempPath, { readOnly: true });
            enhancementEntries = transcript.getEnhancementLog();
            uploadInfo = parseUploadInfoArtifact(transcript.getArtifact('upload_info')?.data);
            await transcript.close();
        } catch {
            enhancementEntries = [];
        } finally {
            if (tempPath) {
                await fs.rm(tempPath, { force: true });
            }
        }
    }

    const status = normalizeStatus(record.metadata.status);
    const activity = describeLatestActivity(status, record.metadata, enhancementEntries);
    const uploadedAt = record.metadata.date?.toISOString();
    const startedAt = getTranscribingStartTime(record.metadata) || undefined;
    const completedAt = getCompletionTime(record.metadata) || undefined;
    const lastUpdatedAt = activity.at || completedAt || startedAt || uploadedAt;

    const metadataWithOptionalSize = record.metadata as TranscriptMetadata & { audioSizeBytes?: number };

    return {
        uuid: record.uuid,
        displayName: uploadInfo.originalFilename || getDisplayName(record.metadata),
        originalFilename: record.metadata.originalFilename || uploadInfo.originalFilename,
        storedAudioFile: record.metadata.audioFile,
        fileSizeBytes: metadataWithOptionalSize.audioSizeBytes || uploadInfo.audioSizeBytes,
        status,
        stage: activity.stage,
        statusLabel: activity.label,
        statusDetail: activity.detail,
        uploadedAt,
        startedAt,
        completedAt,
        lastUpdatedAt,
        queuePosition: options?.queuePosition,
        activity: {
            phase: enhancementEntries[enhancementEntries.length - 1]?.phase,
            action: enhancementEntries[enhancementEntries.length - 1]?.action,
            label: activity.label,
            at: activity.at,
            details: activity.details,
        },
        transcriptPath,
        transcriptUri,
        transcriptStatusUri,
        title: record.metadata.title,
        project: record.metadata.project,
        projectId: record.metadata.projectId,
        errorDetails: record.metadata.errorDetails,
        canCancel: status === 'uploaded' || status === 'transcribing',
        canRetry: status === 'error',
    };
}

async function findQueueTranscriptsFromStorage(
    outputStorage: FileStorageProvider,
): Promise<{
    uploaded: QueueTranscriptRecord[];
    transcribing: QueueTranscriptRecord[];
}> {
    const files = await listFilesWithMetadataCompat(outputStorage, '', '-upload.pkl');
    const candidates = files
        .map((metadata) => ({ ...metadata, path: metadata.path.replace(/^\/+/, '').replace(/\\/g, '/') }))
        .filter((metadata) => isQueueCandidatePath(metadata.path))
        .filter((metadata) => isUploadPlaceholderPath(metadata.path));

    const uploaded: QueueTranscriptRecord[] = [];
    const transcribing: QueueTranscriptRecord[] = [];

    for (const metadata of candidates) {
        let tempPath: string | null = null;
        try {
            tempPath = await materializeTranscriptFromStorage(outputStorage, metadata.path);
            const transcript = PklTranscript.open(tempPath, { readOnly: true });
            const transcriptMetadata = transcript.metadata;
            await transcript.close();

            if (transcriptMetadata.status === 'uploaded') {
                uploaded.push({ uuid: transcriptMetadata.id, filePath: metadata.path, metadata: transcriptMetadata });
            } else if (transcriptMetadata.status === 'transcribing') {
                transcribing.push({ uuid: transcriptMetadata.id, filePath: metadata.path, metadata: transcriptMetadata });
            }
        } catch {
            // Ignore unreadable queue placeholders.
        } finally {
            if (tempPath) {
                await fs.rm(tempPath, { force: true });
            }
        }
    }

    const sortByDateAsc = (a: { metadata: TranscriptMetadata }, b: { metadata: TranscriptMetadata }): number => {
        const aTime = a.metadata.date?.getTime() || 0;
        const bTime = b.metadata.date?.getTime() || 0;
        return aTime - bTime;
    };

    return {
        uploaded: uploaded.sort(sortByDateAsc),
        transcribing: transcribing.sort(sortByDateAsc),
    };
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
                logger.warning('queue.recent.skip_unreadable_transcript', {
                    file,
                    error: error instanceof Error ? error.message : String(error),
                });
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
    pending: Array<TranscriptStatusView & { filename: string }>;
    processing: Array<TranscriptStatusView & { filename: string }>;
    recent: Array<TranscriptStatusView & { filename: string }>;
    totalPending: number;
}> {
    const outputDir = getOutputDirectory();
    const outputStorage = getOutputStorage();
    let uploaded: QueueTranscriptRecord[] = [];
    let transcribing: QueueTranscriptRecord[] = [];

    if (outputStorage.name === 'gcs') {
        const storageQueue = await findQueueTranscriptsFromStorage(outputStorage);
        uploaded = storageQueue.uploaded;
        transcribing = storageQueue.transcribing;
    } else {
        uploaded = await findUploadedTranscripts([outputDir]);
        transcribing = await findTranscribingTranscripts([outputDir]);
    }

    const recent = await findRecentTranscripts([outputDir], 10);
    
    const pending = await Promise.all(
        uploaded.map(async (record, index) => {
            const statusView = await buildTranscriptStatusView(record, outputDir, outputStorage, {
                queuePosition: index + 1,
            });
            return {
                ...statusView,
                filename: statusView.displayName,
            };
        }),
    );

    const processing = await Promise.all(
        transcribing.map(async (record) => {
            const statusView = await buildTranscriptStatusView(record, outputDir, outputStorage);
            return {
                ...statusView,
                filename: statusView.displayName,
            };
        }),
    );

    const recentViews = await Promise.all(
        recent.map(async (record) => {
            const statusView = await buildTranscriptStatusView(record, outputDir, outputStorage);
            return {
                ...statusView,
                filename: statusView.displayName,
            };
        }),
    );

    return {
        pending,
        processing,
        recent: recentViews,
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
    displayName?: string;
    transcriptStatusUri?: string;
    statusView?: TranscriptStatusView;
    error?: string;
}> {
    try {
        const outputDir = getOutputDirectory();
        const outputStorage = getOutputStorage();
        const record = await findTranscriptRecordByUuid(args.uuid, outputDir, outputStorage);
        
        if (!record) {
            return { found: false, error: `No transcript found for UUID: ${args.uuid}` };
        }

        const sanitizedPath = await sanitizePath(record.filePath, outputDir);
        const statusView = await buildTranscriptStatusView(record, outputDir, outputStorage, {
            transcriptPath: sanitizedPath,
        });
        const result: {
            found: boolean;
            uuid?: string;
            filePath?: string;
            metadata?: TranscriptMetadata;
            content?: string;
            displayName?: string;
            transcriptStatusUri?: string;
            statusView?: TranscriptStatusView;
        } = {
            found: true,
            uuid: record.metadata.id,
            filePath: sanitizedPath,
            metadata: record.metadata,
            displayName: statusView.displayName,
            transcriptStatusUri: statusView.transcriptStatusUri,
            statusView,
        };

        if (args.includeContent && ['initial', 'enhanced', 'reviewed'].includes(record.metadata.status || '')) {
            if (outputStorage.name !== 'gcs') {
                const transcript = PklTranscript.open(record.filePath, { readOnly: true });
                try {
                    result.content = transcript.content || '';
                } finally {
                    await transcript.close();
                }
            } else {
                let tempPath: string | null = null;
                try {
                    tempPath = await materializeTranscriptFromStorage(outputStorage, record.filePath);
                    const transcript = PklTranscript.open(tempPath, { readOnly: true });
                    result.content = transcript.content || '';
                    await transcript.close();
                } finally {
                    if (tempPath) {
                        await fs.rm(tempPath, { force: true });
                    }
                }
            }
        }

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
