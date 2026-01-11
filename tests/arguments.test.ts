import { describe, expect, beforeAll, beforeEach, afterEach, test, vi } from 'vitest';
import { ArgumentError } from '../src/error/ArgumentError';

// Import modules asynchronously using dynamic imports to support ESM
let mockDreadcabinet: any;
let configure: any;

// Mock dependencies
vi.mock('../src/main', () => ({
    createConfig: vi.fn(() => ({ verbose: false, dryRun: false, diff: true }))
}));

// Mock Storage utility
const mockIsDirectoryReadable = vi.fn(() => true);
const mockIsDirectoryWritable = vi.fn(() => true);

vi.mock('../src/util/storage', () => ({
    create: vi.fn(() => ({
        isDirectoryReadable: mockIsDirectoryReadable,
        isDirectoryWritable: mockIsDirectoryWritable
    }))
}));

// Mock the Dates utility
vi.mock('../src/util/dates', () => ({
    validTimezones: vi.fn(() => ['Etc/UTC', 'America/New_York', 'Europe/London'])
}));

// Default commander mock
const defaultCommanderMock = {
    name: vi.fn().mockReturnThis(),
    summary: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    parse: vi.fn(),
    opts: vi.fn().mockReturnValue({
        dryRun: false,
        verbose: false,
        debug: false,
        openaiApiKey: 'test-api-key',
        timezone: 'America/New_York',
        transcriptionModel: 'test-transcription-model',
        model: 'gpt-4o',
        contentTypes: ['diff', 'log'],
        recursive: false,
        inputDirectory: 'test-input-directory',
        outputDirectory: 'test-output-directory',
        audioExtensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
        configDirectory: 'test-config-dir',
        overrides: false,
        classifyModel: 'gpt-4o-mini',
        composeModel: 'o1-mini',
    })
};

// Mock the Command class
class MockCommand {
    name = vi.fn().mockReturnThis();
    summary = vi.fn().mockReturnThis();
    description = vi.fn().mockReturnThis();
    option = vi.fn().mockReturnThis();
    version = vi.fn().mockReturnThis();
    parse = vi.fn();
    opts = vi.fn().mockReturnValue(defaultCommanderMock.opts());
    
    constructor() {
        Object.assign(this, defaultCommanderMock);
    }
}

vi.mock('commander', () => ({
    Command: MockCommand
}));

// Mock Dreadcabinet
const mockDreadcabinetInstance = {
    configure: vi.fn().mockReturnValue(defaultCommanderMock),
    read: vi.fn().mockImplementation((args: any) => args),
    applyDefaults: vi.fn().mockImplementation((config: any) => config),
    // @ts-ignore
    validate: vi.fn().mockResolvedValue({
        timezone: 'America/New_York',
        outputStructure: 'month',
        filenameOptions: {
            date: true,
            time: true
        },
        inputDirectory: 'test-input-directory',
        outputDirectory: 'test-output-directory',
        recursive: false,
        audioExtensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']
    } as any),
};

// Mock Cardigantime
const mockCardigantimeInstance = {
    configure: vi.fn().mockReturnValue(defaultCommanderMock),
    // @ts-ignore
    validate: vi.fn().mockResolvedValue({
        configDirectory: 'test-config-dir'
    } as any),
    // @ts-ignore
    read: vi.fn().mockResolvedValue({
        configDirectory: 'test-config-dir'
    } as any)
};

// Load all dynamic imports before tests
beforeAll(async () => {
    const argumentsModule = await import('../src/arguments.js');
    configure = argumentsModule.configure;
});

