/**
 * Pipeline Types
 *
 * Types for the integrated transcription pipeline that combines
 * all the new intelligent transcription modules.
 */

import { ReflectionReport } from '../reflection/types';
import { InteractiveSession } from '../interactive/types';
import { OutputPaths } from '../output/types';

export interface PipelineConfig {
    // Model settings
    model: string;
    transcriptionModel: string;
  
    // Feature flags
    interactive: boolean;
    selfReflection: boolean;
    debug: boolean;
    dryRun?: boolean;
  
    // Paths
    contextDirectory?: string;
    intermediateDir: string;
    keepIntermediates: boolean;
    processedDirectory?: string;
}

export interface PipelineInput {
    audioFile: string;
    creation: Date;
    hash: string;
}

export interface PipelineResult {
    // Core output
    outputPath: string;
    enhancedText: string;
  
    // Raw data
    rawTranscript: string;
  
    // Routing info
    routedProject: string | null;
    routingConfidence: number;
  
    // Processing metrics
    processingTime: number;
    toolsUsed: string[];
    correctionsApplied: number;
  
    // File management
    processedAudioPath?: string;
  
    // Optional outputs
    reflection?: ReflectionReport;
    session?: InteractiveSession;
    intermediatePaths?: OutputPaths;
}

export interface PipelineState {
    input: PipelineInput;
    rawTranscript?: string;
    enhancedText?: string;
    routedDestination?: string;
    startTime: Date;
}

