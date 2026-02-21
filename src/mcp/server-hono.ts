#!/usr/bin/env node
/**
 * Protokoll MCP Server - Hono HTTP Transport
 *
 * Runs the Protokoll MCP server with Hono framework and Streamable HTTP transport.
 *
 * Configuration (in priority order):
 * - CLI flags:  --port, --host, --cwd, -c/--config, --config-directory
 * - Env vars:   MCP_PORT, PROTOKOLL_MCP_PORT, PORT, WORKSPACE_ROOT, PROTOKOLL_CONFIG
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
// eslint-disable-next-line no-restricted-imports
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import { join, extname, basename, dirname } from 'node:path';
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
import * as Resources from './resources';
import * as Prompts from './prompts';
import { tools, handleToolCall } from './tools';
import * as ServerConfig from './serverConfig';
import * as Roots from './roots';
import type { McpRoot } from './types';
import { DEFAULT_CONFIG_FILE, createQuietLogger } from './configDiscovery';
import { TranscriptionWorker } from './worker/transcription-worker';
import { setWorkerInstance } from './tools/queueTools';
import { Transcript as TranscriptOps } from '@redaksjon/protokoll-engine';
import { PklTranscript } from '@redaksjon/protokoll-format';
import { glob } from 'glob';

const { createUploadTranscript, findTranscriptByUuid } = TranscriptOps;

// ============================================================================
// Configuration (resolved at startup — see main())
// ============================================================================

/** Cached config loaded in main() — available to the session init handler. */
let startupConfig: Record<string, unknown> = {};

// Audio upload constants
const DEFAULT_MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
const DEFAULT_AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'webm', 'mp4', 'aac', 'ogg', 'flac'];

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

    // eslint-disable-next-line no-console
    console.log(`🔔 Entity change notification sent for ${entityUri} (${notified} writer(s) notified)`);
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
        // eslint-disable-next-line no-console
        console.warn(`sendEntityChangeNotifications: error for ${toolName}:`, err);
    }
}

