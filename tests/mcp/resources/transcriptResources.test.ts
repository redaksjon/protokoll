/**
 * Tests for Transcript Resources
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';

// Mock dependencies
vi.mock('@redaksjon/protokoll-engine', () => ({
    Transcript: {
        listTranscripts: vi.fn().mockResolvedValue({
            transcripts: [
                {
                    path: '/test/output/2026/2/14-test.pkl',
                    title: 'Test Transcript',
                    date: '2026-02-14',
                    project: 'test-project',
                    status: 'reviewed',
                },
            ],
            total: 1,
        }),
        resolveTranscriptPath: vi.fn().mockResolvedValue({
            exists: true,
            path: '/test/output/test.pkl',
        }),
        readTranscriptContent: vi.fn().mockResolvedValue({
            content: 'Test transcript content',
            metadata: {
                title: 'Test Transcript',
                status: 'reviewed',
                tags: ['test'],
            },
            title: 'Test Transcript',
        }),
        stripTranscriptExtension: vi.fn((p: string) => p.replace(/\.pkl$/i, '')),
    },
}));

vi.mock('@redaksjon/protokoll-format', () => ({
    PklTranscript: {
        open: vi.fn().mockReturnValue({
            hasRawTranscript: true,
            rawTranscript: {
                text: 'Raw transcript text',
                model: 'whisper-1',
                duration: 120,
                transcribedAt: '2026-02-14T12:00:00Z',
            },
            close: vi.fn(),
        }),
    },
}));

vi.mock('../../../src/mcp/serverConfig', () => ({
    getOutputDirectory: vi.fn().mockReturnValue('/test/output'),
}));

vi.mock('../../../src/mcp/tools/shared', () => ({
    sanitizePath: vi.fn((p: string) => p),
}));

vi.mock('../../../src/mcp/uri', () => ({
    buildTranscriptUri: vi.fn((p: string) => `protokoll://transcript/${p}`),
    buildTranscriptsListUri: vi.fn(() => 'protokoll://transcripts'),
}));

import * as TranscriptResources from '../../../src/mcp/resources/transcriptResources';

describe('transcriptResources', () => {
    describe('readTranscriptResource', () => {
        it('should read transcript', async () => {
            const result = await TranscriptResources.readTranscriptResource('test.pkl');
            
            expect(result).toBeDefined();
            expect(result.uri).toContain('transcript');
            expect(result.mimeType).toBe('application/json');
        });

        it('should throw on invalid path', async () => {
            await expect(
                TranscriptResources.readTranscriptResource('')
            ).rejects.toThrow('Invalid transcript path');
        });

        it('should throw on null path', async () => {
            await expect(
                TranscriptResources.readTranscriptResource(null as any)
            ).rejects.toThrow('Invalid transcript path');
        });

        it('should handle absolute paths', async () => {
            const result = await TranscriptResources.readTranscriptResource('/test/output/test.pkl');
            
            expect(result).toBeDefined();
        });

        it('should handle relative paths', async () => {
            const result = await TranscriptResources.readTranscriptResource('2026/2/test.pkl');
            
            expect(result).toBeDefined();
        });

        it('should handle paths without extension', async () => {
            const result = await TranscriptResources.readTranscriptResource('test');
            
            expect(result).toBeDefined();
        });

        it('should throw when transcript not found', async () => {
            const { Transcript } = await import('@redaksjon/protokoll-engine');
            vi.mocked(Transcript.resolveTranscriptPath).mockResolvedValueOnce({
                exists: false,
                path: null,
            });
            
            await expect(
                TranscriptResources.readTranscriptResource('nonexistent.pkl')
            ).rejects.toThrow('Transcript not found');
        });

        it('should include raw transcript when available', async () => {
            const result = await TranscriptResources.readTranscriptResource('test.pkl');
            
            const data = JSON.parse(result.text);
            expect(data.rawTranscript).toBeDefined();
        });

        it('should handle missing raw transcript', async () => {
            const { PklTranscript } = await import('@redaksjon/protokoll-format');
            vi.mocked(PklTranscript.open).mockReturnValueOnce({
                hasRawTranscript: false,
                rawTranscript: null,
                close: vi.fn(),
            } as any);
            
            const result = await TranscriptResources.readTranscriptResource('test.pkl');
            
            const data = JSON.parse(result.text);
            expect(data.rawTranscript).toBeUndefined();
        });
    });

    describe('readTranscriptsListResource', () => {
        it('should list transcripts', async () => {
            const result = await TranscriptResources.readTranscriptsListResource({});
            
            expect(result).toBeDefined();
            expect(result.uri).toContain('transcripts');
            expect(result.mimeType).toBe('application/json');
        });

        it('should handle directory parameter', async () => {
            const result = await TranscriptResources.readTranscriptsListResource({
                directory: '/custom/path'
            });
            
            expect(result).toBeDefined();
        });

        it('should handle date range', async () => {
            const result = await TranscriptResources.readTranscriptsListResource({
                startDate: '2026-01-01',
                endDate: '2026-12-31'
            });
            
            expect(result).toBeDefined();
        });

        it('should handle limit', async () => {
            const result = await TranscriptResources.readTranscriptsListResource({
                limit: 10
            });
            
            expect(result).toBeDefined();
        });

        it('should handle offset', async () => {
            const result = await TranscriptResources.readTranscriptsListResource({
                offset: 5
            });
            
            expect(result).toBeDefined();
        });

        it('should handle project filter', async () => {
            const result = await TranscriptResources.readTranscriptsListResource({
                projectId: 'test-project'
            });
            
            expect(result).toBeDefined();
        });

        it('should handle all parameters together', async () => {
            const result = await TranscriptResources.readTranscriptsListResource({
                directory: '/test',
                startDate: '2026-01-01',
                endDate: '2026-12-31',
                limit: 20,
                offset: 10,
                projectId: 'test-project'
            });
            
            expect(result).toBeDefined();
        });
    });
});
