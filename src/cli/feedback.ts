/**
 * Feedback CLI
 * 
 * Provides an intelligent feedback system that uses an agentic model to:
 * - Understand natural language feedback about transcripts
 * - Correct spelling/term issues in transcripts
 * - Add terms, people, or companies to context
 * - Change project assignments and move files
 * - Help users understand what feedback they can provide
 * 
 * Usage:
 *   protokoll feedback /path/to/transcript.md
 *   protokoll feedback --help-me
 */

import { Command } from 'commander';
import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import * as Context from '../context';
import * as Reasoning from '../reasoning';
import * as Logging from '../logging';
import { slugifyTitle, extractTimestampFromFilename } from './action';
import { DEFAULT_MODEL } from '../constants';

// CLI output helper
const print = (text: string) => process.stdout.write(text + '\n');

/**
 * Tool definitions for the agentic feedback processor
 */
export interface FeedbackTool {
    name: string;
    description: string;
    parameters: Record<string, {
        type: string;
        description: string;
        required?: boolean;
        enum?: string[];
    }>;
}

export const FEEDBACK_TOOLS: FeedbackTool[] = [
    {
        name: 'correct_text',
        description: 'Replace text in the transcript. Use this to fix misspellings, wrong terms, or incorrect names.',
        parameters: {
            find: { type: 'string', description: 'The text to find in the transcript', required: true },
            replace: { type: 'string', description: 'The text to replace it with', required: true },
            replace_all: { type: 'boolean', description: 'Replace all occurrences (default: true)' },
        },
    },
    {
        name: 'add_term',
        description: 'Add a new term to the context so it will be recognized in future transcripts. Use this when you learn about abbreviations, acronyms, or technical terms.',
        parameters: {
            term: { type: 'string', description: 'The correct term/abbreviation', required: true },
            definition: { type: 'string', description: 'What the term means', required: true },
            sounds_like: { type: 'array', description: 'Phonetic variations that might be transcribed incorrectly (e.g., ["W C M P", "double u see em pee"])' },
            context: { type: 'string', description: 'Additional context about when this term is used' },
        },
    },
    {
        name: 'add_person',
        description: 'Add a new person to the context for future name recognition. Use this when you learn about people whose names were transcribed incorrectly.',
        parameters: {
            name: { type: 'string', description: 'The correct full name', required: true },
            sounds_like: { type: 'array', description: 'Phonetic variations (e.g., ["San Jay", "Sanjai", "Sanjey"])', required: true },
            role: { type: 'string', description: 'Their role or title' },
            company: { type: 'string', description: 'Company they work for' },
            context: { type: 'string', description: 'Additional context about this person' },
        },
    },
    {
        name: 'change_project',
        description: 'Change the project assignment of this transcript. This updates metadata and may move the file to a new location based on project routing.',
        parameters: {
            project_id: { type: 'string', description: 'The project ID to assign', required: true },
        },
    },
    {
        name: 'change_title',
        description: 'Change the title of this transcript. This updates the document heading and renames the file.',
        parameters: {
            new_title: { type: 'string', description: 'The new title for the transcript', required: true },
        },
    },
    {
        name: 'provide_help',
        description: 'Provide helpful information to the user about what kinds of feedback they can give.',
        parameters: {
            topic: { type: 'string', description: 'The topic to help with', enum: ['terms', 'people', 'projects', 'corrections', 'general'] },
        },
    },
    {
        name: 'complete',
        description: 'Call this when you have finished processing all the feedback and applied all necessary changes.',
        parameters: {
            summary: { type: 'string', description: 'A summary of what was done', required: true },
        },
    },
];

/**
 * Result of a tool execution
 */
export interface ToolResult {
    success: boolean;
    message: string;
    data?: Record<string, unknown>;
}

/**
 * Feedback processing context
 */
export interface FeedbackContext {
    transcriptPath: string;
    transcriptContent: string;
    originalContent: string;
    context: Context.ContextInstance;
    changes: FeedbackChange[];
    verbose: boolean;
    dryRun: boolean;
}

