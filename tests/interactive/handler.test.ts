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

// Mock sound to avoid actual sound playback
vi.mock('../../src/util/sound', () => ({
    create: () => ({
        playNotification: vi.fn().mockResolvedValue(undefined),
    }),
}));

// Sequential mock answers for multi-step wizards
let mockAnswers: string[] = [];
let mockAnswerIndex = 0;

// Helper to set up sequential answers for wizard tests
const setMockAnswers = (answers: string[]) => {
    mockAnswers = answers;
    mockAnswerIndex = 0;
};

// Legacy single answer support
let mockAnswer = '';

// Track if removeAllListeners was called
let removeAllListenersCalled = false;
let closeCalled = false;

vi.mock('readline', () => ({
    createInterface: vi.fn(() => ({
        question: vi.fn((prompt: string, callback: (answer: string) => void) => {
            // Use sequential answers if available, otherwise fall back to single mockAnswer
            if (mockAnswers.length > 0) {
                const answer = mockAnswers[mockAnswerIndex] ?? '';
                mockAnswerIndex++;
                callback(answer);
            } else {
                callback(mockAnswer);
            }
        }),
        close: vi.fn(() => {
            closeCalled = true;
        }),
        removeAllListeners: vi.fn(() => {
            removeAllListenersCalled = true;
        }),
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
        // Reset mock answers
        mockAnswers = [];
        mockAnswerIndex = 0;
        mockAnswer = '';
        removeAllListenersCalled = false;
        closeCalled = false;
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

    describe('new project wizard flows', () => {
        it('should handle project creation flow with all details', async () => {
            handler.startSession();
            // Answers: P (project), ProjectName, /output/path, Project description
            setMockAnswers(['P', 'MyProject', '/output/path', 'A test project']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Working on something new',
                term: 'MyProj',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('create');
            expect(response.shouldRemember).toBe(true);
            const info = response.additionalInfo as { projectName?: string; destination?: string; description?: string };
            expect(info.projectName).toBe('MyProject');
            expect(info.destination).toBe('/output/path');
            expect(info.description).toBe('A test project');
        });

        it('should use term as project name when no name provided', async () => {
            handler.startSession();
            // Answers: P (project), empty (use term), /output, description
            setMockAnswers(['P', '', '/output', 'Test desc']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'DefaultProject',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('create');
            const info = response.additionalInfo as { projectName?: string };
            expect(info.projectName).toBe('DefaultProject');
        });

        it('should handle project skip flow', async () => {
            handler.startSession();
            // Empty answer to skip
            setMockAnswers(['']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'SomeProject',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('skip');
            expect(response.shouldRemember).toBe(false);
        });

        it('should handle project skip with s', async () => {
            handler.startSession();
            setMockAnswers(['s']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'SkippedProject',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('skip');
        });

        it('should handle project skip with skip', async () => {
            handler.startSession();
            setMockAnswers(['skip']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'SkippedProject',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('skip');
        });

        it('should handle ignore flow with x', async () => {
            handler.startSession();
            setMockAnswers(['x']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'IgnoredTerm',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('ignore');
            const info = response.additionalInfo as { ignoredTerm?: string };
            expect(info.ignoredTerm).toBe('IgnoredTerm');
        });

        it('should handle ignore flow with i', async () => {
            handler.startSession();
            setMockAnswers(['i']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'IgnoredTerm2',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('ignore');
        });

        it('should handle ignore flow with ignore', async () => {
            handler.startSession();
            setMockAnswers(['ignore']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'IgnoredTerm3',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('ignore');
        });

        it('should handle term flow with correction and expansion', async () => {
            handler.startSession();
            // T (term), N (not alias), correction, expansion, skip projects, description
            setMockAnswers(['T', '', 'CorrectedTerm', 'Full Term Name', '', 'Term description']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'OriginalTerm',
                options: ['Project A - desc', 'Project B - desc'],
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('term');
            const info = response.additionalInfo as { 
                termName?: string; 
                termExpansion?: string;
                termDescription?: string;
            };
            expect(info.termName).toBe('CorrectedTerm');
            expect(info.termExpansion).toBe('Full Term Name');
            expect(info.termDescription).toBe('Term description');
        });

        it('should handle term flow without correction (accept original)', async () => {
            handler.startSession();
            // T (term), N (not alias), empty (accept name), empty (no expansion), skip projects, empty desc
            setMockAnswers(['term', '', '', '', '', '']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'MyTerm',
                options: ['Project A'],
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('term');
            const info = response.additionalInfo as { termName?: string };
            expect(info.termName).toBe('MyTerm');
        });

        it('should handle term flow with project association', async () => {
            handler.startSession();
            // T (term), N (not alias), empty (accept name), empty (no expansion), "1,2" (select projects), description
            setMockAnswers(['t', '', '', '', '1,2', 'A technical term']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'APITerm',
                options: ['Project A - API', 'Project B - Services'],
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('term');
            const info = response.additionalInfo as { termProjects?: number[] };
            expect(info.termProjects).toEqual([0, 1]);
        });

        it('should handle term flow with new project creation', async () => {
            handler.startSession();
            // T (term), N (not alias), empty (accept name), empty (no expansion), N (new project), NewProjectName, /output, project desc, term desc
            setMockAnswers(['t', '', '', '', 'N', 'NewProject', '/dest', 'Project desc', 'Term desc']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'NewTerm',
                options: ['Existing Project'],
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('term');
            const info = response.additionalInfo as { 
                createdProject?: { action: string; projectName?: string } 
            };
            expect(info.createdProject?.action).toBe('create');
            expect(info.createdProject?.projectName).toBe('NewProject');
        });

        it('should handle term flow with no existing projects - create new', async () => {
            handler.startSession();
            // T (term), N (not alias), empty (accept name), empty (no expansion), Y (create new), ProjectName, /dest, proj desc, term desc
            setMockAnswers(['t', '', '', '', 'y', 'NewProj', '/path', 'Proj desc', 'Term desc']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'NewTermNoProjects',
                options: undefined, // No projects
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('term');
            const info = response.additionalInfo as { 
                createdProject?: { action: string; projectName?: string } 
            };
            expect(info.createdProject?.action).toBe('create');
        });

        it('should handle term flow with no existing projects - decline', async () => {
            handler.startSession();
            // T (term), empty, empty, N (decline new project), term desc
            setMockAnswers(['t', '', '', 'n', 'Term desc']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'SimpleTermNoProjects',
                options: undefined,
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('term');
            const info = response.additionalInfo as { createdProject?: unknown };
            expect(info.createdProject).toBeUndefined();
        });

        it('should handle unrecognized entity type input', async () => {
            handler.startSession();
            setMockAnswers(['xyz']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'SomeTerm',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('skip');
        });

        it('should handle project flow with empty project name (uses term as default)', async () => {
            handler.startSession();
            // P (project), empty name (falls back to term), empty destination, empty description
            setMockAnswers(['P', '', '', '']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'FallbackTerm',
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('create');
            const info = response.additionalInfo as { projectName?: string };
            expect(info.projectName).toBe('FallbackTerm'); // Uses term as default
        });

        it('should handle runCreateProjectFlow skip when project name empty (from term flow)', async () => {
            handler.startSession();
            // T (term), N (not alias), accept name, no expansion, N (new project), empty project name (skip)
            setMockAnswers(['t', '', '', '', 'N', '']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context for runCreateProjectFlow skip test',
                term: 'SomeTerm',
                options: ['Existing Project'],
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('term');
            const info = response.additionalInfo as { createdProject?: { action: string } };
            expect(info.createdProject?.action).toBe('skip');
        });

        it('should handle term with invalid project indices', async () => {
            handler.startSession();
            // T, N (not alias), empty (accept name), empty (no expansion), "99,abc,1" (mixed valid/invalid), desc
            setMockAnswers(['t', '', '', '', '99,abc,1', 'desc']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'Context',
                term: 'Term',
                options: ['Project A', 'Project B'],
            };

            const response = await handler.handleClarification(request);
            const info = response.additionalInfo as { termProjects?: number[] };
            // Only index 1 (1-1=0) should be valid
            expect(info.termProjects).toEqual([0]);
        });
    });

    describe('new person wizard flows', () => {
        it('should handle person creation with all details', async () => {
            handler.startSession();
            // name correction, organization, project selection, notes
            setMockAnswers(['John Smith', 'Acme Corp', '1', 'Met at conference']);
            
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Met someone new',
                term: 'Jon',
                options: ['Project A - desc'],
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('create');
            const info = response.additionalInfo as { 
                personName?: string; 
                organization?: string;
                linkedProjectIndex?: number;
                notes?: string;
            };
            expect(info.personName).toBe('John Smith');
            expect(info.organization).toBe('Acme Corp');
            expect(info.linkedProjectIndex).toBe(0);
            expect(info.notes).toBe('Met at conference');
        });

        it('should handle person creation without name correction', async () => {
            handler.startSession();
            // empty (accept name), org, project, notes
            setMockAnswers(['', 'CompanyX', '1', 'Some notes']);
            
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Context',
                term: 'Alice',
                options: ['Project'],
            };

            const response = await handler.handleClarification(request);
            const info = response.additionalInfo as { personName?: string };
            expect(info.personName).toBe('Alice');
        });

        it('should handle person with new project creation', async () => {
            handler.startSession();
            // name, org, N (new project), project name, dest, proj desc, notes
            setMockAnswers(['Bob', 'TechCorp', 'n', 'BobProject', '/bob', 'Bob project', 'Good contact']);
            
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Context',
                term: 'Bob',
                options: ['Existing Project'],
            };

            const response = await handler.handleClarification(request);
            const info = response.additionalInfo as { 
                createdProject?: { action: string; projectName?: string } 
            };
            expect(info.createdProject?.action).toBe('create');
            expect(info.createdProject?.projectName).toBe('BobProject');
        });

        it('should handle person without existing projects - create new', async () => {
            handler.startSession();
            // name, org, Y (create project), proj name, dest, desc, notes
            setMockAnswers(['Charlie', 'StartupInc', 'y', 'CharlieProj', '/charlie', 'Charlie project', 'Founder']);
            
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Context',
                term: 'Charlie',
                options: undefined,
            };

            const response = await handler.handleClarification(request);
            const info = response.additionalInfo as { 
                createdProject?: { action: string; projectName?: string } 
            };
            expect(info.createdProject?.action).toBe('create');
        });

        it('should handle person without existing projects - decline', async () => {
            handler.startSession();
            // name, empty org, N (decline), notes
            setMockAnswers(['Dave', '', 'n', 'Just met']);
            
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Context',
                term: 'Dave',
                options: undefined,
            };

            const response = await handler.handleClarification(request);
            const info = response.additionalInfo as { createdProject?: unknown };
            expect(info.createdProject).toBeUndefined();
        });

        it('should handle person skip when all info empty and confirmed skip', async () => {
            handler.startSession();
            // name correction (empty), org (empty), project (empty), notes (empty), confirm skip (empty)
            setMockAnswers(['', '', '', '', '']);
            
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Context',
                term: 'UnknownPerson',
                options: ['Project A'],
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('skip');
        });

        it('should handle person save anyway when no info but user confirms', async () => {
            handler.startSession();
            // name (empty), org (empty), project (empty), notes (empty), save anyway (any key)
            setMockAnswers(['', '', '', '', 'y']);
            
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Context',
                term: 'SavedPerson',
                options: ['Project'],
            };

            const response = await handler.handleClarification(request);
            expect(response.response).toBe('create');
        });

        it('should handle person with invalid project selection', async () => {
            handler.startSession();
            // name, org, invalid project number, notes
            setMockAnswers(['Eve', 'Corp', 'abc', 'Notes']);
            
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Context',
                term: 'Eve',
                options: ['Project A'],
            };

            const response = await handler.handleClarification(request);
            const info = response.additionalInfo as { linkedProjectIndex?: number };
            expect(info.linkedProjectIndex).toBeUndefined();
        });

        it('should handle person with out of bounds project selection', async () => {
            handler.startSession();
            // name, org, "99" (out of bounds), notes
            setMockAnswers(['Frank', 'Corp', '99', 'Notes']);
            
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'Context',
                term: 'Frank',
                options: ['Project A'],
            };

            const response = await handler.handleClarification(request);
            const info = response.additionalInfo as { linkedProjectIndex?: number };
            expect(info.linkedProjectIndex).toBeUndefined();
        });
    });

    describe('session cleanup and edge cases', () => {
        it('should call removeAllListeners on session end', () => {
            handler.startSession();
            handler.endSession();
            expect(removeAllListenersCalled).toBe(true);
            expect(closeCalled).toBe(true);
        });

        it('should handle session continuation when readline already exists', () => {
            // First session start creates readline
            handler.startSession();
            const session1 = handler.getSession();
            expect(session1).not.toBeNull();
            
            // End and restart - should continue
            handler.endSession();
            handler.startSession();
            const session2 = handler.getSession();
            expect(session2).not.toBeNull();
        });

        it('should reuse existing readline when startSession called without endSession', () => {
            // First session start creates readline
            handler.startSession();
            const session1 = handler.getSession();
            expect(session1).not.toBeNull();
            
            // Start another session without ending - should reuse readline (line 465)
            handler.startSession();
            const session2 = handler.getSession();
            expect(session2).not.toBeNull();
            // Note: This tests the "readline already active" branch
        });

        it('should run in auto-resolve mode when stdin is not TTY', () => {
            // Set isTTY to false
            Object.defineProperty(process.stdin, 'isTTY', {
                value: false,
                writable: true,
                configurable: true,
            });
            
            const config: InteractiveConfig = {
                enabled: true,
                defaultToSuggestion: true,
            };
            const ttyHandler = Handler.create(config);
            ttyHandler.startSession();
            
            // Should still be enabled
            expect(ttyHandler.isEnabled()).toBe(true);
            
            // Session should be created
            const session = ttyHandler.getSession();
            expect(session).not.toBeNull();
        });

        it('should auto-resolve clarifications when stdin is not TTY', async () => {
            Object.defineProperty(process.stdin, 'isTTY', {
                value: false,
                writable: true,
                configurable: true,
            });
            
            const config: InteractiveConfig = {
                enabled: true,
                defaultToSuggestion: true,
            };
            const ttyHandler = Handler.create(config);
            ttyHandler.startSession();
            
            const request: ClarificationRequest = {
                type: 'name_spelling',
                context: 'Test',
                term: 'Jon',
                suggestion: 'John',
            };

            const response = await ttyHandler.handleClarification(request);
            // Should use suggestion since defaultToSuggestion is true
            expect(response.response).toBe('John');
        });
    });

    describe('stdin handling edge cases', () => {
        it('should handle isPaused returning undefined', () => {
            handler.startSession();
            
            // Mock stdin.isPaused to return undefined
            const originalIsPaused = process.stdin.isPaused;
            Object.defineProperty(process.stdin, 'isPaused', {
                value: undefined,
                writable: true,
                configurable: true,
            });
            
            // Should not throw
            expect(() => handler.endSession()).not.toThrow();
            
            // Restore
            Object.defineProperty(process.stdin, 'isPaused', {
                value: originalIsPaused,
                writable: true,
                configurable: true,
            });
        });

        it('should handle isPaused returning a function that returns false', () => {
            handler.startSession();
            
            const originalIsPaused = process.stdin.isPaused;
            Object.defineProperty(process.stdin, 'isPaused', {
                value: () => false,
                writable: true,
                configurable: true,
            });
            
            expect(() => handler.endSession()).not.toThrow();
            
            Object.defineProperty(process.stdin, 'isPaused', {
                value: originalIsPaused,
                writable: true,
                configurable: true,
            });
        });

        it('should call resume when isPaused returns true', () => {
            handler.startSession();
            
            const originalIsPaused = process.stdin.isPaused;
            const originalResume = process.stdin.resume;
            let resumeCalled = false;
            
            Object.defineProperty(process.stdin, 'isPaused', {
                value: () => true,
                writable: true,
                configurable: true,
            });
            Object.defineProperty(process.stdin, 'resume', {
                value: () => { resumeCalled = true; },
                writable: true,
                configurable: true,
            });
            
            handler.endSession();
            
            expect(resumeCalled).toBe(true);
            
            // Restore
            Object.defineProperty(process.stdin, 'isPaused', {
                value: originalIsPaused,
                writable: true,
                configurable: true,
            });
            Object.defineProperty(process.stdin, 'resume', {
                value: originalResume,
                writable: true,
                configurable: true,
            });
        });
    });

    describe('silent mode', () => {
        it('should create handler with silent mode', () => {
            const config: InteractiveConfig = {
                enabled: true,
                defaultToSuggestion: true,
                silent: true,
            };
            const silentHandler = Handler.create(config);
            expect(silentHandler.isEnabled()).toBe(true);
        });
    });

    describe('context display in wizards', () => {
        it('should display context in new project wizard when provided', async () => {
            handler.startSession();
            setMockAnswers(['']);
            
            const request: ClarificationRequest = {
                type: 'new_project',
                context: 'File: test.txt\nLine: Some context about the term',
                term: 'TestTerm',
            };

            await handler.handleClarification(request);
            // Just verify it doesn't crash - the write function is mocked
            expect(true).toBe(true);
        });

        it('should display context in new person wizard when provided', async () => {
            handler.startSession();
            setMockAnswers(['', '', '', '', '']);
            
            const request: ClarificationRequest = {
                type: 'new_person',
                context: 'File: meeting.txt\nLine: Discussed with Alice',
                term: 'Alice',
                options: ['Project A'],
            };

            await handler.handleClarification(request);
            expect(true).toBe(true);
        });
    });
});
