/**
 * Context System
 * 
 * Main entry point for the context system. Provides a factory function
 * to create context instances that can discover, load, and manage
 * entity data from hierarchical .protokoll directories.
 * 
 * This module now uses overcontext under the hood for storage and discovery.
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
    SmartAssistanceConfig,
} from './types';
import * as Overcontext from '../overcontext';
import { getProjectRelationshipDistance } from '../overcontext/helpers';
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
  
    // Advanced search with context awareness
    searchWithContext(query: string, contextProjectId?: string): Entity[];
    getRelatedProjects(projectId: string, maxDistance?: number): Project[];
  
    // Modification
    saveEntity(entity: Entity, allowUpdate?: boolean): Promise<void>;
    deleteEntity(entity: Entity): Promise<boolean>;
    getEntityFilePath(entity: Entity): string | undefined;
  
    // Check if context is available
    hasContext(): boolean;
}

export interface CreateOptions {
    startingDir?: string;
    configDirName?: string;
    configFileName?: string;
    /** Explicit context directories to load entities from (bypasses .protokoll discovery) */
    contextDirectories?: string[];
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
 * Create a new context instance using overcontext
 */
export const create = async (options: CreateOptions = {}): Promise<ContextInstance> => {
    const discoveryOptions: ContextDiscoveryOptions = {
        configDirName: options.configDirName ?? '.protokoll',
        configFileName: options.configFileName ?? 'config.yaml',
        startingDir: options.startingDir,
    };

    const storage = Overcontext.create();
    let discoveryResult: HierarchicalContextResult = {
        config: {},
        discoveredDirs: [],
        contextDirs: [],
    };

    const loadContext = async (): Promise<void> => {
        // If explicit contextDirectories are provided, use them directly
        if (options.contextDirectories && options.contextDirectories.length > 0) {
            discoveryResult = {
                config: {},
                discoveredDirs: options.contextDirectories.map((dir, index) => ({
                    path: dir,
                    level: index,
                })),
                contextDirs: options.contextDirectories,
            };
        } else {
            // Otherwise, use .protokoll directory discovery
            discoveryResult = await Overcontext.loadHierarchicalConfig(discoveryOptions);
        }
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
        
        searchWithContext: (query, contextProjectId) => {
            const results = storage.search(query);
            
            if (!contextProjectId) {
                return results;
            }
            
            const contextProject = storage.get<Project>('project', contextProjectId);
            if (!contextProject) {
                return results;
            }
            
            const scoredResults = results.map(entity => {
                let score = 0;
                
                if (entity.type === 'project') {
                    const distance = getProjectRelationshipDistance(contextProject, entity as Project);
                    if (distance >= 0) {
                        score += (3 - distance) * 50;
                    }
                }
                
                if (entity.type === 'term') {
                    const term = entity as Term;
                    if (term.projects?.includes(contextProjectId)) {
                        score += 100;
                    }
                }
                
                return { entity, score };
            });
            
            return scoredResults
                .sort((a, b) => b.score - a.score)
                .map(r => r.entity);
        },
        
        getRelatedProjects: (projectId, maxDistance = 2) => {
            const project = storage.get<Project>('project', projectId);
            if (!project) return [];
            
            const allProjects = storage.getAll<Project>('project');
            const related: Array<{ project: Project; distance: number }> = [];
            
            for (const otherProject of allProjects) {
                if (otherProject.id === projectId) continue;
                
                const distance = getProjectRelationshipDistance(project, otherProject);
                if (distance >= 0 && distance <= maxDistance) {
                    related.push({ project: otherProject, distance });
                }
            }
            
            return related
                .sort((a, b) => a.distance - b.distance)
                .map(r => r.project);
        },
    
        saveEntity: async (entity, allowUpdate = false) => {
            const closestDir = discoveryResult.discoveredDirs
                .sort((a, b) => a.level - b.level)[0];
      
            if (!closestDir) {
                throw new Error('No .protokoll directory found. Run with --init-config to create one.');
            }
      
            await storage.save(entity, closestDir.path, allowUpdate);
        },
        
        deleteEntity: async (entity) => {
            const filePath = storage.getEntityFilePath(entity.type, entity.id, discoveryResult.contextDirs);
            if (!filePath) {
                return false;
            }
            
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

// Re-export types (includes helper functions)
export * from './types';

// Re-export discovery utilities
export { discoverConfigDirectories, loadHierarchicalConfig } from '../overcontext';

// Re-export deepMerge from old discovery for backwards compatibility
export { deepMerge } from './discovery';
