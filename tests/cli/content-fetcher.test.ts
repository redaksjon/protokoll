/**
 * Tests for Content Fetcher Module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as ContentFetcher from '../../src/cli/content-fetcher';

// Mock logging
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    })),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('Content Fetcher', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-fetcher-test-'));
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('create', () => {
        it('should create a ContentFetcherInstance', () => {
            const instance = ContentFetcher.create();
            
            expect(instance).toBeDefined();
            expect(instance.fetch).toBeDefined();
            expect(instance.isUrl).toBeDefined();
            expect(instance.isGitHubUrl).toBeDefined();
        });
    });

    describe('isUrl', () => {
        it('should return true for http URLs', () => {
            const fetcher = ContentFetcher.create();
            expect(fetcher.isUrl('http://example.com')).toBe(true);
        });

        it('should return true for https URLs', () => {
            const fetcher = ContentFetcher.create();
            expect(fetcher.isUrl('https://example.com')).toBe(true);
        });

        it('should return false for file paths', () => {
            const fetcher = ContentFetcher.create();
            expect(fetcher.isUrl('/path/to/file.md')).toBe(false);
        });

        it('should return false for relative paths', () => {
            const fetcher = ContentFetcher.create();
            expect(fetcher.isUrl('relative/path.txt')).toBe(false);
        });

        it('should return false for empty string', () => {
            const fetcher = ContentFetcher.create();
            expect(fetcher.isUrl('')).toBe(false);
        });
    });

    describe('isGitHubUrl', () => {
        it('should return true for GitHub URLs', () => {
            const fetcher = ContentFetcher.create();
            expect(fetcher.isGitHubUrl('https://github.com/user/repo')).toBe(true);
        });

        it('should return true for GitHub URLs with .git suffix', () => {
            const fetcher = ContentFetcher.create();
            expect(fetcher.isGitHubUrl('https://github.com/user/repo.git')).toBe(true);
        });

        it('should return true for http GitHub URLs', () => {
            const fetcher = ContentFetcher.create();
            expect(fetcher.isGitHubUrl('http://github.com/user/repo')).toBe(true);
        });

        it('should return false for non-GitHub URLs', () => {
            const fetcher = ContentFetcher.create();
            expect(fetcher.isGitHubUrl('https://example.com')).toBe(false);
        });

        it('should return false for file paths', () => {
            const fetcher = ContentFetcher.create();
            expect(fetcher.isGitHubUrl('/path/to/file')).toBe(false);
        });
    });

    describe('fetch - URL handling', () => {
        it('should fetch and return content from a URL', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Map([['content-type', 'text/plain']]),
                text: vi.fn().mockResolvedValue('Test content'),
            } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://example.com/file.txt');

            expect(result.success).toBe(true);
            expect(result.content).toBe('Test content');
            expect(result.sourceType).toBe('url');
            expect(result.sourceName).toBe('example.com');
        });

        it('should strip HTML tags from HTML content', async () => {
            const htmlContent = '<html><body><h1>Title</h1><p>Content here</p></body></html>';
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Map([['content-type', 'text/html']]),
                text: vi.fn().mockResolvedValue(htmlContent),
            } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://example.com/index.html');

            expect(result.success).toBe(true);
            expect(result.content).toContain('Title');
            expect(result.content).toContain('Content here');
            expect(result.content).not.toContain('<html>');
            expect(result.content).not.toContain('</p>');
        });

        it('should truncate content exceeding MAX_CONTENT_LENGTH', async () => {
            const longContent = 'a'.repeat(100000);
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Map([['content-type', 'text/plain']]),
                text: vi.fn().mockResolvedValue(longContent),
            } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://example.com/file.txt');

            expect(result.success).toBe(true);
            expect(result.content).toContain('[Content truncated...]');
            expect((result.content || '').length).toBeLessThan(longContent.length);
        });

        it('should handle HTTP errors', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                headers: new Map(),
            } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://example.com/notfound.txt');

            expect(result.success).toBe(false);
            expect(result.error).toContain('404');
        });

        it('should handle fetch errors', async () => {
            vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://example.com/file.txt');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });
    });

    describe('fetch - GitHub handling', () => {
        it('should fetch README from main branch', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Map([['content-type', 'text/plain']]),
                text: vi.fn().mockResolvedValue('# README'),
            } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://github.com/user/repo');

            expect(result.success).toBe(true);
            expect(result.sourceType).toBe('github');
            expect(result.sourceName).toBe('user/repo');
        });

        it('should try multiple README locations', async () => {
            // First two attempts fail, third succeeds
            vi.mocked(global.fetch)
                .mockResolvedValueOnce({ ok: false } as any)
                .mockResolvedValueOnce({ ok: false } as any)
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: new Map(),
                    text: vi.fn().mockResolvedValue('Content'),
                } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://github.com/user/repo');

            expect(result.success).toBe(true);
            expect(result.content).toBe('Content');
        });

        it('should fall back to regular URL fetch if README not found', async () => {
            // All README attempts fail
            vi.mocked(global.fetch)
                .mockResolvedValueOnce({ ok: false } as any)
                .mockResolvedValueOnce({ ok: false } as any)
                .mockResolvedValueOnce({ ok: false } as any)
                .mockResolvedValueOnce({ ok: false } as any)
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: new Map([['content-type', 'text/html']]),
                    text: vi.fn().mockResolvedValue('<html>GitHub page</html>'),
                } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://github.com/user/repo');

            expect(result.success).toBe(true);
        });

        it('should handle GitHub URLs with .git suffix', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Map(),
                text: vi.fn().mockResolvedValue('README'),
            } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://github.com/user/repo.git');

            expect(result.success).toBe(true);
            expect(result.sourceName).toBe('user/repo');
        });

        it('should fall back to URL fetch for GitHub URL parsing errors', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Map([['content-type', 'text/html']]),
                text: vi.fn().mockResolvedValue('GitHub page content'),
            } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://github.com/invalid');

            // When GitHub URL parsing fails, it falls back to regular URL fetch
            expect(result.success).toBe(true);
        });
    });

    describe('fetch - File handling', () => {
        it('should read markdown files', async () => {
            const filePath = path.join(tempDir, 'test.md');
            await fs.writeFile(filePath, '# Test\n\nContent here');

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch(filePath);

            expect(result.success).toBe(true);
            expect(result.content).toContain('Test');
            expect(result.sourceType).toBe('file');
            expect(result.sourceName).toBe('test.md');
        });

        it('should read text files', async () => {
            const filePath = path.join(tempDir, 'test.txt');
            await fs.writeFile(filePath, 'Plain text content');

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch(filePath);

            expect(result.success).toBe(true);
            expect(result.content).toBe('Plain text content');
        });

        it('should read JSON files', async () => {
            const filePath = path.join(tempDir, 'test.json');
            await fs.writeFile(filePath, '{"key": "value"}');

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch(filePath);

            expect(result.success).toBe(true);
            expect(result.content).toContain('key');
        });

        it('should reject unsupported file types', async () => {
            const filePath = path.join(tempDir, 'test.exe');
            await fs.writeFile(filePath, 'binary content');

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch(filePath);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unsupported file type');
        });

        it('should handle file read errors', async () => {
            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('/nonexistent/file.md');

            expect(result.success).toBe(false);
            expect(result.sourceType).toBe('file');
        });

        it('should truncate large files', async () => {
            const filePath = path.join(tempDir, 'large.md');
            const longContent = 'a'.repeat(100000);
            await fs.writeFile(filePath, longContent);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch(filePath);

            expect(result.success).toBe(true);
            expect(result.content).toContain('[Content truncated...]');
        });
    });

    describe('fetch - Directory handling', () => {
        it('should find README.md in directory', async () => {
            const readmePath = path.join(tempDir, 'README.md');
            await fs.writeFile(readmePath, '# Directory README');

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch(tempDir);

            expect(result.success).toBe(true);
            expect(result.sourceType).toBe('directory');
            expect(result.content).toContain('Directory README');
        });

        it('should prefer README.md over other files', async () => {
            await fs.writeFile(path.join(tempDir, 'README.md'), 'Main README');
            await fs.writeFile(path.join(tempDir, 'package.json'), '{"name": "test"}');

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch(tempDir);

            expect(result.success).toBe(true);
            expect(result.content).toBe('Main README');
        });

        it('should find other priority files', async () => {
            await fs.writeFile(path.join(tempDir, 'readme.md'), 'lowercase readme');

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch(tempDir);

            expect(result.success).toBe(true);
            expect(result.content).toBe('lowercase readme');
        });

        it('should handle empty directories', async () => {
            const emptyDir = path.join(tempDir, 'empty');
            await fs.mkdir(emptyDir);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch(emptyDir);

            expect(result.success).toBe(false);
            expect(result.error).toContain('No readable documentation files found');
        });

        it('should handle directory read errors with file as source type', async () => {
            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('/nonexistent/directory');

            expect(result.success).toBe(false);
            // When directory doesn't exist, it fails as a file path
            expect(['directory', 'file']).toContain(result.sourceType);
        });
    });

    describe('fetch - Path detection', () => {
        it('should fetch from absolute paths', async () => {
            const filePath = path.join(tempDir, 'test.md');
            await fs.writeFile(filePath, 'Content');

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch(filePath);

            expect(result.success).toBe(true);
        });

        it('should fetch from relative paths', async () => {
            const filePath = path.join(tempDir, 'test.md');
            await fs.writeFile(filePath, 'Content');
            
            const originalCwd = process.cwd();
            process.chdir(tempDir);

            try {
                const fetcher = ContentFetcher.create();
                const result = await fetcher.fetch('test.md');

                expect(result.success).toBe(true);
            } finally {
                process.chdir(originalCwd);
            }
        });

        it('should distinguish URLs from paths', async () => {
            const fetcher = ContentFetcher.create();
            
            expect(fetcher.isUrl('https://example.com')).toBe(true);
            expect(fetcher.isUrl('/path/to/file')).toBe(false);
        });
    });

    describe('stripHtml', () => {
        it('should remove script tags', async () => {
            const html = '<html><script>alert("test")</script><body>Content</body></html>';
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Map([['content-type', 'text/html']]),
                text: vi.fn().mockResolvedValue(html),
            } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://example.com');

            expect(result.content).not.toContain('alert');
            expect(result.content).toContain('Content');
        });

        it('should remove style tags', async () => {
            const html = '<html><style>body { color: red; }</style><body>Content</body></html>';
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Map([['content-type', 'text/html']]),
                text: vi.fn().mockResolvedValue(html),
            } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://example.com');

            expect(result.content).not.toContain('color: red');
            expect(result.content).toContain('Content');
        });

        it('should decode HTML entities', async () => {
            const html = '<p>&nbsp;&amp;&lt;&gt;&quot;</p>';
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Map([['content-type', 'text/html']]),
                text: vi.fn().mockResolvedValue(html),
            } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://example.com');

            expect(result.content).toContain('&');
            expect(result.content).toContain('<');
            expect(result.content).toContain('>');
            expect(result.content).toContain('"');
        });

        it('should normalize whitespace', async () => {
            const html = '<p>Content   with   multiple   spaces</p>';
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Map([['content-type', 'text/html']]),
                text: vi.fn().mockResolvedValue(html),
            } as any);

            const fetcher = ContentFetcher.create();
            const result = await fetcher.fetch('https://example.com');

            expect(result.content).toContain('Content with multiple spaces');
        });
    });
});
