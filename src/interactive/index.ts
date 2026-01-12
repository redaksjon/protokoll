/**
 * Interactive Mode System
 * 
 * Main entry point for the interactive mode system. Provides session management,
 * clarification handling, and onboarding detection.
 */

import { 
    InteractiveConfig, 
    InteractiveSession, 
    ClarificationRequest, 
    ClarificationResponse,
    OnboardingState 
} from './types';
import * as Handler from './handler';
import * as Onboarding from './onboarding';
import * as Context from '../context';

export interface InteractiveInstance {
    // Session management
    startSession(): void;
    endSession(): InteractiveSession;
    getSession(): InteractiveSession | null;
  
    // Clarification handling
    handleClarification(request: ClarificationRequest): Promise<ClarificationResponse>;
  
    // State
    isEnabled(): boolean;
  
    // Onboarding
    checkNeedsOnboarding(): OnboardingState;
}

export const create = (
    config: InteractiveConfig,
    context: Context.ContextInstance
): InteractiveInstance => {
    const handler = Handler.create(config);
    const onboarding = Onboarding.create(context);
  
    return {
        startSession: handler.startSession,
        endSession: handler.endSession,
        getSession: handler.getSession,
        handleClarification: handler.handleClarification,
        isEnabled: handler.isEnabled,
        checkNeedsOnboarding: onboarding.checkNeedsOnboarding,
    };
};

// Re-export types
export * from './types';

// Re-export utilities
export { createDefaultOnboardingResult } from './onboarding';

