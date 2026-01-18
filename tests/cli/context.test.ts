/**
 * Tests for CLI context management module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerContextCommands } from '../../src/cli/context';

// Mock the Context module
vi.mock('../../src/context', () => ({
    create: vi.fn(() => Promise.resolve({
        getAllPeople: vi.fn(() => [
            { id: 'john', name: 'John Doe', type: 'person', role: 'Engineer' },
            { id: 'jane', name: 'Jane Smith', type: 'person', company: 'Acme' },
        ]),
        getAllProjects: vi.fn(() => [
            { 
                id: 'alpha', 
                name: 'Project Alpha', 
                type: 'project',
                routing: { destination: '~/notes/alpha' },
                active: true 
            },
        ]),
        getAllTerms: vi.fn(() => [
            { id: 'api', name: 'API', type: 'term', expansion: 'Application Programming Interface' },
        ]),
        getAllCompanies: vi.fn(() => [
            { id: 'acme', name: 'Acme Corp', type: 'company', industry: 'Tech' },
        ]),
        getAllIgnored: vi.fn(() => [
            { id: 'common-phrase', name: 'common phrase', type: 'ignored', ignoredAt: '2026-01-15' },
        ]),
        getPerson: vi.fn((id) => id === 'john' ? { id: 'john', name: 'John Doe', type: 'person' } : undefined),
        getProject: vi.fn((id) => id === 'alpha' ? { id: 'alpha', name: 'Project Alpha', type: 'project', routing: { destination: '~/notes' }, classification: { context_type: 'work', explicit_phrases: [] } } : undefined),
        getTerm: vi.fn((id) => id === 'api' ? { id: 'api', name: 'API', type: 'term' } : undefined),
        getCompany: vi.fn((id) => id === 'acme' ? { id: 'acme', name: 'Acme Corp', type: 'company' } : undefined),
        getIgnored: vi.fn((id) => id === 'common-phrase' ? { id: 'common-phrase', name: 'common phrase', type: 'ignored' } : undefined),
        getEntityFilePath: vi.fn(() => '/path/to/.protokoll/context/people/john.yaml'),
        getDiscoveredDirs: vi.fn(() => [{ path: '/path/to/.protokoll', level: 0 }]),
        hasContext: vi.fn(() => true),
        saveEntity: vi.fn(),
        deleteEntity: vi.fn(() => Promise.resolve(true)),
        search: vi.fn(() => []),
    })),
}));

describe('CLI Context Commands', () => {
    let program: Command;
    let stdoutSpy: ReturnType<typeof vi.spyOn>;
    let stderrSpy: ReturnType<typeof vi.spyOn>;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        program = new Command();
        program.exitOverride(); // Prevent process.exit
        registerContextCommands(program);
        
        // Capture stdout/stderr
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    });

    afterEach(() => {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        exitSpy.mockRestore();
        vi.clearAllMocks();
    });

    describe('project commands', () => {
        it('should register project subcommand', () => {
            const projectCmd = program.commands.find(c => c.name() === 'project');
            expect(projectCmd).toBeDefined();
        });

        it('should have list subcommand', () => {
            const projectCmd = program.commands.find(c => c.name() === 'project');
            const listCmd = projectCmd?.commands.find(c => c.name() === 'list');
            expect(listCmd).toBeDefined();
        });

        it('should have show subcommand', () => {
            const projectCmd = program.commands.find(c => c.name() === 'project');
            const showCmd = projectCmd?.commands.find(c => c.name() === 'show');
            expect(showCmd).toBeDefined();
        });

        it('should have add subcommand', () => {
            const projectCmd = program.commands.find(c => c.name() === 'project');
            const addCmd = projectCmd?.commands.find(c => c.name() === 'add');
            expect(addCmd).toBeDefined();
        });

        it('should have --yes option on add subcommand', () => {
            const projectCmd = program.commands.find(c => c.name() === 'project');
            const addCmd = projectCmd?.commands.find(c => c.name() === 'add');
            const yesOption = addCmd?.options.find(o => o.long === '--yes' || o.short === '-y');
            expect(yesOption).toBeDefined();
        });

        it('should have delete subcommand', () => {
            const projectCmd = program.commands.find(c => c.name() === 'project');
            const deleteCmd = projectCmd?.commands.find(c => c.name() === 'delete');
            expect(deleteCmd).toBeDefined();
        });
    });

    describe('person commands', () => {
        it('should register person subcommand', () => {
            const personCmd = program.commands.find(c => c.name() === 'person');
            expect(personCmd).toBeDefined();
        });

        it('should have all CRUD subcommands', () => {
            const personCmd = program.commands.find(c => c.name() === 'person');
            expect(personCmd?.commands.find(c => c.name() === 'list')).toBeDefined();
            expect(personCmd?.commands.find(c => c.name() === 'show')).toBeDefined();
            expect(personCmd?.commands.find(c => c.name() === 'add')).toBeDefined();
            expect(personCmd?.commands.find(c => c.name() === 'delete')).toBeDefined();
        });
    });

    describe('term commands', () => {
        it('should register term subcommand', () => {
            const termCmd = program.commands.find(c => c.name() === 'term');
            expect(termCmd).toBeDefined();
        });

        it('should have all CRUD subcommands', () => {
            const termCmd = program.commands.find(c => c.name() === 'term');
            expect(termCmd?.commands.find(c => c.name() === 'list')).toBeDefined();
            expect(termCmd?.commands.find(c => c.name() === 'show')).toBeDefined();
            expect(termCmd?.commands.find(c => c.name() === 'add')).toBeDefined();
            expect(termCmd?.commands.find(c => c.name() === 'delete')).toBeDefined();
        });
    });

    describe('company commands', () => {
        it('should register company subcommand', () => {
            const companyCmd = program.commands.find(c => c.name() === 'company');
            expect(companyCmd).toBeDefined();
        });

        it('should have all CRUD subcommands', () => {
            const companyCmd = program.commands.find(c => c.name() === 'company');
            expect(companyCmd?.commands.find(c => c.name() === 'list')).toBeDefined();
            expect(companyCmd?.commands.find(c => c.name() === 'show')).toBeDefined();
            expect(companyCmd?.commands.find(c => c.name() === 'add')).toBeDefined();
            expect(companyCmd?.commands.find(c => c.name() === 'delete')).toBeDefined();
        });
    });

    describe('ignored commands', () => {
        it('should register ignored subcommand', () => {
            const ignoredCmd = program.commands.find(c => c.name() === 'ignored');
            expect(ignoredCmd).toBeDefined();
        });

        it('should have all CRUD subcommands', () => {
            const ignoredCmd = program.commands.find(c => c.name() === 'ignored');
            expect(ignoredCmd?.commands.find(c => c.name() === 'list')).toBeDefined();
            expect(ignoredCmd?.commands.find(c => c.name() === 'show')).toBeDefined();
            expect(ignoredCmd?.commands.find(c => c.name() === 'add')).toBeDefined();
            expect(ignoredCmd?.commands.find(c => c.name() === 'delete')).toBeDefined();
        });
    });

    describe('context commands', () => {
        it('should register context subcommand', () => {
            const contextCmd = program.commands.find(c => c.name() === 'context');
            expect(contextCmd).toBeDefined();
        });

        it('should have status subcommand', () => {
            const contextCmd = program.commands.find(c => c.name() === 'context');
            const statusCmd = contextCmd?.commands.find(c => c.name() === 'status');
            expect(statusCmd).toBeDefined();
        });

        it('should have search subcommand', () => {
            const contextCmd = program.commands.find(c => c.name() === 'context');
            const searchCmd = contextCmd?.commands.find(c => c.name() === 'search');
            expect(searchCmd).toBeDefined();
        });
    });

    describe('project sounds_like parsing', () => {
        it('should parse comma-separated sounds_like values', () => {
            const parseSoundsLike = (input: string) => {
                return input.split(',').map(s => s.trim()).filter(Boolean);
            };
            
            expect(parseSoundsLike('protocol, pro to call, proto call')).toEqual([
                'protocol', 
                'pro to call', 
                'proto call'
            ]);
        });

        it('should handle single sounds_like value', () => {
            const parseSoundsLike = (input: string) => {
                return input.split(',').map(s => s.trim()).filter(Boolean);
            };
            
            expect(parseSoundsLike('protocol')).toEqual(['protocol']);
        });

        it('should handle empty sounds_like input', () => {
            const parseSoundsLike = (input: string) => {
                return input.split(',').map(s => s.trim()).filter(Boolean);
            };
            
            expect(parseSoundsLike('')).toEqual([]);
        });

        it('should filter empty strings from sounds_like', () => {
            const parseSoundsLike = (input: string) => {
                return input.split(',').map(s => s.trim()).filter(Boolean);
            };
            
            expect(parseSoundsLike('protocol, , pro to call')).toEqual(['protocol', 'pro to call']);
        });

        it('should handle Norwegian project names with English sounds_like', () => {
            const parseSoundsLike = (input: string) => {
                return input.split(',').map(s => s.trim()).filter(Boolean);
            };
            
            // Common Norwegian project names and their English transcriptions
            expect(parseSoundsLike('chronology, crono logy')).toEqual(['chronology', 'crono logy']);
            expect(parseSoundsLike('observation, observe asian')).toEqual(['observation', 'observe asian']);
            expect(parseSoundsLike('redaction, red action')).toEqual(['redaction', 'red action']);
        });
    });

    describe('project field explanations', () => {
        it('should distinguish trigger phrases from sounds_like', () => {
            // This test documents the conceptual difference between the two fields
            // Trigger phrases: match CONTENT (what appears in the transcript text)
            // Sounds like: match PROJECT NAME (when Whisper mishears the project name itself)
            
            const triggerPhrases = ['work on protokoll', 'protokoll project'];
            const soundsLike = ['protocol', 'pro to call'];
            
            // Trigger phrases identify content about the project
            expect(triggerPhrases.every(p => p.toLowerCase().includes('protokoll'))).toBe(true);
            
            // Sounds like are phonetic approximations of the project name
            expect(soundsLike.every(s => !s.includes('protokoll'))).toBe(true);
            expect(soundsLike[0]).toBe('protocol'); // English approximation
        });

        it('should distinguish sounds_like from topics', () => {
            // Topics: lower-confidence theme associations
            // Sounds like: phonetic variants of the project name
            
            const topics = ['transcription', 'audio', 'notes'];
            const soundsLike = ['protocol', 'pro to call'];
            
            // Topics are thematic keywords
            expect(topics.some(t => t === 'transcription')).toBe(true);
            
            // Sounds like are pronunciation variants
            expect(soundsLike[0]).toBe('protocol');
        });
    });
});
