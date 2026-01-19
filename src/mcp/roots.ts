/**
 * MCP Roots Module
 * 
 * Enables the server to discover filesystem boundaries exposed by the client.
 * Roots define where the server is allowed to operate.
 * 
 * Key behaviors:
 * - Server requests roots via roots/list
 * - Client may notify of changes via notifications/roots/list_changed
 * - All root URIs are file:// URIs
 */

import type { McpRoot } from './types';

// Cached roots from the client
let cachedRoots: McpRoot[] | null = null;
let rootsListChangedSupported = false;

/**
 * Check if the client supports roots
 */
export function clientSupportsRoots(clientCapabilities: unknown): {
    supported: boolean;
    listChangedSupported: boolean;
} {
    const caps = clientCapabilities as Record<string, unknown> | undefined;
    const roots = caps?.roots as Record<string, unknown> | undefined;
    
    if (!roots) {
        return { supported: false, listChangedSupported: false };
    }

    return {
        supported: true,
        listChangedSupported: roots.listChanged === true,
    };
}

/**
 * Store client capabilities for roots
 */
export function initializeRoots(clientCapabilities: unknown): void {
    const { listChangedSupported } = clientSupportsRoots(clientCapabilities);
    rootsListChangedSupported = listChangedSupported;
    cachedRoots = null; // Clear cache on init
}

/**
 * Cache roots received from the client
 */
export function setRoots(roots: McpRoot[]): void {
    cachedRoots = roots;
}

/**
 * Clear cached roots (call when roots/list_changed notification received)
 */
export function clearRootsCache(): void {
    cachedRoots = null;
}

/**
 * Get cached roots (returns null if not yet fetched)
 */
export function getCachedRoots(): McpRoot[] | null {
    return cachedRoots;
}

/**
 * Check if a path is within any of the roots
 */
export function isPathWithinRoots(path: string, roots: McpRoot[]): boolean {
    const normalizedPath = normalizePath(path);
    
    for (const root of roots) {
        const rootPath = fileUriToPath(root.uri);
        if (rootPath && normalizedPath.startsWith(normalizePath(rootPath))) {
            return true;
        }
    }
    
    return false;
}

/**
 * Find which root a path belongs to
 */
export function findRootForPath(path: string, roots: McpRoot[]): McpRoot | null {
    const normalizedPath = normalizePath(path);
    
    // Find the most specific (longest) matching root
    let bestMatch: McpRoot | null = null;
    let bestMatchLength = 0;
    
    for (const root of roots) {
        const rootPath = fileUriToPath(root.uri);
        if (rootPath) {
            const normalizedRoot = normalizePath(rootPath);
            if (normalizedPath.startsWith(normalizedRoot) && normalizedRoot.length > bestMatchLength) {
                bestMatch = root;
                bestMatchLength = normalizedRoot.length;
            }
        }
    }
    
    return bestMatch;
}

/**
 * Convert a file:// URI to a filesystem path
 */
export function fileUriToPath(uri: string): string | null {
    if (!uri.startsWith('file://')) {
        return null;
    }
    
    try {
        const url = new URL(uri);
        return decodeURIComponent(url.pathname);
    } catch {
        return null;
    }
}

/**
 * Convert a filesystem path to a file:// URI
 */
export function pathToFileUri(path: string): string {
    // Normalize path separators
    const normalized = path.replace(/\\/g, '/');
    
    // Ensure path starts with /
    const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
    
    return `file://${encodeURIComponent(withLeadingSlash).replace(/%2F/g, '/')}`;
}

/**
 * Normalize a path for comparison
 */
function normalizePath(path: string): string {
    // Remove trailing slashes, normalize separators
    return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Get human-readable root names for display
 */
export function getRootDisplayNames(roots: McpRoot[]): string[] {
    return roots.map(root => root.name || fileUriToPath(root.uri) || root.uri);
}

/**
 * Validate that all provided paths are within roots
 * Returns paths that are NOT within roots
 */
export function validatePathsAgainstRoots(paths: string[], roots: McpRoot[]): string[] {
    return paths.filter(path => !isPathWithinRoots(path, roots));
}