export interface FeedbackChange {
    type: 'text_correction' | 'term_added' | 'person_added' | 'project_changed' | 'title_changed';
    description: string;
    details: Record<string, unknown>;
}

/**
 * Create a readline interface for user input
 */
const createReadlineInterface = () => {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
};

/**
 * Ask a question and get user input
 */
const askQuestion = (rl: readline.Interface, question: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
};

/**
 * Execute a feedback tool
 */
export const executeTool = async (
    toolName: string,
    args: Record<string, unknown>,
    feedbackCtx: FeedbackContext
): Promise<ToolResult> => {
    const logger = Logging.getLogger();
    
    switch (toolName) {
        case 'correct_text': {
            const find = String(args.find);
            const replace = String(args.replace);
            const replaceAll = args.replace_all !== false;
            
            if (!feedbackCtx.transcriptContent.includes(find)) {
                return {
                    success: false,
                    message: `Text "${find}" not found in transcript.`,
                };
            }
            
            const occurrences = feedbackCtx.transcriptContent.split(find).length - 1;
            
            if (replaceAll) {
                feedbackCtx.transcriptContent = feedbackCtx.transcriptContent.split(find).join(replace);
            } else {
                feedbackCtx.transcriptContent = feedbackCtx.transcriptContent.replace(find, replace);
            }
            
            const changeCount = replaceAll ? occurrences : 1;
            
            feedbackCtx.changes.push({
                type: 'text_correction',
                description: `Replaced "${find}" with "${replace}" (${changeCount} occurrence${changeCount > 1 ? 's' : ''})`,
                details: { find, replace, count: changeCount },
            });
            
            if (feedbackCtx.verbose) {
                print(`  ✓ Replaced "${find}" → "${replace}" (${changeCount}x)`);
            }
            
            return {
                success: true,
                message: `Replaced ${changeCount} occurrence(s) of "${find}" with "${replace}".`,
            };
        }
        
        case 'add_term': {
            const term = String(args.term);
            const definition = String(args.definition);
            const soundsLike = args.sounds_like as string[] | undefined;
            const termContext = args.context as string | undefined;
            
            // Generate ID from term
            const id = term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            
            // Check if term already exists
            const existing = feedbackCtx.context.getTerm(id);
            if (existing) {
                return {
                    success: false,
                    message: `Term "${term}" already exists in context.`,
                };
            }
            
            const newTerm: Context.Term = {
                id,
                name: term,
                type: 'term',
                expansion: definition,
                sounds_like: soundsLike,
                domain: termContext,
            };
            
            if (!feedbackCtx.dryRun) {
                await feedbackCtx.context.saveEntity(newTerm);
            }
            
            feedbackCtx.changes.push({
                type: 'term_added',
                description: `Added term "${term}" to context`,
                details: { term, definition, sounds_like: soundsLike },
            });
            
            if (feedbackCtx.verbose) {
                print(`  ✓ Added term: ${term} = "${definition}"`);
                if (soundsLike?.length) {
                    print(`    sounds_like: ${soundsLike.join(', ')}`);
                }
            }
            
            return {
                success: true,
                message: `Added term "${term}" to context. It will be recognized in future transcripts.`,
                data: { id, term, definition },
            };
        }
        
        case 'add_person': {
            const name = String(args.name);
            const soundsLike = args.sounds_like as string[];
            const role = args.role as string | undefined;
            const company = args.company as string | undefined;
            const personContext = args.context as string | undefined;
            
            // Generate ID from name
            const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            
            // Check if person already exists
            const existing = feedbackCtx.context.getPerson(id);
            if (existing) {
                return {
                    success: false,
                    message: `Person "${name}" already exists in context.`,
                };
            }
            
            const newPerson: Context.Person = {
                id,
                name,
                type: 'person',
                sounds_like: soundsLike,
                role,
                company,
                context: personContext,
            };
            
            if (!feedbackCtx.dryRun) {
                await feedbackCtx.context.saveEntity(newPerson);
            }
            
            feedbackCtx.changes.push({
                type: 'person_added',
                description: `Added person "${name}" to context`,
                details: { name, sounds_like: soundsLike, role, company },
            });
            
            if (feedbackCtx.verbose) {
                print(`  ✓ Added person: ${name}`);
                print(`    sounds_like: ${soundsLike.join(', ')}`);
                if (role) print(`    role: ${role}`);
                if (company) print(`    company: ${company}`);
            }
            
            return {
                success: true,
                message: `Added person "${name}" to context. Their name will be recognized in future transcripts.`,
                data: { id, name, sounds_like: soundsLike },
            };
        }
        
        case 'change_project': {
            const projectId = String(args.project_id);
            
            // Find the project
            const project = feedbackCtx.context.getProject(projectId);
            if (!project) {
                // List available projects
                const available = feedbackCtx.context.getAllProjects().map(p => p.id);
                return {
                    success: false,
                    message: `Project "${projectId}" not found. Available projects: ${available.join(', ')}`,
                };
            }
            
            // Update metadata in transcript
            const metadataRegex = /\*\*Project\*\*: .+/;
            const projectIdRegex = /\*\*Project ID\*\*: `.+`/;
            
            if (metadataRegex.test(feedbackCtx.transcriptContent)) {
                feedbackCtx.transcriptContent = feedbackCtx.transcriptContent.replace(
                    metadataRegex,
                    `**Project**: ${project.name}`
                );
            }
            
            if (projectIdRegex.test(feedbackCtx.transcriptContent)) {
                feedbackCtx.transcriptContent = feedbackCtx.transcriptContent.replace(
                    projectIdRegex,
                    `**Project ID**: \`${project.id}\``
                );
            }
            
            feedbackCtx.changes.push({
                type: 'project_changed',
                description: `Changed project to "${project.name}" (${project.id})`,
                details: { project_id: projectId, project_name: project.name, routing: project.routing },
            });
            
            if (feedbackCtx.verbose) {
                print(`  ✓ Changed project to: ${project.name} (${project.id})`);
                if (project.routing?.destination) {
                    print(`    New destination: ${project.routing.destination}`);
                }
            }
            
            return {
                success: true,
                message: `Changed project to "${project.name}". The transcript metadata has been updated.`,
                data: { project_id: projectId, destination: project.routing?.destination },
            };
        }
        
        case 'change_title': {
            const newTitle = String(args.new_title);
            
            // Update title in transcript (first # heading)
            const titleRegex = /^# .+$/m;
            if (titleRegex.test(feedbackCtx.transcriptContent)) {
                feedbackCtx.transcriptContent = feedbackCtx.transcriptContent.replace(
                    titleRegex,
                    `# ${newTitle}`
                );
            }
            
            feedbackCtx.changes.push({
                type: 'title_changed',
                description: `Changed title to "${newTitle}"`,
                details: { new_title: newTitle, slug: slugifyTitle(newTitle) },
            });
            
            if (feedbackCtx.verbose) {
                print(`  ✓ Changed title to: ${newTitle}`);
            }
            
            return {
                success: true,
                message: `Changed title to "${newTitle}". The file will be renamed accordingly.`,
                data: { new_title: newTitle },
            };
        }
        
        case 'provide_help': {
            const topic = String(args.topic || 'general');
            let helpText = '';
            
            switch (topic) {
                case 'terms':
                    helpText = `
**Term Corrections**

You can teach me about abbreviations, acronyms, and technical terms:

- "Everywhere it says WCMP, that should be WCNP - Walmart's Native Cloud Platform"
- "YB should be spelled Wibey"
- "API should be written as A.P.I. in this context"

I'll:
1. Fix the term in this transcript
2. Add it to my vocabulary for future transcripts
`;
                    break;
                    
                case 'people':
                    helpText = `
**Name Corrections**

You can teach me about people whose names were transcribed incorrectly:

- "San Jay Grouper is actually Sanjay Gupta"
- "Priya was transcribed as 'pre a' - please fix"
- "Marie should be spelled Mari (without the e)"

I'll:
1. Fix the name everywhere in this transcript
2. Remember how the name sounds for future transcripts
`;
                    break;
                    
                case 'projects':
                    helpText = `
**Project Assignment**

You can tell me if a transcript belongs to a different project:

- "This should be in the Quantum Readiness project"
- "Move this to the client-alpha project"
- "This was misclassified - it's a personal note, not work"

I'll:
1. Update the project metadata
2. Move the file to the project's configured location
`;
                    break;
                    
                case 'corrections':
                    helpText = `
**General Corrections**

You can ask me to fix any text in the transcript:

- "Change 'gonna' to 'going to' everywhere"
- "The date mentioned should be January 15th, not January 5th"
- "Remove the paragraph about lunch - that was a tangent"

I'll make the corrections while preserving the rest of the transcript.
`;
                    break;
                    
                default:
                    helpText = `
**What I Can Help With**

I can process your feedback to:

1. **Fix Terms & Abbreviations**: "WCMP should be WCNP"
2. **Correct Names**: "San Jay Grouper is Sanjay Gupta"
3. **Change Projects**: "This belongs in the Quantum project"
4. **Update Title**: "Change the title to 'Q1 Planning Session'"
5. **General Corrections**: "Replace X with Y everywhere"

Just describe what's wrong in natural language, and I'll figure out what to do!

Ask about specific topics:
- "How do I correct terms?"
- "How do I fix names?"
- "How do I change the project?"
`;
            }
            
            print(helpText);
            
            return {
                success: true,
                message: helpText,
            };
        }
        
        case 'complete': {
            const summary = String(args.summary);
            return {
                success: true,
                message: summary,
                data: { complete: true },
            };
        }
        
        default:
            logger.warn('Unknown tool: %s', toolName);
            return {
                success: false,
                message: `Unknown tool: ${toolName}`,
            };
    }
};

