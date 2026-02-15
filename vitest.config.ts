import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        setupFiles: ['tests/setup.ts'],
        include: ['tests/**/*.test.ts'],
        exclude: [
            'node_modules/**/*', 
            'dist/**/*',
            // CLI and interactive tests - functionality moved to protokoll-cli
            'tests/cli/**/*',
            'tests/interactive/**/*',
            'tests/arguments.test.ts',
            'tests/protokoll.test.ts',
            'tests/feedback/cli.test.ts',
            // Processor tests that expect interactive behavior
            'tests/processor.test.ts',
            'tests/pipeline/orchestrator.test.ts',
            // Resource tests that import from deleted CLI modules
            'tests/mcp/resources.test.ts',
        ],
        testTimeout: 30000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: [
                'dist/**/*', 
                'node_modules/**/*', 
                'tests/**/*', 
                'src/**/*.md', 
                'src/**/.DS_Store',
                // Most logic moved to @redaksjon/protokoll-engine
                // Only MCP server shell remains
            ],
            thresholds: {
                lines: 35,
                statements: 35,
                branches: 30,
                functions: 40,
            },
        },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
});

