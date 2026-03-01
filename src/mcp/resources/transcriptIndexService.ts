import { basename } from 'node:path';
import { tmpdir } from 'node:os';
import * as fs from 'node:fs/promises';
import Logging from '@fjell/logging';
import { PklTranscript } from '@redaksjon/protokoll-format';
import { Transcript } from '@redaksjon/protokoll-engine';
import type { FileStorageProvider, StorageFileMetadata } from '../storage/fileProviders';

const logger = Logging.getLogger('@redaksjon/protokoll-mcp').get('transcript-index');
const INDEX_SCHEMA_VERSION = 1;
const DEFAULT_INDEX_PATH = '.protokoll/transcripts-index-v1.json';
const { readTranscriptContent } = Transcript;

type TranscriptListEntry = {
    path: string;
    filename: string;
    date: string;
    time?: string;
    title: string;
    status?: string;
    openTasksCount: number;
    contentSize: number;
    entities: unknown;
    hasRawTranscript: boolean;
};

interface TranscriptIndexEntry {
    path: string;
    filename: string;
    date: string;
    time?: string;
    title: string;
    status?: string;
    openTasksCount: number;
    contentSize: number;
    entities: unknown;
    hasRawTranscript: boolean;
    projectId?: string;
    project?: string;
    sourceSize: number;
    sourceUpdatedAt: string | null;
    sourceGeneration?: string;
    sourceEtag?: string;
    hydratedAt: string;
}

interface PersistedTranscriptIndex {
    version: number;
    builtAt: string;
    entries: Record<string, TranscriptIndexEntry>;
}

interface TranscriptHydrationFailure {
    version: string;
    reason: string;
}

function normalizePath(pathValue: string): string {
    return pathValue.replace(/^\/+/, '').replace(/\\/g, '/');
}

