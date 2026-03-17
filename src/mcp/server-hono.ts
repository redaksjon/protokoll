#!/usr/bin/env node
/**
 * Protokoll MCP Server - Hono HTTP Transport
 *
 * Runs the Protokoll MCP server with Hono framework and Streamable HTTP transport.
 *
 * Configuration (in priority order):
 * - CLI flags:  --port, --host, --cwd, --config, --config-directory, and core Protokoll config flags
 * - Env vars:   MCP_PORT, PROTOKOLL_MCP_PORT, PORT, PROTOKOLL_*, WORKSPACE_ROOT, PROTOKOLL_CONFIG
 * - Config file: protokoll-config.yaml (discovered hierarchically from working directory)
 *
 * Security:
 * - Binds to localhost only (127.0.0.1) by default
 * - Optional secured mode with API-key auth + RBAC policy enforcement
 *
 * Usage:
 *   node dist/mcp/server-hono.js
 *   node dist/mcp/server-hono.js --port 3001
 *   node dist/mcp/server-hono.js --cwd /my/project -c /my/project/protokoll-config.yaml
 */

import 'dotenv/config';
import { randomUUID, createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Command } from 'commander';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { StreamableHTTPTransport } from '@hono/mcp';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { bodyLimit } from 'hono/body-limit';
import { join, extname, basename, dirname } from 'node:path';
import { mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';
import { load as parseYaml } from 'js-yaml';
// eslint-disable-next-line import/extensions
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    ListRootsRequestSchema,
// eslint-disable-next-line import/extensions
} from '@modelcontextprotocol/sdk/types.js';
import { resolve } from 'node:path';
import * as Cardigantime from '@utilarium/cardigantime';
import Logging from '@fjell/logging';
import { z } from 'zod';
import * as Resources from './resources';
import * as Prompts from './prompts';
import { tools, handleToolCall } from './tools';
import * as TranscriptTools from './tools/transcriptTools';
import * as ServerConfig from './serverConfig';
import { parseUri } from './uri';
import * as Roots from './roots';
import type { McpRoot } from './types';
import { DEFAULT_CONFIG_FILE, createQuietLogger } from './configDiscovery';
import { TranscriptionWorker } from './worker/transcription-worker';
import { setWorkerInstance } from './tools/queueTools';
import { configureEngineLoggingBridge } from './engineLogging';
import { markTranscriptIndexDirtyForStorage } from './resources/transcriptIndexService';
import {
    loadRbacAuthorizerFromFiles,
    type AuthContext,
    type RbacAuthorizer,
} from './rbac';
import { Transcript as TranscriptOps } from '@redaksjon/protokoll-engine';
import { PklTranscript } from '@redaksjon/protokoll-format';
import type { FileStorageProvider } from './storage/fileProviders';

const { createUploadTranscript, findTranscriptByUuid } = TranscriptOps;

type TranscriptMetadataLookup = {
    id?: string;
    status?: string;
    audioHash?: string;
    projectId?: string;
    audioFile?: string;
    originalFilename?: string;
};

function isTranscriptPklPath(pathValue: string): boolean {
    const normalized = pathValue.replace(/^\/+/, '').replace(/\\/g, '/').toLowerCase();
    return normalized.endsWith('.pkl')
        && !normalized.startsWith('uploads/')
        && !normalized.startsWith('.intermediate/')
        && !normalized.includes('/uploads/')
        && !normalized.includes('/.intermediate/');
}

async function withTempPklFile<T>(contents: Buffer, action: (tempPath: string) => Promise<T>): Promise<T> {
    const tempPath = `${tmpdir()}/protokoll-mcp-http-${Date.now()}-${Math.random().toString(36).slice(2)}.pkl`;
    await writeFile(tempPath, contents);
    try {
        return await action(tempPath);
    } finally {
        await rm(tempPath, { force: true });
    }
}

async function readTranscriptMetadata(
    outputStorage: FileStorageProvider,
    outputDirectory: string,
    transcriptPath: string,
): Promise<TranscriptMetadataLookup> {
    if (outputStorage.name === 'filesystem') {
        const absolutePath = transcriptPath.startsWith('/')
            ? transcriptPath
            : join(outputDirectory, transcriptPath);
        const transcript = PklTranscript.open(absolutePath, { readOnly: true });
        try {
            return transcript.metadata as TranscriptMetadataLookup;
        } finally {
            transcript.close();
        }
    }

    const bytes = await outputStorage.readFile(transcriptPath);
    return withTempPklFile(bytes, async (tempPath) => {
        const transcript = PklTranscript.open(tempPath, { readOnly: true });
        try {
            return transcript.metadata as TranscriptMetadataLookup;
        } finally {
            transcript.close();
        }
    });
}

async function listTranscriptPaths(outputStorage: FileStorageProvider): Promise<string[]> {
    const listed = await outputStorage.listFiles('', '.pkl');
    return listed.filter(isTranscriptPklPath);
}

async function findTranscriptByAudioHashInDirectory(
    audioHash: string,
    searchDirectory: string,
    outputStorage: FileStorageProvider,
): Promise<{ uuid: string; status?: string } | null> {
    const files = await listTranscriptPaths(outputStorage);
    for (const filePath of files) {
        try {
            const metadata = await readTranscriptMetadata(outputStorage, searchDirectory, filePath);
            if (metadata.audioHash === audioHash && metadata.id) {
                return {
                    uuid: metadata.id,
                    status: metadata.status,
                };
            }
        } catch {
            // Ignore unreadable transcript files while scanning for duplicates.
        }
    }
    return null;
}

async function findTranscriptByUuidInStorage(
    uuid: string,
    outputStorage: FileStorageProvider,
    outputDirectory: string,
): Promise<{ path: string; metadata: TranscriptMetadataLookup } | null> {
    if (outputStorage.name === 'filesystem') {
        const localPath = await findTranscriptByUuid(uuid, [outputDirectory]);
        if (!localPath) {
            return null;
        }
        const metadata = await readTranscriptMetadata(outputStorage, outputDirectory, localPath);
        return { path: localPath, metadata };
    }

    const files = await listTranscriptPaths(outputStorage);
    for (const filePath of files) {
        try {
            const metadata = await readTranscriptMetadata(outputStorage, outputDirectory, filePath);
            if (metadata.id === uuid) {
                return { path: filePath, metadata };
            }
        } catch {
            // Ignore unreadable transcript files while scanning for UUID matches.
        }
    }

    return null;
}

/**
 * Configure LOGGING_CONFIG as early as possible so top-level logger creation
 * honors CLI/env debug settings before any logger instances are requested.
 */
function bootstrapHttpLogLevel(): void {
    const debugFromCli = process.argv.includes('--debug');
    const debugFromEnv = parseBooleanEnv(process.env.PROTOKOLL_DEBUG) === true;
    configureHttpLogLevel(debugFromCli || debugFromEnv);
}

bootstrapHttpLogLevel();

const rootLogger = Logging.getLogger('@redaksjon/protokoll-mcp').get('http');
const sessionLogger = rootLogger.get('session');
const requestLogger = rootLogger.get('request');
const transportLogger = rootLogger.get('transport');
const sseLogger = rootLogger.get('sse');
const lifecycleLogger = rootLogger.get('lifecycle');
const uploadLogger = rootLogger.get('upload');

// ============================================================================
// Configuration (resolved at startup — see main())
// ============================================================================

/** Cached config loaded in main() — available to the session init handler. */
let startupConfig: Record<string, unknown> = {};
let startupContextDirectories: string[] | undefined;
let serverConfigInitPromise: Promise<void> | null = null;
let serverConfigInitKey: string | null = null;

// Audio upload constants
const DEFAULT_MAX_AUDIO_SIZE = 1024 * 1024 * 1024; // 1GB
const DEFAULT_AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'webm', 'mp4', 'aac', 'ogg', 'flac'];
const REQUEST_ID_CONTEXT_KEY = 'requestId';
const AUTH_CONTEXT_KEY = 'authContext';
const AUTH_FAILURE_STATUS_BY_REASON: Record<string, number> = {
    missing_key: 401,
    invalid_key: 401,
    disabled_key: 401,
    expired_key: 401,
    missing_user: 401,
    disabled_user: 401,
};
const AUTH_FAILURE_ERROR_CODE_BY_REASON: Record<string, string> = {
    missing_key: 'missing_api_key',
    invalid_key: 'invalid_api_key',
    disabled_key: 'disabled_api_key',
    expired_key: 'expired_api_key',
    missing_user: 'invalid_user',
    disabled_user: 'disabled_user',
};

let rbacSecuredMode = false;
let rbacAuthorizer: RbacAuthorizer | null = null;
let rbacReloadTimer: ReturnType<typeof setInterval> | null = null;

function parseBooleanEnv(value: string | undefined): boolean | undefined {
    if (!value) return undefined;
    return value.toLowerCase() === 'true';
}

function readNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readEnvString(name: string): string | undefined {
    return readNonEmptyString(process.env[name]);
}

function summarizeToolArgs(args: unknown): Record<string, unknown> {
    if (!args || typeof args !== 'object') {
        return {};
    }
    const input = args as Record<string, unknown>;
    const summary: Record<string, unknown> = {};

    if (typeof input.transcriptPath === 'string') summary.transcriptPath = input.transcriptPath;
    if (typeof input.uuid === 'string') summary.uuid = input.uuid;
    if (typeof input.projectId === 'string') summary.projectId = input.projectId;
    if (typeof input.contextDirectory === 'string') summary.contextDirectory = input.contextDirectory;
    if (typeof input.model === 'string') summary.model = input.model;
    if (typeof input.status === 'string') summary.status = input.status;

    if (typeof input.originalText === 'string') {
        summary.originalTextLength = input.originalText.length;
    }
    if (typeof input.content === 'string') {
        summary.contentLength = input.content.length;
    }

    return summary;
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

function readAbsolutePath(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed.startsWith('/')) return undefined;
    return trimmed;
}

function readAbsolutePathList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((entry): entry is string => typeof entry === 'string')
        .map(entry => entry.trim())
        .filter(entry => entry.startsWith('/'));
}

function commonAncestor(paths: string[]): string | null {
    if (paths.length === 0) {
        return null;
    }
    const normalized = paths.map(pathValue => resolve(pathValue));
    const [first, ...rest] = normalized;
    let current = first;
    while (current !== dirname(current)) {
        const matches = rest.every((entry) => entry === current || entry.startsWith(`${current}/`));
        if (matches) {
            return current;
        }
        current = dirname(current);
    }
    return rest.every((entry) => entry === current || entry.startsWith(`${current}/`)) ? current : null;
}

function hasStorageConfig(config: Record<string, unknown>): boolean {
    return typeof config.storage === 'object' && config.storage !== null;
}

