#!/usr/bin/env node
import { access, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

const binTargets = [
    join(packageRoot, 'dist/mcp/server.js'),
    join(packageRoot, 'dist/mcp/server-hono.js'),
];

for (const target of binTargets) {
    try {
        await access(target);
        await chmod(target, 0o755);
    } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error
            ? error.code
            : undefined;
        if (code === 'ENOENT') {
            continue;
        }
        // eslint-disable-next-line no-console
        console.warn(`[postinstall] Failed to chmod ${target}:`, error);
    }
}
