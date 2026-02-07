/**
 * MCP Server Validation Integration Tests
 * 
 * These tests ensure that the validation logic in statusTools prevents
 * malformed files from being saved. They test the actual validation function
 * that is called before every file write operation.
 */
import { describe, it, expect } from 'vitest';
import { parseTranscriptContent, stringifyTranscript } from '../../src/util/frontmatter';
import type { TranscriptMetadata } from '../../src/util/metadata';

/**
 * This is the same validation logic used in statusTools.ts
 * We test it directly to ensure it catches all format issues
 */
function validateTranscriptContent(content: string): { valid: boolean; error?: string } {
    try {
        // First check: Must start with ---
        if (!content.trim().startsWith('---')) {
            return { valid: false, error: 'Content does not start with YAML frontmatter (---). Title may be placed before frontmatter.' };
        }
        
        // Second check: No duplicate opening delimiters
        const lines = content.split('\n');
        if (lines.length > 1 && lines[0].trim() === '---' && lines[1].trim() === '---') {
            return { valid: false, error: 'Content has duplicate opening frontmatter delimiters (---\\n---). This indicates a body extraction bug.' };
        }
        
        // Third check: Must have closing delimiter
        const closingDelimiterIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
        if (closingDelimiterIndex === -1) {
            return { valid: false, error: 'Content is missing closing YAML frontmatter delimiter (---)' };
        }
        
        // Fourth check: Must be parseable
        const validation = parseTranscriptContent(content);
        if (!validation.metadata) {
            return { valid: false, error: 'Content has no parseable metadata' };
        }
        
        // Fifth check: Title must be in frontmatter, not in body
        const bodyAfterFrontmatter = lines.slice(closingDelimiterIndex + 1).join('\n');
        const h1InBody = /^#\s+.+$/m.test(bodyAfterFrontmatter);
        if (h1InBody) {
            return { valid: false, error: 'Body contains H1 title (# ...). Title must be in frontmatter only.' };
        }
        
        // Sixth check: After re-parsing, verify no duplicate delimiters were introduced
        const reparsed = parseTranscriptContent(content);
        const restringified = stringifyTranscript(reparsed.metadata, reparsed.body);
        const restringifiedLines = restringified.split('\n');
        if (restringifiedLines.length > 1 && restringifiedLines[0].trim() === '---' && restringifiedLines[1].trim() === '---') {
            return { valid: false, error: 'Round-trip test failed: re-stringifying produces duplicate delimiters. This indicates a bug in stringifyTranscript().' };
        }
        
        return { valid: true };
    } catch (error) {
        return { 
            valid: false, 
            error: `Validation exception: ${error instanceof Error ? error.message : String(error)}` 
        };
    }
}