async function mergeStorageFromCanonicalConfig(
    config: Record<string, unknown>,
    explicitConfigPath: string | undefined,
): Promise<Record<string, unknown>> {
    if (hasStorageConfig(config)) {
        return config;
    }

    const roots = [
        readAbsolutePath(config.inputDirectory),
        readAbsolutePath(config.outputDirectory),
        readAbsolutePath(config.processedDirectory),
        ...readAbsolutePathList(config.contextDirectories),
    ].filter((value): value is string => Boolean(value));
    if (roots.length === 0) {
        return config;
    }

    const ancestor = commonAncestor(roots.map((value) => dirname(value)));
    if (!ancestor) {
        return config;
    }

    const canonicalConfigPath = resolve(ancestor, DEFAULT_CONFIG_FILE);
    if (explicitConfigPath && resolve(explicitConfigPath) === canonicalConfigPath) {
        return config;
    }

    try {
        const rawCanonicalConfig = await readFile(canonicalConfigPath, 'utf8');
        const parsed = parseYaml(rawCanonicalConfig);
        if (!parsed || typeof parsed !== 'object') {
            return config;
        }
        const candidate = parsed as Record<string, unknown>;
        if (!hasStorageConfig(candidate)) {
            return config;
        }
        lifecycleLogger.info('startup.storage.recovered_from_canonical_config', {
            canonicalConfigPath,
            inferredFromRoots: roots,
        });
        return {
            ...config,
            storage: candidate.storage,
        };
    } catch {
        return config;
    }
}

function exportStorageConfigToEnv(config: Record<string, unknown>): void {
    const storage = (config.storage && typeof config.storage === 'object')
        ? config.storage as Record<string, unknown>
        : null;
    if (!storage) {
        return;
    }
    const backend = typeof storage.backend === 'string' ? storage.backend.trim() : '';
    if (backend !== 'gcs') {
        return;
    }
    const gcs = (storage.gcs && typeof storage.gcs === 'object')
        ? storage.gcs as Record<string, unknown>
        : {};

    const setIfMissing = (name: string, value: unknown) => {
        if (typeof process.env[name] === 'string' && process.env[name]!.trim().length > 0) {
            return;
        }
        if (typeof value === 'string' && value.trim().length > 0) {
            process.env[name] = value.trim();
        }
    };

    setIfMissing('PROTOKOLL_STORAGE_BACKEND', 'gcs');
    setIfMissing('PROTOKOLL_STORAGE_GCS_PROJECT_ID', gcs.projectId);
    setIfMissing('PROTOKOLL_STORAGE_GCS_INPUT_URI', gcs.inputUri);
    setIfMissing('PROTOKOLL_STORAGE_GCS_OUTPUT_URI', gcs.outputUri);
    setIfMissing('PROTOKOLL_STORAGE_GCS_CONTEXT_URI', gcs.contextUri);
    setIfMissing('PROTOKOLL_STORAGE_GCS_INPUT_BUCKET', gcs.inputBucket);
    setIfMissing('PROTOKOLL_STORAGE_GCS_INPUT_PREFIX', gcs.inputPrefix);
    setIfMissing('PROTOKOLL_STORAGE_GCS_OUTPUT_BUCKET', gcs.outputBucket);
    setIfMissing('PROTOKOLL_STORAGE_GCS_OUTPUT_PREFIX', gcs.outputPrefix);
    setIfMissing('PROTOKOLL_STORAGE_GCS_CONTEXT_BUCKET', gcs.contextBucket);
    setIfMissing('PROTOKOLL_STORAGE_GCS_CONTEXT_PREFIX', gcs.contextPrefix);
    setIfMissing('PROTOKOLL_STORAGE_GCS_CREDENTIALS_FILE', gcs.credentialsFile);
}

function readCredentialsEnvPath(): string | undefined {
    const candidates = [
        process.env.PROTOKOLL_STORAGE_GCS_CREDENTIALS_FILE,
        process.env.PROTOKOLL_LOCAL_GCS_CREDENTIALS_FILE,
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            const trimmed = candidate.trim();
            return trimmed.startsWith('~/')
                ? resolve(homedir(), trimmed.slice(2))
                : trimmed;
        }
    }
    return undefined;
}

async function injectLocalGcsCredentialsIfMissing(
    config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const storage = (config.storage && typeof config.storage === 'object')
        ? config.storage as Record<string, unknown>
        : null;
    if (!storage) {
        return config;
    }
    if (storage.backend !== 'gcs') {
        return config;
    }

    const gcs = (storage.gcs && typeof storage.gcs === 'object')
        ? storage.gcs as Record<string, unknown>
        : {};
    const existingCredentials = readNonEmptyString(gcs.credentialsFile);
    if (existingCredentials) {
        return config;
    }

    const explicitFromEnv = readCredentialsEnvPath();
    const configuredDefaultPath = readEnvString('PROTOKOLL_GCS_CREDENTIALS_DEFAULT_PATH');
    const defaultPath = configuredDefaultPath
        ? (configuredDefaultPath.startsWith('~/')
            ? resolve(homedir(), configuredDefaultPath.slice(2))
            : configuredDefaultPath)
        : undefined;
    const credentialCandidates = [
        explicitFromEnv,
        defaultPath,
    ].filter((value): value is string => Boolean(value));

    for (const candidate of credentialCandidates) {
        try {
            await access(candidate);
            lifecycleLogger.info('startup.storage.gcs.credentials.injected', {
                path: candidate,
                source: candidate === explicitFromEnv ? 'env' : 'configured_default',
            });
            return {
                ...config,
                storage: {
                    ...storage,
                    gcs: {
                        ...gcs,
                        credentialsFile: candidate,
                    },
                },
            };
        } catch {
            // Continue to the next candidate path.
        }
    }

    return config;
}

function describeRawStorageConfig(config: Record<string, unknown>): string[] {
    const lines: string[] = [];
    const rawStorage = config.storage;
    if (!rawStorage || typeof rawStorage !== 'object') {
        lines.push('🗄️  Storage Backend:  filesystem (default)');
        return lines;
    }

    const storage = rawStorage as Record<string, unknown>;
    const backend = storage.backend === 'gcs' ? 'gcs' : 'filesystem';
    lines.push(`🗄️  Storage Backend:  ${backend}`);
    if (backend !== 'gcs') {
        return lines;
    }

    const gcs = (typeof storage.gcs === 'object' && storage.gcs !== null
        ? storage.gcs
        : {}) as Record<string, unknown>;

    const projectId = readNonEmptyString(gcs.projectId);
    const inputBucket = readNonEmptyString(gcs.inputBucket);
    const inputPrefix = readNonEmptyString(gcs.inputPrefix) ?? '';
    const outputBucket = readNonEmptyString(gcs.outputBucket);
    const outputPrefix = readNonEmptyString(gcs.outputPrefix) ?? '';
    const contextBucket = readNonEmptyString(gcs.contextBucket);
    const contextPrefix = readNonEmptyString(gcs.contextPrefix) ?? '';
    const inputUri = readNonEmptyString(gcs.inputUri);
    const outputUri = readNonEmptyString(gcs.outputUri);
    const contextUri = readNonEmptyString(gcs.contextUri);
    const credentialsFile = readNonEmptyString(gcs.credentialsFile);

    if (projectId) lines.push(`☁️  GCP Project:      ${projectId}`);
    if (inputBucket) lines.push(`📥 GCS Input:         ${inputBucket}/${inputPrefix}`);
    else if (inputUri) lines.push(`📥 GCS Input URI:     ${inputUri}`);
    if (outputBucket) lines.push(`📤 GCS Output:        ${outputBucket}/${outputPrefix}`);
    else if (outputUri) lines.push(`📤 GCS Output URI:    ${outputUri}`);
    if (contextBucket) lines.push(`📚 GCS Context:       ${contextBucket}/${contextPrefix}`);
    else if (contextUri) lines.push(`📚 GCS Context URI:   ${contextUri}`);
    lines.push(`🔐 GCS Credentials:   ${credentialsFile ?? 'ADC/default environment'}`);

    return lines;
}

function configureHttpLogLevel(debug: boolean): void {
    const packageName = '@redaksjon/protokoll-mcp';
    const logLevel = debug ? 'DEBUG' : 'INFO';
    let parsed: Record<string, unknown> = {};
    const raw = process.env.LOGGING_CONFIG;

    if (raw) {
        try {
            parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            parsed = {};
        }
    }

    const overrides = (parsed.overrides as Record<string, unknown> | undefined) || {};
    const packageOverride = (overrides[packageName] as Record<string, unknown> | undefined) || {};

    process.env.LOGGING_CONFIG = JSON.stringify({
        logLevel: parsed.logLevel || 'INFO',
        logFormat: parsed.logFormat || 'TEXT',
        ...parsed,
        overrides: {
            ...overrides,
            [packageName]: {
                ...packageOverride,
                logLevel,
            },
        },
    });
}

function parseCsvList(value: string): string[] {
    return value
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
}

function parseListOrAppend(value: string, previous: string[] = []): string[] {
    return [...previous, ...parseCsvList(value)];
}

function buildRootsKey(roots: McpRoot[]): string {
    return roots.map((root) => root.uri).join('|');
}

async function ensureServerConfigInitialized(initialRoots: McpRoot[]): Promise<void> {
    const key = buildRootsKey(initialRoots);

    if (ServerConfig.isInitialized() && serverConfigInitKey === key) {
        return;
    }

    if (serverConfigInitPromise) {
        await serverConfigInitPromise;
        if (ServerConfig.isInitialized() && serverConfigInitKey === key) {
            return;
        }
    }

    serverConfigInitKey = key;
    serverConfigInitPromise = ServerConfig.initializeServerConfig(initialRoots, 'remote')
        .finally(() => {
            serverConfigInitPromise = null;
        });
    await serverConfigInitPromise;
}

// CardiganTime integration for protokoll-mcp-http:
// - Define config schema once (CLI/env/config-file share the same keys).
// - Keep env mappings explicit via zod defaults where desired.
const McpHttpConfigSchema = z.object({
    inputDirectory: z.string().optional(),
    outputDirectory: z.string().optional(),
    processedDirectory: z.string().optional(),
    contextDirectories: z.array(z.string()).optional(),
    model: z.string().optional(),
    classifyModel: z.string().optional(),
    composeModel: z.string().optional(),
    transcriptionModel: z.string().optional(),
    debug: z.boolean().default(parseBooleanEnv(process.env.PROTOKOLL_DEBUG) ?? false),
    verbose: z.boolean().default(parseBooleanEnv(process.env.PROTOKOLL_VERBOSE) ?? false),
    secured: z.boolean().default(parseBooleanEnv(process.env.PROTOKOLL_HTTP_SECURED) ?? false),
    rbacUsersPath: z.string().optional(),
    rbacKeysPath: z.string().optional(),
    rbacPolicyPath: z.string().optional(),
    rbacReloadSeconds: z.number().optional(),
});

function parseReloadSeconds(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    if (typeof raw === 'number') {
        if (!Number.isFinite(raw) || raw <= 0) {
            throw new Error('rbacReloadSeconds must be a positive number');
        }
        return raw;
    }
    if (typeof raw === 'string') {
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error('rbacReloadSeconds must be a positive integer');
        }
        return parsed;
    }
    throw new Error('rbacReloadSeconds must be a positive integer');
}

function requestIdFromContext(c: any): string {
    const requestId = c.get?.(REQUEST_ID_CONTEXT_KEY);
    return typeof requestId === 'string' && requestId.trim().length > 0
        ? requestId
        : randomUUID();
}