describe('arguments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-api-key';
        mockIsDirectoryReadable.mockReturnValue(true);

        // Reset the mock commander opts value
        defaultCommanderMock.opts.mockReturnValue({
            dryRun: false,
            verbose: false,
            debug: false,
            openaiApiKey: 'test-api-key',
            timezone: 'America/New_York',
            transcriptionModel: 'whisper-1',
            model: 'gpt-4o',
            contentTypes: ['diff', 'log'],
            recursive: false,
            inputDirectory: 'test-input-directory',
            outputDirectory: 'test-output-directory',
            audioExtensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
            configDirectory: 'test-config-dir',
            overrides: false,
            classifyModel: 'gpt-4o-mini',
            composeModel: 'o1-mini',
        });
    });

    afterEach(() => {
        delete process.env.OPENAI_API_KEY;
    });

    describe('configure', () => {

        test('should throw error when OpenAI API key is missing', async () => {
            // Delete the API key from env
            delete process.env.OPENAI_API_KEY;

            // Also remove it from the commander opts
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: false,
                debug: false,
                // No openaiApiKey
                timezone: 'America/New_York',
                transcriptionModel: 'whisper-1',
                model: 'gpt-4o',
                contentTypes: ['diff', 'log'],
                recursive: false,
                inputDirectory: 'test-input-directory',
                outputDirectory: 'test-output-directory',
                audioExtensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
                configDirectory: 'test-config-dir',
                overrides: false,
                classifyModel: 'gpt-4o-mini',
                composeModel: 'o1-mini',
            });

            await expect(configure(mockDreadcabinetInstance, mockCardigantimeInstance)).rejects.toThrow('OpenAI API key is required');
        });

        test('should use default config directory when not provided', async () => {
            // Remove configDir from options
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: false,
                debug: false,
                openaiApiKey: 'test-api-key',
                timezone: 'America/New_York',
                transcriptionModel: 'whisper-1',
                model: 'gpt-4o',
                contentTypes: ['diff', 'log'],
                recursive: false,
                inputDirectory: 'test-input-directory',
                outputDirectory: 'test-output-directory',
                audioExtensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
                overrides: false,
                classifyModel: 'gpt-4o-mini',
                composeModel: 'o1-mini',
                // configDir is missing
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            // Config should contain the default config directory
            expect(config.configDirectory).toBeDefined();
        });

        test('should use default transcription model when not provided', async () => {
            // Remove transcriptionModel from options
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: false,
                debug: false,
                openaiApiKey: 'test-api-key',
                timezone: 'America/New_York',
                model: 'gpt-4o',
                contentTypes: ['diff', 'log'],
                recursive: false,
                inputDirectory: 'test-input-directory',
                outputDirectory: 'test-output-directory',
                audioExtensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
                configDirectory: 'test-config-dir',
                overrides: false,
                classifyModel: 'gpt-4o-mini',
                composeModel: 'o1-mini',
                // transcriptionModel is missing
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            // Config should contain the default transcription model
            expect(config.transcriptionModel).toBeDefined();
        });

        test('should throw error for invalid context directories', async () => {
            // Set contextDirectories with an invalid directory
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: false,
                debug: false,
                openaiApiKey: 'test-api-key',
                timezone: 'America/New_York',
                transcriptionModel: 'whisper-1',
                model: 'gpt-4o',
                contentTypes: ['diff', 'log'],
                recursive: false,
                inputDirectory: 'test-input-directory',
                outputDirectory: 'test-output-directory',
                audioExtensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
                configDirectory: 'test-config-dir',
                overrides: false,
                classifyModel: 'gpt-4o-mini',
                composeModel: 'o1-mini',
                contextDirectories: ['invalid-dir']
            });

            // Mock the directory check to return false for the invalid directory
            // @ts-ignore
            mockIsDirectoryReadable.mockImplementation((directory: string) => {
                return directory !== 'invalid-dir';
            });

            await expect(configure(mockDreadcabinetInstance, mockCardigantimeInstance)).rejects.toThrow('Context directory does not exist or is not readable');
        });

        test('should use default values for optional parameters', async () => {
            // Remove optional parameters
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: false,
                debug: false,
                openaiApiKey: 'test-api-key',
                timezone: 'America/New_York',
                model: 'gpt-4o',
                contentTypes: ['diff', 'log'],
                recursive: false,
                inputDirectory: 'test-input-directory',
                outputDirectory: 'test-output-directory',
                audioExtensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
                // Following optional parameters are missing
                // configDir
                // overrides
                // classifyModel 
                // composeModel
                // transcriptionModel
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);

            // Config should contain default values for missing parameters
            expect(config.configDirectory).toBeDefined();
            expect(config.overrides).toBeDefined();
            expect(config.transcriptionModel).toBeDefined();
        });
    });
});  
