#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Fix Duplicate Frontmatter Delimiters
 * 
 * This script finds and fixes transcript files that have duplicate opening
 * frontmatter delimiters (---\n---) which can be caused by bugs in the
 * transcript editing logic.
 * 
 * Usage:
 *   npm run fix-delimiters [directory]
 * 
 * If no directory is provided, uses the configured outputDirectory.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'glob';
import * as path from 'node:path';
import { parseTranscriptContent, stringifyTranscript } from '../src/util/frontmatter';

async function fixFile(filePath: string, dryRun: boolean = false): Promise<{ fixed: boolean; error?: string }> {
    try {
        const content = await readFile(filePath, 'utf-8');
        
        // Check if file has duplicate delimiters
        const lines = content.split('\n');
        const hasDuplicateDelimiters = lines.length > 1 && 
            lines[0].trim() === '---' && 
            lines[1].trim() === '---';
        
        if (!hasDuplicateDelimiters) {
            return { fixed: false };
        }
        
        console.log(`\n🔧 Fixing: ${path.basename(filePath)}`);
        console.log(`   Issue: Duplicate opening delimiters (---\\n---)`);
        
        // Parse and re-stringify to fix the format
        const parsed = parseTranscriptContent(content);
        const fixed = stringifyTranscript(parsed.metadata, parsed.body);
        
        // Verify the fix worked
        const fixedLines = fixed.split('\n');
        if (fixedLines.length > 1 && fixedLines[0].trim() === '---' && fixedLines[1].trim() === '---') {
            throw new Error('Fix failed: Still has duplicate delimiters after repair');
        }
        
        if (!dryRun) {
            await writeFile(filePath, fixed, 'utf-8');
            console.log(`   ✅ Fixed and saved`);
        } else {
            console.log(`   ✅ Would fix (dry-run mode)`);
        }
        
        return { fixed: true };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Error: ${errorMsg}`);
        return { fixed: false, error: errorMsg };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const directory = args[0] || process.env.HOME + '/.protokoll/output';
    const dryRun = args.includes('--dry-run');
    
    console.log('🔍 Scanning for transcripts with duplicate delimiters...');
    console.log(`   Directory: ${directory}`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'REPAIR (will fix files)'}`);
    
    // Find all markdown files
    const pattern = path.join(directory, '**/*.md');
    const files = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/.transcript/**'],
    });
    
    console.log(`   Found ${files.length} markdown files`);
    
    let fixedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    for (const file of files) {
        const result = await fixFile(file, dryRun);
        if (result.fixed) {
            fixedCount++;
        } else if (result.error) {
            errorCount++;
        } else {
            skippedCount++;
        }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 Summary:');
    console.log(`   ✅ Fixed: ${fixedCount}`);
    console.log(`   ⏭️  Skipped (already correct): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(70));
    
    if (dryRun && fixedCount > 0) {
        console.log('\n💡 Run without --dry-run to apply fixes');
    }
    
    process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
