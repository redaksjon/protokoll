 
/**
 * Shared types, constants, and utilities for MCP tools
 */
import { stat, readdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { Media, Util as Storage, Transcript } from '@redaksjon/protokoll-engine';
import { getLogger } from '@/logging';

// Import transcript utilities
const transcriptExists = Transcript.transcriptExists;
const ensurePklExtension = Transcript.ensurePklExtension;

/**
 * Check if input looks like a UUID (8+ hex chars)
 * Inlined to avoid import issues
 */
function isUuidInput(input: string): boolean {
    const normalized = input.trim();
    if (
        normalized.includes('/') ||
        normalized.includes('\\') ||
        normalized.includes('.') ||
        normalized.startsWith('protokoll://')
    ) {
        return false;
    }
    // Full UUID or UUID-style hex prefix without path separators.
    return /^[a-f0-9]{8,}$/i.test(normalized);
}

/**
 * Find transcript by UUID
 * Delegates to protokoll-engine
 */
async function findTranscriptByUuid(uuid: string, searchDirectories: string[]): Promise<string | null> {
    return Transcript.findTranscriptByUuid(uuid, searchDirectories);
}
import * as Context from '@/context';
import type { ProtokollContextInstance } from '@/context';
import type { Person, Project, Term, Company, IgnoredTerm, Entity } from '@/context/types';
import { parseUri, isProtokolUri } from '../uri';
import { parseGcsUri } from '../storage/gcsUri';
import { listContextEntitiesFromGcs } from '../resources/entityIndexService';

// ============================================================================
// Shared Utilities
// ============================================================================

export const logger = getLogger();
export const media = Media.create(logger);
export const storage = Storage.create({ log: logger.debug.bind(logger) });

// ============================================================================
// Types
// ============================================================================

export interface ProcessingResult {
    outputPath: string;
    enhancedText: string;
    rawTranscript: string;
    routedProject?: string;
    routingConfidence: number;
    processingTime: number;
    toolsUsed: string[];
    correctionsApplied: number;
}

export interface DiscoveredConfig {
    path: string;
    projectCount: number;
    peopleCount: number;
    termsCount: number;
    companiesCount: number;
    outputDirectory?: string;
    model?: string;
}

export interface ProjectSuggestion {
    projectId: string;
    projectName: string;
    confidence: number;
    reason: string;
    destination?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Helper for async file existence check
 */
export async function fileExists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get a configured directory from server configuration
 * Uses workspace-level configuration instead of navigating up the directory tree
 */
export async function getConfiguredDirectory(
    key: 'inputDirectory' | 'outputDirectory' | 'processedDirectory',
    _contextDirectory?: string  // Kept for backward compatibility but not used
): Promise<string> {
    // Import here to avoid circular dependencies
    const ServerConfig = await import('../serverConfig');
    
    switch (key) {
        case 'inputDirectory':
            return ServerConfig.getInputDirectory();
        case 'outputDirectory':
            return ServerConfig.getOutputDirectory();
        case 'processedDirectory':
            return ServerConfig.getProcessedDirectory() || resolve(process.cwd(), './processed');
    }
}

/**
 * Get context directories from server configuration
 * Returns the contextDirectories array from protokoll-config.yaml if available
 */
export async function getContextDirectories(): Promise<string[] | undefined> {
    // Import here to avoid circular dependencies
    const ServerConfig = await import('../serverConfig');
    
    const config = ServerConfig.getServerConfig();
    return config.configFile?.contextDirectories as string[] | undefined;
}

/**
 * Create a context instance for tool handlers.
 * Uses contextDirectories from server config (protokoll-config.yaml) when available,
 * matching the behavior of entity resource handlers.
 * Falls back to standard .protokoll discovery from the given directory.
 */
export async function createToolContext(contextDirectory?: string): Promise<ProtokollContextInstance> {
    const resolveByIdentifier = <T extends { id: string; slug?: string; name: string }>(
        entities: T[],
        identifier: string | null | undefined,
    ): T | undefined => {
        const normalized = typeof identifier === 'string' ? identifier.trim().toLowerCase() : '';
        if (!normalized) return undefined;
        const uuidPrefix = normalized.match(/^([a-f0-9]{8})/)?.[1];
        for (const entity of entities) {
            const idLower = entity.id.toLowerCase();
            const slugLower = entity.slug?.toLowerCase();
            const nameSlug = entity.name
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');
            if (idLower === normalized || slugLower === normalized || nameSlug === normalized) {
                return entity;
            }
            if (idLower.startsWith(normalized) || normalized.startsWith(idLower)) {
                return entity;
            }
            if (uuidPrefix && idLower.startsWith(uuidPrefix)) {
                return entity;
            }
        }
        return undefined;
    };

    const buildGcsFallbackContext = async (
        baseContext?: ProtokollContextInstance,
    ): Promise<ProtokollContextInstance> => {
        const people = (await listContextEntitiesFromGcs('person')) as Person[];
        const projects = (await listContextEntitiesFromGcs('project')) as Project[];
        const terms = (await listContextEntitiesFromGcs('term')) as Term[];
        const companies = (await listContextEntitiesFromGcs('company')) as Company[];
        const ignored = (await listContextEntitiesFromGcs('ignored')) as IgnoredTerm[];

        logger.info('tool.context.gcs_entity_index_fallback.loaded', {
            projectCount: projects.length,
            peopleCount: people.length,
            termCount: terms.length,
            companyCount: companies.length,
            ignoredCount: ignored.length,
        });

        const searchAcross = [...people, ...projects, ...terms, ...companies, ...ignored] as Entity[];
        const contextDirs = baseContext?.getContextDirs?.() || ['gcs://context'];

        const fallbackContext = {
            load: async () => {
                if (baseContext?.load) {
                    await baseContext.load();
                }
            },
            reload: async () => {
                if (baseContext?.reload) {
                    await baseContext.reload();
                }
            },
            getDiscoveredDirs: () => [],
            getConfig: () => (baseContext?.getConfig?.() || {}),
            getContextDirs: () => contextDirs,
            getPerson: (id: string) => resolveByIdentifier(people, id),
            getProject: (id: string) => resolveByIdentifier(projects, id),
            getCompany: (id: string) => resolveByIdentifier(companies, id),
            getTerm: (id: string) => resolveByIdentifier(terms, id),
            getIgnored: (id: string) => resolveByIdentifier(ignored, id),
            getAllPeople: () => people,
            getAllProjects: () => projects,
            getAllCompanies: () => companies,
            getAllTerms: () => terms,
            getAllIgnored: () => ignored,
            isIgnored: (term: string) => {
                const normalized = term.toLowerCase().trim();
                return ignored.some((entry) =>
                    entry.name.toLowerCase() === normalized || entry.id.toLowerCase() === normalized
                );
            },
            search: (query: string) => {
                const q = query.toLowerCase().trim();
                if (!q) return [];
                return searchAcross.filter((entity: any) => {
                    const byName = typeof entity.name === 'string' && entity.name.toLowerCase().includes(q);
                    const bySoundsLike = Array.isArray(entity.sounds_like)
                        && entity.sounds_like.some((s: string) => typeof s === 'string' && s.toLowerCase().includes(q));
                    return byName || bySoundsLike;
                });
            },
            findBySoundsLike: (phonetic: string) => {
                const key = phonetic.toLowerCase().trim();
                if (!key) return undefined;
                return searchAcross.find((entity: any) => Array.isArray(entity.sounds_like)
                    && entity.sounds_like.some((s: string) => typeof s === 'string' && s.toLowerCase() === key));
            },
            searchWithContext: (query: string) => {
                const q = query.toLowerCase().trim();
                if (!q) return [];
                return searchAcross.filter((entity) => entity.name.toLowerCase().includes(q));
            },
            getRelatedProjects: () => [],
            saveEntity: async (entity: Entity, allowUpdate?: boolean) => {
                if (!baseContext?.saveEntity) {
                    throw new Error('GCS fallback context cannot persist entities');
                }
                return baseContext.saveEntity(entity, allowUpdate);
            },
            deleteEntity: async (entity: Entity) => {
                if (!baseContext?.deleteEntity) {
                    return false;
                }
                return baseContext.deleteEntity(entity);
            },
            getEntityFilePath: (entity: Entity) => baseContext?.getEntityFilePath?.(entity),
            hasContext: () => searchAcross.length > 0,
            getSmartAssistanceConfig: () => ({
                enabled: false,
                phoneticModel: '',
                analysisModel: '',
                soundsLikeOnAdd: false,
                triggerPhrasesOnAdd: false,
                promptForSource: false,
                termsEnabled: false,
                termSoundsLikeOnAdd: false,
                termDescriptionOnAdd: false,
                termTopicsOnAdd: false,
                termProjectSuggestions: false,
                timeout: 0,
            }),
        };

        return fallbackContext as unknown as ProtokollContextInstance;
    };

    const ServerConfig = await import('../serverConfig');
    const serverContext = ServerConfig.getContext();
    const storageConfig = ServerConfig.getStorageConfig();
    if (serverContext?.hasContext()) {
        const projectCount = serverContext.getAllProjects().length;
        const peopleCount = serverContext.getAllPeople().length;
        const termCount = serverContext.getAllTerms().length;
        const companyCount = serverContext.getAllCompanies().length;
        const totalEntities = projectCount + peopleCount + termCount + companyCount;

        if (storageConfig.backend === 'gcs') {
            // In some remote/GCS runs the preloaded server context can be partially
            // hydrated (for example only a handful of people). Cross-check against
            // the indexed GCS view and prefer it when the cached context is clearly
            // incomplete so sounds_like replacement remains comprehensive.
            try {
                const [indexedPeople, indexedProjects, indexedTerms, indexedCompanies] = await Promise.all([
                    listContextEntitiesFromGcs('person') as Promise<Person[]>,
                    listContextEntitiesFromGcs('project') as Promise<Project[]>,
                    listContextEntitiesFromGcs('term') as Promise<Term[]>,
                    listContextEntitiesFromGcs('company') as Promise<Company[]>,
                ]);
                const indexedTotal = indexedPeople.length
                    + indexedProjects.length
                    + indexedTerms.length
                    + indexedCompanies.length;
                if (indexedTotal > totalEntities) {
                    logger.warn('tool.context.server_context_partial_using_entity_index_fallback', {
                        serverProjectCount: projectCount,
                        serverPeopleCount: peopleCount,
                        serverTermCount: termCount,
                        serverCompanyCount: companyCount,
                        indexedProjectCount: indexedProjects.length,
                        indexedPeopleCount: indexedPeople.length,
                        indexedTermCount: indexedTerms.length,
                        indexedCompanyCount: indexedCompanies.length,
                        serverContextDirs: serverContext.getContextDirs(),
                    });
                    return buildGcsFallbackContext(serverContext);
                }
            } catch (error) {
                logger.warn('tool.context.server_context_index_crosscheck_failed', {
                    error: error instanceof Error ? error.message : String(error),
                    serverProjectCount: projectCount,
                    serverPeopleCount: peopleCount,
                    serverTermCount: termCount,
                    serverCompanyCount: companyCount,
                });
            }
        }

        // For filesystem (or fully hydrated GCS) keep the preloaded server context.
        if (totalEntities > 0 || storageConfig.backend !== 'gcs') {
            return serverContext;
        }

        logger.warn('tool.context.empty_server_context_reloading', {
            backend: storageConfig.backend,
            projectCount,
            peopleCount,
            termCount,
            companyCount,
            contextDirs: serverContext.getContextDirs(),
        });
    }

    const configFile = ServerConfig.isInitialized()
        ? ServerConfig.getServerConfig().configFile as { contextDirectories?: string[] } | null
        : null;
    const rawDirs = configFile?.contextDirectories;
    const effectiveDir = contextDirectory
        || (ServerConfig.isInitialized() ? ServerConfig.getWorkspaceRoot() : null)
        || process.cwd();
    const contextDirs = rawDirs && rawDirs.length > 0
        ? rawDirs.map((d: string) => (isAbsolute(d) ? d : resolve(effectiveDir, d)))
        : undefined;

    if (storageConfig.backend === 'gcs' && storageConfig.gcs) {
        const contextUri = storageConfig.gcs.contextUri
            || (storageConfig.gcs.contextBucket
                ? `gs://${storageConfig.gcs.contextBucket}/${(storageConfig.gcs.contextPrefix || '').replace(/^\/+|\/+$/g, '')}`
                : undefined);
        if (!contextUri) {
            throw new Error('GCS storage is enabled but context URI/bucket configuration is missing.');
        }
        const parsedContextUri = parseGcsUri(contextUri);
        const gcsContext = await Context.create({
            startingDir: effectiveDir,
            gcs: {
                bucketName: parsedContextUri.bucket,
                basePath: parsedContextUri.prefix,
                projectId: storageConfig.gcs.projectId,
                credentialsFile: storageConfig.gcs.credentialsFile,
            },
        });

        const gcsEntityCount = gcsContext.getAllProjects().length
            + gcsContext.getAllPeople().length
            + gcsContext.getAllTerms().length
            + gcsContext.getAllCompanies().length;
        if (gcsEntityCount > 0) {
            return gcsContext;
        }

        logger.warn('tool.context.gcs_context_empty_using_entity_index_fallback', {
            bucket: parsedContextUri.bucket,
            prefix: parsedContextUri.prefix,
        });
        return buildGcsFallbackContext(gcsContext);
    }

    return Context.create({
        startingDir: effectiveDir,
        contextDirectories: contextDirs,
    });
}

/**
 * Validate that contextDirectory parameter is not provided in remote mode
 * In remote mode, the server is pre-configured with workspace directories
 * and tools should not accept directory parameters.
 * 
 * @param contextDirectory - The contextDirectory parameter from tool args
 * @throws Error if contextDirectory is provided in remote mode
 */
export async function validateNotRemoteMode(contextDirectory?: string): Promise<void> {
    if (!contextDirectory) {
        return; // No directory parameter provided, OK
    }
    
    // Import here to avoid circular dependencies
    const ServerConfig = await import('../serverConfig');
    
    if (ServerConfig.isRemoteMode()) {
        throw new Error(
            'Directory parameters are not accepted in remote mode. ' +
            'This server is pre-configured with workspace directories from protokoll-config.yaml. ' +
            'Use the protokoll_info tool to check server configuration.'
        );
    }
}

/**
 * Validate that a resolved path stays within a base directory
 * This prevents path traversal attacks using ../ sequences
 * 
 * @param resolvedPath - The resolved absolute path to validate
 * @param baseDirectory - The base directory that paths must stay within
 * @throws Error if the path escapes the base directory
 */
export function validatePathWithinDirectory(
    resolvedPath: string,
    baseDirectory: string
): void {
    // Normalize both paths to handle any ../ sequences
    const normalizedTarget = resolve(resolvedPath);
    const normalizedBase = resolve(baseDirectory);
    
    // Ensure base directory ends with separator for proper prefix matching
    const basePath = normalizedBase.endsWith('/') ? normalizedBase : normalizedBase + '/';
    
    // Check if the target path is within the base directory
    // Must either be exactly the base dir, or start with base dir + separator
    if (normalizedTarget !== normalizedBase && !normalizedTarget.startsWith(basePath)) {
        throw new Error(
            `Security error: Path "${resolvedPath}" is outside the allowed directory "${baseDirectory}". ` +
            `Path traversal is not allowed.`
        );
    }
}

/**
 * Async version of validatePathWithinDirectory that gets the output directory from config
 * 
 * @param resolvedPath - The resolved absolute path to validate
 * @param contextDirectory - Optional context directory for config lookup
 * @throws Error if the path escapes the output directory
 */
export async function validatePathWithinOutputDirectory(
    resolvedPath: string,
    contextDirectory?: string
): Promise<void> {
    const outputDirectory = await getConfiguredDirectory('outputDirectory', contextDirectory);
    validatePathWithinDirectory(resolvedPath, outputDirectory);
}

/**
 * Convert an absolute file path to a relative path (relative to output directory)
 * This ensures no absolute paths are exposed to HTTP MCP clients
 * 
 * @param absolutePath - The absolute file path to convert
 * @param baseDirectory - The base directory to make relative to (default: output directory)
 * @returns Relative path, or the original path if it's already relative
 */
export async function sanitizePath(
    absolutePath: string,
    baseDirectory?: string
): Promise<string> {
    // Guard against undefined/null/empty values
    if (!absolutePath || typeof absolutePath !== 'string') {
        // Return empty string for invalid paths to prevent errors downstream
        return absolutePath || '';
    }
    
    // If it's already a relative path (doesn't start with /), return as-is
    if (!absolutePath.startsWith('/') && !absolutePath.match(/^[A-Za-z]:/)) {
        return absolutePath;
    }
    
    // Get the base directory (output directory by default)
    const base = baseDirectory || await getConfiguredDirectory('outputDirectory');
    
    // Convert to relative path
    try {
        const relativePath = relative(base, absolutePath);
        // If relative() returns an absolute path (when paths are on different drives on Windows),
        // return just the filename as a fallback
        if (relativePath.startsWith('/') || relativePath.match(/^[A-Za-z]:/)) {
            // Extract just the filename
            const parts = absolutePath.split(/[/\\]/);
            return parts[parts.length - 1] || absolutePath;
        }
        return relativePath;
    } catch {
        // If conversion fails, return just the filename
        const parts = absolutePath.split(/[/\\]/);
        return parts[parts.length - 1] || absolutePath;
    }
}

/**
 * Slugify text for IDs and filenames
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/--+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Get audio file metadata (creation time and hash)
 */
export async function getAudioMetadata(audioFile: string): Promise<{ creationTime: Date; hash: string }> {
    // Get creation time from audio file
    let creationTime = await media.getAudioCreationTime(audioFile);
    if (!creationTime) {
        creationTime = new Date();
    }

    // Calculate hash of the file
    const hash = (await storage.hashFile(audioFile, 100)).substring(0, 8);

    return { creationTime, hash };
}

/**
 * Format entity for response
 */
export function formatEntity(entity: Entity): Record<string, unknown> {
    const result: Record<string, unknown> = {
        id: entity.id,
        name: entity.name,
        type: entity.type,
    };

    if (entity.type === 'person') {
        const person = entity as Person;
        if (person.firstName) result.firstName = person.firstName;
        if (person.lastName) result.lastName = person.lastName;
        if (person.company) result.company = person.company;
        if (person.role) result.role = person.role;
        if (person.sounds_like) result.sounds_like = person.sounds_like;
        if (person.context) result.context = person.context;
    } else if (entity.type === 'project') {
        const project = entity as Project;
        if (project.description) result.description = project.description;
        if (project.classification) result.classification = project.classification;
        if (project.routing) result.routing = project.routing;
        if (project.sounds_like) result.sounds_like = project.sounds_like;
        result.active = project.active !== false;
    } else if (entity.type === 'term') {
        const term = entity as Term;
        if (term.expansion) result.expansion = term.expansion;
        if (term.domain) result.domain = term.domain;
        if (term.description) result.description = term.description;
        if (term.sounds_like) result.sounds_like = term.sounds_like;
        if (term.topics) result.topics = term.topics;
        if (term.projects) result.projects = term.projects;
    } else if (entity.type === 'company') {
        const company = entity as Company;
        if (company.fullName) result.fullName = company.fullName;
        if (company.industry) result.industry = company.industry;
        if (company.sounds_like) result.sounds_like = company.sounds_like;
    } else if (entity.type === 'ignored') {
        const ignored = entity as IgnoredTerm;
        if (ignored.reason) result.reason = ignored.reason;
        if (ignored.ignoredAt) result.ignoredAt = ignored.ignoredAt;
    }

    return result;
}

/**
 * Helper to merge arrays: handles replace, add, and remove operations
 */
export function mergeArray(
    existing: string[] | undefined,
    replace: string[] | undefined,
    add: string[] | undefined,
    remove: string[] | undefined
): string[] | undefined {
    // If replace is provided, use it as the base
    if (replace !== undefined) {
        let result = [...replace];
        if (add) {
            result = [...result, ...add.filter(v => !result.includes(v))];
        }
        if (remove) {
            result = result.filter(v => !remove.includes(v));
        }
        return result.length > 0 ? result : undefined;
    }

    // Otherwise work with existing
    let result = existing ? [...existing] : [];
    if (add) {
        result = [...result, ...add.filter(v => !result.includes(v))];
    }
    if (remove) {
        result = result.filter(v => !remove.includes(v));
    }

    // Return undefined if empty (to remove the field from YAML)
    return result.length > 0 ? result : (existing ? undefined : existing);
}

/**
 * Resolve a transcript URI, path, or UUID to an absolute file path
 * 
 * Accepts:
 * - UUID or UUID prefix: "a1b2c3d4" or "a1b2c3d4-5e6f-7890-abcd-ef1234567890"
 * - Protokoll URI: protokoll://transcript/2026/2/12-1606-meeting (preferred)
 * - Relative path: 2026/2/12-1606-meeting or 2026/2/12-1606-meeting.pkl
 * - Absolute path: /full/path/to/transcript.pkl (must be within output directory)
 * 
 * Returns absolute path for internal file operations
 */
export async function resolveTranscriptPath(
    uriOrPathOrUuid: string,
    contextDirectory?: string
): Promise<string> {
    if (!uriOrPathOrUuid || typeof uriOrPathOrUuid !== 'string') {
        throw new Error('Transcript reference is required and must be a non-empty string');
    }
    
    const outputDirectory = await getConfiguredDirectory('outputDirectory', contextDirectory);
    const ServerConfig = await import('../serverConfig');
    const outputStorage = ServerConfig.getOutputStorage();
    if (outputStorage.name === 'gcs') {
        throw new Error(
            'resolveTranscriptPath does not support GCS-backed transcripts. ' +
            'Use storage-aware transcript resolution in the tool handler.'
        );
    }
    
    // Check if input is a UUID
    if (isUuidInput(uriOrPathOrUuid)) {
        const foundPath = await findTranscriptByUuid(uriOrPathOrUuid, [outputDirectory]);
        if (!foundPath) {
            throw new Error(`Transcript not found for UUID: ${uriOrPathOrUuid}`);
        }
        return foundPath;
    }
    
    let relativePath: string;
    
    // Check if input is a Protokoll URI
    if (isProtokolUri(uriOrPathOrUuid)) {
        const sanitizedUri = uriOrPathOrUuid.split('#')[0].split('?')[0];
        const parsed = parseUri(sanitizedUri);
        if (parsed.resourceType !== 'transcript') {
            throw new Error(`Invalid URI: expected transcript URI, got ${parsed.resourceType}`);
        }
        // Extract the transcript path from the URI (without extension)
        // Type assertion is safe because we checked resourceType === 'transcript'
        relativePath = String((parsed as any).transcriptPath || '').replace(/^(\.\.\/)+/, '');
    } else {
        // Handle as a file path (relative or absolute)
        if (isAbsolute(uriOrPathOrUuid)) {
            const normalizedAbsolute = resolve(uriOrPathOrUuid);
            const normalizedOutputDir = resolve(outputDirectory);
            
            if (normalizedAbsolute.startsWith(normalizedOutputDir + '/') || normalizedAbsolute === normalizedOutputDir) {
                // Convert absolute path to relative
                relativePath = normalizedAbsolute.substring(normalizedOutputDir.length + 1);
            } else {
                throw new Error(`Path must be within output directory: ${outputDirectory}`);
            }
        } else {
            // Relative path - normalize it
            relativePath = uriOrPathOrUuid.replace(/^[/\\]+/, '').replace(/\\/g, '/');
        }
    }
    
    // Remove .pkl extension if present (we'll add it back)
    relativePath = relativePath.replace(/\.pkl$/i, '');
    
    // Resolve to absolute path
    const resolvedPath = resolve(outputDirectory, relativePath);
    validatePathWithinDirectory(resolvedPath, outputDirectory);
    
    // Ensure .pkl extension and check if file exists
    const pklPath = ensurePklExtension(resolvedPath);
    const existsResult = await transcriptExists(pklPath);
    if (!existsResult.exists || !existsResult.path) {
        // Fallback for slug-only references (e.g. "meeting-with-bret-nuussen-ssp"):
        // search recursively under outputDirectory for a matching filename.
        if (!relativePath.includes('/')) {
            const candidateFilename = ensurePklExtension(relativePath).split('/').pop() || ensurePklExtension(relativePath);
            const matches: string[] = [];

            const walk = async (dir: string): Promise<void> => {
                const entries = await readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const entryPath = join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await walk(entryPath);
                        continue;
                    }
                    if (entry.isFile() && entry.name === candidateFilename) {
                        matches.push(entryPath);
                    }
                }
            };

            await walk(outputDirectory);

            if (matches.length === 1) {
                return matches[0];
            }
            if (matches.length > 1) {
                throw new Error(
                    `Ambiguous transcript reference "${uriOrPathOrUuid}": ${matches.length} matches found. ` +
                    'Use full transcript URI or relative path with date folders.'
                );
            }
        }

        throw new Error(`Transcript not found: ${uriOrPathOrUuid}`);
    }
    
    return existsResult.path;
}
