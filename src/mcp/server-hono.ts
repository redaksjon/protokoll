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
 * - No authentication (local development only)
 *
 * Usage:
 *   node dist/mcp/server-hono.js
 *   node dist/mcp/server-hono.js --port 3001
 *   node dist/mcp/server-hono.js --cwd /my/project -c /my/project/protokoll-config.yaml
 */

import 'dotenv/config';
import { randomUUID, createHash } from 'node:crypto';
import { Command } from 'commander';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { StreamableHTTPTransport } from '@hono/mcp';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { bodyLimit } from 'hono/body-limit';
import { join, extname, basename, dirname } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
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
import * as ServerConfig from './serverConfig';
import * as Roots from './roots';
import type { McpRoot } from './types';
import { DEFAULT_CONFIG_FILE, createQuietLogger } from './configDiscovery';
import { TranscriptionWorker } from './worker/transcription-worker';
import { setWorkerInstance } from './tools/queueTools';
import { configureEngineLoggingBridge } from './engineLogging';
import { markTranscriptIndexDirtyForStorage } from './resources/transcriptIndexService';
import { Transcript as TranscriptOps } from '@redaksjon/protokoll-engine';
import { PklTranscript } from '@redaksjon/protokoll-format';

const { createUploadTranscript, findTranscriptByUuid } = TranscriptOps;

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
});

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
        requestLogger.info('tool.call.start', {
            toolName: name,
            args: summarizeToolArgs(args),
        });

        try {
            const result = await handleToolCall(name, args);

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
        return Resources.handleListResources();
    });

    // Read a resource
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;

        try {
            const contents = await Resources.handleReadResource(uri);
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

const app = new Hono();

// CORS middleware for /mcp endpoint
app.use('/mcp', cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Accept', 'Mcp-Session-Id', 'Mcp-Protocol-Version', 'Last-Event-Id'],
    exposeHeaders: ['Mcp-Session-Id', 'Mcp-Protocol-Version'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
}));

// CORS middleware for audio endpoints
app.use('/audio/*', cors({
    origin: '*',
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
            
            // Save uploaded file with hash-based name
            const uploadObjectPath = `uploads/${hash}.${ext}`;
            await outputStorage.writeFile(uploadObjectPath, Buffer.from(buffer));
            
            // Extract optional title and project hints from form data
            const rawTitle = body['title'];
            const rawProject = body['project'];
            const title = (typeof rawTitle === 'string' && rawTitle.trim()) ? rawTitle.trim() : undefined;
            const project = (typeof rawProject === 'string' && rawProject.trim()) ? rawProject.trim() : undefined;

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
        const filePath = await findTranscriptByUuid(uuid, [outputDir]);
        if (!filePath) {
            return c.json({ error: `Transcript not found for UUID: ${uuid}` }, 404);
        }
        
        // Get metadata to find original audio file
        const transcript = PklTranscript.open(filePath, { readOnly: true });
        const metadata = transcript.metadata;
        await transcript.close();
        
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
        c.header('Content-Disposition', `attachment; filename="${metadata.audioFile || `${uuid}${ext}`}"`);
        
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
            session = await createSession(requestedSessionId);
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
    const response = await session.transport.handleRequest(c);
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
        .option('--debug', 'Enable debug mode (env: PROTOKOLL_DEBUG)')
        .option('--verbose', 'Enable verbose mode (env: PROTOKOLL_VERBOSE)');

    await cardigantime.configure(program); // adds -c/--config-directory
    program.parse();
    const args = program.opts();

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
    const cardigantimeConfig = await cardigantime.read({
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
        debug: (args.debug as boolean | undefined) ?? parseBooleanEnv(process.env.PROTOKOLL_DEBUG),
        verbose: (args.verbose as boolean | undefined) ?? parseBooleanEnv(process.env.PROTOKOLL_VERBOSE),
        storage: buildEnvStorageConfig(),
    });

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
    });
    lifecycleLogger.debug('startup.storage', {
        lines: describeRawStorageConfig(cardigantimeConfig as Record<string, unknown>),
    });

    // Worker starts lazily once ServerConfig is initialized for the first session.

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        lifecycleLogger.info('shutdown.signal_received', { signal: 'SIGTERM' });
        if (transcriptionWorker) {
            await transcriptionWorker.stop();
        }
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        lifecycleLogger.info('shutdown.signal_received', { signal: 'SIGINT' });
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

// Export for testing
export { app, sessions };
