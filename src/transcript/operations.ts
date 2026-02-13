/**
 * Transcript Operations
 * 
 * Core business logic for transcript parsing, listing, editing, and combining.
 * Extracted from CLI modules to provide reusable functions for MCP tools.
 */

import * as fs from 'fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import * as Context from '../context';
import * as Routing from '../routing';
import * as Metadata from '../util/metadata';
import * as Frontmatter from '../util/frontmatter';
import { Project } from '../context/types';
import { findProjectResilient } from '../utils/entityFinder';
import { isPklFile, isMdFile, getTranscriptGlobPattern } from './format-adapter';
import { PklTranscript } from '@redaksjon/protokoll-format';

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
 * Now uses YAML frontmatter format instead of legacy ## Metadata format
 */
export const parseTranscript = async (filePath: string): Promise<ParsedTranscript> => {
    const rawText = await fs.readFile(filePath, 'utf-8');
    
    // Use the frontmatter parser which handles both new and legacy formats
    const parsed = Frontmatter.parseTranscriptContent(rawText);
    
    const result: ParsedTranscript = {
        filePath,
        title: parsed.metadata.title,
        metadata: {
            date: parsed.metadata.date?.toISOString().split('T')[0],
            time: parsed.metadata.recordingTime,
            project: parsed.metadata.project,
            projectId: parsed.metadata.projectId,
            destination: parsed.metadata.routing?.destination,
            confidence: parsed.metadata.routing?.confidence?.toString(),
            signals: parsed.metadata.routing?.signals?.map(s => 
                `${s.type}: ${s.value} (weight: ${s.weight})`
            ),
            reasoning: parsed.metadata.routing?.reasoning,
            tags: parsed.metadata.tags,
            duration: parsed.metadata.duration,
        },
        content: parsed.body,
        rawText,
    };
    
    return result;
};

/**
 * Extract the timestamp from a transcript filename
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
 * Slugify a title for use in filenames
 */
export const slugifyTitle = (title: string): string => {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/--+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
};

/**
 * Parse duration string to seconds
 */
const parseDuration = (duration: string): number => {
    const match = duration.match(/(\d+):(\d+)/);
    if (match) {
        const [, minutes, seconds] = match;
        return parseInt(minutes, 10) * 60 + parseInt(seconds, 10);
    }
    return 0;
};

/**
 * Format seconds as duration string
 */
const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Expand ~ in paths
 */
const expandPath = (p: string): string => {
    if (p.startsWith('~')) {
        return path.join(process.env.HOME || '', p.slice(1));
    }
    return p;
};

/**
 * Extract date from metadata
 */
const extractDateFromMetadata = (metadata: TranscriptMetadata, filePath: string): Date => {
    if (metadata.date) {
        return new Date(metadata.date);
    }
    const timestamp = extractTimestampFromFilename(filePath);
    if (timestamp) {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), timestamp.day, timestamp.hour, timestamp.minute);
    }
    return new Date();
};

/**
 * Build routing config from context and project
 */
