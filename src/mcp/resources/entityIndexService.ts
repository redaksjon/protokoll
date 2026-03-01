import Logging from '@fjell/logging';
import * as yaml from 'js-yaml';
import { createGcsStorageProvider } from '../storage/gcsProvider';
import type { StorageFileMetadata } from '../storage/fileProviders';
import * as ServerConfig from '../serverConfig';

const logger = Logging.getLogger('@redaksjon/protokoll-mcp').get('entity-index');
const INDEX_SCHEMA_VERSION = 1;
const INDEX_PATH = '.protokoll/entities-index-v1.json';

export type IndexedEntityType = 'person' | 'project' | 'term' | 'company' | 'ignored';

const ENTITY_DIRECTORY: Record<IndexedEntityType, string> = {
    person: 'people',
    project: 'projects',
    term: 'terms',
    company: 'companies',
    ignored: 'ignored',
};

interface ContextGcsConfig {
    uri: string;
    projectId?: string;
    credentialsFile?: string;
}

interface EntityIndexEntry {
    entityType: IndexedEntityType;
    path: string;
    id: string;
    name: string;
    slug?: string;
    payload: Record<string, unknown>;
    sourceGeneration?: string;
    sourceUpdatedAt: string | null;
    sourceSize: number;
    sourceEtag?: string;
    hydratedAt: string;
}

interface PersistedEntityIndex {
    version: number;
    builtAt: string;
    byType: Record<IndexedEntityType, Record<string, EntityIndexEntry>>;
}

function normalizePath(pathValue: string): string {
    return pathValue.replace(/^\/+/, '').replace(/\\/g, '/');
}

function metadataVersionKey(metadata: StorageFileMetadata): string {
    return [
        metadata.generation || '',
        metadata.updatedAt || '',
        String(metadata.size || 0),
        metadata.etag || '',
    ].join('|');
}

function isYamlPath(pathValue: string): boolean {
    const normalized = normalizePath(pathValue).toLowerCase();
    return normalized.endsWith('.yaml') || normalized.endsWith('.yml');
}

async function listFilesWithMetadataCompat(
    provider: { listFiles: (prefix: string, pattern?: string) => Promise<string[]>; listFilesWithMetadata?: (prefix: string, pattern?: string) => Promise<StorageFileMetadata[]>; },
    prefix: string,
    pattern?: string,
): Promise<StorageFileMetadata[]> {
    if (typeof provider.listFilesWithMetadata === 'function') {
        return provider.listFilesWithMetadata(prefix, pattern);
    }
    const listed = await provider.listFiles(prefix, pattern);
    return listed.map((pathValue) => ({
        path: pathValue,
        size: 1,
        updatedAt: null,
    }));
}

function getContextGcsConfig(): ContextGcsConfig | null {
    let storageConfig: ReturnType<typeof ServerConfig.getStorageConfig>;
    try {
        storageConfig = ServerConfig.getStorageConfig();
    } catch {
        return null;
    }
    if (storageConfig.backend !== 'gcs' || !storageConfig.gcs) {
        return null;
    }

    const gcs = storageConfig.gcs;
    const contextUri = gcs.contextUri
        || (gcs.contextBucket
            ? `gs://${gcs.contextBucket}/${(gcs.contextPrefix || '').replace(/^\/+|\/+$/g, '')}`
            : undefined);
    if (!contextUri) {
        return null;
    }
    return {
        uri: contextUri,
        projectId: gcs.projectId,
        credentialsFile: gcs.credentialsFile,
    };
}

class EntityIndexService {
    private readonly byType = new Map<IndexedEntityType, Map<string, EntityIndexEntry>>();
    private readonly dirtyTypes = new Set<IndexedEntityType>();
    private sidecarLoaded = false;
    private persistInFlight = false;
    private persistRequested = false;
    private lastRefreshAtByType = new Map<IndexedEntityType, number>();
    private readonly refreshTtlMs = 5_000;

    constructor(private readonly contextGcs: ContextGcsConfig) {
        this.byType.set('person', new Map());
        this.byType.set('project', new Map());
        this.byType.set('term', new Map());
        this.byType.set('company', new Map());
        this.byType.set('ignored', new Map());
    }

    markDirty(entityType?: IndexedEntityType): void {
        if (entityType) {
            this.dirtyTypes.add(entityType);
            return;
        }
        this.dirtyTypes.add('person');
        this.dirtyTypes.add('project');
        this.dirtyTypes.add('term');
        this.dirtyTypes.add('company');
        this.dirtyTypes.add('ignored');
    }

