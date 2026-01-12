/**
 * Tests for Report Generator
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as Reporter from '../../src/reflection/reporter';
import * as Collector from '../../src/reflection/collector';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ReflectionConfig } from '../../src/reflection/types';

// Mock logging
vi.mock('../../src/logging', () => ({
    getLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

describe('Report Generator', () => {
    let tempDir: string;
    let config: ReflectionConfig;
    let collector: Collector.CollectorInstance;
  
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-reflection-test-'));
        config = {
            enabled: true,
            format: 'markdown',
            includeConversation: false,
            includeOutput: true,
        };
        collector = Collector.create();
        collector.start();
    });
  
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true });
    });
  
    describe('generate', () => {
        it('should generate a report with basic metrics', () => {
            const reporter = Reporter.create(config);
            collector.recordWhisper(1000);
            collector.recordToolCall('lookup_person', 50, true);
      
            const report = reporter.generate(
                collector,
                '/audio/test.m4a',
                '/notes/test.md'
            );
      
            expect(report.id).toMatch(/^reflection-/);
            expect(report.generated).toBeInstanceOf(Date);
            expect(report.audioFile).toBe('/audio/test.m4a');
            expect(report.outputFile).toBe('/notes/test.md');
            expect(report.summary).toBeDefined();
            expect(report.metrics).toBeDefined();
            expect(report.toolEffectiveness).toBeDefined();
            expect(report.quality).toBeDefined();
            expect(report.recommendations).toBeDefined();
        });
    
        it('should include output when configured', () => {
            const reporter = Reporter.create({ ...config, includeOutput: true });
      
            const report = reporter.generate(
                collector,
                '/audio/test.m4a',
                '/notes/test.md',
                undefined,
                'This is the output'
            );
      
            expect(report.output).toBe('This is the output');
        });
    
        it('should exclude output when not configured', () => {
            const reporter = Reporter.create({ ...config, includeOutput: false });
      
            const report = reporter.generate(
                collector,
                '/audio/test.m4a',
                '/notes/test.md',
                undefined,
                'This is the output'
            );
      
            expect(report.output).toBeUndefined();
        });
    
        it('should include conversation when configured', () => {
            const reporter = Reporter.create({ ...config, includeConversation: true });
            const history = [{ role: 'user', content: 'test' }];
      
            const report = reporter.generate(
                collector,
                '/audio/test.m4a',
                '/notes/test.md',
                history
            );
      
            expect(report.conversationHistory).toEqual(history);
        });
    });
  
    describe('quality assessment', () => {
        it('should calculate high quality for good metrics', () => {
            const reporter = Reporter.create(config);
            collector.recordCorrection('original text', 'original text corrected');
            collector.recordToolCall('tool1', 50, true);
            collector.recordToolCall('tool2', 50, true);
      
            const report = reporter.generate(collector, '/audio/test.m4a', '/notes/test.md');
      
            expect(report.quality.confidence).toBeGreaterThan(0.8);
            expect(report.quality.contentPreservation).toBe(1.0);
        });
    
        it('should detect low name accuracy', () => {
            const reporter = Reporter.create(config);
            collector.recordUnknownEntity('John');
            collector.recordUnknownEntity('Jane');
            collector.recordResolvedEntity('John', 'John Smith');
            // Jane not resolved
      
            const report = reporter.generate(collector, '/audio/test.m4a', '/notes/test.md');
      
            expect(report.quality.nameAccuracy).toBe(0.5);
        });
    });
  
    describe('recommendations', () => {
        it('should recommend fixing failed tools', () => {
            const reporter = Reporter.create(config);
            collector.recordToolCall('broken_tool', 50, false);
            collector.recordToolCall('broken_tool', 50, false);
      
            const report = reporter.generate(collector, '/audio/test.m4a', '/notes/test.md');
      
            const toolRec = report.recommendations.find(r => r.type === 'tool-issue');
            expect(toolRec).toBeDefined();
            expect(toolRec?.severity).toBe('high');
        });
    
        it('should recommend adding context for unresolved entities', () => {
            const reporter = Reporter.create(config);
            collector.recordUnknownEntity('Unknown Person');
      
            const report = reporter.generate(collector, '/audio/test.m4a', '/notes/test.md');
      
            const contextRec = report.recommendations.find(r => r.type === 'context-gap');
            expect(contextRec).toBeDefined();
            expect(contextRec?.severity).toBe('medium');
        });
    });
  
    describe('formatMarkdown', () => {
        it('should format report as markdown', () => {
            const reporter = Reporter.create(config);
            collector.recordWhisper(1000);
            collector.recordToolCall('lookup_person', 50, true);
      
            const report = reporter.generate(collector, '/audio/test.m4a', '/notes/test.md');
            const markdown = reporter.formatMarkdown(report);
      
            expect(markdown).toContain('# Protokoll - Self-Reflection Report');
            expect(markdown).toContain('## Summary');
            expect(markdown).toContain('## Quality Assessment');
            expect(markdown).toContain('## Tool Effectiveness');
            expect(markdown).toContain('lookup_person');
        });
    
        it('should include recommendations sections', () => {
            const reporter = Reporter.create(config);
            collector.recordToolCall('broken', 50, false);
            collector.recordUnknownEntity('test');
      
            const report = reporter.generate(collector, '/audio/test.m4a', '/notes/test.md');
            const markdown = reporter.formatMarkdown(report);
      
            expect(markdown).toContain('## Recommendations');
            expect(markdown).toContain('🔴 High Priority');
            expect(markdown).toContain('🟡 Medium Priority');
        });
    });
  
    describe('formatJson', () => {
        it('should format report as JSON', () => {
            const reporter = Reporter.create({ ...config, format: 'json' });
            collector.recordWhisper(1000);
      
            const report = reporter.generate(collector, '/audio/test.m4a', '/notes/test.md');
            const json = reporter.formatJson(report);
      
            const parsed = JSON.parse(json);
            expect(parsed.id).toBe(report.id);
            expect(parsed.audioFile).toBe('/audio/test.m4a');
        });
    });
  
    describe('save', () => {
        it('should save markdown report', async () => {
            const reporter = Reporter.create(config);
            collector.recordWhisper(1000);
      
            const report = reporter.generate(collector, '/audio/test.m4a', '/notes/test.md');
            const savePath = path.join(tempDir, 'reflection.md');
      
            await reporter.save(report, savePath);
      
            const content = await fs.readFile(savePath, 'utf-8');
            expect(content).toContain('# Protokoll - Self-Reflection Report');
        });
    
        it('should save JSON report', async () => {
            const reporter = Reporter.create({ ...config, format: 'json' });
            collector.recordWhisper(1000);
      
            const report = reporter.generate(collector, '/audio/test.m4a', '/notes/test.md');
            const savePath = path.join(tempDir, 'reflection.json');
      
            await reporter.save(report, savePath);
      
            const content = await fs.readFile(savePath, 'utf-8');
            const parsed = JSON.parse(content);
            expect(parsed.audioFile).toBe('/audio/test.m4a');
        });
    });
});

