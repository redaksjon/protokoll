/**
 * Interactive Handler
 * 
 * Manages interactive sessions and clarification requests.
 * Uses readline for actual user prompting.
 * Plays notification sounds when user input is needed (like Cursor).
 */

import * as readline from 'readline';
import { 
    InteractiveConfig, 
    InteractiveSession, 
    ClarificationRequest, 
    ClarificationResponse,
    NewProjectWizardResult,
    NewPersonWizardResult,
} from './types';
import * as Logging from '../logging';
import * as Sound from '../util/sound';

export interface HandlerInstance {
    startSession(): void;
    endSession(): InteractiveSession;
    handleClarification(request: ClarificationRequest): Promise<ClarificationResponse>;
    isEnabled(): boolean;
    getSession(): InteractiveSession | null;
}

const createReadlineInterface = () => {
    // Ensure stdin is in the correct mode for readline
    // This helps prevent issues with some terminal emulators
    if (process.stdin.setRawMode) {
        try {
            // Ensure we're NOT in raw mode - readline handles this itself
            process.stdin.setRawMode(false);
        } catch {
            // Ignore errors - some environments don't support setRawMode
        }
    }
    
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true, // Explicitly enable terminal mode for proper echo handling
    });
};

const askQuestion = (rl: readline.Interface, question: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
};

// Helper to write to stdout without triggering no-console lint rule
const write = (text: string) => process.stdout.write(text + '\n');

// Simplified project creation (used when creating project from term/person association)
const runCreateProjectFlow = async (
    rl: readline.Interface,
    contextMessage?: string
): Promise<NewProjectWizardResult> => {
    if (contextMessage) {
        write('');
        write(contextMessage);
    }
    
    // Step 1: Project name (required)
    const projectName = await askQuestion(rl, '\nProject name: ');
    
    if (!projectName) {
        write('Project name is required. Skipping project creation.');
        return { action: 'skip' };
    }
    
    // Step 2: Destination
    const destination = await askQuestion(rl, '\nWhere should output be routed to? (Enter for default): ');
    
    // Step 3: Description
    const description = await askQuestion(rl, '\nCan you tell me something about this project? (Enter to skip): ');
    
    return {
        action: 'create',
        projectName: projectName.trim(),
        destination: destination || undefined,
        description: description || undefined,
    };
};

