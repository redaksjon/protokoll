/**
 * Format Adapter
 * 
 * Provides transparent access to both .md (markdown) and .pkl (SQLite) transcript formats.
 * Detects file type and routes to appropriate implementation.
 */

import * as path from 'node:path';
import * as fs from 'fs/promises';
// Note: @redaksjon/protokoll-format will be available after npm link
// For now, we use dynamic imports to avoid build-time errors
import * as Frontmatter from '../util/frontmatter';
import type { ParsedTranscript, TranscriptListItem } from './operations';

// Type definitions for protokoll-format (to avoid build-time dependency)
interface PklMetadata {
    title?: string;
    date?: Date;
    recordingTime?: string;
    duration?: string;
    project?: string;
    projectId?: string;
    tags?: string[];
    status?: 'initial' | 'enhanced' | 'reviewed' | 'in_progress' | 'closed' | 'archived';
    routing?: {
        destination?: string;
        confidence?: number;
        signals?: string[];
        reasoning?: string;
    };
    tasks?: Array<{ status: string }>;
    entities?: {
        people?: Array<{ id: string; name: string; type: string }>;
        projects?: Array<{ id: string; name: string; type: string }>;
        terms?: Array<{ id: string; name: string; type: string }>;
        companies?: Array<{ id: string; name: string; type: string }>;
    };
}

interface PklTranscriptInstance {
    metadata: PklMetadata;
    content: string;
    hasRawTranscript: boolean;
    close(): void;
}

// Dynamic import for protokoll-format
let PklTranscript: {
    open(path: string, config?: { readOnly?: boolean }): Promise<PklTranscriptInstance>;
} | null = null;

async function getPklTranscript(): Promise<typeof PklTranscript> {
    if (!PklTranscript) {
        try {
            // Use string concatenation to prevent TypeScript from resolving the module at compile time
            const moduleName = '@redaksjon/' + 'protokoll-format';
            const mod = await import(/* @vite-ignore */ moduleName);
            PklTranscript = mod.PklTranscript as typeof PklTranscript;
        } catch {
            // Package not available
            return null;
        }
    }
    return PklTranscript;
}

/**
 * Check if a file is a .pkl format
 */
export function isPklFormat(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.pkl';
}

/**
 * Check if a file is a .md format
 */
export function isMarkdownFormat(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.md';
}

/**
 * Parse a transcript file (either .md or .pkl)
 */
export async function parseTranscriptWithAdapter(filePath: string): Promise<ParsedTranscript> {
    if (isPklFormat(filePath)) {
        return parsePklTranscript(filePath);
    } else {
        return parseMarkdownTranscript(filePath);
    }
}

/**
 * Parse a .pkl transcript file
 */
async function parsePklTranscript(filePath: string): Promise<ParsedTranscript> {
    const PklTranscriptClass = await getPklTranscript();
    if (!PklTranscriptClass) {
        throw new Error('protokoll-format package not available');
    }
    const transcript = await PklTranscriptClass.open(filePath, { readOnly: true });
    
    try {
        const metadata = transcript.metadata;
        
        const result: ParsedTranscript = {
            filePath,
            title: metadata.title,
            metadata: {
                date: metadata.date?.toISOString().split('T')[0],
                time: metadata.recordingTime,
                project: metadata.project,
                projectId: metadata.projectId,
                destination: metadata.routing?.destination,
                confidence: metadata.routing?.confidence?.toString(),
                signals: metadata.routing?.signals,
                reasoning: metadata.routing?.reasoning,
                tags: metadata.tags,
                duration: metadata.duration,
            },
            content: transcript.content,
            // For .pkl files, we reconstruct a "raw text" representation
            rawText: reconstructRawText(metadata, transcript.content),
        };
        
        return result;
    } finally {
        transcript.close();
    }
}

/**
 * Parse a .md transcript file
 */
async function parseMarkdownTranscript(filePath: string): Promise<ParsedTranscript> {
    const rawText = await fs.readFile(filePath, 'utf-8');
    const parsed = Frontmatter.parseTranscriptContent(rawText);
    
    return {
        filePath,
        title: parsed.metadata.title,
        metadata: {
            date: parsed.metadata.date?.toISOString().split('T')[0],
            time: parsed.metadata.recordingTime,
            project: parsed.metadata.project,
            projectId: parsed.metadata.projectId,
            destination: parsed.metadata.routing?.destination,
            confidence: parsed.metadata.routing?.confidence?.toString(),
            signals: parsed.metadata.routing?.signals?.map(s => 
                `${s.type}: ${s.value} (weight: ${s.weight})`
            ),
            reasoning: parsed.metadata.routing?.reasoning,
            tags: parsed.metadata.tags,
            duration: parsed.metadata.duration,
        },
        content: parsed.body,
        rawText,
    };
}

/**
 * Reconstruct a raw text representation from .pkl metadata and content
 * This is used for compatibility with code that expects rawText
 */
function reconstructRawText(metadata: PklMetadata, content: string): string {
    // Build a YAML-like representation
    const lines: string[] = ['---'];
    
    if (metadata.title) lines.push(`title: "${metadata.title}"`);
    if (metadata.date) lines.push(`date: '${metadata.date.toISOString()}'`);
    if (metadata.recordingTime) lines.push(`recordingTime: "${metadata.recordingTime}"`);
    if (metadata.project) lines.push(`project: "${metadata.project}"`);
    if (metadata.projectId) lines.push(`projectId: "${metadata.projectId}"`);
    if (metadata.status) lines.push(`status: ${metadata.status}`);
    if (metadata.duration) lines.push(`duration: "${metadata.duration}"`);
    if (metadata.tags && metadata.tags.length > 0) {
        lines.push('tags:');
        for (const tag of metadata.tags) {
            lines.push(`  - "${tag}"`);
        }
    }
    
    lines.push('---');
    lines.push('');
    lines.push(content);
    
    return lines.join('\n');
}

/**
 * Get list item from a .pkl file
 */
export async function getPklListItem(filePath: string): Promise<TranscriptListItem | null> {
    try {
        const PklTranscriptClass = await getPklTranscript();
        if (!PklTranscriptClass) {
            return null;
        }
        const transcript = await PklTranscriptClass.open(filePath, { readOnly: true });
        const stats = await fs.stat(filePath);
        
        try {
            const metadata = transcript.metadata;
            
            return {
                path: filePath,
                filename: path.basename(filePath),
                date: metadata.date?.toISOString().split('T')[0] || '',
                time: metadata.recordingTime,
                title: metadata.title || 'Untitled',
                hasRawTranscript: transcript.hasRawTranscript,
                createdAt: stats.birthtime,
                status: metadata.status,
                openTasksCount: metadata.tasks?.filter(t => t.status === 'open').length || 0,
                contentSize: transcript.content.length,
                entities: metadata.entities ? {
                    people: metadata.entities.people?.map(p => ({ id: p.id, name: p.name })),
                    projects: metadata.entities.projects?.map(p => ({ id: p.id, name: p.name })),
                    terms: metadata.entities.terms?.map(t => ({ id: t.id, name: t.name })),
                    companies: metadata.entities.companies?.map(c => ({ id: c.id, name: c.name })),
                } : undefined,
            };
        } finally {
            transcript.close();
        }
    } catch {
        return null;
    }
}

/**
 * Get the glob pattern for all transcript files
 */
export function getTranscriptGlobPattern(directory: string): string {
    return path.join(directory, '**/*.{md,pkl}');
}

/**
 * Get the ignore patterns for transcript listing
 */
export function getTranscriptIgnorePatterns(): string[] {
    return ['**/node_modules/**', '**/.transcript/**'];
}
