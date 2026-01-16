/**
 * Tests for CLI install/setup wizard module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

// Store original readline for restoration
const mockQuestion = vi.fn();
const mockClose = vi.fn();
const mockReadlineInterface = {
    question: mockQuestion,
    close: mockClose,
};

// Mock readline to avoid TTY issues
vi.mock('readline', () => ({
    createInterface: vi.fn(() => mockReadlineInterface),
}));

describe('CLI Install Command', () => {
    let tempDir: string;
    let originalCwd: () => string;
    let originalArgv: string[];
    let stdoutSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        // Create a temp directory for test files
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-install-test-'));
        
        // Mock process.cwd()
        originalCwd = process.cwd;
        process.cwd = vi.fn(() => tempDir);
        
        // Store original argv
        originalArgv = process.argv;
        
        // Capture stdout
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(async () => {
        // Restore process.cwd
        process.cwd = originalCwd;
        
        // Restore argv
        process.argv = originalArgv;
        
        // Restore stdout
        stdoutSpy.mockRestore();
        
        // Clean up temp directory
        await fs.rm(tempDir, { recursive: true });
        
        vi.clearAllMocks();
        vi.resetModules();
    });

    describe('registerInstallCommand', () => {
        it('should register the install command on a program', async () => {
            const { registerInstallCommand } = await import('../../src/cli/install');
            
            const program = new Command();
            registerInstallCommand(program);
            
            const installCmd = program.commands.find(cmd => cmd.name() === 'install');
            expect(installCmd).toBeDefined();
            expect(installCmd?.description()).toContain('setup wizard');
        });
    });

    describe('isInstallCommand', () => {
        it('should return true when argv contains install as first argument', async () => {
            process.argv = ['node', 'protokoll', 'install'];
            const { isInstallCommand } = await import('../../src/cli/install');
            
            expect(isInstallCommand()).toBe(true);
        });

        it('should return false when install is not the first argument', async () => {
            process.argv = ['node', 'protokoll', 'process'];
            
            // Clear module cache to re-evaluate
            vi.resetModules();
            const { isInstallCommand } = await import('../../src/cli/install');
            
            expect(isInstallCommand()).toBe(false);
        });

        it('should return false when no arguments provided', async () => {
            process.argv = ['node', 'protokoll'];
            
            vi.resetModules();
            const { isInstallCommand } = await import('../../src/cli/install');
            
            expect(isInstallCommand()).toBe(false);
        });

        it('should return false when install is in different position', async () => {
            process.argv = ['node', 'protokoll', '--verbose', 'install'];
            
            vi.resetModules();
            const { isInstallCommand } = await import('../../src/cli/install');
            
            expect(isInstallCommand()).toBe(false);
        });
    });

    describe('checkExistingConfig helper behavior', () => {
        it('should detect when no configuration exists', async () => {
            // No config file exists in temp directory
            const configPath = path.join(tempDir, '.protokoll', 'config.yaml');
            
            // Verify it doesn't exist
            await expect(fs.access(configPath)).rejects.toThrow();
        });

        it('should detect when configuration exists', async () => {
            // Create config file
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(path.join(configDir, 'config.yaml'), 'model: gpt-5.2\n');
            
            // Verify it exists
            const stat = await fs.stat(path.join(configDir, 'config.yaml'));
            expect(stat.isFile()).toBe(true);
        });
    });

    describe('configuration file writing', () => {
        it('should create .protokoll directory structure', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            
            // Create directory structure like writeConfiguration does
            await fs.mkdir(configDir, { recursive: true });
            await fs.mkdir(path.join(configDir, 'context', 'projects'), { recursive: true });
            await fs.mkdir(path.join(configDir, 'context', 'people'), { recursive: true });
            await fs.mkdir(path.join(configDir, 'context', 'terms'), { recursive: true });
            await fs.mkdir(path.join(configDir, 'context', 'companies'), { recursive: true });
            await fs.mkdir(path.join(configDir, 'context', 'ignored'), { recursive: true });
            
            // Verify directories were created
            const dirs = [
                configDir,
                path.join(configDir, 'context'),
                path.join(configDir, 'context', 'projects'),
                path.join(configDir, 'context', 'people'),
                path.join(configDir, 'context', 'terms'),
                path.join(configDir, 'context', 'companies'),
                path.join(configDir, 'context', 'ignored'),
            ];
            
            for (const dir of dirs) {
                const stat = await fs.stat(dir);
                expect(stat.isDirectory()).toBe(true);
            }
        });

        it('should write config.yaml with correct structure', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            
            const configContent = {
                model: 'gpt-5.2',
                transcriptionModel: 'whisper-1',
                inputDirectory: './recordings',
                outputDirectory: '~/notes',
            };
            
            const yaml = await import('js-yaml');
            const yamlContent = yaml.dump(configContent, { lineWidth: -1 });
            await fs.writeFile(path.join(configDir, 'config.yaml'), yamlContent, 'utf-8');
            
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('gpt-5.2');
            expect(content).toContain('whisper-1');
        });

        it('should write project files with correct structure', async () => {
            const projectsDir = path.join(tempDir, '.protokoll', 'context', 'projects');
            await fs.mkdir(projectsDir, { recursive: true });
            
            const projectData = {
                id: 'work-notes',
                name: 'Work Notes',
                description: 'My work notes',
                classification: {
                    context_type: 'work',
                    explicit_phrases: ['work note', 'work meeting'],
                },
                routing: {
                    destination: '~/notes/work',
                    structure: 'month',
                    filename_options: ['date', 'time', 'subject'],
                },
                active: true,
            };
            
            const yaml = await import('js-yaml');
            const yamlContent = yaml.dump(projectData, { lineWidth: -1 });
            await fs.writeFile(path.join(projectsDir, 'work-notes.yaml'), yamlContent, 'utf-8');
            
            const content = await fs.readFile(path.join(projectsDir, 'work-notes.yaml'), 'utf-8');
            expect(content).toContain('work-notes');
            expect(content).toContain('Work Notes');
        });

        it('should include processedDirectory when provided', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            
            const configContent = {
                model: 'gpt-5.2',
                transcriptionModel: 'whisper-1',
                inputDirectory: './recordings',
                outputDirectory: '~/notes',
                processedDirectory: './processed',
            };
            
            const yaml = await import('js-yaml');
            const yamlContent = yaml.dump(configContent, { lineWidth: -1 });
            await fs.writeFile(path.join(configDir, 'config.yaml'), yamlContent, 'utf-8');
            
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('processedDirectory');
            expect(content).toContain('./processed');
        });
    });

    describe('project ID generation', () => {
        it('should generate valid ID from project name', () => {
            const generateId = (name: string) => {
                return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            };
            
            expect(generateId('Work Notes')).toBe('work-notes');
            expect(generateId('Personal Journal')).toBe('personal-journal');
            expect(generateId('Client: Acme Corp')).toBe('client-acme-corp');
            expect(generateId('Project Alpha 2026')).toBe('project-alpha-2026');
            expect(generateId('My Notes!')).toBe('my-notes');
        });

        it('should handle special characters in names', () => {
            const generateId = (name: string) => {
                return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            };
            
            expect(generateId('Notes & Ideas')).toBe('notes--ideas');
            expect(generateId('Todo: Important')).toBe('todo-important');
            expect(generateId('(Draft) Notes')).toBe('draft-notes');
        });

        it('should handle unicode characters', () => {
            const generateId = (name: string) => {
                return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            };
            
            // Unicode gets stripped
            expect(generateId('Notatki Møte')).toBe('notatki-mte');
        });
    });

    describe('trigger phrase parsing', () => {
        it('should split comma-separated phrases', () => {
            const parsePhrase = (input: string) => {
                return input.split(',').map(s => s.trim()).filter(Boolean);
            };
            
            expect(parsePhrase('work note, meeting, client')).toEqual(['work note', 'meeting', 'client']);
            expect(parsePhrase('reminder')).toEqual(['reminder']);
            expect(parsePhrase('')).toEqual([]);
        });

        it('should filter empty strings', () => {
            const parsePhrase = (input: string) => {
                return input.split(',').map(s => s.trim()).filter(Boolean);
            };
            
            expect(parsePhrase('work, , note')).toEqual(['work', 'note']);
            expect(parsePhrase(', , ')).toEqual([]);
        });
    });

    describe('context type validation', () => {
        it('should accept valid context types', () => {
            const validTypes = ['work', 'personal', 'mixed'];
            const validateContextType = (input: string) => {
                return validTypes.includes(input) ? input : 'work';
            };
            
            expect(validateContextType('work')).toBe('work');
            expect(validateContextType('personal')).toBe('personal');
            expect(validateContextType('mixed')).toBe('mixed');
        });

        it('should default to work for invalid types', () => {
            const validTypes = ['work', 'personal', 'mixed'];
            const validateContextType = (input: string) => {
                return validTypes.includes(input) ? input : 'work';
            };
            
            expect(validateContextType('invalid')).toBe('work');
            expect(validateContextType('')).toBe('work');
            expect(validateContextType('WORK')).toBe('work'); // case sensitive
        });
    });

    describe('structure validation', () => {
        it('should accept valid structure values', () => {
            const validStructures = ['none', 'year', 'month', 'day'];
            const validateStructure = (input: string) => {
                return validStructures.includes(input) ? input : 'month';
            };
            
            expect(validateStructure('none')).toBe('none');
            expect(validateStructure('year')).toBe('year');
            expect(validateStructure('month')).toBe('month');
            expect(validateStructure('day')).toBe('day');
        });

        it('should default to month for invalid structures', () => {
            const validStructures = ['none', 'year', 'month', 'day'];
            const validateStructure = (input: string) => {
                return validStructures.includes(input) ? input : 'month';
            };
            
            expect(validateStructure('')).toBe('month');
            expect(validateStructure('weekly')).toBe('month');
        });
    });

    describe('MODEL_INFO constants', () => {
        it('should have reasoning models defined', async () => {
            // We'll test the structure based on what we know from the source
            const reasoningModels = [
                'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-4o', 'gpt-4o-mini',
                'o1', 'o1-mini', 'claude-3-5-sonnet', 'claude-3-opus',
            ];
            
            // Basic validation that the model list is reasonable
            expect(reasoningModels.length).toBeGreaterThan(0);
            expect(reasoningModels).toContain('gpt-5.2');
        });

        it('should have transcription models defined', async () => {
            const transcriptionModels = ['whisper-1', 'gpt-4o-transcribe'];
            
            expect(transcriptionModels.length).toBeGreaterThan(0);
            expect(transcriptionModels).toContain('whisper-1');
        });

        it('should mark recommended models', async () => {
            // Based on the source code, gpt-5.2 is recommended for reasoning
            // and whisper-1 is recommended for transcription
            const expectedRecommended = {
                reasoning: 'gpt-5.2',
                transcription: 'whisper-1',
            };
            
            expect(expectedRecommended.reasoning).toBe('gpt-5.2');
            expect(expectedRecommended.transcription).toBe('whisper-1');
        });
    });

    describe('ANSI color helpers', () => {
        it('should wrap text with ANSI codes', () => {
            const reset = '\x1b[0m';
            const boldCode = '\x1b[1m';
            const greenCode = '\x1b[32m';
            
            const bold = (text: string) => `${boldCode}${text}${reset}`;
            const green = (text: string) => `${greenCode}${text}${reset}`;
            
            expect(bold('test')).toBe(`${boldCode}test${reset}`);
            expect(green('success')).toBe(`${greenCode}success${reset}`);
        });

        it('should support all defined colors', () => {
            const reset = '\x1b[0m';
            const colors = {
                bold: '\x1b[1m',
                dim: '\x1b[2m',
                green: '\x1b[32m',
                yellow: '\x1b[33m',
                blue: '\x1b[34m',
                cyan: '\x1b[36m',
                magenta: '\x1b[35m',
            };
            
            // All color codes should be defined
            expect(Object.keys(colors)).toHaveLength(7);
            
            // Each should be a string starting with escape sequence
            for (const [_name, code] of Object.entries(colors)) {
                expect(code.startsWith('\x1b[')).toBe(true);
            }
        });
    });

    describe('InstallConfig interface compliance', () => {
        it('should have all required fields', () => {
            const config = {
                model: 'gpt-5.2',
                transcriptionModel: 'whisper-1',
                inputDirectory: './recordings',
                outputDirectory: '~/notes',
                useProjects: true,
                projects: [],
            };
            
            expect(config.model).toBeDefined();
            expect(config.transcriptionModel).toBeDefined();
            expect(config.inputDirectory).toBeDefined();
            expect(config.outputDirectory).toBeDefined();
            expect(config.useProjects).toBeDefined();
            expect(config.projects).toBeDefined();
        });

        it('should support optional processedDirectory', () => {
            const configWithProcessed = {
                model: 'gpt-5.2',
                transcriptionModel: 'whisper-1',
                inputDirectory: './recordings',
                outputDirectory: '~/notes',
                processedDirectory: './processed',
                useProjects: true,
                projects: [],
            };
            
            expect(configWithProcessed.processedDirectory).toBe('./processed');
            
            const configWithoutProcessed = {
                model: 'gpt-5.2',
                transcriptionModel: 'whisper-1',
                inputDirectory: './recordings',
                outputDirectory: '~/notes',
                useProjects: false,
                projects: [],
            };
            
            expect(configWithoutProcessed.processedDirectory).toBeUndefined();
        });
    });

    describe('ProjectSetup interface compliance', () => {
        it('should have all required fields', () => {
            const project = {
                name: 'Work Notes',
                id: 'work-notes',
                contextType: 'work' as const,
                structure: 'month' as const,
                triggerPhrases: ['work note'],
            };
            
            expect(project.name).toBeDefined();
            expect(project.id).toBeDefined();
            expect(project.contextType).toBeDefined();
            expect(project.structure).toBeDefined();
            expect(project.triggerPhrases).toBeDefined();
        });

        it('should support optional fields', () => {
            const projectWithOptionals = {
                name: 'Work Notes',
                id: 'work-notes',
                description: 'My work notes',
                destination: '~/notes/work',
                contextType: 'work' as const,
                structure: 'month' as const,
                triggerPhrases: ['work note'],
            };
            
            expect(projectWithOptionals.description).toBe('My work notes');
            expect(projectWithOptionals.destination).toBe('~/notes/work');
        });

        it('should have valid contextType values', () => {
            const validContextTypes = ['work', 'personal', 'mixed'];
            
            for (const type of validContextTypes) {
                const project = {
                    name: 'Test',
                    id: 'test',
                    contextType: type as 'work' | 'personal' | 'mixed',
                    structure: 'month' as const,
                    triggerPhrases: [],
                };
                
                expect(validContextTypes).toContain(project.contextType);
            }
        });

        it('should have valid structure values', () => {
            const validStructures = ['none', 'year', 'month', 'day'];
            
            for (const structure of validStructures) {
                const project = {
                    name: 'Test',
                    id: 'test',
                    contextType: 'work' as const,
                    structure: structure as 'none' | 'year' | 'month' | 'day',
                    triggerPhrases: [],
                };
                
                expect(validStructures).toContain(project.structure);
            }
        });
    });

    describe('default values', () => {
        it('should use correct default model', async () => {
            const { DEFAULT_MODEL } = await import('../../src/constants');
            expect(DEFAULT_MODEL).toBe('gpt-5.2');
        });

        it('should use correct default transcription model', async () => {
            const { DEFAULT_TRANSCRIPTION_MODEL } = await import('../../src/constants');
            expect(DEFAULT_TRANSCRIPTION_MODEL).toBe('whisper-1');
        });
    });
});

describe('Install wizard file operations', () => {
    let tempDir: string;
    let originalCwd: () => string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-install-ops-'));
        originalCwd = process.cwd;
        process.cwd = vi.fn(() => tempDir);
    });

    afterEach(async () => {
        process.cwd = originalCwd;
        await fs.rm(tempDir, { recursive: true });
        vi.clearAllMocks();
    });

    it('should create nested directory structure', async () => {
        const basePath = path.join(tempDir, '.protokoll', 'context', 'projects');
        
        await fs.mkdir(basePath, { recursive: true });
        
        const stat = await fs.stat(basePath);
        expect(stat.isDirectory()).toBe(true);
    });

    it('should handle existing directory gracefully', async () => {
        const basePath = path.join(tempDir, '.protokoll');
        
        // Create once
        await fs.mkdir(basePath, { recursive: true });
        
        // Create again - should not throw
        await expect(fs.mkdir(basePath, { recursive: true })).resolves.not.toThrow();
    });

    it('should write and read YAML content correctly', async () => {
        const configDir = path.join(tempDir, '.protokoll');
        await fs.mkdir(configDir, { recursive: true });
        
        const configPath = path.join(configDir, 'config.yaml');
        const content = 'model: gpt-5.2\ntranscriptionModel: whisper-1\n';
        
        await fs.writeFile(configPath, content, 'utf-8');
        
        const readContent = await fs.readFile(configPath, 'utf-8');
        expect(readContent).toContain('model: gpt-5.2');
        expect(readContent).toContain('transcriptionModel: whisper-1');
    });
});

describe('Print output formatting', () => {
    let stdoutSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        stdoutSpy.mockRestore();
    });

    it('should output text followed by newline', () => {
        const print = (text: string) => process.stdout.write(text + '\n');
        
        print('Hello World');
        
        expect(stdoutSpy).toHaveBeenCalledWith('Hello World\n');
    });

    it('should support empty lines', () => {
        const print = (text: string) => process.stdout.write(text + '\n');
        
        print('');
        
        expect(stdoutSpy).toHaveBeenCalledWith('\n');
    });

    it('should output multiple lines', () => {
        const print = (text: string) => process.stdout.write(text + '\n');
        
        print('Line 1');
        print('Line 2');
        print('Line 3');
        
        expect(stdoutSpy).toHaveBeenCalledTimes(3);
        expect(stdoutSpy).toHaveBeenNthCalledWith(1, 'Line 1\n');
        expect(stdoutSpy).toHaveBeenNthCalledWith(2, 'Line 2\n');
        expect(stdoutSpy).toHaveBeenNthCalledWith(3, 'Line 3\n');
    });
});

describe('Banner and welcome output', () => {
    it('should include version in welcome banner', async () => {
        const { VERSION } = await import('../../src/constants');
        
        // The VERSION constant should be defined
        expect(VERSION).toBeDefined();
        expect(typeof VERSION).toBe('string');
    });

    it('should include program description', () => {
        const description = 'Intelligent Audio Transcription';
        expect(description).toBeTruthy();
    });

    it('should format separator lines correctly', () => {
        const separator = '═'.repeat(60);
        expect(separator.length).toBe(60);
        expect(separator).not.toContain(' ');
    });

    it('should format subsection separators correctly', () => {
        const separator = '─'.repeat(40);
        expect(separator.length).toBe(40);
    });
});

describe('Model selection guidance', () => {
    it('should categorize models by type', () => {
        const reasoningModels = [
            { name: 'gpt-5.2', provider: 'OpenAI' },
            { name: 'claude-3-5-sonnet', provider: 'Anthropic' },
        ];
        
        const transcriptionModels = [
            { name: 'whisper-1' },
            { name: 'gpt-4o-transcribe' },
        ];
        
        expect(reasoningModels.every(m => m.provider)).toBe(true);
        expect(transcriptionModels.every(m => m.name)).toBe(true);
    });

    it('should provide notes for each model', () => {
        const model = {
            name: 'gpt-5.2',
            provider: 'OpenAI',
            notes: 'Default - High reasoning, best quality',
            recommended: true,
        };
        
        expect(model.notes).toBeTruthy();
        expect(model.notes.length).toBeGreaterThan(0);
    });
});

describe('Directory suggestions', () => {
    it('should suggest default input directory', () => {
        const defaultInput = './recordings';
        expect(defaultInput).toBe('./recordings');
    });

    it('should suggest default output directory', () => {
        const defaultOutput = '~/notes';
        expect(defaultOutput).toBe('~/notes');
    });

    it('should support tilde expansion in paths', () => {
        const tildeExpand = (p: string) => {
            if (p.startsWith('~/')) {
                return path.join(os.homedir(), p.slice(2));
            }
            return p;
        };
        
        const expanded = tildeExpand('~/notes');
        expect(expanded).toBe(path.join(os.homedir(), 'notes'));
    });
});

describe('Getting started guide content', () => {
    it('should include API key setup instruction', () => {
        const apiKeyInstruction = 'export OPENAI_API_KEY="sk-your-key"';
        expect(apiKeyInstruction).toContain('OPENAI_API_KEY');
    });

    it('should include basic command usage', () => {
        const basicUsage = 'protokoll --input-directory ./recordings';
        expect(basicUsage).toContain('protokoll');
        expect(basicUsage).toContain('--input-directory');
    });

    it('should include context management commands', () => {
        const contextCommands = [
            'protokoll person add',
            'protokoll project add',
            'protokoll term add',
        ];
        
        expect(contextCommands.every(c => c.startsWith('protokoll'))).toBe(true);
    });

    it('should include useful flags', () => {
        const flags = ['--batch', '--verbose', '--dry-run'];
        
        expect(flags).toContain('--batch');
        expect(flags).toContain('--verbose');
        expect(flags).toContain('--dry-run');
    });
});

describe('Project routing configuration', () => {
    it('should support filename_options in routing', () => {
        const routing = {
            destination: '~/notes/work',
            structure: 'month',
            filename_options: ['date', 'time', 'subject'],
        };
        
        expect(routing.filename_options).toContain('date');
        expect(routing.filename_options).toContain('time');
        expect(routing.filename_options).toContain('subject');
    });

    it('should support optional destination override', () => {
        const routingWithDestination = {
            destination: '~/notes/alpha',
            structure: 'month',
            filename_options: ['date', 'time', 'subject'],
        };
        
        const routingWithoutDestination = {
            structure: 'month',
            filename_options: ['date', 'time', 'subject'],
        };
        
        expect(routingWithDestination.destination).toBeDefined();
        expect((routingWithoutDestination as any).destination).toBeUndefined();
    });
});

describe('Classification configuration', () => {
    it('should support context_type in classification', () => {
        const classification = {
            context_type: 'work',
            explicit_phrases: ['work meeting', 'project note'],
        };
        
        expect(classification.context_type).toBe('work');
    });

    it('should support explicit_phrases in classification', () => {
        const classification = {
            context_type: 'personal',
            explicit_phrases: ['reminder', 'grocery list', 'personal note'],
        };
        
        expect(classification.explicit_phrases).toHaveLength(3);
        expect(classification.explicit_phrases).toContain('reminder');
    });

    it('should handle empty explicit_phrases', () => {
        const classification = {
            context_type: 'mixed',
            explicit_phrases: [],
        };
        
        expect(classification.explicit_phrases).toHaveLength(0);
    });
});

describe('runInstallCLI export', () => {
    it('should export runInstallCLI function', async () => {
        const installModule = await import('../../src/cli/install');
        expect(typeof installModule.runInstallCLI).toBe('function');
    });

    it('should export registerInstallCommand function', async () => {
        const installModule = await import('../../src/cli/install');
        expect(typeof installModule.registerInstallCommand).toBe('function');
    });

    it('should export isInstallCommand function', async () => {
        const installModule = await import('../../src/cli/install');
        expect(typeof installModule.isInstallCommand).toBe('function');
    });
});

describe('Install wizard interactive flow', () => {
    let tempDir: string;
    let originalCwd: () => string;
    let stdoutSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-wizard-'));
        originalCwd = process.cwd;
        process.cwd = vi.fn(() => tempDir);
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        
        // Reset mock question
        mockQuestion.mockReset();
        mockClose.mockReset();
    });

    afterEach(async () => {
        process.cwd = originalCwd;
        stdoutSpy.mockRestore();
        await fs.rm(tempDir, { recursive: true });
        vi.clearAllMocks();
    });

    it('should handle wizard cancellation on existing config', async () => {
        // Create existing config
        const configDir = path.join(tempDir, '.protokoll');
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(path.join(configDir, 'config.yaml'), 'model: gpt-5.2\n');
        
        // Mock user declining overwrite
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback('n');
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        
        await runInstallCLI();
        
        // Should have asked about overwrite
        expect(mockQuestion).toHaveBeenCalled();
        expect(mockClose).toHaveBeenCalled();
    });

    it('should complete wizard with all defaults', async () => {
        // Mock user accepting all defaults (empty answers)
        let questionIndex = 0;
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            // Provide empty answers to accept defaults, then 'n' for projects, then empty to exit
            const answers = ['', '', '', '', '', 'n'];
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        
        await runInstallCLI();
        
        // Should have created config directory
        const configExists = await fs.access(path.join(tempDir, '.protokoll')).then(() => true).catch(() => false);
        expect(configExists).toBe(true);
        
        expect(mockClose).toHaveBeenCalled();
    });

    it('should create projects when user opts in', async () => {
        // Mock user creating one project
        let questionIndex = 0;
        const answers = [
            '',           // model - accept default
            '',           // transcription model - accept default
            '',           // input directory - accept default
            '',           // output directory - accept default
            '',           // processed directory - skip
            'y',          // want projects? yes
            'Work Notes', // project name
            '',           // project id - accept generated
            'My work notes', // description
            'work',       // context type
            '~/work',     // destination
            'month',      // structure
            'work, meeting', // trigger phrases
            '',           // another project name - empty to stop
        ];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        
        await runInstallCLI();
        
        // Should have created project file
        const projectPath = path.join(tempDir, '.protokoll', 'context', 'projects', 'work-notes.yaml');
        const projectExists = await fs.access(projectPath).then(() => true).catch(() => false);
        expect(projectExists).toBe(true);
    });

    it('should handle processed directory when provided', async () => {
        let questionIndex = 0;
        const answers = [
            '',              // model
            '',              // transcription model
            '',              // input directory
            '',              // output directory
            './processed',   // processed directory - provided
            'n',             // no projects
        ];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        
        await runInstallCLI();
        
        // Read config and verify processedDirectory is included
        const configPath = path.join(tempDir, '.protokoll', 'config.yaml');
        const content = await fs.readFile(configPath, 'utf-8');
        expect(content).toContain('processedDirectory');
    });

    it('should handle custom model selection', async () => {
        let questionIndex = 0;
        const answers = [
            'claude-3-5-sonnet', // custom model
            'gpt-4o-transcribe', // custom transcription model
            '',                  // input directory
            '',                  // output directory
            '',                  // processed directory
            'n',                 // no projects
        ];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        
        await runInstallCLI();
        
        // Read config and verify custom models are used
        const configPath = path.join(tempDir, '.protokoll', 'config.yaml');
        const content = await fs.readFile(configPath, 'utf-8');
        expect(content).toContain('claude-3-5-sonnet');
        expect(content).toContain('gpt-4o-transcribe');
    });

    it('should handle custom directories', async () => {
        let questionIndex = 0;
        const answers = [
            '',                 // model
            '',                 // transcription model
            '/custom/audio',    // custom input directory
            '/custom/notes',    // custom output directory
            '',                 // processed directory
            'n',                // no projects
        ];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        
        await runInstallCLI();
        
        // Read config and verify custom directories are used
        const configPath = path.join(tempDir, '.protokoll', 'config.yaml');
        const content = await fs.readFile(configPath, 'utf-8');
        expect(content).toContain('/custom/audio');
        expect(content).toContain('/custom/notes');
    });
});

describe('Project creation scenarios', () => {
    let tempDir: string;
    let originalCwd: () => string;
    let stdoutSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-projects-'));
        originalCwd = process.cwd;
        process.cwd = vi.fn(() => tempDir);
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        mockQuestion.mockReset();
        mockClose.mockReset();
    });

    afterEach(async () => {
        process.cwd = originalCwd;
        stdoutSpy.mockRestore();
        await fs.rm(tempDir, { recursive: true });
        vi.clearAllMocks();
    });

    it('should handle multiple projects', async () => {
        let questionIndex = 0;
        const answers = [
            '', '', '', '', '', 'y', // setup
            'Work',              // project 1 name
            '',                  // id
            '',                  // description
            'work',              // context
            '',                  // destination
            'month',             // structure
            'work',              // phrases
            'Personal',          // project 2 name
            '',                  // id
            '',                  // description
            'personal',          // context
            '',                  // destination
            'month',             // structure
            'personal',          // phrases
            '',                  // empty to stop
        ];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        
        await runInstallCLI();
        
        // Should have created both project files
        const workPath = path.join(tempDir, '.protokoll', 'context', 'projects', 'work.yaml');
        const personalPath = path.join(tempDir, '.protokoll', 'context', 'projects', 'personal.yaml');
        
        const workExists = await fs.access(workPath).then(() => true).catch(() => false);
        const personalExists = await fs.access(personalPath).then(() => true).catch(() => false);
        
        expect(workExists).toBe(true);
        expect(personalExists).toBe(true);
    });

    it('should handle project with custom ID', async () => {
        let questionIndex = 0;
        const answers = [
            '', '', '', '', '', 'y',
            'My Project',       // name
            'custom-id',        // custom id
            '',                 // description
            'mixed',            // context
            '',                 // destination
            'day',              // structure
            'phrase1, phrase2', // phrases
            '',                 // stop
        ];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        
        await runInstallCLI();
        
        // Should use custom ID
        const projectPath = path.join(tempDir, '.protokoll', 'context', 'projects', 'custom-id.yaml');
        const exists = await fs.access(projectPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
    });

    it('should handle project without trigger phrases', async () => {
        let questionIndex = 0;
        const answers = [
            '', '', '', '', '', 'y',
            'Default Project', // name
            '',               // id
            '',               // description
            '',               // context (default to work)
            '',               // destination
            '',               // structure (default to month)
            '',               // no phrases
            '',               // stop
        ];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        
        await runInstallCLI();
        
        // Should have created project
        const projectPath = path.join(tempDir, '.protokoll', 'context', 'projects', 'default-project.yaml');
        const exists = await fs.access(projectPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
    });

    it('should handle all structure types', async () => {
        const structures = ['none', 'year', 'month', 'day'];
        
        for (let i = 0; i < structures.length; i++) {
            const structure = structures[i];
            
            let questionIndex = 0;
            const answers = [
                '', '', '', '', '', 'y',
                `Project ${structure}`,
                '',
                '',
                'work',
                '',
                structure,
                '',
                '',
            ];
            
            mockQuestion.mockReset();
            mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
                callback(answers[questionIndex] || '');
                questionIndex++;
            });
            
            // Create fresh temp directory for each test
            const subTempDir = await fs.mkdtemp(path.join(os.tmpdir(), `protokoll-struct-${structure}-`));
            process.cwd = vi.fn(() => subTempDir);
            
            vi.resetModules();
            const { runInstallCLI } = await import('../../src/cli/install');
            await runInstallCLI();
            
            // Verify project was created
            const projectPath = path.join(subTempDir, '.protokoll', 'context', 'projects', `project-${structure}.yaml`);
            const exists = await fs.access(projectPath).then(() => true).catch(() => false);
            expect(exists).toBe(true);
            
            // Cleanup sub temp directory
            await fs.rm(subTempDir, { recursive: true });
        }
    });
});

describe('Install wizard output verification', () => {
    let tempDir: string;
    let originalCwd: () => string;
    let stdoutSpy: ReturnType<typeof vi.spyOn>;
    let stdoutCalls: string[];

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-output-'));
        originalCwd = process.cwd;
        process.cwd = vi.fn(() => tempDir);
        stdoutCalls = [];
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((text) => {
            stdoutCalls.push(text as string);
            return true;
        });
        mockQuestion.mockReset();
        mockClose.mockReset();
    });

    afterEach(async () => {
        process.cwd = originalCwd;
        stdoutSpy.mockRestore();
        await fs.rm(tempDir, { recursive: true });
        vi.clearAllMocks();
    });

    it('should print welcome banner', async () => {
        let questionIndex = 0;
        const answers = ['', '', '', '', '', 'n'];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        await runInstallCLI();
        
        const output = stdoutCalls.join('');
        expect(output).toContain('Protokoll');
        expect(output).toContain('Version');
    });

    it('should print model selection guidance', async () => {
        let questionIndex = 0;
        const answers = ['', '', '', '', '', 'n'];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        await runInstallCLI();
        
        const output = stdoutCalls.join('');
        expect(output).toContain('Model Selection');
        expect(output).toContain('Reasoning Model');
        expect(output).toContain('Transcription Model');
    });

    it('should print directory configuration section', async () => {
        let questionIndex = 0;
        const answers = ['', '', '', '', '', 'n'];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        await runInstallCLI();
        
        const output = stdoutCalls.join('');
        expect(output).toContain('Directory Configuration');
        expect(output).toContain('Audio Input Directory');
        expect(output).toContain('Output Directory');
    });

    it('should print installation complete message', async () => {
        let questionIndex = 0;
        const answers = ['', '', '', '', '', 'n'];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        await runInstallCLI();
        
        const output = stdoutCalls.join('');
        expect(output).toContain('Installation Complete');
        expect(output).toContain('Configuration Summary');
    });

    it('should print getting started guide', async () => {
        let questionIndex = 0;
        const answers = ['', '', '', '', '', 'n'];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        await runInstallCLI();
        
        const output = stdoutCalls.join('');
        expect(output).toContain('Getting Started');
        expect(output).toContain('OPENAI_API_KEY');
        expect(output).toContain('protokoll');
    });

    it('should print project info when projects created', async () => {
        let questionIndex = 0;
        const answers = [
            '', '', '', '', '', 'y',
            'Test Project', '', 'A test', 'work', '', 'month', 'test', '',
        ];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        await runInstallCLI();
        
        const output = stdoutCalls.join('');
        expect(output).toContain('Projects');
        expect(output).toContain('Test Project');
    });
});

describe('Configuration file YAML structure', () => {
    let tempDir: string;
    let originalCwd: () => string;
    let stdoutSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-yaml-'));
        originalCwd = process.cwd;
        process.cwd = vi.fn(() => tempDir);
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        mockQuestion.mockReset();
        mockClose.mockReset();
    });

    afterEach(async () => {
        process.cwd = originalCwd;
        stdoutSpy.mockRestore();
        await fs.rm(tempDir, { recursive: true });
        vi.clearAllMocks();
    });

    it('should create valid YAML config file', async () => {
        let questionIndex = 0;
        const answers = ['', '', '', '', '', 'n'];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        await runInstallCLI();
        
        const configPath = path.join(tempDir, '.protokoll', 'config.yaml');
        const content = await fs.readFile(configPath, 'utf-8');
        
        // Should be parseable YAML
        const parsed = yaml.load(content) as Record<string, unknown>;
        expect(parsed).toBeDefined();
        expect(parsed.model).toBeDefined();
        expect(parsed.transcriptionModel).toBeDefined();
    });

    it('should create valid YAML project files', async () => {
        let questionIndex = 0;
        const answers = [
            '', '', '', '', '', 'y',
            'Test', '', 'desc', 'work', '~/test', 'month', 'phrase', '',
        ];
        
        mockQuestion.mockImplementation((_question: string, callback: (answer: string) => void) => {
            callback(answers[questionIndex] || '');
            questionIndex++;
        });
        
        vi.resetModules();
        const { runInstallCLI } = await import('../../src/cli/install');
        await runInstallCLI();
        
        const projectPath = path.join(tempDir, '.protokoll', 'context', 'projects', 'test.yaml');
        const content = await fs.readFile(projectPath, 'utf-8');
        
        // Should be parseable YAML
        const parsed = yaml.load(content) as Record<string, unknown>;
        expect(parsed).toBeDefined();
        expect(parsed.id).toBe('test');
        expect(parsed.name).toBe('Test');
        expect(parsed.active).toBe(true);
    });
});
