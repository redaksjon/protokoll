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

function makeMemoryStorage() {
    const files = new Map<string, Buffer>();
    return {
        name: 'filesystem',
        mkdir: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn().mockImplementation(async (pathValue: string) => files.has(pathValue)),
        writeFile: vi.fn().mockImplementation(async (pathValue: string, data: Buffer | string) => {
            files.set(pathValue, Buffer.isBuffer(data) ? data : Buffer.from(data));
        }),
        readFile: vi.fn().mockImplementation(async (pathValue: string) => {
            const value = files.get(pathValue);
            if (!value) {
                throw new Error(`missing file: ${pathValue}`);
            }
            return value;
        }),
        listFiles: vi.fn().mockImplementation(async (prefix: string, pattern?: string) => (
            Array.from(files.keys())
                .filter((pathValue) => pathValue.startsWith(prefix))
                .filter((pathValue) => !pattern || pathValue.includes(pattern))
        )),
        listFilesWithMetadata: vi.fn().mockImplementation(async (prefix: string, pattern?: string) => (
            Array.from(files.entries())
                .filter(([pathValue]) => pathValue.startsWith(prefix))
                .filter(([pathValue]) => !pattern || pathValue.includes(pattern))
                .map(([pathValue, data]) => ({
                    path: pathValue,
                    size: data.length,
                    updatedAt: new Date('2026-05-05T20:00:00Z').toISOString(),
                }))
        )),
        deleteFile: vi.fn().mockImplementation(async (pathValue: string) => {
            files.delete(pathValue);
        }),
        files,
    };
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
            listFilesWithMetadata: vi.fn().mockResolvedValue([]),
            readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
            deleteFile: vi.fn().mockResolvedValue(undefined),
        });
        mocks.createUploadTranscript.mockResolvedValue({
            uuid: 'uuid-new',
            filePath: '/test/output/uuid-new-upload.pkl',
        });
        mocks.findTranscriptByUuid.mockResolvedValue('/test/output/uuid-existing.pkl');
        mocks.glob.mockResolvedValue([]);
        mocks.pklOpen.mockImplementation(() => ({
            metadata: {},
            addArtifact: vi.fn(),
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

    it('creates a durable chunked upload session', async () => {
        const storage = makeMemoryStorage();
        mocks.getOutputStorage.mockReturnValue(storage);

        const res = await app.request('/audio/upload-sessions', {
            method: 'POST',
            body: JSON.stringify({
                filename: 'long-meeting.m4a',
                sizeBytes: 12,
                title: 'Long meeting',
                project: 'Project One',
            }),
            headers: { 'content-type': 'application/json' },
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.uploadId).toBeTruthy();
        expect(body.status).toBe('receiving');
        expect(body.receivedBytes).toBe(0);
        expect(body.uploadSessionStatusUrl).toBe(`/audio/upload-sessions/${body.uploadId}/status`);
        expect(body.uploadSessionChunkUrlTemplate).toBe(`/audio/upload-sessions/${body.uploadId}/chunks/{index}`);
        expect(storage.writeFile).toHaveBeenCalledWith(
            `uploads/.sessions/${body.uploadId}/session.json`,
            expect.stringContaining('long-meeting.m4a')
        );
    });

    it('accepts chunks and exposes retryable upload status', async () => {
        const storage = makeMemoryStorage();
        mocks.getOutputStorage.mockReturnValue(storage);

        const createRes = await app.request('/audio/upload-sessions', {
            method: 'POST',
            body: JSON.stringify({ filename: 'long-meeting.m4a', sizeBytes: 10 }),
            headers: { 'content-type': 'application/json' },
        });
        const created = await createRes.json();

        const chunkRes = await app.request(`/audio/upload-sessions/${created.uploadId}/chunks/0`, {
            method: 'PUT',
            body: new TextEncoder().encode('hello'),
        });

        expect(chunkRes.status).toBe(200);
        const chunkBody = await chunkRes.json();
        expect(chunkBody.status).toBe('receiving');
        expect(chunkBody.receivedBytes).toBe(5);
        expect(chunkBody.missingBytes).toBe(5);
        expect(chunkBody.chunkCount).toBe(1);

        const statusRes = await app.request(`/audio/upload-sessions/${created.uploadId}/status`);
        expect(statusRes.status).toBe(200);
        expect(statusRes.headers.get('cache-control')).toBe('no-store');
        const statusBody = await statusRes.json();
        expect(statusBody.receivedBytes).toBe(5);
        expect(statusBody.chunks['0'].sha256).toBe(sha256(new TextEncoder().encode('hello')));
    });

    it('finalizes chunked uploads into a queued transcript', async () => {
        const storage = makeMemoryStorage();
        mocks.getOutputStorage.mockReturnValue(storage);

        const createRes = await app.request('/audio/upload-sessions', {
            method: 'POST',
            body: JSON.stringify({ filename: 'long-meeting.m4a', sizeBytes: 10 }),
            headers: { 'content-type': 'application/json' },
        });
        const created = await createRes.json();
        await app.request(`/audio/upload-sessions/${created.uploadId}/chunks/0`, {
            method: 'PUT',
            body: new TextEncoder().encode('hello'),
        });
        await app.request(`/audio/upload-sessions/${created.uploadId}/chunks/1`, {
            method: 'PUT',
            body: new TextEncoder().encode('world'),
        });

        const finalizeRes = await app.request(`/audio/upload-sessions/${created.uploadId}/finalize`, {
            method: 'POST',
        });

        expect(finalizeRes.status).toBe(200);
        const body = await finalizeRes.json();
        const expectedHash = sha256(new TextEncoder().encode('helloworld'));
        expect(body.status).toBe('queued');
        expect(body.transcriptUuid).toBe('uuid-new');
        expect(body.transcriptStatusUri).toBe('protokoll://transcript/status/uuid-new');
        expect(body.transcriptStatusUrl).toBe('/audio/uuid-new/status');
        expect(storage.writeFile).toHaveBeenCalledWith(`uploads/${expectedHash}.m4a`, Buffer.from('helloworld'));
        expect(mocks.createUploadTranscript).toHaveBeenCalledWith(
            expect.objectContaining({
                audioFile: `${expectedHash}.m4a`,
                originalFilename: 'long-meeting.m4a',
                audioHash: expectedHash,
            })
        );
        expect(mocks.pklOpen).toHaveBeenCalledWith('/test/output/uuid-new-upload.pkl');
    });

    it('finalizes to a fresh queued transcript when existing hash is still transcribing', async () => {
        const storage = makeMemoryStorage();
        mocks.getOutputStorage.mockReturnValue(storage);

        const createRes = await app.request('/audio/upload-sessions', {
            method: 'POST',
            body: JSON.stringify({ filename: 'retry-me.m4a', sizeBytes: 10 }),
            headers: { 'content-type': 'application/json' },
        });
        const created = await createRes.json();
        await app.request(`/audio/upload-sessions/${created.uploadId}/chunks/0`, {
            method: 'PUT',
            body: new TextEncoder().encode('hello'),
        });
        await app.request(`/audio/upload-sessions/${created.uploadId}/chunks/1`, {
            method: 'PUT',
            body: new TextEncoder().encode('world'),
        });
        const expectedHash = sha256(new TextEncoder().encode('helloworld'));
        storage.files.set(`uploads/${expectedHash}.m4a`, Buffer.from('helloworld'));
        storage.files.set('/test/output/existing.pkl', Buffer.from('existing-pkl'));
        mocks.pklOpen
            .mockImplementationOnce(() => ({
                metadata: {
                    id: 'uuid-existing',
                    status: 'transcribing',
                    audioHash: expectedHash,
                },
                close: vi.fn(),
            }))
            .mockImplementation(() => ({
                metadata: {},
                addArtifact: vi.fn(),
                close: vi.fn(),
            }));

        const finalizeRes = await app.request(`/audio/upload-sessions/${created.uploadId}/finalize`, {
            method: 'POST',
        });

        expect(finalizeRes.status).toBe(200);
        const body = await finalizeRes.json();
        expect(body.status).toBe('queued');
        expect(body.transcriptUuid).toBe('uuid-new');
        expect(mocks.createUploadTranscript).toHaveBeenCalledWith(
            expect.objectContaining({
                audioFile: `${expectedHash}.m4a`,
                audioHash: expectedHash,
            })
        );
    });

    it('returns duplicate response when same hash already exists and enhanced transcript is found', async () => {
        const bytes = new TextEncoder().encode('duplicate-audio');
        const hash = sha256(bytes);
        const outputStorage = {
            name: 'filesystem',
            mkdir: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(true),
            writeFile: vi.fn().mockResolvedValue(undefined),
            listFiles: vi.fn().mockResolvedValue(['/test/output/existing.pkl']),
            readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
        };
        mocks.getOutputStorage.mockReturnValue(outputStorage);
        mocks.pklOpen.mockImplementation(() => ({
            metadata: {
                id: 'uuid-existing',
                status: 'enhanced',
                audioHash: hash,
            },
            addArtifact: vi.fn(),
            close: vi.fn(),
        }));

        const res = await makeUploadRequest('sample.mp3', bytes);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.duplicate).toBe(true);
        expect(body.uuid).toBe('uuid-existing');
        expect(body.statusUri).toBe('protokoll://transcript/status/uuid-existing');
        expect(body.statusUrl).toBe('/audio/uuid-existing/status');
        expect(body.existingStatus).toBe('enhanced');
        expect(outputStorage.writeFile).not.toHaveBeenCalled();
        expect(mocks.createUploadTranscript).not.toHaveBeenCalled();
    });

    it('does not treat transcribing transcript as a usable duplicate', async () => {
        const bytes = new TextEncoder().encode('retry-audio');
        const hash = sha256(bytes);
        const outputStorage = {
            name: 'filesystem',
            mkdir: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(true),
            writeFile: vi.fn().mockResolvedValue(undefined),
            listFiles: vi.fn().mockResolvedValue(['/test/output/existing.pkl']),
            readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
        };
        mocks.getOutputStorage.mockReturnValue(outputStorage);
        mocks.pklOpen
            .mockImplementationOnce(() => ({
                metadata: {
                    id: 'uuid-existing',
                    status: 'transcribing',
                    audioHash: hash,
                },
                close: vi.fn(),
            }))
            .mockImplementation(() => ({
                metadata: {},
                addArtifact: vi.fn(),
                close: vi.fn(),
            }));

        const res = await makeUploadRequest('sample.mp3', bytes);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.duplicate).toBeUndefined();
        expect(body.uuid).toBe('uuid-new');
        expect(outputStorage.writeFile).not.toHaveBeenCalled();
        expect(mocks.createUploadTranscript).toHaveBeenCalledWith(
            expect.objectContaining({
                audioFile: `${hash}.mp3`,
                audioHash: hash,
            })
        );
    });

    it('continues with normal upload when duplicate scan cannot parse transcript files', async () => {
        const bytes = new TextEncoder().encode('still-upload');
        const outputStorage = {
            name: 'filesystem',
            mkdir: vi.fn().mockResolvedValue(undefined),
            exists: vi.fn().mockResolvedValue(true),
            writeFile: vi.fn().mockResolvedValue(undefined),
            listFiles: vi.fn().mockResolvedValue(['/test/output/bad.pkl']),
            readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
        };
        mocks.getOutputStorage.mockReturnValue(outputStorage);
        mocks.pklOpen
            .mockImplementationOnce(() => {
                throw new Error('corrupt transcript');
            })
            .mockImplementation(() => ({
                metadata: {},
                addArtifact: vi.fn(),
                close: vi.fn(),
            }));

        const res = await makeUploadRequest('sample.mp3', bytes, { title: 'My title', project: 'My project' });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.duplicate).toBeUndefined();
        expect(body.displayName).toBe('sample.mp3');
        expect(body.statusUri).toBe('protokoll://transcript/status/uuid-new');
        expect(body.statusUrl).toBe('/audio/uuid-new/status');
        expect(body.status.statusLabel).toBe('Queued for transcription');
        expect(body.status.fileSizeBytes).toBe(bytes.byteLength);
        expect(outputStorage.writeFile).not.toHaveBeenCalled();
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

    it('returns a direct status snapshot by UUID', async () => {
        mocks.pklOpen.mockImplementation(() => ({
            metadata: {
                id: 'uuid-existing',
                status: 'uploaded',
                originalFilename: 'long-meeting.m4a',
                audioFile: 'abc123.m4a',
                date: new Date('2026-05-05T20:00:00Z'),
            },
            getEnhancementLog: vi.fn().mockReturnValue([]),
            getArtifact: vi.fn().mockReturnValue({
                data: Buffer.from(JSON.stringify({
                    originalFilename: 'long-meeting.m4a',
                    audioSizeBytes: 1234,
                })),
            }),
            addArtifact: vi.fn(),
            close: vi.fn(),
        }));

        const res = await app.request('/audio/uuid-existing/status');
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        const body = await res.json();
        expect(body.uuid).toBe('uuid-existing');
        expect(body.stage).toBe('queued');
        expect(body.statusLabel).toBe('Queued for transcription');
        expect(body.transcriptStatusUri).toBe('protokoll://transcript/status/uuid-existing');
        expect(body.fileSizeBytes).toBe(1234);
    });

    it('returns 404 from status endpoint when transcript UUID is unknown', async () => {
        mocks.findTranscriptByUuid.mockResolvedValueOnce(null);
        const res = await app.request('/audio/not-found-uuid/status');
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toContain('No transcript found');
    });

    it('returns 404 for audio download when transcript has no audio hash', async () => {
        mocks.pklOpen.mockImplementation(() => ({
            metadata: { id: 'uuid-existing' },
            addArtifact: vi.fn(),
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
            addArtifact: vi.fn(),
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
            addArtifact: vi.fn(),
            close: vi.fn(),
        }));

        const res = await app.request('/audio/uuid-existing');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-disposition')).toContain('meeting-recording.mp3');
    });
});
