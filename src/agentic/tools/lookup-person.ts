/**
 * Lookup Person Tool
 * 
 * Looks up information about a person mentioned in the transcript.
 */

import { TranscriptionTool, ToolContext, ToolResult } from '../types';

export const create = (ctx: ToolContext): TranscriptionTool => ({
    name: 'lookup_person',
    description: 'Look up information about a person mentioned in the transcript. Use when you encounter a name that might need spelling verification or additional context.',
    parameters: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'The name to look up (as heard in transcript)',
            },
            phonetic: {
                type: 'string',
                description: 'How the name sounds (for alias matching)',
            },
        },
        required: ['name'],
    },
    execute: async (args: { name: string; phonetic?: string }): Promise<ToolResult> => {
        const context = ctx.contextInstance;
    
        // Try direct name search
        const people = context.search(args.name);
        const personMatches = people.filter(e => e.type === 'person');
    
        if (personMatches.length > 0) {
            return {
                success: true,
                data: {
                    found: true,
                    person: personMatches[0],
                    suggestion: `Use "${personMatches[0].name}" for correct spelling`,
                },
            };
        }
    
        // Try phonetic match (sounds_like)
        if (args.phonetic) {
            const person = context.findBySoundsLike(args.phonetic);
            if (person) {
                return {
                    success: true,
                    data: {
                        found: true,
                        person,
                        suggestion: `"${args.phonetic}" likely refers to "${person.name}"`,
                    },
                };
            }
        }
    
        // Not found
        return {
            success: true,
            data: {
                found: false,
                needsVerification: true,
                message: `Unknown person: "${args.name}". Consider asking for clarification.`,
            },
        };
    },
});

