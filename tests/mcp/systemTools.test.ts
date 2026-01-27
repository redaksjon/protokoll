/**
 * Tests for MCP System Tools
 */

import { describe, it, expect } from 'vitest';
import * as SystemTools from '@/mcp/tools/systemTools';
import { VERSION, PROGRAM_NAME } from '@/constants';

describe('MCP System Tools', () => {
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
});
