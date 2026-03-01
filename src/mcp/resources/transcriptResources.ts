/**
 * Transcript Resources
 * 
 * Handles reading individual transcripts and listing transcripts.
 */

import type { McpResourceContents } from '../types';
import { buildTranscriptUri, buildTranscriptsListUri } from '../uri';
import { resolve, relative, basename } from 'node:path';
import { tmpdir } from 'node:os';
import * as fs from 'node:fs/promises';
import Logging from '@fjell/logging';
import { Transcript } from '@redaksjon/protokoll-engine';
import { PklTranscript } from '@redaksjon/protokoll-format';
import * as ServerConfig from '../serverConfig';
import { sanitizePath } from '../tools/shared';
import type { FileStorageProvider } from '../storage/fileProviders';
import { listTranscriptsViaIndex } from './transcriptIndexService';

const { resolveTranscriptPath, readTranscriptContent, stripTranscriptExtension } = Transcript;
const { listTranscripts } = Transcript;
const logger = Logging.getLogger('@redaksjon/protokoll-mcp').get('transcript-resources');

function parseStoredSummaries(raw: string): Array<{
    id: string;
    title: string;
    audience: string;
    guidance: string;
    stylePreset: string;
    styleLabel: string;
    content: string;
    generatedAt: string;
}> {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map((item) => {
                if (!item || typeof item !== 'object') {
                    return null;
                }
                const record = item as Record<string, unknown>;
                const id = String(record.id || '').trim();
                const content = String(record.content || '').trim();
                if (!id || !content) {
                    return null;
                }
                return {
                    id,
                    title: String(record.title || '').trim(),
                    audience: String(record.audience || '').trim(),
                    guidance: String(record.guidance || '').trim(),
                    stylePreset: String(record.stylePreset || 'detailed').trim() || 'detailed',
                    styleLabel: String(record.styleLabel || 'Detailed summary').trim() || 'Detailed summary',
                    content,
                    generatedAt: String(record.generatedAt || '').trim() || new Date().toISOString(),
                };
            })
            .filter((summary): summary is {
                id: string;
                title: string;
                audience: string;
                guidance: string;
                stylePreset: string;
                styleLabel: string;
                content: string;
                generatedAt: string;
            } => summary !== null)
            .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    } catch {
        return [];
    }
}

/**
 * Read a single transcript resource
 * 
 * transcriptPath can be:
 * - A path without extension (e.g., "2026/1/29-2027-meeting") - will resolve to .pkl
 * - A path with extension (e.g., "2026/1/29-2027-meeting.pkl") - will use that specific file
 */
