/**
 * Phase 1: URI Parser Tests for Branch Coverage
 * Focus: Testing all conditional branches in URI parsing
 */

import { describe, it, expect } from 'vitest';
import {
    parseUri,
    buildTranscriptUri,
    buildEntityUri,
    buildConfigUri,
    buildTranscriptsListUri,
    buildEntitiesListUri,
    isProtokolUri,
    getResourceType,
} from '../../src/mcp/uri';

describe('src/mcp/uri.ts - Phase 1 Branch Coverage', () => {
    describe('parseUri - Error Cases', () => {
        it('should throw on invalid scheme', () => {
            expect(() => parseUri('http://example.com')).toThrow('Invalid URI scheme');
            expect(() => parseUri('invalid://something')).toThrow('Invalid URI scheme');
        });

        it('should throw on empty resource type', () => {
            expect(() => parseUri('protokoll://')).toThrow('No resource type specified');
            expect(() => parseUri('protokoll:///')).toThrow('No resource type specified');
        });

        it('should throw on unknown resource type', () => {
            expect(() => parseUri('protokoll://unknown/something')).toThrow('Unknown resource type');
            expect(() => parseUri('protokoll://invalid')).toThrow('Unknown resource type');
        });
    });

    describe('parseUri - Transcript URIs', () => {
        it('should parse transcript URI', () => {
            const result = parseUri('protokoll://transcript/path/to/file.md');
            expect(result.resourceType).toBe('transcript');
            expect(result.transcriptPath).toBe('path/to/file.md');
        });

        it('should handle encoded paths in transcript URI', () => {
            const encoded = encodeURIComponent('path with spaces/file.md').replace(/%2F/g, '/');
            const result = parseUri(`protokoll://transcript/${encoded}`);
            expect(result.transcriptPath).toBe('path with spaces/file.md');
        });

        it('should throw on transcript URI without path', () => {
            expect(() => parseUri('protokoll://transcript')).toThrow('No path specified');
        });

        it('should handle query params in transcript URI', () => {
            const result = parseUri('protokoll://transcript/file.md?format=json');
            expect(result.params.format).toBe('json');
        });
    });

    describe('parseUri - Entity URIs', () => {
        it('should parse entity URI for each type', () => {
            const types = ['person', 'project', 'term', 'company', 'ignored'] as const;
            
            for (const type of types) {
                const result = parseUri(`protokoll://entity/${type}/my-id`);
                expect(result.resourceType).toBe('entity');
                expect(result.entityType).toBe(type);
                expect(result.entityId).toBe('my-id');
            }
        });

        it('should throw on invalid entity type', () => {
            expect(() => parseUri('protokoll://entity/invalid/id')).toThrow('Invalid entity type');
        });

        it('should throw on missing entity ID', () => {
            expect(() => parseUri('protokoll://entity/person')).toThrow('Expected protokoll://entity/{type}/{id}');
        });

        it('should handle encoded entity IDs', () => {
            const encoded = encodeURIComponent('id with spaces');
            const result = parseUri(`protokoll://entity/person/${encoded}`);
            expect(result.entityId).toBe('id with spaces');
        });

        it('should handle multi-part entity IDs', () => {
            const result = parseUri('protokoll://entity/project/org/project-name');
            expect(result.entityId).toBe('org/project-name');
        });
    });

    describe('parseUri - Config URIs', () => {
        it('should parse config URI with path', () => {
            const result = parseUri('protokoll://config/system');
            expect(result.resourceType).toBe('config');
            expect(result.configPath).toBe('system');
        });

        it('should parse config URI without path', () => {
            const result = parseUri('protokoll://config');
            expect(result.resourceType).toBe('config');
            expect(result.configPath).toBe('');
        });

        it('should parse config URI with multiple path segments', () => {
            const result = parseUri('protokoll://config/section/subsection');
            expect(result.configPath).toBe('section/subsection');
        });

        it('should handle encoded config paths', () => {
            const encoded = encodeURIComponent('path with/special chars');
            const result = parseUri(`protokoll://config/${encoded}`);
            expect(result.configPath).toBe('path with/special chars');
        });
    });

    describe('parseUri - TranscriptsList URIs', () => {
        it('should parse transcripts-list URI', () => {
            const result = parseUri('protokoll://transcripts?directory=/path');
            expect(result.resourceType).toBe('transcripts-list');
            expect(result.directory).toBe('/path');
        });

        it('should parse transcripts-list with dates', () => {
            const result = parseUri('protokoll://transcripts?directory=/path&startDate=2026-01-01&endDate=2026-01-31');
            expect(result.startDate).toBe('2026-01-01');
            expect(result.endDate).toBe('2026-01-31');
        });

        it('should parse transcripts-list with pagination', () => {
            const result = parseUri('protokoll://transcripts?directory=/path&limit=50&offset=100');
            expect(result.limit).toBe(50);
            expect(result.offset).toBe(100);
        });

        it('should handle transcripts-list with no query params', () => {
            const result = parseUri('protokoll://transcripts-list');
            expect(result.resourceType).toBe('transcripts-list');
            expect(result.directory).toBe('');
        });

        it('should handle invalid pagination params', () => {
            const result = parseUri('protokoll://transcripts?limit=abc');
            expect(result.limit).toBeNaN();
        });
    });

    describe('parseUri - EntitiesList URIs', () => {
        it('should parse entities-list for each type', () => {
            const types = ['person', 'project', 'term', 'company'];
            
            for (const type of types) {
                const result = parseUri(`protokoll://entities/${type}`);
                expect(result.resourceType).toBe('entities-list');
                expect(result.entityType).toBe(type);
            }
        });

        it('should default to project type when missing', () => {
            const result = parseUri('protokoll://entities');
            expect(result.entityType).toBe('project');
        });

        it('should use type param as fallback', () => {
            const result = parseUri('protokoll://entities?type=term');
            expect(result.entityType).toBe('term');
        });

        it('should handle entities-list alternative path', () => {
            const result = parseUri('protokoll://entities-list/person');
            expect(result.resourceType).toBe('entities-list');
            expect(result.entityType).toBe('person');
        });
    });

    describe('parseUri - Query Parameters', () => {
        it('should decode URI-encoded query params', () => {
            const encoded = encodeURIComponent('hello world');
            const result = parseUri(`protokoll://config?key=${encoded}`);
            expect(result.params.key).toBe('hello world');
        });

        it('should skip malformed query params', () => {
            const result = parseUri('protokoll://config?key1&key2=value');
            expect(result.params.key1).toBeUndefined();
            expect(result.params.key2).toBe('value');
        });

        it('should handle empty values', () => {
            const result = parseUri('protokoll://config?key=');
            expect(result.params.key).toBe('');
        });
    });

    describe('URI Builders', () => {
        it('buildTranscriptUri should preserve slashes', () => {
            const uri = buildTranscriptUri('2026/01/file.md');
            expect(uri).toBe('protokoll://transcript/2026/01/file.md');
            expect(parseUri(uri).transcriptPath).toBe('2026/01/file.md');
        });

        it('buildEntityUri should encode properly', () => {
            const uri = buildEntityUri('person', 'my id');
            expect(uri).toContain('entity/person');
            expect(parseUri(uri).entityId).toBe('my id');
        });

        it('buildConfigUri with path', () => {
            const uri = buildConfigUri('system/config');
            expect(uri).toBe('protokoll://config/system%2Fconfig');
        });

        it('buildConfigUri without path', () => {
            const uri = buildConfigUri();
            expect(uri).toBe('protokoll://config');
        });

        it('buildTranscriptsListUri with all params', () => {
            const uri = buildTranscriptsListUri({
                directory: '/my/path',
                startDate: '2026-01-01',
                endDate: '2026-01-31',
                limit: 50,
                offset: 0,
            });
            expect(uri).toContain('transcripts?');
            expect(uri).toContain('directory=%2Fmy%2Fpath');
            expect(uri).toContain('limit=50');
        });

        it('buildEntitiesListUri', () => {
            const uri = buildEntitiesListUri('term');
            expect(uri).toBe('protokoll://entities/term');
        });
    });

    describe('Utility Functions', () => {
        it('isProtokolUri should identify valid URIs', () => {
            expect(isProtokolUri('protokoll://transcript/file')).toBe(true);
            expect(isProtokolUri('http://example.com')).toBe(false);
            expect(isProtokolUri('not a uri')).toBe(false);
        });

        it('getResourceType should extract type quickly', () => {
            expect(getResourceType('protokoll://transcript/file')).toBe('transcript');
            expect(getResourceType('protokoll://entity/person/id')).toBe('entity');
            expect(getResourceType('protokoll://transcripts?dir=/')).toBe('transcripts-list');
            expect(getResourceType('protokoll://entities/term')).toBe('entities-list');
            expect(getResourceType('not-a-uri')).toBeNull();
        });

        it('getResourceType should handle query string properly', () => {
            expect(getResourceType('protokoll://config?key=value')).toBe('config');
        });
    });

    describe('Round-trip Conversion', () => {
        it('transcript round-trip', () => {
            const original = 'path/to/file.md';
            const uri = buildTranscriptUri(original);
            const parsed = parseUri(uri);
            expect(parsed.transcriptPath).toBe(original);
        });

        it('entity round-trip', () => {
            const uri = buildEntityUri('project', 'my-project');
            const parsed = parseUri(uri);
            expect(parsed.entityType).toBe('project');
            expect(parsed.entityId).toBe('my-project');
        });

        it('transcripts list round-trip with params', () => {
            const uri = buildTranscriptsListUri({
                directory: '/output',
                limit: 25,
                offset: 50,
            });
            const parsed = parseUri(uri);
            expect(parsed.directory).toBe('/output');
            expect(parsed.limit).toBe(25);
            expect(parsed.offset).toBe(50);
        });
    });
});
