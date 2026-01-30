import {
    discoverContextRoot,
} from '@utilarium/overcontext';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

/**
 * Discovered context directory (backwards compatible).
 */
export interface DiscoveredContextDir {
  path: string;
  level: number;
}

/**
 * Hierarchical context result (backwards compatible).
 */
export interface HierarchicalContextResult {
  config: Record<string, unknown>;
  discoveredDirs: DiscoveredContextDir[];
  contextDirs: string[];
}

/**
 * Discovery options (backwards compatible).
 */
export interface ContextDiscoveryOptions {
  configDirName: string;
  configFileName: string;
  maxLevels?: number;
  startingDir?: string;
}

/**
 * Discover configuration directories by walking up the directory tree.
 * Wrapper around overcontext's discovery.
 */
export const discoverConfigDirectories = async (
    options: ContextDiscoveryOptions
): Promise<DiscoveredContextDir[]> => {
    const contextRoot = await discoverContextRoot({
        startDir: options.startingDir || process.cwd(),
        contextDirName: options.configDirName,
        maxLevels: options.maxLevels || 10,
    });
  
    return contextRoot.directories.map(dir => ({
        path: dir.path,
        level: dir.level,
    }));
};

/**
 * Resolve context directory path based on configuration.
 * Priority:
 * 1. Explicit contextDirectory in config.yaml
 * 2. ./context/ at repository root (sibling to .protokoll/)
 * 3. .protokoll/context/ (backward compatibility)
 * 
 * @param protokollDirPath - Path to the .protokoll directory
 * @param config - Parsed config.yaml content (if exists)
 */
const resolveContextDirectory = async (
    protokollDirPath: string,
    config: Record<string, unknown> | null
): Promise<string | null> => {
    // Get repository root (parent of .protokoll/)
    const repoRoot = path.dirname(protokollDirPath);
    
    // If config specifies a contextDirectory, use it
    if (config && typeof config.contextDirectory === 'string') {
        const explicitPath = path.isAbsolute(config.contextDirectory)
            ? config.contextDirectory
            : path.resolve(repoRoot, config.contextDirectory);
        
        try {
            const stat = await fs.stat(explicitPath);
            if (stat.isDirectory()) {
                return explicitPath;
            }
        } catch {
            // Explicit path doesn't exist, continue to defaults
        }
    }
    
    // Default: Look for ./context/ at repository root (sibling to .protokoll/)
    const rootContextDir = path.join(repoRoot, 'context');
    
    try {
        const stat = await fs.stat(rootContextDir);
        if (stat.isDirectory()) {
            return rootContextDir;
        }
    } catch {
        // Root context doesn't exist, try fallback
    }
    
    // Fallback: .protokoll/context/ (backward compatibility)
    const legacyContextDir = path.join(protokollDirPath, 'context');
    
    try {
        const stat = await fs.stat(legacyContextDir);
        if (stat.isDirectory()) {
            return legacyContextDir;
        }
    } catch {
        // No context directory found
    }
    
    return null;
};

/**
 * Load and merge hierarchical configuration.
 * Wrapper around overcontext's discovery.
 */
export const loadHierarchicalConfig = async (
    options: ContextDiscoveryOptions
): Promise<HierarchicalContextResult> => {
    const discovered = await discoverConfigDirectories(options);
  
    if (discovered.length === 0) {
        return {
            config: {},
            discoveredDirs: [],
            contextDirs: [],
        };
    }
  
    // Load config files and merge
    const sortedDirs = [...discovered].sort((a, b) => b.level - a.level);
    const configs: Record<string, unknown>[] = [];
    const contextDirs: string[] = [];
  
    for (const dir of sortedDirs) {
        const configPath = path.join(dir.path, options.configFileName);
        let parsedConfig: Record<string, unknown> | null = null;
    
        try {
            const content = await fs.readFile(configPath, 'utf-8');
            const parsed = yaml.load(content);
            if (parsed && typeof parsed === 'object') {
                parsedConfig = parsed as Record<string, unknown>;
                configs.push(parsedConfig);
            }
        } catch {
            // No config file
        }
    
        // Resolve context directory using new logic
        const contextDir = await resolveContextDirectory(dir.path, parsedConfig);
        if (contextDir) {
            contextDirs.push(contextDir);
        }
    }
  
    // Merge configs
    const mergedConfig = configs.reduce(
        (acc, curr) => ({ ...acc, ...curr }),
    {} as Record<string, unknown>
    );
  
    return {
        config: mergedConfig,
        discoveredDirs: discovered,
        contextDirs,
    };
};
