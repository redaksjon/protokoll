/**
 * Tests for Decision Tracker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock logging
vi.mock('../../src/logging', () => ({
    getLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

// Import after mocking
const { create } = await import('../../src/feedback/decision-tracker');

describe('Decision Tracker', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-decision-test-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true });
    });

    describe('recordDecision', () => {
        it('should record a decision and assign an ID', () => {
            const tracker = create({
                storageDir: tempDir,
                maxInMemory: 10,
            });

            const decision = tracker.recordDecision({
                transcriptPreview: 'This is a test transcript about Project Alpha...',
                audioFile: '/test/audio.m4a',
                projectId: 'project-alpha',
                destination: '~/notes/projects/alpha',
                confidence: 0.95,
                reasoningTrace: {
                    signalsDetected: [
                        { type: 'explicit_phrase', value: 'project alpha', weight: 0.9, source: 'context' }
                    ],
                    projectsConsidered: [
                        { projectId: 'project-alpha', score: 0.95, matchedSignals: ['project alpha'] }
                    ],
                    finalReasoning: 'Matched explicit phrase "project alpha"',
                },
            });

            expect(decision.id).toBeDefined();
            expect(decision.id).toMatch(/^dec-/);
            expect(decision.timestamp).toBeInstanceOf(Date);
            expect(decision.projectId).toBe('project-alpha');
        });

        it('should limit in-memory decisions to maxInMemory', () => {
            const tracker = create({
                storageDir: tempDir,
                maxInMemory: 3,
            });

            // Record 5 decisions
            for (let i = 0; i < 5; i++) {
                tracker.recordDecision({
                    transcriptPreview: `Test ${i}`,
                    audioFile: `/test/audio${i}.m4a`,
                    projectId: null,
                    destination: '~/notes',
                    confidence: 0.5,
                    reasoningTrace: {
                        signalsDetected: [],
                        projectsConsidered: [],
                        finalReasoning: 'Default routing',
                    },
                });
            }

            // Should only keep most recent 3 in memory
            // (older ones are evicted)
        });
    });

    describe('getRecentDecisions', () => {
        it('should return recent decisions sorted by timestamp', async () => {
            const tracker = create({
                storageDir: tempDir,
                maxInMemory: 10,
            });

            tracker.recordDecision({
                transcriptPreview: 'First',
                audioFile: '/test/first.m4a',
                projectId: null,
                destination: '~/notes',
                confidence: 0.5,
                reasoningTrace: {
                    signalsDetected: [],
                    projectsConsidered: [],
                    finalReasoning: 'Default',
                },
            });

            // Small delay to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 10));

            tracker.recordDecision({
                transcriptPreview: 'Second',
                audioFile: '/test/second.m4a',
                projectId: 'test',
                destination: '~/notes/test',
                confidence: 0.8,
                reasoningTrace: {
                    signalsDetected: [],
                    projectsConsidered: [],
                    finalReasoning: 'Test project',
                },
            });

            const recent = await tracker.getRecentDecisions(10);
            
            expect(recent.length).toBe(2);
            // Most recent first
            expect(recent[0].transcriptPreview).toBe('Second');
            expect(recent[1].transcriptPreview).toBe('First');
        });

        it('should respect limit parameter', async () => {
            const tracker = create({
                storageDir: tempDir,
                maxInMemory: 10,
            });

            for (let i = 0; i < 5; i++) {
                tracker.recordDecision({
                    transcriptPreview: `Test ${i}`,
                    audioFile: `/test/audio${i}.m4a`,
                    projectId: null,
                    destination: '~/notes',
                    confidence: 0.5,
                    reasoningTrace: {
                        signalsDetected: [],
                        projectsConsidered: [],
                        finalReasoning: 'Default',
                    },
                });
            }

            const recent = await tracker.getRecentDecisions(2);
            expect(recent.length).toBe(2);
        });
    });

    describe('getDecision', () => {
        it('should retrieve a decision by ID', async () => {
            const tracker = create({
                storageDir: tempDir,
                maxInMemory: 10,
            });

            const recorded = tracker.recordDecision({
                transcriptPreview: 'Test transcript',
                audioFile: '/test/audio.m4a',
                projectId: 'test',
                destination: '~/notes/test',
                confidence: 0.9,
                reasoningTrace: {
                    signalsDetected: [],
                    projectsConsidered: [],
                    finalReasoning: 'Test',
                },
            });

            const retrieved = await tracker.getDecision(recorded.id);
            
            expect(retrieved).not.toBeNull();
            expect(retrieved?.id).toBe(recorded.id);
            expect(retrieved?.projectId).toBe('test');
        });

        it('should return null for unknown ID', async () => {
            const tracker = create({
                storageDir: tempDir,
                maxInMemory: 10,
            });

            const result = await tracker.getDecision('nonexistent-id');
            expect(result).toBeNull();
        });
    });

    describe('updateFeedbackStatus', () => {
        it('should update feedback status on a decision', async () => {
            const tracker = create({
                storageDir: tempDir,
                maxInMemory: 10,
            });

            const recorded = tracker.recordDecision({
                transcriptPreview: 'Test',
                audioFile: '/test/audio.m4a',
                projectId: null,
                destination: '~/notes',
                confidence: 0.5,
                reasoningTrace: {
                    signalsDetected: [],
                    projectsConsidered: [],
                    finalReasoning: 'Default',
                },
            });

            await tracker.updateFeedbackStatus(recorded.id, 'incorrect');

            const updated = await tracker.getDecision(recorded.id);
            expect(updated?.feedbackStatus).toBe('incorrect');
        });

        it('should handle unknown decision ID gracefully', async () => {
            const tracker = create({
                storageDir: tempDir,
                maxInMemory: 10,
            });

            // Should not throw
            await tracker.updateFeedbackStatus('unknown-id', 'correct');
        });
    });

    describe('saveDecisions', () => {
        it('should persist decisions to disk', async () => {
            const tracker = create({
                storageDir: tempDir,
                maxInMemory: 10,
            });

            const decision = tracker.recordDecision({
                transcriptPreview: 'Test',
                audioFile: '/test/audio.m4a',
                projectId: 'test',
                destination: '~/notes/test',
                confidence: 0.9,
                reasoningTrace: {
                    signalsDetected: [],
                    projectsConsidered: [],
                    finalReasoning: 'Test',
                },
            });

            await tracker.saveDecisions();

            // Check file exists
            const files = await fs.readdir(tempDir);
            expect(files.some(f => f.includes(decision.id))).toBe(true);
        });
    });
});

