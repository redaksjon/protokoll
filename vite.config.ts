import { defineConfig } from 'vite';
import replace from '@rollup/plugin-replace';
import { execSync } from 'node:child_process';
import shebang from 'rollup-plugin-preserve-shebang';
import path from 'node:path';

let gitInfo = {
    branch: '',
    commit: '',
    tags: '',
    commitDate: '',
};

try {
    gitInfo = {
        branch: execSync('git rev-parse --abbrev-ref HEAD').toString().trim(),
        commit: execSync('git rev-parse --short HEAD').toString().trim(),
        tags: '',
        commitDate: execSync('git log -1 --format=%cd --date=iso').toString().trim(),
    };

    try {
        gitInfo.tags = execSync('git tag --points-at HEAD | paste -sd "," -').toString().trim();
    } catch {
        gitInfo.tags = '';
    }
} catch {
    // eslint-disable-next-line no-console
    console.log('Directory does not have a Git repository, skipping git info');
}


export default defineConfig({
    server: {
        port: 3000
    },
    plugins: [
        replace({
            '__VERSION__': process.env.npm_package_version,
            '__GIT_BRANCH__': gitInfo.branch,
            '__GIT_COMMIT__': gitInfo.commit,
            '__GIT_TAGS__': gitInfo.tags === '' ? '' : `T:${gitInfo.tags}`,
            '__GIT_COMMIT_DATE__': gitInfo.commitDate,
            '__SYSTEM_INFO__': `${process.platform} ${process.arch} ${process.version}`,
            preventAssignment: true,
        }),
        shebang({
            shebang: '#!/usr/bin/env node',
        }),
    ],
    build: {
        target: 'esnext',
        outDir: 'dist',
        ssr: true,
        rollupOptions: {
            external: [
                // Dependencies from package.json
                '@anthropic-ai/sdk',
                '@google/generative-ai',
                '@modelcontextprotocol/sdk',
                '@modelcontextprotocol/sdk/server/index.js',
                '@modelcontextprotocol/sdk/server/stdio.js',
                '@modelcontextprotocol/sdk/types.js',
                '@kjerneverk/riotprompt',
                '@utilarium/cardigantime',
                '@utilarium/dreadcabinet',
                '@types/fluent-ffmpeg',
                'commander',
                'dayjs',
                'dotenv',
                'fluent-ffmpeg',
                'glob',
                'js-yaml',
                'luxon',
                'moment-timezone',
                'openai',
                'winston',
                'zod',
                // Node.js built-in modules (node: prefix)
                /^node:/,
            ],
            input: {
                main: 'src/main.ts',
                'mcp/server': 'src/mcp/server.ts',
                'mcp/server-http': 'src/mcp/server-http.ts',
                'scripts/fix-duplicate-delimiters': 'scripts/fix-duplicate-delimiters.ts',
                'scripts/migrate-titles-to-frontmatter': 'scripts/migrate-titles-to-frontmatter.ts',
            },
            output: {
                format: 'esm',
                entryFileNames: '[name].js',
                chunkFileNames: '[name].js',
            },
        },
        modulePreload: false,
        minify: false,
        sourcemap: true
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
}); 