const runNewProjectWizard = async (
    rl: readline.Interface,
    term: string,
    context: string | undefined,
    projectOptions: string[] | undefined
): Promise<NewProjectWizardResult> => {
    write('');
    write('─'.repeat(60));
    write(`[Unknown Project/Term]`);
    write(`Term: "${term}"`);
    write('');
    if (context) {
        // Display context with proper formatting (it now includes file info)
        write(context);
    }
    write('─'.repeat(60));
    
    // Step 1: Is this a project or a term?
    const entityType = await askQuestion(rl, '\nIs this a Project or a Term? (P/T/X to ignore, or Enter to skip): ');
    
    if (entityType === '' || entityType.toLowerCase() === 's' || entityType.toLowerCase() === 'skip') {
        return { action: 'skip' };
    }
    
    // IGNORE FLOW - user doesn't want to be asked about this term again
    if (entityType.toLowerCase() === 'x' || entityType.toLowerCase() === 'i' || entityType.toLowerCase() === 'ignore') {
        write(`\n[Adding "${term}" to ignore list - you won't be asked about this again]`);
        return { action: 'ignore', ignoredTerm: term };
    }
    
    // PROJECT FLOW
    if (entityType.toLowerCase() === 'p' || entityType.toLowerCase() === 'project') {
        // Step 2: Project name
        const projectName = await askQuestion(rl, `\nWhat is this project's name? [${term}]: `);
        const finalName = projectName || term;
        
        // Step 3: Destination
        const destination = await askQuestion(rl, '\nWhere should output be routed to? (Enter for default): ');
        
        // Step 4: Description
        const description = await askQuestion(rl, '\nCan you tell me something about this project? (Enter to skip): ');
        
        return {
            action: 'create',
            projectName: finalName,
            destination: destination || undefined,
            description: description || undefined,
        };
    }
    
    // TERM FLOW
    if (entityType.toLowerCase() === 't' || entityType.toLowerCase() === 'term') {
        // Step 2: Validate spelling
        const termCorrection = await askQuestion(rl, `\nIs "${term}" spelled correctly? (Enter to accept, or type correction): `);
        const finalTermName = termCorrection || term;
        
        if (termCorrection) {
            write(`Term updated to: "${finalTermName}"`);
        }
        
        // Step 3: Is this an acronym?
        const expansion = await askQuestion(rl, `\nIf "${finalTermName}" is an acronym, what does it stand for? (Enter to skip): `);
        
        // Step 4: Which project(s) is this term associated with?
        const termProjects: number[] = [];
        let createdProject: NewProjectWizardResult | undefined;
        
        if (projectOptions && projectOptions.length > 0) {
            write('\nExisting projects:');
            projectOptions.forEach((opt, i) => {
                write(`  ${i + 1}. ${opt}`);
            });
            write(`  N. Create a new project`);
            
            const projectSelection = await askQuestion(rl, `\nWhich project(s) is "${finalTermName}" associated with? (Enter numbers separated by commas, N for new, or Enter to skip): `);
            
            if (projectSelection.toLowerCase().includes('n')) {
                // User wants to create a new project to associate with this term
                write('');
                write(`[Create New Project for Term "${finalTermName}"]`);
                createdProject = await runCreateProjectFlow(rl, `The term "${finalTermName}" will be associated with this new project.`);
                
                if (createdProject.action === 'create' && createdProject.projectName) {
                    write(`\n[Project "${createdProject.projectName}" will be created and associated with term "${finalTermName}"]`);
                }
            } else if (projectSelection) {
                const indices = projectSelection.split(',').map(s => parseInt(s.trim(), 10) - 1);
                for (const idx of indices) {
                    if (!isNaN(idx) && idx >= 0 && idx < projectOptions.length) {
                        termProjects.push(idx);
                    }
                }
                
                if (termProjects.length > 0) {
                    write(`Associated with: ${termProjects.map(i => projectOptions[i].split(' - ')[0]).join(', ')}`);
                }
            }
        } else {
            // No existing projects - offer to create one
            const createNew = await askQuestion(rl, `\nNo existing projects found. Create a new project for term "${finalTermName}"? (Y/N, or Enter to skip): `);
            
            if (createNew.toLowerCase() === 'y' || createNew.toLowerCase() === 'yes') {
                write('');
                write(`[Create New Project for Term "${finalTermName}"]`);
                createdProject = await runCreateProjectFlow(rl, `The term "${finalTermName}" will be associated with this new project.`);
                
                if (createdProject.action === 'create' && createdProject.projectName) {
                    write(`\n[Project "${createdProject.projectName}" will be created and associated with term "${finalTermName}"]`);
                }
            }
        }
        
        // Step 5: Description
        const termDesc = await askQuestion(rl, `\nBrief description of "${finalTermName}"? (Enter to skip): `);
        
        return {
            action: 'term',
            termName: finalTermName,
            termExpansion: expansion || undefined,
            termProjects: termProjects.length > 0 ? termProjects : undefined,
            termDescription: termDesc || undefined,
            createdProject,
        };
    }
    
    // Unrecognized input
    write('\nUnrecognized input. Please enter P for Project, T for Term, or press Enter to skip.');
    return { action: 'skip' };
};

