/**
 * Extended Transcript Tools Tests - PKL Format
 * Tests handleReadTranscript, handleListTranscripts, handleEditTranscript,
 * handleCombineTranscripts, handleUpdateTranscriptContent,
 * handleUpdateTranscriptEntityReferences, handleProvideFeedback, handleCreateNote
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    handleReadTranscript,
    handleListTranscripts,
    handleEditTranscript,
    handleCombineTranscripts,
    handleUpdateTranscriptContent,
    handleUpdateTranscriptEntityReferences,
    handleProvideFeedback,
    handleEnhanceTranscript,
    handleSummarizeTranscript,
    handleDeleteTranscriptSummary,
    handleRejectCorrection,
    handleCorrectToEntity,
    handleCreateNote,
} from '../../src/mcp/tools/transcriptTools';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PklTranscript } from '@redaksjon/protokoll-format';
import * as ContextModule from '../../src/context';
import * as ServerConfigModule from '../../src/mcp/serverConfig';

// Mock serverConfig for validateNotRemoteMode and getContextDirectories
vi.mock('../../src/mcp/serverConfig', () => ({
    getServerConfig: vi.fn().mockReturnValue({ configFile: { contextDirectories: [] } }),
    isInitialized: vi.fn().mockReturnValue(false),
    isRemoteMode: vi.fn().mockReturnValue(false),
    getWorkspaceRoot: vi.fn().mockReturnValue('/test/workspace'),
    getInputDirectory: vi.fn().mockReturnValue('/test/input'),
    getOutputDirectory: vi.fn().mockReturnValue('/test/output'),
    getProcessedDirectory: vi.fn().mockReturnValue('/test/processed'),
    getStorageConfig: vi.fn().mockReturnValue({ backend: 'filesystem' }),
    getOutputStorage: vi.fn().mockReturnValue({ name: 'local' }),
    getContext: vi.fn(),
}));

// Mock the shared module to control getConfiguredDirectory and resolveTranscriptPath
vi.mock('../../src/mcp/tools/shared', async () => {
    const actual = await vi.importActual('../../src/mcp/tools/shared');
    const actualModule = actual as Record<string, unknown>;

    const mockGetConfiguredDirectory = vi.fn();

    return {
        ...actual,
        getConfiguredDirectory: mockGetConfiguredDirectory,
        getContextDirectories: vi.fn().mockResolvedValue([]),
        validatePathWithinOutputDirectory: async (resolvedPath: string, _contextDirectory?: string) => {
            const outputDirectory = await mockGetConfiguredDirectory('outputDirectory', _contextDirectory);
            (actualModule.validatePathWithinDirectory as (a: string, b: string) => void)(
                resolvedPath,
                outputDirectory
            );
        },
        resolveTranscriptPath: async (uriOrPath: string, contextDirectory?: string) => {
            const { resolve, isAbsolute } = await import('node:path');
            const { parseUri, isProtokolUri } = await import('../../src/mcp/uri');
            const { Transcript } = await import('@redaksjon/protokoll-engine');
            const { transcriptExists, ensurePklExtension } = Transcript;

            if (!uriOrPath || typeof uriOrPath !== 'string') {
                throw new Error('transcriptPath is required and must be a non-empty string');
            }

            const outputDirectory = await mockGetConfiguredDirectory('outputDirectory', contextDirectory);

            let relativePath: string;

            if (isProtokolUri(uriOrPath)) {
                const parsed = parseUri(uriOrPath);
                if (parsed.resourceType !== 'transcript') {
                    throw new Error(`Invalid URI: expected transcript URI, got ${parsed.resourceType}`);
                }
                relativePath = (parsed as { transcriptPath: string }).transcriptPath;
            } else {
                if (isAbsolute(uriOrPath)) {
                    const normalizedAbsolute = resolve(uriOrPath);
                    const normalizedOutputDir = resolve(outputDirectory);

                    if (
                        normalizedAbsolute.startsWith(normalizedOutputDir + '/') ||
                        normalizedAbsolute === normalizedOutputDir
                    ) {
                        relativePath = normalizedAbsolute.substring(normalizedOutputDir.length + 1);
                    } else {
                        throw new Error(`Path must be within output directory: ${outputDirectory}`);
                    }
                } else {
                    relativePath = uriOrPath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
                }
            }

            relativePath = relativePath.replace(/\.pkl$/i, '');

            const resolvedPath = resolve(outputDirectory, relativePath);
            (actualModule.validatePathWithinDirectory as (a: string, b: string) => void)(
                resolvedPath,
                outputDirectory
            );

            const pklPath = ensurePklExtension(resolvedPath);
            const existsResult = await transcriptExists(pklPath);
            if (!existsResult.exists || !existsResult.path) {
                throw new Error(`Transcript not found: ${uriOrPath}`);
            }

            return existsResult.path;
        },
    };
});

import { getConfiguredDirectory } from '../../src/mcp/tools/shared';

// Mock Transcript.processFeedback for handleProvideFeedback (avoids LLM calls)
const mockProcessFeedback = vi.hoisted(() => vi.fn());
const mockReasoningCreate = vi.hoisted(() => vi.fn());
const mockRoutingCreate = vi.hoisted(() => vi.fn());
const mockSimpleReplacePhaseCreate = vi.hoisted(() => vi.fn());
const mockAgenticCreate = vi.hoisted(() => vi.fn());
vi.mock('@redaksjon/protokoll-engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@redaksjon/protokoll-engine')>();
    mockReasoningCreate.mockImplementation((...args) => (actual.Reasoning.create as any)(...args));
    mockRoutingCreate.mockImplementation((...args) => (actual.Routing.create as any)(...args));
    mockSimpleReplacePhaseCreate.mockImplementation((...args) => (actual.Phases.createSimpleReplacePhase as any)(...args));
    mockAgenticCreate.mockImplementation((...args) => (actual.Agentic.create as any)(...args));
    return {
        ...actual,
        Reasoning: {
            ...actual.Reasoning,
            create: mockReasoningCreate,
        },
        Routing: {
            ...actual.Routing,
            create: mockRoutingCreate,
        },
        Phases: {
            ...actual.Phases,
            createSimpleReplacePhase: mockSimpleReplacePhaseCreate,
        },
        Agentic: {
            ...actual.Agentic,
            create: mockAgenticCreate,
        },
        Transcript: {
            ...actual.Transcript,
            processFeedback: mockProcessFeedback,
        },
    };
});

/**
 * Helper to create a PKL transcript for testing
 */
