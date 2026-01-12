import { OpenAI } from 'openai';
import { ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import * as Storage from '@/util/storage';
import { getLogger } from '@/logging';
import { DEFAULT_MODEL, DEFAULT_TRANSCRIPTION_MODEL } from '@/constants';

export interface Transcription {
    text: string;
}

export class OpenAIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OpenAIError';
    }
}


export async function createCompletion(messages: ChatCompletionMessageParam[], options: { responseFormat?: any, model?: string, reasoningLevel?: 'low' | 'medium' | 'high', debug?: boolean, debugFile?: string } = {}): Promise<string | any> {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.debug });
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new OpenAIError('OPENAI_API_KEY environment variable is not set');
        }

        const openai = new OpenAI({
            apiKey: apiKey,
        });

        const model = options.model || DEFAULT_MODEL;
        logger.info('Sending request to reasoning model (%s)... this may take a minute', model);
        logger.debug('Sending prompt to OpenAI: %j', messages);

        const startTime = Date.now();
        
        // Check if model supports reasoning_effort
        const supportsReasoning = model.includes('gpt-5.1') || model.includes('gpt-5.2') || 
                                  model.includes('o1') || model.includes('o3');
        
        const requestParams: Record<string, unknown> = {
            model,
            messages,
            max_completion_tokens: 10000,
            response_format: options.responseFormat,
        };
        
        if (supportsReasoning) {
            const reasoningLevel = options.reasoningLevel || 'high';
            requestParams.reasoning_effort = reasoningLevel;
            logger.info('Using reasoning_effort: %s', reasoningLevel);
        }
        
        const completion = await openai.chat.completions.create(
            requestParams as unknown as ChatCompletionCreateParamsNonStreaming
        );
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        logger.info('Reasoning model responded in %ss', duration);

        if (options.debug && options.debugFile) {
            await storage.writeFile(options.debugFile, JSON.stringify(completion, null, 2), 'utf8');
            logger.debug('Wrote debug file to %s', options.debugFile);
        }

        const response = completion.choices[0]?.message?.content?.trim();
        if (!response) {
            throw new OpenAIError('No response received from OpenAI');
        }

        logger.debug('Received response from OpenAI: %s', response);
        if (options.responseFormat) {
            return JSON.parse(response);
        } else {
            return response;
        }

    } catch (error: any) {
        logger.error('Error calling OpenAI API: %s %s', error.message, error.stack);
        throw new OpenAIError(`Failed to create completion: ${error.message}`);
    }
}

export async function transcribeAudio(filePath: string, options: { model?: string, debug?: boolean, debugFile?: string } = {}): Promise<Transcription> {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.debug });
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new OpenAIError('OPENAI_API_KEY environment variable is not set');
        }

        const openai = new OpenAI({
            apiKey: apiKey,
        });

        const model = options.model || DEFAULT_TRANSCRIPTION_MODEL;
        const fileName = filePath.split('/').pop() || filePath;
        logger.info('Transcribing audio with %s: %s ... this may take several minutes for long recordings', model, fileName);
        logger.debug('Full path: %s', filePath);

        const startTime = Date.now();
        const audioStream = await storage.readStream(filePath);
        const transcription = await openai.audio.transcriptions.create({
            model,
            file: audioStream,
            response_format: "json",
        });
        
        if (!transcription) {
            throw new OpenAIError('No transcription received from OpenAI');
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info('Transcription completed in %ss (%d characters)', duration, transcription.text?.length || 0);

        if (options.debug && options.debugFile) {
            await storage.writeFile(options.debugFile, JSON.stringify(transcription, null, 2), 'utf8');
            logger.debug('Wrote debug file to %s', options.debugFile);
        }

        logger.debug('Received transcription from OpenAI: %s', transcription);
        return transcription;

    } catch (error: any) {
        logger.error('Error transcribing audio file: %s %s', error.message, error.stack);
        throw new OpenAIError(`Failed to transcribe audio: ${error.message}`);
    }
}
