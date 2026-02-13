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
import * as Cardigantime from '@utilarium/cardigantime';

const DEFAULT_CONFIG_FILE = 'protokoll-config.yaml';
const cardigantime = Cardigantime.create({
    defaults: {
        configDirectory: '.',
        configFile: DEFAULT_CONFIG_FILE,
        isRequired: false,
    },
    configShape: {},
    features: ['config', 'hierarchical'],
});

async function readConfigFromDirectory(directory: string): Promise<Record<string, unknown>> {
    const previousCwd = process.cwd();
    try {
        process.chdir(directory);
        return await cardigantime.read({});
    } finally {
        process.chdir(previousCwd);
    }
}

// ============================================================================
// Server Configuration State
// ============================================================================

/**
 * Server mode:
 * - "remote": Server is pre-configured with workspace directories (HTTP server).
 *             Tools should NOT accept directory parameters - they're already set.
 * - "local": Server runs in local mode (stdio). Tools accept directory parameters
 *            and perform their own discovery.
 */
export type ServerMode = 'remote' | 'local';

interface ServerConfig {
    mode: ServerMode;
    context: ContextInstance | null;
    workspaceRoot: string | null;
    inputDirectory: string | null;
    outputDirectory: string | null;
    processedDirectory: string | null;
    configFilePath: string | null;
    configFile: Record<string, unknown> | null;
    initialized: boolean;
}

let serverConfig: ServerConfig = {
    mode: 'local',
    context: null,
    workspaceRoot: null,
    inputDirectory: null,
    outputDirectory: null,
    processedDirectory: null,
    configFilePath: null,
    configFile: null,
    initialized: false,
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize server configuration from workspace roots
 * Should be called once when the server starts or when roots change
 * 
 * @param roots - Workspace roots (for remote mode)
 * @param mode - Server mode: 'remote' (pre-configured) or 'local' (dynamic discovery)
 */
export async function initializeServerConfig(roots: McpRoot[], mode: ServerMode = 'local'): Promise<void> {
    // Find the first workspace root
    const workspaceRoot = roots.length > 0 ? fileUriToPath(roots[0].uri) : null;
    
    if (!workspaceRoot) {
        // No workspace root available - use cwd as fallback
        serverConfig = {
            mode,
            context: null,
            workspaceRoot: process.cwd(),
            inputDirectory: resolve(process.cwd(), './recordings'),
            outputDirectory: resolve(process.cwd(), './notes'),
            processedDirectory: resolve(process.cwd(), './processed'),
            configFilePath: null,
            configFile: null,
            initialized: true,
        };
        return;
    }

    try {
        const configFile = await readConfigFromDirectory(workspaceRoot);
        const resolvedConfigDirs = (configFile as any).resolvedConfigDirs as unknown;
        const configFilePath = Array.isArray(resolvedConfigDirs) && resolvedConfigDirs.length > 0
            ? resolve(resolvedConfigDirs[0], DEFAULT_CONFIG_FILE)
            : null;

        // Resolve contextDirectories from config (relative to workspace root)
        const rawContextDirs = configFile.contextDirectories as string[] | undefined;
        const resolvedContextDirs = rawContextDirs?.map(dir => 
            dir.startsWith('/') ? dir : resolve(workspaceRoot, dir)
        );

        // Load context from workspace root, using explicit contextDirectories if provided
        const context = await Context.create({
            startingDir: workspaceRoot,
            contextDirectories: resolvedContextDirs,
        });

        const contextConfig = context.getConfig();
        const mergedConfig = {
            ...contextConfig,
            ...configFile,
        } as Record<string, unknown>;
        
        serverConfig = {
            mode,
            context,
            workspaceRoot,
            inputDirectory: resolveDirectory(mergedConfig.inputDirectory as string | undefined, workspaceRoot, './recordings'),
            outputDirectory: resolveDirectory(mergedConfig.outputDirectory as string | undefined, workspaceRoot, './notes'),
            processedDirectory: resolveDirectory(mergedConfig.processedDirectory as string | undefined, workspaceRoot, './processed'),
            configFilePath,
            configFile: configFile ?? null,
            initialized: true,
        };
    } catch {
        // Context not available - use defaults relative to workspace
        const configFile = await readConfigFromDirectory(workspaceRoot);
        const resolvedConfigDirs = (configFile as any).resolvedConfigDirs as unknown;
        const configFilePath = Array.isArray(resolvedConfigDirs) && resolvedConfigDirs.length > 0
            ? resolve(resolvedConfigDirs[0], DEFAULT_CONFIG_FILE)
            : null;
        const mergedConfig = (configFile ?? {}) as Record<string, unknown>;

        serverConfig = {
            mode,
            context: null,
            workspaceRoot,
            inputDirectory: resolveDirectory(mergedConfig.inputDirectory as string | undefined, workspaceRoot, './recordings'),
            outputDirectory: resolveDirectory(mergedConfig.outputDirectory as string | undefined, workspaceRoot, './notes'),
            processedDirectory: resolveDirectory(mergedConfig.processedDirectory as string | undefined, workspaceRoot, './processed'),
            configFilePath,
            configFile: configFile ?? null,
            initialized: true,
        };
    }
}

/**
 * Reload server configuration (call when roots change)
 */
export async function reloadServerConfig(roots: McpRoot[], mode: ServerMode = 'local'): Promise<void> {
    await initializeServerConfig(roots, mode);
}

/**
 * Clear server configuration
 */
export function clearServerConfig(): void {
    serverConfig = {
        mode: 'local',
        context: null,
        workspaceRoot: null,
        inputDirectory: null,
        outputDirectory: null,
        processedDirectory: null,
        configFilePath: null,
        configFile: null,
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
    mode: ServerMode;
    context: ContextInstance | null;
    workspaceRoot: string;
    inputDirectory: string;
    outputDirectory: string;
    processedDirectory: string | null;
    configFilePath: string | null;
    configFile: Record<string, unknown> | null;
    initialized: boolean;
    } {
    if (!serverConfig.initialized) {
        throw new Error('Server configuration not initialized. Call initializeServerConfig() first.');
    }
    
    return {
        mode: serverConfig.mode,
        context: serverConfig.context,
        workspaceRoot: serverConfig.workspaceRoot!,
        inputDirectory: serverConfig.inputDirectory!,
        outputDirectory: serverConfig.outputDirectory!,
        processedDirectory: serverConfig.processedDirectory,
        configFilePath: serverConfig.configFilePath,
        configFile: serverConfig.configFile,
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

/**
 * Get the server mode
 * Returns 'local' if not initialized
 */
export function getServerMode(): ServerMode {
    return serverConfig.mode;
}

/**
 * Check if server is running in remote mode (pre-configured workspace)
 */
export function isRemoteMode(): boolean {
    return serverConfig.mode === 'remote';
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
