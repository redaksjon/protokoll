/**
 * Phase 1: CLI Feedback Tests
 * Focus: Testing the conditional branches in tool execution and help system
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as Context from '../../src/context';
import type { FeedbackContext } from '../../src/cli/feedback';
import { executeTool } from '../../src/cli/feedback';

describe('src/cli/feedback.ts - Phase 1 Branch Coverage', () => {
    let feedbackCtx: FeedbackContext;

    beforeEach(async () => {
        // Create a mock context
        const mockContext = {
            getTerm: vi.fn().mockReturnValue(null),
            getPerson: vi.fn().mockReturnValue(null),
            getProject: vi.fn().mockReturnValue({ id: 'test-proj', name: 'Test', routing: {} }),
            getAllProjects: vi.fn().mockReturnValue([]),
            saveEntity: vi.fn().mockResolvedValue(undefined),
        };

        feedbackCtx = {
            transcriptPath: '/tmp/test.md',
            transcriptContent: 'Test content\nWith some lines\nTo edit',
            originalContent: 'Test content\nWith some lines\nTo edit',
            context: mockContext as any,
            changes: [],
            verbose: false,
            dryRun: false,
        };
    });

    describe('correct_text Tool', () => {
        it('should replace all occurrences when replace_all is true', async () => {
            const result = await executeTool('correct_text', {
                find: 'Test',
                replace: 'Demo',
                replace_all: true,
            }, feedbackCtx);

            expect(result.success).toBe(true);
            expect(feedbackCtx.transcriptContent).not.toContain('Test');
            expect(feedbackCtx.transcriptContent).toContain('Demo');
            expect(feedbackCtx.changes).toHaveLength(1);
        });

        it('should replace only first occurrence when replace_all is false', async () => {
            feedbackCtx.transcriptContent = 'Test Test Test';
            
            const result = await executeTool('correct_text', {
                find: 'Test',
                replace: 'Demo',
                replace_all: false,
            }, feedbackCtx);

            expect(result.success).toBe(true);
            expect(feedbackCtx.transcriptContent).toBe('Demo Test Test');
        });

        it('should fail when text not found', async () => {
            const result = await executeTool('correct_text', {
                find: 'NotFound',
                replace: 'Something',
            }, feedbackCtx);

            expect(result.success).toBe(false);
            expect(result.message).toContain('not found');
        });

        it('should count occurrences correctly', async () => {
            feedbackCtx.transcriptContent = 'foo foo foo';
            
            await executeTool('correct_text', {
                find: 'foo',
                replace: 'bar',
                replace_all: true,
            }, feedbackCtx);

            expect(feedbackCtx.changes[0].details.count).toBe(3);
        });

        it('should default replace_all to true', async () => {
            feedbackCtx.transcriptContent = 'Test Test';
            
            await executeTool('correct_text', {
                find: 'Test',
                replace: 'Demo',
            }, feedbackCtx);

            expect(feedbackCtx.transcriptContent).toBe('Demo Demo');
        });

        it('should record change details', async () => {
            await executeTool('correct_text', {
                find: 'content',
                replace: 'data',
            }, feedbackCtx);

            expect(feedbackCtx.changes).toHaveLength(1);
            expect(feedbackCtx.changes[0].type).toBe('text_correction');
            expect(feedbackCtx.changes[0].details.find).toBe('content');
            expect(feedbackCtx.changes[0].details.replace).toBe('data');
        });
    });

    describe('add_term Tool', () => {
        it('should add new term successfully', async () => {
            const result = await executeTool('add_term', {
                term: 'API',
                definition: 'Application Programming Interface',
                sounds_like: ['A P I', 'api'],
                context: 'Technical',
            }, feedbackCtx);

            expect(result.success).toBe(true);
            expect(feedbackCtx.context.saveEntity).toHaveBeenCalled();
            expect(feedbackCtx.changes).toHaveLength(1);
        });

        it('should fail when term already exists', async () => {
            feedbackCtx.context.getTerm = vi.fn().mockReturnValue({ id: 'api', name: 'API' });

            const result = await executeTool('add_term', {
                term: 'API',
                definition: 'Already exists',
            }, feedbackCtx);

            expect(result.success).toBe(false);
            expect(result.message).toContain('already exists');
        });

        it('should skip save in dry-run mode', async () => {
            feedbackCtx.dryRun = true;

            await executeTool('add_term', {
                term: 'TEST',
                definition: 'A test term',
            }, feedbackCtx);

            expect(feedbackCtx.context.saveEntity).not.toHaveBeenCalled();
        });

        it('should generate proper ID from term', async () => {
            await executeTool('add_term', {
                term: 'My Term Name',
                definition: 'Definition',
            }, feedbackCtx);

            const callArgs = (feedbackCtx.context.saveEntity as any).mock.calls[0][0];
            expect(callArgs.id).toBe('my-term-name');
        });

        it('should handle sounds_like variations', async () => {
            const sounds = ['variation 1', 'variation 2'];
            await executeTool('add_term', {
                term: 'Term',
                definition: 'Def',
                sounds_like: sounds,
            }, feedbackCtx);

            const callArgs = (feedbackCtx.context.saveEntity as any).mock.calls[0][0];
            expect(callArgs.sounds_like).toEqual(sounds);
        });
    });

    describe('add_person Tool', () => {
        it('should add new person successfully', async () => {
            const result = await executeTool('add_person', {
                name: 'John Doe',
                sounds_like: ['Jon Doe', 'John D'],
                role: 'Manager',
                company: 'Acme',
                context: 'Team lead',
            }, feedbackCtx);

            expect(result.success).toBe(true);
            expect(feedbackCtx.context.saveEntity).toHaveBeenCalled();
            expect(feedbackCtx.changes).toHaveLength(1);
        });

        it('should fail when person already exists', async () => {
            feedbackCtx.context.getPerson = vi.fn().mockReturnValue({ id: 'john-doe', name: 'John Doe' });

            const result = await executeTool('add_person', {
                name: 'John Doe',
                sounds_like: ['Jon Doe'],
            }, feedbackCtx);

            expect(result.success).toBe(false);
            expect(result.message).toContain('already exists');
        });

        it('should generate proper ID from name', async () => {
            await executeTool('add_person', {
                name: 'Jane Smith',
                sounds_like: ['Jane S'],
            }, feedbackCtx);

            const callArgs = (feedbackCtx.context.saveEntity as any).mock.calls[0][0];
            expect(callArgs.id).toBe('jane-smith');
        });

        it('should handle optional fields', async () => {
            await executeTool('add_person', {
                name: 'Bob',
                sounds_like: [],
            }, feedbackCtx);

            expect(feedbackCtx.changes).toHaveLength(1);
        });
    });

    describe('change_project Tool', () => {
        it('should change project successfully', async () => {
            feedbackCtx.context.getProject = vi.fn().mockReturnValue({
                id: 'new-proj',
                name: 'New Project',
                routing: { destination: '/new/path' },
            });

            const result = await executeTool('change_project', {
                project_id: 'new-proj',
            }, feedbackCtx);

            expect(result.success).toBe(true);
            expect(feedbackCtx.changes).toHaveLength(1);
        });

        it('should fail when project not found', async () => {
            feedbackCtx.context.getProject = vi.fn().mockReturnValue(null);
            feedbackCtx.context.getAllProjects = vi.fn().mockReturnValue([]);

            const result = await executeTool('change_project', {
                project_id: 'nonexistent',
            }, feedbackCtx);

            expect(result.success).toBe(false);
            expect(result.message).toContain('not found');
        });

        it('should update project metadata in transcript', async () => {
            feedbackCtx.transcriptContent = '**Project**: Old Project\n**Project ID**: `old-proj`\nContent';
            feedbackCtx.context.getProject = vi.fn().mockReturnValue({
                id: 'new-proj',
                name: 'New Project',
                routing: {},
            });

            await executeTool('change_project', {
                project_id: 'new-proj',
            }, feedbackCtx);

            expect(feedbackCtx.transcriptContent).toContain('**Project**: New Project');
            expect(feedbackCtx.transcriptContent).toContain('**Project ID**: `new-proj`');
        });

        it('should list available projects on error', async () => {
            feedbackCtx.context.getProject = vi.fn().mockReturnValue(null);
            feedbackCtx.context.getAllProjects = vi.fn().mockReturnValue([
                { id: 'proj1', name: 'Project 1' },
                { id: 'proj2', name: 'Project 2' },
            ]);

            const result = await executeTool('change_project', {
                project_id: 'invalid',
            }, feedbackCtx);

            expect(result.message).toContain('proj1');
            expect(result.message).toContain('proj2');
        });
    });

    describe('change_title Tool', () => {
        it('should change title in transcript', async () => {
            feedbackCtx.transcriptContent = '# Old Title\nContent here';

            const result = await executeTool('change_title', {
                new_title: 'New Title',
            }, feedbackCtx);

            expect(result.success).toBe(true);
            expect(feedbackCtx.transcriptContent).toContain('# New Title');
            expect(feedbackCtx.transcriptContent).not.toContain('# Old Title');
        });

        it('should record title change', async () => {
            feedbackCtx.transcriptContent = '# Original\nContent';

            await executeTool('change_title', {
                new_title: 'Updated',
            }, feedbackCtx);

            expect(feedbackCtx.changes).toHaveLength(1);
            expect(feedbackCtx.changes[0].type).toBe('title_changed');
        });

        it('should handle title without heading', async () => {
            feedbackCtx.transcriptContent = 'No heading\nJust content';

            const result = await executeTool('change_title', {
                new_title: 'New Title',
            }, feedbackCtx);

            expect(result.success).toBe(true);
            // Content unchanged if no heading found
            expect(feedbackCtx.transcriptContent).toBe('No heading\nJust content');
        });
    });

    describe('provide_help Tool', () => {
        it('should provide general help', async () => {
            const result = await executeTool('provide_help', {
                topic: 'general',
            }, feedbackCtx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('Can Help');
        });

        it('should provide terms help', async () => {
            const result = await executeTool('provide_help', {
                topic: 'terms',
            }, feedbackCtx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('term');
        });

        it('should provide people help', async () => {
            const result = await executeTool('provide_help', {
                topic: 'people',
            }, feedbackCtx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('name');
        });

        it('should provide projects help', async () => {
            const result = await executeTool('provide_help', {
                topic: 'projects',
            }, feedbackCtx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('project');
        });

        it('should provide corrections help', async () => {
            const result = await executeTool('provide_help', {
                topic: 'corrections',
            }, feedbackCtx);

            expect(result.success).toBe(true);
        });

        it('should default to general help when topic missing', async () => {
            const result = await executeTool('provide_help', {}, feedbackCtx);

            expect(result.success).toBe(true);
            expect(result.message).toBeDefined();
        });
    });

    describe('complete Tool', () => {
        it('should complete with summary', async () => {
            const result = await executeTool('complete', {
                summary: 'Applied 3 changes',
            }, feedbackCtx);

            expect(result.success).toBe(true);
            expect(result.message).toBe('Applied 3 changes');
            expect(result.data?.complete).toBe(true);
        });
    });

    describe('Unknown Tool', () => {
        it('should handle unknown tool gracefully', async () => {
            const result = await executeTool('unknown_tool', {}, feedbackCtx);

            expect(result.success).toBe(false);
            expect(result.message).toContain('Unknown tool');
        });
    });

    describe('Verbose Mode', () => {
        it('should print debug output in verbose mode', async () => {
            feedbackCtx.verbose = true;

            expect(() => {
                executeTool('correct_text', {
                    find: 'Test',
                    replace: 'Demo',
                }, feedbackCtx);
            }).not.toThrow();
        });
    });
});
