#!/usr/bin/env node
import 'dotenv/config';
import * as Arguments from '@/arguments';
import { ALLOWED_AUDIO_EXTENSIONS, ALLOWED_OUTPUT_FILENAME_OPTIONS, ALLOWED_OUTPUT_STRUCTURES, DEFAULT_AUDIO_EXTENSIONS, DEFAULT_OUTPUT_FILENAME_OPTIONS, DEFAULT_INPUT_DIRECTORY, DEFAULT_OUTPUT_DIRECTORY, DEFAULT_OUTPUT_STRUCTURE, DEFAULT_TIMEZONE, PROGRAM_NAME, VERSION, DEFAULT_CONFIG_DIR, DEFAULT_INTERMEDIATE_DIRECTORY } from '@/constants';
import { getLogger, setLogLevel } from '@/logging';
import * as Pipeline from './pipeline';
import * as LocatePhase from './phases/locate';
import * as Dreadcabinet from '@theunwalked/dreadcabinet';
import * as Cardigantime from '@theunwalked/cardigantime';
import { z } from 'zod';

export interface Args extends Dreadcabinet.Args, Cardigantime.Args {
    dryRun?: boolean;
    verbose?: boolean;
    debug?: boolean;
    transcriptionModel?: string;
    model?: string;
    openaiApiKey?: string;
    overrides?: boolean;
    contextDirectories?: string[];
    maxAudioSize?: number | string;
    tempDirectory?: string;
    interactive?: boolean;
    selfReflection?: boolean;
}

export const ConfigSchema = z.object({
    dryRun: z.boolean(),
    verbose: z.boolean(),
    debug: z.boolean(),
    diff: z.boolean(),
    log: z.boolean(),
    model: z.string(),
    transcriptionModel: z.string(),
    contentTypes: z.array(z.string()),
    overrides: z.boolean(),
    contextDirectories: z.array(z.string()).optional(),
    maxAudioSize: z.number(),
    tempDirectory: z.string(),
    interactive: z.boolean(),
    selfReflection: z.boolean(),
});

export const SecureConfigSchema = z.object({
    openaiApiKey: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema> & Dreadcabinet.Config & Cardigantime.Config;
export type SecureConfig = z.infer<typeof SecureConfigSchema>;

export async function main() {

    // eslint-disable-next-line no-console
    console.info(`Starting ${PROGRAM_NAME}: ${VERSION}`);

    const dreadcabinetOptions = {
        defaults: {
            timezone: DEFAULT_TIMEZONE,
            extensions: DEFAULT_AUDIO_EXTENSIONS,
            outputStructure: DEFAULT_OUTPUT_STRUCTURE,
            outputFilenameOptions: DEFAULT_OUTPUT_FILENAME_OPTIONS,
            inputDirectory: DEFAULT_INPUT_DIRECTORY,
            outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
        },
        allowed: {
            extensions: ALLOWED_AUDIO_EXTENSIONS,
            outputStructures: ALLOWED_OUTPUT_STRUCTURES,
            outputFilenameOptions: ALLOWED_OUTPUT_FILENAME_OPTIONS,
        },
        features: Dreadcabinet.DEFAULT_FEATURES,
        addDefaults: false,
    };

    const dreadcabinet = Dreadcabinet.create(dreadcabinetOptions);

    const cardigantime = Cardigantime.create({
        defaults: {
            configDirectory: DEFAULT_CONFIG_DIR,
        },
        configShape: ConfigSchema.shape,
    });

    const [config, secureConfig]: [Config, SecureConfig] = await Arguments.configure(dreadcabinet, cardigantime);

    // Set log level based on verbose flag
    if (config.verbose === true) {
        setLogLevel('verbose');
    }
    if (config.debug === true) {
        setLogLevel('debug');
    }

    const logger = getLogger();
    dreadcabinet.setLogger(logger);

    try {

        const operator: Dreadcabinet.Operator = await dreadcabinet.operate({
            ...config,
            ...secureConfig,
        });
        
        // Use the locate phase for file discovery and hash generation
        const locatePhase = LocatePhase.create(config, operator);
        
        // Create the intelligent transcription pipeline
        // This wires together ALL modules: context, routing, transcription,
        // reasoning, agentic tools, interactive, output, and reflection
        const pipeline = await Pipeline.create({
            model: config.model,
            transcriptionModel: config.transcriptionModel,
            interactive: config.interactive,
            selfReflection: config.selfReflection,
            debug: config.debug,
            contextDirectory: config.configDirectory,
            intermediateDir: DEFAULT_INTERMEDIATE_DIRECTORY,
            keepIntermediates: config.debug,
            outputDirectory: config.outputDirectory || DEFAULT_OUTPUT_DIRECTORY,
            outputStructure: config.outputStructure || DEFAULT_OUTPUT_STRUCTURE,
            outputFilenameOptions: config.outputFilenameOptions || DEFAULT_OUTPUT_FILENAME_OPTIONS,
            maxAudioSize: config.maxAudioSize,
            tempDirectory: config.tempDirectory,
        });

        await operator.process(async (file: string) => {
            // Use locate phase for file metadata
            const { creationTime, hash } = await locatePhase.locate(file);
            
            // Run through the full intelligent pipeline
            const result = await pipeline.process({
                audioFile: file,
                creation: creationTime,
                hash,
            });
            
            logger.info('Processed: %s -> %s', file, result.outputPath);
        });
    } catch (error: any) {
        logger.error('Exiting due to Error: %s, %s', error.message, error.stack);
        process.exit(1);
    }
}