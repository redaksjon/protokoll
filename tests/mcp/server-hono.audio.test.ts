import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({
    handleListResources: vi.fn().mockResolvedValue({ resources: [] }),
    handleReadResource: vi.fn().mockResolvedValue({
        uri: 'protokoll://transcript/test',
        mimeType: 'text/plain',
        text: 'ok',
    }),
    getPrompts: vi.fn().mockReturnValue([]),
    getPrompt: vi.fn().mockResolvedValue([]),
    handleToolCall: vi.fn().mockResolvedValue({ ok: true }),
    initializeServerConfig: vi.fn().mockResolvedValue(undefined),
    getServerConfig: vi.fn().mockReturnValue({
        inputDirectory: '/test/input',
        outputDirectory: '/test/output',
        processedDirectory: '/test/processed',
    }),
    getContext: vi.fn().mockReturnValue({
        getConfig: vi.fn().mockReturnValue({ contextDirectories: ['/test/context'] }),
    }),
    getOutputDirectory: vi.fn().mockReturnValue('/test/output'),
    getOutputStorage: vi.fn(),
    createUploadTranscript: vi.fn(),
    findTranscriptByUuid: vi.fn(),
    pklOpen: vi.fn(),
    glob: vi.fn(),
    markTranscriptIndexDirtyForStorage: vi.fn(),
    fsMkdir: vi.fn().mockResolvedValue(undefined),
    fsReadFile: vi.fn().mockResolvedValue(Buffer.from('pkl-bytes')),
    fsAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@hono/node-server', () => ({ serve: vi.fn() }));
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: vi.fn().mockImplementation(() => ({
        setRequestHandler: vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined),
    })),
}));
vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
    CallToolRequestSchema: {},
    ListToolsRequestSchema: {},
    ListResourcesRequestSchema: {},
    ReadResourceRequestSchema: {},
    ListPromptsRequestSchema: {},
    GetPromptRequestSchema: {},
    ListRootsRequestSchema: {},
}));
vi.mock('@hono/mcp', () => ({
    StreamableHTTPTransport: vi.fn().mockImplementation(() => ({
        handleRequest: vi.fn().mockImplementation(async (c) => c.json({
            jsonrpc: '2.0',
            result: { ok: true },
            id: 1,
        })),
    })),
}));

vi.mock('glob', () => ({ glob: mocks.glob }));
vi.mock('node:fs/promises', () => ({
    mkdir: mocks.fsMkdir,
    readFile: mocks.fsReadFile,
    access: mocks.fsAccess,
}));

vi.mock('../../src/mcp/resources', () => ({
    handleListResources: (...args: unknown[]) => mocks.handleListResources(...args),
    handleReadResource: (...args: unknown[]) => mocks.handleReadResource(...args),
}));
vi.mock('../../src/mcp/prompts', () => ({
    getPrompts: (...args: unknown[]) => mocks.getPrompts(...args),
    getPrompt: (...args: unknown[]) => mocks.getPrompt(...args),
}));
vi.mock('../../src/mcp/tools', () => ({
    tools: [{ name: 'protokoll_read_transcript', description: 'Read transcript' }],
    handleToolCall: (...args: unknown[]) => mocks.handleToolCall(...args),
}));
vi.mock('../../src/mcp/roots', () => ({
    getCachedRoots: vi.fn().mockReturnValue([{ uri: 'file:///test', name: 'Workspace' }]),
    setRoots: vi.fn(),
}));
vi.mock('../../src/mcp/engineLogging', () => ({
    configureEngineLoggingBridge: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/mcp/configDiscovery', () => ({
    DEFAULT_CONFIG_FILE: 'protokoll-config.yaml',
    createQuietLogger: vi.fn(),
}));
vi.mock('../../src/mcp/resources/transcriptIndexService', () => ({
    markTranscriptIndexDirtyForStorage: (...args: unknown[]) => mocks.markTranscriptIndexDirtyForStorage(...args),
}));
vi.mock('../../src/mcp/serverConfig', () => ({
    initializeServerConfig: (...args: unknown[]) => mocks.initializeServerConfig(...args),
    getServerConfig: (...args: unknown[]) => mocks.getServerConfig(...args),
    getContext: (...args: unknown[]) => mocks.getContext(...args),
    getOutputDirectory: (...args: unknown[]) => mocks.getOutputDirectory(...args),
    getOutputStorage: (...args: unknown[]) => mocks.getOutputStorage(...args),
    isInitialized: vi.fn().mockReturnValue(true),
    getStorageConfig: vi.fn().mockReturnValue({ backend: 'filesystem' }),
}));
vi.mock('@redaksjon/protokoll-engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@redaksjon/protokoll-engine')>();
    return {
        ...actual,
        Transcript: {
            ...actual.Transcript,
            createUploadTranscript: (...args: unknown[]) => mocks.createUploadTranscript(...args),
            findTranscriptByUuid: (...args: unknown[]) => mocks.findTranscriptByUuid(...args),
            findUploadedTranscripts: vi.fn().mockResolvedValue([]),
            findTranscribingTranscripts: vi.fn().mockResolvedValue([]),
        },
    };
});
vi.mock('@redaksjon/protokoll-format', () => ({
    PklTranscript: {
        open: (...args: unknown[]) => mocks.pklOpen(...args),
    },
}));

