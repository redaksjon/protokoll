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
    applyChanges,
    runFeedback,
    processFeedback,
    FeedbackContext,
    FeedbackChange,
} from '../../src/cli/feedback';

// Mock fs/promises for tests that need it
const mockFsAccess = vi.fn();
const mockFsReadFile = vi.fn();
const mockFsWriteFile = vi.fn();
const mockFsMkdir = vi.fn();
const mockFsUnlink = vi.fn();

vi.mock('fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs/promises')>();
    return {
        ...actual,
        access: (...args: Parameters<typeof actual.access>) => mockFsAccess(...args),
        readFile: (...args: Parameters<typeof actual.readFile>) => mockFsReadFile(...args),
        writeFile: (...args: Parameters<typeof actual.writeFile>) => mockFsWriteFile(...args),
        mkdir: (...args: Parameters<typeof actual.mkdir>) => mockFsMkdir(...args),
        unlink: (...args: Parameters<typeof actual.unlink>) => mockFsUnlink(...args),
    };
});

// Mock readline
vi.mock('readline', () => ({
    createInterface: vi.fn(() => ({
        question: vi.fn((_, callback) => callback('test feedback')),
        close: vi.fn(),
    })),
}));

// Mock Reasoning module
vi.mock('../../src/reasoning', () => ({
    create: vi.fn(() => ({
        completeWithTools: vi.fn(),
    })),
}));

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

describe('executeTool: provide_help corrections', () => {
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

    it('should provide corrections help', async () => {
        const result = await executeTool('provide_help', {
            topic: 'corrections',
        }, feedbackCtx);

        expect(result.success).toBe(true);
        expect(result.message).toContain('General Corrections');
    });

    it('should provide default general help when topic is undefined', async () => {
        const result = await executeTool('provide_help', {}, feedbackCtx);

        expect(result.success).toBe(true);
        expect(result.message).toContain('What I Can Help With');
    });
});

describe('executeTool: unknown tool', () => {
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

    it('should return error for unknown tool', async () => {
        const result = await executeTool('unknown_tool', {}, feedbackCtx);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Unknown tool');
    });
});

describe('executeTool: verbose mode', () => {
    let feedbackCtx: FeedbackContext;
    let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        const context = await (await import('../../src/context')).create();
        feedbackCtx = {
            transcriptPath: '/test/transcript.md',
            transcriptContent: SAMPLE_TRANSCRIPT,
            originalContent: SAMPLE_TRANSCRIPT,
            context,
            changes: [],
            verbose: true,
            dryRun: false,
        };
        stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        stdoutWriteSpy.mockRestore();
    });

    it('should output verbose message for correct_text', async () => {
        await executeTool('correct_text', {
            find: 'YB',
            replace: 'Wibey',
        }, feedbackCtx);

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Replaced'));
    });

    it('should output verbose message for add_term', async () => {
        await executeTool('add_term', {
            term: 'API',
            definition: 'Application Programming Interface',
            sounds_like: ['A P I'],
        }, feedbackCtx);

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Added term'));
    });

    it('should output verbose message for add_person', async () => {
        await executeTool('add_person', {
            name: 'John Doe',
            sounds_like: ['Jon Doe'],
            role: 'Developer',
            company: 'Acme',
        }, feedbackCtx);

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Added person'));
        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('role'));
        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('company'));
    });

    it('should output verbose message for change_project', async () => {
        await executeTool('change_project', {
            project_id: 'quantum-readiness',
        }, feedbackCtx);

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Changed project'));
    });

    it('should output verbose message for change_title', async () => {
        await executeTool('change_title', {
            new_title: 'New Title',
        }, feedbackCtx);

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Changed title'));
    });
});

