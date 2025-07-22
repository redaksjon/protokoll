import { describe, expect, test, beforeAll, beforeEach, vi } from 'vitest';
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

// Mock for TranscribePhase
// @ts-ignore
const mockTranscribe = vi.fn().mockResolvedValue({
    text: 'Test transcription',
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
        contextDirectories: []
    };

    beforeAll(async () => {
        // Import the module under test after all mocks are set up
        processorModule = await import('../src/processor.js');
    });

    beforeEach(() => {
        // Clear all mocks before each test
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
});
