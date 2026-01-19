/**
 * Tests for Term Assist Module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as TermAssist from '../../src/cli/term-assist';
import * as OpenAI from '../../src/util/openai';
import { SmartAssistanceConfig } from '../../src/context/types';
import { TermAnalysisContext } from '../../src/cli/term-context';

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

describe('Term Assist', () => {
    let mockConfig: SmartAssistanceConfig;
    let originalApiKey: string | undefined;

    beforeEach(() => {
        originalApiKey = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'test-api-key';
        
        mockConfig = {
            enabled: true,
            termsEnabled: true,
            termSoundsLikeOnAdd: true,
            termDescriptionOnAdd: true,
            termTopicsOnAdd: true,
            phoneticModel: 'gpt-4',
            analysisModel: 'gpt-4',
        };
        
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.env.OPENAI_API_KEY = originalApiKey;
    });

    describe('create', () => {
        it('should create a TermAssistInstance', () => {
            const instance = TermAssist.create(mockConfig);
            
            expect(instance).toBeDefined();
            expect(instance.generateSoundsLike).toBeDefined();
            expect(instance.generateDescription).toBeDefined();
            expect(instance.generateTopics).toBeDefined();
            expect(instance.suggestDomain).toBeDefined();
            expect(instance.generateAll).toBeDefined();
            expect(instance.isAvailable).toBeDefined();
        });

        it('should return true for isAvailable when conditions are met', () => {
            const instance = TermAssist.create(mockConfig);
            expect(instance.isAvailable()).toBe(true);
        });

        it('should return false for isAvailable without API key', () => {
            delete process.env.OPENAI_API_KEY;
            const instance = TermAssist.create(mockConfig);
            expect(instance.isAvailable()).toBe(false);
        });

        it('should return false for isAvailable when disabled', () => {
            const disabledConfig = { ...mockConfig, enabled: false };
            const instance = TermAssist.create(disabledConfig);
            expect(instance.isAvailable()).toBe(false);
        });

        it('should return false for isAvailable when terms disabled', () => {
            const disabledConfig = { ...mockConfig, termsEnabled: false };
            const instance = TermAssist.create(disabledConfig);
            expect(instance.isAvailable()).toBe(false);
        });
    });

    describe('generateSoundsLike', () => {
        it('should generate phonetic variants for a term', async () => {
            const mockResponse = 'cube a netes,coobernettys,cube er netes,k8s';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Kubernetes');

            expect(result).toEqual(['cube a netes', 'coobernettys', 'cube er netes', 'k8s']);
            expect(OpenAI.createCompletion).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'user',
                        content: expect.stringContaining('Kubernetes'),
                    }),
                ]),
                expect.objectContaining({
                    model: 'gpt-4',
                    reasoningLevel: 'low',
                })
            );
        });

        it('should filter out the original term from variants', async () => {
            const mockResponse = 'kubernetes,cube a netes,KUBERNETES';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Kubernetes');

            expect(result).toEqual(['cube a netes']);
            expect(result).not.toContain('kubernetes');
            expect(result).not.toContain('KUBERNETES');
        });

        it('should remove duplicates from variants', async () => {
            const mockResponse = 'variant1,variant2,variant1,VARIANT1';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Test');

            expect(result).toEqual(['variant1', 'variant2']);
        });

        it('should return empty array when not enabled', async () => {
            const disabledConfig = { ...mockConfig, termSoundsLikeOnAdd: false };
            const instance = TermAssist.create(disabledConfig);
            const result = await instance.generateSoundsLike('Test');

            expect(result).toEqual([]);
            expect(OpenAI.createCompletion).not.toHaveBeenCalled();
        });

        it('should return empty array on error', async () => {
            vi.mocked(OpenAI.createCompletion).mockRejectedValue(new Error('API error'));

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Test');

            expect(result).toEqual([]);
        });

        it('should handle empty response', async () => {
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('');

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Test');

            expect(result).toEqual([]);
        });

        it('should trim and lowercase variants', async () => {
            const mockResponse = '  Variant One  , VARIANT TWO , variant three';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateSoundsLike('Test');

            expect(result).toEqual(['variant one', 'variant two', 'variant three']);
        });
    });

    describe('generateDescription', () => {
        const mockContext: TermAnalysisContext = {
            term: 'Kubernetes',
            expansion: 'Container orchestration system',
            similarTerms: [],
            relatedProjects: [],
            contextText: 'Term: Kubernetes',
        };

        it('should generate a description for a term', async () => {
            const mockResponse = 'Kubernetes is an open-source container orchestration platform.';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateDescription('Kubernetes', mockContext);

            expect(result).toBe(mockResponse);
            expect(OpenAI.createCompletion).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'user',
                        content: expect.stringContaining('Kubernetes'),
                    }),
                ]),
                expect.objectContaining({
                    model: 'gpt-4',
                    reasoningLevel: 'low',
                })
            );
        });

        it('should include expansion in prompt', async () => {
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('Description');

            const instance = TermAssist.create(mockConfig);
            await instance.generateDescription('K8s', mockContext);

            const call = vi.mocked(OpenAI.createCompletion).mock.calls[0];
            expect(call[0][0].content).toContain('Container orchestration system');
        });

        it('should include source content if available', async () => {
            const contextWithSource = {
                ...mockContext,
                sourceContent: 'Detailed documentation about Kubernetes',
            };
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('Description');

            const instance = TermAssist.create(mockConfig);
            await instance.generateDescription('Kubernetes', contextWithSource);

            const call = vi.mocked(OpenAI.createCompletion).mock.calls[0];
            expect(call[0][0].content).toContain('Source documentation:');
            expect(call[0][0].content).toContain('Detailed documentation about Kubernetes');
        });

        it('should return empty string when not enabled', async () => {
            const disabledConfig = { ...mockConfig, termDescriptionOnAdd: false };
            const instance = TermAssist.create(disabledConfig);
            const result = await instance.generateDescription('Test', mockContext);

            expect(result).toBe('');
            expect(OpenAI.createCompletion).not.toHaveBeenCalled();
        });

        it('should return empty string on error', async () => {
            vi.mocked(OpenAI.createCompletion).mockRejectedValue(new Error('API error'));

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateDescription('Test', mockContext);

            expect(result).toBe('');
        });

        it('should trim the response', async () => {
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('  Description with spaces  ');

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateDescription('Test', mockContext);

            expect(result).toBe('Description with spaces');
        });
    });

    describe('generateTopics', () => {
        const mockContext: TermAnalysisContext = {
            term: 'Kubernetes',
            expansion: 'Container orchestration',
            similarTerms: [],
            relatedProjects: [],
            contextText: 'Term: Kubernetes',
        };

        it('should generate topics for a term', async () => {
            const mockResponse = 'containers,orchestration,devops,docker,cloud';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateTopics('Kubernetes', mockContext);

            expect(result).toEqual(['containers', 'orchestration', 'devops', 'docker', 'cloud']);
        });

        it('should include expansion in prompt', async () => {
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('topics');

            const instance = TermAssist.create(mockConfig);
            await instance.generateTopics('K8s', mockContext);

            const call = vi.mocked(OpenAI.createCompletion).mock.calls[0];
            expect(call[0][0].content).toContain('Container orchestration');
        });

        it('should include source content if available', async () => {
            const contextWithSource = {
                ...mockContext,
                sourceContent: 'Documentation about container orchestration',
            };
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('topics');

            const instance = TermAssist.create(mockConfig);
            await instance.generateTopics('Kubernetes', contextWithSource);

            const call = vi.mocked(OpenAI.createCompletion).mock.calls[0];
            expect(call[0][0].content).toContain('Source documentation:');
        });

        it('should remove duplicates from topics', async () => {
            const mockResponse = 'topic1,topic2,topic1,TOPIC1';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateTopics('Test', mockContext);

            expect(result).toEqual(['topic1', 'topic2']);
        });

        it('should return empty array when not enabled', async () => {
            const disabledConfig = { ...mockConfig, termTopicsOnAdd: false };
            const instance = TermAssist.create(disabledConfig);
            const result = await instance.generateTopics('Test', mockContext);

            expect(result).toEqual([]);
            expect(OpenAI.createCompletion).not.toHaveBeenCalled();
        });

        it('should return empty array on error', async () => {
            vi.mocked(OpenAI.createCompletion).mockRejectedValue(new Error('API error'));

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateTopics('Test', mockContext);

            expect(result).toEqual([]);
        });

        it('should trim and lowercase topics', async () => {
            const mockResponse = '  Topic One  , TOPIC TWO , topic three';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateTopics('Test', mockContext);

            expect(result).toEqual(['topic one', 'topic two', 'topic three']);
        });

        it('should filter out empty topics', async () => {
            const mockResponse = 'topic1,,topic2,  ,topic3';
            vi.mocked(OpenAI.createCompletion).mockResolvedValue(mockResponse);

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateTopics('Test', mockContext);

            expect(result).toEqual(['topic1', 'topic2', 'topic3']);
        });
    });

    describe('suggestDomain', () => {
        const mockContext: TermAnalysisContext = {
            term: 'Kubernetes',
            similarTerms: [],
            relatedProjects: [],
            contextText: 'Term: Kubernetes',
        };

        it('should suggest a domain for a term', async () => {
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('devops');

            const instance = TermAssist.create(mockConfig);
            const result = await instance.suggestDomain('Kubernetes', mockContext);

            expect(result).toBe('devops');
        });

        it('should use suggested domain from context if available', async () => {
            const contextWithDomain = {
                ...mockContext,
                suggestedDomain: 'cloud',
            };

            const instance = TermAssist.create(mockConfig);
            const result = await instance.suggestDomain('Test', contextWithDomain);

            expect(result).toBe('cloud');
            expect(OpenAI.createCompletion).not.toHaveBeenCalled();
        });

        it('should include expansion in prompt', async () => {
            const contextWithExpansion = {
                ...mockContext,
                expansion: 'Container orchestration',
            };
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('devops');

            const instance = TermAssist.create(mockConfig);
            await instance.suggestDomain('K8s', contextWithExpansion);

            const call = vi.mocked(OpenAI.createCompletion).mock.calls[0];
            expect(call[0][0].content).toContain('Container orchestration');
        });

        it('should include source content if available', async () => {
            const contextWithSource = {
                ...mockContext,
                sourceContent: 'DevOps documentation',
            };
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('devops');

            const instance = TermAssist.create(mockConfig);
            await instance.suggestDomain('Test', contextWithSource);

            const call = vi.mocked(OpenAI.createCompletion).mock.calls[0];
            expect(call[0][0].content).toContain('Source documentation:');
        });

        it('should return undefined on error', async () => {
            vi.mocked(OpenAI.createCompletion).mockRejectedValue(new Error('API error'));

            const instance = TermAssist.create(mockConfig);
            const result = await instance.suggestDomain('Test', mockContext);

            expect(result).toBeUndefined();
        });

        it('should lowercase the domain', async () => {
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('DevOps');

            const instance = TermAssist.create(mockConfig);
            const result = await instance.suggestDomain('Test', mockContext);

            expect(result).toBe('devops');
        });

        it('should return undefined for empty response', async () => {
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('');

            const instance = TermAssist.create(mockConfig);
            const result = await instance.suggestDomain('Test', mockContext);

            expect(result).toBeUndefined();
        });

        it('should trim whitespace from domain', async () => {
            vi.mocked(OpenAI.createCompletion).mockResolvedValue('  devops  ');

            const instance = TermAssist.create(mockConfig);
            const result = await instance.suggestDomain('Test', mockContext);

            expect(result).toBe('devops');
        });
    });

    describe('generateAll', () => {
        const mockContext: TermAnalysisContext = {
            term: 'Kubernetes',
            expansion: 'Container orchestration',
            similarTerms: [],
            relatedProjects: [],
            contextText: 'Term: Kubernetes',
        };

        it('should generate all suggestions in parallel', async () => {
            vi.mocked(OpenAI.createCompletion)
                .mockResolvedValueOnce('k8s,kube')
                .mockResolvedValueOnce('Container orchestration platform')
                .mockResolvedValueOnce('containers,devops')
                .mockResolvedValueOnce('cloud');

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateAll('Kubernetes', mockContext);

            expect(result).toEqual({
                soundsLike: ['k8s', 'kube'],
                description: 'Container orchestration platform',
                topics: ['containers', 'devops'],
                domain: 'cloud',
            });
        });

        it('should respect config flags', async () => {
            const partialConfig = {
                ...mockConfig,
                termSoundsLikeOnAdd: false,
                termDescriptionOnAdd: false,
            };
            vi.mocked(OpenAI.createCompletion)
                .mockResolvedValueOnce('containers,devops')
                .mockResolvedValueOnce('cloud');

            const instance = TermAssist.create(partialConfig);
            const result = await instance.generateAll('Kubernetes', mockContext);

            expect(result.soundsLike).toEqual([]);
            expect(result.description).toBeUndefined();
            expect(result.topics).toEqual(['containers', 'devops']);
            expect(result.domain).toBe('cloud');
        });

        it('should return empty result when not available', async () => {
            delete process.env.OPENAI_API_KEY;
            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateAll('Test', mockContext);

            expect(result).toEqual({
                soundsLike: [],
                topics: [],
            });
            expect(OpenAI.createCompletion).not.toHaveBeenCalled();
        });

        it('should handle partial failures gracefully', async () => {
            vi.mocked(OpenAI.createCompletion)
                .mockRejectedValue(new Error('Failed'));

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateAll('Test', mockContext);

            expect(result).toEqual({
                soundsLike: [],
                topics: [],
            });
        });

        it('should set description to undefined when empty', async () => {
            vi.mocked(OpenAI.createCompletion)
                .mockResolvedValueOnce('variant1')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('topic1')
                .mockResolvedValueOnce('domain1');

            const instance = TermAssist.create(mockConfig);
            const result = await instance.generateAll('Test', mockContext);

            expect(result.description).toBeUndefined();
        });
    });

    describe('withProgress', () => {
        it('should execute operation and show progress', async () => {
            const printSpy = vi.fn();
            const operation = vi.fn().mockResolvedValue('result');

            const result = await TermAssist.withProgress(
                'Testing',
                operation,
                printSpy
            );

            expect(result).toBe('result');
            expect(printSpy).toHaveBeenCalledWith('[Testing...]');
            expect(operation).toHaveBeenCalled();
        });

        it('should handle operation errors', async () => {
            const printSpy = vi.fn();
            const operation = vi.fn().mockRejectedValue(new Error('Failed'));

            await expect(
                TermAssist.withProgress('Testing', operation, printSpy)
            ).rejects.toThrow('Failed');

            expect(printSpy).toHaveBeenCalledWith('[Testing...]');
        });

        it('should return operation result', async () => {
            const printSpy = vi.fn();
            const operation = vi.fn().mockResolvedValue({ data: 'test' });

            const result = await TermAssist.withProgress(
                'Loading',
                operation,
                printSpy
            );

            expect(result).toEqual({ data: 'test' });
        });
    });
});
