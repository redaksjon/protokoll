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
 * Parse a .pkl transcript file
 * 
 * Note: This is a placeholder that will be implemented when protokoll-format
 * is added as a dependency. For now, it throws an error indicating .pkl
 * support is not yet available.
 */
export async function parsePklTranscript(filePath: string): Promise<ParsedTranscript> {
    // TODO: Implement when protokoll-format is added as dependency
    // const { PklTranscript } = await import('@redaksjon/protokoll-format');
    // const transcript = PklTranscript.open(filePath, { readOnly: true });
    // ... convert to ParsedTranscript format
  
    throw new Error(
        `PKL format support not yet implemented. File: ${filePath}. ` +
    'Install @redaksjon/protokoll-format and update this adapter.'
    );
}

/**
 * Check if .pkl format support is available
 * 
 * Note: This uses a dynamic require to avoid TypeScript compile-time errors
 * when the package is not installed.
 */
export async function isPklSupportAvailable(): Promise<boolean> {
    try {
        // Use dynamic import with a variable to avoid TypeScript checking
        const moduleName = '@redaksjon/protokoll-format';
        await import(/* @vite-ignore */ moduleName);
        return true;
    } catch {
        return false;
    }
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
 * Check if a transcript file exists (either .md or .pkl)
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
 * Metadata conversion utilities
 */
export function convertPklMetadataToTranscriptMetadata(
    pklMetadata: Record<string, unknown>
): TranscriptMetadata {
    return {
        date: pklMetadata.date instanceof Date 
            ? pklMetadata.date.toISOString().split('T')[0] 
            : pklMetadata.date as string | undefined,
        time: pklMetadata.recordingTime as string | undefined,
        project: pklMetadata.project as string | undefined,
        projectId: pklMetadata.projectId as string | undefined,
        destination: (pklMetadata.routing as Record<string, unknown>)?.destination as string | undefined,
        confidence: (pklMetadata.routing as Record<string, unknown>)?.confidence?.toString(),
        tags: pklMetadata.tags as string[] | undefined,
        duration: pklMetadata.duration as string | undefined,
    };
}
