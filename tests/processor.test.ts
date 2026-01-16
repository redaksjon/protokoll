import { describe, expect, test, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { Transcription } from '../src/processor';

// Variables to hold dynamically imported modules
let processorModule: any;

// Mock dependencies
const mockLogger = {
    debug: vi.fn(),
    verbose: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
};

vi.mock('../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue(mockLogger)
}));

// Mock for Interactive module
const mockClarificationHandler = vi.fn().mockResolvedValue({
    response: 'corrected term',
    shouldRemember: false
});

const mockInteractiveInstance = {
    create: vi.fn(),
    startSession: vi.fn(),
    endSession: vi.fn().mockReturnValue({
        requests: [],
        responses: [],
    }),
    handleClarification: mockClarificationHandler
};

vi.mock('../src/interactive', () => ({
    create: vi.fn().mockReturnValue(mockInteractiveInstance)
}));

// Mock for Context module
const mockContextSearch = vi.fn().mockReturnValue([]);
const mockContextSaveEntity = vi.fn().mockResolvedValue(undefined);

const mockContextInstance = {
    search: mockContextSearch,
    saveEntity: mockContextSaveEntity,
    getAllProjects: vi.fn().mockReturnValue([])
};

vi.mock('../src/context', () => ({
    create: vi.fn().mockResolvedValue(mockContextInstance)
}));

// Mock for Routing module
const mockRoutingInstance = {
    route: vi.fn().mockReturnValue({
        destination: { path: '~/notes', structure: 'month', filename_options: ['date'] },
        projectId: null,
        confidence: 0.85,
        signals: [],
        reasoning: 'Default routing',
    }),
};

vi.mock('../src/routing', () => ({
    create: vi.fn().mockReturnValue(mockRoutingInstance)
}));

// Mock for TranscribePhase
// @ts-ignore
const mockTranscribe = vi.fn().mockResolvedValue({
    text: 'Test transcription with John Smith and the Project X project.',
    audioFileBasename: 'test-audio.mp3'
});

const mockTranscribeInstance = {
    transcribe: mockTranscribe
};

vi.mock('../src/phases/transcribe', () => ({
    create: vi.fn().mockReturnValue(mockTranscribeInstance)
}));

// Mock for LocatePhase
const mockLocate = vi.fn().mockResolvedValue({
    creationTime: new Date('2023-01-01T00:00:00Z'),
    outputPath: '/output/path',
    contextPath: '/context/path',
    interimPath: '/interim/path',
    transcriptionFilename: 'transcription.txt',
    hash: 'abc123'
});

const mockLocateInstance = {
    locate: mockLocate
};

vi.mock('../src/phases/locate', () => ({
    create: vi.fn().mockReturnValue(mockLocateInstance)
}));

// Mock for Dreadcabinet Operator
const mockOperator = {
    constructFilename: vi.fn().mockResolvedValue('test-filename')
};

vi.mock('@theunwalked/dreadcabinet', () => ({
    // Add any dreadcabinet mocks if needed
}));

