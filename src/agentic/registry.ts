/**
 * Tool Registry
 * 
 * Manages available tools for agentic transcription.
 */

import { TranscriptionTool, ToolContext, ToolResult } from './types';
import * as LookupPerson from './tools/lookup-person';
import * as LookupProject from './tools/lookup-project';
import * as VerifySpelling from './tools/verify-spelling';
import * as RouteNote from './tools/route-note';
import * as StoreContext from './tools/store-context';

export interface RegistryInstance {
    getTools(): TranscriptionTool[];
     
    getToolDefinitions(): any[];  // For LLM API format
     
    executeTool(name: string, args: any): Promise<ToolResult>;
}

export const create = (ctx: ToolContext): RegistryInstance => {
    const tools: TranscriptionTool[] = [
        LookupPerson.create(ctx),
        LookupProject.create(ctx),
        VerifySpelling.create(ctx),
        RouteNote.create(ctx),
        StoreContext.create(ctx),
    ];
  
    const toolMap = new Map(tools.map(t => [t.name, t]));
  
    return {
        getTools: () => tools,
    
        // Return flat tool definitions - reasoning client handles OpenAI formatting
        getToolDefinitions: () => tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        })),
    
         
        executeTool: async (name: string, args: any): Promise<ToolResult> => {
            const tool = toolMap.get(name);
            if (!tool) {
                return {
                    success: false,
                    error: `Unknown tool: ${name}`,
                };
            }
            return tool.execute(args);
        },
    };
};

