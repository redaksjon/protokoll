/**
 * Audio Processing Tools - Process audio files through transcription pipeline
 */
// eslint-disable-next-line import/extensions
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { resolve, join, basename } from 'node:path';
import { readdir } from 'node:fs/promises';
import { glob } from 'glob';
import * as Pipeline from '@/pipeline';
import {
    DEFAULT_AUDIO_EXTENSIONS,
    DEFAULT_OUTPUT_STRUCTURE,
    DEFAULT_OUTPUT_FILENAME_OPTIONS,
    DEFAULT_MAX_AUDIO_SIZE,
    DEFAULT_INTERMEDIATE_DIRECTORY,
    DEFAULT_MODEL,
    DEFAULT_TRANSCRIPTION_MODEL,
    DEFAULT_REASONING_LEVEL,
    DEFAULT_TEMP_DIRECTORY,
} from '@/constants';
import { fileExists, getAudioMetadata, getConfiguredDirectory, sanitizePath, type ProcessingResult } from './shared';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find an audio file by filename or partial filename
 * Searches in the workspace's configured input directory
 */
async function findAudioFile(
    filenameOrPath: string
): Promise<string> {
    // If it's already an absolute path that exists, use it
    if (filenameOrPath.startsWith('/') && await fileExists(filenameOrPath)) {
        return filenameOrPath;
    }

    // Get the input directory from workspace config
    const inputDirectory = await getConfiguredDirectory('inputDirectory');
    
    // Search for the audio file
    const entries = await readdir(inputDirectory, { withFileTypes: true });
    const matches: string[] = [];
    
    for (const entry of entries) {
        if (entry.isFile()) {
            const filename = entry.name;
            const ext = filename.split('.').pop()?.toLowerCase();
            
            // Check if it's an audio file
            if (ext && DEFAULT_AUDIO_EXTENSIONS.includes(ext)) {
                // Check if filename matches
                if (filename === filenameOrPath || 
                    filename.includes(filenameOrPath) ||
                    basename(filename, `.${ext}`) === filenameOrPath) {
                    matches.push(join(inputDirectory, filename));
                }
            }
        }
    }

    if (matches.length === 0) {
        throw new Error(
            `No audio file found matching "${filenameOrPath}" in ${inputDirectory}. ` +
            `Try using the protokoll://audio/inbound resource to see available audio files.`
        );
    }

    if (matches.length === 1) {
        return matches[0];
    }

    // Multiple matches
    const matchNames = matches.map(m => basename(m)).join(', ');
    throw new Error(
        `Multiple audio files match "${filenameOrPath}": ${matchNames}. ` +
        `Please be more specific.`
    );
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const processAudioTool: Tool = {
    name: 'protokoll_process_audio',
    description:
        'Process an audio file through Protokoll\'s intelligent transcription pipeline. ' +
        'You can provide either an absolute path OR just a filename/partial filename. ' +
        'If you provide a filename, it will search in the workspace\'s configured input directory. ' +
        'This tool uses workspace-level configuration automatically - no need to specify directories. ' +
        'Transcribes audio using Whisper, then enhances it with context-aware processing ' +
        'that corrects names, terms, and routes the output to the appropriate project folder. ' +
        'Returns the enhanced transcript text and output file path.',
    inputSchema: {
        type: 'object',
        properties: {
            audioFile: {
                type: 'string',
                description: 
                    'Filename, partial filename, or absolute path to the audio file. ' +
                    'Examples: "recording.m4a", "2026-01-29", "/full/path/to/audio.m4a"',
            },
            projectId: {
                type: 'string',
                description: 'Specific project ID to use for routing (helpful when multiple projects exist)',
            },
            outputDirectory: {
                type: 'string',
                description: 'Override the workspace output directory',
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
        'If no directory is specified, uses the workspace\'s configured input directory. ' +
        'This tool uses workspace-level configuration automatically - no need to specify directories. ' +
        'Finds all audio files matching the configured extensions and processes them sequentially. ' +
        'Returns a summary of all processed files with their output paths.',
    inputSchema: {
        type: 'object',
        properties: {
            inputDirectory: {
                type: 'string',
                description: 
                    'Optional: Directory containing audio files. ' +
                    'If not specified, uses the workspace input directory.',
            },
            extensions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Audio file extensions to process (default: [".m4a", ".mp3", ".wav", ".webm"])',
            },
            outputDirectory: {
                type: 'string',
                description: 'Override the workspace output directory',
            },
        },
        required: [],
    },
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleProcessAudio(args: {
    audioFile: string;
    projectId?: string;
    outputDirectory?: string;
    model?: string;
    transcriptionModel?: string;
}): Promise<ProcessingResult> {
    // Import server config
    const ServerConfig = await import('../serverConfig');
    
    // Find the audio file (handles both paths and filenames)
    const audioFile = await findAudioFile(args.audioFile);

    // Get workspace configuration
    const config = ServerConfig.getServerConfig();
    const context = config.context;
    
    if (!context) {
        throw new Error('Protokoll context not available. Ensure .protokoll directory exists in workspace.');
    }

    // Get configuration from context
    const contextConfig = context.getConfig();
    const outputDirectory = args.outputDirectory || config.outputDirectory;
    const outputStructure = (contextConfig.outputStructure as string) || DEFAULT_OUTPUT_STRUCTURE;
    const outputFilenameOptions = (contextConfig.outputFilenameOptions as string[]) || DEFAULT_OUTPUT_FILENAME_OPTIONS;
    const processedDirectory = config.processedDirectory ?? undefined;

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
        contextDirectory: config.workspaceRoot || undefined,
        intermediateDir: DEFAULT_INTERMEDIATE_DIRECTORY,
        keepIntermediates: false,
        outputDirectory,
        outputStructure,
        outputFilenameOptions,
        processedDirectory: processedDirectory || undefined,
        maxAudioSize: DEFAULT_MAX_AUDIO_SIZE,
        tempDirectory: DEFAULT_TEMP_DIRECTORY,
    });

    // Process through pipeline
    const result = await pipeline.process({
        audioFile,
        creation: creationTime,
        hash,
    });

    // Sanitize outputPath to ensure no absolute paths are exposed
    const sanitizedOutputPath = await sanitizePath(result.outputPath, outputDirectory);

    return {
        outputPath: sanitizedOutputPath,
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
    inputDirectory?: string;
    extensions?: string[];
    outputDirectory?: string;
}): Promise<{ processed: ProcessingResult[]; errors: { file: string; error: string }[] }> {
    // Get directory from args or workspace config
    const inputDir = args.inputDirectory 
        ? resolve(args.inputDirectory)
        : await getConfiguredDirectory('inputDirectory');
    
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
                outputDirectory: args.outputDirectory,
            });
            processed.push(result);
        } catch (error) {
            // Sanitize file path in error to ensure no absolute paths are exposed
            const sanitizedFile = await sanitizePath(file, inputDir);
            errors.push({
                file: sanitizedFile,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return { processed, errors };
}
