/**
 * Entity Resources
 * 
 * Handles reading individual entities and listing entities by type.
 */

import type { McpResourceContents } from '../types';
import { buildEntityUri, buildEntitiesListUri } from '../uri';
import * as Context from '@/context';
import * as yaml from 'js-yaml';

/**
 * Read a single entity resource
 */
export async function readEntityResource(
    entityType: string,
    entityId: string,
    contextDirectory?: string
): Promise<McpResourceContents> {
    const context = await Context.create({
        startingDir: contextDirectory || process.cwd(),
    });

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
        throw new Error(`${entityType} "${entityId}" not found`);
    }

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
    const context = await Context.create({
        startingDir: contextDirectory || process.cwd(),
    });

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
