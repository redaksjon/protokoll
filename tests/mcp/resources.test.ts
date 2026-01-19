/**
 * Tests for MCP Resources Module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as Resources from '../../src/mcp/resources';
import * as Context from '../../src/context';

// Mock dependencies
vi.mock('../../src/context', () => ({
    create: vi.fn(),
}));

vi.mock('../../src/cli/transcript', () => ({
    listTranscripts: vi.fn(),
}));

vi.mock('../../src/mcp/uri', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        buildTranscriptUri: vi.fn((path: string) => `protokoll://transcript/${path}`),
        buildEntityUri: vi.fn((type: string, id: string) => `protokoll://entity/${type}/${id}`),
        buildConfigUri: vi.fn((path?: string) => `protokoll://config${path ? `?path=${path}` : ''}`),
        buildTranscriptsListUri: vi.fn((opts: any) => `protokoll://transcripts?directory=${opts.directory}`),
        buildEntitiesListUri: vi.fn((type: string) => `protokoll://entities/${type}`),
    };
});

describe('MCP Resources', () => {
    let tempDir: string;
    let mockContext: any;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-resources-test-'));
        
        mockContext = {
            hasContext: vi.fn(() => true),
            getDiscoveredDirs: vi.fn(() => [
                { path: `${tempDir}/.protokoll`, level: 0 }
            ]),
            getConfig: vi.fn(() => ({
                outputDirectory: `${tempDir}/output`,
                outputStructure: 'month',
                model: 'gpt-4',
            })),
            getSmartAssistanceConfig: vi.fn(() => ({
                enabled: true,
            })),
            getAllProjects: vi.fn(() => [
                { id: 'project1', name: 'Project 1' },
                { id: 'project2', name: 'Project 2' },
            ]),
            getAllPeople: vi.fn(() => [
                { id: 'person1', name: 'Person 1', company: 'company1', role: 'Developer' },
            ]),
            getAllTerms: vi.fn(() => [
                { id: 'term1', name: 'Term 1', expansion: 'T1', domain: 'engineering' },
            ]),
            getAllCompanies: vi.fn(() => [
                { id: 'company1', name: 'Company 1', fullName: 'Company One Inc', industry: 'Tech' },
            ]),
            getAllIgnored: vi.fn(() => [
                { id: 'ignored1', name: 'Ignored 1', reason: 'Test' },
            ]),
            getPerson: vi.fn((id: string) => id === 'person1' ? { id: 'person1', name: 'Person 1' } : null),
            getProject: vi.fn((id: string) => id === 'project1' ? { id: 'project1', name: 'Project 1' } : null),
            getTerm: vi.fn((id: string) => id === 'term1' ? { id: 'term1', name: 'Term 1' } : null),
            getCompany: vi.fn((id: string) => id === 'company1' ? { id: 'company1', name: 'Company 1' } : null),
            getIgnored: vi.fn((id: string) => id === 'ignored1' ? { id: 'ignored1', name: 'Ignored 1' } : null),
        };

        vi.mocked(Context.create).mockResolvedValue(mockContext);
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('resourceTemplates', () => {
        it('should export resource templates', () => {
            expect(Resources.resourceTemplates).toBeDefined();
            expect(Array.isArray(Resources.resourceTemplates)).toBe(true);
            expect(Resources.resourceTemplates.length).toBeGreaterThan(0);
        });

        it('should have transcript template', () => {
            const transcriptTemplate = Resources.resourceTemplates.find(
                t => t.uriTemplate === 'protokoll://transcript/{path}'
            );
            expect(transcriptTemplate).toBeDefined();
            expect(transcriptTemplate?.name).toBe('Transcript');
            expect(transcriptTemplate?.mimeType).toBe('text/markdown');
        });

        it('should have entity template', () => {
            const entityTemplate = Resources.resourceTemplates.find(
                t => t.uriTemplate === 'protokoll://entity/{type}/{id}'
            );
            expect(entityTemplate).toBeDefined();
            expect(entityTemplate?.name).toBe('Context Entity');
            expect(entityTemplate?.mimeType).toBe('application/yaml');
        });

        it('should have config template', () => {
            const configTemplate = Resources.resourceTemplates.find(
                t => t.uriTemplate === 'protokoll://config'
            );
            expect(configTemplate).toBeDefined();
            expect(configTemplate?.mimeType).toBe('application/json');
        });
    });

    describe('handleListResources', () => {
        it('should return resources and templates', async () => {
            const result = await Resources.handleListResources(tempDir);

            expect(result.resources).toBeDefined();
            expect(result.resourceTemplates).toBeDefined();
            expect(result.resourceTemplates).toBe(Resources.resourceTemplates);
        });

        it('should include dynamic config resource when context available', async () => {
            const result = await Resources.handleListResources(tempDir);

            expect(result.resources.length).toBeGreaterThan(0);
        });

        it('should return empty resources when no context', async () => {
            mockContext.hasContext = vi.fn(() => false);

            const result = await Resources.handleListResources(tempDir);

            expect(result.resources).toEqual([]);
        });

        it('should handle context creation errors gracefully', async () => {
            vi.mocked(Context.create).mockRejectedValue(new Error('Context error'));

            const result = await Resources.handleListResources(tempDir);

            expect(result.resources).toEqual([]);
            expect(result.resourceTemplates).toBeDefined();
        });
    });

    describe('readTranscriptResource', () => {
        it('should read a transcript file', async () => {
            const transcriptPath = path.join(tempDir, 'test.md');
            await fs.writeFile(transcriptPath, '# Test Transcript\n\nContent here.');

            const result = await Resources.readTranscriptResource(transcriptPath);

            expect(result.uri).toContain('protokoll://transcript/');
            expect(result.mimeType).toBe('text/markdown');
            expect(result.text).toContain('Test Transcript');
        });

        it('should handle relative paths', async () => {
            const transcriptPath = 'test.md';
            await fs.writeFile(path.join(process.cwd(), transcriptPath), 'Content');

            const result = await Resources.readTranscriptResource(transcriptPath);

            expect(result.text).toBe('Content');
            
            // Cleanup
            await fs.unlink(path.join(process.cwd(), transcriptPath));
        });

        it('should throw error for missing file', async () => {
            await expect(
                Resources.readTranscriptResource('/nonexistent/file.md')
            ).rejects.toThrow('Transcript not found');
        });

        // Note: Cannot easily spy on ESM exports in vitest
        // Testing non-ENOENT errors would require a different approach
    });

    describe('readEntityResource', () => {
        it('should read a person entity', async () => {
            const result = await Resources.readEntityResource('person', 'person1', tempDir);

            expect(result.uri).toContain('person/person1');
            expect(result.mimeType).toBe('application/yaml');
            expect(result.text).toBeDefined();
            expect(result.text).toContain('person1');
        });

        it('should read a project entity', async () => {
            const result = await Resources.readEntityResource('project', 'project1', tempDir);

            expect(result.uri).toContain('project/project1');
            expect(result.text).toContain('project1');
        });

        it('should read a term entity', async () => {
            const result = await Resources.readEntityResource('term', 'term1', tempDir);

            expect(result.uri).toContain('term/term1');
            expect(result.text).toContain('term1');
        });

        it('should read a company entity', async () => {
            const result = await Resources.readEntityResource('company', 'company1', tempDir);

            expect(result.uri).toContain('company/company1');
            expect(result.text).toContain('company1');
        });

        it('should read an ignored entity', async () => {
            const result = await Resources.readEntityResource('ignored', 'ignored1', tempDir);

            expect(result.uri).toContain('ignored/ignored1');
            expect(result.text).toContain('ignored1');
        });

        it('should throw error for unknown entity type', async () => {
            await expect(
                Resources.readEntityResource('unknown', 'id', tempDir)
            ).rejects.toThrow('Unknown entity type');
        });

        it('should throw error for non-existent entity', async () => {
            await expect(
                Resources.readEntityResource('person', 'nonexistent', tempDir)
            ).rejects.toThrow('not found');
        });
    });

    describe('readConfigResource', () => {
        it('should read config for a directory', async () => {
            const result = await Resources.readConfigResource(tempDir);

            expect(result.uri).toContain('protokoll://config');
            expect(result.mimeType).toBe('application/json');
            expect(result.text).toBeDefined();

            const config = JSON.parse(result.text!);
            expect(config.hasContext).toBe(true);
            expect(config.discoveredDirectories).toBeDefined();
            expect(config.entityCounts).toBeDefined();
            expect(config.config).toBeDefined();
        });

        it('should include entity counts', async () => {
            const result = await Resources.readConfigResource(tempDir);
            const config = JSON.parse(result.text!);

            expect(config.entityCounts.projects).toBe(2);
            expect(config.entityCounts.people).toBe(1);
            expect(config.entityCounts.terms).toBe(1);
            expect(config.entityCounts.companies).toBe(1);
            expect(config.entityCounts.ignored).toBe(1);
        });

        it('should include resource URIs', async () => {
            const result = await Resources.readConfigResource(tempDir);
            const config = JSON.parse(result.text!);

            expect(config.resourceUris.projects).toBeDefined();
            expect(config.resourceUris.people).toBeDefined();
            expect(config.resourceUris.terms).toBeDefined();
            expect(config.resourceUris.companies).toBeDefined();
        });

        it('should throw error when no context found', async () => {
            mockContext.hasContext = vi.fn(() => false);

            await expect(
                Resources.readConfigResource(tempDir)
            ).rejects.toThrow('No Protokoll context found');
        });

        it('should use current directory when no path provided', async () => {
            const result = await Resources.readConfigResource();

            expect(result).toBeDefined();
            expect(Context.create).toHaveBeenCalled();
        });
    });

    describe('readTranscriptsListResource', () => {
        beforeEach(async () => {
            const { listTranscripts } = await import('../../src/cli/transcript');
            vi.mocked(listTranscripts).mockResolvedValue({
                transcripts: [
                    {
                        path: `${tempDir}/transcript1.md`,
                        filename: 'transcript1.md',
                        date: '2026-01-15',
                        time: '14:30',
                        title: 'Test Transcript 1',
                    },
                    {
                        path: `${tempDir}/transcript2.md`,
                        filename: 'transcript2.md',
                        date: '2026-01-16',
                        time: '10:00',
                        title: 'Test Transcript 2',
                    },
                ],
                total: 2,
                limit: 50,
                offset: 0,
                hasMore: false,
            });
        });

        it('should list transcripts in a directory', async () => {
            const result = await Resources.readTranscriptsListResource({
                directory: tempDir,
            });

            expect(result.uri).toBeDefined();
            expect(result.mimeType).toBe('application/json');
            
            const data = JSON.parse(result.text!);
            expect(data.transcripts).toHaveLength(2);
            expect(data.directory).toBe(tempDir);
        });

        it('should include transcript URIs', async () => {
            const result = await Resources.readTranscriptsListResource({
                directory: tempDir,
            });

            const data = JSON.parse(result.text!);
            expect(data.transcripts[0].uri).toBeDefined();
            expect(data.transcripts[0].uri).toContain('protokoll://transcript/');
        });

        it('should include pagination info', async () => {
            const result = await Resources.readTranscriptsListResource({
                directory: tempDir,
            });

            const data = JSON.parse(result.text!);
            expect(data.pagination).toBeDefined();
            expect(data.pagination.total).toBe(2);
            expect(data.pagination.limit).toBe(50);
            expect(data.pagination.offset).toBe(0);
            expect(data.pagination.hasMore).toBe(false);
        });

        it('should handle custom limit and offset', async () => {
            const { listTranscripts } = await import('../../src/cli/transcript');
            vi.mocked(listTranscripts).mockResolvedValue({
                transcripts: [],
                total: 0,
                limit: 10,
                offset: 5,
                hasMore: false,
            });

            const result = await Resources.readTranscriptsListResource({
                directory: tempDir,
                limit: 10,
                offset: 5,
            });

            const data = JSON.parse(result.text!);
            expect(data.pagination.limit).toBe(10);
            expect(data.pagination.offset).toBe(5);
        });

        it('should include date filters in response', async () => {
            const result = await Resources.readTranscriptsListResource({
                directory: tempDir,
                startDate: '2026-01-01',
                endDate: '2026-01-31',
            });

            const data = JSON.parse(result.text!);
            expect(data.filters.startDate).toBe('2026-01-01');
            expect(data.filters.endDate).toBe('2026-01-31');
        });

        it('should throw error when directory not provided', async () => {
            await expect(
                Resources.readTranscriptsListResource({ directory: '' })
            ).rejects.toThrow('Directory is required');
        });

        it('should use default limit when not specified', async () => {
            const result = await Resources.readTranscriptsListResource({
                directory: tempDir,
            });

            const data = JSON.parse(result.text!);
            expect(data.pagination.limit).toBe(50);
        });
    });

    describe('readEntitiesListResource', () => {
        it('should list people entities', async () => {
            const result = await Resources.readEntitiesListResource('person', tempDir);

            expect(result.uri).toBeDefined();
            expect(result.mimeType).toBe('application/json');

            const data = JSON.parse(result.text!);
            expect(data.entityType).toBe('person');
            expect(data.count).toBe(1);
            expect(data.entities).toHaveLength(1);
            expect(data.entities[0].uri).toBeDefined();
        });

        it('should list project entities', async () => {
            const result = await Resources.readEntitiesListResource('project', tempDir);

            const data = JSON.parse(result.text!);
            expect(data.entityType).toBe('project');
            expect(data.count).toBe(2);
            expect(data.entities[0].active).toBeDefined();
        });

        it('should list term entities', async () => {
            const result = await Resources.readEntitiesListResource('term', tempDir);

            const data = JSON.parse(result.text!);
            expect(data.entityType).toBe('term');
            expect(data.entities[0].expansion).toBeDefined();
            expect(data.entities[0].domain).toBeDefined();
        });

        it('should list company entities', async () => {
            const result = await Resources.readEntitiesListResource('company', tempDir);

            const data = JSON.parse(result.text!);
            expect(data.entityType).toBe('company');
            expect(data.entities[0].fullName).toBeDefined();
            expect(data.entities[0].industry).toBeDefined();
        });

        it('should list ignored entities', async () => {
            const result = await Resources.readEntitiesListResource('ignored', tempDir);

            const data = JSON.parse(result.text!);
            expect(data.entityType).toBe('ignored');
            expect(data.entities[0].reason).toBeDefined();
        });

        it('should throw error for unknown entity type', async () => {
            await expect(
                Resources.readEntitiesListResource('unknown', tempDir)
            ).rejects.toThrow('Unknown entity type');
        });

        it('should throw error when no context found', async () => {
            mockContext.hasContext = vi.fn(() => false);

            await expect(
                Resources.readEntitiesListResource('person', tempDir)
            ).rejects.toThrow('No Protokoll context found');
        });

        it('should use current directory when not specified', async () => {
            const result = await Resources.readEntitiesListResource('person');

            expect(result).toBeDefined();
            expect(Context.create).toHaveBeenCalled();
        });
    });

    describe('handleReadResource', () => {
        beforeEach(async () => {
            const uriModule = await import('../../src/mcp/uri');
            const parseUriSpy = vi.spyOn(uriModule, 'parseUri');
            // @ts-ignore - Mock implementation
            parseUriSpy.mockImplementation((uri: string) => {
                if (uri.includes('transcript')) {
                    return {
                        scheme: 'protokoll',
                        resourceType: 'transcript',
                        path: '/test/transcript.md',
                        params: {},
                        transcriptPath: '/test/transcript.md',
                    } as any;
                }
                if (uri.includes('entity/person')) {
                    return {
                        scheme: 'protokoll',
                        resourceType: 'entity',
                        path: 'person/person1',
                        params: {},
                        entityType: 'person',
                        entityId: 'person1',
                    } as any;
                }
                if (uri.includes('config')) {
                    return {
                        scheme: 'protokoll',
                        resourceType: 'config',
                        path: '',
                        params: {},
                        configPath: tempDir,
                    } as any;
                }
                if (uri.includes('transcripts?')) {
                    return {
                        scheme: 'protokoll',
                        resourceType: 'transcripts-list',
                        path: '',
                        params: { directory: tempDir },
                        directory: tempDir,
                    } as any;
                }
                if (uri.includes('entities/person')) {
                    return {
                        scheme: 'protokoll',
                        resourceType: 'entities-list',
                        path: 'person',
                        params: {},
                        entityType: 'person',
                    } as any;
                }
                throw new Error('Unknown URI format');
            });
        });

        it('should route to readTranscriptResource for transcript URIs', async () => {
            const transcriptPath = path.join(tempDir, 'test.md');
            await fs.writeFile(transcriptPath, '# Test');
            
            const uriModule = await import('../../src/mcp/uri');
            const parseUriSpy = vi.spyOn(uriModule, 'parseUri');
            // @ts-ignore - Mock implementation
            parseUriSpy.mockReturnValue({
                scheme: 'protokoll',
                resourceType: 'transcript',
                path: transcriptPath,
                params: {},
                transcriptPath,
            } as any);

            const result = await Resources.handleReadResource(`protokoll://transcript/${transcriptPath}`);

            expect(result.mimeType).toBe('text/markdown');
            
            parseUriSpy.mockRestore();
        });

        it('should route to readEntityResource for entity URIs', async () => {
            const result = await Resources.handleReadResource('protokoll://entity/person/person1');

            expect(result.mimeType).toBe('application/yaml');
        });

        it('should route to readConfigResource for config URIs', async () => {
            const result = await Resources.handleReadResource('protokoll://config');

            expect(result.mimeType).toBe('application/json');
        });

        it('should throw error for unknown resource type', async () => {
            const uriModule = await import('../../src/mcp/uri');
            const parseUriSpy = vi.spyOn(uriModule, 'parseUri');
            // @ts-ignore - Mock implementation
            parseUriSpy.mockReturnValue({
                scheme: 'protokoll',
                resourceType: 'unknown' as any,
                path: '',
                params: {},
            });

            await expect(
                Resources.handleReadResource('protokoll://unknown')
            ).rejects.toThrow('Unknown resource type');
            
            parseUriSpy.mockRestore();
        });
    });
});
