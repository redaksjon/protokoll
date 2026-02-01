/**
 * Context System Types
 *
 * Types for storing knowledge about entities that appear in transcripts:
 * - People: Named individuals the user frequently mentions
 * - Projects: Work contexts that affect routing and understanding
 * - Companies: Organizations referenced in notes
 * - Terms: Domain-specific terminology and acronyms
 * 
 * Design Note: This module is designed to be self-contained and may be
 * extracted for use in other tools (kronologi, observasjon) in the future.
 */

export type EntityType = 'person' | 'project' | 'company' | 'term' | 'ignored';

export interface BaseEntity {
  id: string;           // Unique identifier (slug)
  name: string;         // Display name (always the preferred/correct spelling)
  type: EntityType;
  createdAt?: Date;
  updatedAt?: Date;
  notes?: string;
}

export interface Person extends BaseEntity {
  type: 'person';
  firstName?: string;
  lastName?: string;
  company?: string;              // DEPRECATED: Use relationships instead
  role?: string;                 // e.g., "Manager", "Developer"
  sounds_like?: string[];        // Common mishearings: "a nil", "a nill"
  context?: string;              // How user knows them
  relationships?: EntityRelationship[];  // Relationships to other entities
  content?: EntityContentItem[];         // Attached content
}

/**
 * Entity Relationship
 * Represents a typed relationship between entities using URIs
 */
export interface EntityRelationship {
  uri: string;                          // redaksjon://{type}/{id}
  relationship: string;                 // Relationship type (freeform)
  notes?: string;                       // Optional notes
  metadata?: Record<string, unknown>;   // Optional metadata
}

/**
 * Entity Content Item
 * Structured content attached to an entity
 */
export interface EntityContentItem {
  type: string;                         // url, text, markdown, code, document, etc.
  title?: string;                       // Title or label
  content: string;                      // The actual content
  mimeType?: string;                    // MIME type
  source?: string;                      // Source or origin
  timestamp?: string;                   // ISO 8601 datetime
  notes?: string;                       // Optional notes
  metadata?: Record<string, unknown>;   // Optional metadata
}

export interface ProjectClassification {
  context_type: 'work' | 'personal' | 'mixed';
  associated_people?: string[];     // Person IDs
  associated_companies?: string[];  // Company IDs
  topics?: string[];               // Topic keywords
  explicit_phrases?: string[];     // High-confidence trigger phrases
}

export interface ProjectRouting {
  destination?: string;  // Optional - if omitted, uses global default
  structure: 'none' | 'year' | 'month' | 'day';
  filename_options: Array<'date' | 'time' | 'subject'>;
  auto_tags?: string[];
}

export interface Project extends BaseEntity {
  type: 'project';
  description?: string;
  
  // Classification signals (not just triggers)
  classification: ProjectClassification;
  
  // Routing configuration (uses Dreadcabinet structures)
  routing: ProjectRouting;
  
  // Phonetic variants for when Whisper mishears the project name
  // Useful for non-English names (Norwegian, etc.) that may be transcribed differently
  sounds_like?: string[];
  
  // Unified relationships to other entities
  relationships?: EntityRelationship[];
  
  // Attached content
  content?: EntityContentItem[];
  
  active?: boolean;
}

export interface Company extends BaseEntity {
  type: 'company';
  fullName?: string;
  industry?: string;
  sounds_like?: string[];
  relationships?: EntityRelationship[];  // Relationships to other entities
  content?: EntityContentItem[];         // Attached content
}

export interface Term extends BaseEntity {
  type: 'term';
  expansion?: string;     // Full form if it's an acronym
  domain?: string;        // E.g., "engineering", "finance", "devops"
  sounds_like?: string[];
  projects?: string[];    // DEPRECATED: Use relationships instead
  
  // Smart assistance fields
  description?: string;   // Clear explanation of what the term means
  topics?: string[];      // Thematic keywords related to this term
  
  // Unified relationships and content
  relationships?: EntityRelationship[];  // Relationships to other entities
  content?: EntityContentItem[];         // Attached content
}

/**
 * Ignored terms - phrases the user doesn't want to be prompted about.
 * These are common phrases that aren't worth defining as proper terms.
 */
export interface IgnoredTerm extends BaseEntity {
  type: 'ignored';
  reason?: string;        // Optional note about why it's ignored
  ignoredAt?: string;     // ISO date when it was ignored
}

export type Entity = Person | Project | Company | Term | IgnoredTerm;

export interface ContextStore {
  people: Map<string, Person>;
  projects: Map<string, Project>;
  companies: Map<string, Company>;
  terms: Map<string, Term>;
  ignored: Map<string, IgnoredTerm>;
}

/**
 * Hierarchical configuration following Cardigantime pattern.
 * Config is discovered by walking up the directory tree.
 */
export interface ContextDiscoveryOptions {
  configDirName: string;      // '.protokoll'
  configFileName: string;     // 'config.yaml'
  maxLevels?: number;         // How far up to search (default: 10)
  startingDir?: string;       // Where to start (default: process.cwd())
}

