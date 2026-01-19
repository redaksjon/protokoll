/**
 * Output Manager
 *
 * Manages intermediate files and final output destinations.
 * Follows the kodrdriv pattern for debugging and intermediate file management.
 */

import * as path from 'node:path';
import * as fs from 'fs/promises';
import { OutputConfig, IntermediateFiles, OutputPaths, RawTranscriptData } from './types';
import * as Logging from '../logging';
import * as Metadata from '../util/metadata';

export interface ManagerInstance {
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
  
    /**
     * Write the raw Whisper transcript to the .transcript/ directory alongside final output.
     * This enables compare and reanalyze workflows.
     */
    writeRawTranscript(paths: OutputPaths, data: RawTranscriptData): Promise<string>;
  
    writeTranscript(paths: OutputPaths, content: string, metadata?: Metadata.TranscriptMetadata): Promise<string>;
  
    cleanIntermediates(paths: OutputPaths): Promise<void>;
    
    /**
     * Read a previously stored raw transcript from the .transcript/ directory.
     * Returns null if no raw transcript exists.
     */
    readRawTranscript(finalOutputPath: string): Promise<RawTranscriptData | null>;
}

export const create = (config: OutputConfig): ManagerInstance => {
    const logger = Logging.getLogger();
  
    const formatTimestamp = (date: Date): string => {
        // Format: YYYY-MM-DD-HHmm (full year, dashes for separation)
        const pad = (n: number) => n.toString().padStart(2, '0');
        const year = date.getFullYear().toString();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        return `${year}-${month}-${day}-${hours}${minutes}`;
    };
  
    const createOutputPaths = (
        _audioFile: string,
        routedDestination: string,
        hash: string,
        date: Date
    ): OutputPaths => {
        const timestamp = formatTimestamp(date);
        const shortHash = hash.slice(0, 6);
        // Hash at the end for easier filename correlation
        const buildFilename = (type: string, ext: string) => `${timestamp}-${type}-${shortHash}${ext}`;
    
        const intermediateDir = config.intermediateDir;
    
        // Generate raw transcript path in .transcript/ directory alongside final output
        // e.g., /notes/2026/1/14-meeting.md -> /notes/2026/1/.transcript/14-meeting.json
        const finalDir = path.dirname(routedDestination);
        const finalBasename = path.basename(routedDestination, path.extname(routedDestination));
        const rawTranscriptPath = path.join(finalDir, '.transcript', `${finalBasename}.json`);

        return {
            final: routedDestination,
            rawTranscript: rawTranscriptPath,
            intermediate: {
                transcript: path.join(intermediateDir, buildFilename('transcript', '.json')),
                context: path.join(intermediateDir, buildFilename('context', '.json')),
                request: path.join(intermediateDir, buildFilename('request', '.json')),
                response: path.join(intermediateDir, buildFilename('response', '.json')),
                reflection: path.join(intermediateDir, buildFilename('reflection', '.md')),
                session: path.join(intermediateDir, buildFilename('session', '.json')),
            },
        };
    };
  
    const ensureDirectories = async (paths: OutputPaths): Promise<void> => {
        // Ensure intermediate directory
        await fs.mkdir(path.dirname(paths.intermediate.transcript), { recursive: true });
    
        // Ensure final directory
        await fs.mkdir(path.dirname(paths.final), { recursive: true });
        
        // Ensure .transcript directory alongside final output
        await fs.mkdir(path.dirname(paths.rawTranscript), { recursive: true });
    
        logger.debug('Ensured output directories', {
            intermediate: path.dirname(paths.intermediate.transcript),
            final: path.dirname(paths.final),
            rawTranscript: path.dirname(paths.rawTranscript),
        });
    };
  
    const writeIntermediate = async (
        paths: OutputPaths,
        type: keyof IntermediateFiles,
        content: unknown
    ): Promise<string> => {
        const filePath = paths.intermediate[type];
        if (!filePath) {
            throw new Error(`Invalid intermediate type: ${type}`);
        }
    
        const contentStr = typeof content === 'string' 
            ? content 
            : JSON.stringify(content, null, 2);
    
        await fs.writeFile(filePath, contentStr, 'utf-8');
        logger.debug('Wrote intermediate file', { type, path: filePath });
    
        return filePath;
    };
  
    const writeTranscript = async (
        paths: OutputPaths,
        content: string,
        metadata?: Metadata.TranscriptMetadata
    ): Promise<string> => {
        let finalContent = content;
        
        if (metadata) {
            // Prepend header metadata
            const metadataSection = Metadata.formatMetadataMarkdown(metadata);
            finalContent = metadataSection + content;
            
            // Append entity metadata at the end
            const entitySection = Metadata.formatEntityMetadataMarkdown(metadata);
            if (entitySection) {
                finalContent = finalContent + entitySection;
            }
        }
        
        await fs.writeFile(paths.final, finalContent, 'utf-8');
        logger.info('Wrote final transcript', { path: paths.final });
        return paths.final;
    };
  
    const cleanIntermediates = async (paths: OutputPaths): Promise<void> => {
        if (config.keepIntermediates) {
            logger.debug('Keeping intermediate files');
            return;
        }
    
        for (const [type, filePath] of Object.entries(paths.intermediate)) {
            if (filePath) {
                try {
                    await fs.unlink(filePath);
                    logger.debug('Removed intermediate file', { type, path: filePath });
                } catch {
                    // File might not exist, that's OK
                }
            }
        }
    };
    
    /**
     * Write the raw Whisper transcript to the .transcript/ directory.
     * This preserves the original transcription for compare/reanalyze workflows.
     */
    const writeRawTranscript = async (
        paths: OutputPaths,
        data: RawTranscriptData
    ): Promise<string> => {
        const filePath = paths.rawTranscript;
        
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
        logger.debug('Wrote raw transcript to .transcript/', { path: filePath });
        
        return filePath;
    };
    
    /**
     * Read a previously stored raw transcript from the .transcript/ directory.
     * Calculates the path based on the final output path.
     * Returns null if no raw transcript exists.
     */
    const readRawTranscript = async (finalOutputPath: string): Promise<RawTranscriptData | null> => {
        const finalDir = path.dirname(finalOutputPath);
        const finalBasename = path.basename(finalOutputPath, path.extname(finalOutputPath));
        const rawTranscriptPath = path.join(finalDir, '.transcript', `${finalBasename}.json`);
        
        try {
            const content = await fs.readFile(rawTranscriptPath, 'utf-8');
            return JSON.parse(content) as RawTranscriptData;
        } catch (error: unknown) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
                logger.debug('No raw transcript found', { path: rawTranscriptPath });
                return null;
            }
            throw error;
        }
    };
  
    return {
        createOutputPaths,
        ensureDirectories,
        writeIntermediate,
        writeRawTranscript,
        writeTranscript,
        readRawTranscript,
        cleanIntermediates,
    };
};

