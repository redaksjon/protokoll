/**
 * Relationship Tools Tests
 *
 * Tests for handleAddRelationship, handleRemoveRelationship,
 * handleListRelationships, and handleFindRelatedEntities.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    handleAddRelationship,
    handleRemoveRelationship,
    handleListRelationships,
    handleFindRelatedEntities,
    addRelationshipTool,
    removeRelationshipTool,
    listRelationshipsTool,
    findRelatedEntitiesTool,
} from '../../../src/mcp/tools/relationshipTools';
import type { Entity } from '@/context/types';

// vi.hoisted ensures these are available when vi.mock factories run
const { mockSaveEntity, mockFindPersonResilient, mockFindCompanyResilient, mockFindTermResilient, mockFindProjectResilient } = vi.hoisted(() => ({
    mockSaveEntity: vi.fn().mockResolvedValue(undefined),
    mockFindPersonResilient: vi.fn(),
    mockFindCompanyResilient: vi.fn(),
    mockFindTermResilient: vi.fn(),
    mockFindProjectResilient: vi.fn(),
}));

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

// Use real createRelationship and parseEntityUri from @redaksjon/context (no mock)

describe('relationshipTools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSaveEntity.mockResolvedValue(undefined);
    });

    describe('tool definitions', () => {
        it('addRelationshipTool has correct schema', () => {
            expect(addRelationshipTool.name).toBe('protokoll_add_relationship');
            expect(addRelationshipTool.inputSchema.required).toContain('entityType');
            expect(addRelationshipTool.inputSchema.required).toContain('entityId');
            expect(addRelationshipTool.inputSchema.required).toContain('targetType');
            expect(addRelationshipTool.inputSchema.required).toContain('targetId');
            expect(addRelationshipTool.inputSchema.required).toContain('relationship');
        });

        it('removeRelationshipTool has correct schema', () => {
            expect(removeRelationshipTool.name).toBe('protokoll_remove_relationship');
            expect(removeRelationshipTool.inputSchema.required).toContain('targetUri');
        });

        it('listRelationshipsTool has correct schema', () => {
            expect(listRelationshipsTool.name).toBe('protokoll_list_relationships');
        });

        it('findRelatedEntitiesTool has correct schema', () => {
            expect(findRelatedEntitiesTool.name).toBe('protokoll_find_related_entities');
        });
    });

    describe('handleAddRelationship', () => {
        const basePerson: Entity = { id: 'alice', name: 'Alice', type: 'person' };
        const baseCompany: Entity = { id: 'acme', name: 'Acme Corp', type: 'company' };

        beforeEach(() => {
            mockFindPersonResilient.mockImplementation((_ctx: unknown, id: string) => {
                if (id === 'alice') return { ...basePerson, id: 'alice', name: 'Alice' };
                throw new Error(`Person not found: "${id}"`);
            });
            mockFindCompanyResilient.mockImplementation((_ctx: unknown, id: string) => {
                if (id === 'acme') return { ...baseCompany, id: 'acme', name: 'Acme Corp' };
                throw new Error(`Company not found: "${id}"`);
            });
            mockFindTermResilient.mockReturnValue(undefined);
            mockFindProjectResilient.mockReturnValue(undefined);
        });

        it('adds relationship between person and company (works_at)', async () => {
            const result = await handleAddRelationship({
                entityType: 'person',
                entityId: 'alice',
                targetType: 'company',
                targetId: 'acme',
                relationship: 'works_at',
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('works_at');
            expect(result.message).toContain('person/alice');
            expect(result.message).toContain('company/acme');
            expect(result.relationship.uri).toBe('redaksjon://company/acme');
            expect(result.relationship.relationship).toBe('works_at');

            expect(mockSaveEntity).toHaveBeenCalledTimes(1);
            const savedEntity = mockSaveEntity.mock.calls[0][0];
            expect(savedEntity.relationships).toHaveLength(1);
            expect(savedEntity.relationships[0].relationship).toBe('works_at');
        });

        it('adds relationship with notes and metadata', async () => {
            const result = await handleAddRelationship({
                entityType: 'person',
                entityId: 'alice',
                targetType: 'company',
                targetId: 'acme',
                relationship: 'manages',
                notes: 'Team lead since 2022',
                metadata: { department: 'Engineering' },
            });

            expect(result.success).toBe(true);
            expect(result.relationship.notes).toBe('Team lead since 2022');
            expect(result.relationship.metadata).toEqual({ department: 'Engineering' });
        });

        it('appends to existing relationships', async () => {
            mockFindPersonResilient.mockReturnValueOnce({
                ...basePerson,
                relationships: [
                    { uri: 'redaksjon://company/other', relationship: 'used_in', notes: undefined, metadata: undefined },
                ],
            });

            const result = await handleAddRelationship({
                entityType: 'person',
                entityId: 'alice',
                targetType: 'company',
                targetId: 'acme',
                relationship: 'works_at',
            });

            expect(result.success).toBe(true);
            const savedEntity = mockSaveEntity.mock.calls[0][0];
            expect(savedEntity.relationships).toHaveLength(2);
        });

        it('throws when source entity not found', async () => {
            mockFindPersonResilient.mockImplementation(() => {
                throw new Error('Person not found: "nobody"');
            });

            await expect(
                handleAddRelationship({
                    entityType: 'person',
                    entityId: 'nobody',
                    targetType: 'company',
                    targetId: 'acme',
                    relationship: 'works_at',
                })
            ).rejects.toThrow(/Entity not found|Person not found/);
            expect(mockSaveEntity).not.toHaveBeenCalled();
        });

        it('throws when target entity not found', async () => {
            mockFindCompanyResilient.mockImplementation(() => {
                throw new Error('Company not found: "ghost"');
            });

            await expect(
                handleAddRelationship({
                    entityType: 'person',
                    entityId: 'alice',
                    targetType: 'company',
                    targetId: 'ghost',
                    relationship: 'works_at',
                })
            ).rejects.toThrow(/Target entity not found|Company not found/);
            expect(mockSaveEntity).not.toHaveBeenCalled();
        });

        it('throws when entity type is invalid (getEntityByType returns undefined)', async () => {
            await expect(
                handleAddRelationship({
                    entityType: 'invalid',
                    entityId: 'x',
                    targetType: 'company',
                    targetId: 'acme',
                    relationship: 'works_at',
                } as Parameters<typeof handleAddRelationship>[0])
            ).rejects.toThrow('Entity not found: invalid/x');
            expect(mockSaveEntity).not.toHaveBeenCalled();
        });

        it('uses contextDirectory when provided', async () => {
            const Context = await import('@/context');
            await handleAddRelationship({
                entityType: 'person',
                entityId: 'alice',
                targetType: 'company',
                targetId: 'acme',
                relationship: 'works_at',
                contextDirectory: '/custom/path',
            });
            expect(Context.create).toHaveBeenCalledWith({ startingDir: '/custom/path' });
        });

        it('tests different relationship types: used_in, part_of, expert_in', async () => {
            mockFindTermResilient.mockImplementation((_ctx: unknown, id: string) => {
                if (id === 'kubernetes') return { id: 'kubernetes', name: 'Kubernetes', type: 'term' };
                if (id === 'api') return { id: 'api', name: 'API', type: 'term', relationships: [] };
                throw new Error(`Term not found: "${id}"`);
            });
            mockFindProjectResilient.mockImplementation((_ctx: unknown, id: string) => {
                if (id === 'protokoll') return { id: 'protokoll', name: 'Protokoll', type: 'project' };
                throw new Error(`Project not found: "${id}"`);
            });
            mockFindPersonResilient.mockImplementation((_ctx: unknown, id: string) => {
                if (id === 'bob') return { id: 'bob', name: 'Bob', type: 'person', relationships: [] };
                throw new Error(`Person not found: "${id}"`);
            });

            const rel1 = await handleAddRelationship({
                entityType: 'term',
                entityId: 'kubernetes',
                targetType: 'project',
                targetId: 'protokoll',
                relationship: 'used_in',
            });
            expect(rel1.relationship.relationship).toBe('used_in');

            const rel2 = await handleAddRelationship({
                entityType: 'term',
                entityId: 'api',
                targetType: 'term',
                targetId: 'kubernetes',
                relationship: 'part_of',
            });
            expect(rel2.relationship.relationship).toBe('part_of');

            const rel3 = await handleAddRelationship({
                entityType: 'person',
                entityId: 'bob',
                targetType: 'term',
                targetId: 'kubernetes',
                relationship: 'expert_in',
            });
            expect(rel3.relationship.relationship).toBe('expert_in');
        });
    });

    describe('handleRemoveRelationship', () => {
        const personWithRels: Entity & { relationships?: Array<{ uri: string; relationship: string; notes?: string; metadata?: Record<string, unknown> }> } = {
            id: 'alice',
            name: 'Alice',
            type: 'person',
            relationships: [
                { uri: 'redaksjon://company/acme', relationship: 'works_at', notes: undefined, metadata: undefined },
                { uri: 'redaksjon://project/protokoll', relationship: 'contributes_to', notes: undefined, metadata: undefined },
            ],
        };

        beforeEach(() => {
            mockFindPersonResilient.mockReturnValue(personWithRels);
        });

        it('removes relationship by targetUri and relationship type', async () => {
            const result = await handleRemoveRelationship({
                entityType: 'person',
                entityId: 'alice',
                targetUri: 'redaksjon://company/acme',
                relationship: 'works_at',
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('Removed');
            expect(result.message).toContain('works_at');
            expect(mockSaveEntity).toHaveBeenCalledTimes(1);
            const saved = mockSaveEntity.mock.calls[0][0];
            expect(saved.relationships).toHaveLength(1);
            expect(saved.relationships[0].uri).toBe('redaksjon://project/protokoll');
        });

        it('throws when entity not found', async () => {
            mockFindPersonResilient.mockImplementation(() => {
                throw new Error('Person not found: "nobody"');
            });

            await expect(
                handleRemoveRelationship({
                    entityType: 'person',
                    entityId: 'nobody',
                    targetUri: 'redaksjon://company/acme',
                    relationship: 'works_at',
                })
            ).rejects.toThrow(/Entity not found|Person not found/);
        });

        it('throws when relationship not found', async () => {
            await expect(
                handleRemoveRelationship({
                    entityType: 'person',
                    entityId: 'alice',
                    targetUri: 'redaksjon://company/nonexistent',
                    relationship: 'works_at',
                })
            ).rejects.toThrow('Relationship not found: works_at to redaksjon://company/nonexistent');
            expect(mockSaveEntity).not.toHaveBeenCalled();
        });

        it('throws when relationship type does not match', async () => {
            await expect(
                handleRemoveRelationship({
                    entityType: 'person',
                    entityId: 'alice',
                    targetUri: 'redaksjon://company/acme',
                    relationship: 'manages', // wrong type - entity has works_at
                })
            ).rejects.toThrow('Relationship not found');
        });

        it('handles entity with no relationships', async () => {
            mockFindPersonResilient.mockReturnValue({ id: 'empty', name: 'Empty', type: 'person' });

            await expect(
                handleRemoveRelationship({
                    entityType: 'person',
                    entityId: 'empty',
                    targetUri: 'redaksjon://company/acme',
                    relationship: 'works_at',
                })
            ).rejects.toThrow('Relationship not found');
        });

        it('throws when entity type is invalid', async () => {
            await expect(
                handleRemoveRelationship({
                    entityType: 'invalid',
                    entityId: 'x',
                    targetUri: 'redaksjon://company/acme',
                    relationship: 'works_at',
                } as Parameters<typeof handleRemoveRelationship>[0])
            ).rejects.toThrow('Entity not found: invalid/x');
        });
    });

    describe('handleListRelationships', () => {
        const personWithRels = {
            id: 'alice',
            name: 'Alice',
            type: 'person',
            relationships: [
                { uri: 'redaksjon://company/acme', relationship: 'works_at', notes: 'Engineer', metadata: undefined },
                { uri: 'redaksjon://project/protokoll', relationship: 'contributes_to', notes: undefined, metadata: undefined },
                { uri: 'redaksjon://company/acme', relationship: 'manages', notes: undefined, metadata: undefined },
            ],
        };

        beforeEach(() => {
            mockFindPersonResilient.mockReturnValue(personWithRels);
        });

        it('returns all relationships when no filter', async () => {
            const result = await handleListRelationships({
                entityType: 'person',
                entityId: 'alice',
            });

            expect(result.entityId).toBe('alice');
            expect(result.entityType).toBe('person');
            expect(result.relationships).toHaveLength(3);
        });

        it('filters by relationshipType', async () => {
            const result = await handleListRelationships({
                entityType: 'person',
                entityId: 'alice',
                relationshipType: 'works_at',
            });

            expect(result.relationships).toHaveLength(1);
            expect(result.relationships[0].relationship).toBe('works_at');
        });

        it('returns empty array when entity has no relationships', async () => {
            mockFindPersonResilient.mockReturnValue({ id: 'bob', name: 'Bob', type: 'person' });

            const result = await handleListRelationships({
                entityType: 'person',
                entityId: 'bob',
            });

            expect(result.relationships).toEqual([]);
        });

        it('throws when entity not found', async () => {
            mockFindPersonResilient.mockImplementation(() => {
                throw new Error('Person not found: "nobody"');
            });

            await expect(
                handleListRelationships({
                    entityType: 'person',
                    entityId: 'nobody',
                })
            ).rejects.toThrow(/Entity not found|Person not found/);
        });

        it('returns empty when filter matches nothing', async () => {
            const result = await handleListRelationships({
                entityType: 'person',
                entityId: 'alice',
                relationshipType: 'nonexistent_type',
            });

            expect(result.relationships).toHaveLength(0);
        });

        it('throws when entity type is invalid', async () => {
            await expect(
                handleListRelationships({
                    entityType: 'invalid',
                    entityId: 'x',
                } as Parameters<typeof handleListRelationships>[0])
            ).rejects.toThrow('Entity not found: invalid/x');
        });
    });

    describe('handleFindRelatedEntities', () => {
        const personWithRels = {
            id: 'alice',
            name: 'Alice',
            type: 'person',
            relationships: [
                { uri: 'redaksjon://company/acme', relationship: 'works_at', notes: undefined, metadata: undefined },
                { uri: 'redaksjon://project/protokoll', relationship: 'contributes_to', notes: undefined, metadata: undefined },
            ],
        };

        beforeEach(() => {
            mockFindPersonResilient.mockImplementation((_ctx: unknown, id: string) => {
                if (id === 'alice') return personWithRels;
                throw new Error(`Person not found: "${id}"`);
            });
            mockFindCompanyResilient.mockImplementation((_ctx: unknown, id: string) => {
                if (id === 'acme') return { id: 'acme', name: 'Acme Corp', type: 'company' };
                throw new Error(`Company not found: "${id}"`);
            });
            mockFindProjectResilient.mockImplementation((_ctx: unknown, id: string) => {
                if (id === 'protokoll') return { id: 'protokoll', name: 'Protokoll', type: 'project' };
                throw new Error(`Project not found: "${id}"`);
            });
        });

        it('returns related entities with names', async () => {
            const result = await handleFindRelatedEntities({
                entityType: 'person',
                entityId: 'alice',
            });

            expect(result.entityId).toBe('alice');
            expect(result.entityType).toBe('person');
            expect(result.relatedEntities).toHaveLength(2);
            expect(result.relatedEntities.map((e) => e.targetName)).toContain('Acme Corp');
            expect(result.relatedEntities.map((e) => e.targetName)).toContain('Protokoll');
        });

        it('filters by relationshipType', async () => {
            const result = await handleFindRelatedEntities({
                entityType: 'person',
                entityId: 'alice',
                relationshipType: 'works_at',
            });

            expect(result.relatedEntities).toHaveLength(1);
            expect(result.relatedEntities[0].relationship).toBe('works_at');
            expect(result.relatedEntities[0].targetName).toBe('Acme Corp');
        });

        it('filters by targetType', async () => {
            const result = await handleFindRelatedEntities({
                entityType: 'person',
                entityId: 'alice',
                targetType: 'company',
            });

            expect(result.relatedEntities).toHaveLength(1);
            expect(result.relatedEntities[0].targetType).toBe('company');
            expect(result.relatedEntities[0].targetId).toBe('acme');
        });

        it('returns all related entities when multiple targets exist', async () => {
            mockFindCompanyResilient.mockReturnValue({ id: 'acme', name: 'Acme Corp', type: 'company' });
            mockFindProjectResilient.mockReturnValue({ id: 'protokoll', name: 'Protokoll', type: 'project' });

            const result = await handleFindRelatedEntities({
                entityType: 'person',
                entityId: 'alice',
            });

            expect(result.relatedEntities).toHaveLength(2);
            expect(result.relatedEntities.map((e) => e.targetId).sort()).toEqual(['acme', 'protokoll']);
        });

        it('excludes relationships with invalid URIs', async () => {
            const personWithBadUri = {
                ...personWithRels,
                relationships: [
                    { uri: 'invalid-uri', relationship: 'bad', notes: undefined, metadata: undefined },
                    { uri: 'redaksjon://company/acme', relationship: 'works_at', notes: undefined, metadata: undefined },
                ],
            };
            mockFindPersonResilient.mockReturnValue(personWithBadUri);

            const result = await handleFindRelatedEntities({
                entityType: 'person',
                entityId: 'alice',
            });

            // invalid-uri parses to null, so only acme remains
            expect(result.relatedEntities).toHaveLength(1);
            expect(result.relatedEntities[0].targetId).toBe('acme');
        });

        it('throws when entity not found', async () => {
            mockFindPersonResilient.mockImplementation(() => {
                throw new Error('Person not found: "nobody"');
            });

            await expect(
                handleFindRelatedEntities({
                    entityType: 'person',
                    entityId: 'nobody',
                })
            ).rejects.toThrow(/Entity not found|Person not found/);
        });

        it('includes notes when present', async () => {
            const personWithNotes = {
                ...personWithRels,
                relationships: [
                    { uri: 'redaksjon://company/acme', relationship: 'works_at', notes: 'Senior since 2020', metadata: undefined },
                ],
            };
            mockFindPersonResilient.mockReturnValue(personWithNotes);

            const result = await handleFindRelatedEntities({
                entityType: 'person',
                entityId: 'alice',
            });

            expect(result.relatedEntities[0].notes).toBe('Senior since 2020');
        });

        it('throws when entity type is invalid', async () => {
            await expect(
                handleFindRelatedEntities({
                    entityType: 'invalid',
                    entityId: 'x',
                } as Parameters<typeof handleFindRelatedEntities>[0])
            ).rejects.toThrow('Entity not found: invalid/x');
        });
    });
});
