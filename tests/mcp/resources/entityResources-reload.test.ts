import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('js-yaml', () => ({
    dump: vi.fn((obj: unknown) => `yaml:${JSON.stringify(obj)}`),
}));

vi.mock('../../../src/mcp/uri', () => ({
    buildEntityUri: vi.fn((type: string, id: string) => `protokoll://entity/${type}/${id}`),
    buildEntitiesListUri: vi.fn((type: string) => `protokoll://entities/${type}`),
}));

vi.mock('../../../src/mcp/tools/shared', () => ({
    createToolContext: vi.fn(),
}));

import * as ServerConfig from '../../../src/mcp/serverConfig';
import { createToolContext } from '../../../src/mcp/tools/shared';
import { readEntityResource } from '../../../src/mcp/resources/entityResources';

describe('entityResources reload and fallback', () => {
    const makeContext = () => ({
        hasContext: vi.fn().mockReturnValue(true),
        reload: vi.fn().mockResolvedValue(undefined),
        getPerson: vi.fn(),
        getProject: vi.fn(),
        getTerm: vi.fn(),
        getCompany: vi.fn(),
        getIgnored: vi.fn(),
        getAllPeople: vi.fn().mockReturnValue([]),
        getAllProjects: vi.fn().mockReturnValue([]),
        getAllTerms: vi.fn().mockReturnValue([]),
        getAllCompanies: vi.fn().mockReturnValue([]),
        getAllIgnored: vi.fn().mockReturnValue([]),
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(ServerConfig, 'isInitialized').mockReturnValue(false);
        vi.spyOn(ServerConfig, 'getStorageConfig').mockReturnValue({ backend: 'local' } as any);
        vi.spyOn(ServerConfig, 'getContext').mockReturnValue(null as any);
    });

    it('reloads the tool context before lookup', async () => {
        const context = makeContext();
        context.getPerson.mockReturnValue({ id: 'p1', name: 'Person One', type: 'person' });
        vi.mocked(createToolContext).mockResolvedValue(context as any);

        const result = await readEntityResource('person', 'p1');

        expect(context.reload).toHaveBeenCalledTimes(1);
        expect(context.getPerson).toHaveBeenCalledWith('p1');
        expect(result.uri).toBe('protokoll://entity/person/p1');
        expect(result.mimeType).toBe('application/yaml');
        expect(result.text).toContain('yaml:');
    });

    it('falls back to refreshed server context when tool context misses', async () => {
        const toolContext = makeContext();
        toolContext.getPerson.mockReturnValue(undefined);
        vi.mocked(createToolContext).mockResolvedValue(toolContext as any);

        const serverContext = makeContext();
        serverContext.getPerson.mockReturnValue({ id: 'p2', name: 'Person Two', type: 'person' });

        vi.spyOn(ServerConfig, 'isInitialized').mockReturnValue(true);
        vi.spyOn(ServerConfig, 'getContext').mockReturnValue(serverContext as any);

        const result = await readEntityResource('person', 'p2');

        expect(toolContext.reload).toHaveBeenCalledTimes(1);
        expect(toolContext.getPerson).toHaveBeenCalledWith('p2');
        expect(serverContext.reload).toHaveBeenCalledTimes(1);
        expect(serverContext.getPerson).toHaveBeenCalledWith('p2');
        expect(result.uri).toBe('protokoll://entity/person/p2');
    });
});