function normalizeDateOnly(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed.includes('T') ? trimmed.slice(0, 10) : trimmed;
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function passesDateFilter(date: string | undefined, startDate?: string, endDate?: string): boolean {
    const normalized = normalizeDateOnly(date);
    if (!normalized) {
        return !startDate && !endDate;
    }
    if (startDate && normalized < startDate) {
        return false;
    }
    if (endDate && normalized > endDate) {
        return false;
    }
    return true;
}

function metadataVersionKey(metadata: StorageFileMetadata): string {
    // Keep this key stable across provider/client variations.
    // `updatedAt + size` is consistently available for both GCS and filesystem providers.
    const stableUpdatedAt = metadata.updatedAt || '';
    const stableSize = String(Number(metadata.size || 0));
    return [
        stableUpdatedAt,
        stableSize,
    ].join('|');
}

function entryVersionKey(entry: TranscriptIndexEntry): string {
    return [
        entry.sourceUpdatedAt || '',
        String(Number(entry.sourceSize || 0)),
    ].join('|');
}

async function listFilesWithMetadataCompat(
    outputStorage: FileStorageProvider,
    prefix: string,
    pattern?: string,
): Promise<StorageFileMetadata[]> {
    const withMetadata = (outputStorage as {
        listFilesWithMetadata?: (prefix: string, pattern?: string) => Promise<StorageFileMetadata[]>;
    }).listFilesWithMetadata;
    if (typeof withMetadata === 'function') {
        return withMetadata.call(outputStorage, prefix, pattern);
    }
    const listFiles = (outputStorage as {
        listFiles?: (prefix: string, pattern?: string) => Promise<string[]>;
    }).listFiles;
    if (typeof listFiles !== 'function') {
        return [];
    }
    const listed = await listFiles.call(outputStorage, prefix, pattern);
    return listed.map((pathValue) => ({
        path: pathValue,
        size: 1,
        updatedAt: null,
    }));
}

async function withTempPklFile<T>(contents: Buffer, action: (tempPath: string) => Promise<T>): Promise<T> {
    const tempPath = `${tmpdir()}/protokoll-mcp-index-${Date.now()}-${Math.random().toString(36).slice(2)}.pkl`;
    await fs.writeFile(tempPath, contents);
    try {
        return await action(tempPath);
    } finally {
        await fs.rm(tempPath, { force: true });
    }
}

function isTranscriptCandidate(pathValue: string): boolean {
    const normalized = normalizePath(pathValue).toLowerCase();
    return normalized.endsWith('.pkl')
        && !normalized.startsWith('uploads/')
        && !normalized.startsWith('.intermediate/')
        && !normalized.includes('/uploads/')
        && !normalized.includes('/.intermediate/');
}

export interface TranscriptIndexListOptions {
    startDate?: string;
    endDate?: string;
    projectId?: string;
    projectName?: string;
    limit: number;
    offset: number;
}

export interface TranscriptIndexListResponse {
    transcripts: TranscriptListEntry[];
    total: number;
    hasMore: boolean;
    limit: number;
    offset: number;
}

class TranscriptIndexService {
    private readonly entries = new Map<string, TranscriptIndexEntry>();
    private readonly dirtyPaths = new Set<string>();
    private loadedFromSidecar = false;
    private forceRebuild = false;
    private persistInFlight = false;
    private persistRequested = false;
    private refreshInFlight: Promise<void> | null = null;
    private lastRefreshAt = 0;
    private readonly hydrationFailures = new Map<string, TranscriptHydrationFailure>();

    constructor(
        private readonly outputStorage: FileStorageProvider,
        private readonly outputDirectory: string,
        private readonly indexPath: string = DEFAULT_INDEX_PATH,
        private readonly refreshTtlMs: number = 5_000,
        private readonly maxCachedEntries: number = 50_000,
        private readonly sidecarEnabled: boolean = true,
    ) {}

    markDirty(pathValue: string): void {
        const normalized = normalizePath(pathValue);
        if (!normalized) {
            return;
        }
        this.dirtyPaths.add(normalized);
        if (normalized.endsWith('.pkl')) {
            this.dirtyPaths.add(normalized.slice(0, -4));
        } else {
            this.dirtyPaths.add(`${normalized}.pkl`);
        }
    }

    invalidateAll(): void {
        this.forceRebuild = true;
        this.dirtyPaths.clear();
    }

    async listTranscripts(options: TranscriptIndexListOptions): Promise<TranscriptIndexListResponse> {
        const startedAt = Date.now();
        await this.refreshIndexIfNeeded();

        const { startDate, endDate, projectId, projectName, limit, offset } = options;
        const filtered = Array.from(this.entries.values())
            .filter((entry) => {
                if (projectId) {
                    const projectMatches = entry.projectId === projectId
                        || (projectName ? entry.project === projectName : entry.project === projectId);
                    if (!projectMatches) {
                        return false;
                    }
                }
                return passesDateFilter(entry.date, startDate, endDate);
            })
            .sort((a, b) => {
                const dateCompare = (b.date || '').localeCompare(a.date || '');
                if (dateCompare !== 0) {
                    return dateCompare;
                }
                const timeCompare = (b.time || '').localeCompare(a.time || '');
                if (timeCompare !== 0) {
                    return timeCompare;
                }
                return b.filename.localeCompare(a.filename);
            });

        const page = filtered.slice(offset, offset + limit).map((entry) => ({
            path: entry.path,
            filename: entry.filename,
            date: entry.date || '1970-01-01',
            time: entry.time,
            title: entry.title,
            status: entry.status,
            openTasksCount: entry.openTasksCount,
            contentSize: entry.contentSize,
            entities: entry.entities,
            hasRawTranscript: entry.hasRawTranscript,
        }));

        logger.info('transcripts.index.list.complete', {
            totalIndexed: this.entries.size,
            totalAfterFilters: filtered.length,
            returned: page.length,
            hasMore: offset + limit < filtered.length,
            elapsedMs: Date.now() - startedAt,
        });

        return {
            transcripts: page,
            total: filtered.length,
            hasMore: offset + limit < filtered.length,
            limit,
            offset,
        };
    }

    private async refreshIndexIfNeeded(): Promise<void> {
        if (!this.loadedFromSidecar) {
            await this.loadSidecar();
        }

        const now = Date.now();
        const needsRefresh = this.forceRebuild
            || this.dirtyPaths.size > 0
            || this.entries.size === 0
            || now - this.lastRefreshAt > this.refreshTtlMs;
        if (!needsRefresh) {
            logger.debug('transcripts.index.refresh.skipped', {
                reason: 'ttl_cache_hit',
                cachedEntries: this.entries.size,
                dirtyPaths: this.dirtyPaths.size,
            });
            return;
        }

        await this.refreshIndexOnce();
        this.lastRefreshAt = Date.now();
    }

    private async refreshIndexOnce(): Promise<void> {
        if (this.refreshInFlight) {
            await this.refreshInFlight;
            return;
        }
        this.refreshInFlight = this.refreshIndex().finally(() => {
            this.refreshInFlight = null;
        });
        await this.refreshInFlight;
    }

    private async refreshIndex(): Promise<void> {
        const refreshStartedAt = Date.now();
        const listed = await listFilesWithMetadataCompat(this.outputStorage, '');
        const candidates = listed
            .map((metadata) => ({ ...metadata, path: normalizePath(metadata.path) }))
            .filter((metadata) => isTranscriptCandidate(metadata.path));

        const byPath = new Map(candidates.map((metadata) => [metadata.path, metadata]));
        const dirtyAtStart = new Set(this.dirtyPaths);

        let cacheHits = 0;
        let changedCount = 0;
        let hydrateSuccess = 0;
        let hydrateFailed = 0;
        let removedCount = 0;

        if (this.forceRebuild) {
            changedCount = candidates.length;
            this.entries.clear();
        } else {
            for (const metadata of candidates) {
                const cached = this.entries.get(metadata.path);
                const dirty = dirtyAtStart.has(metadata.path);
                if (!cached || dirty) {
                    changedCount++;
                    continue;
                }
                const cachedVersion = entryVersionKey(cached);
                if (cachedVersion === metadataVersionKey(metadata)) {
                    cacheHits++;
                } else {
                    changedCount++;
                }
            }
        }

        for (const [pathValue, cached] of this.entries.entries()) {
            if (!byPath.has(pathValue)) {
                this.entries.delete(pathValue);
                this.hydrationFailures.delete(pathValue);
                removedCount++;
            } else if (cached && this.forceRebuild) {
                this.entries.delete(pathValue);
            }
        }

        for (const metadata of candidates) {
            const dirty = dirtyAtStart.has(metadata.path);
            const cached = this.entries.get(metadata.path);
            const sameVersion = cached
                ? entryVersionKey(cached) === metadataVersionKey(metadata)
                : false;
            if (!this.forceRebuild && !dirty && sameVersion) {
                continue;
            }

            const metadataVersion = metadataVersionKey(metadata);
            const previousFailure = this.hydrationFailures.get(metadata.path);
            if (!this.forceRebuild && !dirty && previousFailure && previousFailure.version === metadataVersion) {
                hydrateFailed++;
                continue;
            }

            const hydrated = await this.hydrateEntry(metadata);
            if (!hydrated) {
                hydrateFailed++;
                continue;
            }
            hydrateSuccess++;
            this.hydrationFailures.delete(metadata.path);
            this.entries.set(metadata.path, hydrated);
        }

        if (this.entries.size > this.maxCachedEntries) {
            const overflow = this.entries.size - this.maxCachedEntries;
            const sorted = Array.from(this.entries.values())
                .sort((a, b) => (a.hydratedAt || '').localeCompare(b.hydratedAt || ''))
                .slice(0, overflow);
            for (const entry of sorted) {
                this.entries.delete(entry.path);
            }
            logger.warning('transcripts.index.cache.evicted', {
                overflow,
                maxCachedEntries: this.maxCachedEntries,
                totalAfterEvict: this.entries.size,
            });
        }

        this.forceRebuild = false;
        this.dirtyPaths.clear();
        this.schedulePersist();

        logger.info('transcripts.index.refresh.complete', {
            outputDirectory: this.outputDirectory,
            listedObjects: listed.length,
            transcriptCandidates: candidates.length,
            cacheHits,
            changedCount,
            hydrateSuccess,
            hydrateFailed,
            removedCount,
            indexedEntries: this.entries.size,
            elapsedMs: Date.now() - refreshStartedAt,
        });
    }

    private async hydrateEntry(metadata: StorageFileMetadata): Promise<TranscriptIndexEntry | null> {
        const version = metadataVersionKey(metadata);
        if (Number(metadata.size || 0) <= 0) {
            this.hydrationFailures.set(metadata.path, {
                version,
                reason: 'empty_file',
            });
            logger.info('transcripts.index.hydrate.skipped', {
                path: metadata.path,
                reason: 'empty_file',
            });
            return null;
        }

        try {
            const buffer = await this.outputStorage.readFile(metadata.path);
            return await withTempPklFile(buffer, async (tempPath) => {
                const { content, metadata: transcriptMetadata, title } = await readTranscriptContent(tempPath);
                const pklTranscript = PklTranscript.open(tempPath, { readOnly: true });
                let hasRawTranscript = false;
                try {
                    hasRawTranscript = Boolean(pklTranscript.hasRawTranscript);
                } finally {
                    pklTranscript.close();
                }

                const date = normalizeDateOnly(asOptionalString(transcriptMetadata.date));
                const tasks = Array.isArray(transcriptMetadata.tasks) ? transcriptMetadata.tasks : [];
                const openTasksCount = tasks.filter((task: unknown) => {
                    if (!task || typeof task !== 'object') {
                        return true;
                    }
                    return (task as { status?: unknown }).status !== 'completed';
                }).length;

                return {
                    path: metadata.path,
                    filename: basename(metadata.path),
                    date: date || '1970-01-01',
                    time: asOptionalString(transcriptMetadata.time),
                    title: title || metadata.path.replace(/\.pkl$/i, '').split('/').pop() || 'Untitled',
                    status: asOptionalString(transcriptMetadata.status),
                    openTasksCount,
                    contentSize: content.length,
                    entities: transcriptMetadata.entities,
                    hasRawTranscript,
                    projectId: asOptionalString(transcriptMetadata.projectId),
                    project: asOptionalString(transcriptMetadata.project),
                    sourceSize: Number(metadata.size || 0),
                    sourceUpdatedAt: metadata.updatedAt || null,
                    sourceGeneration: metadata.generation,
                    sourceEtag: metadata.etag,
                    hydratedAt: new Date().toISOString(),
                } satisfies TranscriptIndexEntry;
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isLegacyMetadataError = message.includes('no such table: metadata');
            this.hydrationFailures.set(metadata.path, {
                version,
                reason: isLegacyMetadataError ? 'legacy_missing_metadata_table' : message,
            });

            const logMethod = isLegacyMetadataError ? logger.info.bind(logger) : logger.warning.bind(logger);
            logMethod('transcripts.index.hydrate.failed', {
                path: metadata.path,
                error: message,
                classification: isLegacyMetadataError ? 'legacy_unsupported_transcript' : 'hydrate_error',
            });
            return null;
        }
    }

    async findPathsByFilename(targetFilenames: Set<string>): Promise<string[]> {
        await this.refreshIndexIfNeeded();
        const matches: string[] = [];
        for (const [entryPath, entry] of this.entries) {
            const entryFilename = entry.filename || entryPath.split('/').pop() || '';
            if (targetFilenames.has(entryFilename)) {
                matches.push(entryPath);
            }
        }
        return matches;
    }

    private async loadSidecar(): Promise<void> {
        this.loadedFromSidecar = true;
        if (!this.sidecarEnabled) {
            return;
        }
        try {
            if (!(await this.outputStorage.exists(this.indexPath))) {
                return;
            }
            const raw = await this.outputStorage.readFile(this.indexPath);
            const parsed = JSON.parse(raw.toString('utf8')) as Partial<PersistedTranscriptIndex>;
            if (parsed.version !== INDEX_SCHEMA_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
                logger.warning('transcripts.index.sidecar.invalid_schema', {
                    indexPath: this.indexPath,
                    version: parsed.version ?? null,
                });
                return;
            }
            for (const [pathValue, entry] of Object.entries(parsed.entries)) {
                if (entry && typeof entry === 'object' && isTranscriptCandidate(pathValue)) {
                    this.entries.set(pathValue, {
                        ...entry,
                        path: normalizePath(entry.path || pathValue),
                        filename: entry.filename || basename(pathValue),
                        date: entry.date || '1970-01-01',
                        openTasksCount: Number(entry.openTasksCount || 0),
                        contentSize: Number(entry.contentSize || 0),
                        sourceSize: Number(entry.sourceSize || 0),
                        sourceUpdatedAt: entry.sourceUpdatedAt || null,
                        hydratedAt: entry.hydratedAt || new Date(0).toISOString(),
                    });
                }
            }
            logger.info('transcripts.index.sidecar.loaded', {
                indexPath: this.indexPath,
                loadedEntries: this.entries.size,
            });
        } catch (error) {
            logger.warning('transcripts.index.sidecar.load_failed', {
                indexPath: this.indexPath,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private schedulePersist(): void {
        if (!this.sidecarEnabled) {
            return;
        }
        this.persistRequested = true;
        if (this.persistInFlight) {
            return;
        }
        void this.persistLoop();
    }

    private async persistLoop(): Promise<void> {
        this.persistInFlight = true;
        try {
            while (this.persistRequested) {
                this.persistRequested = false;
                const payload: PersistedTranscriptIndex = {
                    version: INDEX_SCHEMA_VERSION,
                    builtAt: new Date().toISOString(),
                    entries: Object.fromEntries(this.entries.entries()),
                };
                try {
                    await this.outputStorage.writeFile(this.indexPath, JSON.stringify(payload));
                    logger.debug('transcripts.index.sidecar.saved', {
                        indexPath: this.indexPath,
                        entryCount: this.entries.size,
                    });
                } catch (error) {
                    logger.warning('transcripts.index.sidecar.save_failed', {
                        indexPath: this.indexPath,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        } finally {
            this.persistInFlight = false;
        }
    }
}

const serviceInstances = new Map<string, TranscriptIndexService>();
const serviceInstancesByProvider = new WeakMap<FileStorageProvider, TranscriptIndexService>();

function getServiceForStorage(outputStorage: FileStorageProvider, outputDirectory: string): TranscriptIndexService {
    if (outputStorage.cacheKey) {
        const existing = serviceInstances.get(outputStorage.cacheKey);
        if (existing) {
            return existing;
        }
        const created = new TranscriptIndexService(outputStorage, outputDirectory, DEFAULT_INDEX_PATH, 5_000, 50_000, true);
        serviceInstances.set(outputStorage.cacheKey, created);
        return created;
    }

    const existingForProvider = serviceInstancesByProvider.get(outputStorage);
    if (existingForProvider) {
        return existingForProvider;
    }

    const created = new TranscriptIndexService(outputStorage, outputDirectory, DEFAULT_INDEX_PATH, 5_000, 50_000, false);
    serviceInstancesByProvider.set(outputStorage, created);
    return created;
}

export async function listTranscriptsViaIndex(args: {
    outputStorage: FileStorageProvider;
    outputDirectory: string;
    startDate?: string;
    endDate?: string;
    projectId?: string;
    projectName?: string;
    limit: number;
    offset: number;
}): Promise<TranscriptIndexListResponse> {
    const service = getServiceForStorage(args.outputStorage, args.outputDirectory);
    return service.listTranscripts({
        startDate: args.startDate,
        endDate: args.endDate,
        projectId: args.projectId,
        projectName: args.projectName,
        limit: args.limit,
        offset: args.offset,
    });
}

export function markTranscriptIndexDirtyForStorage(
    outputStorage: FileStorageProvider | null | undefined,
    outputDirectory: string,
    pathValue: string,
): void {
    if (!outputStorage) {
        return;
    }
    const service = getServiceForStorage(outputStorage, outputDirectory);
    service.markDirty(pathValue);
}

export function invalidateTranscriptIndexForStorage(
    outputStorage: FileStorageProvider | null | undefined,
    outputDirectory: string,
): void {
    if (!outputStorage) {
        return;
    }
    const service = getServiceForStorage(outputStorage, outputDirectory);
    service.invalidateAll();
}

export async function resolveTranscriptPathByFilename(
    outputStorage: FileStorageProvider,
    outputDirectory: string,
    targetFilenames: Set<string>,
): Promise<string[]> {
    const service = getServiceForStorage(outputStorage, outputDirectory);
    const indexedMatches = await service.findPathsByFilename(targetFilenames);
    if (indexedMatches.length > 0) {
        return indexedMatches;
    }

    const listed = await listFilesWithMetadataCompat(outputStorage, '', '.pkl');
    return listed
        .map((entry) => normalizePath(entry.path))
        .filter((entryPath) => targetFilenames.has(entryPath.split('/').pop() || ''));
}