const runNewPersonWizard = async (
    rl: readline.Interface,
    name: string,
    context: string | undefined,
    projectOptions: string[] | undefined
): Promise<NewPersonWizardResult> => {
    write('');
    write('─'.repeat(60));
    write(`[Unknown Person Detected]`);
    write(`Name heard: "${name}"`);
    write('');
    if (context) {
        // Display context with proper formatting (it now includes file info)
        write(context);
    }
    write('─'.repeat(60));
    
    // Step 1: Confirm name spelling
    const nameCorrection = await askQuestion(rl, `\nIs the name spelled correctly? (Enter to accept, or type correction): `);
    const finalName = nameCorrection || name;
    
    if (nameCorrection) {
        write(`Name updated to: "${finalName}"`);
    }
    
    // Step 2: Ask for organization/company
    const organization = await askQuestion(rl, `\nWhat organization/company is ${finalName} with? (Enter to skip): `);
    
    // Step 3: Project association
    let linkedProjectIndex: number | undefined;
    let createdProject: NewProjectWizardResult | undefined;
    
    // Show project options with "N" for new project
    if (projectOptions && projectOptions.length > 0) {
        write('\nExisting projects:');
        projectOptions.forEach((opt, i) => {
            write(`  ${i + 1}. ${opt}`);
        });
        write(`  N. Create a new project`);
        
        const projectSelection = await askQuestion(rl, `\nWhich project is ${finalName} related to? (Enter number, N for new, or Enter to skip): `);
        
        if (projectSelection.toLowerCase() === 'n') {
            // User wants to create a new project for this person
            write('');
            write(`[Create New Project for ${finalName}]`);
            const contextMsg = organization 
                ? `Creating project for ${finalName} (${organization})`
                : `Creating project for ${finalName}`;
            createdProject = await runCreateProjectFlow(rl, contextMsg);
            
            if (createdProject.action === 'create' && createdProject.projectName) {
                write(`\n[Project "${createdProject.projectName}" will be created and linked to ${finalName}]`);
            }
        } else if (projectSelection && /^\d+$/.test(projectSelection)) {
            const idx = parseInt(projectSelection, 10) - 1;
            if (idx >= 0 && idx < projectOptions.length) {
                linkedProjectIndex = idx;
                write(`Linked to: ${projectOptions[idx]}`);
            }
        }
    } else {
        // No existing projects - offer to create one
        const createNew = await askQuestion(rl, `\nNo existing projects found. Create a new project for ${finalName}? (Y/N, or Enter to skip): `);
        
        if (createNew.toLowerCase() === 'y' || createNew.toLowerCase() === 'yes') {
            write('');
            write(`[Create New Project for ${finalName}]`);
            const contextMsg = organization 
                ? `Creating project for ${finalName} (${organization})`
                : `Creating project for ${finalName}`;
            createdProject = await runCreateProjectFlow(rl, contextMsg);
            
            if (createdProject.action === 'create' && createdProject.projectName) {
                write(`\n[Project "${createdProject.projectName}" will be created and linked to ${finalName}]`);
            }
        }
    }
    
    // Step 4: Ask for notes about the person
    const notes = await askQuestion(rl, `\nAny notes about ${finalName}? (Enter to skip): `);
    
    // Determine if we should create the person
    const hasInfo = organization || linkedProjectIndex !== undefined || createdProject || notes;
    
    if (!hasInfo) {
        // User skipped everything - confirm if they want to skip entirely
        const confirm = await askQuestion(rl, `\nNo information provided. Skip saving ${finalName}? (Enter to skip, or any key to save anyway): `);
        if (confirm === '') {
            return { action: 'skip' };
        }
    }
    
    return {
        action: 'create',
        personName: finalName,
        organization: organization || undefined,
        linkedProjectIndex,
        notes: notes || undefined,
        createdProject,
    };
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
            // This case is handled by the wizard, but provide fallback prompt
            lines.push(`[Unknown Project/Term]`);
            lines.push(`Term: "${request.term}"`);
            if (request.context) {
                lines.push(`${request.context}`);
            }
            lines.push('');
            lines.push('Is this a new project? (Y/N, or Enter to skip):');
            break;
            
        case 'new_company':
            lines.push(`[New Company Detected]`);
            lines.push(`Context: ${request.context}`);
            lines.push(`Company name: "${request.term}"`);
            lines.push('');
            lines.push('Any notes about this company? (or press Enter to skip):');
            break;
            
        case 'new_term':
            lines.push(`[New Term Found]`);
            lines.push(`Context: ${request.context}`);
            lines.push(`Term: "${request.term}"`);
            lines.push('');
            lines.push('What does this term mean? (brief description, or press Enter to skip):');
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
            
        case 'low_confidence_routing':
            lines.push(`[Confirm Note Routing]`);
            lines.push(`Confidence: ${request.term}`);
            lines.push(`${request.context}`);
            lines.push('');
            lines.push('Is this correct? (Y/Enter to accept, or enter different path):');
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
                lines.push(`Suggested spelling: "${request.suggestion}"`);
                lines.push('');
                lines.push('Press Enter or Y to accept suggestion, or type alternative:');
            } else {
                lines.push('');
                lines.push('Your response:');
            }
            break;
    }
    
    lines.push('─'.repeat(60));
    
    return lines.join('\n') + '\n> ';
};