import { app } from '../../src/mcp/server-hono';

function makeUploadRequest(filename: string, bytes: Uint8Array, fields?: Record<string, string>) {
    const form = new FormData();
    form.set('audio', new File([bytes], filename));
    if (fields) {
        for (const [key, value] of Object.entries(fields)) {
            form.set(key, value);
        }
    }
    return app.request('/audio/upload', { method: 'POST', body: form });
}

function sha256(data: Uint8Array): string {
    return createHash('sha256').update(Buffer.from(data)).digest('hex');
}

describe('server-hono audio endpoints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getOutputStorage.mockReturnValue({
            name: 'filesystem',
            mkdir: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(false),
            writeFile: vi.fn().mockResolvedValue(undefined),
            listFiles: vi.fn().mockResolvedValue([]),
            readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
        });
        mocks.createUploadTranscript.mockResolvedValue({
            uuid: 'uuid-new',
            filePath: '/test/output/uuid-new-upload.pkl',
        });
        mocks.findTranscriptByUuid.mockResolvedValue('/test/output/uuid-existing.pkl');
        mocks.glob.mockResolvedValue([]);
        mocks.pklOpen.mockImplementation(() => ({
            metadata: {},
            close: vi.fn(),
        }));
    });

    it('returns 400 when no audio file is provided', async () => {
        const form = new FormData();
        const res = await app.request('/audio/upload', { method: 'POST', body: form });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('No audio file provided');
    });

    it('returns 400 for unsupported extension', async () => {
        const res = await makeUploadRequest('sample.txt', new TextEncoder().encode('audio'));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('Unsupported file type');
    });

    it('returns duplicate response when same hash already exists and transcript is found', async () => {
        const bytes = new TextEncoder().encode('duplicate-audio');
        const hash = sha256(bytes);
        const outputStorage = {
            name: 'filesystem',
            mkdir: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(true),
            writeFile: vi.fn().mockResolvedValue(undefined),
            listFiles: vi.fn().mockResolvedValue([]),
            readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
        };
        mocks.getOutputStorage.mockReturnValue(outputStorage);
        mocks.glob.mockResolvedValue(['/test/output/existing.pkl']);
        mocks.pklOpen.mockImplementation(() => ({
            metadata: {
                id: 'uuid-existing',
                status: 'uploaded',
                audioHash: hash,
            },
            close: vi.fn(),
        }));

        const res = await makeUploadRequest('sample.mp3', bytes);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.duplicate).toBe(true);
        expect(body.uuid).toBe('uuid-existing');
        expect(body.existingStatus).toBe('uploaded');
        expect(outputStorage.writeFile).not.toHaveBeenCalled();
        expect(mocks.createUploadTranscript).not.toHaveBeenCalled();
    });

    it('continues with normal upload when duplicate scan cannot parse transcript files', async () => {
        const bytes = new TextEncoder().encode('still-upload');
        const outputStorage = {
            name: 'filesystem',
            mkdir: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(true),
            writeFile: vi.fn().mockResolvedValue(undefined),
            listFiles: vi.fn().mockResolvedValue([]),
            readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
        };
        mocks.getOutputStorage.mockReturnValue(outputStorage);
        mocks.glob.mockResolvedValue(['/test/output/bad.pkl']);
        mocks.pklOpen.mockImplementation(() => {
            throw new Error('corrupt transcript');
        });

        const res = await makeUploadRequest('sample.mp3', bytes, { title: 'My title', project: 'My project' });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.duplicate).toBeUndefined();
        expect(outputStorage.writeFile).toHaveBeenCalledTimes(1);
        expect(mocks.createUploadTranscript).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'My title',
                project: 'My project',
                originalFilename: 'sample.mp3',
            })
        );
    });

    it('returns 500 when storage write of uploaded audio fails', async () => {
        const outputStorage = {
            name: 'filesystem',
            mkdir: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(false),
            writeFile: vi.fn().mockRejectedValue(new Error('write failed')),
            listFiles: vi.fn().mockResolvedValue([]),
            readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
        };
        mocks.getOutputStorage.mockReturnValue(outputStorage);
        const res = await makeUploadRequest('sample.mp3', new TextEncoder().encode('x'));
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('Upload failed');
    });

    it('returns 500 when transcript creation fails after upload write', async () => {
        mocks.createUploadTranscript.mockRejectedValueOnce(new Error('pkl create failed'));
        const res = await makeUploadRequest('sample.mp3', new TextEncoder().encode('x'));
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('Upload failed');
        expect(body.details).toContain('pkl create failed');
    });

    it('persists transcript placeholder to storage backend in gcs mode', async () => {
        const outputStorage = {
            name: 'gcs',
            mkdir: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(false),
            writeFile: vi.fn().mockResolvedValue(undefined),
            listFiles: vi.fn().mockResolvedValue([]),
            readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
        };
        mocks.getOutputStorage.mockReturnValue(outputStorage);

        const res = await makeUploadRequest('sample.mp3', new TextEncoder().encode('gcs-upload'));
        expect(res.status).toBe(200);
        expect(outputStorage.writeFile).toHaveBeenCalledTimes(2);
        expect(mocks.fsReadFile).toHaveBeenCalledWith('/test/output/uuid-new-upload.pkl');
        expect(mocks.markTranscriptIndexDirtyForStorage).toHaveBeenCalledTimes(1);
    });

    it('returns 500 when gcs transcript mirror write fails', async () => {
        const outputStorage = {
            name: 'gcs',
            mkdir: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(false),
            writeFile: vi
                .fn()
                .mockResolvedValueOnce(undefined) // audio bytes write
                .mockRejectedValueOnce(new Error('gcs transcript write failed')),
            listFiles: vi.fn().mockResolvedValue([]),
            readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
        };
        mocks.getOutputStorage.mockReturnValue(outputStorage);

        const res = await makeUploadRequest('sample.mp3', new TextEncoder().encode('gcs-fail'));
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('Upload failed');
        expect(body.details).toContain('gcs transcript write failed');
    });

    it('returns 404 for audio download when transcript UUID is unknown', async () => {
        mocks.findTranscriptByUuid.mockResolvedValueOnce(null);
        const res = await app.request('/audio/not-found-uuid');
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toContain('Transcript not found');
    });

    it('returns 404 for audio download when transcript has no audio hash', async () => {
        mocks.pklOpen.mockImplementation(() => ({
            metadata: { id: 'uuid-existing' },
            close: vi.fn(),
        }));
        const res = await app.request('/audio/uuid-existing');
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toContain('No audio file associated');
    });

    it('returns 404 for audio download when uploads do not contain matching hash object', async () => {
        const outputStorage = {
            name: 'filesystem',
            mkdir: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(false),
            writeFile: vi.fn().mockResolvedValue(undefined),
            listFiles: vi.fn().mockResolvedValue(['uploads/not-the-hash.mp3']),
            readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
        };
        mocks.getOutputStorage.mockReturnValue(outputStorage);
        mocks.pklOpen.mockImplementation(() => ({
            metadata: { id: 'uuid-existing', audioHash: 'abc123' },
            close: vi.fn(),
        }));

        const res = await app.request('/audio/uuid-existing');
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toContain('Audio file not found');
    });

    it('uses originalFilename in Content-Disposition when downloading', async () => {
        const outputStorage = {
            name: 'filesystem',
            mkdir: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(false),
            writeFile: vi.fn().mockResolvedValue(undefined),
            listFiles: vi.fn().mockResolvedValue(['uploads/abc123.mp3']),
            readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
        };
        mocks.getOutputStorage.mockReturnValue(outputStorage);
        mocks.pklOpen.mockImplementation(() => ({
            metadata: {
                id: 'uuid-existing',
                audioHash: 'abc123',
                originalFilename: 'meeting-recording.mp3',
                audioFile: 'abc123.mp3',
            },
            close: vi.fn(),
        }));

        const res = await app.request('/audio/uuid-existing');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-disposition')).toContain('meeting-recording.mp3');
    });
});
