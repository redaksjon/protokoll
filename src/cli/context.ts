/**
 * Context Management CLI
 * 
 * Provides commands for listing, viewing, adding, editing, and deleting
 * context entities (projects, people, terms, companies).
 */

import { Command } from 'commander';
import * as readline from 'readline';
import * as yaml from 'js-yaml';
import Table from 'cli-table3';
import * as Context from '../context';
import { Entity, Person, Project, Company, Term, IgnoredTerm, EntityType } from '../context/types';
import * as ProjectAssist from './project-assist';
import * as ContentFetcher from './content-fetcher';

// Options for adding a project
interface AddProjectOptions {
    source?: string;           // URL or file path
    name?: string;             // Pre-specified name
    id?: string;               // Pre-specified ID
    context?: 'work' | 'personal' | 'mixed';
    destination?: string;      // Output path
    structure?: 'none' | 'year' | 'month' | 'day';
    smart?: boolean;           // Override config to enable
    noSmart?: boolean;         // Override config to disable (Commander uses this naming)
}

// Helper to print to stdout
const print = (text: string) => process.stdout.write(text + '\n');

/**
 * Calculate a project ID from a name
 */
const calculateId = (name: string): string => {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
};

/**
 * Determine if smart assistance should be used
 */
const shouldUseSmartAssistance = (
    context: Context.ContextInstance,
    options: AddProjectOptions
): boolean => {
    // Explicit flag takes precedence
    if (options.smart === true) return true;
    if (options.noSmart === true) return false;
    
    // Fall back to config
    const config = context.getSmartAssistanceConfig();
    return config.enabled;
};

// Helper for interactive prompts
const askQuestion = (rl: readline.Interface, question: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
};

const createReadline = () => readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

/**
 * Format an entity for display
 */
const formatEntity = (entity: Entity, verbose = false): string => {
    if (verbose) {
        return yaml.dump(entity, { lineWidth: -1 });
    }
    
    const parts = [entity.id, entity.name];
    
    if (entity.type === 'person') {
        const person = entity as Person;
        if (person.company) parts.push(`(${person.company})`);
        if (person.role) parts.push(`- ${person.role}`);
    } else if (entity.type === 'project') {
        const project = entity as Project;
        if (project.routing?.destination) parts.push(`-> ${project.routing.destination}`);
        if (project.active === false) parts.push('[inactive]');
    } else if (entity.type === 'term') {
        const term = entity as Term;
        if (term.expansion) parts.push(`(${term.expansion})`);
    } else if (entity.type === 'company') {
        const company = entity as Company;
        if (company.industry) parts.push(`[${company.industry}]`);
    } else if (entity.type === 'ignored') {
        const ignored = entity as IgnoredTerm;
        if (ignored.ignoredAt) {
            const date = new Date(ignored.ignoredAt).toLocaleDateString();
            parts.push(`[ignored ${date}]`);
        }
    }
    
    return parts.join(' ');
};

/**
 * Truncate a string to a maximum length, adding ellipsis if needed
 */
const truncate = (str: string, maxLength: number): string => {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
};

/**
 * Get brief details for an entity (compact for table display)
 */
const getEntityBriefDetails = (entity: Entity): string => {
    if (entity.type === 'person') {
        const person = entity as Person;
        const details = [];
        if (person.role) details.push(person.role);
        if (person.company) details.push(`@${person.company}`);
        return details.join(' · ');
    } else if (entity.type === 'project') {
        const project = entity as Project;
        const details = [];
        
        if (project.active === false) {
            details.push('INACTIVE');
        }
        
        // Show description first if available, otherwise show destination
        if (project.description) {
            details.push(truncate(project.description, 40));
        } else if (project.routing?.destination) {
            // Only show destination if no description
            const dest = project.routing.destination;
            details.push(`→ ${truncate(dest, 35)}`);
        }
        
        return details.join(' ');
    } else if (entity.type === 'term') {
        const term = entity as Term;
        return term.expansion ? truncate(term.expansion, 50) : '';
    } else if (entity.type === 'company') {
        const company = entity as Company;
        return company.industry || '';
    } else if (entity.type === 'ignored') {
        const ignored = entity as IgnoredTerm;
        if (ignored.ignoredAt) {
            const date = new Date(ignored.ignoredAt).toLocaleDateString();
            return date;
        }
    }
    return '';
};

/**
 * List entities of a given type
 */
