/**
 * MCP Types
 * 
 * Centralized type definitions for MCP Resources, Prompts, and related structures.
 */

// ============================================================================
// Resource Types
// ============================================================================

export interface McpResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}

export interface McpResourceTemplate {
    uriTemplate: string;
    name: string;
    description?: string;
    mimeType?: string;
}

export interface McpResourceContents {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string; // base64 encoded
}

export type ResourceType = 
    | 'transcript'
    | 'entity'
    | 'config'
    | 'transcripts-list'
    | 'entities-list'
    | 'audio-inbound'
    | 'audio-processed';

// ============================================================================
// Prompt Types
// ============================================================================

export interface McpPromptArgument {
    name: string;
    description?: string;
    required?: boolean;
}

export interface McpPrompt {
    name: string;
    description?: string;
    arguments?: McpPromptArgument[];
}

export interface McpPromptMessage {
    role: 'user' | 'assistant';
    content: McpPromptContent;
}

export type McpPromptContent = 
    | McpTextContent
    | McpImageContent
    | McpResourceContent;

export interface McpTextContent {
    type: 'text';
    text: string;
}

export interface McpImageContent {
    type: 'image';
    data: string; // base64
    mimeType: string;
}

export interface McpResourceContent {
    type: 'resource';
    resource: McpResourceContents;
}

// ============================================================================
// URI Types
// ============================================================================

export interface ParsedResourceUri {
    scheme: 'protokoll';
    resourceType: ResourceType;
    path: string;
    params: Record<string, string>;
}

export interface TranscriptUri extends ParsedResourceUri {
    resourceType: 'transcript';
    transcriptPath: string;
}

export interface EntityUri extends ParsedResourceUri {
    resourceType: 'entity';
    entityType: 'person' | 'project' | 'term' | 'company' | 'ignored';
    entityId: string;
}

export interface ConfigUri extends ParsedResourceUri {
    resourceType: 'config';
    configPath: string;
}

export interface TranscriptsListUri extends ParsedResourceUri {
    resourceType: 'transcripts-list';
    directory?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
    projectId?: string;
}

export interface EntitiesListUri extends ParsedResourceUri {
    resourceType: 'entities-list';
    entityType: 'person' | 'project' | 'term' | 'company' | 'ignored';
}

export interface AudioInboundUri extends ParsedResourceUri {
    resourceType: 'audio-inbound';
    directory?: string;
}

export interface AudioProcessedUri extends ParsedResourceUri {
    resourceType: 'audio-processed';
    directory?: string;
}

// ============================================================================
// Capability Types
// ============================================================================

export interface McpCapabilities {
    tools?: Record<string, unknown>;
    resources?: {
        subscribe?: boolean;
        listChanged?: boolean;
    };
    prompts?: {
        listChanged?: boolean;
    };
}

// ============================================================================
// Elicitation Types (Client Feature - Server can request user input)
// ============================================================================

/**
 * Elicitation allows servers to request additional information from users.
 * Two modes supported:
 * - form: Structured data collection with JSON schema
 * - url: Direct users to external URLs for sensitive interactions
 */

export type ElicitationMode = 'form' | 'url';

export interface ElicitationFormRequest {
    mode?: 'form';  // Optional for backward compatibility
    message: string;
    requestedSchema: ElicitationSchema;
}

export interface ElicitationUrlRequest {
    mode: 'url';
    message: string;
    url: string;
    elicitationId: string;
}

export type ElicitationRequest = ElicitationFormRequest | ElicitationUrlRequest;

export interface ElicitationSchema {
    type: 'object';
    properties: Record<string, ElicitationPropertySchema>;
    required?: string[];
}

export type ElicitationPropertySchema = 
    | ElicitationStringSchema
    | ElicitationNumberSchema
    | ElicitationBooleanSchema
    | ElicitationEnumSchema;

export interface ElicitationStringSchema {
    type: 'string';
    title?: string;
    description?: string;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: 'email' | 'uri' | 'date' | 'date-time';
    default?: string;
}

export interface ElicitationNumberSchema {
    type: 'number' | 'integer';
    title?: string;
    description?: string;
    minimum?: number;
    maximum?: number;
    default?: number;
}

export interface ElicitationBooleanSchema {
    type: 'boolean';
    title?: string;
    description?: string;
    default?: boolean;
}

export interface ElicitationEnumSchema {
    type: 'string';
    title?: string;
    description?: string;
    enum?: string[];
    oneOf?: Array<{ const: string; title: string }>;
    default?: string;
}

export type ElicitationAction = 'accept' | 'decline' | 'cancel';

export interface ElicitationResponse {
    action: ElicitationAction;
    content?: Record<string, unknown>;
}

// ============================================================================
// Roots Types (Client Feature - Server can discover filesystem boundaries)
// ============================================================================

/**
 * Roots define the boundaries of where the server can operate within the filesystem.
 * The client exposes these roots, and the server can request them.
 */

export interface McpRoot {
    /** Unique identifier - must be a file:// URI */
    uri: string;
    /** Optional human-readable name */
    name?: string;
}

export interface RootsCapability {
    /** Whether the client will emit notifications when roots change */
    listChanged?: boolean;
}
