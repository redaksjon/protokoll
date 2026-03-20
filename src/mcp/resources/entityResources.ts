/**
 * Entity Resources
 * 
 * Handles reading individual entities and listing entities by type.
 */

import type { McpResourceContents } from '../types';
import { buildEntityUri, buildEntitiesListUri } from '../uri';
import * as Context from '@/context';
import type { ContextInstance } from '@/context';
import * as ServerConfig from '../serverConfig';
import { createToolContext } from '../tools/shared';
import * as yaml from 'js-yaml';
import { resolve, isAbsolute } from 'node:path';
import Logging from '@fjell/logging';
import { findContextEntityInGcs, listContextEntitiesFromGcs } from './entityIndexService';
import { entityIdLookupOrder } from '../util/scopedEntityId';

type EntityType = 'person' | 'project' | 'term' | 'company' | 'ignored';
const logger = Logging.getLogger('@redaksjon/protokoll-mcp').get('entity-resources');

/** YAML keys that may hold large plan lists — omitted from entity resources; use protokoll_list_project_plans. */
const PROJECT_PLAN_ARRAY_KEYS = ['related_plans', 'plans', 'riotplan_plans'] as const;

function stripProjectPlanArraysForResource(entity: unknown): Record<string, unknown> {
    const base =
        entity && typeof entity === 'object' && !Array.isArray(entity)
            ? { ...(entity as Record<string, unknown>) }
            : {};
    let totalRows = 0;
    for (const k of PROJECT_PLAN_ARRAY_KEYS) {
        const v = base[k];
        if (Array.isArray(v)) {
            totalRows += v.length;
        }
    }
    for (const k of PROJECT_PLAN_ARRAY_KEYS) {
        const v = base[k];
        if (Array.isArray(v) && v.length > 0) {
            delete base[k];
        }
    }
    if (totalRows > 0) {
        base.related_plans_total = totalRows;
    }
    return base;
}

const ENTITY_DIRECTORY: Record<EntityType, string> = {
    person: 'people',
    project: 'projects',
    term: 'terms',
    company: 'companies',
    ignored: 'ignored',
};

/**
 * Read a single entity resource.
 * Always creates a fresh context to ensure we read the latest data from disk,
 * since entity edit tools write directly to disk with their own context instances.
 */
