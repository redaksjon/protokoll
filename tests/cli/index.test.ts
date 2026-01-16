/**
 * Tests for CLI index module
 */

import { describe, it, expect } from 'vitest';
import { isContextCommand } from '../../src/cli/index';

describe('CLI Index', () => {
    describe('isContextCommand', () => {
        it('should return true for project command', () => {
            const originalArgv = process.argv;
            process.argv = ['node', 'protokoll', 'project', 'list'];
            expect(isContextCommand()).toBe(true);
            process.argv = originalArgv;
        });

        it('should return true for person command', () => {
            const originalArgv = process.argv;
            process.argv = ['node', 'protokoll', 'person', 'list'];
            expect(isContextCommand()).toBe(true);
            process.argv = originalArgv;
        });

        it('should return true for term command', () => {
            const originalArgv = process.argv;
            process.argv = ['node', 'protokoll', 'term', 'list'];
            expect(isContextCommand()).toBe(true);
            process.argv = originalArgv;
        });

        it('should return true for company command', () => {
            const originalArgv = process.argv;
            process.argv = ['node', 'protokoll', 'company', 'list'];
            expect(isContextCommand()).toBe(true);
            process.argv = originalArgv;
        });

        it('should return true for ignored command', () => {
            const originalArgv = process.argv;
            process.argv = ['node', 'protokoll', 'ignored', 'list'];
            expect(isContextCommand()).toBe(true);
            process.argv = originalArgv;
        });

        it('should return true for context command', () => {
            const originalArgv = process.argv;
            process.argv = ['node', 'protokoll', 'context', 'status'];
            expect(isContextCommand()).toBe(true);
            process.argv = originalArgv;
        });

        it('should return false for empty args', () => {
            const originalArgv = process.argv;
            process.argv = ['node', 'protokoll'];
            expect(isContextCommand()).toBe(false);
            process.argv = originalArgv;
        });

        it('should return false for non-context commands', () => {
            const originalArgv = process.argv;
            process.argv = ['node', 'protokoll', '--input-directory', '/tmp'];
            expect(isContextCommand()).toBe(false);
            process.argv = originalArgv;
        });

        it('should return false for flag-like args', () => {
            const originalArgv = process.argv;
            process.argv = ['node', 'protokoll', '--verbose'];
            expect(isContextCommand()).toBe(false);
            process.argv = originalArgv;
        });
    });
});
