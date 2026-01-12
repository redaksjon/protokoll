/**
 * Tests for Feedback Analyzer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logging
vi.mock('../../src/logging', () => ({
    getLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

// Mock reasoning
const mockReasoning = {
    complete: vi.fn(),
};

vi.mock('../../src/reasoning', () => ({
    create: vi.fn(() => mockReasoning),
}));

// Mock context
const mockContext = {
    getAllProjects: vi.fn(() => []),
    getProject: vi.fn(() => null),
    saveEntity: vi.fn(),
};

// Import after mocking
const { create } = await import('../../src/feedback/analyzer');

describe('Feedback Analyzer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockContext.getAllProjects.mockReturnValue([
            {
                id: 'existing-project',
                name: 'Existing Project',
                classification: {
                    context_type: 'work',
                    explicit_phrases: ['existing'],
                    topics: [],
                },
                routing: {
                    destination: '~/notes/existing',
                },
            },
        ]);
    });

    describe('analyze', () => {
        it('should analyze feedback and return suggestions', async () => {
            mockReasoning.complete.mockResolvedValue({
                content: JSON.stringify({
                    diagnosis: 'Missing trigger phrase for Wagner project',
                    suggestedUpdates: [
                        {
                            type: 'new_project',
                            entityType: 'project',
                            entityId: 'wagner',
                            changes: [
                                { field: 'name', newValue: 'Wagner' },
                                { field: 'destination', newValue: '~/notes/projects/wagner' },
                                { field: 'explicit_phrases', newValue: ['wagner', 'update on wagner'] },
                            ],
                            reasoning: 'User indicated this is a new project',
                            confidence: 0.9,
                        },
                    ],
                    confidence: 0.85,
                }),
            });

            // @ts-ignore - mock context
            const analyzer = create(mockReasoning, mockContext, {
                model: 'gpt-5.2',
                autoApplyThreshold: 0.8,
            });

            const feedback = {
                transcriptPath: '/test/transcript.md',
                originalDecision: {
                    projectId: null,
                    destination: '~/notes',
                    confidence: 1.0,
                    reasoning: 'No project matches found',
                },
                correction: {
                    projectId: 'wagner',
                    destination: '~/notes/projects/wagner',
                },
                userReason: 'This was about the Wagner project',
                providedAt: new Date(),
            };

            const analysis = await analyzer.analyze(feedback);

            expect(analysis.diagnosis).toBe('Missing trigger phrase for Wagner project');
            expect(analysis.suggestedUpdates.length).toBe(1);
            expect(analysis.suggestedUpdates[0].entityId).toBe('wagner');
            expect(analysis.confidence).toBe(0.85);
        });

        it('should return basic analysis on reasoning failure', async () => {
            mockReasoning.complete.mockRejectedValue(new Error('API error'));

            // @ts-ignore - mock context
            const analyzer = create(mockReasoning, mockContext, {
                model: 'gpt-5.2',
                autoApplyThreshold: 0.8,
            });

            const feedback = {
                transcriptPath: '/test/transcript.md',
                originalDecision: {
                    projectId: null,
                    destination: '~/notes',
                    confidence: 1.0,
                    reasoning: 'Default',
                },
                correction: {},
                userReason: 'Test',
                providedAt: new Date(),
            };

            const analysis = await analyzer.analyze(feedback);

            expect(analysis.diagnosis).toContain('Unable to analyze');
            expect(analysis.suggestedUpdates).toEqual([]);
            expect(analysis.confidence).toBe(0);
        });
    });

    describe('applyUpdates', () => {
        it('should apply new project updates', async () => {
            // @ts-ignore - mock context
            const analyzer = create(mockReasoning, mockContext, {
                model: 'gpt-5.2',
                autoApplyThreshold: 0.5,
            });

            const updates = [
                {
                    type: 'new_project' as const,
                    entityType: 'project' as const,
                    entityId: 'wagner',
                    changes: [
                        { field: 'name', newValue: 'Wagner' },
                        { field: 'destination', newValue: '~/notes/projects/wagner' },
                        { field: 'explicit_phrases', newValue: ['wagner'] },
                    ],
                    reasoning: 'New project',
                    confidence: 0.9,
                },
            ];

            await analyzer.applyUpdates(updates);

            expect(mockContext.saveEntity).toHaveBeenCalled();
            const savedEntity = mockContext.saveEntity.mock.calls[0][0];
            expect(savedEntity.id).toBe('wagner');
            expect(savedEntity.type).toBe('project');
        });

        it('should skip low-confidence updates', async () => {
            // @ts-ignore - mock context
            const analyzer = create(mockReasoning, mockContext, {
                model: 'gpt-5.2',
                autoApplyThreshold: 0.8,
            });

            const updates = [
                {
                    type: 'new_project' as const,
                    entityType: 'project' as const,
                    entityId: 'low-confidence',
                    changes: [],
                    reasoning: 'Low confidence update',
                    confidence: 0.5, // Below threshold
                },
            ];

            await analyzer.applyUpdates(updates);

            expect(mockContext.saveEntity).not.toHaveBeenCalled();
        });

        it('should apply phrase updates to existing projects', async () => {
            mockContext.getProject.mockReturnValue({
                id: 'existing-project',
                name: 'Existing Project',
                type: 'project',
                classification: {
                    context_type: 'work',
                    explicit_phrases: ['existing'],
                    topics: [],
                },
                routing: {
                    destination: '~/notes/existing',
                    structure: 'month',
                    filename_options: ['date', 'time', 'subject'],
                },
            });

            // @ts-ignore - mock context
            const analyzer = create(mockReasoning, mockContext, {
                model: 'gpt-5.2',
                autoApplyThreshold: 0.5,
            });

            const updates = [
                {
                    type: 'new_phrase' as const,
                    entityType: 'project' as const,
                    entityId: 'existing-project',
                    changes: [
                        { field: 'explicit_phrases', newValue: ['new phrase'] },
                    ],
                    reasoning: 'Add new trigger phrase',
                    confidence: 0.9,
                },
            ];

            await analyzer.applyUpdates(updates);

            expect(mockContext.saveEntity).toHaveBeenCalled();
            const savedEntity = mockContext.saveEntity.mock.calls[0][0];
            expect(savedEntity.classification.explicit_phrases).toContain('existing');
            expect(savedEntity.classification.explicit_phrases).toContain('new phrase');
        });

        it('should handle missing project for update gracefully', async () => {
            mockContext.getProject.mockReturnValue(null);

            // @ts-ignore - mock context
            const analyzer = create(mockReasoning, mockContext, {
                model: 'gpt-5.2',
                autoApplyThreshold: 0.5,
            });

            const updates = [
                {
                    type: 'new_phrase' as const,
                    entityType: 'project' as const,
                    entityId: 'nonexistent',
                    changes: [],
                    reasoning: 'Update nonexistent',
                    confidence: 0.9,
                },
            ];

            // Should not throw
            await analyzer.applyUpdates(updates);
            expect(mockContext.saveEntity).not.toHaveBeenCalled();
        });
    });
});

