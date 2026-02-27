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
            getArtifact: vi.fn().mockReturnValue(undefined),
            close: vi.fn(),
        }),
    },
}));

vi.mock('../../../src/mcp/serverConfig', () => ({
    getOutputDirectory: vi.fn().mockReturnValue('/test/output'),
    getOutputStorage: vi.fn().mockReturnValue({ name: 'filesystem' }),
    isInitialized: vi.fn().mockReturnValue(false),
    getContext: vi.fn().mockReturnValue(null),
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
                getArtifact: vi.fn().mockReturnValue(undefined),
                close: vi.fn(),
            } as any);
            
            const result = await TranscriptResources.readTranscriptResource('test.pkl');
            
            const data = JSON.parse(result.text);
            expect(data.rawTranscript).toBeUndefined();
        });

        it('should read transcript from output storage in gcs mode', async () => {
            const ServerConfig = await import('../../../src/mcp/serverConfig');
            const { Transcript } = await import('@redaksjon/protokoll-engine');

            const exists = vi.fn().mockResolvedValue(true);
            const readFile = vi.fn().mockResolvedValue(Buffer.from('pkl-bytes'));
            vi.mocked(ServerConfig.getOutputStorage).mockReturnValueOnce({
                name: 'gcs',
                listFiles: vi.fn(),
                readFile,
                writeFile: vi.fn(),
                deleteFile: vi.fn(),
                exists,
                mkdir: vi.fn(),
            } as any);

            vi.mocked(Transcript.resolveTranscriptPath).mockClear();
            const result = await TranscriptResources.readTranscriptResource('2026/2/test');
            expect(result.mimeType).toBe('application/json');
            expect(exists).toHaveBeenCalledWith('2026/2/test');
            expect(readFile).toHaveBeenCalledTimes(1);
            expect(vi.mocked(Transcript.resolveTranscriptPath)).not.toHaveBeenCalled();
        });

        it('should fall back to local resolution when gcs transcript is missing', async () => {
            const ServerConfig = await import('../../../src/mcp/serverConfig');
            const { Transcript } = await import('@redaksjon/protokoll-engine');

            vi.mocked(ServerConfig.getOutputStorage).mockReturnValueOnce({
                name: 'gcs',
                listFiles: vi.fn(),
                readFile: vi.fn(),
                writeFile: vi.fn(),
                deleteFile: vi.fn(),
                exists: vi.fn().mockResolvedValue(false),
                mkdir: vi.fn(),
            } as any);

            await TranscriptResources.readTranscriptResource('2026/2/test');
            expect(vi.mocked(Transcript.resolveTranscriptPath)).toHaveBeenCalled();
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

        it('should use output storage listing in gcs mode', async () => {
            const ServerConfig = await import('../../../src/mcp/serverConfig');
            const { Transcript } = await import('@redaksjon/protokoll-engine');
            vi.mocked(Transcript.listTranscripts).mockClear();

            vi.mocked(ServerConfig.getOutputStorage).mockReturnValueOnce({
                name: 'gcs',
                listFiles: vi.fn().mockResolvedValue(['2026/02/14-test.pkl']),
                readFile: vi.fn().mockResolvedValue(Buffer.from('pkl-bytes')),
                writeFile: vi.fn(),
                deleteFile: vi.fn(),
                exists: vi.fn().mockResolvedValue(true),
                mkdir: vi.fn(),
            } as any);

            const result = await TranscriptResources.readTranscriptsListResource({
                limit: 10,
                offset: 0,
            });

            const data = JSON.parse(result.text);
            expect(data.pagination.total).toBe(1);
            expect(data.transcripts).toHaveLength(1);
            expect(data.transcripts[0].path).toContain('2026/02/14-test');
            expect(vi.mocked(Transcript.listTranscripts)).not.toHaveBeenCalled();
        });

        it('should filter uploads and apply date/project filters in gcs mode', async () => {
            const ServerConfig = await import('../../../src/mcp/serverConfig');
            const { Transcript } = await import('@redaksjon/protokoll-engine');
            vi.mocked(Transcript.listTranscripts).mockClear();

            const readFile = vi.fn().mockResolvedValue(Buffer.from('pkl-bytes'));
            vi.mocked(ServerConfig.getOutputStorage).mockReturnValueOnce({
                name: 'gcs',
                listFiles: vi.fn().mockResolvedValue([
                    'uploads/skip.pkl',
                    '.intermediate/skip.pkl',
                    '2026/02/14-keep.pkl',
                    '2026/02/13-skip.pkl',
                ]),
                readFile,
                writeFile: vi.fn(),
                deleteFile: vi.fn(),
                exists: vi.fn().mockResolvedValue(true),
                mkdir: vi.fn(),
            } as any);

            vi.mocked(ServerConfig.isInitialized).mockReturnValueOnce(true);
            vi.mocked(ServerConfig.getContext).mockReturnValueOnce({
                getProject: vi.fn().mockReturnValue({ name: 'Walmart' }),
            } as any);

            const { Transcript: EngineTranscript } = await import('@redaksjon/protokoll-engine');
            vi.mocked(EngineTranscript.readTranscriptContent)
                .mockResolvedValueOnce({
                    content: 'A',
                    metadata: { date: '2026-02-14', project: 'Walmart', tasks: [{ status: 'completed' }] },
                    title: 'Keep',
                } as any)
                .mockResolvedValueOnce({
                    content: 'B',
                    metadata: { date: '2026-02-13', project: 'Other' },
                    title: 'Skip',
                } as any);

            const result = await TranscriptResources.readTranscriptsListResource({
                limit: 10,
                offset: 0,
                startDate: '2026-02-14',
                projectId: 'project-1',
            });

            const data = JSON.parse(result.text);
            expect(data.pagination.total).toBe(1);
            expect(data.transcripts).toHaveLength(1);
            expect(data.transcripts[0].title).toBe('Keep');
            expect(readFile).toHaveBeenCalledTimes(2);
        });
    });
});