async function createTestTranscript(
    transcriptsDir: string,
    relativePath: string,
    options: {
        title?: string;
        date?: Date;
        status?: string;
        content?: string;
        tags?: string[];
    } = {}
): Promise<string> {
    const pklPath = path.join(transcriptsDir, relativePath);
    await fs.mkdir(path.dirname(pklPath), { recursive: true });

    const metadata = {
        title: options.title || 'Test Transcript',
        date: options.date || new Date('2025-02-15T10:00:00.000Z'),
        status: options.status || 'reviewed',
        tags: options.tags || [],
    };

    const transcript = PklTranscript.create(pklPath, metadata);
    try {
        transcript.updateContent(options.content ?? 'Original content here.');
    } finally {
        transcript.close();
    }

    return pklPath;
}

/**
 * Helper to read PKL transcript
 */
function readTestTranscript(pklPath: string): { metadata: Record<string, unknown>; content: string } {
    const transcript = PklTranscript.open(pklPath, { readOnly: true });
    try {
        return {
            metadata: transcript.metadata,
            content: transcript.content,
        };
    } finally {
        transcript.close();
    }
}

describe('transcriptTools - extended handlers', () => {
    let tempDir: string;
    let transcriptsDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-extended-test-'));
        transcriptsDir = path.join(tempDir, 'notes');

        await fs.mkdir(transcriptsDir, { recursive: true });

        vi.mocked(getConfiguredDirectory).mockResolvedValue(transcriptsDir);
        vi.mocked(ServerConfigModule.getOutputStorage as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            name: 'local',
        });
        vi.mocked(ServerConfigModule.getContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

        mockProcessFeedback.mockImplementation(async (_feedback: string, ctx: { changes: unknown[] }) => {
            ctx.changes = [];
        });
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('handleReadTranscript', () => {
        it('should read transcript and return structured data', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test-transcript.pkl', {
                title: 'Meeting Notes',
                content: 'Discussion about project timeline.',
            });

            const result = await handleReadTranscript({
                transcriptPath: '2025/2/test-transcript.pkl',
            });

            expect(result.filePath).toContain('test-transcript');
            expect(result.title).toBe('Meeting Notes');
            expect(result.content).toBe('Discussion about project timeline.');
            expect(result.metadata).toBeDefined();
            expect(result.contentLength).toBeGreaterThan(0);
        });

        it('should throw for non-existent transcript', async () => {
            await expect(
                handleReadTranscript({ transcriptPath: '2025/1/nonexistent.pkl' })
            ).rejects.toThrow('Transcript not found');
        });

        it('should reject UUID refs in GCS mode', async () => {
            vi.mocked(ServerConfigModule.getOutputStorage as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
                name: 'gcs',
                exists: async () => false,
                listFiles: async () => [],
                readFile: async () => Buffer.from(''),
                writeFile: async () => undefined,
            });

            await expect(
                handleReadTranscript({ transcriptPath: '123e4567-e89b-12d3-a456-426614174000' })
            ).rejects.toThrow('UUID transcript references are not supported in GCS mode yet');
        });

        it('should not basename-fallback folder-qualified refs in GCS mode', async () => {
            vi.mocked(ServerConfigModule.getOutputStorage as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
                name: 'gcs',
                exists: async () => false,
                listFiles: async () => ['2025/1/same-name.pkl'],
                readFile: async () => Buffer.from(''),
                writeFile: async () => undefined,
            });

            await expect(
                handleReadTranscript({ transcriptPath: '2026/2/same-name.pkl' })
            ).rejects.toThrow('Transcript not found');
        });
    });

    describe('handleCorrectToEntity', () => {
        it('should throw when server context is not initialized', async () => {
            await expect(
                handleCorrectToEntity({
                    transcriptPath: '2025/2/test.pkl',
                    selectedText: 'Old Name',
                    entityType: 'person',
                    entityName: 'New Name',
                })
            ).rejects.toThrow('Server context not initialized');
        });

        it('should create a new person entity and apply correction', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/correct-entity.pkl', {
                title: 'Entity Correction',
                content: 'Met with Jhon yesterday.',
            });

            const saved = new Map<string, any>();
            const contextStub = {
                saveEntity: vi.fn(async (entity: any) => {
                    saved.set(entity.id, entity);
                }),
                getPerson: vi.fn((id: string) => saved.get(id)),
                getProject: vi.fn(),
                getTerm: vi.fn(),
                getCompany: vi.fn(),
            };

            vi.mocked(ServerConfigModule.getContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
                contextStub as any
            );

            const result = await handleCorrectToEntity({
                transcriptPath: '2025/2/correct-entity.pkl',
                selectedText: 'Jhon',
                entityType: 'person',
                entityName: 'John',
                firstName: 'John',
                lastName: 'Doe',
            });

            expect(result.success).toBe(true);
            expect(result.entity.type).toBe('person');
            expect(result.correction.original).toBe('Jhon');
            expect(result.correction.replacement).toBe('John');
            expect(result.isNewEntity).toBe(true);
            expect(contextStub.saveEntity).toHaveBeenCalled();
        });
    });

    describe('handleListTranscripts', () => {
        it('should list transcripts in directory', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/meeting-1.pkl', {
                title: 'Meeting 1',
                content: 'Content 1',
            });
            await createTestTranscript(transcriptsDir, '2025/2/meeting-2.pkl', {
                title: 'Meeting 2',
                content: 'Content 2',
            });

            const result = await handleListTranscripts({});

            expect(result.transcripts.length).toBeGreaterThanOrEqual(2);
            expect(result.pagination).toBeDefined();
            expect(result.pagination.total).toBeGreaterThanOrEqual(2);
        });

        it('should respect limit and offset', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/a.pkl');
            await createTestTranscript(transcriptsDir, '2025/2/b.pkl');
            await createTestTranscript(transcriptsDir, '2025/2/c.pkl');

            const result = await handleListTranscripts({ limit: 2, offset: 1 });

            expect(result.transcripts.length).toBeLessThanOrEqual(2);
            expect(result.pagination.limit).toBe(2);
            expect(result.pagination.offset).toBe(1);
        });

        it('should throw for non-existent directory', async () => {
            vi.mocked(getConfiguredDirectory).mockResolvedValue(path.join(tempDir, 'nonexistent'));

            await expect(handleListTranscripts({})).rejects.toThrow('Directory not found');
        });

        it('should list with explicit directory', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/meeting.pkl', {
                title: 'Meeting',
                content: 'Content',
            });

            const result = await handleListTranscripts({
                directory: transcriptsDir,
            });

            expect(result.transcripts.length).toBeGreaterThanOrEqual(1);
            expect(result.directory).toBeDefined();
        });

        it('should apply sortBy, startDate, endDate, search filters', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/a.pkl', {
                title: 'Alpha',
                date: new Date('2025-02-15'),
                content: 'Alpha content',
            });

            const result = await handleListTranscripts({
                sortBy: 'title',
                startDate: '2025-02-01',
                endDate: '2025-02-28',
                search: 'Alpha',
            });

            expect(result.filters.sortBy).toBe('title');
            expect(result.filters.startDate).toBe('2025-02-01');
            expect(result.filters.endDate).toBe('2025-02-28');
            expect(result.filters.search).toBe('Alpha');
        });
    });

    describe('handleEditTranscript', () => {
        it('should update transcript title', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', {
                title: 'Old Title',
                content: 'Content',
            });

            const result = await handleEditTranscript({
                transcriptPath: '2025/2/test.pkl',
                title: 'New Title',
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('title updated');
        });

        it('should add and remove tags', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', {
                title: 'Test',
                tags: ['existing'],
                content: 'Content',
            });

            const result = await handleEditTranscript({
                transcriptPath: '2025/2/test.pkl',
                tagsToAdd: ['new-tag'],
                tagsToRemove: ['existing'],
            });

            expect(result.success).toBe(true);
        });

        it('should update status', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', {
                title: 'Test',
                status: 'initial',
                content: 'Content',
            });

            const result = await handleEditTranscript({
                transcriptPath: '2025/2/test.pkl',
                status: 'reviewed',
            });

            expect(result.success).toBe(true);
            expect(result.statusChanged).toBe(true);
        });

        it('should throw when no changes specified', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl');

            await expect(
                handleEditTranscript({
                    transcriptPath: '2025/2/test.pkl',
                })
            ).rejects.toThrow('Must specify at least one of');
        });

        it('should throw for invalid status', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl');

            await expect(
                handleEditTranscript({
                    transcriptPath: '2025/2/test.pkl',
                    status: 'invalid_status',
                })
            ).rejects.toThrow('Invalid status');
        });

        it('should report status unchanged when already at target status', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', {
                title: 'Test',
                status: 'reviewed',
                content: 'Content',
            });

            const result = await handleEditTranscript({
                transcriptPath: '2025/2/test.pkl',
                status: 'reviewed',
            });

            expect(result.success).toBe(true);
            expect(result.statusChanged).toBe(false);
            expect(result.message).toContain('status unchanged');
        });

        it('should use serverContext dirs when getContextDirectories returns empty', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', {
                title: 'Old Title',
                content: 'Content',
            });

            const mockServerContext = {
                hasContext: () => true,
                getContextDirs: () => [] as string[],
            };
            vi.mocked(ServerConfigModule.getContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
                mockServerContext as any
            );

            try {
                const result = await handleEditTranscript({
                    transcriptPath: '2025/2/test.pkl',
                    title: 'Updated Title',
                });
                expect(result.success).toBe(true);
            } finally {
                vi.mocked(ServerConfigModule.getContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
            }
        });
    });

    describe('handleCombineTranscripts', () => {
        it('should combine two transcripts', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/part1.pkl', {
                title: 'Part 1',
                content: 'Content from part 1.',
            });
            await createTestTranscript(transcriptsDir, '2025/2/part2.pkl', {
                title: 'Part 2',
                content: 'Content from part 2.',
            });

            const result = await handleCombineTranscripts({
                transcriptPaths: ['2025/2/part1.pkl', '2025/2/part2.pkl'],
                title: 'Combined Meeting',
            });

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeDefined();
            expect(result.deletedFiles.length).toBe(2);
            expect(result.message).toContain('Combined');
        });

        it('should throw when fewer than 2 transcripts', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/single.pkl');

            await expect(
                handleCombineTranscripts({
                    transcriptPaths: ['2025/2/single.pkl'],
                })
            ).rejects.toThrow('At least 2 transcript files are required');
        });
    });

    describe('handleUpdateTranscriptContent', () => {
        it('should update transcript content', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', {
                title: 'Test',
                content: 'Original content',
            });

            const result = await handleUpdateTranscriptContent({
                transcriptPath: '2025/2/test.pkl',
                content: 'Updated content here.',
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('updated successfully');

            const { content } = readTestTranscript(path.join(transcriptsDir, '2025/2/test.pkl'));
            expect(content).toBe('Updated content here.');
        });

        it('should throw for non-existent transcript', async () => {
            await expect(
                handleUpdateTranscriptContent({
                    transcriptPath: '2025/1/nonexistent.pkl',
                    content: 'New content',
                })
            ).rejects.toThrow('Transcript not found');
        });
    });

    describe('handleUpdateTranscriptEntityReferences', () => {
        it('should update entity references', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', {
                title: 'Test',
                content: 'Content',
            });

            const result = await handleUpdateTranscriptEntityReferences({
                transcriptPath: '2025/2/test.pkl',
                entities: {
                    people: [{ id: 'john-doe', name: 'John Doe' }],
                    projects: [{ id: 'my-project', name: 'My Project' }],
                },
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('entity references updated');
        });

        it('should throw for invalid entity ID', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl');

            await expect(
                handleUpdateTranscriptEntityReferences({
                    transcriptPath: '2025/2/test.pkl',
                    entities: {
                        people: [{ id: 'invalid id with spaces!', name: 'Person' }],
                    },
                })
            ).rejects.toThrow('Invalid entity ID');
        });

        it('should reject JSON-like entity IDs', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl');

            await expect(
                handleUpdateTranscriptEntityReferences({
                    transcriptPath: '2025/2/test.pkl',
                    entities: {
                        people: [{ id: '{"id":"x"}', name: 'Person' }],
                    },
                })
            ).rejects.toThrow('Entity IDs should be UUIDs or slugified identifiers');
        });

        it('should update all entity types', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', {
                title: 'Test',
                content: 'Content',
            });

            const result = await handleUpdateTranscriptEntityReferences({
                transcriptPath: '2025/2/test.pkl',
                entities: {
                    people: [{ id: 'jane-doe', name: 'Jane Doe' }],
                    projects: [{ id: 'proj-1', name: 'Project One' }],
                    terms: [{ id: 'acme-corp', name: 'ACME Corp' }],
                    companies: [{ id: 'acme', name: 'ACME Inc' }],
                },
            });

            expect(result.success).toBe(true);
        });
    });

    describe('handleProvideFeedback', () => {
        it('should process feedback and return result', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', {
                title: 'Test',
                content: 'YB mentioned in the meeting.',
            });

            const result = await handleProvideFeedback({
                transcriptPath: '2025/2/test.pkl',
                feedback: 'YB should be Wibey',
            });

            expect(result.success).toBe(true);
            expect(result.changesApplied).toBeDefined();
            expect(result.outputPath).toBeDefined();
        });

        it('should apply content changes when processFeedback returns changes', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', {
                title: 'Original Title',
                content: 'Original content with typo.',
            });

            mockProcessFeedback.mockImplementation(
                async (_feedback: string, ctx: { changes: unknown[]; transcriptContent: string }) => {
                    ctx.changes = [
                        {
                            type: 'text_corrected',
                            description: 'Fixed typo',
                            details: {},
                        },
                    ];
                    ctx.transcriptContent = 'Original content with fix.';
                }
            );

            const result = await handleProvideFeedback({
                transcriptPath: '2025/2/test.pkl',
                feedback: 'Fix the typo',
            });

            expect(result.success).toBe(true);
            expect(result.changesApplied).toBe(1);

            const { content } = readTestTranscript(path.join(transcriptsDir, '2025/2/test.pkl'));
            expect(content).toBe('Original content with fix.');
        });

        it('should apply title change when processFeedback returns title_changed', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', {
                title: 'Old Title',
                content: 'Content',
            });

            mockProcessFeedback.mockImplementation(
                async (_feedback: string, ctx: { changes: unknown[] }) => {
                    ctx.changes = [
                        {
                            type: 'title_changed',
                            description: 'Title updated',
                            details: { new_title: 'New Title' },
                        },
                    ];
                }
            );

            const result = await handleProvideFeedback({
                transcriptPath: '2025/2/test.pkl',
                feedback: 'Change title to New Title',
            });

            expect(result.success).toBe(true);
            const { metadata } = readTestTranscript(path.join(transcriptsDir, '2025/2/test.pkl'));
            expect(metadata.title).toBe('New Title');
        });
    });

    describe('handleEnhanceTranscript', () => {
        it('should enhance transcript using explicit original text and update metadata', async () => {
            const pklPath = await createTestTranscript(transcriptsDir, '2025/2/enhance-test.pkl', {
                title: 'Enhance Test',
                status: 'initial',
                content: 'Old enhanced content',
            });

            const contextCreateSpy = vi.spyOn(ContextModule, 'create').mockResolvedValue({
                getAllProjects: () => [],
                getAllPeople: () => [],
                getAllTerms: () => [],
                getAllCompanies: () => [],
                getProject: (id: string) => ({ id, name: `Project ${id}` }),
                getPerson: () => undefined,
                getTerm: () => undefined,
                getCompany: () => undefined,
            } as any);
            mockRoutingCreate.mockReturnValue({
                route: () => ({
                    projectId: 'project-123',
                    destination: { path: transcriptsDir, structure: 'month', filename_options: ['date'] },
                    confidence: 0.9,
                    signals: [],
                    reasoning: 'test routing',
                    alternateMatches: [],
                }),
                buildOutputPath: () => '',
                addProject: () => {},
                updateDefaultRoute: () => {},
                getConfig: () => ({
                    default: { path: transcriptsDir, structure: 'month', filename_options: ['date'] },
                    projects: [],
                    conflict_resolution: 'primary',
                }),
            } as any);
            mockSimpleReplacePhaseCreate.mockReturnValue({
                replace: vi.fn(async (text: string) => ({
                    text: text.replace('orig', 'original'),
                    stats: {
                        tier1Replacements: 1,
                        tier2Replacements: 0,
                        totalReplacements: 1,
                        tier1MappingsConsidered: 1,
                        tier2MappingsConsidered: 0,
                        projectContext: 'project-123',
                        classificationConfidence: 0.9,
                        processingTimeMs: 5,
                        appliedMappings: [
                            {
                                soundsLike: 'orig',
                                correctText: 'original',
                                tier: 1,
                                occurrences: 1,
                                entityId: 'term-1',
                                entityType: 'term',
                            },
                        ],
                    },
                    replacementsMade: true,
                })),
            } as any);
            mockReasoningCreate.mockReturnValue({} as any);
            mockAgenticCreate.mockImplementation((_reasoning, toolContext: any) => ({
                process: vi.fn(async (text: string) => {
                    toolContext.onModelCallStart?.({
                        callIndex: 1,
                        phase: 'initial',
                        request: {
                            model: 'gpt-5.2',
                            reasoningLevel: 'medium',
                            prompt: 'Enhance transcript',
                            tools: [{ name: 'lookup_person' }],
                        },
                        timestamp: new Date('2026-01-01T00:00:00.000Z'),
                    });
                    toolContext.onModelCallComplete?.({
                        callIndex: 1,
                        phase: 'initial',
                        durationMs: 25,
                        response: {
                            model: 'gpt-5.2',
                            finishReason: 'stop',
                            usage: { promptTokens: 100, completionTokens: 23, totalTokens: 123 },
                            toolCalls: [{ id: 'tc-1', name: 'lookup_person', arguments: {} }],
                            contentLength: 90,
                        },
                        timestamp: new Date('2026-01-01T00:00:01.000Z'),
                    });
                    return {
                        enhancedText: `${text}\n\nEnhanced transcript output with enough length to satisfy the enhancement-success threshold.`,
                        toolsUsed: ['lookup_person', 'route_note'],
                        iterations: 2,
                        totalTokens: 123,
                        state: {
                            referencedEntities: {
                                people: new Set<string>(),
                                projects: new Set<string>(['project-123']),
                                terms: new Set<string>(),
                                companies: new Set<string>(),
                            },
                            routeDecision: {
                                projectId: 'project-123',
                                destination: { path: transcriptsDir, structure: 'month' },
                                confidence: 0.95,
                                signals: [],
                                reasoning: 'agentic route',
                            },
                        },
                    };
                }),
            }) as any);

            const result = await handleEnhanceTranscript({
                transcriptPath: '2025/2/enhance-test.pkl',
                originalText: 'orig text from original tab',
            });

            expect(result.success).toBe(true);
            expect(result.changed).toBe(true);
            expect(result.projectId).toBe('project-123');
            expect(result.toolsUsed).toContain('route_note');

            const transcript = PklTranscript.open(pklPath, { readOnly: true });
            try {
                expect(transcript.content).toContain('Enhanced transcript output');
                expect(transcript.metadata.status).toBe('enhanced');
                expect(transcript.getEnhancementLogCount()).toBeGreaterThan(0);
                const entries = transcript.getEnhancementLog();
                expect(entries.some((entry) => entry.action === 'model_call_start')).toBe(true);
                expect(entries.some((entry) => entry.action === 'model_call_complete')).toBe(true);
            } finally {
                transcript.close();
            }

            contextCreateSpy.mockRestore();
            mockRoutingCreate.mockReset();
            mockSimpleReplacePhaseCreate.mockReset();
            mockReasoningCreate.mockReset();
            mockAgenticCreate.mockReset();
        });

        it('should throw when no source text is available', async () => {
            const pklPath = await createTestTranscript(transcriptsDir, '2025/2/enhance-empty.pkl', {
                title: 'Enhance Empty',
                content: '',
            });

            // Ensure there's no raw transcript fallback
            const writable = PklTranscript.open(pklPath, { readOnly: false });
            try {
                writable.updateContent('');
            } finally {
                writable.close();
            }

            const contextCreateSpy = vi.spyOn(ContextModule, 'create').mockResolvedValue({
                getAllProjects: () => [],
                getAllPeople: () => [],
                getAllTerms: () => [],
                getAllCompanies: () => [],
                getProject: () => undefined,
                getPerson: () => undefined,
                getTerm: () => undefined,
                getCompany: () => undefined,
            } as any);

            await expect(
                handleEnhanceTranscript({
                    transcriptPath: '2025/2/enhance-empty.pkl',
                })
            ).rejects.toThrow('No source text available to enhance');

            contextCreateSpy.mockRestore();
        });

        it('should handle project not in context (GCS fallback path returns null)', async () => {
            const pklPath = await createTestTranscript(transcriptsDir, '2025/2/enhance-no-project.pkl', {
                title: 'Enhance No Project',
                content: 'Content for enhancement that has enough length for the threshold check.',
                status: 'initial',
            });

            const contextCreateSpy = vi.spyOn(ContextModule, 'create').mockResolvedValue({
                getAllProjects: () => [],
                getAllPeople: () => [],
                getAllTerms: () => [],
                getAllCompanies: () => [],
                getProject: () => undefined,
                getPerson: () => undefined,
                getTerm: () => undefined,
                getCompany: () => undefined,
            } as any);
            mockRoutingCreate.mockReturnValue({
                route: () => ({
                    projectId: 'unknown-project',
                    destination: { path: transcriptsDir, structure: 'month', filename_options: ['date'] },
                    confidence: 0.8,
                    signals: [],
                    reasoning: 'test routing',
                    alternateMatches: [],
                }),
                buildOutputPath: () => '',
                addProject: () => {},
                updateDefaultRoute: () => {},
                getConfig: () => ({
                    default: { path: transcriptsDir, structure: 'month', filename_options: ['date'] },
                    projects: [],
                    conflict_resolution: 'primary',
                }),
            } as any);
            mockSimpleReplacePhaseCreate.mockReturnValue({
                replace: vi.fn(async (text: string) => ({
                    text,
                    stats: { tier1Replacements: 0, tier2Replacements: 0, totalReplacements: 0, tier1MappingsConsidered: 0, tier2MappingsConsidered: 0, projectContext: null, classificationConfidence: 0, processingTimeMs: 5, appliedMappings: [] },
                    replacementsMade: false,
                })),
            } as any);
            mockReasoningCreate.mockReturnValue({} as any);
            mockAgenticCreate.mockReturnValue({
                process: vi.fn(async (text: string) => ({
                    enhancedText: `${text}\n\nEnhanced content long enough to meet threshold requirements for enhancement.`,
                    toolsUsed: ['route_note'],
                    iterations: 1,
                    totalTokens: 50,
                    state: {
                        referencedEntities: {
                            people: new Set<string>(),
                            projects: new Set<string>(['unknown-project']),
                            terms: new Set<string>(),
                            companies: new Set<string>(),
                        },
                        routeDecision: {
                            projectId: 'unknown-project',
                            destination: { path: transcriptsDir, structure: 'month' },
                            confidence: 0.8,
                            signals: [],
                            reasoning: 'agentic route',
                        },
                    },
                })),
            } as any);

            try {
                const result = await handleEnhanceTranscript({
                    transcriptPath: '2025/2/enhance-no-project.pkl',
                    originalText: 'Content for enhancement that has enough length for the threshold check.',
                });
                expect(result.success).toBe(true);
                expect(result.projectId).toBe('unknown-project');
                expect(result.projectName).toBeNull();
            } finally {
                contextCreateSpy.mockRestore();
                mockRoutingCreate.mockReset();
                mockSimpleReplacePhaseCreate.mockReset();
                mockReasoningCreate.mockReset();
                mockAgenticCreate.mockReset();
            }
        });
    });

    describe('handleCreateNote', () => {
        it('should summarize transcript and persist summary history artifact', async () => {
            const pklPath = await createTestTranscript(transcriptsDir, '2025/2/summary-test.pkl', {
                title: 'Summary Target',
                content: 'This transcript has enough content to summarize for tests.',
            });

            const complete = vi.fn(async () => ({
                content: '# Summary Target\n\n- Point one\n- Point two',
                model: 'mock-model',
                duration: 12,
                finishReason: 'stop',
            }));
            mockReasoningCreate.mockReturnValue({ complete } as any);

            const result = await handleSummarizeTranscript({
                transcriptPath: '2025/2/summary-test.pkl',
                audience: 'Internal',
                stylePreset: 'not_a_real_style',
                guidance: 'Keep it concise.',
                summaryTitle: 'Custom Title',
                model: 'mock-model',
            });

            expect(result.summary).toContain('Point one');
            expect(result.stylePreset).toBe('detailed');
            expect(result.model).toBe('mock-model');
            expect(result.summaryId).toMatch(/^summary-/);
            expect(complete).toHaveBeenCalledOnce();

            const transcript = PklTranscript.open(pklPath, { readOnly: true });
            try {
                const artifact = transcript.getArtifact('summary_history');
                expect(artifact).toBeTruthy();
                const stored = JSON.parse(artifact!.data.toString('utf8')) as Array<Record<string, unknown>>;
                expect(stored.length).toBe(1);
                expect(stored[0].id).toBe(result.summaryId);
                expect(stored[0].title).toBe('Custom Title');
            } finally {
                transcript.close();
            }

            mockReasoningCreate.mockReset();
        });

        it('should summarize with explicit style preset and generated title fallback', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/summary-style.pkl', {
                title: 'Style Summary Target',
                content: 'Content for style preset coverage.',
            });

            mockReasoningCreate.mockReturnValue({
                complete: vi.fn(async () => ({
                    content: '# Auto Title\n\nSummary body.',
                    model: 'mock-model',
                })),
            } as any);

            const result = await handleSummarizeTranscript({
                transcriptPath: '2025/2/summary-style.pkl',
                stylePreset: 'quick_bullets',
            });

            expect(result.stylePreset).toBe('quick_bullets');
            expect(result.summary).toContain('Summary body');

            mockReasoningCreate.mockReset();
        });

        it('should fail summarize when transcript content is empty', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/summary-empty.pkl', {
                title: 'Summary Empty',
                content: '',
            });

            await expect(
                handleSummarizeTranscript({
                    transcriptPath: '2025/2/summary-empty.pkl',
                })
            ).rejects.toThrow('Transcript content is empty');
        });

        it('should fail summarize when model returns empty content', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/summary-empty-result.pkl', {
                title: 'Summary Empty Result',
                content: 'Some content to summarize.',
            });

            mockReasoningCreate.mockReturnValue({
                complete: vi.fn(async () => ({
                    content: '   ',
                    model: 'mock-model',
                })),
            } as any);

            await expect(
                handleSummarizeTranscript({
                    transcriptPath: '2025/2/summary-empty-result.pkl',
                })
            ).rejects.toThrow('No summary text generated.');

            mockReasoningCreate.mockReset();
        });

        it('should delete a persisted summary from artifact history', async () => {
            const pklPath = await createTestTranscript(transcriptsDir, '2025/2/summary-delete.pkl', {
                title: 'Delete Summary Target',
                content: 'Summary history delete test.',
            });

            const writable = PklTranscript.open(pklPath, { readOnly: false });
            try {
                writable.addArtifact(
                    'summary_history',
                    Buffer.from(JSON.stringify([
                        {
                            id: 'summary-1',
                            title: 'A',
                            audience: 'General audience',
                            guidance: '',
                            stylePreset: 'detailed',
                            styleLabel: 'Detailed summary',
                            content: 'One',
                            generatedAt: '2026-01-01T00:00:00.000Z',
                        },
                        {
                            id: 'summary-2',
                            title: 'B',
                            audience: 'General audience',
                            guidance: '',
                            stylePreset: 'detailed',
                            styleLabel: 'Detailed summary',
                            content: 'Two',
                            generatedAt: '2026-01-02T00:00:00.000Z',
                        },
                    ]), 'utf8'),
                    { version: 1, count: 2, updatedAt: new Date().toISOString() }
                );
            } finally {
                writable.close();
            }

            const result = await handleDeleteTranscriptSummary({
                transcriptPath: '2025/2/summary-delete.pkl',
                summaryId: 'summary-1',
            });
            expect(result.success).toBe(true);
            expect(result.remaining).toBe(1);
        });

        it('should fail delete summary when summary id is missing', async () => {
            await expect(
                handleDeleteTranscriptSummary({
                    transcriptPath: '2025/2/summary-delete.pkl',
                    summaryId: '',
                })
            ).rejects.toThrow('summaryId is required');
        });

        it('should fail delete summary when summary does not exist', async () => {
            const pklPath = await createTestTranscript(transcriptsDir, '2025/2/summary-delete-missing.pkl', {
                title: 'Delete Missing Summary',
                content: 'Summary delete missing test.',
            });

            const writable = PklTranscript.open(pklPath, { readOnly: false });
            try {
                writable.addArtifact(
                    'summary_history',
                    Buffer.from(JSON.stringify([
                        {
                            id: 'summary-existing',
                            title: 'A',
                            audience: 'General audience',
                            guidance: '',
                            stylePreset: 'detailed',
                            styleLabel: 'Detailed summary',
                            content: 'One',
                            generatedAt: '2026-01-01T00:00:00.000Z',
                        },
                    ]), 'utf8'),
                    { version: 1, count: 1, updatedAt: new Date().toISOString() }
                );
            } finally {
                writable.close();
            }

            await expect(
                handleDeleteTranscriptSummary({
                    transcriptPath: '2025/2/summary-delete-missing.pkl',
                    summaryId: 'summary-missing',
                })
            ).rejects.toThrow('Summary not found');
        });

        it('should reject a correction and restore original content', async () => {
            const pklPath = await createTestTranscript(transcriptsDir, '2025/2/reject-correction.pkl', {
                title: 'Reject Correction',
                content: 'doccident appears twice: doccident.',
            });

            const writable = PklTranscript.open(pklPath, { readOnly: false });
            let correctionEntryId = 0;
            try {
                writable.enhancementLog.logStep(
                    new Date('2026-01-01T00:00:00.000Z'),
                    'enhance',
                    'correction_applied',
                    {
                        original: 'document',
                        replacement: 'doccident',
                    }
                );
                const entries = writable.getEnhancementLog();
                correctionEntryId = entries[entries.length - 1]?.id ?? 0;
            } finally {
                writable.close();
            }

            const result = await handleRejectCorrection({
                transcriptPath: '2025/2/reject-correction.pkl',
                correctionEntryId,
            });

            expect(result.success).toBe(true);
            expect(result.revertedOccurrences).toBeGreaterThanOrEqual(1);

            const transcript = PklTranscript.open(pklPath, { readOnly: true });
            try {
                expect(transcript.content).toContain('document appears twice');
                const entries = transcript.getEnhancementLog();
                expect(entries.some((entry) => entry.action === 'correction_rejected')).toBe(true);
            } finally {
                transcript.close();
            }
        });

        it('should return alreadyRejected when correction was already rejected', async () => {
            const pklPath = await createTestTranscript(transcriptsDir, '2025/2/reject-already.pkl', {
                title: 'Reject Already',
                content: 'doccident in content.',
            });

            const writable = PklTranscript.open(pklPath, { readOnly: false });
            let correctionEntryId = 0;
            try {
                writable.enhancementLog.logStep(
                    new Date('2026-01-01T00:00:00.000Z'),
                    'enhance',
                    'correction_applied',
                    {
                        original: 'document',
                        replacement: 'doccident',
                    }
                );
                const entriesAfterApplied = writable.getEnhancementLog();
                correctionEntryId = entriesAfterApplied[entriesAfterApplied.length - 1]?.id ?? 0;
                writable.enhancementLog.logStep(
                    new Date('2026-01-01T00:01:00.000Z'),
                    'enhance',
                    'correction_rejected',
                    {
                        correctionEntryId,
                        original: 'document',
                        replacement: 'doccident',
                        revertedOccurrences: 1,
                    }
                );
            } finally {
                writable.close();
            }

            const result = await handleRejectCorrection({
                transcriptPath: '2025/2/reject-already.pkl',
                correctionEntryId,
            });

            expect(result.success).toBe(true);
            expect(result.alreadyRejected).toBe(true);
        });

        it('should fail reject correction with invalid correctionEntryId', async () => {
            await expect(
                handleRejectCorrection({
                    transcriptPath: '2025/2/reject-correction.pkl',
                    correctionEntryId: 0,
                })
            ).rejects.toThrow('correctionEntryId must be a positive integer');
        });

        it('should fail reject correction when entry is missing', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/reject-missing-entry.pkl', {
                title: 'Reject Missing Entry',
                content: 'No correction entries.',
            });

            await expect(
                handleRejectCorrection({
                    transcriptPath: '2025/2/reject-missing-entry.pkl',
                    correctionEntryId: 999,
                })
            ).rejects.toThrow('Correction entry not found');
        });

        it('should fail reject correction when entry is not correction_applied', async () => {
            const pklPath = await createTestTranscript(transcriptsDir, '2025/2/reject-wrong-action.pkl', {
                title: 'Reject Wrong Action',
                content: 'Content',
            });

            const writable = PklTranscript.open(pklPath, { readOnly: false });
            let entryId = 0;
            try {
                writable.enhancementLog.logStep(new Date(), 'enhance', 'tool_start', { note: 'not a correction' });
                const entries = writable.getEnhancementLog();
                entryId = entries[entries.length - 1]?.id ?? 0;
            } finally {
                writable.close();
            }

            await expect(
                handleRejectCorrection({
                    transcriptPath: '2025/2/reject-wrong-action.pkl',
                    correctionEntryId: entryId,
                })
            ).rejects.toThrow('is not a correction_applied action');
        });

        it('should fail reject correction when correction details are missing', async () => {
            const pklPath = await createTestTranscript(transcriptsDir, '2025/2/reject-missing-details.pkl', {
                title: 'Reject Missing Details',
                content: 'Content',
            });

            const writable = PklTranscript.open(pklPath, { readOnly: false });
            let entryId = 0;
            try {
                writable.enhancementLog.logStep(new Date(), 'enhance', 'correction_applied', {});
                const entries = writable.getEnhancementLog();
                entryId = entries[entries.length - 1]?.id ?? 0;
            } finally {
                writable.close();
            }

            await expect(
                handleRejectCorrection({
                    transcriptPath: '2025/2/reject-missing-details.pkl',
                    correctionEntryId: entryId,
                })
            ).rejects.toThrow('missing original/replacement details');
        });

        it('should use simple-replace phase when original correction phase is unrecognized', async () => {
            const pklPath = await createTestTranscript(transcriptsDir, '2025/2/reject-fallback-phase.pkl', {
                title: 'Reject Fallback Phase',
                content: 'doccident appears once.',
            });

            const writable = PklTranscript.open(pklPath, { readOnly: false });
            let entryId = 0;
            try {
                (writable.enhancementLog.logStep as any)(
                    new Date(),
                    'unexpected-phase',
                    'correction_applied',
                    {
                        original: 'document',
                        replacement: 'doccident',
                    }
                );
                const entries = writable.getEnhancementLog();
                entryId = entries[entries.length - 1]?.id ?? 0;
            } finally {
                writable.close();
            }

            const result = await handleRejectCorrection({
                transcriptPath: '2025/2/reject-fallback-phase.pkl',
                correctionEntryId: entryId,
            });
            expect(result.success).toBe(true);

            const transcript = PklTranscript.open(pklPath, { readOnly: true });
            try {
                const entries = transcript.getEnhancementLog();
                const rejectionEntry = entries[entries.length - 1];
                expect(rejectionEntry.action).toBe('correction_rejected');
                expect(rejectionEntry.phase).toBe('simple-replace');
            } finally {
                transcript.close();
            }
        });

        it('should create a new note', async () => {
            const result = await handleCreateNote({
                title: 'My New Note',
                content: 'Note content here.',
            });

            expect(result.success).toBe(true);
            expect(result.filePath).toBeDefined();
            expect(result.filename).toMatch(/\.pkl$/);
            expect(result.message).toContain('created successfully');

            const fullPath = path.join(transcriptsDir, result.filePath);
            const { metadata, content } = readTestTranscript(fullPath);
            expect(metadata.title).toBe('My New Note');
            expect(content).toBe('Note content here.');
        });

        it('should create note with optional tags', async () => {
            const result = await handleCreateNote({
                title: 'Tagged Note',
                content: 'Content',
                tags: ['important', 'follow-up'],
            });

            expect(result.success).toBe(true);
            const fullPath = path.join(transcriptsDir, result.filePath);
            const { metadata } = readTestTranscript(fullPath);
            expect(metadata.tags).toEqual(['important', 'follow-up']);
        });

        it('should create note with specific date', async () => {
            const result = await handleCreateNote({
                title: 'Dated Note',
                content: 'Content',
                date: '2025-03-15',
            });

            expect(result.success).toBe(true);
            expect(result.filePath).toContain('2025');
            expect(result.filePath).toContain('03');
        });

        it('should create note with empty content', async () => {
            const result = await handleCreateNote({
                title: 'Empty Note',
            });

            expect(result.success).toBe(true);
            const fullPath = path.join(transcriptsDir, result.filePath);
            const { content } = readTestTranscript(fullPath);
            expect(content).toBe('');
        });

        it('should create note with projectId', async () => {
            const result = await handleCreateNote({
                title: 'Project Note',
                content: 'Content',
                projectId: 'some-project',
            });

            expect(result.success).toBe(true);
            const fullPath = path.join(transcriptsDir, result.filePath);
            const { metadata } = readTestTranscript(fullPath);
            expect(metadata.projectId).toBe('some-project');
        });
    });
});
