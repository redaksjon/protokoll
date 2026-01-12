/**
 * Agentic Executor
 * 
 * Executes the agentic transcription loop with tool calls.
 * Maintains conversation history for multi-turn tool usage.
 */

import { ToolContext, TranscriptionState } from './types';
import * as Registry from './registry';
import * as Reasoning from '../reasoning';
import * as Logging from '../logging';

export interface ContextChangeRecord {
    entityType: 'person' | 'project' | 'company' | 'term';
    entityId: string;
    entityName: string;
    action: 'created' | 'updated';
    details?: Record<string, unknown>;
}

export interface ExecutorInstance {
    process(transcriptText: string): Promise<{
        enhancedText: string;
        state: TranscriptionState;
        toolsUsed: string[];
        iterations: number;
        totalTokens?: number;
        contextChanges?: ContextChangeRecord[];
    }>;
}

// Message types for conversation history
interface ConversationMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

export const create = (
    reasoning: Reasoning.ReasoningInstance,
    ctx: ToolContext
): ExecutorInstance => {
    const logger = Logging.getLogger();
    const registry = Registry.create(ctx);
  
    const process = async (transcriptText: string) => {
        const state: TranscriptionState = {
            originalText: transcriptText,
            correctedText: transcriptText,
            unknownEntities: [],
            resolvedEntities: new Map(),
            confidence: 0,
        };
    
        const toolsUsed: string[] = [];
        const contextChanges: ContextChangeRecord[] = [];
        let iterations = 0;
        let totalTokens = 0;
        const maxIterations = 15;
    
        // Conversation history for multi-turn
        const conversationHistory: ConversationMessage[] = [];
    
        // Build the system prompt
        const systemPrompt = `You are an intelligent transcription assistant. Your job is to:
1. Analyze the transcript for names, projects, and companies
2. Use the available tools to verify spellings and gather context
3. Correct any misheard names or terms
4. Determine the appropriate destination for this note
5. Produce a clean, accurate Markdown transcript

CRITICAL RULES:
- This is NOT a summary. Preserve ALL content from the original transcript.
- Only fix obvious transcription errors like misheard names.
- When you have finished processing, output the COMPLETE corrected transcript as Markdown.
- Do NOT say you don't have the transcript - it's in the conversation history.

Available tools:
- lookup_person: Find information about people (use for any name that might be misspelled)
- lookup_project: Find project routing information  
- verify_spelling: Ask user about unknown terms (if interactive mode)
- route_note: Determine where to file this note
- store_context: Remember new information for future use`;

        // Add system message to history
        conversationHistory.push({ role: 'system', content: systemPrompt });
        
        // Add the initial user message with transcript
        const initialPrompt = `Here is the raw transcript to process:

--- BEGIN TRANSCRIPT ---
${transcriptText}
--- END TRANSCRIPT ---

Please:
1. Identify any names, companies, or technical terms that might be misspelled
2. Use the lookup_person tool to verify spelling of any names you find
3. Use route_note to determine the destination
4. Then output the COMPLETE corrected transcript as clean Markdown

Remember: preserve ALL content, only fix transcription errors.`;

        conversationHistory.push({ role: 'user', content: initialPrompt });

        try {
            // Initial reasoning call
            logger.debug('Starting agentic transcription - analyzing for names and routing...');
            let response = await reasoning.complete({
                systemPrompt,
                prompt: initialPrompt,
                tools: registry.getToolDefinitions(),
                maxIterations,
            });
            
            // Track token usage
            if (response.usage) {
                totalTokens += response.usage.totalTokens;
            }
            
            // Add assistant response to history
            conversationHistory.push({ 
                role: 'assistant', 
                content: response.content,
                tool_calls: response.toolCalls?.map(tc => ({
                    id: tc.id,
                    name: tc.name,
                    arguments: tc.arguments,
                })),
            });
    
            // Iterative tool use loop
            while (response.toolCalls && response.toolCalls.length > 0 && iterations < maxIterations) {
                iterations++;
                logger.debug('Iteration %d: Processing %d tool calls...', iterations, response.toolCalls.length);
      
                // Collect tool results
                const toolResults: Array<{ id: string; name: string; result: string }> = [];
      
                // Execute each tool call
                for (const toolCall of response.toolCalls) {
                    logger.debug('Executing tool: %s', toolCall.name);
                    toolsUsed.push(toolCall.name);
        
                    try {
                        const result = await registry.executeTool(toolCall.name, toolCall.arguments);
                        
                        // Format result for the model
                        const resultStr = JSON.stringify(result.data || { success: result.success, message: result.error || 'OK' });
                        toolResults.push({ id: toolCall.id, name: toolCall.name, result: resultStr });
                        
                        logger.debug('Tool %s result: %s', toolCall.name, result.success ? 'success' : 'failed');
          
                        // Handle results that need user input
                        if (result.needsUserInput && ctx.interactiveMode && ctx.interactiveInstance) {
                            logger.info('Interactive: %s requires clarification', toolCall.name);
                            
                            const termName = String(toolCall.arguments.name || toolCall.arguments.term || '');
                            
                            const clarification = await ctx.interactiveInstance.handleClarification({
                                type: result.data?.clarificationType || 'general',
                                term: result.data?.term || termName,
                                context: result.userPrompt || '',
                                suggestion: result.data?.suggestion,
                                options: result.data?.options,
                            });
                            
                            if (clarification.response) {
                                state.resolvedEntities.set(termName, clarification.response);
                                logger.info('Clarified: %s -> %s', termName, clarification.response);
                                
                                // Handle new project creation
                                if (result.data?.clarificationType === 'new_project' && clarification.response.trim()) {
                                    const projectPath = clarification.response.trim();
                                    // Only create if user provided a path (not just pressed Enter)
                                    if (projectPath && projectPath !== termName) {
                                        const projectId = termName.toLowerCase().replace(/\s+/g, '-');
                                        const newProject = {
                                            id: projectId,
                                            name: termName,
                                            type: 'project' as const,
                                            description: `Auto-created from transcript mentioning "${termName}"`,
                                            classification: {
                                                context_type: 'work' as const,
                                                explicit_phrases: [termName.toLowerCase()],
                                            },
                                            routing: {
                                                destination: projectPath,
                                                structure: 'month' as const,
                                                filename_options: ['date', 'time', 'subject'] as Array<'date' | 'time' | 'subject'>,
                                            },
                                            active: true,
                                        };
                                        
                                        try {
                                            await ctx.contextInstance.saveEntity(newProject);
                                            logger.info('Created new project: %s -> %s', termName, projectPath);
                                            
                                            // Record the context change
                                            contextChanges.push({
                                                entityType: 'project',
                                                entityId: projectId,
                                                entityName: termName,
                                                action: 'created',
                                                details: {
                                                    destination: projectPath,
                                                    routing: newProject.routing,
                                                },
                                            });
                                            
                                            // Update routing to use new project
                                            state.routeDecision = {
                                                projectId,
                                                destination: { path: projectPath, structure: 'month' },
                                                confidence: 1.0,
                                                signals: [{ type: 'explicit_phrase', value: termName, weight: 1.0 }],
                                                reasoning: `User created new project "${termName}" routing to ${projectPath}`,
                                            };
                                        } catch (error) {
                                            logger.warn('Failed to save new project: %s', error);
                                        }
                                    }
                                }
                            }
                        }
          
                        // Update state based on tool results
                        if (result.data?.person) {
                            state.resolvedEntities.set(result.data.person.name, result.data.suggestion);
                        }
                        if (result.data?.destination) {
                            state.routeDecision = result.data;
                        }
          
                    } catch (error) {
                        logger.error('Tool execution failed', { tool: toolCall.name, error });
                        toolResults.push({ 
                            id: toolCall.id, 
                            name: toolCall.name, 
                            result: JSON.stringify({ error: String(error) }) 
                        });
                    }
                }
                
                // Add tool results to history
                for (const tr of toolResults) {
                    conversationHistory.push({
                        role: 'tool',
                        tool_call_id: tr.id,
                        content: tr.result,
                    });
                }
      
                // Build continuation prompt with full context
                const continuationPrompt = `Tool results received. Here's a reminder of your task:

ORIGINAL TRANSCRIPT (process this):
--- BEGIN TRANSCRIPT ---
${transcriptText}
--- END TRANSCRIPT ---

Corrections made so far: ${state.resolvedEntities.size > 0 ? Array.from(state.resolvedEntities.entries()).map(([k, v]) => `${k} -> ${v}`).join(', ') : 'none yet'}

Continue analyzing. If you need more information, use the tools. 
When you're done with tool calls, output the COMPLETE corrected transcript as Markdown.
Do NOT summarize - include ALL original content with corrections applied.`;

                conversationHistory.push({ role: 'user', content: continuationPrompt });
      
                // Continue conversation with full context
                response = await reasoning.complete({
                    systemPrompt,
                    prompt: continuationPrompt,
                    tools: registry.getToolDefinitions(),
                });
                
                // Track token usage
                if (response.usage) {
                    totalTokens += response.usage.totalTokens;
                }
                
                conversationHistory.push({ 
                    role: 'assistant', 
                    content: response.content,
                    tool_calls: response.toolCalls?.map(tc => ({
                        id: tc.id,
                        name: tc.name,
                        arguments: tc.arguments,
                    })),
                });
            }
    
            // Extract final corrected text
            if (response.content && response.content.length > 50) {
                state.correctedText = response.content;
                state.confidence = 0.9;
                logger.debug('Final transcript generated: %d characters', response.content.length);
            } else {
                // Model didn't produce content - ask for it explicitly
                logger.debug('Model did not produce transcript, requesting explicitly...');
                
                const finalRequest = `Please output the COMPLETE corrected transcript now.

ORIGINAL:
${transcriptText}

CORRECTIONS TO APPLY:
${state.resolvedEntities.size > 0 ? Array.from(state.resolvedEntities.entries()).map(([k, v]) => `- "${k}" should be "${v}"`).join('\n') : 'None identified'}

Output the full transcript as clean Markdown. Do NOT summarize.`;

                const finalResponse = await reasoning.complete({
                    systemPrompt,
                    prompt: finalRequest,
                });
                
                // Track token usage
                if (finalResponse.usage) {
                    totalTokens += finalResponse.usage.totalTokens;
                }
                
                state.correctedText = finalResponse.content || transcriptText;
                state.confidence = 0.8;
            }
    
        } catch (error) {
            logger.error('Agentic processing failed', { error });
            // Fall back to original text
            state.correctedText = transcriptText;
            state.confidence = 0.5;
        }
    
        return {
            enhancedText: state.correctedText,
            state,
            toolsUsed: [...new Set(toolsUsed)],
            iterations,
            totalTokens: totalTokens > 0 ? totalTokens : undefined,
            contextChanges: contextChanges.length > 0 ? contextChanges : undefined,
        };
    };
  
    return { process };
};

