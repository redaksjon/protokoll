/**
 * Background Transcription Worker
 * 
 * Processes uploaded audio files sequentially in the background.
 * Scans for transcripts in 'uploaded' status and processes them through
 * the existing Pipeline infrastructure.
 */

import { join, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import * as fs from 'node:fs/promises';
import { glob } from 'glob';
import { Pipeline, Transcript as TranscriptOps, Weighting } from '@redaksjon/protokoll-engine';
import { PklTranscript } from '@redaksjon/protokoll-format';
import type { TranscriptMetadata } from '@redaksjon/protokoll-format';

const { findUploadedTranscripts, markTranscriptAsTranscribing, markTranscriptAsFailed } = TranscriptOps;

const WEIGHT_MODEL_FILENAME = '.protokoll-weight-model.json';

/**
 * Worker configuration
 */
export interface WorkerConfig {
    outputDirectory: string;       // Where PKL files are stored
    contextDirectory?: string;     // Starting directory for context discovery (fallback)
    /** Explicit context directories from protokoll-config.yaml (preferred over discovery) */
    contextDirectories?: string[]; // e.g. ['~/.protokoll/projects']
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
    private weightModelProvider: Weighting.WeightModelProvider | null = null;
    private weightModelBuilder: Weighting.WeightModelBuilder | null = null;
    private weightModelPath: string | null = null;

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

        // Initialize weight model for entity co-occurrence tracking and LLM prepositioning
        this.weightModelPath = join(this.config.outputDirectory, WEIGHT_MODEL_FILENAME);
        this.weightModelBuilder = new Weighting.WeightModelBuilder({
            outputFilePath: this.weightModelPath,
            minCooccurrenceCount: 1,
            maxTranscripts: 500,
        });
        this.weightModelProvider = new Weighting.WeightModelProvider();

        const existingModel = await Weighting.WeightModelBuilder.loadFromFile(this.weightModelPath);
        if (existingModel) {
            this.weightModelProvider.loadModel(existingModel);
            // eslint-disable-next-line no-console
            console.log(`📊 Weight model loaded: ${existingModel.metadata.transcriptCount} transcripts, ${existingModel.metadata.entityCount} entities`);
        } else {
            // No existing model — do an initial build from all transcripts in the output dir
            try {
                const builtModel = await this.weightModelBuilder.build(this.config.outputDirectory);
                if (builtModel.metadata.transcriptCount > 0) {
                    this.weightModelProvider.loadModel(builtModel);
                    await this.weightModelBuilder.writeToFile(builtModel, this.weightModelPath);
                    // eslint-disable-next-line no-console
                    console.log(`📊 Weight model built: ${builtModel.metadata.transcriptCount} transcripts, ${builtModel.metadata.entityCount} entities`);
                } else {
                    // eslint-disable-next-line no-console
                    console.log('📊 Weight model: no existing transcripts with entities — starting fresh');
                }
            } catch {
                // eslint-disable-next-line no-console
                console.warn('⚠️  Weight model build failed — starting without prepositioning');
            }
        }

        // Capture for closure in onTranscriptEntitiesUpdated
        const weightModelBuilder = this.weightModelBuilder;
        const weightModelProvider = this.weightModelProvider;
        const weightModelPath = this.weightModelPath;

        // Create pipeline instance
        this.pipeline = await Pipeline.create({
            model: this.config.model || 'gpt-5-mini',
            transcriptionModel: this.config.transcriptionModel || 'whisper-1',
            reasoningLevel: 'medium',
            interactive: false,
            selfReflection: false,
            debug: false,
            silent: true,
            contextDirectory: this.config.contextDirectory,
            contextDirectories: this.config.contextDirectories,
            outputDirectory: this.config.outputDirectory,
            outputStructure: 'month',
            outputFilenameOptions: ['date', 'time', 'subject'],
            maxAudioSize: 100 * 1024 * 1024, // 100MB
            tempDirectory: tmpdir(),
            intermediateDir: join(this.config.outputDirectory, '.intermediate'),
            keepIntermediates: false,
            weightModelProvider,
            onTranscriptEntitiesUpdated: (transcriptUuid, entityIds, projectId) => {
                const model = weightModelProvider.getModel();
                if (!model) return;
                weightModelBuilder.updateTranscript(model, transcriptUuid, entityIds, projectId);
                // Save asynchronously — never block processing on disk I/O
                weightModelBuilder.writeToFile(model, weightModelPath).catch(() => {
                    // eslint-disable-next-line no-console
                    console.warn('⚠️  Failed to save weight model after update');
                });
            },
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
        
        // Open PKL early so we can write incremental enhancement log entries
        // during pipeline execution, giving real-time visibility into tool calls.
        const transcript = PklTranscript.open(item.filePath);

        try {
            // Mark as transcribing
            await markTranscriptAsTranscribing(item.filePath);
            
            // Get audio file path (metadata.audioFile is basename for HTTP uploads, or absolute path from other clients)
            let audioFilePath = item.metadata.audioFile && isAbsolute(item.metadata.audioFile)
                ? item.metadata.audioFile
                : join(this.config.uploadDirectory, item.metadata.audioFile || '');
            
            // Fallback: if file not found but we have audioHash, find by hash (handles legacy transcripts with originalFilename in audioFile)
            try {
                await fs.stat(audioFilePath);
            } catch {
                if (item.metadata.audioHash) {
                    const byHash = await glob(`${item.metadata.audioHash}.*`, { cwd: this.config.uploadDirectory, absolute: true });
                    if (byHash.length > 0) {
                        audioFilePath = byHash[0];
                    } else {
                        throw new Error(`Audio file not found at ${audioFilePath} and no file matching hash ${item.metadata.audioHash} in uploads`);
                    }
                } else {
                    throw new Error(`Audio file not found at ${audioFilePath} and no audioHash for fallback lookup`);
                }
            }
            
            // Process through pipeline
            if (!this.pipeline) {
                throw new Error('Pipeline not initialized');
            }

            // Log that enhancement is starting
            transcript.enhancementLog.logStep(new Date(), 'enhance', 'enhancement_start', {
                model: this.config.model || 'gpt-5-mini',
                audioFile: item.metadata.audioFile,
            });

            let toolCallCount = 0;

            const result = await this.pipeline.process({
                audioFile: audioFilePath,
                creation: item.metadata.date || new Date(),
                hash: item.metadata.audioHash || '',
                onSimpleReplaceComplete: (stats) => {
                    if (stats.totalReplacements === 0) return;
                    try {
                        transcript.enhancementLog.logStep(new Date(), 'simple-replace', 'phase_complete', {
                            totalReplacements: stats.totalReplacements,
                            tier1Replacements: stats.tier1Replacements,
                            tier2Replacements: stats.tier2Replacements,
                            projectContext: stats.projectContext,
                            processingTimeMs: stats.processingTimeMs,
                        });
                        // Log each individual correction as its own entry
                        for (const mapping of stats.appliedMappings) {
                            transcript.enhancementLog.logStep(new Date(), 'simple-replace', 'correction_applied', {
                                original: mapping.soundsLike,
                                replacement: mapping.correctText,
                                tier: mapping.tier,
                                occurrences: mapping.occurrences,
                                entityId: mapping.entityId,
                                entityType: mapping.entityType,
                            });
                        }
                    } catch {
                        // Never let log errors interrupt processing
                    }
                },
                onToolCallStart: (tool, input) => {
                    toolCallCount++;
                    // eslint-disable-next-line no-console
                    console.log(`   🔧 Tool call #${toolCallCount}: ${tool}`);
                    try {
                        transcript.enhancementLog.logStep(new Date(), 'enhance', 'tool_start', {
                            callIndex: toolCallCount,
                            tool,
                            input,
                        });
                    } catch {
                        // Never let log errors interrupt processing
                    }
                },
                onToolCallComplete: (entry) => {
                    // eslint-disable-next-line no-console
                    console.log(`   ✓ Tool ${entry.tool} (${entry.durationMs}ms, ${entry.success ? 'ok' : 'failed'})`);
                    try {
                        transcript.enhancementLog.logStep(entry.timestamp, 'enhance', 'tool_complete', {
                            tool: entry.tool,
                            input: entry.input,
                            output: entry.output,
                            durationMs: entry.durationMs,
                            success: entry.success,
                        });
                    } catch {
                        // Never let log errors interrupt processing
                    }
                },
            });
            
            // Clean up the PKL file the pipeline creates at the routed output path.
            // The worker updates the original upload PKL instead, so the pipeline's
            // output would be a duplicate.
            if (result.outputPath && result.outputPath !== item.filePath) {
                try {
                    await fs.unlink(result.outputPath);
                } catch {
                    // File may not exist or already be cleaned up
                }
            }
            
            // Determine status based on whether enhancement actually changed the text
            const enhancementSucceeded = result.enhancedText 
                && result.enhancedText.length > 50 
                && result.enhancedText !== result.rawTranscript;
            const finalStatus = enhancementSucceeded ? 'enhanced' : 'initial';

            // Log enhancement completion before writing results
            transcript.enhancementLog.logStep(new Date(), 'enhance', 'enhancement_complete', {
                status: finalStatus,
                toolsUsed: result.toolsUsed,
                totalToolCalls: toolCallCount,
                processingTimeMs: result.processingTime,
            });

            // Set raw transcript data
            transcript.setRawTranscript({
                text: result.rawTranscript,
                model: this.config.transcriptionModel || 'whisper-1',
                duration: result.processingTime,
                audioFile: item.metadata.audioFile,
                audioHash: item.metadata.audioHash,
                transcribedAt: new Date().toISOString(),
            });
            
            // Update content with enhanced text (or raw if enhancement failed)
            transcript.updateContent(result.enhancedText || result.rawTranscript);
            
            // Update metadata with appropriate status, title, project, and entity references
            transcript.updateMetadata({ 
                status: finalStatus,
                title: result.title || item.metadata.title || undefined,
                project: result.routedProjectName || undefined,
                projectId: result.routedProject || undefined,
                confidence: result.routingConfidence,
                entities: result.entities,
            });
            
            transcript.close();
            
            // Update stats
            this.stats.totalProcessed++;
            this.stats.lastProcessedTime = new Date().toISOString();
            this.stats.lastProcessedUuid = item.uuid;
            this.stats.currentTask = undefined;
            
            // eslint-disable-next-line no-console
            console.log(`✅ Completed: ${item.uuid} (status: ${finalStatus}, ${toolCallCount} tool calls)`);
            
        } catch (error) {
            // Attempt to close the transcript before marking as failed
            try { transcript.close(); } catch { /* already closed */ }

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