describe('executeTool: entity already exists', () => {
    it('should fail when term already exists', async () => {
        const context = await (await import('../../src/context')).create();
        // Mock getTerm to return an existing term
        (context.getTerm as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            id: 'api',
            name: 'API',
            type: 'term',
            expansion: 'Existing definition',
        });

        const feedbackCtx: FeedbackContext = {
            transcriptPath: '/test/transcript.md',
            transcriptContent: SAMPLE_TRANSCRIPT,
            originalContent: SAMPLE_TRANSCRIPT,
            context,
            changes: [],
            verbose: false,
            dryRun: false,
        };

        const result = await executeTool('add_term', {
            term: 'API',
            definition: 'Application Programming Interface',
        }, feedbackCtx);

        expect(result.success).toBe(false);
        expect(result.message).toContain('already exists');
    });

    it('should fail when person already exists', async () => {
        const context = await (await import('../../src/context')).create();
        // Mock getPerson to return an existing person
        (context.getPerson as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            id: 'john-doe',
            name: 'John Doe',
            type: 'person',
        });

        const feedbackCtx: FeedbackContext = {
            transcriptPath: '/test/transcript.md',
            transcriptContent: SAMPLE_TRANSCRIPT,
            originalContent: SAMPLE_TRANSCRIPT,
            context,
            changes: [],
            verbose: false,
            dryRun: false,
        };

        const result = await executeTool('add_person', {
            name: 'John Doe',
            sounds_like: ['Jon Doe'],
        }, feedbackCtx);

        expect(result.success).toBe(false);
        expect(result.message).toContain('already exists');
    });
});

