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
import { Entity, Person, Project, Company, Term, IgnoredTerm, EntityType, EntityRelationship } from '../context/types';
import * as ProjectAssist from './project-assist';
import * as RelationshipAssist from './relationship-assist';

// Helper functions for working with relationships in new format
const createEntityUri = (type: string, id: string): string => {
    return `redaksjon://${type}/${id}`;
};

const getIdFromUri = (uri: string): string | null => {
    const match = uri.match(/^redaksjon:\/\/[^/]+\/(.+)$/);
    return match ? match[1] : null;
};

const getRelationshipsByType = (relationships: EntityRelationship[] | undefined, relationshipType: string): EntityRelationship[] => {
    if (!relationships) return [];
    return relationships.filter(r => r.relationship === relationshipType);
};

const getEntityIdsByRelationshipType = (relationships: EntityRelationship[] | undefined, relationshipType: string): string[] => {
    return getRelationshipsByType(relationships, relationshipType)
        .map(r => getIdFromUri(r.uri))
        .filter((id): id is string => id !== null);
};

const addRelationship = (relationships: EntityRelationship[] | undefined, type: string, entityType: string, entityId: string): EntityRelationship[] => {
    const rels = relationships || [];
    const uri = createEntityUri(entityType, entityId);
    // Remove existing relationship of this type to this entity, then add new one
    const filtered = rels.filter(r => !(r.relationship === type && r.uri === uri));
    return [...filtered, { uri, relationship: type }];
};

