/**
 * Extended tests for discoveryTools.ts
 *
 * Covers findProtokolkConfigs, getConfigInfo, suggestProjectsForFile,
 * handleDiscoverConfig, handleSuggestProject, and tool definitions.
 * Mocks @/context, shared (fileExists, sanitizePath), and serverConfig.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolve } from 'node:path';
import {
    findProtokolkConfigs,
    getConfigInfo,
    suggestProjectsForFile,
    handleDiscoverConfig,
    handleSuggestProject,
    discoverConfigTool,
    suggestProjectTool,
} from '../../../src/mcp/tools/discoveryTools';

// Hoisted mocks - must be defined before vi.mock factories
const mockCreate = vi.hoisted(() => vi.fn());
const mockFileExists = vi.hoisted(() => vi.fn());
const mockSanitizePath = vi.hoisted(() => vi.fn());
const mockGetWorkspaceRoot = vi.hoisted(() => vi.fn());
const mockStat = vi.hoisted(() => vi.fn());

vi.mock('@/context', () => ({
    create: (...args: unknown[]) => mockCreate(...args),
}));

vi.mock('../../../src/mcp/tools/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/mcp/tools/shared')>();
    return {
        ...actual,
        fileExists: (...args: unknown[]) => mockFileExists(...args),
        sanitizePath: (...args: unknown[]) => mockSanitizePath(...args),
    };
});

vi.mock('../../../src/mcp/serverConfig', () => ({
    getWorkspaceRoot: () => mockGetWorkspaceRoot(),
}));

vi.mock('node:fs/promises', () => ({
    stat: (...args: unknown[]) => mockStat(...args),
}));

describe('discoveryTools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetWorkspaceRoot.mockReturnValue('/workspace');
        mockSanitizePath.mockImplementation(async (p: string) => p);
    });

    describe('tool definitions', () => {
        it('discoverConfigTool has correct schema', () => {
            expect(discoverConfigTool.name).toBe('protokoll_discover_config');
            expect(discoverConfigTool.description).toContain('Discover Protokoll configurations');
            expect(discoverConfigTool.inputSchema).toMatchObject({
                type: 'object',
                properties: { path: { type: 'string' } },
                required: ['path'],
            });
        });

        it('suggestProjectTool has correct schema', () => {
            expect(suggestProjectTool.name).toBe('protokoll_suggest_project');
            expect(suggestProjectTool.description).toContain('Suggest which project');
            expect(suggestProjectTool.inputSchema).toMatchObject({
                type: 'object',
                properties: { audioFile: { type: 'string' } },
                required: ['audioFile'],
            });
        });
    });

    describe('findProtokolkConfigs', () => {
        it('returns empty array when no .protokoll dirs exist', async () => {
            mockFileExists.mockResolvedValue(false);

            const result = await findProtokolkConfigs('/some/path');
            expect(result).toEqual([]);
        });

        it('returns config paths when fileExists returns true for .protokoll', async () => {
            const configPath = resolve('/workspace/proj/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === configPath)
            );

            const result = await findProtokolkConfigs('/workspace/proj/subdir');
            expect(result).toContain(configPath);
        });

        it('stops at filesystem root', async () => {
            mockFileExists.mockResolvedValue(false);
            const result = await findProtokolkConfigs('/');
            expect(result).toEqual([]);
        });

        it('respects maxLevels', async () => {
            mockFileExists.mockResolvedValue(false);
            const result = await findProtokolkConfigs('/a/b/c/d/e/f/g/h/i/j/k', 3);
            expect(result).toEqual([]);
        });
    });

    describe('getConfigInfo', () => {
        it('returns DiscoveredConfig from context', async () => {
            const mockContext = {
                getConfig: vi.fn().mockReturnValue({
                    outputDirectory: '/out',
                    model: 'gpt-4',
                }),
                getAllProjects: vi.fn().mockReturnValue([{ id: '1' }]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            };
            mockCreate.mockResolvedValue(mockContext);

            const result = await getConfigInfo('/workspace/.protokoll');
            expect(result).toMatchObject({
                path: '/workspace/.protokoll',
                projectCount: 1,
                peopleCount: 0,
                termsCount: 0,
                companiesCount: 0,
                outputDirectory: '/out',
                model: 'gpt-4',
            });
            expect(mockCreate).toHaveBeenCalledWith({ startingDir: '/workspace' });
        });
    });

    describe('suggestProjectsForFile', () => {
        it('returns no-config message when no .protokoll found', async () => {
            mockFileExists.mockResolvedValue(false);

            const result = await suggestProjectsForFile('/tmp/audio.mp3');
            expect(result.configs).toEqual([]);
            expect(result.suggestions).toEqual([]);
            expect(result.needsUserInput).toBe(true);
            expect(result.message).toContain('No .protokoll configuration found');
        });

        it('returns projects-found-but-no-match when config exists but no suggestions', async () => {
            const configPath = resolve('/workspace/proj/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === configPath)
            );
            const mockContext = {
                getConfig: vi.fn().mockReturnValue({}),
                getAllProjects: vi.fn().mockReturnValue([
                    { id: '1', name: 'Proj', active: true, routing: { destination: '/other' } },
                ]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            };
            mockCreate.mockResolvedValue(mockContext);

            const result = await suggestProjectsForFile('/workspace/proj/audio.mp3');
            expect(result.configs.length).toBeGreaterThan(0);
            expect(result.suggestions).toEqual([]);
            expect(result.needsUserInput).toBe(true);
            expect(result.message).toContain('couldn\'t automatically determine');
        });

        it('returns no-projects message when config has zero projects', async () => {
            const configPath = resolve('/workspace/proj/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === configPath)
            );
            const mockContext = {
                getConfig: vi.fn().mockReturnValue({}),
                getAllProjects: vi.fn().mockReturnValue([]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            };
            mockCreate.mockResolvedValue(mockContext);

            const result = await suggestProjectsForFile('/workspace/proj/audio.mp3');
            expect(result.suggestions).toEqual([]);
            expect(result.message).toContain('no projects defined');
        });

        it('matches project by destination when audioDir includes destination', async () => {
            const configPath = resolve('/workspace/proj/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === configPath)
            );
            const mockContext = {
                getConfig: vi.fn().mockReturnValue({}),
                getAllProjects: vi.fn().mockReturnValue([
                    {
                        id: '1',
                        name: 'Meeting',
                        active: true,
                        routing: { destination: '/workspace/proj/recordings' },
                    },
                ]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            };
            mockCreate.mockResolvedValue(mockContext);

            const result = await suggestProjectsForFile('/workspace/proj/recordings/audio.mp3');
            expect(result.suggestions.length).toBeGreaterThan(0);
            expect(result.suggestions[0].projectName).toBe('Meeting');
            expect(result.suggestions[0].confidence).toBe(0.9);
            expect(result.needsUserInput).toBe(false);
        });

        it('matches project when destination includes audioDir', async () => {
            const configPath = resolve('/workspace/proj/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === configPath)
            );
            const mockContext = {
                getConfig: vi.fn().mockReturnValue({}),
                getAllProjects: vi.fn().mockReturnValue([
                    {
                        id: '1',
                        name: 'Proj',
                        active: true,
                        routing: { destination: '/workspace/proj/recordings' },
                    },
                ]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            };
            mockCreate.mockResolvedValue(mockContext);

            const result = await suggestProjectsForFile('/workspace/proj/audio.mp3');
            expect(result.suggestions.length).toBeGreaterThan(0);
            expect(result.suggestions[0].projectName).toBe('Proj');
        });

        it('matches project by explicit_phrases when dir name matches', async () => {
            const configPath = resolve('/workspace/proj/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === configPath)
            );
            const mockContext = {
                getConfig: vi.fn().mockReturnValue({}),
                getAllProjects: vi.fn().mockReturnValue([
                    {
                        id: '2',
                        name: 'Interview',
                        active: true,
                        classification: { explicit_phrases: ['interview'] },
                        routing: {},
                    },
                ]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            };
            mockCreate.mockResolvedValue(mockContext);

            const result = await suggestProjectsForFile('/workspace/proj/interview-2024/audio.mp3');
            expect(result.suggestions.length).toBeGreaterThan(0);
            expect(result.suggestions[0].projectName).toBe('Interview');
            expect(result.suggestions[0].confidence).toBe(0.7);
        });

        it('expands ~ in destination with HOME', async () => {
            const home = process.env.HOME || '/home/user';
            const configPath = resolve(`${home}/proj/.protokoll`);
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === configPath)
            );
            const mockContext = {
                getConfig: vi.fn().mockReturnValue({}),
                getAllProjects: vi.fn().mockReturnValue([
                    {
                        id: '1',
                        name: 'Home',
                        active: true,
                        routing: { destination: '~/proj/audio' },
                    },
                ]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            };
            mockCreate.mockResolvedValue(mockContext);

            const result = await suggestProjectsForFile(`${home}/proj/audio/file.mp3`);
            expect(result.suggestions.length).toBeGreaterThan(0);
        });

        it('filters out inactive projects', async () => {
            const configPath = resolve('/workspace/proj/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === configPath)
            );
            const mockContext = {
                getConfig: vi.fn().mockReturnValue({}),
                getAllProjects: vi.fn().mockReturnValue([
                    {
                        id: '1',
                        name: 'Inactive',
                        active: false,
                        routing: { destination: '/workspace/proj/recordings' },
                    },
                ]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            };
            mockCreate.mockResolvedValue(mockContext);

            const result = await suggestProjectsForFile('/workspace/proj/recordings/audio.mp3');
            expect(result.suggestions).toEqual([]);
        });

        it('deduplicates suggestions by projectId', async () => {
            const configPath = resolve('/workspace/proj/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === configPath)
            );
            const mockContext = {
                getConfig: vi.fn().mockReturnValue({}),
                getAllProjects: vi.fn().mockReturnValue([
                    {
                        id: '1',
                        name: 'Proj',
                        active: true,
                        routing: { destination: '/workspace/proj' },
                        classification: { explicit_phrases: ['proj'] },
                    },
                ]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            };
            mockCreate.mockResolvedValue(mockContext);

            const result = await suggestProjectsForFile('/workspace/proj/sub/audio.mp3');
            expect(result.suggestions.filter(s => s.projectId === '1').length).toBe(1);
        });

        it('returns needsUserInput true when multiple suggestions', async () => {
            const configPath = resolve('/workspace/proj/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === configPath)
            );
            const mockContext = {
                getConfig: vi.fn().mockReturnValue({}),
                getAllProjects: vi.fn().mockReturnValue([
                    {
                        id: '1',
                        name: 'A',
                        active: true,
                        routing: { destination: '/workspace/proj' },
                    },
                    {
                        id: '2',
                        name: 'B',
                        active: true,
                        routing: { destination: '/workspace/proj' },
                    },
                ]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            };
            mockCreate.mockResolvedValue(mockContext);

            const result = await suggestProjectsForFile('/workspace/proj/audio.mp3');
            expect(result.suggestions.length).toBe(2);
            expect(result.needsUserInput).toBe(true);
            expect(result.message).toContain('Please confirm');
        });
    });

    describe('handleDiscoverConfig', () => {
        it('throws when path does not exist', async () => {
            mockFileExists.mockResolvedValue(false);

            await expect(handleDiscoverConfig({ path: '/nonexistent' }))
                .rejects.toThrow('Path not found');
        });

        it('returns found:false when no configs in hierarchy', async () => {
            mockFileExists.mockImplementation((p: string) => {
                if (p === '/workspace/some/path') return Promise.resolve(true);
                return Promise.resolve(false);
            });
            mockStat.mockResolvedValue({ isDirectory: () => true });

            const result = await handleDiscoverConfig({ path: '/workspace/some/path' });
            expect(result.found).toBe(false);
            expect(result.configs).toEqual([]);
            expect(result.message).toContain('No .protokoll configuration found');
            expect(mockSanitizePath).toHaveBeenCalled();
        });

        it('uses dirname when path is a file', async () => {
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === '/workspace/file.txt')
            );
            mockStat.mockResolvedValue({ isDirectory: () => false });

            const configPath = resolve('/workspace/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === '/workspace/file.txt' || p === configPath)
            );

            const result = await handleDiscoverConfig({ path: '/workspace/file.txt' });
            expect(result.found).toBe(true);
        });

        it('returns found:true with configs when .protokoll exists', async () => {
            const configPath = resolve('/workspace/proj/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(
                    p === '/workspace/proj' || p === configPath
                )
            );
            mockStat.mockResolvedValue({ isDirectory: () => true });
            const mockContext = {
                getConfig: vi.fn().mockReturnValue({ outputDirectory: '/out', model: 'gpt-4' }),
                getAllProjects: vi.fn().mockReturnValue([]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            };
            mockCreate.mockResolvedValue(mockContext);

            const result = await handleDiscoverConfig({ path: '/workspace/proj' });
            expect(result.found).toBe(true);
            expect(result.configs.length).toBeGreaterThan(0);
            expect(result.summary).toBeDefined();
            expect(result.primaryConfig).toBeDefined();
        });

        it('uses process.cwd when getWorkspaceRoot returns null', async () => {
            mockGetWorkspaceRoot.mockReturnValue(null);
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === '/workspace')
            );
            mockStat.mockResolvedValue({ isDirectory: () => true });

            await handleDiscoverConfig({ path: '/workspace' });
            expect(mockSanitizePath).toHaveBeenCalledWith('/workspace', process.cwd());
        });

        it('returns single-config message when one config found', async () => {
            const configPath = resolve('/workspace/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === '/workspace' || p === configPath)
            );
            mockStat.mockResolvedValue({ isDirectory: () => true });
            mockCreate.mockResolvedValue({
                getConfig: () => ({}),
                getAllProjects: () => [],
                getAllPeople: () => [],
                getAllTerms: () => [],
                getAllCompanies: () => [],
            });

            const result = await handleDiscoverConfig({ path: '/workspace' });
            expect(result.message).toContain('Found Protokoll configuration at');
        });

        it('returns multiple-config message when several configs found', async () => {
            const configPath1 = resolve('/workspace/.protokoll');
            const configPath2 = resolve('/workspace/proj/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(
                    p === '/workspace/proj' ||
                        p === configPath1 ||
                        p === configPath2
                )
            );
            mockStat.mockResolvedValue({ isDirectory: () => true });
            mockCreate.mockResolvedValue({
                getConfig: () => ({}),
                getAllProjects: () => [],
                getAllPeople: () => [],
                getAllTerms: () => [],
                getAllCompanies: () => [],
            });

            const result = await handleDiscoverConfig({ path: '/workspace/proj' });
            expect(result.configs.length).toBeGreaterThan(1);
            expect(result.message).toContain('Protokoll configurations');
            expect(result.message).toContain('using nearest');
        });
    });

    describe('handleSuggestProject', () => {
        it('throws when audio file does not exist', async () => {
            mockFileExists.mockResolvedValue(false);

            await expect(handleSuggestProject({ audioFile: '/tmp/missing.mp3' }))
                .rejects.toThrow('Audio file not found');
        });

        it('returns result with instructions when file exists', async () => {
            const configPath = resolve('/workspace/proj/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(
                    p === '/workspace/proj/audio.mp3' || p === configPath
                )
            );
            mockCreate.mockResolvedValue({
                getConfig: () => ({}),
                getAllProjects: () => [
                    {
                        id: '1',
                        name: 'Proj',
                        active: true,
                        routing: { destination: '/workspace/proj' },
                    },
                ],
                getAllPeople: () => [],
                getAllTerms: () => [],
                getAllCompanies: () => [],
            });

            const result = await handleSuggestProject({ audioFile: '/workspace/proj/audio.mp3' });
            expect(result.audioFile).toContain('audio.mp3');
            expect(result.instructions).toBeDefined();
        });

        it('includes needsUserInput instructions when user input needed', async () => {
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === '/workspace/audio.mp3')
            );
            mockCreate.mockResolvedValue({
                getConfig: () => ({}),
                getAllProjects: () => [{ id: '1', name: 'P', active: true }],
                getAllPeople: () => [],
                getAllTerms: () => [],
                getAllCompanies: () => [],
            });
            const configPath = resolve('/workspace/.protokoll');
            mockFileExists.mockImplementation((p: string) =>
                Promise.resolve(p === '/workspace/audio.mp3' || p === configPath)
            );

            const result = await handleSuggestProject({ audioFile: '/workspace/audio.mp3' });
            expect(result.instructions).toContain('Please specify which project');
        });
    });
});
