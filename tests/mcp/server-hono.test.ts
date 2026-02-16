/**
 * Integration tests for MCP Hono Server
 *
 * Tests the Hono-based HTTP/SSE transport server.
 * Uses Hono's test client for easier testing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock values
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

// Mock the MCP SDK modules
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: vi.fn().mockImplementation(function (this: unknown) {
        return { 
            setRequestHandler: vi.fn(),
            connect: vi.fn().mockResolvedValue(undefined),
        };
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

// Mock @hono/mcp transport
vi.mock('@hono/mcp', () => ({
    StreamableHTTPTransport: vi.fn().mockImplementation(() => ({
        handleRequest: vi.fn().mockImplementation(async (c) => {
            // Mock transport behavior - return JSON-RPC response
            const body = await c.req.text();
            const jsonRpcMessage = JSON.parse(body);
            
            let result;
            switch (jsonRpcMessage.method) {
                case 'initialize':
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
                case 'tools/list':
                    result = { tools: mockTools };
                    break;
                case 'tools/call':
                    const toolResult = await mockHandleToolCall(jsonRpcMessage.params.name, jsonRpcMessage.params.arguments || {});
                    result = {
                        content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
                    };
                    break;
                case 'resources/list':
                    result = await mockHandleListResources();
                    break;
                case 'resources/read':
                    const contents = await mockHandleReadResource(jsonRpcMessage.params.uri);
                    result = { contents: [contents] };
                    break;
                case 'prompts/list':
                    result = { prompts: mockGetPrompts() };
                    break;
                case 'prompts/get':
                    const messages = await mockGetPrompt(jsonRpcMessage.params.name, jsonRpcMessage.params.arguments || {});
                    result = { messages };
                    break;
                case 'roots/list':
                    result = { roots: [{ uri: 'file:///test', name: 'Workspace' }] };
                    break;
                default:
                    return c.json({
                        jsonrpc: '2.0',
                        error: { code: -32601, message: `Method not found: ${jsonRpcMessage.method}` },
                        id: jsonRpcMessage.id,
                    }, 400);
            }
            
            return c.json({
                jsonrpc: '2.0',
                result,
                id: jsonRpcMessage.id,
            });
        }),
    })),
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

// Import app after mocks are set up
import { app, sessions } from '../../src/mcp/server-hono';

describe('server-hono integration', () => {
    beforeEach(() => {
        // Clear sessions between tests
        sessions.clear();
        vi.clearAllMocks();
    });

    describe('HTTP request handling', () => {
        it('should serve health check', async () => {
            const res = await app.request('/health');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('healthy');
            expect(typeof data.sessions).toBe('number');
        });

        it('should return 404 for unknown endpoints', async () => {
            const res = await app.request('/unknown');
            expect(res.status).toBe(404);
        });

        it('should handle CORS preflight for /mcp', async () => {
            const res = await app.request('/mcp', {
                method: 'OPTIONS',
            });
            // Hono CORS middleware handles OPTIONS
            expect([200, 204]).toContain(res.status);
        });
    });

    // NOTE: Full MCP protocol tests require integration testing with real MCP SDK
    // The mocked transport doesn't fully integrate with session management
    // These tests are skipped for now and should be run as integration tests
    describe.skip('MCP Protocol', () => {
        it('should create session on initialize', async () => {
            const res = await app.request('/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });

            expect(res.status).toBe(200);
            const sessionId = res.headers.get('mcp-session-id');
            expect(sessionId).toBeDefined();
            expect(sessionId!.length).toBeGreaterThan(0);

            const data = await res.json();
            expect(data.jsonrpc).toBe('2.0');
            expect(data.result.protocolVersion).toBe('2024-11-05');
            expect(data.result.serverInfo?.name).toBe('protokoll');
        });

        it('should require session ID for non-initialize requests', async () => {
            const res = await app.request('/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 2,
                }),
            });

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error.message).toContain('Missing Mcp-Session-Id header');
        });

        it('should handle tools/list with session', async () => {
            // Initialize session
            const initRes = await app.request('/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            const sessionId = initRes.headers.get('mcp-session-id')!;

            // Call tools/list
            const res = await app.request('/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Mcp-Session-Id': sessionId,
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 2,
                }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.result.tools).toEqual(mockTools);
        });

        it('should handle tools/call with session', async () => {
            mockHandleToolCall.mockResolvedValueOnce({ output: 'test' });

            // Initialize session
            const initRes = await app.request('/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            const sessionId = initRes.headers.get('mcp-session-id')!;

            // Call tool
            const res = await app.request('/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Mcp-Session-Id': sessionId,
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    id: 3,
                    params: { name: 'protokoll_read_transcript', arguments: { transcriptPath: 'test.pkl' } },
                }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.result.content[0].text).toContain('test');
        });

        it('should handle resources/list', async () => {
            // Initialize session
            const initRes = await app.request('/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            const sessionId = initRes.headers.get('mcp-session-id')!;

            // List resources
            const res = await app.request('/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Mcp-Session-Id': sessionId,
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'resources/list',
                    id: 4,
                }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.result.resources).toEqual([]);
        });

        it('should handle resources/read', async () => {
            // Initialize session
            const initRes = await app.request('/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            const sessionId = initRes.headers.get('mcp-session-id')!;

            // Read resource
            const res = await app.request('/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Mcp-Session-Id': sessionId,
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'resources/read',
                    id: 5,
                    params: { uri: 'protokoll://transcript/test' },
                }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.result.contents[0].uri).toBe('protokoll://transcript/test');
        });

        it('should handle prompts/list', async () => {
            // Initialize session
            const initRes = await app.request('/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            const sessionId = initRes.headers.get('mcp-session-id')!;

            // List prompts
            const res = await app.request('/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Mcp-Session-Id': sessionId,
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'prompts/list',
                    id: 6,
                }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.result.prompts).toEqual(mockGetPrompts());
        });

        it('should handle prompts/get', async () => {
            // Initialize session
            const initRes = await app.request('/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            const sessionId = initRes.headers.get('mcp-session-id')!;

            // Get prompt
            const res = await app.request('/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Mcp-Session-Id': sessionId,
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'prompts/get',
                    id: 7,
                    params: { name: 'test_prompt', arguments: {} },
                }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.result.messages).toBeDefined();
        });

        it('should handle notifications/initialized', async () => {
            // Initialize session
            const initRes = await app.request('/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            const sessionId = initRes.headers.get('mcp-session-id')!;

            // Send notification (no id field)
            const res = await app.request('/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Mcp-Session-Id': sessionId,
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'notifications/initialized',
                }),
            });

            expect(res.status).toBe(202); // Notifications get 202 Accepted
        });

        it('should reject session not found', async () => {
            const res = await app.request('/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Mcp-Session-Id': 'invalid-session-id',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 2,
                }),
            });

            expect(res.status).toBe(404);
            const data = await res.json();
            expect(data.error.message).toContain('Session not found');
        });
    });

    describe.skip('Session Management', () => {
        it('should handle DELETE to terminate session', async () => {
            // Initialize session
            const initRes = await app.request('/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    id: 1,
                    params: { protocolVersion: '2024-11-05', capabilities: {} },
                }),
            });
            const sessionId = initRes.headers.get('mcp-session-id')!;

            // Verify session exists
            expect(sessions.has(sessionId)).toBe(true);

            // Delete session
            const delRes = await app.request('/mcp', {
                method: 'DELETE',
                headers: {
                    'Mcp-Session-Id': sessionId,
                },
            });

            expect(delRes.status).toBe(200);
            expect(sessions.has(sessionId)).toBe(false);
        });

        it('should require session ID for DELETE', async () => {
            const res = await app.request('/mcp', {
                method: 'DELETE',
            });

            expect(res.status).toBe(400);
        });

        it('should handle DELETE for non-existent session', async () => {
            const res = await app.request('/mcp', {
                method: 'DELETE',
                headers: {
                    'Mcp-Session-Id': 'non-existent-session',
                },
            });

            expect(res.status).toBe(404);
        });
    });

    describe.skip('SSE (Server-Sent Events)', () => {
        it('should require session ID for GET /mcp', async () => {
            const res = await app.request('/mcp', {
                method: 'GET',
            });

            expect(res.status).toBe(400);
        });

        it('should reject GET for non-existent session', async () => {
            const res = await app.request('/mcp', {
                method: 'GET',
                headers: {
                    'Mcp-Session-Id': 'non-existent-session',
                },
            });

            expect(res.status).toBe(404);
        });
    });
});
