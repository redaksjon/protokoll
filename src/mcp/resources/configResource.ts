/**
 * Configuration Resource
 * 
 * Handles reading Protokoll configuration.
 */

import type { McpResourceContents } from '../types';
import { buildConfigUri, buildEntitiesListUri } from '../uri';
import * as Context from '@/context';

/**
 * Read configuration resource
 */
export async function readConfigResource(
    configPath?: string
): Promise<McpResourceContents> {
    const startDir = configPath || process.cwd();
    
    const context = await Context.create({
        startingDir: startDir,
    });

    if (!context.hasContext()) {
        throw new Error(`No Protokoll context found at or above: ${startDir}`);
    }

    const dirs = context.getDiscoveredDirs();
    const config = context.getConfig();

    const configData = {
        hasContext: true,
        discoveredDirectories: dirs.map(d => ({
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
