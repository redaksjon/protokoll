/**
 * Pipeline Orchestrator
 *
 * Orchestrates the intelligent transcription pipeline, coordinating
 * all the modules: context, routing, transcription, reasoning,
 * agentic tools, interactive mode, output management, and reflection.
 * 
 * THIS IS THE MAIN PROCESSING FLOW - NOT DEAD CODE!
 */

import { PipelineConfig, PipelineInput, PipelineResult, PipelineState } from './types';
import * as Context from '../context';
import * as Routing from '../routing';
import * as Interactive from '../interactive';
import * as Output from '../output';
import * as Reflection from '../reflection';
import * as Transcription from '../transcription';
import * as Reasoning from '../reasoning';
import * as Agentic from '../agentic';
import * as Logging from '../logging';

export interface OrchestratorInstance {
    process(input: PipelineInput): Promise<PipelineResult>;
}

export interface OrchestratorConfig extends PipelineConfig {
    outputDirectory: string;
    outputStructure: string;
    outputFilenameOptions: string[];
    maxAudioSize: number;
    tempDirectory: string;
}

export const create = async (config: OrchestratorConfig): Promise<OrchestratorInstance> => {
    const logger = Logging.getLogger();
    const currentWorkingDir = globalThis.process.cwd();
  
    logger.info('Initializing intelligent transcription pipeline...');
  
    // Initialize context system (async)
    const context = await Context.create({
        startingDir: config.contextDirectory || currentWorkingDir,
    });
    logger.info('Context system initialized - ready to query entities via tools');
  
    // Initialize routing with config-based defaults
    const routingConfig: Routing.RoutingConfig = {
        default: {
            path: config.outputDirectory || '~/notes',
            structure: (config.outputStructure || 'month') as Routing.FilesystemStructure,
            filename_options: (config.outputFilenameOptions || ['date', 'time', 'subject']) as Routing.FilenameOption[],
            createDirectories: true,
        },
        projects: [],
        conflict_resolution: 'primary',
    };
  
    const routing = Routing.create(routingConfig, context);
    logger.info('Routing system initialized');
  
    const interactive = Interactive.create(
        { enabled: config.interactive, defaultToSuggestion: true },
        context
    );
  
    const output = Output.create({
        intermediateDir: config.intermediateDir || './output/protokoll',
        keepIntermediates: config.keepIntermediates ?? true,
        timestampFormat: 'YYMMDD-HHmm',
    });
    logger.info('Output manager initialized');
  
    const reflection = config.selfReflection 
        ? Reflection.create({
            enabled: true,
            format: 'markdown',
            includeConversation: false,
            includeOutput: true,
        })
        : null;
    if (reflection) {
        logger.info('Self-reflection system enabled');
    }
  
    // Initialize transcription service
    const transcription = Transcription.create({
        defaultModel: config.transcriptionModel as Transcription.TranscriptionModel,
    });
    logger.info('Transcription service initialized with model: %s', config.transcriptionModel);
  
    // Initialize reasoning for agentic processing
    const reasoning = Reasoning.create({ model: config.model });
    logger.info('Reasoning system initialized with model: %s', config.model);
  
    const processInput = async (input: PipelineInput): Promise<PipelineResult> => {
        const startTime = Date.now();
    
        logger.info('========================================');
        logger.info('Starting intelligent transcription pipeline');
        logger.info('Audio file: %s', input.audioFile);
        logger.info('Hash: %s', input.hash);
        logger.info('========================================');
    
        // Initialize state
        const state: PipelineState = {
            input,
            startTime: new Date(),
        };
    
        // Start reflection collection if enabled
        if (reflection) {
            reflection.collector.start();
            logger.debug('Reflection collector started');
        }
    
        // Start interactive session if enabled
        if (config.interactive) {
            interactive.startSession();
            logger.info('Interactive session started - will prompt for clarifications');
        }
    
        try {
            // Step 1: Check onboarding needs
            logger.info('Step 1/9: Checking onboarding state...');
            const onboardingState = interactive.checkNeedsOnboarding();
            if (onboardingState.needsOnboarding) {
                logger.info('First-run detected - onboarding may be triggered');
            }
      
            // Step 2: Raw transcription using Transcription module
            logger.info('Step 2/9: Transcribing audio with Whisper...');
            const whisperStart = Date.now();
            
            const transcriptionResult = await transcription.transcribe(input.audioFile, {
                model: config.transcriptionModel as Transcription.TranscriptionModel,
            });
            state.rawTranscript = transcriptionResult.text;
            
            const whisperDuration = Date.now() - whisperStart;
            logger.info('Transcription complete: %d characters in %dms', 
                state.rawTranscript.length, whisperDuration);
      
            if (reflection) {
                reflection.collector.recordWhisper(whisperDuration);
            }
      
            // Step 3: Route detection
            logger.info('Step 3/9: Determining routing destination...');
            const routingContext: Routing.RoutingContext = {
                transcriptText: state.rawTranscript || '',
                audioDate: input.creation,
                sourceFile: input.audioFile,
                hash: input.hash,
            };
      
            const routeResult = routing.route(routingContext);
      
            logger.info('Routing decision: project=%s, confidence=%.2f', 
                routeResult.projectId || 'default', routeResult.confidence);
      
            // Build output path
            const outputPath = routing.buildOutputPath(routeResult, routingContext);
            logger.debug('Output path: %s', outputPath);
      
            // Step 4: Create output paths using Output module
            logger.info('Step 4/9: Setting up output directories...');
            const paths = output.createOutputPaths(
                input.audioFile,
                outputPath,
                input.hash,
                input.creation
            );
      
            await output.ensureDirectories(paths);
            
            // Write raw transcript to intermediate
            await output.writeIntermediate(paths, 'transcript', {
                text: state.rawTranscript,
                model: config.transcriptionModel,
                duration: whisperDuration,
            });
      
            // Step 5: Agentic enhancement using real executor
            logger.info('Step 5/9: Running agentic enhancement...');
            logger.info('Model will use tools to query context on-demand');
            
            const agenticStart = Date.now();
            const toolContext: Agentic.ToolContext = {
                transcriptText: state.rawTranscript || '',
                audioDate: input.creation,
                sourceFile: input.audioFile,
                contextInstance: context,
                routingInstance: routing,
                interactiveMode: config.interactive,
                interactiveInstance: config.interactive ? interactive : undefined,
            };
            
            const executor = Agentic.create(reasoning, toolContext);
            const agenticResult = await executor.process(state.rawTranscript || '');
            
            state.enhancedText = agenticResult.enhancedText;
            const toolsUsed = agenticResult.toolsUsed;
            const agenticDuration = Date.now() - agenticStart;
            
            logger.info('Agentic processing complete: %d iterations, tools used: %s',
                agenticResult.iterations,
                toolsUsed.length > 0 ? toolsUsed.join(', ') : 'none');
            
            // Record tool calls in reflection
            if (reflection) {
                for (const tool of toolsUsed) {
                    reflection.collector.recordToolCall(tool, agenticDuration / toolsUsed.length, true);
                }
                reflection.collector.recordCorrection(state.rawTranscript || '', state.enhancedText);
            }
            
            // Write agentic session to intermediate
            await output.writeIntermediate(paths, 'session', {
                iterations: agenticResult.iterations,
                toolsUsed: agenticResult.toolsUsed,
                state: agenticResult.state,
            });
      
            // Step 6: Write final output using Output module
            logger.info('Step 6/9: Writing final transcript...');
            if (state.enhancedText) {
                await output.writeTranscript(paths, state.enhancedText);
            }
      
            // Step 7: Generate reflection report
            logger.info('Step 7/9: Generating reflection report...');
            let reflectionReport: Reflection.ReflectionReport | undefined;
            if (reflection) {
                reflectionReport = reflection.generate(
                    input.audioFile,
                    paths.final,
                    undefined,
                    state.enhancedText
                );
        
                if (paths.intermediate.reflection) {
                    await reflection.save(reflectionReport, paths.intermediate.reflection);
                    logger.info('Reflection report saved to: %s', paths.intermediate.reflection);
                }
                
                // Log quality summary
                logger.info('Quality assessment: confidence=%.2f, name_accuracy=%.2f',
                    reflectionReport.quality.confidence,
                    reflectionReport.quality.nameAccuracy);
            }
      
            // Step 8: End interactive session
            logger.info('Step 8/9: Finalizing session...');
            let session: Interactive.InteractiveSession | undefined;
            if (config.interactive) {
                session = interactive.endSession();
                logger.info('Interactive session ended: %d clarifications', session.responses.length);
        
                // Save session if path available
                if (paths.intermediate.session) {
                    await output.writeIntermediate(paths, 'session', session);
                }
            }
      
            // Step 9: Cleanup if needed
            logger.info('Step 9/9: Cleanup...');
            if (!config.keepIntermediates && !config.debug) {
                await output.cleanIntermediates(paths);
                logger.debug('Intermediate files cleaned up');
            } else {
                logger.debug('Keeping intermediate files at: %s', config.intermediateDir);
            }
      
            const processingTime = Date.now() - startTime;
      
            logger.info('========================================');
            logger.info('Pipeline completed successfully');
            logger.info('Output: %s', paths.final);
            logger.info('Processing time: %dms', processingTime);
            logger.info('Tools used: %d', toolsUsed.length);
            logger.info('========================================');
      
            return {
                outputPath: paths.final,
                enhancedText: state.enhancedText || '',
                rawTranscript: state.rawTranscript || '',
                routedProject: routeResult.projectId,
                routingConfidence: routeResult.confidence,
                processingTime,
                toolsUsed,
                correctionsApplied: agenticResult.state.resolvedEntities.size,
                reflection: reflectionReport,
                session,
                intermediatePaths: paths,
            };
      
        } catch (error) {
            logger.error('Pipeline error', { error });
            throw error;
        }
    };
  
    return { process: processInput };
};
