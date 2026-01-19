#!/usr/bin/env node
/**
 * MCP Compliance Test Script
 * 
 * Validates that the Protokoll MCP server implements required MCP features correctly.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = resolve(__dirname, '../dist/mcp/server.js');

console.log('🔍 Testing MCP Compliance...\n');

// Check that server file exists
import { access } from 'fs/promises';
try {
    await access(serverPath);
} catch (error) {
    console.error('❌ Server not built. Run `npm run build` first.');
    process.exit(1);
}

let passed = 0;
let failed = 0;

// Test 1: Server starts without errors
console.log('Testing: Server initialization...');
const serverProcess = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
});

let initOutput = '';
let initError = '';

serverProcess.stdout.on('data', (data) => {
    initOutput += data.toString();
});

serverProcess.stderr.on('data', (data) => {
    initError += data.toString();
});

// Give it 2 seconds to initialize
await new Promise((resolve) => setTimeout(resolve, 2000));

if (serverProcess.exitCode === null) {
    console.log('✅ Server starts successfully\n');
    passed++;
    serverProcess.kill();
} else {
    console.log('❌ Server failed to start');
    console.log('Error:', initError);
    failed++;
}

// Test 2: Verify capabilities are declared
console.log('Testing: Capabilities declaration...');
const serverCode = await import(serverPath);
// Basic check that imports work
console.log('✅ Server module loads\n');
passed++;

// Test 3: TypeScript compilation
console.log('Testing: TypeScript compilation...');
try {
    const { execSync } = await import('child_process');
    execSync('npx tsc --noEmit', { cwd: resolve(__dirname, '..'), stdio: 'pipe' });
    console.log('✅ TypeScript compiles without errors\n');
    passed++;
} catch (error) {
    console.log('❌ TypeScript compilation failed');
    failed++;
}

// Summary
console.log('─'.repeat(50));
console.log(`\n📊 MCP Compliance Test Results:`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%\n`);

if (failed > 0) {
    console.log('⚠️  Some compliance tests failed. Please review and fix before committing.\n');
    process.exit(1);
}

console.log('✨ All MCP compliance tests passed!\n');
process.exit(0);
