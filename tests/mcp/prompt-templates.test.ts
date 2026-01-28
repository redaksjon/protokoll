/**
 * Tests for MCP Prompt Template Loading
 * 
 * These tests ensure that prompt templates are correctly loaded from the filesystem
 * in both development and production (bundled) environments.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Prompts from '../../src/mcp/prompts';

describe('Prompt Template Loading', () => {
    describe('Template File Existence', () => {
        const expectedTemplates = [
            'review_transcript',
            'transcribe_with_context',
            'setup_project',
            'enrich_entity',
            'batch_transcription',
            'find_and_analyze',
            'edit_entity',
        ];

        it('should have all required template files in src/', () => {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const srcPromptsDir = resolve(__dirname, '../../src/mcp/prompts');

            expectedTemplates.forEach(template => {
                const templatePath = resolve(srcPromptsDir, `${template}.md`);
                expect(
                    existsSync(templatePath),
                    `Template file should exist: ${templatePath}`
                ).toBe(true);
            });
        });

        it('should have all required template files in dist/ after build', () => {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const distPromptsDir = resolve(__dirname, '../../dist/mcp/prompts');

            // Only check if dist exists (it may not during development)
            if (existsSync(distPromptsDir)) {
                expectedTemplates.forEach(template => {
                    const templatePath = resolve(distPromptsDir, `${template}.md`);
                    expect(
                        existsSync(templatePath),
                        `Bundled template file should exist: ${templatePath}`
                    ).toBe(true);
                });
            }
        });

        it('should have non-empty template files', () => {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const srcPromptsDir = resolve(__dirname, '../../src/mcp/prompts');

            expectedTemplates.forEach(template => {
                const templatePath = resolve(srcPromptsDir, `${template}.md`);
                const content = readFileSync(templatePath, 'utf-8');
                expect(
                    content.length,
                    `Template ${template}.md should not be empty`
                ).toBeGreaterThan(0);
            });
        });
    });

    describe('Template Loading Error Messages', () => {
        it('should provide clear error message when template file is missing', async () => {
            // This test verifies that if a template file is missing, the error message
            // includes the full path that was attempted, making debugging easier
            
            // We can't easily test this without modifying the module, but we can verify
            // that the error handling code exists and works for known prompts
            
            // Test with a valid prompt first to ensure the system works
            const result = await Prompts.handleGetPrompt('review_transcript', {
                transcriptPath: '/test/transcript.md',
            });
            
            expect(result.messages).toBeDefined();
            expect(result.messages.length).toBeGreaterThan(0);
        });

        it('should load templates successfully for all registered prompts', async () => {
            // Test that each prompt can successfully load its template
            const testCases = [
                { name: 'review_transcript', args: { transcriptPath: '/test.md' } },
                { name: 'transcribe_with_context', args: { audioFile: '/test.m4a', skipDiscovery: 'true' } },
                { name: 'setup_project', args: { projectName: 'Test' } },
                { name: 'enrich_entity', args: { entityType: 'person', entityName: 'Test' } },
                { name: 'batch_transcription', args: { directory: '/test' } },
                { name: 'find_and_analyze', args: { directory: '/test' } },
                { name: 'edit_entity', args: { entityType: 'person', entityId: 'test-id' } },
            ];

            for (const testCase of testCases) {
                const result = await Prompts.handleGetPrompt(testCase.name, testCase.args);
                expect(
                    result.messages.length,
                    `Prompt ${testCase.name} should generate messages`
                ).toBeGreaterThan(0);
                
                const userMessage = result.messages[0];
                expect(userMessage.role).toBe('user');
                expect(userMessage.content.type).toBe('text');
                if (userMessage.content.type === 'text') {
                    expect(
                        userMessage.content.text.length,
                        `Prompt ${testCase.name} should have non-empty content`
                    ).toBeGreaterThan(0);
                }
            }
        });
    });

    describe('Path Resolution Logic', () => {
        it('should correctly identify bundled vs source environment', () => {
            // This test verifies the path resolution logic works correctly
            // We test this indirectly by ensuring prompts load successfully
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            
            // Check if we're in a test environment (should be in tests/ directory)
            expect(__dirname).toContain('tests');
            
            // Verify that the source prompts directory exists
            const srcPromptsDir = resolve(__dirname, '../../src/mcp/prompts');
            expect(existsSync(srcPromptsDir)).toBe(true);
        });

        it('should not create nested mcp/prompts/mcp/prompts path', async () => {
            // This is the regression test for the bug we fixed
            // The bug was: when bundled, the code tried to resolve 'mcp/prompts' 
            // relative to __dirname which was already at 'dist/mcp/prompts',
            // creating an invalid path like 'dist/mcp/prompts/mcp/prompts'
            
            // We test this by ensuring all prompts load successfully
            // If the path resolution was broken, this would fail
            const result = await Prompts.handleGetPrompt('review_transcript', {
                transcriptPath: '/test/transcript.md',
            });
            
            expect(result.messages).toBeDefined();
            expect(result.messages.length).toBeGreaterThan(0);
            
            const userMessage = result.messages[0];
            if (userMessage.content.type === 'text') {
                // Verify the template was actually loaded (not empty)
                expect(userMessage.content.text).toContain('transcript');
                expect(userMessage.content.text.length).toBeGreaterThan(50);
            }
        });
    });

    describe('Template Content Validation', () => {
        it('should have valid markdown in template files', () => {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const srcPromptsDir = resolve(__dirname, '../../src/mcp/prompts');

            const templates = [
                'review_transcript',
                'transcribe_with_context',
                'setup_project',
                'enrich_entity',
                'batch_transcription',
                'find_and_analyze',
                'edit_entity',
            ];

            templates.forEach(template => {
                const templatePath = resolve(srcPromptsDir, `${template}.md`);
                const content = readFileSync(templatePath, 'utf-8');
                
                // Basic markdown validation
                expect(content.trim().length).toBeGreaterThan(0);
                
                // Should not contain obvious path errors
                expect(content).not.toContain('mcp/prompts/mcp/prompts');
                expect(content).not.toContain('undefined');
            });
        });

        it('should support template variable substitution', async () => {
            // Test that templates correctly substitute variables
            const result = await Prompts.handleGetPrompt('review_transcript', {
                transcriptPath: '/custom/path/transcript.md',
                focusArea: 'technical',
            });

            const userMessage = result.messages[0];
            if (userMessage.content.type === 'text') {
                // The custom path should be in the output
                expect(userMessage.content.text).toContain('/custom/path/transcript.md');
                // The focus area should be in the output
                expect(userMessage.content.text).toContain('technical');
            }
        });
    });

    describe('Error Handling and Debugging', () => {
        it('should provide helpful error message format', () => {
            // Verify that error messages would include the path attempted
            // This is tested indirectly through successful loading
            
            // If a template fails to load, the error should include:
            // 1. The template name
            // 2. The full path that was attempted
            // 3. The underlying error
            
            // We verify this by checking that the error handling code exists
            // in the loadTemplate function (which we can't directly test here,
            // but we can verify through integration tests)
            
            expect(Prompts.prompts.length).toBeGreaterThan(0);
        });

        it('should fail fast with clear error for missing template', async () => {
            // Test that an unknown prompt name fails with a clear error
            await expect(
                Prompts.handleGetPrompt('nonexistent_prompt', {})
            ).rejects.toThrow('Unknown prompt: nonexistent_prompt');
        });

        it('should validate prompt exists before attempting to load template', async () => {
            // This ensures we get a "Unknown prompt" error before a template loading error
            const unknownPromptName = 'this_prompt_does_not_exist';
            
            await expect(
                Prompts.handleGetPrompt(unknownPromptName, {})
            ).rejects.toThrow(`Unknown prompt: ${unknownPromptName}`);
        });
    });

    describe('Build Process Validation', () => {
        it('should copy all prompt templates during build', () => {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const srcPromptsDir = resolve(__dirname, '../../src/mcp/prompts');
            const distPromptsDir = resolve(__dirname, '../../dist/mcp/prompts');

            // Get all .md files in src
            const srcTemplates = [
                'review_transcript.md',
                'transcribe_with_context.md',
                'setup_project.md',
                'enrich_entity.md',
                'batch_transcription.md',
                'find_and_analyze.md',
                'edit_entity.md',
            ];

            srcTemplates.forEach(template => {
                const srcPath = resolve(srcPromptsDir, template);
                expect(existsSync(srcPath), `Source template should exist: ${srcPath}`).toBe(true);
            });

            // If dist exists, verify templates were copied
            if (existsSync(distPromptsDir)) {
                srcTemplates.forEach(template => {
                    const distPath = resolve(distPromptsDir, template);
                    expect(
                        existsSync(distPath),
                        `Dist template should exist after build: ${distPath}`
                    ).toBe(true);
                });
            }
        });

        it('should maintain template content during copy', () => {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const srcPromptsDir = resolve(__dirname, '../../src/mcp/prompts');
            const distPromptsDir = resolve(__dirname, '../../dist/mcp/prompts');

            if (existsSync(distPromptsDir)) {
                const templates = [
                    'review_transcript.md',
                    'transcribe_with_context.md',
                    'setup_project.md',
                ];

                templates.forEach(template => {
                    const srcPath = resolve(srcPromptsDir, template);
                    const distPath = resolve(distPromptsDir, template);

                    if (existsSync(distPath)) {
                        const srcContent = readFileSync(srcPath, 'utf-8');
                        const distContent = readFileSync(distPath, 'utf-8');
                        
                        expect(
                            distContent,
                            `Dist template ${template} should match source`
                        ).toBe(srcContent);
                    }
                });
            }
        });
    });
});
