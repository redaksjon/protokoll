/**
 * Transcript CLI Commands
 * 
 * Commands for working with transcripts, including comparing against
 * raw Whisper output and reanalyzing.
 */

/* eslint-disable no-console */
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import { RawTranscriptData } from '../output/types';
import * as Metadata from '../util/metadata';

/**
 * Get the raw transcript path for a given final transcript path
 */
export const getRawTranscriptPath = (finalPath: string): string => {
    const dir = path.dirname(finalPath);
    const basename = path.basename(finalPath, path.extname(finalPath));
    return path.join(dir, '.transcript', `${basename}.json`);
};

/**
 * Read raw transcript data from the .transcript/ directory
 */
export const readRawTranscript = async (finalPath: string): Promise<RawTranscriptData | null> => {
    const rawPath = getRawTranscriptPath(finalPath);
    try {
        const content = await fs.readFile(rawPath, 'utf-8');
        return JSON.parse(content) as RawTranscriptData;
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
};

/**
 * Read final transcript content
 */
export const readFinalTranscript = async (finalPath: string): Promise<string | null> => {
    try {
        return await fs.readFile(finalPath, 'utf-8');
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
};

/**
 * Format a side-by-side comparison of raw and enhanced transcripts
 */
export const formatComparison = (raw: string, enhanced: string, width: number = 80): string => {
    const halfWidth = Math.floor(width / 2) - 2;
    const lines: string[] = [];
    
    // Header
    lines.push('╔' + '═'.repeat(halfWidth) + '╦' + '═'.repeat(halfWidth) + '╗');
    lines.push('║' + ' RAW WHISPER OUTPUT'.padEnd(halfWidth) + '║' + ' ENHANCED TRANSCRIPT'.padEnd(halfWidth) + '║');
    lines.push('╠' + '═'.repeat(halfWidth) + '╬' + '═'.repeat(halfWidth) + '╣');
    
    // Split into paragraphs and display
    const rawParagraphs = raw.split('\n\n');
    const enhancedParagraphs = enhanced.split('\n\n');
    const maxParagraphs = Math.max(rawParagraphs.length, enhancedParagraphs.length);
    
    for (let i = 0; i < maxParagraphs; i++) {
        const rawPara = rawParagraphs[i] || '';
        const enhancedPara = enhancedParagraphs[i] || '';
        
        // Word wrap each paragraph
        const rawLines = wrapText(rawPara, halfWidth - 1);
        const enhancedLines = wrapText(enhancedPara, halfWidth - 1);
        const maxLines = Math.max(rawLines.length, enhancedLines.length);
        
        for (let j = 0; j < maxLines; j++) {
            const rawLine = (rawLines[j] || '').padEnd(halfWidth);
            const enhancedLine = (enhancedLines[j] || '').padEnd(halfWidth);
            lines.push('║' + rawLine + '║' + enhancedLine + '║');
        }
        
        // Add separator between paragraphs
        if (i < maxParagraphs - 1) {
            lines.push('║' + '─'.repeat(halfWidth) + '║' + '─'.repeat(halfWidth) + '║');
        }
    }
    
    lines.push('╚' + '═'.repeat(halfWidth) + '╩' + '═'.repeat(halfWidth) + '╝');
    
    return lines.join('\n');
};

/**
 * Word wrap text to a maximum width
 */
export const wrapText = (text: string, maxWidth: number): string[] => {
    const words = text.replace(/\n/g, ' ').split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
        if (!word) continue;
        if (currentLine.length + word.length + 1 <= maxWidth) {
            currentLine += (currentLine ? ' ' : '') + word;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word.length > maxWidth ? word.slice(0, maxWidth) : word;
        }
    }
    if (currentLine) lines.push(currentLine);
    
    return lines.length > 0 ? lines : [''];
};

/**
 * Compare command - show raw vs enhanced side-by-side
 */
export const compareCommand = async (transcriptPath: string, options: { raw?: boolean; enhanced?: boolean; diff?: boolean }): Promise<void> => {
    // Resolve the path
    const absolutePath = path.isAbsolute(transcriptPath) 
        ? transcriptPath 
        : path.resolve(process.cwd(), transcriptPath);
    
    // Read both transcripts
    const rawData = await readRawTranscript(absolutePath);
    const finalContent = await readFinalTranscript(absolutePath);
    
    if (!rawData) {
        console.error(`No raw transcript found for: ${transcriptPath}`);
        console.error(`Expected at: ${getRawTranscriptPath(absolutePath)}`);
        console.error('\nThe raw transcript may not have been saved during transcription.');
        process.exit(1);
        return;
    }
    
    if (!finalContent) {
        console.error(`Final transcript not found: ${transcriptPath}`);
        process.exit(1);
        return;
    }
    
    // Show metadata about the raw transcript
    console.log('\n📋 Raw Transcript Info:');
    console.log(`   Model: ${rawData.model}`);
    console.log(`   Duration: ${(rawData.duration / 1000).toFixed(1)}s`);
    console.log(`   Audio: ${rawData.audioFile}`);
    console.log(`   Transcribed: ${new Date(rawData.transcribedAt).toLocaleString()}`);
    console.log(`   Characters: ${rawData.text.length} (raw) → ${finalContent.length} (enhanced)`);
    console.log('');
    
    if (options.raw) {
        // Show only raw transcript
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('RAW WHISPER OUTPUT');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(rawData.text);
    } else if (options.enhanced) {
        // Show only enhanced transcript  
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('ENHANCED TRANSCRIPT');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(finalContent);
    } else {
        // Show side-by-side comparison
        const termWidth = process.stdout.columns || 160;
        const comparison = formatComparison(rawData.text, finalContent, Math.min(termWidth, 160));
        console.log(comparison);
    }
};

/**
 * Info command - show info about raw transcript
 */
export const infoCommand = async (transcriptPath: string): Promise<void> => {
    const absolutePath = path.isAbsolute(transcriptPath) 
        ? transcriptPath 
        : path.resolve(process.cwd(), transcriptPath);
    
    const rawData = await readRawTranscript(absolutePath);
    
    if (!rawData) {
        console.error(`No raw transcript found for: ${transcriptPath}`);
        console.error(`Expected at: ${getRawTranscriptPath(absolutePath)}`);
        process.exit(1);
        return;
    }
    
    console.log('\n📋 Raw Transcript Information:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  📁 Final transcript: ${absolutePath}`);
    console.log(`  📁 Raw transcript:   ${getRawTranscriptPath(absolutePath)}`);
    console.log('');
    console.log(`  🎤 Audio file:    ${rawData.audioFile}`);
    console.log(`  🔑 Audio hash:    ${rawData.audioHash}`);
    console.log(`  🤖 Model:         ${rawData.model}`);
    console.log(`  ⏱️  Duration:      ${(rawData.duration / 1000).toFixed(1)} seconds`);
    console.log(`  📅 Transcribed:   ${new Date(rawData.transcribedAt).toLocaleString()}`);
    console.log('');
    console.log(`  📝 Raw text length:     ${rawData.text.length} characters`);
    console.log(`  📝 Raw word count:      ~${rawData.text.split(/\s+/).length} words`);
    console.log('═══════════════════════════════════════════════════════════════\n');
};

/**
 * Extract title from markdown content
 */
export const extractTitle = (content: string): string => {
    // Look for first # heading
    const match = content.match(/^#\s+(.+)$/m);
    if (match) {
        return match[1].trim();
    }
    
    // Fall back to first line
    const firstLine = content.split('\n')[0];
    return firstLine ? firstLine.trim().substring(0, 100) : 'Untitled';
};

/**
 * Extract date and time from filename
 * Supports formats like: 2026-01-18_Meeting_Notes.md or 2026-01-18-1430_Notes.md
 */
export const extractDateTimeFromFilename = (filename: string): { date: string; time?: string } | null => {
    // Try YYYY-MM-DD-HHMM pattern
    const withTimeMatch = filename.match(/(\d{4}-\d{2}-\d{2})-(\d{4})/);
    if (withTimeMatch) {
        const [, date, time] = withTimeMatch;
        const hours = time.substring(0, 2);
        const minutes = time.substring(2, 4);
        return { date, time: `${hours}:${minutes}` };
    }
    
    // Try YYYY-MM-DD pattern
    const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
        return { date: dateMatch[1] };
    }
    
    return null;
};

export interface TranscriptListItem {
    path: string;
    filename: string;
    date: string;
    time?: string;
    title: string;
    hasRawTranscript: boolean;
    createdAt: Date;
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
 * List transcripts with pagination, filtering, and search
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
    
    // Find all .md files recursively
    const pattern = path.join(absoluteDir, '**/*.md');
    const files = await glob(pattern, { 
        ignore: ['**/node_modules/**', '**/.git/**', '**/.transcript/**'],
    });
    
    // Build transcript list
    const transcripts: TranscriptListItem[] = [];
    
    for (const filePath of files) {
        const filename = path.basename(filePath);
        const dateTime = extractDateTimeFromFilename(filename);
        
        // Apply date filtering
        if (startDate && dateTime && dateTime.date < startDate) continue;
        if (endDate && dateTime && dateTime.date > endDate) continue;
        
        // Verify it's actually a file (not a directory)
        let stats;
        try {
            stats = await fs.stat(filePath);
            if (!stats.isFile()) {
                continue; // Skip directories and other non-files
            }
        } catch {
            continue; // Skip if we can't stat it
        }
        
        // Read content for title extraction and search
        let content: string;
        try {
            content = await fs.readFile(filePath, 'utf-8');
        } catch {
            // Skip files we can't read (permissions, encoding issues, etc.)
            continue;
        }
        
        // Apply search filtering
        if (search) {
            const searchLower = search.toLowerCase();
            if (!content.toLowerCase().includes(searchLower) && 
                !filename.toLowerCase().includes(searchLower)) {
                continue;
            }
        }
        
        const title = extractTitle(content);
        const rawData = await readRawTranscript(filePath);
        
        // Parse entity metadata from transcript
        const entities = Metadata.parseEntityMetadata(content);
        
        // Apply project filtering if projectId is specified
        if (projectId) {
            const hasProject = entities?.projects?.some(p => p.id === projectId);
            if (!hasProject) {
                continue; // Skip this transcript if it doesn't have the specified project
            }
        }
        
        transcripts.push({
            path: filePath,
            filename,
            date: dateTime?.date || stats.birthtime.toISOString().split('T')[0],
            time: dateTime?.time,
            title,
            hasRawTranscript: !!rawData,
            createdAt: stats.birthtime,
            entities: entities ? {
                people: entities.people?.map(e => ({ id: e.id, name: e.name })),
                projects: entities.projects?.map(e => ({ id: e.id, name: e.name })),
                terms: entities.terms?.map(e => ({ id: e.id, name: e.name })),
                companies: entities.companies?.map(e => ({ id: e.id, name: e.name })),
            } : undefined,
        });
    }
    
    // Sort
    transcripts.sort((a, b) => {
        switch (sortBy) {
            case 'date': {
                // Sort by date descending (newest first), then by time if available
                const dateCompare = b.date.localeCompare(a.date);
                if (dateCompare !== 0) return dateCompare;
                if (a.time && b.time) return b.time.localeCompare(a.time);
                return b.createdAt.getTime() - a.createdAt.getTime();
            }
            case 'filename':
                return a.filename.localeCompare(b.filename);
            case 'title':
                return a.title.localeCompare(b.title);
            default:
                return 0;
        }
    });
    
    // Apply pagination
    const total = transcripts.length;
    const paginatedTranscripts = transcripts.slice(offset, offset + limit);
    const hasMore = offset + limit < total;
    
    return {
        transcripts: paginatedTranscripts,
        total,
        hasMore,
        limit,
        offset,
    };
};

/**
 * List command - list all transcripts with pagination and filtering
 */
export const listCommand = async (
    directory: string,
    options?: {
        limit?: number;
        offset?: number;
        sortBy?: 'date' | 'filename' | 'title';
        startDate?: string;
        endDate?: string;
        search?: string;
    }
): Promise<void> => {
    const result = await listTranscripts({
        directory,
        ...options,
    });
    
    console.log(`\n📂 Transcripts in: ${directory}`);
    if (options?.search) {
        console.log(`🔍 Search: "${options.search}"`);
    }
    if (options?.startDate || options?.endDate) {
        console.log(`📅 Date range: ${options?.startDate || 'any'} to ${options?.endDate || 'any'}`);
    }
    console.log(`📊 Showing ${result.offset + 1}-${result.offset + result.transcripts.length} of ${result.total} total\n`);
    
    if (result.transcripts.length === 0) {
        console.log('  No transcripts found.\n');
        return;
    }
    
    for (const transcript of result.transcripts) {
        const timeStr = transcript.time ? ` ${transcript.time}` : '';
        const hasRaw = transcript.hasRawTranscript ? '✅' : '  ';
        console.log(`${hasRaw} ${transcript.date}${timeStr} - ${transcript.title}`);
        console.log(`   ${transcript.filename}`);
    }
    
    console.log('');
    if (result.hasMore) {
        const nextOffset = result.offset + result.limit;
        console.log(`💡 More results available. Use --offset ${nextOffset} to see the next page.\n`);
    }
};

/**
 * Register transcript commands with the CLI
 */
export const registerTranscriptCommands = (program: Command): void => {
    const transcript = program
        .command('transcript')
        .description('Work with transcripts and raw Whisper output');
    
    transcript
        .command('compare <file>')
        .description('Compare enhanced transcript with raw Whisper output')
        .option('--raw', 'Show only the raw Whisper output')
        .option('--enhanced', 'Show only the enhanced transcript')
        .option('--diff', 'Show a unified diff (requires diff command)')
        .action(compareCommand);
    
    transcript
        .command('info <file>')
        .description('Show information about a transcript\'s raw source')
        .action(infoCommand);
    
    transcript
        .command('list <directory>')
        .description('List transcripts with pagination, filtering, and search')
        .option('--limit <number>', 'Maximum number of results to return', '50')
        .option('--offset <number>', 'Number of results to skip for pagination', '0')
        .option('--sort-by <field>', 'Sort by: date (default), filename, or title', 'date')
        .option('--start-date <YYYY-MM-DD>', 'Filter transcripts from this date onwards')
        .option('--end-date <YYYY-MM-DD>', 'Filter transcripts up to this date')
        .option('--search <text>', 'Search for transcripts containing this text')
        .action((directory, options) => {
            listCommand(directory, {
                limit: parseInt(options.limit),
                offset: parseInt(options.offset),
                sortBy: options.sortBy,
                startDate: options.startDate,
                endDate: options.endDate,
                search: options.search,
            });
        });
};
