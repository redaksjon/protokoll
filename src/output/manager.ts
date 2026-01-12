/**
 * Output Manager
 *
 * Manages intermediate files and final output destinations.
 * Follows the kodrdriv pattern for debugging and intermediate file management.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { OutputConfig, IntermediateFiles, OutputPaths } from './types';
import * as Logging from '../logging';

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
  
    writeTranscript(paths: OutputPaths, content: string): Promise<string>;
  
    cleanIntermediates(paths: OutputPaths): Promise<void>;
}

export const create = (config: OutputConfig): ManagerInstance => {
    const logger = Logging.getLogger();
  
    const formatTimestamp = (date: Date): string => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${date.getFullYear().toString().slice(2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
    };
  
    const createOutputPaths = (
        _audioFile: string,
        routedDestination: string,
        hash: string,
        date: Date
    ): OutputPaths => {
        const timestamp = formatTimestamp(date);
        const shortHash = hash.slice(0, 6);
        const prefix = `${timestamp}-${shortHash}`;
    
        const intermediateDir = config.intermediateDir;
    
        return {
            final: routedDestination,
            intermediate: {
                transcript: path.join(intermediateDir, `${prefix}-transcript.json`),
                context: path.join(intermediateDir, `${prefix}-context.json`),
                request: path.join(intermediateDir, `${prefix}-request.json`),
                response: path.join(intermediateDir, `${prefix}-response.json`),
                reflection: path.join(intermediateDir, `${prefix}-reflection.md`),
                session: path.join(intermediateDir, `${prefix}-session.json`),
            },
        };
    };
  
    const ensureDirectories = async (paths: OutputPaths): Promise<void> => {
        // Ensure intermediate directory
        await fs.mkdir(path.dirname(paths.intermediate.transcript), { recursive: true });
    
        // Ensure final directory
        await fs.mkdir(path.dirname(paths.final), { recursive: true });
    
        logger.debug('Ensured output directories', {
            intermediate: path.dirname(paths.intermediate.transcript),
            final: path.dirname(paths.final),
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
        content: string
    ): Promise<string> => {
        await fs.writeFile(paths.final, content, 'utf-8');
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
  
    return {
        createOutputPaths,
        ensureDirectories,
        writeIntermediate,
        writeTranscript,
        cleanIntermediates,
    };
};

