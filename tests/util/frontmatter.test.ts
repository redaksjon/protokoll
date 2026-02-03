import { describe, it, expect } from 'vitest';
import { 
    parseTranscriptContent, 
    stripLegacySections, 
    hasEntities,
    buildFrontmatter,
    stringifyTranscript,
    updateTranscript,
} from '../../src/util/frontmatter';

describe('frontmatter', () => {
    describe('parseTranscriptContent', () => {
        it('should parse new format with all metadata in frontmatter', () => {
            const content = `---
title: Test Meeting
status: reviewed
tasks:
  - id: task-123
    description: Follow up
    status: open
    created: "2026-02-03T10:00:00Z"
entities:
  people:
    - id: person-1
      name: John Doe
      type: person
---

This is the transcript content.
`;
            
            const result = parseTranscriptContent(content);
            
            expect(result.metadata.title).toBe('Test Meeting');
            expect(result.metadata.status).toBe('reviewed');
            expect(result.metadata.tasks).toHaveLength(1);
            expect(result.metadata.tasks![0].description).toBe('Follow up');
            expect(result.metadata.entities?.people).toHaveLength(1);
            expect(result.body).toBe('This is the transcript content.');
            expect(result.needsMigration).toBe(false);
        });
        
        it('should parse old format with entities in body', () => {
            const content = `---
title: Old Format
---

This is the transcript content.

---

## Entity References

### People

- \`person-1\`: Jane Smith
`;
            
            const result = parseTranscriptContent(content);
            
            expect(result.metadata.title).toBe('Old Format');
            expect(result.metadata.entities?.people).toHaveLength(1);
            expect(result.metadata.entities?.people![0].name).toBe('Jane Smith');
            expect(result.body).toBe('This is the transcript content.');
            expect(result.needsMigration).toBe(true);
        });
        
        it('should apply lifecycle defaults when missing', () => {
            const content = `---
title: No Status
---

Content here.
`;
            
            const result = parseTranscriptContent(content);
            
            expect(result.metadata.status).toBe('reviewed');
            expect(result.metadata.history).toEqual([]);
            expect(result.metadata.tasks).toEqual([]);
        });
        
        it('should handle file with no frontmatter', () => {
            const content = `# Simple Note

Just some text without frontmatter.
`;
            
            const result = parseTranscriptContent(content);
            
            expect(result.metadata.status).toBe('reviewed');
            expect(result.needsMigration).toBe(true);
            expect(result.body).toContain('# Simple Note');
        });
        
        it('should prefer frontmatter entities over body entities', () => {
            const content = `---
title: Both Places
entities:
  people:
    - id: frontmatter-person
      name: From Frontmatter
      type: person
---

Content.

## Entity References

### People

- \`body-person\`: From Body
`;
            
            const result = parseTranscriptContent(content);
            
            // Should use frontmatter entities, not body
            expect(result.metadata.entities?.people).toHaveLength(1);
            expect(result.metadata.entities?.people![0].id).toBe('frontmatter-person');
        });
        
        it('should parse history array', () => {
            const content = `---
title: With History
status: closed
history:
  - from: initial
    to: enhanced
    at: "2026-02-03T09:00:00Z"
  - from: enhanced
    to: reviewed
    at: "2026-02-03T10:00:00Z"
  - from: reviewed
    to: closed
    at: "2026-02-03T11:00:00Z"
---

Content.
`;
            
            const result = parseTranscriptContent(content);
            
            expect(result.metadata.status).toBe('closed');
            expect(result.metadata.history).toHaveLength(3);
            expect(result.metadata.history![0].from).toBe('initial');
            expect(result.metadata.history![2].to).toBe('closed');
        });
    });
    
    describe('stripLegacySections', () => {
        it('should remove entity references section', () => {
            const body = `Content here.

---

## Entity References

### People

- \`person-1\`: John
`;
            
            const result = stripLegacySections(body);
            
            expect(result).toBe('Content here.');
            expect(result).not.toContain('Entity References');
        });
        
        it('should remove metadata section', () => {
            const body = `## Metadata

**Date**: February 3, 2026
**Time**: 10:00 AM

---

Actual content here.
`;
            
            const result = stripLegacySections(body);
            
            expect(result).toBe('Actual content here.');
            expect(result).not.toContain('## Metadata');
        });
        
        it('should handle body with no legacy sections', () => {
            const body = 'Just clean content.';
            
            const result = stripLegacySections(body);
            
            expect(result).toBe('Just clean content.');
        });
    });
    
    describe('hasEntities', () => {
        it('should return true when entities exist', () => {
            expect(hasEntities({ people: [{ id: '1', name: 'Test', type: 'person' }] })).toBe(true);
            expect(hasEntities({ projects: [{ id: '1', name: 'Test', type: 'project' }] })).toBe(true);
        });
        
        it('should return false when no entities', () => {
            expect(hasEntities(undefined)).toBe(false);
            expect(hasEntities({})).toBe(false);
            expect(hasEntities({ people: [], projects: [] })).toBe(false);
        });
    });
    
    describe('buildFrontmatter', () => {
        it('should build frontmatter with all metadata fields', () => {
            const metadata = {
                title: 'Test Meeting',
                date: new Date('2026-02-03T10:00:00Z'),
                status: 'reviewed' as const,
                tasks: [{ id: 'task-1', description: 'Follow up', status: 'open' as const, created: '2026-02-03T10:00:00Z' }],
                entities: {
                    people: [{ id: 'person-1', name: 'John Doe', type: 'person' as const }],
                },
            };
            
            const fm = buildFrontmatter(metadata);
            
            expect(fm.title).toBe('Test Meeting');
            expect(fm.date).toBe('2026-02-03T10:00:00.000Z');
            expect(fm.status).toBe('reviewed');
            expect(fm.tasks).toHaveLength(1);
            expect(fm.entities).toBeDefined();
        });
        
        it('should omit empty arrays and undefined values', () => {
            const metadata = {
                title: 'Minimal',
                tags: [],
                history: [],
            };
            
            const fm = buildFrontmatter(metadata);
            
            expect(fm.title).toBe('Minimal');
            expect(fm.tags).toBeUndefined();
            expect(fm.history).toBeUndefined();
        });
    });
    
    describe('stringifyTranscript', () => {
        it('should create valid YAML frontmatter output', () => {
            const metadata = {
                title: 'Test',
                status: 'reviewed' as const,
            };
            const body = 'This is the content.';
            
            const output = stringifyTranscript(metadata, body);
            
            expect(output).toContain('---');
            expect(output).toContain('title: Test');
            expect(output).toContain('status: reviewed');
            expect(output).toContain('This is the content.');
        });
        
        it('should strip legacy entity section from body', () => {
            const metadata = {
                title: 'With Entities',
                entities: {
                    people: [{ id: 'john', name: 'John', type: 'person' as const }],
                },
            };
            const body = `Content here.

---

## Entity References

### People

- \`john\`: John
`;
            
            const output = stringifyTranscript(metadata, body);
            
            // Entity section should be stripped from body (now in frontmatter)
            expect(output).not.toContain('## Entity References');
            expect(output).toContain('Content here.');
            expect(output).toContain('entities:');
        });
    });
    
    describe('updateTranscript', () => {
        it('should update body while preserving metadata', () => {
            const original = `---
title: Original
status: reviewed
---

Old content.
`;
            
            const updated = updateTranscript(original, { body: 'New content.' });
            
            expect(updated).toContain('title: Original');
            expect(updated).toContain('status: reviewed');
            expect(updated).toContain('New content.');
            expect(updated).not.toContain('Old content.');
        });
        
        it('should update metadata while preserving body', () => {
            const original = `---
title: Original
status: reviewed
---

Keep this content.
`;
            
            const updated = updateTranscript(original, { 
                metadata: { status: 'closed' } 
            });
            
            expect(updated).toContain('title: Original');
            expect(updated).toContain('status: closed');
            expect(updated).toContain('Keep this content.');
        });
        
        it('should round-trip without data loss', () => {
            const original = `---
title: Round Trip
status: in_progress
history:
  - from: reviewed
    to: in_progress
    at: "2026-02-03T10:00:00Z"
tasks:
  - id: task-123
    description: Test task
    status: open
    created: "2026-02-03T10:00:00Z"
entities:
  people:
    - id: jane
      name: Jane Doe
      type: person
---

Content preserved.
`;
            
            const parsed = parseTranscriptContent(original);
            const rewritten = stringifyTranscript(parsed.metadata, parsed.body);
            const reparsed = parseTranscriptContent(rewritten);
            
            expect(reparsed.metadata.title).toBe('Round Trip');
            expect(reparsed.metadata.status).toBe('in_progress');
            expect(reparsed.metadata.history).toHaveLength(1);
            expect(reparsed.metadata.tasks).toHaveLength(1);
            expect(reparsed.metadata.entities?.people).toHaveLength(1);
            expect(reparsed.body).toContain('Content preserved.');
        });
    });
});
