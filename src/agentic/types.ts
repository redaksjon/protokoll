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
    resolvedEntities?: Map<string, string>;  // Entities resolved during this session
}

export interface ToolResult {
    success: boolean;
     
    data?: any;
    error?: string;
    needsUserInput?: boolean;
    userPrompt?: string;
}

export interface ReferencedEntity {
    id: string;
    name: string;
    type: 'person' | 'project' | 'term' | 'company';
}

export interface TranscriptionState {
    originalText: string;
    correctedText: string;
    unknownEntities: string[];
    resolvedEntities: Map<string, string>;  // name mapping (old -> new)
     
    routeDecision?: any;
    confidence: number;
    
    // Track all entities referenced during processing
    referencedEntities: {
        people: Set<string>;      // IDs of people mentioned
        projects: Set<string>;    // IDs of projects mentioned
        terms: Set<string>;       // IDs of terms mentioned
        companies: Set<string>;   // IDs of companies mentioned
    };
}

