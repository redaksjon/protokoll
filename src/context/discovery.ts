/**
 * Hierarchical Configuration Discovery
 * 
 * Follows Cardigantime pattern: walks up directory tree finding .protokoll/
 * directories. Merges config with local taking precedence.
 * 
 * Example:
 *   /home/user/projects/work/projectA/  <- CWD
 *       └── .protokoll/config.yaml     <- Highest precedence
 *   /home/user/projects/work/
 *       └── .protokoll/config.yaml     <- Work context
 *   /home/user/
 *       └── .protokoll/config.yaml     <- User defaults
 * 
 * Design Note: This module is designed to be self-contained and may be
 * extracted for use in other tools (kronologi, observasjon) in the future.
 */

import * as path from 'node:path';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import { ContextDiscoveryOptions, DiscoveredContextDir, HierarchicalContextResult } from './types';

/**
 * Discover configuration directories by walking up the directory tree
 */
export const discoverConfigDirectories = async (
    options: ContextDiscoveryOptions
): Promise<DiscoveredContextDir[]> => {
    const {
        configDirName,
        maxLevels = 10,
        startingDir = process.cwd(),
    } = options;

    const discovered: DiscoveredContextDir[] = [];
    let currentDir = path.resolve(startingDir);
    let level = 0;
    const visited = new Set<string>();

    while (level < maxLevels) {
        const realPath = path.resolve(currentDir);
        if (visited.has(realPath)) break;
        visited.add(realPath);

        const configDirPath = path.join(currentDir, configDirName);
    
        try {
            const stat = await fs.stat(configDirPath);
            if (stat.isDirectory()) {
                discovered.push({ path: configDirPath, level });
            }
        } catch {
            // Directory doesn't exist, continue searching
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break; // Reached root
    
        currentDir = parentDir;
        level++;
    }

    return discovered;
};

/**
 * Load and merge hierarchical configuration
 */
export const loadHierarchicalConfig = async (
    options: ContextDiscoveryOptions
): Promise<HierarchicalContextResult> => {
    const discoveredDirs = await discoverConfigDirectories(options);
  
    if (discoveredDirs.length === 0) {
        return {
            config: {},
            discoveredDirs: [],
            contextDirs: [],
        };
    }

    // Sort by level descending (lowest precedence first)
    const sortedDirs = [...discoveredDirs].sort((a, b) => b.level - a.level);
  
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
            // No config file in this directory
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

    // Merge configs (later entries override earlier)
    const mergedConfig = configs.reduce(
        (acc, curr) => deepMerge(acc, curr), 
    {} as Record<string, unknown>
    );

    return {
        config: mergedConfig,
        discoveredDirs,
        contextDirs,
    };
};

/**
 * Deep merge utility (similar to Cardigantime's implementation)
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: T): T {
    if (source === null || source === undefined) return target;
    if (target === null || target === undefined) return source;
  
    if (typeof source !== 'object' || typeof target !== 'object') {
        return source;
    }
  
    if (Array.isArray(source)) {
        return [...source] as unknown as T;
    }
  
    const result = { ...target } as Record<string, unknown>;
  
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const targetVal = result[key];
            const sourceVal = source[key];
      
            if (
                typeof targetVal === 'object' && 
        typeof sourceVal === 'object' &&
        targetVal !== null &&
        sourceVal !== null &&
        !Array.isArray(targetVal) && 
        !Array.isArray(sourceVal)
            ) {
                result[key] = deepMerge(
          targetVal as Record<string, unknown>, 
          sourceVal as Record<string, unknown>
                );
            } else {
                result[key] = sourceVal;
            }
        }
    }
  
    return result as T;
}

