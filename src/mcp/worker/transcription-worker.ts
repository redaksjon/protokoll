/**
 * Background Transcription Worker
 * 
 * Processes uploaded audio files sequentially in the background.
 * Scans for transcripts in 'uploaded' status and processes them through
 * the existing Pipeline infrastructure.
 */

import { join, isAbsolute, relative } from 'node:path';
import { tmpdir } from 'node:os';
import * as fs from 'node:fs/promises';
import { glob } from 'glob';
import Logging from '@fjell/logging';
import { Pipeline, Transcript as TranscriptOps, Weighting } from '@redaksjon/protokoll-engine';
import { PklTranscript } from '@redaksjon/protokoll-format';
import type { TranscriptMetadata } from '@redaksjon/protokoll-format';
import type { ContextInstance } from '@redaksjon/context';
import type { FileStorageProvider } from '../storage/fileProviders';
import type { StorageFileMetadata } from '../storage/fileProviders';
import { markTranscriptIndexDirtyForStorage } from '../resources/transcriptIndexService';

const { findUploadedTranscripts, markTranscriptAsTranscribing, markTranscriptAsFailed, resetTranscriptToUploaded } = TranscriptOps;
const logger = Logging.getLogger('@redaksjon/protokoll-mcp').get('transcription-worker');

const WEIGHT_MODEL_FILENAME = '.protokoll-weight-model.json';
const WEIGHT_MODEL_STORAGE_PATH = WEIGHT_MODEL_FILENAME;
const WEIGHT_MODEL_VISIBILITY_PATH = '.protokoll/weight-model.snapshot.json';
const STALE_TRANSCRIBING_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Worker configuration
 */
export interface WorkerConfig {
    outputDirectory: string;       // Where PKL files are stored
    contextDirectory?: string;     // Starting directory for context discovery (fallback)
    /** Explicit context directories from protokoll-config.yaml (preferred over discovery) */
    contextDirectories?: string[]; // e.g. ['~/.protokoll/projects']
    /** Pre-loaded context instance (required for GCS-backed context) */
    contextInstance?: ContextInstance;
    uploadDirectory: string;       // Where uploaded audio files are stored
    outputStorage?: FileStorageProvider; // Optional storage provider for uploads in non-filesystem backends
    scanInterval?: number;         // Milliseconds between queue scans (default: 60000)
    model?: string;                // AI model for enhancement
    transcriptionModel?: string;   // Whisper model
}

/**
 * Uploaded transcript item
 */
interface UploadedTranscript {
    uuid: string;
    filePath: string;
    metadata: TranscriptMetadata;
}

function deriveWeightModelCounts(model: Weighting.WeightModel): { transcriptCount: number; entityCount: number } {
    const snapshots = Object.values(model.transcriptSnapshots || {});
    const transcriptCount = snapshots.length;
    const entityCount = snapshots.reduce((total, snapshot) => {
        const ids = Array.isArray(snapshot?.entityIds) ? snapshot.entityIds : [];
        return total + ids.length;
    }, 0);
    return { transcriptCount, entityCount };
}

function syncWeightModelMetadata(model: Weighting.WeightModel): {
    transcriptCount: number;
    entityCount: number;
    changed: boolean;
} {
    const { transcriptCount, entityCount } = deriveWeightModelCounts(model);
    const changed = model.metadata.transcriptCount !== transcriptCount
        || model.metadata.entityCount !== entityCount;
    if (changed) {
        model.metadata.transcriptCount = transcriptCount;
        model.metadata.entityCount = entityCount;
    }
    return { transcriptCount, entityCount, changed };
}

type TranscriptEntities = {
    people?: Array<{ id?: string }>;
    projects?: Array<{ id?: string }>;
    terms?: Array<{ id?: string }>;
    companies?: Array<{ id?: string }>;
};

function createEmptyWeightModel(): Weighting.WeightModel {
    const now = new Date().toISOString();
    return {
        cooccurrence: {},
        byProject: {},
        transcriptSnapshots: {},
        metadata: {
            builtAt: now,
            lastUpdatedAt: now,
            transcriptCount: 0,
            entityCount: 0,
            version: '1.0.0',
        },
    };
}

