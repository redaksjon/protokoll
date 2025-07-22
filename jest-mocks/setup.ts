import { vi } from 'vitest';

export interface StorageMock {
    writeFile: ReturnType<typeof vi.fn>;
    readStream: ReturnType<typeof vi.fn>;
}

export interface OpenAIMock {
    chat: {
        completions: {
            create: ReturnType<typeof vi.fn>;
        }
    };
    audio: {
        transcriptions: {
            create: ReturnType<typeof vi.fn>;
        }
    };
}

export const createMocks = () => {
    // Mock for OpenAI
    const openAICreateMock = vi.fn();
    const openAITranscribeMock = vi.fn();
    const openAIConstructor = vi.fn().mockImplementation(() => ({
        chat: {
            completions: {
                create: openAICreateMock
            }
        },
        audio: {
            transcriptions: {
                create: openAITranscribeMock
            }
        }
    } as OpenAIMock));

    // Mock for Storage
    const storageMock: StorageMock = {
        writeFile: vi.fn(),
        readStream: vi.fn()
    };
    const storageCreateMock = vi.fn().mockReturnValue(storageMock);

    // Mock for Logger
    const loggerMock = {
        debug: vi.fn(),
        error: vi.fn()
    };
    const getLoggerMock = vi.fn().mockReturnValue(loggerMock);

    return {
        openAICreateMock,
        openAITranscribeMock,
        openAIConstructor,
        storageMock,
        storageCreateMock,
        loggerMock,
        getLoggerMock
    };
}; 