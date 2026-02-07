/**
 * Tests for Status CLI Commands
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { registerStatusCommands } from '../../src/cli/status';

describe('Status CLI Commands', () => {
    let tempDir: string;
    let testTranscriptPath: string;
    let program: Command;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    const SAMPLE_TRANSCRIPT = `---
title: Test Meeting
status: initial
---

## Meeting Content

This is a test meeting transcript.
`;

    const SAMPLE_TRANSCRIPT_WITH_HISTORY = `---
title: Test Meeting
status: reviewed
history:
  - from: initial
    to: reviewed
    at: '2026-02-06T10:00:00.000Z'
tasks:
  - id: task-123
    description: Follow up
    status: open
    createdAt: '2026-02-06T10:00:00.000Z'
  - id: task-456
    description: Review notes
    status: done
    createdAt: '2026-02-06T10:00:00.000Z'
    completedAt: '2026-02-06T11:00:00.000Z'
---

## Meeting Content

This is a test meeting transcript with history.
`;

    beforeEach(async () => {
        // Create temp directory
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-status-test-'));
        testTranscriptPath = path.join(tempDir, 'test.md');
        
        // Create fresh program instance
        program = new Command();
        program.exitOverride(); // Prevent actual exit
        registerStatusCommands(program);
        
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

    describe('status set', () => {
        it('should set status on a transcript', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'status', 'set', testTranscriptPath, 'reviewed']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).toContain('status: reviewed');
            expect(consoleLogSpy).toHaveBeenCalledWith('Status changed: initial → reviewed');
        });

        it('should handle relative paths', async () => {
            const relativePath = path.relative(process.cwd(), testTranscriptPath);
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'status', 'set', relativePath, 'reviewed']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).toContain('status: reviewed');
        });

        it('should handle absolute paths', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'status', 'set', testTranscriptPath, 'reviewed']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).toContain('status: reviewed');
        });

        it('should error on invalid status', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            await expect(
                program.parseAsync(['node', 'test', 'status', 'set', testTranscriptPath, 'invalid'])
            ).rejects.toThrow('process.exit(1)');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Invalid status "invalid"');
        });

        it('should error on non-existent file', async () => {
            const nonExistentPath = path.join(tempDir, 'nonexistent.md');
            
            await expect(
                program.parseAsync(['node', 'test', 'status', 'set', nonExistentPath, 'reviewed'])
            ).rejects.toThrow('process.exit(1)');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Transcript not found'));
        });

        it('should handle status already set', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'status', 'set', testTranscriptPath, 'initial']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            expect(consoleLogSpy).toHaveBeenCalledWith("Status is already 'initial'");
        });

        it('should record status transition in history', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'status', 'set', testTranscriptPath, 'reviewed']);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            const content = await fs.readFile(testTranscriptPath, 'utf-8');
            expect(content).toContain('history:');
            expect(content).toContain('from: initial');
            expect(content).toContain('to: reviewed');
        });

        it('should handle all valid statuses', async () => {
            const validStatuses = ['initial', 'enhanced', 'reviewed', 'in_progress', 'closed', 'archived'];
            
            for (const status of validStatuses) {
                await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
                
                try {
                    await program.parseAsync(['node', 'test', 'status', 'set', testTranscriptPath, status]);
                } catch (error) {
                    // Commander may throw on exit override, but that's ok
                }
                
                const content = await fs.readFile(testTranscriptPath, 'utf-8');
                expect(content).toContain(`status: ${status}`);
            }
        });

        it('should handle errors gracefully', async () => {
            // Create a file we can't write to (simulate permission error)
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            await fs.chmod(testTranscriptPath, 0o444); // Read-only
            
            await expect(
                program.parseAsync(['node', 'test', 'status', 'set', testTranscriptPath, 'reviewed'])
            ).rejects.toThrow();
            
            // Restore permissions for cleanup
            await fs.chmod(testTranscriptPath, 0o644);
        });
    });

    describe('status show', () => {
        it('should show current status', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'status', 'show', testTranscriptPath]);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            expect(consoleLogSpy).toHaveBeenCalledWith('Status: initial');
            expect(consoleLogSpy).toHaveBeenCalledWith('History: 0 transition(s)');
            expect(consoleLogSpy).toHaveBeenCalledWith('Tasks: 0 open, 0 done');
        });

        it('should show status with history', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_HISTORY, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'status', 'show', testTranscriptPath]);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            expect(consoleLogSpy).toHaveBeenCalledWith('Status: reviewed');
            expect(consoleLogSpy).toHaveBeenCalledWith('History: 1 transition(s)');
            expect(consoleLogSpy).toHaveBeenCalledWith('Tasks: 1 open, 1 done');
        });

        it('should show recent transitions', async () => {
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT_WITH_HISTORY, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'status', 'show', testTranscriptPath]);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Recent transitions:'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('initial → reviewed'));
        });

        it('should handle relative paths', async () => {
            const relativePath = path.relative(process.cwd(), testTranscriptPath);
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'status', 'show', relativePath]);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            expect(consoleLogSpy).toHaveBeenCalledWith('Status: initial');
        });

        it('should error on non-existent file', async () => {
            const nonExistentPath = path.join(tempDir, 'nonexistent.md');
            
            await expect(
                program.parseAsync(['node', 'test', 'status', 'show', nonExistentPath])
            ).rejects.toThrow('process.exit(1)');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Transcript not found'));
        });

        it('should default to reviewed status if not set', async () => {
            const transcriptWithoutStatus = `---
title: Test Meeting
---

## Meeting Content

This is a test meeting transcript.
`;
            await fs.writeFile(testTranscriptPath, transcriptWithoutStatus, 'utf-8');
            
            try {
                await program.parseAsync(['node', 'test', 'status', 'show', testTranscriptPath]);
            } catch (error) {
                // Commander may throw on exit override, but that's ok
            }
            
            expect(consoleLogSpy).toHaveBeenCalledWith('Status: reviewed');
        });

        it('should handle errors gracefully', async () => {
            // Create a file we can't read (simulate permission error)
            await fs.writeFile(testTranscriptPath, SAMPLE_TRANSCRIPT, 'utf-8');
            await fs.chmod(testTranscriptPath, 0o000); // No permissions
            
            await expect(
                program.parseAsync(['node', 'test', 'status', 'show', testTranscriptPath])
            ).rejects.toThrow();
            
            // Restore permissions for cleanup
            await fs.chmod(testTranscriptPath, 0o644);
        });
    });
});
