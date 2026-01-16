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
import { RawTranscriptData } from '../output/types';

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
 * List command - list all transcripts with raw transcripts in a directory
 */
export const listCommand = async (directory: string): Promise<void> => {
    const absoluteDir = path.isAbsolute(directory) 
        ? directory 
        : path.resolve(process.cwd(), directory);
    
    // Find all .md files in the directory
    const files = await fs.readdir(absoluteDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    
    console.log(`\n📂 Transcripts in: ${absoluteDir}\n`);
    
    let foundCount = 0;
    let missingCount = 0;
    
    for (const file of mdFiles) {
        const fullPath = path.join(absoluteDir, file);
        const rawData = await readRawTranscript(fullPath);
        
        if (rawData) {
            foundCount++;
            console.log(`  ✅ ${file}`);
            console.log(`      Model: ${rawData.model}, Transcribed: ${new Date(rawData.transcribedAt).toLocaleDateString()}`);
        } else {
            missingCount++;
            console.log(`  ❌ ${file} (no raw transcript)`);
        }
    }
    
    console.log('');
    console.log(`Found ${foundCount} with raw transcripts, ${missingCount} without.`);
    console.log('');
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
        .description('List transcripts and their raw transcript status')
        .action(listCommand);
};
