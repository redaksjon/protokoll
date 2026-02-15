/**
 * Extended tests for Server Config module
 * Covers error paths, edge cases, and branch coverage for initializeServerConfig.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';

// Hoisted mocks - must be defined before vi.mock factories
const mockContextCreate = vi.hoisted(() => vi.fn());
const mockCardigantimeRead = vi.hoisted(() => vi.fn());

vi.mock('@/context', () => ({
    create: (...args: unknown[]) => mockContextCreate(...args),
}));

vi.mock('@utilarium/cardigantime', () => ({
    create: () => ({ read: mockCardigantimeRead }),
}));

import * as ServerConfig from '../../src/mcp/serverConfig';

describe('serverConfig - extended', () => {
    const cwd = process.cwd();
    const validFileUri = `file://${cwd}`;

    const mockContext = {
        hasContext: vi.fn().mockReturnValue(true),
        getConfig: vi.fn().mockReturnValue({
            inputDirectory: '/test/input',
            outputDirectory: '/test/output',
            contextDirectories: ['/test/context'],
        }),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        ServerConfig.clearServerConfig();
        mockContextCreate.mockResolvedValue(mockContext);
        mockCardigantimeRead.mockResolvedValue({
            resolvedConfigDirs: [cwd],
            inputDirectory: undefined,
            outputDirectory: undefined,
            processedDirectory: undefined,
        });
    });

    describe('getServerConfig', () => {
        it('should throw if not initialized', () => {
            expect(() => ServerConfig.getServerConfig()).toThrow(
                'Server configuration not initialized. Call initializeServerConfig() first.'
            );
        });

        it('should return full config when initialized', async () => {
            const roots = [{ uri: validFileUri, name: 'Test' }];
            await ServerConfig.initializeServerConfig(roots, 'local');

            const config = ServerConfig.getServerConfig();
            expect(config).toMatchObject({
                mode: 'local',
                initialized: true,
                workspaceRoot: cwd,
            });
            expect(config.context).toBe(mockContext);
            expect(config.inputDirectory).toBeDefined();
            expect(config.outputDirectory).toBeDefined();
            expect(config.processedDirectory).toBeDefined();
        });
    });

    describe('getContext', () => {
        it('should return null when not initialized', () => {
            expect(ServerConfig.getContext()).toBeNull();
        });

        it('should return context instance when initialized', async () => {
            const roots = [{ uri: validFileUri, name: 'Test' }];
            await ServerConfig.initializeServerConfig(roots, 'local');
            expect(ServerConfig.getContext()).toBe(mockContext);
        });
    });

    describe('getWorkspaceRoot', () => {
        it('should return null when not initialized', () => {
            expect(ServerConfig.getWorkspaceRoot()).toBeNull();
        });

        it('should return workspace root when initialized', async () => {
            const roots = [{ uri: validFileUri, name: 'Test' }];
            await ServerConfig.initializeServerConfig(roots, 'local');
            expect(ServerConfig.getWorkspaceRoot()).toBe(cwd);
        });
    });

    describe('getInputDirectory', () => {
        it('should return cwd fallback when not initialized', () => {
            const dir = ServerConfig.getInputDirectory();
            expect(dir).toBe(resolve(cwd, './recordings'));
        });

        it('should return cwd fallback when initialized but inputDirectory is null', async () => {
            // Use empty roots to get minimal init (inputDirectory could be null in edge case)
            await ServerConfig.initializeServerConfig([], 'local');
            const dir = ServerConfig.getInputDirectory();
            expect(dir).toBe(resolve(cwd, './recordings'));
        });

        it('should return configured input directory when initialized', async () => {
            const roots = [{ uri: validFileUri, name: 'Test' }];
            mockCardigantimeRead.mockResolvedValue({
                resolvedConfigDirs: [cwd],
                inputDirectory: '/custom/input',
                outputDirectory: '/custom/output',
                processedDirectory: '/custom/processed',
            });
            await ServerConfig.initializeServerConfig(roots, 'local');
            expect(ServerConfig.getInputDirectory()).toBe('/custom/input');
        });
    });

    describe('getOutputDirectory', () => {
        it('should return cwd fallback when not initialized', () => {
            const dir = ServerConfig.getOutputDirectory();
            expect(dir).toBe(resolve(cwd, './notes'));
        });

        it('should return configured output directory when initialized', async () => {
            const roots = [{ uri: validFileUri, name: 'Test' }];
            mockCardigantimeRead.mockResolvedValue({
                resolvedConfigDirs: [cwd],
                inputDirectory: '/custom/input',
                outputDirectory: '/custom/output',
                processedDirectory: '/custom/processed',
            });
            await ServerConfig.initializeServerConfig(roots, 'local');
            expect(ServerConfig.getOutputDirectory()).toBe('/custom/output');
        });
    });

    describe('getProcessedDirectory', () => {
        it('should return null when not initialized', () => {
            expect(ServerConfig.getProcessedDirectory()).toBeNull();
        });

        it('should return processed directory when initialized', async () => {
            const roots = [{ uri: validFileUri, name: 'Test' }];
            mockCardigantimeRead.mockResolvedValue({
                resolvedConfigDirs: [cwd],
                processedDirectory: '/custom/processed',
            });
            await ServerConfig.initializeServerConfig(roots, 'local');
            expect(ServerConfig.getProcessedDirectory()).toBe('/custom/processed');
        });
    });

    describe('isInitialized', () => {
        it('should return false when not initialized', () => {
            expect(ServerConfig.isInitialized()).toBe(false);
        });

        it('should return true when initialized', async () => {
            await ServerConfig.initializeServerConfig([{ uri: validFileUri, name: 'Test' }], 'local');
            expect(ServerConfig.isInitialized()).toBe(true);
        });
    });

    describe('getServerMode', () => {
        it('should return local when not initialized', () => {
            expect(ServerConfig.getServerMode()).toBe('local');
        });

        it('should return configured mode when initialized', async () => {
            await ServerConfig.initializeServerConfig([{ uri: validFileUri, name: 'Test' }], 'remote');
            expect(ServerConfig.getServerMode()).toBe('remote');
        });
    });

    describe('isRemoteMode', () => {
        it('should return false when in local mode', async () => {
            await ServerConfig.initializeServerConfig([{ uri: validFileUri, name: 'Test' }], 'local');
            expect(ServerConfig.isRemoteMode()).toBe(false);
        });

        it('should return true when in remote mode', async () => {
            await ServerConfig.initializeServerConfig([{ uri: validFileUri, name: 'Test' }], 'remote');
            expect(ServerConfig.isRemoteMode()).toBe(true);
        });
    });

    describe('clearServerConfig', () => {
        it('should reset state and make getServerConfig throw', async () => {
            await ServerConfig.initializeServerConfig([{ uri: validFileUri, name: 'Test' }], 'local');
            expect(ServerConfig.isInitialized()).toBe(true);

            ServerConfig.clearServerConfig();
            expect(ServerConfig.isInitialized()).toBe(false);
            expect(() => ServerConfig.getServerConfig()).toThrow('Server configuration not initialized');
        });
    });

    describe('reloadServerConfig', () => {
        it('should reinitialize config', async () => {
            await ServerConfig.initializeServerConfig([{ uri: validFileUri, name: 'Test' }], 'local');
            ServerConfig.clearServerConfig();

            await ServerConfig.reloadServerConfig([{ uri: validFileUri, name: 'Test' }], 'remote');
            expect(ServerConfig.isInitialized()).toBe(true);
            expect(ServerConfig.getServerMode()).toBe('remote');
        });
    });

    describe('initializeServerConfig', () => {
        it('should initialize with valid workspace roots', async () => {
            const roots = [{ uri: validFileUri, name: 'Test' }];
            await expect(ServerConfig.initializeServerConfig(roots, 'local')).resolves.toBeUndefined();
            expect(ServerConfig.isInitialized()).toBe(true);
        });

        it('should initialize with empty roots (cwd fallback)', async () => {
            await expect(ServerConfig.initializeServerConfig([], 'local')).resolves.toBeUndefined();
            const config = ServerConfig.getServerConfig();
            expect(config.workspaceRoot).toBe(cwd);
            expect(config.context).toBeNull();
            expect(config.inputDirectory).toBe(resolve(cwd, './recordings'));
            expect(config.outputDirectory).toBe(resolve(cwd, './notes'));
            expect(config.processedDirectory).toBe(resolve(cwd, './processed'));
        });

        it('should initialize when roots have invalid URI (fileUriToPath returns null)', async () => {
            const roots = [{ uri: 'https://example.com/path', name: 'Test' }];
            await expect(ServerConfig.initializeServerConfig(roots, 'local')).resolves.toBeUndefined();
            const config = ServerConfig.getServerConfig();
            expect(config.workspaceRoot).toBe(cwd);
            expect(config.context).toBeNull();
        });

        it('should initialize in remote mode with valid roots', async () => {
            const roots = [{ uri: validFileUri, name: 'Test' }];
            await expect(ServerConfig.initializeServerConfig(roots, 'remote')).resolves.toBeUndefined();
            expect(ServerConfig.getServerMode()).toBe('remote');
        });

        it('should use catch path when Context.create throws', async () => {
            mockContextCreate.mockRejectedValueOnce(new Error('Context failed'));
            const roots = [{ uri: validFileUri, name: 'Test' }];

            await expect(ServerConfig.initializeServerConfig(roots, 'local')).resolves.toBeUndefined();
            expect(ServerConfig.isInitialized()).toBe(true);
            expect(ServerConfig.getContext()).toBeNull();
            const config = ServerConfig.getServerConfig();
            expect(config.context).toBeNull();
            expect(config.workspaceRoot).toBe(cwd);
        });

        it('should use catch path with empty resolvedConfigDirs when Context.create throws', async () => {
            mockContextCreate.mockRejectedValueOnce(new Error('Context failed'));
            mockCardigantimeRead.mockResolvedValue({
                resolvedConfigDirs: [],
                inputDirectory: undefined,
                outputDirectory: undefined,
                processedDirectory: undefined,
            });
            const roots = [{ uri: validFileUri, name: 'Test' }];

            await ServerConfig.initializeServerConfig(roots, 'local');
            const config = ServerConfig.getServerConfig();
            expect(config.context).toBeNull();
            expect(config.configFilePath).toBeNull();
            expect(config.inputDirectory).toBe(resolve(cwd, './recordings'));
        });


        it('should handle empty resolvedConfigDirs (use workspaceRoot for defaults)', async () => {
            mockCardigantimeRead.mockResolvedValue({
                resolvedConfigDirs: [],
                inputDirectory: undefined,
                outputDirectory: undefined,
                processedDirectory: undefined,
            });
            const roots = [{ uri: validFileUri, name: 'Test' }];

            await ServerConfig.initializeServerConfig(roots, 'local');
            const config = ServerConfig.getServerConfig();
            expect(config.configFilePath).toBeNull();
            expect(config.inputDirectory).toBe(resolve(cwd, './recordings'));
            expect(config.outputDirectory).toBe(resolve(cwd, './notes'));
            expect(config.processedDirectory).toBe(resolve(cwd, './processed'));
        });

        it('should handle config with explicit directory overrides', async () => {
            const customInput = resolve(cwd, 'custom/recordings');
            const customOutput = resolve(cwd, 'custom/notes');
            const customProcessed = resolve(cwd, 'custom/processed');
            mockCardigantimeRead.mockResolvedValue({
                resolvedConfigDirs: [cwd],
                inputDirectory: customInput,
                outputDirectory: customOutput,
                processedDirectory: customProcessed,
            });
            const roots = [{ uri: validFileUri, name: 'Test' }];

            await ServerConfig.initializeServerConfig(roots, 'local');
            const config = ServerConfig.getServerConfig();
            expect(config.inputDirectory).toBe(customInput);
            expect(config.outputDirectory).toBe(customOutput);
            expect(config.processedDirectory).toBe(customProcessed);
        });

        it('should merge context config with config file', async () => {
            mockContext.getConfig.mockReturnValue({
                inputDirectory: '/context/input',
                outputDirectory: '/context/output',
            });
            mockCardigantimeRead.mockResolvedValue({
                resolvedConfigDirs: [cwd],
                outputDirectory: '/file/output',
                processedDirectory: '/file/processed',
            });
            const roots = [{ uri: validFileUri, name: 'Test' }];

            await ServerConfig.initializeServerConfig(roots, 'local');
            const config = ServerConfig.getServerConfig();
            expect(config.inputDirectory).toBe('/context/input');
            expect(config.outputDirectory).toBe('/file/output');
            expect(config.processedDirectory).toBe('/file/processed');
        });

        it('should set configFilePath when resolvedConfigDirs has entries', async () => {
            mockCardigantimeRead.mockResolvedValue({
                resolvedConfigDirs: [cwd],
            });
            const roots = [{ uri: validFileUri, name: 'Test' }];

            await ServerConfig.initializeServerConfig(roots, 'local');
            const config = ServerConfig.getServerConfig();
            expect(config.configFilePath).toBe(resolve(cwd, 'protokoll-config.yaml'));
        });
    });
});
