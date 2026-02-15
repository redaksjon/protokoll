/**
 * Assist Tools Tests
 *
 * Tests for handleSuggestProjectMetadata and handleSuggestTermMetadata.
 * Mocks @/context. Business logic (ProjectAssist, TermAssist) is currently
 * stubbed - handlers throw until extraction from CLI.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    handleSuggestProjectMetadata,
    handleSuggestTermMetadata,
    suggestProjectMetadataTool,
    suggestTermMetadataTool,
} from '../../../src/mcp/tools/assistTools';

// Hoisted mocks - must be defined before vi.mock factories
const mockCreate = vi.hoisted(() => vi.fn());
const mockGetSmartAssistanceConfig = vi.hoisted(() => vi.fn());

vi.mock('@/context', () => ({
    create: (...args: unknown[]) => mockCreate(...args),
}));

describe('assistTools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreate.mockResolvedValue({
            getSmartAssistanceConfig: mockGetSmartAssistanceConfig,
        });
        mockGetSmartAssistanceConfig.mockReturnValue({
            enabled: true,
            termsEnabled: true,
        });
    });

    describe('tool definitions', () => {
        it('suggestProjectMetadataTool has correct schema', () => {
            expect(suggestProjectMetadataTool.name).toBe('protokoll_suggest_project_metadata');
            expect(suggestProjectMetadataTool.description).toContain('metadata suggestions');
            expect(suggestProjectMetadataTool.inputSchema).toMatchObject({
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    source: { type: 'string' },
                    contextDirectory: { type: 'string' },
                },
            });
        });

        it('suggestTermMetadataTool has correct schema', () => {
            expect(suggestTermMetadataTool.name).toBe('protokoll_suggest_term_metadata');
            expect(suggestTermMetadataTool.description).toContain('metadata suggestions');
            expect(suggestTermMetadataTool.inputSchema).toMatchObject({
                type: 'object',
                properties: {
                    term: { type: 'string' },
                    source: { type: 'string' },
                    expansion: { type: 'string' },
                    contextDirectory: { type: 'string' },
                },
                required: ['term'],
            });
        });
    });

    describe('handleSuggestProjectMetadata', () => {
        it('should throw when smart assistance is disabled', async () => {
            mockGetSmartAssistanceConfig.mockReturnValue({ enabled: false });

            await expect(
                handleSuggestProjectMetadata({
                    name: 'My Project',
                    contextDirectory: '/test/.protokoll',
                })
            ).rejects.toThrow('Smart assistance is disabled in configuration.');
        });

        it('should throw project unavailable when smart assistance is enabled', async () => {
            mockGetSmartAssistanceConfig.mockReturnValue({ enabled: true });

            await expect(
                handleSuggestProjectMetadata({
                    name: 'My Project',
                    source: 'https://example.com',
                    contextDirectory: '/test/.protokoll',
                })
            ).rejects.toThrow(
                'Project assistance temporarily unavailable - business logic needs extraction from CLI'
            );
        });

        it('should call Context.create with contextDirectory when provided', async () => {
            mockGetSmartAssistanceConfig.mockReturnValue({ enabled: true });

            await expect(
                handleSuggestProjectMetadata({
                    contextDirectory: '/custom/path/.protokoll',
                })
            ).rejects.toThrow('Project assistance temporarily unavailable');

            expect(mockCreate).toHaveBeenCalledWith({
                startingDir: '/custom/path/.protokoll',
            });
        });

        it('should call Context.create with process.cwd when contextDirectory omitted', async () => {
            const originalCwd = process.cwd;
            process.cwd = vi.fn().mockReturnValue('/default/cwd');

            mockGetSmartAssistanceConfig.mockReturnValue({ enabled: true });

            await expect(
                handleSuggestProjectMetadata({})
            ).rejects.toThrow('Project assistance temporarily unavailable');

            expect(mockCreate).toHaveBeenCalledWith({
                startingDir: '/default/cwd',
            });

            process.cwd = originalCwd;
        });

        it('should call getSmartAssistanceConfig on context', async () => {
            const mockContext = {
                getSmartAssistanceConfig: mockGetSmartAssistanceConfig,
            };
            mockCreate.mockResolvedValue(mockContext);
            mockGetSmartAssistanceConfig.mockReturnValue({ enabled: true });

            await expect(
                handleSuggestProjectMetadata({ name: 'Test' })
            ).rejects.toThrow('Project assistance temporarily unavailable');

            expect(mockGetSmartAssistanceConfig).toHaveBeenCalledTimes(1);
        });

        it('should propagate Context.create errors', async () => {
            mockCreate.mockRejectedValue(new Error('Context creation failed'));

            await expect(
                handleSuggestProjectMetadata({ contextDirectory: '/bad/path' })
            ).rejects.toThrow('Context creation failed');
        });
    });

    describe('handleSuggestTermMetadata', () => {
        it('should throw when smart assistance is disabled', async () => {
            mockGetSmartAssistanceConfig.mockReturnValue({ enabled: false });

            await expect(
                handleSuggestTermMetadata({
                    term: 'K8s',
                    contextDirectory: '/test/.protokoll',
                })
            ).rejects.toThrow('Term smart assistance is disabled in configuration.');
        });

        it('should throw when termsEnabled is false', async () => {
            mockGetSmartAssistanceConfig.mockReturnValue({
                enabled: true,
                termsEnabled: false,
            });

            await expect(
                handleSuggestTermMetadata({
                    term: 'K8s',
                    expansion: 'Kubernetes',
                })
            ).rejects.toThrow('Term smart assistance is disabled in configuration.');
        });

        it('should throw term unavailable when both enabled', async () => {
            mockGetSmartAssistanceConfig.mockReturnValue({
                enabled: true,
                termsEnabled: true,
            });

            await expect(
                handleSuggestTermMetadata({
                    term: 'K8s',
                    source: 'https://kubernetes.io',
                    expansion: 'Kubernetes',
                    contextDirectory: '/test/.protokoll',
                })
            ).rejects.toThrow(
                'Term assistance temporarily unavailable - business logic needs extraction from CLI'
            );
        });

        it('should accept term without optional args', async () => {
            mockGetSmartAssistanceConfig.mockReturnValue({
                enabled: true,
                termsEnabled: true,
            });

            await expect(
                handleSuggestTermMetadata({ term: 'API' })
            ).rejects.toThrow('Term assistance temporarily unavailable');
        });

        it('should call Context.create with contextDirectory when provided', async () => {
            mockGetSmartAssistanceConfig.mockReturnValue({
                enabled: true,
                termsEnabled: true,
            });

            await expect(
                handleSuggestTermMetadata({
                    term: 'Foo',
                    contextDirectory: '/my/.protokoll',
                })
            ).rejects.toThrow('Term assistance temporarily unavailable');

            expect(mockCreate).toHaveBeenCalledWith({
                startingDir: '/my/.protokoll',
            });
        });

        it('should call Context.create with process.cwd when contextDirectory omitted', async () => {
            const originalCwd = process.cwd;
            process.cwd = vi.fn().mockReturnValue('/home/user/project');

            mockGetSmartAssistanceConfig.mockReturnValue({
                enabled: true,
                termsEnabled: true,
            });

            await expect(
                handleSuggestTermMetadata({ term: 'Bar' })
            ).rejects.toThrow('Term assistance temporarily unavailable');

            expect(mockCreate).toHaveBeenCalledWith({
                startingDir: '/home/user/project',
            });

            process.cwd = originalCwd;
        });

        it('should propagate Context.create errors', async () => {
            mockCreate.mockRejectedValue(new Error('Context creation failed'));

            await expect(
                handleSuggestTermMetadata({
                    term: 'Baz',
                    contextDirectory: '/invalid',
                })
            ).rejects.toThrow('Context creation failed');
        });

        it('should pass when termsEnabled is undefined (defaults to enabled)', async () => {
            // When termsEnabled is undefined, the check `smartConfig.termsEnabled === false`
            // is false, so we proceed to the "unavailable" throw
            mockGetSmartAssistanceConfig.mockReturnValue({
                enabled: true,
                termsEnabled: undefined,
            });

            await expect(
                handleSuggestTermMetadata({ term: 'Acronym' })
            ).rejects.toThrow('Term assistance temporarily unavailable');
        });
    });
});
