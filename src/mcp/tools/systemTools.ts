/**
 * System Tools - Version and system information
 */

// eslint-disable-next-line import/extensions
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { VERSION, PROGRAM_NAME } from '@/constants';
import * as ServerConfig from '../serverConfig';

// ============================================================================
// Tool Definitions
// ============================================================================

export const getVersionTool: Tool = {
    name: 'protokoll_get_version',
    description: 'Get the current version of Protokoll including git information and system details. ' +
        'Useful for diagnosing if you are using the latest version.',
    inputSchema: {
        type: 'object',
        properties: {},
        required: [],
    },
};

export const getInfoTool: Tool = {
    name: 'protokoll_info',
    description: 
        'Get server configuration information including mode (local/remote) and workspace directories. ' +
        'IMPORTANT: Check this tool first to understand if the server is running in:\n' +
        '- "remote" mode: Server is pre-configured with workspace directories. Directory parameters are NOT accepted and will cause errors.\n' +
        '- "local" mode: Server performs dynamic discovery. Directory parameters are optional and accepted.\n\n' +
        'Use this to determine whether you need to provide contextDirectory parameters to other tools.',
    inputSchema: {
        type: 'object',
        properties: {},
        required: [],
    },
};

// ============================================================================
// Handlers
// ============================================================================

export interface GetVersionResult {
    version: string;
    programName: string;
    fullVersion: string;
}

export async function handleGetVersion(): Promise<GetVersionResult> {
    return {
        version: VERSION,
        programName: PROGRAM_NAME,
        fullVersion: `${PROGRAM_NAME} ${VERSION}`,
    };
}

export interface GetInfoResult {
    mode: 'local' | 'remote';
    modeDescription: string;
    acceptsDirectoryParameters: boolean;
    workspaceRoot: string | null;
    inputDirectory: string | null;
    outputDirectory: string | null;
    processedDirectory: string | null;
    contextDirectories: string[] | null;
    configFilePath: string | null;
}

export async function handleGetInfo(): Promise<GetInfoResult> {
    const mode = ServerConfig.getServerMode();
    const isRemote = mode === 'remote';
    
    let config;
    try {
        config = ServerConfig.getServerConfig();
    } catch {
        // Not initialized - return minimal info
        return {
            mode: 'local',
            modeDescription: 'Server is running in local mode with dynamic discovery',
            acceptsDirectoryParameters: true,
            workspaceRoot: null,
            inputDirectory: null,
            outputDirectory: null,
            processedDirectory: null,
            contextDirectories: null,
            configFilePath: null,
        };
    }
    
    return {
        mode,
        modeDescription: isRemote
            ? 'Server is running in remote mode with pre-configured workspace directories'
            : 'Server is running in local mode with dynamic discovery',
        acceptsDirectoryParameters: !isRemote,
        workspaceRoot: config.workspaceRoot,
        inputDirectory: config.inputDirectory,
        outputDirectory: config.outputDirectory,
        processedDirectory: config.processedDirectory,
        contextDirectories: config.configFile?.contextDirectories as string[] | null,
        configFilePath: config.configFilePath,
    };
}
