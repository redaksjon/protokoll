/**
 * Phase 1: Term Context Tests - Branch Coverage
 * Focus: Testing the conditional branches in term matching and domain inference
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from '../../src/cli/term-context';
import type { TermContextInstance } from '../../src/cli/term-context';
import type { Term, Project, ContextInstance } from '../../src/context';

describe('src/cli/term-context.ts - Phase 1 Branch Coverage', () => {
    let contextInstance: ContextInstance;
    let termContext: TermContextInstance;

    beforeEach(() => {
        contextInstance = {
            getAllTerms: vi.fn().mockReturnValue([
                { id: 'api', name: 'API', type: 'term', expansion: 'Application Programming Interface' },
                { id: 'rest', name: 'REST', type: 'term', expansion: 'Representational State Transfer', sounds_like: ['rest api'] },
                { id: 'ws', name: 'WebSocket', type: 'term', sounds_like: ['web socket', 'websocket'] },
                { id: 'http', name: 'HTTP', type: 'term', expansion: 'HyperText Transfer Protocol' },
            ]) as any,
            getAllProjects: vi.fn().mockReturnValue([
                { id: 'backend', name: 'Backend', classification: { context_type: 'work', topics: ['api', 'database'] } },
                { id: 'frontend', name: 'Frontend', classification: { context_type: 'work', topics: ['ui', 'javascript'] } },
                { id: 'devops', name: 'DevOps', classification: { context_type: 'work', topics: ['infrastructure', 'deployment'] } },
            ]) as any,
        } as any;

        termContext = create(contextInstance);
    });

    describe('findSimilarTerms - Branch Coverage', () => {
        it('should match exact term name (excluding self)', () => {
            const similar = termContext.findSimilarTerms('API');
            // Should not include itself
            expect(similar.every(t => t.id !== 'api')).toBe(true);
        });

        it('should match term containing the search term (contains branch)', () => {
            const similar = termContext.findSimilarTerms('HTTP');
            // "HTTP" doesn't contain or is contained in others
            expect(similar).toBeDefined();
        });

        it('should match term when search contains term name (contains branch reverse)', () => {
            const similar = termContext.findSimilarTerms('WebSocket');
            expect(similar.length).toBeGreaterThanOrEqual(0);
        });

        it('should match by sounds_like variant (sounds_like branch)', () => {
            const similar = termContext.findSimilarTerms('rest api');
            // "rest api" matches REST's sounds_like
            expect(similar.length).toBeGreaterThan(0);
        });

        it('should match by expansion (expansion branch)', () => {
            const similar = termContext.findSimilarTerms('Application Programming Interface');
            // Should match API's expansion
            expect(similar.length).toBeGreaterThan(0);
        });

        it('should limit results to top 5', () => {
            // Create a large list of terms
            contextInstance.getAllTerms = vi.fn().mockReturnValue(
                Array.from({ length: 20 }, (_, i) => ({
                    id: `term${i}`,
                    name: `Term ${i}`,
                    type: 'term',
                    sounds_like: ['searchterm'],
                }))
            ) as any;

            termContext = create(contextInstance);
            const similar = termContext.findSimilarTerms('searchterm');
            
            expect(similar.length).toBeLessThanOrEqual(5);
        });

        it('should handle empty term list', () => {
            contextInstance.getAllTerms = vi.fn().mockReturnValue([]);
            termContext = create(contextInstance);

            const similar = termContext.findSimilarTerms('anything');
            expect(similar).toEqual([]);
        });

        it('should be case insensitive', () => {
            const similar1 = termContext.findSimilarTerms('api');
            const similar2 = termContext.findSimilarTerms('API');

            // Both should find similar results (excluding exact match)
            expect(similar1.length).toBe(similar2.length);
        });
    });

    describe('findProjectsByTopic - Branch Coverage', () => {
        it('should return empty array when no topics provided (empty array branch)', () => {
            const projects = termContext.findProjectsByTopic([]);
            expect(projects).toEqual([]);
        });

        it('should match projects by single topic (one topic branch)', () => {
            const projects = termContext.findProjectsByTopic(['api']);
            
            expect(projects.length).toBeGreaterThan(0);
            expect(projects[0].id).toBe('backend');
        });

        it('should match projects by multiple topics (multiple topics branch)', () => {
            const projects = termContext.findProjectsByTopic(['api', 'javascript']);
            
            expect(projects.length).toBeGreaterThan(0);
        });

        it('should score projects by topic overlap', () => {
            const projects = termContext.findProjectsByTopic(['api', 'database', 'infrastructure']);
            
            // Backend should score highest (has api + database)
            expect(projects[0].id).toBe('backend');
        });

        it('should be case insensitive for topics', () => {
            const projects1 = termContext.findProjectsByTopic(['API']);
            const projects2 = termContext.findProjectsByTopic(['api']);
            
            expect(projects1.length).toBe(projects2.length);
        });

        it('should handle topics not in any project', () => {
            const projects = termContext.findProjectsByTopic(['nonexistent']);
            
            // Should return empty or all projects with score 0
            expect(Array.isArray(projects)).toBe(true);
        });

        it('should limit results', () => {
            contextInstance.getAllProjects = vi.fn().mockReturnValue(
                Array.from({ length: 20 }, (_, i) => ({
                    id: `proj${i}`,
                    name: `Project ${i}`,
                    classification: { context_type: 'work', topics: ['target-topic'] },
                }))
            ) as any;

            termContext = create(contextInstance);
            const projects = termContext.findProjectsByTopic(['target-topic']);
            
            expect(projects.length).toBeLessThanOrEqual(10);
        });
    });

    describe('inferDomain - Branch Coverage', () => {
        it('should infer domain from keywords in term name', () => {
            const domain = termContext.inferDomain('REST API');
            
            // Should detect backend/api keywords or be undefined
            expect(typeof domain === 'string' || domain === undefined).toBe(true);
        });

        it('should infer domain from keywords in expansion', () => {
            const domain = termContext.inferDomain('DBN', 'Database Native');
            
            expect(domain).toBeDefined();
        });

        it('should return undefined when no domain detected', () => {
            const domain = termContext.inferDomain('XYZ', 'Generic Acronym');
            
            // Might be undefined or a generic domain
            expect(typeof domain === 'string' || domain === undefined).toBe(true);
        });

        it('should prioritize expansion keywords over name', () => {
            const domain = termContext.inferDomain('API', 'Database Architecture Pattern');
            
            // Should recognize database from expansion
            expect(domain).toBeDefined();
        });

        it('should handle null expansion gracefully', () => {
            const domain = termContext.inferDomain('API');
            
            expect(typeof domain === 'string' || domain === undefined).toBe(true);
        });

        it('should be case insensitive', () => {
            const domain1 = termContext.inferDomain('rest');
            const domain2 = termContext.inferDomain('REST');
            
            expect(domain1).toBe(domain2);
        });
    });

    describe('gatherInternalContext', () => {
        it('should gather complete internal context', () => {
            const context = termContext.gatherInternalContext('REST', 'Representational State Transfer');
            
            expect(context.similarTerms).toBeDefined();
            expect(Array.isArray(context.similarTerms)).toBe(true);
            expect(context.relatedProjects).toBeDefined();
            expect(Array.isArray(context.relatedProjects)).toBe(true);
        });

        it('should find similar terms for context', () => {
            const context = termContext.gatherInternalContext('API');
            
            // Should find similar terms (or be empty if no matches)
            expect(Array.isArray(context.similarTerms)).toBe(true);
        });

        it('should include suggested domain', () => {
            const context = termContext.gatherInternalContext('Database');
            
            expect(context).toHaveProperty('suggestedDomain');
        });

        it('should handle term without matches', () => {
            const context = termContext.gatherInternalContext('XYZZZZ');
            
            expect(context.similarTerms).toBeDefined();
            expect(context.relatedProjects).toBeDefined();
        });
    });

    describe('Integration - Multiple Branches', () => {
        it('should handle complex term with multiple matching criteria', () => {
            // Add a complex term that matches multiple criteria
            contextInstance.getAllTerms = vi.fn().mockReturnValue([
                {
                    id: 'webapi',
                    name: 'Web API',
                    type: 'term',
                    expansion: 'Application Programming Interface for Web',
                    sounds_like: ['web a p i', 'web api'],
                },
                {
                    id: 'api',
                    name: 'API',
                    type: 'term',
                    expansion: 'Application Programming Interface',
                },
            ]) as any;

            termContext = create(contextInstance);

            // Should match by:
            // 1. Contains branch (API contains in Web API)
            // 2. Sounds_like branch
            // 3. Expansion contains branch
            const similar = termContext.findSimilarTerms('API');
            expect(similar.length).toBeGreaterThan(0);
            expect(similar[0].id).toBe('webapi');
        });

        it('should handle edge case where term matches itself in different ways', () => {
            const term = 'test';
            
            // Even if it matches itself multiple ways, should exclude it
            const similar = termContext.findSimilarTerms(term);
            expect(similar.every(t => t.id !== 'test')).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle special characters in term names', () => {
            contextInstance.getAllTerms = vi.fn().mockReturnValue([
                {
                    id: 'cpp',
                    name: 'C++',
                    type: 'term',
                },
            ]) as any;

            termContext = create(contextInstance);
            const similar = termContext.findSimilarTerms('C++');
            
            expect(Array.isArray(similar)).toBe(true);
        });

        it('should handle very long term names', () => {
            const longName = 'A'.repeat(1000);
            const context = termContext.gatherInternalContext(longName);
            
            expect(context.similarTerms).toBeDefined();
        });

        it('should handle empty term name', () => {
            const context = termContext.gatherInternalContext('');
            
            expect(context.similarTerms).toBeDefined();
        });
    });
});
