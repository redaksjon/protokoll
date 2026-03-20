import { describe, expect, it } from 'vitest';
import { entityIdLookupOrder, resolveCanonicalEntityId } from '../../src/mcp/util/scopedEntityId';

describe('scopedEntityId', () => {
    const uuid = '8e15e64a-b554-414b-8e80-29b2a641aeda';

    it('resolveCanonicalEntityId returns bare uuid for server-scoped form', () => {
        expect(resolveCanonicalEntityId(`default-server:${uuid}`)).toBe(uuid);
        expect(resolveCanonicalEntityId(`default-server: ${uuid}`)).toBe(uuid);
    });

    it('resolveCanonicalEntityId returns second uuid when prefix is also a uuid', () => {
        const profile = '2a5d00d8-c679-45f8-8a92-c5efb999da01';
        expect(resolveCanonicalEntityId(`${profile}:${uuid}`)).toBe(uuid);
    });

    it('resolveCanonicalEntityId leaves non-uuid suffix unchanged', () => {
        expect(resolveCanonicalEntityId('my-slug')).toBe('my-slug');
        expect(resolveCanonicalEntityId('prefix:not-a-uuid')).toBe('prefix:not-a-uuid');
    });

    it('entityIdLookupOrder tries raw then canonical when they differ', () => {
        expect(entityIdLookupOrder(uuid)).toEqual([uuid]);
        expect(entityIdLookupOrder(`srv:${uuid}`)).toEqual([`srv:${uuid}`, uuid]);
    });
});
