/**
 * Extended tests for contextTools handlers.
 * Focus on error paths, edge cases, and getContextInstance branches.
 * Mocks @/context, @/mcp/serverConfig, and @redaksjon/protokoll-engine.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted mocks - must be defined before vi.mock factories
const mockCreate = vi.hoisted(() => vi.fn());
const mockGetContext = vi.hoisted(() => vi.fn());
const mockIsRemoteMode = vi.hoisted(() => vi.fn());
const mockFindPersonResilient = vi.hoisted(() => vi.fn());
const mockFindProjectResilient = vi.hoisted(() => vi.fn());
const mockFindTermResilient = vi.hoisted(() => vi.fn());
const mockFindCompanyResilient = vi.hoisted(() => vi.fn());
const mockFindIgnoredResilient = vi.hoisted(() => vi.fn());

vi.mock('@/context', () => ({
    create: (...args: unknown[]) => mockCreate(...args),
}));

vi.mock('@/mcp/serverConfig', () => ({
    getContext: () => mockGetContext(),
    isRemoteMode: () => mockIsRemoteMode(),
}));

vi.mock('@redaksjon/protokoll-engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@redaksjon/protokoll-engine')>();
    return {
        ...actual,
        findPersonResilient: (...args: unknown[]) => mockFindPersonResilient(...args),
        findTermResilient: (...args: unknown[]) => mockFindTermResilient(...args),
        findCompanyResilient: (...args: unknown[]) => mockFindCompanyResilient(...args),
        findProjectResilient: (...args: unknown[]) => mockFindProjectResilient(...args),
        findIgnoredResilient: (...args: unknown[]) => mockFindIgnoredResilient(...args),
    };
});

import {
    handleContextStatus,
    handleListProjects,
    handleListPeople,
    handleListTerms,
    handleListCompanies,
    handleSearchContext,
    handleGetEntity,
} from '../../../src/mcp/tools/contextTools';

describe('contextTools handlers (extended)', () => {
    const mockContext = {
        hasContext: vi.fn().mockReturnValue(true),
        getDiscoveredDirs: vi.fn().mockReturnValue([{ path: '/test/.protokoll', level: 0 }]),
        getConfig: vi.fn().mockReturnValue({
            outputDirectory: '/test/output',
            outputStructure: 'flat',
            model: 'gpt-4',
        }),
        getAllProjects: vi.fn().mockReturnValue([]),
        getAllPeople: vi.fn().mockReturnValue([]),
        getAllTerms: vi.fn().mockReturnValue([]),
        getAllCompanies: vi.fn().mockReturnValue([]),
        getAllIgnored: vi.fn().mockReturnValue([]),
        search: vi.fn().mockReturnValue([]),
        getEntityFilePath: vi.fn().mockReturnValue('/test/.protokoll/context/people/test.yaml'),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsRemoteMode.mockReturnValue(false);
        mockGetContext.mockReturnValue(null);
        mockCreate.mockResolvedValue(mockContext);
    });

    describe('getContextInstance (via handlers) - remote mode', () => {
        it('throws when contextDirectory is provided in remote mode', async () => {
            mockIsRemoteMode.mockReturnValue(true);

            await expect(
                handleContextStatus({ contextDirectory: '/some/dir' })
            ).rejects.toThrow(
                'contextDirectory parameter is not accepted in remote mode'
            );
            expect(mockCreate).not.toHaveBeenCalled();
        });

        it('does not throw when contextDirectory is omitted in remote mode', async () => {
            mockIsRemoteMode.mockReturnValue(true);
            mockGetContext.mockReturnValue(mockContext);

            const result = await handleContextStatus({});
            expect(result.hasContext).toBe(true);
            expect(mockCreate).not.toHaveBeenCalled();
        });
    });

    describe('getContextInstance - server context', () => {
        it('uses server context when getContext returns non-null', async () => {
            mockGetContext.mockReturnValue(mockContext);

            const result = await handleContextStatus({});
            expect(result.hasContext).toBe(true);
            expect(mockCreate).not.toHaveBeenCalled();
        });

        it('falls back to Context.create when getContext returns null', async () => {
            mockGetContext.mockReturnValue(null);

            const result = await handleContextStatus({ contextDirectory: '/custom/dir' });
            expect(result.hasContext).toBe(true);
            expect(mockCreate).toHaveBeenCalledWith({ startingDir: '/custom/dir' });
        });

        it('uses process.cwd when contextDirectory is omitted and getContext is null', async () => {
            mockGetContext.mockReturnValue(null);

            await handleContextStatus({});
            expect(mockCreate).toHaveBeenCalledWith({ startingDir: process.cwd() });
        });
    });

    describe('handleContextStatus', () => {
        it('returns status with entity counts and config', async () => {
            mockContext.getAllProjects.mockReturnValue([{ id: 'p1', name: 'Proj' }]);
            mockContext.getAllPeople.mockReturnValue([]);
            mockContext.getAllTerms.mockReturnValue([]);
            mockContext.getAllCompanies.mockReturnValue([]);
            mockContext.getAllIgnored.mockReturnValue([]);

            const result = await handleContextStatus({});
            expect(result).toMatchObject({
                hasContext: true,
                discoveredDirectories: expect.any(Array),
                entityCounts: {
                    projects: 1,
                    people: 0,
                    terms: 0,
                    companies: 0,
                    ignored: 0,
                },
                config: {
                    outputDirectory: '/test/output',
                    outputStructure: 'flat',
                    model: 'gpt-4',
                },
            });
        });
    });

    describe('handleListProjects', () => {
        it('filters inactive projects when includeInactive is false', async () => {
            mockContext.getAllProjects.mockReturnValue([
                { id: 'p1', name: 'Active', active: true, routing: {}, classification: {} },
                { id: 'p2', name: 'Inactive', active: false, routing: {}, classification: {} },
            ]);

            const result = await handleListProjects({ includeInactive: false });
            expect(result.projects).toHaveLength(1);
            expect(result.projects[0].id).toBe('p1');
        });

        it('includes inactive projects when includeInactive is true', async () => {
            mockContext.getAllProjects.mockReturnValue([
                { id: 'p1', name: 'Active', active: true, routing: {}, classification: {} },
                { id: 'p2', name: 'Inactive', active: false, routing: {}, classification: {} },
            ]);

            const result = await handleListProjects({ includeInactive: true });
            expect(result.projects).toHaveLength(2);
        });

        it('applies pagination with limit and offset', async () => {
            mockContext.getAllProjects.mockReturnValue([
                { id: 'p1', name: 'Project 1', active: true, routing: {}, classification: {} },
                { id: 'p2', name: 'Project 2', active: true, routing: {}, classification: {} },
                { id: 'p3', name: 'Project 3', active: true, routing: {}, classification: {} },
            ]);

            const result = await handleListProjects({ limit: 2, offset: 1 });
            expect(result.total).toBe(3);
            expect(result.limit).toBe(2);
            expect(result.offset).toBe(1);
            expect(result.count).toBe(2);
            expect(result.projects).toHaveLength(2);
            expect(result.projects[0].id).toBe('p2');
            expect(result.projects[1].id).toBe('p3');
        });

        it('filters by search query', async () => {
            mockContext.getAllProjects.mockReturnValue([
                { id: 'alpha-project', name: 'Alpha Project', active: true, routing: {}, classification: {} },
                { id: 'beta-project', name: 'Beta Project', active: true, routing: {}, classification: {} },
            ]);

            const result = await handleListProjects({ search: 'alpha' });
            expect(result.total).toBe(1);
            expect(result.projects).toHaveLength(1);
            expect(result.projects[0].id).toBe('alpha-project');
        });
    });

    describe('handleListPeople', () => {
        it('returns people with expected shape', async () => {
            mockContext.getAllPeople.mockReturnValue([
                { id: 'alice', name: 'Alice', company: 'Acme', role: 'Engineer', sounds_like: [] },
            ]);

            const result = await handleListPeople({});
            expect(result.count).toBe(1);
            expect(result.people[0]).toMatchObject({
                id: 'alice',
                name: 'Alice',
                company: 'Acme',
                role: 'Engineer',
            });
        });

        it('applies pagination', async () => {
            mockContext.getAllPeople.mockReturnValue([
                { id: 'alice', name: 'Alice', company: 'Acme', role: 'Engineer', sounds_like: [] },
                { id: 'bob', name: 'Bob', company: 'Acme', role: 'Manager', sounds_like: [] },
                { id: 'charlie', name: 'Charlie', company: 'Acme', role: 'Designer', sounds_like: [] },
            ]);

            const result = await handleListPeople({ limit: 2, offset: 1 });
            expect(result.total).toBe(3);
            expect(result.count).toBe(2);
            expect(result.people[0].id).toBe('bob');
        });

        it('filters by search including sounds_like', async () => {
            mockContext.getAllPeople.mockReturnValue([
                { id: 'alice', name: 'Alice', company: 'Acme', role: 'Engineer', sounds_like: ['Alicia'] },
                { id: 'bob', name: 'Bob', company: 'Acme', role: 'Manager', sounds_like: [] },
            ]);

            const result = await handleListPeople({ search: 'Alicia' });
            expect(result.total).toBe(1);
            expect(result.people[0].id).toBe('alice');
        });
    });

    describe('handleListTerms', () => {
        it('returns terms with expected shape', async () => {
            mockContext.getAllTerms.mockReturnValue([
                { id: 'api', name: 'API', expansion: 'Application Programming Interface', domain: 'tech', sounds_like: [] },
            ]);

            const result = await handleListTerms({});
            expect(result.count).toBe(1);
            expect(result.terms[0]).toMatchObject({
                id: 'api',
                name: 'API',
                expansion: 'Application Programming Interface',
            });
        });
    });

    describe('handleListCompanies', () => {
        it('returns companies with expected shape', async () => {
            mockContext.getAllCompanies.mockReturnValue([
                { id: 'acme', name: 'Acme', fullName: 'Acme Corp', industry: 'Tech', sounds_like: [] },
            ]);

            const result = await handleListCompanies({});
            expect(result.count).toBe(1);
            expect(result.companies[0]).toMatchObject({
                id: 'acme',
                name: 'Acme',
                fullName: 'Acme Corp',
            });
        });
    });

    describe('handleSearchContext', () => {
        it('returns search results with formatEntity shape', async () => {
            mockContext.search.mockReturnValue([
                { id: 'p1', name: 'Project Alpha', type: 'project' },
            ]);

            const result = await handleSearchContext({ query: 'alpha' });
            expect(result.query).toBe('alpha');
            expect(result.count).toBe(1);
            expect(result.results[0]).toMatchObject({ id: 'p1', name: 'Project Alpha', type: 'project' });
        });

        it('applies pagination to search results', async () => {
            mockContext.search.mockReturnValue([
                { id: 'p1', name: 'Project Alpha', type: 'project' },
                { id: 'p2', name: 'Project Beta', type: 'project' },
                { id: 'p3', name: 'Project Gamma', type: 'project' },
            ]);

            const result = await handleSearchContext({ query: 'project', limit: 2, offset: 1 });
            expect(result.total).toBe(3);
            expect(result.count).toBe(2);
            expect(result.results[0].id).toBe('p2');
        });
    });

    describe('handleGetEntity', () => {
        const mockEntity = {
            id: 'test-entity',
            name: 'Test Entity',
            type: 'person' as const,
        };

        it('returns entity for project type', async () => {
            mockFindProjectResilient.mockReturnValue(mockEntity);

            const result = await handleGetEntity({
                entityType: 'project',
                entityId: 'test-entity',
            });
            expect(result).toMatchObject({ id: 'test-entity', name: 'Test Entity' });
            expect(result.filePath).toBe('/test/.protokoll/context/people/test.yaml');
            expect(mockFindProjectResilient).toHaveBeenCalledWith(mockContext, 'test-entity');
        });

        it('returns entity for person type', async () => {
            mockFindPersonResilient.mockReturnValue(mockEntity);

            const result = await handleGetEntity({
                entityType: 'person',
                entityId: 'test-entity',
            });
            expect(result).toMatchObject({ id: 'test-entity', name: 'Test Entity' });
            expect(mockFindPersonResilient).toHaveBeenCalledWith(mockContext, 'test-entity');
        });

        it('returns entity for term type', async () => {
            mockFindTermResilient.mockReturnValue(mockEntity);

            const result = await handleGetEntity({
                entityType: 'term',
                entityId: 'test-entity',
            });
            expect(result).toMatchObject({ id: 'test-entity', name: 'Test Entity' });
            expect(mockFindTermResilient).toHaveBeenCalledWith(mockContext, 'test-entity');
        });

        it('returns entity for company type', async () => {
            mockFindCompanyResilient.mockReturnValue(mockEntity);

            const result = await handleGetEntity({
                entityType: 'company',
                entityId: 'test-entity',
            });
            expect(result).toMatchObject({ id: 'test-entity', name: 'Test Entity' });
            expect(mockFindCompanyResilient).toHaveBeenCalledWith(mockContext, 'test-entity');
        });

        it('returns entity for ignored type', async () => {
            mockFindIgnoredResilient.mockReturnValue(mockEntity);

            const result = await handleGetEntity({
                entityType: 'ignored',
                entityId: 'test-entity',
            });
            expect(result).toMatchObject({ id: 'test-entity', name: 'Test Entity' });
            expect(mockFindIgnoredResilient).toHaveBeenCalledWith(mockContext, 'test-entity');
        });

        it('throws for unknown entity type', async () => {
            await expect(
                handleGetEntity({
                    entityType: 'unknown' as 'project',
                    entityId: 'test-entity',
                })
            ).rejects.toThrow('Unknown entity type: unknown');
        });
    });
});