// Clean up inactive sessions after 1 hour
const SESSION_TIMEOUT = 60 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.lastActivity > SESSION_TIMEOUT) {
            // eslint-disable-next-line no-console
            console.log(`Cleaning up inactive session: ${sessionId}`);
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

        try {
            const result = await handleToolCall(name, args);

            // Send push notifications to sessions subscribed to affected entity resources
            sendEntityChangeNotifications(name, args).catch((err) => {
                // eslint-disable-next-line no-console
                console.error('Failed to send entity change notifications:', err);
            });

            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Error: ${message}` }],
                isError: true,
            };
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
            const uploadDir = join(outputDir, 'uploads');
            
            // Ensure upload directory exists
            await fs.mkdir(uploadDir, { recursive: true });
            
            // Calculate file hash
            const buffer = await file.arrayBuffer();
            const hash = createHash('sha256').update(Buffer.from(buffer)).digest('hex');
            
            // Save uploaded file with hash-based name
            const uploadedPath = join(uploadDir, `${hash}.${ext}`);
            await fs.writeFile(uploadedPath, Buffer.from(buffer));
            
            // Extract optional title and project hints from form data
            const rawTitle = body['title'];
            const rawProject = body['project'];
            const title = (typeof rawTitle === 'string' && rawTitle.trim()) ? rawTitle.trim() : undefined;
            const project = (typeof rawProject === 'string' && rawProject.trim()) ? rawProject.trim() : undefined;
            
            // Create transcript PKL with uploaded status
            const { uuid } = await createUploadTranscript({
                audioFile: basename(uploadedPath), // Store just the filename
                originalFilename: file.name,
                audioHash: hash,
                outputDirectory: outputDir,
                title,
                project,
            });
            
            // eslint-disable-next-line no-console
            console.log(`\n📤 Audio uploaded: ${file.name} → ${uuid}`);
            
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
            // eslint-disable-next-line no-console
            console.error('Upload error:', error);
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
        const uploadDir = join(outputDir, 'uploads');
        
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
        const audioFiles = await glob(`${metadata.audioHash}.*`, { cwd: uploadDir, absolute: true });
        if (audioFiles.length === 0) {
            return c.json({ error: 'Audio file not found in uploads directory' }, 404);
        }
        
        const audioFile = audioFiles[0];
        const ext = extname(audioFile);
        const stat = await fs.stat(audioFile);
        
        // Set appropriate headers
        c.header('Content-Type', getAudioMimeType(ext));
        c.header('Content-Length', stat.size.toString());
        c.header('Content-Disposition', `attachment; filename="${metadata.audioFile || `${uuid}${ext}`}"`);
        
        // Stream file
        const stream = createReadStream(audioFile);
        return c.body(stream as any);
        
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Download error:', error);
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
    const sessionIdHeader = c.req.header('mcp-session-id');
    
    // Read request body
    const body = await c.req.text();
    
    let jsonRpcMessage;
    try {
        jsonRpcMessage = JSON.parse(body);
    } catch {
        return c.json({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error' },
            id: null,
        }, 400);
    }

    // Check if this is an initialize request
    const isInitialize = jsonRpcMessage.method === 'initialize';

    if (!sessionIdHeader && !isInitialize) {
        return c.json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Missing Mcp-Session-Id header' },
            id: jsonRpcMessage.id || null,
        }, 400);
    }

    let session: SessionData;

    if (isInitialize) {
        // Create new session
        const newSessionId = randomUUID();
        const server = createMcpServer();
        const transport = new StreamableHTTPTransport();
        
        session = {
            sessionId: newSessionId,
            server,
            transport,
            initialized: false,
            lastActivity: Date.now(),
            subscriptions: new Set(),
            sseWriters: new Set(),
        };
        
        sessions.set(newSessionId, session);
        
        // Use the config loaded once at startup
        const cardigantimeConfig = startupConfig;

        const resolvedConfigDirs = (cardigantimeConfig as any).resolvedConfigDirs as unknown;
        const configRoot = Array.isArray(resolvedConfigDirs) && resolvedConfigDirs.length > 0
            ? resolvedConfigDirs[0]
            : (process.env.WORKSPACE_ROOT || process.cwd());
        const configPathDisplay = resolve(configRoot, DEFAULT_CONFIG_FILE);
        
        const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
        const initialRoots: McpRoot[] = [{
            uri: `file://${workspaceRoot}`,
            name: 'Workspace',
        }];
        
        Roots.setRoots(initialRoots);
        await ServerConfig.initializeServerConfig(initialRoots, 'remote');
        
        // Get the full initialized config from ServerConfig
        const serverConfig = ServerConfig.getServerConfig();
        const context = ServerConfig.getContext();
        // Use getContextDirs() (actual loaded dirs) or fall back to configFile.contextDirectories
        const contextDirs = context?.getContextDirs?.() ?? (serverConfig.configFile as { contextDirectories?: string[] })?.contextDirectories;
        const contextDirsDisplay = Array.isArray(contextDirs) && contextDirs.length > 0 
            ? contextDirs.join(', ') 
            : 'NONE';
        
        // Print configuration summary
        // eslint-disable-next-line no-console
        console.log('\n=================================================================');
        // eslint-disable-next-line no-console
        console.log('SESSION CREATED');
        // eslint-disable-next-line no-console
        console.log('=================================================================');
        // eslint-disable-next-line no-console
        console.log(`Session ID: ${newSessionId}`);
        // eslint-disable-next-line no-console
        console.log(`Working Directory: ${workspaceRoot}`);
        // eslint-disable-next-line no-console
        console.log(`Config File:       ${configPathDisplay}`);
        // eslint-disable-next-line no-console
        console.log('\nCONFIGURATION LOADED:');
        // eslint-disable-next-line no-console
        console.log('-----------------------------------------------------------------');
        // eslint-disable-next-line no-console
        console.log(`📥 Input (Audio):     ${serverConfig.inputDirectory || 'NOT SET'}`);
        // eslint-disable-next-line no-console
        console.log(`📤 Output (Notes):    ${serverConfig.outputDirectory || 'NOT SET'}`);
        // eslint-disable-next-line no-console
        console.log(`✅ Processed (Done):  ${serverConfig.processedDirectory || 'NOT SET'}`);
        // eslint-disable-next-line no-console
        console.log(`📚 Context Dirs:      ${contextDirsDisplay}`);
        // eslint-disable-next-line no-console
        console.log(`🤖 AI Model:          ${(cardigantimeConfig as any).model || 'default'}`);
        // eslint-disable-next-line no-console
        console.log(`🎤 Transcribe Model:  ${(cardigantimeConfig as any).transcriptionModel || 'default'}`);
        // eslint-disable-next-line no-console
        console.log(`🐛 Debug Mode:        ${(cardigantimeConfig as any).debug ? 'ON' : 'OFF'}`);
        // eslint-disable-next-line no-console
        console.log(`📢 Verbose Mode:      ${(cardigantimeConfig as any).verbose ? 'ON' : 'OFF'}`);
        // eslint-disable-next-line no-console
        console.log('=================================================================\n');
        
        // Set session ID in response header
        c.header('Mcp-Session-Id', newSessionId);
        
        // Connect server to transport
        await session.server.connect(transport);
    } else {
        // Use existing session
        session = sessions.get(sessionIdHeader!)!;
        if (!session) {
            return c.json({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Session not found' },
                id: jsonRpcMessage.id || null,
            }, 404);
        }
        session.lastActivity = Date.now();
    }

    // Log incoming request
    const isNotification = jsonRpcMessage.id === undefined || jsonRpcMessage.id === null;
    // eslint-disable-next-line no-console
    console.log('\n─────────────────────────────────────────────────────────────────');
    // eslint-disable-next-line no-console
    console.log(`📨 Incoming ${isNotification ? 'NOTIFICATION' : 'REQUEST'}`);
    // eslint-disable-next-line no-console
    console.log('─────────────────────────────────────────────────────────────────');
    // eslint-disable-next-line no-console
    console.log(`Method:     ${jsonRpcMessage.method}`);
    // eslint-disable-next-line no-console
    console.log(`ID:         ${jsonRpcMessage.id !== undefined ? jsonRpcMessage.id : '(none - notification)'}`);
    // eslint-disable-next-line no-console
    console.log(`Session:    ${sessionIdHeader || '(new session)'}`);
    if (jsonRpcMessage.params && Object.keys(jsonRpcMessage.params).length > 0) {
        // eslint-disable-next-line no-console
        console.log(`Parameters:`);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(jsonRpcMessage.params, null, 2));
    } else {
        // eslint-disable-next-line no-console
        console.log(`Parameters: (none)`);
    }
    // eslint-disable-next-line no-console
    console.log('─────────────────────────────────────────────────────────────────');

    // Handle notifications (no response expected)
    if (isNotification) {
        switch (jsonRpcMessage.method) {
            case 'notifications/initialized':
                session.initialized = true;
                // eslint-disable-next-line no-console
                console.log('✅ Client initialized');
                break;
            case 'notifications/cancelled':
                // eslint-disable-next-line no-console
                console.log('⚠️  Client cancelled request:', jsonRpcMessage.params);
                break;
            default:
                // eslint-disable-next-line no-console
                console.log('⚠️  Unknown notification:', jsonRpcMessage.method);
        }
        
        // eslint-disable-next-line no-console
        console.log('📤 Response: 202 Accepted (notification)');
        // eslint-disable-next-line no-console
        console.log('─────────────────────────────────────────────────────────────────\n');
        
        return c.body(null, 202);
    }

    // Handle resources/subscribe and resources/unsubscribe before passing to transport
    // so we can track subscriptions for cross-session push notifications
    if (jsonRpcMessage.method === 'resources/subscribe') {
        const uri = jsonRpcMessage.params?.uri as string | undefined;
        if (uri) {
            session.subscriptions.add(uri);
            // eslint-disable-next-line no-console
            console.log(`\n📝 SUBSCRIPTION CREATED: ${uri} (session: ${session.sessionId})`);
            // eslint-disable-next-line no-console
            console.log(`   Total subscriptions for session: ${session.subscriptions.size}\n`);
        }
        return c.json({ jsonrpc: '2.0', result: {}, id: jsonRpcMessage.id });
    }

    if (jsonRpcMessage.method === 'resources/unsubscribe') {
        const uri = jsonRpcMessage.params?.uri as string | undefined;
        if (uri) {
            session.subscriptions.delete(uri);
            // eslint-disable-next-line no-console
            console.log(`\n📝 SUBSCRIPTION REMOVED: ${uri} (session: ${session.sessionId})`);
            // eslint-disable-next-line no-console
            console.log(`   Total subscriptions for session: ${session.subscriptions.size}\n`);
        }
        return c.json({ jsonrpc: '2.0', result: {}, id: jsonRpcMessage.id });
    }

    // Handle regular requests through transport
    return session.transport.handleRequest(c);
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
            // eslint-disable-next-line no-console
            console.log(`SSE client disconnected from session ${sessionId}`);
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

    // eslint-disable-next-line no-console
    console.log(`Session terminated: ${sessionId}`);

    return c.body(null, 200);
});

