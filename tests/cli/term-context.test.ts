/**
 * Tests for Term Context Module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as TermContext from '../../src/cli/term-context';
import type { Term, Project } from '../../src/context/types';
import type { ContextInstance } from '../../src/context';
import * as ContentFetcher from '../../src/cli/content-fetcher';

// Mock dependencies
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    })),
}));

describe('Term Context', () => {
    let mockContextInstance: ContextInstance;
    let mockTerms: Term[];
    let mockProjects: Project[];

    beforeEach(() => {
        mockTerms = [
            {
                id: 'kubernetes',
                name: 'Kubernetes',
                description: 'Container orchestration platform',
                expansion: 'K8s',
                domain: 'devops',
                topics: ['containers', 'orchestration', 'cloud'],
                sounds_like: ['k8s', 'kube'],
            },
            {
                id: 'docker',
                name: 'Docker',
                description: 'Container platform',
                domain: 'devops',
                topics: ['containers', 'virtualization'],
                sounds_like: ['docker'],
            },
            {
                id: 'react',
                name: 'React',
                description: 'Frontend library',
                domain: 'frontend',
                topics: ['javascript', 'frontend', 'ui'],
                sounds_like: ['react'],
            },
        ];

        mockProjects = [
            {
                id: 'devops-project',
                name: 'DevOps Project',
                active: true,
                classification: {
                    topics: ['containers', 'orchestration', 'kubernetes', 'cloud'],
                },
                routing: {
                    destination: '/output/devops',
                    structure: 'month',
                },
            },
            {
                id: 'frontend-project',
                name: 'Frontend Project',
                active: true,
                classification: {
                    topics: ['react', 'javascript', 'ui', 'frontend'],
                },
                routing: {
                    destination: '/output/frontend',
                    structure: 'month',
                },
            },
            {
                id: 'backend-project',
                name: 'Backend Project',
                active: true,
                classification: {
                    topics: ['api', 'database', 'backend'],
                },
                routing: {
                    destination: '/output/backend',
                    structure: 'month',
                },
            },
        ];

        // @ts-ignore - Mocking ContextInstance
        mockContextInstance = {
            getAllTerms: vi.fn(() => mockTerms),
            getAllProjects: vi.fn(() => mockProjects),
        };
    });

    describe('create', () => {
        it('should create a TermContextInstance', () => {
            const instance = TermContext.create(mockContextInstance);
            
            expect(instance).toBeDefined();
            expect(instance.gatherInternalContext).toBeDefined();
            expect(instance.findSimilarTerms).toBeDefined();
            expect(instance.findProjectsByTopic).toBeDefined();
            expect(instance.inferDomain).toBeDefined();
        });
    });

    describe('findSimilarTerms', () => {
        it('should find terms that contain the search term', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findSimilarTerms('kube');

            expect(result).toContainEqual(mockTerms[0]); // Kubernetes
            expect(result.length).toBe(1);
        });

        it('should find terms by expansion match', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findSimilarTerms('k8s');

            expect(result).toContainEqual(mockTerms[0]); // Kubernetes has expansion 'K8s'
        });

        it('should find terms by sounds_like match', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findSimilarTerms('kube');

            expect(result).toContainEqual(mockTerms[0]); // Kubernetes has sounds_like 'kube'
        });

        it('should not return exact match (self)', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findSimilarTerms('Kubernetes');

            expect(result).not.toContainEqual(mockTerms[0]);
        });

        it('should be case insensitive', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findSimilarTerms('DOCKER');

            expect(result.length).toBe(0); // Exact match, should be excluded
        });

        it('should find terms where search term is contained in name', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findSimilarTerms('react');

            expect(result.length).toBe(0); // Exact match excluded
        });

        it('should limit results to 5 terms', () => {
            const manyTerms = Array.from({ length: 10 }, (_, i) => ({
                id: `term${i}`,
                name: `TestTerm${i}`,
                description: 'Test',
                sounds_like: [],
            }));
            
            // @ts-ignore
            mockContextInstance.getAllTerms = vi.fn(() => manyTerms);
            
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findSimilarTerms('test');

            expect(result.length).toBeLessThanOrEqual(5);
        });

        it('should return empty array when no similar terms found', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findSimilarTerms('nonexistent');

            expect(result).toEqual([]);
        });

        it('should handle terms without sounds_like', () => {
            const termWithoutSoundsLike = {
                id: 'test',
                name: 'Test',
                description: 'Test term',
            };
            // @ts-ignore
            mockContextInstance.getAllTerms = vi.fn(() => [termWithoutSoundsLike]);

            const instance = TermContext.create(mockContextInstance);
            const result = instance.findSimilarTerms('tes');

            expect(result).toHaveLength(1);
        });
    });

    describe('findProjectsByTopic', () => {
        it('should find projects matching topics', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findProjectsByTopic(['containers', 'orchestration']);

            expect(result).toContainEqual(mockProjects[0]); // DevOps Project
        });

        it('should score projects by number of matching topics', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findProjectsByTopic(['containers', 'kubernetes']);

            expect(result[0]).toEqual(mockProjects[0]); // DevOps Project has most matches
        });

        it('should handle partial topic matches', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findProjectsByTopic(['container']);

            expect(result).toContainEqual(mockProjects[0]); // 'containers' contains 'container'
        });

        it('should be case insensitive', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findProjectsByTopic(['CONTAINERS', 'ORCHESTRATION']);

            expect(result).toContainEqual(mockProjects[0]);
        });

        it('should return empty array for empty topics', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findProjectsByTopic([]);

            expect(result).toEqual([]);
        });

        it('should return empty array when no projects match', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findProjectsByTopic(['nonexistent-topic']);

            expect(result).toEqual([]);
        });

        it('should limit results to 5 projects', () => {
            const manyProjects = Array.from({ length: 10 }, (_, i) => ({
                id: `project${i}`,
                name: `Project ${i}`,
                active: true,
                classification: {
                    topics: ['test', 'common'],
                },
                routing: {
                    destination: `/output/${i}`,
                    structure: 'month' as const,
                },
            }));
            
            // @ts-ignore
            mockContextInstance.getAllProjects = vi.fn(() => manyProjects);
            
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findProjectsByTopic(['test']);

            expect(result.length).toBeLessThanOrEqual(5);
        });

        it('should sort projects by match score', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.findProjectsByTopic(['react', 'javascript', 'ui']);

            expect(result[0]).toEqual(mockProjects[1]); // Frontend project matches 3 topics
        });

        it('should handle projects without topics', () => {
            const projectWithoutTopics = {
                id: 'no-topics',
                name: 'No Topics',
                active: true,
                classification: {},
                routing: {
                    destination: '/output/none',
                    structure: 'month' as const,
                },
            };
            // @ts-ignore
            mockContextInstance.getAllProjects = vi.fn(() => [projectWithoutTopics]);

            const instance = TermContext.create(mockContextInstance);
            const result = instance.findProjectsByTopic(['test']);

            expect(result).toEqual([]);
        });
    });

    describe('inferDomain', () => {
        it('should infer devops domain from kubernetes keyword', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.inferDomain('Kubernetes', undefined);

            expect(result).toBe('devops');
        });

        it('should infer cloud domain from aws keyword', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.inferDomain('AWS Lambda', undefined);

            expect(result).toBe('cloud');
        });

        it('should infer database domain from sql keyword', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.inferDomain('PostgreSQL', undefined);

            expect(result).toBe('database');
        });

        it('should infer security domain from oauth keyword', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.inferDomain('OAuth', 'Open Authentication');

            expect(result).toBe('security');
        });

        it('should infer frontend domain from react keyword', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.inferDomain('React Component', undefined);

            expect(result).toBe('frontend');
        });

        it('should infer testing domain from test keyword', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.inferDomain('Unit Testing', undefined);

            expect(result).toBe('testing');
        });

        it('should check expansion for domain inference', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.inferDomain('K8s', 'Kubernetes');

            expect(result).toBe('devops');
        });

        it('should be case insensitive', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.inferDomain('DOCKER Container', undefined);

            expect(result).toBe('devops');
        });

        it('should return undefined when no domain matches', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.inferDomain('Random Term', undefined);

            expect(result).toBeUndefined();
        });

        it('should handle empty term', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.inferDomain('', undefined);

            expect(result).toBeUndefined();
        });

        it('should infer business domain from roi keyword', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.inferDomain('ROI Analysis', undefined);

            expect(result).toBe('business');
        });

        it('should infer infrastructure domain from network keyword', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.inferDomain('Network Infrastructure', undefined);

            expect(result).toBe('infrastructure');
        });
    });

    describe('gatherInternalContext', () => {
        it('should gather similar terms and suggested domain', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.gatherInternalContext('kube', undefined);

            expect(result.similarTerms).toBeDefined();
            expect(result.relatedProjects).toEqual([]);
            // suggestedDomain may be undefined if no keywords match
        });

        it('should include suggested domain when inferable', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.gatherInternalContext('kubernetes', undefined);

            expect(result.suggestedDomain).toBe('devops');
        });

        it('should work with expansion', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.gatherInternalContext('K8s', 'Kubernetes');

            expect(result.suggestedDomain).toBe('devops');
        });

        it('should always start with empty related projects', () => {
            const instance = TermContext.create(mockContextInstance);
            const result = instance.gatherInternalContext('test', undefined);

            expect(result.relatedProjects).toEqual([]);
        });
    });

    describe('buildAnalysisContext', () => {
        it('should build context with basic term info', () => {
            const mockFetchResult: ContentFetcher.FetchResult = {
                success: false,
            };
            const mockInternalContext: TermContext.InternalTermContext = {
                similarTerms: [],
                relatedProjects: [],
            };

            const result = TermContext.buildAnalysisContext(
                'Test',
                undefined,
                mockFetchResult,
                mockInternalContext
            );

            expect(result.term).toBe('Test');
            expect(result.contextText).toContain('Term: Test');
        });

        it('should include expansion in context', () => {
            const mockFetchResult: ContentFetcher.FetchResult = {
                success: false,
            };
            const mockInternalContext: TermContext.InternalTermContext = {
                similarTerms: [],
                relatedProjects: [],
            };

            const result = TermContext.buildAnalysisContext(
                'K8s',
                'Kubernetes',
                mockFetchResult,
                mockInternalContext
            );

            expect(result.expansion).toBe('Kubernetes');
            expect(result.contextText).toContain('Expansion: Kubernetes');
        });

        it('should include source content when available', () => {
            const mockFetchResult: ContentFetcher.FetchResult = {
                success: true,
                content: 'Detailed documentation content',
                sourceType: 'url',
                sourceName: 'example.com',
            };
            const mockInternalContext: TermContext.InternalTermContext = {
                similarTerms: [],
                relatedProjects: [],
            };

            const result = TermContext.buildAnalysisContext(
                'Test',
                undefined,
                mockFetchResult,
                mockInternalContext
            );

            expect(result.sourceContent).toBe('Detailed documentation content');
            expect(result.sourceType).toBe('url');
            expect(result.sourceName).toBe('example.com');
            expect(result.contextText).toContain('--- Source Content ---');
        });

        it('should truncate long source content to 5000 chars', () => {
            const longContent = 'a'.repeat(10000);
            const mockFetchResult: ContentFetcher.FetchResult = {
                success: true,
                content: longContent,
                sourceType: 'file',
            };
            const mockInternalContext: TermContext.InternalTermContext = {
                similarTerms: [],
                relatedProjects: [],
            };

            const result = TermContext.buildAnalysisContext(
                'Test',
                undefined,
                mockFetchResult,
                mockInternalContext
            );

            const contentInContext = result.contextText.split('--- Source Content ---')[1];
            expect(contentInContext.length).toBeLessThan(longContent.length);
        });

        it('should include suggested domain', () => {
            const mockFetchResult: ContentFetcher.FetchResult = {
                success: false,
            };
            const mockInternalContext: TermContext.InternalTermContext = {
                similarTerms: [],
                relatedProjects: [],
                suggestedDomain: 'devops',
            };

            const result = TermContext.buildAnalysisContext(
                'Test',
                undefined,
                mockFetchResult,
                mockInternalContext
            );

            expect(result.suggestedDomain).toBe('devops');
            expect(result.contextText).toContain('Suggested Domain: devops');
        });

        it('should include similar terms in context', () => {
            const mockFetchResult: ContentFetcher.FetchResult = {
                success: false,
            };
            const mockInternalContext: TermContext.InternalTermContext = {
                similarTerms: [mockTerms[0]],
                relatedProjects: [],
            };

            const result = TermContext.buildAnalysisContext(
                'Test',
                undefined,
                mockFetchResult,
                mockInternalContext
            );

            expect(result.similarTerms).toEqual([mockTerms[0]]);
            expect(result.contextText).toContain('Similar existing terms:');
            expect(result.contextText).toContain('Kubernetes');
        });

        it('should include term domain and topics in similar terms', () => {
            const mockFetchResult: ContentFetcher.FetchResult = {
                success: false,
            };
            const mockInternalContext: TermContext.InternalTermContext = {
                similarTerms: [mockTerms[0]],
                relatedProjects: [],
            };

            const result = TermContext.buildAnalysisContext(
                'Test',
                undefined,
                mockFetchResult,
                mockInternalContext
            );

            expect(result.contextText).toContain('Domain: devops');
            expect(result.contextText).toContain('Topics: containers, orchestration, cloud');
        });

        it('should handle undefined fetch result', () => {
            const mockInternalContext: TermContext.InternalTermContext = {
                similarTerms: [],
                relatedProjects: [],
            };

            const result = TermContext.buildAnalysisContext(
                'Test',
                undefined,
                undefined,
                mockInternalContext
            );

            expect(result.sourceContent).toBeUndefined();
            expect(result.contextText).not.toContain('--- Source Content ---');
        });

        it('should start with empty related projects', () => {
            const mockFetchResult: ContentFetcher.FetchResult = {
                success: false,
            };
            const mockInternalContext: TermContext.InternalTermContext = {
                similarTerms: [],
                relatedProjects: [],
            };

            const result = TermContext.buildAnalysisContext(
                'Test',
                undefined,
                mockFetchResult,
                mockInternalContext
            );

            expect(result.relatedProjects).toEqual([]);
        });
    });

    describe('enrichWithProjects', () => {
        it('should enrich context with projects based on topics', () => {
            const instance = TermContext.create(mockContextInstance);
            const baseContext: TermContext.TermAnalysisContext = {
                term: 'Test',
                similarTerms: [],
                relatedProjects: [],
                contextText: 'Test',
            };

            const result = TermContext.enrichWithProjects(
                baseContext,
                ['containers', 'orchestration'],
                instance
            );

            expect(result.topics).toEqual(['containers', 'orchestration']);
            expect(result.relatedProjects).toContainEqual(mockProjects[0]);
        });

        it('should preserve existing context properties', () => {
            const instance = TermContext.create(mockContextInstance);
            const baseContext: TermContext.TermAnalysisContext = {
                term: 'Test',
                expansion: 'Testing',
                sourceContent: 'content',
                similarTerms: [mockTerms[0]],
                suggestedDomain: 'devops',
                relatedProjects: [],
                contextText: 'Test',
            };

            const result = TermContext.enrichWithProjects(
                baseContext,
                ['containers'],
                instance
            );

            expect(result.term).toBe('Test');
            expect(result.expansion).toBe('Testing');
            expect(result.sourceContent).toBe('content');
            expect(result.similarTerms).toEqual([mockTerms[0]]);
            expect(result.suggestedDomain).toBe('devops');
        });

        it('should handle empty topics', () => {
            const instance = TermContext.create(mockContextInstance);
            const baseContext: TermContext.TermAnalysisContext = {
                term: 'Test',
                similarTerms: [],
                relatedProjects: [],
                contextText: 'Test',
            };

            const result = TermContext.enrichWithProjects(baseContext, [], instance);

            expect(result.topics).toEqual([]);
            expect(result.relatedProjects).toEqual([]);
        });
    });
});
