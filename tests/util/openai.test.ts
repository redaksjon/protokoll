import { describe, expect, test, beforeEach, vi } from 'vitest';

// Setup mock objects
const mockOpenAITranscribe = vi.fn();
const mockAudio = {
    transcriptions: {
        create: mockOpenAITranscribe
    }
};

class MockOpenAI {
    audio = mockAudio;
}

const mockStorageWriteFile = vi.fn();
const mockStorageReadStream = vi.fn();
const mockStorage = {
    writeFile: mockStorageWriteFile,
    readStream: mockStorageReadStream
};
const mockStorageCreate = vi.fn(() => mockStorage);

const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
};
const mockGetLogger = vi.fn(() => mockLogger);

// Setup module mocks
vi.mock('openai', () => ({
    OpenAI: MockOpenAI
}));

vi.mock('../../src/util/storage.js', () => ({
    create: mockStorageCreate
}));

vi.mock('../../src/logging.js', () => ({
    getLogger: mockGetLogger
}));

// Import the module under test
let openAiUtils: any;

describe('OpenAI utilities', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();

        // Reset mocks
        mockGetLogger.mockReturnValue(mockLogger);
        mockStorageCreate.mockReturnValue(mockStorage);

        // Import the module under test
        openAiUtils = await import('../../src/util/openai.js');
    });

    describe('transcribeAudio', () => {
        test('should successfully transcribe audio', async () => {
            const mockFilePath = '/test/audio.mp3';
            const mockTranscription = { text: 'test transcription' };
            const mockStream = {};

            // @ts-ignore
            mockStorageReadStream.mockResolvedValue(mockStream);
            // @ts-ignore
            mockOpenAITranscribe.mockResolvedValue(mockTranscription);
            process.env.OPENAI_API_KEY = 'test-key';

            const result = await openAiUtils.transcribeAudio(mockFilePath);

            expect(result).toEqual(mockTranscription);
            // Now logs at info level with filename and model
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Transcribing audio with %s: %s ... this may take several minutes for long recordings',
                'whisper-1',
                'audio.mp3'
            );
            expect(mockLogger.debug).toHaveBeenCalledWith('Full path: %s', mockFilePath);
            expect(mockLogger.debug).toHaveBeenCalledWith('Received transcription from OpenAI: %s', mockTranscription);
        });

        test('should write debug file when debug options are provided', async () => {
            const mockFilePath = '/test/audio.mp3';
            const mockTranscription = { text: 'test transcription' };
            const mockStream = {};

            // @ts-ignore
            mockStorageReadStream.mockResolvedValue(mockStream);
            // @ts-ignore
            mockOpenAITranscribe.mockResolvedValue(mockTranscription);
            process.env.OPENAI_API_KEY = 'test-key';

            await openAiUtils.transcribeAudio(mockFilePath, { debug: true, debugFile: 'transcription-debug.json' });

            expect(mockStorageWriteFile).toHaveBeenCalledWith(
                'transcription-debug.json',
                JSON.stringify(mockTranscription, null, 2),
                'utf8'
            );
            expect(mockLogger.debug).toHaveBeenCalledWith('Wrote debug file to %s', 'transcription-debug.json');
        });

        test('should throw error when API key is missing', async () => {
            delete process.env.OPENAI_API_KEY;

            await expect(openAiUtils.transcribeAudio('/test/audio.mp3'))
                .rejects
                .toThrow('OPENAI_API_KEY environment variable is not set');
        });

        test('should throw error when no transcription is received', async () => {
            const mockStream = {};

            // @ts-ignore
            mockStorageReadStream.mockResolvedValue(mockStream);
            // @ts-ignore
            mockOpenAITranscribe.mockResolvedValue(null);
            process.env.OPENAI_API_KEY = 'test-key';

            await expect(openAiUtils.transcribeAudio('/test/audio.mp3'))
                .rejects
                .toThrow('No transcription received from OpenAI');
        });
    });
});