const buildRoutingConfig = (
    context: Context.ContextInstance,
    _targetProject: Project
): Routing.RoutingConfig => {
    const config = context.getConfig();
    const defaultPath = expandPath((config.outputDirectory as string) || '~/notes');
    
    const resolveRoutingPath = (routingPath: string | undefined): string => {
        if (!routingPath) {
            return defaultPath;
        }
        const expanded = expandPath(routingPath);
        if (!expanded.startsWith('/') && !expanded.match(/^[A-Za-z]:/)) {
            return path.resolve(defaultPath, expanded);
        }
        return expanded;
    };

    return {
        default: {
            path: resolveRoutingPath(undefined),
            structure: 'month',
            filename_options: ['date', 'time', 'subject'],
        },
        projects: context.getAllProjects()
            .filter(p => p.active !== false)
            .map(p => ({
                projectId: p.id,
                destination: {
                    path: resolveRoutingPath(p.routing?.destination),
                    structure: p.routing?.structure || 'month',
                    filename_options: p.routing?.filename_options || ['date', 'time', 'subject'],
                },
                classification: p.classification,
                // priority: p.priority, // Not in Project type
                active: p.active,
            })),
        conflict_resolution: 'primary' as const,
    };
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
        contextDirectory?: string;
        /** Explicit context directories (from protokoll-config.yaml) */
        contextDirectories?: string[];
    } = {}
): Promise<{ outputPath: string; content: string }> => {
    if (filePaths.length === 0) {
        throw new Error('No transcript files provided');
    }
    
    const transcripts: ParsedTranscript[] = [];
    for (const filePath of filePaths) {
        try {
            const parsed = await parseTranscript(filePath);
            transcripts.push(parsed);
        } catch (error) {
            throw new Error(`Failed to parse transcript: ${filePath} - ${error}`);
        }
    }
    
    transcripts.sort((a, b) => {
        const aName = path.basename(a.filePath);
        const bName = path.basename(b.filePath);
        return aName.localeCompare(bName);
    });
    
    const firstTranscript = transcripts[0];
    const baseMetadata = { ...firstTranscript.metadata };
    
    // Use explicit contextDirectories from options if provided (from protokoll-config.yaml)
    const context = await Context.create({
        startingDir: options.contextDirectory || path.dirname(firstTranscript.filePath),
        contextDirectories: options.contextDirectories,
    });
    let targetProject: Project | undefined;
    
    if (options.projectId) {
        targetProject = findProjectResilient(context, options.projectId);
        baseMetadata.project = targetProject.name;
        baseMetadata.projectId = targetProject.id;
        
        if (targetProject.routing?.destination) {
            const config = context.getConfig();
            const defaultPath = expandPath((config.outputDirectory as string) || '~/notes');
            const routingPath = expandPath(targetProject.routing.destination);
            const resolvedPath = !routingPath.startsWith('/') && !routingPath.match(/^[A-Za-z]:/)
                ? path.resolve(defaultPath, routingPath)
                : routingPath;
            baseMetadata.destination = resolvedPath;
        }
    }
    
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
    
    const combinedTitle = options.title 
        ? options.title
        : (firstTranscript.title 
            ? `${firstTranscript.title} (Combined)`
            : 'Combined Transcript');
    
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
    
    const fullMetadata: Metadata.TranscriptMetadata = {
        title: combinedTitle,
        date: baseMetadata.date ? new Date(baseMetadata.date) : undefined,
        recordingTime: baseMetadata.time,
        project: targetProject?.name || baseMetadata.project,
        projectId: targetProject?.id || baseMetadata.projectId,
        tags: baseMetadata.tags,
        duration: baseMetadata.duration,
        entities: targetProject ? {
            people: [],
            projects: [{
                id: targetProject.id,
                name: targetProject.name,
                type: 'project' as const,
            }],
            terms: [],
            companies: [],
        } : undefined,
        status: 'reviewed' as const,
    };
    
    const combinedContent = contentParts.join('\n');
    const finalContent = Frontmatter.stringifyTranscript(fullMetadata, combinedContent);
    
    let outputPath: string;
    
    if (targetProject?.routing?.destination) {
        const routingConfig = buildRoutingConfig(context, targetProject);
        const routing = Routing.create(routingConfig, context);
        
        const audioDate = extractDateFromMetadata(baseMetadata, firstTranscript.filePath);
        
        const routingContext: Routing.RoutingContext = {
            transcriptText: finalContent,
            audioDate,
            sourceFile: firstTranscript.filePath,
        };
        
        const decision = routing.route(routingContext);
        outputPath = routing.buildOutputPath(decision, routingContext);
    } else {
        const firstDir = path.dirname(firstTranscript.filePath);
        const timestamp = extractTimestampFromFilename(firstTranscript.filePath);
        
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
 * Edit transcript metadata and content
 */
export const editTranscript = async (
    filePath: string,
    options: {
        title?: string;
        projectId?: string;
        tagsToAdd?: string[];
        tagsToRemove?: string[];
        dryRun?: boolean;
        verbose?: boolean;
        contextDirectory?: string;
        /** Explicit context directories (from protokoll-config.yaml) */
        contextDirectories?: string[];
    }
): Promise<{ outputPath: string; content: string }> => {
    const transcript = await parseTranscript(filePath);
    
    // Use explicit contextDirectories from options if provided (from protokoll-config.yaml)
    const context = await Context.create({
        startingDir: options.contextDirectory || path.dirname(filePath),
        contextDirectories: options.contextDirectories,
    });
    let targetProject: Project | undefined;
    
    if (options.projectId) {
        targetProject = findProjectResilient(context, options.projectId);
    }
    
    const newTitle = options.title || transcript.title || 'Untitled';
    const updatedMetadata = { ...transcript.metadata };
    
    if (targetProject) {
        updatedMetadata.project = targetProject.name;
        updatedMetadata.projectId = targetProject.id;
        if (targetProject.routing?.destination) {
            const config = context.getConfig();
            const defaultPath = expandPath((config.outputDirectory as string) || '~/notes');
            const routingPath = expandPath(targetProject.routing.destination);
            const resolvedPath = !routingPath.startsWith('/') && !routingPath.match(/^[A-Za-z]:/)
                ? path.resolve(defaultPath, routingPath)
                : routingPath;
            updatedMetadata.destination = resolvedPath;
        }
    }
    
    if (options.tagsToAdd || options.tagsToRemove) {
        const currentTags = new Set(updatedMetadata.tags || []);
        
        if (options.tagsToRemove) {
            for (const tag of options.tagsToRemove) {
                currentTags.delete(tag);
            }
        }
        
        if (options.tagsToAdd) {
            for (const tag of options.tagsToAdd) {
                currentTags.add(tag);
            }
        }
        
        updatedMetadata.tags = Array.from(currentTags).sort();
    }
    
    const parsed = Frontmatter.parseTranscriptContent(transcript.rawText);
    const existingEntities = parsed.metadata.entities;
    
    let updatedEntities = existingEntities;
    if (options.projectId && targetProject) {
        updatedEntities = {
            people: existingEntities?.people || [],
            projects: [{
                id: targetProject.id,
                name: targetProject.name,
                type: 'project' as const,
            }],
            terms: existingEntities?.terms || [],
            companies: existingEntities?.companies || [],
        };
    }
    
    const entitiesToInclude = updatedEntities || existingEntities;
    
    const entityRefsIndex = transcript.rawText.indexOf('## Entity References');
    let contentWithoutEntityRefs: string;
    
    if (entityRefsIndex >= 0) {
        const metadataEndIndex = transcript.rawText.indexOf('---');
        if (metadataEndIndex >= 0) {
            let contentStart = metadataEndIndex + '---'.length;
            while (contentStart < transcript.rawText.length && 
                   (transcript.rawText[contentStart] === '\n' || 
                    transcript.rawText[contentStart] === '\r' || 
                    transcript.rawText[contentStart] === ' ')) {
                contentStart++;
            }
            contentWithoutEntityRefs = transcript.rawText
                .substring(contentStart, entityRefsIndex)
                .trimEnd();
        } else {
            const contentEndIndex = transcript.content.indexOf('## Entity References');
            contentWithoutEntityRefs = contentEndIndex >= 0 
                ? transcript.content.substring(0, contentEndIndex).trimEnd()
                : transcript.content;
        }
    } else {
        contentWithoutEntityRefs = transcript.content;
    }
    
    const fullMetadata: Metadata.TranscriptMetadata = {
        ...parsed.metadata,
        title: newTitle,
        entities: entitiesToInclude,
        date: parsed.metadata.date || (updatedMetadata.date ? new Date(updatedMetadata.date) : undefined),
        recordingTime: parsed.metadata.recordingTime || updatedMetadata.time,
        project: parsed.metadata.project || updatedMetadata.project,
        projectId: parsed.metadata.projectId || updatedMetadata.projectId,
        tags: parsed.metadata.tags || updatedMetadata.tags,
        duration: parsed.metadata.duration || updatedMetadata.duration,
        status: parsed.metadata.status || 'reviewed',
    };
    
    if (targetProject) {
        fullMetadata.project = targetProject.name;
        fullMetadata.projectId = targetProject.id;
    }
    
    if (options.tagsToAdd || options.tagsToRemove) {
        fullMetadata.tags = updatedMetadata.tags;
    }
    
    const finalContent = Frontmatter.stringifyTranscript(fullMetadata, contentWithoutEntityRefs);
    
    let outputPath: string;
    
    if (targetProject?.routing?.destination) {
        const routingConfig = buildRoutingConfig(context, targetProject);
        const routing = Routing.create(routingConfig, context);
        
        const audioDate = extractDateFromMetadata(updatedMetadata, filePath);
        
        const routingContext: Routing.RoutingContext = {
            transcriptText: finalContent,
            audioDate,
            sourceFile: filePath,
        };
        
        const decision = routing.route(routingContext);
        
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
            outputPath = filePath;
        }
    }
    
    return { outputPath, content: finalContent };
};

/**
 * Transcript list item
 */
export interface TranscriptListItem {
    path: string;
    filename: string;
    date: string;
    time?: string;
    title: string;
    hasRawTranscript: boolean;
    createdAt: Date;
    status?: 'initial' | 'enhanced' | 'reviewed' | 'in_progress' | 'closed' | 'archived';
    openTasksCount?: number;
    contentSize?: number;
    entities?: {
        people?: Array<{ id: string; name: string }>;
        projects?: Array<{ id: string; name: string }>;
        terms?: Array<{ id: string; name: string }>;
        companies?: Array<{ id: string; name: string }>;
    };
}

export interface ListTranscriptsOptions {
    directory: string;
    limit?: number;
    offset?: number;
    sortBy?: 'date' | 'filename' | 'title';
    startDate?: string;
    endDate?: string;
    search?: string;
    projectId?: string;
}

export interface ListTranscriptsResult {
    transcripts: TranscriptListItem[];
    total: number;
    hasMore: boolean;
    limit: number;
    offset: number;
}

/**
 * Get raw transcript path
 */
const getRawTranscriptPath = (finalPath: string): string => {
    const dir = path.dirname(finalPath);
    const basename = path.basename(finalPath, path.extname(finalPath));
    return path.join(dir, '.transcript', `${basename}.json`);
};

/**
 * Check if raw transcript exists
 */
const hasRawTranscript = async (finalPath: string): Promise<boolean> => {
    try {
        await fs.access(getRawTranscriptPath(finalPath));
        return true;
    } catch {
        return false;
    }
};

/**
 * Extract title from content
 */
const extractTitle = (content: string): string => {
    const match = content.match(/^#\s+(.+)$/m);
    if (match) {
        return match[1].trim();
    }
    const firstLine = content.split('\n')[0];
    return firstLine ? firstLine.trim().substring(0, 100) : 'Untitled';
};

/**
 * Extract date from filename
 */
const extractDateTimeFromFilename = (filename: string): { date: string; time?: string } | null => {
    const withTimeMatch = filename.match(/(\d{4}-\d{2}-\d{2})-(\d{4})/);
    if (withTimeMatch) {
        const [, date, time] = withTimeMatch;
        const hours = time.substring(0, 2);
        const minutes = time.substring(2, 4);
        return { date, time: `${hours}:${minutes}` };
    }
    
    const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
        return { date: dateMatch[1] };
    }
    
    return null;
};

/**
 * List transcripts with filtering and pagination
 */
export const listTranscripts = async (options: ListTranscriptsOptions): Promise<ListTranscriptsResult> => {
    const {
        directory,
        limit = 50,
        offset = 0,
        sortBy = 'date',
        startDate,
        endDate,
        search,
        projectId,
    } = options;
    
    const absoluteDir = path.isAbsolute(directory) 
        ? directory 
        : path.resolve(process.cwd(), directory);
    
    // Find both .md and .pkl transcript files
    const pattern = path.join(absoluteDir, getTranscriptGlobPattern());
    const files = await glob(pattern, { ignore: ['**/node_modules/**', '**/.transcript/**'] });
    
    const transcripts: TranscriptListItem[] = [];
    
    for (const file of files) {
        try {
            const stats = await fs.stat(file);
            
            // Handle .pkl files
            if (isPklFile(file)) {
                const transcript = PklTranscript.open(file, { readOnly: true });
                try {
                    const pklMetadata = transcript.metadata;
                    const content = transcript.content;
                    
                    const dateTime = extractDateTimeFromFilename(path.basename(file));
                    const date = dateTime?.date || (pklMetadata.date instanceof Date 
                        ? pklMetadata.date.toISOString().split('T')[0] 
                        : '') || '';
                    
                    if (startDate && date < startDate) continue;
                    if (endDate && date > endDate) continue;
                    
                    if (projectId && pklMetadata.projectId !== projectId) continue;
                    
                    if (search) {
                        const searchLower = search.toLowerCase();
                        const title = (pklMetadata.title || '').toLowerCase();
                        if (!title.includes(searchLower) && !content.toLowerCase().includes(searchLower)) {
                            continue;
                        }
                    }
                    
                    const openTasks = pklMetadata.tasks?.filter(t => t.status === 'open').length || 0;
                    
                    transcripts.push({
                        path: file,
                        filename: path.basename(file),
                        date,
                        time: dateTime?.time || pklMetadata.recordingTime,
                        title: pklMetadata.title || extractTitle(content),
                        hasRawTranscript: transcript.hasRawTranscript,
                        createdAt: stats.birthtime,
                        status: pklMetadata.status,
                        openTasksCount: openTasks,
                        contentSize: content.length,
                        entities: pklMetadata.entities,
                    });
                } finally {
                    transcript.close();
                }
                continue;
            }
            
            // Handle .md files with existing logic
            if (!isMdFile(file)) {
                continue;
            }
            
            const content = await fs.readFile(file, 'utf-8');
            const parsed = Frontmatter.parseTranscriptContent(content);
            
            const dateTime = extractDateTimeFromFilename(path.basename(file));
            const date = dateTime?.date || parsed.metadata.date?.toISOString().split('T')[0] || '';
            
            if (startDate && date < startDate) continue;
            if (endDate && date > endDate) continue;
            
            if (projectId && parsed.metadata.projectId !== projectId) continue;
            
            if (search) {
                const searchLower = search.toLowerCase();
                const title = extractTitle(content).toLowerCase();
                if (!title.includes(searchLower) && !content.toLowerCase().includes(searchLower)) {
                    continue;
                }
            }
            
            const openTasks = parsed.metadata.tasks?.filter(t => !t.completed).length || 0;
            
            transcripts.push({
                path: file,
                filename: path.basename(file),
                date,
                time: dateTime?.time || parsed.metadata.recordingTime,
                title: parsed.metadata.title || extractTitle(content),
                hasRawTranscript: await hasRawTranscript(file),
                createdAt: stats.birthtime,
                status: parsed.metadata.status,
                openTasksCount: openTasks,
                contentSize: content.length,
                entities: parsed.metadata.entities,
            });
        } catch {
            // Skip files that can't be parsed
            continue;
        }
    }
    
    // Sort
    transcripts.sort((a, b) => {
        if (sortBy === 'date') {
            return b.date.localeCompare(a.date);
        } else if (sortBy === 'filename') {
            return a.filename.localeCompare(b.filename);
        } else {
            return a.title.localeCompare(b.title);
        }
    });
    
    const total = transcripts.length;
    const paginatedTranscripts = transcripts.slice(offset, offset + limit);
    
    return {
        transcripts: paginatedTranscripts,
        total,
        hasMore: offset + limit < total,
        limit,
        offset,
    };
};
