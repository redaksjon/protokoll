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
import * as ContentFetcher from '../cli/content-fetcher';
import * as OpenAI from '../util/openai';

export interface HandlerInstance {
    startSession(): void;
    endSession(): InteractiveSession;
    handleClarification(request: ClarificationRequest): Promise<ClarificationResponse>;
    isEnabled(): boolean;
    getSession(): InteractiveSession | null;
    // File tracking
    startFile(filePath: string): void;
    endFile(outputPath?: string, movedTo?: string): void;
    // Entity tracking
    trackTermAdded(termName: string): void;
    trackTermUpdated(termName: string): void;
    trackProjectAdded(projectName: string): void;
    trackProjectUpdated(projectName: string): void;
    trackPersonAdded(personName: string): void;
    trackAlias(alias: string, linkedTo: string): void;
    // Session control
    requestStop(): void;
    shouldStopSession(): boolean;
    // Summary
    printSummary(): void;
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

/**
 * Analyze content from URL/file to determine if it's a Project or Term
 * and extract relevant metadata
 */
interface ContentAnalysis {
    entityType: 'project' | 'term' | 'unknown';
    name: string;
    description?: string;
    expansion?: string;  // For terms that are acronyms
    topics?: string[];
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
}

const analyzeContentForEntity = async (
    content: string,
    sourceName: string,
    originalTerm: string
): Promise<ContentAnalysis> => {
    const logger = Logging.getLogger();
    
    logger.debug('Analyzing content to determine entity type for: %s', originalTerm);
    
    const prompt = `You are analyzing content to determine if "${originalTerm}" refers to a PROJECT or a TERM.

DEFINITIONS:
- PROJECT: A specific initiative, codebase, client engagement, or ongoing work effort with deliverables
- TERM: A technology, concept, tool, methodology, or technical term that needs to be understood and referenced

SOURCE: ${sourceName}
CONTENT:
---
${content.substring(0, 8000)}
---

Based on this content, determine:
1. Is "${originalTerm}" a PROJECT or a TERM?
2. What is the correct/full name?
3. What is a brief description (1-2 sentences)?
4. If it's a TERM and an acronym, what does it stand for?
5. What are related topics/keywords (5-10 words)?
6. How confident are you? (high/medium/low)

Respond in JSON format:
{
    "entityType": "project" | "term",
    "name": "string",
    "description": "string",
    "expansion": "string or null",
    "topics": ["keyword1", "keyword2", ...],
    "confidence": "high" | "medium" | "low",
    "reasoning": "Brief explanation of your determination"
}`;

    try {
        const response = await OpenAI.createCompletion(
            [{ role: 'user', content: prompt }],
            { 
                responseFormat: { type: 'json_object' },
                reasoningLevel: 'medium',
                maxTokens: 2000,
                reason: `analyze content for "${originalTerm}"`,
            }
        );
        
        const analysis = response as ContentAnalysis;
        logger.debug('Content analysis result: %j', analysis);
        
        return analysis;
    } catch (error: any) {
        logger.error('Failed to analyze content: %s', error.message);
        
        // Return fallback analysis
        return {
            entityType: 'unknown',
            name: originalTerm,
            confidence: 'low',
            reasoning: `Failed to analyze: ${error.message}`,
        };
    }
};

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

/**
 * Calculate string similarity (simple Levenshtein-based)
 * Returns a score from 0 (completely different) to 1 (identical)
 */
const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1.0;
    
    // Simple character overlap heuristic
    const set1 = new Set(s1.split(''));
    const set2 = new Set(s2.split(''));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
};

/**
 * Find similar existing terms
 */
const findSimilarTerms = (term: string, existingTerms: string[]): string[] => {
    const similarities = existingTerms.map(existing => ({
        term: existing,
        score: calculateSimilarity(term, existing),
    }));
    
    // Return terms with similarity > 0.6, sorted by score
    return similarities
        .filter(s => s.score > 0.6)
        .sort((a, b) => b.score - a.score)
        .map(s => s.term);
};

/**
 * New streamlined wizard flow
 */
