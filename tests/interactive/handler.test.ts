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
let mockAnswer = '';
vi.mock('readline', () => ({
    createInterface: vi.fn(() => ({
        question: vi.fn((prompt: string, callback: (answer: string) => void) => {
            // Use the mockAnswer value set by tests
            callback(mockAnswer);
        }),
        close: vi.fn(),
    })),
}));

describe('Interactive Handler', () => {
    let handler: Handler.HandlerInstance;
  
    beforeEach(() => {
        // Mock process.stdin.isTTY to return true so readline interface is created
        Object.defineProperty(process.stdin, 'isTTY', {
            value: true,
            writable: true,
            configurable: true,
        });
        
        const config: InteractiveConfig = {
            enabled: true,
            defaultToSuggestion: true,
        };
        handler = Handler.create(config);
    });

    afterEach(() => {
        vi.clearAllMocks();
        // Reset isTTY
        Object.defineProperty(process.stdin, 'isTTY', {
            value: undefined,
            writable: true,
            configurable: true,
        });
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

        it('should close readline interface on session end', () => {
            const rlMock = vi.fn();
            handler.startSession();
            handler.endSession();
            // Session should be closed properly
            expect(handler.getSession()).toBeNull();
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

        it('should handle name_spelling clarification type', async () => {
            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'The speaker mentioned Jon.',
                term: 'Jon',
                suggestion: 'John',
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('name_spelling');
            expect(response.term).toBe('Jon');
        });

        it('should handle new_person clarification type', async () => {
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Met with a new colleague today.',
                term: 'Sarah',
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('new_person');
        });

        it('should handle new_project clarification type', async () => {
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Working on a new project.',
                term: 'Project X',
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('new_project');
        });

        it('should handle new_company clarification type', async () => {
            const request: ClarificationRequest = {
                type: 'new_company',
                context: 'Partnering with a new company.',
                term: 'TechCorp',
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('new_company');
        });

        it('should handle routing_decision clarification type', async () => {
            const request: ClarificationRequest = {
                type: 'routing_decision',
                context: 'Where should this note be stored?',
                term: 'note',
                options: ['/work', '/personal', '/archive'],
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('routing_decision');
        });

        it('should handle first_run_onboarding clarification type', async () => {
            const request: ClarificationRequest = {
                type: 'first_run_onboarding',
                context: 'Welcome to the system!',
                options: ['Option 1', 'Option 2'],
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('first_run_onboarding');
        });

        it('should handle general clarification type', async () => {
            const request: ClarificationRequest = {
                type: 'general',
                context: 'Please clarify this.',
                term: 'something',
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('general');
        });

        it('should handle clarifications without session', async () => {
            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'Test',
                term: 'Jon',
                suggestion: 'John',
            };

            // Should not crash when no session is active
            const response = await handler.handleClarification(request);
            expect(response).toBeDefined();
            expect(response.response).toBe('John');
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

        it('should work in non-interactive mode', async () => {
            const config: InteractiveConfig = {
                enabled: false,
                defaultToSuggestion: true,
            };
            const nonInteractiveHandler = Handler.create(config);

            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'Test',
                term: 'Jon',
                suggestion: 'John',
            };

            const response = await nonInteractiveHandler.handleClarification(request);
            expect(response.response).toBe('John');
            expect(nonInteractiveHandler.isEnabled()).toBe(false);
        });

        it('should return original term in non-interactive mode without suggestion', async () => {
            const config: InteractiveConfig = {
                enabled: false,
                defaultToSuggestion: false,
            };
            const nonInteractiveHandler = Handler.create(config);

            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Test',
                term: 'Alice',
            };

            const response = await nonInteractiveHandler.handleClarification(request);
            expect(response.response).toBe('Alice');
        });
    });

    describe('edge cases', () => {
        it('should handle clarification with empty context', async () => {
            mockAnswer = '';
            const request: ClarificationRequest = {
                type: 'new_person',
                context: '',
                term: 'Bob',
            };

            const response = await handler.handleClarification(request);
            expect(response.term).toBe('Bob');
        });

        it('should handle clarification with no options', async () => {
            mockAnswer = '';
            const request: ClarificationRequest = {
                type: 'routing_decision',
                context: 'Route this',
                term: 'note',
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('routing_decision');
        });

        it('should record multiple clarifications in session', async () => {
            handler.startSession();
            mockAnswer = '';

            const request1: ClarificationRequest = {
                type: 'new_person',
                context: 'Context 1',
                term: 'Person1',
            };

            const request2: ClarificationRequest = {
                type: 'new_project',
                context: 'Context 2',
                term: 'Project1',
            };

            await handler.handleClarification(request1);
            await handler.handleClarification(request2);

            const session = handler.getSession();
            expect(session?.requests).toHaveLength(2);
            expect(session?.responses).toHaveLength(2);
        });

        it('should handle interactive mode with user pressing enter', async () => {
            handler.startSession();
            mockAnswer = '';
            
            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'Test',
                term: 'Jon',
                suggestion: 'John',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('John');
            expect(response.shouldRemember).toBe(false);
        });

        it('should handle interactive mode with user typing Y', async () => {
            handler.startSession();
            mockAnswer = 'Y';
            
            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'Test',
                term: 'Jon',
                suggestion: 'John',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('John');
        });

        it('should handle interactive mode with user typing y (lowercase)', async () => {
            handler.startSession();
            mockAnswer = 'y';
            
            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'Test',
                term: 'Jon',
                suggestion: 'John',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('John');
        });

        it('should handle interactive mode with user selecting option by number', async () => {
            handler.startSession();
            mockAnswer = '2';
            
            const request: ClarificationRequest = {
                type: 'routing_decision',
                context: 'Choose destination',
                term: 'note',
                options: ['/work', '/personal', '/archive'],
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('/personal');
            expect(response.shouldRemember).toBe(false);
        });

        it('should handle interactive mode with user selecting first option', async () => {
            handler.startSession();
            mockAnswer = '1';
            
            const request: ClarificationRequest = {
                type: 'routing_decision',
                context: 'Choose',
                term: 'note',
                options: ['/work', '/personal'],
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('/work');
        });

        it('should handle interactive mode with invalid option number', async () => {
            handler.startSession();
            mockAnswer = '99';
            
            const request: ClarificationRequest = {
                type: 'routing_decision',
                context: 'Choose',
                term: 'note',
                options: ['/work', '/personal'],
            };

            const response = await handler.handleClarification(request);
            // Should return the user input as-is
            expect(response.response).toBe('99');
        });

        it('should handle interactive mode with custom text answer', async () => {
            handler.startSession();
            mockAnswer = 'John Smith';
            
            // Use a type that doesn't have a wizard (like 'general') to test raw user input
            const request: ClarificationRequest = {
                type: 'general',
                context: 'General clarification',
                term: 'Unknown',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('John Smith');
            expect(response.shouldRemember).toBe(true);
        });
        
        it('should handle new_person wizard with name correction', async () => {
            handler.startSession();
            mockAnswer = 'John Smith';
            
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'New person detected',
                term: 'Unknown',
            };

            const response = await handler.handleClarification(request);
            // Wizard returns action as response
            expect(response.response).toBe('create');
            expect(response.shouldRemember).toBe(true);
            // Check wizard result in additionalInfo
            expect(response.additionalInfo).toBeDefined();
            const wizardResult = response.additionalInfo as { personName?: string };
            expect(wizardResult.personName).toBe('John Smith');
        });

        it('should handle interactive mode with option index out of bounds on lower end', async () => {
            handler.startSession();
            mockAnswer = '0';
            
            const request: ClarificationRequest = {
                type: 'routing_decision',
                context: 'Choose',
                term: 'note',
                options: ['/work', '/personal'],
            };

            const response = await handler.handleClarification(request);
            // index would be -1, which fails the bounds check
            expect(response.response).toBe('0');
        });

        it('should handle clarification without readline when enabled but rl is null', async () => {
            const config: InteractiveConfig = {
                enabled: true,
                defaultToSuggestion: false,
            };
            handler = Handler.create(config);
            // Don't start session, so rl stays null

            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Test',
                term: 'Alice',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('Alice');
        });

        it('should set shouldRemember to false for non-custom answers', async () => {
            handler.startSession();
            mockAnswer = '';
            
            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'Test',
                term: 'Jon',
                suggestion: 'John',
            };

            const response = await handler.handleClarification(request);
            expect(response.shouldRemember).toBe(false);
        });

        it('should set shouldRemember to true for custom text answers', async () => {
            handler.startSession();
            mockAnswer = 'CustomAnswer';
            
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Test',
                term: 'Unknown',
            };

            const response = await handler.handleClarification(request);
            expect(response.shouldRemember).toBe(true);
        });
    });

    describe('new clarification types', () => {
        it('should handle new term clarification type', async () => {
            handler.startSession();
            mockAnswer = 'A graph query language for APIs';
            
            const request: ClarificationRequest = {
                type: 'new_term',
                context: '..."we use GraphQL for APIs..."',
                term: 'GraphQL',
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('new_term');
            expect(response.response).toBe('A graph query language for APIs');
            expect(response.shouldRemember).toBe(true);
        });

        it('should handle low confidence routing clarification', async () => {
            handler.startSession();
            mockAnswer = 'y';
            
            const request: ClarificationRequest = {
                type: 'low_confidence_routing',
                term: '65%',
                context: 'Routed to: "/work/notes"',
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('low_confidence_routing');
            // The term is returned as response for routing (not user input)
            expect(response.shouldRemember).toBe(false);
        });

        it('should skip empty term answers', async () => {
            handler.startSession();
            mockAnswer = '';
            
            const request: ClarificationRequest = {
                type: 'new_term',
                context: 'Unknown term',
                term: 'Kubernetes',
            };

            const response = await handler.handleClarification(request);
            // Empty response means skip
            expect(response.response).toBe('Kubernetes');
            expect(response.shouldRemember).toBe(false);
        });
    });

    describe('formatClarificationPrompt coverage', () => {
        it('should format name_spelling prompt without suggestion', async () => {
            handler.startSession();
            mockAnswer = '';
            
            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'Context about the name',
                term: 'Jon',
                // No suggestion
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('name_spelling');
        });

        it('should format new_company prompt', async () => {
            handler.startSession();
            mockAnswer = 'Tech startup in AI';
            
            const request: ClarificationRequest = {
                type: 'new_company',
                context: 'We met with a representative from TechCorp',
                term: 'TechCorp',
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('new_company');
            expect(response.response).toBe('Tech startup in AI');
        });

        it('should format routing_decision prompt without options', async () => {
            handler.startSession();
            mockAnswer = '/custom/path';
            
            const request: ClarificationRequest = {
                type: 'routing_decision',
                context: 'Where should this note go?',
                term: 'note',
                // No options array
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('routing_decision');
            expect(response.response).toBe('/custom/path');
        });

        it('should format first_run_onboarding prompt without options', async () => {
            handler.startSession();
            mockAnswer = 'My preference';
            
            const request: ClarificationRequest = {
                type: 'first_run_onboarding',
                context: 'Welcome! Please set your preferences.',
                // No options
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('first_run_onboarding');
            expect(response.response).toBe('My preference');
        });

        it('should format general prompt without term', async () => {
            handler.startSession();
            mockAnswer = 'My response';
            
            const request: ClarificationRequest = {
                type: 'general',
                context: 'Please provide some information.',
                // No term
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('general');
            expect(response.response).toBe('My response');
        });

        it('should format general prompt with suggestion', async () => {
            handler.startSession();
            mockAnswer = 'y'; // Accept suggestion
            
            const request: ClarificationRequest = {
                type: 'general',
                context: 'Is this correct?',
                term: 'something',
                suggestion: 'Suggested Value',
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('general');
            expect(response.response).toBe('Suggested Value');
        });
    });

    describe('edge cases for response processing', () => {
        it('should handle last valid option number selection', async () => {
            handler.startSession();
            mockAnswer = '3'; // Last option
            
            const request: ClarificationRequest = {
                type: 'routing_decision',
                context: 'Choose destination',
                term: 'note',
                options: ['/work', '/personal', '/archive'],
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('/archive');
        });

        it('should handle negative number as custom input', async () => {
            handler.startSession();
            mockAnswer = '-1';
            
            const request: ClarificationRequest = {
                type: 'routing_decision',
                context: 'Choose',
                term: 'note',
                options: ['/work', '/personal'],
            };

            const response = await handler.handleClarification(request);
            // Negative numbers don't match the number regex, treated as custom input
            expect(response.response).toBe('-1');
        });

        it('should handle whitespace-only response as empty (accept suggestion)', async () => {
            handler.startSession();
            mockAnswer = '   '; // Whitespace (trimmed to empty)
            
            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'Test',
                term: 'Jon',
                suggestion: 'John',
            };

            const response = await handler.handleClarification(request);
            // Empty after trim should accept suggestion
            expect(response.response).toBe('John');
        });

        it('should format first_run_onboarding with options', async () => {
            handler.startSession();
            mockAnswer = '1';
            
            const request: ClarificationRequest = {
                type: 'first_run_onboarding',
                context: 'Welcome! Please select your preference.',
                options: ['Option A', 'Option B', 'Option C'],
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('first_run_onboarding');
            expect(response.response).toBe('Option A');
        });

        it('should format routing_decision with empty options array', async () => {
            handler.startSession();
            mockAnswer = '/my/custom/path';
            
            const request: ClarificationRequest = {
                type: 'routing_decision',
                context: 'No predefined options',
                term: 'note',
                options: [], // Empty array
            };

            const response = await handler.handleClarification(request);
            expect(response.type).toBe('routing_decision');
            expect(response.response).toBe('/my/custom/path');
        });
    });

    describe('session handling with non-interactive mode', () => {
        it('should start session in non-interactive mode', () => {
            const config: InteractiveConfig = {
                enabled: false,
                defaultToSuggestion: true,
            };
            const nonInteractiveHandler = Handler.create(config);
            
            // Start session - should hit the else branch (line 169)
            nonInteractiveHandler.startSession();
            
            const session = nonInteractiveHandler.getSession();
            expect(session).not.toBeNull();
            expect(session?.startedAt).toBeInstanceOf(Date);
        });

        it('should handle clarification with session in non-interactive mode', async () => {
            const config: InteractiveConfig = {
                enabled: false,
                defaultToSuggestion: true,
            };
            const nonInteractiveHandler = Handler.create(config);
            
            // Start session
            nonInteractiveHandler.startSession();
            
            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'Test context',
                term: 'Jon',
                suggestion: 'John',
            };
            
            // Handle clarification - should push to session.responses (line 214)
            const response = await nonInteractiveHandler.handleClarification(request);
            
            expect(response.response).toBe('John');
            
            const session = nonInteractiveHandler.getSession();
            expect(session?.responses.length).toBe(1);
        });
    });
});
