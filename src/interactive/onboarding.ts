/**
 * Onboarding
 * 
 * Handles first-run detection and bootstrap onboarding flow.
 */

import { OnboardingState, OnboardingResult } from './types';
import * as Context from '../context';
import * as Logging from '../logging';

export interface OnboardingInstance {
    checkNeedsOnboarding(): OnboardingState;
    // Note: Full interactive onboarding requires inquirer
    // This provides the state detection and result structure
}

export const create = (context: Context.ContextInstance): OnboardingInstance => {
    const logger = Logging.getLogger();
  
    const checkNeedsOnboarding = (): OnboardingState => {
        const projects = context.getAllProjects();
        const config = context.getConfig();
    
        const hasProjects = projects.length > 0;
        const configWithRouting = config as { routing?: { default?: { path?: string } } };
        const hasDefaultDestination = !!configWithRouting?.routing?.default?.path;
        const hasAnyContext = context.hasContext();
    
        const state: OnboardingState = {
            hasProjects,
            hasDefaultDestination,
            hasAnyContext,
            needsOnboarding: !hasAnyContext,
        };
    
        logger.debug('Onboarding state checked', state);
    
        return state;
    };
  
    return { checkNeedsOnboarding };
};

/**
 * Create a default onboarding result for non-interactive mode
 */
export const createDefaultOnboardingResult = (): OnboardingResult => ({
    defaultDestination: '~/notes',
    defaultStructure: 'month',
    projects: [],
    completed: false,
});

