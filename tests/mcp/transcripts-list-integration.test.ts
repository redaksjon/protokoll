/**
 * Integration tests for transcripts list resource with projectId filter
 *
 * Tests the full flow: readTranscriptsListResource -> listTranscripts -> storage
 * with real .pkl files. No VS Code or HTTP server needed - runs with npm test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { vi } from 'vitest';
import { PklTranscript } from '@redaksjon/protokoll-format';
import { readTranscriptsListResource } from '../../src/mcp/resources/transcriptResources';
import * as ServerConfig from '../../src/mcp/serverConfig';

describe('Transcripts list integration (projectId filter)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transcripts-list-integration-'));
    vi.spyOn(ServerConfig, 'getOutputDirectory').mockReturnValue(tempDir);

    // Create fixture transcripts
    const t1 = PklTranscript.create(path.join(tempDir, '2026-01-01-meeting.pkl'), {
      title: 'Walmart Meeting',
      date: new Date('2026-01-01'),
      project: 'Walmart',
      projectId: 'cffd998f-ff32-4d27-9ea7-7976172c44d1',
      tags: ['meeting'],
      status: 'reviewed',
    });
    t1.updateContent('Meeting content');
    t1.close();

    const t2 = PklTranscript.create(path.join(tempDir, '2026-02-01-other.pkl'), {
      title: 'Other Project',
      date: new Date('2026-02-01'),
      project: 'Other',
      projectId: 'a1b2c3d4-5678-90ab-cdef-1234567890ab',
      tags: [],
      status: 'initial',
    });
    t2.updateContent('Other content');
    t2.close();

    const t3 = PklTranscript.create(path.join(tempDir, '2026-03-01-walmart-review.pkl'), {
      title: 'Walmart Review',
      date: new Date('2026-03-01'),
      project: 'Walmart',
      projectId: 'cffd998f-ff32-4d27-9ea7-7976172c44d1',
      tags: ['review'],
      status: 'reviewed',
    });
    t3.updateContent('Review content');
    t3.close();
  });

  it('should return hasMore and pagination for infinite scroll', async () => {
    const result = await readTranscriptsListResource({
      limit: 2,
      offset: 0,
    });

    const data = JSON.parse(result.text);
    expect(data.pagination).toBeDefined();
    expect(data.pagination.total).toBe(3);
    expect(data.pagination.limit).toBe(2);
    expect(data.pagination.offset).toBe(0);
    expect(data.pagination.hasMore).toBe(true);
    expect(data.transcripts).toHaveLength(2);

    const result2 = await readTranscriptsListResource({
      limit: 2,
      offset: 2,
    });
    const data2 = JSON.parse(result2.text);
    expect(data2.pagination.hasMore).toBe(false);
    expect(data2.transcripts).toHaveLength(1);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return all transcripts when no projectId filter', async () => {
    const result = await readTranscriptsListResource({
      limit: 100,
    });

    const data = JSON.parse(result.text);
    expect(data.pagination.total).toBe(3);
    expect(data.transcripts).toHaveLength(3);
  });

  it('should filter by projectId and return matching transcripts', async () => {
    const result = await readTranscriptsListResource({
      limit: 100,
      projectId: 'cffd998f-ff32-4d27-9ea7-7976172c44d1',
    });

    const data = JSON.parse(result.text);
    expect(data.pagination.total).toBe(2);
    expect(data.transcripts).toHaveLength(2);
    const titles = data.transcripts.map((t: { title: string }) => t.title).sort();
    expect(titles).toEqual(['Walmart Meeting', 'Walmart Review']);
  });

  it('should return empty when projectId matches no transcripts', async () => {
    const result = await readTranscriptsListResource({
      limit: 100,
      projectId: '00000000-0000-0000-0000-000000000000',
    });

    const data = JSON.parse(result.text);
    expect(data.pagination.total).toBe(0);
    expect(data.transcripts).toHaveLength(0);
  });
});
