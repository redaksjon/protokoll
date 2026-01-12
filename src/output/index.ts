/**
 * Output Management System
 *
 * Main entry point for the output management system. Handles intermediate
 * files and final output destinations.
 */

import { OutputConfig, OutputPaths, IntermediateFiles } from './types';
import * as Manager from './manager';
import * as Metadata from '../util/metadata';

export interface OutputInstance {
    createOutputPaths(
        audioFile: string,
        routedDestination: string,
        hash: string,
        date: Date
    ): OutputPaths;
    ensureDirectories(paths: OutputPaths): Promise<void>;
    writeIntermediate(
        paths: OutputPaths,
        type: keyof IntermediateFiles,
        content: unknown
    ): Promise<string>;
    writeTranscript(paths: OutputPaths, content: string, metadata?: Metadata.TranscriptMetadata): Promise<string>;
    cleanIntermediates(paths: OutputPaths): Promise<void>;
}

export const create = (config: OutputConfig): OutputInstance => {
    return Manager.create(config);
};

export const DEFAULT_OUTPUT_CONFIG: OutputConfig = {
    intermediateDir: './output/protokoll',
    keepIntermediates: true,
    timestampFormat: 'YYMMDD-HHmm',
};

// Re-export types
export * from './types';

