/**
 * MCP Server Configuration
 * 
 * Centralized configuration management for the MCP server.
 * Uses workspace roots to discover and load Protokoll configuration.
 * 
 * This eliminates the need for each tool to navigate up the directory tree
 * to find configuration. Instead, configuration is loaded once at the
 * workspace level and shared across all tools.
 */

import * as Context from '@/context';
import type { ContextInstance } from '@/context';
import type { McpRoot } from './types';
import { fileUriToPath } from './roots';
import { resolve } from 'node:path';

// ============================================================================
// Server Configuration State
// ============================================================================

interface ServerConfig {
    context: ContextInstance | null;
    workspaceRoot: string | null;
    inputDirectory: string | null;
    outputDirectory: string | null;
    processedDirectory: string | null;
    initialized: boolean;
}

let serverConfig: ServerConfig = {
    context: null,
    workspaceRoot: null,
    inputDirectory: null,
    outputDirectory: null,
    processedDirectory: null,
    initialized: false,
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize server configuration from workspace roots
 * Should be called once when the server starts or when roots change
 */
export async function initializeServerConfig(roots: McpRoot[]): Promise<void> {
    // Find the first workspace root
    const workspaceRoot = roots.length > 0 ? fileUriToPath(roots[0].uri) : null;
    
    if (!workspaceRoot) {
        // No workspace root available - use cwd as fallback
        serverConfig = {
            context: null,
            workspaceRoot: process.cwd(),
            inputDirectory: resolve(process.cwd(), './recordings'),
            outputDirectory: resolve(process.cwd(), './notes'),
            processedDirectory: resolve(process.cwd(), './processed'),
            initialized: true,
        };
        return;
    }

    try {
        // Load context from workspace root
        const context = await Context.create({
            startingDir: workspaceRoot,
        });

        const config = context.getConfig();
        
        serverConfig = {
            context,
            workspaceRoot,
            inputDirectory: resolveDirectory(config.inputDirectory as string | undefined, workspaceRoot, './recordings'),
            outputDirectory: resolveDirectory(config.outputDirectory as string | undefined, workspaceRoot, './notes'),
            processedDirectory: resolveDirectory(config.processedDirectory as string | undefined, workspaceRoot, './processed'),
            initialized: true,
        };
    } catch {
        // Context not available - use defaults relative to workspace
        serverConfig = {
            context: null,
            workspaceRoot,
            inputDirectory: resolve(workspaceRoot, './recordings'),
            outputDirectory: resolve(workspaceRoot, './notes'),
            processedDirectory: resolve(workspaceRoot, './processed'),
            initialized: true,
        };
    }
}

/**
 * Reload server configuration (call when roots change)
 */
export async function reloadServerConfig(roots: McpRoot[]): Promise<void> {
    await initializeServerConfig(roots);
}

/**
 * Clear server configuration
 */
export function clearServerConfig(): void {
    serverConfig = {
        context: null,
        workspaceRoot: null,
        inputDirectory: null,
        outputDirectory: null,
        processedDirectory: null,
        initialized: false,
    };
}

// ============================================================================
// Accessors
// ============================================================================

/**
 * Get the server configuration
 * Throws if not initialized
 */
export function getServerConfig(): {
    context: ContextInstance | null;
    workspaceRoot: string;
    inputDirectory: string;
    outputDirectory: string;
    processedDirectory: string | null;
    initialized: boolean;
    } {
    if (!serverConfig.initialized) {
        throw new Error('Server configuration not initialized. Call initializeServerConfig() first.');
    }
    
    return {
        context: serverConfig.context,
        workspaceRoot: serverConfig.workspaceRoot!,
        inputDirectory: serverConfig.inputDirectory!,
        outputDirectory: serverConfig.outputDirectory!,
        processedDirectory: serverConfig.processedDirectory,
        initialized: serverConfig.initialized,
    };
}

/**
 * Get the context instance
 */
export function getContext(): ContextInstance | null {
    return serverConfig.context;
}

/**
 * Get the workspace root
 */
export function getWorkspaceRoot(): string | null {
    return serverConfig.workspaceRoot;
}

/**
 * Get the input directory (for audio files)
 * Always returns a string, never null
 */
export function getInputDirectory(): string {
    if (!serverConfig.initialized || !serverConfig.inputDirectory) {
        return resolve(process.cwd(), './recordings');
    }
    return serverConfig.inputDirectory!;
}

/**
 * Get the output directory (for transcripts)
 * Always returns a string, never null
 */
export function getOutputDirectory(): string {
    if (!serverConfig.initialized || !serverConfig.outputDirectory) {
        return resolve(process.cwd(), './notes');
    }
    return serverConfig.outputDirectory!;
}

/**
 * Get the processed directory (for processed audio)
 * Returns null if not configured
 */
export function getProcessedDirectory(): string | null {
    if (!serverConfig.initialized) {
        return null;
    }
    return serverConfig.processedDirectory;
}

/**
 * Check if server configuration is initialized
 */
export function isInitialized(): boolean {
    return serverConfig.initialized;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve a directory path relative to workspace root
 */
function resolveDirectory(
    configValue: string | undefined,
    workspaceRoot: string,
    defaultRelative: string
): string {
    if (configValue) {
        // Expand ~ to home directory
        if (configValue.startsWith('~')) {
            const homeDir = process.env.HOME || process.env.USERPROFILE || '';
            return resolve(homeDir, configValue.substring(1));
        }
        
        // If absolute, use as-is
        if (configValue.startsWith('/')) {
            return configValue;
        }
        
        // Otherwise, resolve relative to workspace
        return resolve(workspaceRoot, configValue);
    }
    
    // Use default relative to workspace
    return resolve(workspaceRoot, defaultRelative);
}