export async function readEntityResource(
    entityType: string,
    entityId: string,
    contextDirectory?: string
): Promise<McpResourceContents> {
    if ((entityType as EntityType) in ENTITY_DIRECTORY && ServerConfig.isInitialized()) {
        const storageConfig = ServerConfig.getStorageConfig();
        if (storageConfig.backend === 'gcs') {
            for (const tryId of entityIdLookupOrder(entityId)) {
                const gcsEntity = await findContextEntityInGcs(entityType as EntityType, tryId);
                if (gcsEntity) {
                    const idForUri =
                        typeof (gcsEntity as { id?: unknown }).id === 'string'
                            ? String((gcsEntity as { id: string }).id).trim()
                            : tryId;
                    const toDump =
                        entityType === 'project'
                            ? stripProjectPlanArraysForResource(gcsEntity)
                            : gcsEntity;
                    const yamlContent = yaml.dump(toDump);
                    return {
                        uri: buildEntityUri(entityType as any, idForUri),
                        mimeType: 'application/yaml',
                        text: yamlContent,
                    };
                }
            }
        }
    }

    const effectiveDir = contextDirectory || ServerConfig.getWorkspaceRoot() || process.cwd();
    logger.info('entity.read.lookup', {
        entityType,
        entityId,
        effectiveDir,
    });
    const context = await createToolContext(contextDirectory);
    try {
        await context.reload();
    } catch (error) {
        logger.debug('entity.read.context_reload_failed', {
            entityType,
            entityId,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    if (!context.hasContext()) {
        const searchDir = contextDirectory || process.cwd();
        logger.warning('entity.read.missing_context', {
            entityType,
            entityId,
            searchDir,
        });
        throw new Error(`No Protokoll context found. Expected .protokoll/ or context dirs in ${searchDir}`);
    }

    const lookupEntityById = (
        candidate: ContextInstance,
        forId: string,
    ): ReturnType<ContextInstance['getPerson']> | ReturnType<ContextInstance['getProject']> | ReturnType<ContextInstance['getTerm']> | ReturnType<ContextInstance['getCompany']> | ReturnType<ContextInstance['getIgnored']> => {
        switch (entityType) {
            case 'person':
                return candidate.getPerson(forId);
            case 'project':
                return candidate.getProject(forId);
            case 'term':
                return candidate.getTerm(forId);
            case 'company':
                return candidate.getCompany(forId);
            case 'ignored':
                return candidate.getIgnored(forId);
            default:
                throw new Error(`Unknown entity type: ${entityType}`);
        }
    };

    const serverContext = ServerConfig.isInitialized() ? ServerConfig.getContext() : undefined;
    if (serverContext?.hasContext() && serverContext !== context) {
        try {
            await serverContext.reload();
        } catch (error) {
            logger.debug('entity.read.server_context_reload_failed', {
                entityType,
                entityId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    let entity:
        | ReturnType<ContextInstance['getPerson']>
        | ReturnType<ContextInstance['getProject']>
        | ReturnType<ContextInstance['getTerm']>
        | ReturnType<ContextInstance['getCompany']>
        | ReturnType<ContextInstance['getIgnored']>
        | undefined;

    for (const tryId of entityIdLookupOrder(entityId)) {
        entity = lookupEntityById(context, tryId);
        if (entity) {
            break;
        }
        if (serverContext?.hasContext() && serverContext !== context) {
            entity = lookupEntityById(serverContext, tryId);
            if (entity) {
                logger.info('entity.read.server_context_fallback_hit', {
                    entityType,
                    entityId,
                    tryId,
                });
                break;
            }
        }
    }

    if (!entity) {
        // Debug: list available IDs for this type to help diagnose "not found"
        const allIds =
            entityType === 'person' ? context.getAllPeople().map(p => p.id)
                : entityType === 'project' ? context.getAllProjects().map(p => p.id)
                    : entityType === 'term' ? context.getAllTerms().map(t => t.id)
                        : entityType === 'company' ? context.getAllCompanies().map(c => c.id)
                            : entityType === 'ignored' ? context.getAllIgnored().map(i => i.id)
                                : [];
        logger.warning('entity.read.not_found', {
            entityType,
            entityId,
            availableCount: allIds.length,
        });
        throw new Error(`${entityType} "${entityId}" not found`);
    }

    const canonicalId = entity.id;

    logger.info('entity.read.found', {
        entityType,
        entityId,
        canonicalId: canonicalId !== entityId ? canonicalId : undefined,
    });

    // Convert to YAML for readability (strip heavy plan arrays from project resources)
    const payload = entityType === 'project' ? stripProjectPlanArraysForResource(entity) : entity;
    const yamlContent = yaml.dump(payload);

    return {
        uri: buildEntityUri(entityType as any, canonicalId),
        mimeType: 'application/yaml',
        text: yamlContent,
    };
}

/**
 * Read a list of entities by type
 */
export async function readEntitiesListResource(
    entityType: string,
    contextDirectory?: string
): Promise<McpResourceContents> {
    if ((entityType as EntityType) in ENTITY_DIRECTORY && ServerConfig.isInitialized()) {
        const storageConfig = ServerConfig.getStorageConfig();
        if (storageConfig.backend === 'gcs') {
            const entitiesFromGcs = await listContextEntitiesFromGcs(entityType as EntityType);
            const entities = entitiesFromGcs.map((entity) => {
                const id = String(entity.id || '');
                const name = String(entity.name || '');
                return {
                    uri: buildEntityUri(entityType as any, id),
                    id,
                    name,
                    ...entity,
                };
            });

            const responseData = {
                entityType,
                count: entities.length,
                entities,
            };

            return {
                uri: buildEntitiesListUri(entityType as any),
                mimeType: 'application/json',
                text: JSON.stringify(responseData, null, 2),
            };
        }
    }

    // Use server's pre-initialized context when available (HTTP/remote mode with protokoll-config.yaml)
    let context: ContextInstance;
    if (ServerConfig.isInitialized()) {
        const serverContext = ServerConfig.getContext();
        if (serverContext?.hasContext()) {
            context = serverContext;
        } else {
            const configFile = ServerConfig.getServerConfig().configFile as { contextDirectories?: string[] } | null;
            const rawDirs = configFile?.contextDirectories;
            const effectiveDir = contextDirectory || ServerConfig.getWorkspaceRoot() || process.cwd();
            const contextDirs = rawDirs && rawDirs.length > 0
                ? rawDirs.map(d => (isAbsolute(d) ? d : resolve(effectiveDir, d)))
                : undefined;
            context = await Context.create({
                startingDir: effectiveDir,
                contextDirectories: contextDirs,
            });
        }
    } else {
        context = await Context.create({
            startingDir: contextDirectory || process.cwd(),
        });
    }

    if (!context.hasContext()) {
        throw new Error('No Protokoll context found');
    }

    let entities: Array<{ id: string; name: string; [key: string]: unknown }>;
    
    switch (entityType) {
        case 'person':
            entities = context.getAllPeople().map(p => ({
                uri: buildEntityUri('person', p.id),
                id: p.id,
                name: p.name,
                company: p.company,
                role: p.role,
            }));
            break;
        case 'project':
            entities = context.getAllProjects().map(p => ({
                uri: buildEntityUri('project', p.id),
                id: p.id,
                name: p.name,
                active: p.active !== false,
                destination: p.routing?.destination,
            }));
            break;
        case 'term':
            entities = context.getAllTerms().map(t => ({
                uri: buildEntityUri('term', t.id),
                id: t.id,
                name: t.name,
                expansion: t.expansion,
                domain: t.domain,
            }));
            break;
        case 'company':
            entities = context.getAllCompanies().map(c => ({
                uri: buildEntityUri('company', c.id),
                id: c.id,
                name: c.name,
                fullName: c.fullName,
                industry: c.industry,
            }));
            break;
        case 'ignored':
            entities = context.getAllIgnored().map(i => ({
                uri: buildEntityUri('ignored', i.id),
                id: i.id,
                name: i.name,
                reason: i.reason,
            }));
            break;
        default:
            throw new Error(`Unknown entity type: ${entityType}`);
    }

    const responseData = {
        entityType,
        count: entities.length,
        entities,
    };

    return {
        uri: buildEntitiesListUri(entityType as any),
        mimeType: 'application/json',
        text: JSON.stringify(responseData, null, 2),
    };
}
