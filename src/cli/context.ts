/**
 * Context Management CLI
 * 
 * Provides commands for listing, viewing, adding, editing, and deleting
 * context entities (projects, people, terms, companies).
 */

import { Command } from 'commander';
import * as readline from 'readline';
import * as yaml from 'js-yaml';
import * as Context from '../context';
import { Entity, Person, Project, Company, Term, IgnoredTerm, EntityType } from '../context/types';

// Helper to print to stdout
const print = (text: string) => process.stdout.write(text + '\n');

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
    
    for (const entity of entities.sort((a, b) => a.name.localeCompare(b.name))) {
        if (options.verbose) {
            print('─'.repeat(60));
            print(formatEntity(entity, true));
        } else {
            print(`  ${formatEntity(entity)}`);
        }
    }
    print('');
};

/**
 * Show a specific entity
 */
const showEntity = async (
    context: Context.ContextInstance,
    type: EntityType,
    id: string
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
    
    print(`\n${type.charAt(0).toUpperCase() + type.slice(1)}: ${entity.name}\n`);
    print(yaml.dump(entity, { lineWidth: -1 }));
    
    const filePath = context.getEntityFilePath(entity);
    if (filePath) {
        print(`File: ${filePath}`);
    }
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
 * Interactive prompts for adding a project
 */
const addProject = async (context: Context.ContextInstance): Promise<void> => {
    const rl = createReadline();
    
    try {
        print('\n[Add New Project]\n');
        
        const name = await askQuestion(rl, 'Project name: ');
        if (!name) {
            print('Name is required. Aborting.');
            return;
        }
        
        const id = await askQuestion(rl, `ID (Enter for "${name.toLowerCase().replace(/\s+/g, '-')}"): `);
        const finalId = id || name.toLowerCase().replace(/\s+/g, '-');
        
        if (context.getProject(finalId)) {
            print(`Error: Project with ID "${finalId}" already exists.`);
            return;
        }
        
        const destination = await askQuestion(rl, 'Output destination path: ');
        const structure = await askQuestion(rl, 'Directory structure (none/year/month/day, Enter for month): ');
        const contextType = await askQuestion(rl, 'Context type (work/personal/mixed, Enter for work): ');
        const phrasesStr = await askQuestion(rl, 'Trigger phrases (comma-separated): ');
        const topicsStr = await askQuestion(rl, 'Topic keywords (comma-separated, Enter to skip): ');
        const description = await askQuestion(rl, 'Description (Enter to skip): ');
        
        const project: Project = {
            id: finalId,
            name,
            type: 'project',
            classification: {
                context_type: (contextType || 'work') as 'work' | 'personal' | 'mixed',
                explicit_phrases: phrasesStr ? phrasesStr.split(',').map(s => s.trim()) : [],
                ...(topicsStr && { topics: topicsStr.split(',').map(s => s.trim()) }),
            },
            routing: {
                destination: destination || '~/notes',
                structure: (structure || 'month') as 'none' | 'year' | 'month' | 'day',
                filename_options: ['date', 'time', 'subject'],
            },
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
        .description(`Show details of a ${type}`)
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
 * Register all context management subcommands
 */
export const registerContextCommands = (program: Command): void => {
    program.addCommand(createEntityCommand('project', 'projects', addProject));
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
