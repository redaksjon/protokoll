/**
 * Tests for Config Resource
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import * as ServerConfig from '../../../src/mcp/serverConfig';

// Mock dependencies
vi.mock('@/context', () => ({
    create: vi.fn().mockResolvedValue({
        hasContext: vi.fn().mockReturnValue(true),
        getDiscoveredDirs: vi.fn().mockReturnValue([
            { path: '/test/.protokoll', level: 0 },
            { path: '/test/parent/.protokoll', level: 1 },
        ]),
        getConfig: vi.fn().mockReturnValue({
            outputDirectory: '/test/output',
            outputStructure: 'month',
            model: 'gpt-4',
        }),
        getAllProjects: vi.fn().mockReturnValue([{ id: 'p1' }, { id: 'p2' }]),
        getAllPeople: vi.fn().mockReturnValue([{ id: 'person1' }]),
        getAllTerms: vi.fn().mockReturnValue([{ id: 't1' }, { id: 't2' }, { id: 't3' }]),
        getAllCompanies: vi.fn().mockReturnValue([]),
        getAllIgnored: vi.fn().mockReturnValue([{ id: 'i1' }]),
        getSmartAssistanceConfig: vi.fn().mockReturnValue({
            enabled: true,
            model: 'gpt-4',
        }),
    }),
}));

vi.mock('../../../src/mcp/uri', () => ({
    buildConfigUri: vi.fn((path?: string) => `protokoll://config${path ? `?path=${path}` : ''}`),
    buildEntitiesListUri: vi.fn((type: string) => `protokoll://entities/${type}`),
}));

import { readConfigResource } from '../../../src/mcp/resources/configResource';

describe('configResource', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('readConfigResource', () => {
        it('should read config resource', async () => {
            const result = await readConfigResource();
            
            expect(result).toBeDefined();
            expect(result.uri).toContain('config');
            expect(result.mimeType).toBe('application/json');
        });

        it('should include discovered directories', async () => {
            const result = await readConfigResource();
            
            const data = JSON.parse(result.text);
            expect(data.discoveredDirectories).toBeDefined();
            expect(Array.isArray(data.discoveredDirectories)).toBe(true);
            expect(data.discoveredDirectories).toHaveLength(2);
        });

        it('should mark primary directory', async () => {
            const result = await readConfigResource();
            
            const data = JSON.parse(result.text);
            const primaryDir = data.discoveredDirectories.find((d: any) => d.isPrimary);
            expect(primaryDir).toBeDefined();
            expect(primaryDir.level).toBe(0);
        });

        it('should include entity counts', async () => {
            const result = await readConfigResource();
            
            const data = JSON.parse(result.text);
            expect(data.entityCounts).toBeDefined();
            expect(data.entityCounts.projects).toBe(2);
            expect(data.entityCounts.people).toBe(1);
            expect(data.entityCounts.terms).toBe(3);
            expect(data.entityCounts.companies).toBe(0);
            expect(data.entityCounts.ignored).toBe(1);
        });

        it('should include config settings', async () => {
            const result = await readConfigResource();
            
            const data = JSON.parse(result.text);
            expect(data.config).toBeDefined();
            expect(data.config.outputDirectory).toBe('/test/output');
            expect(data.config.outputStructure).toBe('month');
            expect(data.config.model).toBe('gpt-4');
        });

        it('should include smart assistance config', async () => {
            const result = await readConfigResource();
            
            const data = JSON.parse(result.text);
            expect(data.config.smartAssistance).toBeDefined();
            expect(data.config.smartAssistance.enabled).toBe(true);
        });

        it('should include resource URIs', async () => {
            const result = await readConfigResource();
            
            const data = JSON.parse(result.text);
            expect(data.resourceUris).toBeDefined();
            expect(data.resourceUris.projects).toContain('entities/project');
            expect(data.resourceUris.people).toContain('entities/person');
            expect(data.resourceUris.terms).toContain('entities/term');
            expect(data.resourceUris.companies).toContain('entities/company');
        });

        it('should handle custom config path', async () => {
            const result = await readConfigResource('/custom/path');
            
            expect(result).toBeDefined();
        });

        it('should throw when no context found', async () => {
            const Context = await import('@/context');
            vi.mocked(Context.create).mockResolvedValueOnce({
                hasContext: vi.fn().mockReturnValue(false),
            } as any);
            
            await expect(
                readConfigResource('/no/context')
            ).rejects.toThrow('No Protokoll context found');
        });

        it('should use cwd when no path provided', async () => {
            const result = await readConfigResource();
            
            expect(result).toBeDefined();
        });

        it('should use initialized server context when available', async () => {
            const Context = await import('@/context');
            const createSpy = vi.mocked(Context.create);
            createSpy.mockClear();

            const serverContext = {
                hasContext: vi.fn().mockReturnValue(true),
                getDiscoveredDirs: vi.fn().mockReturnValue([{ path: '/server/.protokoll', level: 0 }]),
                getConfig: vi.fn().mockReturnValue({
                    outputDirectory: '/server/output',
                    outputStructure: 'month',
                    model: 'gpt-5',
                }),
                getAllProjects: vi.fn().mockReturnValue([]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
                getAllIgnored: vi.fn().mockReturnValue([]),
                getSmartAssistanceConfig: vi.fn().mockReturnValue({ enabled: false }),
            };

            vi.spyOn(ServerConfig, 'isInitialized').mockReturnValue(true);
            vi.spyOn(ServerConfig, 'getContext').mockReturnValue(serverContext as any);
            vi.spyOn(ServerConfig, 'getWorkspaceRoot').mockReturnValue('/workspace/root');

            const result = await readConfigResource();
            const data = JSON.parse(result.text);

            expect(data.hasContext).toBe(true);
            expect(createSpy).not.toHaveBeenCalled();
        });

        it('should build context directories from server config when server context is unavailable', async () => {
            const Context = await import('@/context');
            const createSpy = vi.mocked(Context.create);
            createSpy.mockClear();

            vi.spyOn(ServerConfig, 'isInitialized').mockReturnValue(true);
            vi.spyOn(ServerConfig, 'getContext').mockReturnValue(null);
            vi.spyOn(ServerConfig, 'getWorkspaceRoot').mockReturnValue('/workspace/root');
            vi.spyOn(ServerConfig, 'getServerConfig').mockReturnValue({
                configFile: {
                    contextDirectories: ['contexts', '/absolute/contexts'],
                },
            } as any);

            await readConfigResource();

            expect(createSpy).toHaveBeenCalledWith({
                startingDir: '/workspace/root',
                contextDirectories: ['/workspace/root/contexts', '/absolute/contexts'],
            });
        });

        it('should tolerate server config access errors and fall back cleanly', async () => {
            const Context = await import('@/context');
            const createSpy = vi.mocked(Context.create);
            createSpy.mockClear();

            vi.spyOn(ServerConfig, 'isInitialized').mockReturnValue(true);
            vi.spyOn(ServerConfig, 'getContext').mockReturnValue(null);
            vi.spyOn(ServerConfig, 'getWorkspaceRoot').mockImplementation(() => {
                throw new Error('workspace error');
            });
            vi.spyOn(ServerConfig, 'getServerConfig').mockImplementation(() => {
                throw new Error('config error');
            });

            await readConfigResource('/explicit/path');

            expect(createSpy).toHaveBeenCalledWith({
                startingDir: '/explicit/path',
                contextDirectories: undefined,
            });
        });
    });
});
