/**
 * Install Command
 * 
 * Interactive setup wizard for first-time Protokoll configuration.
 * Guides users through model selection, directory setup, and project creation.
 */

import { Command } from 'commander';
import * as readline from 'readline';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import { VERSION, DEFAULT_MODEL, DEFAULT_TRANSCRIPTION_MODEL } from '../constants';

// Helper to print to stdout
const print = (text: string) => process.stdout.write(text + '\n');

// ANSI color codes for pretty output
const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
};

const bold = (text: string) => `${colors.bold}${text}${colors.reset}`;
const dim = (text: string) => `${colors.dim}${text}${colors.reset}`;
const green = (text: string) => `${colors.green}${text}${colors.reset}`;
const yellow = (text: string) => `${colors.yellow}${text}${colors.reset}`;
const blue = (text: string) => `${colors.blue}${text}${colors.reset}`;
const cyan = (text: string) => `${colors.cyan}${text}${colors.reset}`;
const magenta = (text: string) => `${colors.magenta}${text}${colors.reset}`;

// Helper for interactive prompts
const askQuestion = (rl: readline.Interface, question: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
};

const createReadline = () => readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// Model information for guidance
const MODEL_INFO = {
    reasoning: [
        { name: 'gpt-5.2', provider: 'OpenAI', notes: 'Default - High reasoning, best quality', recommended: true },
        { name: 'gpt-5.1', provider: 'OpenAI', notes: 'High reasoning, balanced' },
        { name: 'gpt-5', provider: 'OpenAI', notes: 'Fast and capable' },
        { name: 'gpt-4o', provider: 'OpenAI', notes: 'Previous gen, still capable' },
        { name: 'gpt-4o-mini', provider: 'OpenAI', notes: 'Fast, lower cost' },
        { name: 'o1', provider: 'OpenAI', notes: 'Reasoning-focused' },
        { name: 'o1-mini', provider: 'OpenAI', notes: 'Faster reasoning' },
        { name: 'claude-3-5-sonnet', provider: 'Anthropic', notes: 'Recommended for quality' },
        { name: 'claude-3-opus', provider: 'Anthropic', notes: 'Highest capability' },
    ],
    transcription: [
        { name: 'whisper-1', notes: 'Default, reliable', recommended: true },
        { name: 'gpt-4o-transcribe', notes: 'Newer, supports prompting' },
    ],
};

interface InstallConfig {
    model: string;
    transcriptionModel: string;
    inputDirectory: string;
    outputDirectory: string;
    processedDirectory?: string;
    useProjects: boolean;
    projects: ProjectSetup[];
}

interface ProjectSetup {
    name: string;
    id: string;
    description?: string;
    destination?: string;
    contextType: 'work' | 'personal' | 'mixed';
    structure: 'none' | 'year' | 'month' | 'day';
    triggerPhrases: string[];
}

/**
 * Print the welcome banner
 */
const printWelcome = () => {
    print('');
    print('═'.repeat(60));
    print(bold(cyan(`  ╔═╗┬─┐┌─┐┌┬┐┌─┐┬┌─┌─┐┬  ┬  `)));
    print(bold(cyan(`  ╠═╝├┬┘│ │ │ │ │├┴┐│ ││  │  `)));
    print(bold(cyan(`  ╩  ┴└─└─┘ ┴ └─┘┴ ┴└─┘┴─┘┴─┘`)));
    print('');
    print(dim(`  Intelligent Audio Transcription`));
    print(dim(`  Version ${VERSION}`));
    print('═'.repeat(60));
    print('');
    print(`Welcome to ${bold('Protokoll')}! This wizard will help you set up your`);
    print(`configuration for intelligent audio transcription.`);
    print('');
};

/**
 * Print the models table
 */
