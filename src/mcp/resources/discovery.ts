/**
 * Resource Discovery
 * 
 * Dynamically discovers available resources based on context.
 */

import type { McpResource } from '../types';
import { 
    buildConfigUri, 
    buildAudioInboundUri, 
    buildAudioProcessedUri,
    buildEntitiesListUri,
    buildTranscriptsListUri,
} from '../uri';
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
 * Get dynamic resources based on current context
 */
export async function getDynamicResources(contextDirectory?: string): Promise<McpResource[]> {
    const resources: McpResource[] = [];
    
    try {
        let context;
        const serverConfigReady = isServerConfigInitialized();
        if (serverConfigReady) {
            const serverContext = getServerContext();
            if (serverContext?.hasContext()) {
                context = serverContext;
            } else {
                const configFile = getServerConfigFile();
                const rawDirs = configFile?.contextDirectories;
                const workspaceRoot = getWorkspaceRoot();
                const effectiveDir = contextDirectory || workspaceRoot || process.cwd();
                const contextDirs = rawDirs && rawDirs.length > 0
                    ? rawDirs.map(d => (isAbsolute(d) ? d : resolve(effectiveDir, d)))
                    : undefined;
                context = await Context.create({
                    startingDir: effectiveDir,
                    contextDirectories: contextDirs,
                });
            }
        } else {
            context = await Context.create({
                startingDir: contextDirectory || process.cwd(),
            });
        }

        if (!context.hasContext()) {
            return resources;
        }

        const config = context.getConfig();
        const dirs = context.getDiscoveredDirs();
        const configPath = dirs[0]?.path;

        // Add config resource
        if (configPath) {
            resources.push({
                uri: buildConfigUri(configPath),
                name: 'Current Configuration',
                description: `Protokoll configuration at ${configPath}`,
                mimeType: 'application/json',
            });
        }

        // Add inbound audio resource
        const inputDirectory = (config.inputDirectory as string) || './recordings';
        resources.push({
            uri: buildAudioInboundUri(inputDirectory),
            name: 'Inbound Audio Files',
            description: `Audio files waiting to be processed in ${inputDirectory}`,
            mimeType: 'application/json',
        });

        // Add processed audio resource
        const processedDirectory = (config.processedDirectory as string);
        if (processedDirectory) {
            resources.push({
                uri: buildAudioProcessedUri(processedDirectory),
                name: 'Processed Audio Files',
                description: `Audio files that have been processed in ${processedDirectory}`,
                mimeType: 'application/json',
            });
        }

        // Add entity list resources
        const entityCounts = {
            projects: context.getAllProjects().length,
            people: context.getAllPeople().length,
            terms: context.getAllTerms().length,
            companies: context.getAllCompanies().length,
        };

        if (entityCounts.projects > 0) {
            resources.push({
                uri: buildEntitiesListUri('project'),
                name: 'All Projects',
                description: `${entityCounts.projects} project(s) in context`,
                mimeType: 'application/json',
            });
        }

        if (entityCounts.people > 0) {
            resources.push({
                uri: buildEntitiesListUri('person'),
                name: 'All People',
                description: `${entityCounts.people} person/people in context`,
                mimeType: 'application/json',
            });
        }

        if (entityCounts.terms > 0) {
            resources.push({
                uri: buildEntitiesListUri('term'),
                name: 'All Terms',
                description: `${entityCounts.terms} term(s) in context`,
                mimeType: 'application/json',
            });
        }

        if (entityCounts.companies > 0) {
            resources.push({
                uri: buildEntitiesListUri('company'),
                name: 'All Companies',
                description: `${entityCounts.companies} company/companies in context`,
                mimeType: 'application/json',
            });
        }

        // Add output directory transcript list
        const outputDirectory = (config.outputDirectory as string) || '~/notes';
        resources.push({
            uri: buildTranscriptsListUri({ directory: outputDirectory, limit: 10 }),
            name: 'Recent Transcripts',
            description: `10 most recent transcripts in ${outputDirectory}`,
            mimeType: 'application/json',
        });

    } catch {
        // Context not available, return empty
    }

    return resources;
}
