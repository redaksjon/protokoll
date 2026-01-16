/**
 * Configuration CLI Command
 * 
 * Provides interactive and direct configuration management for Protokoll.
 * 
 * Usage:
 *   protokoll config                     Interactive configuration editor
 *   protokoll config <key>               View a specific setting
 *   protokoll config <key> <value>       Set a specific setting
 *   protokoll config --list              List all settings
 *   protokoll config --path              Show config file path
 */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as readline from 'readline';
import {
    PROTOKOLL_DEFAULTS,
    DEFAULT_CONTEXT_DIR_NAME,
    DEFAULT_CONTEXT_CONFIG_FILE_NAME,
    ALLOWED_OUTPUT_STRUCTURES,
    ALLOWED_OUTPUT_FILENAME_OPTIONS,
} from '../constants';

// Configuration schema with descriptions and allowed values
export const CONFIG_SCHEMA: Record<string, ConfigOption> = {
    model: {
        description: 'AI model for transcription enhancement',
        type: 'string',
        default: PROTOKOLL_DEFAULTS.model,
        examples: ['gpt-5.2', 'gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet'],
    },
    transcriptionModel: {
        description: 'Model for audio transcription',
        type: 'string',
        default: PROTOKOLL_DEFAULTS.transcriptionModel,
        examples: ['whisper-1'],
    },
    reasoningLevel: {
        description: 'How much reasoning effort to use',
        type: 'string',
        default: PROTOKOLL_DEFAULTS.reasoningLevel,
        allowed: ['low', 'medium', 'high'],
    },
    inputDirectory: {
        description: 'Directory to read audio files from',
        type: 'path',
        default: './',
    },
    outputDirectory: {
        description: 'Directory to write transcripts to',
        type: 'path',
        default: '~/notes',
    },
    outputStructure: {
        description: 'Directory structure for output files',
        type: 'string',
        default: 'month',
        allowed: ALLOWED_OUTPUT_STRUCTURES as unknown as string[],
    },
    outputFilenameOptions: {
        description: 'Components to include in output filenames',
        type: 'array',
        default: ['date', 'time', 'subject'],
        allowed: ALLOWED_OUTPUT_FILENAME_OPTIONS as unknown as string[],
    },
    processedDirectory: {
        description: 'Directory to move processed audio files to',
        type: 'path',
        default: './processed',
    },
    timezone: {
        description: 'Timezone for date/time operations',
        type: 'string',
        default: 'Etc/UTC',
        examples: ['America/New_York', 'Europe/London', 'Asia/Tokyo'],
    },
    interactive: {
        description: 'Enable interactive prompts during transcription',
        type: 'boolean',
        default: true,
    },
    selfReflection: {
        description: 'Generate self-reflection reports after processing',
        type: 'boolean',
        default: true,
    },
    silent: {
        description: 'Disable sound notifications',
        type: 'boolean',
        default: false,
    },
    verbose: {
        description: 'Enable verbose logging output',
        type: 'boolean',
        default: false,
    },
    debug: {
        description: 'Enable debug mode with detailed logs',
        type: 'boolean',
        default: false,
    },
    dryRun: {
        description: 'Show what would happen without making changes',
        type: 'boolean',
        default: false,
    },
    maxAudioSize: {
        description: 'Maximum audio file size in bytes (default: 25MB)',
        type: 'number',
        default: 26214400,
    },
    tempDirectory: {
        description: 'Temporary directory for processing',
        type: 'path',
        default: '/tmp',
    },
};

interface ConfigOption {
    description: string;
    type: 'string' | 'boolean' | 'number' | 'path' | 'array';
    default: unknown;
    allowed?: string[];
    examples?: string[];
}

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
};

// eslint-disable-next-line no-console
const print = (msg: string) => console.log(msg);

// Export internal functions for testing
export const _internal = {
    get findConfigPath() { return findConfigPath; },
    get loadConfig() { return loadConfig; },
    get saveConfig() { return saveConfig; },
    get parseValue() { return parseValue; },
    get formatValue() { return formatValue; },
    get listConfig() { return listConfig; },
    get getConfigValue() { return getConfigValue; },
    get setConfigValue() { return setConfigValue; },
    get showConfigPath() { return showConfigPath; },
    print,
    colors,
};

/**
 * Find the config file path
 */
