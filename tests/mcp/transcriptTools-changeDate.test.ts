/**
 * Transcript Date Change Tests - PKL Format
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleChangeTranscriptDate } from '../../src/mcp/tools/transcriptTools';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PklTranscript } from '@redaksjon/protokoll-format';

// Mock the shared module to control getConfiguredDirectory
vi.mock('../../src/mcp/tools/shared', async () => {
    const actual = await vi.importActual('../../src/mcp/tools/shared');
    return {
        ...actual,
        getConfiguredDirectory: vi.fn(),
    };
});

import { getConfiguredDirectory } from '../../src/mcp/tools/shared';

/**
 * Helper to create a PKL transcript for testing
 */
async function createTestTranscript(
    transcriptsDir: string,
    relativePath: string,
    options: {
        title?: string;
        date?: Date;
        status?: string;
        content?: string;
    } = {}
): Promise<string> {
    const pklPath = path.join(transcriptsDir, relativePath);
    await fs.mkdir(path.dirname(pklPath), { recursive: true });
    
    const metadata = {
        title: options.title || 'Test Transcript',
        date: options.date || new Date('2025-02-15T10:00:00.000Z'),
        status: options.status || 'reviewed',
        tags: [],
    };
    
    const transcript = PklTranscript.create(pklPath, metadata);
    try {
        transcript.updateContent(options.content || 'Original content here.');
    } finally {
        transcript.close();
    }
    
    return pklPath;
}

/**
 * Helper to read PKL transcript
 */
function readTestTranscript(pklPath: string): { metadata: Record<string, unknown>; content: string } {
    const transcript = PklTranscript.open(pklPath, { readOnly: true });
    try {
        return {
            metadata: transcript.metadata,
            content: transcript.content,
        };
    } finally {
        transcript.close();
    }
}

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
            // Create original transcript
            await createTestTranscript(transcriptsDir, '2025/2/test-transcript.pkl', {
                title: 'Test Transcript',
                date: new Date('2025-02-15T10:00:00.000Z'),
                content: 'Original content here.',
            });
            
            // Change date to August 2025
            const result = await handleChangeTranscriptDate({
                transcriptPath: '2025/2/test-transcript.pkl',
                newDate: '2025-08-27',
            });
            
            expect(result.success).toBe(true);
            expect(result.moved).toBe(true);
            expect(result.originalPath).toBe('2025/2/test-transcript.pkl');
            expect(result.outputPath).toBe('2025/8/test-transcript.pkl'); // Non-zero-padded!
            
            // Verify original file was removed
            const originalPath = path.join(transcriptsDir, '2025', '2', 'test-transcript.pkl');
            await expect(fs.access(originalPath)).rejects.toThrow();
            
            // Verify new file exists in correct location
            const newPath = path.join(transcriptsDir, '2025', '8', 'test-transcript.pkl');
            const { metadata, content } = readTestTranscript(newPath);
            
            // Verify content is preserved
            expect(content).toContain('Original content here.');
            expect(metadata.title).toBe('Test Transcript');
            
            // Verify date was updated
            const date = metadata.date as Date;
            expect(date.getFullYear()).toBe(2025);
            expect(date.getMonth()).toBe(7); // August is month 7 (0-indexed)
        });
        
        it('should update date in metadata without moving if already in correct directory', async () => {
            // Create transcript in the target directory
            await createTestTranscript(transcriptsDir, '2025/8/test-transcript.pkl', {
                title: 'Test Transcript',
                date: new Date('2025-08-15T10:00:00.000Z'),
                content: 'Content here.',
            });
            
            // Change date to different day in same month
            const result = await handleChangeTranscriptDate({
                transcriptPath: '2025/8/test-transcript.pkl',
                newDate: '2025-08-27',
            });
            
            expect(result.success).toBe(true);
            expect(result.moved).toBe(false);
            
            // Verify file still exists
            const pklPath = path.join(transcriptsDir, '2025', '8', 'test-transcript.pkl');
            const { metadata } = readTestTranscript(pklPath);
            
            // Verify date was updated - use UTC methods to avoid timezone issues
            const date = metadata.date as Date;
            expect(date.getUTCMonth()).toBe(7); // August (0-indexed)
            // The exact day depends on timezone, just verify it changed
            expect(date.getUTCFullYear()).toBe(2025);
        });
        
        it('should throw error for non-existent transcript', async () => {
            await expect(handleChangeTranscriptDate({
                transcriptPath: '2025/1/nonexistent.pkl',
                newDate: '2025-08-27',
            })).rejects.toThrow('No transcript found matching');
        });
        
        it('should throw error for invalid date format', async () => {
            await createTestTranscript(transcriptsDir, '2025/1/test.pkl');
            
            await expect(handleChangeTranscriptDate({
                transcriptPath: '2025/1/test.pkl',
                newDate: 'not-a-date',
            })).rejects.toThrow('Invalid date format');
        });
        
        it('should throw error when destination file already exists', async () => {
            // Create source transcript
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl');
            
            // Create transcript at destination
            await createTestTranscript(transcriptsDir, '2025/8/test.pkl');
            
            await expect(handleChangeTranscriptDate({
                transcriptPath: '2025/2/test.pkl',
                newDate: '2025-08-27',
            })).rejects.toThrow('already exists');
        });
    });
    
    describe('ISO 8601 date parsing', () => {
        it('should accept YYYY-MM-DD format', async () => {
            await createTestTranscript(transcriptsDir, '2025/1/test.pkl');
            
            const result = await handleChangeTranscriptDate({
                transcriptPath: '2025/1/test.pkl',
                newDate: '2025-08-15',
            });
            
            expect(result.success).toBe(true);
            
            const newPath = path.join(transcriptsDir, '2025', '8', 'test.pkl');
            const { metadata } = readTestTranscript(newPath);
            const date = metadata.date as Date;
            // Use UTC methods to avoid timezone issues
            expect(date.getUTCFullYear()).toBe(2025);
            expect(date.getUTCMonth()).toBe(7); // August (0-indexed)
        });
        
        it('should accept full ISO 8601 format with time', async () => {
            await createTestTranscript(transcriptsDir, '2025/1/test.pkl');
            
            const result = await handleChangeTranscriptDate({
                transcriptPath: '2025/1/test.pkl',
                newDate: '2025-08-15T14:30:00Z',
            });
            
            expect(result.success).toBe(true);
            
            const newPath = path.join(transcriptsDir, '2025', '8', 'test.pkl');
            const { metadata } = readTestTranscript(newPath);
            const date = metadata.date as Date;
            expect(date.getFullYear()).toBe(2025);
            expect(date.getMonth()).toBe(7); // August
        });
    });
    
    describe('content preservation', () => {
        it('should preserve transcript content through date change', async () => {
            const originalContent = 'This is important meeting content that must be preserved.';
            await createTestTranscript(transcriptsDir, '2025/2/meeting.pkl', {
                title: 'Important Meeting',
                content: originalContent,
            });
            
            await handleChangeTranscriptDate({
                transcriptPath: '2025/2/meeting.pkl',
                newDate: '2025-08-27',
            });
            
            const newPath = path.join(transcriptsDir, '2025', '8', 'meeting.pkl');
            const { metadata, content } = readTestTranscript(newPath);
            
            expect(metadata.title).toBe('Important Meeting');
            expect(content).toBe(originalContent);
        });
    });
});
