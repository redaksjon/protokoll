/**
 * MCP Server Configuration
 * 
 * Centralized configuration management for the MCP server.
 * Uses workspace roots to discover and load Protokoll configuration.
 * 
 * This eliminates the need for each tool to navigate up the directory tree
 * to find configuration. Instead, configuration is loaded once at the
 * workspace level and shared across all tools.
 */

import * as Context from '@/context';
import type { ProtokollContextInstance } from '@/context';
import type { McpRoot } from './types';
import { fileUriToPath } from './roots';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import * as Cardigantime from '@utilarium/cardigantime';
import Logging from '@fjell/logging';
import { DEFAULT_STORAGE_CONFIG, type StorageConfig } from './storage/types';
import { createGcsStorageProvider } from './storage/gcsProvider';
import { FilesystemStorageProvider, type FileStorageProvider } from './storage/fileProviders';
import { parseGcsUri } from './storage/gcsUri';

const DEFAULT_CONFIG_FILE = 'protokoll-config.yaml';
const logger = Logging.getLogger('@redaksjon/protokoll-mcp').get('server-config');
const cardigantime = Cardigantime.create({
    defaults: {
        configDirectory: '.',
        configFile: DEFAULT_CONFIG_FILE,
        isRequired: false,
        // Tell CardiganTime to resolve these path fields relative to the config file's directory
        // Note: contextDirectories must be in BOTH pathFields AND resolvePathArray - 
        // pathFields determines which fields are processed, resolvePathArray determines
        // if array elements should be resolved individually
        pathResolution: {
            pathFields: ['inputDirectory', 'outputDirectory', 'processedDirectory', 'contextDirectories', 'storage.gcs.credentialsFile'],
            resolvePathArray: ['contextDirectories'],
        },
    },
    configShape: {},
    features: ['config', 'hierarchical'],
});

async function readConfigFromDirectory(directory: string): Promise<Record<string, unknown>> {
    const previousCwd = process.cwd();
    try {
        process.chdir(directory);
        const discoveredConfig = await cardigantime.read({});
        return mergeConfigWithEnv(discoveredConfig);
    } finally {
        process.chdir(previousCwd);
    }
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
    if (!value) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return undefined;
}

function parseCsvEnv(value: string | undefined): string[] | undefined {
    if (!value) return undefined;
    const parsed = value
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
    return parsed.length > 0 ? parsed : undefined;
}

function readEnvString(name: string): string | undefined {
    return readString(process.env[name]);
}

function mergeNestedObjects(
    base: Record<string, unknown>,
    overrides: Record<string, unknown>,
): Record<string, unknown> {
    const merged = { ...base };
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) continue;
        const existing = merged[key];
        if (isObjectRecord(existing) && isObjectRecord(value)) {
            merged[key] = mergeNestedObjects(existing, value);
            continue;
        }
        merged[key] = value;
    }
    return merged;
}

function buildEnvStorageConfig(): Record<string, unknown> | undefined {
    const configuredBackend = readEnvString('PROTOKOLL_STORAGE_BACKEND');
    const gcs = {
        projectId: readEnvString('PROTOKOLL_STORAGE_GCS_PROJECT_ID'),
        inputUri: readEnvString('PROTOKOLL_STORAGE_GCS_INPUT_URI'),
        outputUri: readEnvString('PROTOKOLL_STORAGE_GCS_OUTPUT_URI'),
        contextUri: readEnvString('PROTOKOLL_STORAGE_GCS_CONTEXT_URI'),
        inputBucket: readEnvString('PROTOKOLL_STORAGE_GCS_INPUT_BUCKET'),
        inputPrefix: readEnvString('PROTOKOLL_STORAGE_GCS_INPUT_PREFIX'),
        outputBucket: readEnvString('PROTOKOLL_STORAGE_GCS_OUTPUT_BUCKET'),
        outputPrefix: readEnvString('PROTOKOLL_STORAGE_GCS_OUTPUT_PREFIX'),
        contextBucket: readEnvString('PROTOKOLL_STORAGE_GCS_CONTEXT_BUCKET'),
        contextPrefix: readEnvString('PROTOKOLL_STORAGE_GCS_CONTEXT_PREFIX'),
        credentialsFile: readEnvString('PROTOKOLL_STORAGE_GCS_CREDENTIALS_FILE'),
    };
    const hasGcsValue = Object.values(gcs).some(value => value !== undefined);
    const backend = configuredBackend ?? (hasGcsValue ? 'gcs' : undefined);
    if (!backend) return undefined;

    const storage: Record<string, unknown> = {};
    if (backend) storage.backend = backend;
    if (hasGcsValue) storage.gcs = gcs;
    return storage;
}