function authError(c: any, status: number, errorCode: string, message: string) {
    const requestId = requestIdFromContext(c);
    return c.json({
        error_code: errorCode,
        message,
        request_id: requestId,
    }, status);
}

function getAuthorizationHeaderSummary(c: any): string {
    const hasAuthorization = Boolean(c.req.header('authorization'));
    const hasApiKey = Boolean(c.req.header('x-api-key'));
    if (hasAuthorization && hasApiKey) return 'bearer+x-api-key';
    if (hasAuthorization) return 'bearer';
    if (hasApiKey) return 'x-api-key';
    return 'none';
}

const authContextStore = new AsyncLocalStorage<AuthContext | null>();

function getActiveAuthContext(): AuthContext | null {
    return authContextStore.getStore() ?? null;
}

function normalizeAllowedProjects(auth: AuthContext | null): string[] {
    if (!auth?.allowed_projects || auth.allowed_projects.length === 0) {
        return [];
    }
    return auth.allowed_projects
        .map((value) => value.trim())
        .filter(Boolean);
}

function isProjectAllowed(projectId: string | null | undefined, allowedProjects: string[]): boolean {
    if (!projectId) return false;
    const normalized = projectId.trim().toLowerCase();
    return allowedProjects.some((allowed) => allowed.toLowerCase() === normalized);
}

function hasProjectScope(auth: AuthContext | null): boolean {
    return normalizeAllowedProjects(auth).length > 0;
}

function asRecord(value: unknown): Record<string, unknown> {
    return (value && typeof value === 'object')
        ? value as Record<string, unknown>
        : {};
}

function extractTranscriptRefs(args: Record<string, unknown>): string[] {
    const refs: string[] = [];
    const directKeys = ['transcriptPath', 'sourceTranscriptPath', 'targetTranscriptPath'];
    for (const key of directKeys) {
        const value = args[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            refs.push(value.trim());
        }
    }

    const listValue = args.transcriptPaths;
    if (Array.isArray(listValue)) {
        for (const entry of listValue) {
            if (typeof entry === 'string' && entry.trim().length > 0) {
                refs.push(entry.trim());
            }
        }
    }

    return refs;
}

async function enforceProjectScopeForTool(
    toolName: string,
    args: unknown,
    authContext: AuthContext | null,
): Promise<unknown> {
    const allowedProjects = normalizeAllowedProjects(authContext);
    if (allowedProjects.length === 0) {
        return args;
    }

    const scopedArgs = asRecord(args);
    const contextDirectory = typeof scopedArgs.contextDirectory === 'string'
        ? scopedArgs.contextDirectory
        : undefined;

    if (toolName === 'protokoll_list_transcripts') {
        const entityType = typeof scopedArgs.entityType === 'string' ? scopedArgs.entityType.trim() : '';
        const entityId = typeof scopedArgs.entityId === 'string' ? scopedArgs.entityId.trim() : '';

        if (entityType && entityType !== 'project') {
            throw new Error('This API key is project-scoped. Use entityType="project" with an allowed entityId.');
        }
        if (entityId) {
            if (!isProjectAllowed(entityId, allowedProjects)) {
                throw new Error(`Project-scoped key cannot access project "${entityId}".`);
            }
            return {
                ...scopedArgs,
                entityType: 'project',
                entityId,
            };
        }
        if (allowedProjects.length === 1) {
            return {
                ...scopedArgs,
                entityType: 'project',
                entityId: allowedProjects[0],
            };
        }
        throw new Error('This API key is scoped to multiple projects. Provide entityType="project" and an allowed entityId.');
    }

    if (toolName === 'protokoll_create_note' || toolName === 'protokoll_process_audio') {
        const providedProject = typeof scopedArgs.projectId === 'string' ? scopedArgs.projectId.trim() : '';
        if (providedProject) {
            if (!isProjectAllowed(providedProject, allowedProjects)) {
                throw new Error(`Project-scoped key cannot write to project "${providedProject}".`);
            }
            return args;
        }
        if (allowedProjects.length === 1) {
            return {
                ...scopedArgs,
                projectId: allowedProjects[0],
            };
        }
        throw new Error('This API key is scoped to multiple projects. Provide an explicit allowed projectId.');
    }

    if (toolName === 'protokoll_add_term') {
        const provided = Array.isArray(scopedArgs.projects)
            ? scopedArgs.projects.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : [];
        if (provided.length > 0) {
            for (const projectId of provided) {
                if (!isProjectAllowed(projectId, allowedProjects)) {
                    throw new Error(`Project-scoped key cannot attach term to project "${projectId}".`);
                }
            }
            return args;
        }
        if (allowedProjects.length === 1) {
            return {
                ...scopedArgs,
                projects: [allowedProjects[0]],
            };
        }
        throw new Error('This API key is scoped to multiple projects. Provide explicit allowed projects when creating a term.');
    }

    if (toolName === 'protokoll_edit_term') {
        const replaceProjects = Array.isArray(scopedArgs.projects)
            ? scopedArgs.projects.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : null;
        const addProjects = Array.isArray(scopedArgs.add_projects)
            ? scopedArgs.add_projects.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : [];
        const removeProjects = Array.isArray(scopedArgs.remove_projects)
            ? scopedArgs.remove_projects.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : [];

        const validateProjectList = (values: string[], action: string) => {
            for (const projectId of values) {
                if (!isProjectAllowed(projectId, allowedProjects)) {
                    throw new Error(`Project-scoped key cannot ${action} project "${projectId}".`);
                }
            }
        };

        if (replaceProjects) validateProjectList(replaceProjects, 'set');
        if (addProjects.length > 0) validateProjectList(addProjects, 'add');
        if (removeProjects.length > 0) validateProjectList(removeProjects, 'remove');
        return args;
    }

    if (toolName === 'protokoll_add_person' || toolName === 'protokoll_add_company') {
        if (allowedProjects.length !== 1) {
            throw new Error('This API key is scoped to multiple projects. Person/company creation currently requires a single allowed project.');
        }
        return args;
    }

    if (toolName === 'protokoll_edit_project' || toolName === 'protokoll_update_project') {
        const projectId = typeof scopedArgs.id === 'string' ? scopedArgs.id.trim() : '';
        if (!projectId || !isProjectAllowed(projectId, allowedProjects)) {
            throw new Error('Project-scoped key can only modify its allowed project.');
        }
        return args;
    }

    if (toolName === 'protokoll_add_project' || toolName === 'protokoll_delete_entity') {
        throw new Error('Project-scoped keys cannot create or delete projects/entities.');
    }

    if (toolName === 'protokoll_get_entity') {
        const entityId = typeof scopedArgs.entityId === 'string' ? scopedArgs.entityId.trim() : '';
        const entityType = typeof scopedArgs.entityType === 'string' ? scopedArgs.entityType.trim() : '';
        if (entityType === 'project' && !isProjectAllowed(entityId, allowedProjects)) {
            throw new Error(`Project-scoped key cannot access project "${entityId}".`);
        }
        return {
            ...scopedArgs,
            allowedProjectIds: allowedProjects,
        };
    }

    if (
        toolName === 'protokoll_list_projects'
        || toolName === 'protokoll_context_status'
        || toolName === 'protokoll_list_people'
        || toolName === 'protokoll_list_terms'
        || toolName === 'protokoll_list_companies'
        || toolName === 'protokoll_search_context'
    ) {
        return {
            ...scopedArgs,
            allowedProjectIds: allowedProjects,
        };
    }

    if (toolName === 'protokoll_edit_transcript') {
        const requestedProject = typeof scopedArgs.projectId === 'string' ? scopedArgs.projectId.trim() : '';
        if (requestedProject && !isProjectAllowed(requestedProject, allowedProjects)) {
            throw new Error(`Project-scoped key cannot move transcripts to project "${requestedProject}".`);
        }
    }

    if (toolName === 'protokoll_get_transcript_by_uuid') {
        const uuid = typeof scopedArgs.uuid === 'string' ? scopedArgs.uuid.trim() : '';
        if (uuid) {
            const readResult = await TranscriptTools.handleReadTranscript({ transcriptPath: uuid, contextDirectory });
            const metadata = asRecord((readResult as Record<string, unknown>).metadata);
            const projectId = typeof metadata.projectId === 'string' ? metadata.projectId.trim() : '';
            if (!isProjectAllowed(projectId, allowedProjects)) {
                throw new Error(`Project-scoped key cannot access transcript from project "${projectId || 'unassigned'}".`);
            }
        }
        return args;
    }

    const transcriptRefs = extractTranscriptRefs(scopedArgs);
    if (transcriptRefs.length === 0) {
        return args;
    }

    for (const transcriptRef of transcriptRefs) {
        const readResult = await TranscriptTools.handleReadTranscript({
            transcriptPath: transcriptRef,
            contextDirectory,
        });
        const metadata = asRecord((readResult as Record<string, unknown>).metadata);
        const projectId = typeof metadata.projectId === 'string' ? metadata.projectId.trim() : '';
        if (!isProjectAllowed(projectId, allowedProjects)) {
            throw new Error(`Project-scoped key cannot access transcript from project "${projectId || 'unassigned'}".`);
        }
    }

    return args;
}

function filterProjectScopedToolResult(
    toolName: string,
    result: unknown,
    authContext: AuthContext | null,
): unknown {
    void toolName;
    void authContext;
    return result;
}

async function postProcessProjectScopedCreate(
    toolName: string,
    args: unknown,
    result: unknown,
    authContext: AuthContext | null,
): Promise<void> {
    const allowedProjects = normalizeAllowedProjects(authContext);
    if (allowedProjects.length !== 1) {
        return;
    }
    const scopedProjectId = allowedProjects[0];
    const payload = asRecord(result);
    const entity = asRecord(payload.entity);
    const entityId = typeof entity.id === 'string' ? entity.id.trim() : '';
    if (!entityId) {
        return;
    }

    if (toolName === 'protokoll_add_person') {
        await handleToolCall('protokoll_edit_project', {
            id: scopedProjectId,
            add_associated_people: [entityId],
            contextDirectory: asRecord(args).contextDirectory,
        });
    }

    if (toolName === 'protokoll_add_company') {
        await handleToolCall('protokoll_edit_project', {
            id: scopedProjectId,
            add_associated_companies: [entityId],
            contextDirectory: asRecord(args).contextDirectory,
        });
    }
}

function filterProjectEntitiesResourceJson(
    contents: { uri: string; mimeType?: string; text?: string },
    allowedProjects: string[],
) {
    if (!contents.text) {
        return contents;
    }
    try {
        const parsed = JSON.parse(contents.text) as Record<string, unknown>;
        const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
        const filtered = entities.filter((entity) => {
            const item = asRecord(entity);
            const id = typeof item.id === 'string' ? item.id.trim() : '';
            return isProjectAllowed(id, allowedProjects);
        });
        return {
            ...contents,
            text: JSON.stringify({
                ...parsed,
                entities: filtered,
                count: filtered.length,
            }, null, 2),
        };
    } catch {
        return contents;
    }
}

