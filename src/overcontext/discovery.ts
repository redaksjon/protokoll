import {
    discoverContextRoot,
} from '@theunwalked/overcontext';
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
    
        try {
            const content = await fs.readFile(configPath, 'utf-8');
            const parsed = yaml.load(content);
            if (parsed && typeof parsed === 'object') {
                configs.push(parsed as Record<string, unknown>);
            }
        } catch {
            // No config file
        }
    
        // Add context directory
        const contextDir = path.join(dir.path, 'context');
        try {
            const stat = await fs.stat(contextDir);
            if (stat.isDirectory()) {
                contextDirs.push(contextDir);
            }
        } catch {
            // No context subdirectory
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
