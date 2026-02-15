/**
 * Tests for Resource Definitions
 */

import { describe, it, expect } from 'vitest';
import { directResources, resourceTemplates } from '../../../src/mcp/resources/definitions';

describe('definitions', () => {
    describe('directResources', () => {
        it('should be an array', () => {
            expect(Array.isArray(directResources)).toBe(true);
        });
    });

    describe('resourceTemplates', () => {
        it('should be an array', () => {
            expect(Array.isArray(resourceTemplates)).toBe(true);
        });

        it('should have transcript template', () => {
            const transcriptTemplate = resourceTemplates.find(t => 
                t.uriTemplate.includes('transcript')
            );
            expect(transcriptTemplate).toBeDefined();
        });

        it('should have entity template', () => {
            const entityTemplate = resourceTemplates.find(t => 
                t.uriTemplate.includes('entity')
            );
            expect(entityTemplate).toBeDefined();
        });

        it('should have config template', () => {
            const configTemplate = resourceTemplates.find(t => 
                t.uriTemplate.includes('config')
            );
            expect(configTemplate).toBeDefined();
        });

        it('should have transcripts list template', () => {
            const transcriptsTemplate = resourceTemplates.find(t => 
                t.uriTemplate.includes('transcripts')
            );
            expect(transcriptsTemplate).toBeDefined();
        });

        it('should have entities list template', () => {
            const entitiesTemplate = resourceTemplates.find(t => 
                t.uriTemplate.includes('entities')
            );
            expect(entitiesTemplate).toBeDefined();
        });

        it('should have audio inbound template', () => {
            const audioTemplate = resourceTemplates.find(t => 
                t.uriTemplate.includes('audio/inbound')
            );
            expect(audioTemplate).toBeDefined();
        });

        it('should have audio processed template', () => {
            const audioTemplate = resourceTemplates.find(t => 
                t.uriTemplate.includes('audio/processed')
            );
            expect(audioTemplate).toBeDefined();
        });

        it('should have all required fields', () => {
            resourceTemplates.forEach(template => {
                expect(template.uriTemplate).toBeDefined();
                expect(template.name).toBeDefined();
                expect(template.description).toBeDefined();
                expect(template.mimeType).toBeDefined();
            });
        });
    });
});