// ============================================================================
// Background Worker
// ============================================================================

let transcriptionWorker: TranscriptionWorker | null = null;

/**
 * Get the transcription worker instance (for MCP tools)
 */
export function getTranscriptionWorker(): TranscriptionWorker | null {
    return transcriptionWorker;
}

// ============================================================================
// Server Startup
// ============================================================================

async function main() {
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
        configShape: {},
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
        .option('--config <path>', 'Path to configuration file (env: PROTOKOLL_CONFIG)');

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
            // eslint-disable-next-line no-console
            debug: (msg, ...a) => console.log(`[debug] ${msg}`, ...a),
            // eslint-disable-next-line no-console
            info: (msg, ...a) => console.log(msg, ...a),
            // eslint-disable-next-line no-console
            warn: (msg, ...a) => console.warn(msg, ...a),
            // eslint-disable-next-line no-console
            error: (msg, ...a) => console.error(msg, ...a),
            // eslint-disable-next-line no-console
            verbose: (msg, ...a) => console.log(msg, ...a),
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
    const cardigantimeConfig = await cardigantime.read(args);

    // Set WORKSPACE_ROOT from resolved config dirs (when no explicit --config)
    if (!args.config) {
        const resolvedConfigDirs = (cardigantimeConfig as any).resolvedConfigDirs as string[] | undefined;
        process.env.WORKSPACE_ROOT = resolvedConfigDirs?.[0] ?? process.env.WORKSPACE_ROOT ?? process.cwd();
    }

    // Cache for session init handler (avoids reloading config on every new session)
    startupConfig = cardigantimeConfig as Record<string, unknown>;

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

    // ── Display startup banner ────────────────────────────────────────────────
    const resolvedConfigDirsForBanner = (cardigantimeConfig as any).resolvedConfigDirs as string[] | undefined;
    const configRoot = resolvedConfigDirsForBanner?.[0] ?? process.env.WORKSPACE_ROOT ?? process.cwd();
    const configPathDisplay = resolve(configRoot, DEFAULT_CONFIG_FILE);

    const inputDir = (cardigantimeConfig as any).inputDirectory || 'NOT SET';
    const outputDir = (cardigantimeConfig as any).outputDirectory || 'NOT SET';
    const contextDirs = (cardigantimeConfig as any).contextDirectories;
    const contextDirsDisplay = Array.isArray(contextDirs) && contextDirs.length > 0
        ? contextDirs.join(', ')
        : 'NOT SET';
    
    // eslint-disable-next-line no-console
    console.log('\n=================================================================');
    // eslint-disable-next-line no-console
    console.log('PROTOKOLL MCP HTTP SERVER (Hono)');
    // eslint-disable-next-line no-console
    console.log('=================================================================');
    // eslint-disable-next-line no-console
    console.log(`🌐 Server URL:        http://${host}:${port} ${portSource}`);
    // eslint-disable-next-line no-console
    console.log(`💚 Health Check:      http://${host}:${port}/health`);
    // eslint-disable-next-line no-console
    console.log(`🔌 MCP Endpoint:      http://${host}:${port}/mcp`);
    // eslint-disable-next-line no-console
    console.log(`📁 Working Directory: ${process.cwd()}`);
    // eslint-disable-next-line no-console
    console.log(`⚙️  Config File:       ${configPathDisplay}`);
    // eslint-disable-next-line no-console
    console.log('\nCONFIGURATION:');
    // eslint-disable-next-line no-console
    console.log('-----------------------------------------------------------------');
    // eslint-disable-next-line no-console
    console.log(`📥 Input (Audio):     ${inputDir}`);
    // eslint-disable-next-line no-console
    console.log(`📤 Output (Notes):    ${outputDir}`);
    // eslint-disable-next-line no-console
    console.log(`📚 Context Dirs:      ${contextDirsDisplay}`);
    // eslint-disable-next-line no-console
    console.log(`🤖 AI Model:          ${(cardigantimeConfig as any).model || 'default'}`);
    // eslint-disable-next-line no-console
    console.log(`🎤 Transcribe Model:  ${(cardigantimeConfig as any).transcriptionModel || 'default'}`);
    // eslint-disable-next-line no-console
    console.log(`🐛 Debug Mode:        ${(cardigantimeConfig as any).debug ? 'ON' : 'OFF'}`);
    // eslint-disable-next-line no-console
    console.log(`📢 Verbose Mode:      ${(cardigantimeConfig as any).verbose ? 'ON' : 'OFF'}`);
    // eslint-disable-next-line no-console
    console.log('=================================================================\n');

    // Start background transcription worker
    if (outputDir !== 'NOT SET') {
        const uploadDirectory = join(outputDir, 'uploads');
        
        transcriptionWorker = new TranscriptionWorker({
            outputDirectory: outputDir,
            contextDirectory: process.cwd(),
            // Pass the resolved contextDirectories from the config file so the pipeline
            // uses the same entity store as the rest of the server (not guessed from CWD).
            contextDirectories: Array.isArray(contextDirs) && contextDirs.length > 0
                ? contextDirs
                : undefined,
            uploadDirectory,
            scanInterval: 5000, // 5 second scan interval
            model: (cardigantimeConfig as any).model,
            transcriptionModel: (cardigantimeConfig as any).transcriptionModel,
        });
        
        await transcriptionWorker.start();
        
        // Make worker available to queue tools
        setWorkerInstance(transcriptionWorker);
    } else {
        // eslint-disable-next-line no-console
        console.log('⚠️  Output directory not configured - transcription worker disabled');
    }

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        // eslint-disable-next-line no-console
        console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
        if (transcriptionWorker) {
            await transcriptionWorker.stop();
        }
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        // eslint-disable-next-line no-console
        console.log('\n🛑 Received SIGINT, shutting down gracefully...');
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
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', error);
    process.exit(1);
});

// Export for testing
export { app, sessions };
