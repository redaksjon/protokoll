import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        setupFiles: ['tests/setup.ts'],
        include: ['tests/**/*.test.ts'],
        exclude: ['node_modules/**/*', 'dist/**/*'],
        testTimeout: 30000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: ['dist/**/*', 'node_modules/**/*', 'tests/**/*', 'src/**/*.md', 'src/**/.DS_Store'],
            thresholds: {
                lines: 86,
                statements: 86,
                branches: 77,
                functions: 88,
            },
        },
    },
    resolve: {
        alias: {
            '@': new URL('./src', import.meta.url).pathname,
        },
    },
});

