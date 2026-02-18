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
    handleCreateNote,
} from '../../src/mcp/tools/transcriptTools';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PklTranscript } from '@redaksjon/protokoll-format';

// Mock serverConfig for validateNotRemoteMode and getContextDirectories
vi.mock('../../src/mcp/serverConfig', () => ({
    getServerConfig: vi.fn().mockReturnValue({ configFile: { contextDirectories: [] } }),
    isRemoteMode: vi.fn().mockReturnValue(false),
    getInputDirectory: vi.fn().mockReturnValue('/test/input'),
    getOutputDirectory: vi.fn().mockReturnValue('/test/output'),
    getProcessedDirectory: vi.fn().mockReturnValue('/test/processed'),
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
vi.mock('@redaksjon/protokoll-engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@redaksjon/protokoll-engine')>();
    return {
        ...actual,
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
        transcript.updateContent(options.content || 'Original content here.');
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

    describe('handleCreateNote', () => {
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
