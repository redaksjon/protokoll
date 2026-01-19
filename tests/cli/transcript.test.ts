/**
 * Tests for CLI transcript module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import {
    getRawTranscriptPath,
    readRawTranscript,
    readFinalTranscript,
    formatComparison,
    wrapText,
    compareCommand,
    infoCommand,
    listCommand,
    listTranscripts,
    extractTitle,
    extractDateTimeFromFilename,
    registerTranscriptCommands,
} from '../../src/cli/transcript';
import { RawTranscriptData } from '../../src/output/types';

// Mock fs/promises
vi.mock('fs/promises');

// Mock glob
vi.mock('glob', () => ({
    glob: vi.fn(),
}));

// Sample raw transcript data for testing
const SAMPLE_RAW_TRANSCRIPT: RawTranscriptData = {
    text: 'This is the raw whisper output. It has some errors and no formatting.',
    model: 'whisper-1',
    duration: 5000,
    audioFile: '/path/to/audio.mp3',
    audioHash: 'abc123def456',
    transcribedAt: '2026-01-15T14:30:00.000Z',
};

const SAMPLE_ENHANCED_TRANSCRIPT = `# Meeting Notes

## Metadata

**Date**: January 15, 2026

---

## Corrected Transcript

This is the raw Whisper output. It has some errors and no formatting.
`;

describe('transcript CLI module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset console mocks from setup.ts
        vi.mocked(console.log).mockClear();
        vi.mocked(console.error).mockClear();
        vi.mocked(process.exit).mockClear();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('getRawTranscriptPath', () => {
        it('should return correct path for a file in root directory', () => {
            const result = getRawTranscriptPath('/notes/transcript.md');
            expect(result).toBe('/notes/.transcript/transcript.json');
        });

        it('should return correct path for a file in nested directory', () => {
            const result = getRawTranscriptPath('/notes/2026/01/meeting-notes.md');
            expect(result).toBe('/notes/2026/01/.transcript/meeting-notes.json');
        });

        it('should handle files with multiple dots in name', () => {
            const result = getRawTranscriptPath('/notes/meeting.backup.md');
            expect(result).toBe('/notes/.transcript/meeting.backup.json');
        });

        it('should handle relative paths', () => {
            const result = getRawTranscriptPath('notes/transcript.md');
            expect(result).toBe('notes/.transcript/transcript.json');
        });

        it('should handle paths with no extension', () => {
            const result = getRawTranscriptPath('/notes/transcript');
            expect(result).toBe('/notes/.transcript/transcript.json');
        });

        it('should handle Windows-style paths on Windows', () => {
            // This test verifies the function uses path module correctly
            const input = path.join('C:', 'notes', 'transcript.md');
            const result = getRawTranscriptPath(input);
            expect(result).toContain('.transcript');
            expect(result).toContain('transcript.json');
        });
    });

    describe('readRawTranscript', () => {
        it('should read and parse valid raw transcript', async () => {
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(SAMPLE_RAW_TRANSCRIPT));

            const result = await readRawTranscript('/notes/transcript.md');

            expect(result).toEqual(SAMPLE_RAW_TRANSCRIPT);
            expect(fs.readFile).toHaveBeenCalledWith(
                '/notes/.transcript/transcript.json',
                'utf-8'
            );
        });

        it('should return null when file does not exist', async () => {
            const error = new Error('File not found') as Error & { code: string };
            error.code = 'ENOENT';
            vi.mocked(fs.readFile).mockRejectedValue(error);

            const result = await readRawTranscript('/notes/missing.md');

            expect(result).toBeNull();
        });

        it('should throw for other file system errors', async () => {
            const error = new Error('Permission denied') as Error & { code: string };
            error.code = 'EACCES';
            vi.mocked(fs.readFile).mockRejectedValue(error);

            await expect(readRawTranscript('/notes/protected.md')).rejects.toThrow('Permission denied');
        });

        it('should throw for malformed JSON', async () => {
            vi.mocked(fs.readFile).mockResolvedValue('{ invalid json }');

            await expect(readRawTranscript('/notes/corrupt.md')).rejects.toThrow();
        });
    });

    describe('readFinalTranscript', () => {
        it('should read final transcript content', async () => {
            vi.mocked(fs.readFile).mockResolvedValue(SAMPLE_ENHANCED_TRANSCRIPT);

            const result = await readFinalTranscript('/notes/transcript.md');

            expect(result).toBe(SAMPLE_ENHANCED_TRANSCRIPT);
            expect(fs.readFile).toHaveBeenCalledWith('/notes/transcript.md', 'utf-8');
        });

        it('should return null when file does not exist', async () => {
            const error = new Error('File not found') as Error & { code: string };
            error.code = 'ENOENT';
            vi.mocked(fs.readFile).mockRejectedValue(error);

            const result = await readFinalTranscript('/notes/missing.md');

            expect(result).toBeNull();
        });

        it('should throw for other file system errors', async () => {
            const error = new Error('Disk full') as Error & { code: string };
            error.code = 'ENOSPC';
            vi.mocked(fs.readFile).mockRejectedValue(error);

            await expect(readFinalTranscript('/notes/error.md')).rejects.toThrow('Disk full');
        });
    });

    describe('wrapText', () => {
        it('should wrap text at word boundaries', () => {
            const result = wrapText('Hello world this is a test', 10);
            expect(result).toEqual(['Hello', 'world this', 'is a test']);
        });

        it('should handle text shorter than max width', () => {
            const result = wrapText('Short', 20);
            expect(result).toEqual(['Short']);
        });

        it('should handle empty text', () => {
            const result = wrapText('', 20);
            expect(result).toEqual(['']);
        });

        it('should handle text with newlines', () => {
            const result = wrapText('Hello\nworld', 20);
            expect(result).toEqual(['Hello world']);
        });

        it('should truncate words longer than max width', () => {
            const result = wrapText('Supercalifragilisticexpialidocious', 10);
            expect(result).toEqual(['Supercalif']);
        });

        it('should handle multiple spaces between words', () => {
            const result = wrapText('Hello    world', 20);
            expect(result).toEqual(['Hello world']);
        });

        it('should handle text with only spaces', () => {
            const result = wrapText('     ', 20);
            expect(result).toEqual(['']);
        });

        it('should wrap at exact word boundaries', () => {
            const result = wrapText('one two three four', 8);
            expect(result).toEqual(['one two', 'three', 'four']);
        });
    });

    describe('formatComparison', () => {
        it('should create side-by-side comparison', () => {
            const raw = 'Raw text here';
            const enhanced = 'Enhanced text here';
            const result = formatComparison(raw, enhanced, 60);

            expect(result).toContain('RAW WHISPER OUTPUT');
            expect(result).toContain('ENHANCED TRANSCRIPT');
            expect(result).toContain('Raw text here');
            expect(result).toContain('Enhanced text here');
        });

        it('should use box drawing characters', () => {
            const result = formatComparison('A', 'B', 60);

            expect(result).toContain('╔');
            expect(result).toContain('╗');
            expect(result).toContain('╚');
            expect(result).toContain('╝');
            expect(result).toContain('║');
            expect(result).toContain('═');
        });

        it('should handle multiple paragraphs', () => {
            const raw = 'Paragraph 1\n\nParagraph 2';
            const enhanced = 'Enhanced 1\n\nEnhanced 2';
            const result = formatComparison(raw, enhanced, 60);

            expect(result).toContain('Paragraph 1');
            expect(result).toContain('Paragraph 2');
            expect(result).toContain('Enhanced 1');
            expect(result).toContain('Enhanced 2');
            // Should have separator between paragraphs
            expect(result).toContain('─');
        });

        it('should handle unequal paragraph counts', () => {
            const raw = 'Only one paragraph';
            const enhanced = 'First\n\nSecond\n\nThird';
            const result = formatComparison(raw, enhanced, 80);

            // Should not throw and should include all content
            expect(result).toContain('Only one paragraph');
            expect(result).toContain('First');
            expect(result).toContain('Second');
            expect(result).toContain('Third');
        });

        it('should handle empty strings', () => {
            const result = formatComparison('', '', 60);
            // Should produce valid output with headers
            expect(result).toContain('RAW WHISPER OUTPUT');
            expect(result).toContain('ENHANCED TRANSCRIPT');
        });

        it('should respect custom width', () => {
            const result = formatComparison('A', 'B', 40);
            // With width 40, each column should be ~18 chars
            const lines = result.split('\n');
            // All lines should be around the same length
            expect(lines[0].length).toBeLessThanOrEqual(42); // Allow some margin
        });
    });

    describe('compareCommand', () => {
        beforeEach(() => {
            // Default mock implementations
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                const p = filepath.toString();
                if (p.includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                return SAMPLE_ENHANCED_TRANSCRIPT;
            });
        });

        it('should display comparison when both files exist', async () => {
            await compareCommand('/notes/transcript.md', {});

            expect(console.log).toHaveBeenCalled();
            expect(process.exit).not.toHaveBeenCalled();
        });

        it('should show raw transcript info metadata', async () => {
            await compareCommand('/notes/transcript.md', {});

            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            expect(logCalls).toContain('whisper-1');
            expect(logCalls).toContain('5.0s'); // duration
        });

        it('should show only raw transcript with --raw option', async () => {
            await compareCommand('/notes/transcript.md', { raw: true });

            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            expect(logCalls).toContain('RAW WHISPER OUTPUT');
            expect(logCalls).toContain(SAMPLE_RAW_TRANSCRIPT.text);
        });

        it('should show only enhanced transcript with --enhanced option', async () => {
            await compareCommand('/notes/transcript.md', { enhanced: true });

            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            expect(logCalls).toContain('ENHANCED TRANSCRIPT');
        });

        it('should exit with error when raw transcript not found', async () => {
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                const p = filepath.toString();
                if (p.includes('.transcript')) {
                    const error = new Error('Not found') as Error & { code: string };
                    error.code = 'ENOENT';
                    throw error;
                }
                return SAMPLE_ENHANCED_TRANSCRIPT;
            });

            await compareCommand('/notes/transcript.md', {});

            expect(console.error).toHaveBeenCalled();
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        it('should exit with error when final transcript not found', async () => {
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                const p = filepath.toString();
                if (p.includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                const error = new Error('Not found') as Error & { code: string };
                error.code = 'ENOENT';
                throw error;
            });

            await compareCommand('/notes/transcript.md', {});

            expect(console.error).toHaveBeenCalled();
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        it('should handle relative paths', async () => {
            await compareCommand('transcript.md', {});

            // Should resolve to absolute path
            expect(fs.readFile).toHaveBeenCalled();
        });
    });

    describe('infoCommand', () => {
        it('should display transcript info when raw exists', async () => {
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(SAMPLE_RAW_TRANSCRIPT));

            await infoCommand('/notes/transcript.md');

            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            expect(logCalls).toContain('whisper-1');
            expect(logCalls).toContain('/path/to/audio.mp3');
            expect(logCalls).toContain('abc123def456');
            expect(logCalls).toContain('5.0 seconds');
            expect(process.exit).not.toHaveBeenCalled();
        });

        it('should show word count approximation', async () => {
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(SAMPLE_RAW_TRANSCRIPT));

            await infoCommand('/notes/transcript.md');

            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            // "This is the raw whisper output. It has some errors and no formatting." = ~13 words
            expect(logCalls).toContain('words');
        });

        it('should exit with error when raw transcript not found', async () => {
            const error = new Error('Not found') as Error & { code: string };
            error.code = 'ENOENT';
            vi.mocked(fs.readFile).mockRejectedValue(error);

            await infoCommand('/notes/missing.md');

            expect(console.error).toHaveBeenCalled();
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        it('should handle relative paths', async () => {
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(SAMPLE_RAW_TRANSCRIPT));

            await infoCommand('relative/path/transcript.md');

            expect(fs.readFile).toHaveBeenCalled();
        });
    });

    describe('listCommand', () => {
        it('should list transcripts with date and title', async () => {
            vi.mocked(glob).mockResolvedValue([
                '/notes/2026-01-15_transcript1.md',
                '/notes/2026-01-16-1430_transcript2.md',
            ] as string[]);
            
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                const p = filepath.toString();
                if (p.includes('transcript1') && !p.includes('.transcript')) {
                    return '# Meeting Notes\n\nContent here';
                }
                if (p.includes('transcript2') && !p.includes('.transcript')) {
                    return '# Project Update\n\nMore content';
                }
                if (p.includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                const error = new Error('Not found') as Error & { code: string };
                error.code = 'ENOENT';
                throw error;
            });
            
            vi.mocked(fs.stat).mockResolvedValue({
                birthtime: new Date('2026-01-15T12:00:00Z'),
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            await listCommand('/notes');

            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            expect(logCalls).toContain('2026-01-15');
            expect(logCalls).toContain('Meeting Notes');
            expect(logCalls).toContain('Project Update');
        });

        it('should handle pagination with limit', async () => {
            vi.mocked(glob).mockResolvedValue([
                '/notes/file1.md',
                '/notes/file2.md',
            ] as string[]);
            
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                const p = filepath.toString();
                if (p.includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                return '# Title\n\nContent';
            });
            
            vi.mocked(fs.stat).mockResolvedValue({
                birthtime: new Date('2026-01-15T12:00:00Z'),
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            await listCommand('/notes', { limit: 1, offset: 0 });

            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            expect(logCalls).toContain('1-1 of 2');
        });

        it('should handle empty directory', async () => {
            vi.mocked(glob).mockResolvedValue([] as string[]);

            await listCommand('/empty');

            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            expect(logCalls).toContain('No transcripts found');
        });

        it('should handle search filter', async () => {
            vi.mocked(glob).mockResolvedValue(['/notes/file1.md'] as string[]);
            
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                const p = filepath.toString();
                if (p.includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                return '# Title\n\nKubernetes content';
            });
            
            vi.mocked(fs.stat).mockResolvedValue({
                birthtime: new Date('2026-01-15T12:00:00Z'),
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            await listCommand('/notes', { search: 'kubernetes' });

            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            expect(logCalls).toContain('🔍 Search:');
            expect(logCalls).toContain('kubernetes');
        });

        it('should show date range filter info', async () => {
            vi.mocked(glob).mockResolvedValue([] as string[]);

            await listCommand('/notes', { startDate: '2026-01-01', endDate: '2026-01-31' });

            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            expect(logCalls).toContain('📅 Date range:');
        });
        
        it('should handle sort by filename', async () => {
            vi.mocked(glob).mockResolvedValue([
                '/notes/b-file.md',
                '/notes/a-file.md',
            ] as string[]);
            
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                if (filepath.toString().includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                return '# Title\n\nContent';
            });
            
            vi.mocked(fs.stat).mockResolvedValue({
                birthtime: new Date('2026-01-15T12:00:00Z'),
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            await listCommand('/notes', { sortBy: 'filename' });

            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            // Should list a-file before b-file
            const aIndex = logCalls.indexOf('a-file');
            const bIndex = logCalls.indexOf('b-file');
            expect(aIndex).toBeLessThan(bIndex);
        });
        
        it('should show pagination next offset hint', async () => {
            vi.mocked(glob).mockResolvedValue([
                '/notes/file1.md',
                '/notes/file2.md',
                '/notes/file3.md',
            ] as string[]);
            
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                if (filepath.toString().includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                return '# Title\n\nContent';
            });
            
            vi.mocked(fs.stat).mockResolvedValue({
                birthtime: new Date('2026-01-15T12:00:00Z'),
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            await listCommand('/notes', { limit: 2, offset: 0 });

            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            expect(logCalls).toContain('More results available');
            expect(logCalls).toContain('--offset 2');
        });
        
        it('should parse entity metadata from transcripts', async () => {
            vi.mocked(glob).mockResolvedValue(['/notes/file.md'] as string[]);
            
            const contentWithEntities = `# Title

Content here

---

## Entity References

### People

- \`john-smith\`: John Smith

### Terms

- \`kubernetes\`: Kubernetes
`;
            
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                if (filepath.toString().includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                return contentWithEntities;
            });
            
            vi.mocked(fs.stat).mockResolvedValue({
                birthtime: new Date('2026-01-15T12:00:00Z'),
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            await listCommand('/notes');

            // Verify entity parsing works (output would show the transcript)
            const logCalls = vi.mocked(console.log).mock.calls.flat().join(' ');
            expect(logCalls).toContain('Title');
        });
    });

    describe('extractTitle', () => {
        it('should extract title from markdown heading', () => {
            const content = '# Meeting Notes\n\nContent here';
            const result = extractTitle(content);
            expect(result).toBe('Meeting Notes');
        });
        
        it('should handle content without heading', () => {
            const content = 'Just some content without a heading';
            const result = extractTitle(content);
            expect(result).toBe('Just some content without a heading');
        });
        
        it('should truncate long first lines', () => {
            const longLine = 'a'.repeat(150);
            const result = extractTitle(longLine);
            expect(result.length).toBe(100);
        });
        
        it('should trim whitespace', () => {
            const content = '#   Meeting Notes   \n\nContent';
            const result = extractTitle(content);
            expect(result).toBe('Meeting Notes');
        });
    });
    
    describe('extractDateTimeFromFilename', () => {
        it('should extract date and time from filename with time', () => {
            const result = extractDateTimeFromFilename('2026-01-18-1430_Meeting.md');
            expect(result).toEqual({ date: '2026-01-18', time: '14:30' });
        });
        
        it('should extract date only from filename without time', () => {
            const result = extractDateTimeFromFilename('2026-01-18_Meeting.md');
            expect(result).toEqual({ date: '2026-01-18' });
        });
        
        it('should return null for filename without date', () => {
            const result = extractDateTimeFromFilename('meeting-notes.md');
            expect(result).toBeNull();
        });
        
        it('should handle filename with full path', () => {
            const result = extractDateTimeFromFilename('/notes/2026/01/2026-01-18-1430_Meeting.md');
            expect(result).toEqual({ date: '2026-01-18', time: '14:30' });
        });
    });
    
    describe('listTranscripts', () => {
        it('should return paginated results', async () => {
            vi.mocked(glob).mockResolvedValue([
                '/notes/2026-01-18_file1.md',
                '/notes/2026-01-17_file2.md',
                '/notes/2026-01-16_file3.md',
            ] as string[]);
            
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                if (filepath.toString().includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                return '# Title\n\nContent';
            });
            
            vi.mocked(fs.stat).mockResolvedValue({
                birthtime: new Date('2026-01-15T12:00:00Z'),
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            const result = await listTranscripts({
                directory: '/notes',
                limit: 2,
                offset: 0,
            });

            expect(result.transcripts).toHaveLength(2);
            expect(result.total).toBe(3);
            expect(result.hasMore).toBe(true);
            expect(result.limit).toBe(2);
            expect(result.offset).toBe(0);
        });
        
        it('should filter by date range', async () => {
            vi.mocked(glob).mockResolvedValue([
                '/notes/2026-01-18_file1.md',
                '/notes/2026-01-10_file2.md',
                '/notes/2026-01-05_file3.md',
            ] as string[]);
            
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                if (filepath.toString().includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                return '# Title\n\nContent';
            });
            
            vi.mocked(fs.stat).mockResolvedValue({
                birthtime: new Date('2026-01-15T12:00:00Z'),
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            const result = await listTranscripts({
                directory: '/notes',
                startDate: '2026-01-10',
                endDate: '2026-01-20',
            });

            expect(result.transcripts).toHaveLength(2);
            expect(result.transcripts.every(t => t.date >= '2026-01-10' && t.date <= '2026-01-20')).toBe(true);
        });
        
        it('should search in filename and content', async () => {
            vi.mocked(glob).mockResolvedValue([
                '/notes/kubernetes-meeting.md',
                '/notes/docker-notes.md',
                '/notes/other.md',
            ] as string[]);
            
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                const p = filepath.toString();
                if (p.includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                if (p.includes('docker')) {
                    return '# Docker Notes\n\nTalking about Kubernetes';
                }
                if (p.includes('kubernetes')) {
                    return '# Kubernetes Meeting\n\nDiscussion';
                }
                return '# Other\n\nUnrelated content';
            });
            
            vi.mocked(fs.stat).mockResolvedValue({
                birthtime: new Date('2026-01-15T12:00:00Z'),
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            const result = await listTranscripts({
                directory: '/notes',
                search: 'kubernetes',
            });

            expect(result.transcripts).toHaveLength(2);
            expect(result.transcripts.some(t => t.filename.includes('kubernetes'))).toBe(true);
            expect(result.transcripts.some(t => t.filename.includes('docker'))).toBe(true);
        });
        
        it('should sort by date descending by default', async () => {
            vi.mocked(glob).mockResolvedValue([
                '/notes/2026-01-16_file.md',
                '/notes/2026-01-18_file.md',
                '/notes/2026-01-17_file.md',
            ] as string[]);
            
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                if (filepath.toString().includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                return '# Title\n\nContent';
            });
            
            vi.mocked(fs.stat).mockResolvedValue({
                birthtime: new Date('2026-01-15T12:00:00Z'),
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            const result = await listTranscripts({
                directory: '/notes',
                sortBy: 'date',
            });

            expect(result.transcripts[0].date).toBe('2026-01-18');
            expect(result.transcripts[1].date).toBe('2026-01-17');
            expect(result.transcripts[2].date).toBe('2026-01-16');
        });
        
        it('should parse entity metadata when present', async () => {
            vi.mocked(glob).mockResolvedValue(['/notes/file.md'] as string[]);
            
            const contentWithEntities = `# Title

---

## Entity References

### People

- \`priya-sharma\`: Priya Sharma
`;
            
            vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
                if (filepath.toString().includes('.transcript')) {
                    return JSON.stringify(SAMPLE_RAW_TRANSCRIPT);
                }
                return contentWithEntities;
            });
            
            vi.mocked(fs.stat).mockResolvedValue({
                birthtime: new Date('2026-01-15T12:00:00Z'),
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            const result = await listTranscripts({
                directory: '/notes',
            });

            expect(result.transcripts[0].entities?.people).toHaveLength(1);
            expect(result.transcripts[0].entities?.people?.[0].id).toBe('priya-sharma');
        });
    });

    describe('registerTranscriptCommands', () => {
        it('should register transcript parent command', () => {
            const program = new Command();
            
            registerTranscriptCommands(program);

            const transcriptCmd = program.commands.find(c => c.name() === 'transcript');
            expect(transcriptCmd).toBeDefined();
        });

        it('should register compare subcommand', () => {
            const program = new Command();
            
            registerTranscriptCommands(program);

            const transcriptCmd = program.commands.find(c => c.name() === 'transcript');
            const compareCmd = transcriptCmd?.commands.find(c => c.name() === 'compare');
            expect(compareCmd).toBeDefined();
        });

        it('should register info subcommand', () => {
            const program = new Command();
            
            registerTranscriptCommands(program);

            const transcriptCmd = program.commands.find(c => c.name() === 'transcript');
            const infoCmd = transcriptCmd?.commands.find(c => c.name() === 'info');
            expect(infoCmd).toBeDefined();
        });

        it('should register list subcommand', () => {
            const program = new Command();
            
            registerTranscriptCommands(program);

            const transcriptCmd = program.commands.find(c => c.name() === 'transcript');
            const listCmd = transcriptCmd?.commands.find(c => c.name() === 'list');
            expect(listCmd).toBeDefined();
        });

        it('should set correct options on compare command', () => {
            const program = new Command();
            
            registerTranscriptCommands(program);

            const transcriptCmd = program.commands.find(c => c.name() === 'transcript');
            const compareCmd = transcriptCmd?.commands.find(c => c.name() === 'compare');
            
            const options = compareCmd?.options.map(o => o.long);
            expect(options).toContain('--raw');
            expect(options).toContain('--enhanced');
            expect(options).toContain('--diff');
        });

        it('should set description on transcript command', () => {
            const program = new Command();
            
            registerTranscriptCommands(program);

            const transcriptCmd = program.commands.find(c => c.name() === 'transcript');
            expect(transcriptCmd?.description()).toContain('transcript');
        });
    });
});
