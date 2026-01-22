/**
 * Tests for Collision Detector
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as CollisionDetector from '../../src/util/collision-detector';
import type { SoundsLikeMapping, Collision } from '../../src/util/sounds-like-database';

// Mock logging
vi.mock('../../src/logging', () => ({
    getLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

describe('Collision Detector', () => {
    let detector: CollisionDetector.Instance;

    beforeEach(() => {
        detector = CollisionDetector.create();
    });

    describe('create', () => {
        it('should create a detector instance with default config', () => {
            const instance = CollisionDetector.create();
            expect(instance).toBeDefined();
            expect(typeof instance.decideReplacement).toBe('function');
            expect(typeof instance.shouldApplyTier2).toBe('function');
            expect(typeof instance.resolveCollision).toBe('function');
            expect(typeof instance.detectCapitalizationHint).toBe('function');
        });

        it('should create a detector instance with custom config', () => {
            const instance = CollisionDetector.create({
                tier2MinConfidence: 0.7,
                tier2HighConfidence: 0.9,
                useCapitalizationHints: false,
                useSurroundingText: true,
            });
            expect(instance).toBeDefined();
        });
    });

    describe('shouldApplyTier2', () => {
        it('should return false for non-Tier 2 mappings', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 1,
            };
            const classification: CollisionDetector.Classification = {
                project: 'project1',
                confidence: 0.9,
            };

            expect(detector.shouldApplyTier2(mapping, classification)).toBe(false);
        });

        it('should return false when confidence is below threshold', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 2,
                minConfidence: 0.8,
            };
            const classification: CollisionDetector.Classification = {
                project: 'project1',
                confidence: 0.5,
            };

            expect(detector.shouldApplyTier2(mapping, classification)).toBe(false);
        });

        it('should return false when classification has no confidence', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 2,
                minConfidence: 0.6,
            };
            const classification: CollisionDetector.Classification = {
                project: 'project1',
            };

            expect(detector.shouldApplyTier2(mapping, classification)).toBe(false);
        });

        it('should return false when project is not in scope', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 2,
                scopedToProjects: ['project2', 'project3'],
            };
            const classification: CollisionDetector.Classification = {
                project: 'project1',
                confidence: 0.9,
            };

            expect(detector.shouldApplyTier2(mapping, classification)).toBe(false);
        });

        it('should return false when no project in classification but mapping is scoped', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 2,
                scopedToProjects: ['project1'],
            };
            const classification: CollisionDetector.Classification = {
                confidence: 0.9,
            };

            expect(detector.shouldApplyTier2(mapping, classification)).toBe(false);
        });

        it('should return true when all conditions are met', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 2,
                scopedToProjects: ['project1'],
            };
            const classification: CollisionDetector.Classification = {
                project: 'project1',
                confidence: 0.8,
            };

            expect(detector.shouldApplyTier2(mapping, classification)).toBe(true);
        });

        it('should return true for unscoped Tier 2 mapping with sufficient confidence', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 2,
            };
            const classification: CollisionDetector.Classification = {
                confidence: 0.7,
            };

            expect(detector.shouldApplyTier2(mapping, classification)).toBe(true);
        });

        it('should use default tier2MinConfidence when mapping has no minConfidence', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 2,
            };
            const classification: CollisionDetector.Classification = {
                confidence: 0.65,
            };

            expect(detector.shouldApplyTier2(mapping, classification)).toBe(true);
        });
    });

    describe('resolveCollision', () => {
        it('should prefer Tier 1 mapping when available', () => {
            const collision: Collision = {
                soundsLike: 'test',
                count: 2,
                mappings: [
                    {
                        soundsLike: 'test',
                        correctText: 'Test1',
                        entityType: 'term',
                        tier: 1,
                    },
                    {
                        soundsLike: 'test',
                        correctText: 'Test2',
                        entityType: 'term',
                        tier: 2,
                    },
                ],
            };
            const classification: CollisionDetector.Classification = {
                project: 'project1',
                confidence: 0.9,
            };

            const result = detector.resolveCollision(collision, classification);
            expect(result).toBeDefined();
            expect(result?.correctText).toBe('Test1');
        });

        it('should return null when multiple Tier 1 mappings exist', () => {
            const collision: Collision = {
                soundsLike: 'test',
                count: 2,
                mappings: [
                    {
                        soundsLike: 'test',
                        correctText: 'Test1',
                        entityType: 'term',
                        tier: 1,
                    },
                    {
                        soundsLike: 'test',
                        correctText: 'Test2',
                        entityType: 'term',
                        tier: 1,
                    },
                ],
            };
            const classification: CollisionDetector.Classification = {
                confidence: 0.9,
            };

            const result = detector.resolveCollision(collision, classification);
            expect(result).toBeNull();
        });

        it('should use Tier 2 mapping when no Tier 1 is available', () => {
            const collision: Collision = {
                soundsLike: 'test',
                count: 1,
                mappings: [
                    {
                        soundsLike: 'test',
                        correctText: 'Test2',
                        entityType: 'term',
                        tier: 2,
                    },
                ],
            };
            const classification: CollisionDetector.Classification = {
                confidence: 0.8,
            };

            const result = detector.resolveCollision(collision, classification);
            expect(result).toBeDefined();
            expect(result?.correctText).toBe('Test2');
        });

        it('should return null when multiple Tier 2 mappings match', () => {
            const collision: Collision = {
                soundsLike: 'test',
                count: 2,
                mappings: [
                    {
                        soundsLike: 'test',
                        correctText: 'Test1',
                        entityType: 'term',
                        tier: 2,
                        scopedToProjects: ['project1'],
                    },
                    {
                        soundsLike: 'test',
                        correctText: 'Test2',
                        entityType: 'term',
                        tier: 2,
                        scopedToProjects: ['project1'],
                    },
                ],
            };
            const classification: CollisionDetector.Classification = {
                project: 'project1',
                confidence: 0.8,
            };

            const result = detector.resolveCollision(collision, classification);
            expect(result).toBeNull();
        });

        it('should return null when no applicable mappings exist', () => {
            const collision: Collision = {
                soundsLike: 'test',
                count: 1,
                mappings: [
                    {
                        soundsLike: 'test',
                        correctText: 'Test',
                        entityType: 'term',
                        tier: 2,
                        scopedToProjects: ['project2'],
                    },
                ],
            };
            const classification: CollisionDetector.Classification = {
                project: 'project1',
                confidence: 0.8,
            };

            const result = detector.resolveCollision(collision, classification);
            expect(result).toBeNull();
        });
    });

    describe('detectCapitalizationHint', () => {
        it('should return unknown when capitalization hints are disabled', () => {
            const detectorNoHints = CollisionDetector.create({ useCapitalizationHints: false });
            const result = detectorNoHints.detectCapitalizationHint(
                'test',
                'This is a Test case'
            );
            expect(result).toBe('unknown');
        });

        it('should return unknown when surrounding text is empty', () => {
            const result = detector.detectCapitalizationHint('test', '');
            expect(result).toBe('unknown');
        });

        it('should return unknown when sounds_like is not found in text', () => {
            const result = detector.detectCapitalizationHint('test', 'This is different text');
            expect(result).toBe('unknown');
        });

        it('should return common-term when word is lowercase', () => {
            const result = detector.detectCapitalizationHint('test', 'This is a test case');
            expect(result).toBe('common-term');
        });

        it('should return unknown when word is capitalized at sentence start', () => {
            const result = detector.detectCapitalizationHint('test', 'Test is here');
            expect(result).toBe('unknown');
        });

        it('should return unknown when word is capitalized after period', () => {
            const result = detector.detectCapitalizationHint('test', 'Something here. Test is next');
            expect(result).toBe('unknown');
        });

        it('should return proper-noun when word is capitalized mid-sentence', () => {
            const result = detector.detectCapitalizationHint('test', 'This is a Test case');
            expect(result).toBe('proper-noun');
        });

        it('should handle question mark as sentence boundary', () => {
            const result = detector.detectCapitalizationHint('test', 'What? Test is next');
            expect(result).toBe('unknown');
        });

        it('should handle exclamation mark as sentence boundary', () => {
            const result = detector.detectCapitalizationHint('test', 'Wow! Test is next');
            expect(result).toBe('unknown');
        });
    });

    describe('decideReplacement', () => {
        it('should not replace when no mappings are available', () => {
            const context: CollisionDetector.CollisionContext = {
                classification: { confidence: 0.9 },
                soundsLike: 'test',
                availableMappings: [],
            };

            const decision = detector.decideReplacement(context);
            expect(decision.shouldReplace).toBe(false);
            expect(decision.reason).toBe('No mappings available');
            expect(decision.confidence).toBe(1.0);
        });

        it('should apply single Tier 1 mapping', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 1,
            };
            const context: CollisionDetector.CollisionContext = {
                classification: { confidence: 0.9 },
                soundsLike: 'test',
                availableMappings: [mapping],
            };

            const decision = detector.decideReplacement(context);
            expect(decision.shouldReplace).toBe(true);
            expect(decision.mapping).toEqual(mapping);
            expect(decision.reason).toBe('Tier 1 mapping (always safe)');
            expect(decision.confidence).toBe(1.0);
        });

        it('should apply single Tier 2 mapping when conditions are met', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 2,
            };
            const context: CollisionDetector.CollisionContext = {
                classification: { project: 'project1', confidence: 0.8 },
                soundsLike: 'test',
                availableMappings: [mapping],
            };

            const decision = detector.decideReplacement(context);
            expect(decision.shouldReplace).toBe(true);
            expect(decision.mapping).toEqual(mapping);
            expect(decision.reason).toContain('Tier 2 mapping');
            expect(decision.confidence).toBe(0.8);
        });

        it('should not apply single Tier 2 mapping when conditions are not met', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 2,
                minConfidence: 0.9,
            };
            const context: CollisionDetector.CollisionContext = {
                classification: { confidence: 0.5 },
                soundsLike: 'test',
                availableMappings: [mapping],
            };

            const decision = detector.decideReplacement(context);
            expect(decision.shouldReplace).toBe(false);
            expect(decision.reason).toBe('Tier 2 conditions not met');
            expect(decision.confidence).toBe(0.5);
        });

        it('should not apply Tier 3 mapping', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 3,
            };
            const context: CollisionDetector.CollisionContext = {
                classification: { confidence: 0.9 },
                soundsLike: 'test',
                availableMappings: [mapping],
            };

            const decision = detector.decideReplacement(context);
            expect(decision.shouldReplace).toBe(false);
            expect(decision.reason).toBe('Tier 3 mapping (too ambiguous)');
            expect(decision.confidence).toBe(1.0);
        });

        it('should resolve collision with multiple mappings', () => {
            const mappings: SoundsLikeMapping[] = [
                {
                    soundsLike: 'test',
                    correctText: 'Test1',
                    entityType: 'term',
                    tier: 1,
                },
                {
                    soundsLike: 'test',
                    correctText: 'Test2',
                    entityType: 'term',
                    tier: 2,
                },
            ];
            const context: CollisionDetector.CollisionContext = {
                classification: { confidence: 0.8 },
                soundsLike: 'test',
                availableMappings: mappings,
            };

            const decision = detector.decideReplacement(context);
            expect(decision.shouldReplace).toBe(true);
            expect(decision.mapping?.correctText).toBe('Test1');
            expect(decision.reason).toContain('Collision resolved');
        });

        it('should not replace when collision cannot be resolved', () => {
            const mappings: SoundsLikeMapping[] = [
                {
                    soundsLike: 'test',
                    correctText: 'Test1',
                    entityType: 'term',
                    tier: 1,
                },
                {
                    soundsLike: 'test',
                    correctText: 'Test2',
                    entityType: 'term',
                    tier: 1,
                },
            ];
            const context: CollisionDetector.CollisionContext = {
                classification: { confidence: 0.8 },
                soundsLike: 'test',
                availableMappings: mappings,
            };

            const decision = detector.decideReplacement(context);
            expect(decision.shouldReplace).toBe(false);
            expect(decision.reason).toBe('Collision could not be resolved');
        });

        it('should use capitalization hint when collision cannot be resolved', () => {
            const mappings: SoundsLikeMapping[] = [
                {
                    soundsLike: 'test',
                    correctText: 'Test1',
                    entityType: 'term',
                    tier: 2,
                    scopedToProjects: ['project1'],
                },
                {
                    soundsLike: 'test',
                    correctText: 'Test2',
                    entityType: 'term',
                    tier: 2,
                    scopedToProjects: ['project2'],
                },
            ];
            const context: CollisionDetector.CollisionContext = {
                classification: { confidence: 0.8 },
                soundsLike: 'test',
                availableMappings: mappings,
                surroundingText: 'This is a test case',
            };

            const decision = detector.decideReplacement(context);
            expect(decision.shouldReplace).toBe(false);
            expect(decision.reason).toBe('Capitalization hint suggests common term');
            expect(decision.confidence).toBe(0.7);
        });

        it('should handle missing confidence in classification', () => {
            const mapping: SoundsLikeMapping = {
                soundsLike: 'test',
                correctText: 'Test',
                entityType: 'term',
                tier: 2,
            };
            const context: CollisionDetector.CollisionContext = {
                classification: {},
                soundsLike: 'test',
                availableMappings: [mapping],
            };

            const decision = detector.decideReplacement(context);
            expect(decision.confidence).toBe(0.5);
        });
    });
});
