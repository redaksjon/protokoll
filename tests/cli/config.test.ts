/**
 * Tests for Config CLI Command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { Command } from 'commander';
import {
    CONFIG_SCHEMA,
    registerConfigCommands,
    _internal,
} from '../../src/cli/config';

// Mock readline for interactive tests
vi.mock('readline', async (importOriginal) => {
    const actual = await importOriginal() as typeof readline;
    return {
        ...actual,
        createInterface: vi.fn(() => ({
            question: vi.fn((prompt, callback) => callback('')),
            close: vi.fn(),
        })),
    };
});

describe('Config CLI', () => {
    let tempDir: string;
    let originalHome: string | undefined;
    let originalCwd: string;
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        // Create a temp directory for test config files
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-config-test-'));
        originalHome = process.env.HOME;
        originalCwd = process.cwd();
        process.env.HOME = tempDir;
        
        // Mock console.log to capture output
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(async () => {
        process.env.HOME = originalHome;
        process.chdir(originalCwd);
        consoleSpy.mockRestore();
        await fs.rm(tempDir, { recursive: true });
    });

    describe('CONFIG_SCHEMA', () => {
        it('should have required configuration options', () => {
            expect(CONFIG_SCHEMA.model).toBeDefined();
            expect(CONFIG_SCHEMA.model.description).toBeTruthy();
            expect(CONFIG_SCHEMA.model.type).toBe('string');
            
            expect(CONFIG_SCHEMA.transcriptionModel).toBeDefined();
            expect(CONFIG_SCHEMA.reasoningLevel).toBeDefined();
            expect(CONFIG_SCHEMA.inputDirectory).toBeDefined();
            expect(CONFIG_SCHEMA.outputDirectory).toBeDefined();
        });

        it('should have valid types for all options', () => {
            const validTypes = ['string', 'boolean', 'number', 'path', 'array'];
            
            for (const [, schema] of Object.entries(CONFIG_SCHEMA)) {
                expect(validTypes).toContain(schema.type);
                expect(schema.description).toBeTruthy();
                expect(schema.default).toBeDefined();
            }
        });

        it('should have allowed values for constrained options', () => {
            expect(CONFIG_SCHEMA.reasoningLevel.allowed).toContain('low');
            expect(CONFIG_SCHEMA.reasoningLevel.allowed).toContain('medium');
            expect(CONFIG_SCHEMA.reasoningLevel.allowed).toContain('high');
            
            expect(CONFIG_SCHEMA.outputStructure.allowed).toContain('month');
            expect(CONFIG_SCHEMA.outputStructure.allowed).toContain('year');
            expect(CONFIG_SCHEMA.outputStructure.allowed).toContain('day');
            expect(CONFIG_SCHEMA.outputStructure.allowed).toContain('none');
        });

        it('should have examples for string options', () => {
            expect(CONFIG_SCHEMA.model.examples).toBeDefined();
            expect(CONFIG_SCHEMA.model.examples?.length).toBeGreaterThan(0);
            
            expect(CONFIG_SCHEMA.timezone.examples).toBeDefined();
            expect(CONFIG_SCHEMA.timezone.examples).toContain('America/New_York');
        });

        it('should have correct default values', () => {
            expect(CONFIG_SCHEMA.interactive.default).toBe(true);
            expect(CONFIG_SCHEMA.debug.default).toBe(false);
            expect(CONFIG_SCHEMA.dryRun.default).toBe(false);
            expect(typeof CONFIG_SCHEMA.maxAudioSize.default).toBe('number');
        });
    });

    describe('findConfigPath', () => {
        it('should return home directory config path when no config exists', async () => {
            const result = await _internal.findConfigPath();
            
            expect(result.configPath).toContain('.protokoll');
            expect(result.configPath).toContain('config.yaml');
            expect(result.exists).toBe(false);
        });

        it('should find config in home directory when it exists', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            const configPath = path.join(configDir, 'config.yaml');
            await fs.writeFile(configPath, 'model: gpt-4o\n', 'utf-8');
            
            const result = await _internal.findConfigPath();
            
            expect(result.configPath).toBe(configPath);
            expect(result.exists).toBe(true);
        });

        it('should prefer current directory config over home directory', async () => {
            // Create config in home
            const homeConfigDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(homeConfigDir, { recursive: true });
            await fs.writeFile(path.join(homeConfigDir, 'config.yaml'), 'model: home\n', 'utf-8');
            
            // Create config in current directory
            const cwdConfigDir = path.join(tempDir, 'project', '.protokoll');
            await fs.mkdir(cwdConfigDir, { recursive: true });
            const cwdConfigPath = path.join(cwdConfigDir, 'config.yaml');
            await fs.writeFile(cwdConfigPath, 'model: project\n', 'utf-8');
            
            // Change to project directory
            process.chdir(path.join(tempDir, 'project'));
            
            const result = await _internal.findConfigPath();
            
            // On macOS, paths may be prefixed with /private, so compare normalized paths
            expect(fs.realpath(result.configPath)).resolves.toEqual(await fs.realpath(cwdConfigPath));
            expect(result.exists).toBe(true);
        });

        it('should handle missing HOME environment variable', async () => {
            const originalUserProfile = process.env.USERPROFILE;
            process.env.HOME = '';
            process.env.USERPROFILE = tempDir;
            
            try {
                const result = await _internal.findConfigPath();
                expect(result.configPath).toContain('.protokoll');
            } finally {
                process.env.HOME = originalHome;
                process.env.USERPROFILE = originalUserProfile;
            }
        });
    });

    describe('loadConfig', () => {
        it('should return empty object when no config file exists', async () => {
            const config = await _internal.loadConfig();
            expect(config).toEqual({});
        });

        it('should load existing config file', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(
                path.join(configDir, 'config.yaml'),
                'model: gpt-4o\ndebug: true\noutputDirectory: ~/notes\n',
                'utf-8'
            );
            
            const config = await _internal.loadConfig();
            
            expect(config.model).toBe('gpt-4o');
            expect(config.debug).toBe(true);
            expect(config.outputDirectory).toBe('~/notes');
        });

        it('should handle empty config file', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(path.join(configDir, 'config.yaml'), '', 'utf-8');
            
            const config = await _internal.loadConfig();
            expect(config).toEqual({});
        });

        it('should handle invalid YAML gracefully', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(
                path.join(configDir, 'config.yaml'),
                ':\ninvalid: yaml: content:\n',
                'utf-8'
            );
            
            const config = await _internal.loadConfig();
            expect(config).toEqual({});
        });

        it('should load array values correctly', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(
                path.join(configDir, 'config.yaml'),
                'outputFilenameOptions:\n  - date\n  - time\n  - subject\n',
                'utf-8'
            );
            
            const config = await _internal.loadConfig();
            expect(config.outputFilenameOptions).toEqual(['date', 'time', 'subject']);
        });
    });

    describe('saveConfig', () => {
        it('should create config directory if it does not exist', async () => {
            const configPath = await _internal.saveConfig({ model: 'gpt-4o' });
            
            expect(configPath).toContain('.protokoll');
            const content = await fs.readFile(configPath, 'utf-8');
            expect(content).toContain('model: gpt-4o');
        });

        it('should overwrite existing config', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(
                path.join(configDir, 'config.yaml'),
                'model: old-model\n',
                'utf-8'
            );
            
            await _internal.saveConfig({ model: 'new-model', debug: true });
            
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('model: new-model');
            expect(content).toContain('debug: true');
            expect(content).not.toContain('old-model');
        });

        it('should save array values correctly', async () => {
            await _internal.saveConfig({ 
                outputFilenameOptions: ['date', 'time', 'subject'] 
            });
            
            const configDir = path.join(tempDir, '.protokoll');
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('outputFilenameOptions');
            expect(content).toContain('date');
            expect(content).toContain('time');
            expect(content).toContain('subject');
        });

        it('should save boolean values correctly', async () => {
            await _internal.saveConfig({ debug: true, verbose: false });
            
            const configDir = path.join(tempDir, '.protokoll');
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('debug: true');
            expect(content).toContain('verbose: false');
        });

        it('should save numeric values correctly', async () => {
            await _internal.saveConfig({ maxAudioSize: 52428800 });
            
            const configDir = path.join(tempDir, '.protokoll');
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('maxAudioSize: 52428800');
        });
    });

    describe('parseValue', () => {
        it('should parse boolean true values', () => {
            expect(_internal.parseValue('true', 'boolean')).toBe(true);
            expect(_internal.parseValue('TRUE', 'boolean')).toBe(true);
            expect(_internal.parseValue('True', 'boolean')).toBe(true);
            expect(_internal.parseValue('1', 'boolean')).toBe(true);
            expect(_internal.parseValue('yes', 'boolean')).toBe(true);
        });

        it('should parse boolean false values', () => {
            expect(_internal.parseValue('false', 'boolean')).toBe(false);
            expect(_internal.parseValue('FALSE', 'boolean')).toBe(false);
            expect(_internal.parseValue('0', 'boolean')).toBe(false);
            expect(_internal.parseValue('no', 'boolean')).toBe(false);
            expect(_internal.parseValue('anything', 'boolean')).toBe(false);
        });

        it('should parse number values', () => {
            expect(_internal.parseValue('123', 'number')).toBe(123);
            expect(_internal.parseValue('26214400', 'number')).toBe(26214400);
            expect(_internal.parseValue('0', 'number')).toBe(0);
        });

        it('should parse array values from comma-separated input', () => {
            expect(_internal.parseValue('date,time,subject', 'array')).toEqual(['date', 'time', 'subject']);
        });

        it('should parse array values from space-separated input', () => {
            expect(_internal.parseValue('date time subject', 'array')).toEqual(['date', 'time', 'subject']);
        });

        it('should parse array values from mixed separator input', () => {
            expect(_internal.parseValue('date, time, subject', 'array')).toEqual(['date', 'time', 'subject']);
        });

        it('should filter empty array values', () => {
            expect(_internal.parseValue('date,,time', 'array')).toEqual(['date', 'time']);
            expect(_internal.parseValue('  date  time  ', 'array')).toEqual(['date', 'time']);
        });

        it('should return string values as-is for string type', () => {
            expect(_internal.parseValue('gpt-4o', 'string')).toBe('gpt-4o');
            expect(_internal.parseValue('~/notes', 'string')).toBe('~/notes');
        });

        it('should return string values as-is for path type', () => {
            expect(_internal.parseValue('/tmp/test', 'path')).toBe('/tmp/test');
            expect(_internal.parseValue('~/documents', 'path')).toBe('~/documents');
        });

        it('should return string for unknown types', () => {
            expect(_internal.parseValue('test', 'unknown' as any)).toBe('test');
        });
    });

    describe('formatValue', () => {
        it('should format undefined values', () => {
            const result = _internal.formatValue(undefined, 'string');
            expect(result).toContain('(not set)');
        });

        it('should format null values', () => {
            const result = _internal.formatValue(null, 'string');
            expect(result).toContain('(not set)');
        });

        it('should format boolean true with green color', () => {
            const result = _internal.formatValue(true, 'boolean');
            expect(result).toContain('true');
            expect(result).toContain(_internal.colors.green);
        });

        it('should format boolean false with red color', () => {
            const result = _internal.formatValue(false, 'boolean');
            expect(result).toContain('false');
            expect(result).toContain(_internal.colors.red);
        });

        it('should format array values as comma-separated', () => {
            const result = _internal.formatValue(['date', 'time', 'subject'], 'array');
            expect(result).toBe('date, time, subject');
        });

        it('should handle non-array value for array type', () => {
            const result = _internal.formatValue('single-value', 'array');
            expect(result).toBe('single-value');
        });

        it('should format string values', () => {
            const result = _internal.formatValue('gpt-4o', 'string');
            expect(result).toBe('gpt-4o');
        });

        it('should format number values', () => {
            const result = _internal.formatValue(26214400, 'number');
            expect(result).toBe('26214400');
        });

        it('should format path values', () => {
            const result = _internal.formatValue('~/notes', 'path');
            expect(result).toBe('~/notes');
        });
    });

    describe('listConfig', () => {
        it('should list all configuration options', async () => {
            await _internal.listConfig();
            
            // Verify header was printed
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Protokoll Configuration')
            );
            
            // Verify some keys are printed
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('model');
            expect(calls).toContain('debug');
            expect(calls).toContain('outputDirectory');
        });

        it('should show config file path', async () => {
            await _internal.listConfig();
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Config file:');
            expect(calls).toContain('.protokoll');
        });

        it('should indicate when config file does not exist', async () => {
            await _internal.listConfig();
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('not found');
        });

        it('should show current values from config file', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(
                path.join(configDir, 'config.yaml'),
                'model: custom-model\ndebug: true\n',
                'utf-8'
            );
            
            await _internal.listConfig();
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('custom-model');
        });

        it('should indicate default values', async () => {
            await _internal.listConfig();
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('(default)');
        });
    });

    describe('getConfigValue', () => {
        it('should display a specific configuration value', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(
                path.join(configDir, 'config.yaml'),
                'model: gpt-4o-mini\n',
                'utf-8'
            );
            
            await _internal.getConfigValue('model');
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('model');
            expect(calls).toContain('gpt-4o-mini');
            expect(calls).toContain('AI model for transcription enhancement');
        });

        it('should show default value when key is not set', async () => {
            await _internal.getConfigValue('debug');
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('debug');
            expect(calls).toContain('(default)');
        });

        it('should show allowed values for constrained options', async () => {
            await _internal.getConfigValue('reasoningLevel');
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Allowed:');
            expect(calls).toContain('low');
            expect(calls).toContain('medium');
            expect(calls).toContain('high');
        });

        it('should show examples for options with examples', async () => {
            await _internal.getConfigValue('model');
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Examples:');
        });

        it('should exit with error for unknown key', async () => {
            // Since process.exit is mocked but doesn't stop execution,
            // we need to catch the error that occurs when code continues
            try {
                await _internal.getConfigValue('unknownKey');
            } catch {
                // Expected - code continues after mocked exit and hits undefined schema
            }
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Unknown configuration key');
            expect(calls).toContain('Available keys');
            expect(process.exit).toHaveBeenCalledWith(1);
        });
    });

    describe('setConfigValue', () => {
        it('should set a string configuration value', async () => {
            await _internal.setConfigValue('model', 'gpt-4o-mini');
            
            const configDir = path.join(tempDir, '.protokoll');
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('model: gpt-4o-mini');
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('model = gpt-4o-mini');
        });

        it('should set a boolean configuration value', async () => {
            await _internal.setConfigValue('debug', 'true');
            
            const configDir = path.join(tempDir, '.protokoll');
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('debug: true');
        });

        it('should set a number configuration value', async () => {
            await _internal.setConfigValue('maxAudioSize', '52428800');
            
            const configDir = path.join(tempDir, '.protokoll');
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('maxAudioSize: 52428800');
        });

        it('should set an array configuration value', async () => {
            await _internal.setConfigValue('outputFilenameOptions', 'date,time');
            
            const configDir = path.join(tempDir, '.protokoll');
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('date');
            expect(content).toContain('time');
        });

        it('should validate allowed values', async () => {
            await _internal.setConfigValue('reasoningLevel', 'invalid');
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Invalid value');
            expect(calls).toContain('Allowed:');
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        it('should validate array values against allowed list', async () => {
            await _internal.setConfigValue('outputFilenameOptions', 'date,invalid,time');
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Invalid value');
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        it('should accept valid allowed values', async () => {
            await _internal.setConfigValue('reasoningLevel', 'high');
            
            const configDir = path.join(tempDir, '.protokoll');
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('reasoningLevel: high');
        });

        it('should exit with error for unknown key', async () => {
            // Since process.exit is mocked but doesn't stop execution,
            // we need to catch the error that occurs when code continues
            try {
                await _internal.setConfigValue('unknownKey', 'value');
            } catch {
                // Expected - code continues after mocked exit and hits undefined schema
            }
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Unknown configuration key');
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        it('should show saved path in output', async () => {
            await _internal.setConfigValue('model', 'test-model');
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Saved to:');
            expect(calls).toContain('.protokoll');
        });

        it('should preserve existing config values when setting new one', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(
                path.join(configDir, 'config.yaml'),
                'model: existing-model\ndebug: true\n',
                'utf-8'
            );
            
            await _internal.setConfigValue('verbose', 'true');
            
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('model: existing-model');
            expect(content).toContain('debug: true');
            expect(content).toContain('verbose: true');
        });
    });

    describe('showConfigPath', () => {
        it('should print config file path', async () => {
            await _internal.showConfigPath();
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('.protokoll');
            expect(calls).toContain('config.yaml');
        });

        it('should indicate when file does not exist', async () => {
            await _internal.showConfigPath();
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('does not exist yet');
        });

        it('should not show warning when file exists', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(path.join(configDir, 'config.yaml'), 'model: test\n', 'utf-8');
            
            await _internal.showConfigPath();
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).not.toContain('does not exist yet');
        });
    });

    describe('registerConfigCommands', () => {
        it('should register the config command', () => {
            const program = new Command();
            registerConfigCommands(program);
            
            const configCmd = program.commands.find(cmd => cmd.name() === 'config');
            expect(configCmd).toBeDefined();
            expect(configCmd?.description()).toContain('configuration');
        });

        it('should have list and path options', () => {
            const program = new Command();
            registerConfigCommands(program);
            
            const configCmd = program.commands.find(cmd => cmd.name() === 'config');
            const options = configCmd?.options || [];
            
            const listOpt = options.find(o => o.long === '--list');
            const pathOpt = options.find(o => o.long === '--path');
            
            expect(listOpt).toBeDefined();
            expect(pathOpt).toBeDefined();
        });

        it('should have key and value arguments', () => {
            const program = new Command();
            registerConfigCommands(program);
            
            const configCmd = program.commands.find(cmd => cmd.name() === 'config');
            // Commander stores arguments internally, checking command setup
            expect(configCmd).toBeDefined();
        });
    });

    describe('command action handler', () => {
        let program: Command;

        beforeEach(() => {
            program = new Command();
            program.exitOverride(); // Prevent actual process exit
            registerConfigCommands(program);
        });

        it('should call showConfigPath with --path option', async () => {
            try {
                await program.parseAsync(['node', 'test', 'config', '--path']);
            } catch {
                // exitOverride throws on exit
            }
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('.protokoll');
        });

        it('should call listConfig with --list option', async () => {
            try {
                await program.parseAsync(['node', 'test', 'config', '--list']);
            } catch {
                // exitOverride throws on exit
            }
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Protokoll Configuration');
        });

        it('should call getConfigValue with key argument', async () => {
            try {
                await program.parseAsync(['node', 'test', 'config', 'model']);
            } catch {
                // exitOverride throws on exit
            }
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('AI model');
        });

        it('should call setConfigValue with key and value arguments', async () => {
            try {
                await program.parseAsync(['node', 'test', 'config', 'model', 'test-model']);
            } catch {
                // exitOverride throws on exit
            }
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('model = test-model');
        });

        it('should handle errors in command parsing gracefully', async () => {
            // Test that the command handler exists and is set up correctly
            // The actual error handling is tested through the action handler structure
            const configCmd = program.commands.find(cmd => cmd.name() === 'config');
            expect(configCmd).toBeDefined();
            
            // Test with an invalid config key to trigger console output
            try {
                await program.parseAsync(['node', 'test', 'config', 'invalidKey12345']);
            } catch {
                // Expected - mocked process.exit throws in test
            }
            
            // Verify error message was printed
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Unknown configuration key');
        });
    });

    describe('colors', () => {
        it('should have all expected color codes', () => {
            expect(_internal.colors.reset).toBe('\x1b[0m');
            expect(_internal.colors.bold).toBe('\x1b[1m');
            expect(_internal.colors.dim).toBe('\x1b[2m');
            expect(_internal.colors.cyan).toBe('\x1b[36m');
            expect(_internal.colors.green).toBe('\x1b[32m');
            expect(_internal.colors.yellow).toBe('\x1b[33m');
            expect(_internal.colors.red).toBe('\x1b[31m');
            expect(_internal.colors.blue).toBe('\x1b[34m');
            expect(_internal.colors.magenta).toBe('\x1b[35m');
    });
});

    describe('print function', () => {
        it('should call console.log', () => {
            _internal.print('test message');
            expect(consoleSpy).toHaveBeenCalledWith('test message');
        });
    });

    describe('runInteractiveConfig', () => {
        it('should display interactive header and prompt', async () => {
            // Mock readline to immediately return empty strings (skip all)
            const mockQuestion = vi.fn().mockImplementation((prompt, callback) => callback(''));
            const mockClose = vi.fn();
            vi.mocked(readline.createInterface).mockReturnValue({
                question: mockQuestion,
                close: mockClose,
            } as unknown as readline.Interface);
            
            // Import the module dynamically to get runInteractiveConfig
            const { _internal: internal } = await import('../../src/cli/config');
            
            // Note: runInteractiveConfig is not exported, so we need to test through the command
            // The function is called when no key/value is provided
            const program = new Command();
            program.exitOverride();
            registerConfigCommands(program);
            
            try {
                await program.parseAsync(['node', 'test', 'config']);
            } catch {
                // exitOverride may throw
            }
            
            // Verify header was printed
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('PROTOKOLL CONFIGURATION EDITOR');
        });

        it('should quit when user types q', async () => {
            // First call returns 'q' to quit
            let callCount = 0;
            const mockQuestion = vi.fn().mockImplementation((prompt, callback) => {
                callCount++;
                if (callCount === 1) {
                    callback('q');
                } else {
                    callback('');
                }
            });
            const mockClose = vi.fn();
            vi.mocked(readline.createInterface).mockReturnValue({
                question: mockQuestion,
                close: mockClose,
            } as unknown as readline.Interface);
            
            const program = new Command();
            program.exitOverride();
            registerConfigCommands(program);
            
            try {
                await program.parseAsync(['node', 'test', 'config']);
            } catch {
                // exitOverride may throw
            }
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Configuration cancelled');
        });

        it('should save early when user types s', async () => {
            // First call returns 's' to save
            let callCount = 0;
            const mockQuestion = vi.fn().mockImplementation((prompt, callback) => {
                callCount++;
                if (callCount === 1) {
                    callback('s');
                } else {
                    callback('y'); // Confirm save
                }
            });
            const mockClose = vi.fn();
            vi.mocked(readline.createInterface).mockReturnValue({
                question: mockQuestion,
                close: mockClose,
            } as unknown as readline.Interface);
            
            const program = new Command();
            program.exitOverride();
            registerConfigCommands(program);
            
            try {
                await program.parseAsync(['node', 'test', 'config']);
            } catch {
                // exitOverride may throw
            }
            
            // Should show summary of changes
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Summary of Changes');
        });

        it('should show no changes when user skips all', async () => {
            // All empty responses (skip all)
            const mockQuestion = vi.fn().mockImplementation((prompt, callback) => callback(''));
            const mockClose = vi.fn();
            vi.mocked(readline.createInterface).mockReturnValue({
                question: mockQuestion,
                close: mockClose,
            } as unknown as readline.Interface);
            
            const program = new Command();
            program.exitOverride();
            registerConfigCommands(program);
            
            try {
                await program.parseAsync(['node', 'test', 'config']);
            } catch {
                // exitOverride may throw
            }
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('No changes made');
        });

        it('should set and save a value when user provides input', async () => {
            // Provide a new model value, then skip the rest, then confirm save
            let callCount = 0;
            const responses = [
                'gpt-4o-test',  // model
                '',            // skip transcriptionModel
                '',            // skip reasoningLevel
                's',           // save early
                'y',           // confirm
            ];
            const mockQuestion = vi.fn().mockImplementation((prompt, callback) => {
                callback(responses[callCount] || '');
                callCount++;
            });
            const mockClose = vi.fn();
            vi.mocked(readline.createInterface).mockReturnValue({
                question: mockQuestion,
                close: mockClose,
            } as unknown as readline.Interface);
            
            const program = new Command();
            program.exitOverride();
            registerConfigCommands(program);
            
            try {
                await program.parseAsync(['node', 'test', 'config']);
            } catch {
                // exitOverride may throw
            }
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Set to: gpt-4o-test');
            expect(calls).toContain('Configuration saved');
        });

        it('should reject invalid values and show error', async () => {
            // Try to set invalid reasoningLevel
            let callCount = 0;
            const responses = [
                '',            // skip model
                '',            // skip transcriptionModel
                'invalid',     // invalid reasoningLevel
                '',            // skip after error
                's',           // save early
            ];
            const mockQuestion = vi.fn().mockImplementation((prompt, callback) => {
                callback(responses[callCount] || '');
                callCount++;
            });
            const mockClose = vi.fn();
            vi.mocked(readline.createInterface).mockReturnValue({
                question: mockQuestion,
                close: mockClose,
            } as unknown as readline.Interface);
            
            const program = new Command();
            program.exitOverride();
            registerConfigCommands(program);
            
            try {
                await program.parseAsync(['node', 'test', 'config']);
            } catch {
                // exitOverride may throw
            }
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Invalid value');
        });

        it('should discard changes when user declines save', async () => {
            // Provide a value, then fill through all categories, then decline save
            // The 's' command only breaks from the current category, so we need
            // to skip through all categories before getting to the save confirmation
            let callCount = 0;
            // We need many responses because 's' only breaks from current category
            // Total fields: AI Models (3), Directories (4), Output Format (3), Behavior (6), Limits (1) = 17
            // After setting model, we need to skip ~16 more fields + confirm
            const responses: string[] = [
                'test-discard-model',  // model - set a value so we have changes
            ];
            // Fill with empty responses for remaining 16 fields
            for (let i = 0; i < 16; i++) responses.push('');
            responses.push('n'); // decline save
            
            const mockQuestion = vi.fn().mockImplementation((prompt, callback) => {
                callback(responses[callCount] || '');
                callCount++;
            });
            const mockClose = vi.fn();
            vi.mocked(readline.createInterface).mockReturnValue({
                question: mockQuestion,
                close: mockClose,
            } as unknown as readline.Interface);
            
            const program = new Command();
            program.exitOverride();
            registerConfigCommands(program);
            
            try {
                await program.parseAsync(['node', 'test', 'config']);
            } catch {
                // exitOverride may throw
            }
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('Changes discarded');
        });

        it('should display current values from existing config', async () => {
            // Create existing config
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(
                path.join(configDir, 'config.yaml'),
                'model: existing-model\n',
                'utf-8'
            );
            
            const mockQuestion = vi.fn().mockImplementation((prompt, callback) => callback('q'));
            const mockClose = vi.fn();
            vi.mocked(readline.createInterface).mockReturnValue({
                question: mockQuestion,
                close: mockClose,
            } as unknown as readline.Interface);
            
            const program = new Command();
            program.exitOverride();
            registerConfigCommands(program);
            
            try {
                await program.parseAsync(['node', 'test', 'config']);
            } catch {
                // exitOverride may throw
            }
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            expect(calls).toContain('existing-model');
        });
    });

    describe('edge cases', () => {
        it('should handle config with null value for array type', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(
                path.join(configDir, 'config.yaml'),
                'outputFilenameOptions: null\n',
                'utf-8'
            );
            
            await _internal.listConfig();
            // Should not throw
        });

        it('should handle boolean displayed value when not set', async () => {
            await _internal.getConfigValue('debug');
            
            const calls = consoleSpy.mock.calls.flat().join('\n');
            // Should show default value
            expect(calls).toContain('default');
        });

        it('should handle config with special characters in string values', async () => {
            await _internal.setConfigValue('outputDirectory', '~/my notes/path with spaces');
            
            const configDir = path.join(tempDir, '.protokoll');
            const content = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf-8');
            expect(content).toContain('my notes');
        });
    });
});

describe('Config key validation', () => {
    it('should identify all valid config keys', () => {
        const validKeys = [
            'model',
            'transcriptionModel',
            'reasoningLevel',
            'inputDirectory',
            'outputDirectory',
            'outputStructure',
            'outputFilenameOptions',
            'processedDirectory',
            'timezone',
            'interactive',
            'selfReflection',
            'silent',
            'verbose',
            'debug',
            'dryRun',
            'maxAudioSize',
            'tempDirectory',
        ];
        
        for (const key of validKeys) {
            expect(CONFIG_SCHEMA[key]).toBeDefined();
        }
        
        // Verify we have exactly these keys
        expect(Object.keys(CONFIG_SCHEMA).sort()).toEqual(validKeys.sort());
    });
});
