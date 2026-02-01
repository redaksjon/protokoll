/**
 * Transcript Resources
 * 
 * Handles reading individual transcripts and listing transcripts.
 */

import type { McpResourceContents } from '../types';
import { buildTranscriptUri, buildTranscriptsListUri } from '../uri';
import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { listTranscripts } from '@/cli/transcript';
import * as ServerConfig from '../serverConfig';

/**
 * Read a single transcript resource
 * 
 * transcriptPath should be relative to the configured output directory
 * (e.g., "2026/1/29-2027-riot-doc-voice-and-tone.md")
 */
export async function readTranscriptResource(transcriptPath: string): Promise<McpResourceContents> {
    // Get the configured output directory
    const outputDirectory = ServerConfig.getOutputDirectory();
    
    // Resolve the transcript path relative to the output directory
    // If it's already absolute, use it directly (for backwards compatibility)
    const fullPath = transcriptPath.startsWith('/')
        ? transcriptPath
        : resolve(outputDirectory, transcriptPath);

    try {
        const content = await readFile(fullPath, 'utf-8');
        
        // Always return URI with relative path (even if input was absolute)
        const relativePath = transcriptPath.startsWith('/')
            ? relative(outputDirectory, transcriptPath)
            : transcriptPath;
        
        return {
            uri: buildTranscriptUri(relativePath),
            mimeType: 'text/markdown',
            text: content,
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Transcript not found: ${fullPath}`);
        }
        throw error;
    }
}

/**
 * Read a list of transcripts with filtering
 */
export async function readTranscriptsListResource(options: {
    directory: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}): Promise<McpResourceContents> {
    const { directory, startDate, endDate, limit = 50, offset = 0 } = options;

    if (!directory) {
        throw new Error('Directory is required for transcripts list');
    }

    const result = await listTranscripts({
        directory,
        limit,
        offset,
        sortBy: 'date',
        startDate,
        endDate,
    });

    // Get the configured output directory to convert absolute paths to relative
    const outputDirectory = ServerConfig.getOutputDirectory();

    // Convert to resource format with URIs
    // Convert absolute paths to relative paths (relative to outputDirectory)
    const transcriptsWithUris = result.transcripts.map(t => {
        // Convert absolute path to relative path
        const relativePath = relative(outputDirectory, t.path);
        
        return {
            uri: buildTranscriptUri(relativePath),
            path: t.path,
            filename: t.filename,
            date: t.date,
            time: t.time,
            title: t.title,
        };
    });

    const responseData = {
        directory,
        transcripts: transcriptsWithUris,
        pagination: {
            total: result.total,
            limit: result.limit,
            offset: result.offset,
            hasMore: result.hasMore,
        },
        filters: {
            startDate,
            endDate,
        },
    };

    return {
        uri: buildTranscriptsListUri(options),
        mimeType: 'application/json',
        text: JSON.stringify(responseData, null, 2),
    };
}
