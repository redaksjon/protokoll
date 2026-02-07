/**
 * Tests for Task CLI Commands
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { registerTaskCommands } from '../../src/cli/task';

describe('Task CLI Commands', () => {
    let tempDir: string;
    let testTranscriptPath: string;
    let program: Command;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    const SAMPLE_TRANSCRIPT = `---
title: Test Meeting
status: reviewed
---

## Meeting Content

This is a test meeting transcript.
`;

    const SAMPLE_TRANSCRIPT_WITH_TASKS = `---
title: Test Meeting
status: reviewed
tasks:
  - id: task-123
    description: Follow up with client
    status: open
    createdAt: '2026-02-06T10:00:00.000Z'
  - id: task-456
    description: Review notes
    status: done
    createdAt: '2026-02-06T10:00:00.000Z'
    completedAt: '2026-02-06T11:00:00.000Z'
---

## Meeting Content

This is a test meeting transcript with tasks.
`;

    beforeEach(async () => {
        // Create temp directory
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-task-test-'));
        testTranscriptPath = path.join(tempDir, 'test.md');
        
        // Create fresh program instance
        program = new Command();
        program.exitOverride(); // Prevent actual exit
        registerTaskCommands(program);
        
        // Spy on console and process.exit
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
            throw new Error(`process.exit(${code})`);
        });
        
        // Clear any previous spy calls
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    afterEach(async () => {
        // Clean up
        await fs.rm(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    describe('task add', () => {
        it('should add a task to a transcript', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'add', testTranscriptPath, 'Follow up']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).toContain('tasks:');
            expect(content).toContain('description: Follow up');
            expect(content).toContain('status: open');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Task created:'));
            expect(consoleLogSpy).toHaveBeenCalledWith('Description: Follow up');
        });

        it('should handle relative paths', async () => {
            const relativePath = path.relative(process.cwd(), testTranscriptPath);
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'add', relativePath, 'Test task']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).toContain('description: Test task');
        });

        it('should handle absolute paths', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'add', testTranscriptPath, 'Test task']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).toContain('description: Test task');
        });

        it('should error on non-existent file', async () => {
            const nonExistentPath = path.join(tempDir, 'nonexistent.md');
            
            await expect(
                program.parseAsync(['node', 'test', 'task', 'add', nonExistentPath, 'Test task'])
            ).rejects.toThrow('process.exit(1)');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Transcript not found'));
        });

        it('should add task to transcript with existing tasks', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'add', testTranscriptPath, 'New task']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).toContain('Follow up with client');
            expect(content).toContain('Review notes');
            expect(content).toContain('New task');
        });

        it('should generate unique task IDs', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'add', testTranscriptPath, 'Task 1']);
                await program.parseAsync(['node', 'test', 'task', 'add', testTranscriptPath, 'Task 2']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            const taskIdMatches = content.match(/id: task-/g);
            expect(taskIdMatches).toHaveLength(2);
        });

        it('should handle errors gracefully', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            await fs.chmod(testTranscriptPath, 0o444); // Read-only
            
            await expect(
                program.parseAsync(['node', 'test', 'task', 'add', testTranscriptPath, 'Test task'])
            ).rejects.toThrow();
            
            await fs.chmod(testTranscriptPath, 0o644);
        });
    });

    describe('task complete', () => {
        it('should mark a task as done', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'complete', testTranscriptPath, 'task-123']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).toMatch(/id: task-123[\s\S]*?status: done/);
            expect(consoleLogSpy).toHaveBeenCalledWith('Task completed: task-123');
            expect(consoleLogSpy).toHaveBeenCalledWith('Description: Follow up with client');
        });

        it('should handle relative paths', async () => {
            const relativePath = path.relative(process.cwd(), testTranscriptPath);
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'complete', relativePath, 'task-123']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).toMatch(/id: task-123[\s\S]*?status: done/);
        });

        it('should error on non-existent file', async () => {
            const nonExistentPath = path.join(tempDir, 'nonexistent.md');
            
            await expect(
                program.parseAsync(['node', 'test', 'task', 'complete', nonExistentPath, 'task-123'])
            ).rejects.toThrow('process.exit(1)');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Transcript not found'));
        });

        it('should error on non-existent task', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            
            await expect(
                program.parseAsync(['node', 'test', 'task', 'complete', testTranscriptPath, 'task-999'])
            ).rejects.toThrow('process.exit(1)');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Task not found: task-999');
        });

        it('should add completedAt timestamp', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'complete', testTranscriptPath, 'task-123']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).toContain('completedAt:');
        });

        it('should handle errors gracefully', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            await fs.chmod(testTranscriptPath, 0o444); // Read-only
            
            await expect(
                program.parseAsync(['node', 'test', 'task', 'complete', testTranscriptPath, 'task-123'])
            ).rejects.toThrow();
            
            await fs.chmod(testTranscriptPath, 0o644);
        });
    });

    describe('task delete', () => {
        it('should remove a task from transcript', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'delete', testTranscriptPath, 'task-123']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).not.toContain('task-123');
            expect(content).not.toContain('Follow up with client');
            expect(content).toContain('task-456'); // Other task should remain
            expect(consoleLogSpy).toHaveBeenCalledWith('Task deleted: task-123');
            expect(consoleLogSpy).toHaveBeenCalledWith('Description: Follow up with client');
        });

        it('should handle relative paths', async () => {
            const relativePath = path.relative(process.cwd(), testTranscriptPath);
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'delete', relativePath, 'task-123']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).not.toContain('task-123');
        });

        it('should error on non-existent file', async () => {
            const nonExistentPath = path.join(tempDir, 'nonexistent.md');
            
            await expect(
                program.parseAsync(['node', 'test', 'task', 'delete', nonExistentPath, 'task-123'])
            ).rejects.toThrow('process.exit(1)');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Transcript not found'));
        });

        it('should error on non-existent task', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            
            await expect(
                program.parseAsync(['node', 'test', 'task', 'delete', testTranscriptPath, 'task-999'])
            ).rejects.toThrow('process.exit(1)');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Task not found: task-999');
        });

        it('should handle errors gracefully', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            await fs.chmod(testTranscriptPath, 0o444); // Read-only
            
            await expect(
                program.parseAsync(['node', 'test', 'task', 'delete', testTranscriptPath, 'task-123'])
            ).rejects.toThrow();
            
            await fs.chmod(testTranscriptPath, 0o644);
        });
    });

    describe('task list', () => {
        it('should list all tasks', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'list', testTranscriptPath]);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            expect(consoleLogSpy).toHaveBeenCalledWith('Open tasks:');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('task-123'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Follow up with client'));
            expect(consoleLogSpy).toHaveBeenCalledWith('Completed tasks:');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('task-456'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Review notes'));
        });

        it('should handle relative paths', async () => {
            const relativePath = path.relative(process.cwd(), testTranscriptPath);
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'list', relativePath]);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            expect(consoleLogSpy).toHaveBeenCalledWith('Open tasks:');
        });

        it('should output JSON when --json flag is used', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'list', testTranscriptPath, '--json']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            // Find the JSON output (it starts with '[')
            const jsonCall = consoleLogSpy.mock.calls.find(call => call[0].startsWith('['));
            expect(jsonCall).toBeDefined();
            const tasks = JSON.parse(jsonCall[0]);
            expect(tasks).toHaveLength(2);
            expect(tasks[0].id).toBe('task-123');
            expect(tasks[1].id).toBe('task-456');
        });

        it('should handle transcript with no tasks', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'list', testTranscriptPath]);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            expect(consoleLogSpy).toHaveBeenCalledWith('No tasks');
        });

        it('should handle only open tasks', async () => {
            const transcriptWithOpenOnly = `---
title: Test Meeting
status: reviewed
tasks:
  - id: task-123
    description: Follow up with client
    status: open
    createdAt: '2026-02-06T10:00:00.000Z'
---

## Meeting Content
`;
            await fs.writeFile(testTranscriptPath, transcriptWithOpenOnly, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'list', testTranscriptPath]);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            expect(consoleLogSpy).toHaveBeenCalledWith('Open tasks:');
            expect(consoleLogSpy).not.toHaveBeenCalledWith('Completed tasks:');
        });

        it('should handle only completed tasks', async () => {
            const transcriptWithDoneOnly = `---
title: Test Meeting
status: reviewed
tasks:
  - id: task-456
    description: Review notes
    status: done
    createdAt: '2026-02-06T10:00:00.000Z'
    completedAt: '2026-02-06T11:00:00.000Z'
---

## Meeting Content
`;
            await fs.writeFile(testTranscriptPath, transcriptWithDoneOnly, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'task', 'list', testTranscriptPath]);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            expect(consoleLogSpy).not.toHaveBeenCalledWith('Open tasks:');
            expect(consoleLogSpy).toHaveBeenCalledWith('Completed tasks:');
        });

        it('should error on non-existent file', async () => {
            const nonExistentPath = path.join(tempDir, 'nonexistent.md');
            
            await expect(
                program.parseAsync(['node', 'test', 'task', 'list', nonExistentPath])
            ).rejects.toThrow('process.exit(1)');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Transcript not found'));
        });

        it('should handle errors gracefully', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_TASKS, 'utf-8');
            await fs.chmod(testTranscriptPath, 0o000); // No permissions
            
            await expect(
                program.parseAsync(['node', 'test', 'task', 'list', testTranscriptPath])
            ).rejects.toThrow();
            
            await fs.chmod(testTranscriptPath, 0o644);
        });
    });
});
