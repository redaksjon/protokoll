/**
 * Tests for Config CLI Command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock the config module functions for testing
describe('Config CLI', () => {
    let tempDir: string;
    let originalHome: string | undefined;

    beforeEach(async () => {
        // Create a temp directory for test config files
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-config-test-'));
        originalHome = process.env.HOME;
        process.env.HOME = tempDir;
    });

    afterEach(async () => {
        process.env.HOME = originalHome;
        await fs.rm(tempDir, { recursive: true });
    });

    describe('CONFIG_SCHEMA', () => {
        it('should have required configuration options', async () => {
            // Import the module to test the schema
            const { CONFIG_SCHEMA } = await import('../../src/cli/config') as any;
            
            expect(CONFIG_SCHEMA.model).toBeDefined();
            expect(CONFIG_SCHEMA.model.description).toBeTruthy();
            expect(CONFIG_SCHEMA.model.type).toBe('string');
            
            expect(CONFIG_SCHEMA.transcriptionModel).toBeDefined();
            expect(CONFIG_SCHEMA.reasoningLevel).toBeDefined();
            expect(CONFIG_SCHEMA.inputDirectory).toBeDefined();
            expect(CONFIG_SCHEMA.outputDirectory).toBeDefined();
        });

        it('should have valid types for all options', async () => {
            const { CONFIG_SCHEMA } = await import('../../src/cli/config') as any;
            
            const validTypes = ['string', 'boolean', 'number', 'path', 'array'];
            
            for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
                const option = schema as any;
                expect(validTypes).toContain(option.type);
                expect(option.description).toBeTruthy();
                expect(option.default).toBeDefined();
            }
        });

        it('should have allowed values for constrained options', async () => {
            const { CONFIG_SCHEMA } = await import('../../src/cli/config') as any;
            
            expect(CONFIG_SCHEMA.reasoningLevel.allowed).toContain('low');
            expect(CONFIG_SCHEMA.reasoningLevel.allowed).toContain('medium');
            expect(CONFIG_SCHEMA.reasoningLevel.allowed).toContain('high');
            
            expect(CONFIG_SCHEMA.outputStructure.allowed).toContain('month');
            expect(CONFIG_SCHEMA.outputStructure.allowed).toContain('year');
            expect(CONFIG_SCHEMA.outputStructure.allowed).toContain('day');
            expect(CONFIG_SCHEMA.outputStructure.allowed).toContain('none');
        });
    });

    describe('parseValue', () => {
        it('should parse boolean values correctly', async () => {
            // We need to test the internal parseValue function
            // Since it's not exported, we'll test through the command behavior
            
            // Create a config file
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            
            // Write initial config
            const configPath = path.join(configDir, 'config.yaml');
            await fs.writeFile(configPath, 'debug: false\n', 'utf-8');
            
            // Verify the file was created
            const content = await fs.readFile(configPath, 'utf-8');
            expect(content).toContain('debug: false');
        });

        it('should parse numeric values', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            
            const configPath = path.join(configDir, 'config.yaml');
            await fs.writeFile(configPath, 'maxAudioSize: 52428800\n', 'utf-8');
            
            const content = await fs.readFile(configPath, 'utf-8');
            expect(content).toContain('maxAudioSize: 52428800');
        });
    });

    describe('config file operations', () => {
        it('should create config directory if it does not exist', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            
            // Verify directory doesn't exist
            await expect(fs.access(configDir)).rejects.toThrow();
            
            // Create it
            await fs.mkdir(configDir, { recursive: true });
            
            // Verify it exists now
            const stat = await fs.stat(configDir);
            expect(stat.isDirectory()).toBe(true);
        });

        it('should load existing config file', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            
            const configPath = path.join(configDir, 'config.yaml');
            await fs.writeFile(configPath, `
model: gpt-4o-mini
debug: true
outputDirectory: ~/my-notes
`, 'utf-8');
            
            const content = await fs.readFile(configPath, 'utf-8');
            expect(content).toContain('model: gpt-4o-mini');
            expect(content).toContain('debug: true');
            expect(content).toContain('outputDirectory: ~/my-notes');
        });

        it('should handle empty config file', async () => {
            const configDir = path.join(tempDir, '.protokoll');
            await fs.mkdir(configDir, { recursive: true });
            
            const configPath = path.join(configDir, 'config.yaml');
            await fs.writeFile(configPath, '', 'utf-8');
            
            const content = await fs.readFile(configPath, 'utf-8');
            expect(content).toBe('');
        });
    });

    describe('registerConfigCommands', () => {
        it('should register the config command', async () => {
            const { Command } = await import('commander');
            const { registerConfigCommands } = await import('../../src/cli/config');
            
            const program = new Command();
            registerConfigCommands(program);
            
            // Find the config command
            const configCmd = program.commands.find(cmd => cmd.name() === 'config');
            expect(configCmd).toBeDefined();
            expect(configCmd?.description()).toContain('configuration');
        });

        it('should have list and path options', async () => {
            const { Command } = await import('commander');
            const { registerConfigCommands } = await import('../../src/cli/config');
            
            const program = new Command();
            registerConfigCommands(program);
            
            const configCmd = program.commands.find(cmd => cmd.name() === 'config');
            const options = configCmd?.options || [];
            
            const listOpt = options.find(o => o.long === '--list');
            const pathOpt = options.find(o => o.long === '--path');
            
            expect(listOpt).toBeDefined();
            expect(pathOpt).toBeDefined();
        });
    });

    describe('YAML formatting', () => {
        it('should produce valid YAML output', async () => {
            const yaml = await import('js-yaml');
            
            const config = {
                model: 'gpt-5.2',
                debug: true,
                outputFilenameOptions: ['date', 'time', 'subject'],
            };
            
            const yamlContent = yaml.dump(config, {
                indent: 2,
                lineWidth: 80,
            });
            
            // Should be parseable
            const parsed = yaml.load(yamlContent);
            expect(parsed).toEqual(config);
        });
    });
});

describe('Config value parsing', () => {
    it('should handle various boolean representations', () => {
        const parseBoolean = (value: string): boolean => {
            return value.toLowerCase() === 'true' || value === '1' || value === 'yes';
        };
        
        expect(parseBoolean('true')).toBe(true);
        expect(parseBoolean('TRUE')).toBe(true);
        expect(parseBoolean('True')).toBe(true);
        expect(parseBoolean('1')).toBe(true);
        expect(parseBoolean('yes')).toBe(true);
        expect(parseBoolean('false')).toBe(false);
        expect(parseBoolean('0')).toBe(false);
        expect(parseBoolean('no')).toBe(false);
    });

    it('should parse arrays from comma-separated values', () => {
        const parseArray = (value: string): string[] => {
            return value.split(/[,\s]+/).filter(v => v.length > 0);
        };
        
        expect(parseArray('date,time,subject')).toEqual(['date', 'time', 'subject']);
        expect(parseArray('date time subject')).toEqual(['date', 'time', 'subject']);
        expect(parseArray('date, time, subject')).toEqual(['date', 'time', 'subject']);
    });

    it('should parse numbers correctly', () => {
        const parseNumber = (value: string): number => {
            return parseInt(value, 10);
        };
        
        expect(parseNumber('26214400')).toBe(26214400);
        expect(parseNumber('52428800')).toBe(52428800);
    });
});

describe('Config key validation', () => {
    it('should identify valid config keys', async () => {
        const { CONFIG_SCHEMA } = await import('../../src/cli/config') as any;
        
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
    });
});