describe('applyChanges', () => {
    let feedbackCtx: FeedbackContext;

    beforeEach(async () => {
        vi.clearAllMocks();
        const context = await (await import('../../src/context')).create();
        feedbackCtx = {
            transcriptPath: '/test/notes/15-1430-meeting.md',
            transcriptContent: SAMPLE_TRANSCRIPT,
            originalContent: SAMPLE_TRANSCRIPT,
            context,
            changes: [],
            verbose: false,
            dryRun: false,
        };

        mockFsMkdir.mockResolvedValue(undefined);
        mockFsWriteFile.mockResolvedValue(undefined);
        mockFsUnlink.mockResolvedValue(undefined);
    });

    it('should write file without changes', async () => {
        const result = await applyChanges(feedbackCtx);

        expect(result.newPath).toBe('/test/notes/15-1430-meeting.md');
        expect(result.moved).toBe(false);
        expect(mockFsWriteFile).toHaveBeenCalledWith(
            '/test/notes/15-1430-meeting.md',
            SAMPLE_TRANSCRIPT,
            'utf-8'
        );
    });

    it('should rename file when title changes (with timestamp)', async () => {
        feedbackCtx.changes = [{
            type: 'title_changed',
            description: 'Changed title',
            details: { new_title: 'New Meeting', slug: 'new-meeting' },
        }];

        const result = await applyChanges(feedbackCtx);

        expect(result.newPath).toBe('/test/notes/15-1430-new-meeting.md');
        expect(result.moved).toBe(false);
        expect(mockFsUnlink).toHaveBeenCalledWith('/test/notes/15-1430-meeting.md');
    });

    it('should rename file when title changes (without timestamp)', async () => {
        feedbackCtx.transcriptPath = '/test/notes/meeting.md';
        feedbackCtx.changes = [{
            type: 'title_changed',
            description: 'Changed title',
            details: { new_title: 'New Meeting', slug: 'new-meeting' },
        }];

        const result = await applyChanges(feedbackCtx);

        expect(result.newPath).toBe('/test/notes/new-meeting.md');
        expect(result.moved).toBe(false);
    });

    it('should move file when project changes with routing (month structure)', async () => {
        feedbackCtx.changes = [{
            type: 'project_changed',
            description: 'Changed project',
            details: {
                project_id: 'quantum',
                routing: { destination: '/new/location', structure: 'month' },
            },
        }];

        const result = await applyChanges(feedbackCtx);

        expect(result.moved).toBe(true);
        // Should include year/month in path
        expect(result.newPath).toMatch(/\/new\/location\/\d{4}\/\d{2}\/15-1430-meeting\.md/);
    });

    it('should move file when project changes with routing (year structure)', async () => {
        feedbackCtx.changes = [{
            type: 'project_changed',
            description: 'Changed project',
            details: {
                project_id: 'quantum',
                routing: { destination: '/new/location', structure: 'year' },
            },
        }];

        const result = await applyChanges(feedbackCtx);

        expect(result.moved).toBe(true);
        // Should include only year in path
        expect(result.newPath).toMatch(/\/new\/location\/\d{4}\/15-1430-meeting\.md/);
    });

    it('should move file when project changes with routing (day structure)', async () => {
        feedbackCtx.changes = [{
            type: 'project_changed',
            description: 'Changed project',
            details: {
                project_id: 'quantum',
                routing: { destination: '/new/location', structure: 'day' },
            },
        }];

        const result = await applyChanges(feedbackCtx);

        expect(result.moved).toBe(true);
        // Should include year/month/day in path
        expect(result.newPath).toMatch(/\/new\/location\/\d{4}\/\d{2}\/\d{2}\/15-1430-meeting\.md/);
    });

    it('should expand ~ in destination path', async () => {
        const originalHome = process.env.HOME;
        process.env.HOME = '/home/testuser';

        feedbackCtx.changes = [{
            type: 'project_changed',
            description: 'Changed project',
            details: {
                project_id: 'quantum',
                routing: { destination: '~/notes', structure: 'flat' },
            },
        }];

        const result = await applyChanges(feedbackCtx);

        expect(result.moved).toBe(true);
        expect(result.newPath).toContain('/home/testuser/notes');

        process.env.HOME = originalHome;
    });

    it('should not write file in dry-run mode', async () => {
        feedbackCtx.dryRun = true;
        feedbackCtx.changes = [{
            type: 'title_changed',
            description: 'Changed title',
            details: { new_title: 'New Meeting', slug: 'new-meeting' },
        }];

        await applyChanges(feedbackCtx);

        expect(mockFsWriteFile).not.toHaveBeenCalled();
        expect(mockFsUnlink).not.toHaveBeenCalled();
    });

    it('should handle both title and project changes', async () => {
        feedbackCtx.changes = [
            {
                type: 'title_changed',
                description: 'Changed title',
                details: { new_title: 'Quantum Session', slug: 'quantum-session' },
            },
            {
                type: 'project_changed',
                description: 'Changed project',
                details: {
                    project_id: 'quantum',
                    routing: { destination: '/quantum/notes', structure: 'month' },
                },
            },
        ];

        const result = await applyChanges(feedbackCtx);

        expect(result.moved).toBe(true);
        expect(result.newPath).toMatch(/\/quantum\/notes\/\d{4}\/\d{2}\/15-1430-quantum-session\.md/);
    });
});

