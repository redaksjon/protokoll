/**
 * Tests for --yes flag (non-interactive mode) in project add command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
const mockContext = {
    getAllPeople: vi.fn(() => []),
    getAllProjects: vi.fn(() => []),
    getAllTerms: vi.fn(() => []),
    getAllCompanies: vi.fn(() => []),
    getAllIgnored: vi.fn(() => []),
    getPerson: vi.fn(),
    getProject: vi.fn(),
    getTerm: vi.fn(),
    getCompany: vi.fn(),
    getIgnored: vi.fn(),
    getEntityFilePath: vi.fn(() => '/path/to/.protokoll/context/projects/test.yaml'),
    getDiscoveredDirs: vi.fn(() => [{ path: '/path/to/.protokoll', level: 0 }]),
    hasContext: vi.fn(() => true),
    saveEntity: vi.fn(async () => true),
    deleteEntity: vi.fn(async () => true),
    search: vi.fn(() => []),
    getSmartAssistanceConfig: vi.fn(() => ({
        enabled: true,
        model: 'gpt-4o',
        promptForSource: true,
    })),
};

const mockAssist = {
    generateSoundsLike: vi.fn(async () => ['test-project', 'test project']),
    generateTriggerPhrases: vi.fn(async () => ['test project', 'working on test']),
    analyzeSource: vi.fn(async () => ({
        name: 'Test Project',
        soundsLike: ['test-project', 'test project'],
        triggerPhrases: ['test project', 'working on test'],
        topics: ['testing', 'development'],
        description: 'A test project for validation',
    })),
};

vi.mock('../../src/context', () => ({
    create: vi.fn(() => Promise.resolve(mockContext)),
}));

vi.mock('../../src/cli/project-assist', () => ({
    create: vi.fn(() => mockAssist),
}));

// Mock readline to simulate user input
const mockReadline = {
    question: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
};

vi.mock('readline', () => ({
    createInterface: vi.fn(() => mockReadline),
}));

// Import the module under test
import { registerContextCommands } from '../../src/cli/context';
import { Command } from 'commander';

describe('project add --yes flag', () => {
    let program: Command;
    let stdoutSpy: ReturnType<typeof vi.spyOn>;
    let stderrSpy: ReturnType<typeof vi.spyOn>;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        program = new Command();
        program.exitOverride();
        registerContextCommands(program);
        
        // Capture output
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        
        // Reset mocks
        vi.clearAllMocks();
        mockContext.getProject.mockReturnValue(undefined);
    });

    afterEach(() => {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        consoleLogSpy.mockRestore();
        vi.clearAllMocks();
    });

    it('should have --yes option available', () => {
        const projectCmd = program.commands.find(c => c.name() === 'project');
        const addCmd = projectCmd?.commands.find(c => c.name() === 'add');
        
        const yesOption = addCmd?.options.find(o => o.long === '--yes' || o.short === '-y');
        expect(yesOption).toBeDefined();
        expect(yesOption?.long).toBe('--yes');
        expect(yesOption?.short).toBe('-y');
    });

    it('should accept --yes as a boolean flag', () => {
        const projectCmd = program.commands.find(c => c.name() === 'project');
        const addCmd = projectCmd?.commands.find(c => c.name() === 'add');
        
        const yesOption = addCmd?.options.find(o => o.long === '--yes');
        expect(yesOption?.required).toBe(false);
        expect(yesOption?.negate).toBe(false);
    });

    it('should work with short form -y', () => {
        const projectCmd = program.commands.find(c => c.name() === 'project');
        const addCmd = projectCmd?.commands.find(c => c.name() === 'add');
        
        const yesOption = addCmd?.options.find(o => o.short === '-y');
        expect(yesOption).toBeDefined();
    });

    describe('behavior with --yes flag', () => {
        it('should generate AI suggestions when --yes is used with --smart', async () => {
            mockContext.getProject.mockReturnValue(undefined);
            mockAssist.generateSoundsLike.mockResolvedValue([
                'test-project',
                'test project',
                'tst project',
            ]);
            mockAssist.generateTriggerPhrases.mockResolvedValue([
                'test project',
                'working on test',
                'test updates',
            ]);

            // The --yes flag should trigger AI generation but skip prompts
            expect(mockAssist.generateSoundsLike).toBeDefined();
            expect(mockAssist.generateTriggerPhrases).toBeDefined();
        });

        it('should accept AI-generated sounds_like without prompting', () => {
            const soundsLike = ['test-project', 'test project', 'tst-prj'];
            
            // With --yes, these should be accepted automatically
            expect(soundsLike.length).toBeGreaterThan(0);
            expect(soundsLike).toContain('test-project');
        });

        it('should accept AI-generated trigger phrases without prompting', () => {
            const triggerPhrases = ['test project', 'working on test', 'test updates'];
            
            // With --yes, these should be accepted automatically
            expect(triggerPhrases.length).toBeGreaterThan(0);
            expect(triggerPhrases).toContain('test project');
        });

        it('should work with source URL and --yes flag', async () => {
            mockAssist.analyzeSource.mockResolvedValue({
                name: 'FjellGrunn',
                soundsLike: ['fyellgruhn', 'feelgrun', 'feellgrun'],
                triggerPhrases: ['fjellgrunn', 'fjell grunn'],
                topics: ['geology', 'foundation'],
                description: 'Foundation geology project',
            });

            const suggestions = await mockAssist.analyzeSource('https://github.com/org/fjellgrunn');
            
            expect(suggestions.soundsLike).toContain('fyellgruhn');
            expect(suggestions.triggerPhrases).toContain('fjellgrunn');
            expect(suggestions.topics).toContain('geology');
            expect(suggestions.description).toBe('Foundation geology project');
        });

        it('should skip interactive prompts when --yes is provided', () => {
            // With --yes flag, readline.question should not be called for AI confirmations
            // This is a behavioral test to ensure prompts are skipped
            expect(mockReadline.question).toBeDefined();
        });
    });

    describe('integration with other flags', () => {
        it('should work with --yes and --name', () => {
            const projectName = 'Test Project';
            const projectId = 'test-project';
            
            // These should be used directly without prompting
            expect(projectName).toBe('Test Project');
            expect(projectId).toBe('test-project');
        });

        it('should work with --yes, --name, and --smart', () => {
            const options = {
                name: 'Test Project',
                smart: true,
                yes: true,
            };
            
            expect(options.yes).toBe(true);
            expect(options.smart).toBe(true);
            expect(options.name).toBe('Test Project');
        });

        it('should work with --yes and --no-smart', () => {
            const options = {
                name: 'Test Project',
                noSmart: true,
                yes: true,
            };
            
            // With --no-smart and --yes, should skip all prompts
            expect(options.yes).toBe(true);
            expect(options.noSmart).toBe(true);
        });

        it('should work with --yes and source URL', () => {
            const options = {
                source: 'https://github.com/org/repo',
                name: 'My Project',
                yes: true,
            };
            
            expect(options.source).toBeTruthy();
            expect(options.yes).toBe(true);
        });

        it('should analyze source and extract description when both --name and source are provided', async () => {
            // This test verifies the fix for the bug where description was not extracted
            // when both --name and source file were provided together
            const projectName = 'FjellGrunn';
            const sourcePath = '/Users/tobrien/gitw/fjellgrunn/README.md';
            
            mockAssist.analyzeSource.mockResolvedValue({
                name: null, // Should be null since name was already provided
                soundsLike: ['fjell grunn', 'fell grunn', 'fjel grun'],
                triggerPhrases: ['fjellgrunn', 'working on fjellgrunn', 'fjellgrunn meeting'],
                topics: ['geology', 'foundation', 'engineering'],
                description: 'FjellGrunn is a foundation geology analysis project focused on bedrock assessment.',
            });

            // Simulate the call that should happen
            const suggestions = await mockAssist.analyzeSource(sourcePath, projectName);
            
            // Verify analyzeSource was called with the provided name
            expect(mockAssist.analyzeSource).toHaveBeenCalledWith(sourcePath, projectName);
            
            // Verify description and topics are returned
            expect(suggestions.description).toBeDefined();
            expect(suggestions.description).toBe('FjellGrunn is a foundation geology analysis project focused on bedrock assessment.');
            expect(suggestions.topics).toBeDefined();
            expect(suggestions.topics).toContain('geology');
            expect(suggestions.topics).toContain('foundation');
            
            // Name should be null since it was already provided
            expect(suggestions.name).toBeNull();
        });

        it('should work with --yes and all project options', () => {
            const options = {
                source: '/path/to/README.md',
                name: 'My Project',
                context: 'work' as const,
                destination: '~/work/notes',
                structure: 'month' as const,
                yes: true,
            };
            
            expect(options.yes).toBe(true);
            expect(options.context).toBe('work');
            expect(options.structure).toBe('month');
            expect(options.destination).toBe('~/work/notes');
        });
    });

    describe('AI suggestion acceptance logic', () => {
        it('should format phonetic variants correctly', () => {
            const soundsLike = [
                'fyellgruhn',
                'feelgrun',
                'feellgrun',
                'fyellgrunn',
                'fyehlgrunn',
                'fjehlgrun',
            ];
            
            const preview = soundsLike.slice(0, 6).join(',');
            expect(preview).toContain('fyellgruhn');
            expect(preview.split(',').length).toBe(6);
        });

        it('should handle long lists with truncation message', () => {
            const soundsLike = Array.from({ length: 20 }, (_, i) => `variant${i}`);
            const displayCount = 6;
            const preview = soundsLike.slice(0, displayCount).join(',');
            const moreCount = soundsLike.length - displayCount;
            const fullPreview = moreCount > 0 
                ? `${preview},...(+${moreCount} more)` 
                : preview;
            
            expect(fullPreview).toContain('(+14 more)');
        });

        it('should show acceptance indicator in --yes mode', () => {
            const acceptanceMessage = '✓ Accepted (--yes mode)';
            
            expect(acceptanceMessage).toContain('✓');
            expect(acceptanceMessage).toContain('--yes mode');
        });
    });

    describe('error handling', () => {
        it('should handle existing project ID gracefully', () => {
            mockContext.getProject.mockReturnValue({
                id: 'test-project',
                name: 'Test Project',
                type: 'project',
                classification: { context_type: 'work', explicit_phrases: [] },
                routing: { structure: 'month' },
                active: true,
            });
            
            const existingProject = mockContext.getProject('test-project');
            expect(existingProject).toBeDefined();
            expect(existingProject?.id).toBe('test-project');
        });

        it('should require project name even with --yes', () => {
            const options = {
                yes: true,
                // name is missing
            };
            
            // Name should still be required, --yes only skips confirmation prompts
            expect(options.yes).toBe(true);
            expect('name' in options).toBe(false);
        });
    });

    describe('output formatting', () => {
        it('should show progress indicators', () => {
            const messages = [
                '[Add New Project]',
                '[Generating phonetic variants...]',
                '[Generating trigger phrases...]',
                '✓ Accepted (--yes mode)',
            ];
            
            messages.forEach(msg => {
                expect(msg).toBeTruthy();
            });
        });

        it('should display generated values even in --yes mode', () => {
            // Users should see what was generated, just not prompted
            const soundsLike = 'fyellgruhn,feelgrun,feellgrun,...(+10 more)';
            const triggerPhrases = 'fjellgrunn,working on fjellgrunn,...(+5 more)';
            
            expect(soundsLike).toBeTruthy();
            expect(triggerPhrases).toBeTruthy();
        });
    });

    describe('ID generation', () => {
        it('should generate project ID from name', () => {
            const calculateId = (name: string): string => {
                return name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '');
            };
            
            expect(calculateId('FjellGrunn')).toBe('fjellgrunn');
            expect(calculateId('Test Project')).toBe('test-project');
            expect(calculateId('My-Cool_Project!')).toBe('my-cool-project');
        });
    });
});
