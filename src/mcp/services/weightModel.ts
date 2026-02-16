/**
 * Weight Model Service
 * 
 * Manages entity affinity graph initialization and access for the MCP server.
 * Builds the weight model at startup from recent transcripts and provides
 * a query interface for entity predictions.
 */

import { Weighting } from '@redaksjon/protokoll-engine';

type WeightModelBuilder = Weighting.WeightModelBuilder;
type WeightModelProvider = Weighting.WeightModelProvider;
type WeightModel = Weighting.WeightModel;
type WeightModelConfig = Weighting.WeightModelConfig;
import * as path from 'node:path';

/**
 * Weight model service state
 */
interface WeightModelService {
    /** Provider for querying entity predictions */
    provider: WeightModelProvider;
    
    /** Builder for incremental updates (used in Step 06) */
    builder: WeightModelBuilder;
    
    /** Current weight model (used for incremental updates in Step 06) */
    model: WeightModel | null;
    
    /** Path where weight model JSON is written */
    outputPath: string;
    
    /** Whether the model was successfully built */
    isReady: boolean;
}

let weightModelService: WeightModelService | null = null;
let writeTimer: NodeJS.Timeout | null = null;

/**
 * Initialize the weight model at server startup
 * 
 * Scans recent transcripts to build entity co-occurrence graph.
 * Gracefully handles errors - if building fails, creates an empty provider
 * that returns no predictions (purely additive behavior).
 * 
 * @param workspaceRoot - Root directory to scan for transcripts
 * @returns Initialized weight model service
 */
export async function initializeWeightModel(workspaceRoot: string): Promise<WeightModelService> {
    const transcriptDirectory = workspaceRoot; // Scan entire workspace for .pkl files
    const outputPath = path.join(workspaceRoot, '.transcript', 'weight-model.json');
    
    const config: WeightModelConfig = {
        maxTranscripts: 500,
        minCooccurrenceCount: 2,
        outputFilePath: outputPath
    };
    
    const builder = new Weighting.WeightModelBuilder(config);
    
    try {
        // eslint-disable-next-line no-console
        console.log('[Weight Model] Building entity affinity graph from recent transcripts...');
        const startTime = Date.now();
        
        const model = await builder.buildAndWrite(transcriptDirectory);
        const provider = new Weighting.WeightModelProvider(model);
        
        const duration = Date.now() - startTime;
        // eslint-disable-next-line no-console
        console.log(`[Weight Model] Built in ${duration}ms: ${model.metadata.transcriptCount} transcripts, ${model.metadata.entityCount} entities`);
        // eslint-disable-next-line no-console
        console.log(`[Weight Model] Written to: ${outputPath}`);
        
        weightModelService = { 
            provider, 
            builder, 
            model, 
            outputPath, 
            isReady: true 
        };
        
        return weightModelService;
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[Weight Model] Failed to build, using empty model:', error);
        
        // Create empty provider - purely additive behavior
        const provider = new Weighting.WeightModelProvider(null);
        
        weightModelService = { 
            provider, 
            builder, 
            model: null, 
            outputPath, 
            isReady: false 
        };
        
        return weightModelService;
    }
}

/**
 * Get the current weight model service
 * 
 * @returns Weight model service or null if not initialized
 */
export function getWeightModelService(): WeightModelService | null {
    return weightModelService;
}

/**
 * Check if weight model is available
 * 
 * @returns true if model is ready, false otherwise
 */
export function isWeightModelReady(): boolean {
    return weightModelService?.isReady ?? false;
}

/**
 * Schedule a debounced write of the weight model to disk
 * 
 * Prevents stampedes during batch operations by debouncing writes.
 * The in-memory model is updated immediately, but disk writes are batched.
 * 
 * @param delay - Debounce delay in milliseconds (default: 2000)
 */
export function scheduleWeightModelWrite(delay: number = 2000): void {
    // Clear existing timer
    if (writeTimer) {
        clearTimeout(writeTimer);
    }
    
    // Schedule new write
    writeTimer = setTimeout(async () => {
        writeTimer = null;
        
        if (weightModelService?.isReady && weightModelService.model) {
            try {
                await weightModelService.builder.writeToFile(
                    weightModelService.model,
                    weightModelService.outputPath
                );
                // eslint-disable-next-line no-console
                console.log('[Weight Model] Updated model written to disk');
            } catch (error) {
                // eslint-disable-next-line no-console
                console.warn('[Weight Model] Failed to write after incremental update:', error);
            }
        }
    }, delay);
}

/**
 * Update the weight model when a transcript's entities change
 * 
 * Applies incremental update to the in-memory model and schedules a debounced write.
 * 
 * @param transcriptUuid - UUID of the transcript that changed
 * @param newEntityIds - New entity IDs for this transcript
 * @param newProjectId - New project ID (if changed)
 */
export function updateTranscriptInWeightModel(
    transcriptUuid: string,
    newEntityIds: string[],
    newProjectId?: string
): void {
    if (!weightModelService?.isReady || !weightModelService.model) {
        return; // Gracefully skip if model not available
    }
    
    // Update in-memory model immediately
    weightModelService.builder.updateTranscript(
        weightModelService.model,
        transcriptUuid,
        newEntityIds,
        newProjectId
    );
    
    // Reload the provider with updated model
    weightModelService.provider.loadModel(weightModelService.model);
    
    // Schedule debounced write to disk
    scheduleWeightModelWrite();
}
