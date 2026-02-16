/**
 * Tests for Queue Management Tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PklTranscript } from '@redaksjon/protokoll-format';
import type { TranscriptMetadata } from '@redaksjon/protokoll-format';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

// Mock dependencies
vi.mock('../../../src/mcp/serverConfig', () => ({
    getOutputDirectory: vi.fn().mockReturnValue('/test/output'),
}));

vi.mock('../../../src/mcp/tools/shared', () => ({
    sanitizePath: vi.fn().mockImplementation(async (filePath: string) => filePath),
}));

// Import after mocks
import {
    handleQueueStatus,
    handleGetTranscriptByUuid,
    handleRetryTranscription,
    handleCancelTranscription,
} from '../../../src/mcp/tools/queueTools';

describe('Queue Tools', () => {
    let testDir: string;

    beforeEach(async () => {
        // Create temporary test directory
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-queue-test-'));
        
        // Mock getOutputDirectory to return test directory
        const { getOutputDirectory } = await import('../../../src/mcp/serverConfig');
        vi.mocked(getOutputDirectory).mockReturnValue(testDir);
    });

    describe('handleQueueStatus', () => {
        it('should return empty queue when no transcripts exist', async () => {
            const result = await handleQueueStatus();
            
            expect(result.pending).toEqual([]);
            expect(result.processing).toEqual([]);
            expect(result.totalPending).toBe(0);
        });

        it('should list pending uploads', async () => {
            // Create a transcript with 'uploaded' status
            const metadata: TranscriptMetadata = {
                id: 'test-uuid-1',
                status: 'uploaded',
                audioFile: 'test-audio.m4a',
                date: new Date('2026-02-15T10:00:00Z'),
            };
            
            const filePath = path.join(testDir, 'test-uui-upload.pkl');
            const transcript = PklTranscript.create(filePath, metadata);
            await transcript.close();

            const result = await handleQueueStatus();
            
            expect(result.pending.length).toBe(1);
            expect(result.pending[0].uuid).toBe('test-uuid-1');
            expect(result.pending[0].filename).toBe('test-audio.m4a');
            expect(result.totalPending).toBe(1);
        });

        it('should list processing transcriptions', async () => {
            // Create a transcript with 'transcribing' status
            const metadata: TranscriptMetadata = {
                id: 'test-uuid-2',
                status: 'transcribing',
                audioFile: 'processing-audio.m4a',
                date: new Date('2026-02-15T10:00:00Z'),
            };
            
            const filePath = path.join(testDir, 'test-uui-processing.pkl');
            const transcript = PklTranscript.create(filePath, metadata);
            await transcript.close();

            const result = await handleQueueStatus();
            
            expect(result.processing.length).toBe(1);
            expect(result.processing[0].uuid).toBe('test-uuid-2');
            expect(result.processing[0].filename).toBe('processing-audio.m4a');
        });
    });

    describe('handleGetTranscriptByUuid', () => {
        it('should find transcript by UUID prefix', async () => {
            const metadata: TranscriptMetadata = {
                id: 'abcd1234-5678-90ab-cdef-123456789012',
                status: 'uploaded',
                audioFile: 'test.m4a',
                date: new Date(),
            };
            
            const filePath = path.join(testDir, 'abcd1234-test.pkl');
            const transcript = PklTranscript.create(filePath, metadata);
            await transcript.close();

            const result = await handleGetTranscriptByUuid({ uuid: 'abcd1234' });
            
            expect(result.found).toBe(true);
            expect(result.uuid).toBe('abcd1234-5678-90ab-cdef-123456789012');
            expect(result.metadata?.status).toBe('uploaded');
        });

        it('should return not found for non-existent UUID', async () => {
            const result = await handleGetTranscriptByUuid({ uuid: 'nonexist' });
            
            expect(result.found).toBe(false);
            expect(result.error).toContain('No transcript found');
        });

        it('should include content when requested for completed transcripts', async () => {
            const metadata: TranscriptMetadata = {
                id: 'test-uuid-3',
                status: 'enhanced',
                title: 'Test Transcript',
                date: new Date(),
            };
            
            const filePath = path.join(testDir, 'test-uui-enhanced.pkl');
            const transcript = PklTranscript.create(filePath, metadata);
            transcript.updateContent('This is the enhanced content');
            await transcript.close();

            const result = await handleGetTranscriptByUuid({ 
                uuid: 'test-uuid-3',
                includeContent: true 
            });
            
            expect(result.found).toBe(true);
            expect(result.content).toBe('This is the enhanced content');
        });

        it('should not include content for uploaded transcripts', async () => {
            const metadata: TranscriptMetadata = {
                id: 'test-uuid-4',
                status: 'uploaded',
                audioFile: 'test.m4a',
                date: new Date(),
            };
            
            const filePath = path.join(testDir, 'test-uui-uploaded.pkl');
            const transcript = PklTranscript.create(filePath, metadata);
            await transcript.close();

            const result = await handleGetTranscriptByUuid({ 
                uuid: 'test-uuid-4',
                includeContent: true 
            });
            
            expect(result.found).toBe(true);
            expect(result.content).toBeUndefined();
        });
    });

    describe('handleRetryTranscription', () => {
        it('should reset error status to uploaded', async () => {
            const metadata: TranscriptMetadata = {
                id: 'test-uuid-5',
                status: 'error',
                errorDetails: 'Transcription failed',
                audioFile: 'failed.m4a',
                date: new Date(),
            };
            
            const filePath = path.join(testDir, 'test-uui-error.pkl');
            const transcript = PklTranscript.create(filePath, metadata);
            await transcript.close();

            const result = await handleRetryTranscription({ uuid: 'test-uuid-5' });
            
            expect(result.success).toBe(true);
            expect(result.message).toContain('reset to uploaded');
            
            // Verify status was changed
            const reopened = PklTranscript.open(filePath, { readOnly: true });
            expect(reopened.metadata.status).toBe('uploaded');
            await reopened.close();
        });

        it('should reject retry for non-error transcripts', async () => {
            const metadata: TranscriptMetadata = {
                id: 'test-uuid-6',
                status: 'enhanced',
                title: 'Good Transcript',
                date: new Date(),
            };
            
            const filePath = path.join(testDir, 'test-uui-good.pkl');
            const transcript = PklTranscript.create(filePath, metadata);
            await transcript.close();

            const result = await handleRetryTranscription({ uuid: 'test-uuid-6' });
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('not in error status');
        });

        it('should return error for non-existent UUID', async () => {
            const result = await handleRetryTranscription({ uuid: 'nonexist' });
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('No transcript found');
        });
    });

    describe('handleCancelTranscription', () => {
        it('should mark uploaded transcript as error', async () => {
            const metadata: TranscriptMetadata = {
                id: 'test-uuid-7',
                status: 'uploaded',
                audioFile: 'cancel-me.m4a',
                date: new Date(),
            };
            
            const filePath = path.join(testDir, 'test-uui-cancel.pkl');
            const transcript = PklTranscript.create(filePath, metadata);
            await transcript.close();

            const result = await handleCancelTranscription({ uuid: 'test-uuid-7' });
            
            expect(result.success).toBe(true);
            expect(result.message).toContain('cancelled');
            
            // Verify status was changed
            const reopened = PklTranscript.open(filePath, { readOnly: true });
            expect(reopened.metadata.status).toBe('error');
            expect(reopened.metadata.errorDetails).toBe('Cancelled by user');
            await reopened.close();
        });

        it('should delete file when deleteFile is true', async () => {
            const metadata: TranscriptMetadata = {
                id: 'test-uuid-8',
                status: 'transcribing',
                audioFile: 'delete-me.m4a',
                date: new Date(),
            };
            
            const filePath = path.join(testDir, 'test-uui-delete.pkl');
            const transcript = PklTranscript.create(filePath, metadata);
            await transcript.close();

            const result = await handleCancelTranscription({ 
                uuid: 'test-uuid-8',
                deleteFile: true 
            });
            
            expect(result.success).toBe(true);
            expect(result.message).toContain('file deleted');
            
            // Verify file was deleted
            await expect(fs.access(filePath)).rejects.toThrow();
        });

        it('should reject cancel for completed transcripts', async () => {
            const metadata: TranscriptMetadata = {
                id: 'test-uuid-9',
                status: 'enhanced',
                title: 'Completed',
                date: new Date(),
            };
            
            const filePath = path.join(testDir, 'test-uui-completed.pkl');
            const transcript = PklTranscript.create(filePath, metadata);
            await transcript.close();

            const result = await handleCancelTranscription({ uuid: 'test-uuid-9' });
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot cancel');
        });
    });
});