export async function readTranscriptResource(transcriptPath: string): Promise<McpResourceContents> {
    // Guard against undefined/null paths
    if (!transcriptPath || typeof transcriptPath !== 'string') {
        throw new Error(`Invalid transcript path: ${transcriptPath}`);
    }
    
    // Get the configured output directory
    const outputDirectory = ServerConfig.getOutputDirectory();
    const outputStorage = ServerConfig.getOutputStorage();

    if (outputStorage.name === 'gcs') {
        const gcsResult = await readTranscriptResourceFromStorage(transcriptPath, outputStorage, outputDirectory);
        if (gcsResult) {
            return gcsResult;
        }
    }
    
    // Resolve the transcript path - handles extension resolution
    // If it's already absolute, use it directly (for backwards compatibility)
    const basePath = transcriptPath.startsWith('/')
        ? transcriptPath
        : resolve(outputDirectory, transcriptPath);

    // Resolve to actual .pkl file
    const resolved = await resolveTranscriptPath(basePath);
    
    if (!resolved.exists || !resolved.path) {
        throw new Error(`Transcript not found: ${basePath}`);
    }

    try {
        // Read content and metadata using PKL utilities
        const { content, metadata, title } = await readTranscriptContent(resolved.path);
        
        // Get raw transcript if available
        const pklTranscript = PklTranscript.open(resolved.path, { readOnly: true });
        let rawTranscript = undefined;
        let summaries: Array<{
            id: string;
            title: string;
            audience: string;
            guidance: string;
            stylePreset: string;
            styleLabel: string;
            content: string;
            generatedAt: string;
        }> = [];
        try {
            if (pklTranscript.hasRawTranscript) {
                const rawData = pklTranscript.rawTranscript;
                if (rawData) {
                    rawTranscript = {
                        text: rawData.text,
                        model: rawData.model,
                        duration: rawData.duration,
                        transcribedAt: rawData.transcribedAt,
                    };
                }
            }

            const historyArtifact = pklTranscript.getArtifact('summary_history');
            summaries = parseStoredSummaries(historyArtifact?.data?.toString('utf8') || '[]');
        } finally {
            pklTranscript.close();
        }
        
        // Build the URI without extension (extension-agnostic identifier)
        const relativePath = resolved.path.startsWith('/')
            ? relative(outputDirectory, resolved.path)
            : transcriptPath;
        
        // Strip extension from the URI - the identifier should be extension-agnostic
        const identifierPath = stripTranscriptExtension(relativePath);
        
        // Return structured JSON response - clients should NOT parse this
        // All metadata is provided directly for display
        const structuredResponse = {
            uri: buildTranscriptUri(identifierPath),
            path: identifierPath,
            title: title || identifierPath.split('/').pop() || 'Untitled',
            metadata: {
                date: metadata.date,
                time: metadata.time,
                project: metadata.project,
                projectId: metadata.projectId,
                status: metadata.status,
                tags: metadata.tags || [],
                duration: metadata.duration,
                entities: metadata.entities || {},
                tasks: metadata.tasks || [],
                history: metadata.history || [],
                routing: metadata.destination ? {
                    destination: metadata.destination,
                    confidence: metadata.confidence,
                } : undefined,
            },
            content: content,
            rawTranscript: rawTranscript,
            summaries,
        };
        
        return {
            uri: buildTranscriptUri(identifierPath),
            mimeType: 'application/json',
            text: JSON.stringify(structuredResponse),
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Transcript not found: ${resolved.path}`);
        }
        throw error;
    }
}

async function withTempPklFile<T>(contents: Buffer, action: (tempPath: string) => Promise<T>): Promise<T> {
    const tempPath = `${tmpdir()}/protokoll-mcp-${Date.now()}-${Math.random().toString(36).slice(2)}.pkl`;
    await fs.writeFile(tempPath, contents);
    try {
        return await action(tempPath);
    } finally {
        await fs.rm(tempPath, { force: true });
    }
}

async function resolveStorageTranscriptPath(
    transcriptPath: string,
    outputStorage: FileStorageProvider,
): Promise<string | null> {
    const candidates = new Set<string>();
    const normalizedInput = transcriptPath.replace(/^\/+/, '').replace(/\\/g, '/');
    if (normalizedInput.length > 0) {
        candidates.add(normalizedInput);
    }
    if (!normalizedInput.toLowerCase().endsWith('.pkl')) {
        candidates.add(`${normalizedInput}.pkl`);
    }

    for (const candidate of candidates) {
        if (await outputStorage.exists(candidate)) {
            return candidate;
        }
    }

    return null;
}

async function readTranscriptResourceFromStorage(
    transcriptPath: string,
    outputStorage: FileStorageProvider,
    outputDirectory: string,
): Promise<McpResourceContents | null> {
    const storagePath = await resolveStorageTranscriptPath(transcriptPath, outputStorage);
    if (!storagePath) {
        return null;
    }

    const contents = await outputStorage.readFile(storagePath);
    return withTempPklFile(contents, async (tempPath) => {
        const { content, metadata, title } = await readTranscriptContent(tempPath);
        const pklTranscript = PklTranscript.open(tempPath, { readOnly: true });
        let rawTranscript = undefined;
        let summaries: Array<{
            id: string;
            title: string;
            audience: string;
            guidance: string;
            stylePreset: string;
            styleLabel: string;
            content: string;
            generatedAt: string;
        }> = [];
        try {
            if (pklTranscript.hasRawTranscript) {
                const rawData = pklTranscript.rawTranscript;
                if (rawData) {
                    rawTranscript = {
                        text: rawData.text,
                        model: rawData.model,
                        duration: rawData.duration,
                        transcribedAt: rawData.transcribedAt,
                    };
                }
            }

            const historyArtifact = pklTranscript.getArtifact('summary_history');
            summaries = parseStoredSummaries(historyArtifact?.data?.toString('utf8') || '[]');
        } finally {
            pklTranscript.close();
        }

        const safeRelativePath = await sanitizePath(storagePath, outputDirectory);
        const identifierPath = stripTranscriptExtension(safeRelativePath);
        const structuredResponse = {
            uri: buildTranscriptUri(identifierPath),
            path: identifierPath,
            title: title || basename(identifierPath) || 'Untitled',
            metadata: {
                date: metadata.date,
                time: metadata.time,
                project: metadata.project,
                projectId: metadata.projectId,
                status: metadata.status,
                tags: metadata.tags || [],
                duration: metadata.duration,
                entities: metadata.entities || {},
                tasks: metadata.tasks || [],
                history: metadata.history || [],
                routing: metadata.destination ? {
                    destination: metadata.destination,
                    confidence: metadata.confidence,
                } : undefined,
            },
            content,
            rawTranscript,
            summaries,
        };

        return {
            uri: buildTranscriptUri(identifierPath),
            mimeType: 'application/json',
            text: JSON.stringify(structuredResponse),
        };
    });
}

async function listTranscriptsFromStorage(options: {
    outputStorage: FileStorageProvider;
    outputDirectory: string;
    startDate?: string;
    endDate?: string;
    projectId?: string;
    projectName?: string;
    limit: number;
    offset: number;
}) {
    const startedAt = Date.now();
    const { outputStorage, outputDirectory, startDate, endDate, projectId, projectName, limit, offset } = options;

    logger.info('transcripts.storage.list.start', {
        directory: outputDirectory,
        storageBackend: outputStorage.name,
        limit,
        offset,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        projectId: projectId ?? null,
        projectName: projectName ?? null,
    });

    const hasListSupport = typeof (outputStorage as { listFiles?: unknown }).listFiles === 'function'
        || typeof (outputStorage as { listFilesWithMetadata?: unknown }).listFilesWithMetadata === 'function';
    if (!hasListSupport) {
        return listTranscripts({
            directory: outputDirectory,
            startDate,
            endDate,
            limit,
            offset,
            projectId,
        });
    }

    const result = await listTranscriptsViaIndex({
        outputStorage,
        outputDirectory,
        startDate,
        endDate,
        projectId,
        projectName,
        limit,
        offset,
    });
    logger.info('transcripts.storage.list.complete', {
        storageBackend: outputStorage.name,
        totalAfterFilters: result.total,
        returned: result.transcripts.length,
        hasMore: result.hasMore,
        elapsedMs: Date.now() - startedAt,
    });
    return result;
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
    const outputStorage = ServerConfig.getOutputStorage();
    
    // Use provided directory or fall back to configured outputDirectory
    const directory = options.directory || outputDirectory;

    // Resolve projectId to project name for fallback filtering (transcripts may have project name but not projectId)
    let projectName: string | undefined;
    if (projectId && ServerConfig.isInitialized()) {
        const context = ServerConfig.getContext();
        if (context) {
            const project = context.getProject(projectId);
            if (project) {
                projectName = project.name;
            } else {
                // projectId isn't a known UUID — treat it as a project name
                projectName = projectId;
            }
        }
    }

    logger.info('transcripts.list.request', {
        directory,
        directorySource: options.directory ? 'request' : 'config',
        projectId: projectId ?? null,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        limit,
        offset,
        storageBackend: outputStorage.name,
    });

    const result = await listTranscriptsFromStorage({
        outputStorage,
        outputDirectory,
        startDate,
        endDate,
        projectId,
        projectName,
        limit,
        offset,
    });

    logger.info('transcripts.list.response', {
        directory,
        total: result.total,
        returned: result.transcripts.length,
        hasMore: result.hasMore,
        limit,
        offset,
    });

    // Convert to resource format with URIs
    // Convert absolute paths to relative paths (relative to outputDirectory)
    // Use sanitizePath to ensure no absolute paths are exposed
    // Strip file extensions from URIs - identifiers should be extension-agnostic
    const transcriptsWithUris = await Promise.all(
        result.transcripts.map(async (t) => {
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
            hasMore: result.hasMore ?? (result.offset + result.limit < result.total),
            nextOffset: result.hasMore ? result.offset + result.limit : null,
        },
        filters: {
            startDate,
            endDate,
            projectId,
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
