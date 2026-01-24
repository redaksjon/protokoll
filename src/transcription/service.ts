/**
 * Transcription Service
 * 
 * Handles audio transcription using OpenAI's transcription models.
 * Keeps transcription simple - the complexity is in the reasoning pass.
 */

import OpenAI from 'openai';
import * as Storage from '../util/storage';
import * as Media from '../util/media';
import {
    TranscriptionRequest,
    TranscriptionResult,
    TranscriptionModel,
    MODEL_CAPABILITIES
} from './types';
import * as Logging from '../logging';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ServiceInstance {
    transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
    supportsStreaming(model: TranscriptionModel): boolean;
    supportsDiarization(model: TranscriptionModel): boolean;
}

// Alias for backwards compatibility
export type TranscriptionService = ServiceInstance;

export const create = (openai: OpenAI): ServiceInstance => {
    const logger = Logging.getLogger();
    const storage = Storage.create({ log: logger.debug });
    const media = Media.create(logger);

    const supportsStreaming = (model: TranscriptionModel): boolean => {
        return MODEL_CAPABILITIES[model]?.supportsStreaming ?? false;
    };

    const supportsDiarization = (model: TranscriptionModel): boolean => {
        return MODEL_CAPABILITIES[model]?.supportsDiarization ?? false;
    };

    const transcribe = async (request: TranscriptionRequest): Promise<TranscriptionResult> => {
        const { audioFile, config } = request;

        logger.debug('Starting transcription', { model: config.model, file: audioFile });

        // Convert audio file to a supported format if necessary
        const tempDir = path.join(os.tmpdir(), 'protokoll-conversions');
        const convertedAudioFile = await media.convertToSupportedFormat(audioFile, tempDir);
        logger.debug(`Using audio file for transcription: ${convertedAudioFile}`);

        const audioStream = await storage.readStream(convertedAudioFile);
    
        // Execute transcription
        const startTime = Date.now();
        const response = await openai.audio.transcriptions.create({
            model: config.model,
            file: audioStream,
            response_format: config.response_format ?? 'json',
            ...(config.language && { language: config.language }),
            ...(config.temperature !== undefined && { temperature: config.temperature }),
            ...(config.prompt && { prompt: config.prompt }),
        });
        const duration = Date.now() - startTime;
    
        logger.debug('Transcription complete', { duration, model: config.model });
    
        // Handle the response
        return {
            text: response.text,
            model: config.model,
            duration,
        };
    };
  
    return {
        transcribe,
        supportsStreaming,
        supportsDiarization,
    };
};
