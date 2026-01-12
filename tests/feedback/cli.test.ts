/**
 * Tests for Feedback CLI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Command } from 'commander';

// Mock logging
const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

vi.mock('../../src/logging', () => ({
    getLogger: () => mockLogger,
    setLogLevel: vi.fn(),
}));

// Mock context
const mockContext = {
    getAllProjects: vi.fn(() => []),
    getProject: vi.fn(() => null),
    saveEntity: vi.fn(),
};

vi.mock('../../src/context', () => ({
    create: vi.fn(() => Promise.resolve(mockContext)),
}));

// Mock reasoning
vi.mock('../../src/reasoning', () => ({
    create: vi.fn(() => ({
        complete: vi.fn(),
    })),
}));

// Mock readline
vi.mock('readline', () => ({
    createInterface: vi.fn(() => ({
        question: vi.fn((q, cb) => cb('n')),
        close: vi.fn(),
    })),
}));

// Import after mocking
const { createFeedbackCommand } = await import('../../src/feedback/cli');

describe('Feedback CLI', () => {
    let tempDir: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-cli-test-'));
        
        // Create decisions directory with a sample decision
        const decisionsDir = path.join(tempDir, 'decisions');
        await fs.mkdir(decisionsDir, { recursive: true });
        
        const sampleDecision = {
            id: 'dec-test123',
            transcriptPreview: 'Sample transcript...',
            audioFile: '/test/sample.m4a',
            projectId: 'test-project',
            destination: '~/notes/test',
            confidence: 0.85,
            timestamp: new Date().toISOString(),
            reasoningTrace: {
                signalsDetected: [],
                projectsConsidered: [],
                finalReasoning: 'Test match',
            },
        };
        
        await fs.writeFile(
            path.join(decisionsDir, 'decision-dec-test123.json'),
            JSON.stringify(sampleDecision, null, 2)
        );
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true });
    });

    describe('createFeedbackCommand', () => {
        it('should create a Commander command', () => {
            const cmd = createFeedbackCommand();

            expect(cmd).toBeInstanceOf(Command);
            expect(cmd.name()).toBe('feedback');
        });

        it('should have expected options', () => {
            const cmd = createFeedbackCommand();
            const options = cmd.options;

            const optionNames = options.map(o => o.long);
            expect(optionNames).toContain('--recent');
            expect(optionNames).toContain('--file');
            expect(optionNames).toContain('--decision');
            expect(optionNames).toContain('--learn');
            expect(optionNames).toContain('--model');
        });

        it('should have correct description', () => {
            const cmd = createFeedbackCommand();
            
            expect(cmd.description()).toContain('feedback');
            expect(cmd.description()).toContain('classification');
        });
    });

    describe('command options parsing', () => {
        it('should parse --recent option', () => {
            const cmd = createFeedbackCommand();
            
            cmd.parse(['node', 'test', '--recent'], { from: 'user' });
            const opts = cmd.opts();
            
            expect(opts.recent).toBe(true);
        });

        it('should parse --decision option with value', () => {
            const cmd = createFeedbackCommand();
            
            cmd.parse(['node', 'test', '--decision', 'dec-abc123'], { from: 'user' });
            const opts = cmd.opts();
            
            expect(opts.decision).toBe('dec-abc123');
        });

        it('should parse --model option with value', () => {
            const cmd = createFeedbackCommand();
            
            cmd.parse(['node', 'test', '--model', 'gpt-4o'], { from: 'user' });
            const opts = cmd.opts();
            
            expect(opts.model).toBe('gpt-4o');
        });

        it('should have default model', () => {
            const cmd = createFeedbackCommand();
            
            cmd.parse(['node', 'test', '--recent'], { from: 'user' });
            const opts = cmd.opts();
            
            expect(opts.model).toBe('gpt-5.2');
        });

        it('should parse verbose and debug flags', () => {
            const cmd = createFeedbackCommand();
            
            cmd.parse(['node', 'test', '--verbose', '--debug'], { from: 'user' });
            const opts = cmd.opts();
            
            expect(opts.verbose).toBe(true);
            expect(opts.debug).toBe(true);
        });

        it('should parse --config-directory option', () => {
            const cmd = createFeedbackCommand();
            
            cmd.parse(['node', 'test', '--config-directory', '/custom/path'], { from: 'user' });
            const opts = cmd.opts();
            
            expect(opts.configDirectory).toBe('/custom/path');
        });

        it('should parse --list-pending option', () => {
            const cmd = createFeedbackCommand();
            
            cmd.parse(['node', 'test', '--list-pending'], { from: 'user' });
            const opts = cmd.opts();
            
            expect(opts.listPending).toBe(true);
        });
    });
});
