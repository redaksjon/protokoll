#!/usr/bin/env node
/**
 * Migration script to convert all 2025 transcripts to new YAML frontmatter format
 * 
 * This script:
 * 1. Scans all markdown files in the specified directory
 * 2. Detects files in old format (with ## Metadata and ## Entity References sections)
 * 3. Converts them to new format (all metadata in YAML frontmatter)
 * 4. Verifies the conversion was successful
 * 5. Creates a detailed migration report
 */

/* eslint-disable no-console */

import * as fs from 'fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import { parseTranscriptContent, stringifyTranscript } from '../src/util/frontmatter';
import { TranscriptMetadata } from '../src/util/metadata';

interface MigrationResult {
    path: string;
    filename: string;
    status: 'success' | 'error' | 'skipped' | 'already_migrated';
    error?: string;
    changes?: {
        hadFrontmatter: boolean;
        hadMetadataSection: boolean;
        hadEntitySection: boolean;
        entitiesExtracted: boolean;
        titleExtracted: boolean;
    };
}

interface MigrationReport {
    totalFiles: number;
    migrated: number;
    alreadyMigrated: number;
    skipped: number;
    errors: number;
    results: MigrationResult[];
    startTime: Date;
    endTime?: Date;
    duration?: number;
}

/**
 * Analyze a file to determine what needs to be migrated
 */
async function analyzeFile(filePath: string): Promise<{
    needsMigration: boolean;
    hadFrontmatter: boolean;
    hadMetadataSection: boolean;
    hadEntitySection: boolean;
}> {
    const content = await fs.readFile(filePath, 'utf-8');
    
    const hadFrontmatter = content.startsWith('---');
    const hadMetadataSection = content.includes('\n## Metadata\n');
    const hadEntitySection = content.includes('## Entity References');
    
    // Parse to check if migration is needed
    const parsed = parseTranscriptContent(content);
    
    return {
        needsMigration: parsed.needsMigration,
        hadFrontmatter,
        hadMetadataSection,
        hadEntitySection,
    };
}

/**
 * Migrate a single file
 */
