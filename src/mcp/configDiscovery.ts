/**
 * Shared Configuration Discovery
 * 
 * Uses CardiganTime to discover protokoll-config.yaml files hierarchically,
 * matching the behavior of protokoll-cli. This module is shared between
 * the stdio server (server.ts) and HTTP server (server-http.ts).
 */

import * as Cardigantime from '@utilarium/cardigantime';
import type { Logger } from '@utilarium/cardigantime';
import { resolve, dirname, basename } from 'node:path';

export const DEFAULT_CONFIG_FILE = 'protokoll-config.yaml';

/**
 * Check if debug mode is enabled via environment or will be via config
 */
function isDebugEnabled(): boolean {
    return process.env.PROTOKOLL_DEBUG === 'true' || process.env.DEBUG === 'true';
}

/**
 * Create a quiet logger that only outputs when debug is enabled
 * and formats messages in a cleaner way
 */
function createQuietLogger(): Logger {
    const debugEnabled = isDebugEnabled();
    
    const noop = () => { /* intentionally empty */ };
    
    const debugLog = debugEnabled 
        ? (message: string, ...args: unknown[]) => {
            // Format the message more cleanly
            // eslint-disable-next-line no-console
            console.error(`[config] ${message}`, ...args);
        }
        : noop;
    
    return {
        debug: noop, // Suppress verbose debug messages
        info: noop,  // Suppress info messages during discovery
        warn: (message: string, ...args: unknown[]) => {
            // eslint-disable-next-line no-console
            console.error(`[config:warn] ${message}`, ...args);
        },
        error: (message: string, ...args: unknown[]) => {
            // eslint-disable-next-line no-console
            console.error(`[config:error] ${message}`, ...args);
        },
        verbose: debugLog,
        silly: noop,
    };
}

/**
 * Parse a CLI argument value from argv
 */
export function getArgValue(argv: string[], flag: string): string | undefined {
    const idx = argv.indexOf(flag);
    if (idx === -1) return undefined;
    const value = argv[idx + 1];
    if (!value || value.startsWith('-')) return undefined;
    return value;
}

/**
 * Read configuration from a directory using CardiganTime
 */
export async function readCardigantimeConfigFromDirectory(
    directory: string,
    configFile: string,
    features: Array<'config' | 'hierarchical'>
): Promise<Record<string, unknown>> {
    const cardigantime = Cardigantime.create({
        defaults: {
            configDirectory: '.',
            configFile,
            isRequired: false,
            // Tell CardiganTime to resolve these path fields relative to the config file's directory
            // Note: contextDirectories must be in BOTH pathFields AND resolvePathArray - 
            // pathFields determines which fields are processed, resolvePathArray determines
            // if array elements should be resolved individually
            pathResolution: {
                pathFields: ['inputDirectory', 'outputDirectory', 'processedDirectory', 'contextDirectories'],
                resolvePathArray: ['contextDirectories'],
            },
        },
        configShape: {},
        features,
        logger: createQuietLogger(),
    });

    const previousCwd = process.cwd();
    try {
        process.chdir(directory);
        return await cardigantime.read({});
    } finally {
        process.chdir(previousCwd);
    }
}

/**
 * Load configuration using CardiganTime from the workspace root
 * This respects environment variables and hierarchical config files
 */
export async function loadCardigantimeConfig(): Promise<Record<string, unknown>> {
    const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
    return await readCardigantimeConfigFromDirectory(workspaceRoot, DEFAULT_CONFIG_FILE, ['config', 'hierarchical']);
}

/**
 * Initialize working directory and WORKSPACE_ROOT from CLI args and config discovery.
 * 
 * Supports:
 * - `--cwd <dir>` to change working directory
 * - `-c <path>` or `--config <path>` to specify config file (matching protokoll-cli)
 * - `PROTOKOLL_CONFIG` environment variable
 * - Hierarchical discovery of protokoll-config.yaml up the directory tree
 */
export async function initializeWorkingDirectoryFromArgsAndConfig(): Promise<void> {
    const argv = process.argv.slice(2);
    const cwdArg = getArgValue(argv, '--cwd');
    // Support both -c and --config (matching protokoll-cli)
    const configArg = getArgValue(argv, '-c') || getArgValue(argv, '--config') || process.env.PROTOKOLL_CONFIG;

    if (cwdArg) {
        process.chdir(resolve(cwdArg));
    }

    // Use CardiganTime (like protokoll-cli) to locate protokoll-config.yaml up the tree.
    // If an explicit config file path is provided, use only that file.
    if (configArg) {
        const configPath = resolve(configArg);
        const configDir = dirname(configPath);
        const configFile = basename(configPath);

        // Expose for downstream code; also makes it easier to debug.
        process.env.PROTOKOLL_CONFIG = configPath;
        process.env.WORKSPACE_ROOT = configDir;

        // Ensure it's readable early (and preserves CardiganTime semantics).
        await readCardigantimeConfigFromDirectory(configDir, configFile, ['config']);
        return;
    }

    const discoveryStart = process.env.WORKSPACE_ROOT || process.cwd();
    const config = await readCardigantimeConfigFromDirectory(
        discoveryStart,
        DEFAULT_CONFIG_FILE,
        ['config', 'hierarchical']
    );

    const resolvedConfigDirs = (config as any).resolvedConfigDirs;
    if (Array.isArray(resolvedConfigDirs) && resolvedConfigDirs.length > 0) {
        process.env.WORKSPACE_ROOT = resolvedConfigDirs[0];
    } else {
        process.env.WORKSPACE_ROOT = discoveryStart;
    }
}
