/**
 * Tests for the 2025 transcript migration script
 */

import { describe, it, expect } from 'vitest';
import { parseTranscriptContent, stringifyTranscript } from '../../src/util/frontmatter';

describe('Transcript Migration', () => {
    describe('Old format detection', () => {
        it('should detect files with ## Metadata section as old format', () => {
            const content = `# Test Transcript

## Metadata

**Date**: December 22, 2025
**Time**: 01:55 PM

**Project**: test
**Project ID**: \`test\`

---

This is the content.`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.needsMigration).toBe(true);
        });

        it('should detect files with ## Entity References as old format', () => {
            const content = `# Test Transcript

This is the content.

---

## Entity References

### Projects

- \`test\`: Test Project`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.needsMigration).toBe(true);
        });

        it('should detect files without frontmatter as old format', () => {
            const content = `# Test Transcript

This is the content.`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.needsMigration).toBe(true);
        });

        it('should recognize new format files', () => {
            const content = `---
title: Test Transcript
date: '2025-12-22T00:00:00.000Z'
project: test
projectId: test
entities:
  projects:
    - id: test
      name: Test Project
---
This is the content.`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.needsMigration).toBe(false);
        });
    });

    describe('Metadata extraction', () => {
        it('should extract title from H1 heading', () => {
            const content = `# Test Transcript Title

This is the content.`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.metadata.title).toBe('Test Transcript Title');
        });

        it('should extract project info from Metadata section', () => {
            const content = `# Test Transcript

## Metadata

**Date**: December 22, 2025
**Time**: 01:55 PM

**Project**: TestProject
**Project ID**: \`test-project\`

---

This is the content.`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.metadata.project).toBe('TestProject');
            expect(parsed.metadata.projectId).toBe('test-project');
        });

        it('should extract entities from Entity References section', () => {
            const content = `# Test Transcript

This is the content.

---

## Entity References

### Projects

- \`test-project\`: Test Project

### People

- \`john-doe\`: John Doe

### Companies

- \`acme-corp\`: Acme Corporation`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.metadata.entities).toBeDefined();
            expect(parsed.metadata.entities?.projects).toHaveLength(1);
            expect(parsed.metadata.entities?.projects?.[0].id).toBe('test-project');
            expect(parsed.metadata.entities?.projects?.[0].name).toBe('Test Project');
            expect(parsed.metadata.entities?.people).toHaveLength(1);
            expect(parsed.metadata.entities?.people?.[0].id).toBe('john-doe');
            expect(parsed.metadata.entities?.companies).toHaveLength(1);
            expect(parsed.metadata.entities?.companies?.[0].id).toBe('acme-corp');
        });

        it('should extract tags from Metadata section', () => {
            const content = `# Test Transcript

## Metadata

**Tags**: \`tag1\`, \`tag2\`, \`tag3\`

---

This is the content.`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.metadata.tags).toEqual(['tag1', 'tag2', 'tag3']);
        });

        it('should extract routing information', () => {
            const content = `# Test Transcript

## Metadata

### Routing

**Destination**: ./activity/notes
**Confidence**: 85.0%

---

This is the content.`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.metadata.routing).toBeDefined();
            expect(parsed.metadata.routing?.destination).toBe('./activity/notes');
            expect(parsed.metadata.routing?.confidence).toBe(0.85);
        });
    });

    describe('Content cleaning', () => {
        it('should remove ## Metadata section from body', () => {
            const content = `# Test Transcript

## Metadata

**Date**: December 22, 2025

---

This is the content.

More content here.`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.body).not.toContain('## Metadata');
            expect(parsed.body).toContain('This is the content.');
            expect(parsed.body).toContain('More content here.');
        });

        it('should remove ## Entity References section from body', () => {
            const content = `# Test Transcript

This is the content.

---

## Entity References

### Projects

- \`test\`: Test`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.body).not.toContain('## Entity References');
            expect(parsed.body).toContain('This is the content.');
        });

        it('should remove H1 title from body when in frontmatter', () => {
            const content = `# Test Transcript Title

This is the content.`;

            const parsed = parseTranscriptContent(content);
            const newContent = stringifyTranscript(parsed.metadata, parsed.body);
            
            // Parse the new content
            const reparsed = parseTranscriptContent(newContent);
            expect(reparsed.body).not.toContain('# Test Transcript Title');
            expect(reparsed.body).toContain('This is the content.');
        });

        it('should preserve all body content', () => {
            const content = `# Test Transcript

## Metadata

**Date**: December 22, 2025

---

This is paragraph 1.

This is paragraph 2.

## A Real Heading

This is under a real heading.

More content.

---

## Entity References

### Projects

- \`test\`: Test`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.body).toContain('This is paragraph 1.');
            expect(parsed.body).toContain('This is paragraph 2.');
            expect(parsed.body).toContain('## A Real Heading');
            expect(parsed.body).toContain('This is under a real heading.');
            expect(parsed.body).toContain('More content.');
        });
    });

    describe('Round-trip conversion', () => {
        it('should preserve all data through parse -> stringify -> parse cycle', () => {
            const originalContent = `# Test Transcript

## Metadata

**Date**: December 22, 2025
**Time**: 01:55 PM

**Project**: TestProject
**Project ID**: \`test-project\`

**Tags**: \`tag1\`, \`tag2\`

### Routing

**Destination**: ./activity/notes
**Confidence**: 85.0%

---

This is the main content.

It has multiple paragraphs.

---

## Entity References

### Projects

- \`test-project\`: Test Project

### People

- \`john-doe\`: John Doe`;

            // First parse
            const parsed1 = parseTranscriptContent(originalContent);
            
            // Stringify to new format
            const newContent = stringifyTranscript(parsed1.metadata, parsed1.body);
            
            // Parse again
            const parsed2 = parseTranscriptContent(newContent);
            
            // Verify all metadata preserved
            expect(parsed2.metadata.title).toBe(parsed1.metadata.title);
            expect(parsed2.metadata.project).toBe(parsed1.metadata.project);
            expect(parsed2.metadata.projectId).toBe(parsed1.metadata.projectId);
            expect(parsed2.metadata.tags).toEqual(parsed1.metadata.tags);
            expect(parsed2.metadata.routing?.destination).toBe(parsed1.metadata.routing?.destination);
            expect(parsed2.metadata.routing?.confidence).toBe(parsed1.metadata.routing?.confidence);
            
            // Verify entities preserved
            expect(parsed2.metadata.entities?.projects).toHaveLength(1);
            expect(parsed2.metadata.entities?.projects?.[0].id).toBe('test-project');
            expect(parsed2.metadata.entities?.people).toHaveLength(1);
            expect(parsed2.metadata.entities?.people?.[0].id).toBe('john-doe');
            
            // Verify body content preserved
            expect(parsed2.body).toContain('This is the main content.');
            expect(parsed2.body).toContain('It has multiple paragraphs.');
            
            // Verify no legacy sections in new content
            expect(newContent).not.toContain('## Metadata');
            expect(newContent).not.toContain('## Entity References');
            
            // Verify it's in new format
            expect(parsed2.needsMigration).toBe(false);
            expect(newContent.startsWith('---')).toBe(true);
        });

        it('should handle files that are already in new format', () => {
            const content = `---
title: Test Transcript
date: '2025-12-22T00:00:00.000Z'
project: test
projectId: test
tags:
  - tag1
  - tag2
entities:
  projects:
    - id: test
      name: Test Project
---
This is the content.`;

            const parsed1 = parseTranscriptContent(content);
            expect(parsed1.needsMigration).toBe(false);
            
            // Stringify and parse again
            const newContent = stringifyTranscript(parsed1.metadata, parsed1.body);
            const parsed2 = parseTranscriptContent(newContent);
            
            // Should still not need migration
            expect(parsed2.needsMigration).toBe(false);
            
            // Data should be preserved
            expect(parsed2.metadata.title).toBe('Test Transcript');
            expect(parsed2.metadata.tags).toEqual(['tag1', 'tag2']);
            expect(parsed2.body).toContain('This is the content.');
        });
    });

    describe('Edge cases', () => {
        it('should handle empty entity sections', () => {
            const content = `# Test Transcript

This is the content.

---

## Entity References

### Projects

### People`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.body).not.toContain('## Entity References');
            expect(parsed.body).toContain('This is the content.');
        });

        it('should handle missing metadata fields', () => {
            const content = `# Test Transcript

## Metadata

**Date**: December 22, 2025

---

This is the content.`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.metadata.title).toBe('Test Transcript');
            // Should have lifecycle defaults applied
            expect(parsed.metadata.status).toBeDefined();
        });

        it('should handle content with multiple separators', () => {
            const content = `# Test Transcript

## Metadata

**Date**: December 22, 2025

---

This is the content.

---

More content after separator.

---

## Entity References

### Projects

- \`test\`: Test`;

            const parsed = parseTranscriptContent(content);
            expect(parsed.body).toContain('This is the content.');
            expect(parsed.body).toContain('---');
            expect(parsed.body).toContain('More content after separator.');
            expect(parsed.body).not.toContain('## Entity References');
        });

        it('should handle content with code blocks containing similar patterns', () => {
            const content = `# Test Transcript

This is content with a code block:

\`\`\`markdown
## Entity References

This is just example code
\`\`\`

More content.

---

## Entity References

### Projects

- \`test\`: Test`;

            const parsed = parseTranscriptContent(content);
            // The code block should be preserved
            expect(parsed.body).toContain('```markdown');
            expect(parsed.body).toContain('This is just example code');
            // But the actual Entity References section should be removed
            const entityReferencesCount = (parsed.body.match(/## Entity References/g) || []).length;
            expect(entityReferencesCount).toBe(1); // Only in code block
        });
    });
});
