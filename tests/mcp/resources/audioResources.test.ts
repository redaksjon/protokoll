/**
 * Tests for Audio Resources
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';

// Mock fs/promises - must be before imports that use it
const mockReaddir = vi.fn();
const mockStat = vi.fn();

vi.mock('node:fs/promises', () => ({
    readdir: (...args: unknown[]) => mockReaddir(...args),
    stat: (...args: unknown[]) => mockStat(...args),
}));

// Mock @/context
const mockCreate = vi.fn();
vi.mock('@/context', () => ({
    create: (...args: unknown[]) => mockCreate(...args),
}));

// Mock uri module
vi.mock('../../../src/mcp/uri', () => ({
    buildAudioInboundUri: vi.fn((dir?: string) =>
        dir ? `protokoll://audio/inbound?directory=${encodeURIComponent(dir)}` : 'protokoll://audio/inbound'
    ),
    buildAudioProcessedUri: vi.fn((dir?: string) =>
        dir ? `protokoll://audio/processed?directory=${encodeURIComponent(dir)}` : 'protokoll://audio/processed'
    ),
}));

import { readAudioInboundResource, readAudioProcessedResource } from '../../../src/mcp/resources/audioResources';

// Create Dirent-like objects (readdir with withFileTypes: true)
function createDirent(name: string, isFile: boolean) {
    return {
        name,
        isFile: () => isFile,
        isDirectory: () => !isFile,
    };
}

describe('audioResources', () => {
    const defaultContext = {
        hasContext: vi.fn().mockReturnValue(true),
        getConfig: vi.fn().mockReturnValue({
            inputDirectory: '/test/recordings',
            processedDirectory: '/test/processed',
        }),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockCreate.mockResolvedValue(defaultContext);
        mockReaddir.mockResolvedValue([]);
        mockStat.mockResolvedValue({ size: 0, mtime: new Date() });
    });

    describe('readAudioInboundResource', () => {
        it('should return resource with empty files when directory is empty', async () => {
            mockReaddir.mockResolvedValue([]);

            const result = await readAudioInboundResource();

            expect(result).toBeDefined();
            expect(result.uri).toContain('audio/inbound');
            expect(result.mimeType).toBe('application/json');

            const data = JSON.parse(result.text);
            expect(data.files).toEqual([]);
            expect(data.count).toBe(0);
            expect(data.totalSize).toBe(0);
            expect(data.supportedExtensions).toBeDefined();
            expect(data.directory).toBeDefined();
        });

        it('should return resource with audio files when directory has matching files', async () => {
            const dirPath = resolve('/test/recordings');
            const dirents = [
                createDirent('test.mp3', true),
                createDirent('other.wav', true),
            ];
            mockReaddir.mockResolvedValue(dirents);
            mockStat
                .mockResolvedValueOnce({ size: 1024, mtime: new Date('2024-01-02T12:00:00Z') })
                .mockResolvedValueOnce({ size: 2048, mtime: new Date('2024-01-01T12:00:00Z') });

            const result = await readAudioInboundResource('/test/recordings');

            expect(result).toBeDefined();
            expect(result.uri).toContain('audio/inbound');
            const data = JSON.parse(result.text);
            expect(data.files).toHaveLength(2);
            expect(data.count).toBe(2);
            expect(data.totalSize).toBe(3072);
            expect(data.files[0].filename).toBe('test.mp3');
            expect(data.files[0].size).toBe(1024);
            expect(data.files[0].sizeHuman).toBe('1.00 KB');
            expect(data.files[0].extension).toBe('mp3');
            // Sorted by mtime newest first
            expect(data.files[0].filename).toBe('test.mp3');
            expect(data.files[1].filename).toBe('other.wav');
        });

        it('should filter out non-audio files', async () => {
            const dirents = [
                createDirent('test.mp3', true),
                createDirent('readme.txt', true),
                createDirent('notes.md', true),
                createDirent('audio.m4a', true),
            ];
            mockReaddir.mockResolvedValue(dirents);
            mockStat
                .mockResolvedValueOnce({ size: 100, mtime: new Date() })
                .mockResolvedValueOnce({ size: 200, mtime: new Date() });

            const result = await readAudioInboundResource('/test/recordings');

            const data = JSON.parse(result.text);
            expect(data.files).toHaveLength(2);
            expect(data.files.map((f: { filename: string }) => f.filename)).toEqual(['test.mp3', 'audio.m4a']);
        });

        it('should filter out directories', async () => {
            const dirents = [
                createDirent('test.mp3', true),
                createDirent('subdir', false),
            ];
            mockReaddir.mockResolvedValue(dirents);
            mockStat.mockResolvedValueOnce({ size: 100, mtime: new Date() });

            const result = await readAudioInboundResource('/test/recordings');

            const data = JSON.parse(result.text);
            expect(data.files).toHaveLength(1);
            expect(data.files[0].filename).toBe('test.mp3');
        });

        it('should return empty array when directory does not exist (ENOENT)', async () => {
            const enoentError = new Error('No such file or directory') as NodeJS.ErrnoException;
            enoentError.code = 'ENOENT';
            mockReaddir.mockRejectedValue(enoentError);

            const result = await readAudioInboundResource('/nonexistent');

            const data = JSON.parse(result.text);
            expect(data.files).toEqual([]);
            expect(data.count).toBe(0);
        });

        it('should rethrow non-ENOENT errors', async () => {
            mockReaddir.mockRejectedValue(new Error('Permission denied'));

            await expect(
                readAudioInboundResource('/forbidden')
            ).rejects.toThrow('Permission denied');
        });

        it('should use config inputDirectory when no directory provided', async () => {
            const result = await readAudioInboundResource();

            expect(mockReaddir).toHaveBeenCalledWith(
                resolve('/test/recordings'),
                { withFileTypes: true }
            );
            const data = JSON.parse(result.text);
            expect(data.directory).toBe(resolve('/test/recordings'));
        });

        it('should use provided directory over config', async () => {
            const result = await readAudioInboundResource('/custom/recordings');

            expect(mockReaddir).toHaveBeenCalledWith(
                resolve('/custom/recordings'),
                { withFileTypes: true }
            );
            const data = JSON.parse(result.text);
            expect(data.directory).toBe(resolve('/custom/recordings'));
        });

        it('should throw when no context found', async () => {
            mockCreate.mockResolvedValueOnce({
                hasContext: vi.fn().mockReturnValue(false),
            });

            await expect(
                readAudioInboundResource('/test')
            ).rejects.toThrow('No Protokoll context found');
        });

        it('should include supportedExtensions in response', async () => {
            const result = await readAudioInboundResource();
            const data = JSON.parse(result.text);
            expect(data.supportedExtensions).toContain('mp3');
            expect(data.supportedExtensions).toContain('wav');
            expect(data.supportedExtensions).toContain('m4a');
        });

        it('should handle multiple audio extensions (mp3, wav, m4a, webm)', async () => {
            const dirents = [
                createDirent('a.mp3', true),
                createDirent('b.wav', true),
                createDirent('c.m4a', true),
                createDirent('d.webm', true),
            ];
            mockReaddir.mockResolvedValue(dirents);
            mockStat.mockResolvedValue({ size: 100, mtime: new Date() });

            const result = await readAudioInboundResource('/test');
            const data = JSON.parse(result.text);
            expect(data.files).toHaveLength(4);
            expect(data.files.map((f: { extension: string }) => f.extension)).toEqual(
                expect.arrayContaining(['mp3', 'wav', 'm4a', 'webm'])
            );
        });

        it('should format sizeHuman correctly for various sizes', async () => {
            const dirents = [createDirent('zero.mp3', true), createDirent('big.mp3', true)];
            mockReaddir.mockResolvedValue(dirents);
            mockStat
                .mockResolvedValueOnce({ size: 0, mtime: new Date() })
                .mockResolvedValueOnce({ size: 1536, mtime: new Date() });

            const result = await readAudioInboundResource('/test');
            const data = JSON.parse(result.text);
            expect(data.files[0].sizeHuman).toBe('0 B');
            expect(data.files[1].sizeHuman).toBe('1.50 KB');
        });
    });

    describe('readAudioProcessedResource', () => {
        it('should return resource with empty files when directory is empty', async () => {
            mockReaddir.mockResolvedValue([]);

            const result = await readAudioProcessedResource();

            expect(result).toBeDefined();
            expect(result.uri).toContain('audio/processed');
            expect(result.mimeType).toBe('application/json');

            const data = JSON.parse(result.text);
            expect(data.files).toEqual([]);
            expect(data.count).toBe(0);
            expect(data.totalSize).toBe(0);
            expect(data.supportedExtensions).toBeDefined();
        });

        it('should return resource with audio files when directory has files', async () => {
            const dirents = [
                createDirent('processed1.mp3', true),
                createDirent('processed2.wav', true),
            ];
            mockReaddir.mockResolvedValue(dirents);
            mockStat
                .mockResolvedValueOnce({ size: 5000, mtime: new Date('2024-02-01') })
                .mockResolvedValueOnce({ size: 3000, mtime: new Date('2024-02-02') });

            const result = await readAudioProcessedResource('/test/processed');

            expect(result).toBeDefined();
            expect(result.uri).toContain('audio/processed');
            const data = JSON.parse(result.text);
            expect(data.files).toHaveLength(2);
            expect(data.count).toBe(2);
            expect(data.totalSize).toBe(8000);
            expect(data.files[0].filename).toBe('processed2.wav');
            expect(data.files[1].filename).toBe('processed1.mp3');
            // Newest first
            expect(new Date(data.files[0].modified).getTime()).toBeGreaterThanOrEqual(
                new Date(data.files[1].modified).getTime()
            );
        });

        it('should use config processedDirectory when no directory provided', async () => {
            const result = await readAudioProcessedResource();

            expect(mockReaddir).toHaveBeenCalledWith(
                resolve('/test/processed'),
                { withFileTypes: true }
            );
            const data = JSON.parse(result.text);
            expect(data.directory).toBe(resolve('/test/processed'));
        });

        it('should use provided directory over config', async () => {
            const result = await readAudioProcessedResource('/custom/processed');

            expect(mockReaddir).toHaveBeenCalledWith(
                resolve('/custom/processed'),
                { withFileTypes: true }
            );
        });

        it('should return empty array when directory does not exist (ENOENT)', async () => {
            const enoentError = new Error('No such file or directory') as NodeJS.ErrnoException;
            enoentError.code = 'ENOENT';
            mockReaddir.mockRejectedValue(enoentError);

            const result = await readAudioProcessedResource('/nonexistent');

            const data = JSON.parse(result.text);
            expect(data.files).toEqual([]);
            expect(data.count).toBe(0);
        });

        it('should rethrow non-ENOENT errors', async () => {
            mockReaddir.mockRejectedValue(new Error('EACCES'));

            await expect(
                readAudioProcessedResource('/forbidden')
            ).rejects.toThrow('EACCES');
        });

        it('should throw when no context found', async () => {
            mockCreate.mockResolvedValueOnce({
                hasContext: vi.fn().mockReturnValue(false),
            });

            await expect(
                readAudioProcessedResource('/test')
            ).rejects.toThrow('No Protokoll context found');
        });

        it('should filter by audio extensions only', async () => {
            const dirents = [
                createDirent('audio.mp3', true),
                createDirent('data.json', true),
            ];
            mockReaddir.mockResolvedValue(dirents);
            mockStat.mockResolvedValue({ size: 100, mtime: new Date() });

            const result = await readAudioProcessedResource('/test');
            const data = JSON.parse(result.text);
            expect(data.files).toHaveLength(1);
            expect(data.files[0].filename).toBe('audio.mp3');
        });
    });
});
