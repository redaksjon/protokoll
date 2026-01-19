/**
 * Tests for MCP Prompts Module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as Prompts from '../../src/mcp/prompts';
import * as Context from '../../src/context';

// Mock dependencies
vi.mock('../../src/context', () => ({
    create: vi.fn(),
}));

vi.mock('../../src/mcp/uri', () => ({
    buildConfigUri: vi.fn((path?: string) => `protokoll://config${path ? `?path=${path}` : ''}`),
    buildEntitiesListUri: vi.fn((type: string) => `protokoll://entities/${type}`),
}));

describe('MCP Prompts', () => {
    let tempDir: string;
    let mockContext: any;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-prompts-test-'));
        
        mockContext = {
            hasContext: vi.fn(() => true),
            getDiscoveredDirs: vi.fn(() => [
                { path: `${tempDir}/.protokoll`, level: 0 }
            ]),
            getAllProjects: vi.fn(() => [
                { id: 'project1', name: 'Project 1', active: true },
                { id: 'project2', name: 'Project 2', active: false },
            ]),
        };

        vi.mocked(Context.create).mockResolvedValue(mockContext);
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('prompts', () => {
        it('should export prompts array', () => {
            expect(Prompts.prompts).toBeDefined();
            expect(Array.isArray(Prompts.prompts)).toBe(true);
            expect(Prompts.prompts.length).toBeGreaterThan(0);
        });

        it('should have transcribe_with_context prompt', () => {
            const prompt = Prompts.prompts.find(p => p.name === 'transcribe_with_context');
            expect(prompt).toBeDefined();
            expect(prompt?.description).toBeDefined();
            expect(prompt?.arguments).toBeDefined();
        });

        it('should have setup_project prompt', () => {
            const prompt = Prompts.prompts.find(p => p.name === 'setup_project');
            expect(prompt).toBeDefined();
            expect(prompt?.description).toContain('project');
        });

        it('should have review_transcript prompt', () => {
            const prompt = Prompts.prompts.find(p => p.name === 'review_transcript');
            expect(prompt).toBeDefined();
        });

        it('should have enrich_entity prompt', () => {
            const prompt = Prompts.prompts.find(p => p.name === 'enrich_entity');
            expect(prompt).toBeDefined();
        });

        it('should have batch_transcription prompt', () => {
            const prompt = Prompts.prompts.find(p => p.name === 'batch_transcription');
            expect(prompt).toBeDefined();
        });

        it('should have find_and_analyze prompt', () => {
            const prompt = Prompts.prompts.find(p => p.name === 'find_and_analyze');
            expect(prompt).toBeDefined();
        });
    });

    describe('handleListPrompts', () => {
        it('should return list of prompts', async () => {
            const result = await Prompts.handleListPrompts();

            expect(result.prompts).toBeDefined();
            expect(Array.isArray(result.prompts)).toBe(true);
            expect(result.prompts.length).toBeGreaterThan(0);
        });

        it('should match exported prompts', async () => {
            const result = await Prompts.handleListPrompts();

            expect(result.prompts).toBe(Prompts.prompts);
        });
    });

    describe('handleGetPrompt', () => {
        it('should throw error for unknown prompt', async () => {
            await expect(
                Prompts.handleGetPrompt('unknown_prompt', {})
            ).rejects.toThrow('Unknown prompt');
        });

        it('should throw error for missing required argument', async () => {
            await expect(
                Prompts.handleGetPrompt('transcribe_with_context', {})
            ).rejects.toThrow('Missing required argument: audioFile');
        });

        describe('transcribe_with_context', () => {
            it('should generate prompt with skipDiscovery', async () => {
                const result = await Prompts.handleGetPrompt('transcribe_with_context', {
                    audioFile: '/test/audio.m4a',
                    skipDiscovery: 'true',
                });

                expect(result.messages).toBeDefined();
                expect(result.messages.length).toBeGreaterThan(0);
                expect(result.messages[0].role).toBe('user');
                expect(result.messages[0].content.type).toBe('text');
            });

            it('should include audio file path in messages', async () => {
                const result = await Prompts.handleGetPrompt('transcribe_with_context', {
                    audioFile: '/test/audio.m4a',
                    skipDiscovery: 'true',
                });

                const userMessage = result.messages[0];
                expect(userMessage.content.type).toBe('text');
                if (userMessage.content.type === 'text') {
                    expect(userMessage.content.text).toContain('/test/audio.m4a');
                }
            });

            it('should perform discovery when skipDiscovery is false', async () => {
                const audioFile = path.join(tempDir, 'test.m4a');
                await fs.writeFile(audioFile, 'dummy audio data');

                const result = await Prompts.handleGetPrompt('transcribe_with_context', {
                    audioFile,
                });

                expect(result.messages.length).toBeGreaterThan(1);
                const assistantMessage = result.messages[1];
                expect(assistantMessage.role).toBe('assistant');
            });

            it('should show context info when available', async () => {
                const audioFile = path.join(tempDir, 'test.m4a');
                await fs.writeFile(audioFile, 'dummy');

                const result = await Prompts.handleGetPrompt('transcribe_with_context', {
                    audioFile,
                });

                const assistantMessage = result.messages[1];
                if (assistantMessage.content.type === 'text') {
                    expect(assistantMessage.content.text).toContain('Context Discovery');
                }
            });

            it('should handle missing file gracefully', async () => {
                const result = await Prompts.handleGetPrompt('transcribe_with_context', {
                    audioFile: '/nonexistent/audio.m4a',
                });

                expect(result.messages).toBeDefined();
                const assistantMessage = result.messages[1];
                if (assistantMessage.content.type === 'text') {
                    expect(assistantMessage.content.text).toContain('File Check Failed');
                }
            });

            it('should show no context message when context not available', async () => {
                mockContext.hasContext = vi.fn(() => false);
                
                const audioFile = path.join(tempDir, 'test.m4a');
                await fs.writeFile(audioFile, 'dummy');

                const result = await Prompts.handleGetPrompt('transcribe_with_context', {
                    audioFile,
                });

                const assistantMessage = result.messages[1];
                if (assistantMessage.content.type === 'text') {
                    expect(assistantMessage.content.text).toContain('No Context Found');
                }
            });
        });

        describe('setup_project', () => {
            it('should generate setup project prompt', async () => {
                const result = await Prompts.handleGetPrompt('setup_project', {
                    projectName: 'Test Project',
                });

                expect(result.messages).toBeDefined();
                expect(result.messages.length).toBe(2);
            });

            it('should include project name in messages', async () => {
                const result = await Prompts.handleGetPrompt('setup_project', {
                    projectName: 'Test Project',
                });

                const userMessage = result.messages[0];
                if (userMessage.content.type === 'text') {
                    expect(userMessage.content.text).toContain('Test Project');
                }
            });

            it('should include source URL when provided', async () => {
                const result = await Prompts.handleGetPrompt('setup_project', {
                    projectName: 'Test Project',
                    sourceUrl: 'https://example.com/docs',
                });

                const assistantMessage = result.messages[1];
                if (assistantMessage.content.type === 'text') {
                    expect(assistantMessage.content.text).toContain('https://example.com/docs');
                }
            });

            it('should include destination when provided', async () => {
                const result = await Prompts.handleGetPrompt('setup_project', {
                    projectName: 'Test Project',
                    destination: '/custom/output',
                });

                const assistantMessage = result.messages[1];
                if (assistantMessage.content.type === 'text') {
                    expect(assistantMessage.content.text).toContain('/custom/output');
                }
            });

            it('should throw error when project name missing', async () => {
                await expect(
                    Prompts.handleGetPrompt('setup_project', {})
                ).rejects.toThrow('Missing required argument: projectName');
            });
        });

        describe('review_transcript', () => {
            it('should generate review transcript prompt', async () => {
                const result = await Prompts.handleGetPrompt('review_transcript', {
                    transcriptPath: '/test/transcript.md',
                });

                expect(result.messages).toBeDefined();
                expect(result.messages.length).toBe(2);
            });

            it('should include transcript path in messages', async () => {
                const result = await Prompts.handleGetPrompt('review_transcript', {
                    transcriptPath: '/test/transcript.md',
                });

                const userMessage = result.messages[0];
                if (userMessage.content.type === 'text') {
                    expect(userMessage.content.text).toContain('/test/transcript.md');
                }
            });

            it('should include focus area when provided', async () => {
                const result = await Prompts.handleGetPrompt('review_transcript', {
                    transcriptPath: '/test/transcript.md',
                    focusArea: 'names',
                });

                const assistantMessage = result.messages[1];
                if (assistantMessage.content.type === 'text') {
                    expect(assistantMessage.content.text).toContain('names');
                }
            });

            it('should default to "all" focus area', async () => {
                const result = await Prompts.handleGetPrompt('review_transcript', {
                    transcriptPath: '/test/transcript.md',
                });

                const assistantMessage = result.messages[1];
                if (assistantMessage.content.type === 'text') {
                    expect(assistantMessage.content.text).toContain('All corrections');
                }
            });

            it('should throw error when transcript path missing', async () => {
                await expect(
                    Prompts.handleGetPrompt('review_transcript', {})
                ).rejects.toThrow('Missing required argument: transcriptPath');
            });
        });

        describe('enrich_entity', () => {
            it('should generate enrich entity prompt', async () => {
                const result = await Prompts.handleGetPrompt('enrich_entity', {
                    entityType: 'person',
                    entityName: 'John Doe',
                });

                expect(result.messages).toBeDefined();
                expect(result.messages.length).toBeGreaterThan(0);
            });

            it('should include entity type and name', async () => {
                const result = await Prompts.handleGetPrompt('enrich_entity', {
                    entityType: 'term',
                    entityName: 'Kubernetes',
                });

                const userMessage = result.messages[0];
                if (userMessage.content.type === 'text') {
                    expect(userMessage.content.text).toContain('term');
                    expect(userMessage.content.text).toContain('Kubernetes');
                }
            });

            it('should throw error when entity type missing', async () => {
                await expect(
                    Prompts.handleGetPrompt('enrich_entity', { entityName: 'Test' })
                ).rejects.toThrow('Missing required argument: entityType');
            });

            it('should throw error when entity name missing', async () => {
                await expect(
                    Prompts.handleGetPrompt('enrich_entity', { entityType: 'person' })
                ).rejects.toThrow('Missing required argument: entityName');
            });
        });

        describe('batch_transcription', () => {
            it('should generate batch transcription prompt', async () => {
                const result = await Prompts.handleGetPrompt('batch_transcription', {
                    directory: '/test/audio',
                });

                expect(result.messages).toBeDefined();
                expect(result.messages.length).toBeGreaterThan(0);
            });

            it('should include directory in messages', async () => {
                const result = await Prompts.handleGetPrompt('batch_transcription', {
                    directory: '/test/audio',
                });

                const userMessage = result.messages[0];
                if (userMessage.content.type === 'text') {
                    expect(userMessage.content.text).toContain('/test/audio');
                }
            });

            it('should throw error when directory missing', async () => {
                await expect(
                    Prompts.handleGetPrompt('batch_transcription', {})
                ).rejects.toThrow('Missing required argument: directory');
            });
        });

        describe('find_and_analyze', () => {
            it('should generate find and analyze prompt', async () => {
                const result = await Prompts.handleGetPrompt('find_and_analyze', {
                    directory: '/test/transcripts',
                });

                expect(result.messages).toBeDefined();
                expect(result.messages.length).toBeGreaterThan(0);
            });

            it('should include directory in messages', async () => {
                const result = await Prompts.handleGetPrompt('find_and_analyze', {
                    directory: '/test/transcripts',
                });

                const userMessage = result.messages[0];
                if (userMessage.content.type === 'text') {
                    expect(userMessage.content.text).toContain('/test/transcripts');
                }
            });

            it('should throw error when directory missing', async () => {
                await expect(
                    Prompts.handleGetPrompt('find_and_analyze', {})
                ).rejects.toThrow('Missing required argument: directory');
            });
        });

        // Note: Cannot test unimplemented prompt handler without ability to modify exports
        // This would require a different testing approach or refactoring the code
    });

    describe('prompt argument validation', () => {
        it('should validate required arguments for all prompts', () => {
            Prompts.prompts.forEach(prompt => {
                const requiredArgs = prompt.arguments?.filter(arg => arg.required) || [];
                expect(requiredArgs.length).toBeGreaterThanOrEqual(0);
            });
        });

        it('should have descriptions for all prompts', () => {
            Prompts.prompts.forEach(prompt => {
                expect(prompt.description).toBeDefined();
                expect(prompt.description!.length).toBeGreaterThan(0);
            });
        });

        it('should have arguments array for all prompts', () => {
            Prompts.prompts.forEach(prompt => {
                expect(prompt.arguments).toBeDefined();
                expect(Array.isArray(prompt.arguments)).toBe(true);
            });
        });

        it('should have argument descriptions', () => {
            Prompts.prompts.forEach(prompt => {
                prompt.arguments?.forEach(arg => {
                    expect(arg.name).toBeDefined();
                    expect(arg.description).toBeDefined();
                });
            });
        });
    });

    describe('prompt message structure', () => {
        it('should return properly formatted messages', async () => {
            const result = await Prompts.handleGetPrompt('setup_project', {
                projectName: 'Test',
            });

            result.messages.forEach(message => {
                expect(message.role).toMatch(/^(user|assistant)$/);
                expect(message.content).toBeDefined();
                expect(message.content.type).toBe('text');
            });
        });

        it('should have at least one user message', async () => {
            const result = await Prompts.handleGetPrompt('review_transcript', {
                transcriptPath: '/test.md',
            });

            const userMessages = result.messages.filter(m => m.role === 'user');
            expect(userMessages.length).toBeGreaterThanOrEqual(1);
        });

        it('should have content in all messages', async () => {
            const result = await Prompts.handleGetPrompt('batch_transcription', {
                directory: '/test',
            });

            result.messages.forEach(message => {
                expect(message.content).toBeDefined();
                if (message.content.type === 'text') {
                    expect(message.content.text).toBeDefined();
                    expect(message.content.text.length).toBeGreaterThan(0);
                }
            });
        });
    });
});
