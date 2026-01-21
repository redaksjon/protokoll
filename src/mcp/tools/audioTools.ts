/**
 * Audio Processing Tools - Process audio files through transcription pipeline
 */
import type { Tool } from '@modelcontextprotocol/sdk/types';
import { resolve, dirname } from 'node:path';
import { glob } from 'glob';
import * as Context from '@/context';
import * as Pipeline from '@/pipeline';
import {
    DEFAULT_OUTPUT_DIRECTORY,
    DEFAULT_OUTPUT_STRUCTURE,
    DEFAULT_OUTPUT_FILENAME_OPTIONS,
    DEFAULT_MAX_AUDIO_SIZE,
    DEFAULT_INTERMEDIATE_DIRECTORY,
    DEFAULT_MODEL,
    DEFAULT_TRANSCRIPTION_MODEL,
    DEFAULT_REASONING_LEVEL,
    DEFAULT_TEMP_DIRECTORY,
} from '@/constants';
import { fileExists, getAudioMetadata, type ProcessingResult } from './shared';

// ============================================================================
// Tool Definitions
// ============================================================================

export const processAudioTool: Tool = {
    name: 'protokoll_process_audio',
    description:
        'Process an audio file through Protokoll\'s intelligent transcription pipeline. ' +
        'IMPORTANT: Before calling this, use protokoll_discover_config or protokoll_suggest_project ' +
        'to understand which configuration/project should be used. ' +
        'This tool transcribes audio using Whisper, then enhances it with context-aware processing ' +
        'that corrects names, terms, and routes the output to the appropriate project folder. ' +
        'If no contextDirectory is specified, the tool walks up from the audio file to find .protokoll. ' +
        'Returns the enhanced transcript text and output file path.',
    inputSchema: {
        type: 'object',
        properties: {
            audioFile: {
                type: 'string',
                description: 'Absolute path to the audio file to process (m4a, mp3, wav, webm, etc.)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory. If not specified, walks up from the audio file location to find one.',
            },
            projectId: {
                type: 'string',
                description: 'Specific project ID to use for routing (helpful when multiple projects exist)',
            },
            outputDirectory: {
                type: 'string',
                description: 'Override the default output directory',
            },
            model: {
                type: 'string',
                description: 'LLM model for enhancement (default: gpt-5.2)',
            },
            transcriptionModel: {
                type: 'string',
                description: 'Transcription model (default: whisper-1)',
            },
        },
        required: ['audioFile'],
    },
};

export const batchProcessTool: Tool = {
    name: 'protokoll_batch_process',
    description:
        'Process multiple audio files in a directory. ' +
        'Finds all audio files matching the configured extensions and processes them sequentially. ' +
        'Returns a summary of all processed files with their output paths.',
    inputSchema: {
        type: 'object',
        properties: {
            inputDirectory: {
                type: 'string',
                description: 'Absolute path to directory containing audio files',
            },
            extensions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Audio file extensions to process (default: [".m4a", ".mp3", ".wav", ".webm"])',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
            outputDirectory: {
                type: 'string',
                description: 'Override the default output directory',
            },
        },
        required: ['inputDirectory'],
    },
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleProcessAudio(args: {
    audioFile: string;
    contextDirectory?: string;
    projectId?: string;
    outputDirectory?: string;
    model?: string;
    transcriptionModel?: string;
}): Promise<ProcessingResult> {
    const audioFile = resolve(args.audioFile);

    if (!await fileExists(audioFile)) {
        throw new Error(`Audio file not found: ${audioFile}`);
    }

    // Initialize context
    const context = await Context.create({
        startingDir: args.contextDirectory || dirname(audioFile),
    });

    // Get configuration from context
    const config = context.getConfig();
    const outputDirectory = args.outputDirectory || (config.outputDirectory as string) || DEFAULT_OUTPUT_DIRECTORY;
    const outputStructure = (config.outputStructure as string) || DEFAULT_OUTPUT_STRUCTURE;
    const outputFilenameOptions = (config.outputFilenameOptions as string[]) || DEFAULT_OUTPUT_FILENAME_OPTIONS;
    const processedDirectory = (config.processedDirectory as string) || undefined;

    // Get audio file metadata (creation time and hash)
    const { creationTime, hash } = await getAudioMetadata(audioFile);

    // Create pipeline
    const pipeline = await Pipeline.create({
        model: args.model || DEFAULT_MODEL,
        transcriptionModel: args.transcriptionModel || DEFAULT_TRANSCRIPTION_MODEL,
        reasoningLevel: DEFAULT_REASONING_LEVEL,
        interactive: false, // MCP is non-interactive
        selfReflection: false,
        silent: true,
        debug: false,
        dryRun: false,
        contextDirectory: args.contextDirectory,
        intermediateDir: DEFAULT_INTERMEDIATE_DIRECTORY,
        keepIntermediates: false,
        outputDirectory,
        outputStructure,
        outputFilenameOptions,
        processedDirectory,
        maxAudioSize: DEFAULT_MAX_AUDIO_SIZE,
        tempDirectory: DEFAULT_TEMP_DIRECTORY,
    });

    // Process through pipeline
    const result = await pipeline.process({
        audioFile,
        creation: creationTime,
        hash,
    });

    return {
        outputPath: result.outputPath,
        enhancedText: result.enhancedText,
        rawTranscript: result.rawTranscript,
        routedProject: result.routedProject ?? undefined,
        routingConfidence: result.routingConfidence,
        processingTime: result.processingTime,
        toolsUsed: result.toolsUsed,
        correctionsApplied: result.correctionsApplied,
    };
}

export async function handleBatchProcess(args: {
    inputDirectory: string;
    extensions?: string[];
    contextDirectory?: string;
    outputDirectory?: string;
}): Promise<{ processed: ProcessingResult[]; errors: { file: string; error: string }[] }> {
    const inputDir = resolve(args.inputDirectory);
    const extensions = args.extensions || ['.m4a', '.mp3', '.wav', '.webm'];

    if (!await fileExists(inputDir)) {
        throw new Error(`Input directory not found: ${inputDir}`);
    }

    const patterns = extensions.map(ext => `**/*${ext}`);
    const files = await glob(patterns, { cwd: inputDir, nodir: true, absolute: true });

    if (files.length === 0) {
        return { processed: [], errors: [] };
    }

    const processed: ProcessingResult[] = [];
    const errors: { file: string; error: string }[] = [];

    for (const file of files) {
        try {
            const result = await handleProcessAudio({
                audioFile: file,
                contextDirectory: args.contextDirectory,
                outputDirectory: args.outputDirectory,
            });
            processed.push(result);
        } catch (error) {
            errors.push({
                file,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return { processed, errors };
}
