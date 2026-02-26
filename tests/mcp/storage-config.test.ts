import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { clearServerConfig, getStorageConfig, initializeServerConfig } from '../../src/mcp/serverConfig';
import { parseGcsUri } from '../../src/mcp/storage/gcsUri';

describe('storage config', () => {
  afterEach(() => {
    clearServerConfig();
  });

  describe('parseGcsUri', () => {
    it('parses bucket-only URI', () => {
      expect(parseGcsUri('gs://my-bucket')).toEqual({
        bucket: 'my-bucket',
        prefix: '',
      });
    });

    it('parses bucket and normalized prefix', () => {
      expect(parseGcsUri('gs://my-bucket//nested/path///')).toEqual({
        bucket: 'my-bucket',
        prefix: 'nested/path',
      });
    });

    it('rejects non-gs scheme', () => {
      expect(() => parseGcsUri('s3://bucket/path')).toThrow('must start with "gs://"');
    });

    it('rejects missing bucket', () => {
      expect(() => parseGcsUri('gs:///path-only')).toThrow('missing bucket name');
    });
  });

  it('defaults to filesystem when storage config is absent', async () => {
    await initializeServerConfig([], 'local');
    expect(getStorageConfig()).toEqual({ backend: 'filesystem' });
  });

  it('fails fast when gcs credentials file is missing', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-storage-config-'));
    try {
      await fs.writeFile(
        path.join(tempDir, 'protokoll-config.yaml'),
        [
          'storage:',
          '  backend: gcs',
          '  gcs:',
          '    inputUri: gs://bucket-input/protokoll/input/',
          '    outputUri: gs://bucket-output/protokoll/output/',
          '    contextUri: gs://bucket-context/shared/context/',
          '    credentialsFile: ./missing-service-account.json',
          '',
        ].join('\n'),
        'utf8'
      );

      await expect(
        initializeServerConfig(
          [{ uri: pathToFileURL(tempDir).toString(), name: 'test-root' }],
          'local'
        )
      ).rejects.toThrow('GCS credentials file is not readable');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('fails fast when gcs URI format is invalid', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-storage-config-invalid-uri-'));
    const credentialsPath = path.join(tempDir, 'service-account.json');
    try {
      await fs.writeFile(credentialsPath, '{}', 'utf8');
      await fs.writeFile(
        path.join(tempDir, 'protokoll-config.yaml'),
        [
          'storage:',
          '  backend: gcs',
          '  gcs:',
          '    inputUri: s3://bucket-input/protokoll/input/',
          '    outputUri: gs://bucket-output/protokoll/output/',
          '    contextUri: gs://bucket-context/shared/context/',
          `    credentialsFile: ${credentialsPath}`,
          '',
        ].join('\n'),
        'utf8'
      );

      await expect(
        initializeServerConfig(
          [{ uri: pathToFileURL(tempDir).toString(), name: 'test-root' }],
          'local'
        )
      ).rejects.toThrow('must start with "gs://"');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
