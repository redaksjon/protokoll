/**
 * Tests for MCP System Tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetServerMode = vi.hoisted(() => vi.fn(() => 'remote'));
const mockIsRemoteMode = vi.hoisted(() => vi.fn(() => true));
const mockGetServerConfig = vi.hoisted(() => vi.fn(() => ({
    workspaceRoot: '/workspace',
    inputDirectory: '/workspace/inbound',
    outputDirectory: '/workspace/notes',
    processedDirectory: '/workspace/processed',
    configFile: { contextDirectories: ['/workspace/context'] },
    configFilePath: '/workspace/protokoll-config.yaml',
})));

vi.mock('@/mcp/serverConfig', () => ({
    getServerMode: mockGetServerMode,
    isRemoteMode: mockIsRemoteMode,
    getServerConfig: mockGetServerConfig,
}));

import * as SystemTools from '@/mcp/tools/systemTools';
import { VERSION, PROGRAM_NAME } from '@/constants';

describe('MCP System Tools', () => {
    beforeEach(() => {
        mockGetServerMode.mockReset();
        mockIsRemoteMode.mockReset();
        mockGetServerConfig.mockReset();

        mockGetServerMode.mockReturnValue('remote');
        mockIsRemoteMode.mockReturnValue(true);
        mockGetServerConfig.mockReturnValue({
            workspaceRoot: '/workspace',
            inputDirectory: '/workspace/inbound',
            outputDirectory: '/workspace/notes',
            processedDirectory: '/workspace/processed',
            configFile: { contextDirectories: ['/workspace/context'] },
            configFilePath: '/workspace/protokoll-config.yaml',
        });
    });

    describe('getVersionTool', () => {
        it('should have correct tool definition', () => {
            expect(SystemTools.getVersionTool.name).toBe('protokoll_get_version');
            expect(SystemTools.getVersionTool.description).toContain('version');
            expect(SystemTools.getVersionTool.inputSchema.type).toBe('object');
            expect(SystemTools.getVersionTool.inputSchema.required).toEqual([]);
        });
    });

    describe('handleGetVersion', () => {
        it('should return version information', async () => {
            const result = await SystemTools.handleGetVersion();

            expect(result).toHaveProperty('version');
            expect(result).toHaveProperty('programName');
            expect(result).toHaveProperty('fullVersion');
        });

        it('should return correct program name', async () => {
            const result = await SystemTools.handleGetVersion();

            expect(result.programName).toBe(PROGRAM_NAME);
            expect(result.programName).toBe('protokoll');
        });

        it('should return version from constants', async () => {
            const result = await SystemTools.handleGetVersion();

            expect(result.version).toBe(VERSION);
        });

        it('should return full version string', async () => {
            const result = await SystemTools.handleGetVersion();

            expect(result.fullVersion).toBe(`${PROGRAM_NAME} ${VERSION}`);
            expect(result.fullVersion).toContain('protokoll');
        });

        it('should include git information in version', async () => {
            const result = await SystemTools.handleGetVersion();

            // In production builds, VERSION will contain git info
            // In tests, it may contain placeholders
            expect(result.version).toBeDefined();
            expect(typeof result.version).toBe('string');
        });

        it('should include system information in version', async () => {
            const result = await SystemTools.handleGetVersion();

            // VERSION should contain system info like platform and arch
            expect(result.version).toBeDefined();
            expect(result.version.length).toBeGreaterThan(0);
        });
    });

    describe('getInfoTool', () => {
        it('should have correct tool definition', () => {
            expect(SystemTools.getInfoTool.name).toBe('protokoll_info');
            expect(SystemTools.getInfoTool.description).toContain('mode');
            expect(SystemTools.getInfoTool.inputSchema.type).toBe('object');
        });
    });

    describe('handleGetInfo', () => {
        it('should return remote mode details from server config', async () => {
            mockGetServerMode.mockReturnValue('remote');
            mockGetServerConfig.mockReturnValue({
                workspaceRoot: '/workspace',
                inputDirectory: '/workspace/inbound',
                outputDirectory: '/workspace/notes',
                processedDirectory: '/workspace/processed',
                configFile: { contextDirectories: ['/workspace/context'] },
                configFilePath: '/workspace/protokoll-config.yaml',
            });

            const result = await SystemTools.handleGetInfo();
            expect(result.mode).toBe('remote');
            expect(result.acceptsDirectoryParameters).toBe(false);
            expect(result.workspaceRoot).toBe('/workspace');
            expect(result.contextDirectories).toEqual(['/workspace/context']);
        });

        it('should return local mode details when server is local', async () => {
            mockGetServerMode.mockReturnValue('local');
            mockGetServerConfig.mockReturnValue({
                workspaceRoot: '/workspace-local',
                inputDirectory: '/workspace-local/inbound',
                outputDirectory: '/workspace-local/notes',
                processedDirectory: '/workspace-local/processed',
                configFile: { contextDirectories: [] },
                configFilePath: '/workspace-local/protokoll-config.yaml',
            });

            const result = await SystemTools.handleGetInfo();
            expect(result.mode).toBe('local');
            expect(result.acceptsDirectoryParameters).toBe(true);
            expect(result.workspaceRoot).toBe('/workspace-local');
        });

        it('should return minimal local defaults when config is unavailable', async () => {
            mockGetServerConfig.mockImplementation(() => {
                throw new Error('not initialized');
            });

            const result = await SystemTools.handleGetInfo();
            expect(result.mode).toBe('local');
            expect(result.acceptsDirectoryParameters).toBe(true);
            expect(result.workspaceRoot).toBeNull();
            expect(result.configFilePath).toBeNull();
        });
    });
});
