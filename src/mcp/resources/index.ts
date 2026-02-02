/**
 * MCP Resources - Exports all resource definitions and handlers
 */

import type {
    McpResource,
    McpResourceTemplate,
    McpResourceContents,
    TranscriptUri,
    EntityUri,
    ConfigUri,
    TranscriptsListUri,
    EntitiesListUri,
    AudioInboundUri,
    AudioProcessedUri,
} from '../types';
import { parseUri } from '../uri';

// Re-export all resource modules
export * from './definitions';
export * from './discovery';
export * from './transcriptResources';
export * from './entityResources';
export * from './audioResources';
export * from './configResource';

// Import for use in handlers
import { directResources, resourceTemplates } from './definitions';
import { getDynamicResources } from './discovery';
import { readTranscriptResource, readTranscriptsListResource } from './transcriptResources';
import { readEntityResource, readEntitiesListResource } from './entityResources';
import { readAudioInboundResource, readAudioProcessedResource } from './audioResources';
import { readConfigResource } from './configResource';

// ============================================================================
// Main Handler Functions
// ============================================================================

/**
 * Handle resources/list request
 */
export async function handleListResources(contextDirectory?: string): Promise<{
    resources: McpResource[];
    resourceTemplates?: McpResourceTemplate[];
}> {
    // Get dynamic resources from context if available
    const dynamicResources = await getDynamicResources(contextDirectory);
    
    return {
        resources: [...directResources, ...dynamicResources],
        resourceTemplates,
    };
}

/**
 * Handle resources/read request
 */
export async function handleReadResource(uri: string): Promise<McpResourceContents> {
    const parsed = parseUri(uri);

    switch (parsed.resourceType) {
        case 'transcript':
            return readTranscriptResource((parsed as TranscriptUri).transcriptPath);
        case 'entity': {
            const entityUri = parsed as EntityUri;
            return readEntityResource(entityUri.entityType, entityUri.entityId);
        }
        case 'config':
            return readConfigResource((parsed as ConfigUri).configPath);
        case 'transcripts-list': {
            const listUri = parsed as TranscriptsListUri;
            return readTranscriptsListResource({
                directory: listUri.directory,
                startDate: listUri.startDate,
                endDate: listUri.endDate,
                limit: listUri.limit,
                offset: listUri.offset,
                projectId: listUri.projectId,
            });
        }
        case 'entities-list':
            return readEntitiesListResource((parsed as EntitiesListUri).entityType);
        case 'audio-inbound':
            return readAudioInboundResource((parsed as AudioInboundUri).directory);
        case 'audio-processed':
            return readAudioProcessedResource((parsed as AudioProcessedUri).directory);
        default:
            throw new Error(`Unknown resource type: ${parsed.resourceType}`);
    }
}
