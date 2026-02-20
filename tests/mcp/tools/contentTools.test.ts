/**
 * Content Tools Tests
 *
 * Tests for handleAddContent, handleRemoveContent, handleListContent, handleGetContent.
 * Mocks @/context, @redaksjon/protokoll-engine, and uses @redaksjon/context content creators.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    handleAddContent,
    handleRemoveContent,
    handleListContent,
    handleGetContent,
} from '../../../src/mcp/tools/contentTools';
import type { Entity } from '../../../src/context/types';
import type { EntityContentItem } from '@redaksjon/context';

// Hoisted mocks - must be defined before vi.mock factories
const mockSaveEntity = vi.hoisted(() => vi.fn());
const mockFindPersonResilient = vi.hoisted(() => vi.fn());
const mockFindCompanyResilient = vi.hoisted(() => vi.fn());
const mockFindTermResilient = vi.hoisted(() => vi.fn());
const mockFindProjectResilient = vi.hoisted(() => vi.fn());

vi.mock('@/context', () => ({
    create: vi.fn().mockResolvedValue({
        saveEntity: mockSaveEntity,
    }),
}));

vi.mock('@redaksjon/protokoll-engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@redaksjon/protokoll-engine')>();
    return {
        ...actual,
        findPersonResilient: (...args: unknown[]) => mockFindPersonResilient(...args),
        findCompanyResilient: (...args: unknown[]) => mockFindCompanyResilient(...args),
        findTermResilient: (...args: unknown[]) => mockFindTermResilient(...args),
        findProjectResilient: (...args: unknown[]) => mockFindProjectResilient(...args),
    };
});

// @redaksjon/context - use real implementations (createUrlContent, etc.) - no mock needed

/**
 * Create a minimal entity for testing
 */
function createMockEntity(
    type: string,
    id: string,
    overrides: Partial<Entity> & { content?: EntityContentItem[] } = {}
): Entity & { content?: EntityContentItem[] } {
    return {
        id,
        name: `Test ${type} ${id}`,
        type: type as 'person' | 'company' | 'term' | 'project',
        ...overrides,
    };
}

/**
 * Resolve which find* to use based on entityType
 */
function setupEntityFound(entityType: string, entityId: string, entity: Entity): void {
    mockFindPersonResilient.mockImplementation((_ctx: unknown, id: string) =>
        entityType === 'person' && id === entityId ? entity : undefined
    );
    mockFindCompanyResilient.mockImplementation((_ctx: unknown, id: string) =>
        entityType === 'company' && id === entityId ? entity : undefined
    );
    mockFindTermResilient.mockImplementation((_ctx: unknown, id: string) =>
        entityType === 'term' && id === entityId ? entity : undefined
    );
    mockFindProjectResilient.mockImplementation((_ctx: unknown, id: string) =>
        entityType === 'project' && id === entityId ? entity : undefined
    );
}

/**
 * Setup entity not found for all types
 */
function setupEntityNotFound(): void {
    mockFindPersonResilient.mockReturnValue(undefined);
    mockFindCompanyResilient.mockReturnValue(undefined);
    mockFindTermResilient.mockReturnValue(undefined);
    mockFindProjectResilient.mockReturnValue(undefined);
}

