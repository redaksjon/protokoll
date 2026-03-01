import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileStorageProvider, StorageFileMetadata } from '../../src/mcp/storage/fileProviders';
import {
  listTranscriptsViaIndex,
  markTranscriptIndexDirtyForStorage,
} from '../../src/mcp/resources/transcriptIndexService';

const mocks = vi.hoisted(() => ({
  readTranscriptContent: vi.fn(),
  pklOpen: vi.fn(),
}));

vi.mock('@redaksjon/protokoll-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@redaksjon/protokoll-engine')>();
  return {
    ...actual,
    Transcript: {
      ...actual.Transcript,
      readTranscriptContent: mocks.readTranscriptContent,
    },
  };
});

vi.mock('@redaksjon/protokoll-format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@redaksjon/protokoll-format')>();
  return {
    ...actual,
    PklTranscript: {
      ...actual.PklTranscript,
      open: mocks.pklOpen,
    },
  };
});

interface MockStorageState {
  metadata: StorageFileMetadata[];
  reads: number;
}

function createMockStorage(state: MockStorageState): FileStorageProvider {
  return {
    name: 'gcs',
    async readFile() {
      state.reads++;
      return Buffer.from('fake-pkl');
    },
    async writeFile() {},
    async listFiles() {
      return state.metadata.map((entry) => entry.path);
    },
    async listFilesWithMetadata() {
      return state.metadata;
    },
    async deleteFile() {},
    async exists() {
      return false;
    },
    async mkdir() {},
  };
}

describe('transcript index service', () => {
  beforeEach(() => {
    mocks.readTranscriptContent.mockReset();
    mocks.pklOpen.mockReset();
    mocks.readTranscriptContent.mockResolvedValue({
      content: 'example transcript text',
      metadata: {
        date: '2026-03-01',
        time: '10:00',
        status: 'initial',
        projectId: 'proj-1',
        project: 'Project One',
        tasks: [],
        entities: { projects: [{ id: 'proj-1', name: 'Project One' }] },
      },
      title: 'Example Transcript',
    });
    mocks.pklOpen.mockReturnValue({
      hasRawTranscript: false,
      close: () => {},
    });
  });

  it('hydrates once when metadata is unchanged', async () => {
    const state: MockStorageState = {
      metadata: [{
        path: '2026/03/example.pkl',
        size: 100,
        updatedAt: '2026-03-01T10:00:00.000Z',
        generation: '1',
        etag: 'etag-1',
      }],
      reads: 0,
    };
    const storage = createMockStorage(state);

    await listTranscriptsViaIndex({
      outputStorage: storage,
      outputDirectory: '/tmp/out',
      limit: 50,
      offset: 0,
    });
    await listTranscriptsViaIndex({
      outputStorage: storage,
      outputDirectory: '/tmp/out',
      limit: 50,
      offset: 0,
    });

    expect(state.reads).toBe(1);
  });

  it('rehydrates when generation changes', async () => {
    const state: MockStorageState = {
      metadata: [{
        path: '2026/03/example.pkl',
        size: 100,
        updatedAt: '2026-03-01T10:00:00.000Z',
        generation: '1',
        etag: 'etag-1',
      }],
      reads: 0,
    };
    const storage = createMockStorage(state);

    await listTranscriptsViaIndex({
      outputStorage: storage,
      outputDirectory: '/tmp/out',
      limit: 50,
      offset: 0,
    });

    state.metadata = [{
      ...state.metadata[0],
      generation: '2',
      updatedAt: '2026-03-01T10:05:00.000Z',
      etag: 'etag-2',
    }];

    // Default index refresh TTL is 5s; wait past it so generation diffing runs.
    await new Promise((resolve) => setTimeout(resolve, 5100));

    await listTranscriptsViaIndex({
      outputStorage: storage,
      outputDirectory: '/tmp/out',
      limit: 50,
      offset: 0,
    });

    expect(state.reads).toBe(2);
  });

  it('supports explicit dirty invalidation for a path', async () => {
    const state: MockStorageState = {
      metadata: [{
        path: '2026/03/example.pkl',
        size: 100,
        updatedAt: '2026-03-01T10:00:00.000Z',
        generation: '1',
        etag: 'etag-1',
      }],
      reads: 0,
    };
    const storage = createMockStorage(state);

    await listTranscriptsViaIndex({
      outputStorage: storage,
      outputDirectory: '/tmp/out',
      limit: 50,
      offset: 0,
    });

    markTranscriptIndexDirtyForStorage(storage, '/tmp/out', '2026/03/example.pkl');

    await listTranscriptsViaIndex({
      outputStorage: storage,
      outputDirectory: '/tmp/out',
      limit: 50,
      offset: 0,
    });

    expect(state.reads).toBe(2);
  });
});