/**
 * Build the system prompt for the feedback agent
 */
export const buildFeedbackSystemPrompt = (
    transcriptPreview: string,
    availableProjects: string[]
): string => {
    const toolDescriptions = FEEDBACK_TOOLS.map(t => 
        `- ${t.name}: ${t.description}`
    ).join('\n');
    
    return `You are an intelligent feedback processor for a transcription system. Your job is to understand user feedback about transcripts and take appropriate actions.

## Current Transcript Preview
${transcriptPreview.substring(0, 1000)}${transcriptPreview.length > 1000 ? '...' : ''}

## Available Projects
${availableProjects.length > 0 ? availableProjects.join(', ') : '(no projects configured)'}

## Available Tools
${toolDescriptions}

## How to Process Feedback

1. **Understand the feedback**: What is the user asking for?
2. **Identify actions**: What tools do you need to use?
3. **Execute in order**: 
   - First, make text corrections (correct_text)
   - Then, add context entities (add_term, add_person)
   - Finally, change metadata if needed (change_project, change_title)
4. **Summarize**: Call 'complete' with a summary when done

## Important Rules

- If the user asks for help or seems unsure, use provide_help first
- For name corrections: BOTH fix the text AND add the person to context
- For term corrections: BOTH fix the text AND add the term to context
- When fixing names/terms, use correct_text with replace_all=true
- Be thorough - if "San Jay Grouper" should be "Sanjay Gupta", also consider variations like "San jay", "Sanjay Grouper", etc.
- Always call 'complete' when finished, with a summary of what you did

## Example Interactions

User: "YB should be Wibey"
→ Use correct_text to replace "YB" with "Wibey"
→ Use add_term to add "Wibey" with sounds_like ["YB", "Y B"]
→ Use complete to summarize

User: "San Jay Grouper is actually Sanjay Gupta"
→ Use correct_text to replace "San Jay Grouper" with "Sanjay Gupta"
→ Use correct_text to replace any other variations like "San jay Grouper"
→ Use add_person to add "Sanjay Gupta" with sounds_like ["San Jay Grouper", "Sanjay Grouper"]
→ Use complete to summarize

User: "This should be in the Quantum Readiness project"
→ Use change_project with project_id matching "Quantum Readiness" or similar
→ Use complete to summarize

Respond with tool calls to process the feedback.`;
};