const setRelationships = (relationships: EntityRelationship[] | undefined, type: string, entityType: string, entityIds: string[]): EntityRelationship[] => {
    const rels = relationships || [];
    // Remove all relationships of this type
    const filtered = rels.filter(r => r.relationship !== type);
    // Add new relationships
    const newRels = entityIds.map(id => ({ uri: createEntityUri(entityType, id), relationship: type }));
    return [...filtered, ...newRels];
};

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
    yes?: boolean;             // Accept all AI-generated suggestions without prompting
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
        const details = [];
        if (term.expansion) {
            details.push(truncate(term.expansion, 30));
        }
        if (term.projects && term.projects.length > 0) {
            details.push(`[${term.projects.join(', ')}]`);
        }
        return details.join(' · ');
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
        
        // Classification
        if (project.classification) {
            rows.push(['Context Type', project.classification.context_type || '']);
            
            if (project.classification.explicit_phrases && project.classification.explicit_phrases.length > 0) {
                rows.push(['Trigger Phrases', formatValue(project.classification.explicit_phrases)]);
            }
            
            if (project.classification.topics && project.classification.topics.length > 0) {
                rows.push(['Topics', formatValue(project.classification.topics)]);
            }
            
            if (project.classification.associated_people && project.classification.associated_people.length > 0) {
                rows.push(['Associated People', formatValue(project.classification.associated_people)]);
            }
            
            if (project.classification.associated_companies && project.classification.associated_companies.length > 0) {
                rows.push(['Associated Companies', formatValue(project.classification.associated_companies)]);
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
        
        // Relationships
        if (project.relationships && project.relationships.length > 0) {
            const relParts: string[] = [];
            
            const parentIds = getEntityIdsByRelationshipType(project.relationships, 'parent');
            if (parentIds.length > 0) {
                relParts.push(`Parent: ${parentIds.join(', ')}`);
            }
            
            const childrenIds = getEntityIdsByRelationshipType(project.relationships, 'child');
            if (childrenIds.length > 0) {
                relParts.push(`Children: ${childrenIds.join(', ')}`);
            }
            
            const siblingIds = getEntityIdsByRelationshipType(project.relationships, 'sibling');
            if (siblingIds.length > 0) {
                relParts.push(`Siblings: ${siblingIds.join(', ')}`);
            }
            
            const relatedTermIds = getEntityIdsByRelationshipType(project.relationships, 'related_term');
            if (relatedTermIds.length > 0) {
                relParts.push(`Related Terms: ${relatedTermIds.join(', ')}`);
            }
            
            if (relParts.length > 0) {
                rows.push(['Relationships', relParts.join('\n  ')]);
            }
        }
        
        rows.push(['Active', project.active !== false ? 'true' : 'false']);
        
        if (project.notes) rows.push(['Notes', project.notes]);
    } else if (entity.type === 'term') {
        const term = entity as Term;
        if (term.expansion) rows.push(['Expansion', term.expansion]);
        if (term.domain) rows.push(['Domain', term.domain]);
        if (term.description) rows.push(['Description', term.description]);
        if (term.sounds_like && term.sounds_like.length > 0) {
            rows.push(['Sounds Like', formatValue(term.sounds_like)]);
        }
        if (term.topics && term.topics.length > 0) {
            rows.push(['Topics', formatValue(term.topics)]);
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
        
        // Auto-generate ID from name
        const finalId = calculateId(name);
        
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
    
    // Initialize assist module if smart assistance is enabled
    const assist = useSmartAssist ? ProjectAssist.create(smartConfig) : null;

    try {
        print('\n[Add New Project]\n');
        
        // ===== PHASE 1: Basic Info =====
        
        // Get project name
        let name = options.name;
        let suggestedName: string | undefined;
        let suggestions: ProjectAssist.ProjectSuggestions | undefined;
        
        // If source provided, analyze it for suggestions
        if (options.source && assist) {
            print('[Analyzing source...]\n');
            print('  • Fetching content...');
            // Pass existing name if provided, so we don't suggest a new one
            suggestions = await assist.analyzeSource(options.source, name);
            
            // Only use suggested name if no name was provided
            if (!name && suggestions.name) {
                suggestedName = suggestions.name;
                print(`  • Suggested name: ${suggestedName}`);
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
        
        // Get/calculate ID - auto-generate from name, don't prompt
        const id = options.id || calculateId(name);
        
        // Check for existing project
        if (context.getProject(id)) {
            print(`Error: Project with ID "${id}" already exists.`);
            return;
        }
        
        // ===== PHASE 2: Routing Config =====
        
        // Use configured default destination (don't prompt)
        const destination = options.destination;
        
        // Default to 'month' structure (don't prompt)
        const structure = (options.structure || 'month') as 'none' | 'year' | 'month' | 'day';
        
        // Default to 'work' context (don't prompt)
        const contextType = (options.context || 'work') as 'work' | 'personal' | 'mixed';
        
        // ===== PHASE 3: Smart Assistance Fields =====
        
        let soundsLike: string[] = [];
        let triggerPhrases: string[] = [];
        let topics: string[] = [];
        let description: string | undefined;
        
        if (useSmartAssist && assist) {
            // Generate sounds_like (phonetic variants of the project NAME)
            print('\n[Generating phonetic variants...]');
            print('  • Calling AI model...');
            
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
                
                if (options.yes) {
                    print(`  ${preview}`);
                    print('  ✓ Accepted (--yes mode)');
                } else {
                    const soundsInput = await askQuestion(rl, `Sounds like (Enter for suggested, or edit):\n  ${preview}\n> `);
                    
                    if (soundsInput.trim()) {
                        soundsLike = soundsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    }
                }
            } else {
                print('  (Phonetic variants help when Whisper mishears the project name)');
                if (!options.yes) {
                    const soundsInput = await askQuestion(rl, 'Sounds like (comma-separated, Enter to skip): ');
                    if (soundsInput.trim()) {
                        soundsLike = soundsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    }
                }
            }
            
            // Generate trigger phrases (content-matching phrases)
            print('\n[Generating trigger phrases...]');
            print('  • Calling AI model...');
            
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
                
                if (options.yes) {
                    print(`  ${preview}`);
                    print('  ✓ Accepted (--yes mode)');
                } else {
                    const phrasesInput = await askQuestion(rl, `Trigger phrases (Enter for suggested, or edit):\n  ${preview}\n> `);
                    
                    if (phrasesInput.trim()) {
                        triggerPhrases = phrasesInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    }
                }
            } else {
                print('  (Trigger phrases indicate content belongs to this project)');
                if (!options.yes) {
                    const phrasesInput = await askQuestion(rl, 'Trigger phrases (comma-separated): ');
                    if (phrasesInput.trim()) {
                        triggerPhrases = phrasesInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    }
                }
            }
            
            // Handle topics and description
            if (suggestions?.topics?.length || suggestions?.description) {
                // We have suggestions from content analysis
                if (suggestions.topics?.length) {
                    const topicsPreview = suggestions.topics.slice(0, 10).join(',');
                    const moreCount = suggestions.topics.length - 10;
                    const preview = moreCount > 0 ? `${topicsPreview},...(+${moreCount} more)` : topicsPreview;
                    
                    if (options.yes) {
                        print(`\nTopic keywords:\n  ${preview}`);
                        print('  ✓ Accepted (--yes mode)');
                        topics = suggestions.topics;
                    } else {
                        const topicsInput = await askQuestion(rl, `\nTopic keywords (Enter for suggested, or edit):\n  ${preview}\n> `);
                        
                        if (topicsInput.trim()) {
                            topics = topicsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                        } else {
                            topics = suggestions.topics;
                        }
                    }
                }
                
                if (suggestions.description) {
                    const descPreview = suggestions.description.length > 200 
                        ? suggestions.description.substring(0, 200) + '...'
                        : suggestions.description;
                    
                    if (options.yes) {
                        print(`\nDescription:\n  ${descPreview}`);
                        print('  ✓ Accepted (--yes mode)');
                        description = suggestions.description;
                    } else {
                        const descInput = await askQuestion(rl, `\nDescription (Enter for suggested, or edit):\n  ${descPreview}\n> `);
                        
                        if (descInput.trim()) {
                            description = descInput;
                        } else {
                            description = suggestions.description;
                        }
                    }
                }
            } else if (!options.source && smartConfig.promptForSource && !options.yes) {
                // No source provided yet, ask if user wants to provide one (skip in --yes mode)
                print('\nWould you like to provide a URL or file path for auto-generating');
                const sourceInput = await askQuestion(rl, 'keywords and description? (Enter path, or press Enter to skip): ');
                
                if (sourceInput.trim()) {
                    print('[Analyzing source...]');
                    const contentSuggestions = await assist.analyzeSource(sourceInput.trim(), name);
                    
                    if (contentSuggestions.topics?.length) {
                        const topicsPreview = contentSuggestions.topics.slice(0, 10).join(',');
                        
                        if (options.yes) {
                            print(`\nTopic keywords:\n  ${topicsPreview}`);
                            print('  ✓ Accepted (--yes mode)');
                            topics = contentSuggestions.topics;
                        } else {
                            const topicsInput = await askQuestion(rl, `\nTopic keywords (Enter for suggested, or edit):\n  ${topicsPreview}\n> `);
                            
                            topics = topicsInput.trim() 
                                ? topicsInput.split(',').map(s => s.trim()).filter(s => s.length > 0)
                                : contentSuggestions.topics;
                        }
                    }
                    
                    if (contentSuggestions.description) {
                        const descPreview = contentSuggestions.description.length > 200 
                            ? contentSuggestions.description.substring(0, 200) + '...'
                            : contentSuggestions.description;
                        
                        if (options.yes) {
                            print(`\nDescription:\n  ${descPreview}`);
                            print('  ✓ Accepted (--yes mode)');
                            description = contentSuggestions.description;
                        } else {
                            const descInput = await askQuestion(rl, `\nDescription (Enter for suggested, or edit):\n  ${descPreview}\n> `);
                            
                            description = descInput.trim() || contentSuggestions.description;
                        }
                    }
                }
                
                // Fall back to manual entry if no source or fetch failed (skip in --yes mode)
                if (!topics.length && !options.yes) {
                    const topicsInput = await askQuestion(rl, '\nTopic keywords (comma-separated, Enter to skip): ');
                    if (topicsInput.trim()) {
                        topics = topicsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    }
                }
                
                if (!description && !options.yes) {
                    const descInput = await askQuestion(rl, 'Description (Enter to skip): ');
                    if (descInput.trim()) {
                        description = descInput.trim();
                    }
                }
            }
        } else {
            // Smart assistance disabled - manual entry only (skip in --yes mode)
            if (!options.yes) {
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
        }
        
        // ===== PHASE 4: Relationship Suggestions =====
        
        let relationships: EntityRelationship[] | undefined;
        
        // Only suggest relationships if in interactive mode (not --yes)
        if (!options.yes && (topics.length > 0 || description)) {
            const relationshipSuggestions = RelationshipAssist.suggestRelationships(context, {
                projectName: name,
                projectId: id,
                topics,
                destination,
                description,
            });
            
            // Suggest parent if found
            if (relationshipSuggestions.parent && relationshipSuggestions.parent.confidence !== 'low') {
                print(`\n[Suggested parent project: ${relationshipSuggestions.parent.name}]`);
                print(`  Reason: ${relationshipSuggestions.parent.reason}`);
                print(`  Confidence: ${relationshipSuggestions.parent.confidence}`);
                
                const parentAnswer = await askQuestion(rl, `Set "${relationshipSuggestions.parent.name}" as parent? (Y/n): `);
                if (parentAnswer.toLowerCase() !== 'n' && parentAnswer.toLowerCase() !== 'no') {
                    relationships = addRelationship(relationships, 'parent', 'project', relationshipSuggestions.parent.id);
                    print(`  ✓ Parent set to "${relationshipSuggestions.parent.name}"`);
                }
            }
            
            // Suggest siblings if found
            if (relationshipSuggestions.siblings && relationshipSuggestions.siblings.length > 0) {
                print(`\n[Suggested sibling projects:]`);
                relationshipSuggestions.siblings.forEach((s, i) => {
                    print(`  ${i + 1}. ${s.name} (${s.reason})`);
                });
                
                const siblingsAnswer = await askQuestion(rl, 'Add siblings? (Enter numbers comma-separated, or Enter to skip): ');
                if (siblingsAnswer.trim()) {
                    const indices = siblingsAnswer.split(',')
                        .map(n => parseInt(n.trim()) - 1)
                        .filter(i => i >= 0 && i < relationshipSuggestions.siblings!.length);
                    
                    if (indices.length > 0) {
                        const siblingIds = indices.map(i => relationshipSuggestions.siblings![i].id);
                        relationships = setRelationships(relationships, 'sibling', 'project', siblingIds);
                        print(`  ✓ Added ${indices.length} siblings`);
                    }
                }
            }
            
            // Suggest related terms if found
            if (relationshipSuggestions.relatedTerms && relationshipSuggestions.relatedTerms.length > 0) {
                print(`\n[Suggested related terms:]`);
                relationshipSuggestions.relatedTerms.forEach((t, i) => {
                    print(`  ${i + 1}. ${t.name} (${t.reason})`);
                });
                
                const termsAnswer = await askQuestion(rl, 'Add related terms? (Enter numbers comma-separated, or Enter to skip): ');
                if (termsAnswer.trim()) {
                    const indices = termsAnswer.split(',')
                        .map(n => parseInt(n.trim()) - 1)
                        .filter(i => i >= 0 && i < relationshipSuggestions.relatedTerms!.length);
                    
                    if (indices.length > 0) {
                        const termIds = indices.map(i => relationshipSuggestions.relatedTerms![i].id);
                        relationships = setRelationships(relationships, 'related_term', 'term', termIds);
                        print(`  ✓ Added ${indices.length} related terms`);
                    }
                }
            }
        }
        
        // ===== PHASE 5: Create Project =====
        
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
            ...(relationships && { relationships }),
            active: true,
        };
        
        await context.saveEntity(project);
        print(`\nProject "${name}" saved successfully.`);
        
    } finally {
        rl.close();
    }
};

interface TermAddArgs {
    source?: string;
    term?: string;
    id?: string;
    expansion?: string;
    domain?: string;
    description?: string;
    topics?: string;
    projects?: string;
    smart?: boolean;
}

/**
 * Add a new term with optional smart assistance
 */
const addTermEnhanced = async (
    context: Context.ContextInstance,
    args: TermAddArgs = {}
): Promise<void> => {
    const rl = createReadline();
    
    try {
        print('\n[Add New Term]\n');
        
        // Get term name
        const name = args.term || await askQuestion(rl, 'Term: ');
        if (!name) {
            print('Term is required. Aborting.');
            return;
        }
        
        // Auto-generate ID from term name
        const finalId = args.id || calculateId(name);
        
        if (context.getTerm(finalId)) {
            print(`Error: Term with ID "${finalId}" already exists.`);
            return;
        }
        
        // Get expansion
        const expansion = args.expansion || await askQuestion(rl, 'Expansion (if acronym, Enter to skip): ');
        
        // Get domain
        const domain = args.domain || await askQuestion(rl, 'Domain (e.g., engineering, finance, Enter to skip): ');
        
        // Get description
        const description = args.description || await askQuestion(rl, 'Description (Enter to skip): ');
        
        // Get topics
        let topicsArray: string[] = [];
        if (args.topics) {
            topicsArray = args.topics.split(',').map(t => t.trim()).filter(t => t.length > 0);
        } else {
            const topicsStr = await askQuestion(rl, 'Topics (comma-separated, Enter to skip): ');
            if (topicsStr) {
                topicsArray = topicsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
            }
        }
        
        // Get sounds_like
        const soundsLikeStr = await askQuestion(rl, 'Sounds like (comma-separated, Enter to skip): ');
        
        // Get projects
        let projectsArray: string[] = [];
        if (args.projects) {
            projectsArray = args.projects.split(',').map(p => p.trim()).filter(p => p.length > 0);
        } else {
            const projectsStr = await askQuestion(rl, 'Associated project IDs (comma-separated, Enter to skip): ');
            if (projectsStr) {
                projectsArray = projectsStr.split(',').map(p => p.trim()).filter(p => p.length > 0);
            }
        }
        
        const term: Term = {
            id: finalId,
            name,
            type: 'term',
            ...(expansion && { expansion }),
            ...(domain && { domain }),
            ...(description && { description }),
            ...(topicsArray.length > 0 && { topics: topicsArray }),
            ...(soundsLikeStr && { sounds_like: soundsLikeStr.split(',').map(s => s.trim()) }),
            ...(projectsArray.length > 0 && { projects: projectsArray }),
        };
        
        await context.saveEntity(term);
        print(`\nTerm "${name}" saved successfully.`);
        
    } finally {
        rl.close();
    }
};

/**
 * Edit project with incremental changes (implementation)
 */
const editProject = async (
    context: Context.ContextInstance,
    id: string,
    options: {
        name?: string;
        description?: string;
        destination?: string;
        structure?: string;
        contextType?: string;
        addTopic?: string[];
        removeTopic?: string[];
        addPhrase?: string[];
        removePhrase?: string[];
        addPerson?: string[];
        removePerson?: string[];
        addCompany?: string[];
        removeCompany?: string[];
        parent?: string;
        addChild?: string[];
        removeChild?: string[];
        addSibling?: string[];
        removeSibling?: string[];
        addTerm?: string[];
        removeTerm?: string[];
        active?: string;
    }
): Promise<void> => {
    const project = context.getProject(id);
    if (!project) {
        print(`Error: Project "${id}" not found`);
        process.exit(1);
    }

    // Helper to merge arrays
    const mergeArray = (
        existing: string[] | undefined,
        add: string[] | undefined,
        remove: string[] | undefined
    ): string[] | undefined => {
        let result = existing ? [...existing] : [];
        if (add && add.length > 0) {
            result = [...result, ...add.filter(v => !result.includes(v))];
        }
        if (remove && remove.length > 0) {
            result = result.filter(v => !remove.includes(v));
        }
        return result.length > 0 ? result : undefined;
    };

    // Track changes for summary
    const changes: string[] = [];

    // Update basic fields
    const updated: Project = { ...project };
    if (options.name) {
        updated.name = options.name;
        changes.push(`name: "${options.name}"`);
    }
    if (options.description) {
        updated.description = options.description;
        changes.push(`description updated`);
    }
    if (options.active) {
        updated.active = options.active === 'true';
        changes.push(`active: ${options.active}`);
    }

    // Update classification
    const classification = { ...project.classification };
    
    if (options.contextType) {
        classification.context_type = options.contextType as 'work' | 'personal' | 'mixed';
        changes.push(`context_type: ${options.contextType}`);
    }
    
    const updatedTopics = mergeArray(classification.topics, options.addTopic, options.removeTopic);
    if (updatedTopics !== undefined && updatedTopics !== classification.topics) {
        classification.topics = updatedTopics;
        if (options.addTopic?.length) changes.push(`added ${options.addTopic.length} topics`);
        if (options.removeTopic?.length) changes.push(`removed ${options.removeTopic.length} topics`);
    }
    
    const updatedPhrases = mergeArray(classification.explicit_phrases, options.addPhrase, options.removePhrase);
    if (updatedPhrases !== undefined && updatedPhrases !== classification.explicit_phrases) {
        classification.explicit_phrases = updatedPhrases;
        if (options.addPhrase?.length) changes.push(`added ${options.addPhrase.length} trigger phrases`);
        if (options.removePhrase?.length) changes.push(`removed ${options.removePhrase.length} trigger phrases`);
    }
    
    const updatedPeople = mergeArray(classification.associated_people, options.addPerson, options.removePerson);
    if (updatedPeople !== undefined && updatedPeople !== classification.associated_people) {
        classification.associated_people = updatedPeople;
        if (options.addPerson?.length) changes.push(`added ${options.addPerson.length} associated people`);
        if (options.removePerson?.length) changes.push(`removed ${options.removePerson.length} associated people`);
    }
    
    const updatedCompanies = mergeArray(classification.associated_companies, options.addCompany, options.removeCompany);
    if (updatedCompanies !== undefined && updatedCompanies !== classification.associated_companies) {
        classification.associated_companies = updatedCompanies;
        if (options.addCompany?.length) changes.push(`added ${options.addCompany.length} associated companies`);
        if (options.removeCompany?.length) changes.push(`removed ${options.removeCompany.length} associated companies`);
    }
    
    updated.classification = classification;

    // Update routing
    const routing = { ...project.routing };
    if (options.destination) {
        routing.destination = options.destination;
        changes.push(`destination: ${options.destination}`);
    }
    if (options.structure) {
        routing.structure = options.structure as 'none' | 'year' | 'month' | 'day';
        changes.push(`structure: ${options.structure}`);
    }
    updated.routing = routing;

    // Update relationships
    if (options.parent || options.addChild || options.removeChild || 
        options.addSibling || options.removeSibling || options.addTerm || options.removeTerm) {
        
        let relationships: EntityRelationship[] = project.relationships ? [...project.relationships] : [];
        
        if (options.parent) {
            relationships = addRelationship(relationships, 'parent', 'project', options.parent);
            changes.push(`parent: ${options.parent}`);
        }
        
        const existingChildren = getEntityIdsByRelationshipType(relationships, 'child');
        const updatedChildren = mergeArray(existingChildren, options.addChild, options.removeChild);
        if (updatedChildren !== undefined && updatedChildren !== existingChildren) {
            relationships = setRelationships(relationships, 'child', 'project', updatedChildren);
            if (options.addChild?.length) changes.push(`added ${options.addChild.length} children`);
            if (options.removeChild?.length) changes.push(`removed ${options.removeChild.length} children`);
        }
        
        const existingSiblings = getEntityIdsByRelationshipType(relationships, 'sibling');
        const updatedSiblings = mergeArray(existingSiblings, options.addSibling, options.removeSibling);
        if (updatedSiblings !== undefined && updatedSiblings !== existingSiblings) {
            relationships = setRelationships(relationships, 'sibling', 'project', updatedSiblings);
            if (options.addSibling?.length) changes.push(`added ${options.addSibling.length} siblings`);
            if (options.removeSibling?.length) changes.push(`removed ${options.removeSibling.length} siblings`);
        }
        
        const existingRelatedTerms = getEntityIdsByRelationshipType(relationships, 'related_term');
        const updatedRelatedTerms = mergeArray(existingRelatedTerms, options.addTerm, options.removeTerm);
        if (updatedRelatedTerms !== undefined && updatedRelatedTerms !== existingRelatedTerms) {
            relationships = setRelationships(relationships, 'related_term', 'term', updatedRelatedTerms);
            if (options.addTerm?.length) changes.push(`added ${options.addTerm.length} related terms`);
            if (options.removeTerm?.length) changes.push(`removed ${options.removeTerm.length} related terms`);
        }
        
        updated.relationships = relationships.length > 0 ? relationships : undefined;
    }

    updated.updatedAt = new Date();

    await context.saveEntity(updated);
    
    if (changes.length > 0) {
        print(`\n✓ Updated project "${project.name}":`);
        changes.forEach(c => print(`  • ${c}`));
        print('');
    } else {
        print(`\nNo changes made to project "${project.name}"\n`);
    }
    
    displayEntityDetails(updated);
};

/**
 * Update project by regenerating metadata from source
 */
/* c8 ignore start */
const updateProject = async (
    context: Context.ContextInstance,
    id: string,
    source: string,
    options: { name?: string }
): Promise<void> => {
    const existingProject = context.getProject(id);
    if (!existingProject) {
        print(`Error: Project "${id}" not found.`);
        process.exit(1);
    }

    print(`\nUpdating project: ${existingProject.name} (${existingProject.id})`);
    print(`Source: ${source}\n`);

    const smartConfig = context.getSmartAssistanceConfig();
    if (!smartConfig.enabled) {
        print('Error: Smart assistance is disabled in configuration.');
        process.exit(1);
    }

    // Import project-assist dynamically
    const ProjectAssist = await import('./project-assist');

    print('[Fetching content and analyzing...]');
    const assist = ProjectAssist.create(smartConfig);
    const projectName = options.name || existingProject.name;

    // Analyze source
    const suggestions = await assist.analyzeSource(source, projectName);

    // Show what was generated
    print('\nGenerated metadata:');
    if (suggestions.soundsLike.length > 0) {
        print(`  Sounds like: ${suggestions.soundsLike.slice(0, 5).join(', ')}${suggestions.soundsLike.length > 5 ? '...' : ''}`);
    }
    if (suggestions.triggerPhrases.length > 0) {
        print(`  Trigger phrases: ${suggestions.triggerPhrases.slice(0, 5).join(', ')}${suggestions.triggerPhrases.length > 5 ? '...' : ''}`);
    }
    if (suggestions.topics && suggestions.topics.length > 0) {
        print(`  Topics: ${suggestions.topics.slice(0, 10).join(', ')}${suggestions.topics.length > 10 ? '...' : ''}`);
    }
    if (suggestions.description) {
        print(`  Description: ${suggestions.description.substring(0, 100)}...`);
    }

    // Update project
    const updatedProject: Project = {
        ...existingProject,
        ...(options.name && { name: options.name }),
        ...(suggestions.description && { description: suggestions.description }),
        ...(suggestions.soundsLike.length > 0 && { sounds_like: suggestions.soundsLike }),
        classification: {
            ...existingProject.classification,
            ...(suggestions.triggerPhrases.length > 0 && { explicit_phrases: suggestions.triggerPhrases }),
            ...(suggestions.topics && suggestions.topics.length > 0 && { topics: suggestions.topics }),
        },
        updatedAt: new Date(),
    };

    await context.saveEntity(updatedProject);
    print(`\n✓ Project "${existingProject.name}" updated successfully.`);
};
/* c8 ignore stop */

/**
 * Edit term with incremental updates
 */
const editTerm = async (
    context: Context.ContextInstance,
    id: string,
    options: {
        description?: string;
        domain?: string;
        expansion?: string;
        addSound?: string[];
        removeSound?: string[];
        addTopic?: string[];
        removeTopic?: string[];
        addProject?: string[];
        removeProject?: string[];
    }
): Promise<void> => {
    const term = context.getTerm(id);
    if (!term) {
        print(`Error: Term "${id}" not found`);
        process.exit(1);
    }

    // Helper to merge arrays
    const mergeArray = (
        existing: string[] | undefined,
        add: string[] | undefined,
        remove: string[] | undefined
    ): string[] | undefined => {
        let result = existing ? [...existing] : [];
        if (add && add.length > 0) {
            result = [...result, ...add.filter(v => !result.includes(v))];
        }
        if (remove && remove.length > 0) {
            result = result.filter(v => !remove.includes(v));
        }
        return result.length > 0 ? result : undefined;
    };

    // Track changes
    const changes: string[] = [];

    // Update basic fields
    const updated: Term = { ...term };
    if (options.description) {
        updated.description = options.description;
        changes.push('description updated');
    }
    if (options.domain) {
        updated.domain = options.domain;
        changes.push(`domain: ${options.domain}`);
    }
    if (options.expansion) {
        updated.expansion = options.expansion;
        changes.push(`expansion: ${options.expansion}`);
    }

    // Update arrays
    const updatedSounds = mergeArray(term.sounds_like, options.addSound, options.removeSound);
    if (updatedSounds !== term.sounds_like) {
        updated.sounds_like = updatedSounds;
        if (options.addSound?.length) changes.push(`added ${options.addSound.length} sounds_like variants`);
        if (options.removeSound?.length) changes.push(`removed ${options.removeSound.length} sounds_like variants`);
    }

    const updatedTopics = mergeArray(term.topics, options.addTopic, options.removeTopic);
    if (updatedTopics !== term.topics) {
        updated.topics = updatedTopics;
        if (options.addTopic?.length) changes.push(`added ${options.addTopic.length} topics`);
        if (options.removeTopic?.length) changes.push(`removed ${options.removeTopic.length} topics`);
    }

    const updatedProjects = mergeArray(term.projects, options.addProject, options.removeProject);
    if (updatedProjects !== term.projects) {
        updated.projects = updatedProjects;
        if (options.addProject?.length) changes.push(`added ${options.addProject.length} project associations`);
        if (options.removeProject?.length) changes.push(`removed ${options.removeProject.length} project associations`);
    }

    updated.updatedAt = new Date();

    await context.saveEntity(updated);
    
    if (changes.length > 0) {
        print(`\n✓ Updated term "${term.name}":`);
        changes.forEach(c => print(`  • ${c}`));
        print('');
    } else {
        print(`\nNo changes made to term "${term.name}"\n`);
    }
    
    displayEntityDetails(updated);
};

/**
 * Update term by regenerating metadata from source
 */
/* c8 ignore start */
const updateTerm = async (
    context: Context.ContextInstance,
    id: string,
    source: string,
    options: { expansion?: string }
): Promise<void> => {
    const existingTerm = context.getTerm(id);
    if (!existingTerm) {
        print(`Error: Term "${id}" not found.`);
        process.exit(1);
    }

    print(`\nUpdating term: ${existingTerm.name} (${existingTerm.id})`);
    print(`Source: ${source}\n`);

    const smartConfig = context.getSmartAssistanceConfig();
    if (!smartConfig.enabled || smartConfig.termsEnabled === false) {
        print('Error: Term smart assistance is disabled in configuration.');
        process.exit(1);
    }

    // Import dynamically to avoid circular deps
    const ContentFetcher = await import('./content-fetcher');
    const TermAssist = await import('./term-assist');
    const TermContext = await import('./term-context');

    // Fetch content
    print('[Fetching content from source...]');
    const contentFetcher = ContentFetcher.create();
    const fetchResult = await contentFetcher.fetch(source);

    if (!fetchResult.success) {
        print(`Error: Failed to fetch source: ${fetchResult.error}`);
        process.exit(1);
    }

    print(`Found: ${fetchResult.sourceName} (${fetchResult.sourceType})\n`);

    // Generate suggestions
    print('[Analyzing content and generating suggestions...]');
    const termAssist = TermAssist.create(smartConfig);
    const termContextHelper = TermContext.create(context);
    
    const internalContext = termContextHelper.gatherInternalContext(
        existingTerm.name,
        options.expansion || existingTerm.expansion
    );
    
    const analysisContext = TermContext.buildAnalysisContext(
        existingTerm.name,
        options.expansion || existingTerm.expansion,
        fetchResult,
        internalContext
    );

    const suggestions = await termAssist.generateAll(existingTerm.name, analysisContext);

    // Show what was generated
    print('\nGenerated metadata:');
    if (suggestions.soundsLike.length > 0) {
        print(`  Sounds like: ${suggestions.soundsLike.slice(0, 5).join(', ')}${suggestions.soundsLike.length > 5 ? '...' : ''}`);
    }
    if (suggestions.description) {
        print(`  Description: ${suggestions.description.substring(0, 100)}...`);
    }
    if (suggestions.topics.length > 0) {
        print(`  Topics: ${suggestions.topics.slice(0, 10).join(', ')}${suggestions.topics.length > 10 ? '...' : ''}`);
    }
    if (suggestions.domain) {
        print(`  Domain: ${suggestions.domain}`);
    }

    // Suggest projects
    if (suggestions.topics.length > 0 && smartConfig.termProjectSuggestions) {
        const projects = termContextHelper.findProjectsByTopic(suggestions.topics);
        if (projects.length > 0) {
            print(`  Suggested projects: ${projects.map(p => p.id).join(', ')}`);
        }
    }

    // Update term
    const updatedTerm: Term = {
        ...existingTerm,
        ...(options.expansion && { expansion: options.expansion }),
        ...(suggestions.description && { description: suggestions.description }),
        ...(suggestions.domain && { domain: suggestions.domain }),
        ...(suggestions.soundsLike.length > 0 && { sounds_like: suggestions.soundsLike }),
        ...(suggestions.topics.length > 0 && { topics: suggestions.topics }),
        updatedAt: new Date(),
    };

    await context.saveEntity(updatedTerm);
    print(`\n✓ Term "${existingTerm.name}" updated successfully.`);
};
/* c8 ignore stop */

/**
 * Merge two terms - combine their metadata and delete the source
 */
/* c8 ignore start */
const mergeTerms = async (
    context: Context.ContextInstance,
    sourceId: string,
    targetId: string,
    options: { force?: boolean }
): Promise<void> => {
    // Get both terms
    const sourceTerm = context.getTerm(sourceId);
    const targetTerm = context.getTerm(targetId);
    
    if (!sourceTerm) {
        print(`Error: Source term "${sourceId}" not found.`);
        process.exit(1);
    }
    
    if (!targetTerm) {
        print(`Error: Target term "${targetId}" not found.`);
        process.exit(1);
    }
    
    // Show what will be merged
    print(`\nMerging terms:`);
    print(`  Source: ${sourceTerm.name} (${sourceTerm.id})`);
    print(`  Target: ${targetTerm.name} (${targetTerm.id})`);
    print('');
    
    // Confirm unless --force
    if (!options.force) {
        const rl = createReadline();
        try {
            const confirm = await askQuestion(rl, 'Merge these terms? (y/N): ');
            if (confirm.toLowerCase() !== 'y') {
                print('Cancelled.');
                return;
            }
        } finally {
            rl.close();
        }
    }
    
    // Merge metadata
    const mergedTerm: Term = {
        ...targetTerm,
        // Combine sounds_like
        sounds_like: [
            ...(targetTerm.sounds_like || []),
            ...(sourceTerm.sounds_like || []),
        ].filter((v, i, arr) => arr.indexOf(v) === i), // Deduplicate
        // Combine topics
        topics: [
            ...(targetTerm.topics || []),
            ...(sourceTerm.topics || []),
        ].filter((v, i, arr) => arr.indexOf(v) === i), // Deduplicate
        // Combine projects
        projects: [
            ...(targetTerm.projects || []),
            ...(sourceTerm.projects || []),
        ].filter((v, i, arr) => arr.indexOf(v) === i), // Deduplicate
        // Keep target's primary fields but use source if target is missing
        description: targetTerm.description || sourceTerm.description,
        domain: targetTerm.domain || sourceTerm.domain,
        expansion: targetTerm.expansion || sourceTerm.expansion,
        updatedAt: new Date(),
    };
    
    // Remove empty arrays
    if (mergedTerm.sounds_like && mergedTerm.sounds_like.length === 0) {
        delete mergedTerm.sounds_like;
    }
    if (mergedTerm.topics && mergedTerm.topics.length === 0) {
        delete mergedTerm.topics;
    }
    if (mergedTerm.projects && mergedTerm.projects.length === 0) {
        delete mergedTerm.projects;
    }
    
    // Save merged term
    await context.saveEntity(mergedTerm);
    
    // Delete source term
    await context.deleteEntity(sourceTerm);
    
    print(`\n✓ Merged "${sourceTerm.name}" into "${targetTerm.name}"`);
    print(`✓ Deleted source term "${sourceTerm.id}"`);
};
/* c8 ignore stop */

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
        
        // Auto-generate ID from company name
        const finalId = calculateId(name);
        
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
        .option('--name <name>', 'Project name (preferred - provide on command line)')
        .option('--id <id>', 'Project ID (auto-calculated from name if not provided)')
        .option('--context <type>', 'Context type: work, personal, or mixed (default: work)')
        .option('--destination <path>', 'Output destination path (default: configured)')
        .option('--structure <type>', 'Directory structure: none, year, month, day (default: month)')
        .option('--smart', 'Enable smart assistance (override config)')
        .option('--no-smart', 'Disable smart assistance (override config)')
        .option('-y, --yes', 'Accept all AI-generated suggestions without prompting')
        .action(async (source, cmdOptions) => {
            const context = await Context.create();
            if (!context.hasContext()) {
                print('Error: No .protokoll directory found. Run "protokoll --init-config" first.');
                process.exit(1);
            }
            await addProject(context, { source, ...cmdOptions });
        });
    
    cmd
        .command('edit <id>')
        .description('Edit project fields (classification, routing, relationships)')
        .option('--name <name>', 'Update project name')
        .option('--description <text>', 'Update description')
        .option('--destination <path>', 'Update routing destination')
        .option('--structure <type>', 'Update directory structure: none, year, month, day')
        .option('--context-type <type>', 'Update context type: work, personal, mixed')
        .option('--add-topic <topic>', 'Add a classification topic (repeatable)', collect, [])
        .option('--remove-topic <topic>', 'Remove a classification topic (repeatable)', collect, [])
        .option('--add-phrase <phrase>', 'Add trigger phrase (repeatable)', collect, [])
        .option('--remove-phrase <phrase>', 'Remove trigger phrase (repeatable)', collect, [])
        .option('--add-person <id>', 'Associate person ID (repeatable)', collect, [])
        .option('--remove-person <id>', 'Remove associated person (repeatable)', collect, [])
        .option('--add-company <id>', 'Associate company ID (repeatable)', collect, [])
        .option('--remove-company <id>', 'Remove associated company (repeatable)', collect, [])
        .option('--parent <id>', 'Set parent project ID')
        .option('--add-child <id>', 'Add child project (repeatable)', collect, [])
        .option('--remove-child <id>', 'Remove child project (repeatable)', collect, [])
        .option('--add-sibling <id>', 'Add sibling project (repeatable)', collect, [])
        .option('--remove-sibling <id>', 'Remove sibling project (repeatable)', collect, [])
        .option('--add-term <id>', 'Add related term (repeatable)', collect, [])
        .option('--remove-term <id>', 'Remove related term (repeatable)', collect, [])
        .option('--active <bool>', 'Set active status (true/false)')
        .action(async (id, options) => {
            const context = await Context.create();
            if (!context.hasContext()) {
                print('Error: No .protokoll directory found.');
                process.exit(1);
            }
            await editProject(context, id, options);
        });
    
    cmd
        .command('delete <id>')
        .description('Delete a project')
        .option('-f, --force', 'Skip confirmation')
        .action(async (id, options) => {
            const context = await Context.create();
            await deleteEntity(context, 'project', id, options);
        });
    
    cmd
        .command('update <id> <source>')
        .description('Update project by regenerating metadata from URL or file')
        .option('--name <name>', 'Update project name')
        .action(async (id, source, cmdOptions) => {
            const context = await Context.create();
            if (!context.hasContext()) {
                print('Error: No .protokoll directory found. Run "protokoll --init-config" first.');
                process.exit(1);
            }
            await updateProject(context, id, source, cmdOptions);
        });
    
    return cmd;
};

// Helper function for collecting repeated options
function collect(value: string, previous: string[]): string[] {
    return previous.concat([value]);
}

/**
 * Create specialized term command with smart assistance options
 */
const createTermCommand = (): Command => {
    const cmd = new Command('term')
        .description('Manage terms');
    
    cmd
        .command('list')
        .description('List all terms')
        .option('-v, --verbose', 'Show full details')
        .action(async (options) => {
            const context = await Context.create();
            await listEntities(context, 'term', options);
        });
    
    cmd
        .command('show <id>')
        .description('Show details of a term (use ID or row number from list)')
        .action(async (id) => {
            const context = await Context.create();
            await showEntity(context, 'term', id);
        });
    
    cmd
        .command('add [source]')
        .description('Add a new term (optionally provide URL or file path for context)')
        .option('--term <name>', 'Term name')
        .option('--id <id>', 'Term ID (auto-calculated from name if not provided)')
        .option('--expansion <text>', 'Full expansion if acronym')
        .option('--domain <domain>', 'Domain category (e.g., devops, engineering)')
        .option('--description <text>', 'Term description (skips LLM generation if provided)')
        .option('--topics <keywords>', 'Comma-separated topic keywords (skips LLM generation if provided)')
        .option('--projects <ids>', 'Comma-separated project IDs to associate with')
        .option('--smart', 'Enable smart assistance (override config)')
        .option('--no-smart', 'Disable smart assistance (override config)')
        .action(async (source, cmdOptions) => {
            const context = await Context.create();
            if (!context.hasContext()) {
                print('Error: No .protokoll directory found. Run "protokoll --init-config" first.');
                process.exit(1);
            }
            await addTermEnhanced(context, { source, ...cmdOptions });
        });
    
    cmd
        .command('edit <id>')
        .description('Edit term fields (sounds_like, projects, metadata)')
        .option('--description <text>', 'Update description')
        .option('--domain <domain>', 'Update domain')
        .option('--expansion <text>', 'Update expansion')
        .option('--add-sound <variant>', 'Add sounds_like variant (repeatable)', collect, [])
        .option('--remove-sound <variant>', 'Remove sounds_like variant (repeatable)', collect, [])
        .option('--add-topic <topic>', 'Add topic (repeatable)', collect, [])
        .option('--remove-topic <topic>', 'Remove topic (repeatable)', collect, [])
        .option('--add-project <id>', 'Associate with project (repeatable)', collect, [])
        .option('--remove-project <id>', 'Remove project association (repeatable)', collect, [])
        .action(async (id, options) => {
            const context = await Context.create();
            if (!context.hasContext()) {
                print('Error: No .protokoll directory found.');
                process.exit(1);
            }
            await editTerm(context, id, options);
        });
    
    cmd
        .command('delete <id>')
        .description('Delete a term')
        .option('-f, --force', 'Skip confirmation')
        .action(async (id, options) => {
            const context = await Context.create();
            await deleteEntity(context, 'term', id, options);
        });
    
    cmd
        .command('merge <source-id> <target-id>')
        .description('Merge two terms (combines metadata, deletes source)')
        .option('-f, --force', 'Skip confirmation')
        .action(async (sourceId, targetId, options) => {
            const context = await Context.create();
            if (!context.hasContext()) {
                print('Error: No .protokoll directory found. Run "protokoll --init-config" first.');
                process.exit(1);
            }
            await mergeTerms(context, sourceId, targetId, options);
        });
    
    cmd
        .command('update <id> <source>')
        .description('Update term by regenerating metadata from URL or file')
        .option('--expansion <text>', 'Update expansion')
        .action(async (id, source, cmdOptions) => {
            const context = await Context.create();
            if (!context.hasContext()) {
                print('Error: No .protokoll directory found. Run "protokoll --init-config" first.');
                process.exit(1);
            }
            await updateTerm(context, id, source, cmdOptions);
        });
    
    return cmd;
};

/**
 * Register all context management subcommands
 */
export const registerContextCommands = (program: Command): void => {
    program.addCommand(createProjectCommand());
    program.addCommand(createEntityCommand('person', 'people', addPerson));
    program.addCommand(createTermCommand());
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
