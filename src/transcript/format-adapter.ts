/**
 * Format Adapter for Transcript Files
 * 
 * Provides a unified interface for working with both:
 * - Legacy .md (Markdown with YAML frontmatter) transcripts
 * - New .pkl (SQLite-based) transcripts
 * 
 * The adapter detects file type by extension and routes to the appropriate implementation.
 */

import * as path from 'node:path';
import * as fs from 'fs/promises';
import { PklTranscript } from '@redaksjon/protokoll-format';
import type { TranscriptMetadata as PklMetadata } from '@redaksjon/protokoll-format';
import type { ParsedTranscript, TranscriptMetadata } from './operations';

/**
 * Check if a file is a .pkl (SQLite) transcript
 */
export function isPklFile(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.pkl';
}

/**
 * Check if a file is a .md (Markdown) transcript
 */
export function isMdFile(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.md';
}

/**
 * Check if a file is a supported transcript format
 */
export function isTranscriptFile(filePath: string): boolean {
    return isPklFile(filePath) || isMdFile(filePath);
}

/**
 * Get the glob pattern for finding transcript files
 */
export function getTranscriptGlobPattern(): string {
    return '**/*.{md,pkl}';
}

/**
 * Strip file extension from a transcript path
 * Used for creating extension-agnostic identifiers
 */
export function stripTranscriptExtension(filePath: string): string {
    return filePath.replace(/\.(md|pkl)$/i, '');
}

/**
 * Parse a .pkl transcript file
 */
export async function parsePklTranscript(filePath: string): Promise<ParsedTranscript> {
    const transcript = PklTranscript.open(filePath, { readOnly: true });
    
    try {
        const pklMetadata = transcript.metadata;
        const content = transcript.content;
        
        const result: ParsedTranscript = {
            filePath,
            title: pklMetadata.title,
            metadata: convertPklMetadataToTranscriptMetadata(pklMetadata),
            content,
            rawText: content, // For pkl files, content is the enhanced text
        };
        
        return result;
    } finally {
        transcript.close();
    }
}

/**
 * Read transcript content from either .md or .pkl file
 * Returns the content and metadata in a unified format
 */
export async function readTranscriptContent(filePath: string): Promise<{
    content: string;
    mimeType: string;
    metadata: TranscriptMetadata;
    title?: string;
}> {
    if (isPklFile(filePath)) {
        const transcript = PklTranscript.open(filePath, { readOnly: true });
        try {
            const pklMetadata = transcript.metadata;
            return {
                content: transcript.content,
                mimeType: 'text/plain', // pkl content is plain text (enhanced transcript)
                metadata: convertPklMetadataToTranscriptMetadata(pklMetadata),
                title: pklMetadata.title,
            };
        } finally {
            transcript.close();
        }
    } else {
        // .md file - read as raw text
        const content = await fs.readFile(filePath, 'utf-8');
        return {
            content,
            mimeType: 'text/markdown',
            metadata: {}, // Metadata parsing is done elsewhere for md files
            title: undefined,
        };
    }
}

/**
 * Check if .pkl format support is available
 */
export async function isPklSupportAvailable(): Promise<boolean> {
    // Now that protokoll-format is a dependency, it's always available
    return true;
}

/**
 * Convert a .md path to its equivalent .pkl path
 */
export function mdToPklPath(mdPath: string): string {
    return mdPath.replace(/\.md$/, '.pkl');
}

/**
 * Convert a .pkl path to its equivalent .md path
 */
export function pklToMdPath(pklPath: string): string {
    return pklPath.replace(/\.pkl$/, '.md');
}

/**
 * Resolve a transcript identifier to an actual file path
 * 
 * The identifier can be:
 * - A path with extension (.md or .pkl) - checks that specific file
 * - A path without extension - checks .pkl first, then .md
 * 
 * @param identifier The transcript identifier (with or without extension)
 * @param baseDirectory Optional base directory to resolve relative paths
 * @returns The resolved file info, or null if not found
 */
export async function resolveTranscriptPath(
    identifier: string,
    baseDirectory?: string
): Promise<{ exists: boolean; format: 'md' | 'pkl' | null; path: string | null }> {
    // Resolve the base path
    let basePath = identifier;
    if (baseDirectory && !path.isAbsolute(identifier)) {
        basePath = path.resolve(baseDirectory, identifier);
    }
    
    return transcriptExists(basePath);
}

/**
 * Check if a transcript file exists (either .md or .pkl)
 * 
 * If the path has an extension, checks that specific file.
 * If no extension, checks .pkl first (preferred), then .md.
 */
export async function transcriptExists(basePath: string): Promise<{ exists: boolean; format: 'md' | 'pkl' | null; path: string | null }> {
    // If path already has extension, check that specific file
    if (isPklFile(basePath)) {
        try {
            await fs.access(basePath);
            return { exists: true, format: 'pkl', path: basePath };
        } catch {
            return { exists: false, format: null, path: null };
        }
    }
  
    if (isMdFile(basePath)) {
        try {
            await fs.access(basePath);
            return { exists: true, format: 'md', path: basePath };
        } catch {
            return { exists: false, format: null, path: null };
        }
    }
  
    // No extension - check both formats, prefer .pkl
    const pklPath = basePath + '.pkl';
    const mdPath = basePath + '.md';
  
    try {
        await fs.access(pklPath);
        return { exists: true, format: 'pkl', path: pklPath };
    } catch {
        try {
            await fs.access(mdPath);
            return { exists: true, format: 'md', path: mdPath };
        } catch {
            return { exists: false, format: null, path: null };
        }
    }
}

/**
 * Get the preferred output format for new transcripts
 * 
 * This can be configured via environment variable or config file.
 * Default is 'md' for backward compatibility.
 */
export function getPreferredOutputFormat(): 'md' | 'pkl' {
    const envFormat = process.env.PROTOKOLL_OUTPUT_FORMAT?.toLowerCase();
    if (envFormat === 'pkl') {
        return 'pkl';
    }
    return 'md';
}

/**
 * Convert PklTranscript metadata to the legacy TranscriptMetadata format
 */
export function convertPklMetadataToTranscriptMetadata(
    pklMetadata: PklMetadata
): TranscriptMetadata {
    return {
        date: pklMetadata.date instanceof Date 
            ? pklMetadata.date.toISOString().split('T')[0] 
            : undefined,
        time: pklMetadata.recordingTime,
        project: pklMetadata.project,
        projectId: pklMetadata.projectId,
        destination: pklMetadata.routing?.destination,
        confidence: pklMetadata.routing?.confidence?.toString(),
        tags: pklMetadata.tags,
        duration: pklMetadata.duration,
    };
}