/**
 * Process feedback using the agentic model
 */
export const processFeedback = async (
    feedback: string,
    feedbackCtx: FeedbackContext,
    reasoning: Reasoning.ReasoningInstance
): Promise<void> => {
    const logger = Logging.getLogger();
    
    // Get available projects
    const projects = feedbackCtx.context.getAllProjects().map(p => `${p.id} (${p.name})`);
    
    // Build the prompt
    const systemPrompt = buildFeedbackSystemPrompt(
        feedbackCtx.transcriptContent,
        projects
    );
    
    // Convert tools to OpenAI format
    const tools = FEEDBACK_TOOLS.map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: {
                type: 'object',
                properties: Object.fromEntries(
                    Object.entries(t.parameters).map(([key, param]) => [
                        key,
                        {
                            type: param.type,
                            description: param.description,
                            ...(param.enum ? { enum: param.enum } : {}),
                        },
                    ])
                ),
                required: Object.entries(t.parameters)
                    .filter(([_, p]) => p.required)
                    .map(([key]) => key),
            },
        },
    }));
    
    // Process with reasoning model
    let iterations = 0;
    const maxIterations = 10;
    const conversationHistory: Array<{
        role: 'system' | 'user' | 'assistant' | 'tool';
        content: string;
        tool_call_id?: string;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    }> = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: feedback },
    ];
    
    while (iterations < maxIterations) {
        iterations++;
        
        logger.debug('Feedback processing iteration %d', iterations);
        
        try {
            const response = await reasoning.completeWithTools({
                messages: conversationHistory,
                tools,
            });
            
            // Check for tool calls
            if (response.tool_calls && response.tool_calls.length > 0) {
                // Add assistant message with tool calls
                conversationHistory.push({
                    role: 'assistant',
                    content: response.content || '',
                    tool_calls: response.tool_calls.map(tc => ({
                        id: tc.id,
                        function: {
                            name: tc.function.name,
                            arguments: tc.function.arguments,
                        },
                    })),
                });
                
                // Execute each tool call
                for (const toolCall of response.tool_calls) {
                    const toolName = toolCall.function.name;
                    let args: Record<string, unknown>;
                    
                    try {
                        args = JSON.parse(toolCall.function.arguments);
                    } catch {
                        args = {};
                    }
                    
                    if (feedbackCtx.verbose) {
                        print(`\n[Executing: ${toolName}]`);
                    }
                    
                    const result = await executeTool(toolName, args, feedbackCtx);
                    
                    // Add tool result to conversation
                    conversationHistory.push({
                        role: 'tool',
                        content: JSON.stringify(result),
                        tool_call_id: toolCall.id,
                    });
                    
                    // Check if complete
                    if (toolName === 'complete') {
                        if (feedbackCtx.verbose) {
                            print(`\n${result.message}`);
                        }
                        return;
                    }
                }
            } else {
                // No tool calls - model is done or confused
                if (response.content) {
                    print(`\n${response.content}`);
                }
                return;
            }
        } catch (error) {
            logger.error('Error during feedback processing', { error });
            throw error;
        }
    }
    
    logger.warn('Feedback processing reached max iterations');
};

