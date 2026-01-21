/**
 * Discovery Tools - Configuration discovery and project suggestion
 */
import type { Tool } from '@modelcontextprotocol/sdk/types';
import { resolve, dirname } from 'node:path';
import { stat } from 'node:fs/promises';
import * as Context from '@/context';
import { fileExists, type DiscoveredConfig, type ProjectSuggestion } from './shared';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Walk up the directory tree from a starting path to find .protokoll directories
 */
async function findProtokolkConfigs(startPath: string, maxLevels: number = 10): Promise<string[]> {
    const configs: string[] = [];
    let currentPath = resolve(startPath);
    let levels = 0;

    while (levels < maxLevels) {
        const protokollPath = resolve(currentPath, '.protokoll');
        if (await fileExists(protokollPath)) {
            configs.push(protokollPath);
        }

        const parentPath = dirname(currentPath);
        if (parentPath === currentPath) break; // Reached root
        currentPath = parentPath;
        levels++;
    }

    return configs;
}

/**
 * Get information about a .protokoll configuration
 */
async function getConfigInfo(protokollPath: string): Promise<DiscoveredConfig> {
    const context = await Context.create({ startingDir: dirname(protokollPath) });
    const config = context.getConfig();

    return {
        path: protokollPath,
        projectCount: context.getAllProjects().length,
        peopleCount: context.getAllPeople().length,
        termsCount: context.getAllTerms().length,
        companiesCount: context.getAllCompanies().length,
        outputDirectory: config.outputDirectory as string | undefined,
        model: config.model as string | undefined,
    };
}

/**
 * Suggest which project an audio file might belong to based on its location
 */
async function suggestProjectsForFile(audioFile: string): Promise<{
    configs: DiscoveredConfig[];
    suggestions: ProjectSuggestion[];
    needsUserInput: boolean;
    message: string;
}> {
    const audioPath = resolve(audioFile);
    const audioDir = dirname(audioPath);

    // Find all .protokoll configs in the hierarchy
    const configPaths = await findProtokolkConfigs(audioDir);

    if (configPaths.length === 0) {
        return {
            configs: [],
            suggestions: [],
            needsUserInput: true,
            message: `No .protokoll configuration found for ${audioFile}. ` +
                'You can either: (1) Create a .protokoll directory with project configuration, ' +
                'or (2) Specify a contextDirectory when calling protokoll_process_audio.',
        };
    }

    // Get info about each config
    const configs: DiscoveredConfig[] = [];
    const allSuggestions: ProjectSuggestion[] = [];

    for (const configPath of configPaths) {
        const info = await getConfigInfo(configPath);
        configs.push(info);

        // Get context to check projects
        const context = await Context.create({ startingDir: dirname(configPath) });
        const projects = context.getAllProjects().filter(p => p.active !== false);

        for (const project of projects) {
            // Check if the audio file's path matches any project's destination
            const destination = project.routing?.destination;
            if (destination) {
                const expandedDest = destination.startsWith('~')
                    ? destination.replace('~', process.env.HOME || '')
                    : destination;

                if (audioDir.includes(expandedDest) || expandedDest.includes(audioDir)) {
                    allSuggestions.push({
                        projectId: project.id,
                        projectName: project.name,
                        confidence: 0.9,
                        reason: `Audio file is in or near project destination: ${destination}`,
                        destination,
                    });
                }
            }

            // Check if project has associated directories/paths
            if (project.classification?.explicit_phrases) {
                // Check if any phrases match the directory name
                const dirName = audioDir.split('/').pop() || '';
                for (const phrase of project.classification.explicit_phrases) {
                    if (dirName.toLowerCase().includes(phrase.toLowerCase())) {
                        allSuggestions.push({
                            projectId: project.id,
                            projectName: project.name,
                            confidence: 0.7,
                            reason: `Directory name matches project phrase: "${phrase}"`,
                            destination: project.routing?.destination,
                        });
                    }
                }
            }
        }
    }

    // Deduplicate and sort suggestions by confidence
    const uniqueSuggestions = allSuggestions
        .filter((s, i, arr) => arr.findIndex(x => x.projectId === s.projectId) === i)
        .sort((a, b) => b.confidence - a.confidence);

    if (uniqueSuggestions.length === 0) {
        return {
            configs,
            suggestions: [],
            needsUserInput: configs[0].projectCount > 0,
            message: configs[0].projectCount > 0
                ? `Found ${configs[0].projectCount} projects but couldn't automatically determine which one this file belongs to. ` +
                  'Please specify the project or let me list them for you.'
                : 'Configuration found but no projects defined. Transcripts will use default routing.',
        };
    }

    if (uniqueSuggestions.length === 1 && uniqueSuggestions[0].confidence >= 0.8) {
        return {
            configs,
            suggestions: uniqueSuggestions,
            needsUserInput: false,
            message: `Detected project: ${uniqueSuggestions[0].projectName} (${uniqueSuggestions[0].reason})`,
        };
    }

    return {
        configs,
        suggestions: uniqueSuggestions,
        needsUserInput: true,
        message: `Found ${uniqueSuggestions.length} possible projects. Please confirm which project this file belongs to.`,
    };
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const discoverConfigTool: Tool = {
    name: 'protokoll_discover_config',
    description:
        'Discover Protokoll configurations for a given file or directory. ' +
        'Walks up the directory tree to find .protokoll directories and returns information about each, ' +
        'including project counts, people, terms, and output settings. ' +
        'ALWAYS call this first when asked to transcribe a file to understand the available context. ' +
        'This helps determine which project configuration to use.',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Path to a file or directory to search from (searches up the tree)',
            },
        },
        required: ['path'],
    },
};

