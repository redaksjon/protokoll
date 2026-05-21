/**
 * Transcript Status Resources
 *
 * Stable, UUID-keyed resources for live upload/transcription status.
 */

import type { McpResourceContents } from '../types';
import { buildTranscriptStatusUri } from '../uri';
import { handleGetTranscriptByUuid } from '../tools/queueTools';

export async function readTranscriptStatusResource(uuid: string): Promise<McpResourceContents> {
    if (!uuid || typeof uuid !== 'string' || uuid.trim().length === 0) {
        throw new Error(`Invalid transcript UUID: ${uuid}`);
    }

    const result = await handleGetTranscriptByUuid({ uuid: uuid.trim(), includeContent: false });
    if (!result.found || !result.statusView) {
        throw new Error(result.error || `Transcript not found for UUID: ${uuid}`);
    }

    return {
        uri: buildTranscriptStatusUri(result.statusView.uuid),
        mimeType: 'application/json',
        text: JSON.stringify(result.statusView),
    };
}
