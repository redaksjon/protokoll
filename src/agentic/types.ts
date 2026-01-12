/**
 * Agentic Transcription Types
 *
 * Types for tool-based transcription enhancement.
 */

import * as Context from '../context';
import * as Routing from '../routing';
import * as Interactive from '../interactive';

export interface TranscriptionTool {
    name: string;
    description: string;
     
    parameters: Record<string, any>;  // JSON Schema
     
    execute: (args: any) => Promise<ToolResult>;
}

export interface ToolContext {
    transcriptText: string;
    audioDate: Date;
    sourceFile: string;
    contextInstance: Context.ContextInstance;
    routingInstance: Routing.RoutingInstance;
    interactiveMode: boolean;
    interactiveInstance?: Interactive.InteractiveInstance;
}

export interface ToolResult {
    success: boolean;
     
    data?: any;
    error?: string;
    needsUserInput?: boolean;
    userPrompt?: string;
}

export interface TranscriptionState {
    originalText: string;
    correctedText: string;
    unknownEntities: string[];
    resolvedEntities: Map<string, string>;
     
    routeDecision?: any;
    confidence: number;
}

