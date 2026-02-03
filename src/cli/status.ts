/**
 * Status CLI Commands
 * 
 * Commands for managing transcript lifecycle status.
 */

/* eslint-disable no-console */
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import { parseTranscriptContent, stringifyTranscript } from '../util/frontmatter';
import { updateStatus, isValidStatus, VALID_STATUSES, TranscriptStatus } from '../util/metadata';

/**
 * Resolve transcript path relative to current directory
 */
const resolveTranscriptPath = (transcriptPath: string): string => {
    if (path.isAbsolute(transcriptPath)) {
        return transcriptPath;
    }
    return path.resolve(process.cwd(), transcriptPath);
};

/**
 * Register status commands
 */
export const registerStatusCommands = (program: Command): void => {
    const status = program
        .command('status')
        .description('Manage transcript lifecycle status');

    status
        .command('set <transcriptPath> <newStatus>')
        .description('Set the lifecycle status of a transcript')
        .addHelpText('after', `
Valid statuses: ${VALID_STATUSES.join(', ')}

Examples:
  protokoll status set meeting-notes.md reviewed
  protokoll status set 2026/02/03-meeting.md closed
  protokoll status set ~/notes/planning.md in_progress
`)
        .action(async (transcriptPath: string, newStatus: string) => {
            try {
                // Validate status
                if (!isValidStatus(newStatus)) {
                    console.error(`Error: Invalid status "${newStatus}"`);
                    console.error(`Valid statuses are: ${VALID_STATUSES.join(', ')}`);
                    process.exit(1);
                }

                // Resolve and validate path
                const absolutePath = resolveTranscriptPath(transcriptPath);
                
                try {
                    await fs.access(absolutePath);
                } catch {
                    console.error(`Error: Transcript not found: ${transcriptPath}`);
                    process.exit(1);
                }

                // Read and parse transcript
                const content = await fs.readFile(absolutePath, 'utf-8');
                const parsed = parseTranscriptContent(content);
                
                const oldStatus = parsed.metadata.status || 'reviewed';
                
                // Check if status is actually changing
                if (oldStatus === newStatus) {
                    console.log(`Status is already '${newStatus}'`);
                    return;
                }

                // Update status (records transition in history)
                const updatedMetadata = updateStatus(parsed.metadata, newStatus as TranscriptStatus);
                
                // Write updated transcript
                const updatedContent = stringifyTranscript(updatedMetadata, parsed.body);
                await fs.writeFile(absolutePath, updatedContent, 'utf-8');

                console.log(`Status changed: ${oldStatus} → ${newStatus}`);
            } catch (error) {
                console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                process.exit(1);
            }
        });

    status
        .command('show <transcriptPath>')
        .description('Show the current status of a transcript')
        .action(async (transcriptPath: string) => {
            try {
                const absolutePath = resolveTranscriptPath(transcriptPath);
                
                try {
                    await fs.access(absolutePath);
                } catch {
                    console.error(`Error: Transcript not found: ${transcriptPath}`);
                    process.exit(1);
                }

                const content = await fs.readFile(absolutePath, 'utf-8');
                const parsed = parseTranscriptContent(content);
                
                const status = parsed.metadata.status || 'reviewed';
                const history = parsed.metadata.history || [];
                const tasks = parsed.metadata.tasks || [];
                const openTasks = tasks.filter(t => t.status === 'open').length;
                const doneTasks = tasks.filter(t => t.status === 'done').length;

                console.log(`Status: ${status}`);
                console.log(`History: ${history.length} transition(s)`);
                console.log(`Tasks: ${openTasks} open, ${doneTasks} done`);
                
                if (history.length > 0) {
                    console.log('\nRecent transitions:');
                    history.slice(-5).forEach(t => {
                        const date = new Date(t.at).toLocaleString();
                        console.log(`  ${t.from} → ${t.to} (${date})`);
                    });
                }
            } catch (error) {
                console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                process.exit(1);
            }
        });
};
