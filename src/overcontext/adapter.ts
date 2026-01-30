import { 
    discoverOvercontext, 
    OvercontextAPI,
} from '@utilarium/overcontext';
import {
    redaksjonSchemas,
    redaksjonPluralNames,
    Person,
    Project,
    Company,
    Term,
    IgnoredTerm,
    RedaksjonEntity,
    RedaksjonEntityType,
} from '@redaksjon/context';
import { protokollDiscoveryOptions, protokollPluralNames } from './config';
// eslint-disable-next-line no-restricted-imports
import { existsSync, statSync } from 'node:fs';
import * as path from 'node:path';

// Re-export types for backwards compatibility
export type { Person, Project, Company, Term, IgnoredTerm, RedaksjonEntity };
export type EntityType = RedaksjonEntityType;
export type Entity = RedaksjonEntity;

/**
 * StorageInstance interface - matches protokoll's current API.
 */
export interface StorageInstance {
  load(contextDirs: string[]): Promise<void>;
  save(entity: Entity, targetDir: string, allowUpdate?: boolean): Promise<void>;
  delete(type: EntityType, id: string, targetDir: string): Promise<boolean>;
  get<T extends Entity>(type: EntityType, id: string): T | undefined;
  getAll<T extends Entity>(type: EntityType): T[];
  search(query: string): Entity[];
  findBySoundsLike(phonetic: string): Entity | undefined;
  clear(): void;
  getEntityFilePath(type: EntityType, id: string, contextDirs: string[]): string | undefined;
}

/**
 * Create a storage instance backed by overcontext.
 * Maintains API compatibility with protokoll's existing storage.
 */
// Map entity types to their directory names
const TYPE_TO_DIRECTORY: Record<EntityType, string> = {
    person: 'people',
    project: 'projects',
    company: 'companies',
    term: 'terms',
    ignored: 'ignored',
};

export const create = (): StorageInstance => {
    // In-memory cache for sync access (matching original behavior)
    const cache = new Map<EntityType, Map<string, Entity>>();
    let api: OvercontextAPI<typeof redaksjonSchemas> | undefined;
    let loadedContextDirs: string[] = [];
  
    const initCache = () => {
        cache.set('person', new Map());
        cache.set('project', new Map());
        cache.set('company', new Map());
        cache.set('term', new Map());
        cache.set('ignored', new Map());
    };
  
    initCache();
  
    return {
        async load(contextDirs: string[]): Promise<void> {
            initCache();
            loadedContextDirs = contextDirs;
            
            // If no context directories, leave API undefined (empty context)
            if (contextDirs.length === 0) {
                api = undefined;
                return;
            }
      
            try {
                // contextDirs are already resolved paths (e.g., /path/to/context or /path/to/.protokoll/context)
                // We need to determine the parent directory to start overcontext discovery from
                // The context directory could be at different levels depending on configuration
                
                // Take the last (most specific) context dir
                const lastContextDir = contextDirs[contextDirs.length - 1];
                
                // Get the parent directory of the context directory
                // This will be the directory containing the context/ folder
                const startDir = path.dirname(lastContextDir);
                
                // Create overcontext API with hierarchical discovery
                // Note: We use 'context' as contextDirName since we're starting from the parent
                api = await discoverOvercontext({
                    schemas: redaksjonSchemas,
                    pluralNames: redaksjonPluralNames, // Use standard names without context/ prefix
                    startDir,
                    contextDirName: path.basename(lastContextDir), // Use actual context dir name
                    maxLevels: 10,
                });
      
                // Load all entities into cache
                for (const type of ['person', 'project', 'company', 'term', 'ignored'] as EntityType[]) {
                    const entities = await api.getAll(type);
                    for (const entity of entities) {
                        cache.get(type)?.set(entity.id, entity as Entity);
                    }
                }
            } catch (error) {
                // If no context directory found, leave API undefined (empty context)
                if (error instanceof Error && error.message.includes('No context directory found')) {
                    api = undefined;
                } else {
                    throw error;
                }
            }
        },
    
        async save(entity: Entity, _targetDir: string, allowUpdate = false): Promise<void> {
            // Check if entity already exists (for duplicate detection)
            const existing = cache.get(entity.type)?.get(entity.id);
            if (existing && !allowUpdate) {
                throw new Error(`Entity with id "${entity.id}" already exists`);
            }

            // If no API (empty context), just update cache (in-memory only)
            if (!api) {
                cache.get(entity.type)?.set(entity.id, entity);
                return;
            }
      
            // Save via overcontext (upsert will create or update)
            const saved = await api.upsert(entity.type, entity);
      
            // Update cache
            cache.get(entity.type)?.set(saved.id, saved as Entity);
        },
    
        async delete(type: EntityType, id: string, _targetDir: string): Promise<boolean> {
            if (!api) return false;
      
            const deleted = await api.delete(type, id);
            if (deleted) {
                cache.get(type)?.delete(id);
            }
            return deleted;
        },
    
        get<T extends Entity>(type: EntityType, id: string): T | undefined {
            return cache.get(type)?.get(id) as T | undefined;
        },
    
        getAll<T extends Entity>(type: EntityType): T[] {
            return Array.from(cache.get(type)?.values() ?? []) as T[];
        },
    
        search(query: string): Entity[] {
            const normalizedQuery = query.toLowerCase();
            const results: Entity[] = [];
            const seen = new Set<string>();
      
            for (const entityMap of cache.values()) {
                for (const entity of entityMap.values()) {
                    if (seen.has(entity.id)) continue;
          
                    // Check name
                    if (entity.name.toLowerCase().includes(normalizedQuery)) {
                        results.push(entity);
                        seen.add(entity.id);
                        continue;
                    }
          
                    // Check sounds_like
                    const sounds = (entity as Entity & { sounds_like?: string[] }).sounds_like;
                    if (sounds?.some((s: string) => s.toLowerCase().includes(normalizedQuery))) {
                        results.push(entity);
                        seen.add(entity.id);
                    }
                }
            }
      
            return results;
        },
    
        findBySoundsLike(phonetic: string): Entity | undefined {
            const normalized = phonetic.toLowerCase().trim();
      
            for (const entityMap of cache.values()) {
                for (const entity of entityMap.values()) {
                    const sounds = (entity as Entity & { sounds_like?: string[] }).sounds_like;
                    if (sounds?.some((s: string) => s.toLowerCase() === normalized)) {
                        return entity;
                    }
                }
            }
      
            return undefined;
        },
    
        clear(): void {
            initCache();
            api = undefined;
        },
    
        getEntityFilePath(type: EntityType, id: string, contextDirs: string[]): string | undefined {
            const dirName = TYPE_TO_DIRECTORY[type];
            const dirsToSearch = contextDirs.length > 0 ? contextDirs : loadedContextDirs;
            
            // Search in reverse order (closest first) to find where the entity is defined
            for (const contextDir of [...dirsToSearch].reverse()) {
                const possiblePaths = [
                    path.join(contextDir, dirName, `${id}.yaml`),
                    path.join(contextDir, dirName, `${id}.yml`),
                ];
                
                for (const filePath of possiblePaths) {
                    // Use sync access check - this is only for CLI, not hot path
                    if (existsSync(filePath)) {
                        const stat = statSync(filePath);
                        if (stat.isFile()) {
                            return filePath;
                        }
                    }
                }
            }
            
            return undefined;
        },
    };
};
