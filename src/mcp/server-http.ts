#!/usr/bin/env node
/**
 * Protokoll MCP Server - HTTP Transport
 *
 * Runs the Protokoll MCP server with Streamable HTTP transport on a configurable port.
 * This allows clients like the OSX app to connect via HTTP instead of stdio.
 *
 * Configuration:
 * - MCP_PORT: Port to listen on (default: 3000)
 * - WORKSPACE_ROOT: Directory containing protokoll.yaml config (default: cwd)
 * - PROTOKOLL_CONFIG: Path to protokoll.yaml (overrides WORKSPACE_ROOT discovery)
 *
 * Security:
 * - Binds to localhost only (127.0.0.1) by default
 * - No authentication (local development only)
 * - Origin validation disabled (can be added later)
 *
 * Usage:
 *   node dist/mcp/server-http.js
 *   MCP_PORT=3001 node dist/mcp/server-http.js
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
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
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import * as Cardigantime from '@utilarium/cardigantime';
import * as Resources from './resources';
import * as Prompts from './prompts';
import { tools, handleToolCall } from './tools';
import * as ServerConfig from './serverConfig';
import * as Roots from './roots';
import type { McpRoot } from './types';
import { ConfigSchema } from '../protokoll';
import { DEFAULT_CONFIG_DIR } from '../constants';

// ============================================================================
// Configuration
// ============================================================================

const MCP_PORT = process.env.MCP_PORT ? Number.parseInt(process.env.MCP_PORT, 10) : 3000;
const HOST = '127.0.0.1'; // Localhost only for security

// Initialize CardiganTime for configuration loading
const cardigantime = Cardigantime.create({
    defaults: {
        configDirectory: DEFAULT_CONFIG_DIR,
    },
    configShape: ConfigSchema.shape,
});

/**
 * Load configuration using CardiganTime
 * This respects environment variables and hierarchical config files
 */
async function loadCardigantimeConfig() {
    // Create minimal args object for CardiganTime
    // It will use CWD and environment variables
    const args = {
        configDirectory: process.env.PROTOKOLL_CONFIG_DIR || DEFAULT_CONFIG_DIR,
    };
    
    // Read configuration from files and environment
    const config = await cardigantime.read(args);
    
    return config;
}

// ============================================================================
// Session Management
// ============================================================================

interface SessionData {
    sessionId: string;
    server: Server;
    sseClients: Set<ServerResponse>;
    initialized: boolean;
    lastActivity: number;
}

const sessions = new Map<string, SessionData>();

