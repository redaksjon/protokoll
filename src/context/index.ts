/**
 * Context System - Protokoll Adapter
 * 
 * This module provides protokoll-specific extensions on top of @redaksjon/context runtime.
 * Most functionality is now provided by @redaksjon/context; this module adds:
 * - Smart assistance configuration (LLM model selection, feature flags)
 * - Protokoll-specific defaults
 */

import { 
    create as createContext,
    type ContextInstance as BaseContextInstance,
    type CreateOptions as BaseCreateOptions,
} from '@redaksjon/context';
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
import type { SmartAssistanceConfig } from './types';

// Re-export base types
export type { BaseContextInstance as ContextInstance };

// Use BaseCreateOptions directly (no protokoll-specific extensions needed)
export type CreateOptions = BaseCreateOptions;

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
 * Extended ContextInstance with protokoll-specific methods
 */
export interface ProtokollContextInstance extends BaseContextInstance {
    getSmartAssistanceConfig(): SmartAssistanceConfig;
}

/**
 * Create a new context instance with protokoll-specific extensions
 */
export const create = async (options: CreateOptions = {}): Promise<ProtokollContextInstance> => {
    const baseInstance = await createContext(options);
    
    return {
        ...baseInstance,
        getSmartAssistanceConfig: () => getSmartAssistanceConfig(baseInstance.getConfig()),
    };
};

// Re-export types from @redaksjon/context
export * from '@redaksjon/context';

// Re-export protokoll-specific types
export * from './types';

// Re-export discovery utilities (now from @redaksjon/context)
export { discoverConfigDirectories, loadHierarchicalConfig, deepMerge } from '@redaksjon/context';
