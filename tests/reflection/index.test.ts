/**
 * Tests for Reflection Index
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Reflection from '../../src/reflection';
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

describe('Reflection System', () => {
    let tempDir: string;
  
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-reflection-test-'));
    });
  
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true });
    });
  
    it('should create a reflection instance', () => {
        const reflection = Reflection.create({
            enabled: true,
            format: 'markdown',
            includeConversation: false,
            includeOutput: true,
        });
    
        expect(reflection).toBeDefined();
        expect(reflection.collector).toBeDefined();
        expect(reflection.reporter).toBeDefined();
        expect(typeof reflection.generate).toBe('function');
        expect(typeof reflection.save).toBe('function');
    });
  
    it('should provide end-to-end workflow', async () => {
        const reflection = Reflection.create({
            enabled: true,
            format: 'markdown',
            includeConversation: false,
            includeOutput: true,
        });
    
        // Start collecting
        reflection.collector.start();
    
        // Record some metrics
        reflection.collector.recordWhisper(1500);
        reflection.collector.recordToolCall('lookup_person', 50, true);
        reflection.collector.recordCorrection('original', 'corrected');
        reflection.collector.recordModelResponse('gpt-4o', 500);
    
        // Generate report
        const report = reflection.generate(
            '/audio/test.m4a',
            '/notes/test.md',
            undefined,
            'Final output content'
        );
    
        expect(report.audioFile).toBe('/audio/test.m4a');
        expect(report.outputFile).toBe('/notes/test.md');
        expect(report.output).toBe('Final output content');
        expect(report.metrics.whisperDuration).toBe(1500);
    
        // Save report
        const savePath = path.join(tempDir, 'reflection.md');
        await reflection.save(report, savePath);
    
        const content = await fs.readFile(savePath, 'utf-8');
        expect(content).toContain('# Protokoll - Self-Reflection Report');
        expect(content).toContain('lookup_person');
    });
  
    it('should export DEFAULT_REFLECTION_CONFIG', () => {
        expect(Reflection.DEFAULT_REFLECTION_CONFIG).toBeDefined();
        expect(Reflection.DEFAULT_REFLECTION_CONFIG.enabled).toBe(false);
        expect(Reflection.DEFAULT_REFLECTION_CONFIG.format).toBe('markdown');
        expect(Reflection.DEFAULT_REFLECTION_CONFIG.includeConversation).toBe(false);
        expect(Reflection.DEFAULT_REFLECTION_CONFIG.includeOutput).toBe(true);
    });
  
    it('should re-export types', () => {
        // Verify types are accessible
        const config: Reflection.ReflectionConfig = {
            enabled: true,
            format: 'json',
            includeConversation: true,
            includeOutput: false,
        };
        expect(config.format).toBe('json');
    });
});

