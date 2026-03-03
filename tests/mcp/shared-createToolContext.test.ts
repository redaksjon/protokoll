import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetContext = vi.hoisted(() => vi.fn());
const mockGetStorageConfig = vi.hoisted(() => vi.fn());
const mockIsInitialized = vi.hoisted(() => vi.fn());
const mockGetServerConfig = vi.hoisted(() => vi.fn());
const mockGetWorkspaceRoot = vi.hoisted(() => vi.fn());
const mockContextCreate = vi.hoisted(() => vi.fn());
const mockListContextEntitiesFromGcs = vi.hoisted(() => vi.fn());
const mockParseGcsUri = vi.hoisted(() => vi.fn());

vi.mock('../../src/mcp/serverConfig', () => ({
    getContext: (...args: unknown[]) => mockGetContext(...args),
    getStorageConfig: (...args: unknown[]) => mockGetStorageConfig(...args),
    isInitialized: (...args: unknown[]) => mockIsInitialized(...args),
    getServerConfig: (...args: unknown[]) => mockGetServerConfig(...args),
    getWorkspaceRoot: (...args: unknown[]) => mockGetWorkspaceRoot(...args),
}));

vi.mock('@/context', () => ({
    create: (...args: unknown[]) => mockContextCreate(...args),
}));

vi.mock('../../src/mcp/resources/entityIndexService', () => ({
    listContextEntitiesFromGcs: (...args: unknown[]) => mockListContextEntitiesFromGcs(...args),
}));

vi.mock('../../src/mcp/storage/gcsUri', () => ({
    parseGcsUri: (...args: unknown[]) => mockParseGcsUri(...args),
}));

import { createToolContext } from '../../src/mcp/tools/shared';

const makeServerContext = (counts: { people: number; projects: number; terms: number; companies: number }) => ({
    hasContext: vi.fn().mockReturnValue(true),
    getAllPeople: vi.fn().mockReturnValue(new Array(counts.people).fill({ id: 'p' })),
    getAllProjects: vi.fn().mockReturnValue(new Array(counts.projects).fill({ id: 'pr' })),
    getAllTerms: vi.fn().mockReturnValue(new Array(counts.terms).fill({ id: 't' })),
    getAllCompanies: vi.fn().mockReturnValue(new Array(counts.companies).fill({ id: 'c' })),
    getContextDirs: vi.fn().mockReturnValue(['gcs://ctx']),
    load: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockReturnValue({ smartAssistance: { enabled: true } }),
    saveEntity: vi.fn().mockResolvedValue(undefined),
    deleteEntity: vi.fn().mockResolvedValue(true),
    getEntityFilePath: vi.fn().mockReturnValue('/tmp/e.yaml'),
});

describe('createToolContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetContext.mockReturnValue(null);
        mockGetStorageConfig.mockReturnValue({ backend: 'local' });
        mockIsInitialized.mockReturnValue(false);
        mockGetServerConfig.mockReturnValue({ configFile: {} });
        mockGetWorkspaceRoot.mockReturnValue('/workspace');
        mockContextCreate.mockResolvedValue({
            hasContext: () => true,
            getAllPeople: () => [],
            getAllProjects: () => [],
            getAllTerms: () => [],
            getAllCompanies: () => [],
        });
        mockListContextEntitiesFromGcs.mockResolvedValue([]);
        mockParseGcsUri.mockReturnValue({ bucket: 'ctx-bucket', prefix: 'ctx' });
    });

    it('returns existing server context for local backend', async () => {
        const serverContext = makeServerContext({ people: 1, projects: 1, terms: 1, companies: 1 });
        mockGetContext.mockReturnValue(serverContext);
        mockGetStorageConfig.mockReturnValue({ backend: 'local' });

        const context = await createToolContext();

        expect(context).toBe(serverContext);
        expect(mockContextCreate).not.toHaveBeenCalled();
    });

    it('uses GCS fallback context when indexed entities exceed server context', async () => {
        const serverContext = makeServerContext({ people: 0, projects: 0, terms: 0, companies: 0 });
        mockGetContext.mockReturnValue(serverContext);
        mockGetStorageConfig.mockReturnValue({ backend: 'gcs', gcs: { contextUri: 'gs://ctx-bucket/ctx' } });

        mockListContextEntitiesFromGcs.mockImplementation(async (type: string) => {
            if (type === 'person') {
                return [{ id: 'd798ad57-97bc-4fa0-aae8-6060b85b51ab', slug: 'jerry-geisler', name: 'Jerry Geisler', sounds_like: ['jeri'] }];
            }
            if (type === 'project') {
                return [{ id: 'project-alpha', slug: 'project-alpha', name: 'Project Alpha' }];
            }
            if (type === 'term') {
                return [{ id: 'term-api', slug: 'term-api', name: 'API' }];
            }
            if (type === 'company') {
                return [{ id: '4ec1dee6-cc33-45c2-8b01-29d5ff5feb74', slug: 'walmart', name: 'Walmart' }];
            }
            return [{ id: 'ignore-1', slug: 'ignore-1', name: 'uh' }];
        });

        const context = await createToolContext();

        // Exercise fallback methods so function/branch coverage includes these closures.
        expect(context.hasContext()).toBe(true);
        await context.load();
        await context.reload();
        expect(context.getDiscoveredDirs()).toEqual([]);
        expect(context.getContextDirs()).toEqual(['gcs://ctx']);
        expect(context.getConfig()).toEqual({ smartAssistance: { enabled: true } });
        expect(context.getAllPeople()).toHaveLength(1);
        expect(context.getAllProjects()).toHaveLength(1);
        expect(context.getAllTerms()).toHaveLength(1);
        expect(context.getAllCompanies()).toHaveLength(1);
        expect(context.getAllIgnored()).toHaveLength(1);
        expect(context.getPerson('jerry-geisler')?.name).toBe('Jerry Geisler');
        expect(context.getPerson('d798ad57')).toBeTruthy();
        expect(context.getCompany('walmart')?.id).toBe('4ec1dee6-cc33-45c2-8b01-29d5ff5feb74');
        expect(context.getProject('project-alpha')?.name).toBe('Project Alpha');
        expect(context.getTerm('term-api')?.name).toBe('API');
        expect(context.isIgnored('UH')).toBe(true);
        expect(context.search('jeri')).toHaveLength(1);
        expect(context.findBySoundsLike('JERI')?.name).toBe('Jerry Geisler');
        expect(context.searchWithContext('project')).toHaveLength(1);
        expect(context.getRelatedProjects('any')).toEqual([]);
        await expect(context.saveEntity({ id: 'x', name: 'X', type: 'person' } as any, true)).resolves.toBeUndefined();
        await expect(context.deleteEntity({ id: 'x', name: 'X', type: 'person' } as any)).resolves.toBe(true);
        expect(context.getEntityFilePath({ id: 'x', name: 'X', type: 'person' } as any)).toBe('/tmp/e.yaml');
        expect(context.getSmartAssistanceConfig().enabled).toBe(false);
    });

    it('throws when gcs backend has no context URI or bucket config', async () => {
        mockGetStorageConfig.mockReturnValue({ backend: 'gcs', gcs: {} });
        mockGetContext.mockReturnValue(null);
        mockIsInitialized.mockReturnValue(false);

        await expect(createToolContext('/tmp')).rejects.toThrow(
            'GCS storage is enabled but context URI/bucket configuration is missing.'
        );
    });
});