/**
 * Apply changes and save the transcript
 */
export const applyChanges = async (
    feedbackCtx: FeedbackContext
): Promise<{ newPath: string; moved: boolean }> => {
    const logger = Logging.getLogger();
    
    let newPath = feedbackCtx.transcriptPath;
    let moved = false;
    
    // Check if we need to rename the file (title changed)
    const titleChange = feedbackCtx.changes.find(c => c.type === 'title_changed');
    if (titleChange) {
        const slug = titleChange.details.slug as string;
        const timestamp = extractTimestampFromFilename(feedbackCtx.transcriptPath);
        const dir = path.dirname(feedbackCtx.transcriptPath);
        
        if (timestamp) {
            const timeStr = `${timestamp.hour.toString().padStart(2, '0')}${timestamp.minute.toString().padStart(2, '0')}`;
            newPath = path.join(dir, `${timestamp.day}-${timeStr}-${slug}.md`);
        } else {
            newPath = path.join(dir, `${slug}.md`);
        }
    }
    
    // Check if we need to move the file (project changed)
    const projectChange = feedbackCtx.changes.find(c => c.type === 'project_changed');
    if (projectChange && projectChange.details.routing) {
        const routing = projectChange.details.routing as { destination?: string; structure?: string };
        if (routing.destination) {
            // Expand ~ to home directory
            let dest = routing.destination;
            if (dest.startsWith('~')) {
                dest = path.join(process.env.HOME || '', dest.slice(1));
            }
            
            // Get date from transcript metadata or use current date
            const now = new Date();
            const year = now.getFullYear().toString();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            
            // Build path based on structure
            let structuredPath = dest;
            const structure = routing.structure || 'month';
            if (structure === 'year') {
                structuredPath = path.join(dest, year);
            } else if (structure === 'month') {
                structuredPath = path.join(dest, year, month);
            } else if (structure === 'day') {
                const day = now.getDate().toString().padStart(2, '0');
                structuredPath = path.join(dest, year, month, day);
            }
            
            // Update path
            const filename = path.basename(newPath);
            newPath = path.join(structuredPath, filename);
            moved = true;
        }
    }
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(newPath), { recursive: true });
    
    // Write the updated content
    if (!feedbackCtx.dryRun) {
        await fs.writeFile(newPath, feedbackCtx.transcriptContent, 'utf-8');
        
        // Delete original if moved/renamed
        if (newPath !== feedbackCtx.transcriptPath) {
            await fs.unlink(feedbackCtx.transcriptPath);
        }
    }
    
    logger.info('Applied %d changes to transcript', feedbackCtx.changes.length);
    
    return { newPath, moved };
};

