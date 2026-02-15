/**
 * Tests for MCP Server (stdio) module
 *
 * Comprehensive tests for server setup, request handlers, and main() flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture handlers by schema - use method names as keys for MCP JSON-RPC
type HandlerMap = Map<unknown, (request: { params: unknown }) => Promise<unknown>>;

let capturedHandlers: HandlerMap;
let mockConnect: ReturnType<typeof vi.fn>;
let mockSetRequestHandler: ReturnType<typeof vi.fn>;

// Mock the MCP SDK - capture handlers for testing
// Must use function() not arrow - arrow functions cannot be used as constructors (new Server())
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: vi.fn().mockImplementation(function (this: unknown) {
        capturedHandlers = new Map();
        mockSetRequestHandler = vi.fn((schema: unknown, handler: (req: { params: unknown }) => Promise<unknown>) => {
            capturedHandlers.set(schema, handler);
        });
        mockConnect = vi.fn().mockResolvedValue(undefined);
        return {
            setRequestHandler: mockSetRequestHandler,
            connect: mockConnect,
        };
    }),
}));

// Must use function() - arrow functions cannot be used as constructors
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: vi.fn().mockImplementation(function (this: unknown) {
        return { start: vi.fn() };
    }),
}));

// Import schema objects for handler lookup
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    ListRootsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Do NOT mock @modelcontextprotocol/sdk/types.js - we need real schema objects for handler lookup

vi.mock('../../src/mcp/resources', () => ({
    handleListResources: vi.fn().mockResolvedValue({ resources: [] }),
    handleReadResource: vi.fn().mockResolvedValue({
        uri: 'test://resource',
        mimeType: 'text/plain',
        text: 'test',
    }),
}));

vi.mock('../../src/mcp/prompts', () => ({
    getPrompts: vi.fn().mockReturnValue([]),
    getPrompt: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/mcp/tools', () => ({
    tools: [{ name: 'test_tool', description: 'Test', inputSchema: { type: 'object' } }],
    handleToolCall: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../src/mcp/serverConfig', () => ({
    initializeServerConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/mcp/roots', () => ({
    getCachedRoots: vi.fn().mockReturnValue([]),
    setRoots: vi.fn(),
}));

vi.mock('../../src/mcp/configDiscovery', () => ({
    initializeWorkingDirectoryFromArgsAndConfig: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
import * as Resources from '../../src/mcp/resources';
import * as Prompts from '../../src/mcp/prompts';
import * as Tools from '../../src/mcp/tools';
import * as Roots from '../../src/mcp/roots';
import * as ServerConfig from '../../src/mcp/serverConfig';
import * as ConfigDiscovery from '../../src/mcp/configDiscovery';
import { main, checkIsMainModule } from '../../src/mcp/server';

// Helper to get handler by schema
function getHandler(schema: unknown): ((req: { params: unknown }) => Promise<unknown>) | undefined {
    return capturedHandlers?.get(schema);
}

describe('server (stdio)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Restore process.env for workspace root
        const cwd = process.cwd();
        if (!process.env.WORKSPACE_ROOT) {
            process.env.WORKSPACE_ROOT = cwd;
        }
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should export main function', async () => {
        const server = await import('../../src/mcp/server');
        expect(server.main).toBeDefined();
        expect(typeof server.main).toBe('function');
    });

    describe('main()', () => {
        it('should initialize config, create server, set handlers, connect, and run', async () => {
            // main() never resolves (awaits infinite promise) - race with timeout
            const mainPromise = main();
            const timeoutPromise = new Promise<string>((resolve) =>
                setTimeout(() => resolve('setup_complete'), 150)
            );
            const result = await Promise.race([mainPromise, timeoutPromise]);

            expect(result).toBe('setup_complete');
            expect(ConfigDiscovery.initializeWorkingDirectoryFromArgsAndConfig).toHaveBeenCalled();
            expect(mockConnect).toHaveBeenCalled();
            expect(Roots.setRoots).toHaveBeenCalled();
            expect(ServerConfig.initializeServerConfig).toHaveBeenCalled();
        });
    });

    describe('request handlers', () => {
        beforeEach(async () => {
            // Run main briefly to capture handlers, then we'll test them
            const mainPromise = main();
            await new Promise((r) => setTimeout(r, 50));
            // Abort - we have the handlers from the first run
            // Note: main keeps running but we have capturedHandlers from the Server constructor
        });

        it('ListRoots handler returns roots from cache', async () => {
            vi.mocked(Roots.getCachedRoots).mockReturnValue([
                { uri: 'file:///workspace', name: 'Workspace' },
            ]);
            const handler = getHandler(ListRootsRequestSchema);
            expect(handler).toBeDefined();

            const result = await handler!({ params: {} });
            expect(result).toEqual({
                roots: [{ uri: 'file:///workspace', name: 'Workspace' }],
            });
        });

        it('ListRoots handler returns empty array when no cached roots', async () => {
            vi.mocked(Roots.getCachedRoots).mockReturnValue(null);
            const handler = getHandler(ListRootsRequestSchema);
            expect(handler).toBeDefined();

            const result = await handler!({ params: {} });
            expect(result).toEqual({ roots: [] });
        });

        it('ListTools handler returns tools', async () => {
            const handler = getHandler(ListToolsRequestSchema);
            expect(handler).toBeDefined();

            const result = await handler!({ params: {} });
            expect(result).toEqual({
                tools: [{ name: 'test_tool', description: 'Test', inputSchema: { type: 'object' } }],
            });
        });

        it('CallTool handler returns JSON result on success', async () => {
            vi.mocked(Tools.handleToolCall).mockResolvedValue({ output: 'success' });
            const handler = getHandler(CallToolRequestSchema);
            expect(handler).toBeDefined();

            const result = await handler!({
                params: { name: 'protokoll_get_version', arguments: {} },
            });
            expect(result).toEqual({
                content: [{ type: 'text', text: JSON.stringify({ output: 'success' }, null, 2) }],
            });
            expect(Tools.handleToolCall).toHaveBeenCalledWith('protokoll_get_version', {});
        });

        it('CallTool handler returns error content when handleToolCall throws', async () => {
            vi.mocked(Tools.handleToolCall).mockRejectedValue(new Error('Tool failed'));
            const handler = getHandler(CallToolRequestSchema);
            expect(handler).toBeDefined();

            const result = await handler!({
                params: { name: 'unknown_tool', arguments: {} },
            });
            expect(result).toEqual({
                content: [{ type: 'text', text: 'Error: Tool failed' }],
                isError: true,
            });
        });

        it('CallTool handler handles non-Error throws', async () => {
            vi.mocked(Tools.handleToolCall).mockRejectedValue('string error');
            const handler = getHandler(CallToolRequestSchema);
            expect(handler).toBeDefined();

            const result = await handler!({
                params: { name: 'some_tool', arguments: {} },
            });
            expect(result).toEqual({
                content: [{ type: 'text', text: 'Error: string error' }],
                isError: true,
            });
        });

        it('ListResources handler delegates to Resources.handleListResources', async () => {
            vi.mocked(Resources.handleListResources).mockResolvedValue({
                resources: [{ uri: 'protokoll://test', name: 'Test', mimeType: 'text/plain' }],
            });
            const handler = getHandler(ListResourcesRequestSchema);
            expect(handler).toBeDefined();

            const result = await handler!({ params: {} });
            expect(result).toEqual({
                resources: [{ uri: 'protokoll://test', name: 'Test', mimeType: 'text/plain' }],
            });
            expect(Resources.handleListResources).toHaveBeenCalled();
        });

        it('ReadResource handler returns contents on success', async () => {
            vi.mocked(Resources.handleReadResource).mockResolvedValue({
                uri: 'protokoll://transcript/test',
                mimeType: 'text/plain',
                text: 'transcript content',
            });
            const handler = getHandler(ReadResourceRequestSchema);
            expect(handler).toBeDefined();

            const result = await handler!({
                params: { uri: 'protokoll://transcript/test' },
            });
            expect(result).toEqual({
                contents: [
                    {
                        uri: 'protokoll://transcript/test',
                        mimeType: 'text/plain',
                        text: 'transcript content',
                    },
                ],
            });
            expect(Resources.handleReadResource).toHaveBeenCalledWith('protokoll://transcript/test');
        });

        it('ReadResource handler throws when handleReadResource fails', async () => {
            vi.mocked(Resources.handleReadResource).mockRejectedValue(new Error('Not found'));
            const handler = getHandler(ReadResourceRequestSchema);
            expect(handler).toBeDefined();

            await expect(
                handler!({ params: { uri: 'protokoll://transcript/missing' } })
            ).rejects.toThrow('Failed to read resource protokoll://transcript/missing: Not found');
        });

        it('ListPrompts handler returns prompts from Prompts.getPrompts', async () => {
            vi.mocked(Prompts.getPrompts).mockReturnValue([
                { name: 'how_to_use', description: 'Usage guide', arguments: [] },
            ]);
            const handler = getHandler(ListPromptsRequestSchema);
            expect(handler).toBeDefined();

            const result = await handler!({ params: {} });
            expect(result).toEqual({
                prompts: [{ name: 'how_to_use', description: 'Usage guide', arguments: [] }],
            });
            expect(Prompts.getPrompts).toHaveBeenCalled();
        });

        it('GetPrompt handler returns messages on success', async () => {
            vi.mocked(Prompts.getPrompt).mockResolvedValue([
                { role: 'user', content: { type: 'text', text: 'Hello' } },
            ]);
            const handler = getHandler(GetPromptRequestSchema);
            expect(handler).toBeDefined();

            const result = await handler!({
                params: { name: 'how_to_use_protokoll', arguments: {} },
            });
            expect(result).toEqual({
                messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
            });
            expect(Prompts.getPrompt).toHaveBeenCalledWith('how_to_use_protokoll', {});
        });

        it('GetPrompt handler throws when getPrompt fails', async () => {
            vi.mocked(Prompts.getPrompt).mockRejectedValue(new Error('Prompt not found'));
            const handler = getHandler(GetPromptRequestSchema);
            expect(handler).toBeDefined();

            await expect(
                handler!({
                    params: { name: 'missing_prompt', arguments: {} },
                })
            ).rejects.toThrow('Failed to get prompt missing_prompt: Prompt not found');
        });

        it('GetPrompt handler passes optional args', async () => {
            vi.mocked(Prompts.getPrompt).mockResolvedValue([]);
            const handler = getHandler(GetPromptRequestSchema);
            expect(handler).toBeDefined();

            await handler!({
                params: {
                    name: 'transcribe_with_context',
                    arguments: { projectId: 'my-project' },
                },
            });
            expect(Prompts.getPrompt).toHaveBeenCalledWith('transcribe_with_context', {
                projectId: 'my-project',
            });
        });
    });

    describe('checkIsMainModule', () => {
        it('returns false when not run as main module', async () => {
            const result = await checkIsMainModule();
            expect(result).toBe(false);
        });
    });

    describe('server setup', () => {
        it('should register all expected request handlers', async () => {
            // main() never resolves (infinite await) - race with timeout
            const mainPromise = main();
            await new Promise((r) => setTimeout(r, 100));

            const expectedSchemas = [
                ListRootsRequestSchema,
                ListToolsRequestSchema,
                CallToolRequestSchema,
                ListResourcesRequestSchema,
                ReadResourceRequestSchema,
                ListPromptsRequestSchema,
                GetPromptRequestSchema,
            ];

            for (const schema of expectedSchemas) {
                expect(capturedHandlers.has(schema)).toBe(true);
            }
            expect(mockSetRequestHandler).toHaveBeenCalledTimes(expectedSchemas.length);
        });
    });
});
