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
    } as any),
    checkConfig: vi.fn().mockResolvedValue(undefined),
    generateConfig: vi.fn().mockResolvedValue(undefined),
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
        mockIsDirectoryWritable.mockReturnValue(true);

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
            tempDirectory: '/tmp',
            maxAudioSize: 26214400,
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
                tempDirectory: '/tmp',
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
                tempDirectory: '/tmp',
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
                tempDirectory: '/tmp',
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
                contextDirectories: ['invalid-dir'],
                tempDirectory: '/tmp',
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
                tempDirectory: '/tmp',
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

        test('should handle maxAudioSize as string and convert to number', async () => {
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
                tempDirectory: '/tmp',
                maxAudioSize: '52428800', // 50MB as string
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);

            expect(typeof config.maxAudioSize).toBe('number');
            expect(config.maxAudioSize).toBe(52428800);
        });

        test('should handle invalid maxAudioSize gracefully', async () => {
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
                tempDirectory: '/tmp',
                maxAudioSize: 'invalid-size', // Invalid string
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);

            expect(typeof config.maxAudioSize).toBe('number');
            // Should use default when invalid
        });

        test('should throw error when temp directory is not writable', async () => {
            mockIsDirectoryWritable.mockReturnValue(false);
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
                tempDirectory: '/readonly/tmp',
            });

            await expect(configure(mockDreadcabinetInstance, mockCardigantimeInstance)).rejects.toThrow('Temp directory does not exist or is not writable');
        });

        test('should throw error when maxAudioSize is invalid', async () => {
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
                tempDirectory: '/tmp',
                maxAudioSize: -1, // Negative number
            });

            await expect(configure(mockDreadcabinetInstance, mockCardigantimeInstance)).rejects.toThrow('Invalid maxAudioSize');
        });

        test('should handle --check-config flag', async () => {
            process.argv.push('--check-config');
            
            try {
                const [config, secureConfig] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
                expect(config).toBeDefined();
                expect(secureConfig).toBeDefined();
                expect(mockCardigantimeInstance.checkConfig).toHaveBeenCalled();
            } finally {
                process.argv = process.argv.filter(arg => arg !== '--check-config');
            }
        });

        test('should handle --init-config flag', async () => {
            process.argv.push('--init-config');
            
            try {
                const [config, secureConfig] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
                expect(config).toBeDefined();
                expect(secureConfig).toBeDefined();
                expect(mockCardigantimeInstance.generateConfig).toHaveBeenCalled();
            } finally {
                process.argv = process.argv.filter(arg => arg !== '--init-config');
            }
        });

        test('should handle interactive flag', async () => {
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
                tempDirectory: '/tmp',
                interactive: true,
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            expect(config.interactive).toBe(true);
        });

        test('should handle selfReflection flag', async () => {
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
                tempDirectory: '/tmp',
                selfReflection: false,
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            expect(config.selfReflection).toBe(false);
        });

        test('should handle processedDirectory option', async () => {
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
                tempDirectory: '/tmp',
                processedDirectory: '/processed',
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            expect(config.processedDirectory).toBe('/processed');
        });

        test('should throw error for empty model name', async () => {
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: false,
                debug: false,
                openaiApiKey: 'test-api-key',
                timezone: 'America/New_York',
                transcriptionModel: 'whisper-1',
                model: '   ', // Empty/whitespace model
                contentTypes: ['diff', 'log'],
                recursive: false,
                inputDirectory: 'test-input-directory',
                outputDirectory: 'test-output-directory',
                audioExtensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
                configDirectory: 'test-config-dir',
                overrides: false,
                classifyModel: 'gpt-4o-mini',
                composeModel: 'o1-mini',
                tempDirectory: '/tmp',
            });

            await expect(configure(mockDreadcabinetInstance, mockCardigantimeInstance)).rejects.toThrow('Model for model cannot be empty');
        });

        test('should successfully configure with all options', async () => {
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
                tempDirectory: '/tmp',
                maxAudioSize: 26214400,
            });

            const [config, secureConfig] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            
            expect(config).toBeDefined();
            expect(config.model).toBe('gpt-4o');
            expect(config.transcriptionModel).toBe('whisper-1');
            expect(secureConfig.openaiApiKey).toBe('test-api-key');
        });

        test('should use default model when model is not provided in CLI', async () => {
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: false,
                debug: false,
                openaiApiKey: 'test-api-key',
                timezone: 'America/New_York',
                transcriptionModel: 'whisper-1',
                // model is missing - should use default
                contentTypes: ['diff', 'log'],
                recursive: false,
                inputDirectory: 'test-input-directory',
                outputDirectory: 'test-output-directory',
                audioExtensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
                configDirectory: 'test-config-dir',
                overrides: false,
                classifyModel: 'gpt-4o-mini',
                composeModel: 'o1-mini',
                tempDirectory: '/tmp',
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            // Should use default model from PROTOKOLL_DEFAULTS
            expect(config.model).toBeDefined();
        });

        test('should use default tempDirectory when not provided in CLI', async () => {
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
                // tempDirectory is missing - should use system default
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            // Should use default temp directory from system
            expect(config.tempDirectory).toBeDefined();
        });

        test('should use API key from environment when not in secure config', async () => {
            // Set up environment with API key
            process.env.OPENAI_API_KEY = 'env-api-key';
            
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: false,
                debug: false,
                // No openaiApiKey in options - should use env
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
                tempDirectory: '/tmp',
            });

            const [config, secureConfig] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            
            expect(secureConfig.openaiApiKey).toBe('env-api-key');
        });

        test('should handle maxAudioSize as number from CLI', async () => {
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
                tempDirectory: '/tmp',
                maxAudioSize: 104857600, // 100MB as number
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);

            expect(typeof config.maxAudioSize).toBe('number');
            expect(config.maxAudioSize).toBe(104857600);
        });

        test('should throw error for empty transcription model name', async () => {
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: false,
                debug: false,
                openaiApiKey: 'test-api-key',
                timezone: 'America/New_York',
                transcriptionModel: '   ', // Empty/whitespace
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
                tempDirectory: '/tmp',
            });

            await expect(configure(mockDreadcabinetInstance, mockCardigantimeInstance)).rejects.toThrow('Model for transcriptionModel cannot be empty');
        });

        test('should handle valid context directories', async () => {
            mockIsDirectoryReadable.mockReturnValue(true);
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
                tempDirectory: '/tmp',
                contextDirectories: ['/valid/context/dir'],
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            
            expect(config.contextDirectories).toContain('/valid/context/dir');
        });

        test('should handle debug flag', async () => {
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: false,
                debug: true,
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
                tempDirectory: '/tmp',
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            expect(config.debug).toBe(true);
        });

        test('should handle verbose flag', async () => {
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: true,
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
                tempDirectory: '/tmp',
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            expect(config.verbose).toBe(true);
        });

        test('should handle dryRun flag', async () => {
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: true,
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
                tempDirectory: '/tmp',
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            expect(config.dryRun).toBe(true);
        });

        test('should handle overrides flag', async () => {
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
                overrides: true,
                classifyModel: 'gpt-4o-mini',
                composeModel: 'o1-mini',
                tempDirectory: '/tmp',
            });

            const [config] = await configure(mockDreadcabinetInstance, mockCardigantimeInstance);
            expect(config.overrides).toBe(true);
        });

        test('should throw error when temp directory is missing', async () => {
            // Mock so tempDirectory is undefined
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
                tempDirectory: undefined,
            });

            // Override defaults to not provide tempDirectory
            mockDreadcabinetInstance.applyDefaults.mockImplementationOnce((config: any) => {
                delete config.tempDirectory;
                return config;
            });

            await expect(configure(mockDreadcabinetInstance, mockCardigantimeInstance)).rejects.toThrow('Temp directory is required');
        });

        test('should throw error when model is not provided and required', async () => {
            // Mock so model is undefined
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: false,
                debug: false,
                openaiApiKey: 'test-api-key',
                timezone: 'America/New_York',
                transcriptionModel: 'whisper-1',
                // model is missing
                contentTypes: ['diff', 'log'],
                recursive: false,
                inputDirectory: 'test-input-directory',
                outputDirectory: 'test-output-directory',
                audioExtensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
                configDirectory: 'test-config-dir',
                overrides: false,
                classifyModel: 'gpt-4o-mini',
                composeModel: 'o1-mini',
                tempDirectory: '/tmp',
            });

            // Override defaults to not provide model
            mockDreadcabinetInstance.applyDefaults.mockImplementationOnce((config: any) => {
                delete config.model;
                return config;
            });

            await expect(configure(mockDreadcabinetInstance, mockCardigantimeInstance)).rejects.toThrow('Model for model is required');
        });

        test('should throw error when transcription model is not provided and required', async () => {
            // Mock so transcriptionModel is undefined
            defaultCommanderMock.opts.mockReturnValue({
                dryRun: false,
                verbose: false,
                debug: false,
                openaiApiKey: 'test-api-key',
                timezone: 'America/New_York',
                // transcriptionModel is missing
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
                tempDirectory: '/tmp',
            });

            // Override defaults to not provide transcriptionModel
            mockDreadcabinetInstance.applyDefaults.mockImplementationOnce((config: any) => {
                delete config.transcriptionModel;
                return config;
            });

            await expect(configure(mockDreadcabinetInstance, mockCardigantimeInstance)).rejects.toThrow('Model for transcriptionModel is required');
        });
    });
});  