async function configureRbacIfSecured(config: Record<string, unknown>): Promise<void> {
    if (rbacReloadTimer) {
        clearInterval(rbacReloadTimer);
        rbacReloadTimer = null;
    }
    rbacSecuredMode = Boolean(config.secured);
    rbacAuthorizer = null;

    if (!rbacSecuredMode) {
        lifecycleLogger.info('security.mode', { secured: false });
        return;
    }

    const usersPath = readNonEmptyString(config.rbacUsersPath);
    const keysPath = readNonEmptyString(config.rbacKeysPath);
    const policyPath = readNonEmptyString(config.rbacPolicyPath);
    const reloadSeconds = parseReloadSeconds(config.rbacReloadSeconds);

    if (!usersPath || !keysPath) {
        throw new Error('secured=true requires rbacUsersPath and rbacKeysPath');
    }

    await access(usersPath).catch(() => {
        throw new Error(`RBAC users file not found: ${usersPath}`);
    });
    await access(keysPath).catch(() => {
        throw new Error(`RBAC keys file not found: ${keysPath}`);
    });
    if (policyPath) {
        await access(policyPath).catch(() => {
            throw new Error(`RBAC policy file not found: ${policyPath}`);
        });
    }

    const loadAuthorizer = async () => {
        const loaded = await loadRbacAuthorizerFromFiles({ usersPath, keysPath, policyPath });
        rbacAuthorizer = loaded;
    };

    await loadAuthorizer();
    lifecycleLogger.info('security.mode', {
        secured: true,
        usersPath,
        keysPath,
        policyPath: policyPath ?? null,
        reloadSeconds: reloadSeconds ?? null,
    });

    if (reloadSeconds && reloadSeconds > 0) {
        rbacReloadTimer = setInterval(() => {
            loadAuthorizer()
                .then(() => {
                    lifecycleLogger.debug('security.rbac.reloaded', { reloadSeconds });
                })
                .catch((error) => {
                    lifecycleLogger.error('security.rbac.reload_failed', {
                        error: error instanceof Error ? error.message : String(error),
                    });
                });
        }, reloadSeconds * 1000);
    }
}

// ============================================================================
// Session Management
// ============================================================================

interface SessionData {
    sessionId: string;
    server: Server;
    transport: StreamableHTTPTransport;
    initialized: boolean;
    lastActivity: number;
    subscriptions: Set<string>; // Set of resource URIs this session is subscribed to
    sseWriters: Set<(data: string) => Promise<void>>; // SSE stream writers for push notifications
}

const sessions = new Map<string, SessionData>();
const pendingSessionCreations = new Map<string, Promise<SessionData>>();

// ============================================================================
// Push Notification Helpers
// ============================================================================

/**
 * Send a notifications/resource_changed event to all sessions subscribed to the given URI.
 * Used to keep connected clients (e.g. the VSCode extension) in sync when an entity is
 * mutated by a different session (e.g. an AI assistant).
 */
async function notifyEntityChanged(entityType: string, entityId: string): Promise<void> {
    const entityUri = `protokoll://entity/${entityType}/${entityId}`;
    const notification = JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/resource_changed',
        params: { uri: entityUri },
    });
    const sseMessage = `event: notification\ndata: ${notification}\n\n`;

    let notified = 0;
    for (const [, session] of sessions) {
        if (session.subscriptions.has(entityUri)) {
            for (const writer of session.sseWriters) {
                try {
                    await writer(sseMessage);
                    notified++;
                } catch {
                    // Stale writer — will be cleaned up on SSE abort
                }
            }
        }
    }

    rootLogger.info('entity.notification.sent', {
        entityUri,
        notifiedWriters: notified,
    });
}

/**
 * Send a notifications/resource_changed event to all sessions subscribed to the given resource URI.
 */
async function notifyResourceChanged(resourceUri: string): Promise<void> {
    const notification = JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/resource_changed',
        params: { uri: resourceUri },
    });
    const sseMessage = `event: notification\ndata: ${notification}\n\n`;

    let notified = 0;
    for (const [, session] of sessions) {
        if (session.subscriptions.has(resourceUri)) {
            for (const writer of session.sseWriters) {
                try {
                    await writer(sseMessage);
                    notified++;
                } catch {
                    // Stale writer — will be cleaned up on SSE abort
                }
            }
        }
    }

    rootLogger.info('resource.notification.sent', {
        resourceUri,
        notifiedWriters: notified,
    });
}

function toTranscriptResourceUri(transcriptPath: string): string | null {
    const trimmed = transcriptPath.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.startsWith('protokoll://transcript/')) {
        const normalized = trimmed
            .replace(/^protokoll:\/\/transcript\/\.\.\//, 'protokoll://transcript/')
            .replace(/\.pkl(\?.*)?$/i, '$1');
        return normalized;
    }

    const normalizedPath = trimmed
        .replace(/^\/+/, '')
        .replace(/\\/g, '/')
        .replace(/\.pkl$/i, '');

    if (!normalizedPath) {
        return null;
    }

    return `protokoll://transcript/${normalizedPath}`;
}

/**
 * Inspect a completed tool call and fire entity-change notifications for any
 * entity that was mutated.  Failures are swallowed so they never affect the
 * tool result returned to the caller.
 */
async function sendEntityChangeNotifications(
    toolName: string,
    args: Record<string, unknown> | undefined,
): Promise<void> {
    if (!args) return;

    type EntityRef = { entityType: string; entityId: string };

    // Map each mutating tool to a function that extracts the affected entity
    const extractors: Record<string, (a: Record<string, unknown>) => EntityRef | null> = {
        protokoll_add_relationship: (a) => (
            a.entityType && a.entityId
                ? { entityType: a.entityType as string, entityId: a.entityId as string }
                : null
        ),
        protokoll_remove_relationship: (a) => (
            a.entityType && a.entityId
                ? { entityType: a.entityType as string, entityId: a.entityId as string }
                : null
        ),
        protokoll_edit_person: (a) => (
            a.id ? { entityType: 'person', entityId: a.id as string } : null
        ),
        protokoll_edit_project: (a) => (
            a.id ? { entityType: 'project', entityId: a.id as string } : null
        ),
        protokoll_edit_term: (a) => (
            a.id ? { entityType: 'term', entityId: a.id as string } : null
        ),
        protokoll_edit_company: (a) => (
            a.id ? { entityType: 'company', entityId: a.id as string } : null
        ),
    };

    const extractor = extractors[toolName];
    if (!extractor) return;

    try {
        const ref = extractor(args);
        if (ref) {
            await notifyEntityChanged(ref.entityType, ref.entityId);
        }
    } catch (err) {
        rootLogger.error('entity.notification.error', {
            toolName,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Send transcript resource change notifications for tools that mutate transcript content.
 */
async function sendTranscriptChangeNotifications(
    toolName: string,
    args: Record<string, unknown> | undefined,
): Promise<void> {
    if (!args || toolName !== 'protokoll_enhance_transcript') {
        return;
    }

    const transcriptPath = typeof args.transcriptPath === 'string' ? args.transcriptPath : '';
    const transcriptUri = toTranscriptResourceUri(transcriptPath);
    if (!transcriptUri) {
        return;
    }

    try {
        await notifyResourceChanged(transcriptUri);
    } catch (err) {
        rootLogger.error('transcript.notification.error', {
            toolName,
            transcriptUri,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

// Clean up inactive sessions after 1 hour
const SESSION_TIMEOUT = 60 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.lastActivity > SESSION_TIMEOUT) {
            sessionLogger.info('cleanup.inactive_session', { sessionId });
            sessions.delete(sessionId);
        }
    }
}, 5 * 60 * 1000); // Check every 5 minutes

// ============================================================================
// MCP Server Factory
// ============================================================================

function createMcpServer(): Server {
    const server = new Server(
        {
            name: 'protokoll',
            version: '0.1.0',
            description:
                'Intelligent audio transcription with context-aware enhancement. ' +
                'Process audio files through a pipeline that transcribes with Whisper, ' +
                'then enhances using LLMs with knowledge of your people, projects, and terminology. ' +
                'Manage context entities (people, projects, terms) to improve recognition. ' +
                'Edit and combine existing transcripts. ' +
                '\n\n**IMPORTANT FOR AI ASSISTANTS**: When working with transcripts, you MUST use the ' +
                'Protokoll MCP tools (protokoll_*) to read and modify transcript files. ' +
                'DO NOT use direct file editing tools like Read, Write, or StrReplace on transcript files. ' +
                'Use protokoll_read_transcript to read, protokoll_edit_transcript to change title/project/tags/status, ' +
                'protokoll_provide_feedback for content corrections, and protokoll_change_transcript_date for date changes. ' +
                'The transcript files are accessed via protokoll:// URIs through this MCP server.',
        },
        {
            capabilities: {
                tools: {},
                resources: {
                    subscribe: true,
                    listChanged: true,
                },
                prompts: {
                    listChanged: false,
                },
            },
        }
    );

    // Request roots from client and initialize configuration
    server.setRequestHandler(ListRootsRequestSchema, async () => {
        const roots = Roots.getCachedRoots() || [];
        return { roots };
    });

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools,
    }));

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const startedAt = Date.now();
        const authContext = getActiveAuthContext();
        requestLogger.info('tool.call.start', {
            toolName: name,
            args: summarizeToolArgs(args),
            userId: authContext?.user_id ?? null,
            keyId: authContext?.key_id ?? null,
        });

        try {
            const scopedArgs = await enforceProjectScopeForTool(name, args, authContext);
            const toolResult = await handleToolCall(name, scopedArgs);
            await postProcessProjectScopedCreate(name, scopedArgs, toolResult, authContext);
            const result = filterProjectScopedToolResult(name, toolResult, authContext);

            // Send push notifications to sessions subscribed to affected entity resources
            sendEntityChangeNotifications(name, args).catch((err) => {
                rootLogger.error('entity.notification.dispatch_error', {
                    toolName: name,
                    error: err instanceof Error ? err.message : String(err),
                });
            });

            // Send transcript change notifications for transcript-mutating tools
            sendTranscriptChangeNotifications(name, args).catch((err) => {
                rootLogger.error('transcript.notification.dispatch_error', {
                    toolName: name,
                    error: err instanceof Error ? err.message : String(err),
                });
            });

            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            requestLogger.error('tool.call.failed', {
                toolName: name,
                args: summarizeToolArgs(args),
                error: message,
                stack: error instanceof Error ? error.stack : undefined,
                elapsedMs: Date.now() - startedAt,
            });
            return {
                content: [{ type: 'text', text: `Error: ${message}` }],
                isError: true,
            };
        } finally {
            requestLogger.info('tool.call.complete', {
                toolName: name,
                elapsedMs: Date.now() - startedAt,
            });
        }
    });

    // List available resources
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        const listed = await Resources.handleListResources();
        const authContext = getActiveAuthContext();
        if (!hasProjectScope(authContext)) {
            return listed;
        }

        const filteredResources = listed.resources.filter((resource) => {
            try {
                const parsed = parseUri(resource.uri);
                if (parsed.resourceType === 'entities-list') {
                    return (parsed as any).entityType === 'project';
                }
                if (parsed.resourceType === 'entity') {
                    return (parsed as any).entityType === 'project'
                        && isProjectAllowed((parsed as any).entityId, normalizeAllowedProjects(authContext));
                }
                if (parsed.resourceType === 'audio-inbound' || parsed.resourceType === 'audio-processed') {
                    return false;
                }
                return true;
            } catch {
                return true;
            }
        });

        return {
            ...listed,
            resources: filteredResources,
        };
    });

    // Read a resource
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;
        const authContext = getActiveAuthContext();
        const allowedProjects = normalizeAllowedProjects(authContext);

        if (allowedProjects.length > 0) {
            const parsed = parseUri(uri);

            if (parsed.resourceType === 'audio-inbound' || parsed.resourceType === 'audio-processed' || parsed.resourceType === 'config') {
                throw new Error(`Project-scoped key cannot access ${parsed.resourceType} resources`);
            }

            if (parsed.resourceType === 'entity') {
                const entity = parsed as any;
                if (entity.entityType !== 'project') {
                    throw new Error('Project-scoped key can only read project entities');
                }
                if (!isProjectAllowed(entity.entityId, allowedProjects)) {
                    throw new Error(`Project-scoped key cannot access project "${entity.entityId}"`);
                }
            }

            if (parsed.resourceType === 'entities-list') {
                const entityList = parsed as any;
                if (entityList.entityType !== 'project') {
                    throw new Error('Project-scoped key can only list project entities');
                }
            }

            if (parsed.resourceType === 'transcript') {
                const transcriptUri = parsed as any;
                const transcriptResult = await TranscriptTools.handleReadTranscript({
                    transcriptPath: transcriptUri.transcriptPath,
                });
                const metadata = asRecord((transcriptResult as Record<string, unknown>).metadata);
                const projectId = typeof metadata.projectId === 'string' ? metadata.projectId.trim() : '';
                if (!isProjectAllowed(projectId, allowedProjects)) {
                    throw new Error(`Project-scoped key cannot access transcript from project "${projectId || 'unassigned'}"`);
                }
            }

            if (parsed.resourceType === 'transcripts-list') {
                const list = parsed as any;
                const requestedProjectId = typeof list.projectId === 'string' ? list.projectId.trim() : '';
                if (requestedProjectId.length > 0 && !isProjectAllowed(requestedProjectId, allowedProjects)) {
                    throw new Error(`Project-scoped key cannot list transcripts for project "${requestedProjectId}"`);
                }

                if (requestedProjectId.length === 0) {
                    if (allowedProjects.length !== 1) {
                        throw new Error('Project-scoped key with multiple projects must specify projectId in transcript list resource');
                    }
                    const contents = await Resources.readTranscriptsListResource({
                        directory: list.directory,
                        startDate: list.startDate,
                        endDate: list.endDate,
                        limit: list.limit,
                        offset: list.offset,
                        projectId: allowedProjects[0],
                    });
                    return { contents: [contents] };
                }
            }
        }

        try {
            const contents = await Resources.handleReadResource(uri);
            if (allowedProjects.length > 0) {
                const parsed = parseUri(uri);
                if (parsed.resourceType === 'entities-list') {
                    const filtered = filterProjectEntitiesResourceJson(contents as any, allowedProjects);
                    return { contents: [filtered] };
                }
            }
            return { contents: [contents] };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to read resource ${uri}: ${message}`);
        }
    });

    // List available prompts
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
        return { prompts: Prompts.getPrompts() };
    });

    // Get a prompt with arguments
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            const messages = await Prompts.getPrompt(name, args || {});
            return { messages };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get prompt ${name}: ${message}`);
        }
    });

    return server;
}

