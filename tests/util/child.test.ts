/**
 * Tests for child process utility
 */

import { describe, it, expect } from 'vitest';
import { run } from '../../src/util/child';

describe('child', () => {
    describe('run', () => {
        it('should be defined', () => {
            expect(run).toBeDefined();
            expect(typeof run).toBe('function');
        });

        it('should execute simple command', async () => {
            const result = await run('echo "test"');
            expect(result).toBeDefined();
            expect(result.stdout).toBeDefined();
            expect(result.stderr).toBeDefined();
        });

        it('should handle command with options', async () => {
            const result = await run('echo "test"', { cwd: process.cwd() });
            expect(result).toBeDefined();
        });
    });
});
