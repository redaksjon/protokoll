import { describe, expect, it } from 'vitest';
import { transcriptReferencesEntity } from '../../../src/mcp/resources/transcriptIndexService';

describe('transcriptReferencesEntity', () => {
    it('matches a company reference when entity type is company', () => {
        expect(transcriptReferencesEntity({
            companies: [{ id: '2a211344-754e-46ba-aeff-c55df927f134', name: 'Initech' }],
            people: [{ id: 'other-person', name: 'Other Person' }],
        }, '2a211344-754e-46ba-aeff-c55df927f134', 'company')).toBe(true);
    });

    it('does not match a different entity type bucket', () => {
        expect(transcriptReferencesEntity({
            companies: [{ id: '2a211344-754e-46ba-aeff-c55df927f134', name: 'Initech' }],
        }, '2a211344-754e-46ba-aeff-c55df927f134', 'person')).toBe(false);
    });

    it('returns false when entities are missing', () => {
        expect(transcriptReferencesEntity(undefined, 'abc', 'company')).toBe(false);
    });
});
