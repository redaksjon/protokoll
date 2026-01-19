/**
 * Tests for Agentic Executor
 * 
 * Focus: Ensuring internal processing information doesn't leak into transcripts
 */

import { describe, it, expect } from 'vitest';

/**
 * Clean response content by removing any leaked internal processing information
 * that should never appear in the user-facing transcript.
 * 
 * NOTE: This is a copy of the function from executor.ts for testing purposes.
 * We can't import it directly as it's not exported.
 */
const cleanResponseContent = (content: string): string => {
    // Remove common patterns of leaked internal processing
    // Pattern 1: "Using tools to..." type commentary
    let cleaned = content.replace(/^(?:Using tools?|Let me|I'll|I will|Now I'll|First,?\s*I(?:'ll| will)).*?[\r\n]+/gim, '');
    
    // Pattern 2: JSON tool call artifacts like {"tool":"...","input":{...}}
    cleaned = cleaned.replace(/\{"tool":\s*"[^"]+",\s*"input":\s*\{[^}]*\}\}/g, '');
    
    // Pattern 3: Tool call references in the format tool_name({...})
    cleaned = cleaned.replace(/\b\w+_\w+\(\{[^}]*\}\)/g, '');
    
    // Pattern 4: Lines that are purely reasoning/commentary before the actual content
    // Look for lines like "I'll verify...", "Checking...", etc.
    const lines = cleaned.split('\n');
    let startIndex = 0;
    
    // Skip leading lines that look like internal commentary
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines
        if (line === '') continue;
        
        // Check if line looks like commentary (starts with action verbs, contains "tool", etc.)
        const isCommentary = /^(checking|verifying|looking|searching|analyzing|processing|determining|using|calling|executing|I'm|I am|Let me)/i.test(line)
            || line.includes('tool')
            || line.includes('{"')
            || line.includes('reasoning');
        
        if (!isCommentary) {
            // This looks like actual content - start from here
            startIndex = i;
            break;
        }
    }
    
    // Rejoin from the first real content line
    if (startIndex > 0) {
        cleaned = lines.slice(startIndex).join('\n');
    }
    
    return cleaned.trim();
};

describe('cleanResponseContent', () => {
    it('should remove "Using tools" commentary', () => {
        const input = `Using tools to verify project names and route the note.

## Transcript

This is the actual transcript content.`;
        
        const expected = `## Transcript

This is the actual transcript content.`;
        
        expect(cleanResponseContent(input)).toBe(expected);
    });
    
    it('should remove JSON tool call artifacts', () => {
        const input = `{"tool":"lookup_project","input":{"name":"CoderDrive"}}{"tool":"route_note","input":{"content":"Another project..."}}

## Transcript

This is the actual transcript content.`;
        
        const expected = `## Transcript

This is the actual transcript content.`;
        
        expect(cleanResponseContent(input)).toBe(expected);
    });
    
    it('should remove the example from the bug report', () => {
        const input = `Using tools to verify project names and route the note.{"tool":"lookup_project","input":{"name":"CoderDrive"}}{"tool":"lookup_project","input":{"name":"CoderDriveTreePublish"}}{"tool":"lookup_project","input":{"name":"Grundverk"}}{"tool":"route_note","input":{"content":"Another project idea: tool to enforce and verify standards across multiple GitHub projects..."}}

## Transcript

Another project idea: tool to enforce and verify standards across multiple GitHub projects.`;
        
        const expected = `## Transcript

Another project idea: tool to enforce and verify standards across multiple GitHub projects.`;
        
        expect(cleanResponseContent(input)).toBe(expected);
    });
    
    it('should preserve clean transcript content unchanged', () => {
        const input = `## Transcript

This is a clean transcript with no internal processing information.

It has multiple paragraphs and should remain unchanged.`;
        
        expect(cleanResponseContent(input)).toBe(input);
    });
    
    it('should remove multiple types of commentary', () => {
        const input = `Let me verify the project names first.
I'll check the context database.
Using lookup_project tool.
{"tool":"lookup_project","input":{"name":"TestProject"}}

## Transcript

Actual content starts here.`;
        
        const expected = `## Transcript

Actual content starts here.`;
        
        expect(cleanResponseContent(input)).toBe(expected);
    });
    
    it('should handle content with no leaked information', () => {
        const input = `Just a normal transcript.`;
        expect(cleanResponseContent(input)).toBe(input);
    });
    
    it('should remove "I\'m" and "I am" commentary', () => {
        const input = `I'm analyzing the transcript now.
I am checking for names.

## Transcript

Real content.`;
        
        const expected = `## Transcript

Real content.`;
        
        expect(cleanResponseContent(input)).toBe(expected);
    });
    
    it('should skip empty lines when looking for real content', () => {
        const input = `Using tools to verify.


## Transcript

Content here.`;
        
        const expected = `## Transcript

Content here.`;
        
        expect(cleanResponseContent(input)).toBe(expected);
    });
    
    it('should handle tool_name({...}) format', () => {
        const input = `lookup_project({"name":"Test"})route_note({"content":"..."})

## Transcript

Real transcript.`;
        
        const expected = `## Transcript

Real transcript.`;
        
        expect(cleanResponseContent(input)).toBe(expected);
    });
    
    it('should not accidentally remove transcript content that happens to contain "tool"', () => {
        const input = `## Transcript

We discussed the new developer tool we're building.
The tool will help automate deployments.`;
        
        // Should preserve content as-is since "tool" in context is valid
        expect(cleanResponseContent(input)).toBe(input);
    });
    
    it('should handle mixed case commentary', () => {
        const input = `USING TOOLS to verify
Let Me Check This

## Transcript

Content.`;
        
        const expected = `## Transcript

Content.`;
        
        expect(cleanResponseContent(input)).toBe(expected);
    });
});