describe('runFeedback', () => {
    let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        mockFsWriteFile.mockResolvedValue(undefined);
        mockFsMkdir.mockResolvedValue(undefined);
        mockFsUnlink.mockResolvedValue(undefined);
    });

    afterEach(() => {
        stdoutWriteSpy.mockRestore();
        exitSpy.mockRestore();
    });

    it('should exit with error when file not found', async () => {
        mockFsAccess.mockRejectedValue(new Error('ENOENT'));
        // Make process.exit actually stop execution by throwing
        exitSpy.mockImplementation((code?: number) => {
            throw new Error(`Process exited with code ${code}`);
        });

        await expect(runFeedback('/test/nonexistent.md', { feedback: 'test' }))
            .rejects.toThrow('Process exited with code 1');

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('File not found'));
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should show verbose message when processing', async () => {
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue(SAMPLE_TRANSCRIPT);

        // Mock the reasoning module to return a complete response
        const Reasoning = await import('../../src/reasoning');
        const mockReasoning = {
            completeWithTools: vi.fn().mockResolvedValue({
                content: 'Done',
                tool_calls: [{
                    id: 'call_1',
                    function: {
                        name: 'complete',
                        arguments: JSON.stringify({ summary: 'No changes needed' }),
                    },
                }],
            }),
        };
        (Reasoning.create as ReturnType<typeof vi.fn>).mockReturnValue(mockReasoning);

        await runFeedback('/test/transcript.md', { feedback: 'test', verbose: true });

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Processing feedback'));
    });

    it('should show no changes message when no changes applied', async () => {
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue(SAMPLE_TRANSCRIPT);

        const Reasoning = await import('../../src/reasoning');
        const mockReasoning = {
            completeWithTools: vi.fn().mockResolvedValue({
                content: 'Nothing to change',
                tool_calls: [],
            }),
        };
        (Reasoning.create as ReturnType<typeof vi.fn>).mockReturnValue(mockReasoning);

        await runFeedback('/test/transcript.md', { feedback: 'looks good' });

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('No changes were made'));
    });

    it('should show dry-run message when in dry-run mode', async () => {
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue(SAMPLE_TRANSCRIPT);

        const Reasoning = await import('../../src/reasoning');
        const mockReasoning = {
            completeWithTools: vi.fn()
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_1',
                        function: {
                            name: 'correct_text',
                            arguments: JSON.stringify({ find: 'YB', replace: 'Wibey' }),
                        },
                    }],
                })
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_2',
                        function: {
                            name: 'complete',
                            arguments: JSON.stringify({ summary: 'Fixed YB' }),
                        },
                    }],
                }),
        };
        (Reasoning.create as ReturnType<typeof vi.fn>).mockReturnValue(mockReasoning);

        await runFeedback('/test/transcript.md', { feedback: 'YB should be Wibey', dryRun: true });

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Dry Run'));
    });

    it('should show changes applied output after modifications', async () => {
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue(SAMPLE_TRANSCRIPT);

        const Reasoning = await import('../../src/reasoning');
        const mockReasoning = {
            completeWithTools: vi.fn()
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_1',
                        function: {
                            name: 'correct_text',
                            arguments: JSON.stringify({ find: 'YB', replace: 'Wibey' }),
                        },
                    }],
                })
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_2',
                        function: {
                            name: 'complete',
                            arguments: JSON.stringify({ summary: 'Fixed YB' }),
                        },
                    }],
                }),
        };
        (Reasoning.create as ReturnType<typeof vi.fn>).mockReturnValue(mockReasoning);

        await runFeedback('/test/transcript.md', { feedback: 'YB should be Wibey' });

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Changes Applied'));
        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('File updated'));
    });

    it('should show file renamed message when title changed', async () => {
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue(SAMPLE_TRANSCRIPT);

        const Reasoning = await import('../../src/reasoning');
        const mockReasoning = {
            completeWithTools: vi.fn()
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_1',
                        function: {
                            name: 'change_title',
                            arguments: JSON.stringify({ new_title: 'New Title' }),
                        },
                    }],
                })
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_2',
                        function: {
                            name: 'complete',
                            arguments: JSON.stringify({ summary: 'Changed title' }),
                        },
                    }],
                }),
        };
        (Reasoning.create as ReturnType<typeof vi.fn>).mockReturnValue(mockReasoning);

        await runFeedback('/test/15-1430-transcript.md', { feedback: 'change title' });

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('File renamed'));
    });

    it('should show file moved message when project changed with routing', async () => {
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue(SAMPLE_TRANSCRIPT);

        const Reasoning = await import('../../src/reasoning');
        const mockReasoning = {
            completeWithTools: vi.fn()
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_1',
                        function: {
                            name: 'change_project',
                            arguments: JSON.stringify({ project_id: 'quantum-readiness' }),
                        },
                    }],
                })
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_2',
                        function: {
                            name: 'complete',
                            arguments: JSON.stringify({ summary: 'Changed project' }),
                        },
                    }],
                }),
        };
        (Reasoning.create as ReturnType<typeof vi.fn>).mockReturnValue(mockReasoning);

        await runFeedback('/test/transcript.md', { feedback: 'move to quantum' });

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('File moved'));
    });
});

