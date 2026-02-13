/**
 * Transcript Resources
 * 
 * Handles reading individual transcripts and listing transcripts.
 */

import type { McpResourceContents } from '../types';
import { buildTranscriptUri, buildTranscriptsListUri } from '../uri';
import { resolve, relative } from 'node:path';
import { listTranscripts } from '@/transcript';
import * as ServerConfig from '../serverConfig';
import { sanitizePath } from '../tools/shared';
import { 
    resolveTranscriptPath, 
    readTranscriptContent, 
    stripTranscriptExtension 
} from '@/transcript/format-adapter';

/**
 * Read a single transcript resource
 * 
 * transcriptPath can be:
 * - A path without extension (e.g., "2026/1/29-2027-meeting") - will resolve to .pkl or .md
 * - A path with extension (e.g., "2026/1/29-2027-meeting.md") - will use that specific file
 * 
 * The server prefers .pkl format when no extension is provided.
 */
export async function readTranscriptResource(transcriptPath: string): Promise<McpResourceContents> {
    // Guard against undefined/null paths
    if (!transcriptPath || typeof transcriptPath !== 'string') {
        throw new Error(`Invalid transcript path: ${transcriptPath}`);
    }
    
    // Get the configured output directory
    const outputDirectory = ServerConfig.getOutputDirectory();
    
    // Resolve the transcript path - handles extension resolution
    // If it's already absolute, use it directly (for backwards compatibility)
    const basePath = transcriptPath.startsWith('/')
        ? transcriptPath
        : resolve(outputDirectory, transcriptPath);

    // Resolve to actual file (checks .pkl first, then .md)
    const resolved = await resolveTranscriptPath(basePath);
    
    if (!resolved.exists || !resolved.path) {
        throw new Error(`Transcript not found: ${basePath} (checked .pkl and .md)`);
    }

    try {
        // Read content using the format adapter
        const { content, mimeType } = await readTranscriptContent(resolved.path);
        
        // Build the URI without extension (extension-agnostic identifier)
        const relativePath = resolved.path.startsWith('/')
            ? relative(outputDirectory, resolved.path)
            : transcriptPath;
        
        // Strip extension from the URI - the identifier should be extension-agnostic
        const identifierPath = stripTranscriptExtension(relativePath);
        
        return {
            uri: buildTranscriptUri(identifierPath),
            mimeType,
            text: content,
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Transcript not found: ${resolved.path}`);
        }
        throw error;
    }
}

/**
 * Read a list of transcripts with filtering
 */
export async function readTranscriptsListResource(options: {
    directory?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
    projectId?: string;
}): Promise<McpResourceContents> {
    const { startDate, endDate, limit = 50, offset = 0, projectId } = options;
    
    // Get the configured output directory to use as fallback
    const outputDirectory = ServerConfig.getOutputDirectory();
    
    // Use provided directory or fall back to configured outputDirectory
    const directory = options.directory || outputDirectory;

    // Log request parameters
    // eslint-disable-next-line no-console
    console.log(`📋 Reading transcripts list:`);
    // eslint-disable-next-line no-console
    console.log(`   Directory: ${directory}${options.directory ? '' : ' (from config)'}`);
    if (projectId) {
        // eslint-disable-next-line no-console
        console.log(`   Project filter: ${projectId}`);
    }
    if (startDate || endDate) {
        // eslint-disable-next-line no-console
        console.log(`   Date range: ${startDate || 'any'} to ${endDate || 'any'}`);
    }
    // eslint-disable-next-line no-console
    console.log(`   Limit: ${limit}, Offset: ${offset}`);

    const result = await listTranscripts({
        directory,
        limit,
        offset,
        sortBy: 'date',
        startDate,
        endDate,
        projectId,
    });

    // Log results
    // eslint-disable-next-line no-console
    console.log(`✅ Transcripts list response:`);
    // eslint-disable-next-line no-console
    console.log(`   Total found: ${result.total}`);
    // eslint-disable-next-line no-console
    console.log(`   Returned: ${result.transcripts.length} (limit: ${limit}, offset: ${offset})`);
    // eslint-disable-next-line no-console
    console.log(`   Has more: ${result.hasMore}`);

    // Convert to resource format with URIs
    // Convert absolute paths to relative paths (relative to outputDirectory)
    // Use sanitizePath to ensure no absolute paths are exposed
    // Strip file extensions from URIs - identifiers should be extension-agnostic
    const transcriptsWithUris = await Promise.all(
        result.transcripts.map(async (t: { path: string; filename: string; date: string; time?: string; title: string; hasRawTranscript: boolean; createdAt: Date; status?: string; openTasksCount?: number; contentSize?: number; entities?: any }) => {
            // Convert absolute path to relative path
            // Guard against undefined path - use filename as fallback
            const relativePath = await sanitizePath(t.path || t.filename || '', outputDirectory);
            
            // Strip extension from the identifier - URIs should be extension-agnostic
            const identifierPath = stripTranscriptExtension(relativePath);
            
            return {
                uri: buildTranscriptUri(identifierPath),
                path: identifierPath, // Use extension-less path as the identifier
                filename: t.filename,
                date: t.date,
                time: t.time,
                title: t.title,
                status: t.status,
                openTasksCount: t.openTasksCount,
                contentSize: t.contentSize,
                entities: t.entities,
                hasRawTranscript: t.hasRawTranscript,
            };
        })
    );

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

    // Build URI with the actual directory used (may be fallback from config)
    return {
        uri: buildTranscriptsListUri({
            directory,
            startDate,
            endDate,
            limit,
            offset,
            projectId,
        }),
        mimeType: 'application/json',
        text: JSON.stringify(responseData, null, 2),
    };
}
