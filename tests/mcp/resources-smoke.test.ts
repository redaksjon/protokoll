/**
 * Smoke tests for MCP Resources
 * These tests ensure basic functionality works across all resource modules
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@/context', () => ({
    create: vi.fn().mockResolvedValue({
        hasContext: vi.fn().mockReturnValue(true),
        getConfig: vi.fn().mockReturnValue({
            inputDirectory: '/test/input',
            outputDirectory: '/test/output',
            processedDirectory: '/test/processed',
            contextDirectories: ['/test/context'],
        }),
        getDiscoveredDirs: vi.fn().mockReturnValue([{ path: '/test/.protokoll' }]),
        getAllProjects: vi.fn().mockReturnValue([
            { id: 'project1', name: 'Project 1' },
            { id: 'project2', name: 'Project 2' },
        ]),
        getAllPeople: vi.fn().mockReturnValue([
            { id: 'person1', name: 'Person 1' },
        ]),
        getAllTerms: vi.fn().mockReturnValue([
            { id: 'term1', name: 'Term 1' },
        ]),
        getAllCompanies: vi.fn().mockReturnValue([
            { id: 'company1', name: 'Company 1' },
        ]),
    }),
}));

vi.mock('../../src/mcp/serverConfig', () => ({
    getServerConfig: vi.fn().mockReturnValue({
        inputDirectory: '/test/input',
        outputDirectory: '/test/output',
        processedDirectory: '/test/processed',
    }),
    getOutputDirectory: vi.fn().mockReturnValue('/test/output'),
}));

// Import after mocks
import * as Discovery from '../../src/mcp/resources/discovery';
import * as AudioResources from '../../src/mcp/resources/audioResources';
import * as EntityResources from '../../src/mcp/resources/entityResources';

describe('Resource Modules - Smoke Tests', () => {
    describe('discovery', () => {
        it('should get dynamic resources', async () => {
            const resources = await Discovery.getDynamicResources();
            expect(Array.isArray(resources)).toBe(true);
        });

        it('should get dynamic resources with context directory', async () => {
            const resources = await Discovery.getDynamicResources('/test/context');
            expect(Array.isArray(resources)).toBe(true);
        });

        it('should handle context creation errors', async () => {
            const Context = await import('@/context');
            vi.mocked(Context.create).mockRejectedValueOnce(new Error('Context error'));
            
            const resources = await Discovery.getDynamicResources();
            expect(Array.isArray(resources)).toBe(true);
            expect(resources).toHaveLength(0);
        });

        it('should handle missing context', async () => {
            const Context = await import('@/context');
            vi.mocked(Context.create).mockResolvedValueOnce({
                hasContext: vi.fn().mockReturnValue(false),
            } as any);
            
            const resources = await Discovery.getDynamicResources();
            expect(Array.isArray(resources)).toBe(true);
            expect(resources).toHaveLength(0);
        });

        it('should include config resource when config path available', async () => {
            const resources = await Discovery.getDynamicResources();
            const configResource = resources.find(r => r.name === 'Current Configuration');
            expect(configResource).toBeDefined();
        });

        it('should include inbound audio resource', async () => {
            const resources = await Discovery.getDynamicResources();
            const audioResource = resources.find(r => r.name === 'Inbound Audio Files');
            expect(audioResource).toBeDefined();
        });

        it('should include processed audio resource when directory configured', async () => {
            const resources = await Discovery.getDynamicResources();
            const processedResource = resources.find(r => r.name === 'Processed Audio Files');
            expect(processedResource).toBeDefined();
        });

        it('should include entity list resources when entities exist', async () => {
            const resources = await Discovery.getDynamicResources();
            const projectsResource = resources.find(r => r.name === 'All Projects');
            const peopleResource = resources.find(r => r.name === 'All People');
            const termsResource = resources.find(r => r.name === 'All Terms');
            const companiesResource = resources.find(r => r.name === 'All Companies');
            
            expect(projectsResource).toBeDefined();
            expect(peopleResource).toBeDefined();
            expect(termsResource).toBeDefined();
            expect(companiesResource).toBeDefined();
        });

        it('should include recent transcripts resource', async () => {
            const resources = await Discovery.getDynamicResources();
            const transcriptsResource = resources.find(r => r.name === 'Recent Transcripts');
            expect(transcriptsResource).toBeDefined();
        });

        it('should omit entity resources when no entities exist', async () => {
            const Context = await import('@/context');
            vi.mocked(Context.create).mockResolvedValueOnce({
                hasContext: vi.fn().mockReturnValue(true),
                getConfig: vi.fn().mockReturnValue({
                    inputDirectory: '/test/input',
                    outputDirectory: '/test/output',
                }),
                getDiscoveredDirs: vi.fn().mockReturnValue([{ path: '/test/.protokoll' }]),
                getAllProjects: vi.fn().mockReturnValue([]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            } as any);
            
            const resources = await Discovery.getDynamicResources();
            const projectsResource = resources.find(r => r.name === 'All Projects');
            const peopleResource = resources.find(r => r.name === 'All People');
            const termsResource = resources.find(r => r.name === 'All Terms');
            const companiesResource = resources.find(r => r.name === 'All Companies');
            
            expect(projectsResource).toBeUndefined();
            expect(peopleResource).toBeUndefined();
            expect(termsResource).toBeUndefined();
            expect(companiesResource).toBeUndefined();
        });

        it('should handle missing processed directory', async () => {
            const Context = await import('@/context');
            vi.mocked(Context.create).mockResolvedValueOnce({
                hasContext: vi.fn().mockReturnValue(true),
                getConfig: vi.fn().mockReturnValue({
                    inputDirectory: '/test/input',
                    outputDirectory: '/test/output',
                    // No processedDirectory
                }),
                getDiscoveredDirs: vi.fn().mockReturnValue([{ path: '/test/.protokoll' }]),
                getAllProjects: vi.fn().mockReturnValue([]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            } as any);
            
            const resources = await Discovery.getDynamicResources();
            const processedResource = resources.find(r => r.name === 'Processed Audio Files');
            expect(processedResource).toBeUndefined();
        });

        it('should use default input directory when not configured', async () => {
            const Context = await import('@/context');
            vi.mocked(Context.create).mockResolvedValueOnce({
                hasContext: vi.fn().mockReturnValue(true),
                getConfig: vi.fn().mockReturnValue({
                    // No inputDirectory
                    outputDirectory: '/test/output',
                }),
                getDiscoveredDirs: vi.fn().mockReturnValue([{ path: '/test/.protokoll' }]),
                getAllProjects: vi.fn().mockReturnValue([]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            } as any);
            
            const resources = await Discovery.getDynamicResources();
            const audioResource = resources.find(r => r.name === 'Inbound Audio Files');
            expect(audioResource).toBeDefined();
            expect(audioResource?.description).toContain('./recordings');
        });

        it('should use default output directory when not configured', async () => {
            const Context = await import('@/context');
            vi.mocked(Context.create).mockResolvedValueOnce({
                hasContext: vi.fn().mockReturnValue(true),
                getConfig: vi.fn().mockReturnValue({
                    inputDirectory: '/test/input',
                    // No outputDirectory
                }),
                getDiscoveredDirs: vi.fn().mockReturnValue([{ path: '/test/.protokoll' }]),
                getAllProjects: vi.fn().mockReturnValue([]),
                getAllPeople: vi.fn().mockReturnValue([]),
                getAllTerms: vi.fn().mockReturnValue([]),
                getAllCompanies: vi.fn().mockReturnValue([]),
            } as any);
            
            const resources = await Discovery.getDynamicResources();
            const transcriptsResource = resources.find(r => r.name === 'Recent Transcripts');
            expect(transcriptsResource).toBeDefined();
            expect(transcriptsResource?.description).toContain('~/notes');
        });
    });

    describe('audioResources', () => {
        it('should export readAudioInboundResource function', () => {
            expect(AudioResources.readAudioInboundResource).toBeDefined();
            expect(typeof AudioResources.readAudioInboundResource).toBe('function');
        });

        it('should export readAudioProcessedResource function', () => {
            expect(AudioResources.readAudioProcessedResource).toBeDefined();
            expect(typeof AudioResources.readAudioProcessedResource).toBe('function');
        });
    });

    describe('entityResources', () => {
        it('should export readEntityResource function', () => {
            expect(EntityResources.readEntityResource).toBeDefined();
            expect(typeof EntityResources.readEntityResource).toBe('function');
        });

        it('should export readEntitiesListResource function', () => {
            expect(EntityResources.readEntitiesListResource).toBeDefined();
            expect(typeof EntityResources.readEntitiesListResource).toBe('function');
        });
    });
});
