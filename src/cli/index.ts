/**
 * CLI Entry Point
 * 
 * Routes between context management subcommands and the main transcription flow.
 */

import { Command } from 'commander';
import { PROGRAM_NAME, VERSION } from '../constants';
import { registerContextCommands } from './context';

// Context management subcommands
const CONTEXT_SUBCOMMANDS = ['project', 'person', 'term', 'company', 'ignored', 'context'];

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
    const program = new Command();
    
    program
        .name(PROGRAM_NAME)
        .version(VERSION)
        .description('Intelligent audio transcription with context management');
    
    // Register context management commands
    registerContextCommands(program);
    
    // Add help text about main transcription
    program.addHelpText('after', `
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
`);
    
    await program.parseAsync(process.argv);
};