describe('contentTools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSaveEntity.mockResolvedValue(undefined);
    });

    describe('handleAddContent', () => {
        it('should add url content to a person', async () => {
            const entity = createMockEntity('person', 'jane-doe');
            setupEntityFound('person', 'jane-doe', entity);

            const result = await handleAddContent({
                entityType: 'person',
                entityId: 'jane-doe',
                type: 'url',
                content: 'https://example.com',
                title: 'Website',
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('Added url content');
            expect(result.message).toContain('person/jane-doe');
            expect(result.contentItem.type).toBe('url');
            expect(result.contentItem.content).toBe('https://example.com');
            expect(result.contentItem.title).toBe('Website');
            expect(mockSaveEntity).toHaveBeenCalledTimes(1);
            const savedEntity = mockSaveEntity.mock.calls[0][0];
            expect(savedEntity.content).toHaveLength(1);
            expect(savedEntity.content![0].type).toBe('url');
        });

        it('should add text content to a company', async () => {
            const entity = createMockEntity('company', 'acme');
            setupEntityFound('company', 'acme', entity);

            const result = await handleAddContent({
                entityType: 'company',
                entityId: 'acme',
                type: 'text',
                content: 'Acme Corp description',
                title: 'About',
            });

            expect(result.success).toBe(true);
            expect(result.contentItem.type).toBe('text');
            expect(result.contentItem.content).toBe('Acme Corp description');
        });

        it('should add markdown content', async () => {
            const entity = createMockEntity('term', 'kubernetes');
            setupEntityFound('term', 'kubernetes', entity);

            const result = await handleAddContent({
                entityType: 'term',
                entityId: 'kubernetes',
                type: 'markdown',
                content: '# Kubernetes\nOrchestration platform.',
                title: 'Definition',
            });

            expect(result.success).toBe(true);
            expect(result.contentItem.type).toBe('markdown');
            expect(result.contentItem.mimeType).toBe('text/markdown');
        });

        it('should add code content with language', async () => {
            const entity = createMockEntity('project', 'my-project');
            setupEntityFound('project', 'my-project', entity);

            const result = await handleAddContent({
                entityType: 'project',
                entityId: 'my-project',
                type: 'code',
                content: 'fn main() {}',
                title: 'Rust sample',
                metadata: { language: 'rust' },
            });

            expect(result.success).toBe(true);
            expect(result.contentItem.type).toBe('code');
            expect(result.contentItem.metadata).toMatchObject({ language: 'rust' });
        });

        it('should add document content with mimeType', async () => {
            const entity = createMockEntity('person', 'john');
            setupEntityFound('person', 'john', entity);

            const result = await handleAddContent({
                entityType: 'person',
                entityId: 'john',
                type: 'document',
                content: '/path/to/doc.pdf',
                title: 'Resume',
                mimeType: 'application/pdf',
            });

            expect(result.success).toBe(true);
            expect(result.contentItem.type).toBe('document');
            expect(result.contentItem.mimeType).toBe('application/pdf');
        });

        it('should add generic content for unknown type', async () => {
            const entity = createMockEntity('term', 'foo');
            setupEntityFound('term', 'foo', entity);

            const result = await handleAddContent({
                entityType: 'term',
                entityId: 'foo',
                type: 'video',
                content: 'https://video.example.com/x',
                title: 'Demo',
            });

            expect(result.success).toBe(true);
            expect(result.contentItem.type).toBe('video');
            expect(result.contentItem.content).toBe('https://video.example.com/x');
        });

        it('should append to existing content', async () => {
            const existingContent: EntityContentItem[] = [
                { type: 'url', content: 'https://old.com', title: 'Old' },
            ];
            const entity = createMockEntity('person', 'jane', { content: existingContent });
            setupEntityFound('person', 'jane', entity);

            await handleAddContent({
                entityType: 'person',
                entityId: 'jane',
                type: 'text',
                content: 'New text',
                title: 'New',
            });

            const savedEntity = mockSaveEntity.mock.calls[0][0];
            expect(savedEntity.content).toHaveLength(2);
            expect(savedEntity.content![0].title).toBe('Old');
            expect(savedEntity.content![1].title).toBe('New');
        });

        it('should throw when entity not found', async () => {
            setupEntityNotFound();

            await expect(
                handleAddContent({
                    entityType: 'person',
                    entityId: 'nonexistent',
                    type: 'url',
                    content: 'https://x.com',
                })
            ).rejects.toThrow('Entity not found: person/nonexistent');
        });

        it('should throw when entity type is invalid', async () => {
            // Invalid entityType hits getEntityByType default case (returns undefined)
            await expect(
                handleAddContent({
                    entityType: 'invalid_type',
                    entityId: 'some-id',
                    type: 'url',
                    content: 'https://x.com',
                })
            ).rejects.toThrow('Entity not found: invalid_type/some-id');
        });
    });

    describe('handleRemoveContent', () => {
        it('should remove content by title', async () => {
            const content: EntityContentItem[] = [
                { type: 'url', content: 'https://a.com', title: 'Site A' },
                { type: 'url', content: 'https://b.com', title: 'Site B' },
            ];
            const entity = createMockEntity('person', 'jane', { content });
            setupEntityFound('person', 'jane', entity);

            const result = await handleRemoveContent({
                entityType: 'person',
                entityId: 'jane',
                title: 'Site A',
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('Removed content "Site A"');
            const savedEntity = mockSaveEntity.mock.calls[0][0];
            expect(savedEntity.content).toHaveLength(1);
            expect(savedEntity.content![0].title).toBe('Site B');
        });

        it('should remove content by index', async () => {
            const content: EntityContentItem[] = [
                { type: 'text', content: 'First', title: 'First' },
                { type: 'text', content: 'Second', title: 'Second' },
            ];
            const entity = createMockEntity('company', 'acme', { content });
            setupEntityFound('company', 'acme', entity);

            const result = await handleRemoveContent({
                entityType: 'company',
                entityId: 'acme',
                index: 1,
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('Second');
            const savedEntity = mockSaveEntity.mock.calls[0][0];
            expect(savedEntity.content).toHaveLength(1);
            expect(savedEntity.content![0].title).toBe('First');
        });

        it('should throw when neither title nor index provided', async () => {
            const entity = createMockEntity('person', 'jane');
            setupEntityFound('person', 'jane', entity);

            await expect(
                handleRemoveContent({
                    entityType: 'person',
                    entityId: 'jane',
                })
            ).rejects.toThrow('Either title or index must be provided');
        });

        it('should throw when entity not found', async () => {
            setupEntityNotFound();

            await expect(
                handleRemoveContent({
                    entityType: 'person',
                    entityId: 'nonexistent',
                    title: 'Some',
                })
            ).rejects.toThrow('Entity not found: person/nonexistent');
        });

        it('should throw when content not found by title', async () => {
            const entity = createMockEntity('person', 'jane', {
                content: [{ type: 'text', content: 'x', title: 'Existing' }],
            });
            setupEntityFound('person', 'jane', entity);

            await expect(
                handleRemoveContent({
                    entityType: 'person',
                    entityId: 'jane',
                    title: 'NonExistent',
                })
            ).rejects.toThrow('Content item not found with title: NonExistent');
        });

        it('should throw when index is out of range', async () => {
            const entity = createMockEntity('person', 'jane', {
                content: [{ type: 'text', content: 'x', title: 'Only' }],
            });
            setupEntityFound('person', 'jane', entity);

            await expect(
                handleRemoveContent({
                    entityType: 'person',
                    entityId: 'jane',
                    index: 5,
                })
            ).rejects.toThrow('Invalid index: 5');
        });

        it('should throw when index is negative', async () => {
            const entity = createMockEntity('person', 'jane', { content: [] });
            setupEntityFound('person', 'jane', entity);

            await expect(
                handleRemoveContent({
                    entityType: 'person',
                    entityId: 'jane',
                    index: -1,
                })
            ).rejects.toThrow('Invalid index: -1');
        });
    });

    describe('handleListContent', () => {
        it('should list all content for an entity', async () => {
            const content: EntityContentItem[] = [
                { type: 'url', content: 'https://a.com', title: 'A' },
                { type: 'text', content: 'Some text', title: 'B' },
            ];
            const entity = createMockEntity('person', 'jane', { content });
            setupEntityFound('person', 'jane', entity);

            const result = await handleListContent({
                entityType: 'person',
                entityId: 'jane',
            });

            expect(result.entityId).toBe('jane');
            expect(result.entityType).toBe('person');
            expect(result.content).toHaveLength(2);
            expect(result.content[0]).toMatchObject({ index: 0, type: 'url', title: 'A' });
            expect(result.content[1]).toMatchObject({ index: 1, type: 'text', title: 'B' });
        });

        it('should filter by contentType', async () => {
            const content: EntityContentItem[] = [
                { type: 'url', content: 'https://a.com', title: 'A' },
                { type: 'text', content: 'x', title: 'B' },
                { type: 'url', content: 'https://b.com', title: 'C' },
            ];
            const entity = createMockEntity('company', 'acme', { content });
            setupEntityFound('company', 'acme', entity);

            const result = await handleListContent({
                entityType: 'company',
                entityId: 'acme',
                contentType: 'url',
            });

            expect(result.content).toHaveLength(2);
            expect(result.content.every((c) => c.type === 'url')).toBe(true);
        });

        it('should return empty array when entity has no content', async () => {
            const entity = createMockEntity('term', 'foo');
            setupEntityFound('term', 'foo', entity);

            const result = await handleListContent({
                entityType: 'term',
                entityId: 'foo',
            });

            expect(result.content).toEqual([]);
        });

        it('should throw when entity not found', async () => {
            setupEntityNotFound();

            await expect(
                handleListContent({
                    entityType: 'project',
                    entityId: 'nonexistent',
                })
            ).rejects.toThrow('Entity not found: project/nonexistent');
        });
    });

    describe('handleGetContent', () => {
        it('should get content by title', async () => {
            const content: EntityContentItem[] = [
                { type: 'url', content: 'https://a.com', title: 'Site A' },
                { type: 'text', content: 'Description', title: 'About' },
            ];
            const entity = createMockEntity('person', 'jane', { content });
            setupEntityFound('person', 'jane', entity);

            const result = await handleGetContent({
                entityType: 'person',
                entityId: 'jane',
                title: 'About',
            });

            expect(result.entityId).toBe('jane');
            expect(result.entityType).toBe('person');
            expect(result.contentItem).toMatchObject({
                type: 'text',
                content: 'Description',
                title: 'About',
            });
        });

        it('should get content by index', async () => {
            const content: EntityContentItem[] = [
                { type: 'url', content: 'https://x.com', title: 'X' },
            ];
            const entity = createMockEntity('project', 'proj', { content });
            setupEntityFound('project', 'proj', entity);

            const result = await handleGetContent({
                entityType: 'project',
                entityId: 'proj',
                index: 0,
            });

            expect(result.contentItem.title).toBe('X');
            expect(result.contentItem.content).toBe('https://x.com');
        });

        it('should throw when neither title nor index provided', async () => {
            const entity = createMockEntity('person', 'jane');
            setupEntityFound('person', 'jane', entity);

            await expect(
                handleGetContent({
                    entityType: 'person',
                    entityId: 'jane',
                })
            ).rejects.toThrow('Either title or index must be provided');
        });

        it('should throw when entity not found', async () => {
            setupEntityNotFound();

            await expect(
                handleGetContent({
                    entityType: 'person',
                    entityId: 'nonexistent',
                    title: 'X',
                })
            ).rejects.toThrow('Entity not found: person/nonexistent');
        });

        it('should throw when content not found by title', async () => {
            const entity = createMockEntity('person', 'jane', {
                content: [{ type: 'text', content: 'x', title: 'Existing' }],
            });
            setupEntityFound('person', 'jane', entity);

            await expect(
                handleGetContent({
                    entityType: 'person',
                    entityId: 'jane',
                    title: 'NonExistent',
                })
            ).rejects.toThrow('Content item not found with title: NonExistent');
        });

        it('should throw when index is out of range', async () => {
            const entity = createMockEntity('person', 'jane', {
                content: [{ type: 'text', content: 'x', title: 'Only' }],
            });
            setupEntityFound('person', 'jane', entity);

            await expect(
                handleGetContent({
                    entityType: 'person',
                    entityId: 'jane',
                    index: 10,
                })
            ).rejects.toThrow('Invalid index: 10');
        });

        it('should throw when index is negative', async () => {
            const entity = createMockEntity('person', 'jane', { content: [] });
            setupEntityFound('person', 'jane', entity);

            await expect(
                handleGetContent({
                    entityType: 'person',
                    entityId: 'jane',
                    index: -1,
                })
            ).rejects.toThrow('Invalid index: -1');
        });
    });

    describe('entity types', () => {
        it('should work with person entity', async () => {
            const entity = createMockEntity('person', 'alice');
            setupEntityFound('person', 'alice', entity);

            const result = await handleListContent({
                entityType: 'person',
                entityId: 'alice',
            });
            expect(result.entityType).toBe('person');
            expect(result.entityId).toBe('alice');
        });

        it('should work with company entity', async () => {
            const entity = createMockEntity('company', 'acme');
            setupEntityFound('company', 'acme', entity);

            const result = await handleListContent({
                entityType: 'company',
                entityId: 'acme',
            });
            expect(result.entityType).toBe('company');
        });

        it('should work with term entity', async () => {
            const entity = createMockEntity('term', 'k8s');
            setupEntityFound('term', 'k8s', entity);

            const result = await handleListContent({
                entityType: 'term',
                entityId: 'k8s',
            });
            expect(result.entityType).toBe('term');
        });

        it('should work with project entity', async () => {
            const entity = createMockEntity('project', 'proj-x');
            setupEntityFound('project', 'proj-x', entity);

            const result = await handleListContent({
                entityType: 'project',
                entityId: 'proj-x',
            });
            expect(result.entityType).toBe('project');
        });
    });
});
