/**
 * Task CLI Commands
 * 
 * Commands for managing transcript tasks.
 */

/* eslint-disable no-console */
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import { parseTranscriptContent, stringifyTranscript } from '../util/frontmatter';
import { addTask, completeTask, deleteTask } from '../util/metadata';

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
 * Register task commands
 */
export const registerTaskCommands = (program: Command): void => {
    const task = program
        .command('task')
        .description('Manage transcript tasks');

    task
        .command('add <transcriptPath> <description>')
        .description('Add a new task to a transcript')
        .addHelpText('after', `
Examples:
  protokoll task add meeting.md "Follow up with client"
  protokoll task add notes/planning.md "Review budget proposal"
`)
        .action(async (transcriptPath: string, description: string) => {
            try {
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
                
                // Add the task
                const { metadata: updatedMetadata, task: newTask } = addTask(parsed.metadata, description);
                
                // Write updated transcript
                const updatedContent = stringifyTranscript(updatedMetadata, parsed.body);
                await fs.writeFile(absolutePath, updatedContent, 'utf-8');

                console.log(`Task created: ${newTask.id}`);
                console.log(`Description: ${newTask.description}`);
            } catch (error) {
                console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                process.exit(1);
            }
        });

    task
        .command('complete <transcriptPath> <taskId>')
        .description('Mark a task as done')
        .addHelpText('after', `
Examples:
  protokoll task complete meeting.md task-1234567890-abc123
`)
        .action(async (transcriptPath: string, taskId: string) => {
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
                
                // Find the task
                const existingTask = parsed.metadata.tasks?.find(t => t.id === taskId);
                if (!existingTask) {
                    console.error(`Error: Task not found: ${taskId}`);
                    process.exit(1);
                }
                
                // Complete the task
                const updatedMetadata = completeTask(parsed.metadata, taskId);
                
                // Write updated transcript
                const updatedContent = stringifyTranscript(updatedMetadata, parsed.body);
                await fs.writeFile(absolutePath, updatedContent, 'utf-8');

                console.log(`Task completed: ${taskId}`);
                console.log(`Description: ${existingTask.description}`);
            } catch (error) {
                console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                process.exit(1);
            }
        });

    task
        .command('delete <transcriptPath> <taskId>')
        .description('Remove a task from a transcript')
        .addHelpText('after', `
Examples:
  protokoll task delete meeting.md task-1234567890-abc123
`)
        .action(async (transcriptPath: string, taskId: string) => {
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
                
                // Find the task
                const existingTask = parsed.metadata.tasks?.find(t => t.id === taskId);
                if (!existingTask) {
                    console.error(`Error: Task not found: ${taskId}`);
                    process.exit(1);
                }
                
                // Delete the task
                const updatedMetadata = deleteTask(parsed.metadata, taskId);
                
                // Write updated transcript
                const updatedContent = stringifyTranscript(updatedMetadata, parsed.body);
                await fs.writeFile(absolutePath, updatedContent, 'utf-8');

                console.log(`Task deleted: ${taskId}`);
                console.log(`Description: ${existingTask.description}`);
            } catch (error) {
                console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                process.exit(1);
            }
        });

    task
        .command('list <transcriptPath>')
        .description('List all tasks on a transcript')
        .option('--json', 'Output as JSON')
        .action(async (transcriptPath: string, options: { json?: boolean }) => {
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
                
                const tasks = parsed.metadata.tasks || [];
                
                if (options.json) {
                    console.log(JSON.stringify(tasks, null, 2));
                    return;
                }
                
                if (tasks.length === 0) {
                    console.log('No tasks');
                    return;
                }

                const openTasks = tasks.filter(t => t.status === 'open');
                const doneTasks = tasks.filter(t => t.status === 'done');
                
                if (openTasks.length > 0) {
                    console.log('Open tasks:');
                    openTasks.forEach(t => {
                        console.log(`  ○ ${t.id}`);
                        console.log(`    ${t.description}`);
                    });
                }
                
                if (doneTasks.length > 0) {
                    if (openTasks.length > 0) console.log('');
                    console.log('Completed tasks:');
                    doneTasks.forEach(t => {
                        console.log(`  ✓ ${t.id}`);
                        console.log(`    ${t.description}`);
                    });
                }
            } catch (error) {
                console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                process.exit(1);
            }
        });
};
