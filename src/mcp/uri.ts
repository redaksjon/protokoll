/**
 * URI Parser for Protokoll MCP Resources
 * 
 * Handles parsing and construction of protokoll:// URIs.
 * 
 * URI Schemes:
 * - protokoll://transcript/{path}
 * - protokoll://entity/{type}/{id}
 * - protokoll://config/{path}
 * - protokoll://transcripts?directory={dir}&startDate={date}&...
 * - protokoll://entities/{type}
 */

import type {
    ParsedResourceUri,
    TranscriptUri,
    EntityUri,
    ConfigUri,
    TranscriptsListUri,
    EntitiesListUri,
    AudioInboundUri,
    AudioProcessedUri,
    ResourceType,
} from './types';

const SCHEME = 'protokoll';

/**
 * Parse a protokoll:// URI into its components
 */
export function parseUri(uri: string): ParsedResourceUri {
    if (!uri.startsWith(`${SCHEME}://`)) {
        throw new Error(`Invalid URI scheme: ${uri}. Expected protokoll://`);
    }

    const withoutScheme = uri.substring(`${SCHEME}://`.length);
    const [pathPart, queryPart] = withoutScheme.split('?');
    const segments = pathPart.split('/').filter(s => s.length > 0);

    if (segments.length === 0) {
        throw new Error(`Invalid URI: ${uri}. No resource type specified.`);
    }

    const firstSegment = segments[0];
    const params = parseQueryParams(queryPart);

    switch (firstSegment) {
        case 'transcript':
            return parseTranscriptUri(uri, segments, params);
        case 'entity':
            return parseEntityUri(uri, segments, params);
        case 'config':
            return parseConfigUri(uri, segments, params);
        case 'transcripts':
        case 'transcripts-list':
            return parseTranscriptsListUri(uri, segments, params);
        case 'entities':
        case 'entities-list':
            return parseEntitiesListUri(uri, segments, params);
        case 'audio':
            return parseAudioUri(uri, segments, params);
        default:
            throw new Error(`Unknown resource type: ${firstSegment}`);
    }
}

function parseQueryParams(queryPart?: string): Record<string, string> {
    if (!queryPart) return {};
    
    const params: Record<string, string> = {};
    const pairs = queryPart.split('&');
    
    for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key && value !== undefined) {
            params[decodeURIComponent(key)] = decodeURIComponent(value);
        }
    }
    
    return params;
}

function parseTranscriptUri(
    uri: string,
    segments: string[],
    params: Record<string, string>
): TranscriptUri {
    // protokoll://transcript/path/to/file
    // Note: URIs should NOT include file extensions (.md or .pkl)
    // The server resolves the actual file format automatically
    // 
    // Handle both relative and absolute paths
    // If URI has double slash after transcript, it's an absolute path
    const withoutScheme = uri.substring(`${SCHEME}://`.length);
    const [pathPart] = withoutScheme.split('?');
    
    // Check if path starts with transcript/ followed by / (absolute path)
    const transcriptPrefix = 'transcript/';
    let transcriptPath: string;
    
    if (pathPart.startsWith(transcriptPrefix)) {
        // Extract everything after "transcript/"
        const afterPrefix = pathPart.substring(transcriptPrefix.length);
        // If it starts with /, it's an absolute path - preserve it
        if (afterPrefix.startsWith('/')) {
            transcriptPath = afterPrefix;
        } else {
            // Relative path - use segments
            transcriptPath = segments.slice(1).join('/');
        }
    } else {
        // Fallback to segments method
        transcriptPath = segments.slice(1).join('/');
    }
    
    if (!transcriptPath) {
        throw new Error(`Invalid transcript URI: ${uri}. No path specified.`);
    }

    // Decode the path - the server will resolve the actual file format
    const decodedPath = decodeURIComponent(transcriptPath);

    return {
        scheme: SCHEME,
        resourceType: 'transcript',
        path: transcriptPath,
        params,
        transcriptPath: decodedPath,
    };
}

function parseEntityUri(
    uri: string,
    segments: string[],
    params: Record<string, string>
): EntityUri {
    // protokoll://entity/{type}/{id}
    if (segments.length < 3) {
        throw new Error(`Invalid entity URI: ${uri}. Expected protokoll://entity/{type}/{id}`);
    }

    const entityType = segments[1] as EntityUri['entityType'];
    const entityId = segments.slice(2).join('/');

    const validTypes = ['person', 'project', 'term', 'company', 'ignored'];
    if (!validTypes.includes(entityType)) {
        throw new Error(`Invalid entity type: ${entityType}. Expected one of: ${validTypes.join(', ')}`);
    }

    return {
        scheme: SCHEME,
        resourceType: 'entity',
        path: `${entityType}/${entityId}`,
        params,
        entityType,
        entityId: decodeURIComponent(entityId),
    };
}

function parseConfigUri(
    uri: string,
    segments: string[],
    params: Record<string, string>
): ConfigUri {
    // protokoll://config/{path}
    const configPath = segments.slice(1).join('/');

    return {
        scheme: SCHEME,
        resourceType: 'config',
        path: configPath || '',
        params,
        configPath: configPath ? decodeURIComponent(configPath) : '',
    };
}

