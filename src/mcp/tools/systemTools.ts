/**
 * System Tools - Version and system information
 */

// eslint-disable-next-line import/extensions
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { VERSION, PROGRAM_NAME } from '@/constants';

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
