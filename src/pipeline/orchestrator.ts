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
import * as CompletePhase from '../phases/complete';
import * as Logging from '../logging';
import * as Metadata from '../util/metadata';

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
  
    logger.debug('Initializing intelligent transcription pipeline...');
  
    // Initialize context system (async)
    const context = await Context.create({
        startingDir: config.contextDirectory || currentWorkingDir,
    });
    logger.debug('Context system initialized - ready to query entities via tools');
  
    // Convert context projects to routing format
    const contextProjects = context.getAllProjects();
    const routingProjects: Routing.ProjectRoute[] = contextProjects
        .filter(project => project.active !== false)
        .map(project => ({
            projectId: project.id,
            destination: {
                path: project.routing.destination,
                structure: project.routing.structure,
                filename_options: project.routing.filename_options,
                createDirectories: true,
            },
            classification: project.classification,
            active: project.active,
            auto_tags: project.routing.auto_tags,
        }));
    
    logger.debug('Loaded %d projects from context for routing', routingProjects.length);
  
    // Initialize routing with config-based defaults
    const routingConfig: Routing.RoutingConfig = {
        default: {
            path: config.outputDirectory || '~/notes',
            structure: (config.outputStructure || 'month') as Routing.FilesystemStructure,
            filename_options: (config.outputFilenameOptions || ['date', 'time', 'subject']) as Routing.FilenameOption[],
            createDirectories: true,
        },
        projects: routingProjects,
        conflict_resolution: 'primary',
    };
  
    const routing = Routing.create(routingConfig, context);
    logger.debug('Routing system initialized');
  
    const interactive = Interactive.create(
        { enabled: config.interactive, defaultToSuggestion: true, silent: config.silent },
        context
    );
  
    const output = Output.create({
        intermediateDir: config.intermediateDir || './output/protokoll',
        keepIntermediates: config.keepIntermediates ?? true,
        timestampFormat: 'YYMMDD-HHmm',
    });
    logger.debug('Output manager initialized');
  
    const reflection = config.selfReflection 
        ? Reflection.create({
            enabled: true,
            format: 'markdown',
            includeConversation: false,
            includeOutput: true,
        })
        : null;
    if (reflection) {
        logger.debug('Self-reflection system enabled');
    }
  
    // Initialize transcription service
    const transcription = Transcription.create({
        defaultModel: config.transcriptionModel as Transcription.TranscriptionModel,
    });
    logger.debug('Transcription service initialized with model: %s', config.transcriptionModel);
  
    // Initialize reasoning for agentic processing
    const reasoning = Reasoning.create({ model: config.model });
    logger.debug('Reasoning system initialized with model: %s', config.model);

    // Initialize complete phase for moving files to processed directory
    // Pass outputStructure so processed files use the same directory structure as output
    const complete = config.processedDirectory 
        ? CompletePhase.create({
            processedDirectory: config.processedDirectory,
            outputStructure: config.outputStructure as CompletePhase.FilesystemStructure,
            dryRun: config.dryRun,
        })
        : null;
    if (complete) {
        logger.debug('Complete phase initialized with processed directory: %s', config.processedDirectory);
    }
  
    // Helper to extract a human-readable title from the output path
    const extractTitleFromPath = (outputPath: string): string | undefined => {
        const filename = outputPath.split('/').pop()?.replace('.md', '');
        if (!filename) return undefined;
        
        // Remove date prefix (e.g., "27-0716-" from "27-0716-meeting-notes")
        const withoutDate = filename.replace(/^\d{2}-\d{4}-/, '');
        if (!withoutDate) return undefined;
        
        // Convert kebab-case to Title Case
        return withoutDate
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    const processInput = async (input: PipelineInput): Promise<PipelineResult> => {
        const startTime = Date.now();
    
        logger.info('Processing: %s (hash: %s)', input.audioFile, input.hash);
    
        // Initialize state
        const state: PipelineState = {
            input,
            startTime: new Date(),
        };
    
        // Start reflection collection if enabled
        if (reflection) {
            reflection.collector.start();
        }
    
        // Start interactive session if enabled
        if (config.interactive) {
            interactive.startSession();
            logger.debug('Interactive session started');
        }
    
        try {
            // Step 1: Check onboarding needs
            logger.debug('Checking onboarding state...');
            const onboardingState = interactive.checkNeedsOnboarding();
            if (onboardingState.needsOnboarding) {
                logger.debug('First-run detected - onboarding may be triggered');
            }
      
            // Step 2: Raw transcription using Transcription module
            logger.info('Transcribing audio...');
            const whisperStart = Date.now();
            
            const transcriptionResult = await transcription.transcribe(input.audioFile, {
                model: config.transcriptionModel as Transcription.TranscriptionModel,
            });
            state.rawTranscript = transcriptionResult.text;
            
            const whisperDuration = Date.now() - whisperStart;
            logger.info('Transcription: %d chars in %.1fs', 
                state.rawTranscript.length, whisperDuration / 1000);
      
            if (reflection) {
                reflection.collector.recordWhisper(whisperDuration);
            }
      
            // Step 3: Route detection
            logger.debug('Determining routing destination...');
            const routingContext: Routing.RoutingContext = {
                transcriptText: state.rawTranscript || '',
                audioDate: input.creation,
                sourceFile: input.audioFile,
                hash: input.hash,
            };
      
            const routeResult = routing.route(routingContext);
      
            logger.debug('Routing decision: project=%s, confidence=%.2f', 
                routeResult.projectId || 'default', routeResult.confidence);
      
            // Record routing decision in reflection
            if (reflection) {
                reflection.collector.recordRoutingDecision({
                    projectId: routeResult.projectId,
                    destination: routeResult.destination.path,
                    confidence: routeResult.confidence,
                    reasoning: routeResult.reasoning,
                    signals: routeResult.signals.map(s => ({
                        type: s.type,
                        value: s.value,
                        weight: s.weight,
                    })),
                    alternativesConsidered: routeResult.alternateMatches?.map(alt => ({
                        projectId: alt.projectId,
                        confidence: alt.confidence,
                        whyNotChosen: `Lower confidence (${(alt.confidence * 100).toFixed(1)}%)`,
                    })),
                });
            }
      
            // Build output path
            const outputPath = routing.buildOutputPath(routeResult, routingContext);
            logger.debug('Output path: %s', outputPath);
      
            // Step 4: Create output paths using Output module
            logger.debug('Setting up output directories...');
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
            logger.info('Enhancing with %s...', config.model);
            
            const agenticStart = Date.now();
            const toolContext: Agentic.ToolContext = {
                transcriptText: state.rawTranscript || '',
                audioDate: input.creation,
                sourceFile: input.audioFile,
                contextInstance: context,
                routingInstance: routing,
                interactiveMode: config.interactive,
                // Always pass interactive handler - it will handle enabled/disabled internally
                interactiveInstance: interactive,
            };
            
            const executor = Agentic.create(reasoning, toolContext);
            const agenticResult = await executor.process(state.rawTranscript || '');
            
            state.enhancedText = agenticResult.enhancedText;
            const toolsUsed = agenticResult.toolsUsed;
            const agenticDuration = Date.now() - agenticStart;
            
            // Record tool calls in reflection
            if (reflection) {
                for (const tool of toolsUsed) {
                    reflection.collector.recordToolCall(tool, agenticDuration / toolsUsed.length, true);
                }
                reflection.collector.recordCorrection(state.rawTranscript || '', state.enhancedText);
                // Record token usage from agentic result
                if (agenticResult.totalTokens) {
                    reflection.collector.recordModelResponse(config.model, agenticResult.totalTokens);
                }
                // Record context changes (new projects, entities created)
                if (agenticResult.contextChanges) {
                    for (const change of agenticResult.contextChanges) {
                        reflection.collector.recordContextChange(change);
                    }
                }
            }
            
            // Write agentic session to intermediate
            await output.writeIntermediate(paths, 'session', {
                iterations: agenticResult.iterations,
                toolsUsed: agenticResult.toolsUsed,
                state: agenticResult.state,
            });
      
            // Step 5b: Check if agentic processing found a different route
            // (e.g., via lookup_project tool finding a project with custom destination)
            if (agenticResult.state.routeDecision?.destination?.path) {
                const agenticRoute = agenticResult.state.routeDecision;
                logger.debug('Agentic processing found route: %s -> %s', 
                    agenticRoute.projectId || 'unknown', 
                    agenticRoute.destination.path
                );
                
                // Update routeResult with the agentic decision
                routeResult.projectId = agenticRoute.projectId || routeResult.projectId;
                routeResult.destination = {
                    ...routeResult.destination,
                    path: agenticRoute.destination.path,
                    structure: agenticRoute.destination.structure || routeResult.destination.structure,
                };
                routeResult.confidence = agenticRoute.confidence || routeResult.confidence;
                routeResult.reasoning = agenticRoute.reasoning || routeResult.reasoning;
                if (agenticRoute.signals) {
                    routeResult.signals = agenticRoute.signals;
                }
                
                // Rebuild output path with the new destination
                const newOutputPath = routing.buildOutputPath(routeResult, routingContext);
                logger.debug('Updated output path: %s -> %s', outputPath, newOutputPath);
                
                // Recreate output paths with new destination
                const newPaths = output.createOutputPaths(
                    input.audioFile,
                    newOutputPath,
                    input.hash,
                    input.creation
                );
                await output.ensureDirectories(newPaths);
                
                // Update paths reference (reassign properties since paths is const)
                Object.assign(paths, newPaths);
            }

            // Step 6: Write final output using Output module with metadata
            logger.debug('Writing final transcript...');
            if (state.enhancedText) {
                // Build metadata from routing decision and input
                const transcriptMetadata: Metadata.TranscriptMetadata = {
                    title: extractTitleFromPath(paths.final),
                    projectId: routeResult.projectId || undefined,
                    project: routeResult.projectId || undefined,
                    date: input.creation,
                    routing: Metadata.createRoutingMetadata(routeResult),
                    tags: Metadata.extractTagsFromSignals(routeResult.signals),
                    confidence: routeResult.confidence,
                };
                
                await output.writeTranscript(paths, state.enhancedText, transcriptMetadata);
            }
      
            // Step 7: Generate reflection report
            logger.debug('Generating reflection report...');
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
                }
            }
      
            // Step 8: End interactive session
            logger.debug('Finalizing session...');
            let session: Interactive.InteractiveSession | undefined;
            if (config.interactive) {
                session = interactive.endSession();
                logger.debug('Interactive session ended: %d clarifications', session.responses.length);
        
                // Save session if path available
                if (paths.intermediate.session) {
                    await output.writeIntermediate(paths, 'session', session);
                }
            }
      
            // Step 9: Cleanup if needed
            if (!config.keepIntermediates && !config.debug) {
                await output.cleanIntermediates(paths);
            }

            // Step 10: Move audio file to processed directory
            let processedAudioPath: string | undefined;
            if (complete) {
                // Extract subject from output path for naming
                const subject = paths.final.split('/').pop()?.replace('.md', '') || undefined;
                processedAudioPath = await complete.complete(
                    input.audioFile, 
                    input.hash, 
                    input.creation,
                    subject
                );
            }
      
            const processingTime = Date.now() - startTime;
      
            // Compact summary output
            logger.info('Enhancement: %d iterations, %d tools, %.1fs', 
                agenticResult.iterations, toolsUsed.length, agenticDuration / 1000);
            if (agenticResult.totalTokens) {
                logger.info('Tokens: %d total', agenticResult.totalTokens);
            }
            logger.info('Output: %s (%.1fs total)', paths.final, processingTime / 1000);
      
            return {
                outputPath: paths.final,
                enhancedText: state.enhancedText || '',
                rawTranscript: state.rawTranscript || '',
                routedProject: routeResult.projectId,
                routingConfidence: routeResult.confidence,
                processingTime,
                toolsUsed,
                correctionsApplied: agenticResult.state.resolvedEntities.size,
                processedAudioPath,
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
