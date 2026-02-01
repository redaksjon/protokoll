/**
 * Tests for resilient entity finder
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as Context from '../../src/context';
import { findProjectResilient, findPersonResilient, findTermResilient } from '../../src/utils/entityFinder';
import type { Project, Person, Term } from '../../src/context/types';

describe('entityFinder', () => {
    let context: Context.ContextInstance;
    let tempDir: string;

    beforeEach(async () => {
        const fs = await import('fs/promises');
        const path = await import('path');
        const os = await import('os');
        
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'entity-finder-test-'));
        
        // Create .protokoll directory structure
        const protokollDir = path.join(tempDir, '.protokoll');
        await fs.mkdir(path.join(protokollDir, 'context', 'projects'), { recursive: true });
        await fs.mkdir(path.join(protokollDir, 'context', 'people'), { recursive: true });
        await fs.mkdir(path.join(protokollDir, 'context', 'terms'), { recursive: true });
        
        context = await Context.create({ startingDir: tempDir });
        
        // Create test entities
        const project1: Project = {
            id: 'test-project',
            name: 'Test Project',
            type: 'project',
            active: true,
        };
        
        const project2: Project = {
            id: 'another-project',
            name: 'Another Project',
            type: 'project',
            active: true,
        };
        
        const person1: Person = {
            id: 'john-doe',
            name: 'John Doe',
            type: 'person',
        };
        
        const term1: Term = {
            id: 'test-term',
            name: 'Test Term',
            type: 'term',
        };
        
        await context.saveEntity(project1);
        await context.saveEntity(project2);
        await context.saveEntity(person1);
        await context.saveEntity(term1);
    });

    describe('findProjectResilient', () => {
        it('should find project by exact ID', () => {
            const project = findProjectResilient(context, 'test-project');
            expect(project.id).toBe('test-project');
            expect(project.name).toBe('Test Project');
        });

        it('should find project by exact name (case-insensitive)', () => {
            const project = findProjectResilient(context, 'test project');
            expect(project.id).toBe('test-project');
        });

        it('should find project by fuzzy ID match', () => {
            const project = findProjectResilient(context, 'test-projct'); // typo
            expect(project.id).toBe('test-project');
        });

        it('should find project by fuzzy name match', () => {
            const project = findProjectResilient(context, 'Test Projct'); // typo
            expect(project.id).toBe('test-project');
        });

        it('should prefer exact name match over fuzzy match', () => {
            const project = findProjectResilient(context, 'Another Project');
            expect(project.id).toBe('another-project');
        });

        it('should throw error with helpful message when project not found', () => {
            expect(() => {
                findProjectResilient(context, 'non-existent-project');
            }).toThrow(/Project not found: "non-existent-project"/);
        });

        it('should include available projects in error message', () => {
            try {
                findProjectResilient(context, 'non-existent');
            } catch (error) {
                const errorMessage = (error as Error).message;
                expect(errorMessage).toContain('Available projects:');
                expect(errorMessage).toContain('test-project');
                expect(errorMessage).toContain('another-project');
            }
        });
    });

    describe('findPersonResilient', () => {
        it('should find person by exact ID', () => {
            const person = findPersonResilient(context, 'john-doe');
            expect(person.id).toBe('john-doe');
            expect(person.name).toBe('John Doe');
        });

        it('should find person by exact name (case-insensitive)', () => {
            const person = findPersonResilient(context, 'john doe');
            expect(person.id).toBe('john-doe');
        });

        it('should throw error when person not found', () => {
            expect(() => {
                findPersonResilient(context, 'non-existent-person');
            }).toThrow(/Person not found: "non-existent-person"/);
        });
    });

    describe('findTermResilient', () => {
        it('should find term by exact ID', () => {
            const term = findTermResilient(context, 'test-term');
            expect(term.id).toBe('test-term');
            expect(term.name).toBe('Test Term');
        });

        it('should find term by exact name (case-insensitive)', () => {
            const term = findTermResilient(context, 'test term');
            expect(term.id).toBe('test-term');
        });

        it('should throw error when term not found', () => {
            expect(() => {
                findTermResilient(context, 'non-existent-term');
            }).toThrow(/Term not found: "non-existent-term"/);
        });
    });
});
