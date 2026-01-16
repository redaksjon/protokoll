/**
 * Action CLI
 * 
 * Provides commands for performing actions on existing transcripts:
 * - combine: Merge multiple transcripts into a single document
 * - (future: split, archive, etc.)
 * 
 * The combine action preserves the timestamp of the first transcript
 * and can optionally change the project (with routing-aware relocation).
 */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as Context from '../context';
import * as Routing from '../routing';
import { Project } from '../context/types';

// Helper to print to stdout
const print = (text: string) => process.stdout.write(text + '\n');

/**
 * Parsed transcript structure
 */
export interface ParsedTranscript {
    filePath: string;
    title?: string;
    metadata: TranscriptMetadata;
    content: string;
    rawText: string;
}

export interface TranscriptMetadata {
    date?: string;
    time?: string;
    project?: string;
    projectId?: string;
    destination?: string;
    confidence?: string;
    signals?: string[];
    reasoning?: string;
    tags?: string[];
    duration?: string;
}

/**
 * Parse a transcript file into its components
 */
export const parseTranscript = async (filePath: string): Promise<ParsedTranscript> => {
    const rawText = await fs.readFile(filePath, 'utf-8');
    const lines = rawText.split('\n');
    
    const result: ParsedTranscript = {
        filePath,
        metadata: {},
        content: '',
        rawText,
    };
    
    let inMetadata = false;
    let inRouting = false;
    let contentStartIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Title detection (first # heading)
        if (!result.title && trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
            result.title = trimmed.slice(2).trim();
            continue;
        }
        
        // Metadata section start
        if (trimmed === '## Metadata') {
            inMetadata = true;
            continue;
        }
        
        // Routing subsection
        if (trimmed === '### Routing') {
            inRouting = true;
            continue;
        }
        
        // End of metadata section (horizontal rule)
        if (trimmed === '---' && inMetadata) {
            contentStartIndex = i + 1;
            inMetadata = false;
            inRouting = false;
            continue;
        }
        
        // Parse metadata fields
        if (inMetadata && trimmed.startsWith('**')) {
            const match = trimmed.match(/^\*\*([^*]+)\*\*:\s*(.*)$/);
            if (match) {
                const [, key, value] = match;
                const normalizedKey = key.toLowerCase().replace(/\s+/g, '');
                
                switch (normalizedKey) {
                    case 'date':
                        result.metadata.date = value;
                        break;
                    case 'time':
                        result.metadata.time = value;
                        break;
                    case 'project':
                        result.metadata.project = value;
                        break;
                    case 'projectid':
                        // Remove backticks from project ID
                        result.metadata.projectId = value.replace(/`/g, '');
                        break;
                    case 'destination':
                        result.metadata.destination = value;
                        break;
                    case 'confidence':
                        result.metadata.confidence = value;
                        break;
                    case 'reasoning':
                        result.metadata.reasoning = value;
                        break;
                    case 'tags':
                        // Parse tags from backtick-wrapped format
                        result.metadata.tags = value.match(/`([^`]+)`/g)?.map(t => t.replace(/`/g, '')) || [];
                        break;
                    case 'duration':
                        result.metadata.duration = value;
                        break;
                }
            }
        }
        
        // Parse classification signals (list items under routing)
        if (inRouting && trimmed.startsWith('- ') && !trimmed.startsWith('**')) {
            if (!result.metadata.signals) {
                result.metadata.signals = [];
            }
            result.metadata.signals.push(trimmed.slice(2));
        }
    }
    
    // Extract content after metadata
    if (contentStartIndex > 0) {
        // Skip empty lines after ---
        while (contentStartIndex < lines.length && lines[contentStartIndex].trim() === '') {
            contentStartIndex++;
        }
        result.content = lines.slice(contentStartIndex).join('\n').trim();
    } else {
        // No metadata section found, entire file is content
        result.content = rawText.trim();
    }
    
    return result;
};

/**
 * Extract the timestamp from a transcript filename
 * Expected format: DD-HHMM-subject.md (e.g., 15-1412-ne-4th-st-0.md)
 */
export const extractTimestampFromFilename = (filePath: string): { day: number; hour: number; minute: number } | null => {
    const basename = path.basename(filePath, '.md');
    const match = basename.match(/^(\d{1,2})-(\d{2})(\d{2})/);
    
    if (match) {
        return {
            day: parseInt(match[1], 10),
            hour: parseInt(match[2], 10),
            minute: parseInt(match[3], 10),
        };
    }
    
    return null;
};

/**
 * Format metadata as Markdown heading section (matching util/metadata.ts format)
 */
export const formatMetadataMarkdown = (
    title: string,
    metadata: TranscriptMetadata,
    project?: Project
): string => {
    const lines: string[] = [];
    
    // Title section
    lines.push(`# ${title}`);
    lines.push('');
    
    // Metadata frontmatter as readable markdown
    lines.push('## Metadata');
    lines.push('');
    
    // Date and Time
    if (metadata.date) {
        lines.push(`**Date**: ${metadata.date}`);
    }
    if (metadata.time) {
        lines.push(`**Time**: ${metadata.time}`);
    }
    
    lines.push('');
    
    // Project
    if (project) {
        lines.push(`**Project**: ${project.name}`);
        lines.push(`**Project ID**: \`${project.id}\``);
        lines.push('');
    } else if (metadata.project) {
        lines.push(`**Project**: ${metadata.project}`);
        if (metadata.projectId) {
            lines.push(`**Project ID**: \`${metadata.projectId}\``);
        }
        lines.push('');
    }
    
    // Routing Information
    if (metadata.destination) {
        lines.push('### Routing');
        lines.push('');
        lines.push(`**Destination**: ${metadata.destination}`);
        if (metadata.confidence) {
            lines.push(`**Confidence**: ${metadata.confidence}`);
        }
        lines.push('');
        
        if (metadata.signals && metadata.signals.length > 0) {
            lines.push('**Classification Signals**:');
            for (const signal of metadata.signals) {
                lines.push(`- ${signal}`);
            }
            lines.push('');
        }
        
        if (metadata.reasoning) {
            lines.push(`**Reasoning**: ${metadata.reasoning}`);
            lines.push('');
        }
    }
    
    // Tags
    if (metadata.tags && metadata.tags.length > 0) {
        lines.push('**Tags**: ' + metadata.tags.map(tag => `\`${tag}\``).join(', '));
        lines.push('');
    }
    
    // Duration
    if (metadata.duration) {
        lines.push(`**Duration**: ${metadata.duration}`);
        lines.push('');
    }
    
    // Separator
    lines.push('---');
    lines.push('');
    
    return lines.join('\n');
};

/**
 * Slugify a title for use in filenames
 */
export const slugifyTitle = (title: string): string => {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with dash
        .replace(/--+/g, '-')          // Collapse multiple dashes
        .replace(/^-|-$/g, '')         // Remove leading/trailing dashes
        .slice(0, 50);                 // Limit length
};

/**
 * Combine multiple transcripts into a single document
 */
export const combineTranscripts = async (
    filePaths: string[],
    options: {
        projectId?: string;
        title?: string;
        dryRun?: boolean;
        verbose?: boolean;
    } = {}
): Promise<{ outputPath: string; content: string }> => {
    if (filePaths.length === 0) {
        throw new Error('No transcript files provided');
    }
    
    // Parse all transcripts
    const transcripts: ParsedTranscript[] = [];
    for (const filePath of filePaths) {
        try {
            const parsed = await parseTranscript(filePath);
            transcripts.push(parsed);
        } catch (error) {
            throw new Error(`Failed to parse transcript: ${filePath} - ${error}`);
        }
    }
    
    // Sort by filename (which should be chronological due to timestamp prefix)
    transcripts.sort((a, b) => {
        const aName = path.basename(a.filePath);
        const bName = path.basename(b.filePath);
        return aName.localeCompare(bName);
    });
    
    // Use the first transcript's metadata as the base
    const firstTranscript = transcripts[0];
    const baseMetadata = { ...firstTranscript.metadata };
    
    // Load context to get project information if needed
    const context = await Context.create();
    let targetProject: Project | undefined;
    
    if (options.projectId) {
        targetProject = context.getProject(options.projectId);
        if (!targetProject) {
            throw new Error(`Project not found: ${options.projectId}`);
        }
        
        // Update metadata with new project
        baseMetadata.project = targetProject.name;
        baseMetadata.projectId = targetProject.id;
        
        // Update destination if project has routing configured
        if (targetProject.routing?.destination) {
            baseMetadata.destination = expandPath(targetProject.routing.destination);
        }
    }
    
    // Calculate combined duration if available
    let totalSeconds = 0;
    let hasDuration = false;
    for (const t of transcripts) {
        if (t.metadata.duration) {
            hasDuration = true;
            totalSeconds += parseDuration(t.metadata.duration);
        }
    }
    if (hasDuration && totalSeconds > 0) {
        baseMetadata.duration = formatDuration(totalSeconds);
    }
    
    // Combine tags from all transcripts (deduplicated)
    const allTags = new Set<string>();
    for (const t of transcripts) {
        if (t.metadata.tags) {
            for (const tag of t.metadata.tags) {
                allTags.add(tag);
            }
        }
    }
    if (allTags.size > 0) {
        baseMetadata.tags = Array.from(allTags).sort();
    }
    
    // Build combined title - use custom title if provided
    const combinedTitle = options.title 
        ? options.title
        : (firstTranscript.title 
            ? `${firstTranscript.title} (Combined)`
            : 'Combined Transcript');
    
    // Build combined content with section markers
    const contentParts: string[] = [];
    
    for (let i = 0; i < transcripts.length; i++) {
        const t = transcripts[i];
        const sectionTitle = t.title || `Part ${i + 1}`;
        const sourceFile = path.basename(t.filePath);
        
        contentParts.push(`## ${sectionTitle}`);
        contentParts.push(`*Source: ${sourceFile}*`);
        contentParts.push('');
        contentParts.push(t.content);
        contentParts.push('');
    }
    
    // Build final document
    const metadataSection = formatMetadataMarkdown(combinedTitle, baseMetadata, targetProject);
    const finalContent = metadataSection + contentParts.join('\n');
    
    // Determine output path
    let outputPath: string;
    
    if (targetProject?.routing?.destination) {
        // Build path using project routing configuration
        const routingConfig = buildRoutingConfig(context, targetProject);
        const routing = Routing.create(routingConfig, context);
        
        // Extract date from first transcript for routing
        const audioDate = extractDateFromMetadata(baseMetadata, firstTranscript.filePath);
        
        const routingContext: Routing.RoutingContext = {
            transcriptText: finalContent,
            audioDate,
            sourceFile: firstTranscript.filePath,
        };
        
        const decision = routing.route(routingContext);
        outputPath = routing.buildOutputPath(decision, routingContext);
    } else {
        // Use the directory of the first transcript with a new filename
        const firstDir = path.dirname(firstTranscript.filePath);
        const timestamp = extractTimestampFromFilename(firstTranscript.filePath);
        
        // Use slugified custom title if provided, otherwise "combined"
        const filenameSuffix = options.title 
            ? slugifyTitle(options.title)
            : 'combined';
        
        if (timestamp) {
            const day = timestamp.day.toString().padStart(2, '0');
            const hour = timestamp.hour.toString().padStart(2, '0');
            const minute = timestamp.minute.toString().padStart(2, '0');
            outputPath = path.join(firstDir, `${day}-${hour}${minute}-${filenameSuffix}.md`);
        } else {
            outputPath = path.join(firstDir, `${filenameSuffix}.md`);
        }
    }
    
    return { outputPath, content: finalContent };
};

/**
 * Build a routing config from context and project
 */
const buildRoutingConfig = (
    context: Context.ContextInstance,
    _targetProject: Project
): Routing.RoutingConfig => {
    const config = context.getConfig();
    const defaultPath = expandPath((config.outputDirectory as string) || '~/notes');
    
    // Build project routes from all projects
    const projects: Routing.ProjectRoute[] = context.getAllProjects()
        .filter(p => p.active !== false)
        .map(p => ({
            projectId: p.id,
            destination: {
                path: expandPath(p.routing?.destination || defaultPath),
                structure: p.routing?.structure || 'month',
                filename_options: p.routing?.filename_options || ['date', 'time', 'subject'],
            },
            classification: p.classification,
            auto_tags: p.routing?.auto_tags,
        }));
    
    return {
        default: {
            path: defaultPath,
            structure: (config.outputStructure as Routing.FilesystemStructure) || 'month',
            filename_options: (config.outputFilenameOptions as Routing.FilenameOption[]) || ['date', 'time', 'subject'],
        },
        projects,
        conflict_resolution: 'primary',
    };
};

/**
 * Extract date from metadata or filename
 */
const extractDateFromMetadata = (metadata: TranscriptMetadata, filePath: string): Date => {
    // Try to parse from metadata date string
    if (metadata.date) {
        const parsed = new Date(metadata.date);
        if (!isNaN(parsed.getTime())) {
            // Add time if available
            if (metadata.time) {
                const timeMatch = metadata.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
                if (timeMatch) {
                    let hours = parseInt(timeMatch[1], 10);
                    const minutes = parseInt(timeMatch[2], 10);
                    const ampm = timeMatch[3]?.toUpperCase();
                    
                    if (ampm === 'PM' && hours < 12) hours += 12;
                    if (ampm === 'AM' && hours === 12) hours = 0;
                    
                    parsed.setHours(hours, minutes);
                }
            }
            return parsed;
        }
    }
    
    // Fall back to extracting from directory structure and filename
    // Expected path: .../2026/1/15-1412-subject.md
    const parts = filePath.split(path.sep);
    
    // Look for year/month in path
    let year = new Date().getFullYear();
    let month = new Date().getMonth();
    
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const num = parseInt(part, 10);
        if (num >= 2000 && num <= 2100) {
            year = num;
            // Next part might be month
            if (i + 1 < parts.length - 1) {
                const nextNum = parseInt(parts[i + 1], 10);
                if (nextNum >= 1 && nextNum <= 12) {
                    month = nextNum - 1; // 0-indexed
                }
            }
        }
    }
    
    // Extract day and time from filename
    const timestamp = extractTimestampFromFilename(filePath);
    const day = timestamp?.day || 1;
    const hour = timestamp?.hour || 0;
    const minute = timestamp?.minute || 0;
    
    return new Date(year, month, day, hour, minute);
};

/**
 * Parse duration string to seconds
 */
const parseDuration = (duration: string): number => {
    let seconds = 0;
    
    const minuteMatch = duration.match(/(\d+)m/);
    const secondMatch = duration.match(/(\d+)s/);
    
    if (minuteMatch) {
        seconds += parseInt(minuteMatch[1], 10) * 60;
    }
    if (secondMatch) {
        seconds += parseInt(secondMatch[1], 10);
    }
    
    return seconds;
};

/**
 * Format seconds as duration string
 */
const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    
    if (minutes === 0) {
        return `${secs}s`;
    }
    if (secs === 0) {
        return `${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
};

/**
 * Expand ~ to home directory
 */
const expandPath = (p: string): string => {
    if (p.startsWith('~')) {
        return path.join(os.homedir(), p.slice(1));
    }
    return p;
};

/**
 * Parse file paths from the combine argument
 * Supports newline-separated paths (from command line) or array
 */
export const parseFilePaths = (input: string): string[] => {
    // Split by newlines and filter empty lines
    return input
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
};

/**
 * Edit a single transcript - update title and/or project
 */
export const editTranscript = async (
    filePath: string,
    options: {
        title?: string;
        projectId?: string;
        dryRun?: boolean;
        verbose?: boolean;
    }
): Promise<{ outputPath: string; content: string }> => {
    // Parse the existing transcript
    const transcript = await parseTranscript(filePath);
    
    // Load context if we need project info
    const context = await Context.create();
    let targetProject: Project | undefined;
    
    if (options.projectId) {
        targetProject = context.getProject(options.projectId);
        if (!targetProject) {
            throw new Error(`Project not found: ${options.projectId}`);
        }
    }
    
    // Use new title if provided, otherwise keep existing
    const newTitle = options.title || transcript.title || 'Untitled';
    
    // Update metadata
    const updatedMetadata = { ...transcript.metadata };
    
    if (targetProject) {
        updatedMetadata.project = targetProject.name;
        updatedMetadata.projectId = targetProject.id;
        if (targetProject.routing?.destination) {
            updatedMetadata.destination = expandPath(targetProject.routing.destination);
        }
    }
    
    // Build the updated document
    const metadataSection = formatMetadataMarkdown(newTitle, updatedMetadata, targetProject);
    const finalContent = metadataSection + transcript.content;
    
    // Determine output path
    let outputPath: string;
    
    if (targetProject?.routing?.destination) {
        // Build path using project routing configuration
        const routingConfig = buildRoutingConfig(context, targetProject);
        const routing = Routing.create(routingConfig, context);
        
        const audioDate = extractDateFromMetadata(updatedMetadata, filePath);
        
        const routingContext: Routing.RoutingContext = {
            transcriptText: finalContent,
            audioDate,
            sourceFile: filePath,
        };
        
        const decision = routing.route(routingContext);
        
        // If we have a custom title, override the filename with slugified title
        if (options.title) {
            const basePath = path.dirname(routing.buildOutputPath(decision, routingContext));
            const timestamp = extractTimestampFromFilename(filePath);
            const sluggedTitle = slugifyTitle(options.title);
            
            if (timestamp) {
                const day = timestamp.day.toString().padStart(2, '0');
                const hour = timestamp.hour.toString().padStart(2, '0');
                const minute = timestamp.minute.toString().padStart(2, '0');
                outputPath = path.join(basePath, `${day}-${hour}${minute}-${sluggedTitle}.md`);
            } else {
                outputPath = path.join(basePath, `${sluggedTitle}.md`);
            }
        } else {
            outputPath = routing.buildOutputPath(decision, routingContext);
        }
    } else {
        // Keep in same directory, potentially with new filename
        const dir = path.dirname(filePath);
        const timestamp = extractTimestampFromFilename(filePath);
        
        if (options.title) {
            const sluggedTitle = slugifyTitle(options.title);
            if (timestamp) {
                const day = timestamp.day.toString().padStart(2, '0');
                const hour = timestamp.hour.toString().padStart(2, '0');
                const minute = timestamp.minute.toString().padStart(2, '0');
                outputPath = path.join(dir, `${day}-${hour}${minute}-${sluggedTitle}.md`);
            } else {
                outputPath = path.join(dir, `${sluggedTitle}.md`);
            }
        } else {
            // Keep original filename
            outputPath = filePath;
        }
    }
    
    return { outputPath, content: finalContent };
};

/**
 * Execute the action command
 */
const executeAction = async (
    file: string | undefined,
    options: { 
        project?: string; 
        title?: string; 
        combine?: string;
        dryRun?: boolean; 
        verbose?: boolean;
    }
) => {
    // Determine mode: combine or edit
    if (options.combine) {
        // Combine mode
        const filePaths = parseFilePaths(options.combine);
        
        if (filePaths.length === 0) {
            print('Error: No transcript files provided for --combine.');
            process.exit(1);
        }
        
        if (filePaths.length === 1) {
            print('Error: At least 2 transcript files are required for --combine.');
            process.exit(1);
        }
        
        // Validate all files exist
        for (const filePath of filePaths) {
            try {
                await fs.access(filePath);
            } catch {
                print(`Error: File not found: ${filePath}`);
                process.exit(1);
            }
        }
        
        if (options.verbose) {
            print(`\n[Combining ${filePaths.length} transcripts]`);
            for (const fp of filePaths) {
                print(`  - ${fp}`);
            }
            if (options.project) {
                print(`\nTarget project: ${options.project}`);
            }
            if (options.title) {
                print(`\nCustom title: ${options.title}`);
            }
            print('');
        }
        
        try {
            const result = await combineTranscripts(filePaths, {
                projectId: options.project,
                title: options.title,
                dryRun: options.dryRun,
                verbose: options.verbose,
            });
            
            if (options.dryRun) {
                print('[Dry Run] Would create combined transcript:');
                print(`  Output: ${result.outputPath}`);
                print(`  Size: ${result.content.length} characters`);
                print('');
                print('[Dry Run] Would delete source files:');
                for (const fp of filePaths) {
                    print(`  - ${fp}`);
                }
                if (options.verbose) {
                    print('\n--- Preview (first 500 chars) ---');
                    print(result.content.slice(0, 500));
                    print('...');
                }
            } else {
                // Ensure output directory exists
                await fs.mkdir(path.dirname(result.outputPath), { recursive: true });
                
                // Write the combined transcript
                await fs.writeFile(result.outputPath, result.content, 'utf-8');
                print(`Combined transcript created: ${result.outputPath}`);
                
                // Automatically delete source files when combining
                if (options.verbose) {
                    print('\nDeleting source files...');
                }
                for (const fp of filePaths) {
                    try {
                        await fs.unlink(fp);
                        if (options.verbose) {
                            print(`  Deleted: ${fp}`);
                        }
                    } catch (error) {
                        print(`  Warning: Could not delete ${fp}: ${error}`);
                    }
                }
                print(`Deleted ${filePaths.length} source files.`);
            }
        } catch (error) {
            print(`Error: ${error instanceof Error ? error.message : error}`);
            process.exit(1);
        }
    } else if (file) {
        // Edit mode - single file
        if (!options.title && !options.project) {
            print('Error: Must specify --title and/or --project when editing a single file.');
            process.exit(1);
        }
        
        // Validate file exists
        try {
            await fs.access(file);
        } catch {
            print(`Error: File not found: ${file}`);
            process.exit(1);
        }
        
        if (options.verbose) {
            print(`\n[Editing transcript]`);
            print(`  File: ${file}`);
            if (options.title) {
                print(`  New title: ${options.title}`);
            }
            if (options.project) {
                print(`  New project: ${options.project}`);
            }
            print('');
        }
        
        try {
            const result = await editTranscript(file, {
                title: options.title,
                projectId: options.project,
                dryRun: options.dryRun,
                verbose: options.verbose,
            });
            
            const isRename = result.outputPath !== file;
            
            if (options.dryRun) {
                print('[Dry Run] Would update transcript:');
                if (isRename) {
                    print(`  From: ${file}`);
                    print(`  To: ${result.outputPath}`);
                } else {
                    print(`  File: ${result.outputPath}`);
                }
                print(`  Size: ${result.content.length} characters`);
                if (options.verbose) {
                    print('\n--- Preview (first 500 chars) ---');
                    print(result.content.slice(0, 500));
                    print('...');
                }
            } else {
                // Ensure output directory exists
                await fs.mkdir(path.dirname(result.outputPath), { recursive: true });
                
                // Write the updated transcript
                await fs.writeFile(result.outputPath, result.content, 'utf-8');
                
                // Delete original if renamed
                if (isRename) {
                    await fs.unlink(file);
                    print(`Transcript updated and renamed:`);
                    print(`  From: ${file}`);
                    print(`  To: ${result.outputPath}`);
                } else {
                    print(`Transcript updated: ${result.outputPath}`);
                }
            }
        } catch (error) {
            print(`Error: ${error instanceof Error ? error.message : error}`);
            process.exit(1);
        }
    } else {
        print('Error: Must specify either a file to edit or --combine with files to combine.');
        print('');
        print('Usage:');
        print('  protokoll action --title "New Title" /path/to/file.md');
        print('  protokoll action --combine "/path/to/file1.md\\n/path/to/file2.md"');
        process.exit(1);
    }
};

/**
 * Register the action command
 */
export const registerActionCommands = (program: Command): void => {
    const actionCmd = new Command('action')
        .description('Edit a single transcript or combine multiple transcripts')
        .argument('[file]', 'Transcript file to edit (when not using --combine)')
        .option('-t, --title <title>', 'Set a custom title (also affects filename)')
        .option('-p, --project <projectId>', 'Change to a different project (updates metadata and routing)')
        .option('-c, --combine <files>', 'Combine multiple files (newline-separated list)')
        .option('--dry-run', 'Show what would happen without making changes')
        .option('-v, --verbose', 'Show detailed output')
        .action(executeAction);
    
    program.addCommand(actionCmd);
};