const printModelsTable = (type: 'reasoning' | 'transcription') => {
    const models = MODEL_INFO[type];
    print('');
    print(bold(`Available ${type === 'reasoning' ? 'Reasoning' : 'Transcription'} Models:`));
    print('');
    print(`  ${dim('Model'.padEnd(20))} ${dim('Provider'.padEnd(12))} ${dim('Notes')}`);
    print('  ' + '─'.repeat(56));
    
    for (const model of models) {
        const marker = model.recommended ? green('★ ') : '  ';
        const provider = 'provider' in model ? (model as { provider: string }).provider : 'OpenAI';
        print(`  ${marker}${model.name.padEnd(18)} ${provider.padEnd(12)} ${model.notes}`);
    }
    print('');
    if (models.some(m => m.recommended)) {
        print(`  ${green('★')} = Recommended`);
        print('');
    }
};

/**
 * Ask for model selection
 */
const askModel = async (rl: readline.Interface): Promise<{ model: string; transcriptionModel: string }> => {
    print(bold(yellow('─── Step 1: Model Selection ───')));
    print('');
    print(`Protokoll uses two AI models:`);
    print(`  1. ${bold('Reasoning Model')}: Enhances transcripts, corrects names, routes notes`);
    print(`  2. ${bold('Transcription Model')}: Converts audio to text (Whisper)`);
    print('');

    // Reasoning model
    printModelsTable('reasoning');
    print(`You can use any OpenAI or Anthropic model. The default (${DEFAULT_MODEL}) provides`);
    print(`the best balance of quality and capability.`);
    print('');
    
    const modelInput = await askQuestion(rl, `Reasoning model [${DEFAULT_MODEL}]: `);
    const model = modelInput || DEFAULT_MODEL;
    print(green(`  ✓ Using reasoning model: ${model}`));
    print('');

    // Transcription model
    printModelsTable('transcription');
    const transInput = await askQuestion(rl, `Transcription model [${DEFAULT_TRANSCRIPTION_MODEL}]: `);
    const transcriptionModel = transInput || DEFAULT_TRANSCRIPTION_MODEL;
    print(green(`  ✓ Using transcription model: ${transcriptionModel}`));
    print('');

    return { model, transcriptionModel };
};

/**
 * Ask for directory configuration
 */
const askDirectories = async (rl: readline.Interface): Promise<{ inputDirectory: string; outputDirectory: string; processedDirectory?: string }> => {
    print(bold(yellow('─── Step 2: Directory Configuration ───')));
    print('');
    print(`Protokoll needs to know where your audio files are and where`);
    print(`transcripts should be saved.`);
    print('');

    // Input directory
    print(bold('Audio Input Directory'));
    print(dim(`  Where do your audio recordings live? This is where Protokoll`));
    print(dim(`  will look for files to transcribe.`));
    print('');
    const inputDir = await askQuestion(rl, `Audio input directory [./recordings]: `);
    const inputDirectory = inputDir || './recordings';
    print(green(`  ✓ Will look for audio files in: ${inputDirectory}`));
    print('');

    // Output directory
    print(bold('Transcript Output Directory'));
    print(dim(`  Where should transcribed notes be saved? This is your default`));
    print(dim(`  destination (projects can override this).`));
    print('');
    const outputDir = await askQuestion(rl, `Transcript output directory [~/notes]: `);
    const outputDirectory = outputDir || '~/notes';
    print(green(`  ✓ Will save transcripts to: ${outputDirectory}`));
    print('');

    // Processed directory
    print(bold('Processed Audio Directory'));
    print(dim(`  After transcription, should audio files be moved somewhere?`));
    print(dim(`  Leave blank to keep them in place, or specify a directory.`));
    print('');
    const processedDir = await askQuestion(rl, `Move processed audio to (Enter to skip): `);
    const processedDirectory = processedDir || undefined;
    if (processedDirectory) {
        print(green(`  ✓ Will move processed audio to: ${processedDirectory}`));
    } else {
        print(dim(`  ○ Audio files will remain in place after processing`));
    }
    print('');

    return { inputDirectory, outputDirectory, processedDirectory };
};

/**
 * Ask about projects/contexts
 */