// Clean up inactive sessions after 1 hour
const SESSION_TIMEOUT = 60 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.lastActivity > SESSION_TIMEOUT) {
            // eslint-disable-next-line no-console
            console.log(`Cleaning up inactive session: ${sessionId}`);
            // Close all SSE connections
            for (const client of session.sseClients) {
                client.end();
            }
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
                'Edit and combine existing transcripts.',
        },
        {
            capabilities: {
                tools: {},
                resources: {
                    subscribe: false,
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
// HTTP Request Handling
// ============================================================================

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
    // Set CORS headers (local development only)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, Mcp-Protocol-Version');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // Health check endpoint
    if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', sessions: sessions.size }));
        return;
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
        if (req.method === 'POST') {
            await handlePost(req, res);
        } else if (req.method === 'GET') {
            await handleGet(req, res);
        } else if (req.method === 'DELETE') {
            await handleDelete(req, res);
        } else {
            res.writeHead(405);
            res.end('Method Not Allowed');
        }
        return;
    }

    // Not found
    res.writeHead(404);
    res.end('Not Found');
}

async function handlePost(req: IncomingMessage, res: ServerResponse) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Read request body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks).toString('utf-8');
    
    let jsonRpcMessage;
    try {
        jsonRpcMessage = JSON.parse(body);
    } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error' },
            id: null,
        }));
        return;
    }

    // Check if this is an initialize request
    const isInitialize = jsonRpcMessage.method === 'initialize';

    if (!sessionId && !isInitialize) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Missing Mcp-Session-Id header' },
            id: jsonRpcMessage.id || null,
        }));
        return;
    }

    let session: SessionData;

    if (isInitialize) {
        // Create new session
        const newSessionId = randomUUID();
        const server = createMcpServer();
        
        session = {
            sessionId: newSessionId,
            server,
            sseClients: new Set(),
            initialized: false,
            lastActivity: Date.now(),
        };
        
        sessions.set(newSessionId, session);
        
        // Initialize configuration using CardiganTime
        // This will:
        // 1. Use CWD as starting point
        // 2. Walk up directory tree to find .protokoll/ directories
        // 3. Merge configs hierarchically (like CLI does)
        // 4. Respect environment variables (PROTOKOLL_*)
        const cardigantimeConfig = await loadCardigantimeConfig();
        
        const workspaceRoot = process.cwd();
        const initialRoots: McpRoot[] = [{
            uri: `file://${workspaceRoot}`,
            name: 'Workspace',
        }];
        
        Roots.setRoots(initialRoots);
        await ServerConfig.initializeServerConfig(initialRoots);
        
        // Get the full initialized config from ServerConfig
        const serverConfig = ServerConfig.getServerConfig();
        const context = ServerConfig.getContext();
        const contextConfig = context?.getConfig();
        
        // Extract context directories if available
        const contextDirs = contextConfig?.contextDirectories;
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
        console.log(`Config Directory: ${cardigantimeConfig.configDirectory || DEFAULT_CONFIG_DIR}`);
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
        console.log(`🤖 AI Model:          ${cardigantimeConfig.model || 'default'}`);
        // eslint-disable-next-line no-console
        console.log(`🎤 Transcribe Model:  ${cardigantimeConfig.transcriptionModel || 'default'}`);
        // eslint-disable-next-line no-console
        console.log(`🐛 Debug Mode:        ${cardigantimeConfig.debug ? 'ON' : 'OFF'}`);
        // eslint-disable-next-line no-console
        console.log(`📢 Verbose Mode:      ${cardigantimeConfig.verbose ? 'ON' : 'OFF'}`);
        // eslint-disable-next-line no-console
        console.log('=================================================================\n');
        
        // Return session ID in header
        res.setHeader('Mcp-Session-Id', newSessionId);
    } else {
        // Use existing session
        session = sessions.get(sessionId!)!;
        if (!session) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Session not found' },
                id: jsonRpcMessage.id || null,
            }));
            return;
        }
        session.lastActivity = Date.now();
    }

    // Route the JSON-RPC message
    // Since we're not using a real transport, we handle requests directly
    try {
        const { method, params, id } = jsonRpcMessage;
        
        // Check if this is a notification (no id field)
        const isNotification = id === undefined || id === null;
        
        // Log all incoming requests
        // eslint-disable-next-line no-console
        console.log('\n─────────────────────────────────────────────────────────────────');
        // eslint-disable-next-line no-console
        console.log(`📨 Incoming ${isNotification ? 'NOTIFICATION' : 'REQUEST'}`);
        // eslint-disable-next-line no-console
        console.log('─────────────────────────────────────────────────────────────────');
        // eslint-disable-next-line no-console
        console.log(`Method:     ${method}`);
        // eslint-disable-next-line no-console
        console.log(`ID:         ${id !== undefined ? id : '(none - notification)'}`);
        // eslint-disable-next-line no-console
        console.log(`Session:    ${sessionId || '(new session)'}`);
        if (params && Object.keys(params).length > 0) {
            // eslint-disable-next-line no-console
            console.log(`Parameters:`);
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(params, null, 2));
        } else {
            // eslint-disable-next-line no-console
            console.log(`Parameters: (none)`);
        }
        // eslint-disable-next-line no-console
        console.log('─────────────────────────────────────────────────────────────────');
        
        // Handle notifications (no response expected)
        if (isNotification) {
            switch (method) {
                case 'notifications/initialized':
                    // Client has finished initialization - acknowledge but don't respond
                    session.initialized = true;
                    // eslint-disable-next-line no-console
                    console.log('✅ Client initialized');
                    break;
                case 'notifications/cancelled':
                    // Client cancelled a request - log but don't respond
                    // eslint-disable-next-line no-console
                    console.log('⚠️  Client cancelled request:', params);
                    break;
                default:
                    // Unknown notification - log but don't fail
                    // eslint-disable-next-line no-console
                    console.log('⚠️  Unknown notification:', method);
            }
            
            // eslint-disable-next-line no-console
            console.log('📤 Response: 202 Accepted (notification)');
            // eslint-disable-next-line no-console
            console.log('─────────────────────────────────────────────────────────────────\n');
            
            // Notifications get 202 Accepted with no body
            res.writeHead(202);
            res.end();
            return;
        }
        
        let result;
        
        // Route to appropriate handler based on method
        switch (method) {
            case 'initialize': {
                result = {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                        tools: {},
                        resources: { subscribe: false, listChanged: true },
                        prompts: { listChanged: false },
                    },
                    serverInfo: {
                        name: 'protokoll',
                        version: '0.1.0',
                    },
                };
                break;
            }
            
            case 'tools/list': {
                // Return the tools directly - they're already defined
                result = { tools };
                break;
            }
            
            case 'tools/call': {
                // Call the tool handler directly
                const toolResult = await handleToolCall(params.name, params.arguments || {});
                result = {
                    content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
                };
                break;
            }
            
            case 'resources/list': {
                // Call the resources handler directly
                result = await Resources.handleListResources();
                break;
            }
            
            case 'resources/read': {
                // Call the read resource handler directly
                const contents = await Resources.handleReadResource(params.uri);
                result = { contents: [contents] };
                break;
            }
            
            case 'resources/subscribe': {
                // Resource subscriptions not supported
                // Return success but don't actually subscribe (no-op)
                // This prevents Cursor from showing errors
                result = {};
                break;
            }
            
            case 'resources/unsubscribe': {
                // Resource subscriptions not supported
                // Return success but don't actually unsubscribe (no-op)
                result = {};
                break;
            }
            
            case 'prompts/list': {
                // Return the prompts directly
                result = { prompts: Prompts.getPrompts() };
                break;
            }
            
            case 'prompts/get': {
                // Get the prompt directly
                const messages = await Prompts.getPrompt(params.name, params.arguments || {});
                result = { messages };
                break;
            }
            
            case 'roots/list': {
                // Return the cached roots
                const roots = Roots.getCachedRoots() || [];
                result = { roots };
                break;
            }
            
            default:
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32601, message: `Method not found: ${method}` },
                    id,
                }));
                return;
        }
        
        // Log successful response
        // eslint-disable-next-line no-console
        console.log(`✅ Response (${method}):`);
        if (result && typeof result === 'object') {
            // Log summary of result
            const resultKeys = Object.keys(result);
            if (resultKeys.length > 0) {
                // eslint-disable-next-line no-console
                console.log(`   Keys: ${resultKeys.join(', ')}`);
                // For list methods, show counts (use type guards)
                if ('tools' in result && Array.isArray(result.tools)) {
                    // eslint-disable-next-line no-console
                    console.log(`   Tools: ${result.tools.length}`);
                }
                if ('resources' in result && Array.isArray(result.resources)) {
                    // eslint-disable-next-line no-console
                    console.log(`   Resources: ${result.resources.length}`);
                }
                if ('prompts' in result && Array.isArray(result.prompts)) {
                    // eslint-disable-next-line no-console
                    console.log(`   Prompts: ${result.prompts.length}`);
                }
                if ('roots' in result && Array.isArray(result.roots)) {
                    // eslint-disable-next-line no-console
                    console.log(`   Roots: ${result.roots.length}`);
                }
                if ('content' in result && Array.isArray(result.content)) {
                    // eslint-disable-next-line no-console
                    console.log(`   Content items: ${result.content.length}`);
                }
                if ('messages' in result && Array.isArray(result.messages)) {
                    // eslint-disable-next-line no-console
                    console.log(`   Messages: ${result.messages.length}`);
                }
            } else {
                // eslint-disable-next-line no-console
                console.log(`   (empty result)`);
            }
        }
        // eslint-disable-next-line no-console
        console.log('─────────────────────────────────────────────────────────────────\n');
        
        // Send successful response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            jsonrpc: '2.0',
            result,
            id,
        }));
        
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('\n❌ ERROR handling request:');
        // eslint-disable-next-line no-console
        console.error(error);
        // eslint-disable-next-line no-console
        console.error('─────────────────────────────────────────────────────────────────\n');
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: `Internal error: ${errorMessage}` },
            id: jsonRpcMessage.id || null,
        }));
    }
}