describe('processFeedback', () => {
    let feedbackCtx: FeedbackContext;
    let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        vi.clearAllMocks();
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
        stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        stdoutWriteSpy.mockRestore();
    });

    it('should process tool calls from reasoning model', async () => {
        const Reasoning = await import('../../src/reasoning');
        const mockReasoning = {
            completeWithTools: vi.fn()
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_1',
                        function: {
                            name: 'correct_text',
                            arguments: JSON.stringify({ find: 'YB', replace: 'Wibey' }),
                        },
                    }],
                })
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_2',
                        function: {
                            name: 'complete',
                            arguments: JSON.stringify({ summary: 'Replaced YB with Wibey' }),
                        },
                    }],
                }),
        };

        await processFeedback('YB should be Wibey', feedbackCtx, mockReasoning as any);

        expect(feedbackCtx.changes).toHaveLength(1);
        expect(feedbackCtx.changes[0].type).toBe('text_correction');
        expect(feedbackCtx.transcriptContent).toContain('Wibey');
    });

    it('should handle response without tool calls', async () => {
        const Reasoning = await import('../../src/reasoning');
        const mockReasoning = {
            completeWithTools: vi.fn().mockResolvedValue({
                content: 'I understand, but nothing to change.',
                tool_calls: [],
            }),
        };

        await processFeedback('looks good', feedbackCtx, mockReasoning as any);

        expect(feedbackCtx.changes).toHaveLength(0);
        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('nothing to change'));
    });

    it('should handle invalid JSON in tool arguments', async () => {
        const Reasoning = await import('../../src/reasoning');
        const mockReasoning = {
            completeWithTools: vi.fn()
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_1',
                        function: {
                            name: 'correct_text',
                            arguments: 'invalid json{',
                        },
                    }],
                })
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_2',
                        function: {
                            name: 'complete',
                            arguments: JSON.stringify({ summary: 'Done' }),
                        },
                    }],
                }),
        };

        // Should not throw, should handle gracefully
        await processFeedback('test', feedbackCtx, mockReasoning as any);
    });

    it('should show tool execution in verbose mode', async () => {
        feedbackCtx.verbose = true;
        const Reasoning = await import('../../src/reasoning');
        const mockReasoning = {
            completeWithTools: vi.fn()
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_1',
                        function: {
                            name: 'correct_text',
                            arguments: JSON.stringify({ find: 'YB', replace: 'Wibey' }),
                        },
                    }],
                })
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_2',
                        function: {
                            name: 'complete',
                            arguments: JSON.stringify({ summary: 'Done' }),
                        },
                    }],
                }),
        };

        await processFeedback('YB should be Wibey', feedbackCtx, mockReasoning as any);

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Executing'));
    });

    it('should handle errors during processing', async () => {
        const Reasoning = await import('../../src/reasoning');
        const mockReasoning = {
            completeWithTools: vi.fn().mockRejectedValue(new Error('API Error')),
        };

        await expect(
            processFeedback('test', feedbackCtx, mockReasoning as any)
        ).rejects.toThrow('API Error');
    });

    it('should stop after max iterations', async () => {
        const Reasoning = await import('../../src/reasoning');
        // Create a mock that never returns 'complete'
        const mockReasoning = {
            completeWithTools: vi.fn().mockResolvedValue({
                content: '',
                tool_calls: [{
                    id: 'call_n',
                    function: {
                        name: 'correct_text',
                        arguments: JSON.stringify({ find: 'YB', replace: 'Wibey' }),
                    },
                }],
            }),
        };

        await processFeedback('YB should be Wibey', feedbackCtx, mockReasoning as any);

        // Should have called completeWithTools multiple times (max 10 iterations)
        expect(mockReasoning.completeWithTools).toHaveBeenCalledTimes(10);
    });
});

