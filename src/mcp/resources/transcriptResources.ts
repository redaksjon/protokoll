/**
 * Transcript Resources
 * 
 * Handles reading individual transcripts and listing transcripts.
 */

import type { McpResourceContents } from '../types';
import { buildTranscriptUri, buildTranscriptsListUri } from '../uri';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { listTranscripts } from '@/cli/transcript';

/**
 * Read a single transcript resource
 */
export async function readTranscriptResource(transcriptPath: string): Promise<McpResourceContents> {
    // Handle both absolute and relative paths
    const fullPath = transcriptPath.startsWith('/')
        ? transcriptPath
        : resolve(process.cwd(), transcriptPath);

    try {
        const content = await readFile(fullPath, 'utf-8');
        
        return {
            uri: buildTranscriptUri(transcriptPath),
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

    // Convert to resource format with URIs
    const transcriptsWithUris = result.transcripts.map(t => ({
        uri: buildTranscriptUri(t.path),
        path: t.path,
        filename: t.filename,
        date: t.date,
        time: t.time,
        title: t.title,
    }));

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
