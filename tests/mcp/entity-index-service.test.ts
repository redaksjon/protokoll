import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageFileMetadata } from '../../src/mcp/storage/fileProviders';
import {
  listContextEntitiesFromGcs,
  findContextEntityInGcs,
  markContextEntityIndexDirty,
} from '../../src/mcp/resources/entityIndexService';

interface MockState {
  metadata: StorageFileMetadata[];
  reads: number;
}

const state: MockState = {
  metadata: [],
  reads: 0,
};

const providerMock = {
  async readFile(pathValue: string): Promise<Buffer> {
    state.reads++;
    const id = pathValue.split('/').pop()?.replace(/\.(yaml|yml)$/i, '') || 'unknown';
    return Buffer.from(`id: ${id}\nname: ${id}\nslug: ${id}\n`);
  },
  async writeFile(): Promise<void> {},
  async listFiles(): Promise<string[]> {
    return state.metadata.map((entry) => entry.path);
  },
  async listFilesWithMetadata(prefix: string): Promise<StorageFileMetadata[]> {
    return state.metadata.filter((entry) => entry.path.startsWith(prefix.replace(/\/+$/, '/')));
  },
  async deleteFile(): Promise<void> {},
  async exists(pathValue: string): Promise<boolean> {
    return pathValue === '.protokoll/entities-index-v1.json' ? false : true;
  },
  async mkdir(): Promise<void> {},
};

vi.mock('../../src/mcp/storage/gcsProvider', () => ({
  createGcsStorageProvider: () => providerMock,
}));

vi.mock('../../src/mcp/serverConfig', () => ({
  getStorageConfig: () => ({
    backend: 'gcs',
    gcs: {
      contextUri: 'gs://context-bucket/context',
      projectId: 'test-project',
      credentialsFile: '/tmp/creds.json',
    },
  }),
}));

describe('entity index service', () => {
  beforeEach(() => {
    state.reads = 0;
    state.metadata = [{
      path: 'people/alice.yaml',
      size: 128,
      updatedAt: '2026-03-01T10:00:00.000Z',
      generation: '1',
      etag: 'etag-1',
    }];
    markContextEntityIndexDirty('person');
  });

  it('uses cache when generation is unchanged', async () => {
    const first = await listContextEntitiesFromGcs('person');
    const second = await listContextEntitiesFromGcs('person');
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(state.reads).toBe(1);
  });

  it('refreshes when generation changes', async () => {
    await listContextEntitiesFromGcs('person');
    state.metadata = [{
      ...state.metadata[0],
      generation: '2',
      etag: 'etag-2',
      updatedAt: '2026-03-01T10:05:00.000Z',
    }];
    await new Promise((resolve) => setTimeout(resolve, 5100));
    await listContextEntitiesFromGcs('person');
    expect(state.reads).toBe(2);
  });

  it('finds entity by id from indexed data', async () => {
    await listContextEntitiesFromGcs('person');
    const entity = await findContextEntityInGcs('person', 'alice');
    expect(entity).toBeTruthy();
    expect(entity?.id).toBe('alice');
  });
});
