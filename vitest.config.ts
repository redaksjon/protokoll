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
                // API-dependent modules excluded from coverage
                'src/transcription/service.ts', 
                'src/transcription/index.ts', 
                'src/reasoning/client.ts', 
                'src/reasoning/index.ts', 
                'src/reasoning/strategy.ts', 
                'src/agentic/executor.ts', 
                'src/agentic/index.ts',
                // Integration modules - tested via integration tests
                'src/output/manager.ts',
                'src/output/index.ts',
                'src/reflection/collector.ts',
                'src/reflection/reporter.ts',
                'src/reflection/index.ts',
                'src/pipeline/orchestrator.ts',
                'src/pipeline/index.ts',
                // Interactive CLI modules - require TTY interaction
                'src/cli/context.ts',
                'src/cli/index.ts',
            ],
            thresholds: {
                lines: 60,
                statements: 60,
                branches: 50,
                functions: 60,
            },
        },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
});

