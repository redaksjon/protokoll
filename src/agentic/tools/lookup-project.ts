/**
 * Lookup Project Tool
 * 
 * Looks up project information for routing and context.
 */

import { TranscriptionTool, ToolContext, ToolResult } from '../types';

export const create = (ctx: ToolContext): TranscriptionTool => ({
    name: 'lookup_project',
    description: 'Look up project information for routing and context. Use when you need to determine where this note should be filed.',
    parameters: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'The project name or identifier',
            },
            triggerPhrase: {
                type: 'string',
                description: 'A phrase from the transcript that might indicate the project',
            },
        },
        required: ['name'],
    },
    execute: async (args: { name: string; triggerPhrase?: string }): Promise<ToolResult> => {
        const context = ctx.contextInstance;
    
        // Look up project by name
        const projects = context.search(args.name);
        const projectMatches = projects.filter(e => e.type === 'project');
    
        if (projectMatches.length > 0) {
            const project = projectMatches[0];
            return {
                success: true,
                data: {
                    found: true,
                    project,
                },
            };
        }
    
        // Try getting all projects and matching trigger phrases
        if (args.triggerPhrase) {
            const allProjects = context.getAllProjects();
            for (const project of allProjects) {
                const phrases = project.classification?.explicit_phrases ?? [];
                if (phrases.some(p => args.triggerPhrase?.toLowerCase().includes(p.toLowerCase()))) {
                    return {
                        success: true,
                        data: {
                            found: true,
                            project,
                            matchedTrigger: args.triggerPhrase,
                        },
                    };
                }
            }
        }
    
        return {
            success: true,
            data: {
                found: false,
                message: `No project found for "${args.name}". Will use default routing.`,
            },
        };
    },
});