export interface DiscoveredContextDir {
  path: string;
  level: number;  // 0 = closest, higher = further up
}

export interface HierarchicalContextResult {
  config: Record<string, unknown>;
  discoveredDirs: DiscoveredContextDir[];
  contextDirs: string[];  // All context subdirectories to load
}

/**
 * Smart Assistance Configuration
 * Controls LLM-assisted project and term metadata generation
 */
export interface SmartAssistanceConfig {
  enabled: boolean;
  phoneticModel: string;          // Fast model for phonetic variants (e.g., gpt-5-nano)
  analysisModel: string;          // More capable model for content analysis (e.g., gpt-5-mini)
  
  // Project-specific settings
  soundsLikeOnAdd: boolean;       // Generate phonetic variants for project name
  triggerPhrasesOnAdd: boolean;   // Generate content-matching phrases
  promptForSource: boolean;
  
  // Term-specific settings
  termsEnabled?: boolean;              // Enable smart assistance for terms
  termSoundsLikeOnAdd?: boolean;       // Generate phonetic variants for terms
  termDescriptionOnAdd?: boolean;      // Generate term descriptions
  termTopicsOnAdd?: boolean;           // Generate related topics
  termProjectSuggestions?: boolean;    // Suggest relevant projects based on topics
  
  timeout?: number;
}

/**
 * Protokoll Configuration
 * Top-level configuration structure
 */
export interface ProtokollConfig {
  version?: number;
  smartAssistance?: SmartAssistanceConfig;
  // Other config fields can be added here as needed
}

/**
 * Helper functions for Term type
 */

/**
 * Check if a term is associated with a given project
 */
export const isTermAssociatedWithProject = (term: Term, projectId: string): boolean => {
    return term.projects?.includes(projectId) ?? false;
};

/**
 * Add a project association to a term
 */
export const addProjectToTerm = (term: Term, projectId: string): Term => {
    const projects = term.projects || [];
    if (projects.includes(projectId)) {
        return term;
    }
    return {
        ...term,
        projects: [...projects, projectId],
        updatedAt: new Date(),
    };
};

/**
 * Remove a project association from a term
 */
export const removeProjectFromTerm = (term: Term, projectId: string): Term => {
    const projects = term.projects || [];
    return {
        ...term,
        projects: projects.filter(id => id !== projectId),
        updatedAt: new Date(),
    };
};

/**
 * Helper functions for Project Relationships
 */

/**
 * Get entity ID from a relationship URI
 */
const getIdFromUri = (uri: string): string | null => {
    const match = uri.match(/^redaksjon:\/\/[^/]+\/(.+)$/);
    return match ? match[1] : null;
};

/**
 * Get relationships by type from an array
 */
const getRelationshipsByType = (relationships: EntityRelationship[] | undefined, relationshipType: string): EntityRelationship[] => {
    if (!relationships) return [];
    return relationships.filter(r => r.relationship === relationshipType);
};

/**
 * Get entity IDs from relationships by type
 */
const getEntityIdsByRelationshipType = (relationships: EntityRelationship[] | undefined, relationshipType: string): string[] => {
    return getRelationshipsByType(relationships, relationshipType)
        .map(r => getIdFromUri(r.uri))
        .filter((id): id is string => id !== null);
};

/**
 * Get parent project ID from relationships
 */
const getParentId = (relationships: EntityRelationship[] | undefined): string | undefined => {
    const parentRels = getRelationshipsByType(relationships, 'parent');
    if (parentRels.length === 0) return undefined;
    return getIdFromUri(parentRels[0].uri) || undefined;
};

/**
 * Check if projectA is a parent of projectB
 */
export const isParentProject = (projectA: Project, projectB: Project): boolean => {
    const parentId = getParentId(projectB.relationships);
    return parentId === projectA.id;
};

/**
 * Check if projectA is a child of projectB
 */
export const isChildProject = (projectA: Project, projectB: Project): boolean => {
    const parentId = getParentId(projectA.relationships);
    return parentId === projectB.id;
};

/**
 * Check if two projects are siblings
 */
export const areSiblingProjects = (projectA: Project, projectB: Project): boolean => {
    const aSiblings = getEntityIdsByRelationshipType(projectA.relationships, 'sibling');
    const bSiblings = getEntityIdsByRelationshipType(projectB.relationships, 'sibling');
    return aSiblings.includes(projectB.id) || bSiblings.includes(projectA.id);
};

/**
 * Get relationship distance between two projects (lower = closer)
 * Returns: 0 = same, 1 = parent/child, 2 = siblings/cousins, -1 = unrelated
 */
export const getProjectRelationshipDistance = (projectA: Project, projectB: Project): number => {
    if (projectA.id === projectB.id) return 0;
    if (isParentProject(projectA, projectB) || isChildProject(projectA, projectB)) return 1;
    if (areSiblingProjects(projectA, projectB)) return 2;
    
    // Check if they share a parent (cousins)
    const aParent = getParentId(projectA.relationships);
    const bParent = getParentId(projectB.relationships);
    if (aParent && bParent && aParent === bParent) {
        return 2;
    }
    
    return -1; // unrelated
};


