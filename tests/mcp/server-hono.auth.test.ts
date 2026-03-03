import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomBytes, scryptSync } from 'node:crypto';
import { createRbacAuthorizer } from '../../src/mcp/rbac';

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

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: vi.fn().mockImplementation(function () {
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

vi.mock('@hono/mcp', () => ({
    StreamableHTTPTransport: vi.fn().mockImplementation(() => ({
        handleRequest: vi.fn().mockImplementation(async (c) => c.json({
            jsonrpc: '2.0',
            result: { ok: true },
            id: 1,
        })),
    })),
}));

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
    getOutputStorage: vi.fn().mockReturnValue({
        name: 'filesystem',
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        listFiles: vi.fn().mockResolvedValue([]),
        readFile: vi.fn().mockResolvedValue(Buffer.from('')),
    }),
}));

vi.mock('../../src/mcp/roots', () => ({
    getCachedRoots: vi.fn().mockReturnValue([{ uri: 'file:///test', name: 'Workspace' }]),
    setRoots: vi.fn(),
}));

vi.mock('../../src/mcp/configDiscovery', () => ({
    DEFAULT_CONFIG_FILE: 'protokoll-config.yaml',
    createQuietLogger: vi.fn(),
}));

vi.mock('../../src/mcp/engineLogging', () => ({
    configureEngineLoggingBridge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@hono/node-server', () => ({
    serve: vi.fn(),
}));

import { app, __setSecurityForTests } from '../../src/mcp/server-hono';

function createScryptHash(secret: string): string {
    const n = 16384;
    const r = 8;
    const p = 1;
    const salt = randomBytes(16);
    const derived = scryptSync(secret, salt, 32, { N: n, r, p });
    return `scrypt$${n}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

describe('server-hono auth middleware', () => {
    const adminSecret = 'admin-secret';
    const editorSecret = 'editor-secret';
    const authorizer = createRbacAuthorizer({
        users: [
            { user_id: 'admin-user', roles: ['admin'], enabled: true },
            { user_id: 'editor-user', roles: ['editor'], enabled: true },
        ],
        keys: [
            { key_id: 'k-admin', user_id: 'admin-user', secret_hash: createScryptHash(adminSecret), enabled: true },
            { key_id: 'k-editor', user_id: 'editor-user', secret_hash: createScryptHash(editorSecret), enabled: true },
        ],
        policy: [
            { path: '/health', methods: ['GET'], public: true, any_roles: [] },
            { path: '/auth/whoami', methods: ['GET'], public: false, any_roles: ['*'] },
            { path: '/admin/ping', methods: ['GET'], public: false, any_roles: ['admin'] },
        ],
    });

    beforeEach(() => {
        __setSecurityForTests({ secured: true, authorizer });
        vi.clearAllMocks();
    });

    it('allows public health route without auth', async () => {
        const res = await app.request('/health');
        expect(res.status).toBe(200);
    });

    it('accepts X-API-Key on authenticated route', async () => {
        const res = await app.request('/auth/whoami', {
            headers: {
                'X-API-Key': editorSecret,
            },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.user_id).toBe('editor-user');
        expect(body.key_id).toBe('k-editor');
    });

    it('accepts Bearer token on authenticated route', async () => {
        const res = await app.request('/auth/whoami', {
            headers: {
                Authorization: `Bearer ${editorSecret}`,
            },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.user_id).toBe('editor-user');
    });

    it('enforces admin role for admin endpoint', async () => {
        const denied = await app.request('/admin/ping', {
            headers: {
                'X-API-Key': editorSecret,
            },
        });
        expect(denied.status).toBe(403);

        const allowed = await app.request('/admin/ping', {
            headers: {
                'X-API-Key': adminSecret,
            },
        });
        expect(allowed.status).toBe(200);
    });
});