async function handleGet(req: IncomingMessage, res: ServerResponse) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
        res.writeHead(400);
        res.end('Missing Mcp-Session-Id header');
        return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
        res.writeHead(404);
        res.end('Session not found');
        return;
    }

    session.lastActivity = Date.now();

    // Set up SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    // Add client to session
    session.sseClients.add(res);

    // Handle client disconnect
    req.on('close', () => {
        session.sseClients.delete(res);
        // eslint-disable-next-line no-console
        console.log(`SSE client disconnected from session ${sessionId}`);
    });

    // Send initial comment to establish connection
    res.write(': connected\n\n');

    // Keep connection alive with periodic pings
    const pingInterval = setInterval(() => {
        res.write(': ping\n\n');
    }, 30000);

    req.on('close', () => {
        clearInterval(pingInterval);
    });
}

async function handleDelete(req: IncomingMessage, res: ServerResponse) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
        res.writeHead(400);
        res.end('Missing Mcp-Session-Id header');
        return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
        res.writeHead(404);
        res.end('Session not found');
        return;
    }

    // Close all SSE connections
    for (const client of session.sseClients) {
        client.end();
    }

    // Remove session
    sessions.delete(sessionId);

    // eslint-disable-next-line no-console
    console.log(`Session terminated: ${sessionId}`);

    res.writeHead(200);
    res.end();
}