async function migrateFile(filePath: string, dryRun: boolean = false): Promise<MigrationResult> {
    const filename = path.basename(filePath);
    
    try {
        // Read original content
        const originalContent = await fs.readFile(filePath, 'utf-8');
        
        // Analyze what needs to be done
        const analysis = await analyzeFile(filePath);
        
        // If already migrated, skip
        if (!analysis.needsMigration) {
            return {
                path: filePath,
                filename,
                status: 'already_migrated',
            };
        }
        
        // Parse the content
        const parsed = parseTranscriptContent(originalContent);
        
        // Generate new content
        const newContent = stringifyTranscript(parsed.metadata, parsed.body);
        
        // Verify the migration
        const verification = verifyMigration(originalContent, newContent, parsed.metadata);
        if (!verification.success) {
            return {
                path: filePath,
                filename,
                status: 'error',
                error: `Verification failed: ${verification.errors.join(', ')}`,
            };
        }
        
        // Write the new content (unless dry run)
        if (!dryRun) {
            await fs.writeFile(filePath, newContent, 'utf-8');
        }
        
        return {
            path: filePath,
            filename,
            status: 'success',
            changes: {
                hadFrontmatter: analysis.hadFrontmatter,
                hadMetadataSection: analysis.hadMetadataSection,
                hadEntitySection: analysis.hadEntitySection,
                entitiesExtracted: !!parsed.metadata.entities,
                titleExtracted: !!parsed.metadata.title,
            },
        };
    } catch (error) {
        return {
            path: filePath,
            filename,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Verify that migration preserved all important data
 */
function verifyMigration(
    originalContent: string,
    newContent: string,
    metadata: TranscriptMetadata
): { success: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Parse the new content to verify
    const parsed = parseTranscriptContent(newContent);
    
    // Check that it's no longer marked as needing migration
    if (parsed.needsMigration) {
        errors.push('New content still needs migration');
    }
    
    // Check that title was preserved
    if (metadata.title && !parsed.metadata.title) {
        errors.push('Title was lost');
    }
    
    // Check that entities were preserved
    if (metadata.entities) {
        if (!parsed.metadata.entities) {
            errors.push('Entities were lost');
        } else {
            // Check each entity type
            if (metadata.entities.people?.length !== parsed.metadata.entities.people?.length) {
                errors.push('People entities count mismatch');
            }
            if (metadata.entities.projects?.length !== parsed.metadata.entities.projects?.length) {
                errors.push('Projects entities count mismatch');
            }
            if (metadata.entities.terms?.length !== parsed.metadata.entities.terms?.length) {
                errors.push('Terms entities count mismatch');
            }
            if (metadata.entities.companies?.length !== parsed.metadata.entities.companies?.length) {
                errors.push('Companies entities count mismatch');
            }
        }
    }
    
    // Check that body content is preserved (approximately)
    // We allow for some differences due to formatting, but major content should be there
    const originalParsed = parseTranscriptContent(originalContent);
    const originalBodyLength = originalParsed.body.length;
    const newBodyLength = parsed.body.length;
    
    // Allow up to 10% difference in length (due to formatting changes)
    const lengthDiff = Math.abs(originalBodyLength - newBodyLength) / originalBodyLength;
    if (lengthDiff > 0.1) {
        errors.push(`Body content length changed significantly: ${originalBodyLength} -> ${newBodyLength} (${(lengthDiff * 100).toFixed(1)}%)`);
    }
    
    // Check that new content doesn't have legacy sections
    if (newContent.includes('## Entity References')) {
        errors.push('New content still has Entity References section');
    }
    if (newContent.includes('## Metadata\n')) {
        errors.push('New content still has Metadata section');
    }
    
    // Check that new content has frontmatter
    if (!newContent.startsWith('---')) {
        errors.push('New content missing frontmatter');
    }
    
    return {
        success: errors.length === 0,
        errors,
    };
}

/**
 * Main migration function
 */
async function migrateDirectory(
    directory: string,
    options: {
        dryRun?: boolean;
        verbose?: boolean;
        limit?: number;
    } = {}
): Promise<MigrationReport> {
    const { dryRun = false, verbose = false, limit } = options;
    
    console.log('\n🔄 Transcript Migration Tool');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`📁 Directory: ${directory}`);
    console.log(`🔍 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (files will be modified)'}`);
    console.log('');
    
    const report: MigrationReport = {
        totalFiles: 0,
        migrated: 0,
        alreadyMigrated: 0,
        skipped: 0,
        errors: 0,
        results: [],
        startTime: new Date(),
    };
    
    // Find all markdown files
    const pattern = path.join(directory, '**/*.md');
    const files = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/.transcript/**'],
    });
    
    report.totalFiles = files.length;
    console.log(`📊 Found ${files.length} markdown files\n`);
    
    // Apply limit if specified
    const filesToProcess = limit ? files.slice(0, limit) : files;
    if (limit && limit < files.length) {
        console.log(`⚠️  Processing only first ${limit} files (use --limit to change)\n`);
    }
    
    // Process each file
    let processed = 0;
    for (const filePath of filesToProcess) {
        processed++;
        const result = await migrateFile(filePath, dryRun);
        report.results.push(result);
        
        // Update counters
        switch (result.status) {
            case 'success':
                report.migrated++;
                break;
            case 'already_migrated':
                report.alreadyMigrated++;
                break;
            case 'skipped':
                report.skipped++;
                break;
            case 'error':
                report.errors++;
                break;
        }
        
        // Show progress
        if (verbose || result.status === 'error') {
            const statusEmoji = {
                success: '✅',
                already_migrated: '⏭️ ',
                skipped: '⏭️ ',
                error: '❌',
            }[result.status];
            
            console.log(`${statusEmoji} [${processed}/${filesToProcess.length}] ${result.filename}`);
            
            if (result.status === 'error') {
                console.log(`   Error: ${result.error}`);
            } else if (result.status === 'success' && verbose && result.changes) {
                const changes = [];
                if (result.changes.hadMetadataSection) changes.push('metadata section');
                if (result.changes.hadEntitySection) changes.push('entity section');
                if (result.changes.entitiesExtracted) changes.push('entities extracted');
                if (result.changes.titleExtracted) changes.push('title extracted');
                if (changes.length > 0) {
                    console.log(`   Migrated: ${changes.join(', ')}`);
                }
            }
        } else if (processed % 10 === 0) {
            // Show progress every 10 files
            console.log(`   Progress: ${processed}/${filesToProcess.length} files processed...`);
        }
    }
    
    report.endTime = new Date();
    report.duration = report.endTime.getTime() - report.startTime.getTime();
    
    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📊 Migration Summary');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`   Total files found:     ${report.totalFiles}`);
    console.log(`   Files processed:       ${filesToProcess.length}`);
    console.log(`   ✅ Successfully migrated: ${report.migrated}`);
    console.log(`   ⏭️  Already migrated:     ${report.alreadyMigrated}`);
    console.log(`   ⏭️  Skipped:               ${report.skipped}`);
    console.log(`   ❌ Errors:                ${report.errors}`);
    console.log(`   ⏱️  Duration:              ${(report.duration / 1000).toFixed(1)}s`);
    console.log('');
    
    if (report.errors > 0) {
        console.log('❌ Errors encountered:\n');
        for (const result of report.results) {
            if (result.status === 'error') {
                console.log(`   ${result.filename}`);
                console.log(`   → ${result.error}\n`);
            }
        }
    }
    
    if (dryRun && report.migrated > 0) {
        console.log('💡 This was a dry run. Run without --dry-run to apply changes.\n');
    } else if (!dryRun && report.migrated > 0) {
        console.log('✅ Migration complete! All files have been updated.\n');
    } else if (report.alreadyMigrated === filesToProcess.length) {
        console.log('✅ All files are already in the new format. Nothing to do!\n');
    }
    
    return report;
}

/**
 * CLI entry point
 */
async function main() {
    const args = process.argv.slice(2);
    
    // Parse arguments
    let directory = '/Users/tobrien/gitw/tobrien/activity/notes/2025';
    let dryRun = false;
    let verbose = false;
    let limit: number | undefined;
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--dry-run') {
            dryRun = true;
        } else if (arg === '--verbose' || arg === '-v') {
            verbose = true;
        } else if (arg === '--limit') {
            limit = parseInt(args[++i]);
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Usage: migrate-transcripts-2025.ts [options] [directory]

Options:
  --dry-run         Run without making changes (preview mode)
  --verbose, -v     Show detailed progress for each file
  --limit <number>  Process only the first N files
  --help, -h        Show this help message

Examples:
  # Dry run to see what would be changed
  npm run migrate:2025 -- --dry-run

  # Migrate all files with verbose output
  npm run migrate:2025 -- --verbose

  # Test on first 10 files
  npm run migrate:2025 -- --dry-run --limit 10

  # Run the migration for real
  npm run migrate:2025
`);
            process.exit(0);
        } else if (!arg.startsWith('--')) {
            directory = arg;
        }
    }
    
    // Run migration
    try {
        const report = await migrateDirectory(directory, { dryRun, verbose, limit });
        
        // Exit with error code if there were errors
        if (report.errors > 0) {
            process.exit(1);
        }
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { migrateDirectory, migrateFile, analyzeFile, verifyMigration };
