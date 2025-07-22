import { describe, expect, beforeAll, beforeEach, afterAll, test, vi } from 'vitest';

// Variables to hold dynamically imported modules
let matnava: { main: () => Promise<void> };

// Define a simplified mock config 
const mockConfig = {
    dryRun: false,
    verbose: false,
    debug: false,
    diff: false,
    log: false,
    model: 'gpt-4o',
    transcriptionModel: 'whisper-1',
    contentTypes: ['diff', 'log'],
    configDir: 'test-config-dir',
    overrides: false,
    classifyModel: 'gpt-4o-mini',
    composeModel: 'o1-mini',
    timezone: 'America/New_York',
    outputStructure: 'month',
    filenameOptions: { date: true, time: true },
    inputDirectory: 'test-input-directory',
    outputDirectory: 'test-output-directory',
    recursive: false,
    audioExtensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']
};

// Mock dependencies to prevent the test from running actual operations
vi.mock('../src/arguments', () => ({
    // @ts-ignore - ignore TypeScript errors for vitest mocks
    configure: vi.fn().mockResolvedValue([mockConfig])
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

// Mock Processor to prevent actual processing
const mockProcessorProcess = vi.fn();
mockProcessorProcess.mockImplementation(() => Promise.resolve());

vi.mock('../src/processor', () => ({
    // @ts-ignore - ignore TypeScript errors for vitest mocks
    create: vi.fn().mockReturnValue({
        process: mockProcessorProcess
    })
}));

// Mock Dreadcabinet to avoid actual operations
const mockProcessFn = vi.fn().mockImplementation(async (callback: any) => {
    // Simulate processing a single file to test the callback
    await callback('test-file.mp3');
    return Promise.resolve();
});

const mockOperator = {
    process: mockProcessFn,
    // @ts-ignore - ignore TypeScript errors for vitest mocks
    constructFilename: vi.fn().mockResolvedValue('test-filename'),
    // @ts-ignore - ignore TypeScript errors for vitest mocks
    constructOutputDirectory: vi.fn().mockResolvedValue('test-output-dir')
};

const mockDreadcabinetInstance = {
    configure: vi.fn(),
    setLogger: vi.fn(),
    // @ts-ignore - ignore TypeScript errors for vitest mocks
    operate: vi.fn().mockResolvedValue(mockOperator)
};

const mockDreadcabinetOptions = {
    defaults: {
        timezone: 'America/New_York',
        outputStructure: 'month',
        filenameOptions: { date: true, time: true },
        inputDirectory: 'test-input-directory',
        outputDirectory: 'test-output-directory',
    },
    allowed: {
        outputStructures: ['month'],
        filenameOptions: ['date', 'time'],
        extensions: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']
    },
    features: ['input', 'output', 'structured-output', 'extensions'],
};

const mockCardigantimeInstance = {
    configure: vi.fn(),
    validate: vi.fn()
};

const mockCardigantimeOptions = {
    defaults: {
        configDir: 'test-config-dir'
    },
    configShape: {
        ...mockConfig,
        ...mockDreadcabinetOptions
    },

    features: ['config']
};

vi.mock('@theunwalked/cardigantime', () => ({
    createOptions: vi.fn().mockReturnValue(mockCardigantimeOptions),
    create: vi.fn().mockReturnValue(mockCardigantimeInstance)
}));

// Mock process.exit to prevent tests from actually exiting
const originalExit = process.exit;
beforeAll(() => {
    process.exit = vi.fn() as any;
});

afterAll(() => {
    process.exit = originalExit;
});

// Load all dynamic imports before tests
beforeAll(async () => {
    // Import the module under test after all mocks are set up
    matnava = await import('../src/matnava.js');
});

describe('main', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('should set verbose log level when verbose is true', async () => {
        // Create a config with verbose set to true
        const verboseConfig = {
            ...mockConfig,
            verbose: true
        };

        // Mock Arguments.configure to return config with verbose set to true
        const argumentsModule = await import('../src/arguments.js');
        // @ts-ignore - ignore TypeScript errors for vitest mocks
        (argumentsModule.configure as any).mockResolvedValueOnce([verboseConfig]);

        const loggingModule = await import('../src/logging.js');

        await matnava.main();

        // Verify setLogLevel was called with 'verbose'
        expect(loggingModule.setLogLevel).toHaveBeenCalledWith('verbose');
    });

    test('should set debug log level when debug is true', async () => {
        // Create a config with debug set to true
        const debugConfig = {
            ...mockConfig,
            debug: true
        };

        // Mock Arguments.configure to return config with debug set to true
        const argumentsModule = await import('../src/arguments.js');
        // @ts-ignore - ignore TypeScript errors for vitest mocks
        (argumentsModule.configure as any).mockResolvedValueOnce([debugConfig]);

        const loggingModule = await import('../src/logging.js');

        await matnava.main();

        // Verify setLogLevel was called with 'debug'
        expect(loggingModule.setLogLevel).toHaveBeenCalledWith('debug');
    });
});
