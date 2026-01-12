/**
 * Tests for Metrics Collector
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Collector from '../../src/reflection/collector';

// Mock logging
vi.mock('../../src/logging', () => ({
    getLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

describe('Metrics Collector', () => {
    let collector: Collector.CollectorInstance;
  
    beforeEach(() => {
        collector = Collector.create();
    });
  
    describe('start', () => {
        it('should initialize start time', () => {
            collector.start();
            const metrics = collector.getMetrics();
            expect(metrics.startTime).toBeInstanceOf(Date);
        });
    });
  
    describe('recordWhisper', () => {
        it('should record whisper duration', () => {
            collector.start();
            collector.recordWhisper(1500);
            const metrics = collector.getMetrics();
            expect(metrics.whisperDuration).toBe(1500);
        });
    });
  
    describe('recordToolCall', () => {
        it('should track tool calls', () => {
            collector.start();
            collector.recordToolCall('lookup_person', 50, true);
            collector.recordToolCall('lookup_person', 45, true);
            collector.recordToolCall('route_note', 30, true);
      
            const effectiveness = collector.getToolEffectiveness();
            expect(effectiveness).toHaveLength(2);
      
            const personTool = effectiveness.find(t => t.name === 'lookup_person');
            expect(personTool?.callCount).toBe(2);
            expect(personTool?.successCount).toBe(2);
            expect(personTool?.avgDuration).toBe(47.5);
        });
    
        it('should track failures', () => {
            collector.start();
            collector.recordToolCall('lookup_person', 50, true);
            collector.recordToolCall('lookup_person', 45, false);
      
            const effectiveness = collector.getToolEffectiveness();
            const personTool = effectiveness.find(t => t.name === 'lookup_person');
      
            expect(personTool?.successCount).toBe(1);
            expect(personTool?.failureCount).toBe(1);
            expect(personTool?.successRate).toBe(0.5);
        });
    
        it('should increment iterations', () => {
            collector.start();
            collector.recordToolCall('tool1', 10, true);
            collector.recordToolCall('tool2', 10, true);
            collector.recordToolCall('tool1', 10, true);
      
            const metrics = collector.getMetrics();
            expect(metrics.iterations).toBe(3);
        });
    });
  
    describe('recordCorrection', () => {
        it('should track corrections', () => {
            collector.start();
            collector.recordCorrection('original text', 'corrected text');
      
            const metrics = collector.getMetrics();
            expect(metrics.originalLength).toBe(13);
            expect(metrics.correctedLength).toBe(14);
            expect(metrics.correctionsApplied).toBe(1);
        });
    
        it('should preserve original length on subsequent corrections', () => {
            collector.start();
            collector.recordCorrection('original', 'first correction');
            collector.recordCorrection('first correction', 'second correction');
      
            const metrics = collector.getMetrics();
            expect(metrics.originalLength).toBe(8); // 'original'
            expect(metrics.correctedLength).toBe(17); // 'second correction'
            expect(metrics.correctionsApplied).toBe(2);
        });
    });
  
    describe('recordUnknownEntity', () => {
        it('should track unknown entities', () => {
            collector.start();
            collector.recordUnknownEntity('John');
            collector.recordUnknownEntity('Acme Corp');
      
            const metrics = collector.getMetrics();
            expect(metrics.unknownEntitiesFound).toBe(2);
        });
    });
  
    describe('recordResolvedEntity', () => {
        it('should track resolved entities', () => {
            collector.start();
            collector.recordResolvedEntity('Jon', 'John');
            collector.recordResolvedEntity('Acme', 'Acme Corporation');
      
            const metrics = collector.getMetrics();
            expect(metrics.entitiesResolved).toBe(2);
        });
    });
  
    describe('recordModelResponse', () => {
        it('should track model and tokens', () => {
            collector.start();
            collector.recordModelResponse('gpt-4o', 500);
            collector.recordModelResponse('gpt-4o', 300);
      
            const metrics = collector.getMetrics();
            expect(metrics.model).toBe('gpt-4o');
            expect(metrics.tokensUsed).toBe(800);
        });
    });
  
    describe('getMetrics', () => {
        it('should calculate total duration', () => {
            collector.start();
            collector.recordWhisper(1000);
      
            // Wait a tiny bit to ensure some time passes
            const metrics = collector.getMetrics();
            expect(metrics.totalDuration).toBeGreaterThanOrEqual(0);
            expect(metrics.reasoningDuration).toBe(metrics.totalDuration - 1000);
        });
    
        it('should return all metrics', () => {
            collector.start();
            collector.recordWhisper(1000);
            collector.recordToolCall('test', 50, true);
            collector.recordCorrection('a', 'b');
            collector.recordUnknownEntity('x');
            collector.recordResolvedEntity('x', 'y');
            collector.recordModelResponse('gpt-4o', 100);
      
            const metrics = collector.getMetrics();
      
            expect(metrics.startTime).toBeInstanceOf(Date);
            expect(metrics.endTime).toBeInstanceOf(Date);
            expect(metrics.whisperDuration).toBe(1000);
            expect(metrics.iterations).toBe(1);
            expect(metrics.toolCallsExecuted).toBe(1);
            expect(metrics.toolsUsed).toEqual(['test']);
            expect(metrics.originalLength).toBe(1);
            expect(metrics.correctedLength).toBe(1);
            expect(metrics.correctionsApplied).toBe(1);
            expect(metrics.unknownEntitiesFound).toBe(1);
            expect(metrics.entitiesResolved).toBe(1);
            expect(metrics.model).toBe('gpt-4o');
            expect(metrics.tokensUsed).toBe(100);
        });
    });
  
    describe('getToolEffectiveness', () => {
        it('should return empty array when no tools used', () => {
            collector.start();
            const effectiveness = collector.getToolEffectiveness();
            expect(effectiveness).toEqual([]);
        });
    
        it('should calculate effectiveness correctly', () => {
            collector.start();
            collector.recordToolCall('tool1', 100, true);
            collector.recordToolCall('tool1', 200, true);
            collector.recordToolCall('tool1', 150, false);
      
            const effectiveness = collector.getToolEffectiveness();
            const tool1 = effectiveness[0];
      
            expect(tool1.name).toBe('tool1');
            expect(tool1.callCount).toBe(3);
            expect(tool1.successCount).toBe(2);
            expect(tool1.failureCount).toBe(1);
            expect(tool1.avgDuration).toBe(150);
            expect(tool1.successRate).toBeCloseTo(0.667, 2);
        });
    });
});

