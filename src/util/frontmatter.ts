/**
 * Frontmatter parsing utilities using gray-matter
 * 
 * This module provides reliable YAML frontmatter parsing for transcript files,
 * consolidating all machine-readable data in frontmatter.
 */

import matter from 'gray-matter';
import { TranscriptMetadata, parseEntityMetadata, applyLifecycleDefaults, TranscriptStatus, StatusTransition, Task } from './metadata';

export interface ParsedFrontmatter {
    /** Parsed metadata from frontmatter (with lifecycle defaults applied) */
    metadata: TranscriptMetadata;
    /** Clean body content (no entity section, no legacy metadata sections) */
    body: string;
    /** Whether this file needs migration (old format detected) */
    needsMigration: boolean;
}

// Re-export types for convenience
export type { TranscriptMetadata, TranscriptStatus, StatusTransition, Task };

/**
 * Parse a transcript file using gray-matter
 * Handles both new format (all metadata in frontmatter) and old format (entities in body)
 */
export function parseTranscriptContent(content: string): ParsedFrontmatter {
    // Parse frontmatter using gray-matter
    const { data: frontmatter, content: rawBody } = matter(content);
    
    // Detect if this is old format
    const needsMigration = isOldFormat(content, frontmatter);
    
    // Build metadata from frontmatter
    let metadata: TranscriptMetadata = {
        title: frontmatter.title,
        date: frontmatter.date ? new Date(frontmatter.date) : undefined,
        recordingTime: frontmatter.recordingTime,
        duration: frontmatter.duration,
        project: frontmatter.project,
        projectId: frontmatter.projectId,
        tags: frontmatter.tags,
        confidence: frontmatter.confidence,
        routing: frontmatter.routing,
        status: frontmatter.status,
        history: frontmatter.history,
        tasks: frontmatter.tasks,
        entities: frontmatter.entities,
    };
    
    // If entities not in frontmatter, try to extract from body (old format)
    if (!metadata.entities) {
        const extractedEntities = parseEntityMetadata(rawBody);
        if (extractedEntities) {
            metadata.entities = extractedEntities;
        }
    }
    
    // Extract title from body if not in frontmatter (old format)
    let cleanBody = rawBody;
    const titleMatch = rawBody.match(/^#\s+(.+)$/m);
    
    if (!metadata.title && titleMatch) {
        // No title in frontmatter, extract from H1
        metadata.title = titleMatch[1].trim();
        cleanBody = rawBody.replace(/^#\s+.+$/m, '').trim();
    } else if (metadata.title && titleMatch) {
        // Title in frontmatter, remove H1 from body
        cleanBody = rawBody.replace(/^#\s+.+$/m, '').trim();
    }
    
    // Apply lifecycle defaults
    metadata = applyLifecycleDefaults(metadata);
    
    // Clean the body (remove entity section if present)
    cleanBody = stripLegacySections(cleanBody);
    
    return {
        metadata,
        body: cleanBody,
        needsMigration,
    };
}

/**
 * Detect if a file is in old format
 */
function isOldFormat(content: string, frontmatter: Record<string, unknown>): boolean {
    // No frontmatter at all
    if (!content.startsWith('---')) {
        return true;
    }
    
    // Has frontmatter but entities are in body, not frontmatter
    if (!frontmatter.entities && content.includes('## Entity References')) {
        return true;
    }
    
    // Has legacy ## Metadata section in body
    if (content.includes('\n## Metadata\n')) {
        return true;
    }
    
    return false;
}

/**
 * Strip legacy sections from body content
 * Removes: ## Entity References, ## Metadata
 */
export function stripLegacySections(body: string): string {
    let clean = body;
    
    // Remove ## Entity References section (at end of file)
    // Pattern: optional separator (---), then ## Entity References, then everything after
    clean = clean.replace(/\n---\n+## Entity References[\s\S]*$/, '');
    clean = clean.replace(/## Entity References[\s\S]*$/, '');
    
    // Remove ## Metadata section (at start, before content)
    // This is trickier - it's between title and content
    // Pattern: ## Metadata ... --- (the --- is the separator before content)
    clean = clean.replace(/## Metadata[\s\S]*?\n---\n/, '');
    
    return clean.trim();
}

/**
 * Check if metadata has any entities
 */
export function hasEntities(entities: TranscriptMetadata['entities']): boolean {
    if (!entities) return false;
    return !!(
        entities.people?.length || 
        entities.projects?.length || 
        entities.terms?.length || 
        entities.companies?.length
    );
}

// ============================================================================
// Writing Functions
// ============================================================================

/**
 * Build a frontmatter object from TranscriptMetadata
 * Only includes non-empty values to keep YAML clean
 */
export function buildFrontmatter(metadata: TranscriptMetadata): Record<string, unknown> {
    const fm: Record<string, unknown> = {};
    
    // Core fields
    if (metadata.title) fm.title = metadata.title;
    if (metadata.date) fm.date = metadata.date.toISOString();
    if (metadata.recordingTime) fm.recordingTime = metadata.recordingTime;
    if (metadata.duration) fm.duration = metadata.duration;
    if (metadata.project) fm.project = metadata.project;
    if (metadata.projectId) fm.projectId = metadata.projectId;
    if (metadata.tags && metadata.tags.length > 0) fm.tags = metadata.tags;
    if (metadata.confidence !== undefined) fm.confidence = metadata.confidence;
    
    // Routing
    if (metadata.routing) fm.routing = metadata.routing;
    
    // Lifecycle
    if (metadata.status) fm.status = metadata.status;
    if (metadata.history && metadata.history.length > 0) fm.history = metadata.history;
    if (metadata.tasks && metadata.tasks.length > 0) fm.tasks = metadata.tasks;
    
    // Entities (now in frontmatter, not in body)
    if (hasEntities(metadata.entities)) {
        fm.entities = metadata.entities;
    }
    
    return fm;
}

/**
 * Stringify a transcript with YAML frontmatter
 * Uses gray-matter for consistent output
 * Ensures title is ONLY in frontmatter, never in body
 */
export function stringifyTranscript(metadata: TranscriptMetadata, body: string): string {
    const frontmatter = buildFrontmatter(metadata);
    
    // Clean the body (remove any legacy sections)
    let cleanBody = stripLegacySections(body);
    
    // Remove any leading frontmatter delimiters from the body
    // This can happen if the body was extracted incorrectly or has leftover delimiters
    cleanBody = cleanBody.replace(/^---\s*\n/, '').trim();
    
    // Remove H1 title from body if it matches the frontmatter title
    // Title should ONLY be in frontmatter
    if (metadata.title) {
        // Remove exact H1 match
        const h1Pattern = new RegExp(`^#\\s+${escapeRegex(metadata.title)}\\s*$`, 'm');
        cleanBody = cleanBody.replace(h1Pattern, '').trim();
        
        // Also remove any H1 at the start of the body (common pattern)
        cleanBody = cleanBody.replace(/^#\s+.+$/m, '').trim();
    }
    
    // Use gray-matter to create the output
    // It handles YAML serialization, escaping, etc.
    return matter.stringify(cleanBody + '\n', frontmatter);
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Update a transcript's content while preserving/updating metadata
 * This is the main function for saving transcripts in the new format
 */
export function updateTranscript(
    originalContent: string,
    updates: {
        body?: string;
        metadata?: Partial<TranscriptMetadata>;
    }
): string {
    // Parse the original
    const parsed = parseTranscriptContent(originalContent);
    
    // Merge metadata updates
    const newMetadata: TranscriptMetadata = {
        ...parsed.metadata,
        ...updates.metadata,
    };
    
    // Use updated body or original
    const newBody = updates.body ?? parsed.body;
    
    // Stringify with new format
    return stringifyTranscript(newMetadata, newBody);
}
