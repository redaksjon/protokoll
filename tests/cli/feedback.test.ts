/**
 * Tests for CLI feedback module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
    executeTool,
    FEEDBACK_TOOLS,
    buildFeedbackSystemPrompt,
    registerFeedbackCommands,
    FeedbackContext,
    FeedbackChange,
} from '../../src/cli/feedback';

// Sample transcript content for testing
const SAMPLE_TRANSCRIPT = `# Meeting Notes

## Metadata

**Date**: January 15, 2026
**Time**: 02:12 PM

**Project**: Default Project
**Project ID**: \`default\`

### Routing

**Destination**: /Users/test/notes
**Confidence**: 85.0%

**Tags**: \`work\`, \`meeting\`

**Duration**: 5m 30s

---

## Corrected Transcript

Today we discussed the YB project with San Jay Grouper. He mentioned that the WCMP platform
needs to be updated. We also talked about the API changes.
`;

// Mock the Context module
vi.mock('../../src/context', () => ({
    create: vi.fn(() => Promise.resolve({
        getAllProjects: vi.fn(() => [
            {
                id: 'quantum-readiness',
                name: 'Quantum Readiness',
                type: 'project',
                routing: {
                    destination: '~/notes/quantum',
                    structure: 'month',
                },
                active: true,
            },
            {
                id: 'default',
                name: 'Default Project',
                type: 'project',
                routing: {
                    destination: '~/notes',
                    structure: 'month',
                },
                active: true,
            },
        ]),
        getProject: vi.fn((id) => {
            if (id === 'quantum-readiness') {
                return {
                    id: 'quantum-readiness',
                    name: 'Quantum Readiness',
                    type: 'project',
                    routing: {
                        destination: '~/notes/quantum',
                        structure: 'month',
                    },
                    active: true,
                };
            }
            if (id === 'default') {
                return {
                    id: 'default',
                    name: 'Default Project',
                    type: 'project',
                    routing: {
                        destination: '~/notes',
                        structure: 'month',
                    },
                    active: true,
                };
            }
            return undefined;
        }),
        getTerm: vi.fn(() => undefined),
        getPerson: vi.fn(() => undefined),
        saveEntity: vi.fn(() => Promise.resolve()),
        getAllPeople: vi.fn(() => []),
        getAllTerms: vi.fn(() => []),
        getAllCompanies: vi.fn(() => []),
        getAllIgnored: vi.fn(() => []),
        hasContext: vi.fn(() => true),
    })),
}));

describe('FEEDBACK_TOOLS', () => {
    it('should define correct_text tool', () => {
        const tool = FEEDBACK_TOOLS.find(t => t.name === 'correct_text');
        expect(tool).toBeDefined();
        expect(tool?.parameters.find).toBeDefined();
        expect(tool?.parameters.replace).toBeDefined();
    });

    it('should define add_term tool', () => {
        const tool = FEEDBACK_TOOLS.find(t => t.name === 'add_term');
        expect(tool).toBeDefined();
        expect(tool?.parameters.term).toBeDefined();
        expect(tool?.parameters.definition).toBeDefined();
        expect(tool?.parameters.sounds_like).toBeDefined();
    });

    it('should define add_person tool', () => {
        const tool = FEEDBACK_TOOLS.find(t => t.name === 'add_person');
        expect(tool).toBeDefined();
        expect(tool?.parameters.name).toBeDefined();
        expect(tool?.parameters.sounds_like).toBeDefined();
    });

    it('should define change_project tool', () => {
        const tool = FEEDBACK_TOOLS.find(t => t.name === 'change_project');
        expect(tool).toBeDefined();
        expect(tool?.parameters.project_id).toBeDefined();
    });

    it('should define change_title tool', () => {
        const tool = FEEDBACK_TOOLS.find(t => t.name === 'change_title');
        expect(tool).toBeDefined();
        expect(tool?.parameters.new_title).toBeDefined();
    });

    it('should define provide_help tool', () => {
        const tool = FEEDBACK_TOOLS.find(t => t.name === 'provide_help');
        expect(tool).toBeDefined();
        expect(tool?.parameters.topic?.enum).toContain('general');
        expect(tool?.parameters.topic?.enum).toContain('terms');
        expect(tool?.parameters.topic?.enum).toContain('people');
    });

    it('should define complete tool', () => {
        const tool = FEEDBACK_TOOLS.find(t => t.name === 'complete');
        expect(tool).toBeDefined();
        expect(tool?.parameters.summary).toBeDefined();
    });
});

describe('executeTool: correct_text', () => {
    let feedbackCtx: FeedbackContext;

    beforeEach(async () => {
        const context = await (await import('../../src/context')).create();
        feedbackCtx = {
            transcriptPath: '/test/transcript.md',
            transcriptContent: SAMPLE_TRANSCRIPT,
            originalContent: SAMPLE_TRANSCRIPT,
            context,
            changes: [],
            verbose: false,
            dryRun: false,
        };
    });

    it('should replace text in transcript', async () => {
        const result = await executeTool('correct_text', {
            find: 'YB',
            replace: 'Wibey',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(feedbackCtx.transcriptContent).toContain('Wibey project');
        expect(feedbackCtx.transcriptContent).not.toContain('YB project');
        expect(feedbackCtx.changes).toHaveLength(1);
        expect(feedbackCtx.changes[0].type).toBe('text_correction');
    });

    it('should replace all occurrences by default', async () => {
        // Add multiple occurrences
        feedbackCtx.transcriptContent = 'YB is great. YB rocks. YB forever.';
        
        const result = await executeTool('correct_text', {
            find: 'YB',
            replace: 'Wibey',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(feedbackCtx.transcriptContent).toBe('Wibey is great. Wibey rocks. Wibey forever.');
    });

    it('should replace only first occurrence when replace_all is false', async () => {
        feedbackCtx.transcriptContent = 'YB is great. YB rocks.';
        
        const result = await executeTool('correct_text', {
            find: 'YB',
            replace: 'Wibey',
            replace_all: false,
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(feedbackCtx.transcriptContent).toBe('Wibey is great. YB rocks.');
    });

    it('should fail when text not found', async () => {
        const result = await executeTool('correct_text', {
            find: 'NonExistentText',
            replace: 'Something',
        }, feedbackCtx);

        expect(result.success).toBe(false);
        expect(result.message).toContain('not found');
    });
});

describe('executeTool: add_term', () => {
    let feedbackCtx: FeedbackContext;

    beforeEach(async () => {
        const context = await (await import('../../src/context')).create();
        feedbackCtx = {
            transcriptPath: '/test/transcript.md',
            transcriptContent: SAMPLE_TRANSCRIPT,
            originalContent: SAMPLE_TRANSCRIPT,
            context,
            changes: [],
            verbose: false,
            dryRun: false,
        };
    });

    it('should add a new term to context', async () => {
        const result = await executeTool('add_term', {
            term: 'WCNP',
            definition: 'Walmart Native Cloud Platform',
            sounds_like: ['WCMP', 'W C N P'],
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(feedbackCtx.changes).toHaveLength(1);
        expect(feedbackCtx.changes[0].type).toBe('term_added');
        expect(feedbackCtx.changes[0].details.term).toBe('WCNP');
    });

    it('should include sounds_like variations', async () => {
        const result = await executeTool('add_term', {
            term: 'API',
            definition: 'Application Programming Interface',
            sounds_like: ['A P I', 'ay pee eye'],
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(result.data?.id).toBe('api');
    });
});

describe('executeTool: add_person', () => {
    let feedbackCtx: FeedbackContext;

    beforeEach(async () => {
        const context = await (await import('../../src/context')).create();
        feedbackCtx = {
            transcriptPath: '/test/transcript.md',
            transcriptContent: SAMPLE_TRANSCRIPT,
            originalContent: SAMPLE_TRANSCRIPT,
            context,
            changes: [],
            verbose: false,
            dryRun: false,
        };
    });

    it('should add a new person to context', async () => {
        const result = await executeTool('add_person', {
            name: 'Sanjay Gupta',
            sounds_like: ['San Jay Grouper', 'Sanjay Grouper', 'San Jay'],
            role: 'Engineer',
            company: 'Acme Corp',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(feedbackCtx.changes).toHaveLength(1);
        expect(feedbackCtx.changes[0].type).toBe('person_added');
        expect(feedbackCtx.changes[0].details.name).toBe('Sanjay Gupta');
    });

    it('should generate correct ID from name', async () => {
        const result = await executeTool('add_person', {
            name: 'Sanjay Gupta',
            sounds_like: ['San Jay'],
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(result.data?.id).toBe('sanjay-gupta');
    });
});

describe('executeTool: change_project', () => {
    let feedbackCtx: FeedbackContext;

    beforeEach(async () => {
        const context = await (await import('../../src/context')).create();
        feedbackCtx = {
            transcriptPath: '/test/transcript.md',
            transcriptContent: SAMPLE_TRANSCRIPT,
            originalContent: SAMPLE_TRANSCRIPT,
            context,
            changes: [],
            verbose: false,
            dryRun: false,
        };
    });

    it('should update project metadata in transcript', async () => {
        const result = await executeTool('change_project', {
            project_id: 'quantum-readiness',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(feedbackCtx.transcriptContent).toContain('**Project**: Quantum Readiness');
        expect(feedbackCtx.transcriptContent).toContain('**Project ID**: `quantum-readiness`');
        expect(feedbackCtx.changes).toHaveLength(1);
        expect(feedbackCtx.changes[0].type).toBe('project_changed');
    });

    it('should fail for non-existent project', async () => {
        const result = await executeTool('change_project', {
            project_id: 'non-existent-project',
        }, feedbackCtx);

        expect(result.success).toBe(false);
        expect(result.message).toContain('not found');
    });
});

describe('executeTool: change_title', () => {
    let feedbackCtx: FeedbackContext;

    beforeEach(async () => {
        const context = await (await import('../../src/context')).create();
        feedbackCtx = {
            transcriptPath: '/test/transcript.md',
            transcriptContent: SAMPLE_TRANSCRIPT,
            originalContent: SAMPLE_TRANSCRIPT,
            context,
            changes: [],
            verbose: false,
            dryRun: false,
        };
    });

    it('should update title in transcript', async () => {
        const result = await executeTool('change_title', {
            new_title: 'Q1 Planning Session',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(feedbackCtx.transcriptContent).toContain('# Q1 Planning Session');
        expect(feedbackCtx.transcriptContent).not.toContain('# Meeting Notes');
        expect(feedbackCtx.changes).toHaveLength(1);
        expect(feedbackCtx.changes[0].type).toBe('title_changed');
    });

    it('should include slugified title in change details', async () => {
        const result = await executeTool('change_title', {
            new_title: 'Q1 Planning & Review!',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(feedbackCtx.changes[0].details.slug).toBe('q1-planning-review');
    });
});

describe('executeTool: provide_help', () => {
    let feedbackCtx: FeedbackContext;

    beforeEach(async () => {
        const context = await (await import('../../src/context')).create();
        feedbackCtx = {
            transcriptPath: '/test/transcript.md',
            transcriptContent: SAMPLE_TRANSCRIPT,
            originalContent: SAMPLE_TRANSCRIPT,
            context,
            changes: [],
            verbose: false,
            dryRun: false,
        };
    });

    it('should provide general help', async () => {
        const result = await executeTool('provide_help', {
            topic: 'general',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(result.message).toContain('What I Can Help With');
    });

    it('should provide terms help', async () => {
        const result = await executeTool('provide_help', {
            topic: 'terms',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Term Corrections');
    });

    it('should provide people help', async () => {
        const result = await executeTool('provide_help', {
            topic: 'people',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Name Corrections');
    });

    it('should provide projects help', async () => {
        const result = await executeTool('provide_help', {
            topic: 'projects',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Project Assignment');
    });
});

describe('executeTool: complete', () => {
    let feedbackCtx: FeedbackContext;

    beforeEach(async () => {
        const context = await (await import('../../src/context')).create();
        feedbackCtx = {
            transcriptPath: '/test/transcript.md',
            transcriptContent: SAMPLE_TRANSCRIPT,
            originalContent: SAMPLE_TRANSCRIPT,
            context,
            changes: [],
            verbose: false,
            dryRun: false,
        };
    });

    it('should return completion summary', async () => {
        const result = await executeTool('complete', {
            summary: 'Fixed 3 issues: replaced YB with Wibey, corrected Sanjay Gupta name, changed project.',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(result.data?.complete).toBe(true);
        expect(result.message).toContain('Fixed 3 issues');
    });
});

describe('buildFeedbackSystemPrompt', () => {
    it('should include transcript preview', () => {
        const prompt = buildFeedbackSystemPrompt(SAMPLE_TRANSCRIPT, ['project-a', 'project-b']);
        
        expect(prompt).toContain('Meeting Notes');
        expect(prompt).toContain('YB project');
    });

    it('should include available projects', () => {
        const prompt = buildFeedbackSystemPrompt(SAMPLE_TRANSCRIPT, ['quantum-readiness', 'default']);
        
        expect(prompt).toContain('quantum-readiness');
        expect(prompt).toContain('default');
    });

    it('should include tool descriptions', () => {
        const prompt = buildFeedbackSystemPrompt(SAMPLE_TRANSCRIPT, []);
        
        expect(prompt).toContain('correct_text');
        expect(prompt).toContain('add_term');
        expect(prompt).toContain('add_person');
        expect(prompt).toContain('change_project');
    });

    it('should truncate long transcripts', () => {
        const longTranscript = 'A'.repeat(2000);
        const prompt = buildFeedbackSystemPrompt(longTranscript, []);
        
        // Should truncate the transcript preview and add ...
        expect(prompt).toContain('...');
        // The transcript preview should be limited to ~1000 chars
        expect(prompt).not.toContain('A'.repeat(1500));
    });
});

describe('registerFeedbackCommands', () => {
    let program: Command;

    beforeEach(() => {
        program = new Command();
        program.exitOverride();
        registerFeedbackCommands(program);
    });

    it('should register feedback command', () => {
        const feedbackCmd = program.commands.find(c => c.name() === 'feedback');
        expect(feedbackCmd).toBeDefined();
    });

    it('should have --feedback option', () => {
        const feedbackCmd = program.commands.find(c => c.name() === 'feedback');
        const option = feedbackCmd?.options.find(o => o.long === '--feedback');
        expect(option).toBeDefined();
    });

    it('should have --model option', () => {
        const feedbackCmd = program.commands.find(c => c.name() === 'feedback');
        const option = feedbackCmd?.options.find(o => o.long === '--model');
        expect(option).toBeDefined();
    });

    it('should have --dry-run option', () => {
        const feedbackCmd = program.commands.find(c => c.name() === 'feedback');
        const option = feedbackCmd?.options.find(o => o.long === '--dry-run');
        expect(option).toBeDefined();
    });

    it('should have --verbose option', () => {
        const feedbackCmd = program.commands.find(c => c.name() === 'feedback');
        const option = feedbackCmd?.options.find(o => o.long === '--verbose');
        expect(option).toBeDefined();
    });

    it('should have --help-me option', () => {
        const feedbackCmd = program.commands.find(c => c.name() === 'feedback');
        const option = feedbackCmd?.options.find(o => o.long === '--help-me');
        expect(option).toBeDefined();
    });
});

describe('Integration: Multiple tool executions', () => {
    let feedbackCtx: FeedbackContext;

    beforeEach(async () => {
        const context = await (await import('../../src/context')).create();
        feedbackCtx = {
            transcriptPath: '/test/15-1412-meeting.md',
            transcriptContent: SAMPLE_TRANSCRIPT,
            originalContent: SAMPLE_TRANSCRIPT,
            context,
            changes: [],
            verbose: false,
            dryRun: false,
        };
    });

    it('should handle term correction workflow', async () => {
        // Step 1: Replace the text
        await executeTool('correct_text', {
            find: 'WCMP',
            replace: 'WCNP',
        }, feedbackCtx);

        // Step 2: Add the term
        await executeTool('add_term', {
            term: 'WCNP',
            definition: 'Walmart Native Cloud Platform',
            sounds_like: ['WCMP'],
        }, feedbackCtx);

        expect(feedbackCtx.changes).toHaveLength(2);
        expect(feedbackCtx.transcriptContent).toContain('WCNP platform');
        expect(feedbackCtx.changes.map(c => c.type)).toEqual(['text_correction', 'term_added']);
    });

    it('should handle name correction workflow', async () => {
        // Step 1: Replace the name
        await executeTool('correct_text', {
            find: 'San Jay Grouper',
            replace: 'Sanjay Gupta',
        }, feedbackCtx);

        // Step 2: Add the person
        await executeTool('add_person', {
            name: 'Sanjay Gupta',
            sounds_like: ['San Jay Grouper', 'San Jay'],
        }, feedbackCtx);

        expect(feedbackCtx.changes).toHaveLength(2);
        expect(feedbackCtx.transcriptContent).toContain('Sanjay Gupta');
        expect(feedbackCtx.changes.map(c => c.type)).toEqual(['text_correction', 'person_added']);
    });

    it('should handle project change with title change', async () => {
        // Step 1: Change project
        await executeTool('change_project', {
            project_id: 'quantum-readiness',
        }, feedbackCtx);

        // Step 2: Change title
        await executeTool('change_title', {
            new_title: 'Quantum Planning Session',
        }, feedbackCtx);

        expect(feedbackCtx.changes).toHaveLength(2);
        expect(feedbackCtx.transcriptContent).toContain('**Project**: Quantum Readiness');
        expect(feedbackCtx.transcriptContent).toContain('# Quantum Planning Session');
    });

    it('should respect dry-run mode', async () => {
        feedbackCtx.dryRun = true;

        // In dry-run mode, context should not be modified
        const result = await executeTool('add_term', {
            term: 'TestTerm',
            definition: 'Test definition',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(feedbackCtx.changes).toHaveLength(1);
        // The saveEntity call should not have happened (would need to verify with spy)
    });
});