// ============================================================================
// Server Startup
// ============================================================================

async function main() {
    const server = createServer(handleRequest);

    server.listen(MCP_PORT, HOST, () => {
        // eslint-disable-next-line no-console
        console.log('\n=================================================================');
        // eslint-disable-next-line no-console
        console.log('PROTOKOLL MCP HTTP SERVER');
        // eslint-disable-next-line no-console
        console.log('=================================================================');
        // eslint-disable-next-line no-console
        console.log(`🌐 Server URL:        http://${HOST}:${MCP_PORT}`);
        // eslint-disable-next-line no-console
        console.log(`💚 Health Check:      http://${HOST}:${MCP_PORT}/health`);
        // eslint-disable-next-line no-console
        console.log(`🔌 MCP Endpoint:      http://${HOST}:${MCP_PORT}/mcp`);
        // eslint-disable-next-line no-console
        console.log(`📁 Working Directory: ${process.cwd()}`);
        // eslint-disable-next-line no-console
        console.log(`⚙️  Config Discovery:  Will look for .protokoll/ in CWD and parent dirs`);
        // eslint-disable-next-line no-console
        console.log(`🔧 Config via:        CardiganTime (files + environment variables)`);
        // eslint-disable-next-line no-console
        console.log('=================================================================');
        // eslint-disable-next-line no-console
        console.log('Waiting for client connections...\n');
    });

    // Handle shutdown
    process.on('SIGINT', () => {
        // eslint-disable-next-line no-console
        console.log('\nShutting down server...');
        
        // Close all sessions
        for (const [sessionId, session] of sessions.entries()) {
            for (const client of session.sseClients) {
                client.end();
            }
            sessions.delete(sessionId);
        }
        
        server.close(() => {
            // eslint-disable-next-line no-console
            console.log('Server shutdown complete');
            process.exit(0);
        });
    });
}

// ES module equivalent of CommonJS `require.main === module`
const isMainModule = import.meta.url.startsWith('file:') &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
    main().catch((error) => {
        // eslint-disable-next-line no-console
        console.error(error);
        process.exit(1);
    });
}

export { main };
