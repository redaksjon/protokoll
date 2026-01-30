import { describe, it, expect } from 'vitest';
import {
    parseUri,
    buildTranscriptUri,
    buildEntityUri,
    buildConfigUri,
    buildTranscriptsListUri,
    buildEntitiesListUri,
    buildAudioInboundUri,
    buildAudioProcessedUri,
    isProtokolUri,
    getResourceType,
} from '../../src/mcp/uri';

describe('URI Parser', () => {
    describe('parseUri', () => {
        describe('transcript URIs', () => {
            it('should parse simple transcript URI', () => {
                const result = parseUri('protokoll://transcript/path/to/file.md');
                expect(result.resourceType).toBe('transcript');
                expect(result.transcriptPath).toBe('path/to/file.md');
            });

            it('should parse transcript URI with encoded characters', () => {
                const result = parseUri('protokoll://transcript/path%20with%20spaces/file.md');
                expect(result.transcriptPath).toBe('path with spaces/file.md');
            });

            it('should throw on empty transcript path', () => {
                expect(() => parseUri('protokoll://transcript')).toThrow();
                expect(() => parseUri('protokoll://transcript/')).toThrow();
            });
        });

        describe('entity URIs', () => {
            it('should parse person entity URI', () => {
                const result = parseUri('protokoll://entity/person/john-smith');
                expect(result.resourceType).toBe('entity');
                expect(result.entityType).toBe('person');
                expect(result.entityId).toBe('john-smith');
            });

            it('should parse project entity URI', () => {
                const result = parseUri('protokoll://entity/project/redaksjon');
                expect(result.entityType).toBe('project');
                expect(result.entityId).toBe('redaksjon');
            });

            it('should parse term entity URI', () => {
                const result = parseUri('protokoll://entity/term/kubernetes');
                expect(result.entityType).toBe('term');
            });

            it('should parse company entity URI', () => {
                const result = parseUri('protokoll://entity/company/acme-corp');
                expect(result.entityType).toBe('company');
            });

            it('should throw on invalid entity type', () => {
                expect(() => parseUri('protokoll://entity/invalid/id')).toThrow();
            });

            it('should throw on missing entity ID', () => {
                expect(() => parseUri('protokoll://entity/person')).toThrow();
            });
        });

        describe('config URIs', () => {
            it('should parse config URI with path', () => {
                const result = parseUri('protokoll://config/some/path');
                expect(result.resourceType).toBe('config');
                expect(result.configPath).toBe('some/path');
            });

            it('should parse config URI without path', () => {
                const result = parseUri('protokoll://config');
                expect(result.resourceType).toBe('config');
                expect(result.configPath).toBe('');
            });
        });

        describe('transcripts list URIs', () => {
            it('should parse transcripts list URI with all params', () => {
                const uri = 'protokoll://transcripts?directory=/path/to/dir&startDate=2025-01-01&endDate=2025-12-31&limit=50&offset=10';
                const result = parseUri(uri);
                expect(result.resourceType).toBe('transcripts-list');
                expect(result.directory).toBe('/path/to/dir');
                expect(result.startDate).toBe('2025-01-01');
                expect(result.endDate).toBe('2025-12-31');
                expect(result.limit).toBe(50);
                expect(result.offset).toBe(10);
            });

            it('should parse transcripts list URI with minimal params', () => {
                const result = parseUri('protokoll://transcripts?directory=/path');
                expect(result.directory).toBe('/path');
                expect(result.startDate).toBeUndefined();
            });
        });

        describe('entities list URIs', () => {
            it('should parse entities list URI', () => {
                const result = parseUri('protokoll://entities/person');
                expect(result.resourceType).toBe('entities-list');
                expect(result.entityType).toBe('person');
            });
        });

        describe('audio URIs', () => {
            it('should parse audio inbound URI with directory', () => {
                const result = parseUri('protokoll://audio/inbound?directory=/path/to/recordings');
                expect(result.resourceType).toBe('audio-inbound');
                expect(result.directory).toBe('/path/to/recordings');
            });

            it('should parse audio inbound URI without directory', () => {
                const result = parseUri('protokoll://audio/inbound');
                expect(result.resourceType).toBe('audio-inbound');
                expect(result.directory).toBeUndefined();
            });

            it('should parse audio processed URI with directory', () => {
                const result = parseUri('protokoll://audio/processed?directory=/path/to/processed');
                expect(result.resourceType).toBe('audio-processed');
                expect(result.directory).toBe('/path/to/processed');
            });

            it('should parse audio processed URI without directory', () => {
                const result = parseUri('protokoll://audio/processed');
                expect(result.resourceType).toBe('audio-processed');
                expect(result.directory).toBeUndefined();
            });

            it('should throw on invalid audio type', () => {
                expect(() => parseUri('protokoll://audio/invalid')).toThrow();
            });
        });

        describe('invalid URIs', () => {
            it('should throw on non-protokoll scheme', () => {
                expect(() => parseUri('http://example.com')).toThrow();
                expect(() => parseUri('file:///path')).toThrow();
            });

            it('should throw on empty URI', () => {
                expect(() => parseUri('')).toThrow();
            });

            it('should throw on malformed URI', () => {
                expect(() => parseUri('protokoll://')).toThrow();
            });
        });
    });

    describe('URI Builders', () => {
        describe('buildTranscriptUri', () => {
            it('should build transcript URI', () => {
                expect(buildTranscriptUri('path/to/file.md'))
                    .toBe('protokoll://transcript/path/to/file.md');
            });

            it('should handle spaces in path', () => {
                const uri = buildTranscriptUri('path with spaces/file.md');
                expect(uri).toContain('path%20with%20spaces');
            });
        });

        describe('buildEntityUri', () => {
            it('should build entity URIs', () => {
                expect(buildEntityUri('person', 'john-smith'))
                    .toBe('protokoll://entity/person/john-smith');
                expect(buildEntityUri('project', 'redaksjon'))
                    .toBe('protokoll://entity/project/redaksjon');
            });
        });

        describe('buildConfigUri', () => {
            it('should build config URI with path', () => {
                expect(buildConfigUri('/some/path'))
                    .toBe('protokoll://config/%2Fsome%2Fpath');
            });

            it('should build config URI without path', () => {
                expect(buildConfigUri()).toBe('protokoll://config');
            });
        });

        describe('buildTranscriptsListUri', () => {
            it('should build transcripts list URI', () => {
                const uri = buildTranscriptsListUri({
                    directory: '/path',
                    startDate: '2025-01-01',
                    limit: 50,
                });
                expect(uri).toContain('protokoll://transcripts?');
                expect(uri).toContain('directory=%2Fpath');
                expect(uri).toContain('startDate=2025-01-01');
                expect(uri).toContain('limit=50');
            });
        });

        describe('buildEntitiesListUri', () => {
            it('should build entities list URI', () => {
                expect(buildEntitiesListUri('person'))
                    .toBe('protokoll://entities/person');
            });
        });

        describe('buildAudioInboundUri', () => {
            it('should build audio inbound URI with directory', () => {
                const uri = buildAudioInboundUri('/path/to/recordings');
                expect(uri).toBe('protokoll://audio/inbound?directory=%2Fpath%2Fto%2Frecordings');
            });

            it('should build audio inbound URI without directory', () => {
                expect(buildAudioInboundUri()).toBe('protokoll://audio/inbound');
            });
        });

        describe('buildAudioProcessedUri', () => {
            it('should build audio processed URI with directory', () => {
                const uri = buildAudioProcessedUri('/path/to/processed');
                expect(uri).toBe('protokoll://audio/processed?directory=%2Fpath%2Fto%2Fprocessed');
            });

            it('should build audio processed URI without directory', () => {
                expect(buildAudioProcessedUri()).toBe('protokoll://audio/processed');
            });
        });
    });

    describe('Utility Functions', () => {
        describe('isProtokolUri', () => {
            it('should return true for valid protokoll URIs', () => {
                expect(isProtokolUri('protokoll://transcript/x')).toBe(true);
                expect(isProtokolUri('protokoll://entity/person/x')).toBe(true);
            });

            it('should return false for non-protokoll URIs', () => {
                expect(isProtokolUri('http://example.com')).toBe(false);
                expect(isProtokolUri('file:///path')).toBe(false);
                expect(isProtokolUri('')).toBe(false);
            });
        });

        describe('getResourceType', () => {
            it('should extract resource type', () => {
                expect(getResourceType('protokoll://transcript/x')).toBe('transcript');
                expect(getResourceType('protokoll://entity/person/x')).toBe('entity');
                expect(getResourceType('protokoll://transcripts?dir=x')).toBe('transcripts-list');
                expect(getResourceType('protokoll://entities/person')).toBe('entities-list');
                expect(getResourceType('protokoll://audio/inbound')).toBe('audio-inbound');
                expect(getResourceType('protokoll://audio/processed?dir=x')).toBe('audio-processed');
            });

            it('should return null for non-protokoll URIs', () => {
                expect(getResourceType('http://example.com')).toBeNull();
            });
        });
    });

    describe('Round-trip tests', () => {
        it('should round-trip transcript URIs', () => {
            const original = 'path/to/file.md';
            const uri = buildTranscriptUri(original);
            const parsed = parseUri(uri);
            expect(parsed.transcriptPath).toBe(original);
        });

        it('should round-trip entity URIs', () => {
            const type = 'person';
            const id = 'john-smith';
            const uri = buildEntityUri(type, id);
            const parsed = parseUri(uri);
            expect(parsed.entityType).toBe(type);
            expect(parsed.entityId).toBe(id);
        });
    });
});
