/* eslint-disable import/extensions */
/**
 * Content Tools - Manage entity content (URLs, text, documents, etc.)
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as Context from '@/context';
import type { Entity } from '@/context/types';
import type { ContextInstance } from '@/context';
import { 
    findPersonResilient, 
    findCompanyResilient, 
    findTermResilient, 
    findProjectResilient 
} from '@redaksjon/protokoll-engine';
import {
    createUrlContent,
    createTextContent,
    createMarkdownContent,
    createCodeContent,
    createDocumentContent,
    type EntityContentItem,
} from '@redaksjon/context';

// ============================================================================
// Type Extensions
// ============================================================================

/**
 * Entity with content field
 */
type EntityWithContent = Entity & { content?: EntityContentItem[] };

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get an entity by type and ID from context
 */
function getEntityByType(
    context: ContextInstance,
    entityType: string,
    entityId: string
): Entity | undefined {
    switch (entityType) {
        case 'person':
            return findPersonResilient(context, entityId);
        case 'company':
            return findCompanyResilient(context, entityId);
        case 'term':
            return findTermResilient(context, entityId);
        case 'project':
            return findProjectResilient(context, entityId);
        default:
            return undefined;
    }
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const addContentTool: Tool = {
    name: 'protokoll_add_content',
    description:
        'Add content to an entity (URL, text, markdown, code, document, etc.). ' +
        'Content items have a type, title, content string, and optional metadata. ' +
        'Common types: url, text, markdown, html, code, document, image, video.',
    inputSchema: {
        type: 'object',
        properties: {
            entityType: {
                type: 'string',
                enum: ['person', 'company', 'term', 'project'],
                description: 'Type of the entity',
            },
            entityId: {
                type: 'string',
                description: 'ID of the entity',
            },
            type: {
                type: 'string',
                description: 'Content type (url, text, markdown, html, code, document, image, video, etc.)',
            },
            content: {
                type: 'string',
                description: 'The actual content (URL, text, markdown, code, file path, etc.)',
            },
            title: {
                type: 'string',
                description: 'Title or label for this content',
            },
            mimeType: {
                type: 'string',
                description: 'Optional MIME type (text/plain, text/markdown, application/pdf, etc.)',
            },
            source: {
                type: 'string',
                description: 'Optional source or origin of this content',
            },
            notes: {
                type: 'string',
                description: 'Optional notes about this content',
            },
            metadata: {
                type: 'object',
                description: 'Optional metadata (key-value pairs)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['entityType', 'entityId', 'type', 'content'],
    },
};

export const removeContentTool: Tool = {
    name: 'protokoll_remove_content',
    description:
        'Remove a specific content item from an entity. ' +
        'Identifies the content by title or by index in the content array.',
    inputSchema: {
        type: 'object',
        properties: {
            entityType: {
                type: 'string',
                enum: ['person', 'company', 'term', 'project'],
                description: 'Type of the entity',
            },
            entityId: {
                type: 'string',
                description: 'ID of the entity',
            },
            title: {
                type: 'string',
                description: 'Title of the content item to remove',
            },
            index: {
                type: 'number',
                description: 'Index of the content item to remove (0-based)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['entityType', 'entityId'],
    },
};

export const listContentTool: Tool = {
    name: 'protokoll_list_content',
    description:
        'List all content items for an entity. ' +
        'Returns the content array with types, titles, and metadata. ' +
        'Can filter by content type.',
    inputSchema: {
        type: 'object',
        properties: {
            entityType: {
                type: 'string',
                enum: ['person', 'company', 'term', 'project'],
                description: 'Type of the entity',
            },
            entityId: {
                type: 'string',
                description: 'ID of the entity',
            },
            contentType: {
                type: 'string',
                description: 'Optional: filter by content type (url, text, markdown, etc.)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['entityType', 'entityId'],
    },
};

export const getContentTool: Tool = {
    name: 'protokoll_get_content',
    description:
        'Get a specific content item from an entity. ' +
        'Returns the full content including the content string.',
    inputSchema: {
        type: 'object',
        properties: {
            entityType: {
                type: 'string',
                enum: ['person', 'company', 'term', 'project'],
                description: 'Type of the entity',
            },
            entityId: {
                type: 'string',
                description: 'ID of the entity',
            },
            title: {
                type: 'string',
                description: 'Title of the content item',
            },
            index: {
                type: 'number',
                description: 'Index of the content item (0-based)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['entityType', 'entityId'],
    },
};

// ============================================================================
// Handlers
// ============================================================================

export async function handleAddContent(args: {
    entityType: string;
    entityId: string;
    type: string;
    content: string;
    title?: string;
    mimeType?: string;
    source?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
    contextDirectory?: string;
}): Promise<{ success: boolean; message: string; contentItem: EntityContentItem }> {
    const { entityType, entityId, type, content, title, mimeType, source, notes, metadata, contextDirectory } = args;

    // Get context
    const contextInstance = await Context.create({
        startingDir: contextDirectory || process.cwd(),
    });

    // Get the entity
    const entity = getEntityByType(contextInstance, entityType, entityId);
    if (!entity) {
        throw new Error(`Entity not found: ${entityType}/${entityId}`);
    }

    // Create the content item based on type
    let contentItem: EntityContentItem;
    
    switch (type) {
        case 'url':
            contentItem = createUrlContent(content, title, source, notes);
            break;
        case 'text':
            contentItem = createTextContent(content, title, source, notes);
            break;
        case 'markdown':
            contentItem = createMarkdownContent(content, title, source, notes);
            break;
        case 'code':
            contentItem = createCodeContent(
                content,
                metadata?.language as string || 'text',
                title,
                source,
                notes
            );
            break;
        case 'document':
            contentItem = createDocumentContent(content, title, mimeType, notes);
            break;
        default:
            // Generic content item
            contentItem = {
                type,
                title,
                content,
                mimeType,
                source,
                timestamp: new Date().toISOString(),
                notes,
                metadata,
            };
    }

    // Add to entity's content array
    const updatedEntity = {
        ...entity,
        content: [...((entity as EntityWithContent).content || []), contentItem],
    };

    // Save the entity
    await contextInstance.saveEntity(updatedEntity as Entity);

    return {
        success: true,
        message: `Added ${type} content to ${entityType}/${entityId}`,
        contentItem,
    };
}

export async function handleRemoveContent(args: {
    entityType: string;
    entityId: string;
    title?: string;
    index?: number;
    contextDirectory?: string;
}): Promise<{ success: boolean; message: string }> {
    const { entityType, entityId, title, index, contextDirectory } = args;

    if (title === undefined && index === undefined) {
        throw new Error('Either title or index must be provided');
    }

    // Get context
    const contextInstance = await Context.create({
        startingDir: contextDirectory || process.cwd(),
    });

    // Get the entity
    const entity = getEntityByType(contextInstance, entityType, entityId);
    if (!entity) {
        throw new Error(`Entity not found: ${entityType}/${entityId}`);
    }

    const content = (entity as EntityWithContent).content || [];

    // Find and remove the content item
    let filteredContent: EntityContentItem[];
    let removedTitle: string;

    if (index !== undefined) {
        if (index < 0 || index >= content.length) {
            throw new Error(`Invalid index: ${index}. Content array has ${content.length} items.`);
        }
        removedTitle = content[index].title || `item at index ${index}`;
        filteredContent = content.filter((_: EntityContentItem, i: number) => i !== index);
    } else {
        const foundIndex = content.findIndex((c: EntityContentItem) => c.title === title);
        if (foundIndex === -1) {
            throw new Error(`Content item not found with title: ${title}`);
        }
        removedTitle = title!;
        filteredContent = content.filter((c: EntityContentItem) => c.title !== title);
    }

    // Update entity
    const updatedEntity = {
        ...entity,
        content: filteredContent,
    };

    // Save the entity
    await contextInstance.saveEntity(updatedEntity as Entity);

    return {
        success: true,
        message: `Removed content "${removedTitle}" from ${entityType}/${entityId}`,
    };
}

export async function handleListContent(args: {
    entityType: string;
    entityId: string;
    contentType?: string;
    contextDirectory?: string;
}): Promise<{
    entityId: string;
    entityType: string;
    content: Array<{
        index: number;
        type: string;
        title?: string;
        mimeType?: string;
        source?: string;
        timestamp?: string;
        hasNotes: boolean;
        contentLength: number;
    }>;
}> {
    const { entityType, entityId, contentType, contextDirectory } = args;

    // Get context
    const contextInstance = await Context.create({
        startingDir: contextDirectory || process.cwd(),
    });

    // Get the entity
    const entity = getEntityByType(contextInstance, entityType, entityId);
    if (!entity) {
        throw new Error(`Entity not found: ${entityType}/${entityId}`);
    }

    // Get content
    let content = (entity as EntityWithContent).content || [];

    // Filter by content type if specified
    if (contentType) {
        content = content.filter((c: EntityContentItem) => c.type === contentType);
    }

    // Return summary (without full content strings for brevity)
    const contentSummary = content.map((item: EntityContentItem, index: number) => ({
        index,
        type: item.type,
        title: item.title,
        mimeType: item.mimeType,
        source: item.source,
        timestamp: item.timestamp,
        hasNotes: !!item.notes,
        contentLength: item.content.length,
    }));

    return {
        entityId,
        entityType,
        content: contentSummary,
    };
}

export async function handleGetContent(args: {
    entityType: string;
    entityId: string;
    title?: string;
    index?: number;
    contextDirectory?: string;
}): Promise<{ entityId: string; entityType: string; contentItem: EntityContentItem }> {
    const { entityType, entityId, title, index, contextDirectory } = args;

    if (title === undefined && index === undefined) {
        throw new Error('Either title or index must be provided');
    }

    // Get context
    const contextInstance = await Context.create({
        startingDir: contextDirectory || process.cwd(),
    });

    // Get the entity
    const entity = getEntityByType(contextInstance, entityType, entityId);
    if (!entity) {
        throw new Error(`Entity not found: ${entityType}/${entityId}`);
    }

    const content = (entity as EntityWithContent).content || [];

    // Find the content item
    let contentItem: EntityContentItem | undefined;

    if (index !== undefined) {
        if (index < 0 || index >= content.length) {
            throw new Error(`Invalid index: ${index}. Content array has ${content.length} items.`);
        }
        contentItem = content[index];
    } else {
        contentItem = content.find((c: EntityContentItem) => c.title === title);
        if (!contentItem) {
            throw new Error(`Content item not found with title: ${title}`);
        }
    }

    return {
        entityId,
        entityType,
        contentItem: contentItem!,
    };
}
