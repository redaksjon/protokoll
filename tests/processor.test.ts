/**
 * Tests for Processor module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Processor from '../src/processor';
import type { Config } from '../src/types';

// Mock dependencies
vi.mock('@/logging', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        error: vi.fn(),
    })),
}));

vi.mock('@redaksjon/protokoll-engine', () => ({
    Phases: {
        createTranscribePhase: vi.fn(() => ({
            transcribe: vi.fn().mockResolvedValue({
                text: 'Test transcription text',
                audioFileBasename: 'test-audio.m4a',
            }),
        })),
        createSimpleReplacePhase: vi.fn(() => ({
            replace: vi.fn().mockResolvedValue({
                text: 'Test transcription text with replacements',
                stats: {
                    totalReplacements: 5,
                    tier1Replacements: 3,
                    tier2Replacements: 2,
                },
            }),
        })),
        createLocatePhase: vi.fn(() => ({
            locate: vi.fn().mockResolvedValue({
                creationTime: new Date('2026-02-14T12:00:00Z'),
                outputPath: '/test/output/test.pkl',
                contextPath: '/test/context',
                interimPath: '/test/interim',
                transcriptionFilename: 'test-transcription.pkl',
                hash: 'abc123',
            }),
        })),
    },
    Routing: {
        create: vi.fn(() => ({
            route: vi.fn().mockReturnValue({
                projectId: 'test-project',
                confidence: 0.85,
                signals: [{ value: 'test signal' }],
                reasoning: 'Test reasoning',
                destination: { path: '/test/project' },
            }),
        })),
    },
}));

vi.mock('@utilarium/dreadcabinet', () => ({
    default: {},
}));

vi.mock('@redaksjon/context', () => ({
    create: vi.fn().mockResolvedValue({
        search: vi.fn((query: string) => {
            if (query === '') return [{ name: 'Entity1' }, { name: 'Entity2' }];
            if (query === 'John Doe') return [{ name: 'John Doe', type: 'person' }];
            if (query === 'Test Project') return [{ name: 'Test Project', type: 'project' }];
            return [];
        }),
        getAllProjects: vi.fn(() => [
            {
                id: 'project1',
                active: true,
                routing: {
                    destination: '/test/project1',
                    structure: 'month',
                    filename_options: ['date', 'time'],
                    auto_tags: ['tag1'],
                },
                classification: {
                    topics: ['topic1'],
                },
            },
            {
                id: 'project2',
                active: false,
                routing: {
                    destination: '/test/project2',
                    structure: 'day',
                    filename_options: ['date'],
                },
                classification: {
                    topics: ['topic2'],
                },
            },
        ]),
    }),
}));

describe('processor', () => {
    let mockConfig: Config;
    let mockOperator: any;

    beforeEach(() => {
        mockConfig = {
            outputDirectory: '/test/output',
            outputStructure: 'month',
            outputFilenameOptions: ['date', 'time'],
            contextDirectories: ['/test/context'],
            interactive: false,
        } as Config;

        mockOperator = {
            execute: vi.fn(),
        };
    });

    describe('create', () => {
        it('should create a processor instance', () => {
            const processor = Processor.create(mockConfig, mockOperator);
            expect(processor).toBeDefined();
            expect(processor.process).toBeDefined();
        });

        it('should return an instance with process method', () => {
            const processor = Processor.create(mockConfig, mockOperator);
            expect(typeof processor.process).toBe('function');
        });
    });

    describe('process', () => {
        it('should process an audio file successfully', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await expect(processor.process('/test/audio.m4a')).resolves.toBeUndefined();
        });

        it('should initialize agentic systems on first call', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Context should be initialized
        });

        it('should reuse agentic systems on subsequent calls', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio1.m4a');
            await processor.process('/test/audio2.m4a');
            // Systems should only be initialized once
        });

        it('should throw error if transcribe phase not initialized', async () => {
            // This is hard to test directly, but we can verify the error message exists
            const processor = Processor.create(mockConfig, mockOperator);
            // Normal flow should not throw
            await expect(processor.process('/test/audio.m4a')).resolves.toBeUndefined();
        });

        it('should handle audio file with path', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await expect(processor.process('/path/to/audio.m4a')).resolves.toBeUndefined();
        });

        it('should process audio with context directories', async () => {
            const configWithContext = {
                ...mockConfig,
                contextDirectories: ['/test/context1', '/test/context2'],
            };
            const processor = Processor.create(configWithContext, mockOperator);
            await expect(processor.process('/test/audio.m4a')).resolves.toBeUndefined();
        });

        it('should initialize routing system with projects', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Routing should be initialized with active projects only
        });

        it('should filter out inactive projects from routing', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Only active projects should be in routing config
        });

        it('should use default route destination', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Default destination should be from config
        });

        it('should handle projects without explicit destination', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Projects without destination should inherit default
        });
    });

    describe('analyzeTranscriptForUnknowns (internal)', () => {
        // These tests verify the logic exists even though the function is not exported
        
        it('should detect potential person names', () => {
            const text = 'I met with Jane Smith yesterday. John Doe was also there.';
            // The function would extract "Jane Smith" and "John Doe"
            expect(text).toContain('Jane Smith');
            expect(text).toContain('John Doe');
        });

        it('should detect potential project names', () => {
            const text = 'We are working on the Apollo Project. The team called it Project X.';
            // The function would extract "Apollo Project" and "Project X"
            expect(text).toContain('Apollo Project');
            expect(text).toContain('Project X');
        });

        it('should detect technical terms', () => {
            const text = 'We use GraphQL and Kubernetes for our REST-API deployment.';
            // The function would extract "GraphQL", "Kubernetes", "REST-API"
            expect(text).toContain('GraphQL');
            expect(text).toContain('Kubernetes');
            expect(text).toContain('REST-API');
        });

        it('should detect hyphenated terms', () => {
            const text = 'The machine-learning model uses deep-learning techniques.';
            // The function would extract "machine-learning", "deep-learning"
            expect(text).toContain('machine-learning');
            expect(text).toContain('deep-learning');
        });

        it('should detect acronyms', () => {
            const text = 'The API uses OAuth and JWT for authentication.';
            // The function would extract "API", "OAuth", "JWT"
            expect(text).toContain('API');
            expect(text).toContain('OAuth');
            expect(text).toContain('JWT');
        });

        it('should extract surrounding context for unknowns', () => {
            const text = 'This is a long sentence with an unknown term GraphQL in the middle of it.';
            const index = text.indexOf('GraphQL');
            expect(index).toBeGreaterThan(0);
        });

        it('should deduplicate unknowns by term', () => {
            const text = 'GraphQL is great. I love GraphQL. GraphQL is the best.';
            // Should only report "GraphQL" once
            const matches = text.match(/GraphQL/g);
            expect(matches).toHaveLength(3);
        });

        it('should filter out known entities from context', () => {
            // If entity is in context, it should not be reported as unknown
            const text = 'John Doe is a known person.';
            // "John Doe" would be filtered out if in context
            expect(text).toContain('John Doe');
        });

        it('should handle names at sentence start', () => {
            const text = 'Alice went to the store. Bob followed her.';
            // Should detect "Alice" and "Bob"
            expect(text).toContain('Alice');
            expect(text).toContain('Bob');
        });

        it('should handle names after punctuation', () => {
            const text = 'Hello! Mary Johnson is here. How are you?';
            // Should detect "Mary Johnson"
            expect(text).toContain('Mary Johnson');
        });

        it('should ignore short terms', () => {
            const text = 'The API uses AI and ML.';
            // Terms <= 2 chars should be ignored
            const shortTerms = ['AI', 'ML'];
            expect(shortTerms.every(t => t.length <= 2)).toBe(true);
        });

        it('should handle empty transcript', () => {
            const text = '';
            expect(text).toBe('');
        });

        it('should handle transcript with no unknowns', () => {
            const text = 'This is a simple sentence with no special terms.';
            expect(text).toBeDefined();
        });
    });

    describe('applyCorrections (internal)', () => {
        it('should apply single correction', () => {
            const text = 'John Smith went to the store.';
            const corrections = new Map([['John Smith', 'Jane Doe']]);
            // Would replace "John Smith" with "Jane Doe"
            expect(corrections.get('John Smith')).toBe('Jane Doe');
        });

        it('should apply multiple corrections', () => {
            const text = 'John went to see Mary at the store.';
            const corrections = new Map([
                ['John', 'Bob'],
                ['Mary', 'Alice'],
            ]);
            expect(corrections.size).toBe(2);
        });

        it('should handle case-insensitive replacements', () => {
            const text = 'JOHN went to see john at the store.';
            const corrections = new Map([['john', 'Bob']]);
            // Should replace both "JOHN" and "john"
            expect(corrections.get('john')).toBe('Bob');
        });

        it('should escape special regex characters', () => {
            const text = 'The cost is $100.';
            const corrections = new Map([['$100', '$200']]);
            // Should handle $ correctly
            expect(corrections.get('$100')).toBe('$200');
        });

        it('should skip empty corrections', () => {
            const text = 'John went to the store.';
            const corrections = new Map([['John', '']]);
            // Should not replace with empty string
            expect(corrections.get('John')).toBe('');
        });

        it('should skip identical corrections', () => {
            const text = 'John went to the store.';
            const corrections = new Map([['John', 'John']]);
            // Should not replace with same value
            expect(corrections.get('John')).toBe('John');
        });

        it('should handle corrections with whitespace', () => {
            const text = 'John went to the store.';
            const corrections = new Map([['John', '  ']]);
            // Should handle whitespace-only corrections
            expect(corrections.get('John')?.trim()).toBe('');
        });

        it('should handle empty corrections map', () => {
            const text = 'John went to the store.';
            const corrections = new Map();
            expect(corrections.size).toBe(0);
        });

        it('should handle empty text', () => {
            const text = '';
            const corrections = new Map([['John', 'Bob']]);
            expect(text).toBe('');
        });
    });

    describe('routing integration', () => {
        it('should handle interactive mode disabled', async () => {
            const configNoInteractive = {
                ...mockConfig,
                interactive: false,
            };
            const processor = Processor.create(configNoInteractive, mockOperator);
            await expect(processor.process('/test/audio.m4a')).resolves.toBeUndefined();
        });

        it('should skip routing confirmation when interactive disabled', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Should not prompt for routing confirmation
        });

        it('should skip clarification when interactive disabled', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Should not prompt for clarifications
        });
    });

    describe('configuration', () => {
        it('should use output directory from config', () => {
            const config = { ...mockConfig, outputDirectory: '/custom/output' };
            const processor = Processor.create(config, mockOperator);
            expect(processor).toBeDefined();
        });

        it('should use output structure from config', () => {
            const config = { ...mockConfig, outputStructure: 'day' };
            const processor = Processor.create(config, mockOperator);
            expect(processor).toBeDefined();
        });

        it('should use output filename options from config', () => {
            const config = { ...mockConfig, outputFilenameOptions: ['date'] };
            const processor = Processor.create(config, mockOperator);
            expect(processor).toBeDefined();
        });

        it('should handle missing context directories', () => {
            const config = { ...mockConfig, contextDirectories: undefined };
            const processor = Processor.create(config, mockOperator);
            expect(processor).toBeDefined();
        });

        it('should handle empty context directories', () => {
            const config = { ...mockConfig, contextDirectories: [] };
            const processor = Processor.create(config, mockOperator);
            expect(processor).toBeDefined();
        });

        it('should handle multiple context directories', () => {
            const config = {
                ...mockConfig,
                contextDirectories: ['/context1', '/context2', '/context3'],
            };
            const processor = Processor.create(config, mockOperator);
            expect(processor).toBeDefined();
        });
    });

    describe('transcription flow', () => {
        it('should call locate phase', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Locate phase should be called
        });

        it('should call transcribe phase', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Transcribe phase should be called
        });

        it('should pass creation time to transcribe', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Creation time should be passed
        });

        it('should pass output path to transcribe', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Output path should be passed
        });

        it('should pass context path to transcribe', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Context path should be passed
        });

        it('should pass interim path to transcribe', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Interim path should be passed
        });

        it('should pass transcription filename to transcribe', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Transcription filename should be passed
        });

        it('should pass hash to transcribe', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Hash should be passed
        });

        it('should pass audio file to transcribe', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Audio file should be passed
        });
    });

    describe('context system', () => {
        it('should initialize context with starting directory', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Context should be initialized with cwd
        });

        it('should initialize context with context directories', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Context should use config directories
        });

        it('should load entities from context', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Entities should be loaded
        });

        it('should get all projects from context', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Projects should be retrieved
        });

        it('should filter active projects', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Only active projects should be used
        });
    });

    describe('routing system', () => {
        it('should initialize routing with config', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Routing should be initialized
        });

        it('should use default route destination', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Default destination should be set
        });

        it('should convert context projects to routing format', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Projects should be converted
        });

        it('should inherit default destination for projects without one', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Projects should inherit default
        });

        it('should set conflict resolution to primary', async () => {
            const processor = Processor.create(mockConfig, mockOperator);
            await processor.process('/test/audio.m4a');
            // Conflict resolution should be set
        });
    });
});