const listEntities = async (
    context: Context.ContextInstance, 
    type: EntityType,
    options: { verbose?: boolean }
) => {
    let entities: Entity[];
    if (type === 'person') {
        entities = context.getAllPeople();
    } else if (type === 'project') {
        entities = context.getAllProjects();
    } else if (type === 'company') {
        entities = context.getAllCompanies();
    } else if (type === 'ignored') {
        entities = context.getAllIgnored();
    } else {
        entities = context.getAllTerms();
    }
    
    if (entities.length === 0) {
        print(`No ${type}s found.`);
        return;
    }
    
    print(`\n${type.charAt(0).toUpperCase() + type.slice(1)}s (${entities.length}):\n`);
    
    if (options.verbose) {
        // Verbose mode: keep the old format
        for (const entity of entities.sort((a, b) => a.name.localeCompare(b.name))) {
            print('─'.repeat(60));
            print(formatEntity(entity, true));
        }
    } else {
        // Table mode with row numbers - compact display
        const table = new Table({
            head: ['#', 'ID', 'Name', 'Info'],
            colWidths: [5, 25, 25, 45],
            style: {
                head: ['cyan', 'bold']
            },
            wordWrap: true
        });
        
        const sortedEntities = entities.sort((a, b) => a.name.localeCompare(b.name));
        sortedEntities.forEach((entity, index) => {
            table.push([
                (index + 1).toString(),
                entity.id,
                entity.name,
                getEntityBriefDetails(entity)
            ]);
        });
        
        print(table.toString());
        print('');
        print(`Use "${type} show <id>" or "${type} show <#>" to see full details for any entry.`);
    }
    print('');
};

/**
 * Format a value for display in the details table
 */
const formatValue = (value: unknown, indent = 0): string => {
    const indentStr = '  '.repeat(indent);
    
    if (value === null || value === undefined) {
        return '';
    }
    
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    
    if (typeof value === 'string') {
        return value;
    }
    
    if (Array.isArray(value)) {
        if (value.length === 0) return '';
        return value.map(item => `${indentStr}• ${item}`).join('\n');
    }
    
    if (typeof value === 'object') {
        const lines: string[] = [];
        for (const [key, val] of Object.entries(value)) {
            const formattedKey = key.replace(/_/g, ' ');
            if (typeof val === 'object' && !Array.isArray(val)) {
                lines.push(`${indentStr}${formattedKey}:`);
                lines.push(formatValue(val, indent + 1));
            } else {
                const formattedVal = formatValue(val, indent + 1);
                if (formattedVal) {
                    lines.push(`${indentStr}${formattedKey}: ${formattedVal}`);
                }
            }
        }
        return lines.join('\n');
    }
    
    return String(value);
};

/**
 * Display entity details in a formatted table
 */
