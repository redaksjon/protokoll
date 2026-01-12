/**
 * Interactive Handler
 * 
 * Manages interactive sessions and clarification requests.
 * Uses readline for actual user prompting.
 */

import * as readline from 'readline';
import { 
    InteractiveConfig, 
    InteractiveSession, 
    ClarificationRequest, 
    ClarificationResponse 
} from './types';
import * as Logging from '../logging';

export interface HandlerInstance {
    startSession(): void;
    endSession(): InteractiveSession;
    handleClarification(request: ClarificationRequest): Promise<ClarificationResponse>;
    isEnabled(): boolean;
    getSession(): InteractiveSession | null;
}

const createReadlineInterface = () => {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
};

const askQuestion = (rl: readline.Interface, question: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
};

const formatClarificationPrompt = (request: ClarificationRequest): string => {
    const lines: string[] = [];
    
    lines.push('');
    lines.push('─'.repeat(60));
    
    switch (request.type) {
        case 'name_spelling':
            lines.push(`[Name Spelling Clarification]`);
            lines.push(`Context: ${request.context}`);
            lines.push(`Heard: "${request.term}"`);
            if (request.suggestion) {
                lines.push(`Suggested correction: "${request.suggestion}"`);
            }
            lines.push('');
            lines.push('Enter correct spelling (or press Enter to accept suggestion):');
            break;
            
        case 'new_person':
            lines.push(`[New Person Detected]`);
            lines.push(`Context: ${request.context}`);
            lines.push(`Name heard: "${request.term}"`);
            lines.push('');
            lines.push('Who is this person? (brief description, or press Enter to skip):');
            break;
            
        case 'new_project':
            lines.push(`[New Project Detected]`);
            lines.push(`Context: ${request.context}`);
            lines.push(`Project name: "${request.term}"`);
            lines.push('');
            lines.push('What is this project? (brief description, or press Enter to skip):');
            break;
            
        case 'new_company':
            lines.push(`[New Company Detected]`);
            lines.push(`Context: ${request.context}`);
            lines.push(`Company name: "${request.term}"`);
            lines.push('');
            lines.push('Any notes about this company? (or press Enter to skip):');
            break;
            
        case 'routing_decision':
            lines.push(`[Routing Decision Required]`);
            lines.push(`Context: ${request.context}`);
            if (request.options && request.options.length > 0) {
                lines.push('Available destinations:');
                request.options.forEach((opt, i) => {
                    lines.push(`  ${i + 1}. ${opt}`);
                });
                lines.push('');
                lines.push('Enter number or destination path:');
            } else {
                lines.push('');
                lines.push('Where should this note be filed?');
            }
            break;
            
        case 'first_run_onboarding':
            lines.push(`[First Run Setup]`);
            lines.push(`${request.context}`);
            lines.push('');
            if (request.options && request.options.length > 0) {
                request.options.forEach((opt, i) => {
                    lines.push(`  ${i + 1}. ${opt}`);
                });
                lines.push('');
                lines.push('Enter your choice:');
            } else {
                lines.push('Enter your response:');
            }
            break;
            
        case 'general':
        default:
            lines.push(`[Clarification Needed]`);
            lines.push(`${request.context}`);
            if (request.term) {
                lines.push(`Term: "${request.term}"`);
            }
            if (request.suggestion) {
                lines.push(`Suggestion: "${request.suggestion}"`);
            }
            lines.push('');
            lines.push('Your response:');
            break;
    }
    
    lines.push('─'.repeat(60));
    
    return lines.join('\n') + '\n> ';
};

export const create = (config: InteractiveConfig): HandlerInstance => {
    const logger = Logging.getLogger();
  
    let session: InteractiveSession | null = null;
    let rl: readline.Interface | null = null;
  
    const startSession = () => {
        session = {
            requests: [],
            responses: [],
            startedAt: new Date(),
        };
        
        if (config.enabled) {
            rl = createReadlineInterface();
            logger.info('Interactive session started - will prompt for clarifications');
        } else {
            logger.debug('Interactive session started (non-interactive mode)');
        }
    };
  
    const endSession = (): InteractiveSession => {
        if (!session) {
            throw new Error('No active session');
        }
        
        if (rl) {
            rl.close();
            rl = null;
        }
        
        session.completedAt = new Date();
        const completed = session;
        session = null;
        
        logger.info('Interactive session ended', { 
            requests: completed.requests.length,
            responses: completed.responses.length,
        });
        
        return completed;
    };
  
    const handleClarification = async (
        request: ClarificationRequest
    ): Promise<ClarificationResponse> => {
        if (session) {
            session.requests.push(request);
        }
    
        // In non-interactive mode, return the suggestion or the original term
        if (!config.enabled || !rl) {
            const response: ClarificationResponse = {
                type: request.type,
                term: request.term,
                response: config.defaultToSuggestion && request.suggestion 
                    ? request.suggestion 
                    : request.term,
                shouldRemember: false,
            };
        
            if (session) {
                session.responses.push(response);
            }
        
            logger.debug('Clarification auto-resolved (non-interactive)', { 
                type: request.type, 
                term: request.term,
                response: response.response,
            });
        
            return response;
        }
        
        // Interactive mode - actually prompt the user
        const prompt = formatClarificationPrompt(request);
        const userInput = await askQuestion(rl, prompt);
        
        // Process the user's response
        let finalResponse: string;
        let shouldRemember = false;
        
        if (userInput === '') {
            // User pressed Enter - use suggestion or original
            finalResponse = request.suggestion || request.term;
        } else if (request.options && /^\d+$/.test(userInput)) {
            // User entered a number - select from options
            const index = parseInt(userInput, 10) - 1;
            if (index >= 0 && index < request.options.length) {
                finalResponse = request.options[index];
            } else {
                finalResponse = userInput;
            }
        } else {
            finalResponse = userInput;
            // If user provided a custom answer, they might want to remember it
            shouldRemember = true;
        }
        
        const response: ClarificationResponse = {
            type: request.type,
            term: request.term,
            response: finalResponse,
            shouldRemember,
        };
    
        if (session) {
            session.responses.push(response);
        }
    
        logger.debug('Clarification resolved via user input', { 
            type: request.type, 
            term: request.term,
            response: response.response,
            shouldRemember,
        });
    
        return response;
    };
  
    const isEnabled = () => config.enabled;
  
    const getSession = () => session;
  
    return {
        startSession,
        endSession,
        handleClarification,
        isEnabled,
        getSession,
    };
};
