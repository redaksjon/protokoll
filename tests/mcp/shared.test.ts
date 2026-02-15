import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
    validatePathWithinDirectory,
    sanitizePath,
    fileExists,
    slugify,
    getConfiguredDirectory,
    getContextDirectories,
    validateNotRemoteMode,
    validatePathWithinOutputDirectory,
    getAudioMetadata,
    formatEntity,
    mergeArray,
    resolveTranscriptPath,
} from '../../src/mcp/tools/shared';

// ES module equivalent of __filename
const __filename = fileURLToPath(import.meta.url);

// Hoisted mocks - must be defined before vi.mock factories run
const mockGetInputDirectory = vi.hoisted(() => vi.fn());
const mockGetOutputDirectory = vi.hoisted(() => vi.fn());
const mockGetProcessedDirectory = vi.hoisted(() => vi.fn());
const mockGetServerConfig = vi.hoisted(() => vi.fn());
const mockIsRemoteMode = vi.hoisted(() => vi.fn());
const mockGetAudioCreationTime = vi.hoisted(() => vi.fn());
const mockHashFile = vi.hoisted(() => vi.fn());
const mockTranscriptExists = vi.hoisted(() => vi.fn());
const mockEnsurePklExtension = vi.hoisted(() =>
    vi.fn((p: string) => (p.toLowerCase().endsWith('.pkl') ? p : p.replace(/\.md$/i, '') + '.pkl'))
);

vi.mock('../../src/mcp/serverConfig', () => ({
    getInputDirectory: (...args: unknown[]) => mockGetInputDirectory(...args),
    getOutputDirectory: (...args: unknown[]) => mockGetOutputDirectory(...args),
    getProcessedDirectory: (...args: unknown[]) => mockGetProcessedDirectory(...args),
    getServerConfig: (...args: unknown[]) => mockGetServerConfig(...args),
    isRemoteMode: (...args: unknown[]) => mockIsRemoteMode(...args),
}));

vi.mock('@redaksjon/protokoll-engine', () => ({
    Media: {
        create: () => ({
            getAudioCreationTime: (...args: unknown[]) => mockGetAudioCreationTime(...args),
        }),
    },
    Util: {
        create: () => ({
            hashFile: (...args: unknown[]) => mockHashFile(...args),
        }),
    },
    Transcript: {
        transcriptExists: (...args: unknown[]) => mockTranscriptExists(...args),
        ensurePklExtension: (p: string) => mockEnsurePklExtension(p),
    },
}));