const displayEntityDetails = (entity: Entity, filePath?: string): void => {
    const table = new Table({
        colWidths: [25, 75],
        wordWrap: true,
        style: {
            head: []
        }
    });
    
    // Build rows based on entity type and available fields
    const rows: [string, string][] = [];
    
    // Common fields
    rows.push(['ID', entity.id]);
    rows.push(['Name', entity.name]);
    rows.push(['Type', entity.type]);
    
    // Type-specific fields
    if (entity.type === 'person') {
        const person = entity as Person;
        if (person.firstName) rows.push(['First Name', person.firstName]);
        if (person.lastName) rows.push(['Last Name', person.lastName]);
        if (person.company) rows.push(['Company', person.company]);
        if (person.role) rows.push(['Role', person.role]);
        if (person.sounds_like && person.sounds_like.length > 0) {
            rows.push(['Sounds Like', formatValue(person.sounds_like)]);
        }
        if (person.context) rows.push(['Context', person.context]);
    } else if (entity.type === 'project') {
        const project = entity as Project;
        if (project.description) rows.push(['Description', project.description]);
        
        if (project.classification) {
            rows.push(['Context Type', project.classification.context_type || '']);
            if (project.classification.explicit_phrases && project.classification.explicit_phrases.length > 0) {
                rows.push(['Trigger Phrases', formatValue(project.classification.explicit_phrases)]);
            }
            if (project.classification.topics && project.classification.topics.length > 0) {
                rows.push(['Topics', formatValue(project.classification.topics)]);
            }
        }
        
        if (project.routing) {
            if (project.routing.destination) {
                rows.push(['Destination', project.routing.destination]);
            }
            rows.push(['Directory Structure', project.routing.structure || 'month']);
            if (project.routing.filename_options && project.routing.filename_options.length > 0) {
                rows.push(['Filename Options', formatValue(project.routing.filename_options)]);
            }
        }
        
        if (project.sounds_like && project.sounds_like.length > 0) {
            rows.push(['Sounds Like', formatValue(project.sounds_like)]);
        }
        
        rows.push(['Active', project.active !== false ? 'true' : 'false']);
        
        if (project.notes) rows.push(['Notes', project.notes]);
    } else if (entity.type === 'term') {
        const term = entity as Term;
        if (term.expansion) rows.push(['Expansion', term.expansion]);
        if (term.domain) rows.push(['Domain', term.domain]);
        if (term.sounds_like && term.sounds_like.length > 0) {
            rows.push(['Sounds Like', formatValue(term.sounds_like)]);
        }
        if (term.projects && term.projects.length > 0) {
            rows.push(['Projects', formatValue(term.projects)]);
        }
    } else if (entity.type === 'company') {
        const company = entity as Company;
        if (company.fullName) rows.push(['Full Name', company.fullName]);
        if (company.industry) rows.push(['Industry', company.industry]);
        if (company.sounds_like && company.sounds_like.length > 0) {
            rows.push(['Sounds Like', formatValue(company.sounds_like)]);
        }
    } else if (entity.type === 'ignored') {
        const ignored = entity as IgnoredTerm;
        if (ignored.ignoredAt) {
            rows.push(['Ignored At', new Date(ignored.ignoredAt).toLocaleString()]);
        }
        if (ignored.reason) rows.push(['Reason', ignored.reason]);
    }
    
    // Add all rows to table
    rows.forEach(([field, value]) => {
        table.push([field, value]);
    });
    
    print(`\n${entity.type.charAt(0).toUpperCase() + entity.type.slice(1)}: ${entity.name}\n`);
    print(table.toString());
    
    if (filePath) {
        print(`\nFile: ${filePath}`);
    }
    print('');
};

/**
 * Get all entities of a given type (helper for row number lookup)
 */
const getAllEntities = (context: Context.ContextInstance, type: EntityType): Entity[] => {
    if (type === 'person') {
        return context.getAllPeople();
    } else if (type === 'project') {
        return context.getAllProjects();
    } else if (type === 'company') {
        return context.getAllCompanies();
    } else if (type === 'ignored') {
        return context.getAllIgnored();
    } else {
        return context.getAllTerms();
    }
};

/**
 * Show a specific entity
 */
const showEntity = async (
    context: Context.ContextInstance,
    type: EntityType,
    idOrNumber: string
) => {
    let entity: Entity | undefined;
    
    // Check if input is a number (row number from list)
    const rowNumber = parseInt(idOrNumber, 10);
    if (!isNaN(rowNumber) && rowNumber > 0) {
        // Get sorted list (same order as list command)
        const entities = getAllEntities(context, type);
        const sortedEntities = entities.sort((a, b) => a.name.localeCompare(b.name));
        
        // Get entity at row number (1-indexed)
        if (rowNumber <= sortedEntities.length) {
            entity = sortedEntities[rowNumber - 1];
        }
    } else {
        // Lookup by ID
        if (type === 'person') {
            entity = context.getPerson(idOrNumber);
        } else if (type === 'project') {
            entity = context.getProject(idOrNumber);
        } else if (type === 'company') {
            entity = context.getCompany(idOrNumber);
        } else if (type === 'ignored') {
            entity = context.getIgnored(idOrNumber);
        } else {
            entity = context.getTerm(idOrNumber);
        }
    }
    
    if (!entity) {
        print(`Error: ${type} "${idOrNumber}" not found.`);
        process.exit(1);
    }
    
    const filePath = context.getEntityFilePath(entity);
    displayEntityDetails(entity, filePath);
};

/**
 * Interactive prompts for adding a person
 */
