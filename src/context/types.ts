/**
 * Protokoll-Specific Context Types
 * 
 * This file contains only types that are specific to protokoll.
 * All generic entity types are now in @redaksjon/context.
 */

// Re-export all types from @redaksjon/context for backward compatibility
export * from '@redaksjon/context';

// Re-export with backward-compatible names
export type { 
    RedaksjonEntity as Entity,
    RedaksjonEntityType as EntityType 
} from '@redaksjon/context';

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
