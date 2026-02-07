/**
 * Migration tests - verifying lazy migration from old format to new format
 */
import { describe, it, expect } from 'vitest';
import { 
    parseTranscriptContent, 
    stringifyTranscript,
} from '../../src/util/frontmatter';

describe('Lazy Migration', () => {
    describe('Old format detection', () => {
        it('should detect old format with entities in body', () => {
            const oldFormat = `---
title: Old Style
---

Content here.

---

## Entity References

### People

- \`john-doe\`: John Doe
`;
            
            const result = parseTranscriptContent(oldFormat);
            
            expect(result.needsMigration).toBe(true);
            expect(result.metadata.entities?.people).toHaveLength(1);
        });
        
        it('should detect old format with ## Metadata section', () => {
            const oldFormat = `# Meeting Notes

## Metadata

**Date**: February 3, 2026
**Time**: 10:00 AM
**Project**: Test Project

---

The actual content.
`;
            
            const result = parseTranscriptContent(oldFormat);
            
            expect(result.needsMigration).toBe(true);
        });
        
        it('should detect old format with no frontmatter', () => {
            const oldFormat = `# Simple Note

Just plain content without any frontmatter.
`;
            
            const result = parseTranscriptContent(oldFormat);
            
            expect(result.needsMigration).toBe(true);
        });
        
        it('should NOT flag new format for migration', () => {
            const newFormat = `---
title: New Style
status: reviewed
entities:
  people:
    - id: john-doe
      name: John Doe
      type: person
---

Clean content here.
`;
            
            const result = parseTranscriptContent(newFormat);
            
            expect(result.needsMigration).toBe(false);
        });
    });
    
    describe('Entity extraction from old format', () => {
        it('should extract people from body', () => {
            const oldFormat = `---
title: With People
---

Meeting notes.

---

## Entity References

### People

- \`alice-smith\`: Alice Smith
- \`bob-jones\`: Bob Jones
`;
            
            const result = parseTranscriptContent(oldFormat);
            
            expect(result.metadata.entities?.people).toHaveLength(2);
            expect(result.metadata.entities?.people![0].id).toBe('alice-smith');
            expect(result.metadata.entities?.people![1].name).toBe('Bob Jones');
        });
        
        it('should extract all entity types from body', () => {
            const oldFormat = `---
title: Mixed Entities
---

Content.

---

## Entity References

### People

- \`person-1\`: Person One

### Projects

- \`project-alpha\`: Project Alpha

### Terms

- \`api\`: API

### Companies

- \`acme-corp\`: Acme Corporation
`;
            
            const result = parseTranscriptContent(oldFormat);
            
            expect(result.metadata.entities?.people).toHaveLength(1);
            expect(result.metadata.entities?.projects).toHaveLength(1);
            expect(result.metadata.entities?.terms).toHaveLength(1);
            expect(result.metadata.entities?.companies).toHaveLength(1);
        });
    });
    
    describe('Lifecycle defaults', () => {
        it('should apply default status "reviewed" to old format', () => {
            const oldFormat = `---
title: No Status
---

Content.
`;
            
            const result = parseTranscriptContent(oldFormat);
            
            expect(result.metadata.status).toBe('reviewed');
        });
        
        it('should preserve existing status', () => {
            const withStatus = `---
title: Has Status
status: closed
---

Content.
`;
            
            const result = parseTranscriptContent(withStatus);
            
            expect(result.metadata.status).toBe('closed');
        });
        
        it('should apply empty history array if missing', () => {
            const noHistory = `---
title: No History
---

Content.
`;
            
            const result = parseTranscriptContent(noHistory);
            
            expect(result.metadata.history).toEqual([]);
        });
        
        it('should apply empty tasks array if missing', () => {
            const noTasks = `---
title: No Tasks
---

Content.
`;
            
            const result = parseTranscriptContent(noTasks);
            
            expect(result.metadata.tasks).toEqual([]);
        });
    });
    
    describe('Round-trip migration', () => {
        it('should preserve all data when migrating old format', () => {
            const oldFormat = `---
title: Migration Test
date: 2026-02-03T10:00:00Z
project: Test Project
projectId: test-project
tags:
  - meeting
  - important
---

Meeting notes here.

---

## Entity References

### People

- \`john-doe\`: John Doe

### Projects

- \`alpha\`: Project Alpha
`;
            
            // Parse (triggers migration in memory)
            const parsed = parseTranscriptContent(oldFormat);
            
            // Save (writes new format)
            const newFormat = stringifyTranscript(parsed.metadata, parsed.body);
            
            // Parse again (should be new format now)
            const reparsed = parseTranscriptContent(newFormat);
            
            // Verify no data loss
            expect(reparsed.metadata.title).toBe('Migration Test');
            expect(reparsed.metadata.project).toBe('Test Project');
            expect(reparsed.metadata.projectId).toBe('test-project');
            expect(reparsed.metadata.tags).toEqual(['meeting', 'important']);
            expect(reparsed.metadata.status).toBe('reviewed');
            expect(reparsed.metadata.entities?.people).toHaveLength(1);
            expect(reparsed.metadata.entities?.people![0].id).toBe('john-doe');
            expect(reparsed.metadata.entities?.projects).toHaveLength(1);
            expect(reparsed.body).toContain('Meeting notes here.');
            
            // Should no longer need migration
            expect(reparsed.needsMigration).toBe(false);
        });
        
        it('should clean body after migration', () => {
            const oldFormat = `---
title: Dirty Body
---

Main content.

---

## Entity References

### People

- \`test\`: Test
`;
            
            const parsed = parseTranscriptContent(oldFormat);
            const newFormat = stringifyTranscript(parsed.metadata, parsed.body);
            const reparsed = parseTranscriptContent(newFormat);
            
            // Body should be clean
            expect(reparsed.body).toBe('Main content.');
            expect(reparsed.body).not.toContain('Entity References');
            
            // Entities should be in frontmatter
            expect(newFormat).toContain('entities:');
        });
    });
    
    describe('Edge cases', () => {
        it('should handle transcript with no entities', () => {
            const noEntities = `---
title: Simple Note
---

Just text, no entities.
`;
            
            const result = parseTranscriptContent(noEntities);
            
            expect(result.metadata.title).toBe('Simple Note');
            expect(result.metadata.entities).toBeUndefined();
            expect(result.body).toBe('Just text, no entities.');
        });
        
        it('should handle completely empty frontmatter', () => {
            const emptyFm = `---
---

Content only.
`;
            
            const result = parseTranscriptContent(emptyFm);
            
            expect(result.metadata.status).toBe('reviewed');
            expect(result.body).toBe('Content only.');
        });
        
        it('should handle transcript with only entity section in body', () => {
            const onlyEntities = `---
title: Only Entities
---

## Entity References

### Terms

- \`api\`: Application Programming Interface
`;
            
            const result = parseTranscriptContent(onlyEntities);
            
            expect(result.metadata.entities?.terms).toHaveLength(1);
            // Body should be empty after stripping entities
            expect(result.body.trim()).toBe('');
        });
    });
});
