/**
 * Context Storage
 * 
 * Handles loading and saving entity YAML files from context directories.
 * Supports hierarchical loading where later directories override earlier ones.
 * 
 * Design Note: This module is designed to be self-contained and may be
 * extracted for use in other tools (kronologi, observasjon) in the future.
 */

import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import { Entity, EntityType } from './types';

export interface StorageInstance {
  load(contextDirs: string[]): Promise<void>;
  save(entity: Entity, targetDir: string): Promise<void>;
  get<T extends Entity>(type: EntityType, id: string): T | undefined;
  getAll<T extends Entity>(type: EntityType): T[];
  search(query: string): Entity[];
  findBySoundsLike(phonetic: string): Entity | undefined;
  clear(): void;
}

type DirectoryName = 'people' | 'projects' | 'companies' | 'terms';

const DIRECTORY_TO_TYPE: Record<DirectoryName, EntityType> = {
    'people': 'person',
    'projects': 'project',
    'companies': 'company',
    'terms': 'term',
};

const TYPE_TO_DIRECTORY: Record<EntityType, DirectoryName> = {
    'person': 'people',
    'project': 'projects',
    'company': 'companies',
    'term': 'terms',
};

export const create = (): StorageInstance => {
    const entities: Map<EntityType, Map<string, Entity>> = new Map([
        ['person', new Map()],
        ['project', new Map()],
        ['company', new Map()],
        ['term', new Map()],
    ]);

    const load = async (contextDirs: string[]): Promise<void> => {
    // Load from all context directories (later directories override)
        for (const contextDir of contextDirs) {
            for (const dirName of Object.keys(DIRECTORY_TO_TYPE) as DirectoryName[]) {
                const typeDir = path.join(contextDir, dirName);
                const entityType = DIRECTORY_TO_TYPE[dirName];
        
                try {
                    const files = await fs.readdir(typeDir);
                    for (const file of files) {
                        if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
            
                        const content = await fs.readFile(path.join(typeDir, file), 'utf-8');
                        const parsed = yaml.load(content) as Partial<Entity>;
            
                        if (parsed && parsed.id) {
                            entities.get(entityType)?.set(parsed.id, {
                                ...parsed,
                                type: entityType,
                            } as Entity);
                        }
                    }
                } catch {
                    // Directory doesn't exist, skip
                }
            }
        }
    };

    const save = async (entity: Entity, targetDir: string): Promise<void> => {
        const dirName = TYPE_TO_DIRECTORY[entity.type];
        const dirPath = path.join(targetDir, 'context', dirName);
        await fs.mkdir(dirPath, { recursive: true });
    
        const filePath = path.join(dirPath, `${entity.id}.yaml`);
    
        // Remove type from saved YAML (it's inferred from directory)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { type: _entityType, ...entityWithoutType } = entity;
        const content = yaml.dump(entityWithoutType, { lineWidth: -1 });
        await fs.writeFile(filePath, content, 'utf-8');
    
        entities.get(entity.type)?.set(entity.id, entity);
    };

    const get = <T extends Entity>(type: EntityType, id: string): T | undefined => {
        return entities.get(type)?.get(id) as T | undefined;
    };

    const getAll = <T extends Entity>(type: EntityType): T[] => {
        return Array.from(entities.get(type)?.values() ?? []) as T[];
    };

    const search = (query: string): Entity[] => {
        const normalizedQuery = query.toLowerCase();
        const results: Entity[] = [];
    
        for (const entityMap of entities.values()) {
            for (const entity of entityMap.values()) {
                if (entity.name.toLowerCase().includes(normalizedQuery)) {
                    results.push(entity);
                }
            }
        }
    
        return results;
    };

    const findBySoundsLike = (phonetic: string): Entity | undefined => {
        const normalized = phonetic.toLowerCase().trim();
    
        for (const entityMap of entities.values()) {
            for (const entity of entityMap.values()) {
                // Check sounds_like field on entities that have it
                const entityWithSoundsLike = entity as Entity & { sounds_like?: string[] };
                const variants = entityWithSoundsLike.sounds_like;
                if (variants?.some(v => v.toLowerCase() === normalized)) {
                    return entity;
                }
            }
        }
    
        return undefined;
    };

    const clear = (): void => {
        for (const entityMap of entities.values()) {
            entityMap.clear();
        }
    };

    return { load, save, get, getAll, search, findBySoundsLike, clear };
};

