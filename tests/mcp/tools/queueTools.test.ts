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
    getOutputStorage: vi.fn().mockReturnValue({ name: 'filesystem' }),
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
    handleWorkerStatus,
    handleRestartWorker,
    setWorkerInstance,
} from '../../../src/mcp/tools/queueTools';

describe('Queue Tools', () => {
    let testDir: string;

    beforeEach(async () => {
        // Create temporary test directory
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-queue-test-'));
        
        // Mock getOutputDirectory to return test directory
        const { getOutputDirectory, getOutputStorage } = await import('../../../src/mcp/serverConfig');
        vi.mocked(getOutputDirectory).mockReturnValue(testDir);
        vi.mocked(getOutputStorage).mockReturnValue({ name: 'filesystem' } as any);
        setWorkerInstance(null);
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

        it('should include recent completed transcripts and transcribing start from history', async () => {
            const now = Date.now();
            const metadata: TranscriptMetadata = {
                id: 'test-uuid-10',
                status: 'enhanced',
                title: 'Completed Transcript',
                date: new Date(now - 10 * 60 * 1000),
                history: [
                    { from: 'uploaded', to: 'transcribing', at: new Date(now - 5 * 60 * 1000) },
                    { from: 'transcribing', to: 'enhanced', at: new Date(now - 1 * 60 * 1000) },
                ],
            };

            const filePath = path.join(testDir, 'test-uui-recent.pkl');
            const transcript = PklTranscript.create(filePath, metadata);
            await transcript.close();

            const result = await handleQueueStatus();
            const recent = result.recent.find(r => r.uuid === 'test-uuid-10');

            expect(recent).toBeDefined();
            expect(recent?.status).toBe('enhanced');
            expect(recent?.completedAt).toBe(new Date(now - 1 * 60 * 1000).toISOString());
        });

        it('should read queued placeholders from gcs-style storage', async () => {
            const uploadedMetadata: TranscriptMetadata = {
                id: 'gcs-uploaded-1',
                status: 'uploaded',
                audioFile: 'gcs-uploaded.m4a',
                date: new Date('2026-02-15T10:00:00Z'),
            };
            const transcribingMetadata: TranscriptMetadata = {
                id: 'gcs-transcribing-1',
                status: 'transcribing',
                audioFile: 'gcs-transcribing.m4a',
                date: new Date('2026-02-15T10:01:00Z'),
                history: [{ from: 'uploaded', to: 'transcribing', at: new Date('2026-02-15T10:02:00Z') }],
            };

            const uploadedPath = path.join(testDir, 'gcs-uploaded-upload.pkl');
            const transcribingPath = path.join(testDir, 'gcs-transcribing-upload.pkl');

            const uploadedTranscript = PklTranscript.create(uploadedPath, uploadedMetadata);
            await uploadedTranscript.close();
            const transcribingTranscript = PklTranscript.create(transcribingPath, transcribingMetadata);
            await transcribingTranscript.close();

            const uploadedBytes = await fs.readFile(uploadedPath);
            const transcribingBytes = await fs.readFile(transcribingPath);

            const { getOutputStorage } = await import('../../../src/mcp/serverConfig');
            vi.mocked(getOutputStorage).mockReturnValue({
                name: 'gcs',
                listFiles: vi.fn().mockResolvedValue([
                    'gcs-uploaded-upload.pkl',
                    'gcs-transcribing-upload.pkl',
                ]),
                readFile: vi.fn().mockImplementation(async (requestedPath: string) => {
                    if (requestedPath === 'gcs-uploaded-upload.pkl') {
                        return uploadedBytes;
                    }
                    if (requestedPath === 'gcs-transcribing-upload.pkl') {
                        return transcribingBytes;
                    }
                    throw new Error(`Unexpected path: ${requestedPath}`);
                }),
            } as any);

            const result = await handleQueueStatus();
            expect(result.pending.some((item) => item.uuid === 'gcs-uploaded-1')).toBe(true);
            expect(result.processing.some((item) => item.uuid === 'gcs-transcribing-1')).toBe(true);
        });

        it('should ignore unreadable gcs placeholders', async () => {
            const { getOutputStorage } = await import('../../../src/mcp/serverConfig');
            vi.mocked(getOutputStorage).mockReturnValue({
                name: 'gcs',
                listFiles: vi.fn().mockResolvedValue(['broken-upload.pkl']),
                readFile: vi.fn().mockResolvedValue(Buffer.from('not-a-pkl')),
            } as any);

            const result = await handleQueueStatus();
            expect(result.pending).toEqual([]);
            expect(result.processing).toEqual([]);
            expect(result.totalPending).toBe(0);
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

        it('should return caught error when lookup throws', async () => {
            const { getOutputDirectory } = await import('../../../src/mcp/serverConfig');
            vi.mocked(getOutputDirectory).mockImplementationOnce(() => {
                throw new Error('boom');
            });

            const result = await handleRetryTranscription({ uuid: 'any' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('boom');
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

        it('should return not found for non-existent UUID', async () => {
            const result = await handleCancelTranscription({ uuid: 'missing' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('No transcript found');
        });

        it('should return caught error when cancellation throws', async () => {
            const { getOutputDirectory } = await import('../../../src/mcp/serverConfig');
            vi.mocked(getOutputDirectory).mockImplementationOnce(() => {
                throw new Error('cancel boom');
            });

            const result = await handleCancelTranscription({ uuid: 'any' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('cancel boom');
        });
    });

    describe('worker management', () => {
        it('returns default worker status when worker is not initialized', async () => {
            setWorkerInstance(null);

            const result = await handleWorkerStatus();

            expect(result).toEqual({
                isRunning: false,
                totalProcessed: 0,
                uptime: 0,
            });
        });

        it('returns live worker status when worker exists', async () => {
            const mockWorker = {
                isActive: vi.fn().mockReturnValue(true),
                getCurrentTask: vi.fn().mockReturnValue('Processing uuid-1'),
                getProcessedCount: vi.fn().mockReturnValue(12),
                getLastProcessedTime: vi.fn().mockReturnValue('2026-02-15T10:00:00.000Z'),
                getUptime: vi.fn().mockReturnValue(120),
                stop: vi.fn().mockResolvedValue(undefined),
                start: vi.fn().mockResolvedValue(undefined),
            } as any;
            setWorkerInstance(mockWorker);

            const result = await handleWorkerStatus();

            expect(result).toEqual({
                isRunning: true,
                currentTask: 'Processing uuid-1',
                totalProcessed: 12,
                lastProcessed: '2026-02-15T10:00:00.000Z',
                uptime: 120,
            });
        });

        it('fails to restart when worker is not initialized', async () => {
            setWorkerInstance(null);

            const result = await handleRestartWorker();

            expect(result.success).toBe(false);
            expect(result.error).toContain('Worker not initialized');
        });

        it('restarts worker successfully', async () => {
            const mockWorker = {
                stop: vi.fn().mockResolvedValue(undefined),
                start: vi.fn().mockResolvedValue(undefined),
                isActive: vi.fn().mockReturnValue(true),
                getCurrentTask: vi.fn().mockReturnValue(undefined),
                getProcessedCount: vi.fn().mockReturnValue(0),
                getLastProcessedTime: vi.fn().mockReturnValue(undefined),
                getUptime: vi.fn().mockReturnValue(0),
            } as any;
            setWorkerInstance(mockWorker);

            const result = await handleRestartWorker();

            expect(mockWorker.stop).toHaveBeenCalledTimes(1);
            expect(mockWorker.start).toHaveBeenCalledTimes(1);
            expect(result).toEqual({
                success: true,
                message: 'Worker restarted successfully',
            });
        });

        it('returns restart error when stop/start throws', async () => {
            const mockWorker = {
                stop: vi.fn().mockRejectedValue(new Error('restart failed')),
                start: vi.fn().mockResolvedValue(undefined),
                isActive: vi.fn().mockReturnValue(false),
                getCurrentTask: vi.fn().mockReturnValue(undefined),
                getProcessedCount: vi.fn().mockReturnValue(0),
                getLastProcessedTime: vi.fn().mockReturnValue(undefined),
                getUptime: vi.fn().mockReturnValue(0),
            } as any;
            setWorkerInstance(mockWorker);

            const result = await handleRestartWorker();

            expect(result.success).toBe(false);
            expect(result.error).toContain('restart failed');
        });
    });
});
