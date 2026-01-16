/**
 * Tests for CLI action module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
    parseTranscript,
    extractTimestampFromFilename,
    formatMetadataMarkdown,
    combineTranscripts,
    editTranscript,
    parseFilePaths,
    registerActionCommands,
    slugifyTitle,
    ParsedTranscript,
    TranscriptMetadata,
} from '../../src/cli/action';

// Sample transcript content for testing
const SAMPLE_TRANSCRIPT_1 = `# Meeting Notes Part 1

## Metadata

**Date**: January 15, 2026
**Time**: 02:12 PM

**Project**: ai-safety
**Project ID**: \`ai-safety\`

### Routing

**Destination**: /Users/test/notes
**Confidence**: 85.0%

**Classification Signals**:
- explicit phrase: "ai safety" (80% weight)
- context type: "work" (20% weight)

**Reasoning**: Matched by explicit phrase

**Tags**: \`work\`, \`ai\`, \`safety\`

**Duration**: 5m 30s

---

## Corrected Transcript

This is the first part of the meeting. We discussed AI safety protocols.
`;

const SAMPLE_TRANSCRIPT_2 = `# Meeting Notes Part 2

## Metadata

**Date**: January 15, 2026
**Time**: 02:21 PM

**Project**: ai-safety
**Project ID**: \`ai-safety\`

### Routing

**Destination**: /Users/test/notes
**Confidence**: 90.0%

**Classification Signals**:
- explicit phrase: "ai safety" (80% weight)

**Reasoning**: Matched by explicit phrase

**Tags**: \`work\`, \`ai\`

**Duration**: 3m 15s

---

## Corrected Transcript

This is the second part. We continued with implementation details.
`;

const SAMPLE_TRANSCRIPT_NO_METADATA = `# Simple Note

This is a simple note without metadata section.

Just plain content here.
`;

// Mock the Context module
vi.mock('../../src/context', () => ({
    create: vi.fn(() => Promise.resolve({
        getAllProjects: vi.fn(() => [
            {
                id: 'ai-safety',
                name: 'AI Safety',
                type: 'project',
                classification: {
                    context_type: 'work',
                    explicit_phrases: ['ai safety'],
                },
                routing: {
                    destination: '~/notes/ai-safety',
                    structure: 'month',
                    filename_options: ['date', 'time', 'subject'],
                },
                active: true,
            },
            {
                id: 'personal',
                name: 'Personal Notes',
                type: 'project',
                classification: {
                    context_type: 'personal',
                    explicit_phrases: ['personal note'],
                },
                routing: {
                    destination: '~/notes/personal',
                    structure: 'day',
                    filename_options: ['date', 'subject'],
                },
                active: true,
            },
        ]),
        getProject: vi.fn((id) => {
            if (id === 'ai-safety') {
                return {
                    id: 'ai-safety',
                    name: 'AI Safety',
                    type: 'project',
                    classification: {
                        context_type: 'work',
                        explicit_phrases: ['ai safety'],
                    },
                    routing: {
                        destination: '~/notes/ai-safety',
                        structure: 'month',
                        filename_options: ['date', 'time', 'subject'],
                    },
                    active: true,
                };
            }
            if (id === 'personal') {
                return {
                    id: 'personal',
                    name: 'Personal Notes',
                    type: 'project',
                    classification: {
                        context_type: 'personal',
                        explicit_phrases: ['personal note'],
                    },
                    routing: {
                        destination: '~/notes/personal',
                        structure: 'day',
                        filename_options: ['date', 'subject'],
                    },
                    active: true,
                };
            }
            return undefined;
        }),
        getConfig: vi.fn(() => ({
            outputDirectory: '~/notes',
            outputStructure: 'month',
            outputFilenameOptions: ['date', 'time', 'subject'],
        })),
        getAllPeople: vi.fn(() => []),
        getAllTerms: vi.fn(() => []),
        getAllCompanies: vi.fn(() => []),
        getAllIgnored: vi.fn(() => []),
        hasContext: vi.fn(() => true),
    })),
}));

describe('parseTranscript', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-test-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should parse a transcript with full metadata', async () => {
        const filePath = path.join(tempDir, '15-1412-meeting.md');
        await fs.writeFile(filePath, SAMPLE_TRANSCRIPT_1);

        const result = await parseTranscript(filePath);

        expect(result.title).toBe('Meeting Notes Part 1');
        expect(result.metadata.date).toBe('January 15, 2026');
        expect(result.metadata.time).toBe('02:12 PM');
        expect(result.metadata.project).toBe('ai-safety');
        expect(result.metadata.projectId).toBe('ai-safety');
        expect(result.metadata.destination).toBe('/Users/test/notes');
        expect(result.metadata.confidence).toBe('85.0%');
        expect(result.metadata.reasoning).toBe('Matched by explicit phrase');
        expect(result.metadata.tags).toEqual(['work', 'ai', 'safety']);
        expect(result.metadata.duration).toBe('5m 30s');
        expect(result.metadata.signals).toContain('explicit phrase: "ai safety" (80% weight)');
        expect(result.content).toContain('This is the first part of the meeting');
    });

    it('should parse a transcript without metadata', async () => {
        const filePath = path.join(tempDir, 'simple.md');
        await fs.writeFile(filePath, SAMPLE_TRANSCRIPT_NO_METADATA);

        const result = await parseTranscript(filePath);

        expect(result.title).toBe('Simple Note');
        expect(result.metadata.date).toBeUndefined();
        expect(result.metadata.project).toBeUndefined();
        expect(result.content).toContain('This is a simple note');
    });

    it('should preserve raw text', async () => {
        const filePath = path.join(tempDir, 'test.md');
        await fs.writeFile(filePath, SAMPLE_TRANSCRIPT_1);

        const result = await parseTranscript(filePath);

        expect(result.rawText).toBe(SAMPLE_TRANSCRIPT_1);
    });
});

describe('extractTimestampFromFilename', () => {
    it('should extract timestamp from standard format', () => {
        const result = extractTimestampFromFilename('/path/to/15-1412-meeting.md');
        
        expect(result).toEqual({
            day: 15,
            hour: 14,
            minute: 12,
        });
    });

    it('should extract timestamp with single-digit day', () => {
        const result = extractTimestampFromFilename('/path/to/5-0930-standup.md');
        
        expect(result).toEqual({
            day: 5,
            hour: 9,
            minute: 30,
        });
    });

    it('should return null for non-matching format', () => {
        const result = extractTimestampFromFilename('/path/to/meeting-notes.md');
        
        expect(result).toBeNull();
    });

    it('should handle complex filenames', () => {
        const result = extractTimestampFromFilename('/Users/test/2026/1/15-1421-so-let-s-talk-about-what-those-dimension.md');
        
        expect(result).toEqual({
            day: 15,
            hour: 14,
            minute: 21,
        });
    });
});

describe('slugifyTitle', () => {
    it('should convert title to lowercase slug', () => {
        const result = slugifyTitle('New Approach to Life');
        expect(result).toBe('new-approach-to-life');
    });

    it('should handle special characters', () => {
        const result = slugifyTitle('Meeting: Q1 Planning & Review!');
        expect(result).toBe('meeting-q1-planning-review');
    });

    it('should collapse multiple dashes', () => {
        const result = slugifyTitle('Hello --- World');
        expect(result).toBe('hello-world');
    });

    it('should remove leading/trailing dashes', () => {
        const result = slugifyTitle('---Title Here---');
        expect(result).toBe('title-here');
    });

    it('should truncate long titles', () => {
        const longTitle = 'This is a very long title that should be truncated to prevent extremely long filenames';
        const result = slugifyTitle(longTitle);
        expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should handle numbers', () => {
        const result = slugifyTitle('Sprint 42 Retrospective 2026');
        expect(result).toBe('sprint-42-retrospective-2026');
    });
});

describe('formatMetadataMarkdown', () => {
    it('should format metadata with all fields', () => {
        const metadata: TranscriptMetadata = {
            date: 'January 15, 2026',
            time: '02:12 PM',
            project: 'AI Safety',
            projectId: 'ai-safety',
            destination: '/Users/test/notes',
            confidence: '85.0%',
            signals: ['explicit phrase: "ai safety" (80% weight)'],
            reasoning: 'Matched by explicit phrase',
            tags: ['work', 'ai'],
            duration: '5m 30s',
        };

        const result = formatMetadataMarkdown('Test Title', metadata);

        expect(result).toContain('# Test Title');
        expect(result).toContain('## Metadata');
        expect(result).toContain('**Date**: January 15, 2026');
        expect(result).toContain('**Time**: 02:12 PM');
        expect(result).toContain('**Project**: AI Safety');
        expect(result).toContain('**Project ID**: `ai-safety`');
        expect(result).toContain('### Routing');
        expect(result).toContain('**Destination**: /Users/test/notes');
        expect(result).toContain('**Confidence**: 85.0%');
        expect(result).toContain('**Tags**: `work`, `ai`');
        expect(result).toContain('**Duration**: 5m 30s');
        expect(result).toContain('---');
    });

    it('should format metadata with project override', () => {
        const metadata: TranscriptMetadata = {
            date: 'January 15, 2026',
        };
        const project = {
            id: 'new-project',
            name: 'New Project',
            type: 'project' as const,
            classification: { context_type: 'work' as const },
            routing: { structure: 'month' as const, filename_options: ['date' as const] },
        };

        const result = formatMetadataMarkdown('Test', metadata, project);

        expect(result).toContain('**Project**: New Project');
        expect(result).toContain('**Project ID**: `new-project`');
    });

    it('should handle minimal metadata', () => {
        const metadata: TranscriptMetadata = {};

        const result = formatMetadataMarkdown('Minimal', metadata);

        expect(result).toContain('# Minimal');
        expect(result).toContain('## Metadata');
        expect(result).toContain('---');
    });
});

describe('parseFilePaths', () => {
    it('should parse newline-separated paths', () => {
        const input = `/path/to/file1.md
/path/to/file2.md
/path/to/file3.md`;

        const result = parseFilePaths(input);

        expect(result).toEqual([
            '/path/to/file1.md',
            '/path/to/file2.md',
            '/path/to/file3.md',
        ]);
    });

    it('should handle paths with spaces', () => {
        const input = `/Users/test/My Drive/notes/file1.md
/Users/test/My Drive/notes/file2.md`;

        const result = parseFilePaths(input);

        expect(result).toEqual([
            '/Users/test/My Drive/notes/file1.md',
            '/Users/test/My Drive/notes/file2.md',
        ]);
    });

    it('should filter empty lines', () => {
        const input = `/path/to/file1.md

/path/to/file2.md

`;

        const result = parseFilePaths(input);

        expect(result).toEqual([
            '/path/to/file1.md',
            '/path/to/file2.md',
        ]);
    });

    it('should trim whitespace', () => {
        const input = `  /path/to/file1.md  
   /path/to/file2.md   `;

        const result = parseFilePaths(input);

        expect(result).toEqual([
            '/path/to/file1.md',
            '/path/to/file2.md',
        ]);
    });
});

describe('combineTranscripts', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-combine-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should combine two transcripts', async () => {
        const file1 = path.join(tempDir, '15-1412-part1.md');
        const file2 = path.join(tempDir, '15-1421-part2.md');
        
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_1);
        await fs.writeFile(file2, SAMPLE_TRANSCRIPT_2);

        const result = await combineTranscripts([file1, file2]);

        expect(result.content).toContain('# Meeting Notes Part 1 (Combined)');
        expect(result.content).toContain('## Meeting Notes Part 1');
        expect(result.content).toContain('## Meeting Notes Part 2');
        expect(result.content).toContain('This is the first part of the meeting');
        expect(result.content).toContain('This is the second part');
        expect(result.content).toContain('*Source: 15-1412-part1.md*');
        expect(result.content).toContain('*Source: 15-1421-part2.md*');
    });

    it('should use first transcript metadata as base', async () => {
        const file1 = path.join(tempDir, '15-1412-part1.md');
        const file2 = path.join(tempDir, '15-1421-part2.md');
        
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_1);
        await fs.writeFile(file2, SAMPLE_TRANSCRIPT_2);

        const result = await combineTranscripts([file1, file2]);

        // Should use first transcript's date/time
        expect(result.content).toContain('**Date**: January 15, 2026');
        expect(result.content).toContain('**Time**: 02:12 PM');
    });

    it('should combine durations', async () => {
        const file1 = path.join(tempDir, '15-1412-part1.md');
        const file2 = path.join(tempDir, '15-1421-part2.md');
        
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_1);
        await fs.writeFile(file2, SAMPLE_TRANSCRIPT_2);

        const result = await combineTranscripts([file1, file2]);

        // 5m 30s + 3m 15s = 8m 45s
        expect(result.content).toContain('**Duration**: 8m 45s');
    });

    it('should deduplicate tags', async () => {
        const file1 = path.join(tempDir, '15-1412-part1.md');
        const file2 = path.join(tempDir, '15-1421-part2.md');
        
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_1);
        await fs.writeFile(file2, SAMPLE_TRANSCRIPT_2);

        const result = await combineTranscripts([file1, file2]);

        // Tags from both: work, ai, safety (from 1) + work, ai (from 2)
        // Should deduplicate to: ai, safety, work (sorted)
        expect(result.content).toContain('**Tags**: `ai`, `safety`, `work`');
    });

    it('should sort transcripts by filename', async () => {
        const file1 = path.join(tempDir, '15-1421-part2.md');
        const file2 = path.join(tempDir, '15-1412-part1.md');
        
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_2);
        await fs.writeFile(file2, SAMPLE_TRANSCRIPT_1);

        // Pass in reverse order
        const result = await combineTranscripts([file1, file2]);

        // Should still have part1 first (sorted by filename)
        const part1Index = result.content.indexOf('## Meeting Notes Part 1');
        const part2Index = result.content.indexOf('## Meeting Notes Part 2');
        expect(part1Index).toBeLessThan(part2Index);
    });

    it('should throw error for empty file list', async () => {
        await expect(combineTranscripts([])).rejects.toThrow('No transcript files provided');
    });

    it('should throw error for non-existent project', async () => {
        const file1 = path.join(tempDir, '15-1412-part1.md');
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_1);

        await expect(
            combineTranscripts([file1], { projectId: 'non-existent' })
        ).rejects.toThrow('Project not found: non-existent');
    });

    it('should update metadata when changing project', async () => {
        const file1 = path.join(tempDir, '15-1412-part1.md');
        const file2 = path.join(tempDir, '15-1421-part2.md');
        
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_1);
        await fs.writeFile(file2, SAMPLE_TRANSCRIPT_2);

        const result = await combineTranscripts([file1, file2], { projectId: 'personal' });

        expect(result.content).toContain('**Project**: Personal Notes');
        expect(result.content).toContain('**Project ID**: `personal`');
    });

    it('should generate output path based on first transcript', async () => {
        const file1 = path.join(tempDir, '15-1412-part1.md');
        const file2 = path.join(tempDir, '15-1421-part2.md');
        
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_1);
        await fs.writeFile(file2, SAMPLE_TRANSCRIPT_2);

        const result = await combineTranscripts([file1, file2]);

        expect(result.outputPath).toContain('15-1412-combined.md');
        expect(result.outputPath).toContain(tempDir);
    });

    it('should use custom title when provided', async () => {
        const file1 = path.join(tempDir, '15-1412-part1.md');
        const file2 = path.join(tempDir, '15-1421-part2.md');
        
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_1);
        await fs.writeFile(file2, SAMPLE_TRANSCRIPT_2);

        const result = await combineTranscripts([file1, file2], { title: 'New Approach to Life' });

        expect(result.content).toContain('# New Approach to Life');
        expect(result.content).not.toContain('(Combined)');
    });

    it('should use slugified custom title in filename', async () => {
        const file1 = path.join(tempDir, '15-1412-part1.md');
        const file2 = path.join(tempDir, '15-1421-part2.md');
        
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_1);
        await fs.writeFile(file2, SAMPLE_TRANSCRIPT_2);

        const result = await combineTranscripts([file1, file2], { title: 'New Approach to Life' });

        expect(result.outputPath).toContain('15-1412-new-approach-to-life.md');
    });

    it('should handle title with special characters in filename', async () => {
        const file1 = path.join(tempDir, '15-1412-part1.md');
        const file2 = path.join(tempDir, '15-1421-part2.md');
        
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_1);
        await fs.writeFile(file2, SAMPLE_TRANSCRIPT_2);

        const result = await combineTranscripts([file1, file2], { title: 'Meeting: Q1 Planning & Review!' });

        expect(result.outputPath).toContain('15-1412-meeting-q1-planning-review.md');
        expect(result.content).toContain('# Meeting: Q1 Planning & Review!');
    });
});

describe('editTranscript', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-edit-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should update title in document', async () => {
        const file = path.join(tempDir, '15-1412-original.md');
        await fs.writeFile(file, SAMPLE_TRANSCRIPT_1);

        const result = await editTranscript(file, { title: 'New Amazing Title' });

        expect(result.content).toContain('# New Amazing Title');
        expect(result.content).not.toContain('# Meeting Notes Part 1');
    });

    it('should update filename with slugified title', async () => {
        const file = path.join(tempDir, '15-1412-original.md');
        await fs.writeFile(file, SAMPLE_TRANSCRIPT_1);

        const result = await editTranscript(file, { title: 'New Amazing Title' });

        expect(result.outputPath).toContain('15-1412-new-amazing-title.md');
    });

    it('should preserve metadata when only changing title', async () => {
        const file = path.join(tempDir, '15-1412-original.md');
        await fs.writeFile(file, SAMPLE_TRANSCRIPT_1);

        const result = await editTranscript(file, { title: 'New Title' });

        expect(result.content).toContain('**Date**: January 15, 2026');
        expect(result.content).toContain('**Project**: ai-safety');
    });

    it('should preserve content when editing', async () => {
        const file = path.join(tempDir, '15-1412-original.md');
        await fs.writeFile(file, SAMPLE_TRANSCRIPT_1);

        const result = await editTranscript(file, { title: 'New Title' });

        expect(result.content).toContain('This is the first part of the meeting');
    });

    it('should keep original filename if no title provided', async () => {
        const file = path.join(tempDir, '15-1412-original.md');
        await fs.writeFile(file, SAMPLE_TRANSCRIPT_1);

        // Need to mock context for project change
        // For now, just verify the path stays the same with no title
        const result = await editTranscript(file, { title: undefined });

        expect(result.outputPath).toBe(file);
    });

    it('should throw error for non-existent project', async () => {
        const file = path.join(tempDir, '15-1412-original.md');
        await fs.writeFile(file, SAMPLE_TRANSCRIPT_1);

        await expect(
            editTranscript(file, { projectId: 'non-existent' })
        ).rejects.toThrow('Project not found: non-existent');
    });
});

describe('registerActionCommands', () => {
    let program: Command;

    beforeEach(() => {
        program = new Command();
        program.exitOverride();
        registerActionCommands(program);
    });

    it('should register action command', () => {
        const actionCmd = program.commands.find(c => c.name() === 'action');
        expect(actionCmd).toBeDefined();
    });

    it('should have --title option', () => {
        const actionCmd = program.commands.find(c => c.name() === 'action');
        const titleOption = actionCmd?.options.find(o => o.long === '--title');
        expect(titleOption).toBeDefined();
    });

    it('should have --project option', () => {
        const actionCmd = program.commands.find(c => c.name() === 'action');
        const projectOption = actionCmd?.options.find(o => o.long === '--project');
        expect(projectOption).toBeDefined();
    });

    it('should have --combine option', () => {
        const actionCmd = program.commands.find(c => c.name() === 'action');
        const combineOption = actionCmd?.options.find(o => o.long === '--combine');
        expect(combineOption).toBeDefined();
    });

    it('should have --dry-run option', () => {
        const actionCmd = program.commands.find(c => c.name() === 'action');
        const dryRunOption = actionCmd?.options.find(o => o.long === '--dry-run');
        expect(dryRunOption).toBeDefined();
    });

    it('should have --verbose option', () => {
        const actionCmd = program.commands.find(c => c.name() === 'action');
        const verboseOption = actionCmd?.options.find(o => o.long === '--verbose');
        expect(verboseOption).toBeDefined();
    });

    it('should accept optional file argument', () => {
        const actionCmd = program.commands.find(c => c.name() === 'action');
        // Commander stores arguments as _args internally, or check registeredArguments
        expect(actionCmd?.registeredArguments?.length).toBe(1);
        expect(actionCmd?.registeredArguments?.[0]?.required).toBe(false);
    });
});

describe('Integration: parseTranscript and combineTranscripts', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-integration-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should handle transcripts without metadata sections', async () => {
        const file1 = path.join(tempDir, '15-1412-note1.md');
        const file2 = path.join(tempDir, '15-1421-note2.md');
        
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_NO_METADATA);
        await fs.writeFile(file2, '# Another Note\n\nMore content here.');

        const result = await combineTranscripts([file1, file2]);

        expect(result.content).toContain('Simple Note (Combined)');
        expect(result.content).toContain('## Simple Note');
        expect(result.content).toContain('## Another Note');
    });

    it('should handle mixed transcripts (with and without metadata)', async () => {
        const file1 = path.join(tempDir, '15-1412-with-meta.md');
        const file2 = path.join(tempDir, '15-1421-no-meta.md');
        
        await fs.writeFile(file1, SAMPLE_TRANSCRIPT_1);
        await fs.writeFile(file2, SAMPLE_TRANSCRIPT_NO_METADATA);

        const result = await combineTranscripts([file1, file2]);

        // Should use metadata from first file
        expect(result.content).toContain('**Date**: January 15, 2026');
        expect(result.content).toContain('## Meeting Notes Part 1');
        expect(result.content).toContain('## Simple Note');
    });
});