const askAboutProjects = async (rl: readline.Interface): Promise<boolean> => {
    print(bold(yellow('─── Step 3: Projects & Contexts ───')));
    print('');
    print(`Protokoll can route transcripts to different destinations based`);
    print(`on content. This is done through ${bold('Projects')}.`);
    print('');

    print(bold(`What's a Project?`));
    print(`  • A named context that triggers specific routing`);
    print(`  • Examples: "Work Notes", "Personal Journal", "Client Alpha"`);
    print(`  • Each project has trigger phrases that identify it`);
    print(`  • Projects route notes to specific folders automatically`);
    print('');

    print(bold(`What's a Context?`));
    print(`  • The broader category a project belongs to`);
    print(`  • Three types: ${cyan('work')}, ${magenta('personal')}, or ${yellow('mixed')}`);
    print(`  • Helps Protokoll understand note categorization`);
    print('');

    print(bold(`Examples:`));
    print(dim(`  • "Meeting with Sarah about Project Alpha" → routes to ~/work/alpha/`));
    print(dim(`  • "Reminder to pick up groceries" → routes to ~/personal/`));
    print(dim(`  • "Skiing trip planning" → routes to ~/personal/trips/`));
    print('');

    const answer = await askQuestion(rl, `Do you want to set up projects? (Y/n): `);
    const useProjects = answer.toLowerCase() !== 'n';
    
    if (useProjects) {
        print(green(`  ✓ Let's set up some projects!`));
    } else {
        print(dim(`  ○ Skipping project setup (you can add them later)`));
    }
    print('');

    return useProjects;
};

/**
 * Interactive project creation
 */
const createProject = async (rl: readline.Interface, existingIds: Set<string>): Promise<ProjectSetup | null> => {
    print('');
    print(bold(blue('─── New Project ───')));
    print('');

    const name = await askQuestion(rl, `Project name (or Enter to finish): `);
    if (!name) {
        return null;
    }

    // Generate ID
    const suggestedId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    let finalId = suggestedId;
    
    // Check for conflicts
    if (existingIds.has(suggestedId)) {
        const customId = await askQuestion(rl, `ID "${suggestedId}" exists. Enter new ID: `);
        finalId = customId.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    } else {
        const idInput = await askQuestion(rl, `ID [${suggestedId}]: `);
        if (idInput) {
            finalId = idInput.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        }
    }

    // Description
    const description = await askQuestion(rl, `Description (Enter to skip): `);

    // Context type
    print(`Context type: ${cyan('work')} | ${magenta('personal')} | ${yellow('mixed')}`);
    const ctxInput = await askQuestion(rl, `Context type [work]: `);
    const contextType = (['work', 'personal', 'mixed'].includes(ctxInput) ? ctxInput : 'work') as 'work' | 'personal' | 'mixed';

    // Destination
    print(dim(`  Leave blank to use global default output directory`));
    const destination = await askQuestion(rl, `Output destination (Enter for default): `);

    // Structure
    print(`Directory structure: ${dim('none')} | ${dim('year')} | ${bold('month')} | ${dim('day')}`);
    print(dim(`  none:  output/transcript.md`));
    print(dim(`  year:  output/2026/transcript.md`));
    print(dim(`  month: output/2026/01/transcript.md`));
    print(dim(`  day:   output/2026/01/15/transcript.md`));
    const structInput = await askQuestion(rl, `Structure [month]: `);
    const structure = (['none', 'year', 'month', 'day'].includes(structInput) ? structInput : 'month') as 'none' | 'year' | 'month' | 'day';

    // Trigger phrases
    print(`Trigger phrases - words/phrases that identify this project`);
    print(dim(`  Examples: "work note", "project alpha", "client meeting"`));
    const phrasesInput = await askQuestion(rl, `Trigger phrases (comma-separated): `);
    const triggerPhrases = phrasesInput ? phrasesInput.split(',').map(s => s.trim()).filter(Boolean) : [];

    const project: ProjectSetup = {
        name,
        id: finalId,
        ...(description && { description }),
        ...(destination && { destination }),
        contextType,
        structure,
        triggerPhrases,
    };

    print('');
    print(green(`  ✓ Project "${name}" created`));
    
    return project;
};

/**
 * Create multiple projects
 */