function parseTranscriptsListUri(
    uri: string,
    segments: string[],
    params: Record<string, string>
): TranscriptsListUri {
    // protokoll://transcripts?directory={dir}&startDate={date}&projectId={id}&...
    const directory = params.directory || '';

    return {
        scheme: SCHEME,
        resourceType: 'transcripts-list',
        path: segments.slice(1).join('/'),
        params,
        directory,
        startDate: params.startDate,
        endDate: params.endDate,
        limit: params.limit ? parseInt(params.limit, 10) : undefined,
        offset: params.offset ? parseInt(params.offset, 10) : undefined,
        projectId: params.projectId,
    };
}

function parseEntitiesListUri(
    uri: string,
    segments: string[],
    params: Record<string, string>
): EntitiesListUri {
    // protokoll://entities/{type}
    const entityType = (segments[1] || params.type || 'project') as EntitiesListUri['entityType'];

    return {
        scheme: SCHEME,
        resourceType: 'entities-list',
        path: entityType,
        params,
        entityType,
    };
}

function parseAudioUri(
    uri: string,
    segments: string[],
    params: Record<string, string>
): AudioInboundUri | AudioProcessedUri {
    // protokoll://audio/inbound?directory={dir}
    // protokoll://audio/processed?directory={dir}
    const audioType = segments[1];
    
    if (audioType === 'inbound') {
        return {
            scheme: SCHEME,
            resourceType: 'audio-inbound',
            path: 'audio/inbound',
            params,
            directory: params.directory,
        };
    } else if (audioType === 'processed') {
        return {
            scheme: SCHEME,
            resourceType: 'audio-processed',
            path: 'audio/processed',
            params,
            directory: params.directory,
        };
    }
    
    throw new Error(`Invalid audio URI: ${uri}. Expected protokoll://audio/inbound or protokoll://audio/processed`);
}

// ============================================================================
// URI Builders
// ============================================================================

/**
 * Build a transcript resource URI
 * 
 * @param transcriptPath The transcript identifier (should NOT include file extension)
 *                       e.g., "2026/1/29-1234-meeting" not "2026/1/29-1234-meeting.pkl"
 *                       The server resolves the actual file format automatically
 */
export function buildTranscriptUri(transcriptPath: string): string {
    const encoded = encodeURIComponent(transcriptPath).replace(/%2F/g, '/');
    return `${SCHEME}://transcript/${encoded}`;
}

/**
 * Build an entity resource URI
 */
export function buildEntityUri(
    entityType: 'person' | 'project' | 'term' | 'company' | 'ignored',
    entityId: string
): string {
    return `${SCHEME}://entity/${entityType}/${encodeURIComponent(entityId)}`;
}

/**
 * Build a config resource URI
 */
export function buildConfigUri(configPath?: string): string {
    if (configPath) {
        return `${SCHEME}://config/${encodeURIComponent(configPath)}`;
    }
    return `${SCHEME}://config`;
}

/**
 * Build a transcripts list URI
 */
export function buildTranscriptsListUri(options: {
    directory?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
    projectId?: string;
}): string {
    const params = new URLSearchParams();
    if (options.directory) params.set('directory', options.directory);
    if (options.startDate) params.set('startDate', options.startDate);
    if (options.endDate) params.set('endDate', options.endDate);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    if (options.projectId) params.set('projectId', options.projectId);
    
    const queryString = params.toString();
    return queryString ? `${SCHEME}://transcripts?${queryString}` : `${SCHEME}://transcripts`;
}

/**
 * Build an entities list URI
 */
export function buildEntitiesListUri(
    entityType: 'person' | 'project' | 'term' | 'company' | 'ignored'
): string {
    return `${SCHEME}://entities/${entityType}`;
}

/**
 * Build an inbound audio list URI
 */
export function buildAudioInboundUri(directory?: string): string {
    if (directory) {
        return `${SCHEME}://audio/inbound?directory=${encodeURIComponent(directory)}`;
    }
    return `${SCHEME}://audio/inbound`;
}

/**
 * Build a processed audio list URI
 */
export function buildAudioProcessedUri(directory?: string): string {
    if (directory) {
        return `${SCHEME}://audio/processed?directory=${encodeURIComponent(directory)}`;
    }
    return `${SCHEME}://audio/processed`;
}

/**
 * Check if a string is a valid Protokoll URI
 */
export function isProtokolUri(uri: string): boolean {
    return uri.startsWith(`${SCHEME}://`);
}

/**
 * Get the resource type from a URI without full parsing
 */
export function getResourceType(uri: string): ResourceType | null {
    if (!isProtokolUri(uri)) return null;
    
    const withoutScheme = uri.substring(`${SCHEME}://`.length);
    const segments = withoutScheme.split('/');
    const firstSegment = segments[0].split('?')[0];
    
    if (firstSegment === 'transcripts') return 'transcripts-list';
    if (firstSegment === 'entities') return 'entities-list';
    if (firstSegment === 'audio') {
        const secondSegment = segments[1]?.split('?')[0];
        if (secondSegment === 'inbound') return 'audio-inbound';
        if (secondSegment === 'processed') return 'audio-processed';
    }
    
    return firstSegment as ResourceType;
}