const findConfigPath = async (): Promise<{ configPath: string; exists: boolean }> => {
    // Check current directory first, then home directory
    const cwd = process.cwd();
    const home = process.env.HOME || process.env.USERPROFILE || '';
    
    const locations = [
        path.join(cwd, DEFAULT_CONTEXT_DIR_NAME, DEFAULT_CONTEXT_CONFIG_FILE_NAME),
        path.join(home, DEFAULT_CONTEXT_DIR_NAME, DEFAULT_CONTEXT_CONFIG_FILE_NAME),
    ];
    
    for (const loc of locations) {
        try {
            await fs.access(loc);
            return { configPath: loc, exists: true };
        } catch {
            // Continue checking
        }
    }
    
    // Default to home directory if no config exists
    return {
        configPath: path.join(home, DEFAULT_CONTEXT_DIR_NAME, DEFAULT_CONTEXT_CONFIG_FILE_NAME),
        exists: false,
    };
};

/**
 * Load current configuration
 */
const loadConfig = async (): Promise<Record<string, unknown>> => {
    const { configPath, exists } = await findConfigPath();
    
    if (!exists) {
        return {};
    }
    
    try {
        const content = await fs.readFile(configPath, 'utf-8');
        const parsed = yaml.load(content);
        return (parsed as Record<string, unknown>) || {};
    } catch {
        return {};
    }
};

/**
 * Save configuration
 */
const saveConfig = async (config: Record<string, unknown>): Promise<string> => {
    const { configPath } = await findConfigPath();
    
    // Ensure directory exists
    const configDir = path.dirname(configPath);
    await fs.mkdir(configDir, { recursive: true });
    
    // Write YAML with nice formatting
    const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 80,
        quotingType: '"',
        forceQuotes: false,
    });
    
    await fs.writeFile(configPath, yamlContent, 'utf-8');
    return configPath;
};

/**
 * Parse a value according to its type
 */
const parseValue = (value: string, type: string): unknown => {
    switch (type) {
        case 'boolean':
            return value.toLowerCase() === 'true' || value === '1' || value === 'yes';
        case 'number':
            return parseInt(value, 10);
        case 'array':
            // Support comma-separated or space-separated values
            return value.split(/[,\s]+/).filter(v => v.length > 0);
        default:
            return value;
    }
};

/**
 * Format a value for display
 */
const formatValue = (value: unknown, type: string): string => {
    if (value === undefined || value === null) {
        return `${colors.dim}(not set)${colors.reset}`;
    }
    
    switch (type) {
        case 'boolean':
            return value ? `${colors.green}true${colors.reset}` : `${colors.red}false${colors.reset}`;
        case 'array':
            return Array.isArray(value) ? value.join(', ') : String(value);
        default:
            return String(value);
    }
};

/**
 * Interactive configuration editor
 */
