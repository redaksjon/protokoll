/**
 * Tests for dynamic resource discovery
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serverState = vi.hoisted(() => ({
    isInitialized: false,
    workspaceRoot: null as string | null,
    context: null as any,
    configFile: null as { contextDirectories?: string[] } | null,
}));

vi.mock('@/context', () => ({
    create: vi.fn(),
}));

vi.mock('../../../src/mcp/serverConfig', () => ({
    isInitialized: vi.fn(() => serverState.isInitialized),
    getWorkspaceRoot: vi.fn(() => serverState.workspaceRoot),
    getContext: vi.fn(() => serverState.context),
    getServerConfig: vi.fn(() => ({ configFile: serverState.configFile })),
}));

vi.mock('../../../src/mcp/uri', () => ({
    buildConfigUri: vi.fn((path: string) => `protokoll://config?path=${path}`),
    buildAudioInboundUri: vi.fn((dir: string) => `protokoll://audio/inbound?directory=${dir}`),
    buildAudioProcessedUri: vi.fn((dir: string) => `protokoll://audio/processed?directory=${dir}`),
    buildEntitiesListUri: vi.fn((type: string) => `protokoll://entities/${type}`),
    buildTranscriptsListUri: vi.fn((params: { directory: string; limit: number }) => (
        `protokoll://transcripts?directory=${params.directory}&limit=${params.limit}`
    )),
}));

import * as Context from '@/context';
import { getDynamicResources } from '../../../src/mcp/resources/discovery';

function createMockContext(overrides: Partial<any> = {}) {
    return {
        hasContext: vi.fn().mockReturnValue(true),
        getConfig: vi.fn().mockReturnValue({
            inputDirectory: './recordings',
            processedDirectory: './processed',
            outputDirectory: '~/notes',
        }),
        getDiscoveredDirs: vi.fn().mockReturnValue([{ path: '/test/.protokoll', level: 0 }]),
        getAllProjects: vi.fn().mockReturnValue([{ id: 'p1' }]),
        getAllPeople: vi.fn().mockReturnValue([{ id: 'person1' }]),
        getAllTerms: vi.fn().mockReturnValue([{ id: 't1' }]),
        getAllCompanies: vi.fn().mockReturnValue([{ id: 'c1' }]),
        ...overrides,
    };
}

describe('discovery resources', () => {
    beforeEach(() => {
        serverState.isInitialized = false;
        serverState.workspaceRoot = null;
        serverState.context = null;
        serverState.configFile = null;
        vi.mocked(Context.create).mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns empty list when context does not exist', async () => {
        vi.mocked(Context.create).mockResolvedValue(createMockContext({
            hasContext: vi.fn().mockReturnValue(false),
        }) as any);

        const result = await getDynamicResources('/no-context');

        expect(result).toEqual([]);
        expect(Context.create).toHaveBeenCalledWith({
            startingDir: '/no-context',
        });
    });

    it('returns resources for available entities and directories', async () => {
        vi.mocked(Context.create).mockResolvedValue(createMockContext() as any);

        const result = await getDynamicResources('/test/context');
        const uris = result.map((r) => r.uri);

        expect(uris).toContain('protokoll://config?path=/test/.protokoll');
        expect(uris).toContain('protokoll://audio/inbound?directory=./recordings');
        expect(uris).toContain('protokoll://audio/processed?directory=./processed');
        expect(uris).toContain('protokoll://entities/project');
        expect(uris).toContain('protokoll://entities/person');
        expect(uris).toContain('protokoll://entities/term');
        expect(uris).toContain('protokoll://entities/company');
        expect(uris).toContain('protokoll://transcripts?directory=~/notes&limit=10');
    });

    it('omits optional resources when values are missing', async () => {
        vi.mocked(Context.create).mockResolvedValue(createMockContext({
            getConfig: vi.fn().mockReturnValue({
                inputDirectory: '',
                processedDirectory: undefined,
                outputDirectory: '',
            }),
            getDiscoveredDirs: vi.fn().mockReturnValue([]),
            getAllProjects: vi.fn().mockReturnValue([]),
            getAllPeople: vi.fn().mockReturnValue([]),
            getAllTerms: vi.fn().mockReturnValue([]),
            getAllCompanies: vi.fn().mockReturnValue([]),
        }) as any);

        const result = await getDynamicResources('/test/context');
        const uris = result.map((r) => r.uri);

        expect(uris).not.toContain('protokoll://audio/processed?directory=./processed');
        expect(uris).toContain('protokoll://audio/inbound?directory=./recordings');
        expect(uris).toContain('protokoll://transcripts?directory=~/notes&limit=10');
        expect(uris.some((uri) => uri.startsWith('protokoll://entities/'))).toBe(false);
    });

    it('uses initialized server context when available', async () => {
        serverState.isInitialized = true;
        serverState.context = createMockContext();

        const result = await getDynamicResources('/ignored');

        expect(result.length).toBeGreaterThan(0);
        expect(Context.create).not.toHaveBeenCalled();
    });

    it('uses server config directories when server is initialized without context', async () => {
        serverState.isInitialized = true;
        serverState.workspaceRoot = '/workspace/root';
        serverState.context = null;
        serverState.configFile = { contextDirectories: ['ctx', '/abs/ctx'] };
        vi.mocked(Context.create).mockResolvedValue(createMockContext() as any);

        await getDynamicResources();

        expect(Context.create).toHaveBeenCalledWith({
            startingDir: '/workspace/root',
            contextDirectories: ['/workspace/root/ctx', '/abs/ctx'],
        });
    });

    it('returns empty list when context creation throws', async () => {
        vi.mocked(Context.create).mockRejectedValue(new Error('boom'));

        const result = await getDynamicResources();

        expect(result).toEqual([]);
    });
});