const runNewProjectWizard = async (
    rl: readline.Interface,
    term: string,
    context: string | undefined,
    projectOptions: string[] | undefined
): Promise<NewProjectWizardResult> => {
    const fetcher = ContentFetcher.create();
    
    write('');
    write('─'.repeat(60));
    write(`[Unknown: "${term}"]`);
    if (context) {
        write(context);
    }
    write('─'.repeat(60));
    
    // Quick ignore option
    const ignoreCheck = await askQuestion(rl, '\nIgnore this? (X to ignore, or Enter to continue): ');
    if (ignoreCheck.toLowerCase() === 'x' || ignoreCheck.toLowerCase() === 'ignore') {
        write(`\n[Adding "${term}" to ignore list]`);
        return { action: 'ignore', ignoredTerm: term };
    }
    
    // TODO: Get existing terms from context to check for similar matches
    // For now, we'll skip this step but the infrastructure is here
    const existingTerms: string[] = []; // Would come from context.getTerms()
    const similarTerms = findSimilarTerms(term, existingTerms);
    
    if (similarTerms.length > 0) {
        write(`\nFound similar term(s): ${similarTerms.join(', ')}`);
        const useSimilar = await askQuestion(rl, `Is "${term}" the same as "${similarTerms[0]}"? (Y/N): `);
        
        if (useSimilar.toLowerCase() === 'y' || useSimilar.toLowerCase() === 'yes') {
            return {
                action: 'link',
                linkedTermName: similarTerms[0],
                aliasName: term,
            };
        }
    }
    
    // Step 1: Get source of information
    write('\n[How should I learn about this?]');
    write('Options:');
    write('  1. Provide a file path (e.g., ~/docs/project.md)');
    write('  2. Provide a URL (e.g., https://example.com)');
    write('  3. Paste text directly');
    write('  4. Enter details manually');
    
    const sourceChoice = await askQuestion(rl, '\nEnter 1-4, or paste path/URL directly: ');
    
    let analysis: ContentAnalysis | null = null;
    
    // Check if user pasted a URL or path directly
    if (fetcher.isUrl(sourceChoice) || sourceChoice.includes('/') || sourceChoice.includes('\\')) {
        write(`\nFetching content from: ${sourceChoice}...`);
        const fetchResult = await fetcher.fetch(sourceChoice);
        
        if (fetchResult.success && fetchResult.content) {
            write(`Analyzing content from ${fetchResult.sourceName}...`);
            analysis = await analyzeContentForEntity(fetchResult.content, fetchResult.sourceName, term);
        } else {
            write(`\nError: ${fetchResult.error}`);
        }
    } else if (sourceChoice === '1') {
        // File path
        const filePath = await askQuestion(rl, '\nFile path: ');
        write(`\nReading file: ${filePath}...`);
        const fetchResult = await fetcher.fetch(filePath);
        
        if (fetchResult.success && fetchResult.content) {
            write(`Analyzing content...`);
            analysis = await analyzeContentForEntity(fetchResult.content, fetchResult.sourceName, term);
        } else {
            write(`\nError: ${fetchResult.error}`);
        }
    } else if (sourceChoice === '2') {
        // URL
        const url = await askQuestion(rl, '\nURL: ');
        write(`\nFetching from: ${url}...`);
        const fetchResult = await fetcher.fetch(url);
        
        if (fetchResult.success && fetchResult.content) {
            write(`Analyzing content from ${fetchResult.sourceName}...`);
            analysis = await analyzeContentForEntity(fetchResult.content, fetchResult.sourceName, term);
        } else {
            write(`\nError: ${fetchResult.error}`);
        }
    } else if (sourceChoice === '3') {
        // Paste text
        write('\nPaste or type text (end with empty line):');
        const lines: string[] = [];
        let line: string;
        do {
            line = await askQuestion(rl, '');
            if (line) lines.push(line);
        } while (line);
        
        const pastedText = lines.join('\n');
        if (pastedText) {
            write('\nAnalyzing pasted text...');
            analysis = await analyzeContentForEntity(pastedText, 'pasted text', term);
        }
    }
    
    // If we have analysis, show results and confirm
    if (analysis && analysis.entityType !== 'unknown') {
        write('\n─'.repeat(60));
        write('[Analysis Results]');
        write(`Type: ${analysis.entityType.toUpperCase()}`);
        write(`Name: ${analysis.name}`);
        if (analysis.description) {
            write(`Description: ${analysis.description}`);
        }
        if (analysis.expansion) {
            write(`Stands for: ${analysis.expansion}`);
        }
        if (analysis.topics && analysis.topics.length > 0) {
            write(`Topics: ${analysis.topics.join(', ')}`);
        }
        write(`Confidence: ${analysis.confidence}`);
        write('─'.repeat(60));
        
        const confirm = await askQuestion(rl, '\nUse this? (Y/N, or Enter to accept): ');
        
        if (confirm.toLowerCase() !== 'n' && confirm.toLowerCase() !== 'no') {
            // User accepted the analysis
            if (analysis.entityType === 'project') {
                return {
                    action: 'create',
                    projectName: analysis.name,
                    description: analysis.description,
                };
            } else {
                // It's a term - ask which project(s)
                const selectedProjects = await promptProjectSelection(rl, analysis.name, projectOptions);
                
                return {
                    action: 'term',
                    termName: analysis.name,
                    termExpansion: analysis.expansion,
                    termDescription: analysis.description,
                    termProjects: selectedProjects,
                };
            }
        }
    }
    
    // Fall back to manual entry
    write('\n[Manual Entry]');
    const entityType = await askQuestion(rl, 'Is this a Project or a Term? (P/T): ');
    
    if (entityType.toLowerCase() === 'p' || entityType.toLowerCase() === 'project') {
        const projectName = await askQuestion(rl, `Project name [${term}]: `);
        const finalName = projectName || term;
        const description = await askQuestion(rl, 'Description (Enter to skip): ');
        
        return {
            action: 'create',
            projectName: finalName,
            description: description || undefined,
        };
    } else {
        const termName = await askQuestion(rl, `Term name [${term}]: `);
        const finalName = termName || term;
        const expansion = await askQuestion(rl, 'Expansion (if acronym, Enter to skip): ');
        const description = await askQuestion(rl, 'Description (Enter to skip): ');
        
        const selectedProjects = await promptProjectSelection(rl, finalName, projectOptions);
        
        return {
            action: 'term',
            termName: finalName,
            termExpansion: expansion || undefined,
            termDescription: description || undefined,
            termProjects: selectedProjects,
        };
    }
};

