/**
 * Tests for Output Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Output from '../../src/output';
import * as Metadata from '../../src/util/metadata';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock logging
vi.mock('../../src/logging', () => ({
    getLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

describe('Output Manager', () => {
    let tempDir: string;
  
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-output-test-'));
    });
  
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true });
    });
  
    describe('createOutputPaths', () => {
        it('should create output paths with correct naming', () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYYY-MM-DD-HHmm',
            });
      
            const date = new Date('2026-01-11T12:45:00');
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                '/notes/2026/01/11-meeting.md',
                'abc123def456',
                date
            );
      
            expect(paths.final).toBe('/notes/2026/01/11-meeting.md');
            // New format: YYYY-MM-DD-HHmm-<type>-<hash>.ext (hash at end)
            expect(paths.intermediate.transcript).toContain('2026-01-11-1245-transcript-abc123.json');
            expect(paths.intermediate.reflection).toContain('2026-01-11-1245-reflection-abc123.md');
        });
    
        it('should use short hash (6 chars)', () => {
            const output = Output.create({
                intermediateDir: tempDir,
                keepIntermediates: true,
                timestampFormat: 'YYYY-MM-DD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/test.m4a',
                '/notes/test.md',
                'abcdefghijklmnop',
                new Date('2026-01-11T10:30:00')
            );
      
            // Hash is now at the end of filename
            expect(paths.intermediate.transcript).toContain('-abcdef.json');
            expect(paths.intermediate.transcript).not.toContain('ghijklmnop');
        });
    
        it('should create all intermediate file paths', () => {
            const output = Output.create({
                intermediateDir: tempDir,
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/test.m4a',
                '/notes/test.md',
                'abc123',
                new Date()
            );
      
            expect(paths.intermediate.transcript).toBeDefined();
            expect(paths.intermediate.context).toBeDefined();
            expect(paths.intermediate.request).toBeDefined();
            expect(paths.intermediate.response).toBeDefined();
            expect(paths.intermediate.reflection).toBeDefined();
            expect(paths.intermediate.session).toBeDefined();
        });
    });
  
    describe('ensureDirectories', () => {
        it('should create intermediate and final directories', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/test.m4a',
                path.join(tempDir, 'notes/2026/01/test.md'),
                'abc123',
                new Date()
            );
      
            await output.ensureDirectories(paths);
      
            // Check directories exist
            const intermediateDir = path.dirname(paths.intermediate.transcript);
            const finalDir = path.dirname(paths.final);
      
            await expect(fs.access(intermediateDir)).resolves.toBeUndefined();
            await expect(fs.access(finalDir)).resolves.toBeUndefined();
        });
    });
  
    describe('writeIntermediate', () => {
        it('should write JSON content', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                path.join(tempDir, 'notes/test.md'),
                'abc123',
                new Date()
            );
      
            await output.ensureDirectories(paths);
      
            const testContent = { text: 'Hello world', items: [1, 2, 3] };
            await output.writeIntermediate(paths, 'transcript', testContent);
      
            const written = await fs.readFile(paths.intermediate.transcript, 'utf-8');
            expect(JSON.parse(written)).toEqual(testContent);
        });
    
        it('should write string content directly', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                path.join(tempDir, 'notes/test.md'),
                'abc123',
                new Date()
            );
      
            await output.ensureDirectories(paths);
      
            const reflectionContent = '# Reflection\n\nThis is a reflection.';
            await output.writeIntermediate(paths, 'reflection', reflectionContent);
      
            const written = await fs.readFile(paths.intermediate.reflection!, 'utf-8');
            expect(written).toBe(reflectionContent);
        });
    
        it('should return the written file path', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                path.join(tempDir, 'notes/test.md'),
                'abc123',
                new Date()
            );
      
            await output.ensureDirectories(paths);
      
            const writtenPath = await output.writeIntermediate(paths, 'context', { test: true });
            expect(writtenPath).toBe(paths.intermediate.context);
        });
    });
  
    describe('writeTranscript', () => {
        it('should write final transcript', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const finalPath = path.join(tempDir, 'notes/2026/01/meeting.md');
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                finalPath,
                'abc123',
                new Date()
            );
      
            await output.ensureDirectories(paths);
      
            const content = '# Meeting Notes\n\nThis is the transcript.';
            const writtenPath = await output.writeTranscript(paths, content);
      
            expect(writtenPath).toBe(finalPath);
            const written = await fs.readFile(finalPath, 'utf-8');
            expect(written).toBe(content);
        });

        it('should prepend metadata when provided', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const finalPath = path.join(tempDir, 'notes/2026/01/meeting.md');
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                finalPath,
                'abc123',
                new Date()
            );
      
            await output.ensureDirectories(paths);
      
            const metadata: Metadata.TranscriptMetadata = {
                title: 'Team Meeting',
                project: 'Project Alpha',
                projectId: 'proj-alpha',
                date: new Date('2026-01-12T14:30:00'),
                tags: ['meeting', 'Q1-planning'],
            };

            const content = '# Meeting Notes\n\nThis is the transcript.';
            await output.writeTranscript(paths, content, metadata);
      
            const written = await fs.readFile(finalPath, 'utf-8');
            
            // Metadata should be at the beginning
            expect(written).toContain('# Team Meeting');
            expect(written).toContain('## Metadata');
            expect(written).toContain('**Project**: Project Alpha');
            expect(written).toContain('**Tags**: `meeting`, `Q1-planning`');
            
            // Original content should be after metadata
            expect(written).toContain('---');
            expect(written).toContain('# Meeting Notes');
        });

        it('should include routing metadata in transcript', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const finalPath = path.join(tempDir, 'notes/2026/01/meeting.md');
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                finalPath,
                'abc123',
                new Date()
            );
      
            await output.ensureDirectories(paths);
      
            const routing: Metadata.RoutingMetadata = {
                destination: '/home/user/work/notes',
                confidence: 0.95,
                signals: [
                    { type: 'explicit_phrase', value: 'work meeting', weight: 0.9 },
                ],
                reasoning: 'Matched by explicit phrase',
            };

            const metadata: Metadata.TranscriptMetadata = {
                title: 'Work Meeting',
                date: new Date('2026-01-12T14:30:00'),
                routing,
            };

            const content = 'Meeting transcript content here.';
            await output.writeTranscript(paths, content, metadata);
      
            const written = await fs.readFile(finalPath, 'utf-8');
            
            expect(written).toContain('### Routing');
            expect(written).toContain('**Destination**: /home/user/work/notes');
            expect(written).toContain('**Confidence**: 95.0%');
            expect(written).toContain('**Classification Signals**:');
            expect(written).toContain('explicit phrase');
        });
    });
  
    describe('cleanIntermediates', () => {
        it('should remove intermediate files when keepIntermediates is false', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: false,  // Will clean
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                path.join(tempDir, 'notes/test.md'),
                'abc123',
                new Date()
            );
      
            await output.ensureDirectories(paths);
            await output.writeIntermediate(paths, 'transcript', { test: true });
      
            // File should exist
            await expect(fs.access(paths.intermediate.transcript)).resolves.toBeUndefined();
      
            // Clean
            await output.cleanIntermediates(paths);
      
            // File should be gone
            await expect(fs.access(paths.intermediate.transcript)).rejects.toThrow();
        });
    
        it('should keep files when keepIntermediates is true', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,  // Will keep
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                path.join(tempDir, 'notes/test.md'),
                'abc123',
                new Date()
            );
      
            await output.ensureDirectories(paths);
            await output.writeIntermediate(paths, 'transcript', { test: true });
      
            // Clean (should do nothing)
            await output.cleanIntermediates(paths);
      
            // File should still exist
            await expect(fs.access(paths.intermediate.transcript)).resolves.toBeUndefined();
        });
    
        it('should handle missing files gracefully', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: false,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                path.join(tempDir, 'notes/test.md'),
                'abc123',
                new Date()
            );
      
            // Don't create any files, just try to clean
            await expect(output.cleanIntermediates(paths)).resolves.toBeUndefined();
        });
    });
  
    describe('DEFAULT_OUTPUT_CONFIG', () => {
        it('should have sensible defaults', () => {
            expect(Output.DEFAULT_OUTPUT_CONFIG.intermediateDir).toBe('./output/protokoll');
            expect(Output.DEFAULT_OUTPUT_CONFIG.keepIntermediates).toBe(true);
            expect(Output.DEFAULT_OUTPUT_CONFIG.timestampFormat).toBe('YYMMDD-HHmm');
        });
    });

    describe('rawTranscript path', () => {
        it('should create rawTranscript path in .transcript/ alongside final output', () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                '/notes/2026/01/11-meeting.md',
                'abc123',
                new Date()
            );
      
            expect(paths.rawTranscript).toBe('/notes/2026/01/.transcript/11-meeting.json');
        });

        it('should preserve directory structure for rawTranscript', () => {
            const output = Output.create({
                intermediateDir: tempDir,
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/test.m4a',
                '/users/tobrien/notes/work/project-alpha/2026-01-15-standup.md',
                'abc123',
                new Date()
            );
      
            expect(paths.rawTranscript).toBe(
                '/users/tobrien/notes/work/project-alpha/.transcript/2026-01-15-standup.json'
            );
        });
    });

    describe('writeRawTranscript', () => {
        it('should write raw transcript data to .transcript/ directory', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                path.join(tempDir, 'notes/2026/01/meeting.md'),
                'abc123def456',
                new Date()
            );
      
            await output.ensureDirectories(paths);
      
            const rawData = {
                text: 'This is the raw whisper output.',
                model: 'whisper-1',
                duration: 5432,
                audioFile: '/audio/recording.m4a',
                audioHash: 'abc123def456',
                transcribedAt: '2026-01-15T14:30:00.000Z',
            };
      
            const writtenPath = await output.writeRawTranscript(paths, rawData);
      
            expect(writtenPath).toBe(paths.rawTranscript);
            const content = await fs.readFile(writtenPath, 'utf-8');
            expect(JSON.parse(content)).toEqual(rawData);
        });

        it('should create .transcript/ directory if it does not exist', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                path.join(tempDir, 'new-notes/deep/nested/meeting.md'),
                'abc123',
                new Date()
            );
      
            await output.ensureDirectories(paths);
      
            const rawData = {
                text: 'Test transcript',
                model: 'whisper-1',
                duration: 1000,
                audioFile: '/audio/recording.m4a',
                audioHash: 'abc123',
                transcribedAt: new Date().toISOString(),
            };
      
            await output.writeRawTranscript(paths, rawData);
      
            // Verify .transcript directory was created
            const transcriptDir = path.dirname(paths.rawTranscript);
            await expect(fs.access(transcriptDir)).resolves.toBeUndefined();
        });
    });

    describe('readRawTranscript', () => {
        it('should read previously written raw transcript', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const finalPath = path.join(tempDir, 'notes/2026/01/meeting.md');
            const paths = output.createOutputPaths(
                '/audio/recording.m4a',
                finalPath,
                'abc123def456',
                new Date()
            );
      
            await output.ensureDirectories(paths);
      
            const rawData = {
                text: 'This is the raw whisper output for reading test.',
                model: 'whisper-1',
                duration: 3500,
                audioFile: '/audio/recording.m4a',
                audioHash: 'abc123def456',
                transcribedAt: '2026-01-15T10:00:00.000Z',
            };
      
            await output.writeRawTranscript(paths, rawData);
      
            const readData = await output.readRawTranscript(finalPath);
            expect(readData).toEqual(rawData);
        });

        it('should return null when no raw transcript exists', async () => {
            const output = Output.create({
                intermediateDir: path.join(tempDir, 'output/protokoll'),
                keepIntermediates: true,
                timestampFormat: 'YYMMDD-HHmm',
            });
      
            const nonExistentPath = path.join(tempDir, 'notes/2026/01/no-such-file.md');
            const readData = await output.readRawTranscript(nonExistentPath);
            expect(readData).toBeNull();
        });
    });
});

