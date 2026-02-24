/**
 * Configuration Resource
 * 
 * Handles reading Protokoll configuration.
 */

import type { McpResourceContents } from '../types';
import { buildConfigUri, buildEntitiesListUri } from '../uri';
import * as Context from '@/context';
import * as ServerConfig from '../serverConfig';
import { isAbsolute, resolve } from 'node:path';

function isServerConfigInitialized(): boolean {
    try {
        return typeof (ServerConfig as any).isInitialized === 'function' &&
            (ServerConfig as any).isInitialized();
    } catch {
        return false;
    }
}

function getServerContext() {
    try {
        return typeof (ServerConfig as any).getContext === 'function'
            ? (ServerConfig as any).getContext()
            : null;
    } catch {
        return null;
    }
}

function getServerConfigFile(): { contextDirectories?: string[] } | null {
    try {
        return typeof (ServerConfig as any).getServerConfig === 'function'
            ? ((ServerConfig as any).getServerConfig().configFile as { contextDirectories?: string[] } | null)
            : null;
    } catch {
        return null;
    }
}

function getWorkspaceRoot(): string | null {
    try {
        return typeof (ServerConfig as any).getWorkspaceRoot === 'function'
            ? (ServerConfig as any).getWorkspaceRoot()
            : null;
    } catch {
        return null;
    }
}

/**
 * Read configuration resource
 */
export async function readConfigResource(
    configPath?: string
): Promise<McpResourceContents> {
    let startDir = configPath || process.cwd();
    let context;
    const serverConfigReady = isServerConfigInitialized();
    if (serverConfigReady) {
        const serverContext = getServerContext();
        if (serverContext?.hasContext()) {
            context = serverContext;
            startDir = getWorkspaceRoot() || startDir;
        } else {
            const configFile = getServerConfigFile();
            const rawDirs = configFile?.contextDirectories;
            const workspaceRoot = getWorkspaceRoot();
            const effectiveDir = configPath || workspaceRoot || process.cwd();
            const contextDirs = rawDirs && rawDirs.length > 0
                ? rawDirs.map(d => (isAbsolute(d) ? d : resolve(effectiveDir, d)))
                : undefined;
            startDir = effectiveDir;
            context = await Context.create({
                startingDir: effectiveDir,
                contextDirectories: contextDirs,
            });
        }
    } else {
        context = await Context.create({
            startingDir: startDir,
        });
    }

    if (!context.hasContext()) {
        throw new Error(`No Protokoll context found at or above: ${startDir}`);
    }

    const dirs = context.getDiscoveredDirs();
    const config = context.getConfig();

    const configData = {
        hasContext: true,
        discoveredDirectories: dirs.map((d: { path: string; level: number }) => ({
            path: d.path,
            level: d.level,
            isPrimary: d.level === 0,
        })),
        entityCounts: {
            projects: context.getAllProjects().length,
            people: context.getAllPeople().length,
            terms: context.getAllTerms().length,
            companies: context.getAllCompanies().length,
            ignored: context.getAllIgnored().length,
        },
        config: {
            outputDirectory: config.outputDirectory,
            outputStructure: config.outputStructure,
            model: config.model,
            smartAssistance: context.getSmartAssistanceConfig(),
        },
        // Include URIs for easy navigation
        resourceUris: {
            projects: buildEntitiesListUri('project'),
            people: buildEntitiesListUri('person'),
            terms: buildEntitiesListUri('term'),
            companies: buildEntitiesListUri('company'),
        },
    };

    return {
        uri: buildConfigUri(configPath),
        mimeType: 'application/json',
        text: JSON.stringify(configData, null, 2),
    };
}