const runInteractiveConfig = async (): Promise<void> => {
    const config = await loadConfig();
    const { configPath, exists } = await findConfigPath();
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    
    const question = (prompt: string): Promise<string> => {
        return new Promise((resolve) => {
            rl.question(prompt, (answer) => {
                resolve(answer);
            });
        });
    };
    
    print('');
    print(`${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
    print(`${colors.bold}${colors.cyan}║           PROTOKOLL CONFIGURATION EDITOR                       ║${colors.reset}`);
    print(`${colors.bold}${colors.cyan}╚════════════════════════════════════════════════════════════════╝${colors.reset}`);
    print('');
    print(`${colors.dim}Config file: ${configPath}${exists ? '' : ' (will be created)'}${colors.reset}`);
    print('');
    print(`${colors.dim}Press Enter to keep current value, or type a new value.${colors.reset}`);
    print(`${colors.dim}Type 'q' to quit, 's' to save and exit.${colors.reset}`);
    print('');
    
    const updatedConfig = { ...config };
    const keys = Object.keys(CONFIG_SCHEMA);
    
    // Group settings by category
    const categories: Record<string, string[]> = {
        'AI Models': ['model', 'transcriptionModel', 'reasoningLevel'],
        'Directories': ['inputDirectory', 'outputDirectory', 'processedDirectory', 'tempDirectory'],
        'Output Format': ['outputStructure', 'outputFilenameOptions', 'timezone'],
        'Behavior': ['interactive', 'selfReflection', 'silent', 'verbose', 'debug', 'dryRun'],
        'Limits': ['maxAudioSize'],
    };
    
    for (const [category, categoryKeys] of Object.entries(categories)) {
        print(`${colors.bold}${colors.blue}── ${category} ──${colors.reset}`);
        print('');
        
        for (const key of categoryKeys) {
            if (!keys.includes(key)) continue;
            
            const schema = CONFIG_SCHEMA[key];
            const currentValue = config[key];
            const defaultValue = schema.default;
            
            // Show setting info
            print(`  ${colors.bold}${key}${colors.reset}`);
            print(`  ${colors.dim}${schema.description}${colors.reset}`);
            
            if (schema.allowed) {
                print(`  ${colors.dim}Allowed: ${schema.allowed.join(', ')}${colors.reset}`);
            }
            if (schema.examples) {
                print(`  ${colors.dim}Examples: ${schema.examples.join(', ')}${colors.reset}`);
            }
            
            const displayCurrent = currentValue !== undefined 
                ? formatValue(currentValue, schema.type)
                : `${colors.dim}default: ${formatValue(defaultValue, schema.type)}${colors.reset}`;
            
            print(`  Current: ${displayCurrent}`);
            
            const input = await question(`  ${colors.yellow}New value${colors.reset} (Enter to skip): `);
            
            if (input.toLowerCase() === 'q') {
                print('\nConfiguration cancelled.');
                rl.close();
                return;
            }
            
            if (input.toLowerCase() === 's') {
                break;
            }
            
            if (input.trim()) {
                const parsedValue = parseValue(input.trim(), schema.type);
                
                // Validate against allowed values
                if (schema.allowed) {
                    const valueToCheck = Array.isArray(parsedValue) ? parsedValue : [parsedValue];
                    const invalid = valueToCheck.filter(v => !schema.allowed!.includes(String(v)));
                    if (invalid.length > 0) {
                        print(`  ${colors.red}Invalid value(s): ${invalid.join(', ')}${colors.reset}`);
                        print(`  ${colors.dim}Allowed: ${schema.allowed.join(', ')}${colors.reset}`);
                        continue;
                    }
                }
                
                updatedConfig[key] = parsedValue;
                print(`  ${colors.green}✓ Set to: ${formatValue(parsedValue, schema.type)}${colors.reset}`);
            }
            
            print('');
        }
    }
    
    rl.close();
    
    // Show summary and ask to save
    print(`${colors.bold}${colors.cyan}── Summary of Changes ──${colors.reset}`);
    print('');
    
    let hasChanges = false;
    for (const key of Object.keys(updatedConfig)) {
        if (JSON.stringify(updatedConfig[key]) !== JSON.stringify(config[key])) {
            print(`  ${colors.green}${key}${colors.reset}: ${formatValue(config[key], CONFIG_SCHEMA[key]?.type || 'string')} → ${formatValue(updatedConfig[key], CONFIG_SCHEMA[key]?.type || 'string')}`);
            hasChanges = true;
        }
    }
    
    if (!hasChanges) {
        print(`  ${colors.dim}No changes made.${colors.reset}`);
        return;
    }
    
    print('');
    
    const rl2 = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    
    const confirm = await new Promise<string>((resolve) => {
        rl2.question(`${colors.yellow}Save changes?${colors.reset} (Y/n): `, resolve);
    });
    rl2.close();
    
    if (confirm.toLowerCase() !== 'n') {
        const savedPath = await saveConfig(updatedConfig);
        print(`${colors.green}✓ Configuration saved to: ${savedPath}${colors.reset}`);
    } else {
        print('Changes discarded.');
    }
};

/**
 * List all configuration options
 */
const listConfig = async (): Promise<void> => {
    const config = await loadConfig();
    const { configPath, exists } = await findConfigPath();
    
    print('');
    print(`${colors.bold}${colors.cyan}Protokoll Configuration${colors.reset}`);
    print(`${colors.dim}Config file: ${configPath}${exists ? '' : ' (not found)'}${colors.reset}`);
    print('');
    
    // Calculate max key length for alignment
    const maxKeyLen = Math.max(...Object.keys(CONFIG_SCHEMA).map(k => k.length));
    
    for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
        const currentValue = config[key];
        const isDefault = currentValue === undefined;
        const displayValue = isDefault
            ? `${colors.dim}${formatValue(schema.default, schema.type)} (default)${colors.reset}`
            : formatValue(currentValue, schema.type);
        
        const paddedKey = key.padEnd(maxKeyLen);
        print(`  ${colors.bold}${paddedKey}${colors.reset}  ${displayValue}`);
    }
    
    print('');
    print(`${colors.dim}Run 'protokoll config' for interactive editor${colors.reset}`);
    print(`${colors.dim}Run 'protokoll config <key> <value>' to set a value${colors.reset}`);
};

/**
 * Get a specific configuration value
 */
const getConfigValue = async (key: string): Promise<void> => {
    const config = await loadConfig();
    const schema = CONFIG_SCHEMA[key];
    
    if (!schema) {
        print(`${colors.red}Unknown configuration key: ${key}${colors.reset}`);
        print('');
        print('Available keys:');
        for (const k of Object.keys(CONFIG_SCHEMA)) {
            print(`  ${k}`);
        }
        process.exit(1);
    }
    
    const currentValue = config[key];
    const isDefault = currentValue === undefined;
    
    print('');
    print(`${colors.bold}${key}${colors.reset}`);
    print(`${colors.dim}${schema.description}${colors.reset}`);
    print('');
    
    if (isDefault) {
        print(`Value: ${colors.dim}${formatValue(schema.default, schema.type)} (default)${colors.reset}`);
    } else {
        print(`Value: ${formatValue(currentValue, schema.type)}`);
    }
    
    if (schema.allowed) {
        print(`${colors.dim}Allowed: ${schema.allowed.join(', ')}${colors.reset}`);
    }
    if (schema.examples) {
        print(`${colors.dim}Examples: ${schema.examples.join(', ')}${colors.reset}`);
    }
};

/**
 * Set a configuration value
 */
const setConfigValue = async (key: string, value: string): Promise<void> => {
    const config = await loadConfig();
    const schema = CONFIG_SCHEMA[key];
    
    if (!schema) {
        print(`${colors.red}Unknown configuration key: ${key}${colors.reset}`);
        print('');
        print('Available keys:');
        for (const k of Object.keys(CONFIG_SCHEMA)) {
            print(`  ${k}`);
        }
        process.exit(1);
    }
    
    const parsedValue = parseValue(value, schema.type);
    
    // Validate against allowed values
    if (schema.allowed) {
        const valueToCheck = Array.isArray(parsedValue) ? parsedValue : [parsedValue];
        const invalid = valueToCheck.filter(v => !schema.allowed!.includes(String(v)));
        if (invalid.length > 0) {
            print(`${colors.red}Invalid value: ${value}${colors.reset}`);
            print(`${colors.dim}Allowed: ${schema.allowed.join(', ')}${colors.reset}`);
            process.exit(1);
        }
    }
    
    config[key] = parsedValue;
    const savedPath = await saveConfig(config);
    
    print(`${colors.green}✓${colors.reset} ${key} = ${formatValue(parsedValue, schema.type)}`);
    print(`${colors.dim}Saved to: ${savedPath}${colors.reset}`);
};

/**
 * Show config file path
 */
const showConfigPath = async (): Promise<void> => {
    const { configPath, exists } = await findConfigPath();
    print(configPath);
    if (!exists) {
        print(`${colors.dim}(file does not exist yet)${colors.reset}`);
    }
};

/**
 * Register the config command
 */
export const registerConfigCommands = (program: Command): void => {
    program
        .command('config')
        .description('View and edit Protokoll configuration')
        .argument('[key]', 'Configuration key to view or set')
        .argument('[value]', 'Value to set (if provided)')
        .option('-l, --list', 'List all configuration options')
        .option('-p, --path', 'Show configuration file path')
        .action(async (key: string | undefined, value: string | undefined, options: { list?: boolean; path?: boolean }) => {
            try {
                if (options.path) {
                    await showConfigPath();
                } else if (options.list) {
                    await listConfig();
                } else if (key && value) {
                    await setConfigValue(key, value);
                } else if (key) {
                    await getConfigValue(key);
                } else {
                    await runInteractiveConfig();
                }
            } catch (error) {
                print(`${colors.red}Error: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}`);
                process.exit(1);
            }
        });
};
