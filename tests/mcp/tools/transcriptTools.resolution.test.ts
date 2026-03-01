import { describe, expect, it } from 'vitest';
import { transcriptResolutionTestHelpers } from '../../../src/mcp/tools/transcriptTools';

describe('transcript resolution helpers', () => {
    describe('toStoragePathCandidates', () => {
        it('returns empty candidates for blank input', () => {
            expect(transcriptResolutionTestHelpers.toStoragePathCandidates('   ')).toEqual([]);
        });

        it('supports transcript URIs and strips extension variants', () => {
            const candidates = transcriptResolutionTestHelpers.toStoragePathCandidates(
                'protokoll://transcript/2026/2/12-1606-meeting.pkl'
            );

            expect(candidates).toContain('2026/2/12-1606-meeting');
            expect(candidates).toContain('2026/2/12-1606-meeting.pkl');
        });

        it('strips query string fragments from transcript URIs', () => {
            const candidates = transcriptResolutionTestHelpers.toStoragePathCandidates(
                'protokoll://transcript/2026/2/12-1606-meeting.pkl?source=detail#frag'
            );

            expect(candidates).toContain('2026/2/12-1606-meeting');
            expect(candidates).toContain('2026/2/12-1606-meeting.pkl');
        });

        it('normalizes legacy uri prefix traversal segments', () => {
            const candidates = transcriptResolutionTestHelpers.toStoragePathCandidates(
                'protokoll://transcript/../2026/2/12-1606-meeting.pkl'
            );

            expect(candidates).toContain('2026/2/12-1606-meeting');
            expect(candidates).toContain('2026/2/12-1606-meeting.pkl');
        });

        it('normalizes slash and backslash variants for path input', () => {
            const candidates = transcriptResolutionTestHelpers.toStoragePathCandidates(
                '\\2026\\2\\12-1606-meeting.pkl'
            );
            expect(candidates).toContain('/2026/2/12-1606-meeting');
            expect(candidates).toContain('/2026/2/12-1606-meeting.pkl');
        });

        it('does not throw on malformed URI encoding', () => {
            const malformed = 'protokoll://transcript/2026/2/bad%ZZ-name';
            expect(() => transcriptResolutionTestHelpers.toStoragePathCandidates(malformed)).not.toThrow();
        });
    });

    describe('resolveStorageTranscriptPath', () => {
        it('returns direct existing candidate', async () => {
            const outputStorage = {
                exists: async (path: string) => path === '2026/2/12-1606-meeting.pkl',
                listFiles: async () => [],
            };

            const resolved = await transcriptResolutionTestHelpers.resolveStorageTranscriptPath(
                'protokoll://transcript/2026/2/12-1606-meeting',
                outputStorage
            );

            expect(resolved).toBe('2026/2/12-1606-meeting.pkl');
        });

        it('throws on ambiguous basename-only matches', async () => {
            const outputStorage = {
                exists: async () => false,
                listFiles: async () => [
                    '2026/2/12-1606-meeting.pkl',
                    '2026/3/12-1606-meeting.pkl',
                ],
            };

            await expect(
                transcriptResolutionTestHelpers.resolveStorageTranscriptPath(
                    '12-1606-meeting.pkl',
                    outputStorage
                )
            ).rejects.toThrow('Ambiguous transcript reference');
        });

        it('does not fall back to basename search for folder-qualified refs', async () => {
            const outputStorage = {
                exists: async () => false,
                listFiles: async () => ['2025/1/12-1606-meeting.pkl'],
            };

            const resolved = await transcriptResolutionTestHelpers.resolveStorageTranscriptPath(
                '2026/2/12-1606-meeting.pkl',
                outputStorage
            );

            expect(resolved).toBeNull();
        });

        it('returns null when basename fallback finds no matches', async () => {
            const outputStorage = {
                exists: async () => false,
                listFiles: async () => ['2025/1/other-name.pkl'],
            };

            const resolved = await transcriptResolutionTestHelpers.resolveStorageTranscriptPath(
                'same-name.pkl',
                outputStorage
            );

            expect(resolved).toBeNull();
        });
    });
});
