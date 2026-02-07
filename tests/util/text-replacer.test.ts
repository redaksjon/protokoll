import { describe, it, expect } from 'vitest';
import * as TextReplacer from '@/util/text-replacer';
import { SoundsLikeMapping } from '@/util/sounds-like-database';

describe('TextReplacer', () => {
    describe('basic replacement', () => {
        it('should replace a single occurrence', () => {
            const replacer = TextReplacer.create({ preserveCase: false });
            const mapping: SoundsLikeMapping = {
                soundsLike: 'observasion',
                correctText: 'Observasjon',
                entityType: 'project',
                entityId: 'observasjon',
                scopedToProjects: null,
                collisionRisk: 'none',
                tier: 1,
            };

            const result = replacer.applySingleReplacement(
                'I worked on observasion today',
                mapping
            );

            expect(result.text).toBe('I worked on Observasjon today');
            expect(result.count).toBe(1);
        });

        it('should replace multiple occurrences', () => {
            const replacer = TextReplacer.create({ preserveCase: false });
            const mapping: SoundsLikeMapping = {
                soundsLike: 'protocol',
                correctText: 'Protokoll',
                entityType: 'project',
                entityId: 'protokoll',
                scopedToProjects: ['protokoll'],
                collisionRisk: 'high',
                tier: 2,
            };

            const result = replacer.applySingleReplacement(
                'The protocol project uses a custom protocol',
                mapping
            );

            expect(result.text).toBe('The Protokoll project uses a custom Protokoll');
            expect(result.count).toBe(2);
        });
    });

    describe('case preservation', () => {
        it('should preserve lowercase', () => {
            const replacer = TextReplacer.create({ preserveCase: true });
            const mapping: SoundsLikeMapping = {
                soundsLike: 'protocol',
                correctText: 'Protokoll',
                entityType: 'project',
                entityId: 'protokoll',
                scopedToProjects: ['protokoll'],
                collisionRisk: 'high',
                tier: 2,
            };

            const result = replacer.applySingleReplacement('protocol', mapping);
            expect(result.text).toBe('protokoll');
        });

        it('should preserve title case', () => {
            const replacer = TextReplacer.create({ preserveCase: true });
            const mapping: SoundsLikeMapping = {
                soundsLike: 'protocol',
                correctText: 'Protokoll',
                entityType: 'project',
                entityId: 'protokoll',
                scopedToProjects: ['protokoll'],
                collisionRisk: 'high',
                tier: 2,
            };

            const result = replacer.applySingleReplacement('Protocol', mapping);
            expect(result.text).toBe('Protokoll');
        });

        it('should preserve uppercase', () => {
            const replacer = TextReplacer.create({ preserveCase: true });
            const mapping: SoundsLikeMapping = {
                soundsLike: 'protocol',
                correctText: 'Protokoll',
                entityType: 'project',
                entityId: 'protokoll',
                scopedToProjects: ['protokoll'],
                collisionRisk: 'high',
                tier: 2,
            };

            const result = replacer.applySingleReplacement('PROTOCOL', mapping);
            expect(result.text).toBe('PROTOKOLL');
        });
    });

    describe('word boundaries', () => {
        it('should respect word boundaries by default', () => {
            const replacer = TextReplacer.create({ useWordBoundaries: true, preserveCase: false });
            const mapping: SoundsLikeMapping = {
                soundsLike: 'call',
                correctText: 'Call',
                entityType: 'term',
                entityId: 'call',
                scopedToProjects: null,
                collisionRisk: 'none',
                tier: 1,
            };

            const result = replacer.applySingleReplacement(
                'Make a call but not recall',
                mapping
            );

            expect(result.text).toBe('Make a Call but not recall');
            expect(result.count).toBe(1);
        });
    });

    describe('multiple replacements', () => {
        it('should apply multiple mappings in sequence', () => {
            const replacer = TextReplacer.create({ preserveCase: false });
            const mappings: SoundsLikeMapping[] = [
                {
                    soundsLike: 'observasion',
                    correctText: 'Observasjon',
                    entityType: 'project',
                    entityId: 'observasjon',
                    scopedToProjects: null,
                    collisionRisk: 'none',
                    tier: 1,
                },
                {
                    soundsLike: 'acme',
                    correctText: 'Acme',
                    entityType: 'project',
                    entityId: 'acme',
                    scopedToProjects: null,
                    collisionRisk: 'none',
                    tier: 1,
                },
            ];

            const result = replacer.applyReplacements(
                'I worked on observasion and acme projects',
                mappings
            );

            expect(result.text).toBe('I worked on Observasjon and Acme projects');
            expect(result.count).toBe(2);
        });
    });
});
