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
    IgnoredTerm,
    ContextDiscoveryOptions,
    DiscoveredContextDir,
    HierarchicalContextResult,
    SmartAssistanceConfig 
} from './types';
import * as Storage from './storage';
import * as Discovery from './discovery';
import {
    DEFAULT_PHONETIC_MODEL,
    DEFAULT_ANALYSIS_MODEL,
    DEFAULT_SMART_ASSISTANCE,
    DEFAULT_SOUNDS_LIKE_ON_ADD,
    DEFAULT_TRIGGER_PHRASES_ON_ADD,
    DEFAULT_PROMPT_FOR_SOURCE,
    DEFAULT_TERMS_ENABLED,
    DEFAULT_TERM_SOUNDS_LIKE_ON_ADD,
    DEFAULT_TERM_DESCRIPTION_ON_ADD,
    DEFAULT_TERM_TOPICS_ON_ADD,
    DEFAULT_TERM_PROJECT_SUGGESTIONS,
    ASSIST_TIMEOUT_MS
} from '../constants';

export interface ContextInstance {
  // Initialization
  load(): Promise<void>;
  reload(): Promise<void>;
  
  // Discovery info
  getDiscoveredDirs(): DiscoveredContextDir[];
  getConfig(): Record<string, unknown>;
  getContextDirs(): string[];
  
  // Smart Assistance config
  getSmartAssistanceConfig(): SmartAssistanceConfig;
  
  // Entity access
  getPerson(id: string): Person | undefined;
  getProject(id: string): Project | undefined;
  getCompany(id: string): Company | undefined;
  getTerm(id: string): Term | undefined;
  getIgnored(id: string): IgnoredTerm | undefined;
  
  getAllPeople(): Person[];
  getAllProjects(): Project[];
  getAllCompanies(): Company[];
  getAllTerms(): Term[];
  getAllIgnored(): IgnoredTerm[];
  
  // Check if a term is ignored
  isIgnored(term: string): boolean;
  
  // Search
  search(query: string): Entity[];
  findBySoundsLike(phonetic: string): Entity | undefined;
  
  // Modification (for self-update mode)
  saveEntity(entity: Entity): Promise<void>;
  deleteEntity(entity: Entity): Promise<boolean>;
  getEntityFilePath(entity: Entity): string | undefined;
  
  // Check if context is available
  hasContext(): boolean;
}

export interface CreateOptions {
  startingDir?: string;
  configDirName?: string;
  configFileName?: string;
}

/**
 * Get smart assistance configuration with defaults
 */
const getSmartAssistanceConfig = (config: Record<string, unknown>): SmartAssistanceConfig => {
    const smartConfig = config.smartAssistance as Partial<SmartAssistanceConfig> | undefined;
  
    return {
        enabled: smartConfig?.enabled ?? DEFAULT_SMART_ASSISTANCE,
        phoneticModel: smartConfig?.phoneticModel ?? DEFAULT_PHONETIC_MODEL,
        analysisModel: smartConfig?.analysisModel ?? DEFAULT_ANALYSIS_MODEL,
        
        // Project settings
        soundsLikeOnAdd: smartConfig?.soundsLikeOnAdd ?? DEFAULT_SOUNDS_LIKE_ON_ADD,
        triggerPhrasesOnAdd: smartConfig?.triggerPhrasesOnAdd ?? DEFAULT_TRIGGER_PHRASES_ON_ADD,
        promptForSource: smartConfig?.promptForSource ?? DEFAULT_PROMPT_FOR_SOURCE,
        
        // Term settings
        termsEnabled: smartConfig?.termsEnabled ?? DEFAULT_TERMS_ENABLED,
        termSoundsLikeOnAdd: smartConfig?.termSoundsLikeOnAdd ?? DEFAULT_TERM_SOUNDS_LIKE_ON_ADD,
        termDescriptionOnAdd: smartConfig?.termDescriptionOnAdd ?? DEFAULT_TERM_DESCRIPTION_ON_ADD,
        termTopicsOnAdd: smartConfig?.termTopicsOnAdd ?? DEFAULT_TERM_TOPICS_ON_ADD,
        termProjectSuggestions: smartConfig?.termProjectSuggestions ?? DEFAULT_TERM_PROJECT_SUGGESTIONS,
        
        timeout: smartConfig?.timeout ?? ASSIST_TIMEOUT_MS,
    };
};

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
        getContextDirs: () => discoveryResult.contextDirs,
        
        getSmartAssistanceConfig: () => getSmartAssistanceConfig(discoveryResult.config),
    
        getPerson: (id) => storage.get<Person>('person', id),
        getProject: (id) => storage.get<Project>('project', id),
        getCompany: (id) => storage.get<Company>('company', id),
        getTerm: (id) => storage.get<Term>('term', id),
        getIgnored: (id) => storage.get<IgnoredTerm>('ignored', id),
    
        getAllPeople: () => storage.getAll<Person>('person'),
        getAllProjects: () => storage.getAll<Project>('project'),
        getAllCompanies: () => storage.getAll<Company>('company'),
        getAllTerms: () => storage.getAll<Term>('term'),
        getAllIgnored: () => storage.getAll<IgnoredTerm>('ignored'),
        
        isIgnored: (term: string) => {
            const normalizedTerm = term.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            const ignoredTerms = storage.getAll<IgnoredTerm>('ignored');
            return ignoredTerms.some(ignored => 
                ignored.id === normalizedTerm || 
                ignored.name.toLowerCase() === term.toLowerCase()
            );
        },
    
        search: (query) => storage.search(query),
        findBySoundsLike: (phonetic) => storage.findBySoundsLike(phonetic),
    
        saveEntity: async (entity) => {
            // Save to the closest .protokoll directory
            const closestDir = discoveryResult.discoveredDirs
                .sort((a, b) => a.level - b.level)[0];
      
            if (!closestDir) {
                throw new Error('No .protokoll directory found. Run with --init-config to create one.');
            }
      
            await storage.save(entity, closestDir.path);
        },
        
        deleteEntity: async (entity) => {
            // Delete from the closest .protokoll directory that contains it
            const filePath = storage.getEntityFilePath(entity.type, entity.id, discoveryResult.contextDirs);
            if (!filePath) {
                return false;
            }
            
            // Extract the context directory from the file path
            const contextDir = discoveryResult.contextDirs.find(dir => filePath.startsWith(dir));
            if (!contextDir) {
                return false;
            }
            
            return storage.delete(entity.type, entity.id, contextDir);
        },
        
        getEntityFilePath: (entity) => {
            return storage.getEntityFilePath(entity.type, entity.id, discoveryResult.contextDirs);
        },
    
        hasContext: () => discoveryResult.discoveredDirs.length > 0,
    };
};

// Re-export types
export * from './types';

// Re-export discovery utilities for direct use if needed
export { discoverConfigDirectories, loadHierarchicalConfig, deepMerge } from './discovery';

