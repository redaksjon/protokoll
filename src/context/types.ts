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
  name: string;         // Display name
  type: EntityType;
  createdAt?: Date;
  updatedAt?: Date;
  notes?: string;
}

export interface Person extends BaseEntity {
  type: 'person';
  firstName?: string;
  lastName?: string;
  company?: string;              // Company ID reference
  role?: string;                 // e.g., "Manager", "Developer"
  sounds_like?: string[];        // Common mishearings: "a nil", "a nill"
  context?: string;              // How user knows them
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
  
  active?: boolean;
}

export interface Company extends BaseEntity {
  type: 'company';
  fullName?: string;
  industry?: string;
  sounds_like?: string[];
}

export interface Term extends BaseEntity {
  type: 'term';
  expansion?: string;     // Full form if it's an acronym
  domain?: string;        // E.g., "engineering", "finance"
  sounds_like?: string[];
  projects?: string[];    // Associated project IDs - triggers routing to these projects
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
 * Controls LLM-assisted project metadata generation
 */
export interface SmartAssistanceConfig {
  enabled: boolean;
  phoneticModel: string;          // Fast model for phonetic variants (e.g., gpt-5-nano)
  analysisModel: string;          // More capable model for content analysis (e.g., gpt-5-mini)
  soundsLikeOnAdd: boolean;       // Generate phonetic variants for project name
  triggerPhrasesOnAdd: boolean;   // Generate content-matching phrases
  promptForSource: boolean;
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