describe('Processor', () => {
    // Mock config
    const mockConfig = {
        dryRun: false,
        verbose: false,
        debug: false,
        model: 'gpt-4o-mini',
        transcriptionModel: 'whisper-1',
        overrides: false,
        maxAudioSize: 26214400,
        tempDirectory: '/tmp',
        contextDirectories: [],
        interactive: false,
        outputDirectory: 'output'
    };

    beforeAll(async () => {
        // Import the module under test after all mocks are set up
        processorModule = await import('../src/processor.js');
    });

    beforeEach(() => {
        // Clear all mocks before each test
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test('should create processor instance', () => {
        const processor = processorModule.create(mockConfig, mockOperator);
        expect(processor).toBeDefined();
        expect(processor.process).toBeInstanceOf(Function);
    });

    test('should process audio file successfully', async () => {
        const processor = processorModule.create(mockConfig, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        await processor.process(audioFile);

        // Verify locate was called
        expect(mockLocate).toHaveBeenCalledWith(audioFile);

        // Verify transcribe was called with the right parameters
        expect(mockTranscribe).toHaveBeenCalledWith(
            new Date('2023-01-01T00:00:00Z'),
            '/output/path',
            '/context/path',
            '/interim/path',
            'transcription.txt',
            'abc123',
            audioFile
        );

        // Verify logging calls
        expect(mockLogger.verbose).toHaveBeenCalledWith('Processing file %s', audioFile);
        expect(mockLogger.debug).toHaveBeenCalledWith('Locating file %s', audioFile);
        expect(mockLogger.debug).toHaveBeenCalledWith('Transcribing file %s', audioFile);
        expect(mockLogger.info).toHaveBeenCalledWith('Transcription complete for file %s', audioFile);
        expect(mockLogger.info).toHaveBeenCalledWith('Transcription saved to: %s', 'transcription.txt');
    });

    test('should handle errors in locate phase', async () => {
        const processor = processorModule.create(mockConfig, mockOperator);
        const audioFile = '/path/to/audio.mp3';
        const error = new Error('Locate failed');

        mockLocate.mockRejectedValueOnce(error);

        await expect(processor.process(audioFile)).rejects.toThrow('Locate failed');

        expect(mockLocate).toHaveBeenCalledWith(audioFile);
        expect(mockTranscribe).not.toHaveBeenCalled();
    });

    test('should handle errors in transcribe phase', async () => {
        const processor = processorModule.create(mockConfig, mockOperator);
        const audioFile = '/path/to/audio.mp3';
        const error = new Error('Transcription failed');

        mockTranscribe.mockRejectedValueOnce(error);

        await expect(processor.process(audioFile)).rejects.toThrow('Transcription failed');

        expect(mockLocate).toHaveBeenCalledWith(audioFile);
        expect(mockTranscribe).toHaveBeenCalled();
    });

    test('should initialize agentic systems on first process call', async () => {
        const processor = processorModule.create(mockConfig, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        await processor.process(audioFile);

        // Verify context was initialized
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Agentic transcription ready - model will query context via tools'
        );
    });

    test('should not reinitialize agentic systems on subsequent calls', async () => {
        const processor = processorModule.create(mockConfig, mockOperator);
        const audioFile1 = '/path/to/audio1.mp3';
        const audioFile2 = '/path/to/audio2.mp3';

        // First call initializes
        await processor.process(audioFile1);
        const initCalls = mockLogger.info.mock.calls.filter(call => 
            call[0].includes('Initializing agentic systems')
        ).length;

        // Second call should not reinitialize
        await processor.process(audioFile2);
        const initCallsAfter = mockLogger.info.mock.calls.filter(call => 
            call[0].includes('Initializing agentic systems')
        ).length;

        expect(initCallsAfter).toBe(initCalls);
    });

    test('should handle interactive mode with clarifications', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        const processor = processorModule.create(configWithInteractive, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        // Mock context search to return empty (unknowns found)
        mockContextSearch.mockReturnValue([]);
        
        // Mock interactive handler
        mockClarificationHandler.mockResolvedValue({
            response: 'John Smith',
            shouldRemember: true
        });

        await processor.process(audioFile);

        // Should have initialized interactive system
        expect(mockLogger.info).toHaveBeenCalledWith('Interactive session started');
    });

    test('should end interactive session after processing', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        const processor = processorModule.create(configWithInteractive, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        mockContextSearch.mockReturnValue([]);

        await processor.process(audioFile);

        // Should have ended interactive session
        expect(mockInteractiveInstance.endSession).toHaveBeenCalled();
    });

    test('should save new entity to context when user remembers it', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        const processor = processorModule.create(configWithInteractive, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        // Mock context search to return empty (unknowns found)
        mockContextSearch.mockReturnValue([]);
        
        // Mock interactive handler with shouldRemember = true
        mockClarificationHandler.mockResolvedValue({
            response: 'New Person Name',
            shouldRemember: true
        });

        await processor.process(audioFile);

        // Should have tried to save to context
        expect(mockContextSaveEntity).toHaveBeenCalled();
    });

    test('should handle errors when saving entity to context', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        const processor = processorModule.create(configWithInteractive, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        mockContextSearch.mockReturnValue([]);
        mockClarificationHandler.mockResolvedValue({
            response: 'New Entity',
            shouldRemember: true
        });
        mockContextSaveEntity.mockRejectedValue(new Error('Save failed'));

        await processor.process(audioFile);

        // Should log warning but not crash
        expect(mockLogger.warn).toHaveBeenCalledWith(
            'Could not save entity to context',
            expect.any(Object)
        );
    });

    test('should handle transcription with no unknown entities', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        const processor = processorModule.create(configWithInteractive, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        // Mock transcribe to return text with no unknown names
        mockTranscribe.mockResolvedValueOnce({
            text: 'Just a simple transcription',
            audioFileBasename: 'test-audio.mp3'
        });

        await processor.process(audioFile);

        // Should log that no unknowns were detected
        expect(mockLogger.info).toHaveBeenCalledWith(
            'No unknown entities detected - transcript looks good'
        );
    });

    test('should not apply corrections when user provides same value as original', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        const processor = processorModule.create(configWithInteractive, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        // Mock context search to return empty (unknowns found)
        mockContextSearch.mockReturnValue([]);
        
        // Mock interactive handler to return same value as original (no correction)
        mockClarificationHandler.mockResolvedValue({
            response: 'John Smith', // Same as what was detected
            shouldRemember: false
        });

        // Mock transcribe with a name
        mockTranscribe.mockResolvedValueOnce({
            text: 'Meeting with John Smith about the project.',
            audioFileBasename: 'test-audio.mp3'
        });

        await processor.process(audioFile);

        // Should complete without errors
        expect(mockLogger.info).toHaveBeenCalledWith('Transcription complete for file %s', audioFile);
    });

    test('should process transcription with technical terms (new_term type)', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        const processor = processorModule.create(configWithInteractive, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        // Mock context search to return empty
        mockContextSearch.mockReturnValue([]);
        
        // Mock handler for term clarifications
        mockClarificationHandler.mockResolvedValue({
            response: 'Graph Query Language',
            shouldRemember: true
        });

        // Mock transcribe with technical terms
        mockTranscribe.mockResolvedValueOnce({
            text: 'We are using GraphQL for our API layer.',
            audioFileBasename: 'test-audio.mp3'
        });

        await processor.process(audioFile);

        // Process should complete
        expect(mockLogger.info).toHaveBeenCalledWith('Transcription complete for file %s', audioFile);
    });

    test('should handle transcription with project name patterns', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        const processor = processorModule.create(configWithInteractive, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        // Mock context search to return empty (unknown project)
        mockContextSearch.mockReturnValue([]);
        
        mockClarificationHandler.mockResolvedValue({
            response: 'Phoenix',
            shouldRemember: true
        });

        // Mock transcribe with project pattern
        mockTranscribe.mockResolvedValueOnce({
            text: 'Working on the Phoenix project today.',
            audioFileBasename: 'test-audio.mp3'
        });

        await processor.process(audioFile);

        expect(mockLogger.info).toHaveBeenCalledWith('Transcription complete for file %s', audioFile);
    });

    test('should skip interactive processing when not in interactive mode', async () => {
        const processor = processorModule.create(mockConfig, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        // Mock transcribe with names that would trigger interactive mode
        mockTranscribe.mockResolvedValueOnce({
            text: 'Meeting with John Smith and Jane Doe about the Phoenix project.',
            audioFileBasename: 'test-audio.mp3'
        });

        await processor.process(audioFile);

        // Should not start interactive session
        expect(mockLogger.info).not.toHaveBeenCalledWith('Interactive session started');
        expect(mockLogger.info).toHaveBeenCalledWith('Transcription complete for file %s', audioFile);
    });

    test('should skip unknown entities that are already in context', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        const processor = processorModule.create(configWithInteractive, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        // Mock context search to return matches (names ARE known)
        mockContextSearch.mockReturnValue([{ id: 'john-smith', name: 'John Smith', type: 'person' }]);

        // Mock transcribe with name that IS in context
        mockTranscribe.mockResolvedValueOnce({
            text: 'Meeting with John Smith about the budget.',
            audioFileBasename: 'test-audio.mp3'
        });

        await processor.process(audioFile);

        // Should complete without asking for clarifications
        expect(mockLogger.info).toHaveBeenCalledWith('No unknown entities detected - transcript looks good');
    });

    test('should handle projects with custom routing configuration', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        
        // Mock context to return projects with routing info
        mockContextInstance.getAllProjects.mockReturnValue([
            {
                id: 'project-alpha',
                name: 'Project Alpha',
                type: 'project',
                active: true,
                routing: {
                    destination: '~/notes/alpha',
                    structure: 'day',
                    filename_options: ['date', 'subject'],
                    auto_tags: ['work', 'alpha'],
                },
                classification: {
                    context_type: 'work',
                    explicit_phrases: ['project alpha'],
                },
            },
            {
                id: 'project-beta',
                name: 'Project Beta',
                type: 'project',
                active: true,
                routing: {
                    destination: null, // Will use default
                    structure: 'month',
                    filename_options: ['date'],
                },
                classification: {
                    context_type: 'work',
                },
            },
        ]);

        const processor = processorModule.create(configWithInteractive, mockOperator);
        await processor.process('/path/to/audio.mp3');

        // Should have initialized routing with projects
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Routing system initialized with %d projects', 
            2
        );
    });

    test('should skip inactive projects when setting up routing', async () => {
        mockContextInstance.getAllProjects.mockReturnValue([
            {
                id: 'active-project',
                name: 'Active Project',
                type: 'project',
                active: true,
                routing: {
                    destination: '~/notes/active',
                    structure: 'month',
                    filename_options: ['date'],
                },
                classification: {},
            },
            {
                id: 'inactive-project',
                name: 'Inactive Project',
                type: 'project',
                active: false, // Should be filtered out
                routing: {
                    destination: '~/notes/inactive',
                    structure: 'month',
                    filename_options: ['date'],
                },
                classification: {},
            },
        ]);

        const processor = processorModule.create(mockConfig, mockOperator);
        await processor.process('/path/to/audio.mp3');

        // Only 1 project should be active
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Routing system initialized with %d projects',
            1
        );
    });

    test('should apply multiple corrections to transcript', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        const processor = processorModule.create(configWithInteractive, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        mockContextSearch.mockReturnValue([]);
        
        // Mock multiple different clarification responses
        let callCount = 0;
        mockClarificationHandler.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.resolve({ response: 'John Corrected', shouldRemember: false });
            }
            return Promise.resolve({ response: 'Project Corrected', shouldRemember: false });
        });

        mockTranscribe.mockResolvedValueOnce({
            text: 'Meeting with John Smith. Working on the Phoenix project.',
            audioFileBasename: 'test-audio.mp3'
        });

        await processor.process(audioFile);

        expect(mockLogger.info).toHaveBeenCalledWith('Transcription complete for file %s', audioFile);
    });

    test('should handle clarification with empty response', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        const processor = processorModule.create(configWithInteractive, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        mockContextSearch.mockReturnValue([]);
        
        // Mock handler to return empty string (user skipped)
        mockClarificationHandler.mockResolvedValue({
            response: '',
            shouldRemember: false
        });

        mockTranscribe.mockResolvedValueOnce({
            text: 'Meeting with John Smith about something.',
            audioFileBasename: 'test-audio.mp3'
        });

        await processor.process(audioFile);

        // Should complete without applying corrections
        expect(mockLogger.info).toHaveBeenCalledWith('Transcription complete for file %s', audioFile);
    });

    test('should ask for routing confirmation when confidence is low', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        
        // Mock low confidence routing
        mockRoutingInstance.route.mockReturnValue({
            destination: { path: '~/notes/unknown', structure: 'month', filename_options: ['date'] },
            projectId: null,
            confidence: 0.5, // Below 0.7 threshold
            signals: [{ type: 'context', value: 'meeting', weight: 0.3, source: 'transcript' }],
            reasoning: 'Low confidence match',
        });

        const processor = processorModule.create(configWithInteractive, mockOperator);
        const audioFile = '/path/to/audio.mp3';

        // Mock transcript with no special entities
        mockTranscribe.mockResolvedValueOnce({
            text: 'Simple meeting notes.',
            audioFileBasename: 'test-audio.mp3'
        });

        await processor.process(audioFile);

        // Should log about low confidence
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Routing confidence'),
            expect.any(Number)
        );
    });

    test('should include signals in low confidence routing context', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        
        // Mock low confidence with multiple signals
        mockRoutingInstance.route.mockReturnValue({
            destination: { path: '~/notes', structure: 'month', filename_options: ['date'] },
            projectId: 'partial-match',
            confidence: 0.6,
            signals: [
                { type: 'explicit', value: 'partial', weight: 0.4, source: 'context' },
                { type: 'topic', value: 'meeting', weight: 0.2, source: 'transcript' },
            ],
            reasoning: 'Partial match',
        });

        const processor = processorModule.create(configWithInteractive, mockOperator);

        mockTranscribe.mockResolvedValueOnce({
            text: 'Simple content.',
            audioFileBasename: 'test-audio.mp3'
        });

        await processor.process('/path/to/audio.mp3');

        // Should handle clarification for low confidence
        expect(mockClarificationHandler).toHaveBeenCalled();
    });

    test('should handle routing with no signals gracefully', async () => {
        const configWithInteractive = { ...mockConfig, interactive: true };
        
        // Mock low confidence with empty signals
        mockRoutingInstance.route.mockReturnValue({
            destination: { path: '~/notes', structure: 'month', filename_options: ['date'] },
            projectId: null,
            confidence: 0.3,
            signals: [], // No signals
            reasoning: 'Default routing - no matches',
        });

        const processor = processorModule.create(configWithInteractive, mockOperator);

        mockTranscribe.mockResolvedValueOnce({
            text: 'Unknown content.',
            audioFileBasename: 'test-audio.mp3'
        });

        await processor.process('/path/to/audio.mp3');

        // Should handle without crashing
        expect(mockLogger.info).toHaveBeenCalledWith('Transcription complete for file %s', '/path/to/audio.mp3');
    });
});
