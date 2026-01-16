#!/usr/bin/env node
/* eslint-disable no-console, no-restricted-imports */
/**
 * Coverage Priority Analyzer
 * 
 * Parses lcov.info and ranks files by testing priority.
 * Helps answer: "Where should I focus testing efforts next?"
 * 
 * Usage: node scripts/coverage-priority.mjs [options]
 * 
 * Options:
 *   --weights=branches,functions,lines  Custom weights (default: 0.5,0.3,0.2)
 *   --min-lines=N                       Exclude files with fewer than N lines (default: 10)
 *   --json                              Output as JSON
 *   --top=N                             Show only top N files (default: all)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LCOV_PATH = resolve(__dirname, '../coverage/lcov.info');

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        weights: { branches: 0.5, functions: 0.3, lines: 0.2 },
        minLines: 10,
        json: false,
        top: null,
    };

    for (const arg of args) {
        if (arg.startsWith('--weights=')) {
            const [b, f, l] = arg.slice(10).split(',').map(Number);
            options.weights = { branches: b, functions: f, lines: l };
        } else if (arg.startsWith('--min-lines=')) {
            options.minLines = parseInt(arg.slice(12), 10);
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg.startsWith('--top=')) {
            options.top = parseInt(arg.slice(6), 10);
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Coverage Priority Analyzer

Parses lcov.info and ranks files by testing priority.
Helps answer: "Where should I focus testing efforts next?"

Usage: node scripts/coverage-priority.mjs [options]

Options:
  --weights=B,F,L    Custom weights for branches,functions,lines (default: 0.5,0.3,0.2)
  --min-lines=N      Exclude files with fewer than N lines (default: 10)
  --json             Output as JSON for tooling
  --top=N            Show only top N priority files
  --help, -h         Show this help

Examples:
  node scripts/coverage-priority.mjs --top=10
  node scripts/coverage-priority.mjs --weights=0.6,0.2,0.2 --json
  node scripts/coverage-priority.mjs --min-lines=50
`);
            process.exit(0);
        }
    }
    return options;
}

// Parse lcov.info file
function parseLcov(content) {
    const files = [];
    let current = null;

    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('SF:')) {
            current = {
                file: trimmed.slice(3),
                linesFound: 0,
                linesHit: 0,
                functionsFound: 0,
                functionsHit: 0,
                branchesFound: 0,
                branchesHit: 0,
            };
        } else if (trimmed.startsWith('LF:')) {
            current.linesFound = parseInt(trimmed.slice(3), 10);
        } else if (trimmed.startsWith('LH:')) {
            current.linesHit = parseInt(trimmed.slice(3), 10);
        } else if (trimmed.startsWith('FNF:')) {
            current.functionsFound = parseInt(trimmed.slice(4), 10);
        } else if (trimmed.startsWith('FNH:')) {
            current.functionsHit = parseInt(trimmed.slice(4), 10);
        } else if (trimmed.startsWith('BRF:')) {
            current.branchesFound = parseInt(trimmed.slice(4), 10);
        } else if (trimmed.startsWith('BRH:')) {
            current.branchesHit = parseInt(trimmed.slice(4), 10);
        } else if (trimmed === 'end_of_record' && current) {
            files.push(current);
            current = null;
        }
    }

    return files;
}

// Calculate overall coverage from all files
function calculateOverallCoverage(files) {
    const totals = files.reduce((acc, f) => ({
        linesFound: acc.linesFound + f.linesFound,
        linesHit: acc.linesHit + f.linesHit,
        functionsFound: acc.functionsFound + f.functionsFound,
        functionsHit: acc.functionsHit + f.functionsHit,
        branchesFound: acc.branchesFound + f.branchesFound,
        branchesHit: acc.branchesHit + f.branchesHit,
    }), {
        linesFound: 0,
        linesHit: 0,
        functionsFound: 0,
        functionsHit: 0,
        branchesFound: 0,
        branchesHit: 0,
    });

    return {
        lines: {
            found: totals.linesFound,
            hit: totals.linesHit,
            coverage: totals.linesFound > 0 
                ? Math.round((totals.linesHit / totals.linesFound) * 10000) / 100 
                : 100,
        },
        functions: {
            found: totals.functionsFound,
            hit: totals.functionsHit,
            coverage: totals.functionsFound > 0 
                ? Math.round((totals.functionsHit / totals.functionsFound) * 10000) / 100 
                : 100,
        },
        branches: {
            found: totals.branchesFound,
            hit: totals.branchesHit,
            coverage: totals.branchesFound > 0 
                ? Math.round((totals.branchesHit / totals.branchesFound) * 10000) / 100 
                : 100,
        },
        fileCount: files.length,
    };
}

// Calculate coverage percentages and priority score
function analyzeFile(file, weights) {
    const lineCoverage = file.linesFound > 0 
        ? (file.linesHit / file.linesFound) * 100 
        : 100;
    
    const functionCoverage = file.functionsFound > 0 
        ? (file.functionsHit / file.functionsFound) * 100 
        : 100;
    
    const branchCoverage = file.branchesFound > 0 
        ? (file.branchesHit / file.branchesFound) * 100 
        : 100;

    // Priority score: lower coverage = higher priority (inverted)
    // Weighted combination of coverage gaps
    const lineGap = 100 - lineCoverage;
    const functionGap = 100 - functionCoverage;
    const branchGap = 100 - branchCoverage;

    // Factor in file size - bigger files with low coverage = more important
    const sizeFactor = Math.log10(Math.max(file.linesFound, 1) + 1);

    const priorityScore = (
        (branchGap * weights.branches) +
        (functionGap * weights.functions) +
        (lineGap * weights.lines)
    ) * sizeFactor;

    return {
        file: file.file,
        lines: {
            found: file.linesFound,
            hit: file.linesHit,
            coverage: Math.round(lineCoverage * 100) / 100,
        },
        functions: {
            found: file.functionsFound,
            hit: file.functionsHit,
            coverage: Math.round(functionCoverage * 100) / 100,
        },
        branches: {
            found: file.branchesFound,
            hit: file.branchesHit,
            coverage: Math.round(branchCoverage * 100) / 100,
        },
        priorityScore: Math.round(priorityScore * 100) / 100,
        uncoveredLines: file.linesFound - file.linesHit,
        uncoveredBranches: file.branchesFound - file.branchesHit,
    };
}

// Format for terminal output
function formatTable(analyzed, options, overall) {
    const divider = '─'.repeat(120);
    
    // Color helper
    const colorPct = (pct) => {
        if (pct >= 90) return `\x1b[32m${pct.toFixed(2)}%\x1b[0m`;
        if (pct >= 80) return `\x1b[33m${pct.toFixed(2)}%\x1b[0m`;
        return `\x1b[31m${pct.toFixed(2)}%\x1b[0m`;
    };

    console.log('\n📊 Coverage Priority Report\n');
    
    // Overall coverage summary box
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│                      OVERALL COVERAGE                           │');
    console.log('├─────────────────┬─────────────────┬─────────────────────────────┤');
    console.log(`│  Lines: ${colorPct(overall.lines.coverage).padEnd(24)}│  Functions: ${colorPct(overall.functions.coverage).padEnd(20)}│  Branches: ${colorPct(overall.branches.coverage).padEnd(22)}│`);
    console.log(`│  (${overall.lines.hit}/${overall.lines.found})`.padEnd(18) + `│  (${overall.functions.hit}/${overall.functions.found})`.padEnd(18) + `│  (${overall.branches.hit}/${overall.branches.found})`.padEnd(30) + '│');
    console.log('└─────────────────┴─────────────────┴─────────────────────────────┘');
    console.log(`\nFiles: ${overall.fileCount} | Weights: B=${options.weights.branches}, F=${options.weights.functions}, L=${options.weights.lines} | Min lines: ${options.minLines}\n`);
    
    console.log(divider);
    console.log(
        'Priority'.padEnd(10) +
        'File'.padEnd(45) +
        'Lines'.padEnd(12) +
        'Funcs'.padEnd(12) +
        'Branch'.padEnd(12) +
        'Uncov Lines'.padEnd(12) +
        'Score'
    );
    console.log(divider);

    analyzed.forEach((item, index) => {
        const priority = index + 1;
        const fileName = item.file.length > 43 
            ? '...' + item.file.slice(-40) 
            : item.file;
        
        // Color coding based on coverage
        const colorLine = item.lines.coverage < 50 ? '\x1b[31m' :
            item.lines.coverage < 80 ? '\x1b[33m' : '\x1b[32m';
        const colorFunc = item.functions.coverage < 50 ? '\x1b[31m' :
            item.functions.coverage < 80 ? '\x1b[33m' : '\x1b[32m';
        const colorBranch = item.branches.coverage < 50 ? '\x1b[31m' :
            item.branches.coverage < 80 ? '\x1b[33m' : '\x1b[32m';
        const reset = '\x1b[0m';

        console.log(
            `#${priority}`.padEnd(10) +
            fileName.padEnd(45) +
            `${colorLine}${item.lines.coverage.toFixed(1)}%${reset}`.padEnd(21) +
            `${colorFunc}${item.functions.coverage.toFixed(1)}%${reset}`.padEnd(21) +
            `${colorBranch}${item.branches.coverage.toFixed(1)}%${reset}`.padEnd(21) +
            `${item.uncoveredLines}`.padEnd(12) +
            item.priorityScore.toFixed(1)
        );
    });

    console.log(divider);
    console.log(`\nTotal files analyzed: ${analyzed.length}`);
    
    // Summary stats
    const totalUncoveredLines = analyzed.reduce((sum, f) => sum + f.uncoveredLines, 0);
    const totalUncoveredBranches = analyzed.reduce((sum, f) => sum + f.uncoveredBranches, 0);
    console.log(`Total uncovered lines: ${totalUncoveredLines}`);
    console.log(`Total uncovered branches: ${totalUncoveredBranches}`);
    
    // Top 3 recommendations
    console.log('\n🎯 Recommended Focus (Top 3):\n');
    analyzed.slice(0, 3).forEach((item, i) => {
        const reasons = [];
        if (item.branches.coverage < 70) reasons.push(`${item.branches.found - item.branches.hit} untested branches`);
        if (item.functions.coverage < 80) reasons.push(`${item.functions.found - item.functions.hit} untested functions`);
        if (item.lines.coverage < 70) reasons.push(`${item.uncoveredLines} uncovered lines`);
        
        console.log(`  ${i + 1}. ${item.file}`);
        console.log(`     ${reasons.join(', ') || 'General coverage improvement'}\n`);
    });
}

// Main
function main() {
    const options = parseArgs();
    
    let lcovContent;
    try {
        lcovContent = readFileSync(LCOV_PATH, 'utf-8');
    } catch {
        console.error(`Error: Could not read ${LCOV_PATH}`);
        console.error('Run tests with coverage first: npm test -- --coverage');
        process.exit(1);
    }

    const files = parseLcov(lcovContent);
    
    // Calculate overall coverage from ALL files (before filtering)
    const overall = calculateOverallCoverage(files);
    
    // Filter and analyze
    const analyzed = files
        .filter(f => f.linesFound >= options.minLines)
        .map(f => analyzeFile(f, options.weights))
        .sort((a, b) => b.priorityScore - a.priorityScore);

    // Apply top limit if specified
    const results = options.top ? analyzed.slice(0, options.top) : analyzed;

    if (options.json) {
        console.log(JSON.stringify({ overall, files: results }, null, 2));
    } else {
        formatTable(results, options, overall);
    }
}

main();
