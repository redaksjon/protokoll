/**
 * Status Tools Tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
    handleSetStatus, 
    handleCreateTask, 
    handleCompleteTask, 
    handleDeleteTask 
} from '../../src/mcp/tools/statusTools';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock the shared module to control getConfiguredDirectory
vi.mock('../../src/mcp/tools/shared', async () => {
    const actual = await vi.importActual('../../src/mcp/tools/shared');
    return {
        ...actual,
        getConfiguredDirectory: vi.fn(),
    };
});

import { getConfiguredDirectory } from '../../src/mcp/tools/shared';

describe('statusTools', () => {
    let tempDir: string;
    let transcriptsDir: string;
    
    beforeEach(async () => {
        // Create temp directory structure
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-status-test-'));
        transcriptsDir = path.join(tempDir, 'notes');
        
        await fs.mkdir(transcriptsDir, { recursive: true });
        
        // Mock getConfiguredDirectory to return our temp directory
        vi.mocked(getConfiguredDirectory).mockResolvedValue(transcriptsDir);
    });
    
    afterEach(async () => {
        vi.clearAllMocks();
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    
    describe('handleSetStatus', () => {
        it('should change status from reviewed to in_progress', async () => {
            // Create a transcript
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            await fs.writeFile(transcriptPath, `---
title: Test Transcript
status: reviewed
---

Content here.
`);
            
            const result = await handleSetStatus({
                transcriptPath: 'test.md',
                status: 'in_progress',
            });
            
            expect(result.success).toBe(true);
            expect(result.previousStatus).toBe('reviewed');
            expect(result.newStatus).toBe('in_progress');
            expect(result.changed).toBe(true);
            
            // Verify file was updated
            const content = await fs.readFile(transcriptPath, 'utf-8');
            expect(content).toContain('status: in_progress');
            expect(content).toContain('history:');
        });
        
        it('should record transition in history', async () => {
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            await fs.writeFile(transcriptPath, `---
title: Test
status: reviewed
---

Content.
`);
            
            await handleSetStatus({
                transcriptPath: 'test.md',
                status: 'closed',
            });
            
            const content = await fs.readFile(transcriptPath, 'utf-8');
            expect(content).toContain('history:');
            expect(content).toContain('from: reviewed');
            expect(content).toContain('to: closed');
            expect(content).toContain('at:');
        });
        
        it('should not change anything if status is the same', async () => {
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            const originalContent = `---
title: Test
status: reviewed
---

Content.
`;
            await fs.writeFile(transcriptPath, originalContent);
            
            const result = await handleSetStatus({
                transcriptPath: 'test.md',
                status: 'reviewed',
            });
            
            expect(result.changed).toBe(false);
            expect(result.message).toContain('already');
        });
        
        it('should apply default status "reviewed" when transcript has no status', async () => {
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            await fs.writeFile(transcriptPath, `---
title: No Status Yet
---

Content.
`);
            
            const result = await handleSetStatus({
                transcriptPath: 'test.md',
                status: 'closed',
            });
            
            expect(result.previousStatus).toBe('reviewed');
            expect(result.newStatus).toBe('closed');
            
            const content = await fs.readFile(transcriptPath, 'utf-8');
            expect(content).toContain('from: reviewed');
        });
        
        it('should reject invalid status', async () => {
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            await fs.writeFile(transcriptPath, `---
title: Test
---

Content.
`);
            
            await expect(handleSetStatus({
                transcriptPath: 'test.md',
                status: 'invalid_status',
            })).rejects.toThrow('Invalid status');
        });
        
        it('should throw error for non-existent transcript', async () => {
            await expect(handleSetStatus({
                transcriptPath: 'nonexistent.md',
                status: 'reviewed',
            })).rejects.toThrow('not found');
        });
        
        it('should preserve existing history when adding new transition', async () => {
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            await fs.writeFile(transcriptPath, `---
title: With History
status: reviewed
history:
  - from: initial
    to: enhanced
    at: "2026-02-01T10:00:00Z"
  - from: enhanced
    to: reviewed
    at: "2026-02-02T10:00:00Z"
---

Content.
`);
            
            await handleSetStatus({
                transcriptPath: 'test.md',
                status: 'closed',
            });
            
            const content = await fs.readFile(transcriptPath, 'utf-8');
            // Should have all 3 history entries
            expect(content).toContain('from: initial');
            expect(content).toContain('from: enhanced');
            expect(content).toContain('from: reviewed');
        });
    });
    
    describe('handleCreateTask', () => {
        it('should create a task with generated ID', async () => {
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            await fs.writeFile(transcriptPath, `---
title: Test
status: reviewed
---

Content.
`);
            
            const result = await handleCreateTask({
                transcriptPath: 'test.md',
                description: 'Follow up with client',
            });
            
            expect(result.success).toBe(true);
            expect(result.task.id).toMatch(/^task-\d+-[a-z0-9]+$/);
            expect(result.task.description).toBe('Follow up with client');
            expect(result.task.status).toBe('open');
            
            // Verify in file
            const content = await fs.readFile(transcriptPath, 'utf-8');
            expect(content).toContain('tasks:');
            expect(content).toContain('Follow up with client');
        });
        
        it('should add task to existing tasks', async () => {
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            await fs.writeFile(transcriptPath, `---
title: Test
tasks:
  - id: task-existing
    description: Existing task
    status: open
    created: "2026-02-01T10:00:00Z"
---

Content.
`);
            
            await handleCreateTask({
                transcriptPath: 'test.md',
                description: 'New task',
            });
            
            const content = await fs.readFile(transcriptPath, 'utf-8');
            expect(content).toContain('Existing task');
            expect(content).toContain('New task');
        });
        
        it('should reject empty description', async () => {
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            await fs.writeFile(transcriptPath, `---
title: Test
---

Content.
`);
            
            await expect(handleCreateTask({
                transcriptPath: 'test.md',
                description: '',
            })).rejects.toThrow('description is required');
        });
    });
    
    describe('handleCompleteTask', () => {
        it('should mark task as done', async () => {
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            await fs.writeFile(transcriptPath, `---
title: Test
tasks:
  - id: task-123
    description: Complete this
    status: open
    created: "2026-02-01T10:00:00Z"
---

Content.
`);
            
            const result = await handleCompleteTask({
                transcriptPath: 'test.md',
                taskId: 'task-123',
            });
            
            expect(result.success).toBe(true);
            expect(result.taskId).toBe('task-123');
            
            const content = await fs.readFile(transcriptPath, 'utf-8');
            expect(content).toContain('status: done');
            expect(content).toContain('completed:');
        });
        
        it('should throw error for non-existent task', async () => {
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            await fs.writeFile(transcriptPath, `---
title: Test
---

Content.
`);
            
            await expect(handleCompleteTask({
                transcriptPath: 'test.md',
                taskId: 'nonexistent',
            })).rejects.toThrow('Task not found');
        });
    });
    
    describe('handleDeleteTask', () => {
        it('should remove task from transcript', async () => {
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            await fs.writeFile(transcriptPath, `---
title: Test
tasks:
  - id: task-to-keep
    description: Keep this
    status: open
    created: "2026-02-01T10:00:00Z"
  - id: task-to-delete
    description: Delete this
    status: open
    created: "2026-02-01T11:00:00Z"
---

Content.
`);
            
            const result = await handleDeleteTask({
                transcriptPath: 'test.md',
                taskId: 'task-to-delete',
            });
            
            expect(result.success).toBe(true);
            expect(result.taskId).toBe('task-to-delete');
            
            const content = await fs.readFile(transcriptPath, 'utf-8');
            expect(content).toContain('Keep this');
            expect(content).not.toContain('Delete this');
        });
        
        it('should throw error for non-existent task', async () => {
            const transcriptPath = path.join(transcriptsDir, 'test.md');
            await fs.writeFile(transcriptPath, `---
title: Test
---

Content.
`);
            
            await expect(handleDeleteTask({
                transcriptPath: 'test.md',
                taskId: 'nonexistent',
            })).rejects.toThrow('Task not found');
        });
    });
});
