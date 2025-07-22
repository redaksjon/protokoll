import * as Logging from '@/logging';
import * as TranscribePhase from '@/phases/transcribe';
import * as LocatePhase from '@/phases/locate';
import * as Dreadcabinet from '@theunwalked/dreadcabinet';
import { Config } from '@/matnava';

export interface Transcription {
    text: string;
    audioFileBasename: string;
}

export interface Instance {
    process(file: string): Promise<void>;
}

export const create = (config: Config, operator: Dreadcabinet.Operator): Instance => {
    const logger = Logging.getLogger();

    const transcribePhase: TranscribePhase.Instance = TranscribePhase.create(config, operator);
    const locatePhase: LocatePhase.Instance = LocatePhase.create(config, operator);

    const process = async (audioFile: string) => {
        logger.verbose('Processing file %s', audioFile);

        // Locate the contents in time and on the filesystem
        logger.debug('Locating file %s', audioFile);
        const { creationTime, outputPath, contextPath, interimPath, transcriptionFilename, hash } = await locatePhase.locate(audioFile);
        logger.debug('Locate complete: %s', JSON.stringify({ creationTime, outputPath, contextPath, interimPath, transcriptionFilename, hash }));

        // Transcribe the audio
        logger.debug('Transcribing file %s', audioFile);
        await transcribePhase.transcribe(creationTime, outputPath, contextPath, interimPath, transcriptionFilename, hash, audioFile);

        logger.info('Transcription complete for file %s', audioFile);
        logger.info('Transcription saved to: %s', transcriptionFilename);
        return;
    }

    return {
        process,
    }
}


