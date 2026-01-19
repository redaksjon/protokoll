/**
 * Tests for MCP Roots Module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Roots from '../../src/mcp/roots';
import type { McpRoot } from '../../src/mcp/types';

describe('MCP Roots', () => {
    let mockRoots: McpRoot[];

    beforeEach(() => {
        mockRoots = [
            {
                uri: 'file:///Users/project/src',
                name: 'Source Code',
            },
            {
                uri: 'file:///Users/project/docs',
                name: 'Documentation',
            },
            {
                uri: 'file:///Users/project',
                name: 'Project Root',
            },
        ];

        // Clear cached roots between tests
        Roots.clearRootsCache();
    });

    describe('clientSupportsRoots', () => {
        it('should return true when client supports roots', () => {
            const capabilities = {
                roots: {
                    listChanged: true,
                },
            };

            const result = Roots.clientSupportsRoots(capabilities);

            expect(result.supported).toBe(true);
            expect(result.listChangedSupported).toBe(true);
        });

        it('should return false when client does not support roots', () => {
            const capabilities = {};

            const result = Roots.clientSupportsRoots(capabilities);

            expect(result.supported).toBe(false);
            expect(result.listChangedSupported).toBe(false);
        });

        it('should return correct listChanged support', () => {
            const capabilities = {
                roots: {
                    listChanged: false,
                },
            };

            const result = Roots.clientSupportsRoots(capabilities);

            expect(result.supported).toBe(true);
            expect(result.listChangedSupported).toBe(false);
        });

        it('should handle undefined capabilities', () => {
            const result = Roots.clientSupportsRoots(undefined);

            expect(result.supported).toBe(false);
            expect(result.listChangedSupported).toBe(false);
        });

        it('should handle null capabilities', () => {
            const result = Roots.clientSupportsRoots(null);

            expect(result.supported).toBe(false);
            expect(result.listChangedSupported).toBe(false);
        });
    });

    describe('initializeRoots', () => {
        it('should initialize roots with client capabilities', () => {
            const capabilities = {
                roots: {
                    listChanged: true,
                },
            };

            Roots.initializeRoots(capabilities);

            // Verify by checking getCachedRoots returns null after init
            expect(Roots.getCachedRoots()).toBeNull();
        });

        it('should clear cached roots on initialization', () => {
            Roots.setRoots(mockRoots);
            expect(Roots.getCachedRoots()).not.toBeNull();

            Roots.initializeRoots({});

            expect(Roots.getCachedRoots()).toBeNull();
        });
    });

    describe('setRoots and getCachedRoots', () => {
        it('should set and retrieve cached roots', () => {
            Roots.setRoots(mockRoots);

            const cached = Roots.getCachedRoots();

            expect(cached).toEqual(mockRoots);
            expect(cached?.length).toBe(3);
        });

        it('should return null when roots not set', () => {
            const cached = Roots.getCachedRoots();

            expect(cached).toBeNull();
        });

        it('should overwrite previous roots', () => {
            Roots.setRoots(mockRoots);
            
            const newRoots: McpRoot[] = [
                { uri: 'file:///new/root', name: 'New Root' },
            ];
            Roots.setRoots(newRoots);

            const cached = Roots.getCachedRoots();

            expect(cached?.length).toBe(1);
            expect(cached?.[0].uri).toBe('file:///new/root');
        });
    });

    describe('clearRootsCache', () => {
        it('should clear cached roots', () => {
            Roots.setRoots(mockRoots);
            expect(Roots.getCachedRoots()).not.toBeNull();

            Roots.clearRootsCache();

            expect(Roots.getCachedRoots()).toBeNull();
        });

        it('should handle clearing when no roots cached', () => {
            expect(() => Roots.clearRootsCache()).not.toThrow();
            expect(Roots.getCachedRoots()).toBeNull();
        });
    });

    describe('fileUriToPath', () => {
        it('should convert file:// URI to path', () => {
            const uri = 'file:///Users/project/src';
            const path = Roots.fileUriToPath(uri);

            expect(path).toBe('/Users/project/src');
        });

        it('should decode URI-encoded characters', () => {
            const uri = 'file:///Users/my%20project/src';
            const path = Roots.fileUriToPath(uri);

            expect(path).toContain('my project');
        });

        it('should return null for non-file URIs', () => {
            const path = Roots.fileUriToPath('https://example.com/path');

            expect(path).toBeNull();
        });

        it('should return null for invalid URIs', () => {
            const path = Roots.fileUriToPath('not a valid uri');

            expect(path).toBeNull();
        });

        it('should handle Windows paths', () => {
            const uri = 'file:///C%3A/Users/project';
            const path = Roots.fileUriToPath(uri);

            expect(path).toBeDefined();
        });
    });

    describe('pathToFileUri', () => {
        it('should convert path to file:// URI', () => {
            const path = '/Users/project/src';
            const uri = Roots.pathToFileUri(path);

            expect(uri).toContain('file://');
            expect(uri).toContain('Users/project/src');
        });

        it('should handle Windows paths', () => {
            const path = 'C:\\Users\\project\\src';
            const uri = Roots.pathToFileUri(path);

            expect(uri).toContain('file://');
        });

        it('should encode special characters', () => {
            const path = '/Users/my project/src';
            const uri = Roots.pathToFileUri(path);

            expect(uri).toContain('my%20project');
        });

        it('should add leading slash if missing', () => {
            const path = 'Users/project/src';
            const uri = Roots.pathToFileUri(path);

            expect(uri).toMatch(/^file:\/\/\/Users/);
        });

        it('should normalize backslashes', () => {
            const path = 'Users\\project\\src';
            const uri = Roots.pathToFileUri(path);

            expect(uri).toContain('Users/project/src');
        });
    });

    describe('isPathWithinRoots', () => {
        it('should return true for path within roots', () => {
            const path = '/Users/project/src/main.ts';
            const within = Roots.isPathWithinRoots(path, mockRoots);

            expect(within).toBe(true);
        });

        it('should return false for path outside roots', () => {
            const path = '/other/directory/file.ts';
            const within = Roots.isPathWithinRoots(path, mockRoots);

            expect(within).toBe(false);
        });

        it('should match longest root path', () => {
            const path = '/Users/project/docs/guide.md';
            const within = Roots.isPathWithinRoots(path, mockRoots);

            expect(within).toBe(true);
        });

        it('should be case sensitive', () => {
            const path = '/USERS/project/src/main.ts';
            const within = Roots.isPathWithinRoots(path, mockRoots);

            expect(within).toBe(false);
        });

        it('should handle empty roots array', () => {
            const path = '/Users/project/src/main.ts';
            const within = Roots.isPathWithinRoots(path, []);

            expect(within).toBe(false);
        });

        it('should ignore invalid root URIs', () => {
            const invalidRoots: McpRoot[] = [
                { uri: 'invalid', name: 'Invalid' },
                { uri: 'file:///Users/project', name: 'Valid' },
            ];
            const path = '/Users/project/src/main.ts';
            const within = Roots.isPathWithinRoots(path, invalidRoots);

            expect(within).toBe(true);
        });
    });

    describe('findRootForPath', () => {
        it('should find the most specific root for a path', () => {
            const path = '/Users/project/src/utils/helper.ts';
            const root = Roots.findRootForPath(path, mockRoots);

            expect(root?.uri).toBe('file:///Users/project/src');
        });

        it('should fall back to parent root when exact root not found', () => {
            const path = '/Users/project/tests/test.ts';
            const root = Roots.findRootForPath(path, mockRoots);

            expect(root?.uri).toBe('file:///Users/project');
        });

        it('should return null when no root matches', () => {
            const path = '/other/directory/file.ts';
            const root = Roots.findRootForPath(path, mockRoots);

            expect(root).toBeNull();
        });

        it('should handle empty roots array', () => {
            const path = '/Users/project/src/main.ts';
            const root = Roots.findRootForPath(path, []);

            expect(root).toBeNull();
        });

        it('should choose longest matching root', () => {
            const roots: McpRoot[] = [
                { uri: 'file:///Users', name: 'Users' },
                { uri: 'file:///Users/project', name: 'Project' },
                { uri: 'file:///Users/project/src', name: 'Src' },
            ];
            const path = '/Users/project/src/main.ts';
            const root = Roots.findRootForPath(path, roots);

            expect(root?.uri).toBe('file:///Users/project/src');
        });
    });

    describe('getRootDisplayNames', () => {
        it('should return root names for display', () => {
            const names = Roots.getRootDisplayNames(mockRoots);

            expect(names).toContain('Source Code');
            expect(names).toContain('Documentation');
            expect(names).toContain('Project Root');
        });

        it('should use URI as fallback when name not provided', () => {
            const roots: McpRoot[] = [
                { uri: 'file:///Users/project', name: '' },
                { uri: 'file:///other', name: undefined },
            ];
            const names = Roots.getRootDisplayNames(roots);

            expect(names[0]).toContain('Users/project');
            // fileUriToPath converts file:// URIs, so we expect the path format
            expect(names[1]).toContain('other');
        });

        it('should return empty array for empty roots', () => {
            const names = Roots.getRootDisplayNames([]);

            expect(names).toEqual([]);
        });

        it('should handle invalid URIs', () => {
            const roots: McpRoot[] = [
                { uri: 'invalid-uri', name: '' },
                { uri: 'file:///valid/uri', name: 'Valid' },
            ];
            const names = Roots.getRootDisplayNames(roots);

            expect(names[0]).toBe('invalid-uri');
            expect(names[1]).toBe('Valid');
        });
    });

    describe('validatePathsAgainstRoots', () => {
        it('should return empty array when all paths are within roots', () => {
            const paths = [
                '/Users/project/src/main.ts',
                '/Users/project/docs/guide.md',
            ];
            const invalid = Roots.validatePathsAgainstRoots(paths, mockRoots);

            expect(invalid).toEqual([]);
        });

        it('should return paths that are not within roots', () => {
            const paths = [
                '/Users/project/src/main.ts',
                '/other/file.ts',
                '/another/invalid/path.ts',
            ];
            const invalid = Roots.validatePathsAgainstRoots(paths, mockRoots);

            expect(invalid).toContain('/other/file.ts');
            expect(invalid).toContain('/another/invalid/path.ts');
            expect(invalid).not.toContain('/Users/project/src/main.ts');
        });

        it('should return all paths when no roots provided', () => {
            const paths = ['/Users/project/src/main.ts'];
            const invalid = Roots.validatePathsAgainstRoots(paths, []);

            expect(invalid).toEqual(paths);
        });

        it('should handle empty paths array', () => {
            const invalid = Roots.validatePathsAgainstRoots([], mockRoots);

            expect(invalid).toEqual([]);
        });

        it('should handle mixed valid and invalid paths', () => {
            const paths = [
                '/Users/project/file.txt',
                '/invalid/path1.txt',
                '/Users/project/src/file.ts',
                '/invalid/path2.txt',
            ];
            const invalid = Roots.validatePathsAgainstRoots(paths, mockRoots);

            expect(invalid.length).toBe(2);
            expect(invalid).toContain('/invalid/path1.txt');
            expect(invalid).toContain('/invalid/path2.txt');
        });
    });

    describe('normalizePath behavior', () => {
        it('should handle trailing slashes consistently', () => {
            const root: McpRoot[] = [
                { uri: 'file:///Users/project', name: 'Project' },
            ];
            
            const result1 = Roots.isPathWithinRoots('/Users/project/src', root);
            const result2 = Roots.isPathWithinRoots('/Users/project/src/', root);

            expect(result1).toBe(result2);
        });

        it('should normalize path separators', () => {
            const root: McpRoot[] = [
                { uri: 'file:///Users/project', name: 'Project' },
            ];
            
            const result = Roots.isPathWithinRoots('/Users\\project\\src', root);

            expect(result).toBe(true);
        });
    });

    describe('integration scenarios', () => {
        it('should handle typical workflow', () => {
            // Initialize
            Roots.initializeRoots({ roots: { listChanged: true } });
            expect(Roots.getCachedRoots()).toBeNull();

            // Set roots from client
            Roots.setRoots(mockRoots);
            expect(Roots.getCachedRoots()).not.toBeNull();

            // Find root for path
            const root = Roots.findRootForPath('/Users/project/src/main.ts', mockRoots);
            expect(root).not.toBeNull();

            // Validate paths
            const invalid = Roots.validatePathsAgainstRoots(
                ['/Users/project/src/main.ts', '/invalid/path.ts'],
                mockRoots
            );
            expect(invalid).toHaveLength(1);

            // Clear cache
            Roots.clearRootsCache();
            expect(Roots.getCachedRoots()).toBeNull();
        });

        it('should handle roots list change notification', () => {
            Roots.setRoots(mockRoots);
            expect(Roots.getCachedRoots()?.length).toBe(3);

            // Simulate roots/list_changed notification
            Roots.clearRootsCache();
            expect(Roots.getCachedRoots()).toBeNull();

            // New roots from client
            const newRoots: McpRoot[] = [
                { uri: 'file:///new/location', name: 'New' },
            ];
            Roots.setRoots(newRoots);
            expect(Roots.getCachedRoots()?.length).toBe(1);
        });
    });
});