/**
 * Prompt for project selection with clean UI (just names)
 */
const promptProjectSelection = async (
    rl: readline.Interface,
    termName: string,
    projectOptions: string[] | undefined
): Promise<number[] | undefined> => {
    if (!projectOptions || projectOptions.length === 0) {
        return undefined;
    }
    
    write('\nWhich project(s) is this related to?');
    
    // Extract just the project names (before " - ")
    const projectNames = projectOptions.map(opt => {
        const match = opt.match(/^([^-]+)/);
        return match ? match[1].trim() : opt;
    });
    
    projectNames.forEach((name, i) => {
        write(`  ${i + 1}. ${name}`);
    });
    write(`  N. Create new project`);
    
    const selection = await askQuestion(rl, '\nEnter numbers (comma-separated) or N, or Enter to skip: ');
    
    if (!selection) {
        return undefined;
    }
    
    if (selection.toLowerCase().includes('n')) {
        // TODO: Handle new project creation
        write('[New project creation not yet implemented in this flow]');
        return undefined;
    }
    
    const indices = selection
        .split(',')
        .map(s => parseInt(s.trim(), 10) - 1)
        .filter(idx => !isNaN(idx) && idx >= 0 && idx < projectNames.length);
    
    if (indices.length > 0) {
        write(`Associated with: ${indices.map(i => projectNames[i]).join(', ')}`);
        return indices;
    }
    
    return undefined;
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
            filesProcessed: [],
            changes: {
                termsAdded: [],
                termsUpdated: [],
                projectsAdded: [],
                projectsUpdated: [],
                peopleAdded: [],
                aliasesAdded: [],
            },
            shouldStop: false,
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
                
                // Setup Ctrl+C handler for graceful summary output
                process.on('SIGINT', () => {
                    if (session) {
                        write('\n\n[Session interrupted by user]\n');
                        printSummary();
                        process.exit(0);
                    }
                });
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
        
        session.completedAt = new Date();
        
        // Print summary before closing
        if (config.enabled && session.responses.length > 0) {
            printSummary();
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
                
                // Increment prompt counter for current file
                const fileIndex = session.filesProcessed.length - 1;
                if (fileIndex >= 0) {
                    session.filesProcessed[fileIndex].promptsAnswered++;
                }
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
                
                // Increment prompt counter for current file
                const fileIndex = session.filesProcessed.length - 1;
                if (fileIndex >= 0) {
                    session.filesProcessed[fileIndex].promptsAnswered++;
                }
            }
            
            logger.debug('New person wizard completed', {
                term: request.term,
                action: wizardResult.action,
                additionalInfo: wizardResult,
            });
            
            return response;
        }
        
        // Standard single-prompt flow for other types
        // Show file context if available
        let promptWithContext = formatClarificationPrompt(request);
        if (session && session.currentFile) {
            const fileIndex = session.filesProcessed.length - 1;
            if (fileIndex >= 0) {
                const fileProc = session.filesProcessed[fileIndex];
                promptWithContext = `[File: ${fileProc.inputPath}] [Prompts: ${fileProc.promptsAnswered}]\n` +
                    `(Type 'S' to skip remaining prompts for this file)\n\n` +
                    promptWithContext;
            }
        }
        
        const userInput = await askQuestion(rl, promptWithContext);
        
        // Check for skip rest of file command
        if (userInput.toLowerCase() === 's' || userInput.toLowerCase() === 'skip') {
            write('\n[Skipping remaining prompts for this file...]');
            
            const response: ClarificationResponse = {
                type: request.type,
                term: request.term,
                response: 'skip',
                shouldRemember: false,
                skipRestOfFile: true,
            };
            
            if (session) {
                session.responses.push(response);
                
                // Mark current file as skipped
                const fileIndex = session.filesProcessed.length - 1;
                if (fileIndex >= 0) {
                    session.filesProcessed[fileIndex].skipped = true;
                }
            }
            
            logger.info('User requested to skip rest of file');
            return response;
        }
        
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
            
            // Increment prompt counter for current file
            const fileIndex = session.filesProcessed.length - 1;
            if (fileIndex >= 0) {
                session.filesProcessed[fileIndex].promptsAnswered++;
            }
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
    
    // File tracking methods
    const startFile = (filePath: string) => {
        if (!session) return;
        
        session.currentFile = filePath;
        session.filesProcessed.push({
            inputPath: filePath,
            promptsAnswered: 0,
            skipped: false,
            startedAt: new Date(),
        });
        
        logger.debug('Started processing file: %s', filePath);
    };
    
    const endFile = (outputPath?: string, movedTo?: string) => {
        if (!session || !session.currentFile) return;
        
        const fileIndex = session.filesProcessed.length - 1;
        if (fileIndex >= 0) {
            const fileProc = session.filesProcessed[fileIndex];
            fileProc.completedAt = new Date();
            fileProc.outputPath = outputPath;
            fileProc.movedTo = movedTo;
            
            logger.debug('Completed file: %s (%d prompts)', fileProc.inputPath, fileProc.promptsAnswered);
        }
        
        session.currentFile = undefined;
    };
    
    // Entity tracking methods
    const trackTermAdded = (termName: string) => {
        if (!session) return;
        if (!session.changes.termsAdded.includes(termName)) {
            session.changes.termsAdded.push(termName);
            logger.debug('Tracked term added: %s', termName);
        }
    };
    
    const trackTermUpdated = (termName: string) => {
        if (!session) return;
        if (!session.changes.termsUpdated.includes(termName)) {
            session.changes.termsUpdated.push(termName);
            logger.debug('Tracked term updated: %s', termName);
        }
    };
    
    const trackProjectAdded = (projectName: string) => {
        if (!session) return;
        if (!session.changes.projectsAdded.includes(projectName)) {
            session.changes.projectsAdded.push(projectName);
            logger.debug('Tracked project added: %s', projectName);
        }
    };
    
    const trackProjectUpdated = (projectName: string) => {
        if (!session) return;
        if (!session.changes.projectsUpdated.includes(projectName)) {
            session.changes.projectsUpdated.push(projectName);
            logger.debug('Tracked project updated: %s', projectName);
        }
    };
    
    const trackPersonAdded = (personName: string) => {
        if (!session) return;
        if (!session.changes.peopleAdded.includes(personName)) {
            session.changes.peopleAdded.push(personName);
            logger.debug('Tracked person added: %s', personName);
        }
    };
    
    const trackAlias = (alias: string, linkedTo: string) => {
        if (!session) return;
        session.changes.aliasesAdded.push({ alias, linkedTo });
        logger.debug('Tracked alias: %s -> %s', alias, linkedTo);
    };
    
    // Session control methods
    const requestStop = () => {
        if (!session) return;
        session.shouldStop = true;
        logger.info('Session stop requested by user');
    };
    
    const shouldStopSession = (): boolean => {
        return session?.shouldStop ?? false;
    };
    
    // Summary generation
    const printSummary = () => {
        if (!session) {
            write('\nNo active session to summarize.');
            return;
        }
        
        const duration = session.completedAt 
            ? (session.completedAt.getTime() - session.startedAt.getTime()) / 1000
            : (new Date().getTime() - session.startedAt.getTime()) / 1000;
        
        write('\n');
        write('═'.repeat(60));
        write('  INTERACTIVE SESSION SUMMARY');
        write('═'.repeat(60));
        write('');
        
        // Session duration
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        write(`Duration: ${minutes}m ${seconds}s`);
        write(`Total prompts answered: ${session.responses.length}`);
        write('');
        
        // Files processed
        if (session.filesProcessed.length > 0) {
            write('─'.repeat(60));
            write('  FILES PROCESSED');
            write('─'.repeat(60));
            
            session.filesProcessed.forEach((file, idx) => {
                write(`\n${idx + 1}. ${file.inputPath}`);
                write(`   Prompts answered: ${file.promptsAnswered}`);
                if (file.skipped) {
                    write(`   Status: SKIPPED (user requested)`);
                } else {
                    write(`   Status: Completed`);
                }
                if (file.outputPath) {
                    write(`   Transcript: ${file.outputPath}`);
                }
                if (file.movedTo) {
                    write(`   Audio moved to: ${file.movedTo}`);
                }
            });
            write('');
        }
        
        // Changes made
        const hasChanges = 
            session.changes.termsAdded.length > 0 ||
            session.changes.termsUpdated.length > 0 ||
            session.changes.projectsAdded.length > 0 ||
            session.changes.projectsUpdated.length > 0 ||
            session.changes.peopleAdded.length > 0 ||
            session.changes.aliasesAdded.length > 0;
        
        if (hasChanges) {
            write('─'.repeat(60));
            write('  CHANGES MADE');
            write('─'.repeat(60));
            
            if (session.changes.termsAdded.length > 0) {
                write(`\n✓ Terms added (${session.changes.termsAdded.length}):`);
                session.changes.termsAdded.forEach(term => write(`  - ${term}`));
            }
            
            if (session.changes.termsUpdated.length > 0) {
                write(`\n✓ Terms updated (${session.changes.termsUpdated.length}):`);
                session.changes.termsUpdated.forEach(term => write(`  - ${term}`));
            }
            
            if (session.changes.projectsAdded.length > 0) {
                write(`\n✓ Projects added (${session.changes.projectsAdded.length}):`);
                session.changes.projectsAdded.forEach(proj => write(`  - ${proj}`));
            }
            
            if (session.changes.projectsUpdated.length > 0) {
                write(`\n✓ Projects updated (${session.changes.projectsUpdated.length}):`);
                session.changes.projectsUpdated.forEach(proj => write(`  - ${proj}`));
            }
            
            if (session.changes.peopleAdded.length > 0) {
                write(`\n✓ People added (${session.changes.peopleAdded.length}):`);
                session.changes.peopleAdded.forEach(person => write(`  - ${person}`));
            }
            
            if (session.changes.aliasesAdded.length > 0) {
                write(`\n✓ Aliases created (${session.changes.aliasesAdded.length}):`);
                session.changes.aliasesAdded.forEach(({ alias, linkedTo }) => {
                    write(`  - "${alias}" → "${linkedTo}"`);
                });
            }
            
            write('');
        } else {
            write('No changes made during this session.');
            write('');
        }
        
        write('═'.repeat(60));
        write('');
    };
  
    return {
        startSession,
        endSession,
        handleClarification,
        isEnabled,
        getSession,
        startFile,
        endFile,
        trackTermAdded,
        trackTermUpdated,
        trackProjectAdded,
        trackProjectUpdated,
        trackPersonAdded,
        trackAlias,
        requestStop,
        shouldStopSession,
        printSummary,
    };
};
