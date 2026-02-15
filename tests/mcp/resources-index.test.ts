/**
 * Tests for MCP Resources Index
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all resource modules
vi.mock('../../src/mcp/resources/definitions', () => ({
    directResources: [
        { uri: 'test://direct', name: 'Direct Resource', mimeType: 'text/plain' }
    ],
    resourceTemplates: [
        { uriTemplate: 'test://{id}', name: 'Template Resource', mimeType: 'text/plain' }
    ],
}));

vi.mock('../../src/mcp/resources/discovery', () => ({
    getDynamicResources: vi.fn().mockResolvedValue([
        { uri: 'test://dynamic', name: 'Dynamic Resource', mimeType: 'text/plain' }
    ]),
}));

vi.mock('../../src/mcp/resources/transcriptResources', () => ({
    readTranscriptResource: vi.fn().mockResolvedValue({
        uri: 'protokoll://transcript/test.pkl',
        mimeType: 'text/markdown',
        text: 'Test transcript',
    }),
    readTranscriptsListResource: vi.fn().mockResolvedValue({
        uri: 'protokoll://transcripts',
        mimeType: 'application/json',
        text: JSON.stringify({ transcripts: [] }),
    }),
}));

vi.mock('../../src/mcp/resources/entityResources', () => ({
    readEntityResource: vi.fn().mockResolvedValue({
        uri: 'protokoll://entity/person/test',
        mimeType: 'application/x-yaml',
        text: 'id: test\nname: Test Person',
    }),
    readEntitiesListResource: vi.fn().mockResolvedValue({
        uri: 'protokoll://entities/person',
        mimeType: 'application/json',
        text: JSON.stringify({ entities: [] }),
    }),
}));

vi.mock('../../src/mcp/resources/audioResources', () => ({
    readAudioInboundResource: vi.fn().mockResolvedValue({
        uri: 'protokoll://audio-inbound',
        mimeType: 'application/json',
        text: JSON.stringify({ files: [] }),
    }),
    readAudioProcessedResource: vi.fn().mockResolvedValue({
        uri: 'protokoll://audio-processed',
        mimeType: 'application/json',
        text: JSON.stringify({ files: [] }),
    }),
}));

vi.mock('../../src/mcp/resources/configResource', () => ({
    readConfigResource: vi.fn().mockResolvedValue({
        uri: 'protokoll://config',
        mimeType: 'application/json',
        text: JSON.stringify({ config: {} }),
    }),
}));

vi.mock('../../src/mcp/uri', () => ({
    parseUri: vi.fn((uri: string) => {
        if (uri.includes('transcript/')) {
            return { resourceType: 'transcript', transcriptPath: 'test.pkl' };
        }
        if (uri.includes('entity/person/')) {
            return { resourceType: 'entity', entityType: 'person', entityId: 'test' };
        }
        if (uri.includes('config')) {
            return { resourceType: 'config', configPath: '/test/config' };
        }
        if (uri.includes('transcripts')) {
            return { resourceType: 'transcripts-list', directory: '/test' };
        }
        if (uri.includes('entities')) {
            return { resourceType: 'entities-list', entityType: 'person' };
        }
        if (uri.includes('audio-inbound')) {
            return { resourceType: 'audio-inbound', directory: '/test/input' };
        }
        if (uri.includes('audio-processed')) {
            return { resourceType: 'audio-processed', directory: '/test/processed' };
        }
        return { resourceType: 'unknown' };
    }),
}));

import { handleListResources, handleReadResource } from '../../src/mcp/resources/index';

describe('resources index', () => {
    describe('handleListResources', () => {
        it('should list all resources', async () => {
            const result = await handleListResources();
            
            expect(result).toBeDefined();
            expect(result.resources).toBeDefined();
            expect(Array.isArray(result.resources)).toBe(true);
        });

        it('should include direct resources', async () => {
            const result = await handleListResources();
            
            const directResource = result.resources.find(r => r.uri === 'test://direct');
            expect(directResource).toBeDefined();
        });

        it('should include dynamic resources', async () => {
            const result = await handleListResources();
            
            const dynamicResource = result.resources.find(r => r.uri === 'test://dynamic');
            expect(dynamicResource).toBeDefined();
        });

        it('should include resource templates', async () => {
            const result = await handleListResources();
            
            expect(result.resourceTemplates).toBeDefined();
            expect(Array.isArray(result.resourceTemplates)).toBe(true);
        });

        it('should handle context directory parameter', async () => {
            const result = await handleListResources('/test/context');
            
            expect(result).toBeDefined();
        });
    });

    describe('handleReadResource', () => {
        it('should read transcript resource', async () => {
            const result = await handleReadResource('protokoll://transcript/test.pkl');
            
            expect(result).toBeDefined();
            expect(result.uri).toContain('transcript');
        });

        it('should read entity resource', async () => {
            const result = await handleReadResource('protokoll://entity/person/test');
            
            expect(result).toBeDefined();
            expect(result.uri).toContain('entity');
        });

        it('should read config resource', async () => {
            const result = await handleReadResource('protokoll://config');
            
            expect(result).toBeDefined();
            expect(result.uri).toContain('config');
        });

        it('should read transcripts list resource', async () => {
            const result = await handleReadResource('protokoll://transcripts');
            
            expect(result).toBeDefined();
            expect(result.uri).toContain('transcripts');
        });

        it('should read entities list resource', async () => {
            const result = await handleReadResource('protokoll://entities/person');
            
            expect(result).toBeDefined();
            expect(result.uri).toContain('entities');
        });

        it('should read audio inbound resource', async () => {
            const result = await handleReadResource('protokoll://audio-inbound');
            
            expect(result).toBeDefined();
            expect(result.uri).toContain('audio-inbound');
        });

        it('should read audio processed resource', async () => {
            const result = await handleReadResource('protokoll://audio-processed');
            
            expect(result).toBeDefined();
            expect(result.uri).toContain('audio-processed');
        });

        it('should throw on unknown resource type', async () => {
            await expect(
                handleReadResource('protokoll://unknown')
            ).rejects.toThrow('Unknown resource type');
        });
    });
});