const createProjects = async (rl: readline.Interface): Promise<ProjectSetup[]> => {
    const projects: ProjectSetup[] = [];
    const existingIds = new Set<string>();

    print('');
    print(`Let's create your first project. You can add more after.`);
    print(dim(`Press Enter without a name when you're done adding projects.`));

    while (true) {
        const project = await createProject(rl, existingIds);
        if (!project) {
            break;
        }
        projects.push(project);
        existingIds.add(project.id);
        
        print('');
        print(dim(`Added ${projects.length} project(s). Add another or press Enter to continue.`));
    }

    return projects;
};

/**
 * Write the configuration files
 */
const writeConfiguration = async (config: InstallConfig): Promise<string> => {
    const configDir = '.protokoll';
    const configPath = path.join(process.cwd(), configDir);
    
    // Create directory structure
    await fs.mkdir(configPath, { recursive: true });
    await fs.mkdir(path.join(configPath, 'context', 'projects'), { recursive: true });
    await fs.mkdir(path.join(configPath, 'context', 'people'), { recursive: true });
    await fs.mkdir(path.join(configPath, 'context', 'terms'), { recursive: true });
    await fs.mkdir(path.join(configPath, 'context', 'companies'), { recursive: true });
    await fs.mkdir(path.join(configPath, 'context', 'ignored'), { recursive: true });

    // Build config.yaml content
    const configContent: Record<string, unknown> = {
        model: config.model,
        transcriptionModel: config.transcriptionModel,
        inputDirectory: config.inputDirectory,
        outputDirectory: config.outputDirectory,
    };

    if (config.processedDirectory) {
        configContent.processedDirectory = config.processedDirectory;
    }

    // Write config.yaml
    const configYaml = yaml.dump(configContent, { lineWidth: -1 });
    await fs.writeFile(path.join(configPath, 'config.yaml'), configYaml, 'utf-8');

    // Write project files
    for (const project of config.projects) {
        const projectData: Record<string, unknown> = {
            id: project.id,
            name: project.name,
            ...(project.description && { description: project.description }),
            classification: {
                context_type: project.contextType,
                explicit_phrases: project.triggerPhrases,
            },
            routing: {
                ...(project.destination && { destination: project.destination }),
                structure: project.structure,
                filename_options: ['date', 'time', 'subject'],
            },
            active: true,
        };

        const projectYaml = yaml.dump(projectData, { lineWidth: -1 });
        await fs.writeFile(
            path.join(configPath, 'context', 'projects', `${project.id}.yaml`),
            projectYaml,
            'utf-8'
        );
    }

    return configPath;
};

/**
 * Print configuration summary
 */
const printSummary = (config: InstallConfig, configPath: string) => {
    print('');
    print('═'.repeat(60));
    print(bold(green('  ✓ Installation Complete!')));
    print('═'.repeat(60));
    print('');

    print(bold('Configuration Summary'));
    print('─'.repeat(40));
    print('');

    print(bold('Models:'));
    print(`  Reasoning:     ${cyan(config.model)}`);
    print(`  Transcription: ${cyan(config.transcriptionModel)}`);
    print('');

    print(bold('Directories:'));
    print(`  Audio Input:   ${config.inputDirectory}`);
    print(`  Output:        ${config.outputDirectory}`);
    if (config.processedDirectory) {
        print(`  Processed:     ${config.processedDirectory}`);
    }
    print('');

    if (config.projects.length > 0) {
        print(bold(`Projects (${config.projects.length}):`));
        for (const project of config.projects) {
            print(`  ${green('●')} ${project.name} (${project.id})`);
            if (project.destination) {
                print(`    → ${project.destination}`);
            }
            if (project.triggerPhrases.length > 0) {
                print(`    Triggers: ${dim(project.triggerPhrases.join(', '))}`);
            }
        }
        print('');
    }

    print(bold('Configuration saved to:'));
    print(`  ${configPath}/config.yaml`);
    print('');
};

/**
 * Print getting started guide
 */
