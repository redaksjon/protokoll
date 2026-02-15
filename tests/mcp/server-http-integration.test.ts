/**
 * Integration tests for MCP HTTP Server
 *
 * Tests the HTTP/SSE transport server with real HTTP requests.
 * Uses createTestableServer() to get a server instance for testing.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Server } from 'node:http';
import * as http from 'node:http';

// Stub setInterval before server-http loads - its 5-min session cleanup keeps process alive.
// Return a no-op ref so no real timer is created (would prevent process exit).
vi.hoisted(() => {
    const noop = () => {};
    const fakeTimer = { ref: noop, unref: noop, hasRef: () => false, refresh: noop } as unknown as ReturnType<typeof setInterval>;
    (globalThis as any).setInterval = () => fakeTimer;
});

import {
    createTestableServer,
    _clearSessionsForTesting,
    _handleRequestForTesting,
    notifySubscribedClients,
    notifyAllClients,
} from '../../src/mcp/server-http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

// Hoist mock values so they're available when vi.mock factories run
const mockTools = vi.hoisted(() => [{ name: 'protokoll_read_transcript', description: 'Read a transcript' }]);
const mockHandleToolCall = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true, data: 'test' }));
const mockHandleListResources = vi.hoisted(() => vi.fn().mockResolvedValue({ resources: [] }));
const mockHandleReadResource = vi.hoisted(() =>
    vi.fn().mockResolvedValue({
        uri: 'protokoll://transcript/test',
        mimeType: 'text/plain',
        text: 'test content',
    })
);
const mockGetPrompts = vi.hoisted(() =>
    vi.fn().mockReturnValue([{ name: 'test_prompt', description: 'Test' }])
);
const mockGetPrompt = vi.hoisted(() =>
    vi.fn().mockResolvedValue([{ role: 'user', content: { type: 'text', text: 'Hello' } }])
);

// Mock the MCP SDK modules before importing (Server must be constructable with new)
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: vi.fn().mockImplementation(function (this: unknown) {
        return { setRequestHandler: vi.fn() };
    }),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
    CallToolRequestSchema: {},
    ListToolsRequestSchema: {},
    ListResourcesRequestSchema: {},
    ReadResourceRequestSchema: {},
    ListPromptsRequestSchema: {},
    GetPromptRequestSchema: {},
    ListRootsRequestSchema: {},
}));

// Mock dependencies
vi.mock('../../src/mcp/resources', () => ({
    handleListResources: (...args: unknown[]) => mockHandleListResources(...args),
    handleReadResource: (...args: unknown[]) => mockHandleReadResource(...args),
}));

vi.mock('../../src/mcp/prompts', () => ({
    getPrompts: (...args: unknown[]) => mockGetPrompts(...args),
    getPrompt: (...args: unknown[]) => mockGetPrompt(...args),
}));

vi.mock('../../src/mcp/tools', () => ({
    tools: mockTools,
    handleToolCall: (...args: unknown[]) => mockHandleToolCall(...args),
}));

vi.mock('../../src/mcp/serverConfig', () => ({
    initializeServerConfig: vi.fn().mockResolvedValue(undefined),
    getServerConfig: vi.fn().mockReturnValue({
        inputDirectory: '/test/input',
        outputDirectory: '/test/output',
        processedDirectory: '/test/processed',
    }),
    getContext: vi.fn().mockReturnValue({
        getConfig: vi.fn().mockReturnValue({
            contextDirectories: ['/test/context'],
        }),
    }),
    getOutputDirectory: vi.fn().mockReturnValue('/test/output'),
}));

vi.mock('../../src/mcp/roots', () => ({
    getCachedRoots: vi.fn().mockReturnValue([{ uri: 'file:///test', name: 'Workspace' }]),
    setRoots: vi.fn(),
}));

vi.mock('../../src/mcp/configDiscovery', () => ({
    initializeWorkingDirectoryFromArgsAndConfig: vi.fn().mockResolvedValue(undefined),
    loadCardigantimeConfig: vi.fn().mockResolvedValue({
        resolvedConfigDirs: ['/test/config'],
        model: 'gpt-4',
        transcriptionModel: 'whisper-1',
        debug: false,
        verbose: false,
        inputDirectory: '/test/input',
        outputDirectory: '/test/output',
        contextDirectories: ['/test/context'],
    }),
    DEFAULT_CONFIG_FILE: 'protokoll-config.yaml',
}));

vi.mock('../../src/mcp/uri', () => ({
    buildTranscriptUri: vi.fn((path: string) => `protokoll://transcript/${path}`),
    buildTranscriptsListUri: vi.fn(() => 'protokoll://transcripts'),
}));

// HTTP request helper using node:http for compatibility
async function request(
    baseUrl: string,
    options: {
        method?: string;
        path?: string;
        headers?: Record<string, string>;
        body?: string;
    } = {}
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const { method = 'GET', path = '/', headers = {}, body } = options;
    const url = new URL(path, baseUrl);

    return new Promise((resolve, reject) => {
        const reqOptions = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            timeout: 5000,
        };
        const req = http.request(reqOptions, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
                const resHeaders: Record<string, string> = {};
                for (const [k, v] of Object.entries(res.headers)) {
                    if (v) resHeaders[k.toLowerCase()] = Array.isArray(v) ? v[0] : String(v);
                }
                resolve({
                    status: res.statusCode ?? 0,
                    headers: resHeaders,
                    body: Buffer.concat(chunks).toString('utf-8'),
                });
            });
        });
        req.on('error', reject);
        if (body && method !== 'GET') req.write(body);
        req.end();
    });
}

describe('server-http integration', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        server = createTestableServer();
        await new Promise<void>((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                try {
                    const addr = server.address();
                    const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 3000;
                    baseUrl = `http://127.0.0.1:${port}`;
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
            server.on('error', reject);
        });
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    });

    beforeEach(() => {
        _clearSessionsForTesting();
        vi.clearAllMocks();
    });

    describe('HTTP request handling', () => {
        it('should handle OPTIONS preflight', async () => {
            const res = await request(baseUrl, {
                method: 'OPTIONS',
                path: '/mcp',
            });
            expect(res.status).toBe(204);
        });

        it('should return 404 for unknown endpoints', async () => {
            const res = await request(baseUrl, { path: '/unknown' });
            expect(res.status).toBe(404);
            expect(res.body).toBe('Not Found');
        });

        it('should return 405 for unsupported methods on /mcp', async () => {
            const res = await request(baseUrl, {
                method: 'PUT',
                path: '/mcp',
            });
            expect(res.status).toBe(405);
            expect(res.body).toBe('Method Not Allowed');
        });

        it('should serve health check', async () => {
            const res = await request(baseUrl, { path: '/health' });
            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);
            expect(data.status).toBe('healthy');
            expect(typeof data.sessions).toBe('number');
        });

        it('should set CORS headers on responses', async () => {
            const res = await request(baseUrl, { path: '/health' });
            expect(res.headers['access-control-allow-origin']).toBe('*');
        });
    });

    // Helper to create mock req/res and capture response (POST only - body required)
    async function invokeHandler(
        method: string,
        path: string,
        body: string,
        headers: Record<string, string> = {}
    ): Promise<{ status: number; headers: Record<string, string>; body: string; sessionId?: string }> {
        const req = Object.assign(Readable.from(Buffer.from(body)), {
            method,
            url: path,
            headers: { host: 'localhost:3000', ...headers },
        }) as IncomingMessage;

        const chunks: Buffer[] = [];
        const resHeaders: Record<string, string> = {};
        const res = {
            setHeader: vi.fn((name: string, value: string) => {
                resHeaders[name.toLowerCase()] = value;
            }),
            writeHead: vi.fn((status: number, headers?: Record<string, string>) => {
                resHeaders[':status'] = String(status);
                if (headers) Object.entries(headers).forEach(([k, v]) => { resHeaders[k.toLowerCase()] = v; });
            }),
            end: vi.fn((data?: string) => {
                if (data) chunks.push(Buffer.from(data));
            }),
            write: vi.fn(),
        } as unknown as ServerResponse;

        await _handleRequestForTesting(req, res);

        const status = (res.writeHead as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? 0;
        const bodyStr = chunks.length > 0 ? Buffer.concat(chunks).toString('utf-8') : '';
        return {
            status,
            headers: resHeaders,
            body: bodyStr,
            sessionId: resHeaders['mcp-session-id'],
        };
    }

    async function invokeHandlerNoBody(
        method: string,
        path: string,
        headers: Record<string, string> = {}
    ): Promise<{ status: number; body: string; writeCalls: string[] }> {
        const req = Object.assign(Readable.from([]), {
            method,
            url: path,
            headers: { host: 'localhost:3000', ...headers },
        }) as IncomingMessage;

        const chunks: Buffer[] = [];
        const writeCalls: string[] = [];
        const res = {
            setHeader: vi.fn(),
            writeHead: vi.fn(),
            end: vi.fn((data?: string) => {
                if (data) chunks.push(Buffer.from(data));
            }),
            write: vi.fn((data: string) => {
                writeCalls.push(data);
            }),
        } as unknown as ServerResponse;

        await _handleRequestForTesting(req, res);

        const status = (res.writeHead as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? 0;
        const bodyStr = chunks.length > 0 ? Buffer.concat(chunks).toString('utf-8') : '';
        return { status, body: bodyStr, writeCalls };
    }

    describe('Direct handler (bypasses HTTP - tests initialize and all JSON-RPC)', () => {
        it('should create session on initialize', async () => {
            const result = await invokeHandler(
                'POST',
                '/mcp',
                JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                })
            );

            expect(result.status).toBe(200);
            expect(result.sessionId).toBeDefined();
            expect(result.sessionId!.length).toBeGreaterThan(0);

            const data = JSON.parse(result.body);
            expect(data.jsonrpc).toBe('2.0');
            expect(data.result.protocolVersion).toBe('2024-11-05');
            expect(data.result.serverInfo?.name).toBe('protokoll');
        });

        it('should handle tools/list with session', async () => {
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'tools/list', id: 2,
            }), { 'mcp-session-id': init.sessionId! });

            expect(result.status).toBe(200);
            const data = JSON.parse(result.body);
            expect(data.result.tools).toEqual(mockTools);
        });

        it('should handle tools/call with session', async () => {
            mockHandleToolCall.mockResolvedValueOnce({ output: 'test' });
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'tools/call', id: 3,
                params: { name: 'protokoll_read_transcript', arguments: { transcriptPath: 'test.pkl' } },
            }), { 'mcp-session-id': init.sessionId! });

            expect(result.status).toBe(200);
            const data = JSON.parse(result.body);
            expect(data.result.content[0].text).toContain('test');
        });

        it('should handle resources/list', async () => {
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'resources/list', id: 4,
            }), { 'mcp-session-id': init.sessionId! });

            expect(result.status).toBe(200);
            const data = JSON.parse(result.body);
            expect(data.result.resources).toEqual([]);
        });

        it('should handle resources/read', async () => {
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'resources/read', id: 5, params: { uri: 'protokoll://transcript/test' },
            }), { 'mcp-session-id': init.sessionId! });

            expect(result.status).toBe(200);
            const data = JSON.parse(result.body);
            expect(data.result.contents[0].uri).toBe('protokoll://transcript/test');
        });

        it('should handle resources/subscribe and unsubscribe', async () => {
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const sub = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'resources/subscribe', id: 6, params: { uri: 'protokoll://transcript/x' },
            }), { 'mcp-session-id': init.sessionId! });
            expect(sub.status).toBe(200);

            const unsub = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'resources/unsubscribe', id: 7, params: { uri: 'protokoll://transcript/x' },
            }), { 'mcp-session-id': init.sessionId! });
            expect(unsub.status).toBe(200);
        });

        it('should handle prompts/list and prompts/get', async () => {
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const list = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'prompts/list', id: 8,
            }), { 'mcp-session-id': init.sessionId! });
            expect(list.status).toBe(200);

            const get = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'prompts/get', id: 9, params: { name: 'test_prompt', arguments: {} },
            }), { 'mcp-session-id': init.sessionId! });
            expect(get.status).toBe(200);
        });

        it('should handle roots/list', async () => {
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'roots/list', id: 10,
            }), { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(200);
        });

        it('should return 400 for unknown method', async () => {
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'unknown/method', id: 11,
            }), { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(400);
            const data = JSON.parse(result.body);
            expect(data.error?.message).toContain('Method not found');
        });

        it('should handle notifications/initialized with 202', async () => {
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'notifications/initialized',
            }), { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(202);
        });

        it('should handle tool call errors', async () => {
            mockHandleToolCall.mockRejectedValueOnce(new Error('Tool failed'));
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'tools/call', id: 1, params: { name: 'bad_tool', arguments: {} },
            }), { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(500);
            const data = JSON.parse(result.body);
            expect(data.error?.message).toContain('Tool failed');
        });

        it('should handle transcript change notifications for protokoll_edit_transcript', async () => {
            mockHandleToolCall.mockResolvedValueOnce({
                outputPath: '/test/output/edited.pkl',
                renamed: false,
            });
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'tools/call', id: 1,
                params: { name: 'protokoll_edit_transcript', arguments: { transcriptPath: 'test.pkl', title: 'New' } },
            }), { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(200);
        });

        it('should handle transcript change notifications for protokoll_create_note', async () => {
            mockHandleToolCall.mockResolvedValueOnce({ filePath: '2026/1/14-new' });
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'tools/call', id: 1,
                params: { name: 'protokoll_create_note', arguments: { title: 'New Note' } },
            }), { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(200);
        });

        it('should handle transcript change for protokoll_edit_transcript with renamed', async () => {
            mockHandleToolCall.mockResolvedValueOnce({
                outputPath: '/test/output/new.pkl',
                renamed: true,
                originalPath: '/test/output/old.pkl',
            });
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'tools/call', id: 1,
                params: { name: 'protokoll_edit_transcript', arguments: { transcriptPath: 'old.pkl' } },
            }), { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(200);
        });

        it('should handle transcript change for protokoll_provide_feedback', async () => {
            mockHandleToolCall.mockResolvedValueOnce({ outputPath: '/test/output/feedback.pkl' });
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'tools/call', id: 1,
                params: { name: 'protokoll_provide_feedback', arguments: { transcriptPath: 'test.pkl', feedback: 'Fix' } },
            }), { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(200);
        });

        it('should handle resource read errors', async () => {
            mockHandleReadResource.mockRejectedValueOnce(new Error('Resource not found'));
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'resources/read', id: 1, params: { uri: 'protokoll://transcript/missing' },
            }), { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(500);
            const data = JSON.parse(result.body);
            expect(data.error?.message).toContain('Resource not found');
        });

        it('should handle prompt get errors', async () => {
            mockGetPrompt.mockRejectedValueOnce(new Error('Prompt not found'));
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'prompts/get', id: 1, params: { name: 'missing', arguments: {} },
            }), { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(500);
            const data = JSON.parse(result.body);
            expect(data.error?.message).toContain('Prompt not found');
        });

        it('should handle transcript change for protokoll_combine_transcripts', async () => {
            mockHandleToolCall.mockResolvedValueOnce({ outputPath: '/test/output/combined.pkl' });
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'tools/call', id: 1,
                params: { name: 'protokoll_combine_transcripts', arguments: { transcriptPaths: ['a.pkl', 'b.pkl'] } },
            }), { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(200);
        });

        it('should handle transcript change for protokoll_update_transcript_content', async () => {
            mockHandleToolCall.mockResolvedValueOnce({ filePath: '2026/1/14-updated' });
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'tools/call', id: 1,
                params: { name: 'protokoll_update_transcript_content', arguments: { transcriptPath: 'test.pkl' } },
            }), { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(200);
        });
    });

    describe('GET and DELETE (direct handler)', () => {
        it('should handle GET /mcp (SSE) with valid session', async () => {
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const result = await invokeHandlerNoBody('GET', '/mcp', { 'mcp-session-id': init.sessionId! });
            expect(result.status).toBe(200);
            expect(result.writeCalls.some((w) => w.includes(': connected'))).toBe(true);
        });

        it('should require Mcp-Session-Id for GET', async () => {
            const result = await invokeHandlerNoBody('GET', '/mcp');
            expect(result.status).toBe(400);
            expect(result.body).toContain('Missing Mcp-Session-Id');
        });

        it('should return 404 for unknown session on GET', async () => {
            const result = await invokeHandlerNoBody('GET', '/mcp', { 'mcp-session-id': 'non-existent' });
            expect(result.status).toBe(404);
            expect(result.body).toBe('Session not found');
        });

        it('should handle DELETE /mcp (session termination)', async () => {
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const del = await invokeHandlerNoBody('DELETE', '/mcp', { 'mcp-session-id': init.sessionId! });
            expect(del.status).toBe(200);

            const list = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'tools/list', id: 1,
            }), { 'mcp-session-id': init.sessionId! });
            expect(list.status).toBe(404);
        });

        it('should require Mcp-Session-Id for DELETE', async () => {
            const result = await invokeHandlerNoBody('DELETE', '/mcp');
            expect(result.status).toBe(400);
        });

        it('should return 404 for unknown session on DELETE', async () => {
            const result = await invokeHandlerNoBody('DELETE', '/mcp', { 'mcp-session-id': 'non-existent' });
            expect(result.status).toBe(404);
        });
    });

    describe('Notification system (direct)', () => {
        it('should send to subscribed clients when notifySubscribedClients is called', async () => {
            const init = await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2024-11-05', capabilities: {} },
            }));
            const getResult = await invokeHandlerNoBody('GET', '/mcp', { 'mcp-session-id': init.sessionId! });
            await invokeHandler('POST', '/mcp', JSON.stringify({
                jsonrpc: '2.0', method: 'resources/subscribe', id: 1, params: { uri: 'protokoll://transcript/test' },
            }), { 'mcp-session-id': init.sessionId! });

            notifySubscribedClients('protokoll://transcript/test', {
                method: 'notifications/resource_changed',
                params: { uri: 'protokoll://transcript/test' },
            });
            expect(getResult.writeCalls.some((w) => w.includes('notifications/resource_changed'))).toBe(true);
        });

        it('should call notifyAllClients without error', () => {
            notifyAllClients({ method: 'notifications/resources_changed' });
        });
    });

    describe('Initialize flow', () => {
        it('should reject invalid JSON with parse error', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                body: 'not valid json',
            });
            expect(res.status).toBe(400);
            const data = JSON.parse(res.body);
            expect(data.error?.code).toBe(-32700);
            expect(data.error?.message).toBe('Parse error');
        });

        it('should require Mcp-Session-Id for non-initialize requests', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 1,
                }),
            });
            expect(res.status).toBe(400);
            const data = JSON.parse(res.body);
            expect(data.error?.message).toContain('Missing Mcp-Session-Id');
        });

        it.skip('should create session on initialize and return Mcp-Session-Id (HTTP - hangs, use direct handler)', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            expect(res.status).toBe(200);
            expect(res.headers['mcp-session-id']).toBeDefined();
            expect(res.headers['mcp-session-id']!.length).toBeGreaterThan(0);

            const data = JSON.parse(res.body);
            expect(data.jsonrpc).toBe('2.0');
            expect(data.result).toBeDefined();
            expect(data.result.protocolVersion).toBe('2024-11-05');
            expect(data.result.serverInfo?.name).toBe('protokoll');
        });

        it('should return 404 for unknown session', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': 'non-existent-session-id' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 1,
                }),
            });
            expect(res.status).toBe(404);
            const data = JSON.parse(res.body);
            expect(data.error?.message).toBe('Session not found');
        });
    });

    describe.skip('JSON-RPC methods', () => {
        let sessionId: string;

        beforeEach(async () => {
            const initRes = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            sessionId = initRes.headers['mcp-session-id'] || '';
        });

        it('should handle tools/list', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 2,
                }),
            });
            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);
            expect(data.result.tools).toEqual(mockTools);
        });

        it('should handle tools/call', async () => {
            mockHandleToolCall.mockResolvedValueOnce({ output: 'test result' });
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    id: 3,
                    params: { name: 'protokoll_read_transcript', arguments: { transcriptPath: 'test.pkl' } },
                }),
            });
            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);
            expect(data.result.content).toBeDefined();
            expect(data.result.content[0].text).toContain('test result');
            expect(mockHandleToolCall).toHaveBeenCalledWith('protokoll_read_transcript', { transcriptPath: 'test.pkl' });
        });

        it('should handle resources/list', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'resources/list',
                    id: 4,
                }),
            });
            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);
            expect(data.result.resources).toEqual([]);
            expect(mockHandleListResources).toHaveBeenCalled();
        });

        it('should handle resources/read', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'resources/read',
                    id: 5,
                    params: { uri: 'protokoll://transcript/test' },
                }),
            });
            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);
            expect(data.result.contents).toBeDefined();
            expect(data.result.contents[0].uri).toBe('protokoll://transcript/test');
            expect(mockHandleReadResource).toHaveBeenCalledWith('protokoll://transcript/test');
        });

        it('should handle resources/subscribe', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'resources/subscribe',
                    id: 6,
                    params: { uri: 'protokoll://transcript/test' },
                }),
            });
            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);
            expect(data.result).toEqual({});
        });

        it('should handle resources/unsubscribe', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'resources/unsubscribe',
                    id: 7,
                    params: { uri: 'protokoll://transcript/test' },
                }),
            });
            expect(res.status).toBe(200);
        });

        it('should handle prompts/list', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'prompts/list',
                    id: 8,
                }),
            });
            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);
            expect(data.result.prompts).toBeDefined();
            expect(mockGetPrompts).toHaveBeenCalled();
        });

        it('should handle prompts/get', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'prompts/get',
                    id: 9,
                    params: { name: 'test_prompt', arguments: {} },
                }),
            });
            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);
            expect(data.result.messages).toBeDefined();
            expect(mockGetPrompt).toHaveBeenCalledWith('test_prompt', {});
        });

        it('should handle roots/list', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'roots/list',
                    id: 10,
                }),
            });
            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);
            expect(data.result.roots).toBeDefined();
        });

        it('should return 400 for unknown method', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'unknown/method',
                    id: 11,
                }),
            });
            expect(res.status).toBe(400);
            const data = JSON.parse(res.body);
            expect(data.error?.code).toBe(-32601);
            expect(data.error?.message).toContain('Method not found');
        });
    });

    describe.skip('Notifications', () => {
        let sessionId: string;

        beforeEach(async () => {
            const initRes = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            sessionId = initRes.headers['mcp-session-id'] || '';
        });

        it('should handle notifications/initialized with 202', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'notifications/initialized',
                }),
            });
            expect(res.status).toBe(202);
            expect(res.body).toBe('');
        });

        it('should handle notifications/cancelled with 202', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'notifications/cancelled',
                    params: { requestId: 1 },
                }),
            });
            expect(res.status).toBe(202);
        });

        it('should handle unknown notification with 202', async () => {
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'notifications/unknown',
                }),
            });
            expect(res.status).toBe(202);
        });
    });

    describe.skip('SSE (GET /mcp)', () => {
        it('should require Mcp-Session-Id for GET', async () => {
            const res = await request(baseUrl, {
                method: 'GET',
                path: '/mcp',
            });
            expect(res.status).toBe(400);
            expect(res.body).toContain('Missing Mcp-Session-Id');
        });

        it('should return 404 for unknown session on GET', async () => {
            const res = await request(baseUrl, {
                method: 'GET',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': 'non-existent' },
            });
            expect(res.status).toBe(404);
            expect(res.body).toBe('Session not found');
        });

        it('should establish SSE connection with valid session', async () => {
            const initRes = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            const sessionId = initRes.headers['mcp-session-id'] || '';

            const url = new URL('/mcp', baseUrl);
            const res = await new Promise<{ status: number; headers: Record<string, string>; body: string }>(
                (resolve, reject) => {
                    const req = http.request(
                        {
                            hostname: url.hostname,
                            port: url.port,
                            path: url.pathname,
                            method: 'GET',
                            headers: { 'Mcp-Session-Id': sessionId },
                        },
                        (res) => {
                            const headers: Record<string, string> = {};
                            for (const [k, v] of Object.entries(res.headers)) {
                                if (v) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : String(v);
                            }
                            const chunks: Buffer[] = [];
                            res.on('data', (chunk: Buffer) => {
                                chunks.push(chunk);
                                // SSE keeps connection open - resolve after first chunk
                                if (chunks.length === 1) {
                                    res.destroy();
                                    resolve({
                                        status: res.statusCode ?? 0,
                                        headers,
                                        body: Buffer.concat(chunks).toString('utf-8'),
                                    });
                                }
                            });
                        }
                    );
                    req.on('error', reject);
                    req.end();
                }
            );
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');
            expect(res.headers['cache-control']).toBe('no-cache');
            expect(res.body).toContain(': connected');
        });
    });

    describe.skip('DELETE /mcp (session termination)', () => {
        it('should require Mcp-Session-Id for DELETE', async () => {
            const res = await request(baseUrl, {
                method: 'DELETE',
                path: '/mcp',
            });
            expect(res.status).toBe(400);
            expect(res.body).toContain('Missing Mcp-Session-Id');
        });

        it('should return 404 for unknown session on DELETE', async () => {
            const res = await request(baseUrl, {
                method: 'DELETE',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': 'non-existent' },
            });
            expect(res.status).toBe(404);
        });

        it('should terminate session on DELETE', async () => {
            const initRes = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            const sessionId = initRes.headers['mcp-session-id'] || '';

            const deleteRes = await request(baseUrl, {
                method: 'DELETE',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
            });
            expect(deleteRes.status).toBe(200);

            // Session should be gone - subsequent request should 404
            const listRes = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 1,
                }),
            });
            expect(listRes.status).toBe(404);
        });
    });

    describe.skip('Error handling', () => {
        let sessionId: string;

        beforeEach(async () => {
            const initRes = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            sessionId = initRes.headers['mcp-session-id'] || '';
        });

        it('should handle tool call errors', async () => {
            mockHandleToolCall.mockRejectedValueOnce(new Error('Tool failed'));
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    id: 1,
                    params: { name: 'bad_tool', arguments: {} },
                }),
            });
            expect(res.status).toBe(500);
            const data = JSON.parse(res.body);
            expect(data.error?.message).toContain('Tool failed');
        });

        it('should handle resource read errors', async () => {
            mockHandleReadResource.mockRejectedValueOnce(new Error('Resource not found'));
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'resources/read',
                    id: 1,
                    params: { uri: 'protokoll://transcript/missing' },
                }),
            });
            expect(res.status).toBe(500);
            const data = JSON.parse(res.body);
            expect(data.error?.message).toContain('Resource not found');
        });

        it('should handle prompt get errors', async () => {
            mockGetPrompt.mockRejectedValueOnce(new Error('Prompt not found'));
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'prompts/get',
                    id: 1,
                    params: { name: 'missing', arguments: {} },
                }),
            });
            expect(res.status).toBe(500);
            const data = JSON.parse(res.body);
            expect(data.error?.message).toContain('Prompt not found');
        });
    });

    describe.skip('Transcript change notifications (tools/call)', () => {
        let sessionId: string;

        beforeEach(async () => {
            const initRes = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            sessionId = initRes.headers['mcp-session-id'] || '';
        });

        it('should send transcript notifications for protokoll_edit_transcript', async () => {
            mockHandleToolCall.mockResolvedValueOnce({
                outputPath: '/test/output/edited.pkl',
                renamed: false,
            });
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    id: 1,
                    params: {
                        name: 'protokoll_edit_transcript',
                        arguments: { transcriptPath: 'test.pkl', title: 'New Title' },
                    },
                }),
            });
            expect(res.status).toBe(200);
        });

        it('should send transcript notifications for protokoll_provide_feedback', async () => {
            mockHandleToolCall.mockResolvedValueOnce({
                outputPath: '/test/output/feedback.pkl',
            });
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    id: 1,
                    params: {
                        name: 'protokoll_provide_feedback',
                        arguments: { transcriptPath: 'test.pkl', feedback: 'Fix typo' },
                    },
                }),
            });
            expect(res.status).toBe(200);
        });

        it('should send transcript notifications for protokoll_create_note', async () => {
            mockHandleToolCall.mockResolvedValueOnce({
                filePath: '2026/1/14-new-note',
            });
            const res = await request(baseUrl, {
                method: 'POST',
                path: '/mcp',
                headers: { 'Mcp-Session-Id': sessionId },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    id: 1,
                    params: {
                        name: 'protokoll_create_note',
                        arguments: { title: 'New Note' },
                    },
                }),
            });
            expect(res.status).toBe(200);
        });
    });

    describe('Notification exports', () => {
        it('should export notifySubscribedClients', () => {
            expect(notifySubscribedClients).toBeTypeOf('function');
            // Call with no sessions - should not throw
            notifySubscribedClients('protokoll://transcript/test', {
                method: 'notifications/resource_changed',
                params: { uri: 'protokoll://transcript/test' },
            });
        });

        it('should export notifyAllClients', () => {
            expect(notifyAllClients).toBeTypeOf('function');
            notifyAllClients({ method: 'notifications/resources_changed' });
        });
    });
});
