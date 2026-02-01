/**
 * Tests for Relationship Suggestion Assistant
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as RelationshipAssist from '../../src/cli/relationship-assist';
import * as Context from '../../src/context';
import type { Project, Term } from '../../src/context/types';

describe('RelationshipAssist', () => {
    describe('suggestRelationships', () => {
        it('should suggest parent when project name contains parent name', () => {
            const mockContext = {
                getAllProjects: () => [
                    {
                        id: 'redaksjon',
                        name: 'Redaksjon',
                        type: 'project',
                        classification: { context_type: 'work' },
                        routing: { structure: 'month', filename_options: [] }
                    } as Project
                ],
                getAllTerms: () => [],
            } as Context.ContextInstance;

            const suggestions = RelationshipAssist.suggestRelationships(mockContext, {
                projectName: 'Redaksjon Tools',
                projectId: 'redaksjon-tools',
                topics: [],
            });

            expect(suggestions.parent).toBeDefined();
            expect(suggestions.parent?.id).toBe('redaksjon');
            expect(suggestions.parent?.confidence).toBe('medium'); // Score 50 = medium
        });

        it('should suggest parent when topic contains {parent}-subproject', () => {
            const mockContext = {
                getAllProjects: () => [
                    {
                        id: 'redaksjon',
                        name: 'Redaksjon',
                        type: 'project',
                        classification: { context_type: 'work' },
                        routing: { structure: 'month', filename_options: [] }
                    } as Project
                ],
                getAllTerms: () => [],
            } as Context.ContextInstance;

            const suggestions = RelationshipAssist.suggestRelationships(mockContext, {
                projectName: 'Kronologi',
                projectId: 'kronologi',
                topics: ['git', 'history', 'redaksjon-subproject'],
            });

            expect(suggestions.parent).toBeDefined();
            expect(suggestions.parent?.id).toBe('redaksjon');
            expect(suggestions.parent?.confidence).toBe('high');
        });

        it('should suggest siblings when they share parent', () => {
            const mockContext = {
                getAllProjects: () => [
                    {
                        id: 'redaksjon',
                        name: 'Redaksjon',
                        type: 'project',
                        classification: { context_type: 'work' },
                        routing: { structure: 'month', filename_options: [] }
                    } as Project,
                    {
                        id: 'protokoll',
                        name: 'Protokoll',
                        type: 'project',
                        classification: { context_type: 'work' },
                        routing: { structure: 'month', filename_options: [] },
                        relationships: [{ uri: 'redaksjon://project/redaksjon', relationship: 'parent' }]
                    } as Project,
                    {
                        id: 'observasjon',
                        name: 'Observasjon',
                        type: 'project',
                        classification: { context_type: 'work' },
                        routing: { structure: 'month', filename_options: [] },
                        relationships: [{ uri: 'redaksjon://project/redaksjon', relationship: 'parent' }]
                    } as Project
                ],
                getAllTerms: () => [],
            } as Context.ContextInstance;

            const suggestions = RelationshipAssist.suggestRelationships(mockContext, {
                projectName: 'Kronologi',
                projectId: 'kronologi',
                topics: ['git', 'redaksjon-subproject'],
            });

            expect(suggestions.siblings).toBeDefined();
            expect(suggestions.siblings?.length).toBeGreaterThan(0);
            expect(suggestions.siblings?.map(s => s.id)).toContain('protokoll');
            expect(suggestions.siblings?.map(s => s.id)).toContain('observasjon');
        });

        it('should suggest related terms when they match topics', () => {
            const mockContext = {
                getAllProjects: () => [],
                getAllTerms: () => [
                    {
                        id: 'whisper',
                        name: 'Whisper',
                        type: 'term',
                        topics: ['transcription', 'audio', 'speech-to-text']
                    } as Term,
                    {
                        id: 'openai',
                        name: 'OpenAI',
                        type: 'term',
                        topics: ['ai', 'ml', 'transcription']
                    } as Term
                ],
            } as Context.ContextInstance;

            const suggestions = RelationshipAssist.suggestRelationships(mockContext, {
                projectName: 'Protokoll',
                projectId: 'protokoll',
                topics: ['transcription', 'audio'],
            });

            expect(suggestions.relatedTerms).toBeDefined();
            expect(suggestions.relatedTerms?.map(t => t.id)).toContain('whisper');
        });

        it('should suggest related terms when term appears in project name', () => {
            const mockContext = {
                getAllProjects: () => [],
                getAllTerms: () => [
                    {
                        id: 'git',
                        name: 'Git',
                        type: 'term',
                    } as Term
                ],
            } as Context.ContextInstance;

            const suggestions = RelationshipAssist.suggestRelationships(mockContext, {
                projectName: 'Git History Tool',
                projectId: 'git-history',
                topics: [],
            });

            expect(suggestions.relatedTerms).toBeDefined();
            expect(suggestions.relatedTerms?.map(t => t.id)).toContain('git');
        });

        it('should return empty suggestions when no matches', () => {
            const mockContext = {
                getAllProjects: () => [],
                getAllTerms: () => [],
            } as Context.ContextInstance;

            const suggestions = RelationshipAssist.suggestRelationships(mockContext, {
                projectName: 'Standalone Project',
                projectId: 'standalone',
                topics: [],
            });

            expect(suggestions.parent).toBeUndefined();
            expect(suggestions.siblings).toBeUndefined();
            expect(suggestions.relatedTerms).toBeUndefined();
        });

        it('should suggest parent based on destination subdirectory', () => {
            const mockContext = {
                getAllProjects: () => [
                    {
                        id: 'parent-project',
                        name: 'Parent Project',
                        type: 'project',
                        classification: { context_type: 'work' },
                        routing: {
                            structure: 'month',
                            filename_options: [],
                            destination: '/parent/path'
                        }
                    } as Project
                ],
                getAllTerms: () => [],
            } as Context.ContextInstance;

            const suggestions = RelationshipAssist.suggestRelationships(mockContext, {
                projectName: 'Child Project',
                projectId: 'child-project',
                topics: [],
                destination: '/parent/path/child',
            });

            expect(suggestions.parent).toBeDefined();
            expect(suggestions.parent?.id).toBe('parent-project');
            expect(suggestions.parent?.confidence).toBe('high');
            expect(suggestions.parent?.reason).toContain('subdirectory');
        });

        it('should suggest parent based on description mention', () => {
            const mockContext = {
                getAllProjects: () => [
                    {
                        id: 'redaksjon',
                        name: 'Redaksjon',
                        type: 'project',
                        classification: { context_type: 'work' },
                        routing: { structure: 'month', filename_options: [] }
                    } as Project
                ],
                getAllTerms: () => [],
            } as Context.ContextInstance;

            const suggestions = RelationshipAssist.suggestRelationships(mockContext, {
                projectName: 'New Tool',
                projectId: 'new-tool',
                topics: [],
                description: 'A new tool for Redaksjon workflows',
            });

            expect(suggestions.parent).toBeDefined();
            expect(suggestions.parent?.id).toBe('redaksjon');
            expect(suggestions.parent?.reason).toContain('description');
        });

        it('should combine multiple signals for higher confidence', () => {
            const mockContext = {
                getAllProjects: () => [
                    {
                        id: 'redaksjon',
                        name: 'Redaksjon',
                        type: 'project',
                        classification: {
                            context_type: 'work',
                            topics: ['audio', 'transcription']
                        },
                        routing: {
                            structure: 'month',
                            filename_options: [],
                            destination: '/redaksjon'
                        }
                    } as Project
                ],
                getAllTerms: () => [],
            } as Context.ContextInstance;

            const suggestions = RelationshipAssist.suggestRelationships(mockContext, {
                projectName: 'Redaksjon Audio Tool',
                projectId: 'redaksjon-audio',
                topics: ['audio', 'transcription', 'redaksjon-subproject'],
                destination: '/redaksjon/audio',
                description: 'Audio processing for Redaksjon',
            });

            expect(suggestions.parent).toBeDefined();
            expect(suggestions.parent?.id).toBe('redaksjon');
            expect(suggestions.parent?.confidence).toBe('high');
        });

        it('should suggest terms when term name appears in description', () => {
            const mockContext = {
                getAllProjects: () => [],
                getAllTerms: () => [
                    {
                        id: 'typescript',
                        name: 'TypeScript',
                        type: 'term',
                    } as Term
                ],
            } as Context.ContextInstance;

            const suggestions = RelationshipAssist.suggestRelationships(mockContext, {
                projectName: 'Build Tool',
                projectId: 'build-tool',
                topics: [],
                description: 'A TypeScript build system',
            });

            expect(suggestions.relatedTerms).toBeDefined();
            expect(suggestions.relatedTerms?.map(t => t.id)).toContain('typescript');
        });
    });
});