export const suggestProjectTool: Tool = {
    name: 'protokoll_suggest_project',
    description:
        'Suggest which project(s) an audio file might belong to based on its location. ' +
        'Analyzes the file path against configured projects to determine the best match. ' +
        'Returns suggestions with confidence levels and reasons. ' +
        'If multiple projects match or no clear match is found, the response indicates that user input is needed.',
    inputSchema: {
        type: 'object',
        properties: {
            audioFile: {
                type: 'string',
                description: 'Path to the audio file to analyze',
            },
        },
        required: ['audioFile'],
    },
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleDiscoverConfig(args: { path: string }) {
    const searchPath = resolve(args.path);

    // Check if path exists
    if (!await fileExists(searchPath)) {
        throw new Error(`Path not found: ${searchPath}`);
    }

    // Determine if it's a file or directory
    const pathStat = await stat(searchPath);
    const startDir = pathStat.isDirectory() ? searchPath : dirname(searchPath);

    // Find all .protokoll configs
    const configPaths = await findProtokolkConfigs(startDir);

    if (configPaths.length === 0) {
        return {
            found: false,
            searchedFrom: startDir,
            configs: [],
            message: 'No .protokoll configuration found in the directory hierarchy. ' +
                'To use Protokoll, create a .protokoll directory with your context files (people, projects, terms).',
            suggestion: 'Run "protokoll --init-config" in your project directory to create initial configuration.',
        };
    }

    // Get info about each config
    const configs: DiscoveredConfig[] = [];
    for (const configPath of configPaths) {
        const info = await getConfigInfo(configPath);
        configs.push(info);
    }

    // Primary config is the one closest to the search path
    const primaryConfig = configs[0];

    return {
        found: true,
        searchedFrom: startDir,
        primaryConfig: primaryConfig.path,
        configs,
        summary: {
            totalProjects: configs.reduce((sum, c) => sum + c.projectCount, 0),
            totalPeople: configs.reduce((sum, c) => sum + c.peopleCount, 0),
            totalTerms: configs.reduce((sum, c) => sum + c.termsCount, 0),
            totalCompanies: configs.reduce((sum, c) => sum + c.companiesCount, 0),
        },
        message: configs.length === 1
            ? `Found Protokoll configuration at ${primaryConfig.path}`
            : `Found ${configs.length} Protokoll configurations (using nearest: ${primaryConfig.path})`,
    };
}

export async function handleSuggestProject(args: { audioFile: string }) {
    const audioFile = resolve(args.audioFile);

    if (!await fileExists(audioFile)) {
        throw new Error(`Audio file not found: ${audioFile}`);
    }

    const result = await suggestProjectsForFile(audioFile);

    return {
        audioFile,
        ...result,
        instructions: result.needsUserInput
            ? 'Please specify which project this file belongs to, or let me list available projects.'
            : 'Ready to process with the detected project configuration.',
    };
}
