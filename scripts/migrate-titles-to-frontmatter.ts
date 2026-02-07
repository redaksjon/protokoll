#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Migrate Titles to Frontmatter
 * 
 * This script ensures all transcript files have their title in the YAML frontmatter
 * and removes any H1 titles from the body content.
 * 
 * Usage:
 *   npm run migrate-titles [directory]
 * 
 * If no directory is provided, uses the configured outputDirectory.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'glob';
import * as path from 'node:path';
import matter from 'gray-matter';
import { parseTranscriptContent, stringifyTranscript } from '../src/util/frontmatter';

async function migrateFile(filePath: string, dryRun: boolean = false): Promise<{ migrated: boolean; error?: string }> {
    try {
        const content = await readFile(filePath, 'utf-8');
        
        // Parse the file
        const parsed = parseTranscriptContent(content);
        
        // Check if migration is needed by looking at the ORIGINAL content
        // (parseTranscriptContent already extracts H1 from parsed.body, so we need to check the raw content)
        const { data: frontmatter, content: rawBody } = matter(content);
        const bodyHasH1 = /^#\s+.+$/m.test(rawBody);
        const titleInFrontmatter = !!frontmatter.title;
        
        if (!bodyHasH1 && titleInFrontmatter) {
            // Already in correct format
            return { migrated: false };
        }
        
        console.log(`\n🔧 Migrating: ${path.basename(filePath)}`);
        
        if (!titleInFrontmatter && bodyHasH1) {
            console.log(`   Issue: Title is in body as H1, not in frontmatter`);
        } else if (bodyHasH1) {
            console.log(`   Issue: Title exists in both frontmatter and body (H1)`);
        }
        
        // Re-stringify will automatically:
        // 1. Extract H1 from body if title is missing from frontmatter
        // 2. Remove H1 from body if title is in frontmatter
        const migrated = stringifyTranscript(parsed.metadata, parsed.body);
        
        // Verify the migration worked
        const verifyParsed = parseTranscriptContent(migrated);
        const bodyStillHasH1 = /^#\s+.+$/m.test(verifyParsed.body);
        
        if (bodyStillHasH1) {
            throw new Error('Migration failed: Body still contains H1 after migration');
        }
        
        if (!verifyParsed.metadata.title) {
            console.log(`   ⚠️  Skipped: File has no title (neither in frontmatter nor as H1)`);
            return { migrated: false };
        }
        
        if (!dryRun) {
            await writeFile(filePath, migrated, 'utf-8');
            console.log(`   ✅ Migrated (title: "${verifyParsed.metadata.title}")`);
        } else {
            console.log(`   ✅ Would migrate (title: "${verifyParsed.metadata.title}") [dry-run]`);
        }
        
        return { migrated: true };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Error: ${errorMsg}`);
        return { migrated: false, error: errorMsg };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const directory = args[0] || process.env.HOME + '/.protokoll/output';
    const dryRun = args.includes('--dry-run');
    
    console.log('🔍 Scanning for transcripts with title issues...');
    console.log(`   Directory: ${directory}`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'MIGRATE (will fix files)'}`);
    
    // Find all markdown files
    const pattern = path.join(directory, '**/*.md');
    const files = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/.transcript/**'],
    });
    
    console.log(`   Found ${files.length} markdown files`);
    
    let migratedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    for (const file of files) {
        const result = await migrateFile(file, dryRun);
        if (result.migrated) {
            migratedCount++;
        } else if (result.error) {
            errorCount++;
        } else {
            skippedCount++;
        }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 Summary:');
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⏭️  Skipped (already correct): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(70));
    
    if (dryRun && migratedCount > 0) {
        console.log('\n💡 Run without --dry-run to apply migrations');
    }
    
    process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
