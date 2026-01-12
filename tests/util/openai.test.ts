import { describe, expect, test, beforeEach, vi } from 'vitest';

// Setup mock objects
const mockOpenAITranscribe = vi.fn();
const mockChatCompletionsCreate = vi.fn();

const mockAudio = {
    transcriptions: {
        create: mockOpenAITranscribe
    }
};

const mockChat = {
    completions: {
        create: mockChatCompletionsCreate
    }
};

class MockOpenAI {
    audio = mockAudio;
    chat = mockChat;
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

        test('should use custom model when provided', async () => {
            const mockFilePath = '/test/audio.mp3';
            const mockTranscription = { text: 'test transcription' };
            const mockStream = {};
            const customModel = 'custom-transcription-model';

            // @ts-ignore
            mockStorageReadStream.mockResolvedValue(mockStream);
            // @ts-ignore
            mockOpenAITranscribe.mockResolvedValue(mockTranscription);
            process.env.OPENAI_API_KEY = 'test-key';

            await openAiUtils.transcribeAudio(mockFilePath, { model: customModel });

            // Verify the custom model was used
            expect(mockOpenAITranscribe).toHaveBeenCalledWith(
                expect.objectContaining({ model: customModel })
            );
        });

        test('should handle transcription errors gracefully', async () => {
            const mockStream = {};
            const error = new Error('API Error');

            // @ts-ignore
            mockStorageReadStream.mockResolvedValue(mockStream);
            // @ts-ignore
            mockOpenAITranscribe.mockRejectedValue(error);
            process.env.OPENAI_API_KEY = 'test-key';

            await expect(openAiUtils.transcribeAudio('/test/audio.mp3'))
                .rejects
                .toThrow('Failed to transcribe audio: API Error');

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('createCompletion', () => {
        test('should successfully create completion', async () => {
            const messages = [
                { role: 'user', content: 'Hello' }
            ];
            const mockResponse = 'Test response';

            // @ts-ignore
            mockChatCompletionsCreate.mockResolvedValue({
                choices: [
                    {
                        message: {
                            content: mockResponse
                        }
                    }
                ]
            });
            process.env.OPENAI_API_KEY = 'test-key';

            const result = await openAiUtils.createCompletion(messages);

            expect(result).toBe(mockResponse);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Sending request to reasoning model (%s)... this may take a minute',
                'gpt-5.2'
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Sending prompt to OpenAI: %j',
                messages
            );
        });

        test('should use custom model when provided', async () => {
            const messages = [{ role: 'user', content: 'Hello' }];
            const customModel = 'gpt-4-turbo';

            // @ts-ignore
            mockChatCompletionsCreate.mockResolvedValue({
                choices: [
                    {
                        message: {
                            content: 'Response'
                        }
                    }
                ]
            });
            process.env.OPENAI_API_KEY = 'test-key';

            await openAiUtils.createCompletion(messages, { model: customModel });

            const callArgs = mockChatCompletionsCreate.mock.calls[0][0];
            expect(callArgs.model).toBe(customModel);
        });

        test('should use reasoning_effort for reasoning models', async () => {
            const messages = [{ role: 'user', content: 'Hello' }];

            // @ts-ignore
            mockChatCompletionsCreate.mockResolvedValue({
                choices: [
                    {
                        message: {
                            content: 'Response'
                        }
                    }
                ]
            });
            process.env.OPENAI_API_KEY = 'test-key';

            await openAiUtils.createCompletion(messages, { 
                model: 'o3-mini',
                reasoningLevel: 'high'
            });

            const callArgs = mockChatCompletionsCreate.mock.calls[0][0];
            expect(callArgs.reasoning_effort).toBe('high');
        });

        test('should not use reasoning_effort for non-reasoning models', async () => {
            const messages = [{ role: 'user', content: 'Hello' }];

            // @ts-ignore
            mockChatCompletionsCreate.mockResolvedValue({
                choices: [
                    {
                        message: {
                            content: 'Response'
                        }
                    }
                ]
            });
            process.env.OPENAI_API_KEY = 'test-key';

            await openAiUtils.createCompletion(messages, { 
                model: 'gpt-4-turbo',
                reasoningLevel: 'high'
            });

            const callArgs = mockChatCompletionsCreate.mock.calls[0][0];
            expect(callArgs.reasoning_effort).toBeUndefined();
        });

        test('should parse JSON response format when specified', async () => {
            const messages = [{ role: 'user', content: 'Hello' }];
            const jsonResponse = '{"key": "value"}';

            // @ts-ignore
            mockChatCompletionsCreate.mockResolvedValue({
                choices: [
                    {
                        message: {
                            content: jsonResponse
                        }
                    }
                ]
            });
            process.env.OPENAI_API_KEY = 'test-key';

            const result = await openAiUtils.createCompletion(messages, { 
                responseFormat: { type: 'json_object' }
            });

            expect(result).toEqual({ key: 'value' });
        });

        test('should write debug file when debug options provided', async () => {
            const messages = [{ role: 'user', content: 'Hello' }];

            // @ts-ignore
            mockChatCompletionsCreate.mockResolvedValue({
                choices: [
                    {
                        message: {
                            content: 'Response'
                        }
                    }
                ]
            });
            process.env.OPENAI_API_KEY = 'test-key';

            await openAiUtils.createCompletion(messages, {
                debug: true,
                debugFile: 'completion-debug.json'
            });

            expect(mockStorageWriteFile).toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Wrote debug file to %s',
                'completion-debug.json'
            );
        });

        test('should throw error when API key is missing', async () => {
            delete process.env.OPENAI_API_KEY;

            await expect(openAiUtils.createCompletion([{ role: 'user', content: 'Hello' }]))
                .rejects
                .toThrow('OPENAI_API_KEY environment variable is not set');
        });

        test('should throw error when no response received', async () => {
            const messages = [{ role: 'user', content: 'Hello' }];

            // @ts-ignore
            mockChatCompletionsCreate.mockResolvedValue({
                choices: [
                    {
                        message: {
                            content: null
                        }
                    }
                ]
            });
            process.env.OPENAI_API_KEY = 'test-key';

            await expect(openAiUtils.createCompletion(messages))
                .rejects
                .toThrow('No response received from OpenAI');
        });

        test('should handle completion errors gracefully', async () => {
            const messages = [{ role: 'user', content: 'Hello' }];
            const error = new Error('API Error');

            // @ts-ignore
            mockChatCompletionsCreate.mockRejectedValue(error);
            process.env.OPENAI_API_KEY = 'test-key';

            await expect(openAiUtils.createCompletion(messages))
                .rejects
                .toThrow('Failed to create completion: API Error');

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