function mergeConfigWithEnv(config: Record<string, unknown>): Record<string, unknown> {
    const envOverrides: Record<string, unknown> = {
        inputDirectory: readEnvString('PROTOKOLL_INPUT_DIRECTORY'),
        outputDirectory: readEnvString('PROTOKOLL_OUTPUT_DIRECTORY'),
        processedDirectory: readEnvString('PROTOKOLL_PROCESSED_DIRECTORY'),
        contextDirectories: parseCsvEnv(process.env.PROTOKOLL_CONTEXT_DIRECTORIES),
        model: readEnvString('PROTOKOLL_MODEL'),
        classifyModel: readEnvString('PROTOKOLL_CLASSIFY_MODEL'),
        composeModel: readEnvString('PROTOKOLL_COMPOSE_MODEL'),
        transcriptionModel: readEnvString('PROTOKOLL_TRANSCRIPTION_MODEL'),
        debug: parseBooleanEnv(process.env.PROTOKOLL_DEBUG),
        verbose: parseBooleanEnv(process.env.PROTOKOLL_VERBOSE),
        storage: buildEnvStorageConfig(),
    };
    return mergeNestedObjects(config, envOverrides);
}

// ============================================================================
// Server Configuration State
// ============================================================================

/**
 * Server mode:
 * - "remote": Server is pre-configured with workspace directories (HTTP server).
 *             Tools should NOT accept directory parameters - they're already set.
 * - "local": Server runs in local mode (stdio). Tools accept directory parameters
 *            and perform their own discovery.
 */
export type ServerMode = 'remote' | 'local';

interface ServerConfig {
    mode: ServerMode;
    context: ProtokollContextInstance | null;
    workspaceRoot: string | null;
    inputDirectory: string | null;
    outputDirectory: string | null;
    processedDirectory: string | null;
    inputStorage: FileStorageProvider | null;
    outputStorage: FileStorageProvider | null;
    storageConfig: StorageConfig;
    configFilePath: string | null;
    configFile: Record<string, unknown> | null;
    initialized: boolean;
}

