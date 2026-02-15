 
/**
 * Shared types, constants, and utilities for MCP tools
 */
import { stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { Media, Util as Storage, Transcript as TranscriptUtils } from '@redaksjon/protokoll-engine';
import { getLogger } from '@/logging';
const { transcriptExists, ensurePklExtension } = TranscriptUtils;
import type { Person, Project, Term, Company, IgnoredTerm, Entity } from '@/context/types';
import { parseUri, isProtokolUri } from '../uri';

// ============================================================================
// Shared Utilities
// ============================================================================

export const logger = getLogger();
export const media = Media.create(logger);
export const storage = Storage.create({ log: logger.debug.bind(logger) });

// ============================================================================
// Types
// ============================================================================

export interface ProcessingResult {
    outputPath: string;
    enhancedText: string;
    rawTranscript: string;
    routedProject?: string;
    routingConfidence: number;
    processingTime: number;
    toolsUsed: string[];
    correctionsApplied: number;
}

export interface DiscoveredConfig {
    path: string;
    projectCount: number;
    peopleCount: number;
    termsCount: number;
    companiesCount: number;
    outputDirectory?: string;
    model?: string;
}

export interface ProjectSuggestion {
    projectId: string;
    projectName: string;
    confidence: number;
    reason: string;
    destination?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Helper for async file existence check
 */
export async function fileExists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get a configured directory from server configuration
 * Uses workspace-level configuration instead of navigating up the directory tree
 */
export async function getConfiguredDirectory(
    key: 'inputDirectory' | 'outputDirectory' | 'processedDirectory',
    _contextDirectory?: string  // Kept for backward compatibility but not used
): Promise<string> {
    // Import here to avoid circular dependencies
    const ServerConfig = await import('../serverConfig');
    
    switch (key) {
        case 'inputDirectory':
            return ServerConfig.getInputDirectory();
        case 'outputDirectory':
            return ServerConfig.getOutputDirectory();
        case 'processedDirectory':
            return ServerConfig.getProcessedDirectory() || resolve(process.cwd(), './processed');
    }
}

/**
 * Get context directories from server configuration
 * Returns the contextDirectories array from protokoll-config.yaml if available
 */
export async function getContextDirectories(): Promise<string[] | undefined> {
    // Import here to avoid circular dependencies
    const ServerConfig = await import('../serverConfig');
    
    const config = ServerConfig.getServerConfig();
    return config.configFile?.contextDirectories as string[] | undefined;
}

/**
 * Validate that contextDirectory parameter is not provided in remote mode
 * In remote mode, the server is pre-configured with workspace directories
 * and tools should not accept directory parameters.
 * 
 * @param contextDirectory - The contextDirectory parameter from tool args
 * @throws Error if contextDirectory is provided in remote mode
 */
export async function validateNotRemoteMode(contextDirectory?: string): Promise<void> {
    if (!contextDirectory) {
        return; // No directory parameter provided, OK
    }
    
    // Import here to avoid circular dependencies
    const ServerConfig = await import('../serverConfig');
    
    if (ServerConfig.isRemoteMode()) {
        throw new Error(
            'Directory parameters are not accepted in remote mode. ' +
            'This server is pre-configured with workspace directories from protokoll-config.yaml. ' +
            'Use the protokoll_info tool to check server configuration.'
        );
    }
}

/**
 * Validate that a resolved path stays within a base directory
 * This prevents path traversal attacks using ../ sequences
 * 
 * @param resolvedPath - The resolved absolute path to validate
 * @param baseDirectory - The base directory that paths must stay within
 * @throws Error if the path escapes the base directory
 */
export function validatePathWithinDirectory(
    resolvedPath: string,
    baseDirectory: string
): void {
    // Normalize both paths to handle any ../ sequences
    const normalizedTarget = resolve(resolvedPath);
    const normalizedBase = resolve(baseDirectory);
    
    // Ensure base directory ends with separator for proper prefix matching
    const basePath = normalizedBase.endsWith('/') ? normalizedBase : normalizedBase + '/';
    
    // Check if the target path is within the base directory
    // Must either be exactly the base dir, or start with base dir + separator
    if (normalizedTarget !== normalizedBase && !normalizedTarget.startsWith(basePath)) {
        throw new Error(
            `Security error: Path "${resolvedPath}" is outside the allowed directory "${baseDirectory}". ` +
            `Path traversal is not allowed.`
        );
    }
}

/**
 * Async version of validatePathWithinDirectory that gets the output directory from config
 * 
 * @param resolvedPath - The resolved absolute path to validate
 * @param contextDirectory - Optional context directory for config lookup
 * @throws Error if the path escapes the output directory
 */
export async function validatePathWithinOutputDirectory(
    resolvedPath: string,
    contextDirectory?: string
): Promise<void> {
    const outputDirectory = await getConfiguredDirectory('outputDirectory', contextDirectory);
    validatePathWithinDirectory(resolvedPath, outputDirectory);
}

/**
 * Convert an absolute file path to a relative path (relative to output directory)
 * This ensures no absolute paths are exposed to HTTP MCP clients
 * 
 * @param absolutePath - The absolute file path to convert
 * @param baseDirectory - The base directory to make relative to (default: output directory)
 * @returns Relative path, or the original path if it's already relative
 */
export async function sanitizePath(
    absolutePath: string,
    baseDirectory?: string
): Promise<string> {
    // Guard against undefined/null/empty values
    if (!absolutePath || typeof absolutePath !== 'string') {
        // Return empty string for invalid paths to prevent errors downstream
        return absolutePath || '';
    }
    
    // If it's already a relative path (doesn't start with /), return as-is
    if (!absolutePath.startsWith('/') && !absolutePath.match(/^[A-Za-z]:/)) {
        return absolutePath;
    }
    
    // Get the base directory (output directory by default)
    const base = baseDirectory || await getConfiguredDirectory('outputDirectory');
    
    // Convert to relative path
    try {
        const relativePath = relative(base, absolutePath);
        // If relative() returns an absolute path (when paths are on different drives on Windows),
        // return just the filename as a fallback
        if (relativePath.startsWith('/') || relativePath.match(/^[A-Za-z]:/)) {
            // Extract just the filename
            const parts = absolutePath.split(/[/\\]/);
            return parts[parts.length - 1] || absolutePath;
        }
        return relativePath;
    } catch {
        // If conversion fails, return just the filename
        const parts = absolutePath.split(/[/\\]/);
        return parts[parts.length - 1] || absolutePath;
    }
}

/**
 * Slugify text for IDs and filenames
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/--+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Get audio file metadata (creation time and hash)
 */
export async function getAudioMetadata(audioFile: string): Promise<{ creationTime: Date; hash: string }> {
    // Get creation time from audio file
    let creationTime = await media.getAudioCreationTime(audioFile);
    if (!creationTime) {
        creationTime = new Date();
    }

    // Calculate hash of the file
    const hash = (await storage.hashFile(audioFile, 100)).substring(0, 8);

    return { creationTime, hash };
}

/**
 * Format entity for response
 */
export function formatEntity(entity: Entity): Record<string, unknown> {
    const result: Record<string, unknown> = {
        id: entity.id,
        name: entity.name,
        type: entity.type,
    };

    if (entity.type === 'person') {
        const person = entity as Person;
        if (person.firstName) result.firstName = person.firstName;
        if (person.lastName) result.lastName = person.lastName;
        if (person.company) result.company = person.company;
        if (person.role) result.role = person.role;
        if (person.sounds_like) result.sounds_like = person.sounds_like;
        if (person.context) result.context = person.context;
    } else if (entity.type === 'project') {
        const project = entity as Project;
        if (project.description) result.description = project.description;
        if (project.classification) result.classification = project.classification;
        if (project.routing) result.routing = project.routing;
        if (project.sounds_like) result.sounds_like = project.sounds_like;
        result.active = project.active !== false;
    } else if (entity.type === 'term') {
        const term = entity as Term;
        if (term.expansion) result.expansion = term.expansion;
        if (term.domain) result.domain = term.domain;
        if (term.description) result.description = term.description;
        if (term.sounds_like) result.sounds_like = term.sounds_like;
        if (term.topics) result.topics = term.topics;
        if (term.projects) result.projects = term.projects;
    } else if (entity.type === 'company') {
        const company = entity as Company;
        if (company.fullName) result.fullName = company.fullName;
        if (company.industry) result.industry = company.industry;
        if (company.sounds_like) result.sounds_like = company.sounds_like;
    } else if (entity.type === 'ignored') {
        const ignored = entity as IgnoredTerm;
        if (ignored.reason) result.reason = ignored.reason;
        if (ignored.ignoredAt) result.ignoredAt = ignored.ignoredAt;
    }

    return result;
}

/**
 * Helper to merge arrays: handles replace, add, and remove operations
 */
export function mergeArray(
    existing: string[] | undefined,
    replace: string[] | undefined,
    add: string[] | undefined,
    remove: string[] | undefined
): string[] | undefined {
    // If replace is provided, use it as the base
    if (replace !== undefined) {
        let result = [...replace];
        if (add) {
            result = [...result, ...add.filter(v => !result.includes(v))];
        }
        if (remove) {
            result = result.filter(v => !remove.includes(v));
        }
        return result.length > 0 ? result : undefined;
    }

    // Otherwise work with existing
    let result = existing ? [...existing] : [];
    if (add) {
        result = [...result, ...add.filter(v => !result.includes(v))];
    }
    if (remove) {
        result = result.filter(v => !remove.includes(v));
    }

    // Return undefined if empty (to remove the field from YAML)
    return result.length > 0 ? result : (existing ? undefined : existing);
}

/**
 * Resolve a transcript URI or path to an absolute file path
 * 
 * Accepts:
 * - Protokoll URI: protokoll://transcript/2026/2/12-1606-meeting (preferred)
 * - Relative path: 2026/2/12-1606-meeting or 2026/2/12-1606-meeting.pkl
 * - Absolute path: /full/path/to/transcript.pkl (must be within output directory)
 * 
 * Returns absolute path for internal file operations
 */
export async function resolveTranscriptPath(
    uriOrPath: string,
    contextDirectory?: string
): Promise<string> {
    if (!uriOrPath || typeof uriOrPath !== 'string') {
        throw new Error('transcriptPath is required and must be a non-empty string');
    }
    
    const outputDirectory = await getConfiguredDirectory('outputDirectory', contextDirectory);
    
    let relativePath: string;
    
    // Check if input is a Protokoll URI
    if (isProtokolUri(uriOrPath)) {
        const parsed = parseUri(uriOrPath);
        if (parsed.resourceType !== 'transcript') {
            throw new Error(`Invalid URI: expected transcript URI, got ${parsed.resourceType}`);
        }
        // Extract the transcript path from the URI (without extension)
        // Type assertion is safe because we checked resourceType === 'transcript'
        relativePath = (parsed as any).transcriptPath;
    } else {
        // Handle as a file path (relative or absolute)
        if (isAbsolute(uriOrPath)) {
            const normalizedAbsolute = resolve(uriOrPath);
            const normalizedOutputDir = resolve(outputDirectory);
            
            if (normalizedAbsolute.startsWith(normalizedOutputDir + '/') || normalizedAbsolute === normalizedOutputDir) {
                // Convert absolute path to relative
                relativePath = normalizedAbsolute.substring(normalizedOutputDir.length + 1);
            } else {
                throw new Error(`Path must be within output directory: ${outputDirectory}`);
            }
        } else {
            // Relative path - normalize it
            relativePath = uriOrPath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
        }
    }
    
    // Remove .pkl extension if present (we'll add it back)
    relativePath = relativePath.replace(/\.pkl$/i, '');
    
    // Resolve to absolute path
    const resolvedPath = resolve(outputDirectory, relativePath);
    validatePathWithinDirectory(resolvedPath, outputDirectory);
    
    // Ensure .pkl extension and check if file exists
    const pklPath = ensurePklExtension(resolvedPath);
    const existsResult = await transcriptExists(pklPath);
    if (!existsResult.exists || !existsResult.path) {
        throw new Error(`Transcript not found: ${uriOrPath}`);
    }
    
    return existsResult.path;
}
