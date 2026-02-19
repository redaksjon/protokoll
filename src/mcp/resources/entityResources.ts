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
import * as yaml from 'js-yaml';
import { resolve, isAbsolute } from 'node:path';

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
    const configFile = ServerConfig.isInitialized()
        ? ServerConfig.getServerConfig().configFile as { contextDirectories?: string[] } | null
        : null;
    const rawDirs = configFile?.contextDirectories;
    const effectiveDir = contextDirectory || ServerConfig.getWorkspaceRoot() || process.cwd();
    const contextDirs = rawDirs && rawDirs.length > 0
        ? rawDirs.map(d => (isAbsolute(d) ? d : resolve(effectiveDir, d)))
        : undefined;
    // eslint-disable-next-line no-console
    console.log(`   [entity] Looking up ${entityType}/${entityId} (fresh context from ${effectiveDir})`);
    const context = await Context.create({
        startingDir: effectiveDir,
        contextDirectories: contextDirs,
    });

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