/**
 * Run the feedback command
 */
export const runFeedback = async (
    transcriptPath: string,
    options: {
        feedback?: string;
        model?: string;
        dryRun?: boolean;
        verbose?: boolean;
    }
): Promise<void> => {
    // Verify file exists
    try {
        await fs.access(transcriptPath);
    } catch {
        print(`Error: File not found: ${transcriptPath}`);
        process.exit(1);
    }
    
    // Read transcript
    const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
    
    // Initialize context
    const context = await Context.create();
    
    // Initialize reasoning
    const reasoning = Reasoning.create({ model: options.model || DEFAULT_MODEL });
    
    // Create feedback context
    const feedbackCtx: FeedbackContext = {
        transcriptPath,
        transcriptContent,
        originalContent: transcriptContent,
        context,
        changes: [],
        verbose: options.verbose || false,
        dryRun: options.dryRun || false,
    };
    
    // Get feedback from user if not provided
    let feedback = options.feedback;
    if (!feedback) {
        const rl = createReadlineInterface();
        
        print('\n' + '─'.repeat(60));
        print(`[Feedback for: ${path.basename(transcriptPath)}]`);
        print('─'.repeat(60));
        print('\nDescribe what needs to be corrected in natural language.');
        print('Examples:');
        print('  - "YB should be Wibey"');
        print('  - "San Jay Grouper is actually Sanjay Gupta"');
        print('  - "This should be in the Quantum Readiness project"');
        print('  - "What feedback can I give?" (for help)\n');
        
        feedback = await askQuestion(rl, 'What is your feedback? ');
        rl.close();
        
        if (!feedback) {
            print('No feedback provided.');
            return;
        }
    }
    
    if (options.verbose) {
        print('\n[Processing feedback...]');
    }
    
    // Process feedback with agentic model
    await processFeedback(feedback, feedbackCtx, reasoning);
    
    // Apply changes
    if (feedbackCtx.changes.length > 0) {
        if (options.dryRun) {
            print('\n[Dry Run] Would apply the following changes:');
            for (const change of feedbackCtx.changes) {
                print(`  - ${change.description}`);
            }
        } else {
            const { newPath, moved } = await applyChanges(feedbackCtx);
            
            print('\n' + '─'.repeat(60));
            print('[Changes Applied]');
            print('─'.repeat(60));
            
            for (const change of feedbackCtx.changes) {
                print(`  ✓ ${change.description}`);
            }
            
            if (newPath !== feedbackCtx.transcriptPath) {
                if (moved) {
                    print(`\nFile moved to: ${newPath}`);
                } else {
                    print(`\nFile renamed to: ${path.basename(newPath)}`);
                }
            } else {
                print(`\nFile updated: ${transcriptPath}`);
            }
        }
    } else {
        print('\nNo changes were made.');
    }
};