const printGettingStarted = (config: InstallConfig) => {
    print('═'.repeat(60));
    print(bold('  Getting Started'));
    print('═'.repeat(60));
    print('');

    print(bold('1. Set your API key:'));
    print(`   ${dim('export OPENAI_API_KEY="sk-your-key"')}`);
    print('');

    print(bold('2. Start transcribing:'));
    print(`   ${cyan(`protokoll --input-directory ${config.inputDirectory}`)}`);
    print('');

    print(bold('3. Add context over time:'));
    print(`   ${dim('protokoll person add')}     # Add people you mention`);
    print(`   ${dim('protokoll project add')}    # Add new projects`);
    print(`   ${dim('protokoll term add')}       # Add technical terms`);
    print('');

    print(bold('4. Provide feedback:'));
    print(`   ${dim('protokoll feedback <transcript>')}  # Improve routing`);
    print('');

    print('═'.repeat(60));
    print(bold('  Documentation & Help'));
    print('═'.repeat(60));
    print('');

    print(bold('Documentation:'));
    print(`  ${blue('https://github.com/redaksjon/protokoll')}`);
    print('');

    print(bold('Quick Guide:'));
    print(`  ${dim('protokoll --help')}           # All command options`);
    print(`  ${dim('protokoll context status')}   # View context system`);
    print(`  ${dim('protokoll project list')}     # List all projects`);
    print('');

    print(bold('Useful Commands:'));
    print(`  ${dim('protokoll --batch')}          # Non-interactive (for cron)`);
    print(`  ${dim('protokoll --verbose')}        # Detailed output`);
    print(`  ${dim('protokoll --dry-run')}        # Preview without saving`);
    print('');

    print('═'.repeat(60));
    print(`${green('Ready to go!')} Run ${cyan('protokoll --help')} for more options.`);
    print('═'.repeat(60));
    print('');
};

/**
 * Check if configuration already exists
 */
const checkExistingConfig = async (): Promise<boolean> => {
    const configPath = path.join(process.cwd(), '.protokoll', 'config.yaml');
    try {
        await fs.access(configPath);
        return true;
    } catch {
        return false;
    }
};

/**
 * Run the install wizard
 */
const runInstallWizard = async (): Promise<void> => {
    const rl = createReadline();

    try {
        // Check for existing config
        const hasExisting = await checkExistingConfig();
        
        printWelcome();

        if (hasExisting) {
            print(yellow('⚠ Configuration already exists at .protokoll/config.yaml'));
            print('');
            const overwrite = await askQuestion(rl, `Overwrite existing configuration? (y/N): `);
            if (overwrite.toLowerCase() !== 'y') {
                print('');
                print('Installation cancelled. Your existing configuration is unchanged.');
                print(`Run ${cyan('protokoll context status')} to view your current setup.`);
                print('');
                return;
            }
            print('');
        }

        // Step 1: Model selection
        const { model, transcriptionModel } = await askModel(rl);

        // Step 2: Directory configuration
        const { inputDirectory, outputDirectory, processedDirectory } = await askDirectories(rl);

        // Step 3: Projects
        const useProjects = await askAboutProjects(rl);
        
        let projects: ProjectSetup[] = [];
        if (useProjects) {
            projects = await createProjects(rl);
        }

        // Write configuration
        print('');
        print(dim('Writing configuration...'));
        
        const config: InstallConfig = {
            model,
            transcriptionModel,
            inputDirectory,
            outputDirectory,
            processedDirectory,
            useProjects,
            projects,
        };

        const configPath = await writeConfiguration(config);

        // Print summary and getting started guide
        printSummary(config, configPath);
        printGettingStarted(config);

    } finally {
        rl.close();
    }
};

/**
 * Register the install command
 */
export const registerInstallCommand = (program: Command): void => {
    program
        .command('install')
        .description('Interactive setup wizard for first-time configuration')
        .action(async () => {
            await runInstallWizard();
        });
};

/**
 * Check if this is an install command
 */
export const isInstallCommand = (): boolean => {
    const args = process.argv.slice(2);
    return args.length > 0 && args[0] === 'install';
};

/**
 * Run the install command directly
 */
export const runInstallCLI = async (): Promise<void> => {
    await runInstallWizard();
};
