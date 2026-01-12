/**
 * Tests for Interactive Index
 */

import { describe, it, expect, vi } from 'vitest';
import * as Interactive from '../../src/interactive';
import * as Context from '../../src/context';

// Mock logging
vi.mock('../../src/logging', () => ({
    getLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

describe('Interactive System', () => {
    const createMockContext = () => ({
        getAllProjects: vi.fn().mockReturnValue([]),
        getConfig: vi.fn().mockReturnValue({}),
        hasContext: vi.fn().mockReturnValue(false),
    } as unknown as Context.ContextInstance);
  
    it('should create an interactive instance', () => {
        const config: Interactive.InteractiveConfig = {
            enabled: true,
        };
        const context = createMockContext();
    
        const interactive = Interactive.create(config, context);
    
        expect(interactive).toBeDefined();
        expect(typeof interactive.startSession).toBe('function');
        expect(typeof interactive.endSession).toBe('function');
        expect(typeof interactive.handleClarification).toBe('function');
        expect(typeof interactive.isEnabled).toBe('function');
        expect(typeof interactive.checkNeedsOnboarding).toBe('function');
    });
  
    it('should integrate session and onboarding', () => {
        const config: Interactive.InteractiveConfig = {
            enabled: true,
        };
        const context = createMockContext();
    
        const interactive = Interactive.create(config, context);
    
        // Test session
        interactive.startSession();
        expect(interactive.getSession()).not.toBeNull();
    
        // Test onboarding
        const state = interactive.checkNeedsOnboarding();
        expect(state.needsOnboarding).toBe(true);
    
        // End session
        const session = interactive.endSession();
        expect(session.completedAt).toBeInstanceOf(Date);
    });
  
    it('should re-export types', () => {
        // Verify types are exported
        const config: Interactive.InteractiveConfig = { enabled: false };
        expect(config.enabled).toBe(false);
    
        const request: Interactive.ClarificationRequest = {
            type: 'name_spelling',
            context: 'test',
            term: 'test',
        };
        expect(request.type).toBe('name_spelling');
    });
  
    it('should export createDefaultOnboardingResult', () => {
        const result = Interactive.createDefaultOnboardingResult();
        expect(result.defaultDestination).toBe('~/notes');
    });
});

