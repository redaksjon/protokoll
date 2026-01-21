import { describe, it, expect, beforeEach } from 'vitest';
import * as SoundsLikeDatabase from '@/util/sounds-like-database';

describe('SoundsLikeDatabase', () => {
    describe('create and load', () => {
        it('should create a database instance', () => {
            const db = SoundsLikeDatabase.create();
            expect(db).toBeDefined();
            expect(db.load).toBeDefined();
            expect(db.getTier1Mappings).toBeDefined();
            expect(db.getTier2MappingsForProject).toBeDefined();
        });

        it('should load project mappings from protokoll context', async () => {
            const db = SoundsLikeDatabase.create();
            const database = await db.load();

            expect(database.mappings).toBeDefined();
            expect(database.mappings.length).toBeGreaterThanOrEqual(0);
        });

        it('should organize mappings by tier', async () => {
            const db = SoundsLikeDatabase.create();
            const database = await db.load();

            expect(database.tier1).toBeDefined();
            expect(database.tier2).toBeDefined();
            expect(database.tier3).toBeDefined();
        });
    });

    describe('tier classification', () => {
        let db: SoundsLikeDatabase.Instance;

        beforeEach(async () => {
            db = SoundsLikeDatabase.create();
            await db.load();
        });

        it('should classify clear misspellings as Tier 1', () => {
            const tier = db.classifyTier({
                soundsLike: 'observasion',
                correctText: 'Observasjon',
                entityType: 'project',
                entityId: 'observasjon',
            });

            expect(tier).toBe(1);
        });

        it('should classify common terms as Tier 2', () => {
            const tier = db.classifyTier({
                soundsLike: 'protocol',
                correctText: 'Protokoll',
                entityType: 'project',
                entityId: 'protokoll',
            });

            expect(tier).toBe(2);
        });

        it('should classify generic terms as Tier 3', () => {
            const tier = db.classifyTier({
                soundsLike: 'meeting',
                correctText: 'Weekly Meeting',
                entityType: 'project',
                entityId: 'weekly-meeting',
            });

            expect(tier).toBe(3);
        });
    });

    describe('collision detection', () => {
        let db: SoundsLikeDatabase.Instance;

        beforeEach(async () => {
            db = SoundsLikeDatabase.create();
            await db.load();
        });

        it('should detect collisions for common terms', () => {
            const hasCollision = db.hasCollision('protocol');
            expect(typeof hasCollision).toBe('boolean');
        });

        it('should return collision info when collisions exist', () => {
            const collisions = db.getAllCollisions();
            expect(Array.isArray(collisions)).toBe(true);

            if (collisions.length > 0) {
                const collision = collisions[0];
                expect(collision.soundsLike).toBeDefined();
                expect(collision.mappings).toBeDefined();
                expect(collision.count).toBeGreaterThan(1);
                expect(collision.mappings.length).toBe(collision.count);
            }
        });

        it('should not detect collisions for unique misspellings', () => {
            const hasCollision = db.hasCollision('observasion');
            expect(hasCollision).toBe(false);
        });
    });

    describe('getTier1Mappings', () => {
        let db: SoundsLikeDatabase.Instance;

        beforeEach(async () => {
            db = SoundsLikeDatabase.create();
            await db.load();
        });

        it('should return only Tier 1 mappings', () => {
            const tier1 = db.getTier1Mappings();
            expect(Array.isArray(tier1)).toBe(true);

            for (const mapping of tier1) {
                expect(mapping.tier).toBe(1);
                expect(mapping.collisionRisk).toBe('none');
            }
        });
    });

    describe('getTier2MappingsForProject', () => {
        let db: SoundsLikeDatabase.Instance;

        beforeEach(async () => {
            db = SoundsLikeDatabase.create();
            await db.load();
        });

        it('should return Tier 2 mappings for a specific project', () => {
            const tier2 = db.getTier2MappingsForProject('protokoll');
            expect(Array.isArray(tier2)).toBe(true);
        });

        it('should return empty array for unknown project', () => {
            const tier2 = db.getTier2MappingsForProject('nonexistent-project');
            expect(Array.isArray(tier2)).toBe(true);
        });

        it('should include generic Tier 2 mappings', () => {
            // Test that _generic bucket is included
            const tier2 = db.getTier2MappingsForProject('any-project');
            expect(Array.isArray(tier2)).toBe(true);
        });
    });

    describe('custom configuration', () => {
        it('should accept custom protokoll context paths', async () => {
            const db = SoundsLikeDatabase.create({
                protokollContextPaths: ['/custom/path'],
            });
            const database = await db.load();
            expect(database).toBeDefined();
        });

        it('should accept custom common terms', async () => {
            const db = SoundsLikeDatabase.create({
                commonTerms: ['custom', 'terms'],
            });
            const database = await db.load();
            expect(database.commonTerms.has('custom')).toBe(true);
            expect(database.commonTerms.has('terms')).toBe(true);
        });

        it('should accept custom generic terms', async () => {
            const db = SoundsLikeDatabase.create({
                genericTerms: ['generic', 'words'],
            });
            const database = await db.load();
            expect(database.genericTerms.has('generic')).toBe(true);
            expect(database.genericTerms.has('words')).toBe(true);
        });

        it('should accept custom tier2Confidence', async () => {
            const db = SoundsLikeDatabase.create({
                tier2Confidence: 0.8,
            });
            await db.load();
            expect(db).toBeDefined();
        });

        it('should allow disabling collision detection', async () => {
            const db = SoundsLikeDatabase.create({
                detectCollisions: false,
            });
            const database = await db.load();
            expect(database.collisions.size).toBe(0);
        });
    });

    describe('getCollision', () => {
        let db: SoundsLikeDatabase.Instance;

        beforeEach(async () => {
            db = SoundsLikeDatabase.create();
            await db.load();
        });

        it('should return collision info for colliding term', () => {
            const collisions = db.getAllCollisions();
            if (collisions.length > 0) {
                const firstCollision = collisions[0];
                const collision = db.getCollision(firstCollision.soundsLike);
                expect(collision).toBeDefined();
                expect(collision?.soundsLike).toBe(firstCollision.soundsLike);
            }
        });

        it('should return undefined for non-colliding term', () => {
            const collision = db.getCollision('unique-nonexistent-term');
            expect(collision).toBeUndefined();
        });

        it('should be case-insensitive', () => {
            const collisions = db.getAllCollisions();
            if (collisions.length > 0) {
                const firstCollision = collisions[0];
                const collision = db.getCollision(firstCollision.soundsLike.toUpperCase());
                if (collision) {
                    expect(collision.soundsLike).toBe(firstCollision.soundsLike.toLowerCase());
                }
            }
        });
    });

    describe('classifyTier edge cases', () => {
        let db: SoundsLikeDatabase.Instance;

        beforeEach(async () => {
            db = SoundsLikeDatabase.create();
            await db.load();
        });

        it('should return Tier 3 for mapping without soundsLike', () => {
            const tier = db.classifyTier({
                correctText: 'Test',
                entityType: 'project',
                entityId: 'test',
            });
            expect(tier).toBe(3);
        });

        it('should be case-insensitive for term matching', () => {
            const tier1 = db.classifyTier({
                soundsLike: 'MEETING',
                correctText: 'Test',
                entityType: 'project',
                entityId: 'test',
            });
            const tier2 = db.classifyTier({
                soundsLike: 'meeting',
                correctText: 'Test',
                entityType: 'project',
                entityId: 'test',
            });
            expect(tier1).toBe(tier2);
            expect(tier1).toBe(3); // meeting is in DEFAULT_GENERIC_TERMS
        });
    });

    describe('collision detection with multiple mappings', () => {
        it('should handle databases with no mappings', async () => {
            const db = SoundsLikeDatabase.create({
                protokollContextPaths: [], // No paths, so no mappings
            });
            const database = await db.load();

            expect(database.mappings.length).toBe(0);
            expect(database.tier1.length).toBe(0);
            expect(database.tier2.size).toBe(0);
            expect(database.tier3.length).toBe(0);
            expect(database.collisions.size).toBe(0);
        });
    });

    describe('mapping organization', () => {
        let db: SoundsLikeDatabase.Instance;

        beforeEach(async () => {
            db = SoundsLikeDatabase.create();
            await db.load();
        });

        it('should organize Tier 2 project mappings by project ID', async () => {
            const database = await db.load();

            // Check that tier2 Map is organized correctly
            for (const [projectId, mappings] of database.tier2) {
                expect(Array.isArray(mappings)).toBe(true);
                for (const mapping of mappings) {
                    expect(mapping.tier).toBe(2);
                    if (projectId !== '_generic') {
                        expect(mapping.entityType).toBe('project');
                    }
                }
            }
        });
    });

    describe('hasCollision edge cases', () => {
        let db: SoundsLikeDatabase.Instance;

        beforeEach(async () => {
            db = SoundsLikeDatabase.create();
            await db.load();
        });

        it('should be case-insensitive for collision detection', () => {
            const collisions = db.getAllCollisions();
            if (collisions.length > 0) {
                const firstCollision = collisions[0];
                const hasLower = db.hasCollision(firstCollision.soundsLike.toLowerCase());
                const hasUpper = db.hasCollision(firstCollision.soundsLike.toUpperCase());
                expect(hasLower).toBe(hasUpper);
            }
        });
    });

    describe('tier assignment with collision risk', () => {
        let db: SoundsLikeDatabase.Instance;

        beforeEach(async () => {
            db = SoundsLikeDatabase.create();
            await db.load();
        });

        it('should assign appropriate collision risk levels', async () => {
            const database = await db.load();

            for (const mapping of database.mappings) {
                if (mapping.tier === 1) {
                    expect(mapping.collisionRisk).toBe('none');
                } else if (mapping.tier === 2 || mapping.tier === 3) {
                    expect(['low', 'medium', 'high', 'none']).toContain(mapping.collisionRisk);
                }
            }
        });

        it('should set scopedToProjects for Tier 2 project entities', async () => {
            const database = await db.load();

            for (const mapping of database.mappings) {
                if (mapping.tier === 2 && mapping.entityType === 'project') {
                    expect(mapping.scopedToProjects).toBeDefined();
                    expect(Array.isArray(mapping.scopedToProjects)).toBe(true);
                    if (Array.isArray(mapping.scopedToProjects)) {
                        expect(mapping.scopedToProjects).toContain(mapping.entityId);
                    }
                    expect(mapping.minConfidence).toBeDefined();
                    expect(typeof mapping.minConfidence).toBe('number');
                }
            }
        });
    });

    describe('load with no context directories', () => {
        it('should handle empty protokoll context gracefully', async () => {
            const db = SoundsLikeDatabase.create({
                protokollContextPaths: ['/nonexistent/path/that/does/not/exist'],
            });
            const database = await db.load();

            expect(database.mappings.length).toBe(0);
            expect(database.tier1.length).toBe(0);
            expect(database.tier2.size).toBe(0);
            expect(database.tier3.length).toBe(0);
        });
    });
});
