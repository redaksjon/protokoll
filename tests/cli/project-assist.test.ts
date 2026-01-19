/**
 * Tests for Project Assist Module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as ProjectAssist from '../../src/cli/project-assist';
import * as OpenAI from '../../src/util/openai';
import * as ContentFetcher from '../../src/cli/content-fetcher';
import { SmartAssistanceConfig } from '../../src/context/types';

// Mock dependencies
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    })),
}));

vi.mock('../../src/util/openai', () => ({
    createCompletion: vi.fn(),
}));

vi.mock('../../src/cli/content-fetcher', () => ({
    create: vi.fn(),
}));

describe('Project Assist', () => {
    let mockConfig: SmartAssistanceConfig;
    let originalApiKey: string | undefined;

    beforeEach(() => {
        originalApiKey = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'test-api-key';
        
        mockConfig = {
            enabled: true,
            phoneticModel: 'gpt-4',
            analysisModel: 'gpt-4',
        };
        
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.env.OPENAI_API_KEY = originalApiKey;
    });

    describe('create', () => {
        it('should create a ProjectAssistInstance', () => {
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            
            expect(instance).toBeDefined();
            expect(instance.generateSoundsLike).toBeDefined();
            expect(instance.generateTriggerPhrases).toBeDefined();
            expect(instance.analyzeSource).toBeDefined();
            expect(instance.isAvailable).toBeDefined();
        });

        it('should return true for isAvailable when conditions met', () => {
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            expect(instance.isAvailable()).toBe(true);
        });

        it('should return false for isAvailable without API key', () => {
            delete process.env.OPENAI_API_KEY;
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            expect(instance.isAvailable()).toBe(false);
        });

        it('should return false for isAvailable when disabled', () => {
            const disabledConfig = { ...mockConfig, enabled: false };
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(disabledConfig);
            expect(instance.isAvailable()).toBe(false);
        });
    });

    describe('generateSoundsLike', () => {
        it('should generate phonetic variants for a project name', async () => {
            const mockResponse = 'protocol,pro to call,proto call,k8s';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Protokoll');

            expect(result).toContain('protocol');
            expect(result).toContain('pro to call');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should filter out the original name from variants', async () => {
            const mockResponse = 'protokoll,protocol,protokoll';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Protokoll');

            expect(result).not.toContain('protokoll');
        });

        it('should remove duplicates', async () => {
            const mockResponse = 'variant1,variant2,variant1';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Test');

            expect(result).toEqual(['variant1', 'variant2']);
        });

        it('should return empty array when not available', async () => {
            delete process.env.OPENAI_API_KEY;
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Test');

            expect(result).toEqual([]);
            expect(OpenAI.createCompletion).not.toHaveBeenCalled();
        });

        it('should return empty array on error', async () => {
            vi.mocked(OpenAI.createCompletion).mockRejectedValue(new Error('API error'));
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Test');

            expect(result).toEqual([]);
        });

        it('should lowercase variants', async () => {
            const mockResponse = 'VARIANT1,Variant2,variant3';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Test');

            expect(result).toEqual(['variant1', 'variant2', 'variant3']);
        });
    });

    describe('generateTriggerPhrases', () => {
        it('should generate trigger phrases for a project', async () => {
            const mockResponse = 'test,working on test,test project,test meeting';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateTriggerPhrases('Test');

            expect(result).toContain('test');
            expect(result).toContain('working on test');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should include project name as first item', async () => {
            const mockResponse = 'working on test,test project';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateTriggerPhrases('TestProject');

            expect(result[0]).toBe('testproject');
        });

        it('should remove duplicates', async () => {
            const mockResponse = 'phrase1,phrase2,phrase1';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateTriggerPhrases('Test');

            const uniquePhases = new Set(result);
            expect(uniquePhases.size).toBe(result.length);
        });

        it('should return fallback with project name on error', async () => {
            vi.mocked(OpenAI.createCompletion).mockRejectedValue(new Error('API error'));
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateTriggerPhrases('TestProject');

            expect(result).toEqual(['testproject']);
        });

        it('should return empty array when not available', async () => {
            delete process.env.OPENAI_API_KEY;
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateTriggerPhrases('Test');

            expect(result).toEqual([]);
        });

        it('should lowercase phrases', async () => {
            const mockResponse = 'WORKING ON TEST,Test Project,TEST MEETING';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateTriggerPhrases('Test');

            result.forEach(phrase => {
                expect(phrase).toBe(phrase.toLowerCase());
            });
        });
    });

    describe('analyzeSource', () => {
        it('should analyze source and return suggestions', async () => {
            const mockFetcher = {
                fetch: vi.fn().mockResolvedValue({
                    success: true,
                    content: '# Test Project\n\nThis is a test project.',
                    sourceName: 'README.md',
                    sourceType: 'file' as const,
                }),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            };
            vi.mocked(ContentFetcher.create).mockReturnValue(mockFetcher);

            const jsonResponse = JSON.stringify({
                name: 'Test',
                topics: ['testing', 'automation'],
                description: 'A test project.',
            });
            vi.mocked(OpenAI.createCompletion)
                .mockResolvedValueOnce(jsonResponse)
                .mockResolvedValueOnce('phonetic1,phonetic2')
                .mockResolvedValueOnce('test,test project');

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.analyzeSource('/path/to/project');

            expect(result.soundsLike).toContain('phonetic1');
            expect(result.triggerPhrases).toContain('test');
        });

        it('should use existing name when provided', async () => {
            const mockFetcher = {
                fetch: vi.fn().mockResolvedValue({
                    success: true,
                    content: '# Project\n\nContent',
                    sourceName: 'README.md',
                    sourceType: 'file' as const,
                }),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            };
            vi.mocked(ContentFetcher.create).mockReturnValue(mockFetcher);

            const jsonResponse = JSON.stringify({
                name: null,
                topics: ['topic1'],
                description: 'Description',
            });
            vi.mocked(OpenAI.createCompletion)
                .mockResolvedValueOnce(jsonResponse)
                .mockResolvedValueOnce('variant1')
                .mockResolvedValueOnce('trigger1');

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.analyzeSource('/path/to/project', 'ExistingName');

            expect(result).toBeDefined();
        });

        it('should return empty result when content fetch fails', async () => {
            const mockFetcher = {
                fetch: vi.fn().mockResolvedValue({
                    success: false,
                    error: 'File not found',
                    sourceType: 'file' as const,
                    sourceName: 'README.md',
                }),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            };
            vi.mocked(ContentFetcher.create).mockReturnValue(mockFetcher);

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.analyzeSource('/path/to/project');

            expect(result).toEqual({ soundsLike: [], triggerPhrases: [] });
        });

        it('should handle invalid JSON in response', async () => {
            const mockFetcher = {
                fetch: vi.fn().mockResolvedValue({
                    success: true,
                    content: '# Project',
                    sourceName: 'README.md',
                    sourceType: 'file' as const,
                }),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            };
            vi.mocked(ContentFetcher.create).mockReturnValue(mockFetcher);

            vi.mocked(OpenAI.createCompletion).mockResolvedValue('Invalid JSON');

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.analyzeSource('/path/to/project');

            expect(result).toEqual({ soundsLike: [], triggerPhrases: [] });
        });

        it('should return empty result when not available', async () => {
            delete process.env.OPENAI_API_KEY;
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.analyzeSource('/path/to/project');

            expect(result).toEqual({ soundsLike: [], triggerPhrases: [] });
            expect(vi.mocked(ContentFetcher.create).mock.results[0].value.fetch).not.toHaveBeenCalled();
        });

        it('should handle analysis without project name', async () => {
            const mockFetcher = {
                fetch: vi.fn().mockResolvedValue({
                    success: true,
                    content: '# Project',
                    sourceName: 'README.md',
                    sourceType: 'file' as const,
                }),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            };
            vi.mocked(ContentFetcher.create).mockReturnValue(mockFetcher);

            const jsonResponse = JSON.stringify({
                name: null,
                topics: ['topic1'],
                description: 'Description',
            });
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(jsonResponse);

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.analyzeSource('/path/to/project');

            expect(result.soundsLike).toEqual([]);
            expect(result.triggerPhrases).toEqual([]);
        });

        it('should include topics and description in result', async () => {
            const mockFetcher = {
                fetch: vi.fn().mockResolvedValue({
                    success: true,
                    content: '# Project\n\nDescription',
                    sourceName: 'README.md',
                    sourceType: 'file' as const,
                }),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            };
            vi.mocked(ContentFetcher.create).mockReturnValue(mockFetcher);

            const jsonResponse = JSON.stringify({
                name: 'Test',
                topics: ['topic1', 'topic2'],
                description: 'Project description here.',
            });
            vi.mocked(OpenAI.createCompletion)
                .mockResolvedValueOnce(jsonResponse)
                .mockResolvedValueOnce('variant')
                .mockResolvedValueOnce('trigger');

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.analyzeSource('/path/to/project');

            expect(result.topics).toEqual(['topic1', 'topic2']);
            expect(result.description).toBe('Project description here.');
        });
    });

    describe('edge cases', () => {
        it('should handle empty responses', async () => {
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('');
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Test');

            expect(result).toEqual([]);
        });

        it('should handle special characters in names', async () => {
            const mockResponse = 'variant1,variant2';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Test-Project_2.0');

            expect(result).toContain('variant1');
            expect(result).toContain('variant2');
        });

        it('should trim whitespace from responses', async () => {
            const mockResponse = '  variant1  ,  variant2  ';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);
            vi.mocked(ContentFetcher.create).mockReturnValue({
                fetch: vi.fn(),
                isUrl: vi.fn(),
                isGitHubUrl: vi.fn(),
            });

            const instance = ProjectAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Test');

            expect(result).toEqual(['variant1', 'variant2']);
        });
    });
});
