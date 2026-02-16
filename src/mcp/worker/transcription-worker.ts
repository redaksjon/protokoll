/**
 * Background Transcription Worker
 * 
 * Processes uploaded audio files sequentially in the background.
 * Scans for transcripts in 'uploaded' status and processes them through
 * the existing Pipeline infrastructure.
 */

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Pipeline, Transcript as TranscriptOps } from '@redaksjon/protokoll-engine';
import { PklTranscript } from '@redaksjon/protokoll-format';
import type { TranscriptMetadata } from '@redaksjon/protokoll-format';

const { findUploadedTranscripts, markTranscriptAsTranscribing, markTranscriptAsFailed } = TranscriptOps;

/**
 * Worker configuration
 */
export interface WorkerConfig {
    outputDirectory: string;      // Where PKL files are stored
    contextDirectory?: string;     // Context directory for Pipeline
    uploadDirectory: string;       // Where uploaded audio files are stored
    scanInterval?: number;         // Milliseconds between queue scans (default: 5000)
    model?: string;                // AI model for enhancement
    transcriptionModel?: string;   // Whisper model
}

/**
 * Uploaded transcript item
 */
interface UploadedTranscript {
    uuid: string;
    filePath: string;
    metadata: TranscriptMetadata;
}

/**
 * Worker statistics
 */
interface WorkerStats {
    totalProcessed: number;
    lastProcessedTime?: string;
    lastProcessedUuid?: string;
    currentTask?: string;
    startTime: number;
}

/**
 * Background transcription worker
 * 
 * Processes uploaded audio files sequentially:
 * 1. Scans for transcripts in 'uploaded' status
 * 2. Marks as 'transcribing'
 * 3. Processes through Pipeline
 * 4. Updates status to 'initial' on success or 'error' on failure
 */
export class TranscriptionWorker {
    private isRunning = false;
    private config: WorkerConfig;
    private pipeline: Awaited<ReturnType<typeof Pipeline.create>> | null = null;
    private stats: WorkerStats;
    private processingPromise: Promise<void> | null = null;

    constructor(config: WorkerConfig) {
        this.config = config;
        this.stats = {
            totalProcessed: 0,
            startTime: Date.now(),
        };
    }

    /**
     * Start the worker
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        // eslint-disable-next-line no-console
        console.log('🚀 Starting transcription worker...');
        
        // Create pipeline instance
        this.pipeline = await Pipeline.create({
            model: this.config.model || 'gpt-4o',
            transcriptionModel: this.config.transcriptionModel || 'whisper-1',
            reasoningLevel: 'medium',
            interactive: false,
            selfReflection: false,
            debug: false,
            silent: true,
            contextDirectory: this.config.contextDirectory,
            outputDirectory: this.config.outputDirectory,
            outputStructure: 'month',
            outputFilenameOptions: ['date', 'time', 'subject'],
            maxAudioSize: 100 * 1024 * 1024, // 100MB
            tempDirectory: tmpdir(),
            intermediateDir: join(this.config.outputDirectory, '.intermediate'),
            keepIntermediates: false,
        });

        this.isRunning = true;
        this.stats.startTime = Date.now();
        
        // Start processing loop
        this.processingPromise = this.processQueue();
        
        // eslint-disable-next-line no-console
        console.log('✅ Transcription worker started');
    }

    /**
     * Stop the worker
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        // eslint-disable-next-line no-console
        console.log('🛑 Stopping transcription worker...');
        
        this.isRunning = false;
        
        // Wait for current processing to finish
        if (this.processingPromise) {
            await this.processingPromise;
        }
        
        // eslint-disable-next-line no-console
        console.log('✅ Transcription worker stopped');
    }

    /**
     * Main processing loop
     */
    private async processQueue(): Promise<void> {
        while (this.isRunning) {
            try {
                const uploaded = await findUploadedTranscripts([this.config.outputDirectory]);
                
                if (uploaded.length > 0) {
                    await this.processNextTranscript(uploaded[0]);
                } else {
                    // No work, wait before next scan
                    await new Promise(resolve => setTimeout(resolve, this.config.scanInterval || 5000));
                }
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('Error in transcription worker:', error);
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }

    /**
     * Process a single transcript
     */
    private async processNextTranscript(item: UploadedTranscript): Promise<void> {
        this.stats.currentTask = `Processing ${item.uuid}`;
        
        // eslint-disable-next-line no-console
        console.log(`\n📝 Processing transcript: ${item.uuid}`);
        // eslint-disable-next-line no-console
        console.log(`   Audio file: ${item.metadata.audioFile}`);
        
        try {
            // Mark as transcribing
            await markTranscriptAsTranscribing(item.filePath);
            
            // Get audio file path
            const audioFilePath = join(this.config.uploadDirectory, item.metadata.audioFile || '');
            
            // Process through pipeline
            if (!this.pipeline) {
                throw new Error('Pipeline not initialized');
            }
            
            const result = await this.pipeline.process({
                audioFile: audioFilePath,
                creation: item.metadata.date || new Date(),
                hash: item.metadata.audioHash || '',
            });
            
            // Update transcript with results
            const transcript = PklTranscript.open(item.filePath);
            
            try {
                // Set raw transcript data
                await transcript.setRawTranscript({
                    text: result.rawTranscript,
                    model: this.config.transcriptionModel || 'whisper-1',
                    duration: result.processingTime,
                    audioFile: item.metadata.audioFile,
                    audioHash: item.metadata.audioHash,
                    transcribedAt: new Date().toISOString(),
                });
                
                // Update content
                transcript.updateContent(result.enhancedText);
                
                // Update metadata
                transcript.updateMetadata({ 
                    status: 'initial',
                    title: result.routedProject || item.metadata.title || 'Transcribed Audio',
                    project: result.routedProject || undefined,
                    confidence: result.routingConfidence,
                });
                
                await transcript.close();
                
                // Update stats
                this.stats.totalProcessed++;
                this.stats.lastProcessedTime = new Date().toISOString();
                this.stats.lastProcessedUuid = item.uuid;
                this.stats.currentTask = undefined;
                
                // eslint-disable-next-line no-console
                console.log(`✅ Completed: ${item.uuid}`);
                
            } catch (error) {
                await transcript.close();
                throw error;
            }
            
        } catch (error) {
            // Mark as error with details
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // eslint-disable-next-line no-console
            console.error(`❌ Failed to process ${item.uuid}:`, errorMessage);
            
            await markTranscriptAsFailed(item.filePath, errorMessage);
            
            this.stats.currentTask = undefined;
        }
    }

    /**
     * Check if worker is running
     */
    isActive(): boolean {
        return this.isRunning;
    }

    /**
     * Get current task being processed
     */
    getCurrentTask(): string | undefined {
        return this.stats.currentTask;
    }

    /**
     * Get total number of transcripts processed
     */
    getProcessedCount(): number {
        return this.stats.totalProcessed;
    }

    /**
     * Get last processed time
     */
    getLastProcessedTime(): string | undefined {
        return this.stats.lastProcessedTime;
    }

    /**
     * Get worker uptime in seconds
     */
    getUptime(): number {
        return Math.floor((Date.now() - this.stats.startTime) / 1000);
    }

    /**
     * Get worker statistics
     */
    getStats(): WorkerStats {
        return { ...this.stats };
    }
}