const addPerson = async (context: Context.ContextInstance): Promise<void> => {
    const rl = createReadline();
    
    try {
        print('\n[Add New Person]\n');
        
        const name = await askQuestion(rl, 'Full name: ');
        if (!name) {
            print('Name is required. Aborting.');
            return;
        }
        
        const id = await askQuestion(rl, `ID (Enter for "${name.toLowerCase().replace(/\s+/g, '-')}"): `);
        const finalId = id || name.toLowerCase().replace(/\s+/g, '-');
        
        // Check if ID already exists
        if (context.getPerson(finalId)) {
            print(`Error: Person with ID "${finalId}" already exists.`);
            return;
        }
        
        const firstName = await askQuestion(rl, 'First name (Enter to skip): ');
        const lastName = await askQuestion(rl, 'Last name (Enter to skip): ');
        const company = await askQuestion(rl, 'Company ID (Enter to skip): ');
        const role = await askQuestion(rl, 'Role (Enter to skip): ');
        const soundsLikeStr = await askQuestion(rl, 'Sounds like (comma-separated, Enter to skip): ');
        const contextNote = await askQuestion(rl, 'Context notes (Enter to skip): ');
        
        const person: Person = {
            id: finalId,
            name,
            type: 'person',
            ...(firstName && { firstName }),
            ...(lastName && { lastName }),
            ...(company && { company }),
            ...(role && { role }),
            ...(soundsLikeStr && { sounds_like: soundsLikeStr.split(',').map(s => s.trim()) }),
            ...(contextNote && { context: contextNote }),
        };
        
        await context.saveEntity(person);
        print(`\nPerson "${name}" saved successfully.`);
        
    } finally {
        rl.close();
    }
};

/**
 * Interactive prompts for adding a project with optional smart assistance
 */
