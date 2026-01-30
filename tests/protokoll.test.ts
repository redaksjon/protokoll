import { describe, expect, beforeAll, beforeEach, afterAll, afterEach, test, vi, Mock } from 'vitest';

// Variables to hold dynamically imported modules
let protokoll: { main: () => Promise<void> };

// Define a simplified mock config 
const mockConfig = {
    dryRun: false,
    verbose: false,
    debug: false,
    diff: false,
    log: false,
    model: 'gpt-4o',
    transcriptionModel: 'whisper-1',
    reasoningLevel: 'medium' as const,
    contentTypes: ['diff', 'log'],
    configDirectory: 'test-config-dir',
    overrides: false,
    timezone: 'America/New_York',
    outputStructure: 'month',
    outputFilenameOptions: ['date', 'time'],
    inputDirectory: 'test-input-directory',
    outputDirectory: 'test-output-directory',
    recursive: false,
    extensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
    interactive: false,
    selfReflection: true,
    silent: false,
    maxAudioSize: 26214400,
    tempDirectory: '/tmp',
};

const mockSecureConfig = {
    openaiApiKey: 'test-api-key',
};

// Mock dependencies to prevent the test from running actual operations
vi.mock('../src/arguments', () => ({
    configure: vi.fn().mockResolvedValue([mockConfig, mockSecureConfig])
}));

// Mock logging to avoid actual console output during tests
const mockLogger = {
    debug: vi.fn(),
    verbose: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
};

vi.mock('../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue(mockLogger),
    setLogLevel: vi.fn()
}));

// Mock Pipeline
const mockPipelineProcess = vi.fn().mockResolvedValue({
    outputPath: '/output/test-transcription.md',
    sessionDir: 'test-session',
});

const mockPipelineInstance = {
    process: mockPipelineProcess
};

vi.mock('../src/pipeline', () => ({
    create: vi.fn().mockResolvedValue(mockPipelineInstance)
}));

// Mock LocatePhase
const mockLocate = vi.fn().mockResolvedValue({
    creationTime: new Date('2023-06-15T10:30:00Z'),
    outputPath: '/output/2023/06',
    contextPath: '/interim/context',
    interimPath: '/interim/session',
    transcriptionFilename: '2023-06-15-1030-abc123-transcription.md',
    hash: 'abc12345',
    audioFile: 'test-file.mp3',
});

const mockLocatePhaseInstance = {
    locate: mockLocate
};

vi.mock('../src/phases/locate', () => ({
    create: vi.fn().mockReturnValue(mockLocatePhaseInstance)
}));

// Mock Dreadcabinet to avoid actual operations
const mockProcessFn = vi.fn().mockImplementation(async (callback: (file: string) => Promise<void>) => {
    // By default, simulate processing a single file to test the callback
    await callback('test-file.mp3');
    return Promise.resolve();
});

const mockOperator = {
    process: mockProcessFn,
    constructFilename: vi.fn().mockResolvedValue('test-filename'),
    constructOutputDirectory: vi.fn().mockResolvedValue('test-output-dir')
};

const mockDreadcabinetInstance = {
    configure: vi.fn(),
    setLogger: vi.fn(),
    operate: vi.fn().mockResolvedValue(mockOperator)
};

vi.mock('@utilarium/dreadcabinet', () => ({
    create: vi.fn().mockReturnValue(mockDreadcabinetInstance),
    DEFAULT_FEATURES: ['input', 'output', 'structured-output', 'extensions']
}));

// Mock Cardigantime
const mockCardigantimeInstance = {
    configure: vi.fn(),
    validate: vi.fn()
};

vi.mock('@utilarium/cardigantime', () => ({
    create: vi.fn().mockReturnValue(mockCardigantimeInstance)
}));

// Mock glob module
const mockGlob = vi.fn().mockResolvedValue(['test-file.mp3']);
vi.mock('glob', () => ({
    glob: mockGlob
}));

// Store original process.exit
const originalExit = process.exit;
const originalConsoleInfo = console.info;

// Track console.info calls for summary testing
let consoleInfoCalls: string[][] = [];

