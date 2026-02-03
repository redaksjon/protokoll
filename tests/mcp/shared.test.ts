import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { validatePathWithinDirectory, sanitizePath, fileExists, slugify } from '../../src/mcp/tools/shared';

// ES module equivalent of __filename
const __filename = fileURLToPath(import.meta.url);

describe('Shared Utilities', () => {
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
});
