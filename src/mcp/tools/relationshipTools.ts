/* eslint-disable import/extensions */
/**
 * Relationship Tools - Manage entity relationships
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as Context from '@/context';
import type { Entity } from '@/context/types';
import type { ContextInstance } from '@/context';
import { parseEntityUri, createRelationship, type EntityRelationship } from '@redaksjon/context';
import { 
    findPersonResilient, 
    findCompanyResilient, 
    findTermResilient, 
    findProjectResilient 
} from '@redaksjon/protokoll-engine';

// ============================================================================
// Type Extensions
// ============================================================================

/**
 * Entity with relationships field
 */
type EntityWithRelationships = Entity & { relationships?: EntityRelationship[] };

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

export const addRelationshipTool: Tool = {
    name: 'protokoll_add_relationship',
    description:
        'Add a relationship between two entities. ' +
        'Relationships use URIs (redaksjon://{type}/{id}) to reference entities. ' +
        'Common relationship types: works_at, manages, reports_to, used_in, part_of, expert_in, etc.',
    inputSchema: {
        type: 'object',
        properties: {
            entityType: {
                type: 'string',
                enum: ['person', 'company', 'term', 'project'],
                description: 'Type of the source entity',
            },
            entityId: {
                type: 'string',
                description: 'ID of the source entity',
            },
            targetType: {
                type: 'string',
                enum: ['person', 'company', 'term', 'project'],
                description: 'Type of the target entity',
            },
            targetId: {
                type: 'string',
                description: 'ID of the target entity',
            },
            relationship: {
                type: 'string',
                description: 'Type of relationship (e.g., works_at, manages, used_in, part_of)',
            },
            notes: {
                type: 'string',
                description: 'Optional notes about this relationship',
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
        required: ['entityType', 'entityId', 'targetType', 'targetId', 'relationship'],
    },
};

export const removeRelationshipTool: Tool = {
    name: 'protokoll_remove_relationship',
    description:
        'Remove a specific relationship from an entity. ' +
        'Identifies the relationship by target URI and relationship type.',
    inputSchema: {
        type: 'object',
        properties: {
            entityType: {
                type: 'string',
                enum: ['person', 'company', 'term', 'project'],
                description: 'Type of the source entity',
            },
            entityId: {
                type: 'string',
                description: 'ID of the source entity',
            },
            targetUri: {
                type: 'string',
                description: 'URI of the target entity (redaksjon://{type}/{id})',
            },
            relationship: {
                type: 'string',
                description: 'Type of relationship to remove',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['entityType', 'entityId', 'targetUri', 'relationship'],
    },
};

export const listRelationshipsTool: Tool = {
    name: 'protokoll_list_relationships',
    description:
        'List all relationships for an entity. ' +
        'Returns the relationships array with URIs, types, notes, and metadata.',
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
            relationshipType: {
                type: 'string',
                description: 'Optional: filter by relationship type',
            },
            contextDirectory: {
                type: 'string',
                description: 'Path to the .protokoll context directory',
            },
        },
        required: ['entityType', 'entityId'],
    },
};

export const findRelatedEntitiesTool: Tool = {
    name: 'protokoll_find_related_entities',
    description:
        'Find all entities related to a given entity. ' +
        'Can filter by relationship type and target entity type.',
    inputSchema: {
        type: 'object',
        properties: {
            entityType: {
                type: 'string',
                enum: ['person', 'company', 'term', 'project'],
                description: 'Type of the source entity',
            },
            entityId: {
                type: 'string',
                description: 'ID of the source entity',
            },
            relationshipType: {
                type: 'string',
                description: 'Optional: filter by relationship type (e.g., works_at, manages)',
            },
            targetType: {
                type: 'string',
                enum: ['person', 'company', 'term', 'project'],
                description: 'Optional: filter by target entity type',
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

export async function handleAddRelationship(args: {
    entityType: string;
    entityId: string;
    targetType: string;
    targetId: string;
    relationship: string;
    notes?: string;
    metadata?: Record<string, unknown>;
    contextDirectory?: string;
}): Promise<{ success: boolean; message: string; relationship: EntityRelationship }> {
    const { entityType, entityId, targetType, targetId, relationship, notes, metadata, contextDirectory } = args;

    // Get context
    const contextInstance = await Context.create({
        startingDir: contextDirectory || process.cwd(),
    });

    // Get the entity
    const entity = getEntityByType(contextInstance, entityType, entityId);
    if (!entity) {
        throw new Error(`Entity not found: ${entityType}/${entityId}`);
    }

    // Verify target entity exists
    const targetEntity = getEntityByType(contextInstance, targetType, targetId);
    if (!targetEntity) {
        throw new Error(`Target entity not found: ${targetType}/${targetId}`);
    }

    // Create the relationship
    const newRelationship = createRelationship(targetType, targetId, relationship, notes, metadata);

    // Add to entity's relationships array
    const updatedEntity = {
        ...entity,
        relationships: [...((entity as EntityWithRelationships).relationships || []), newRelationship],
    };

    // Save the entity
    await contextInstance.saveEntity(updatedEntity as Entity);

    return {
        success: true,
        message: `Added ${relationship} relationship from ${entityType}/${entityId} to ${targetType}/${targetId}`,
        relationship: newRelationship,
    };
}

export async function handleRemoveRelationship(args: {
    entityType: string;
    entityId: string;
    targetUri: string;
    relationship: string;
    contextDirectory?: string;
}): Promise<{ success: boolean; message: string }> {
    const { entityType, entityId, targetUri, relationship, contextDirectory } = args;

    // Get context
    const contextInstance = await Context.create({
        startingDir: contextDirectory || process.cwd(),
    });

    // Get the entity
    const entity = getEntityByType(contextInstance, entityType, entityId);
    if (!entity) {
        throw new Error(`Entity not found: ${entityType}/${entityId}`);
    }

    // Filter out the relationship
    const relationships = (entity as EntityWithRelationships).relationships || [];
    const filteredRelationships = relationships.filter(
        (r: EntityRelationship) => !(r.uri === targetUri && r.relationship === relationship)
    );

    if (filteredRelationships.length === relationships.length) {
        throw new Error(`Relationship not found: ${relationship} to ${targetUri}`);
    }

    // Update entity
    const updatedEntity = {
        ...entity,
        relationships: filteredRelationships,
    };

    // Save the entity
    await contextInstance.saveEntity(updatedEntity as Entity);

    return {
        success: true,
        message: `Removed ${relationship} relationship to ${targetUri}`,
    };
}

export async function handleListRelationships(args: {
    entityType: string;
    entityId: string;
    relationshipType?: string;
    contextDirectory?: string;
}): Promise<{ entityId: string; entityType: string; relationships: EntityRelationship[] }> {
    const { entityType, entityId, relationshipType, contextDirectory } = args;

    // Get context
    const contextInstance = await Context.create({
        startingDir: contextDirectory || process.cwd(),
    });

    // Get the entity
    const entity = getEntityByType(contextInstance, entityType, entityId);
    if (!entity) {
        throw new Error(`Entity not found: ${entityType}/${entityId}`);
    }

    // Get relationships
    let relationships = (entity as EntityWithRelationships).relationships || [];

    // Filter by relationship type if specified
    if (relationshipType) {
        relationships = relationships.filter((r: EntityRelationship) => r.relationship === relationshipType);
    }

    return {
        entityId,
        entityType,
        relationships,
    };
}

export async function handleFindRelatedEntities(args: {
    entityType: string;
    entityId: string;
    relationshipType?: string;
    targetType?: string;
    contextDirectory?: string;
}): Promise<{
    entityId: string;
    entityType: string;
    relatedEntities: Array<{
        relationship: string;
        targetType: string;
        targetId: string;
        targetName: string;
        notes?: string;
    }>;
}> {
    const { entityType, entityId, relationshipType, targetType, contextDirectory } = args;

    // Get context
    const contextInstance = await Context.create({
        startingDir: contextDirectory || process.cwd(),
    });

    // Get the entity
    const entity = getEntityByType(contextInstance, entityType, entityId);
    if (!entity) {
        throw new Error(`Entity not found: ${entityType}/${entityId}`);
    }

    // Get relationships
    let relationships = (entity as EntityWithRelationships).relationships || [];

    // Filter by relationship type if specified
    if (relationshipType) {
        relationships = relationships.filter((r: EntityRelationship) => r.relationship === relationshipType);
    }

    // Parse URIs and fetch target entities
    const relatedEntities = relationships
        .map((rel: EntityRelationship) => {
            const parsed = parseEntityUri(rel.uri);
            if (!parsed) return null;

            // Filter by target type if specified
            if (targetType && parsed.type !== targetType) return null;

            // Get the target entity
            const targetEntity = getEntityByType(contextInstance, parsed.type, parsed.id);

            if (!targetEntity) return null;

            return {
                relationship: rel.relationship,
                targetType: parsed.type,
                targetId: parsed.id,
                targetName: targetEntity.name,
                notes: rel.notes,
            };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
        entityId,
        entityType,
        relatedEntities,
    };
}