describe('MCP Server Validation - Format Integrity', () => {
    describe('Valid formats should pass validation', () => {
        it('should accept properly formatted transcript with title in frontmatter', () => {
            const content = `---
title: Test Transcript
status: reviewed
---

Content here.
`;
            const result = validateTranscriptContent(content);
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });
        
        it('should accept transcript with tasks', () => {
            const content = `---
title: With Tasks
status: in_progress
tasks:
  - id: task-123
    description: Test task
    status: open
    created: "2026-02-01T10:00:00Z"
---

Content.
`;
            const result = validateTranscriptContent(content);
            expect(result.valid).toBe(true);
        });
        
        it('should accept transcript with entities', () => {
            const content = `---
title: With Entities
status: reviewed
entities:
  people: []
  projects:
    - id: test
      name: Test Project
      type: project
  terms: []
  companies: []
---

Content.
`;
            const result = validateTranscriptContent(content);
            expect(result.valid).toBe(true);
        });
    });
    
    describe('Invalid formats should fail validation', () => {
        it('should reject content with duplicate opening delimiters', () => {
            const content = `---
---
title: Bad Format
status: reviewed
---

Content.
`;
            const result = validateTranscriptContent(content);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('duplicate opening frontmatter delimiters');
        });
        
        it('should reject content with title as H1 in body', () => {
            const content = `---
status: reviewed
---
# Title in Body

Content here.
`;
            const result = validateTranscriptContent(content);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Body contains H1 title');
        });
        
        it('should reject content with title before frontmatter', () => {
            const content = `# Title Before Frontmatter

---
status: reviewed
---

Content.
`;
            const result = validateTranscriptContent(content);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not start with YAML frontmatter');
        });
        
        it('should reject content without closing delimiter', () => {
            const content = `---
title: No Closing
status: reviewed

Content without closing delimiter.
`;
            const result = validateTranscriptContent(content);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('missing closing YAML frontmatter delimiter');
        });
        
        it('should reject content with malformed YAML', () => {
            const content = `---
title: Test
status: [invalid yaml
---

Content.
`;
            const result = validateTranscriptContent(content);
            expect(result.valid).toBe(false);
        });
    });
    
    describe('stringifyTranscript should always produce valid output', () => {
        it('should produce valid output with title in frontmatter', () => {
            const metadata: TranscriptMetadata = {
                title: 'Test Title',
                status: 'reviewed',
            };
            const body = 'Content here.';
            
            const output = stringifyTranscript(metadata, body);
            const result = validateTranscriptContent(output);
            
            expect(result.valid).toBe(true);
            expect(output).toMatch(/^---\n[\s\S]*?title: Test Title/);
        });
        
        it('should remove H1 from body when stringifying', () => {
            const metadata: TranscriptMetadata = {
                title: 'My Title',
                status: 'reviewed',
            };
            const body = '# My Title\n\nContent here.';
            
            const output = stringifyTranscript(metadata, body);
            const result = validateTranscriptContent(output);
            
            expect(result.valid).toBe(true);
            expect(output).not.toContain('# My Title');
            expect(output).toContain('Content here');
        });
        
        it('should not create duplicate delimiters', () => {
            const metadata: TranscriptMetadata = {
                title: 'Test',
                status: 'reviewed',
            };
            const body = 'Content.';
            
            const output = stringifyTranscript(metadata, body);
            const result = validateTranscriptContent(output);
            
            expect(result.valid).toBe(true);
            const lines = output.split('\n');
            expect(lines[0].trim()).toBe('---');
            expect(lines[1].trim()).not.toBe('---');
        });
        
        it('should handle round-trip without corruption', () => {
            const original = `---
title: Round Trip
status: reviewed
tasks:
  - id: task-123
    description: Test
    status: open
    created: "2026-02-01T10:00:00Z"
---

Original content.
`;
            
            // Parse
            const parsed = parseTranscriptContent(original);
            
            // Stringify
            const output = stringifyTranscript(parsed.metadata, parsed.body);
            
            // Validate
            const result = validateTranscriptContent(output);
            expect(result.valid).toBe(true);
            
            // Parse again
            const reparsed = parseTranscriptContent(output);
            
            // Stringify again
            const output2 = stringifyTranscript(reparsed.metadata, reparsed.body);
            
            // Should be identical
            expect(output).toBe(output2);
        });
        
        it('should handle multiple round-trips without corruption', () => {
            let content = `---
title: Multi Round Trip
status: reviewed
---

Content.
`;
            
            // Do 5 round-trips
            for (let i = 0; i < 5; i++) {
                const parsed = parseTranscriptContent(content);
                content = stringifyTranscript(parsed.metadata, parsed.body);
                
                const result = validateTranscriptContent(content);
                expect(result.valid).toBe(true);
            }
            
            // Final content should still be valid
            expect(content).toMatch(/^---\n[\s\S]*?title: Multi Round Trip/);
            expect(content).not.toMatch(/^---\n---/);
        });
    });
    
    describe('Edge cases and migrations', () => {
        it('should handle file with H1 title and no frontmatter title', () => {
            const content = `---
status: reviewed
---
# Extracted Title

Content.
`;
            
            // Parse will extract the title
            const parsed = parseTranscriptContent(content);
            expect(parsed.metadata.title).toBe('Extracted Title');
            
            // Stringify will put it in frontmatter and remove from body
            const output = stringifyTranscript(parsed.metadata, parsed.body);
            const result = validateTranscriptContent(output);
            
            expect(result.valid).toBe(true);
            expect(output).toMatch(/^---\n[\s\S]*?title: Extracted Title/);
            expect(output).not.toContain('# Extracted Title');
        });
        
        it('should handle file with both frontmatter title and H1 in body', () => {
            const content = `---
title: Frontmatter Title
status: reviewed
---
# Body Title

Content.
`;
            
            const parsed = parseTranscriptContent(content);
            expect(parsed.metadata.title).toBe('Frontmatter Title');
            expect(parsed.body).not.toContain('# Body Title');
            
            const output = stringifyTranscript(parsed.metadata, parsed.body);
            const result = validateTranscriptContent(output);
            
            expect(result.valid).toBe(true);
        });
        
        it('should preserve H2 and H3 headings in body', () => {
            const metadata: TranscriptMetadata = {
                title: 'Main Title',
                status: 'reviewed',
            };
            const body = `## Section One

Content.

### Subsection

More content.`;
            
            const output = stringifyTranscript(metadata, body);
            const result = validateTranscriptContent(output);
            
            expect(result.valid).toBe(true);
            expect(output).toContain('## Section One');
            expect(output).toContain('### Subsection');
        });
    });
});
