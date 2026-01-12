/**
 * Tests for Feedback Handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ClassificationDecision, ClassificationFeedback, FeedbackAnalysis, LearningUpdate } from '../../src/feedback/types';

// Mock logging
const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

vi.mock('../../src/logging', () => ({
    getLogger: () => mockLogger,
}));

// Mock readline
vi.mock('readline', () => ({
    createInterface: vi.fn(() => ({
        question: vi.fn((q, cb) => cb('test')),
        close: vi.fn(),
    })),
}));

// Import after mocking
const { create } = await import('../../src/feedback/handler');

describe('Feedback Handler', () => {
    let tempDir: string;
    let mockAnalyzer: {
        analyze: ReturnType<typeof vi.fn>;
        applyUpdates: ReturnType<typeof vi.fn>;
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-handler-test-'));
        
        mockAnalyzer = {
            analyze: vi.fn(),
            applyUpdates: vi.fn(),
        };
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true });
    });

    const createMockDecision = (overrides?: Partial<ClassificationDecision>): ClassificationDecision => ({
        id: 'dec-test',
        transcriptPreview: 'Test transcript content...',
        audioFile: '/test/audio.m4a',
        projectId: null,
        destination: '~/notes',
        confidence: 0.5,
        timestamp: new Date(),
        reasoningTrace: {
            signalsDetected: [],
            projectsConsidered: [],
            finalReasoning: 'Default routing',
        },
        ...overrides,
    });

    describe('create', () => {
        it('should create a handler instance', () => {
            // @ts-ignore - mock analyzer
            const handler = create(mockAnalyzer, {
                feedbackDir: tempDir,
                interactive: false,
            });

            expect(handler).toBeDefined();
            expect(handler.collectFeedback).toBeDefined();
            expect(handler.processFeedback).toBeDefined();
            expect(handler.reviewAndApply).toBeDefined();
            expect(handler.saveFeedback).toBeDefined();
        });
    });

    describe('collectFeedback', () => {
        it('should return null in non-interactive mode', async () => {
            // @ts-ignore - mock analyzer
            const handler = create(mockAnalyzer, {
                feedbackDir: tempDir,
                interactive: false, // Not interactive
            });

            const result = await handler.collectFeedback(createMockDecision());

            expect(result).toBeNull();
            expect(mockLogger.warn).toHaveBeenCalled();
        });
    });

    describe('processFeedback', () => {
        it('should call analyzer.analyze with feedback', async () => {
            const mockAnalysis: FeedbackAnalysis = {
                diagnosis: 'Missing project',
                suggestedUpdates: [],
                confidence: 0.8,
            };
            mockAnalyzer.analyze.mockResolvedValue(mockAnalysis);

            // @ts-ignore - mock analyzer
            const handler = create(mockAnalyzer, {
                feedbackDir: tempDir,
                interactive: true,
            });

            const feedback: ClassificationFeedback = {
                transcriptPath: '/test/transcript.md',
                originalDecision: {
                    projectId: null,
                    destination: '~/notes',
                    confidence: 0.5,
                    reasoning: 'Default',
                },
                correction: {
                    projectId: 'wagner',
                    destination: '~/notes/wagner',
                },
                userReason: 'This was about Wagner',
                providedAt: new Date(),
            };

            const result = await handler.processFeedback(feedback);

            expect(mockAnalyzer.analyze).toHaveBeenCalledWith(feedback);
            expect(result.diagnosis).toBe('Missing project');
        });
    });

    describe('reviewAndApply', () => {
        it('should auto-apply high-confidence updates in non-interactive mode', async () => {
            mockAnalyzer.applyUpdates.mockResolvedValue(undefined);

            // @ts-ignore - mock analyzer
            const handler = create(mockAnalyzer, {
                feedbackDir: tempDir,
                interactive: false,
            });

            const analysis: FeedbackAnalysis = {
                diagnosis: 'Test',
                suggestedUpdates: [
                    {
                        type: 'new_project',
                        entityType: 'project',
                        entityId: 'high-conf',
                        changes: [],
                        reasoning: 'High confidence update',
                        confidence: 0.9, // High confidence
                    },
                    {
                        type: 'new_phrase',
                        entityType: 'project',
                        entityId: 'low-conf',
                        changes: [],
                        reasoning: 'Low confidence update',
                        confidence: 0.3, // Low confidence - should be skipped
                    },
                ],
                confidence: 0.8,
            };

            const applied = await handler.reviewAndApply(analysis);

            // Only high-confidence update should be applied
            expect(applied.length).toBe(1);
            expect(applied[0].entityId).toBe('high-conf');
            expect(mockAnalyzer.applyUpdates).toHaveBeenCalledWith([analysis.suggestedUpdates[0]]);
        });

        it('should return empty array when no high-confidence updates', async () => {
            // @ts-ignore - mock analyzer
            const handler = create(mockAnalyzer, {
                feedbackDir: tempDir,
                interactive: false,
            });

            const analysis: FeedbackAnalysis = {
                diagnosis: 'Test',
                suggestedUpdates: [
                    {
                        type: 'new_phrase',
                        entityType: 'project',
                        entityId: 'low-conf',
                        changes: [],
                        reasoning: 'Low confidence',
                        confidence: 0.5, // Below 0.8 threshold
                    },
                ],
                confidence: 0.5,
            };

            const applied = await handler.reviewAndApply(analysis);

            expect(applied).toEqual([]);
            expect(mockAnalyzer.applyUpdates).not.toHaveBeenCalled();
        });

        it('should return empty array when no updates suggested', async () => {
            // @ts-ignore - mock analyzer
            const handler = create(mockAnalyzer, {
                feedbackDir: tempDir,
                interactive: false,
            });

            const analysis: FeedbackAnalysis = {
                diagnosis: 'Test',
                suggestedUpdates: [],
                confidence: 0.8,
            };

            const applied = await handler.reviewAndApply(analysis);

            expect(applied).toEqual([]);
        });
    });

    describe('saveFeedback', () => {
        it('should save feedback to disk', async () => {
            // @ts-ignore - mock analyzer
            const handler = create(mockAnalyzer, {
                feedbackDir: tempDir,
                interactive: false,
            });

            const feedback: ClassificationFeedback = {
                transcriptPath: '/test/transcript.md',
                originalDecision: {
                    projectId: null,
                    destination: '~/notes',
                    confidence: 0.5,
                    reasoning: 'Default',
                },
                correction: {
                    projectId: 'test',
                },
                userReason: 'Test reason',
                providedAt: new Date(),
            };

            const analysis: FeedbackAnalysis = {
                diagnosis: 'Test diagnosis',
                suggestedUpdates: [],
                confidence: 0.8,
            };

            await handler.saveFeedback(feedback, analysis);

            // Check that a file was created
            const files = await fs.readdir(tempDir);
            const feedbackFiles = files.filter(f => f.startsWith('feedback-'));
            expect(feedbackFiles.length).toBe(1);

            // Check file contents
            const content = await fs.readFile(path.join(tempDir, feedbackFiles[0]), 'utf-8');
            const parsed = JSON.parse(content);
            expect(parsed.feedback.transcriptPath).toBe('/test/transcript.md');
            expect(parsed.analysis.diagnosis).toBe('Test diagnosis');
        });
    });
});
