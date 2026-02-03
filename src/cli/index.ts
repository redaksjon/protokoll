/**
 * CLI Entry Point
 * 
 * Routes between context management subcommands and the main transcription flow.
 */

import { Command } from 'commander';
import { PROGRAM_NAME, VERSION } from '../constants';
import { registerContextCommands } from './context';
import { registerActionCommands } from './action';
import { registerFeedbackCommands } from './feedback';
import { registerConfigCommands } from './config';
import { registerInstallCommand, isInstallCommand, runInstallCLI } from './install';
import { registerTranscriptCommands } from './transcript';
import { registerStatusCommands } from './status';
import { registerTaskCommands } from './task';

// Context management subcommands
const CONTEXT_SUBCOMMANDS = ['project', 'person', 'term', 'company', 'ignored', 'context', 'action', 'feedback', 'install', 'config', 'transcript', 'status', 'task'];

/**
 * Check if the CLI arguments contain a context management subcommand
 */
export const isContextCommand = (): boolean => {
    const args = process.argv.slice(2);
    if (args.length === 0) return false;
    
    const firstArg = args[0];
    return CONTEXT_SUBCOMMANDS.includes(firstArg);
};

/**
 * Run the context management CLI
 */
export const runContextCLI = async (): Promise<void> => {
    // Special handling for install command - run directly without commander parsing
    if (isInstallCommand()) {
        await runInstallCLI();
        return;
    }

    const program = new Command();
    
    program
        .name(PROGRAM_NAME)
        .version(VERSION)
        .description('Intelligent audio transcription with context management');
    
    // Register install command
    registerInstallCommand(program);
    
    // Register context management commands
    registerContextCommands(program);
    
    // Register action commands
    registerActionCommands(program);
    
    // Register feedback commands
    registerFeedbackCommands(program);
    
    // Register config commands
    registerConfigCommands(program);
    
    // Register transcript commands (compare, reanalyze)
    registerTranscriptCommands(program);
    
    // Register status commands (lifecycle management)
    registerStatusCommands(program);
    
    // Register task commands
    registerTaskCommands(program);
    
    // Add help text about main transcription
    program.addHelpText('after', `
Setup:
  ${PROGRAM_NAME} install               Interactive setup wizard (first time)

Configuration:
  ${PROGRAM_NAME} config                Interactive configuration editor
  ${PROGRAM_NAME} config --list         List all settings
  ${PROGRAM_NAME} config <key>          View a specific setting
  ${PROGRAM_NAME} config <key> <value>  Set a specific setting

To transcribe audio files:
  ${PROGRAM_NAME} --input-directory <dir>

Context management:
  ${PROGRAM_NAME} project list          List all projects
  ${PROGRAM_NAME} project show <id>     Show project details
  ${PROGRAM_NAME} project add           Add a new project
  ${PROGRAM_NAME} project delete <id>   Delete a project
  
  ${PROGRAM_NAME} person list           List all people
  ${PROGRAM_NAME} term list             List all terms
  ${PROGRAM_NAME} company list          List all companies
  
  ${PROGRAM_NAME} ignored list          List ignored terms (won't prompt)
  ${PROGRAM_NAME} ignored add           Add term to ignore list
  ${PROGRAM_NAME} ignored delete <id>   Remove from ignore list
  
  ${PROGRAM_NAME} context status        Show context system status
  ${PROGRAM_NAME} context search <q>    Search across all entities

Transcript actions:
  ${PROGRAM_NAME} action --title "Title" <file>  Edit a single transcript
  ${PROGRAM_NAME} action --combine "<files>"     Combine multiple transcripts

Feedback:
  ${PROGRAM_NAME} feedback <file>       Provide feedback to improve transcripts
  ${PROGRAM_NAME} feedback --help-me    Show feedback examples

Transcript tools:
  ${PROGRAM_NAME} transcript compare <file>      Compare raw vs enhanced
  ${PROGRAM_NAME} transcript compare --raw <f>   Show only raw Whisper output
  ${PROGRAM_NAME} transcript info <file>         Show raw transcript metadata
  ${PROGRAM_NAME} transcript list <dir>          List transcripts with raw status

Lifecycle management:
  ${PROGRAM_NAME} status set <file> <status>     Set transcript status
  ${PROGRAM_NAME} status show <file>             Show transcript status and history

Task management:
  ${PROGRAM_NAME} task add <file> "<desc>"       Add a task to a transcript
  ${PROGRAM_NAME} task complete <file> <id>      Mark a task as done
  ${PROGRAM_NAME} task delete <file> <id>        Remove a task
  ${PROGRAM_NAME} task list <file>               List all tasks
`);
    
    await program.parseAsync(process.argv);
};
