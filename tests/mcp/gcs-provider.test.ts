import { describe, expect, it, vi } from 'vitest';
import { GcsStorageProvider } from '../../src/mcp/storage/gcsProvider';

describe('GcsStorageProvider', () => {
  it('maps read/write/list operations to bucket object paths', async () => {
    const download = vi.fn(async () => [Buffer.from('audio')]);
    const save = vi.fn(async () => undefined);
    const exists = vi.fn(async () => [true]);
    const del = vi.fn(async () => undefined);
    const getMetadata = vi.fn(async () => [{}]);
    const getFiles = vi.fn(async () => [[{ name: 'base/uploads/hash.mp3' }]]);

    const file = vi.fn(() => ({
      download,
      save,
      exists,
      delete: del,
    }));

    const bucket = vi.fn(() => ({
      file,
      getFiles,
      getMetadata,
    }));

    const storage = { bucket } as any;
    const provider = new GcsStorageProvider(storage, 'test-bucket', 'base');

    await provider.verifyBucketAccess();
    expect(getMetadata).toHaveBeenCalled();

    await provider.writeFile('uploads/hash.mp3', Buffer.from('x'));
    expect(file).toHaveBeenCalledWith('base/uploads/hash.mp3');
    expect(save).toHaveBeenCalled();

    const contents = await provider.readFile('uploads/hash.mp3');
    expect(contents.toString('utf8')).toBe('audio');
    expect(download).toHaveBeenCalled();

    const listed = await provider.listFiles('uploads');
    expect(getFiles).toHaveBeenCalledWith({ prefix: 'base/uploads' });
    expect(listed).toContain('uploads/hash.mp3');

    expect(await provider.exists('uploads/hash.mp3')).toBe(true);
    await provider.deleteFile('uploads/hash.mp3');
    expect(del).toHaveBeenCalled();
  });
});
