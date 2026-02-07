/**
 * Transcript Date Change Tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleChangeTranscriptDate } from '../../src/mcp/tools/transcriptTools';
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

describe('transcriptTools - handleChangeTranscriptDate', () => {
    let tempDir: string;
    let transcriptsDir: string;
    
    beforeEach(async () => {
        // Create temp directory structure
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-date-test-'));
        transcriptsDir = path.join(tempDir, 'notes');
        
        await fs.mkdir(transcriptsDir, { recursive: true });
        
        // Mock getConfiguredDirectory to return our temp directory
        vi.mocked(getConfiguredDirectory).mockResolvedValue(transcriptsDir);
    });
    
    afterEach(async () => {
        vi.clearAllMocks();
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    
    describe('basic date change', () => {
        it('should move transcript to new date directory with non-zero-padded month', async () => {
            // Create original directory structure: 2025/2/
            const originalDir = path.join(transcriptsDir, '2025', '2');
            await fs.mkdir(originalDir, { recursive: true });
            
            const originalPath = path.join(originalDir, 'test-transcript.md');
            await fs.writeFile(originalPath, `---
title: Test Transcript
date: '2025-02-15T10:00:00.000Z'
status: reviewed
---

Original content here.
`);
            
            // Change date to August 2025
            const result = await handleChangeTranscriptDate({
                transcriptPath: '2025/2/test-transcript.md',
                newDate: '2025-08-27',
            });
            
            expect(result.success).toBe(true);
            expect(result.moved).toBe(true);
            expect(result.originalPath).toBe('2025/2/test-transcript.md');
            expect(result.outputPath).toBe('2025/8/test-transcript.md'); // Non-zero-padded!
            
            // Verify original file was removed
            await expect(fs.access(originalPath)).rejects.toThrow();
            
            // Verify new file exists in correct location
            const newPath = path.join(transcriptsDir, '2025', '8', 'test-transcript.md');
            const newContent = await fs.readFile(newPath, 'utf-8');
            
            // Verify content is preserved
            expect(newContent).toContain('Original content here.');
            expect(newContent).toContain('title: Test Transcript');
            
            // Verify date was updated in front-matter
            expect(newContent).toContain('date: \'2025-08-27T');
            expect(newContent).not.toContain('date: \'2025-02-15T');
        });
        
        it('should use non-zero-padded months (8 not 08)', async () => {
            const originalDir = path.join(transcriptsDir, '2025', '1');
            await fs.mkdir(originalDir, { recursive: true });
            
            const originalPath = path.join(originalDir, 'test.md');
            await fs.writeFile(originalPath, `---
title: Test
date: '2025-01-15T10:00:00.000Z'
---

Content.
`);
            
            const result = await handleChangeTranscriptDate({
                transcriptPath: '2025/1/test.md',
                newDate: '2025-08-01',
            });
            
            // Should be 2025/8/ not 2025/08/
            expect(result.outputPath).toBe('2025/8/test.md');
            
            const newPath = path.join(transcriptsDir, '2025', '8', 'test.md');
            await expect(fs.access(newPath)).resolves.toBeUndefined();
        });
        
        it('should handle single-digit months correctly', async () => {
            const originalDir = path.join(transcriptsDir, '2025', '12');
            await fs.mkdir(originalDir, { recursive: true });
            
            const originalPath = path.join(originalDir, 'test.md');
            await fs.writeFile(originalPath, `---
title: Test
date: '2025-12-15T10:00:00.000Z'
---

Content.
`);
            
            // Move to January (month 1)
            const result = await handleChangeTranscriptDate({
                transcriptPath: '2025/12/test.md',
                newDate: '2025-01-01',
            });
            
            expect(result.outputPath).toBe('2025/1/test.md');
            
            const newPath = path.join(transcriptsDir, '2025', '1', 'test.md');
            await expect(fs.access(newPath)).resolves.toBeUndefined();
        });
    });
    
    describe('front-matter date update', () => {
        it('should update the date field in front-matter', async () => {
            const originalDir = path.join(transcriptsDir, '2025', '2');
            await fs.mkdir(originalDir, { recursive: true });
            
            const originalPath = path.join(originalDir, 'test.md');
            await fs.writeFile(originalPath, `---
title: Test Transcript
date: '2025-02-15T10:30:00.000Z'
status: reviewed
---

Content.
`);
            
            await handleChangeTranscriptDate({
                transcriptPath: '2025/2/test.md',
                newDate: '2025-08-27',
            });
            
            const newPath = path.join(transcriptsDir, '2025', '8', 'test.md');
            const content = await fs.readFile(newPath, 'utf-8');
            
            // Date should be updated to new date
            expect(content).toMatch(/date: '2025-08-27T00:00:00/);
            expect(content).not.toContain('2025-02-15');
        });
        
        it('should preserve all other metadata fields', async () => {
            const originalDir = path.join(transcriptsDir, '2025', '3');
            await fs.mkdir(originalDir, { recursive: true });
            
            const originalPath = path.join(originalDir, 'test.md');
            await fs.writeFile(originalPath, `---
title: Complex Transcript
date: '2025-03-15T10:00:00.000Z'
status: reviewed
project: test-project
projectId: test-project
tags:
  - tag1
  - tag2
entities:
  people: []
  projects:
    - id: test-project
      name: Test Project
  terms: []
  companies: []
---

Content here.
`);
            
            await handleChangeTranscriptDate({
                transcriptPath: '2025/3/test.md',
                newDate: '2025-09-01',
            });
            
            const newPath = path.join(transcriptsDir, '2025', '9', 'test.md');
            const content = await fs.readFile(newPath, 'utf-8');
            
            // All metadata should be preserved
            expect(content).toContain('title: Complex Transcript');
            expect(content).toContain('status: reviewed');
            expect(content).toContain('project: test-project');
            expect(content).toContain('projectId: test-project');
            expect(content).toContain('- tag1');
            expect(content).toContain('- tag2');
            expect(content).toContain('id: test-project');
            expect(content).toContain('name: Test Project');
            
            // Only date should change
            expect(content).toMatch(/date: '2025-09-01T00:00:00/);
        });
        
        it('should preserve transcript body content exactly', async () => {
            const originalDir = path.join(transcriptsDir, '2025', '4');
            await fs.mkdir(originalDir, { recursive: true });
            
            const originalPath = path.join(originalDir, 'test.md');
            const bodyContent = `This is the transcript body.

It has multiple paragraphs.

And some **markdown** formatting.

- List item 1
- List item 2

## Heading

More content here.`;
            
            await fs.writeFile(originalPath, `---
title: Test
date: '2025-04-15T10:00:00.000Z'
---

${bodyContent}
`);
            
            await handleChangeTranscriptDate({
                transcriptPath: '2025/4/test.md',
                newDate: '2025-10-01',
            });
            
            const newPath = path.join(transcriptsDir, '2025', '10', 'test.md');
            const content = await fs.readFile(newPath, 'utf-8');
            
            // Body should be exactly preserved
            expect(content).toContain(bodyContent);
        });
    });
    
    describe('year changes', () => {
        it('should move transcript to different year directory', async () => {
            const originalDir = path.join(transcriptsDir, '2025', '12');
            await fs.mkdir(originalDir, { recursive: true });
            
            const originalPath = path.join(originalDir, 'test.md');
            await fs.writeFile(originalPath, `---
title: Test
date: '2025-12-15T10:00:00.000Z'
---

Content.
`);
            
            const result = await handleChangeTranscriptDate({
                transcriptPath: '2025/12/test.md',
                newDate: '2026-01-15',
            });
            
            expect(result.outputPath).toBe('2026/1/test.md');
            
            const newPath = path.join(transcriptsDir, '2026', '1', 'test.md');
            await expect(fs.access(newPath)).resolves.toBeUndefined();
        });
        
        it('should move transcript backwards in time', async () => {
            const originalDir = path.join(transcriptsDir, '2026', '2');
            await fs.mkdir(originalDir, { recursive: true });
            
            const originalPath = path.join(originalDir, 'test.md');
            await fs.writeFile(originalPath, `---
title: Test
date: '2026-02-15T10:00:00.000Z'
---

Content.
`);
            
            const result = await handleChangeTranscriptDate({
                transcriptPath: '2026/2/test.md',
                newDate: '2025-08-27',
            });
            
            expect(result.outputPath).toBe('2025/8/test.md');
            
            const newPath = path.join(transcriptsDir, '2025', '8', 'test.md');
            await expect(fs.access(newPath)).resolves.toBeUndefined();
        });
    });
    
    describe('directory creation', () => {
        it('should create new year/month directories if they do not exist', async () => {
            const originalDir = path.join(transcriptsDir, '2025', '1');
            await fs.mkdir(originalDir, { recursive: true });
            
            const originalPath = path.join(originalDir, 'test.md');
            await fs.writeFile(originalPath, `---
title: Test
date: '2025-01-15T10:00:00.000Z'
---

Content.
`);
            
            // Move to a year/month that doesn't exist yet
            await handleChangeTranscriptDate({
                transcriptPath: '2025/1/test.md',
                newDate: '2027-11-15',
            });
            
            const newPath = path.join(transcriptsDir, '2027', '11', 'test.md');
            await expect(fs.access(newPath)).resolves.toBeUndefined();
        });
    });
    
    describe('error handling', () => {
        it('should throw error for invalid date format', async () => {
            const originalDir = path.join(transcriptsDir, '2025', '1');
            await fs.mkdir(originalDir, { recursive: true });
            
            const originalPath = path.join(originalDir, 'test.md');
            await fs.writeFile(originalPath, `---
title: Test
date: '2025-01-15T10:00:00.000Z'
---

Content.
`);
            
            await expect(
                handleChangeTranscriptDate({
                    transcriptPath: '2025/1/test.md',
                    newDate: 'invalid-date',
                })
            ).rejects.toThrow(/Invalid date format/);
        });
        
        it('should throw error if transcript file does not exist', async () => {
            await expect(
                handleChangeTranscriptDate({
                    transcriptPath: '2025/1/nonexistent.md',
                    newDate: '2025-08-27',
                })
            ).rejects.toThrow();
        });
        
        it('should throw error if destination file already exists', async () => {
            // Create original file
            const originalDir = path.join(transcriptsDir, '2025', '1');
            await fs.mkdir(originalDir, { recursive: true });
            const originalPath = path.join(originalDir, 'test.md');
            await fs.writeFile(originalPath, `---
title: Test
date: '2025-01-15T10:00:00.000Z'
---

Content.
`);
            
            // Create a file that already exists at the destination
            const destDir = path.join(transcriptsDir, '2025', '8');
            await fs.mkdir(destDir, { recursive: true });
            const destPath = path.join(destDir, 'test.md');
            await fs.writeFile(destPath, `---
title: Existing File
date: '2025-08-01T10:00:00.000Z'
---

Existing content.
`);
            
            await expect(
                handleChangeTranscriptDate({
                    transcriptPath: '2025/1/test.md',
                    newDate: '2025-08-27',
                })
            ).rejects.toThrow(/file already exists at the destination/);
        });
    });
    
    describe('no-op scenarios', () => {
        it('should detect when transcript is already in correct directory', async () => {
            const dir = path.join(transcriptsDir, '2025', '8');
            await fs.mkdir(dir, { recursive: true });
            
            const filePath = path.join(dir, 'test.md');
            await fs.writeFile(filePath, `---
title: Test
date: '2025-08-15T10:00:00.000Z'
---

Content.
`);
            
            // Try to change to a different day in the same month
            const result = await handleChangeTranscriptDate({
                transcriptPath: '2025/8/test.md',
                newDate: '2025-08-27',
            });
            
            expect(result.success).toBe(true);
            expect(result.moved).toBe(false);
            expect(result.message).toContain('No move needed');
        });
    });
    
    describe('ISO 8601 date parsing', () => {
        it('should accept YYYY-MM-DD format', async () => {
            const originalDir = path.join(transcriptsDir, '2025', '1');
            await fs.mkdir(originalDir, { recursive: true });
            
            const originalPath = path.join(originalDir, 'test.md');
            await fs.writeFile(originalPath, `---
title: Test
date: '2025-01-15T10:00:00.000Z'
---

Content.
`);
            
            const result = await handleChangeTranscriptDate({
                transcriptPath: '2025/1/test.md',
                newDate: '2025-08-27',
            });
            
            expect(result.success).toBe(true);
            expect(result.outputPath).toBe('2025/8/test.md');
        });
        
        it('should accept full ISO 8601 format with time', async () => {
            const originalDir = path.join(transcriptsDir, '2025', '1');
            await fs.mkdir(originalDir, { recursive: true });
            
            const originalPath = path.join(originalDir, 'test.md');
            await fs.writeFile(originalPath, `---
title: Test
date: '2025-01-15T10:00:00.000Z'
---

Content.
`);
            
            const result = await handleChangeTranscriptDate({
                transcriptPath: '2025/1/test.md',
                newDate: '2025-08-27T14:30:00Z',
            });
            
            expect(result.success).toBe(true);
            expect(result.outputPath).toBe('2025/8/test.md');
        });
    });
});
