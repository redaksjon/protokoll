#!/usr/bin/env node
/**
 * Verification script for 2025 transcript migration
 * 
 * This script verifies that all transcripts have been properly migrated to the new format.
 */

/* eslint-disable no-console */

import * as fs from 'fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import { parseTranscriptContent } from '../src/util/frontmatter';

interface VerificationResult {
    path: string;
    filename: string;
    status: 'ok' | 'needs_migration' | 'error';
    issues?: string[];
}

async function verifyFile(filePath: string): Promise<VerificationResult> {
    const filename = path.basename(filePath);
    
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = parseTranscriptContent(content);
        
        const issues: string[] = [];
        
        // Check if it still needs migration
        if (parsed.needsMigration) {
            issues.push('Still needs migration');
        }
        
        // Check for legacy sections in the content
        if (content.includes('## Metadata\n')) {
            issues.push('Contains ## Metadata section');
        }
        
        if (content.includes('## Entity References')) {
            issues.push('Contains ## Entity References section');
        }
        
        // Check that it starts with frontmatter
        if (!content.startsWith('---')) {
            issues.push('Missing frontmatter');
        }
        
        // Check that title is not duplicated in body
        // Only flag if the H1 in the body matches the title exactly
        if (parsed.metadata.title) {
            const h1Match = parsed.body.match(/^#\s+(.+)$/m);
            if (h1Match && h1Match[1].trim() === parsed.metadata.title.trim()) {
                issues.push('Title appears as H1 in body');
            }
        }
        
        return {
            path: filePath,
            filename,
            status: issues.length > 0 ? 'needs_migration' : 'ok',
            issues: issues.length > 0 ? issues : undefined,
        };
    } catch (error) {
        return {
            path: filePath,
            filename,
            status: 'error',
            issues: [error instanceof Error ? error.message : String(error)],
        };
    }
}

async function verifyDirectory(directory: string): Promise<void> {
    console.log('\n🔍 Transcript Migration Verification');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`📁 Directory: ${directory}\n`);
    
    // Find all markdown files
    const pattern = path.join(directory, '**/*.md');
    const files = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/.transcript/**'],
    });
    
    console.log(`📊 Found ${files.length} markdown files\n`);
    console.log('Verifying...\n');
    
    const results: VerificationResult[] = [];
    let ok = 0;
    let needsMigration = 0;
    let errors = 0;
    
    for (const filePath of files) {
        const result = await verifyFile(filePath);
        results.push(result);
        
        switch (result.status) {
            case 'ok':
                ok++;
                break;
            case 'needs_migration':
                needsMigration++;
                console.log(`⚠️  ${result.filename}`);
                if (result.issues) {
                    for (const issue of result.issues) {
                        console.log(`   → ${issue}`);
                    }
                }
                break;
            case 'error':
                errors++;
                console.log(`❌ ${result.filename}`);
                if (result.issues) {
                    for (const issue of result.issues) {
                        console.log(`   → ${issue}`);
                    }
                }
                break;
        }
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📊 Verification Summary');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`   Total files:           ${files.length}`);
    console.log(`   ✅ Properly migrated:    ${ok}`);
    console.log(`   ⚠️  Needs migration:     ${needsMigration}`);
    console.log(`   ❌ Errors:               ${errors}`);
    console.log('');
    
    if (needsMigration === 0 && errors === 0) {
        console.log('✅ All files have been properly migrated!\n');
    } else if (needsMigration > 0) {
        console.log(`⚠️  ${needsMigration} file(s) still need migration. Run the migration script again.\n`);
        process.exit(1);
    } else if (errors > 0) {
        console.log(`❌ ${errors} file(s) have errors. Please review and fix manually.\n`);
        process.exit(1);
    }
}

async function main() {
    const directory = process.argv[2] || '/Users/tobrien/gitw/tobrien/activity/notes/2025';
    
    try {
        await verifyDirectory(directory);
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { verifyFile, verifyDirectory };
