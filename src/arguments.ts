import * as Dreadcabinet from "@theunwalked/dreadcabinet";
import * as Cardigantime from '@theunwalked/cardigantime';
import { Command } from "commander";
import {
    PROTOKOLL_DEFAULTS,
    DEFAULT_MAX_AUDIO_SIZE,
    PROGRAM_NAME,
    VERSION
} from "@/constants";
import { Args, Config, SecureConfig } from "@/protokoll";
import { getLogger } from "@/logging";
import * as Storage from "@/util/storage";

export const configure = async (dreadcabinet: Dreadcabinet.DreadCabinet, cardigantime: Cardigantime.Cardigantime<any>): Promise<[Config, SecureConfig]> => {
    const logger = getLogger();

    let program = new Command();
    program
        .name(PROGRAM_NAME)
        .summary('Intelligent audio transcription tool with context')
        .description('Protokoll transcribes audio files intelligently using context to improve accuracy')
        .option('--dry-run', 'perform a dry run without saving files')
        .option('--verbose', 'enable verbose logging')
        .option('--debug', 'enable debug logging')
        .option('--openai-api-key <openaiApiKey>', 'OpenAI API key')
        .option('--transcription-model <transcriptionModel>', 'OpenAI transcription model to use')
        .option('--model <model>', 'OpenAI model to use for transcription enhancement')
        .option('--overrides', 'allow overrides of the default configuration')
        .option('--context-directories [contextDirectories...]', 'directories containing context files to be included in prompts')
        .option('--max-audio-size <maxAudioSize>', 'maximum audio file size in bytes')
        .option('--temp-directory <tempDirectory>', 'temporary directory for processing files')
        .option('--interactive', 'enable interactive mode for clarification questions')
        .option('--self-reflection', 'generate self-reflection reports (default: true)')
        .option('--no-self-reflection', 'disable self-reflection reports')
        .option('--processed-directory <processedDirectory>', 'directory to move processed audio files to')

    await dreadcabinet.configure(program);
    program = await cardigantime.configure(program);
    program.version(VERSION);

    // Check if --check-config is in process.argv early
    if (process.argv.includes('--check-config')) {
        program.parse();
        const cliArgs: Args = program.opts<Args>();

        // Use CardiganTime's built-in checkConfig method
        await cardigantime.checkConfig(cliArgs);

        // Return minimal config for consistency, but main processing is done
        const config: Config = PROTOKOLL_DEFAULTS as Config;
        const secureConfig: SecureConfig = { openaiApiKey: process.env.OPENAI_API_KEY };
        return [config, secureConfig];
    }

    // Check if --init-config is in process.argv early
    if (process.argv.includes('--init-config')) {
        program.parse();
        const cliArgs: Args = program.opts<Args>();

        // Use CardiganTime's built-in generateConfig method
        await cardigantime.generateConfig(cliArgs.configDirectory || PROTOKOLL_DEFAULTS.configDirectory);

        // Return minimal config for consistency, but main processing is done
        const config: Config = PROTOKOLL_DEFAULTS as Config;
        const secureConfig: SecureConfig = { openaiApiKey: process.env.OPENAI_API_KEY };
        return [config, secureConfig];
    }

    program.parse();

    const cliArgs: Args = program.opts<Args>();
    logger.debug('Command Line Options: %s', JSON.stringify(cliArgs, null, 2));

    // Get values from config file first using CardiganTime's hierarchical configuration
    const fileValues = await cardigantime.read(cliArgs);

    // Read the Raw values from the Dreadcabinet Command Line Arguments
    const dreadcabinetValues = await dreadcabinet.read(cliArgs);

    // Extract protokoll-specific CLI args (only include if explicitly set)
    const protokollCliArgs: Partial<Config> = {};
    if (cliArgs.interactive !== undefined) protokollCliArgs.interactive = cliArgs.interactive;
    if (cliArgs.selfReflection !== undefined) protokollCliArgs.selfReflection = cliArgs.selfReflection;
    if (cliArgs.debug !== undefined) protokollCliArgs.debug = cliArgs.debug;
    if (cliArgs.verbose !== undefined) protokollCliArgs.verbose = cliArgs.verbose;
    if (cliArgs.dryRun !== undefined) protokollCliArgs.dryRun = cliArgs.dryRun;
    if (cliArgs.model !== undefined) protokollCliArgs.model = cliArgs.model;
    if (cliArgs.transcriptionModel !== undefined) protokollCliArgs.transcriptionModel = cliArgs.transcriptionModel;
    if (cliArgs.overrides !== undefined) protokollCliArgs.overrides = cliArgs.overrides;
    if (cliArgs.contextDirectories !== undefined) protokollCliArgs.contextDirectories = cliArgs.contextDirectories;
    if (cliArgs.maxAudioSize !== undefined) {
        protokollCliArgs.maxAudioSize = typeof cliArgs.maxAudioSize === 'string' 
            ? parseInt(cliArgs.maxAudioSize, 10) 
            : cliArgs.maxAudioSize;
    }
    if (cliArgs.tempDirectory !== undefined) protokollCliArgs.tempDirectory = cliArgs.tempDirectory;
    if (cliArgs.processedDirectory !== undefined) protokollCliArgs.processedDirectory = cliArgs.processedDirectory;

    // Merge configurations: Defaults -> File -> Dreadcabinet CLI -> Protokoll CLI (highest precedence)
    let mergedConfig: Partial<Config> = {
        ...PROTOKOLL_DEFAULTS,    // Start with Protokoll defaults
        ...fileValues,            // Apply file values (overwrites defaults)
        ...dreadcabinetValues,    // Apply dreadcabinet CLI args
        ...protokollCliArgs,      // Apply protokoll-specific CLI args last (highest precedence)
    } as Partial<Config>;

    const secureConfig: SecureConfig = {
        ...(process.env.OPENAI_API_KEY !== undefined && { openaiApiKey: process.env.OPENAI_API_KEY }), // Apply Env vars
    } as SecureConfig;

    // Convert maxAudioSize if it's a string AFTER merging
    if (typeof mergedConfig.maxAudioSize === 'string') {
        const parsedSize = parseInt(mergedConfig.maxAudioSize, 10);
        if (!isNaN(parsedSize)) {
            mergedConfig.maxAudioSize = parsedSize;
        } else {
            logger.warn(`Invalid maxAudioSize value detected after merge: '${mergedConfig.maxAudioSize}', using default: ${DEFAULT_MAX_AUDIO_SIZE}`);
            mergedConfig.maxAudioSize = DEFAULT_MAX_AUDIO_SIZE; // Use Protokoll default if parsing fails
        }
    } else if (mergedConfig.maxAudioSize === undefined) {
        // If still undefined after all merges, apply Protokoll default
        mergedConfig.maxAudioSize = DEFAULT_MAX_AUDIO_SIZE;
    }

    // Apply Dreadcabinet defaults
    mergedConfig = dreadcabinet.applyDefaults(mergedConfig) as Partial<Config>;

    const config = mergedConfig as Config;

    // Validate Dreadcabinet final config
    dreadcabinet.validate(config);

    // Validate Protokoll final config
    await validateConfig(config);
    await validateSecureConfig(secureConfig);

    logger.debug('Final configuration: %s', JSON.stringify(config, null, 2));
    return [config, secureConfig];
}

