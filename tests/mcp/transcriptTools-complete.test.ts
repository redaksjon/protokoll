/**
 * Complete Transcript Tools Tests - Edge cases and uncovered code paths
 * Complements transcriptTools-changeDate.test.ts and transcriptTools-extended.test.ts
 * Focus: entity validation, provideFeedback project changes, createNote with project context
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    handleReadTranscript,
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

// Mock Context for handleCreateNote project resolution (line 1060)
const mockGetProject = vi.hoisted(() => vi.fn());
vi.mock('@/context', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/context')>();
    const mockCreate = vi.fn().mockResolvedValue({
        getProject: mockGetProject,
        getConfig: () => ({}),
    });
    return { ...actual, create: mockCreate };
});

// Mock the shared module
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

// Mock Transcript.processFeedback for handleProvideFeedback
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

async function createTestTranscript(
    transcriptsDir: string,
    relativePath: string,
    options: { title?: string; date?: Date; status?: string; content?: string } = {}
): Promise<string> {
    const pklPath = path.join(transcriptsDir, relativePath);
    await fs.mkdir(path.dirname(pklPath), { recursive: true });
    const metadata = {
        title: options.title || 'Test Transcript',
        date: options.date || new Date('2025-02-15T10:00:00.000Z'),
        status: options.status || 'reviewed',
        tags: [],
    };
    const transcript = PklTranscript.create(pklPath, metadata);
    try {
        transcript.updateContent(options.content || 'Original content here.');
    } finally {
        transcript.close();
    }
    return pklPath;
}

function readTestTranscript(pklPath: string): { metadata: Record<string, unknown>; content: string } {
    const transcript = PklTranscript.open(pklPath, { readOnly: true });
    try {
        return { metadata: transcript.metadata, content: transcript.content };
    } finally {
        transcript.close();
    }
}

describe('transcriptTools - complete (edge cases and uncovered paths)', () => {
    let tempDir: string;
    let transcriptsDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-complete-test-'));
        transcriptsDir = path.join(tempDir, 'notes');
        await fs.mkdir(transcriptsDir, { recursive: true });
        vi.mocked(getConfiguredDirectory).mockResolvedValue(transcriptsDir);
        mockProcessFeedback.mockImplementation(async (_feedback: string, ctx: { changes: unknown[] }) => {
            ctx.changes = [];
        });
        mockGetProject.mockReturnValue(undefined);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('handleUpdateTranscriptEntityReferences - validateEntityId edge cases', () => {
        it('should throw for empty entity ID (line 847)', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', { title: 'Test', content: 'Content' });

            await expect(
                handleUpdateTranscriptEntityReferences({
                    transcriptPath: '2025/2/test.pkl',
                    entities: {
                        people: [{ id: '', name: 'Person' }],
                    },
                })
            ).rejects.toThrow('ID must be a non-empty string');
        });

        it('should throw for entity ID with comma only', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', { title: 'Test', content: 'Content' });

            await expect(
                handleUpdateTranscriptEntityReferences({
                    transcriptPath: '2025/2/test.pkl',
                    entities: {
                        people: [{ id: 'a,b', name: 'Person' }],
                    },
                })
            ).rejects.toThrow('Entity IDs should be UUIDs or slugified identifiers');
        });

        it('should throw for entity ID with curly braces', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', { title: 'Test', content: 'Content' });

            await expect(
                handleUpdateTranscriptEntityReferences({
                    transcriptPath: '2025/2/test.pkl',
                    entities: {
                        people: [{ id: 'id-with-{brace', name: 'Person' }],
                    },
                })
            ).rejects.toThrow('Entity IDs should be UUIDs or slugified identifiers');
        });

        it('should accept valid entity ID with underscores', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', { title: 'Test', content: 'Content' });

            const result = await handleUpdateTranscriptEntityReferences({
                transcriptPath: '2025/2/test.pkl',
                entities: {
                    people: [{ id: 'valid_id_with_underscores', name: 'Person' }],
                },
            });

            expect(result.success).toBe(true);
        });

        it('should handle empty entities object', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', { title: 'Test', content: 'Content' });

            const result = await handleUpdateTranscriptEntityReferences({
                transcriptPath: '2025/2/test.pkl',
                entities: {},
            });

            expect(result.success).toBe(true);
        });
    });

    describe('handleProvideFeedback - project change (line 986)', () => {
        it('should apply project change when processFeedback returns project_changed', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/test.pkl', {
                title: 'Old Title',
                content: 'Content',
            });

            mockProcessFeedback.mockImplementation(async (_feedback: string, ctx: { changes: unknown[] }) => {
                ctx.changes = [
                    {
                        type: 'project_changed',
                        description: 'Project updated',
                        details: {
                            project_id: 'new-project-id',
                            project_name: 'New Project Name',
                        },
                    },
                ];
            });

            const result = await handleProvideFeedback({
                transcriptPath: '2025/2/test.pkl',
                feedback: 'Assign to New Project',
            });

            expect(result.success).toBe(true);
            expect(result.changesApplied).toBe(1);

            const { metadata } = readTestTranscript(path.join(transcriptsDir, '2025/2/test.pkl'));
            expect(metadata.projectId).toBe('new-project-id');
            expect(metadata.project).toBe('New Project Name');
        });
    });

    describe('handleCreateNote - project context (line 1060)', () => {
        it('should set project name when context.getProject returns a project', async () => {
            mockGetProject.mockResolvedValue({ id: 'my-project', name: 'My Project Name', type: 'project' });

            const result = await handleCreateNote({
                title: 'Project Note',
                content: 'Content',
                projectId: 'my-project',
            });

            expect(result.success).toBe(true);
            const fullPath = path.join(transcriptsDir, result.filePath);
            const { metadata } = readTestTranscript(fullPath);
            expect(metadata.projectId).toBe('my-project');
            expect(metadata.project).toBe('My Project Name');
        });

        it('should handle context.getProject throwing (catch path)', async () => {
            mockGetProject.mockRejectedValue(new Error('Context error'));

            const result = await handleCreateNote({
                title: 'Resilient Note',
                content: 'Content',
                projectId: 'unknown-project',
            });

            expect(result.success).toBe(true);
            const fullPath = path.join(transcriptsDir, result.filePath);
            const { metadata } = readTestTranscript(fullPath);
            expect(metadata.projectId).toBe('unknown-project');
            expect(metadata.project).toBeUndefined();
        });
    });

    describe('handleReadTranscript - metadata fallbacks', () => {
        it('should return structured response with metadata fallbacks', async () => {
            await createTestTranscript(transcriptsDir, '2025/2/minimal.pkl', {
                title: 'Minimal',
                content: 'Minimal content',
            });

            const result = await handleReadTranscript({
                transcriptPath: '2025/2/minimal.pkl',
            });

            expect(result.filePath).toBeDefined();
            expect(result.title).toBe('Minimal');
            expect(result.content).toBe('Minimal content');
            expect(result.metadata).toBeDefined();
            expect(result.metadata.tags).toEqual([]);
            expect(result.metadata.status).toBeDefined();
            expect(result.contentLength).toBeGreaterThan(0);
        });
    });
});