    async list(entityType: IndexedEntityType): Promise<Array<Record<string, unknown>>> {
        await this.refreshTypeIfNeeded(entityType);
        const entries = this.byType.get(entityType) || new Map();
        return Array.from(entries.values()).map((entry) => entry.payload);
    }

    async find(entityType: IndexedEntityType, entityId: string): Promise<Record<string, unknown> | null> {
        await this.refreshTypeIfNeeded(entityType);
        const normalized = entityId.trim().toLowerCase();
        const prefix = normalized.match(/^([a-f0-9]{8})/)?.[1];
        const entries = this.byType.get(entityType) || new Map();

        for (const entry of entries.values()) {
            const idLower = entry.id.toLowerCase();
            const slugLower = (entry.slug || '').toLowerCase();
            if (idLower === normalized || slugLower === normalized) {
                return entry.payload;
            }
            if (normalized && (idLower.startsWith(normalized) || normalized.startsWith(idLower))) {
                return entry.payload;
            }
            if (prefix && idLower.startsWith(prefix)) {
                return entry.payload;
            }
        }
        return null;
    }

    private async refreshTypeIfNeeded(entityType: IndexedEntityType): Promise<void> {
        if (!this.sidecarLoaded) {
            await this.loadSidecar();
        }

        const now = Date.now();
        const needsRefresh = this.dirtyTypes.has(entityType)
            || (this.byType.get(entityType)?.size || 0) === 0
            || now - (this.lastRefreshAtByType.get(entityType) || 0) > this.refreshTtlMs;
        if (!needsRefresh) {
            return;
        }

        const startedAt = Date.now();
        const provider = createGcsStorageProvider(
            this.contextGcs.uri,
            this.contextGcs.credentialsFile,
            this.contextGcs.projectId,
        );
        const directory = ENTITY_DIRECTORY[entityType];
        const listed = await listFilesWithMetadataCompat(provider as any, `${directory}/`);
        const yamlEntries = listed
            .map((metadata) => ({ ...metadata, path: normalizePath(metadata.path) }))
            .filter((metadata) => isYamlPath(metadata.path));
        const byPath = new Map(yamlEntries.map((metadata) => [metadata.path, metadata]));
        const existing = this.byType.get(entityType) || new Map<string, EntityIndexEntry>();
        let changedCount = 0;
        let cacheHitCount = 0;
        let removedCount = 0;
        let hydrateSuccess = 0;
        let hydrateFailed = 0;

        for (const [pathValue] of existing.entries()) {
            if (!byPath.has(pathValue)) {
                existing.delete(pathValue);
                removedCount++;
            }
        }

        for (const metadata of yamlEntries) {
            const cached = existing.get(metadata.path);
            const sameVersion = cached
                ? [
                    cached.sourceGeneration || '',
                    cached.sourceUpdatedAt || '',
                    String(cached.sourceSize || 0),
                    cached.sourceEtag || '',
                ].join('|') === metadataVersionKey(metadata)
                : false;

            if (sameVersion && !this.dirtyTypes.has(entityType)) {
                cacheHitCount++;
                continue;
            }

            changedCount++;
            try {
                const raw = await provider.readFile(metadata.path);
                const parsed = yaml.load(raw.toString('utf8'));
                if (!parsed || typeof parsed !== 'object') {
                    hydrateFailed++;
                    continue;
                }
                const payload = parsed as Record<string, unknown>;
                const id = typeof payload.id === 'string' ? payload.id : '';
                const name = typeof payload.name === 'string' ? payload.name : '';
                if (!id || !name) {
                    hydrateFailed++;
                    continue;
                }
                const slug = typeof payload.slug === 'string' ? payload.slug : undefined;
                existing.set(metadata.path, {
                    entityType,
                    path: metadata.path,
                    id,
                    name,
                    slug,
                    payload,
                    sourceGeneration: metadata.generation,
                    sourceUpdatedAt: metadata.updatedAt || null,
                    sourceSize: Number(metadata.size || 0),
                    sourceEtag: metadata.etag,
                    hydratedAt: new Date().toISOString(),
                });
                hydrateSuccess++;
            } catch (error) {
                hydrateFailed++;
                logger.warning('entities.index.hydrate.failed', {
                    entityType,
                    path: metadata.path,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        this.byType.set(entityType, existing);
        this.lastRefreshAtByType.set(entityType, Date.now());
        this.dirtyTypes.delete(entityType);
        this.schedulePersist();

        logger.info('entities.index.refresh.complete', {
            entityType,
            listed: listed.length,
            yamlCandidates: yamlEntries.length,
            cacheHitCount,
            changedCount,
            removedCount,
            hydrateSuccess,
            hydrateFailed,
            indexedEntries: existing.size,
            elapsedMs: Date.now() - startedAt,
        });
    }

    private async loadSidecar(): Promise<void> {
        this.sidecarLoaded = true;
        try {
            const provider = createGcsStorageProvider(
                this.contextGcs.uri,
                this.contextGcs.credentialsFile,
                this.contextGcs.projectId,
            );
            if (!(await provider.exists(INDEX_PATH))) {
                return;
            }
            const raw = await provider.readFile(INDEX_PATH);
            const parsed = JSON.parse(raw.toString('utf8')) as Partial<PersistedEntityIndex>;
            if (parsed.version !== INDEX_SCHEMA_VERSION || !parsed.byType || typeof parsed.byType !== 'object') {
                logger.warning('entities.index.sidecar.invalid_schema', {
                    indexPath: INDEX_PATH,
                    version: parsed.version ?? null,
                });
                return;
            }
            for (const type of Object.keys(ENTITY_DIRECTORY) as IndexedEntityType[]) {
                const forType = parsed.byType[type];
                if (!forType || typeof forType !== 'object') {
                    continue;
                }
                const map = this.byType.get(type) || new Map<string, EntityIndexEntry>();
                for (const [pathValue, entry] of Object.entries(forType)) {
                    if (!entry || typeof entry !== 'object') {
                        continue;
                    }
                    map.set(pathValue, {
                        ...entry,
                        entityType: type,
                        path: normalizePath(entry.path || pathValue),
                        id: String(entry.id || ''),
                        name: String(entry.name || ''),
                        payload: (entry.payload || {}) as Record<string, unknown>,
                        sourceUpdatedAt: entry.sourceUpdatedAt || null,
                        sourceSize: Number(entry.sourceSize || 0),
                        hydratedAt: entry.hydratedAt || new Date(0).toISOString(),
                    });
                }
                this.byType.set(type, map);
            }
            logger.info('entities.index.sidecar.loaded', {
                indexPath: INDEX_PATH,
                person: this.byType.get('person')?.size || 0,
                project: this.byType.get('project')?.size || 0,
                term: this.byType.get('term')?.size || 0,
                company: this.byType.get('company')?.size || 0,
                ignored: this.byType.get('ignored')?.size || 0,
            });
        } catch (error) {
            logger.warning('entities.index.sidecar.load_failed', {
                indexPath: INDEX_PATH,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private schedulePersist(): void {
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
                const provider = createGcsStorageProvider(
                    this.contextGcs.uri,
                    this.contextGcs.credentialsFile,
                    this.contextGcs.projectId,
                );
                const payload: PersistedEntityIndex = {
                    version: INDEX_SCHEMA_VERSION,
                    builtAt: new Date().toISOString(),
                    byType: {
                        person: Object.fromEntries(this.byType.get('person')?.entries() || []),
                        project: Object.fromEntries(this.byType.get('project')?.entries() || []),
                        term: Object.fromEntries(this.byType.get('term')?.entries() || []),
                        company: Object.fromEntries(this.byType.get('company')?.entries() || []),
                        ignored: Object.fromEntries(this.byType.get('ignored')?.entries() || []),
                    },
                };
                try {
                    await provider.writeFile(INDEX_PATH, JSON.stringify(payload));
                } catch (error) {
                    logger.warning('entities.index.sidecar.save_failed', {
                        indexPath: INDEX_PATH,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        } finally {
            this.persistInFlight = false;
        }
    }
}

const servicesByKey = new Map<string, EntityIndexService>();

function getOrCreateService(contextGcs: ContextGcsConfig): EntityIndexService {
    const key = `${contextGcs.uri}|${contextGcs.projectId || ''}|${contextGcs.credentialsFile || ''}`;
    const existing = servicesByKey.get(key);
    if (existing) {
        return existing;
    }
    const created = new EntityIndexService(contextGcs);
    servicesByKey.set(key, created);
    return created;
}

export async function listContextEntitiesFromGcs(entityType: IndexedEntityType): Promise<Array<Record<string, unknown>>> {
    const contextGcs = getContextGcsConfig();
    if (!contextGcs) {
        return [];
    }
    const service = getOrCreateService(contextGcs);
    return service.list(entityType);
}

export async function findContextEntityInGcs(
    entityType: IndexedEntityType,
    entityId: string,
): Promise<Record<string, unknown> | null> {
    const contextGcs = getContextGcsConfig();
    if (!contextGcs) {
        return null;
    }
    const service = getOrCreateService(contextGcs);
    return service.find(entityType, entityId);
}

export function markContextEntityIndexDirty(entityType?: IndexedEntityType): void {
    const contextGcs = getContextGcsConfig();
    if (!contextGcs) {
        return;
    }
    const service = getOrCreateService(contextGcs);
    service.markDirty(entityType);
}