async function validateSecureConfig(config: SecureConfig): Promise<void> {
    const logger = getLogger();
    if (!config.openaiApiKey) {
        config.openaiApiKey = process.env.OPENAI_API_KEY;

        if (!config.openaiApiKey) {
            throw new Error('OpenAI API key is required. Provide it via CLI (--openai-api-key), config file, or OPENAI_API_KEY environment variable.');
        }
        logger.debug("Using OpenAI API key from environment variable.");
    }
}

async function validateConfig(config: Config): Promise<void> {
    const logger = getLogger();

    // Validate that models are provided (but don't restrict to specific allowlist)
    validateModelPresence(config.model, true, 'model');
    validateModelPresence(config.transcriptionModel, true, 'transcriptionModel');

    if (config.contextDirectories && config.contextDirectories.length > 0) {
        await validateContextDirectories(config.contextDirectories);
    } else {
        logger.debug("No context directories provided.");
        config.contextDirectories = [];
    }

    if (config.tempDirectory) {
        await validateTempDirectory(config.tempDirectory);
    } else {
        throw new Error('Temp directory is required.');
    }

    if (typeof config.maxAudioSize !== 'number' || config.maxAudioSize <= 0) {
        throw new Error(`Invalid maxAudioSize: ${config.maxAudioSize}. Must be a positive number.`);
    }

    logger.debug("Final configuration validated successfully.");
}

function validateModelPresence(model: string | undefined, required: boolean, modelOptionName: string) {
    const logger = getLogger();
    logger.debug(`Validating model presence for ${modelOptionName}: ${model} (Required: ${required})`);
    if (required && !model) {
        throw new Error(`Model for ${modelOptionName} is required`);
    }

    if (model && model.trim() === '') {
        throw new Error(`Model for ${modelOptionName} cannot be empty`);
    }

    // Note: We no longer validate against a static allowlist
    // The actual model validation will happen when the API call is made
    // This allows for dynamic model discovery and future model additions
}

async function validateContextDirectories(contextDirectories: string[]) {
    const logger = getLogger();
    logger.debug(`Validating context directories: ${contextDirectories.join(', ')}`);
    const storage = Storage.create({ log: logger.info.bind(logger) });
    for (const directory of contextDirectories) {
        if (!await storage.isDirectoryReadable(directory)) {
            throw new Error(`Context directory does not exist or is not readable: ${directory}`);
        }
    }
}



async function validateTempDirectory(tempDirectory: string) {
    const logger = getLogger();
    logger.debug(`Validating temp directory: ${tempDirectory}`);
    const storage = Storage.create({ log: logger.info.bind(logger) });
    if (!await storage.isDirectoryWritable(tempDirectory)) {
        throw new Error(`Temp directory does not exist or is not writable: ${tempDirectory}`);
    }
}
