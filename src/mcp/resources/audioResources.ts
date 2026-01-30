/**
 * Audio Resources
 * 
 * Handles listing audio files (inbound and processed).
 */

import type { McpResourceContents } from '../types';
import { buildAudioInboundUri, buildAudioProcessedUri } from '../uri';
import { readdir, stat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import * as Context from '@/context';
import { DEFAULT_AUDIO_EXTENSIONS } from '@/constants';

/**
 * List audio files in a directory
 */
async function listAudioFiles(directory: string): Promise<Array<{
    filename: string;
    path: string;
    size: number;
    modified: string;
    extension: string;
}>> {
    const dirPath = resolve(directory);
    
    try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        const audioFiles = [];
        
        for (const entry of entries) {
            if (entry.isFile()) {
                const ext = extname(entry.name).toLowerCase().substring(1);
                if (DEFAULT_AUDIO_EXTENSIONS.includes(ext)) {
                    const filePath = join(dirPath, entry.name);
                    const stats = await stat(filePath);
                    
                    audioFiles.push({
                        filename: entry.name,
                        path: filePath,
                        size: stats.size,
                        modified: stats.mtime.toISOString(),
                        extension: ext,
                    });
                }
            }
        }
        
        // Sort by modification time, newest first
        audioFiles.sort((a, b) => 
            new Date(b.modified).getTime() - new Date(a.modified).getTime()
        );
        
        return audioFiles;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Read inbound audio files resource
 */
export async function readAudioInboundResource(
    directory?: string
): Promise<McpResourceContents> {
    const context = await Context.create({
        startingDir: directory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No Protokoll context found');
    }

    const config = context.getConfig();
    const inputDirectory = directory || (config.inputDirectory as string) || './recordings';
    const audioFiles = await listAudioFiles(inputDirectory);
    
    const responseData = {
        directory: resolve(inputDirectory),
        count: audioFiles.length,
        totalSize: audioFiles.reduce((sum, f) => sum + f.size, 0),
        files: audioFiles.map(f => ({
            filename: f.filename,
            path: f.path,
            size: f.size,
            sizeHuman: formatBytes(f.size),
            modified: f.modified,
            extension: f.extension,
        })),
        supportedExtensions: DEFAULT_AUDIO_EXTENSIONS,
    };

    return {
        uri: buildAudioInboundUri(inputDirectory),
        mimeType: 'application/json',
        text: JSON.stringify(responseData, null, 2),
    };
}

/**
 * Read processed audio files resource
 */
export async function readAudioProcessedResource(
    directory?: string
): Promise<McpResourceContents> {
    const context = await Context.create({
        startingDir: directory || process.cwd(),
    });

    if (!context.hasContext()) {
        throw new Error('No Protokoll context found');
    }

    const config = context.getConfig();
    const processedDirectory = directory || (config.processedDirectory as string) || './processed';
    const audioFiles = await listAudioFiles(processedDirectory);
    
    const responseData = {
        directory: resolve(processedDirectory),
        count: audioFiles.length,
        totalSize: audioFiles.reduce((sum, f) => sum + f.size, 0),
        files: audioFiles.map(f => ({
            filename: f.filename,
            path: f.path,
            size: f.size,
            sizeHuman: formatBytes(f.size),
            modified: f.modified,
            extension: f.extension,
        })),
        supportedExtensions: DEFAULT_AUDIO_EXTENSIONS,
    };

    return {
        uri: buildAudioProcessedUri(processedDirectory),
        mimeType: 'application/json',
        text: JSON.stringify(responseData, null, 2),
    };
}