describe('Shared Utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetInputDirectory.mockReturnValue('/test/input');
        mockGetOutputDirectory.mockReturnValue('/test/output');
        mockGetProcessedDirectory.mockReturnValue('/test/processed');
        mockGetServerConfig.mockReturnValue({ configFile: { contextDirectories: ['/test/context'] } });
        mockIsRemoteMode.mockReturnValue(false);
        mockGetAudioCreationTime.mockResolvedValue(new Date('2026-02-14T12:00:00Z'));
        mockHashFile.mockResolvedValue('abc123456789');
        mockTranscriptExists.mockResolvedValue({ exists: true, path: '/test/output/2026/2/14-test.pkl' });
        mockEnsurePklExtension.mockImplementation((p: string) =>
            p.toLowerCase().endsWith('.pkl') ? p : p.replace(/\.md$/i, '') + '.pkl'
        );
    });
    describe('validatePathWithinDirectory', () => {
        it('should allow paths within the base directory', () => {
            expect(() => {
                validatePathWithinDirectory('/home/user/notes/file.md', '/home/user/notes');
            }).not.toThrow();
        });

        it('should allow paths in subdirectories', () => {
            expect(() => {
                validatePathWithinDirectory('/home/user/notes/2026/1/file.md', '/home/user/notes');
            }).not.toThrow();
        });

        it('should allow the base directory itself', () => {
            expect(() => {
                validatePathWithinDirectory('/home/user/notes', '/home/user/notes');
            }).not.toThrow();
        });

        it('should reject paths outside the base directory', () => {
            expect(() => {
                validatePathWithinDirectory('/home/user/other/file.md', '/home/user/notes');
            }).toThrow('Security error');
            expect(() => {
                validatePathWithinDirectory('/home/user/other/file.md', '/home/user/notes');
            }).toThrow('outside the allowed directory');
        });

        it('should reject paths with ../ that escape the base directory', () => {
            expect(() => {
                validatePathWithinDirectory('/home/user/notes/../other/file.md', '/home/user/notes');
            }).toThrow('Security error');
        });

        it('should reject paths that traverse multiple levels up', () => {
            expect(() => {
                validatePathWithinDirectory('/home/user/notes/../../etc/passwd', '/home/user/notes');
            }).toThrow('Security error');
        });

        it('should reject paths to completely different directories', () => {
            expect(() => {
                validatePathWithinDirectory('/tmp/malicious/file.md', '/home/user/notes');
            }).toThrow('Security error');
        });

        it('should reject paths that use ../ sequences to escape', () => {
            // This is the actual attack vector seen in the logs
            expect(() => {
                validatePathWithinDirectory(
                    '/Users/tobrien/gitw/tobrien/activity/notes/../../../../../Library/CloudStorage/GoogleDrive/file.md',
                    '/Users/tobrien/gitw/tobrien/activity/notes'
                );
            }).toThrow('Security error');
        });

        it('should handle paths with trailing slashes', () => {
            expect(() => {
                validatePathWithinDirectory('/home/user/notes/file.md', '/home/user/notes/');
            }).not.toThrow();
        });

        it('should reject paths that look similar but are not within base', () => {
            // /home/user/notes-backup is NOT within /home/user/notes
            expect(() => {
                validatePathWithinDirectory('/home/user/notes-backup/file.md', '/home/user/notes');
            }).toThrow('Security error');
        });

        it('should reject partial directory name matches', () => {
            // /home/user/notesextra is NOT within /home/user/notes
            expect(() => {
                validatePathWithinDirectory('/home/user/notesextra/file.md', '/home/user/notes');
            }).toThrow('Security error');
        });
    });

    describe('sanitizePath', () => {
        it('should convert absolute path to relative', async () => {
            const result = await sanitizePath('/home/user/notes/2026/1/file.md', '/home/user/notes');
            expect(result).toBe('2026/1/file.md');
        });

        it('should return relative paths unchanged', async () => {
            const result = await sanitizePath('2026/1/file.md', '/home/user/notes');
            expect(result).toBe('2026/1/file.md');
        });

        it('should handle undefined/null values gracefully', async () => {
            // sanitizePath returns empty string for falsy values to prevent errors downstream
            const result = await sanitizePath(undefined as unknown as string, '/home/user/notes');
            expect(result).toBe('');
        });

        it('should handle empty string', async () => {
            const result = await sanitizePath('', '/home/user/notes');
            expect(result).toBe('');
        });

        it('should use output directory when baseDirectory not provided', async () => {
            const result = await sanitizePath('/test/output/2026/1/file.md');
            expect(result).toBe('2026/1/file.md');
            expect(mockGetOutputDirectory).toHaveBeenCalled();
        });

        it('should handle non-string type for absolutePath', async () => {
            const result = await sanitizePath(null as unknown as string, '/home/user/notes');
            expect(result).toBe('');
        });
    });

    describe('fileExists', () => {
        it('should return false for non-existent files', async () => {
            const result = await fileExists('/nonexistent/path/file.md');
            expect(result).toBe(false);
        });

        it('should return true for existing files', async () => {
            // Use this test file itself as a known existing file
            const result = await fileExists(__filename);
            expect(result).toBe(true);
        });
    });

    describe('slugify', () => {
        it('should convert text to lowercase slug', () => {
            expect(slugify('Hello World')).toBe('hello-world');
        });

        it('should replace special characters with hyphens', () => {
            expect(slugify('Test: Something! Here?')).toBe('test-something-here');
        });

        it('should collapse multiple hyphens', () => {
            expect(slugify('Test --- Multiple --- Hyphens')).toBe('test-multiple-hyphens');
        });

        it('should remove leading and trailing hyphens', () => {
            expect(slugify('--hello world--')).toBe('hello-world');
        });
    });

    describe('getConfiguredDirectory', () => {
        it('should return input directory for inputDirectory key', async () => {
            const result = await getConfiguredDirectory('inputDirectory');
            expect(result).toBe('/test/input');
            expect(mockGetInputDirectory).toHaveBeenCalled();
        });

        it('should return output directory for outputDirectory key', async () => {
            const result = await getConfiguredDirectory('outputDirectory');
            expect(result).toBe('/test/output');
            expect(mockGetOutputDirectory).toHaveBeenCalled();
        });

        it('should return processed directory for processedDirectory key', async () => {
            const result = await getConfiguredDirectory('processedDirectory');
            expect(result).toBe('/test/processed');
            expect(mockGetProcessedDirectory).toHaveBeenCalled();
        });

        it('should fallback to ./processed when getProcessedDirectory returns undefined', async () => {
            mockGetProcessedDirectory.mockReturnValueOnce(undefined);
            const result = await getConfiguredDirectory('processedDirectory');
            expect(result).toMatch(/processed$/);
        });
    });

    describe('getContextDirectories', () => {
        it('should return contextDirectories from config', async () => {
            const result = await getContextDirectories();
            expect(result).toEqual(['/test/context']);
            expect(mockGetServerConfig).toHaveBeenCalled();
        });

        it('should return undefined when configFile has no contextDirectories', async () => {
            mockGetServerConfig.mockReturnValueOnce({ configFile: {} });
            const result = await getContextDirectories();
            expect(result).toBeUndefined();
        });

        it('should return undefined when configFile is undefined', async () => {
            mockGetServerConfig.mockReturnValueOnce({});
            const result = await getContextDirectories();
            expect(result).toBeUndefined();
        });
    });

    describe('validateNotRemoteMode', () => {
        it('should not throw when contextDirectory is not provided', async () => {
            await expect(validateNotRemoteMode()).resolves.toBeUndefined();
        });

        it('should not throw when contextDirectory is provided but not in remote mode', async () => {
            mockIsRemoteMode.mockReturnValueOnce(false);
            await expect(validateNotRemoteMode('/some/dir')).resolves.toBeUndefined();
        });

        it('should throw when contextDirectory is provided in remote mode', async () => {
            mockIsRemoteMode.mockReturnValueOnce(true);
            await expect(validateNotRemoteMode('/some/dir')).rejects.toThrow(
                'Directory parameters are not accepted in remote mode'
            );
        });
    });

    describe('validatePathWithinOutputDirectory', () => {
        it('should allow path within output directory', async () => {
            await expect(
                validatePathWithinOutputDirectory('/test/output/2026/file.pkl')
            ).resolves.toBeUndefined();
        });

        it('should reject path outside output directory', async () => {
            await expect(
                validatePathWithinOutputDirectory('/tmp/malicious/file.pkl')
            ).rejects.toThrow('Security error');
        });
    });

    describe('getAudioMetadata', () => {
        it('should return creation time and hash', async () => {
            const result = await getAudioMetadata('/path/to/audio.mp3');
            expect(result).toEqual({
                creationTime: new Date('2026-02-14T12:00:00Z'),
                hash: 'abc12345',
            });
            expect(mockGetAudioCreationTime).toHaveBeenCalledWith('/path/to/audio.mp3');
            expect(mockHashFile).toHaveBeenCalledWith('/path/to/audio.mp3', 100);
        });

        it('should use current date when getAudioCreationTime returns null', async () => {
            mockGetAudioCreationTime.mockResolvedValueOnce(null);
            const before = new Date();
            const result = await getAudioMetadata('/path/to/audio.mp3');
            const after = new Date();
            expect(result.creationTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(result.creationTime.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
            expect(result.hash).toBe('abc12345');
        });
    });

    describe('formatEntity', () => {
        it('should format person entity with optional fields', () => {
            const person = {
                id: 'john',
                name: 'John Doe',
                type: 'person' as const,
                firstName: 'John',
                lastName: 'Doe',
                company: 'Acme',
                role: 'Engineer',
                sounds_like: ['jon'],
                context: 'Meeting participant',
            };
            const result = formatEntity(person);
            expect(result).toEqual({
                id: 'john',
                name: 'John Doe',
                type: 'person',
                firstName: 'John',
                lastName: 'Doe',
                company: 'Acme',
                role: 'Engineer',
                sounds_like: ['jon'],
                context: 'Meeting participant',
            });
        });

        it('should format project entity with optional fields', () => {
            const project = {
                id: 'proj1',
                name: 'Project One',
                type: 'project' as const,
                description: 'A project',
                classification: 'internal',
                routing: { default: 'notes' },
                sounds_like: ['proj uno'],
                active: true,
            };
            const result = formatEntity(project);
            expect(result).toMatchObject({
                id: 'proj1',
                name: 'Project One',
                type: 'project',
                description: 'A project',
                classification: 'internal',
                routing: { default: 'notes' },
                sounds_like: ['proj uno'],
                active: true,
            });
        });

        it('should format term entity with optional fields', () => {
            const term = {
                id: 'term1',
                name: 'API',
                type: 'term' as const,
                expansion: 'Application Programming Interface',
                domain: 'tech',
                description: 'A technical term',
                sounds_like: ['ay pee eye'],
                topics: ['development'],
                projects: ['proj1'],
            };
            const result = formatEntity(term);
            expect(result).toMatchObject({
                id: 'term1',
                name: 'API',
                type: 'term',
                expansion: 'Application Programming Interface',
                domain: 'tech',
                description: 'A technical term',
                sounds_like: ['ay pee eye'],
                topics: ['development'],
                projects: ['proj1'],
            });
        });

        it('should format company entity with optional fields', () => {
            const company = {
                id: 'co1',
                name: 'Acme Corp',
                type: 'company' as const,
                fullName: 'Acme Corporation',
                industry: 'Technology',
                sounds_like: ['akmee'],
            };
            const result = formatEntity(company);
            expect(result).toMatchObject({
                id: 'co1',
                name: 'Acme Corp',
                type: 'company',
                fullName: 'Acme Corporation',
                industry: 'Technology',
                sounds_like: ['akmee'],
            });
        });

        it('should format ignored entity with optional fields', () => {
            const ignored = {
                id: 'ign1',
                name: 'foo',
                type: 'ignored' as const,
                reason: 'Too generic',
                ignoredAt: '2026-02-14',
            };
            const result = formatEntity(ignored);
            expect(result).toMatchObject({
                id: 'ign1',
                name: 'foo',
                type: 'ignored',
                reason: 'Too generic',
                ignoredAt: '2026-02-14',
            });
        });

        it('should format minimal entity with only required fields', () => {
            const minimal = { id: 'm1', name: 'Minimal', type: 'person' as const };
            const result = formatEntity(minimal);
            expect(result).toEqual({ id: 'm1', name: 'Minimal', type: 'person' });
        });

        it('should set active to false only when explicitly false for project', () => {
            const project = {
                id: 'p1',
                name: 'P',
                type: 'project' as const,
                active: false,
            };
            const result = formatEntity(project);
            expect(result.active).toBe(false);
        });
    });

    describe('mergeArray', () => {
        it('should replace with new array when replace is provided', () => {
            const result = mergeArray(['a', 'b'], ['x', 'y'], undefined, undefined);
            expect(result).toEqual(['x', 'y']);
        });

        it('should add to replace when add is provided', () => {
            const result = mergeArray(undefined, ['a', 'b'], ['c', 'd'], undefined);
            expect(result).toEqual(['a', 'b', 'c', 'd']);
        });

        it('should not add duplicates when add contains existing values', () => {
            const result = mergeArray(undefined, ['a', 'b'], ['b', 'c'], undefined);
            expect(result).toEqual(['a', 'b', 'c']);
        });

        it('should remove from replace when remove is provided', () => {
            const result = mergeArray(undefined, ['a', 'b', 'c'], undefined, ['b']);
            expect(result).toEqual(['a', 'c']);
        });

        it('should return undefined when replace+add+remove results in empty array', () => {
            const result = mergeArray(undefined, ['a'], undefined, ['a']);
            expect(result).toBeUndefined();
        });

        it('should add to existing when no replace', () => {
            const result = mergeArray(['a', 'b'], undefined, ['c'], undefined);
            expect(result).toEqual(['a', 'b', 'c']);
        });

        it('should remove from existing when no replace', () => {
            const result = mergeArray(['a', 'b', 'c'], undefined, undefined, ['b']);
            expect(result).toEqual(['a', 'c']);
        });

        it('should return undefined when existing becomes empty and had values', () => {
            const result = mergeArray(['a'], undefined, undefined, ['a']);
            expect(result).toBeUndefined();
        });

        it('should return undefined when existing was undefined and result is empty', () => {
            const result = mergeArray(undefined, undefined, undefined, undefined);
            expect(result).toBeUndefined();
        });
    });

    describe('resolveTranscriptPath', () => {
        it('should resolve relative path to existing transcript', async () => {
            const result = await resolveTranscriptPath('2026/2/14-test');
            expect(result).toBe('/test/output/2026/2/14-test.pkl');
            expect(mockGetOutputDirectory).toHaveBeenCalled();
            expect(mockTranscriptExists).toHaveBeenCalled();
        });

        it('should resolve Protokoll URI to transcript path', async () => {
            mockTranscriptExists.mockResolvedValueOnce({
                exists: true,
                path: '/test/output/2026/2/14-meeting.pkl',
            });
            const result = await resolveTranscriptPath('protokoll://transcript/2026/2/14-meeting');
            expect(result).toBe('/test/output/2026/2/14-meeting.pkl');
        });

        it('should throw when transcriptPath is empty', async () => {
            await expect(resolveTranscriptPath('')).rejects.toThrow('transcriptPath is required');
        });

        it('should throw when transcriptPath is not a string', async () => {
            await expect(resolveTranscriptPath(null as unknown as string)).rejects.toThrow(
                'transcriptPath is required'
            );
        });

        it('should throw when URI is not a transcript URI', async () => {
            await expect(
                resolveTranscriptPath('protokoll://entity/person/john')
            ).rejects.toThrow('Invalid URI: expected transcript URI');
        });

        it('should throw when absolute path is outside output directory', async () => {
            await expect(
                resolveTranscriptPath('/tmp/outside/file.pkl')
            ).rejects.toThrow('Path must be within output directory');
        });

        it('should throw when transcript does not exist', async () => {
            mockTranscriptExists.mockResolvedValueOnce({ exists: false, path: null });
            await expect(resolveTranscriptPath('2026/2/nonexistent')).rejects.toThrow(
                'Transcript not found'
            );
        });

        it('should normalize relative path with backslashes', async () => {
            mockTranscriptExists.mockResolvedValueOnce({
                exists: true,
                path: '/test/output/2026/2/14-test.pkl',
            });
            const result = await resolveTranscriptPath('2026\\2\\14-test');
            expect(result).toBe('/test/output/2026/2/14-test.pkl');
        });
    });
});