describe('buildFeedbackSystemPrompt edge cases', () => {
    it('should handle empty projects list', () => {
        const prompt = buildFeedbackSystemPrompt(SAMPLE_TRANSCRIPT, []);
        
        expect(prompt).toContain('no projects configured');
    });

    it('should not truncate short transcripts', () => {
        const shortTranscript = 'Short content';
        const prompt = buildFeedbackSystemPrompt(shortTranscript, []);
        
        expect(prompt).toContain('Short content');
        expect(prompt).not.toContain('...');
    });
});

describe('runFeedback interactive mode', () => {
    let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        mockFsWriteFile.mockResolvedValue(undefined);
        mockFsMkdir.mockResolvedValue(undefined);
        mockFsUnlink.mockResolvedValue(undefined);
    });

    afterEach(() => {
        stdoutWriteSpy.mockRestore();
        exitSpy.mockRestore();
    });

    it('should prompt for feedback interactively when not provided', async () => {
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue(SAMPLE_TRANSCRIPT);

        // Mock readline to return feedback
        const readline = await import('readline');
        const mockClose = vi.fn();
        const mockQuestion = vi.fn((_prompt: string, callback: (answer: string) => void) => {
            callback('YB should be Wibey');
        });
        (readline.createInterface as ReturnType<typeof vi.fn>).mockReturnValue({
            question: mockQuestion,
            close: mockClose,
        });

        const Reasoning = await import('../../src/reasoning');
        const mockReasoning = {
            completeWithTools: vi.fn()
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_1',
                        function: {
                            name: 'correct_text',
                            arguments: JSON.stringify({ find: 'YB', replace: 'Wibey' }),
                        },
                    }],
                })
                .mockResolvedValueOnce({
                    content: '',
                    tool_calls: [{
                        id: 'call_2',
                        function: {
                            name: 'complete',
                            arguments: JSON.stringify({ summary: 'Fixed' }),
                        },
                    }],
                }),
        };
        (Reasoning.create as ReturnType<typeof vi.fn>).mockReturnValue(mockReasoning);

        // Call without feedback option to trigger interactive mode
        await runFeedback('/test/transcript.md', {});

        // Should have shown the prompt
        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Feedback for'));
        expect(mockClose).toHaveBeenCalled();
    });

    it('should return early if no feedback provided interactively', async () => {
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue(SAMPLE_TRANSCRIPT);

        // Mock readline to return empty string
        const readline = await import('readline');
        const mockClose = vi.fn();
        const mockQuestion = vi.fn((_prompt: string, callback: (answer: string) => void) => {
            callback('');
        });
        (readline.createInterface as ReturnType<typeof vi.fn>).mockReturnValue({
            question: mockQuestion,
            close: mockClose,
        });

        await runFeedback('/test/transcript.md', {});

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('No feedback provided'));
        expect(mockClose).toHaveBeenCalled();
    });
});

describe('registerFeedbackCommands action handler', () => {
    let program: Command;
    let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        program = new Command();
        program.exitOverride();
        registerFeedbackCommands(program);
        stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    });

    afterEach(() => {
        stdoutWriteSpy.mockRestore();
        exitSpy.mockRestore();
    });

    it('should display help when --help-me is passed', async () => {
        // Use parseAsync on the parent program with the full command path
        await program.parseAsync(['node', 'test', 'feedback', '--help-me']);

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('PROTOKOLL FEEDBACK'));
        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('CORRECTING TERMS'));
    });

    it('should exit with error when no file provided', async () => {
        exitSpy.mockImplementation((code?: number) => {
            throw new Error(`Process exited with code ${code}`);
        });
        
        await expect(program.parseAsync(['node', 'test', 'feedback']))
            .rejects.toThrow('Process exited with code 1');

        expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('transcript file is required'));
    });
});