// ============================================================================
// Hono Application Setup
// ============================================================================

const app = new Hono<{ Variables: { requestId: string; authContext: AuthContext } }>();

app.use('*', async (c, next) => {
    const requestId = c.req.header('x-request-id')?.trim() || randomUUID();
    c.set(REQUEST_ID_CONTEXT_KEY, requestId);
    c.header('x-request-id', requestId);
    await next();
});

app.use('*', async (c, next) => {
    const requestId = requestIdFromContext(c);
    const method = c.req.method;
    const pathname = c.req.path;
    if (!rbacSecuredMode) {
        await next();
        return;
    }
    if (!rbacAuthorizer) {
        return authError(c, 500, 'rbac_unavailable', 'RBAC authorizer is not initialized');
    }

    const routeDecision = rbacAuthorizer.resolveRoute(method, pathname);
    if (routeDecision.isPublic) {
        requestLogger.info('auth.decision', {
            requestId,
            method,
            path: pathname,
            decision: 'allow',
            reason: 'public_route',
            identity: null,
            authorizationHeader: getAuthorizationHeaderSummary(c),
        });
        await next();
        return;
    }

    const auth = rbacAuthorizer.authenticate(c.req.raw.headers);
    if (!auth.ok) {
        requestLogger.info('auth.decision', {
            requestId,
            method,
            path: pathname,
            decision: 'deny',
            reason: auth.reason,
            identity: null,
            authorizationHeader: getAuthorizationHeaderSummary(c),
        });
        return authError(
            c,
            AUTH_FAILURE_STATUS_BY_REASON[auth.reason] ?? 401,
            AUTH_FAILURE_ERROR_CODE_BY_REASON[auth.reason] ?? 'auth_failed',
            'Authentication failed'
        );
    }

    const authContext: AuthContext = auth.context;
    c.set(AUTH_CONTEXT_KEY, authContext);

    const authorization = rbacAuthorizer.authorize(routeDecision, authContext);
    if (!authorization.allowed) {
        requestLogger.info('auth.decision', {
            requestId,
            method,
            path: pathname,
            decision: 'deny',
            reason: authorization.reason,
            userId: authContext.user_id,
            keyId: authContext.key_id,
            roles: authContext.roles,
            authorizationHeader: getAuthorizationHeaderSummary(c),
        });
        return authError(
            c,
            403,
            authorization.reason === 'no_policy_match' ? 'policy_no_match' : 'forbidden',
            authorization.reason === 'no_policy_match' ? 'No policy rule matched this route' : 'Access denied'
        );
    }

    requestLogger.info('auth.decision', {
        requestId,
        method,
        path: pathname,
        decision: 'allow',
        reason: authorization.reason,
        userId: authContext.user_id,
        keyId: authContext.key_id,
        roles: authContext.roles,
        authorizationHeader: getAuthorizationHeaderSummary(c),
    });
    await next();
});

// CORS middleware for /mcp endpoint
app.use('/mcp', cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Accept', 'Mcp-Session-Id', 'Mcp-Protocol-Version', 'Last-Event-Id', 'Authorization', 'X-API-Key', 'X-Request-Id'],
    exposeHeaders: ['Mcp-Session-Id', 'Mcp-Protocol-Version'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
}));

