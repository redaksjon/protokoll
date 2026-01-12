/**
 * Output Management Types
 *
 * Types for managing intermediate and final output files.
 */

export interface OutputConfig {
    intermediateDir: string;      // Default: ./output/protokoll
    keepIntermediates: boolean;   // Default: true in debug mode
    timestampFormat: string;      // Default: YYMMDD-HHmm
}

export interface IntermediateFiles {
    transcript: string;           // Raw Whisper output
    context: string;              // Context snapshot
    request: string;              // LLM request
    response: string;             // LLM response
    reflection?: string;          // Self-reflection report
    session?: string;             // Interactive session log
}

export interface OutputPaths {
    final: string;                // Routed destination
    intermediate: IntermediateFiles;
}

