/**
 * Extended tests for entityTools handlers.
 * Focus on error paths, edge cases, and untested functions.
 * Mocks @/context and @redaksjon/protokoll-engine.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted mocks - must be defined before vi.mock factories
const mockCreate = vi.hoisted(() => vi.fn());
const mockFindPersonResilient = vi.hoisted(() => vi.fn());
const mockFindProjectResilient = vi.hoisted(() => vi.fn());
const mockFindTermResilient = vi.hoisted(() => vi.fn());
const mockFindCompanyResilient = vi.hoisted(() => vi.fn());
const mockFindIgnoredResilient = vi.hoisted(() => vi.fn());

vi.mock('@/context', () => ({
    create: (...args: unknown[]) => mockCreate(...args),
}));

vi.mock('@redaksjon/protokoll-engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@redaksjon/protokoll-engine')>();
    return {
        ...actual,
        findPersonResilient: (...args: unknown[]) => mockFindPersonResilient(...args),
        findTermResilient: (...args: unknown[]) => mockFindTermResilient(...args),
        findCompanyResilient: (...args: unknown[]) => mockFindCompanyResilient(...args),
        findProjectResilient: (...args: unknown[]) => mockFindProjectResilient(...args),
        findIgnoredResilient: (...args: unknown[]) => mockFindIgnoredResilient(...args),
    };
});

import {
    handleAddPerson,
    handleEditPerson,
    handleAddProject,
    handleEditProject,
    handleUpdateProject,
    handleAddTerm,
    handleEditTerm,
    handleUpdateTerm,
    handleMergeTerms,
    handleAddCompany,
    handleDeleteEntity,
} from '../../../src/mcp/tools/entityTools';

describe('entityTools handlers (extended)', () => {
    const mockContext = {
        hasContext: vi.fn(),
        getPerson: vi.fn(),
        getProject: vi.fn(),
        getTerm: vi.fn(),
        getCompany: vi.fn(),
        getIgnored: vi.fn(),
        saveEntity: vi.fn().mockResolvedValue(undefined),
        deleteEntity: vi.fn().mockResolvedValue(true),
        getSmartAssistanceConfig: vi.fn().mockReturnValue({
            enabled: false,
            termsEnabled: false,
        }),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockCreate.mockResolvedValue(mockContext);
        mockContext.hasContext.mockReturnValue(true);
        mockContext.getPerson.mockReturnValue(undefined);
        mockContext.getProject.mockReturnValue(undefined);
        mockContext.getTerm.mockReturnValue(undefined);
        mockContext.getCompany.mockReturnValue(undefined);
        mockContext.getIgnored.mockReturnValue(undefined);
    });

    describe('handleAddPerson', () => {
        it('throws when no .protokoll directory found', async () => {
            mockContext.hasContext.mockReturnValue(false);

            await expect(
                handleAddPerson({ name: 'John Doe' })
            ).rejects.toThrow('No .protokoll directory found. Initialize context first.');
        });

        it('throws when person with ID already exists', async () => {
            const existingId = '61f1f507-1d93-47d4-887e-9c427e79fda6';
            mockContext.getPerson.mockReturnValue({ id: existingId, name: 'John Doe', type: 'person' });

            await expect(
                handleAddPerson({ name: 'John Doe' })
            ).rejects.toThrow('already exists');
        });

        it('adds person successfully with minimal args', async () => {
            const result = await handleAddPerson({ name: 'Jane Smith' });

            expect(result.success).toBe(true);
            expect(result.message).toContain('Jane Smith');
            expect(result.entity).toMatchObject({
                name: 'Jane Smith',
                type: 'person',
            });
            expect(result.entity.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
            expect(mockContext.saveEntity).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Jane Smith',
                    type: 'person',
                    slug: 'jane-smith',
                })
            );
        });

        it('adds person with custom id and optional fields', async () => {
            const customId = '31bc410f-6983-48b8-b7a8-c7f9160267e9';
            const result = await handleAddPerson({
                name: 'Alice',
                id: customId,
                firstName: 'Alice',
                lastName: 'Wonder',
                company: 'acme',
                role: 'Engineer',
                sounds_like: ['alice'],
                context: 'Test context',
                contextDirectory: '/custom/dir',
            });

            expect(result.success).toBe(true);
            expect(mockContext.saveEntity).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: customId,
                    name: 'Alice',
                    firstName: 'Alice',
                    lastName: 'Wonder',
                    company: 'acme',
                    role: 'Engineer',
                    sounds_like: ['alice'],
                    context: 'Test context',
                })
            );
            expect(mockCreate).toHaveBeenCalledWith({ startingDir: '/custom/dir' });
        });
    });

    describe('handleEditPerson', () => {
        const existingPerson = {
            id: 'john',
            name: 'John Doe',
            type: 'person' as const,
            sounds_like: ['jon', 'jhon'],
        };

        it('throws when no .protokoll directory found', async () => {
            mockContext.hasContext.mockReturnValue(false);

            await expect(
                handleEditPerson({ id: 'john' })
            ).rejects.toThrow('No .protokoll directory found. Initialize context first.');
        });

        it('updates person successfully with sounds_like replace', async () => {
            mockFindPersonResilient.mockReturnValue(existingPerson);

            const result = await handleEditPerson({
                id: 'john',
                name: 'John Updated',
                sounds_like: ['jon-updated'],
            });

            expect(result.success).toBe(true);
            expect(result.changes).toContain('name: "John Updated"');
            expect(result.changes).toContain('sounds_like replaced with 1 items');
            expect(mockContext.saveEntity).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'john',
                    name: 'John Updated',
                    sounds_like: ['jon-updated'],
                }),
                true
            );
        });

        it('updates person with add_sounds_like and remove_sounds_like', async () => {
            mockFindPersonResilient.mockReturnValue(existingPerson);

            const result = await handleEditPerson({
                id: 'john',
                add_sounds_like: ['johnny'],
                remove_sounds_like: ['jhon'],
            });

            expect(result.success).toBe(true);
            expect(result.changes).toContain('added 1 sounds_like variants');
            expect(result.changes).toContain('removed 1 sounds_like variants');
        });

        it('deletes sounds_like when replace results in empty array', async () => {
            mockFindPersonResilient.mockReturnValue(existingPerson);

            await handleEditPerson({
                id: 'john',
                sounds_like: [],
            });

            const saveCall = mockContext.saveEntity.mock.calls[0][0];
            // mergeArray returns undefined for empty replace, so sounds_like is deleted
            expect(saveCall.sounds_like).toBeUndefined();
        });
    });

    describe('handleAddProject', () => {
        it('throws when no .protokoll directory found', async () => {
            mockContext.hasContext.mockReturnValue(false);

            await expect(
                handleAddProject({ name: 'My Project' })
            ).rejects.toThrow('No .protokoll directory found. Initialize context first.');
        });

        it('throws when project with ID already exists', async () => {
            const existingId = '3e5e886c-882d-4c31-baac-9e2d5e6cf418';
            mockContext.getProject.mockReturnValue({ id: existingId, name: 'My Project', type: 'project' });

            await expect(
                handleAddProject({ name: 'My Project' })
            ).rejects.toThrow('already exists');
        });

        it('throws when smart assistance enabled (temporarily unavailable)', async () => {
            mockContext.getSmartAssistanceConfig.mockReturnValue({ enabled: true });

            await expect(
                handleAddProject({ name: 'Smart Project' })
            ).rejects.toThrow('Smart assistance temporarily unavailable');
        });

        it('adds project successfully without smart assist', async () => {
            mockContext.getSmartAssistanceConfig.mockReturnValue({ enabled: false });
            const result = await handleAddProject({
                name: 'Test Project',
                destination: '/out',
                structure: 'year',
                contextType: 'work',
                sounds_like: ['test-proj'],
                explicit_phrases: ['test phrase'],
                topics: ['testing'],
                description: 'A test project',
            });

            expect(result.success).toBe(true);
            expect(result.entity).toMatchObject({
                name: 'Test Project',
                type: 'project',
            });
            expect(result.entity.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
            expect(result.smartAssistUsed).toBe(false);
            expect(mockContext.saveEntity).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Test Project',
                    type: 'project',
                    slug: 'test-project',
                    classification: expect.objectContaining({
                        context_type: 'work',
                        explicit_phrases: ['test phrase'],
                        topics: ['testing'],
                    }),
                    routing: expect.objectContaining({
                        destination: '/out',
                        structure: 'year',
                    }),
                    sounds_like: ['test-proj'],
                    description: 'A test project',
                })
            );
        });

        it('adds project with useSmartAssist false skips smart assist', async () => {
            mockContext.getSmartAssistanceConfig.mockReturnValue({ enabled: true });

            const result = await handleAddProject({
                name: 'Manual Project',
                useSmartAssist: false,
            });

            expect(result.success).toBe(true);
            expect(result.smartAssistUsed).toBe(false);
        });
    });

    describe('handleEditProject', () => {
        const existingProject = {
            id: 'proj1',
            name: 'Project One',
            type: 'project' as const,
            classification: {
                context_type: 'work' as const,
                explicit_phrases: ['phrase1'],
                topics: ['topic1'],
                associated_people: ['p1'],
                associated_companies: ['c1'],
            },
            routing: { destination: '/out', structure: 'month' as const, filename_options: ['date', 'time', 'subject'] },
            sounds_like: ['proj-one'],
            active: true,
        };

        it('throws when no .protokoll directory found', async () => {
            mockContext.hasContext.mockReturnValue(false);

            await expect(
                handleEditProject({ id: 'proj1' })
            ).rejects.toThrow('No .protokoll directory found. Initialize context first.');
        });

        it('updates project with array merge operations', async () => {
            mockFindProjectResilient.mockReturnValue(existingProject);

            const result = await handleEditProject({
                id: 'proj1',
                name: 'Project One Updated',
                add_sounds_like: ['proj-1'],
                add_topics: ['new-topic'],
                add_explicit_phrases: ['new phrase'],
                add_associated_people: ['p2'],
                add_associated_companies: ['c2'],
            });

            expect(result.success).toBe(true);
            expect(result.changes).toContain('name: "Project One Updated"');
            expect(result.changes).toContain('added 1 sounds_like variants');
            expect(result.changes).toContain('added 1 topics');
            expect(result.changes).toContain('added 1 explicit phrases');
            expect(result.changes).toContain('added 1 associated people');
            expect(result.changes).toContain('added 1 associated companies');
        });

        it('updates project with relationship operations', async () => {
            mockFindProjectResilient.mockReturnValue({
                ...existingProject,
                relationships: [],
            });

            const result = await handleEditProject({
                id: 'proj1',
                parent: 'parent-proj',
                add_children: ['child1'],
                add_siblings: ['sib1'],
                add_related_terms: ['term1'],
            });

            expect(result.success).toBe(true);
            expect(result.changes).toContain('parent: "parent-proj"');
            expect(result.changes).toContain('added 1 children');
            expect(result.changes).toContain('added 1 siblings');
            expect(result.changes).toContain('added 1 related terms');
        });

        it('updates project with remove operations', async () => {
            mockFindProjectResilient.mockReturnValue(existingProject);

            const result = await handleEditProject({
                id: 'proj1',
                remove_sounds_like: ['proj-one'],
                remove_topics: ['topic1'],
                remove_children: ['child1'],
            });

            expect(result.success).toBe(true);
            expect(result.changes).toContain('removed 1 sounds_like variants');
            expect(result.changes).toContain('removed 1 topics');
        });

        it('deletes associated_people when remove clears all', async () => {
            mockFindProjectResilient.mockReturnValue(existingProject);

            await handleEditProject({
                id: 'proj1',
                remove_associated_people: ['p1'],
            });

            const saveCall = mockContext.saveEntity.mock.calls[0][0];
            expect(saveCall.classification.associated_people).toBeUndefined();
        });

        it('deletes associated_companies when remove clears all', async () => {
            mockFindProjectResilient.mockReturnValue(existingProject);

            await handleEditProject({
                id: 'proj1',
                remove_associated_companies: ['c1'],
            });

            const saveCall = mockContext.saveEntity.mock.calls[0][0];
            expect(saveCall.classification.associated_companies).toBeUndefined();
        });
    });

    describe('handleUpdateProject', () => {
        const existingProject = {
            id: 'proj1',
            name: 'Project One',
            type: 'project' as const,
        };

        it('throws when no .protokoll directory found', async () => {
            mockContext.hasContext.mockReturnValue(false);

            await expect(
                handleUpdateProject({ id: 'proj1', source: 'https://example.com' })
            ).rejects.toThrow('No .protokoll directory found. Initialize context first.');
        });

        it('throws when smart assistance is disabled', async () => {
            mockFindProjectResilient.mockReturnValue(existingProject);
            mockContext.getSmartAssistanceConfig.mockReturnValue({ enabled: false });

            await expect(
                handleUpdateProject({ id: 'proj1', source: 'https://example.com' })
            ).rejects.toThrow('Smart assistance is disabled in configuration.');
        });

        it('throws when smart assistance temporarily unavailable', async () => {
            mockFindProjectResilient.mockReturnValue(existingProject);
            mockContext.getSmartAssistanceConfig.mockReturnValue({ enabled: true });

            await expect(
                handleUpdateProject({ id: 'proj1', source: 'https://example.com' })
            ).rejects.toThrow('Smart assistance temporarily unavailable');
        });
    });

    describe('handleAddTerm', () => {
        it('throws when no .protokoll directory found', async () => {
            mockContext.hasContext.mockReturnValue(false);

            await expect(
                handleAddTerm({ term: 'K8s' })
            ).rejects.toThrow('No .protokoll directory found. Initialize context first.');
        });

        it('throws when term with ID already exists', async () => {
            const existingId = 'b564e7dc-3c82-4db6-af89-a21dce8a67da';
            mockContext.getTerm.mockReturnValue({ id: existingId, name: 'K8s', type: 'term' });

            await expect(
                handleAddTerm({ term: 'K8s' })
            ).rejects.toThrow('already exists');
        });

        it('adds term successfully with all optional fields', async () => {
            const customId = 'f024011c-ec35-400b-8c7a-fbd311d5b98e';
            const result = await handleAddTerm({
                term: 'Kubernetes',
                id: customId,
                expansion: 'K8s',
                domain: 'devops',
                description: 'Container orchestration',
                sounds_like: ['koobernetes'],
                topics: ['containers', 'orchestration'],
                projects: ['proj1'],
                contextDirectory: '/custom/dir',
            });

            expect(result.success).toBe(true);
            expect(mockContext.saveEntity).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: customId,
                    name: 'Kubernetes',
                    type: 'term',
                    expansion: 'K8s',
                    domain: 'devops',
                    description: 'Container orchestration',
                    sounds_like: ['koobernetes'],
                    topics: ['containers', 'orchestration'],
                    projects: ['proj1'],
                })
            );
            expect(mockCreate).toHaveBeenCalledWith({ startingDir: '/custom/dir' });
        });
    });

    describe('handleEditTerm', () => {
        const existingTerm = {
            id: 'k8s',
            name: 'K8s',
            type: 'term' as const,
            sounds_like: ['koobernetes'],
            topics: ['containers'],
            projects: ['proj1'],
        };

        it('throws when no .protokoll directory found', async () => {
            mockContext.hasContext.mockReturnValue(false);

            await expect(
                handleEditTerm({ id: 'k8s' })
            ).rejects.toThrow('No .protokoll directory found. Initialize context first.');
        });

        it('throws when term not found', async () => {
            mockContext.getTerm.mockReturnValue(undefined);

            await expect(
                handleEditTerm({ id: 'nonexistent' })
            ).rejects.toThrow('Term "nonexistent" not found');
        });

        it('updates term with array merge operations', async () => {
            mockContext.getTerm.mockReturnValue(existingTerm);

            const result = await handleEditTerm({
                id: 'k8s',
                expansion: 'Kubernetes',
                domain: 'cloud',
                description: 'Updated description',
                add_sounds_like: ['k8s'],
                add_topics: ['cloud'],
                add_projects: ['proj2'],
            });

            expect(result.success).toBe(true);
            expect(result.changes).toContain('expansion: "Kubernetes"');
            expect(result.changes).toContain('domain: "cloud"');
            expect(result.changes).toContain('description updated');
            expect(result.changes).toContain('added 1 sounds_like variants');
            expect(result.changes).toContain('added 1 topics');
            expect(result.changes).toContain('added 1 project associations');
        });

        it('deletes array fields when replace/remove results in empty', async () => {
            mockContext.getTerm.mockReturnValue(existingTerm);

            await handleEditTerm({
                id: 'k8s',
                sounds_like: [],
                remove_topics: ['containers'],
            });

            const saveCall = mockContext.saveEntity.mock.calls[0][0];
            // mergeArray returns undefined for empty, so fields are deleted
            expect(saveCall.sounds_like).toBeUndefined();
            expect(saveCall.topics).toBeUndefined();
        });

        it('deletes projects when remove clears all', async () => {
            mockContext.getTerm.mockReturnValue(existingTerm);

            await handleEditTerm({
                id: 'k8s',
                remove_projects: ['proj1'],
            });

            const saveCall = mockContext.saveEntity.mock.calls[0][0];
            expect(saveCall.projects).toBeUndefined();
        });
    });

    describe('handleUpdateTerm', () => {
        const existingTerm = {
            id: 'k8s',
            name: 'K8s',
            type: 'term' as const,
        };

        it('throws when no .protokoll directory found', async () => {
            mockContext.hasContext.mockReturnValue(false);

            await expect(
                handleUpdateTerm({ id: 'k8s', source: 'https://example.com' })
            ).rejects.toThrow('No .protokoll directory found. Initialize context first.');
        });

        it('throws when term smart assistance is disabled', async () => {
            mockFindTermResilient.mockReturnValue(existingTerm);
            mockContext.getSmartAssistanceConfig.mockReturnValue({
                enabled: true,
                termsEnabled: false,
            });

            await expect(
                handleUpdateTerm({ id: 'k8s', source: 'https://example.com' })
            ).rejects.toThrow('Term smart assistance is disabled in configuration.');
        });

        it('throws when term assistance temporarily unavailable', async () => {
            mockFindTermResilient.mockReturnValue(existingTerm);
            mockContext.getSmartAssistanceConfig.mockReturnValue({
                enabled: true,
                termsEnabled: true,
            });

            await expect(
                handleUpdateTerm({ id: 'k8s', source: 'https://example.com' })
            ).rejects.toThrow('Term assistance temporarily unavailable');
        });
    });

    describe('handleMergeTerms', () => {
        const sourceTerm = {
            id: 'k8s-alt',
            name: 'K8s Alt',
            type: 'term' as const,
            sounds_like: ['alt-sound'],
            topics: ['alt-topic'],
            projects: ['proj2'],
            description: 'Alt description',
            domain: 'alt-domain',
            expansion: 'Alt expansion',
        };

        const targetTerm = {
            id: 'k8s',
            name: 'K8s',
            type: 'term' as const,
            sounds_like: ['koobernetes'],
            topics: ['containers'],
            projects: ['proj1'],
        };

        it('throws when no .protokoll directory found', async () => {
            mockContext.hasContext.mockReturnValue(false);

            await expect(
                handleMergeTerms({ sourceId: 'k8s-alt', targetId: 'k8s' })
            ).rejects.toThrow('No .protokoll directory found. Initialize context first.');
        });

        it('merges terms successfully and deletes source', async () => {
            mockFindTermResilient
                .mockReturnValueOnce(sourceTerm)
                .mockReturnValueOnce(targetTerm);

            const result = await handleMergeTerms({
                sourceId: 'k8s-alt',
                targetId: 'k8s',
                contextDirectory: '/custom/dir',
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('Merged');
            expect(result.deletedTerm).toBe('k8s-alt');
            expect(mockContext.saveEntity).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'k8s',
                    name: 'K8s',
                    sounds_like: expect.arrayContaining(['koobernetes', 'alt-sound']),
                    topics: expect.arrayContaining(['containers', 'alt-topic']),
                    projects: expect.arrayContaining(['proj1', 'proj2']),
                })
            );
            expect(mockContext.deleteEntity).toHaveBeenCalledWith(sourceTerm);
            expect(mockCreate).toHaveBeenCalledWith({ startingDir: '/custom/dir' });
        });

        it('deduplicates merged arrays', async () => {
            mockFindTermResilient
                .mockReturnValueOnce({
                    ...sourceTerm,
                    sounds_like: ['koobernetes'],
                    topics: ['containers'],
                })
                .mockReturnValueOnce(targetTerm);

            const result = await handleMergeTerms({
                sourceId: 'k8s-alt',
                targetId: 'k8s',
            });

            expect(result.success).toBe(true);
            const saveCall = mockContext.saveEntity.mock.calls[0][0];
            expect(saveCall.sounds_like).toEqual(['koobernetes']);
            expect(saveCall.topics).toEqual(['containers']);
        });

        it('removes empty arrays from merged term', async () => {
            mockFindTermResilient
                .mockReturnValueOnce({
                    id: 'empty',
                    name: 'Empty',
                    type: 'term' as const,
                    sounds_like: [],
                    topics: [],
                    projects: [],
                })
                .mockReturnValueOnce({
                    id: 'target',
                    name: 'Target',
                    type: 'term' as const,
                });

            await handleMergeTerms({ sourceId: 'empty', targetId: 'target' });

            const saveCall = mockContext.saveEntity.mock.calls[0][0];
            expect(saveCall.sounds_like).toBeUndefined();
            expect(saveCall.topics).toBeUndefined();
            expect(saveCall.projects).toBeUndefined();
        });
    });

    describe('handleAddCompany', () => {
        it('throws when no .protokoll directory found', async () => {
            mockContext.hasContext.mockReturnValue(false);

            await expect(
                handleAddCompany({ name: 'Acme Corp' })
            ).rejects.toThrow('No .protokoll directory found. Initialize context first.');
        });

        it('throws when company with ID already exists', async () => {
            const existingId = 'b33ee56b-56dc-47a8-99ec-dd9ebbc6be97';
            mockContext.getCompany.mockReturnValue({ id: existingId, name: 'Acme Corp', type: 'company' });

            await expect(
                handleAddCompany({ name: 'Acme Corp' })
            ).rejects.toThrow('already exists');
        });

        it('adds company successfully with optional fields', async () => {
            const customId = '8c7a4011-ec35-400b-8c7a-fbd311d5b98e';
            const result = await handleAddCompany({
                name: 'Acme',
                id: customId,
                fullName: 'Acme Corporation',
                industry: 'Technology',
                sounds_like: ['akme'],
                contextDirectory: '/custom/dir',
            });

            expect(result.success).toBe(true);
            expect(mockContext.saveEntity).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: customId,
                    name: 'Acme',
                    type: 'company',
                    fullName: 'Acme Corporation',
                    industry: 'Technology',
                    sounds_like: ['akme'],
                })
            );
            expect(mockCreate).toHaveBeenCalledWith({ startingDir: '/custom/dir' });
        });
    });

    describe('handleDeleteEntity', () => {
        it('throws when entity type is unknown', async () => {
            await expect(
                handleDeleteEntity({ entityType: 'invalid', entityId: 'id' })
            ).rejects.toThrow('Unknown entity type: invalid');
        });

        it('throws when delete fails', async () => {
            mockFindPersonResilient.mockReturnValue({ id: 'john', name: 'John', type: 'person' });
            mockContext.deleteEntity.mockResolvedValue(false);

            await expect(
                handleDeleteEntity({ entityType: 'person', entityId: 'john' })
            ).rejects.toThrow('Failed to delete person "john"');
        });

        it('deletes project entity successfully', async () => {
            const project = { id: 'proj1', name: 'Project', type: 'project' as const };
            mockFindProjectResilient.mockReturnValue(project);
            mockContext.deleteEntity.mockResolvedValueOnce(true);

            const result = await handleDeleteEntity({
                entityType: 'project',
                entityId: 'proj1',
                contextDirectory: '/custom/dir',
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('project "proj1" deleted');
            expect(mockContext.deleteEntity).toHaveBeenCalledWith(project);
            expect(mockCreate).toHaveBeenCalledWith({ startingDir: '/custom/dir' });
        });

        it('deletes person entity successfully', async () => {
            const person = { id: 'john', name: 'John', type: 'person' as const };
            mockFindPersonResilient.mockReturnValue(person);
            mockContext.deleteEntity.mockResolvedValueOnce(true);

            const result = await handleDeleteEntity({
                entityType: 'person',
                entityId: 'john',
            });

            expect(result.success).toBe(true);
            expect(mockContext.deleteEntity).toHaveBeenCalledWith(person);
        });

        it('deletes term entity successfully', async () => {
            const term = { id: 'k8s', name: 'K8s', type: 'term' as const };
            mockFindTermResilient.mockReturnValue(term);
            mockContext.deleteEntity.mockResolvedValueOnce(true);

            const result = await handleDeleteEntity({
                entityType: 'term',
                entityId: 'k8s',
            });

            expect(result.success).toBe(true);
            expect(mockContext.deleteEntity).toHaveBeenCalledWith(term);
        });

        it('deletes company entity successfully', async () => {
            const company = { id: 'acme', name: 'Acme', type: 'company' as const };
            mockFindCompanyResilient.mockReturnValue(company);
            mockContext.deleteEntity.mockResolvedValueOnce(true);

            const result = await handleDeleteEntity({
                entityType: 'company',
                entityId: 'acme',
            });

            expect(result.success).toBe(true);
            expect(mockContext.deleteEntity).toHaveBeenCalledWith(company);
        });

        it('deletes ignored entity successfully', async () => {
            const ignored = { id: 'ign1', name: 'Ignored', type: 'ignored' as const, reason: 'test' };
            mockFindIgnoredResilient.mockReturnValue(ignored);
            mockContext.deleteEntity.mockResolvedValueOnce(true);

            const result = await handleDeleteEntity({
                entityType: 'ignored',
                entityId: 'ign1',
            });

            expect(result.success).toBe(true);
            expect(mockContext.deleteEntity).toHaveBeenCalledWith(ignored);
        });
    });
});