const addProject = async (
    context: Context.ContextInstance,
    options: AddProjectOptions = {}
): Promise<void> => {
    const rl = createReadline();
    const smartConfig = context.getSmartAssistanceConfig();
    const useSmartAssist = shouldUseSmartAssistance(context, options);
    
    // Initialize assist modules if smart assistance is enabled
    const assist = useSmartAssist ? ProjectAssist.create(smartConfig) : null;
    const fetcher = useSmartAssist ? ContentFetcher.create() : null;

    try {
        print('\n[Add New Project]\n');
        
        // ===== PHASE 1: Basic Info =====
        
        // Get project name
        let name = options.name;
        let suggestedName: string | undefined;
        let suggestions: ProjectAssist.ProjectSuggestions | undefined;
        
        // If source provided and no name, try to get suggestions first
        if (options.source && !name && assist && fetcher) {
            print('[Fetching content from source...]');
            const fetchResult = await fetcher.fetch(options.source);
            
            if (fetchResult.success && fetchResult.content) {
                print(`Found: ${fetchResult.sourceType} - ${fetchResult.sourceName}\n`);
                
                print('[Analyzing content...]');
                suggestions = await assist.analyzeContent(fetchResult.content);
                
                if (suggestions.name) {
                    suggestedName = suggestions.name;
                }
            } else {
                print(`Warning: Could not fetch content: ${fetchResult.error}\n`);
            }
        }
        
        if (!name) {
            const namePrompt = suggestedName 
                ? `Project name (Enter for "${suggestedName}"): `
                : 'Project name: ';
            
            name = await askQuestion(rl, namePrompt);
            if (!name && suggestedName) {
                name = suggestedName;
            }
            if (!name) {
                print('Name is required. Aborting.');
                return;
            }
        }
        
        // Get/calculate ID
        const suggestedId = calculateId(name);
        let id = options.id;
        
        if (!id) {
            print(`  (ID is used for the filename, e.g., "${suggestedId}.yaml")`);
            const idInput = await askQuestion(rl, `ID (Enter for "${suggestedId}"): `);
            id = idInput || suggestedId;
        }
        
        // Check for existing project
        if (context.getProject(id)) {
            print(`Error: Project with ID "${id}" already exists.`);
            return;
        }
        
        // ===== PHASE 2: Routing Config =====
        
        const config = context.getConfig();
        const defaultOutputDir = (config.outputDirectory as string) || '(configured default)';
        
        let destination = options.destination;
        if (!destination) {
            print(`\n  (Leave blank to use the configured default: ${defaultOutputDir})`);
            destination = await askQuestion(rl, 'Output destination path (Enter for default): ');
        }
        
        let structure = options.structure;
        if (!structure) {
            print('  Examples:');
            print('    none:  output/transcript.md');
            print('    year:  output/2025/transcript.md');
            print('    month: output/2025/01/transcript.md');
            print('    day:   output/2025/01/15/transcript.md');
            const structureInput = await askQuestion(rl, 'Directory structure (none/year/month/day, Enter for month): ');
            structure = (structureInput || 'month') as 'none' | 'year' | 'month' | 'day';
        }
        
        let contextType = options.context;
        if (!contextType) {
            print('\n  Context type:');
            print('    work:     Professional/business content');
            print('    personal: Personal notes and ideas');
            print('    mixed:    Contains both work and personal content');
            const contextInput = await askQuestion(rl, 'Context type (work/personal/mixed, Enter for work): ');
            contextType = (contextInput || 'work') as 'work' | 'personal' | 'mixed';
        }
        
        // ===== PHASE 3: Smart Assistance Fields =====
        
        let soundsLike: string[] = [];
        let triggerPhrases: string[] = [];
        let topics: string[] = [];
        let description: string | undefined;
        
        if (useSmartAssist && assist) {
            // Generate sounds_like (phonetic variants of the project NAME)
            print('\n[Generating phonetic variants...]');
            
            if (suggestions?.soundsLike?.length) {
                soundsLike = suggestions.soundsLike;
            } else {
                soundsLike = await assist.generateSoundsLike(name);
            }
            
            if (soundsLike.length > 0) {
                const soundsPreview = soundsLike.slice(0, 6).join(',');
                const moreCount = soundsLike.length - 6;
                const preview = moreCount > 0 ? `${soundsPreview},...(+${moreCount} more)` : soundsPreview;
                
                print('  (Phonetic variants help when Whisper mishears the project name)');
                const soundsInput = await askQuestion(rl, `Sounds like (Enter for suggested, or edit):\n  ${preview}\n> `);
                
                if (soundsInput.trim()) {
                    soundsLike = soundsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }
            } else {
                print('  (Phonetic variants help when Whisper mishears the project name)');
                const soundsInput = await askQuestion(rl, 'Sounds like (comma-separated, Enter to skip): ');
                if (soundsInput.trim()) {
                    soundsLike = soundsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }
            }
            
            // Generate trigger phrases (content-matching phrases)
            print('\n[Generating trigger phrases...]');
            
            if (suggestions?.triggerPhrases?.length) {
                triggerPhrases = suggestions.triggerPhrases;
            } else {
                triggerPhrases = await assist.generateTriggerPhrases(name);
            }
            
            if (triggerPhrases.length > 0) {
                const phrasesPreview = triggerPhrases.slice(0, 8).join(',');
                const moreCount = triggerPhrases.length - 8;
                const preview = moreCount > 0 ? `${phrasesPreview},...(+${moreCount} more)` : phrasesPreview;
                
                print('  (Trigger phrases indicate content belongs to this project)');
                const phrasesInput = await askQuestion(rl, `Trigger phrases (Enter for suggested, or edit):\n  ${preview}\n> `);
                
                if (phrasesInput.trim()) {
                    triggerPhrases = phrasesInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }
            } else {
                print('  (Trigger phrases indicate content belongs to this project)');
                const phrasesInput = await askQuestion(rl, 'Trigger phrases (comma-separated): ');
                if (phrasesInput.trim()) {
                    triggerPhrases = phrasesInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }
            }
            
            // Handle topics and description
            if (suggestions?.topics?.length || suggestions?.description) {
                // We have suggestions from content analysis
                if (suggestions.topics?.length) {
                    const topicsPreview = suggestions.topics.slice(0, 10).join(',');
                    const moreCount = suggestions.topics.length - 10;
                    const preview = moreCount > 0 ? `${topicsPreview},...(+${moreCount} more)` : topicsPreview;
                    
                    const topicsInput = await askQuestion(rl, `\nTopic keywords (Enter for suggested, or edit):\n  ${preview}\n> `);
                    
                    if (topicsInput.trim()) {
                        topics = topicsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    } else {
                        topics = suggestions.topics;
                    }
                }
                
                if (suggestions.description) {
                    const descPreview = suggestions.description.length > 200 
                        ? suggestions.description.substring(0, 200) + '...'
                        : suggestions.description;
                    
                    const descInput = await askQuestion(rl, `\nDescription (Enter for suggested, or edit):\n  ${descPreview}\n> `);
                    
                    if (descInput.trim()) {
                        description = descInput;
                    } else {
                        description = suggestions.description;
                    }
                }
            } else if (!options.source && smartConfig.promptForSource) {
                // No source provided yet, ask if user wants to provide one
                print('\nWould you like to provide a URL or file path for auto-generating');
                const sourceInput = await askQuestion(rl, 'keywords and description? (Enter path, or press Enter to skip): ');
                
                if (sourceInput.trim() && fetcher) {
                    print('[Fetching content...]');
                    const fetchResult = await fetcher.fetch(sourceInput.trim());
                    
                    if (fetchResult.success && fetchResult.content) {
                        print(`Found: ${fetchResult.sourceType} - ${fetchResult.sourceName}`);
                        print('[Analyzing content...]');
                        
                        const contentSuggestions = await assist.analyzeContent(fetchResult.content, name);
                        
                        if (contentSuggestions.topics?.length) {
                            const topicsPreview = contentSuggestions.topics.slice(0, 10).join(',');
                            const topicsInput = await askQuestion(rl, `\nTopic keywords (Enter for suggested, or edit):\n  ${topicsPreview}\n> `);
                            
                            topics = topicsInput.trim() 
                                ? topicsInput.split(',').map(s => s.trim()).filter(s => s.length > 0)
                                : contentSuggestions.topics;
                        }
                        
                        if (contentSuggestions.description) {
                            const descPreview = contentSuggestions.description.length > 200 
                                ? contentSuggestions.description.substring(0, 200) + '...'
                                : contentSuggestions.description;
                            const descInput = await askQuestion(rl, `\nDescription (Enter for suggested, or edit):\n  ${descPreview}\n> `);
                            
                            description = descInput.trim() || contentSuggestions.description;
                        }
                    } else {
                        print(`Warning: Could not fetch content: ${fetchResult.error}`);
                    }
                }
                
                // Fall back to manual entry if no source or fetch failed
                if (!topics.length) {
                    const topicsInput = await askQuestion(rl, '\nTopic keywords (comma-separated, Enter to skip): ');
                    if (topicsInput.trim()) {
                        topics = topicsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    }
                }
                
                if (!description) {
                    const descInput = await askQuestion(rl, 'Description (Enter to skip): ');
                    if (descInput.trim()) {
                        description = descInput.trim();
                    }
                }
            }
        } else {
            // Smart assistance disabled - manual entry only
            print('\n  (Phonetic variants help when Whisper mishears the project name)');
            const soundsStr = await askQuestion(rl, 'Sounds like (comma-separated, Enter to skip): ');
            if (soundsStr.trim()) {
                soundsLike = soundsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            
            print('\n  (Trigger phrases indicate content belongs to this project)');
            const phrasesStr = await askQuestion(rl, 'Trigger phrases (comma-separated): ');
            if (phrasesStr.trim()) {
                triggerPhrases = phrasesStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            
            const topicsStr = await askQuestion(rl, '\nTopic keywords (comma-separated, Enter to skip): ');
            if (topicsStr.trim()) {
                topics = topicsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            
            const descInput = await askQuestion(rl, 'Description (Enter to skip): ');
            if (descInput.trim()) {
                description = descInput.trim();
            }
        }
        
        // ===== PHASE 4: Create Project =====
        
        const project: Project = {
            id,
            name,
            type: 'project',
            classification: {
                context_type: contextType,
                explicit_phrases: triggerPhrases,
                ...(topics.length && { topics }),
            },
            routing: {
                ...(destination && { destination }),
                structure: structure as 'none' | 'year' | 'month' | 'day',
                filename_options: ['date', 'time', 'subject'],
            },
            ...(soundsLike.length && { sounds_like: soundsLike }),
            ...(description && { description }),
            active: true,
        };
        
        await context.saveEntity(project);
        print(`\nProject "${name}" saved successfully.`);
        
    } finally {
        rl.close();
    }
};

/**
 * Interactive prompts for adding a term
 */
const addTerm = async (context: Context.ContextInstance): Promise<void> => {
    const rl = createReadline();
    
    try {
        print('\n[Add New Term]\n');
        
        const name = await askQuestion(rl, 'Term: ');
        if (!name) {
            print('Term is required. Aborting.');
            return;
        }
        
        const id = await askQuestion(rl, `ID (Enter for "${name.toLowerCase().replace(/\s+/g, '-')}"): `);
        const finalId = id || name.toLowerCase().replace(/\s+/g, '-');
        
        if (context.getTerm(finalId)) {
            print(`Error: Term with ID "${finalId}" already exists.`);
            return;
        }
        
        const expansion = await askQuestion(rl, 'Expansion (if acronym, Enter to skip): ');
        const domain = await askQuestion(rl, 'Domain (e.g., engineering, finance, Enter to skip): ');
        const soundsLikeStr = await askQuestion(rl, 'Sounds like (comma-separated, Enter to skip): ');
        const projectsStr = await askQuestion(rl, 'Associated project IDs (comma-separated, Enter to skip): ');
        
        const term: Term = {
            id: finalId,
            name,
            type: 'term',
            ...(expansion && { expansion }),
            ...(domain && { domain }),
            ...(soundsLikeStr && { sounds_like: soundsLikeStr.split(',').map(s => s.trim()) }),
            ...(projectsStr && { projects: projectsStr.split(',').map(s => s.trim()) }),
        };
        
        await context.saveEntity(term);
        print(`\nTerm "${name}" saved successfully.`);
        
    } finally {
        rl.close();
    }
};

/**
 * Interactive prompts for adding a company
 */
const addCompany = async (context: Context.ContextInstance): Promise<void> => {
    const rl = createReadline();
    
    try {
        print('\n[Add New Company]\n');
        
        const name = await askQuestion(rl, 'Company name: ');
        if (!name) {
            print('Name is required. Aborting.');
            return;
        }
        
        const id = await askQuestion(rl, `ID (Enter for "${name.toLowerCase().replace(/\s+/g, '-')}"): `);
        const finalId = id || name.toLowerCase().replace(/\s+/g, '-');
        
        if (context.getCompany(finalId)) {
            print(`Error: Company with ID "${finalId}" already exists.`);
            return;
        }
        
        const fullName = await askQuestion(rl, 'Full legal name (Enter to skip): ');
        const industry = await askQuestion(rl, 'Industry (Enter to skip): ');
        const soundsLikeStr = await askQuestion(rl, 'Sounds like (comma-separated, Enter to skip): ');
        
        const company: Company = {
            id: finalId,
            name,
            type: 'company',
            ...(fullName && { fullName }),
            ...(industry && { industry }),
            ...(soundsLikeStr && { sounds_like: soundsLikeStr.split(',').map(s => s.trim()) }),
        };
        
        await context.saveEntity(company);
        print(`\nCompany "${name}" saved successfully.`);
        
    } finally {
        rl.close();
    }
};

/**
 * Interactive prompts for adding an ignored term
 */
const addIgnored = async (context: Context.ContextInstance): Promise<void> => {
    const rl = createReadline();
    
    try {
        print('\n[Add Ignored Term]\n');
        
        const name = await askQuestion(rl, 'Term to ignore: ');
        if (!name) {
            print('Term is required. Aborting.');
            return;
        }
        
        const id = name.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        
        if (context.getIgnored(id)) {
            print(`"${name}" is already on the ignore list.`);
            return;
        }
        
        const reason = await askQuestion(rl, 'Reason for ignoring (Enter to skip): ');
        
        const ignored: IgnoredTerm = {
            id,
            name,
            type: 'ignored',
            ignoredAt: new Date().toISOString(),
            ...(reason && { reason }),
        };
        
        await context.saveEntity(ignored);
        print(`\n"${name}" added to ignore list.`);
        
    } finally {
        rl.close();
    }
};

/**
 * Delete an entity
 */
const deleteEntity = async (
    context: Context.ContextInstance,
    type: EntityType,
    id: string,
    options: { force?: boolean }
) => {
    let entity: Entity | undefined;
    if (type === 'person') {
        entity = context.getPerson(id);
    } else if (type === 'project') {
        entity = context.getProject(id);
    } else if (type === 'company') {
        entity = context.getCompany(id);
    } else if (type === 'ignored') {
        entity = context.getIgnored(id);
    } else {
        entity = context.getTerm(id);
    }
    
    if (!entity) {
        print(`Error: ${type} "${id}" not found.`);
        process.exit(1);
    }
    
    if (!options.force) {
        const rl = createReadline();
        try {
            print(`\nAbout to delete ${type}: ${entity.name} (${entity.id})`);
            const confirm = await askQuestion(rl, 'Are you sure? (y/N): ');
            if (confirm.toLowerCase() !== 'y') {
                print('Cancelled.');
                return;
            }
        } finally {
            rl.close();
        }
    }
    
    const deleted = await context.deleteEntity(entity);
    if (deleted) {
        print(`${type.charAt(0).toUpperCase() + type.slice(1)} "${id}" deleted.`);
    } else {
        print(`Error: Failed to delete ${type} "${id}".`);
        process.exit(1);
    }
};

/**
 * Create a subcommand for a specific entity type
 */
const createEntityCommand = (
    type: EntityType,
    typePlural: string,
    addHandler: (context: Context.ContextInstance) => Promise<void>
): Command => {
    const cmd = new Command(type)
        .description(`Manage ${typePlural}`);
    
    cmd
        .command('list')
        .description(`List all ${typePlural}`)
        .option('-v, --verbose', 'Show full details')
        .action(async (options) => {
            const context = await Context.create();
            await listEntities(context, type, options);
        });
    
    cmd
        .command('show <id>')
        .description(`Show details of a ${type} (use ID or row number from list)`)
        .action(async (id) => {
            const context = await Context.create();
            await showEntity(context, type, id);
        });
    
    cmd
        .command('add')
        .description(`Add a new ${type}`)
        .action(async () => {
            const context = await Context.create();
            if (!context.hasContext()) {
                print('Error: No .protokoll directory found. Run "protokoll --init-config" first.');
                process.exit(1);
            }
            await addHandler(context);
        });
    
    cmd
        .command('delete <id>')
        .description(`Delete a ${type}`)
        .option('-f, --force', 'Skip confirmation')
        .action(async (id, options) => {
            const context = await Context.create();
            await deleteEntity(context, type, id, options);
        });
    
    return cmd;
};

/**
 * Create specialized project command with smart assistance options
 */
const createProjectCommand = (): Command => {
    const cmd = new Command('project')
        .description('Manage projects');
    
    cmd
        .command('list')
        .description('List all projects')
        .option('-v, --verbose', 'Show full details')
        .action(async (options) => {
            const context = await Context.create();
            await listEntities(context, 'project', options);
        });
    
    cmd
        .command('show <id>')
        .description('Show details of a project (use ID or row number from list)')
        .action(async (id) => {
            const context = await Context.create();
            await showEntity(context, 'project', id);
        });
    
    cmd
        .command('add [source]')
        .description('Add a new project (optionally provide URL or file path for context)')
        .option('--name <name>', 'Project name (skips name prompt)')
        .option('--id <id>', 'Project ID (auto-calculated from name if not provided)')
        .option('--context <type>', 'Context type: work, personal, or mixed')
        .option('--destination <path>', 'Output destination path')
        .option('--structure <type>', 'Directory structure: none, year, month, day')
        .option('--smart', 'Enable smart assistance (override config)')
        .option('--no-smart', 'Disable smart assistance (override config)')
        .action(async (source, cmdOptions) => {
            const context = await Context.create();
            if (!context.hasContext()) {
                print('Error: No .protokoll directory found. Run "protokoll --init-config" first.');
                process.exit(1);
            }
            await addProject(context, { source, ...cmdOptions });
        });
    
    cmd
        .command('delete <id>')
        .description('Delete a project')
        .option('-f, --force', 'Skip confirmation')
        .action(async (id, options) => {
            const context = await Context.create();
            await deleteEntity(context, 'project', id, options);
        });
    
    return cmd;
};

/**
 * Register all context management subcommands
 */
export const registerContextCommands = (program: Command): void => {
    program.addCommand(createProjectCommand());
    program.addCommand(createEntityCommand('person', 'people', addPerson));
    program.addCommand(createEntityCommand('term', 'terms', addTerm));
    program.addCommand(createEntityCommand('company', 'companies', addCompany));
    program.addCommand(createEntityCommand('ignored', 'ignored terms', addIgnored));
    
    // Add a general 'context' command for overview
    const contextCmd = new Command('context')
        .description('Show context system overview');
    
    contextCmd
        .command('status')
        .description('Show context system status')
        .action(async () => {
            const context = await Context.create();
            const dirs = context.getDiscoveredDirs();
            
            print('\n[Context System Status]\n');
            
            if (dirs.length === 0) {
                print('No .protokoll directories found.');
                print('Run "protokoll --init-config" to create one.');
                return;
            }
            
            print('Discovered context directories:');
            for (const dir of dirs) {
                print(`  ${dir.level === 0 ? '→' : ' '} ${dir.path} (level ${dir.level})`);
            }
            
            print('\nLoaded entities:');
            print(`  Projects:  ${context.getAllProjects().length}`);
            print(`  People:    ${context.getAllPeople().length}`);
            print(`  Terms:     ${context.getAllTerms().length}`);
            print(`  Companies: ${context.getAllCompanies().length}`);
            print(`  Ignored:   ${context.getAllIgnored().length}`);
            print('');
        });
    
    contextCmd
        .command('search <query>')
        .description('Search across all entity types')
        .action(async (query) => {
            const context = await Context.create();
            const results = context.search(query);
            
            if (results.length === 0) {
                print(`No results found for "${query}".`);
                return;
            }
            
            print(`\nResults for "${query}" (${results.length}):\n`);
            for (const entity of results) {
                print(`  [${entity.type}] ${formatEntity(entity)}`);
            }
            print('');
        });
    
    program.addCommand(contextCmd);
};