// CORS middleware for audio endpoints
app.use('/audio/*', cors({
    origin: '*',
    allowHeaders: ['Authorization', 'X-API-Key', 'X-Request-Id', 'Content-Type', 'Accept'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

// ============================================================================
// Audio Upload/Download Endpoints
// ============================================================================

/**
 * Get audio MIME type from file extension
 */
function getAudioMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.wav': 'audio/wav',
        '.webm': 'audio/webm',
        '.mp4': 'audio/mp4',
        '.aac': 'audio/aac',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
    };
    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Audio upload endpoint
 * 
 * Accepts multipart audio file upload, validates type and size,
 * stores file in uploads directory, creates PKL with 'uploaded' status.
 */
app.post('/audio/upload', 
    bodyLimit({ maxSize: DEFAULT_MAX_AUDIO_SIZE }),
    async (c) => {
        try {
            const body = await c.req.parseBody();
            const file = body['audio'];
            
            if (!file || !(file instanceof File)) {
                return c.json({ error: 'No audio file provided' }, 400);
            }
            
            // Validate file extension
            const ext = extname(file.name).toLowerCase().replace('.', '');
            if (!DEFAULT_AUDIO_EXTENSIONS.includes(ext)) {
                return c.json({ 
                    error: `Unsupported file type: ${ext}. Supported: ${DEFAULT_AUDIO_EXTENSIONS.join(', ')}` 
                }, 400);
            }
            
            // Get output directory from server config
            const outputDir = ServerConfig.getOutputDirectory();
            const outputStorage = ServerConfig.getOutputStorage();
            
            // Ensure upload directory exists (no-op for GCS).
            await outputStorage.mkdir('uploads');
            
            // Calculate file hash
            const buffer = await file.arrayBuffer();
            const hash = createHash('sha256').update(Buffer.from(buffer)).digest('hex');
            const uploadObjectPath = `uploads/${hash}.${ext}`;

            // Detect duplicate audio by content hash and return the existing transcript.
            // This prevents duplicate processing when the same bytes are uploaded again.
            const hashObjectExists = await outputStorage.exists(uploadObjectPath);
            if (hashObjectExists) {
                const existingTranscript = await findTranscriptByAudioHashInDirectory(hash, outputDir, outputStorage);
                if (existingTranscript) {
                    uploadLogger.info('audio.upload.duplicate_detected', {
                        originalFilename: file.name,
                        transcriptUuid: existingTranscript.uuid,
                        bytes: buffer.byteLength,
                        objectPath: uploadObjectPath,
                        storageBackend: outputStorage.name,
                    });

                    return c.json({
                        success: true,
                        duplicate: true,
                        uuid: existingTranscript.uuid,
                        message: 'Duplicate audio detected. Returning existing transcript.',
                        filename: file.name,
                        size: buffer.byteLength,
                        existingStatus: existingTranscript.status ?? null,
                    });
                }
            }
            
            // Save uploaded file with hash-based name
            await outputStorage.writeFile(uploadObjectPath, Buffer.from(buffer));
            
            // Extract optional title and project hints from form data
            const rawTitle = body['title'];
            const rawProject = body['project'];
            const title = (typeof rawTitle === 'string' && rawTitle.trim()) ? rawTitle.trim() : undefined;
            let project = (typeof rawProject === 'string' && rawProject.trim()) ? rawProject.trim() : undefined;
            const authContext = c.get(AUTH_CONTEXT_KEY) as AuthContext | undefined;
            if (hasProjectScope(authContext ?? null)) {
                const allowedProjects = normalizeAllowedProjects(authContext ?? null);
                if (!project && allowedProjects.length === 1) {
                    project = allowedProjects[0];
                }
                if (!project || !isProjectAllowed(project, allowedProjects)) {
                    return c.json({
                        error: 'Project-scoped key cannot upload outside allowed projects',
                    }, 403);
                }
            }

            // PKL transcript creation uses a local sqlite-backed file path.
            // Ensure the configured output directory exists even when audio bytes are stored in GCS.
            await mkdir(outputDir, { recursive: true });
            
            // Create transcript PKL with uploaded status
            const { uuid, filePath } = await createUploadTranscript({
                audioFile: basename(uploadObjectPath), // Store just the filename
                originalFilename: file.name,
                audioHash: hash,
                outputDirectory: outputDir,
                title,
                project,
            });

            // In GCS mode, persist the upload transcript record to shared storage
            // so any worker instance can discover and process it.
            if (outputStorage.name === 'gcs') {
                const transcriptObjectPath = basename(filePath);
                const transcriptBytes = await readFile(filePath);
                await outputStorage.writeFile(transcriptObjectPath, transcriptBytes);
                markTranscriptIndexDirtyForStorage(outputStorage, outputDir, transcriptObjectPath);
            }
            
            uploadLogger.info('audio.upload.complete', {
                originalFilename: file.name,
                transcriptUuid: uuid,
                bytes: buffer.byteLength,
                objectPath: uploadObjectPath,
                storageBackend: outputStorage.name,
            });
            
            return c.json({
                success: true,
                uuid,
                message: 'Audio uploaded successfully. Use protokoll_get_transcript_by_uuid to track progress.',
                filename: file.name,
                size: buffer.byteLength,
                title: title ?? null,
                project: project ?? null,
            });
            
        } catch (error) {
            uploadLogger.error('audio.upload.error', {
                error: error instanceof Error ? error.message : String(error),
            });
            return c.json({ 
                error: 'Upload failed', 
                details: error instanceof Error ? error.message : String(error)
            }, 500);
        }
    }
);

/**
 * Audio download endpoint
 * 
 * Downloads the original uploaded audio file for a transcript by UUID.
 */
app.get('/audio/:uuid', async (c) => {
    try {
        const uuid = c.req.param('uuid');
        
        // Get output directory
        const outputDir = ServerConfig.getOutputDirectory();
        const outputStorage = ServerConfig.getOutputStorage();
        
        // Find transcript by UUID
        const transcriptRecord = await findTranscriptByUuidInStorage(uuid, outputStorage, outputDir);
        if (!transcriptRecord) {
            return c.json({ error: `Transcript not found for UUID: ${uuid}` }, 404);
        }
        
        // Get metadata to find original audio file
        const metadata = transcriptRecord.metadata;

        const authContext = c.get(AUTH_CONTEXT_KEY) as AuthContext | undefined;
        if (hasProjectScope(authContext ?? null)) {
            const allowedProjects = normalizeAllowedProjects(authContext ?? null);
            const projectId = typeof metadata.projectId === 'string' ? metadata.projectId : null;
            if (!isProjectAllowed(projectId, allowedProjects)) {
                return c.json({ error: 'Project-scoped key cannot access this transcript audio' }, 403);
            }
        }
        
        if (!metadata.audioHash) {
            return c.json({ error: 'No audio file associated with this transcript' }, 404);
        }
        
        // Find uploaded audio file by hash
        const uploadedFiles = await outputStorage.listFiles('uploads', metadata.audioHash);
        const audioFiles = uploadedFiles.filter((filePath) => basename(filePath).startsWith(`${metadata.audioHash}.`));
        if (audioFiles.length === 0) {
            return c.json({ error: 'Audio file not found in uploads directory' }, 404);
        }
        
        const audioFile = audioFiles[0];
        const ext = extname(audioFile);
        const audioBuffer = await outputStorage.readFile(audioFile);
        
        // Set appropriate headers
        c.header('Content-Type', getAudioMimeType(ext));
        c.header('Content-Length', audioBuffer.length.toString());
        const downloadFilename = (metadata as { originalFilename?: string }).originalFilename
            || metadata.audioFile
            || `${uuid}${ext}`;
        c.header('Content-Disposition', `attachment; filename="${downloadFilename}"`);
        
        // Return full audio content.
        return c.body(audioBuffer as any);
        
    } catch (error) {
        uploadLogger.error('audio.download.error', {
            uuid: c.req.param('uuid'),
            error: error instanceof Error ? error.message : String(error),
        });
        return c.json({ 
            error: 'Download failed',
            details: error instanceof Error ? error.message : String(error)
        }, 500);
    }
});

// ============================================================================
// Health and Status Endpoints
// ============================================================================

// Health endpoint with upload queue statistics
app.get('/health', async (c) => {
    try {
        const outputDir = ServerConfig.getOutputDirectory();
        
        // Count transcripts by status
        const uploaded = await TranscriptOps.findUploadedTranscripts([outputDir]);
        const transcribing = await TranscriptOps.findTranscribingTranscripts([outputDir]);
        
        return c.json({
            status: 'healthy',
            sessions: sessions.size,
            uploadQueue: {
                pending: uploaded.length,
                processing: transcribing.length,
            },
            worker: {
                running: transcriptionWorker?.isActive() || false,
                processed: transcriptionWorker?.getProcessedCount() || 0,
            },
            endpoints: {
                upload: '/audio/upload',
                download: '/audio/{uuid}',
                mcp: '/mcp',
                health: '/health',
            },
        });
    } catch {
        return c.json({
            status: 'healthy',
            sessions: sessions.size,
            error: 'Could not fetch queue statistics',
        });
    }
});

app.get('/auth/whoami', async (c) => {
    const auth = c.get(AUTH_CONTEXT_KEY) as AuthContext | undefined;
    if (!auth) {
        return authError(c, 401, 'missing_auth_context', 'Authentication required');
    }
    return c.json({
        user_id: auth.user_id,
        roles: auth.roles,
        key_id: auth.key_id,
        allowed_projects: auth.allowed_projects ?? [],
    });
});

app.get('/admin/ping', async (c) => {
    const auth = c.get(AUTH_CONTEXT_KEY) as AuthContext | undefined;
    if (!auth) {
        return authError(c, 401, 'missing_auth_context', 'Authentication required');
    }
    return c.json({
        ok: true,
        user_id: auth.user_id,
        key_id: auth.key_id,
        roles: auth.roles,
    });
});

// MCP endpoint - handles POST requests (JSON-RPC)
app.post('/mcp', async (c) => {
    const requestStartedAt = Date.now();
    const sessionIdHeader = c.req.header('mcp-session-id');
    
    // Read request body
    const body = await c.req.text();
    
    let jsonRpcMessage;
    try {
        jsonRpcMessage = JSON.parse(body);
        requestLogger.debug('request.parse_jsonrpc', {
            method: 'POST',
            route: '/mcp',
            sessionId: sessionIdHeader ?? null,
            rpcMethod: jsonRpcMessage.method ?? null,
            rpcId: jsonRpcMessage.id ?? null,
            elapsedMs: Date.now() - requestStartedAt,
        });
    } catch {
        return c.json({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error' },
            id: null,
        }, 400);
    }

    // Check if this is an initialize request
    const isInitialize = jsonRpcMessage.method === 'initialize';

    const createSession = async (sessionId: string): Promise<SessionData> => {
        const server = createMcpServer();
        const transport = new StreamableHTTPTransport();

        const newSession: SessionData = {
            sessionId,
            server,
            transport,
            initialized: false,
            lastActivity: Date.now(),
            subscriptions: new Set(),
            sseWriters: new Set(),
        };

        sessions.set(sessionId, newSession);
        sessionLogger.info('created', {
            sessionId,
            workspaceRoot: process.env.WORKSPACE_ROOT || process.cwd(),
        });

        // Use the config loaded once at startup
        const cardigantimeConfig = startupConfig;

        const resolvedConfigDirs = (cardigantimeConfig as any).resolvedConfigDirs as unknown;
        const configRoot = Array.isArray(resolvedConfigDirs) && resolvedConfigDirs.length > 0
            ? resolvedConfigDirs[0]
            : (process.env.WORKSPACE_ROOT || process.cwd());
        const configPathDisplay = resolve(configRoot, DEFAULT_CONFIG_FILE);

        const startupResolvedConfigDirs = (startupConfig as { resolvedConfigDirs?: string[] }).resolvedConfigDirs;
        const rootCandidates = Array.isArray(startupResolvedConfigDirs) && startupResolvedConfigDirs.length > 0
            ? startupResolvedConfigDirs
            : [process.env.WORKSPACE_ROOT || process.cwd()];
        const workspaceRoot = rootCandidates[0];
        const initialRoots: McpRoot[] = rootCandidates.map((rootPath, index) => ({
            uri: `file://${rootPath}`,
            name: index === 0 ? 'Workspace' : `Workspace ${index + 1}`,
        }));

        // Keep environment aligned with the root used for remote config discovery.
        process.env.WORKSPACE_ROOT = workspaceRoot;

        Roots.setRoots(initialRoots);
        await ensureServerConfigInitialized(initialRoots);

        // Get the full initialized config from ServerConfig
        const serverConfig = ServerConfig.getServerConfig();
        const storageConfig = ServerConfig.getStorageConfig();
        const context = ServerConfig.getContext();
        // Use getContextDirs() (actual loaded dirs) or fall back to configFile.contextDirectories
        const contextDirs = context?.getContextDirs?.() ?? (serverConfig.configFile as { contextDirectories?: string[] })?.contextDirectories;
        const contextDirsDisplay = Array.isArray(contextDirs) && contextDirs.length > 0
            ? contextDirs.join(', ')
            : 'NONE';

        sessionLogger.info('configuration.loaded', {
            sessionId,
            workingDirectory: workspaceRoot,
            configFile: configPathDisplay,
            inputDirectory: serverConfig.inputDirectory || null,
            outputDirectory: serverConfig.outputDirectory || null,
            processedDirectory: serverConfig.processedDirectory || null,
            contextDirectories: contextDirsDisplay,
            storageBackend: storageConfig.backend,
            model: (cardigantimeConfig as any).model || 'default',
            transcriptionModel: (cardigantimeConfig as any).transcriptionModel || 'default',
            debugMode: (cardigantimeConfig as any).debug ? 'ON' : 'OFF',
            verboseMode: (cardigantimeConfig as any).verbose ? 'ON' : 'OFF',
        });
        if (storageConfig.backend === 'gcs' && storageConfig.gcs) {
            sessionLogger.info('configuration.gcs', {
                sessionId,
                projectId: storageConfig.gcs.projectId ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'default',
                credentialsFile: storageConfig.gcs.credentialsFile ?? 'ADC/default environment',
                inputBucket: storageConfig.gcs.inputBucket ?? null,
                inputPrefix: storageConfig.gcs.inputPrefix ?? null,
                outputBucket: storageConfig.gcs.outputBucket ?? null,
                outputPrefix: storageConfig.gcs.outputPrefix ?? null,
                contextBucket: storageConfig.gcs.contextBucket ?? null,
                contextPrefix: storageConfig.gcs.contextPrefix ?? null,
            });
        }

        await ensureTranscriptionWorkerStarted();

        // Connect server to transport
        await newSession.server.connect(transport);
        return newSession;
    };

    const getOrCreateSession = async (sessionId: string): Promise<SessionData> => {
        const existingSession = sessions.get(sessionId);
        if (existingSession) {
            return existingSession;
        }

        const pendingCreation = pendingSessionCreations.get(sessionId);
        if (pendingCreation) {
            return pendingCreation;
        }

        const creationPromise = createSession(sessionId).finally(() => {
            pendingSessionCreations.delete(sessionId);
        });
        pendingSessionCreations.set(sessionId, creationPromise);
        return creationPromise;
    };

    let session: SessionData;

    if (isInitialize) {
        const newSessionId = randomUUID();
        session = await createSession(newSessionId);
    } else {
        const requestedSessionId = sessionIdHeader?.trim() || randomUUID();
        session = sessions.get(requestedSessionId)!;
        if (!session) {
            sessionLogger.warning('recovered.missing_session', {
                requestedSessionId: sessionIdHeader ?? null,
                rpcMethod: jsonRpcMessage.method ?? null,
                rpcId: jsonRpcMessage.id ?? null,
            });
            session = await getOrCreateSession(requestedSessionId);
        }
        session.lastActivity = Date.now();
        sessionLogger.debug('reused', { sessionId: session.sessionId });
    }

    // Always echo effective session id so clients can recover from stale/missing state.
    c.header('Mcp-Session-Id', session.sessionId);

    const isNotification = jsonRpcMessage.id === undefined || jsonRpcMessage.id === null;
    const rpcToolName = jsonRpcMessage.method === 'tools/call'
        && jsonRpcMessage.params
        && typeof jsonRpcMessage.params === 'object'
        && 'name' in jsonRpcMessage.params
        && typeof (jsonRpcMessage.params as { name?: unknown }).name === 'string'
        ? String((jsonRpcMessage.params as { name: string }).name)
        : null;
    requestLogger.debug('incoming', {
        method: 'POST',
        route: '/mcp',
        sessionId: session.sessionId,
        rpcMethod: jsonRpcMessage.method ?? null,
        rpcToolName,
        rpcId: jsonRpcMessage.id ?? null,
        rpcType: isNotification ? 'notification' : 'request',
    });
    requestLogger.debug('incoming.params', {
        sessionId: session.sessionId,
        rpcMethod: jsonRpcMessage.method ?? null,
        rpcId: jsonRpcMessage.id ?? null,
        params: jsonRpcMessage.params ?? null,
    });

    // Handle notifications (no response expected)
    if (isNotification) {
        switch (jsonRpcMessage.method) {
            case 'notifications/initialized':
                session.initialized = true;
                requestLogger.info('notification.initialized', {
                    sessionId: session.sessionId,
                    rpcMethod: jsonRpcMessage.method,
                });
                break;
            case 'notifications/cancelled':
                requestLogger.info('notification.cancelled', {
                    sessionId: session.sessionId,
                    params: jsonRpcMessage.params ?? null,
                });
                break;
            default:
                requestLogger.debug('notification.unknown', {
                    sessionId: session.sessionId,
                    rpcMethod: jsonRpcMessage.method,
                });
        }
        requestLogger.debug('complete', {
            method: 'POST',
            route: '/mcp',
            sessionId: session.sessionId,
            rpcMethod: jsonRpcMessage.method ?? null,
            rpcToolName,
            rpcId: jsonRpcMessage.id ?? null,
            status: 202,
            elapsedMs: Date.now() - requestStartedAt,
        });
        
        return c.body(null, 202);
    }

    // Handle resources/subscribe and resources/unsubscribe before passing to transport
    // so we can track subscriptions for cross-session push notifications
    if (jsonRpcMessage.method === 'resources/subscribe') {
        const uri = jsonRpcMessage.params?.uri as string | undefined;
        if (uri) {
            session.subscriptions.add(uri);
            sessionLogger.info('subscription.created', {
                sessionId: session.sessionId,
                uri,
                totalSubscriptions: session.subscriptions.size,
            });
        }
        requestLogger.debug('complete', {
            method: 'POST',
            route: '/mcp',
            sessionId: session.sessionId,
            rpcMethod: jsonRpcMessage.method,
            rpcToolName,
            rpcId: jsonRpcMessage.id ?? null,
            status: 200,
            elapsedMs: Date.now() - requestStartedAt,
        });
        return c.json({ jsonrpc: '2.0', result: {}, id: jsonRpcMessage.id });
    }

    if (jsonRpcMessage.method === 'resources/unsubscribe') {
        const uri = jsonRpcMessage.params?.uri as string | undefined;
        if (uri) {
            session.subscriptions.delete(uri);
            sessionLogger.info('subscription.removed', {
                sessionId: session.sessionId,
                uri,
                totalSubscriptions: session.subscriptions.size,
            });
        }
        requestLogger.debug('complete', {
            method: 'POST',
            route: '/mcp',
            sessionId: session.sessionId,
            rpcMethod: jsonRpcMessage.method,
            rpcToolName,
            rpcId: jsonRpcMessage.id ?? null,
            status: 200,
            elapsedMs: Date.now() - requestStartedAt,
        });
        return c.json({ jsonrpc: '2.0', result: {}, id: jsonRpcMessage.id });
    }

    // Handle regular requests through transport
    transportLogger.debug('request.transport', {
        method: 'POST',
        route: '/mcp',
        sessionId: session.sessionId,
        rpcMethod: jsonRpcMessage.method ?? null,
        rpcId: jsonRpcMessage.id ?? null,
        elapsedMs: Date.now() - requestStartedAt,
    });
    const requestAuthContext = (c.get(AUTH_CONTEXT_KEY) as AuthContext | undefined) ?? null;
    const response = await authContextStore.run(
        requestAuthContext,
        () => session.transport.handleRequest(c),
    );
    requestLogger.debug('complete', {
        method: 'POST',
        route: '/mcp',
        sessionId: session.sessionId,
        rpcMethod: jsonRpcMessage.method ?? null,
        rpcToolName,
        rpcId: jsonRpcMessage.id ?? null,
        status: response!.status,
        elapsedMs: Date.now() - requestStartedAt,
    });
    return response;
});

// MCP endpoint - handles GET requests (SSE)
app.get('/mcp', async (c) => {
    const sessionId = c.req.header('mcp-session-id');

    if (!sessionId) {
        return c.text('Missing Mcp-Session-Id header', 400);
    }

    const session = sessions.get(sessionId);
    if (!session) {
        return c.text('Session not found', 404);
    }

    session.lastActivity = Date.now();

    // Use Hono's streamSSE for Server-Sent Events
    return streamSSE(c, async (stream) => {
        // Send initial connection message as a comment
        await stream.write(': connected\n\n');

        // Register this stream writer for push notifications
        const writer = async (data: string) => {
            try {
                await stream.write(data);
            } catch {
                // Stream may be closed; writer will be cleaned up on abort
            }
        };
        session.sseWriters.add(writer);

        // Keep connection alive with periodic pings
        const pingInterval = setInterval(async () => {
            try {
                await stream.write(': ping\n\n');
            } catch {
                clearInterval(pingInterval);
            }
        }, 30000);

        // Handle cleanup on disconnect
        stream.onAbort(() => {
            clearInterval(pingInterval);
            session.sseWriters.delete(writer);
            sseLogger.info('client.disconnected', { sessionId });
        });

        // Keep the stream open indefinitely
        // Use a loop with reasonable sleep intervals instead of MAX_SAFE_INTEGER
        let keepAlive = true;
        while (keepAlive) {
            try {
                await stream.sleep(86400000); // Sleep for 24 hours at a time
            } catch {
                // Stream was closed
                keepAlive = false;
            }
        }

        // Clean up writer when stream ends naturally
        session.sseWriters.delete(writer);
    });
});

// MCP endpoint - handles DELETE requests (session cleanup)
app.delete('/mcp', async (c) => {
    const sessionId = c.req.header('mcp-session-id');

    if (!sessionId) {
        return c.text('Missing Mcp-Session-Id header', 400);
    }

    const session = sessions.get(sessionId);
    if (!session) {
        return c.text('Session not found', 404);
    }

    // Remove session
    sessions.delete(sessionId);

    sessionLogger.info('terminated', { sessionId });

    return c.body(null, 200);
});

// ============================================================================
// Background Worker
// ============================================================================

let transcriptionWorker: TranscriptionWorker | null = null;
let transcriptionWorkerStartPromise: Promise<void> | null = null;

/**
 * Get the transcription worker instance (for MCP tools)
 */
export function getTranscriptionWorker(): TranscriptionWorker | null {
    return transcriptionWorker;
}

async function ensureTranscriptionWorkerStarted(): Promise<void> {
    if (transcriptionWorker?.isActive()) {
        return;
    }
    if (transcriptionWorkerStartPromise) {
        await transcriptionWorkerStartPromise;
        return;
    }

    transcriptionWorkerStartPromise = (async () => {
        const outputDir = ServerConfig.getOutputDirectory();
        const uploadDirectory = join(outputDir, 'uploads');
        const context = ServerConfig.getContext();
        const contextDirs = context?.getContextDirs?.();
        const explicitContextDirectories = Array.isArray(contextDirs) && contextDirs.length > 0
            ? contextDirs
            : startupContextDirectories;

        transcriptionWorker = new TranscriptionWorker({
            outputDirectory: outputDir,
            contextDirectory: process.cwd(),
            contextDirectories: explicitContextDirectories,
            contextInstance: context ?? undefined,
            uploadDirectory,
            outputStorage: ServerConfig.getOutputStorage(),
            scanInterval: 60_000,
            model: (startupConfig as any).model,
            transcriptionModel: (startupConfig as any).transcriptionModel,
        });

        await transcriptionWorker.start();
        setWorkerInstance(transcriptionWorker);
    })().finally(() => {
        transcriptionWorkerStartPromise = null;
    });

    await transcriptionWorkerStartPromise;
}

// ============================================================================
// Server Startup
// ============================================================================

async function main() {
    await configureEngineLoggingBridge();

    // ── CLI parsing ───────────────────────────────────────────────────────────
    const cardigantime = Cardigantime.create({
        defaults: {
            configDirectory: '.',
            configFile: DEFAULT_CONFIG_FILE,
            isRequired: false,
            pathResolution: {
                pathFields: ['inputDirectory', 'outputDirectory', 'processedDirectory', 'contextDirectories'],
                resolvePathArray: ['contextDirectories'],
            },
        },
        configShape: McpHttpConfigSchema.shape,
        features: ['config', 'hierarchical'],
        logger: createQuietLogger(),
    });

    const program = new Command();
    program
        .name('protokoll-mcp-http')
        .description('Protokoll MCP HTTP server (Hono)')
        .option('-p, --port <number>', 'HTTP port to listen on (env: MCP_PORT)', '3000')
        .option('--host <address>', 'Host address to bind to', '127.0.0.1')
        .option('--cwd <dir>', 'Set working directory before loading configuration')
        .option('--config <path>', 'Path to configuration file (env: PROTOKOLL_CONFIG)')
        .option('--input-directory <dir>', 'Input directory for audio files (env: PROTOKOLL_INPUT_DIRECTORY)')
        .option('--output-directory <dir>', 'Output directory for transcripts (env: PROTOKOLL_OUTPUT_DIRECTORY)')
        .option('--processed-directory <dir>', 'Processed directory for completed audio (env: PROTOKOLL_PROCESSED_DIRECTORY)')
        .option('--context-directories <dirs>', 'Comma-separated context directories (env: PROTOKOLL_CONTEXT_DIRECTORIES)', parseListOrAppend, [])
        .option('--model <model>', 'Enhancement model (env: PROTOKOLL_MODEL)')
        .option('--classify-model <model>', 'Classification model (env: PROTOKOLL_CLASSIFY_MODEL)')
        .option('--compose-model <model>', 'Composition model (env: PROTOKOLL_COMPOSE_MODEL)')
        .option('--transcription-model <model>', 'Transcription model (env: PROTOKOLL_TRANSCRIPTION_MODEL)')
        .option('--secured', 'Enable API-key + RBAC secured mode (env: PROTOKOLL_HTTP_SECURED)')
        .option('--rbac-users-path <path>', 'RBAC users file path (env: RBAC_USERS_PATH)')
        .option('--rbac-keys-path <path>', 'RBAC keys file path (env: RBAC_KEYS_PATH)')
        .option('--rbac-policy-path <path>', 'RBAC policy file path (env: RBAC_POLICY_PATH)')
        .option('--rbac-reload-seconds <seconds>', 'RBAC reload interval in seconds (env: RBAC_RELOAD_SECONDS)')
        .option('--debug', 'Enable debug mode (env: PROTOKOLL_DEBUG)')
        .option('--verbose', 'Enable verbose mode (env: PROTOKOLL_VERBOSE)');

    await cardigantime.configure(program); // adds -c/--config-directory
    program.parse();
    const args = program.opts();
    const securedFromCli = program.getOptionValueSource('secured') === 'cli'
        ? Boolean(args.secured)
        : undefined;
    const debugFromCli = program.getOptionValueSource('debug') === 'cli'
        ? Boolean(args.debug)
        : undefined;
    const verboseFromCli = program.getOptionValueSource('verbose') === 'cli'
        ? Boolean(args.verbose)
        : undefined;

    // Apply working directory before config loading
    if (args.cwd) {
        process.chdir(resolve(args.cwd as string));
    }

    // CardiganTime diagnostic/utility flags — run and exit without starting the server.
    // These need a verbose logger so their output is actually visible.
    if (args.checkConfig || args.initConfig) {
        cardigantime.setLogger({
            debug: (msg, ...a) => lifecycleLogger.debug('config.cli.debug', { message: msg, args: a }),
            info: (msg, ...a) => lifecycleLogger.info('config.cli.info', { message: msg, args: a }),
            warn: (msg, ...a) => lifecycleLogger.warning('config.cli.warn', { message: msg, args: a }),
            error: (msg, ...a) => lifecycleLogger.error('config.cli.error', { message: msg, args: a }),
            verbose: (msg, ...a) => lifecycleLogger.debug('config.cli.verbose', { message: msg, args: a }),
            silly: () => { /* intentionally empty */ },
        });
        if (args.checkConfig) {
            await cardigantime.checkConfig(args);
        } else {
            await cardigantime.generateConfig(args.configDirectory || '.');
        }
        process.exit(0);
    }

    // Handle explicit config path (sets env vars for downstream ServerConfig)
    if (args.config) {
        const configPath = resolve(args.config as string);
        process.env.PROTOKOLL_CONFIG = configPath;
        process.env.WORKSPACE_ROOT = dirname(configPath);
    }

    // Load config — CLI args merge with file values via CardiganTime
    let cardigantimeConfig = await cardigantime.read({
        ...args,
        inputDirectory: (args.inputDirectory as string | undefined) ?? process.env.PROTOKOLL_INPUT_DIRECTORY,
        outputDirectory: (args.outputDirectory as string | undefined) ?? process.env.PROTOKOLL_OUTPUT_DIRECTORY,
        processedDirectory: (args.processedDirectory as string | undefined) ?? process.env.PROTOKOLL_PROCESSED_DIRECTORY,
        contextDirectories: Array.isArray(args.contextDirectories) && args.contextDirectories.length > 0
            ? args.contextDirectories
            : process.env.PROTOKOLL_CONTEXT_DIRECTORIES
                ? parseCsvList(process.env.PROTOKOLL_CONTEXT_DIRECTORIES)
                : undefined,
        model: (args.model as string | undefined) ?? process.env.PROTOKOLL_MODEL,
        classifyModel: (args.classifyModel as string | undefined) ?? process.env.PROTOKOLL_CLASSIFY_MODEL,
        composeModel: (args.composeModel as string | undefined) ?? process.env.PROTOKOLL_COMPOSE_MODEL,
        transcriptionModel: (args.transcriptionModel as string | undefined) ?? process.env.PROTOKOLL_TRANSCRIPTION_MODEL,
        secured: securedFromCli ?? parseBooleanEnv(process.env.PROTOKOLL_HTTP_SECURED),
        rbacUsersPath: (args.rbacUsersPath as string | undefined) ?? process.env.RBAC_USERS_PATH,
        rbacKeysPath: (args.rbacKeysPath as string | undefined) ?? process.env.RBAC_KEYS_PATH,
        rbacPolicyPath: (args.rbacPolicyPath as string | undefined) ?? process.env.RBAC_POLICY_PATH,
        rbacReloadSeconds: (args.rbacReloadSeconds as string | undefined) ?? process.env.RBAC_RELOAD_SECONDS,
        debug: debugFromCli ?? parseBooleanEnv(process.env.PROTOKOLL_DEBUG),
        verbose: verboseFromCli ?? parseBooleanEnv(process.env.PROTOKOLL_VERBOSE),
        storage: buildEnvStorageConfig(),
    });
    cardigantimeConfig = await mergeStorageFromCanonicalConfig(
        cardigantimeConfig as Record<string, unknown>,
        args.config as string | undefined
    ) as typeof cardigantimeConfig;
    cardigantimeConfig = await injectLocalGcsCredentialsIfMissing(
        cardigantimeConfig as Record<string, unknown>
    ) as typeof cardigantimeConfig;
    exportStorageConfigToEnv(cardigantimeConfig as Record<string, unknown>);

    configureHttpLogLevel((cardigantimeConfig as any).debug === true);

    // Set WORKSPACE_ROOT from resolved config dirs (when no explicit --config)
    if (!args.config) {
        const resolvedConfigDirs = (cardigantimeConfig as any).resolvedConfigDirs as string[] | undefined;
        process.env.WORKSPACE_ROOT = resolvedConfigDirs?.[0] ?? process.env.WORKSPACE_ROOT ?? process.cwd();
    }

    // Cache for session init handler (avoids reloading config on every new session)
    startupConfig = cardigantimeConfig as Record<string, unknown>;
    const startupContextDirs = (cardigantimeConfig as any).contextDirectories;
    startupContextDirectories = Array.isArray(startupContextDirs) && startupContextDirs.length > 0
        ? startupContextDirs
        : undefined;

    await configureRbacIfSecured(startupConfig);

    // ── Port / host resolution ────────────────────────────────────────────────
    // Priority: --port CLI > MCP_PORT env > PROTOKOLL_MCP_PORT env > PORT env > default 3000
    function resolvePort(cliArg: string): { port: number; source: string } {
        const cliPort = Number.parseInt(cliArg, 10);
        // Commander default is '3000'; treat an explicitly different value as user-provided
        if (program.getOptionValueSource('port') === 'cli') {
            if (!Number.isNaN(cliPort) && cliPort > 0 && cliPort < 65536) {
                return { port: cliPort, source: '--port' };
            }
        }
        for (const [name, val] of [
            ['MCP_PORT', process.env.MCP_PORT],
            ['PROTOKOLL_MCP_PORT', process.env.PROTOKOLL_MCP_PORT],
            ['PORT', process.env.PORT],
        ] as [string, string | undefined][]) {
            if (val) {
                const p = Number.parseInt(val, 10);
                if (!Number.isNaN(p) && p > 0 && p < 65536) return { port: p, source: name };
            }
        }
        return { port: cliPort || 3000, source: 'default' };
    }

    const portConfig = resolvePort(args.port as string);
    const port = portConfig.port;
    const host = (args.host as string | undefined) || '127.0.0.1';
    const portSource = portConfig.source === 'default' ? '(default)' : `(from ${portConfig.source})`;

    // ── Emit startup config logs ──────────────────────────────────────────────
    const resolvedConfigDirsForBanner = (cardigantimeConfig as any).resolvedConfigDirs as string[] | undefined;
    const configRoot = resolvedConfigDirsForBanner?.[0] ?? process.env.WORKSPACE_ROOT ?? process.cwd();
    const configPathDisplay = resolve(configRoot, DEFAULT_CONFIG_FILE);

    const inputDir = (cardigantimeConfig as any).inputDirectory || 'NOT SET';
    const outputDir = (cardigantimeConfig as any).outputDirectory || 'NOT SET';
    const contextDirs = (cardigantimeConfig as any).contextDirectories;
    const contextDirsDisplay = Array.isArray(contextDirs) && contextDirs.length > 0
        ? contextDirs.join(', ')
        : 'NOT SET';
    
    lifecycleLogger.info('startup', {
        serverName: 'protokoll-mcp-http',
        transport: 'hono',
        serverUrl: `http://${host}:${port}`,
        healthEndpoint: `http://${host}:${port}/health`,
        mcpEndpoint: `http://${host}:${port}/mcp`,
        portSource,
        workingDirectory: process.cwd(),
        configFile: configPathDisplay,
        inputDirectory: inputDir,
        outputDirectory: outputDir,
        contextDirectories: contextDirsDisplay,
        model: (cardigantimeConfig as any).model || 'default',
        transcriptionModel: (cardigantimeConfig as any).transcriptionModel || 'default',
        debugMode: (cardigantimeConfig as any).debug ? 'ON' : 'OFF',
        verboseMode: (cardigantimeConfig as any).verbose ? 'ON' : 'OFF',
        securedMode: Boolean((cardigantimeConfig as any).secured),
        rbacUsersPath: (cardigantimeConfig as any).rbacUsersPath || null,
        rbacKeysPath: (cardigantimeConfig as any).rbacKeysPath || null,
        rbacPolicyPath: (cardigantimeConfig as any).rbacPolicyPath || null,
        rbacReloadSeconds: (cardigantimeConfig as any).rbacReloadSeconds || null,
    });
    lifecycleLogger.debug('startup.storage', {
        lines: describeRawStorageConfig(cardigantimeConfig as Record<string, unknown>),
    });

    // Worker starts lazily once ServerConfig is initialized for the first session.

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        lifecycleLogger.info('shutdown.signal_received', { signal: 'SIGTERM' });
        if (rbacReloadTimer) clearInterval(rbacReloadTimer);
        if (transcriptionWorker) {
            await transcriptionWorker.stop();
        }
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        lifecycleLogger.info('shutdown.signal_received', { signal: 'SIGINT' });
        if (rbacReloadTimer) clearInterval(rbacReloadTimer);
        if (transcriptionWorker) {
            await transcriptionWorker.stop();
        }
        process.exit(0);
    });

    serve({
        fetch: app.fetch,
        port,
        hostname: host,
    });
}

main().catch((error) => {
    lifecycleLogger.error('startup.failed', {
        error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
});

export function __setSecurityForTests(options: { secured: boolean; authorizer: RbacAuthorizer | null }): void {
    rbacSecuredMode = options.secured;
    rbacAuthorizer = options.authorizer;
}

// Export for testing
export { app, sessions };
