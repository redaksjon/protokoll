import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/mcp/tools/queueTools', () => ({
    handleGetTranscriptByUuid: vi.fn(),
}));

import { handleGetTranscriptByUuid } from '../../../src/mcp/tools/queueTools';
import { readTranscriptStatusResource } from '../../../src/mcp/resources/transcriptStatusResources';

describe('transcriptStatusResources', () => {
    it('returns the status snapshot for a transcript UUID', async () => {
        vi.mocked(handleGetTranscriptByUuid).mockResolvedValueOnce({
            found: true,
            statusView: {
                uuid: 'uuid-1',
                displayName: 'meeting.m4a',
                status: 'uploaded',
                stage: 'queued',
                statusLabel: 'Queued for transcription',
                statusDetail: 'Upload complete.',
                transcriptStatusUri: 'protokoll://transcript/status/uuid-1',
                canCancel: true,
                canRetry: false,
            },
        } as any);

        const result = await readTranscriptStatusResource('uuid-1');
        expect(result.uri).toBe('protokoll://transcript/status/uuid-1');
        expect(result.mimeType).toBe('application/json');
        expect(JSON.parse(result.text || '{}').displayName).toBe('meeting.m4a');
    });

    it('throws when the transcript cannot be found', async () => {
        vi.mocked(handleGetTranscriptByUuid).mockResolvedValueOnce({
            found: false,
            error: 'missing transcript',
        } as any);

        await expect(readTranscriptStatusResource('missing')).rejects.toThrow('missing transcript');
    });
});
