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
import { createGcsStorageProvider } from '../storage/gcsProvider';

type EntityType = 'person' | 'project' | 'term' | 'company' | 'ignored';

const ENTITY_DIRECTORY: Record<EntityType, string> = {
    person: 'people',
    project: 'projects',
    term: 'terms',
    company: 'companies',
    ignored: 'ignored',
};

function buildContextGcsUri(): { uri: string; projectId?: string; credentialsFile?: string } | null {
    const storageConfig = ServerConfig.getStorageConfig();
    if (storageConfig.backend !== 'gcs' || !storageConfig.gcs) {
        return null;
    }

    const gcs = storageConfig.gcs;
    const contextUri = gcs.contextUri
        || (gcs.contextBucket
            ? `gs://${gcs.contextBucket}/${(gcs.contextPrefix || '').replace(/^\/+|\/+$/g, '')}`
            : undefined);
    if (!contextUri) {
        return null;
    }

    return {
        uri: contextUri,
        projectId: gcs.projectId,
        credentialsFile: gcs.credentialsFile,
    };
}

async function loadEntitiesFromGcs(entityType: EntityType): Promise<Array<Record<string, unknown>>> {
    const contextGcs = buildContextGcsUri();
    if (!contextGcs) {
        return [];
    }

    const provider = createGcsStorageProvider(contextGcs.uri, contextGcs.credentialsFile, contextGcs.projectId);
    const directory = ENTITY_DIRECTORY[entityType];
    const files = await provider.listFiles(`${directory}/`);
    const yamlFiles = files.filter((pathValue) => pathValue.endsWith('.yaml') || pathValue.endsWith('.yml'));
    const entities: Array<Record<string, unknown>> = [];

    for (const filePath of yamlFiles) {
        try {
            const raw = await provider.readFile(filePath);
            const parsed = yaml.load(raw.toString('utf8'));
            if (parsed && typeof parsed === 'object') {
                entities.push(parsed as Record<string, unknown>);
            }
        } catch {
            // Ignore unreadable YAML entries so one bad file does not block all entities.
        }
    }

    return entities;
}

async function findEntityInGcs(entityType: EntityType, entityId: string): Promise<Record<string, unknown> | null> {
    const entities = await loadEntitiesFromGcs(entityType);
    const normalized = entityId.trim().toLowerCase();
    const prefix = normalized.match(/^([a-f0-9]{8})/)?.[1];

    for (const entity of entities) {
        const id = typeof entity.id === 'string' ? entity.id : '';
        const slug = typeof entity.slug === 'string' ? entity.slug : '';
        const idLower = id.toLowerCase();
        const slugLower = slug.toLowerCase();

        if (idLower === normalized || slugLower === normalized) {
            return entity;
        }
        if (normalized && (idLower.startsWith(normalized) || normalized.startsWith(idLower))) {
            return entity;
        }
        if (prefix && idLower.startsWith(prefix)) {
            return entity;
        }
    }

    return null;
}

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
            const gcsEntity = await findEntityInGcs(entityType as EntityType, entityId);
            if (gcsEntity) {
                const yamlContent = yaml.dump(gcsEntity);
                return {
                    uri: buildEntityUri(entityType as any, entityId),
                    mimeType: 'application/yaml',
                    text: yamlContent,
                };
            }
        }
    }

    const effectiveDir = contextDirectory || ServerConfig.getWorkspaceRoot() || process.cwd();
    // eslint-disable-next-line no-console
    console.log(`   [entity] Looking up ${entityType}/${entityId} (context from ${effectiveDir})`);
    const context = await createToolContext(contextDirectory);

    if (!context.hasContext()) {
        const searchDir = contextDirectory || process.cwd();
        // eslint-disable-next-line no-console
        console.log(`   [entity] ❌ No Protokoll context found in ${searchDir}`);
        throw new Error(`No Protokoll context found. Expected .protokoll/ or context dirs in ${searchDir}`);
    }

    let entity;
    switch (entityType) {
        case 'person':
            entity = context.getPerson(entityId);
            break;
        case 'project':
            entity = context.getProject(entityId);
            break;
        case 'term':
            entity = context.getTerm(entityId);
            break;
        case 'company':
            entity = context.getCompany(entityId);
            break;
        case 'ignored':
            entity = context.getIgnored(entityId);
            break;
        default:
            throw new Error(`Unknown entity type: ${entityType}`);
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
        // eslint-disable-next-line no-console
        console.log(`   [entity] ❌ ${entityType} "${entityId}" not found. Available ${entityType} IDs: ${allIds.join(', ') || '(none)'}`);
        throw new Error(`${entityType} "${entityId}" not found`);
    }

    // eslint-disable-next-line no-console
    console.log(`   [entity] ✅ Found ${entityType}`);

    // Convert to YAML for readability
    const yamlContent = yaml.dump(entity);

    return {
        uri: buildEntityUri(entityType as any, entityId),
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
            const entitiesFromGcs = await loadEntitiesFromGcs(entityType as EntityType);
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
