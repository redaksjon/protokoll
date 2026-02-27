import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FilesystemStorageProvider } from '../../src/mcp/storage/fileProviders';

describe('FilesystemStorageProvider', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('supports write/read/list/delete lifecycle', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-fs-provider-'));
    const provider = new FilesystemStorageProvider(tempDir);

    await provider.mkdir('uploads');
    await provider.writeFile('uploads/sample.txt', 'hello');

    expect(await provider.exists('uploads/sample.txt')).toBe(true);
    expect((await provider.readFile('uploads/sample.txt')).toString('utf8')).toBe('hello');

    const files = await provider.listFiles('uploads');
    expect(files).toContain('uploads/sample.txt');

    await provider.deleteFile('uploads/sample.txt');
    expect(await provider.exists('uploads/sample.txt')).toBe(false);
  });
});
