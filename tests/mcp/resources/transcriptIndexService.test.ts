import { describe, expect, it } from 'vitest';
import { transcriptReferencesEntity } from '../../../src/mcp/resources/transcriptIndexService';

describe('transcriptReferencesEntity', () => {
    it('matches a company reference when entity type is company', () => {
        expect(transcriptReferencesEntity({
            companies: [{ id: '4ec1dee6-cc33-45c2-8b01-29d5ff5feb74', name: 'Jae Evans' }],
            people: [{ id: 'other-person', name: 'Other Person' }],
        }, '4ec1dee6-cc33-45c2-8b01-29d5ff5feb74', 'company')).toBe(true);
    });

    it('does not match a different entity type bucket', () => {
        expect(transcriptReferencesEntity({
            companies: [{ id: '4ec1dee6-cc33-45c2-8b01-29d5ff5feb74', name: 'Jae Evans' }],
        }, '4ec1dee6-cc33-45c2-8b01-29d5ff5feb74', 'person')).toBe(false);
    });

    it('returns false when entities are missing', () => {
        expect(transcriptReferencesEntity(undefined, 'abc', 'company')).toBe(false);
    });
});
