/**
 * Context System
 * 
 * Main entry point for the context system. Provides a factory function
 * to create context instances that can discover, load, and manage
 * entity data from hierarchical .protokoll directories.
 * 
 * Design Note: This module is designed to be self-contained and may be
 * extracted for use in other tools (kronologi, observasjon) in the future.
 */

import { 
    Entity, 
    Person, 
    Project, 
    Company, 
    Term, 
    ContextDiscoveryOptions,
    DiscoveredContextDir,
    HierarchicalContextResult 
} from './types';
import * as Storage from './storage';
import * as Discovery from './discovery';

export interface ContextInstance {
  // Initialization
  load(): Promise<void>;
  reload(): Promise<void>;
  
  // Discovery info
  getDiscoveredDirs(): DiscoveredContextDir[];
  getConfig(): Record<string, unknown>;
  
  // Entity access
  getPerson(id: string): Person | undefined;
  getProject(id: string): Project | undefined;
  getCompany(id: string): Company | undefined;
  getTerm(id: string): Term | undefined;
  
  getAllPeople(): Person[];
  getAllProjects(): Project[];
  getAllCompanies(): Company[];
  getAllTerms(): Term[];
  
  // Search
  search(query: string): Entity[];
  findBySoundsLike(phonetic: string): Entity | undefined;
  
  // Modification (for self-update mode)
  saveEntity(entity: Entity): Promise<void>;
  
  // Check if context is available
  hasContext(): boolean;
}

export interface CreateOptions {
  startingDir?: string;
  configDirName?: string;
  configFileName?: string;
}

/**
 * Create a new context instance
 */
export const create = async (options: CreateOptions = {}): Promise<ContextInstance> => {
    const discoveryOptions: ContextDiscoveryOptions = {
        configDirName: options.configDirName ?? '.protokoll',
        configFileName: options.configFileName ?? 'config.yaml',
        startingDir: options.startingDir,
    };

    const storage = Storage.create();
    let discoveryResult: HierarchicalContextResult = {
        config: {},
        discoveredDirs: [],
        contextDirs: [],
    };

    const loadContext = async (): Promise<void> => {
        discoveryResult = await Discovery.loadHierarchicalConfig(discoveryOptions);
        storage.clear();
        await storage.load(discoveryResult.contextDirs);
    };

    // Initial load
    await loadContext();

    return {
        load: loadContext,
    
        reload: async () => {
            storage.clear();
            await storage.load(discoveryResult.contextDirs);
        },
    
        getDiscoveredDirs: () => discoveryResult.discoveredDirs,
        getConfig: () => discoveryResult.config,
    
        getPerson: (id) => storage.get<Person>('person', id),
        getProject: (id) => storage.get<Project>('project', id),
        getCompany: (id) => storage.get<Company>('company', id),
        getTerm: (id) => storage.get<Term>('term', id),
    
        getAllPeople: () => storage.getAll<Person>('person'),
        getAllProjects: () => storage.getAll<Project>('project'),
        getAllCompanies: () => storage.getAll<Company>('company'),
        getAllTerms: () => storage.getAll<Term>('term'),
    
        search: (query) => storage.search(query),
        findBySoundsLike: (phonetic) => storage.findBySoundsLike(phonetic),
    
        saveEntity: async (entity) => {
            // Save to the closest .protokoll directory
            const closestDir = discoveryResult.discoveredDirs
                .sort((a, b) => a.level - b.level)[0];
      
            if (!closestDir) {
                throw new Error('No .protokoll directory found. Run with --setup to create one.');
            }
      
            await storage.save(entity, closestDir.path);
        },
    
        hasContext: () => discoveryResult.discoveredDirs.length > 0,
    };
};

// Re-export types
export * from './types';

// Re-export discovery utilities for direct use if needed
export { discoverConfigDirectories, loadHierarchicalConfig, deepMerge } from './discovery';