function extractEntityIdsFromMetadata(metadata: TranscriptMetadata): string[] {
    const entities = metadata.entities as TranscriptEntities | undefined;
    if (!entities) {
        return [];
    }
    const ids = [
        ...(entities.people || []).map(entity => entity?.id),
        ...(entities.projects || []).map(entity => entity?.id),
        ...(entities.terms || []).map(entity => entity?.id),
        ...(entities.companies || []).map(entity => entity?.id),
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return Array.from(new Set(ids));
}

async function loadWeightModelFromStorage(
    outputStorage: FileStorageProvider,
): Promise<Weighting.WeightModel | null> {
    const candidates = [WEIGHT_MODEL_STORAGE_PATH, WEIGHT_MODEL_VISIBILITY_PATH];
    for (const pathValue of candidates) {
        try {
            if (!(await outputStorage.exists(pathValue))) {
                continue;
            }
            const contents = await outputStorage.readFile(pathValue);
            const model = JSON.parse(contents.toString('utf-8')) as Weighting.WeightModel;
            logger.info('worker.weight_model.loaded_from_storage', { path: pathValue });
            return model;
        } catch {
            // Try next candidate path.
        }
    }
    return null;
}

async function writeWeightModel(
    model: Weighting.WeightModel,
    options: {
        weightModelBuilder: Weighting.WeightModelBuilder;
        weightModelPath: string;
        outputStorage?: FileStorageProvider;
    },
): Promise<void> {
    if (options.outputStorage?.name === 'gcs') {
        const serialized = JSON.stringify(model, null, 2);
        await options.outputStorage.writeFile(WEIGHT_MODEL_STORAGE_PATH, serialized);
        try {
            // Keep a human-visible snapshot in .protokoll for debugging and warm starts.
            await options.outputStorage.writeFile(WEIGHT_MODEL_VISIBILITY_PATH, serialized);
        } catch {
            logger.warning('worker.weight_model.visibility_copy_failed', {
                path: WEIGHT_MODEL_VISIBILITY_PATH,
            });
        }
        return;
    }
    await options.weightModelBuilder.writeToFile(model, options.weightModelPath);
}

function toStorageCandidatePath(outputDirectory: string, filePath: string): string {
    if (!filePath) {
        return filePath;
    }
    if (isAbsolute(filePath)) {
        const rel = relative(outputDirectory, filePath).replace(/\\/g, '/');
        return rel.startsWith('../') ? filePath : rel;
    }
    return filePath.replace(/^\/+/, '').replace(/\\/g, '/');
}

async function materializeUploadedAudio(
    outputStorage: FileStorageProvider,
    uploadPath: string,
): Promise<string> {
    const fileName = uploadPath.split('/').pop() || 'uploaded-audio.bin';
    const tempPath = join(
        tmpdir(),
        `protokoll-worker-${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`,
    );
    const contents = await outputStorage.readFile(uploadPath);
    await fs.writeFile(tempPath, contents);
    return tempPath;
}

async function materializeTranscriptFromStorage(
    outputStorage: FileStorageProvider,
    transcriptPath: string,
): Promise<string> {
    const fileName = transcriptPath.split('/').pop() || 'transcript.pkl';
    const tempPath = join(
        tmpdir(),
        `protokoll-worker-pkl-${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`,
    );
    const contents = await outputStorage.readFile(transcriptPath);
    await fs.writeFile(tempPath, contents);
    return tempPath;
}

async function syncTranscriptToStorage(
    outputStorage: FileStorageProvider,
    transcriptPath: string,
    localPath: string,
): Promise<void> {
    const updated = await fs.readFile(localPath);
    await outputStorage.writeFile(transcriptPath, updated);
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
 * Restricting GCS queue scans to these files avoids repeatedly reading every PKL object.
 */
function isUploadPlaceholderPath(pathValue: string): boolean {
    const normalized = pathValue.replace(/^\/+/, '').replace(/\\/g, '/').toLowerCase();
    if (!normalized.endsWith('-upload.pkl')) {
        return false;
    }
    // Upload placeholders are created at the output root, not inside date/project folders.
    return !normalized.includes('/');
}

function metadataVersionKey(metadata: { generation?: string; updatedAt?: string | null; size?: number; etag?: string }): string {
    return [
        metadata.generation || '',
        metadata.updatedAt || '',
        String(metadata.size || 0),
        metadata.etag || '',
    ].join('|');
}

function normalizeStoragePath(pathValue: string): string {
    return pathValue.replace(/^\/+/, '').replace(/\\/g, '/');
}

function getLatestTranscribingTimestamp(metadata: TranscriptMetadata): number | null {
    const history = Array.isArray(metadata.history) ? metadata.history : [];
    const transitions = history
        .filter((entry) => entry?.to === 'transcribing')
        .map((entry) => entry.at?.getTime?.())
        .filter((value): value is number => Number.isFinite(value));
    if (transitions.length > 0) {
        return Math.max(...transitions);
    }
    const fallback = metadata.date?.getTime() ?? null;
    return Number.isFinite(fallback) ? fallback : null;
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

/**
 * Worker statistics
 */
interface WorkerStats {
    totalProcessed: number;
    lastProcessedTime?: string;
    lastProcessedUuid?: string;
    currentTask?: string;
    startTime: number;
}

/**
 * Background transcription worker
 * 
 * Processes uploaded audio files sequentially:
 * 1. Scans for transcripts in 'uploaded' status
 * 2. Marks as 'transcribing'
 * 3. Processes through Pipeline
 * 4. Updates status to 'initial' on success or 'error' on failure
 */
export class TranscriptionWorker {
    private isRunning = false;
    private config: WorkerConfig;
    private pipeline: Awaited<ReturnType<typeof Pipeline.create>> | null = null;
    private stats: WorkerStats;
    private processingPromise: Promise<void> | null = null;
    private weightModelProvider: Weighting.WeightModelProvider | null = null;
    private weightModelBuilder: Weighting.WeightModelBuilder | null = null;
    private weightModelPath: string | null = null;
    private readonly uploadStatusCache = new Map<string, { version: string; status: string | null }>();

    constructor(config: WorkerConfig) {
        this.config = config;
        this.stats = {
            totalProcessed: 0,
            startTime: Date.now(),
        };
    }

    /**
     * Start the worker
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        logger.info('worker.starting', {
            outputDirectory: this.config.outputDirectory,
            uploadDirectory: this.config.uploadDirectory,
            model: this.config.model || 'gpt-5-mini',
            transcriptionModel: this.config.transcriptionModel || 'whisper-1',
        });

        // Initialize weight model for entity co-occurrence tracking and LLM prepositioning
        this.weightModelPath = join(this.config.outputDirectory, WEIGHT_MODEL_FILENAME);
        this.weightModelBuilder = new Weighting.WeightModelBuilder({
            outputFilePath: this.weightModelPath,
            minCooccurrenceCount: 1,
            maxTranscripts: 500,
        });
        this.weightModelProvider = new Weighting.WeightModelProvider();

        const storageBacked = this.config.outputStorage?.name === 'gcs' && !!this.config.outputStorage;
        const existingModel = storageBacked
            ? await loadWeightModelFromStorage(this.config.outputStorage!)
            : await Weighting.WeightModelBuilder.loadFromFile(this.weightModelPath);
        if (existingModel) {
            const normalized = syncWeightModelMetadata(existingModel);
            if (normalized.changed) {
                await writeWeightModel(existingModel, {
                    weightModelBuilder: this.weightModelBuilder,
                    weightModelPath: this.weightModelPath,
                    outputStorage: this.config.outputStorage,
                });
                logger.info('worker.weight_model.metadata_repaired', {
                    transcriptCount: normalized.transcriptCount,
                    entityCount: normalized.entityCount,
                });
            }
            this.weightModelProvider.loadModel(existingModel);
            logger.info('worker.weight_model.loaded', {
                transcriptCount: normalized.transcriptCount,
                entityCount: normalized.entityCount,
            });
        } else {
            // No existing model — do an initial build from all transcripts in the output dir
            try {
                const builtModel = storageBacked
                    ? await this.buildWeightModelFromStorage(this.config.outputStorage!)
                    : await this.weightModelBuilder.build(this.config.outputDirectory);
                this.weightModelProvider.loadModel(builtModel);
                if (builtModel.metadata.transcriptCount > 0) {
                    await writeWeightModel(builtModel, {
                        weightModelBuilder: this.weightModelBuilder,
                        weightModelPath: this.weightModelPath,
                        outputStorage: this.config.outputStorage,
                    });
                    logger.info('worker.weight_model.built', {
                        transcriptCount: builtModel.metadata.transcriptCount,
                        entityCount: builtModel.metadata.entityCount,
                    });
                } else {
                    logger.info('worker.weight_model.empty_start');
                }
            } catch {
                logger.warning('worker.weight_model.build_failed');
            }
        }

        // Capture for closure in onTranscriptEntitiesUpdated
        const weightModelBuilder = this.weightModelBuilder;
        const weightModelProvider = this.weightModelProvider;
        const weightModelPath = this.weightModelPath;

        // Create pipeline instance
        this.pipeline = await Pipeline.create({
            model: this.config.model || 'gpt-5-mini',
            transcriptionModel: this.config.transcriptionModel || 'whisper-1',
            reasoningLevel: 'medium',
            interactive: false,
            selfReflection: false,
            debug: false,
            silent: true,
            contextInstance: this.config.contextInstance,
            contextDirectory: this.config.contextDirectory,
            contextDirectories: this.config.contextDirectories,
            outputDirectory: this.config.outputDirectory,
            outputStructure: 'month',
            outputFilenameOptions: ['date', 'time', 'subject'],
            maxAudioSize: 100 * 1024 * 1024, // 100MB
            tempDirectory: tmpdir(),
            intermediateDir: join(this.config.outputDirectory, '.intermediate'),
            keepIntermediates: false,
            weightModelProvider,
            onTranscriptEntitiesUpdated: (transcriptUuid, entityIds, projectId) => {
                const model = weightModelProvider.getModel();
                if (!model) return;
                weightModelBuilder.updateTranscript(model, transcriptUuid, entityIds, projectId);
                syncWeightModelMetadata(model);
                // Save asynchronously — never block processing on disk I/O
                writeWeightModel(model, {
                    weightModelBuilder,
                    weightModelPath,
                    outputStorage: this.config.outputStorage,
                }).catch(() => {
                    logger.warning('worker.weight_model.save_failed');
                });
            },
        });

        this.isRunning = true;
        this.stats.startTime = Date.now();
        
        // Start processing loop
        this.processingPromise = this.processQueue();
        
        logger.info('worker.started');
    }

    /**
     * Stop the worker
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        logger.info('worker.stopping');
        
        this.isRunning = false;
        
        // Wait for current processing to finish
        if (this.processingPromise) {
            await this.processingPromise;
        }
        
        logger.info('worker.stopped');
    }

    /**
     * Main processing loop
     */
    private async processQueue(): Promise<void> {
        while (this.isRunning) {
            try {
                const outputStorage = this.config.outputStorage;
                // In GCS mode, queue source of truth is object storage; skip local filesystem scans.
                const localUploaded = outputStorage?.name === 'gcs'
                    ? []
                    : await findUploadedTranscripts([this.config.outputDirectory]).catch(() => []);
                const storageUploaded = outputStorage?.name === 'gcs'
                    ? await this.findUploadedTranscriptsFromStorage(outputStorage).catch(() => [])
                    : [];
                const mergedByUuid = new Map<string, UploadedTranscript>();
                for (const item of [...localUploaded, ...storageUploaded]) {
                    if (!mergedByUuid.has(item.uuid)) {
                        mergedByUuid.set(item.uuid, item);
                    }
                }
                const uploaded = Array.from(mergedByUuid.values()).sort((a, b) => {
                    const aTime = a.metadata.date?.getTime() || 0;
                    const bTime = b.metadata.date?.getTime() || 0;
                    return aTime - bTime;
                });

                logger.debug('worker.queue.scan.complete', {
                    localUploaded: localUploaded.length,
                    storageUploaded: storageUploaded.length,
                    mergedUploaded: uploaded.length,
                });
                
                if (uploaded.length > 0) {
                    await this.processNextTranscript(uploaded[0]);
                } else {
                    // No work, wait before next scan
                    await new Promise(resolve => setTimeout(resolve, this.config.scanInterval || 60_000));
                }
            } catch (error) {
                logger.error('worker.loop.error', {
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                });
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }

    private async buildWeightModelFromStorage(outputStorage: FileStorageProvider): Promise<Weighting.WeightModel> {
        const model = createEmptyWeightModel();
        const files = await listFilesWithMetadataCompat(outputStorage, '', '.pkl');
        const candidates = files
            .map((metadata) => ({ ...metadata, path: normalizeStoragePath(metadata.path) }))
            .filter((metadata) => isQueueCandidatePath(metadata.path))
            .filter((metadata) => !isUploadPlaceholderPath(metadata.path))
            .sort((a, b) => {
                const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                return bTime - aTime;
            })
            .slice(0, 500);

        for (const metadata of candidates) {
            let tempPath: string | null = null;
            try {
                tempPath = await materializeTranscriptFromStorage(outputStorage, metadata.path);
                const transcript = PklTranscript.open(tempPath, { readOnly: true });
                const transcriptMetadata = transcript.metadata;
                transcript.close();
                const entityIds = extractEntityIdsFromMetadata(transcriptMetadata);
                if (entityIds.length === 0 || !transcriptMetadata.id) {
                    continue;
                }
                this.weightModelBuilder?.updateTranscript(
                    model,
                    transcriptMetadata.id,
                    entityIds,
                    transcriptMetadata.project || undefined,
                );
            } catch {
                // Ignore unreadable/invalid transcript files in startup bootstrap.
            } finally {
                if (tempPath) {
                    await fs.rm(tempPath, { force: true });
                }
            }
        }

        syncWeightModelMetadata(model);
        model.metadata.lastUpdatedAt = new Date().toISOString();
        return model;
    }

    private async findUploadedTranscriptsFromStorage(outputStorage: FileStorageProvider): Promise<UploadedTranscript[]> {
        const files = await listFilesWithMetadataCompat(outputStorage, '', '-upload.pkl');
        const candidates = files
            .map((metadata) => ({ ...metadata, path: normalizeStoragePath(metadata.path) }))
            .filter((metadata) => isQueueCandidatePath(metadata.path))
            .filter((metadata) => isUploadPlaceholderPath(metadata.path));
        const uploaded: UploadedTranscript[] = [];
        const seenPaths = new Set<string>();

        for (const metadata of candidates) {
            const storagePath = metadata.path;
            seenPaths.add(storagePath);
            const version = metadataVersionKey(metadata);
            const cached = this.uploadStatusCache.get(storagePath);
            if (cached && cached.version === version && cached.status !== 'uploaded') {
                continue;
            }
            let tempPath: string | null = null;
            try {
                tempPath = await materializeTranscriptFromStorage(outputStorage, storagePath);
                const transcript = PklTranscript.open(tempPath, { readOnly: true });
                const transcriptMetadata = transcript.metadata;
                transcript.close();
                const status = transcriptMetadata.status || null;
                this.uploadStatusCache.set(storagePath, { version, status });

                if (status === 'uploaded') {
                    uploaded.push({
                        uuid: transcriptMetadata.id,
                        filePath: storagePath,
                        metadata: transcriptMetadata,
                    });
                    continue;
                }

                if (status === 'transcribing') {
                    const startedAt = getLatestTranscribingTimestamp(transcriptMetadata);
                    const isStale = startedAt !== null && (Date.now() - startedAt) > STALE_TRANSCRIBING_TIMEOUT_MS;
                    if (isStale && tempPath) {
                        await resetTranscriptToUploaded(tempPath);
                        await syncTranscriptToStorage(outputStorage, storagePath, tempPath);
                        const refreshed = PklTranscript.open(tempPath, { readOnly: true });
                        const refreshedMetadata = refreshed.metadata;
                        refreshed.close();
                        this.uploadStatusCache.set(storagePath, { version, status: refreshedMetadata.status || null });
                        uploaded.push({
                            uuid: refreshedMetadata.id,
                            filePath: storagePath,
                            metadata: refreshedMetadata,
                        });
                        logger.warning('worker.queue.recovered_stale_transcribing', {
                            uuid: refreshedMetadata.id,
                            storagePath,
                            timeoutMs: STALE_TRANSCRIBING_TIMEOUT_MS,
                        });
                    }
                }
            } catch {
                // Ignore unreadable PKL files; transcript index logs these elsewhere.
            } finally {
                if (tempPath) {
                    await fs.rm(tempPath, { force: true });
                }
            }
        }

        for (const pathValue of Array.from(this.uploadStatusCache.keys())) {
            if (!seenPaths.has(pathValue)) {
                this.uploadStatusCache.delete(pathValue);
            }
        }

        return uploaded.sort((a, b) => {
            const aTime = a.metadata.date?.getTime() || 0;
            const bTime = b.metadata.date?.getTime() || 0;
            return aTime - bTime;
        });
    }

    private async resolveNonConflictingStoragePath(
        outputStorage: FileStorageProvider,
        desiredPath: string,
        transcriptUuid: string,
    ): Promise<string> {
        const normalized = normalizeStoragePath(desiredPath);
        if (!(await outputStorage.exists(normalized))) {
            return normalized;
        }

        const withoutExt = normalized.replace(/\.pkl$/i, '');
        const suffix = transcriptUuid.slice(0, 8);
        const firstCandidate = `${withoutExt}-${suffix}.pkl`;
        if (!(await outputStorage.exists(firstCandidate))) {
            return firstCandidate;
        }

        for (let attempt = 2; attempt <= 100; attempt++) {
            const candidate = `${withoutExt}-${suffix}-${attempt}.pkl`;
            if (!(await outputStorage.exists(candidate))) {
                return candidate;
            }
        }

        throw new Error(`Unable to allocate non-conflicting transcript path for ${normalized}`);
    }

    /**
     * Process a single transcript
     */
    private async processNextTranscript(item: UploadedTranscript): Promise<void> {
        this.stats.currentTask = `Processing ${item.uuid}`;
        let localTempAudioPath: string | null = null;
        let localTempTranscriptPath: string | null = null;
        const outputStorage = this.config.outputStorage;
        const isGcsOutput = outputStorage?.name === 'gcs';
        let workingTranscriptPath = item.filePath;
        let transcriptStoragePath = toStorageCandidatePath(this.config.outputDirectory, item.filePath);
        const originalTranscriptStoragePath = transcriptStoragePath;
        
        logger.info('worker.transcript.start', {
            uuid: item.uuid,
            audioFile: item.metadata.audioFile || null,
            filePath: item.filePath,
            storagePath: transcriptStoragePath,
        });

        try {
            const shouldMaterializeFromStorage = isGcsOutput
                && outputStorage
                && !isAbsolute(item.filePath);
            if (shouldMaterializeFromStorage && outputStorage) {
                localTempTranscriptPath = await materializeTranscriptFromStorage(outputStorage, transcriptStoragePath);
                workingTranscriptPath = localTempTranscriptPath;
            }

            // Open PKL early so we can write incremental enhancement log entries
            // during pipeline execution, giving real-time visibility into tool calls.
            const transcript = PklTranscript.open(workingTranscriptPath);

            // Mark as transcribing
            await markTranscriptAsTranscribing(workingTranscriptPath);
            if (isGcsOutput && outputStorage) {
                await syncTranscriptToStorage(outputStorage, transcriptStoragePath, workingTranscriptPath);
            }
            markTranscriptIndexDirtyForStorage(
                outputStorage,
                this.config.outputDirectory,
                transcriptStoragePath,
            );
            
            // Get audio file path (metadata.audioFile is basename for HTTP uploads, or absolute path from other clients)
            let audioFilePath = item.metadata.audioFile && isAbsolute(item.metadata.audioFile)
                ? item.metadata.audioFile
                : join(this.config.uploadDirectory, item.metadata.audioFile || '');

            // In gcs mode, uploaded audio is stored in object storage and must be materialized locally for pipeline processing.
            if (isGcsOutput && item.metadata.audioFile && !isAbsolute(item.metadata.audioFile)) {
                const uploadObjectPath = join('uploads', item.metadata.audioFile).replace(/\\/g, '/');
                localTempAudioPath = await materializeUploadedAudio(outputStorage, uploadObjectPath);
                audioFilePath = localTempAudioPath;
            }
            
            // Fallback: if file not found but we have audioHash, find by hash (handles legacy transcripts with originalFilename in audioFile)
            try {
                await fs.stat(audioFilePath);
            } catch {
                if (item.metadata.audioHash) {
                    if (isGcsOutput && outputStorage) {
                        const uploadMatches = await outputStorage.listFiles('uploads', item.metadata.audioHash);
                        const byHash = uploadMatches.filter((candidate) =>
                            candidate.split('/').pop()?.startsWith(`${item.metadata.audioHash}.`),
                        );
                        if (byHash.length > 0) {
                            localTempAudioPath = await materializeUploadedAudio(outputStorage, byHash[0]);
                            audioFilePath = localTempAudioPath;
                        } else {
                            throw new Error(`Audio file not found and no object matching hash ${item.metadata.audioHash} in uploads`);
                        }
                    } else {
                        const byHash = await glob(`${item.metadata.audioHash}.*`, { cwd: this.config.uploadDirectory, absolute: true });
                        if (byHash.length > 0) {
                            audioFilePath = byHash[0];
                        } else {
                            throw new Error(`Audio file not found at ${audioFilePath} and no file matching hash ${item.metadata.audioHash} in uploads`);
                        }
                    }
                } else {
                    throw new Error(`Audio file not found at ${audioFilePath} and no audioHash for fallback lookup`);
                }
            }
            
            // Process through pipeline
            if (!this.pipeline) {
                throw new Error('Pipeline not initialized');
            }

            // Log that enhancement is starting
            transcript.enhancementLog.logStep(new Date(), 'enhance', 'enhancement_start', {
                model: this.config.model || 'gpt-5-mini',
                reasoningLevel: 'medium',
                maxIterations: 20,
                audioFile: item.metadata.audioFile,
            });

            let toolCallCount = 0;

            const result = await this.pipeline.process({
                audioFile: audioFilePath,
                creation: item.metadata.date || new Date(),
                hash: item.metadata.audioHash || '',
                onSimpleReplaceComplete: (stats) => {
                    if (stats.totalReplacements === 0) return;
                    try {
                        transcript.enhancementLog.logStep(new Date(), 'simple-replace', 'phase_complete', {
                            totalReplacements: stats.totalReplacements,
                            tier1Replacements: stats.tier1Replacements,
                            tier2Replacements: stats.tier2Replacements,
                            projectContext: stats.projectContext,
                            processingTimeMs: stats.processingTimeMs,
                        });
                        // Log each individual correction as its own entry
                        for (const mapping of stats.appliedMappings) {
                            transcript.enhancementLog.logStep(new Date(), 'simple-replace', 'correction_applied', {
                                original: mapping.soundsLike,
                                replacement: mapping.correctText,
                                tier: mapping.tier,
                                occurrences: mapping.occurrences,
                                entityId: mapping.entityId,
                                entityType: mapping.entityType,
                            });
                        }
                    } catch {
                        // Never let log errors interrupt processing
                    }
                },
                onToolCallStart: (tool, input) => {
                    toolCallCount++;
                    logger.info('worker.enhance.tool_start', {
                        uuid: item.uuid,
                        tool,
                        callIndex: toolCallCount,
                    });
                    try {
                        transcript.enhancementLog.logStep(new Date(), 'enhance', 'tool_start', {
                            callIndex: toolCallCount,
                            tool,
                            input,
                        });
                    } catch {
                        // Never let log errors interrupt processing
                    }
                },
                onToolCallComplete: (entry) => {
                    logger.info('worker.enhance.tool_complete', {
                        uuid: item.uuid,
                        tool: entry.tool,
                        durationMs: entry.durationMs,
                        success: entry.success,
                    });
                    try {
                        transcript.enhancementLog.logStep(entry.timestamp, 'enhance', 'tool_complete', {
                            tool: entry.tool,
                            input: entry.input,
                            output: entry.output,
                            durationMs: entry.durationMs,
                            success: entry.success,
                        });
                    } catch {
                        // Never let log errors interrupt processing
                    }
                },
                onModelCallStart: (entry) => {
                    logger.info('worker.enhance.model_start', {
                        uuid: item.uuid,
                        callIndex: entry.callIndex,
                        phase: entry.phase,
                        model: entry.request.model,
                        reasoningLevel: entry.request.reasoningLevel,
                        hasTools: Array.isArray(entry.request.tools) && entry.request.tools.length > 0,
                        toolCount: entry.request.tools?.length ?? 0,
                    });
                    try {
                        transcript.enhancementLog.logStep(entry.timestamp, 'enhance', 'model_call_start', {
                            callIndex: entry.callIndex,
                            phase: entry.phase,
                            request: entry.request,
                        });
                    } catch {
                        // Never let log errors interrupt processing
                    }
                },
                onModelCallComplete: (entry) => {
                    logger.info('worker.enhance.model_complete', {
                        uuid: item.uuid,
                        callIndex: entry.callIndex,
                        phase: entry.phase,
                        model: entry.response.model,
                        finishReason: entry.response.finishReason,
                        durationMs: entry.durationMs,
                        contentLength: entry.response.contentLength,
                        totalTokens: entry.response.usage?.totalTokens,
                        toolCallsRequested: entry.response.toolCalls?.length ?? 0,
                    });
                    try {
                        transcript.enhancementLog.logStep(entry.timestamp, 'enhance', 'model_call_complete', {
                            callIndex: entry.callIndex,
                            phase: entry.phase,
                            durationMs: entry.durationMs,
                            response: entry.response,
                        });
                    } catch {
                        // Never let log errors interrupt processing
                    }
                },
            });
            
            // Clean up the local routed PKL the pipeline created. In GCS mode we persist
            // from the working transcript temp file and optionally promote to routed path.
            if (result.outputPath && result.outputPath !== workingTranscriptPath) {
                try {
                    await fs.unlink(result.outputPath);
                } catch {
                    // File may not exist or already be cleaned up
                }
            }
            
            // Determine status based on whether enhancement actually changed the text
            const enhancementSucceeded = result.enhancedText 
                && result.enhancedText.length > 50 
                && result.enhancedText !== result.rawTranscript;
            const finalStatus = enhancementSucceeded ? 'enhanced' : 'initial';

            // Log enhancement completion before writing results
            transcript.enhancementLog.logStep(new Date(), 'enhance', 'enhancement_complete', {
                status: finalStatus,
                model: this.config.model || 'gpt-5-mini',
                reasoningLevel: 'medium',
                maxIterations: 20,
                toolsUsed: result.toolsUsed,
                totalToolCalls: toolCallCount,
                processingTimeMs: result.processingTime,
            });

            // Set raw transcript data
            transcript.setRawTranscript({
                text: result.rawTranscript,
                model: this.config.transcriptionModel || 'whisper-1',
                duration: result.processingTime,
                audioFile: item.metadata.audioFile,
                audioHash: item.metadata.audioHash,
                transcribedAt: new Date().toISOString(),
            });
            
            // Update content with enhanced text (or raw if enhancement failed)
            transcript.updateContent(result.enhancedText || result.rawTranscript);
            
            // Update metadata with appropriate status, title, project, and entity references
            transcript.updateMetadata({ 
                status: finalStatus,
                title: result.title || item.metadata.title || undefined,
                project: result.routedProjectName || undefined,
                projectId: result.routedProject || undefined,
                confidence: result.routingConfidence,
                entities: result.entities,
                errorDetails: undefined,
            });
            
            transcript.close();

            if (isGcsOutput && outputStorage) {
                let persistedToRoutedPath = false;
                if (result.outputPath && result.outputPath !== workingTranscriptPath) {
                    const desiredRoutedPath = toStorageCandidatePath(this.config.outputDirectory, result.outputPath);
                    const normalizedDesired = normalizeStoragePath(desiredRoutedPath);
                    if (
                        normalizedDesired
                        && normalizedDesired !== transcriptStoragePath
                        && !isUploadPlaceholderPath(normalizedDesired)
                    ) {
                        try {
                            const finalStoragePath = await this.resolveNonConflictingStoragePath(
                                outputStorage,
                                normalizedDesired,
                                item.uuid,
                            );
                            await syncTranscriptToStorage(outputStorage, finalStoragePath, workingTranscriptPath);
                            await outputStorage.deleteFile(transcriptStoragePath);
                            this.uploadStatusCache.delete(transcriptStoragePath);
                            transcriptStoragePath = finalStoragePath;
                            persistedToRoutedPath = true;
                            logger.info('worker.transcript.promoted', {
                                uuid: item.uuid,
                                fromPath: toStorageCandidatePath(this.config.outputDirectory, item.filePath),
                                toPath: finalStoragePath,
                            });
                        } catch (error) {
                            logger.warning('worker.transcript.promote_failed', {
                                uuid: item.uuid,
                                fromPath: toStorageCandidatePath(this.config.outputDirectory, item.filePath),
                                toPath: normalizedDesired,
                                error: error instanceof Error ? error.message : String(error),
                            });
                        }
                    }
                }

                if (!persistedToRoutedPath) {
                    await syncTranscriptToStorage(outputStorage, transcriptStoragePath, workingTranscriptPath);
                }
            }
            
            // Update stats
            this.stats.totalProcessed++;
            this.stats.lastProcessedTime = new Date().toISOString();
            this.stats.lastProcessedUuid = item.uuid;
            this.stats.currentTask = undefined;
            
            logger.info('worker.transcript.complete', {
                uuid: item.uuid,
                status: finalStatus,
                totalToolCalls: toolCallCount,
                storagePath: transcriptStoragePath,
            });
            markTranscriptIndexDirtyForStorage(
                outputStorage,
                this.config.outputDirectory,
                transcriptStoragePath,
            );
            if (transcriptStoragePath !== originalTranscriptStoragePath) {
                markTranscriptIndexDirtyForStorage(
                    outputStorage,
                    this.config.outputDirectory,
                    originalTranscriptStoragePath,
                );
            }

        } catch (error) {
            // Mark as error with details
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            logger.error('worker.transcript.failed', {
                uuid: item.uuid,
                error: errorMessage,
                stack: error instanceof Error ? error.stack : undefined,
            });
            
            try {
                await markTranscriptAsFailed(workingTranscriptPath, errorMessage);
                if (isGcsOutput && outputStorage) {
                    await syncTranscriptToStorage(outputStorage, transcriptStoragePath, workingTranscriptPath);
                }
            } catch {
                // If we cannot persist failure status, keep original error context in logs.
            }
            markTranscriptIndexDirtyForStorage(
                outputStorage,
                this.config.outputDirectory,
                transcriptStoragePath,
            );
            
            this.stats.currentTask = undefined;
        } finally {
            if (localTempAudioPath) {
                await fs.rm(localTempAudioPath, { force: true });
            }
            if (localTempTranscriptPath) {
                await fs.rm(localTempTranscriptPath, { force: true });
            }
        }
    }

    /**
     * Check if worker is running
     */
    isActive(): boolean {
        return this.isRunning;
    }

    /**
     * Get current task being processed
     */
    getCurrentTask(): string | undefined {
        return this.stats.currentTask;
    }

    /**
     * Get total number of transcripts processed
     */
    getProcessedCount(): number {
        return this.stats.totalProcessed;
    }

    /**
     * Get last processed time
     */
    getLastProcessedTime(): string | undefined {
        return this.stats.lastProcessedTime;
    }

    /**
     * Get worker uptime in seconds
     */
    getUptime(): number {
        return Math.floor((Date.now() - this.stats.startTime) / 1000);
    }

    /**
     * Get worker statistics
     */
    getStats(): WorkerStats {
        return { ...this.stats };
    }
}
