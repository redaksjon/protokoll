/**
 * Tests for Onboarding
 */

import { describe, it, expect, vi } from 'vitest';
import * as Onboarding from '../../src/interactive/onboarding';
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

describe('Onboarding', () => {
    describe('checkNeedsOnboarding', () => {
        it('should detect when onboarding is needed (no context)', () => {
            const mockContext = {
                getAllProjects: vi.fn().mockReturnValue([]),
                getConfig: vi.fn().mockReturnValue({}),
                hasContext: vi.fn().mockReturnValue(false),
            } as unknown as Context.ContextInstance;
      
            const onboarding = Onboarding.create(mockContext);
            const state = onboarding.checkNeedsOnboarding();
      
            expect(state.needsOnboarding).toBe(true);
            expect(state.hasProjects).toBe(false);
            expect(state.hasDefaultDestination).toBe(false);
            expect(state.hasAnyContext).toBe(false);
        });
    
        it('should detect when onboarding is not needed (has context)', () => {
            const mockContext = {
                getAllProjects: vi.fn().mockReturnValue([{ name: 'test' }]),
                getConfig: vi.fn().mockReturnValue({ routing: { default: { path: '~/notes' } } }),
                hasContext: vi.fn().mockReturnValue(true),
            } as unknown as Context.ContextInstance;
      
            const onboarding = Onboarding.create(mockContext);
            const state = onboarding.checkNeedsOnboarding();
      
            expect(state.needsOnboarding).toBe(false);
            expect(state.hasProjects).toBe(true);
            expect(state.hasDefaultDestination).toBe(true);
            expect(state.hasAnyContext).toBe(true);
        });
    
        it('should handle partial context', () => {
            const mockContext = {
                getAllProjects: vi.fn().mockReturnValue([]),
                getConfig: vi.fn().mockReturnValue({ routing: { default: { path: '~/notes' } } }),
                hasContext: vi.fn().mockReturnValue(true),
            } as unknown as Context.ContextInstance;
      
            const onboarding = Onboarding.create(mockContext);
            const state = onboarding.checkNeedsOnboarding();
      
            // Has context, so no onboarding needed
            expect(state.needsOnboarding).toBe(false);
            expect(state.hasProjects).toBe(false);
            expect(state.hasDefaultDestination).toBe(true);
        });
    });
  
    describe('createDefaultOnboardingResult', () => {
        it('should create default result', () => {
            const result = Onboarding.createDefaultOnboardingResult();
      
            expect(result.defaultDestination).toBe('~/notes');
            expect(result.defaultStructure).toBe('month');
            expect(result.projects).toEqual([]);
            expect(result.completed).toBe(false);
        });
    });
});