export const create = (config: InteractiveConfig): HandlerInstance => {
    const logger = Logging.getLogger();
    const sound = Sound.create({ silent: config.silent ?? false });
  
    let session: InteractiveSession | null = null;
    let rl: readline.Interface | null = null;
  
    const startSession = () => {
        session = {
            requests: [],
            responses: [],
            startedAt: new Date(),
        };
        
        // Check if we can run interactively:
        // 1. Interactive mode must be enabled (not --batch)
        // 2. stdin must be a TTY (not piped/cron/etc)
        const isTTY = process.stdin.isTTY === true;
        
        if (config.enabled && isTTY) {
            // Only create readline interface if one doesn't already exist
            // This prevents duplicate input handlers when processing multiple files
            if (!rl) {
                rl = createReadlineInterface();
                logger.info('Interactive session started - will prompt for clarifications');
            } else {
                logger.debug('Interactive session continued (readline already active)');
            }
        } else if (config.enabled && !isTTY) {
            logger.info('Interactive mode enabled but stdin is not a TTY - running in auto-resolve mode');
        } else {
            logger.debug('Interactive session started (batch mode)');
        }
    };
  
    const endSession = (): InteractiveSession => {
        if (!session) {
            throw new Error('No active session');
        }
        
        if (rl) {
            // Remove all listeners before closing to prevent any lingering handlers
            // Check if method exists (may not in mocks)
            if (typeof rl.removeAllListeners === 'function') {
                rl.removeAllListeners();
            }
            rl.close();
            rl = null;
            
            // Resume stdin in case it was paused
            if (process.stdin.isPaused && process.stdin.isPaused()) {
                process.stdin.resume();
            }
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
        // Play notification sound to get user's attention (like Cursor does)
        await sound.playNotification();
        
        // Special handling for new_project - use wizard
        if (request.type === 'new_project') {
            const wizardResult = await runNewProjectWizard(
                rl,
                request.term,
                request.context,
                request.options
            );
            
            const response: ClarificationResponse = {
                type: request.type,
                term: request.term,
                response: wizardResult.action,
                shouldRemember: wizardResult.action !== 'skip',
                additionalInfo: wizardResult as unknown as Record<string, unknown>,
            };
            
            if (session) {
                session.responses.push(response);
            }
            
            logger.debug('New project wizard completed', {
                term: request.term,
                action: wizardResult.action,
                additionalInfo: wizardResult,
            });
            
            return response;
        }
        
        // Special handling for new_person - use wizard
        if (request.type === 'new_person') {
            const wizardResult = await runNewPersonWizard(
                rl,
                request.term,
                request.context,
                request.options
            );
            
            const response: ClarificationResponse = {
                type: request.type,
                term: request.term,
                response: wizardResult.action,
                shouldRemember: wizardResult.action !== 'skip',
                additionalInfo: wizardResult as unknown as Record<string, unknown>,
            };
            
            if (session) {
                session.responses.push(response);
            }
            
            logger.debug('New person wizard completed', {
                term: request.term,
                action: wizardResult.action,
                additionalInfo: wizardResult,
            });
            
            return response;
        }
        
        // Standard single-prompt flow for other types
        const prompt = formatClarificationPrompt(request);
        const userInput = await askQuestion(rl, prompt);
        
        // Process the user's response
        let finalResponse: string;
        let shouldRemember = false;
        
        if (userInput === '' || userInput.toLowerCase() === 'y') {
            // User pressed Enter or typed Y - use suggestion or original
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
