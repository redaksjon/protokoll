/**
 * Tests for Config Discovery module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';

// Mock @utilarium/cardigantime - configDiscovery imports this
const mockRead = vi.fn();
let capturedLogger: { warn: (msg: string, ...args: unknown[]) => void; error: (msg: string, ...args: unknown[]) => void; verbose: (msg: string, ...args: unknown[]) => void } | null = null;
vi.mock('@utilarium/cardigantime', () => ({
    create: vi.fn((opts: { logger?: { warn: (msg: string, ...args: unknown[]) => void; error: (msg: string, ...args: unknown[]) => void; verbose: (msg: string, ...args: unknown[]) => void } }) => {
        capturedLogger = opts?.logger ?? null;
        return { read: mockRead };
    }),
}));

import * as ConfigDiscovery from '../../src/mcp/configDiscovery';

describe('configDiscovery', () => {
    const originalArgv = process.argv;
    const originalEnv = { ...process.env };
    const originalCwd = process.cwd();

    beforeEach(() => {
        vi.clearAllMocks();
        mockRead.mockResolvedValue({});
        process.argv = ['node', 'script'];
        process.env = { ...originalEnv };
        delete process.env.PROTOKOLL_DEBUG;
        delete process.env.DEBUG;
        delete process.env.PROTOKOLL_CONFIG;
        delete process.env.WORKSPACE_ROOT;
    });

    afterEach(() => {
        process.argv = originalArgv;
        process.env = originalEnv;
        process.chdir(originalCwd);
    });

    describe('DEFAULT_CONFIG_FILE', () => {
        it('should export default config file name', () => {
            expect(ConfigDiscovery.DEFAULT_CONFIG_FILE).toBe('protokoll-config.yaml');
        });
    });

    describe('getArgValue', () => {
        it('returns undefined when flag is not found', () => {
            expect(ConfigDiscovery.getArgValue(['a', 'b'], '--cwd')).toBeUndefined();
        });

        it('returns undefined when flag is at end of argv (no value)', () => {
            expect(ConfigDiscovery.getArgValue(['--cwd'], '--cwd')).toBeUndefined();
        });

        it('returns undefined when value starts with hyphen (next flag)', () => {
            expect(ConfigDiscovery.getArgValue(['--cwd', '--other'], '--cwd')).toBeUndefined();
        });

        it('returns undefined when value is empty string', () => {
            expect(ConfigDiscovery.getArgValue(['--cwd', ''], '--cwd')).toBeUndefined();
        });

        it('returns value when flag and valid value exist', () => {
            expect(ConfigDiscovery.getArgValue(['--cwd', '/some/path'], '--cwd')).toBe('/some/path');
        });

        it('returns first occurrence value when flag appears multiple times', () => {
            expect(ConfigDiscovery.getArgValue(['--cwd', '/first', '--cwd', '/second'], '--cwd')).toBe('/first');
        });
    });

    describe('readCardigantimeConfigFromDirectory', () => {
        it('reads config from directory and returns result', async () => {
            const mockConfig = { inputDirectory: '/test/input', resolvedConfigDirs: ['/test'] };
            mockRead.mockResolvedValue(mockConfig);

            const result = await ConfigDiscovery.readCardigantimeConfigFromDirectory(
                process.cwd(),
                'protokoll-config.yaml',
                ['config', 'hierarchical']
            );

            expect(result).toEqual(mockConfig);
            expect(mockRead).toHaveBeenCalledWith({});
        });

        it('restores cwd after successful read', async () => {
            const beforeCwd = process.cwd();
            const tempDir = mkdtempSync(resolve(tmpdir(), 'config-discovery-'));

            try {
                mockRead.mockResolvedValue({});
                await ConfigDiscovery.readCardigantimeConfigFromDirectory(
                    tempDir,
                    'protokoll-config.yaml',
                    ['config']
                );
                expect(process.cwd()).toBe(beforeCwd);
            } finally {
                rmSync(tempDir, { recursive: true });
            }
        });

        it('restores cwd when read throws', async () => {
            const beforeCwd = process.cwd();
            const tempDir = mkdtempSync(resolve(tmpdir(), 'config-discovery-'));

            try {
                mockRead.mockRejectedValue(new Error('read failed'));

                await expect(
                    ConfigDiscovery.readCardigantimeConfigFromDirectory(
                        tempDir,
                        'protokoll-config.yaml',
                        ['config']
                    )
                ).rejects.toThrow('read failed');

                expect(process.cwd()).toBe(beforeCwd);
            } finally {
                rmSync(tempDir, { recursive: true });
            }
        });
    });

    describe('loadCardigantimeConfig', () => {
        it('uses WORKSPACE_ROOT when set', async () => {
            const workspaceRoot = mkdtempSync(resolve(tmpdir(), 'workspace-root-'));
            try {
                process.env.WORKSPACE_ROOT = workspaceRoot;
                mockRead.mockResolvedValue({ model: 'gpt-4' });

                const config = await ConfigDiscovery.loadCardigantimeConfig();

                expect(config).toEqual({ model: 'gpt-4' });
                expect(mockRead).toHaveBeenCalled();
            } finally {
                rmSync(workspaceRoot, { recursive: true });
            }
        });

        it('uses process.cwd when WORKSPACE_ROOT not set', async () => {
            delete process.env.WORKSPACE_ROOT;
            mockRead.mockResolvedValue({});

            await ConfigDiscovery.loadCardigantimeConfig();

            expect(mockRead).toHaveBeenCalled();
        });
    });

    describe('initializeWorkingDirectoryFromArgsAndConfig', () => {
        it('completes without args (hierarchical discovery, no resolvedConfigDirs)', async () => {
            process.argv = ['node', 'script'];
            mockRead.mockResolvedValue({});

            await ConfigDiscovery.initializeWorkingDirectoryFromArgsAndConfig();

            expect(process.env.WORKSPACE_ROOT).toBeDefined();
        });

        it('sets WORKSPACE_ROOT from resolvedConfigDirs when array has items', async () => {
            const discoveryStart = process.cwd();
            process.argv = ['node', 'script'];
            mockRead.mockResolvedValue({
                resolvedConfigDirs: ['/resolved/config/dir'],
            });

            await ConfigDiscovery.initializeWorkingDirectoryFromArgsAndConfig();

            expect(process.env.WORKSPACE_ROOT).toBe('/resolved/config/dir');
        });

        it('uses discoveryStart when resolvedConfigDirs is empty', async () => {
            const discoveryStart = process.cwd();
            process.argv = ['node', 'script'];
            mockRead.mockResolvedValue({ resolvedConfigDirs: [] });

            await ConfigDiscovery.initializeWorkingDirectoryFromArgsAndConfig();

            expect(process.env.WORKSPACE_ROOT).toBe(discoveryStart);
        });

        it('uses discoveryStart when resolvedConfigDirs is not an array', async () => {
            const discoveryStart = process.cwd();
            process.argv = ['node', 'script'];
            mockRead.mockResolvedValue({ resolvedConfigDirs: null });

            await ConfigDiscovery.initializeWorkingDirectoryFromArgsAndConfig();

            expect(process.env.WORKSPACE_ROOT).toBe(discoveryStart);
        });

        it('changes cwd when --cwd is provided', async () => {
            const tempDir = mkdtempSync(resolve(tmpdir(), 'config-cwd-'));
            try {
                process.argv = ['node', 'script', '--cwd', tempDir];
                mockRead.mockResolvedValue({});

                await ConfigDiscovery.initializeWorkingDirectoryFromArgsAndConfig();

                // On macOS, process.cwd() may return /private/var/... while tempDir is /var/...
                expect(realpathSync(process.cwd())).toBe(realpathSync(tempDir));
            } finally {
                rmSync(tempDir, { recursive: true });
            }
        });

        it('uses explicit config with -c and sets PROTOKOLL_CONFIG and WORKSPACE_ROOT', async () => {
            const tempDir = mkdtempSync(resolve(tmpdir(), 'config-explicit-'));
            const configPath = resolve(tempDir, 'custom-config.yaml');
            writeFileSync(configPath, 'model: gpt-4\n');
            try {
                process.argv = ['node', 'script', '-c', configPath];
                mockRead.mockResolvedValue({});

                await ConfigDiscovery.initializeWorkingDirectoryFromArgsAndConfig();

                expect(process.env.PROTOKOLL_CONFIG).toBe(configPath);
                expect(process.env.WORKSPACE_ROOT).toBe(tempDir);
            } finally {
                rmSync(tempDir, { recursive: true });
            }
        });

        it('uses explicit config with --config', async () => {
            const tempDir = mkdtempSync(resolve(tmpdir(), 'config-explicit-'));
            const configPath = resolve(tempDir, 'my-config.yaml');
            writeFileSync(configPath, 'model: gpt-4\n');
            try {
                process.argv = ['node', 'script', '--config', configPath];
                mockRead.mockResolvedValue({});

                await ConfigDiscovery.initializeWorkingDirectoryFromArgsAndConfig();

                expect(process.env.PROTOKOLL_CONFIG).toBe(configPath);
                expect(process.env.WORKSPACE_ROOT).toBe(tempDir);
            } finally {
                rmSync(tempDir, { recursive: true });
            }
        });

        it('uses PROTOKOLL_CONFIG env when no -c or --config', async () => {
            const tempDir = mkdtempSync(resolve(tmpdir(), 'config-env-'));
            const configPath = resolve(tempDir, 'env-config.yaml');
            writeFileSync(configPath, 'model: gpt-4\n');
            try {
                process.argv = ['node', 'script'];
                process.env.PROTOKOLL_CONFIG = configPath;
                mockRead.mockResolvedValue({});

                await ConfigDiscovery.initializeWorkingDirectoryFromArgsAndConfig();

                expect(process.env.PROTOKOLL_CONFIG).toBe(configPath);
                expect(process.env.WORKSPACE_ROOT).toBe(tempDir);
            } finally {
                rmSync(tempDir, { recursive: true });
            }
        });

        it('prefers -c over --config over PROTOKOLL_CONFIG', async () => {
            const tempDir = mkdtempSync(resolve(tmpdir(), 'config-priority-'));
            const configPath = resolve(tempDir, 'c-flag.yaml');
            writeFileSync(configPath, 'model: gpt-4\n');
            try {
                process.argv = ['node', 'script', '-c', configPath];
                process.env.PROTOKOLL_CONFIG = '/other/path/config.yaml';
                mockRead.mockResolvedValue({});

                await ConfigDiscovery.initializeWorkingDirectoryFromArgsAndConfig();

                expect(process.env.PROTOKOLL_CONFIG).toBe(configPath);
            } finally {
                rmSync(tempDir, { recursive: true });
            }
        });
    });

    describe('createQuietLogger', () => {
        it('invokes logger warn and error (covers logger branches)', async () => {
            mockRead.mockResolvedValue({});
            await ConfigDiscovery.readCardigantimeConfigFromDirectory(
                process.cwd(),
                'protokoll-config.yaml',
                ['config']
            );
            expect(capturedLogger).toBeDefined();
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            try {
                capturedLogger!.warn('test warn');
                capturedLogger!.error('test error');
                expect(consoleErrorSpy).toHaveBeenCalledWith('[config:warn] test warn');
                expect(consoleErrorSpy).toHaveBeenCalledWith('[config:error] test error');
            } finally {
                consoleErrorSpy.mockRestore();
            }
        });

        it('invokes logger verbose when PROTOKOLL_DEBUG is true', async () => {
            process.env.PROTOKOLL_DEBUG = 'true';
            vi.resetModules();
            mockRead.mockResolvedValue({});
            const ConfigDiscoveryReloaded = await import('../../src/mcp/configDiscovery');
            await ConfigDiscoveryReloaded.readCardigantimeConfigFromDirectory(
                process.cwd(),
                'protokoll-config.yaml',
                ['config']
            );
            expect(capturedLogger).toBeDefined();
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            try {
                capturedLogger!.verbose('debug message');
                expect(consoleErrorSpy).toHaveBeenCalledWith('[config] debug message');
            } finally {
                consoleErrorSpy.mockRestore();
            }
        });

        it('verbose is noop when debug not enabled', async () => {
            mockRead.mockResolvedValue({});
            await ConfigDiscovery.readCardigantimeConfigFromDirectory(
                process.cwd(),
                'protokoll-config.yaml',
                ['config']
            );
            expect(capturedLogger).toBeDefined();
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            try {
                capturedLogger!.verbose('should not log');
                expect(consoleErrorSpy).not.toHaveBeenCalledWith('[config] should not log');
            } finally {
                consoleErrorSpy.mockRestore();
            }
        });
    });
});