let serverConfig: ServerConfig = {
    mode: 'local',
    context: null,
    workspaceRoot: null,
    inputDirectory: null,
    outputDirectory: null,
    processedDirectory: null,
    inputStorage: null,
    outputStorage: null,
    storageConfig: DEFAULT_STORAGE_CONFIG,
    configFilePath: null,
    configFile: null,
    initialized: false,
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function buildGcsUri(bucket: string, prefix?: string): string {
    const trimmedBucket = bucket.trim();
    const normalizedPrefix = (prefix ?? '')
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/')
        .replace(/\/+$/, '');
    if (!normalizedPrefix) {
        return `gs://${trimmedBucket}`;
    }
    return `gs://${trimmedBucket}/${normalizedPrefix}`;
}

function resolveGcsUri(rawUri: string | undefined, bucket: string | undefined, prefix: string | undefined): string {
    if (bucket) {
        return buildGcsUri(bucket, prefix);
    }
    return rawUri ?? '';
}

function resolveGcsUris(gcs: NonNullable<StorageConfig['gcs']>): {
    inputUri: string;
    outputUri: string;
    contextUri: string;
} {
    return {
        inputUri: resolveGcsUri(gcs.inputUri, gcs.inputBucket, gcs.inputPrefix),
        outputUri: resolveGcsUri(gcs.outputUri, gcs.outputBucket, gcs.outputPrefix),
        contextUri: resolveGcsUri(gcs.contextUri, gcs.contextBucket, gcs.contextPrefix),
    };
}

function parseStorageConfig(configFile: Record<string, unknown> | null): StorageConfig {
    if (!configFile) {
        return DEFAULT_STORAGE_CONFIG;
    }

    const rawStorage = configFile.storage;
    if (!isObjectRecord(rawStorage)) {
        return DEFAULT_STORAGE_CONFIG;
    }

    const backend = rawStorage.backend === 'gcs' ? 'gcs' : 'filesystem';
    if (backend !== 'gcs') {
        return DEFAULT_STORAGE_CONFIG;
    }

    const rawGcs = isObjectRecord(rawStorage.gcs) ? rawStorage.gcs : {};
    const projectId = readString(rawGcs.projectId);
    const inputUri = readString(rawGcs.inputUri);
    const outputUri = readString(rawGcs.outputUri);
    const contextUri = readString(rawGcs.contextUri);
    const inputBucket = readString(rawGcs.inputBucket);
    const inputPrefix = readString(rawGcs.inputPrefix);
    const outputBucket = readString(rawGcs.outputBucket);
    const outputPrefix = readString(rawGcs.outputPrefix);
    const contextBucket = readString(rawGcs.contextBucket);
    const contextPrefix = readString(rawGcs.contextPrefix);
    const credentialsFile = readString(rawGcs.credentialsFile);

    return {
        backend: 'gcs',
        gcs: {
            projectId,
            inputUri,
            outputUri,
            contextUri,
            inputBucket,
            inputPrefix,
            outputBucket,
            outputPrefix,
            contextBucket,
            contextPrefix,
            credentialsFile,
        },
    };
}

function resolveCredentialsFilePath(
    credentialsFile: string | undefined,
    configDir: string,
): string | undefined {
    if (!credentialsFile || credentialsFile.trim().length === 0) {
        return undefined;
    }
    return resolve(configDir, credentialsFile);
}

async function validateGcsStorageConfig(storageConfig: StorageConfig, configDir: string): Promise<string | undefined> {
    if (storageConfig.backend !== 'gcs') {
        return undefined;
    }

    if (!storageConfig.gcs) {
        throw new Error('storage.backend is set to gcs, but storage.gcs is missing.');
    }

    const startedAt = Date.now();
    const { inputUri, outputUri, contextUri } = resolveGcsUris(storageConfig.gcs);
    logger.debug('storage.gcs.validate.start', {
        configDir,
        inputUri,
        outputUri,
        contextUri,
        projectId: storageConfig.gcs.projectId ?? null,
        hasCredentialsFile: Boolean(storageConfig.gcs.credentialsFile),
    });
    if (!inputUri || !outputUri || !contextUri) {
        throw new Error(
            'GCS config is incomplete. Provide either storage.gcs.{inputUri,outputUri,contextUri} or storage.gcs.{inputBucket,inputPrefix,outputBucket,outputPrefix,contextBucket,contextPrefix}.'
        );
    }

    parseGcsUri(inputUri);
    parseGcsUri(outputUri);
    parseGcsUri(contextUri);

    const credentialsFile = resolveCredentialsFilePath(storageConfig.gcs.credentialsFile, configDir);
    if (credentialsFile) {
        try {
            await access(credentialsFile);
        } catch {
            throw new Error(`GCS credentials file is not readable: ${credentialsFile}`);
        }
    }

    logger.info('storage.gcs.validate.complete', {
        inputUri,
        outputUri,
        contextUri,
        projectId: storageConfig.gcs.projectId ?? null,
        credentialsFile: credentialsFile ?? null,
        elapsedMs: Date.now() - startedAt,
    });

    return credentialsFile;
}

async function createStorageProviders(
    storageConfig: StorageConfig,
    inputDirectory: string,
    outputDirectory: string,
    configDir: string,
): Promise<{ inputStorage: FileStorageProvider; outputStorage: FileStorageProvider }> {
    if (storageConfig.backend === 'filesystem') {
        return {
            inputStorage: new FilesystemStorageProvider(inputDirectory),
            outputStorage: new FilesystemStorageProvider(outputDirectory),
        };
    }

    if (!storageConfig.gcs) {
        throw new Error('storage.backend is set to gcs, but storage.gcs is missing.');
    }

    const startedAt = Date.now();
    const { inputUri, outputUri } = resolveGcsUris(storageConfig.gcs);
    logger.debug('storage.providers.gcs.start', {
        inputUri,
        outputUri,
        projectId: storageConfig.gcs.projectId ?? null,
    });
    const credentialsFile = await validateGcsStorageConfig(storageConfig, configDir);
    const inputStorage = createGcsStorageProvider(inputUri, credentialsFile, storageConfig.gcs.projectId);
    const outputStorage = createGcsStorageProvider(outputUri, credentialsFile, storageConfig.gcs.projectId);
    await inputStorage.verifyBucketAccess();
    await outputStorage.verifyBucketAccess();
    logger.info('storage.providers.gcs.complete', {
        inputUri,
        outputUri,
        projectId: storageConfig.gcs.projectId ?? null,
        elapsedMs: Date.now() - startedAt,
    });

    return {
        inputStorage,
        outputStorage,
    };
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize server configuration from workspace roots
 * Should be called once when the server starts or when roots change
 * 
 * @param roots - Workspace roots (for remote mode)
 * @param mode - Server mode: 'remote' (pre-configured) or 'local' (dynamic discovery)
 */
export async function initializeServerConfig(roots: McpRoot[], mode: ServerMode = 'local'): Promise<void> {
    // Find the first workspace root
    const workspaceRoot = roots.length > 0 ? fileUriToPath(roots[0].uri) : null;
    
    if (!workspaceRoot) {
        // No workspace root available - use cwd as fallback
        serverConfig = {
            mode,
            context: null,
            workspaceRoot: process.cwd(),
            inputDirectory: resolve(process.cwd(), './recordings'),
            outputDirectory: resolve(process.cwd(), './notes'),
            processedDirectory: resolve(process.cwd(), './processed'),
            inputStorage: new FilesystemStorageProvider(resolve(process.cwd(), './recordings')),
            outputStorage: new FilesystemStorageProvider(resolve(process.cwd(), './notes')),
            storageConfig: DEFAULT_STORAGE_CONFIG,
            configFilePath: null,
            configFile: null,
            initialized: true,
        };
        return;
    }

    try {
        // CardiganTime resolves path fields (inputDirectory, outputDirectory, etc.)
        // relative to the config file's directory automatically via pathResolution config
        const configFile = await readConfigFromDirectory(workspaceRoot);
        const resolvedConfigDirs = (configFile as any).resolvedConfigDirs as unknown;
        const configFilePath = Array.isArray(resolvedConfigDirs) && resolvedConfigDirs.length > 0
            ? resolve(resolvedConfigDirs[0], DEFAULT_CONFIG_FILE)
            : null;
        
        // For defaults (when no config value), use config directory if available
        const configDir = Array.isArray(resolvedConfigDirs) && resolvedConfigDirs.length > 0
            ? resolvedConfigDirs[0]
            : workspaceRoot;

        // contextDirectories are resolved by CardiganTime via resolvePathArray config
        const resolvedContextDirs = configFile.contextDirectories as string[] | undefined;
        const contextCreateOptions: Context.CreateOptions = {
            startingDir: workspaceRoot,
            contextDirectories: resolvedContextDirs,
        };

        const storageConfig = parseStorageConfig(configFile as Record<string, unknown>);
        const credentialsFile = await validateGcsStorageConfig(storageConfig, configDir);
        if (storageConfig.backend === 'gcs' && storageConfig.gcs) {
            if (storageConfig.gcs.projectId) {
                process.env.GOOGLE_CLOUD_PROJECT = storageConfig.gcs.projectId;
            }
            const { contextUri } = resolveGcsUris(storageConfig.gcs);
            const parsedContextUri = parseGcsUri(contextUri);
            contextCreateOptions.gcs = {
                bucketName: parsedContextUri.bucket,
                basePath: parsedContextUri.prefix,
                credentialsFile,
            };
            delete contextCreateOptions.contextDirectories;
        }

        // Load context from workspace root, using explicit contextDirectories if provided
        const context = await Context.create(contextCreateOptions);

        const contextConfig = context.getConfig();
        const mergedConfig = {
            ...contextConfig,
            ...configFile,
        } as Record<string, unknown>;
        const inputDirectory = (mergedConfig.inputDirectory as string) || resolve(configDir, './recordings');
        const outputDirectory = (mergedConfig.outputDirectory as string) || resolve(configDir, './notes');
        const { inputStorage, outputStorage } = await createStorageProviders(storageConfig, inputDirectory, outputDirectory, configDir);
        
        serverConfig = {
            mode,
            context,
            workspaceRoot,
            // CardiganTime already resolved these paths; just provide defaults if not set
            inputDirectory,
            outputDirectory,
            processedDirectory: (mergedConfig.processedDirectory as string) || resolve(configDir, './processed'),
            inputStorage,
            outputStorage,
            storageConfig,
            configFilePath,
            configFile: configFile ?? null,
            initialized: true,
        };
    } catch {
        // Context not available - use defaults relative to workspace
        const configFile = await readConfigFromDirectory(workspaceRoot);
        const resolvedConfigDirs = (configFile as any).resolvedConfigDirs as unknown;
        const configFilePath = Array.isArray(resolvedConfigDirs) && resolvedConfigDirs.length > 0
            ? resolve(resolvedConfigDirs[0], DEFAULT_CONFIG_FILE)
            : null;
        
        // For defaults (when no config value), use config directory if available
        const configDir = Array.isArray(resolvedConfigDirs) && resolvedConfigDirs.length > 0
            ? resolvedConfigDirs[0]
            : workspaceRoot;
        
        const mergedConfig = (configFile ?? {}) as Record<string, unknown>;
        const storageConfig = parseStorageConfig(configFile as Record<string, unknown>);
        const inputDirectory = (mergedConfig.inputDirectory as string) || resolve(configDir, './recordings');
        const outputDirectory = (mergedConfig.outputDirectory as string) || resolve(configDir, './notes');
        const { inputStorage, outputStorage } = await createStorageProviders(storageConfig, inputDirectory, outputDirectory, configDir);

        serverConfig = {
            mode,
            context: null,
            workspaceRoot,
            // CardiganTime already resolved these paths; just provide defaults if not set
            inputDirectory,
            outputDirectory,
            processedDirectory: (mergedConfig.processedDirectory as string) || resolve(configDir, './processed'),
            inputStorage,
            outputStorage,
            storageConfig,
            configFilePath,
            configFile: configFile ?? null,
            initialized: true,
        };
    }
}

/**
 * Reload server configuration (call when roots change)
 */
export async function reloadServerConfig(roots: McpRoot[], mode: ServerMode = 'local'): Promise<void> {
    await initializeServerConfig(roots, mode);
}

/**
 * Clear server configuration
 */
export function clearServerConfig(): void {
    serverConfig = {
        mode: 'local',
        context: null,
        workspaceRoot: null,
        inputDirectory: null,
        outputDirectory: null,
        processedDirectory: null,
        inputStorage: null,
        outputStorage: null,
        storageConfig: DEFAULT_STORAGE_CONFIG,
        configFilePath: null,
        configFile: null,
        initialized: false,
    };
}

// ============================================================================
// Accessors
// ============================================================================

/**
 * Get the server configuration
 * Throws if not initialized
 */
export function getServerConfig(): {
    mode: ServerMode;
    context: ProtokollContextInstance | null;
    workspaceRoot: string;
    inputDirectory: string;
    outputDirectory: string;
    processedDirectory: string | null;
    storageConfig: StorageConfig;
    configFilePath: string | null;
    configFile: Record<string, unknown> | null;
    initialized: boolean;
    } {
    if (!serverConfig.initialized) {
        throw new Error('Server configuration not initialized. Call initializeServerConfig() first.');
    }
    
    return {
        mode: serverConfig.mode,
        context: serverConfig.context,
        workspaceRoot: serverConfig.workspaceRoot!,
        inputDirectory: serverConfig.inputDirectory!,
        outputDirectory: serverConfig.outputDirectory!,
        processedDirectory: serverConfig.processedDirectory,
        storageConfig: serverConfig.storageConfig,
        configFilePath: serverConfig.configFilePath,
        configFile: serverConfig.configFile,
        initialized: serverConfig.initialized,
    };
}

/**
 * Get the context instance
 */
export function getContext(): ProtokollContextInstance | null {
    return serverConfig.context;
}

/**
 * Get the workspace root
 */
export function getWorkspaceRoot(): string | null {
    return serverConfig.workspaceRoot;
}

/**
 * Get the input directory (for audio files)
 * Always returns a string, never null
 */
export function getInputDirectory(): string {
    if (!serverConfig.initialized || !serverConfig.inputDirectory) {
        return resolve(process.cwd(), './recordings');
    }
    return serverConfig.inputDirectory!;
}

/**
 * Get the output directory (for transcripts)
 * Always returns a string, never null
 */
export function getOutputDirectory(): string {
    if (!serverConfig.initialized || !serverConfig.outputDirectory) {
        return resolve(process.cwd(), './notes');
    }
    return serverConfig.outputDirectory!;
}

/**
 * Get the processed directory (for processed audio)
 * Returns null if not configured
 */
export function getProcessedDirectory(): string | null {
    if (!serverConfig.initialized) {
        return null;
    }
    return serverConfig.processedDirectory;
}

/**
 * Get the normalized storage config.
 * Defaults to filesystem mode when storage config is not present.
 */
export function getStorageConfig(): StorageConfig {
    return serverConfig.storageConfig;
}

/**
 * Get the input storage provider.
 * Defaults to filesystem storage rooted at ./recordings if uninitialized.
 */
export function getInputStorage(): FileStorageProvider {
    if (!serverConfig.initialized || !serverConfig.inputStorage) {
        return new FilesystemStorageProvider(resolve(process.cwd(), './recordings'));
    }
    return serverConfig.inputStorage;
}

/**
 * Get the output storage provider.
 * Defaults to filesystem storage rooted at ./notes if uninitialized.
 */
export function getOutputStorage(): FileStorageProvider {
    if (!serverConfig.initialized || !serverConfig.outputStorage) {
        return new FilesystemStorageProvider(resolve(process.cwd(), './notes'));
    }
    return serverConfig.outputStorage;
}

/**
 * Check if server configuration is initialized
 */
export function isInitialized(): boolean {
    return serverConfig.initialized;
}

/**
 * Get the server mode
 * Returns 'local' if not initialized
 */
export function getServerMode(): ServerMode {
    return serverConfig.mode;
}

/**
 * Check if server is running in remote mode (pre-configured workspace)
 */
export function isRemoteMode(): boolean {
    return serverConfig.mode === 'remote';
}