/**
 * Register the feedback command
 */
export const registerFeedbackCommands = (program: Command): void => {
    const feedbackCmd = new Command('feedback')
        .description('Provide natural language feedback to correct transcripts and improve context')
        .argument('[file]', 'Transcript file to provide feedback on')
        .option('-f, --feedback <text>', 'Feedback text (if not provided, will prompt interactively)')
        .option('-m, --model <model>', 'Reasoning model to use', DEFAULT_MODEL)
        .option('--dry-run', 'Show what would happen without making changes')
        .option('-v, --verbose', 'Show detailed output')
        .option('--help-me', 'Show examples of feedback you can provide')
        .action(async (file: string | undefined, options: {
            feedback?: string;
            model?: string;
            dryRun?: boolean;
            verbose?: boolean;
            helpMe?: boolean;
        }) => {
            if (options.helpMe) {
                print(`
╔════════════════════════════════════════════════════════════╗
║              PROTOKOLL FEEDBACK - EXAMPLES                  ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  CORRECTING TERMS & ABBREVIATIONS                          ║
║  ─────────────────────────────────                          ║
║  "Everywhere it says WCMP, that should be WCNP"            ║
║  "YB should be spelled Wibey"                               ║
║  "API should be written as A-P-I"                           ║
║                                                            ║
║  FIXING NAMES                                              ║
║  ────────────                                              ║
║  "San Jay Grouper is actually Sanjay Gupta"                ║
║  "Priya was transcribed as 'pre a' - please fix"           ║
║  "Marie should be spelled Mari"                            ║
║                                                            ║
║  CHANGING PROJECT ASSIGNMENT                               ║
║  ───────────────────────────                               ║
║  "This should be in the Quantum Readiness project"         ║
║  "Move this to client-alpha"                               ║
║  "This was misclassified - should be personal"             ║
║                                                            ║
║  GENERAL CORRECTIONS                                       ║
║  ───────────────────                                       ║
║  "Change the title to 'Q1 Planning Session'"               ║
║  "Replace 'gonna' with 'going to' everywhere"              ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

Usage:
  protokoll feedback /path/to/transcript.md
  protokoll feedback /path/to/transcript.md -f "YB should be Wibey"
  protokoll feedback /path/to/transcript.md --dry-run -v
`);
                return;
            }
            
            if (!file) {
                print('Error: A transcript file is required.');
                print('Usage: protokoll feedback /path/to/transcript.md');
                print('Run "protokoll feedback --help-me" for examples.');
                process.exit(1);
            }
            
            await runFeedback(file, options);
        });
    
    program.addCommand(feedbackCmd);
};
