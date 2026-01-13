#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Native Node.js script to copy .md files from src/ to dist/
 * Replaces the copyfiles dependency for Node 24+
 */
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { glob } from 'glob';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const srcDir = join(projectRoot, 'src');
const distDir = join(projectRoot, 'dist');

async function copyAssets() {
    // Find all .md files in src/
    const mdFiles = await glob('**/*.md', { cwd: srcDir });
    
    if (mdFiles.length === 0) {
        console.log('No .md files found in src/');
        return;
    }

    console.log(`Copying ${mdFiles.length} .md files to dist/...`);
    
    for (const file of mdFiles) {
        const srcPath = join(srcDir, file);
        const destPath = join(distDir, file);
        
        // Ensure destination directory exists
        await mkdir(dirname(destPath), { recursive: true });
        
        // Copy the file
        await cp(srcPath, destPath);
        console.log(`  ${relative(projectRoot, srcPath)} → ${relative(projectRoot, destPath)}`);
    }
    
    console.log('Done.');
}

copyAssets().catch((err) => {
    console.error('Error copying assets:', err);
    process.exit(1);
});

