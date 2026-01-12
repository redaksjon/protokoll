/**
 * Tests for Interactive Handler
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as Handler from '../../src/interactive/handler';
import { InteractiveConfig, ClarificationRequest } from '../../src/interactive/types';

// Mock logging
vi.mock('../../src/logging', () => ({
    getLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

// Mock readline to avoid actual stdin interaction
vi.mock('readline', () => ({
    createInterface: vi.fn(() => ({
        question: vi.fn((prompt: string, callback: (answer: string) => void) => {
            // Simulate user pressing Enter (empty response)
            callback('');
        }),
        close: vi.fn(),
    })),
}));

describe('Interactive Handler', () => {
    let handler: Handler.HandlerInstance;
  
    beforeEach(() => {
        const config: InteractiveConfig = {
            enabled: true,
            defaultToSuggestion: true,
        };
        handler = Handler.create(config);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });
  
    describe('session management', () => {
        it('should start a session', () => {
            handler.startSession();
            const session = handler.getSession();
            expect(session).not.toBeNull();
            expect(session?.requests).toEqual([]);
            expect(session?.responses).toEqual([]);
            expect(session?.startedAt).toBeInstanceOf(Date);
        });
    
        it('should end a session', () => {
            handler.startSession();
            const session = handler.endSession();
            expect(session.completedAt).toBeInstanceOf(Date);
            expect(handler.getSession()).toBeNull();
        });
    
        it('should throw when ending without active session', () => {
            expect(() => handler.endSession()).toThrow('No active session');
        });
    });
  
    describe('clarification handling', () => {
        it('should return suggestion when defaultToSuggestion is true', async () => {
            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'Test context',
                term: 'Jon',
                suggestion: 'John',
            };
      
            const response = await handler.handleClarification(request);
      
            expect(response.type).toBe('name_spelling');
            expect(response.term).toBe('Jon');
            expect(response.response).toBe('John');
            expect(response.shouldRemember).toBe(false);
        });
    
        it('should return original term when no suggestion', async () => {
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Test context',
                term: 'Alice',
            };
      
            const response = await handler.handleClarification(request);
      
            expect(response.response).toBe('Alice');
        });
    
        it('should track requests and responses in session', async () => {
            handler.startSession();
      
            const request: ClarificationRequest = {
                type: 'routing_decision',
                context: 'Where should this go?',
                term: 'meeting notes',
                options: ['work', 'personal'],
            };
      
            await handler.handleClarification(request);
      
            const session = handler.getSession();
            expect(session?.requests).toHaveLength(1);
            expect(session?.responses).toHaveLength(1);
        });
    });
  
    describe('configuration', () => {
        it('should report enabled state', () => {
            expect(handler.isEnabled()).toBe(true);
        });
    
        it('should return original term when defaultToSuggestion is false', async () => {
            const config: InteractiveConfig = {
                enabled: true,
                defaultToSuggestion: false,
            };
            const disabledHandler = Handler.create(config);
      
            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'Test',
                term: 'Jon',
                suggestion: 'John',
            };
      
            const response = await disabledHandler.handleClarification(request);
            expect(response.response).toBe('Jon');
        });
    });
});