beforeAll(() => {
    process.exit = vi.fn() as unknown as (code?: number) => never;
    console.info = vi.fn((...args: unknown[]) => {
        consoleInfoCalls.push(args.map(String));
    }) as Mock;
});

afterAll(() => {
    process.exit = originalExit;
    console.info = originalConsoleInfo;
});

// Load all dynamic imports before tests
beforeAll(async () => {
    // Import the module under test after all mocks are set up
    protokoll = await import('../src/protokoll.js');
});

describe('protokoll main', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        consoleInfoCalls = [];
        
        // Reset default mock implementations
        mockGlob.mockResolvedValue(['test-file.mp3']);
        mockProcessFn.mockImplementation(async (callback: (file: string) => Promise<void>) => {
            await callback('test-file.mp3');
        });
        mockPipelineProcess.mockResolvedValue({
            outputPath: '/output/test-transcription.md',
            sessionDir: 'test-session',
        });
        mockLocate.mockResolvedValue({
            creationTime: new Date('2023-06-15T10:30:00Z'),
            hash: 'abc12345',
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('logging configuration', () => {
        test('should set verbose log level when verbose is true', async () => {
            const verboseConfig = { ...mockConfig, verbose: true };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([verboseConfig, mockSecureConfig]);

            const loggingModule = await import('../src/logging.js');

            await protokoll.main();

            expect(loggingModule.setLogLevel).toHaveBeenCalledWith('verbose');
        });

        test('should set debug log level when debug is true', async () => {
            const debugConfig = { ...mockConfig, debug: true };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([debugConfig, mockSecureConfig]);

            const loggingModule = await import('../src/logging.js');

            await protokoll.main();

            expect(loggingModule.setLogLevel).toHaveBeenCalledWith('debug');
        });

        test('should set debug log level when both verbose and debug are true', async () => {
            const bothConfig = { ...mockConfig, verbose: true, debug: true };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([bothConfig, mockSecureConfig]);

            const loggingModule = await import('../src/logging.js');

            await protokoll.main();

            // Both should be called, debug after verbose (debug takes precedence)
            expect(loggingModule.setLogLevel).toHaveBeenCalledWith('verbose');
            expect(loggingModule.setLogLevel).toHaveBeenCalledWith('debug');
        });

        test('should not set log level when verbose and debug are false', async () => {
            const normalConfig = { ...mockConfig, verbose: false, debug: false };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([normalConfig, mockSecureConfig]);

            const loggingModule = await import('../src/logging.js');

            await protokoll.main();

            expect(loggingModule.setLogLevel).not.toHaveBeenCalled();
        });
    });

    describe('Dreadcabinet configuration', () => {
        test('should create Dreadcabinet instance with correct options', async () => {
            const dreadcabinetModule = await import('@utilarium/dreadcabinet');

            await protokoll.main();

            expect(dreadcabinetModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    defaults: expect.objectContaining({
                        timezone: 'Etc/UTC',
                        outputStructure: 'month',
                    }),
                    allowed: expect.objectContaining({
                        extensions: expect.arrayContaining(['mp3', 'wav', 'webm']),
                    }),
                })
            );
        });

        test('should call operate on Dreadcabinet with merged config', async () => {
            await protokoll.main();

            expect(mockDreadcabinetInstance.operate).toHaveBeenCalledWith(
                expect.objectContaining({
                    dryRun: false,
                    verbose: false,
                })
            );
        });

        test('should set logger on Dreadcabinet instance', async () => {
            await protokoll.main();

            expect(mockDreadcabinetInstance.setLogger).toHaveBeenCalledWith(mockLogger);
        });
    });

    describe('Pipeline configuration', () => {
        test('should create Pipeline with correct configuration', async () => {
            const pipelineModule = await import('../src/pipeline/index.js');

            await protokoll.main();

            expect(pipelineModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: 'gpt-4o',
                    transcriptionModel: 'whisper-1',
                    reasoningLevel: 'medium',
                    interactive: false,
                    selfReflection: true,
                    silent: false,
                    debug: false,
                    dryRun: false,
                    outputDirectory: 'test-output-directory',
                    outputStructure: 'month',
                })
            );
        });

        test('should create Pipeline with custom reasoning level', async () => {
            const highReasoningConfig = { ...mockConfig, reasoningLevel: 'high' as const };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([highReasoningConfig, mockSecureConfig]);

            const pipelineModule = await import('../src/pipeline/index.js');

            await protokoll.main();

            expect(pipelineModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    reasoningLevel: 'high',
                })
            );
        });

        test('should create Pipeline with processedDirectory when configured', async () => {
            const configWithProcessed = { ...mockConfig, processedDirectory: './processed' };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([configWithProcessed, mockSecureConfig]);

            const pipelineModule = await import('../src/pipeline/index.js');

            await protokoll.main();

            expect(pipelineModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    processedDirectory: './processed',
                })
            );
        });
    });

    describe('file discovery', () => {
        test('should use glob to find audio files', async () => {
            await protokoll.main();

            expect(mockGlob).toHaveBeenCalledWith(
                expect.arrayContaining(['**/*mp3', '**/*wav']),
                expect.objectContaining({
                    cwd: 'test-input-directory',
                    nodir: true,
                    absolute: true,
                })
            );
        });

        test('should log when no files are found', async () => {
            mockGlob.mockResolvedValueOnce([]);

            await protokoll.main();

            expect(mockLogger.info).toHaveBeenCalledWith(
                'No files to process in %s',
                'test-input-directory'
            );
        });

        test('should return early when no files are found', async () => {
            mockGlob.mockResolvedValueOnce([]);

            await protokoll.main();

            // Operator.process should not be called when there are no files
            expect(mockOperator.process).not.toHaveBeenCalled();
        });

        test('should log number of files found', async () => {
            mockGlob.mockResolvedValueOnce(['file1.mp3', 'file2.mp3', 'file3.mp3']);

            await protokoll.main();

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Found %d file(s) to process in %s',
                3,
                'test-input-directory'
            );
        });
    });

    describe('file processing', () => {
        test('should process files through operator', async () => {
            await protokoll.main();

            expect(mockOperator.process).toHaveBeenCalled();
        });

        test('should call locate phase for each file', async () => {
            await protokoll.main();

            expect(mockLocate).toHaveBeenCalledWith('test-file.mp3');
        });

        test('should call pipeline process with correct input', async () => {
            await protokoll.main();

            expect(mockPipelineProcess).toHaveBeenCalledWith(
                expect.objectContaining({
                    audioFile: 'test-file.mp3',
                    creation: expect.any(Date),
                    hash: 'abc12345',
                    progress: { current: 1, total: 1 },
                })
            );
        });

        test('should log progress for each file', async () => {
            mockGlob.mockResolvedValueOnce(['file1.mp3', 'file2.mp3']);
            mockProcessFn.mockImplementation(async (callback: (file: string) => Promise<void>) => {
                await callback('file1.mp3');
                await callback('file2.mp3');
            });

            await protokoll.main();

            expect(mockLogger.info).toHaveBeenCalledWith('%s Starting: %s', '[1/2]', 'file1.mp3');
            expect(mockLogger.info).toHaveBeenCalledWith('%s Starting: %s', '[2/2]', 'file2.mp3');
        });

        test('should log completion for each file', async () => {
            await protokoll.main();

            expect(mockLogger.info).toHaveBeenCalledWith(
                '%s Completed: %s -> %s',
                '[1/1]',
                'test-file.mp3',
                '/output/test-transcription.md'
            );
        });

        test('should track progress correctly for multiple files', async () => {
            mockGlob.mockResolvedValueOnce(['a.mp3', 'b.mp3', 'c.mp3']);
            
            let callOrder = 0;
            mockProcessFn.mockImplementation(async (callback: (file: string) => Promise<void>) => {
                for (const file of ['a.mp3', 'b.mp3', 'c.mp3']) {
                    callOrder++;
                    await callback(file);
                }
            });

            await protokoll.main();

            // Verify progress was passed correctly (3 files total)
            expect(mockPipelineProcess).toHaveBeenCalledTimes(3);
        });
    });

    describe('summary output', () => {
        test('should print summary when files are processed', async () => {
            mockGlob.mockResolvedValueOnce(['test-file.mp3']);

            await protokoll.main();

            // Check that summary header was printed
            const summaryLines = consoleInfoCalls.map(call => call.join(' '));
            expect(summaryLines.some(line => line.includes('TRANSCRIPTION SUMMARY'))).toBe(true);
        });

        test('should list processed file count in summary', async () => {
            mockGlob.mockResolvedValueOnce(['file1.mp3', 'file2.mp3']);
            mockProcessFn.mockImplementation(async (callback: (file: string) => Promise<void>) => {
                await callback('file1.mp3');
                await callback('file2.mp3');
            });

            await protokoll.main();

            const summaryLines = consoleInfoCalls.map(call => call.join(' '));
            expect(summaryLines.some(line => line.includes('Processed 2 file(s)'))).toBe(true);
        });

        test('should list input files in summary', async () => {
            mockGlob.mockResolvedValueOnce(['my-audio.mp3']);
            mockProcessFn.mockImplementation(async (callback: (file: string) => Promise<void>) => {
                await callback('my-audio.mp3');
            });

            await protokoll.main();

            const summaryLines = consoleInfoCalls.map(call => call.join(' '));
            expect(summaryLines.some(line => line.includes('Input Files:'))).toBe(true);
            expect(summaryLines.some(line => line.includes('my-audio.mp3'))).toBe(true);
        });

        test('should list output files in summary', async () => {
            mockGlob.mockResolvedValueOnce(['test.mp3']);
            mockPipelineProcess.mockResolvedValue({
                outputPath: '/output/2023/06/test-transcription.md',
            });

            await protokoll.main();

            const summaryLines = consoleInfoCalls.map(call => call.join(' '));
            expect(summaryLines.some(line => line.includes('Output Files:'))).toBe(true);
            expect(summaryLines.some(line => line.includes('/output/2023/06/test-transcription.md'))).toBe(true);
        });

        test('should not print summary when no files are processed', async () => {
            mockGlob.mockResolvedValueOnce([]);

            await protokoll.main();

            const summaryLines = consoleInfoCalls.map(call => call.join(' '));
            expect(summaryLines.some(line => line.includes('TRANSCRIPTION SUMMARY'))).toBe(false);
        });
    });

    describe('error handling', () => {
        test('should catch errors and log them', async () => {
            const testError = new Error('Test processing error');
            testError.stack = 'Error: Test processing error\n    at test.ts:1:1';
            mockOperator.process.mockRejectedValueOnce(testError);

            await protokoll.main();

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Exiting due to Error: %s, %s',
                'Test processing error',
                expect.stringContaining('Error: Test processing error')
            );
        });

        test('should call process.exit(1) on error', async () => {
            const testError = new Error('Fatal error');
            mockOperator.process.mockRejectedValueOnce(testError);

            await protokoll.main();

            expect(process.exit).toHaveBeenCalledWith(1);
        });

        test('should handle error in pipeline processing', async () => {
            const pipelineError = new Error('Pipeline failed');
            mockPipelineProcess.mockRejectedValueOnce(pipelineError);

            await protokoll.main();

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Exiting due to Error: %s, %s',
                'Pipeline failed',
                expect.any(String)
            );
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        test('should handle error in locate phase', async () => {
            const locateError = new Error('Could not locate file');
            mockLocate.mockRejectedValueOnce(locateError);

            await protokoll.main();

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Exiting due to Error: %s, %s',
                'Could not locate file',
                expect.any(String)
            );
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        test('should handle error in Dreadcabinet operate', async () => {
            const operateError = new Error('Dreadcabinet configuration error');
            mockDreadcabinetInstance.operate.mockRejectedValueOnce(operateError);

            await protokoll.main();

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Exiting due to Error: %s, %s',
                'Dreadcabinet configuration error',
                expect.any(String)
            );
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        test('should handle error in Pipeline creation', async () => {
            const pipelineModule = await import('../src/pipeline/index.js');
            (pipelineModule.create as Mock).mockRejectedValueOnce(new Error('Failed to create pipeline'));

            await protokoll.main();

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Exiting due to Error: %s, %s',
                'Failed to create pipeline',
                expect.any(String)
            );
            expect(process.exit).toHaveBeenCalledWith(1);
        });
    });

    describe('LocatePhase integration', () => {
        test('should create LocatePhase with config and operator', async () => {
            const locatePhaseModule = await import('../src/phases/locate.js');

            await protokoll.main();

            expect(locatePhaseModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    verbose: false,
                    debug: false,
                }),
                mockOperator
            );
        });

        test('should pass creationTime from locate to pipeline', async () => {
            const expectedDate = new Date('2024-01-15T14:30:00Z');
            mockLocate.mockResolvedValueOnce({
                creationTime: expectedDate,
                hash: 'def67890',
            });

            await protokoll.main();

            expect(mockPipelineProcess).toHaveBeenCalledWith(
                expect.objectContaining({
                    creation: expectedDate,
                })
            );
        });

        test('should pass hash from locate to pipeline', async () => {
            mockLocate.mockResolvedValueOnce({
                creationTime: new Date(),
                hash: 'uniquehash123',
            });

            await protokoll.main();

            expect(mockPipelineProcess).toHaveBeenCalledWith(
                expect.objectContaining({
                    hash: 'uniquehash123',
                })
            );
        });
    });

    describe('Cardigantime integration', () => {
        test('should create Cardigantime with correct defaults', async () => {
            const cardigantimeModule = await import('@utilarium/cardigantime');

            await protokoll.main();

            expect(cardigantimeModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    defaults: expect.objectContaining({
                        configDirectory: './.protokoll',
                    }),
                })
            );
        });
    });

    describe('default directory handling', () => {
        test('should use default input directory when not specified', async () => {
            const configNoInput = { ...mockConfig, inputDirectory: undefined };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([configNoInput, mockSecureConfig]);

            await protokoll.main();

            expect(mockGlob).toHaveBeenCalledWith(
                expect.any(Array),
                expect.objectContaining({
                    cwd: './',
                })
            );
        });

        test('should use default extensions when not specified', async () => {
            const configNoExtensions = { ...mockConfig, extensions: undefined };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([configNoExtensions, mockSecureConfig]);

            await protokoll.main();

            // Should use default extensions from constants (without dots)
            expect(mockGlob).toHaveBeenCalledWith(
                expect.arrayContaining(['**/*mp3', '**/*wav', '**/*webm']),
                expect.any(Object)
            );
        });
    });

    describe('startup message', () => {
        test('should print startup message with program name and version', async () => {
            await protokoll.main();

            const startupLines = consoleInfoCalls.map(call => call.join(' '));
            expect(startupLines.some(line => line.includes('Starting protokoll:'))).toBe(true);
        });
    });

    describe('dry run mode', () => {
        test('should pass dryRun flag to pipeline', async () => {
            const dryRunConfig = { ...mockConfig, dryRun: true };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([dryRunConfig, mockSecureConfig]);

            const pipelineModule = await import('../src/pipeline/index.js');

            await protokoll.main();

            expect(pipelineModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    dryRun: true,
                })
            );
        });
    });

    describe('interactive mode', () => {
        test('should pass interactive flag to pipeline', async () => {
            const interactiveConfig = { ...mockConfig, interactive: true };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([interactiveConfig, mockSecureConfig]);

            const pipelineModule = await import('../src/pipeline/index.js');

            await protokoll.main();

            expect(pipelineModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    interactive: true,
                })
            );
        });
    });

    describe('debug mode configuration', () => {
        test('should enable keepIntermediates when debug is true', async () => {
            const debugConfig = { ...mockConfig, debug: true };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([debugConfig, mockSecureConfig]);

            const pipelineModule = await import('../src/pipeline/index.js');

            await protokoll.main();

            expect(pipelineModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    keepIntermediates: true,
                })
            );
        });

        test('should disable keepIntermediates when debug is false', async () => {
            const normalConfig = { ...mockConfig, debug: false };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([normalConfig, mockSecureConfig]);

            const pipelineModule = await import('../src/pipeline/index.js');

            await protokoll.main();

            expect(pipelineModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    keepIntermediates: false,
                })
            );
        });
    });

    describe('fallback defaults', () => {
        test('should use default outputDirectory when not specified', async () => {
            const configNoOutputDir = { ...mockConfig, outputDirectory: undefined };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([configNoOutputDir, mockSecureConfig]);

            const pipelineModule = await import('../src/pipeline/index.js');

            await protokoll.main();

            expect(pipelineModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    outputDirectory: './',
                })
            );
        });

        test('should use default outputStructure when not specified', async () => {
            const configNoOutputStructure = { ...mockConfig, outputStructure: undefined };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([configNoOutputStructure, mockSecureConfig]);

            const pipelineModule = await import('../src/pipeline/index.js');

            await protokoll.main();

            expect(pipelineModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    outputStructure: 'month',
                })
            );
        });

        test('should use default outputFilenameOptions when not specified', async () => {
            const configNoFilenameOptions = { ...mockConfig, outputFilenameOptions: undefined };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([configNoFilenameOptions, mockSecureConfig]);

            const pipelineModule = await import('../src/pipeline/index.js');

            await protokoll.main();

            expect(pipelineModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    outputFilenameOptions: ['date', 'time', 'subject'],
                })
            );
        });

        test('should use all defaults when none are specified', async () => {
            const configNoDefaults = { 
                ...mockConfig, 
                outputDirectory: undefined, 
                outputStructure: undefined, 
                outputFilenameOptions: undefined,
                inputDirectory: undefined,
                extensions: undefined,
            };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([configNoDefaults, mockSecureConfig]);

            const pipelineModule = await import('../src/pipeline/index.js');

            await protokoll.main();

            expect(pipelineModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    outputDirectory: './',
                    outputStructure: 'month',
                    outputFilenameOptions: ['date', 'time', 'subject'],
                })
            );
        });
    });

    describe('empty string config values', () => {
        test('should use default outputDirectory when empty string', async () => {
            const configEmptyOutputDir = { ...mockConfig, outputDirectory: '' };
            const argumentsModule = await import('../src/arguments.js');
            (argumentsModule.configure as Mock).mockResolvedValueOnce([configEmptyOutputDir, mockSecureConfig]);

            const pipelineModule = await import('../src/pipeline/index.js');

            await protokoll.main();

            expect(pipelineModule.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    outputDirectory: './',
                })
            );
        });
    });

    describe('edge cases', () => {
        test('should not print summary when operator processes no files', async () => {
            // This tests the edge case where glob finds files, but operator.process
            // doesn't call the callback (e.g., all files are filtered out)
            mockGlob.mockResolvedValueOnce(['file1.mp3']);
            mockProcessFn.mockImplementation(async () => {
                // Don't call the callback - simulate all files being filtered
                return Promise.resolve();
            });

            consoleInfoCalls = [];
            await protokoll.main();

            const summaryLines = consoleInfoCalls.map(call => call.join(' '));
            // Summary should NOT be printed when no files were actually processed
            expect(summaryLines.some(line => line.includes('TRANSCRIPTION SUMMARY'))).toBe(false);
        });

        test('should handle single file in different extension formats', async () => {
            mockGlob.mockResolvedValueOnce(['/path/to/recording.m4a']);
            mockProcessFn.mockImplementation(async (callback: (file: string) => Promise<void>) => {
                await callback('/path/to/recording.m4a');
            });
            mockPipelineProcess.mockResolvedValue({
                outputPath: '/output/recording-transcription.md',
            });

            await protokoll.main();

            expect(mockLocate).toHaveBeenCalledWith('/path/to/recording.m4a');
            expect(mockPipelineProcess).toHaveBeenCalledWith(
                expect.objectContaining({
                    audioFile: '/path/to/recording.m4a',
                })
            );
        });
    });
});
