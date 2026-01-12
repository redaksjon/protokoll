/**
 * Reasoning Client
 * 
 * Wrapper for reasoning model calls with tool/function calling support.
 * Uses OpenAI's native function calling for agentic workflows.
 */

import OpenAI from 'openai';
import { ReasoningConfig, ReasoningRequest, ReasoningResponse, ToolCall } from './types';
import * as Logging from '../logging';

export interface ClientInstance {
    complete(request: ReasoningRequest): Promise<ReasoningResponse>;
    isReasoningModel(model: string): boolean;
    getModelFamily(model: string): 'openai' | 'anthropic' | 'gemini' | 'unknown';
}

export const create = (config: ReasoningConfig): ClientInstance => {
    const logger = Logging.getLogger();
    
    // Lazy-initialize OpenAI client (only when actually needed)
    let client: OpenAI | null = null;
    const getClient = (): OpenAI => {
        if (!client) {
            client = new OpenAI({ apiKey: config.apiKey });
        }
        return client;
    };
  
    const getModelFamily = (model: string): 'openai' | 'anthropic' | 'gemini' | 'unknown' => {
        if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
        if (model.startsWith('claude')) return 'anthropic';
        if (model.startsWith('gemini')) return 'gemini';
        return 'unknown';
    };
  
    const isReasoningModel = (model: string): boolean => {
        // Models known for strong reasoning
        const reasoningModels = [
            'gpt-4o', 'gpt-4-turbo', 'gpt-5', 'gpt-5-mini', 'gpt-5.1', 'gpt-5.2',
            'o1', 'o1-mini', 'o1-preview', 'o3', 'o3-mini',
            'claude-3-5-sonnet', 'claude-3-opus', 'claude-4',
        ];
        return reasoningModels.some(rm => model.includes(rm));
    };
    
    const supportsReasoningLevel = (model: string): boolean => {
        // Models that support reasoning_effort parameter
        const models = ['gpt-5.1', 'gpt-5.2', 'o1', 'o1-mini', 'o3', 'o3-mini'];
        return models.some(m => model.includes(m));
    };
  
    const complete = async (request: ReasoningRequest): Promise<ReasoningResponse> => {
        const startTime = Date.now();
        logger.debug('Reasoning request starting', { model: config.model });
        logger.info('Sending request to reasoning model: %s', config.model);
    
        try {
            // Build messages for OpenAI
            const messages: Array<OpenAI.Chat.ChatCompletionMessageParam> = [];
      
            if (request.systemPrompt) {
                messages.push({ role: 'system', content: request.systemPrompt });
            }
      
            // Add the main prompt
            messages.push({ role: 'user', content: request.prompt });
      
            // Build tools if provided
            const tools: OpenAI.Chat.ChatCompletionTool[] | undefined = request.tools?.map(tool => ({
                type: 'function' as const,
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                },
            }));
      
            // Build request options
            const requestOptions: Record<string, unknown> = {
                model: config.model,
                messages,
                tools: tools && tools.length > 0 ? tools : undefined,
                tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
            };
            
            // Add reasoning_effort for models that support it (default to 'high')
            if (supportsReasoningLevel(config.model)) {
                const reasoningLevel = config.reasoningLevel || 'high';
                requestOptions.reasoning_effort = reasoningLevel;
                logger.info('Using reasoning_effort: %s for model %s', reasoningLevel, config.model);
            }
            
            const response = await getClient().chat.completions.create(
                requestOptions as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming
            );
      
            const duration = Date.now() - startTime;
            logger.info('Reasoning model responded in %dms', duration);
      
            const choice = response.choices[0];
            const message = choice.message;
      
            // Extract tool calls if any
            const toolCalls: ToolCall[] | undefined = message.tool_calls?.map(tc => {
                // Handle both standard and custom tool call formats
                const fn = 'function' in tc ? tc.function : null;
                if (!fn) {
                    return { id: tc.id, name: 'unknown', arguments: {} };
                }
                return {
                    id: tc.id,
                    name: fn.name,
                    arguments: JSON.parse(fn.arguments),
                };
            });
      
            if (toolCalls && toolCalls.length > 0) {
                logger.info('Model requested %d tool calls: %s', toolCalls.length, toolCalls.map(t => t.name).join(', '));
            }
      
            return {
                content: message.content || '',
                model: config.model,
                duration,
                toolCalls,
                finishReason: choice.finish_reason,
            };
        } catch (error) {
            logger.error('Reasoning request failed', { error });
            throw error;
        }
    };
  
    return {
        complete,
        isReasoningModel,
        getModelFamily,
    };
};
