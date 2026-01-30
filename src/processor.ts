import * as Logging from '@/logging';
import * as TranscribePhase from '@/phases/transcribe';
import * as SimpleReplacePhase from '@/phases/simple-replace';
import * as LocatePhase from '@/phases/locate';
import * as Dreadcabinet from '@utilarium/dreadcabinet';
import { Config } from '@/protokoll';
import * as Interactive from '@/interactive';
import * as Context from '@/context';
import * as Routing from '@/routing';

export interface Transcription {
    text: string;
    audioFileBasename: string;
}

export interface Instance {
    process(file: string): Promise<void>;
}

/**
 * Analyze transcript for potential unknown entities that need clarification
 */
const analyzeTranscriptForUnknowns = (
    transcriptText: string, 
    context: Context.ContextInstance
): Array<{ term: string; context: string; type: Interactive.ClarificationType }> => {
    const unknowns: Array<{ term: string; context: string; type: Interactive.ClarificationType }> = [];
    
    // Extract potential names (capitalized words that aren't at sentence start)
    const namePattern = /(?<=[.!?]\s+|\n|^)(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g;
    const potentialNames = transcriptText.match(namePattern) || [];
    
    // Check each potential name against context
    for (const name of potentialNames) {
        const normalizedName = name.trim();
        const searchResults = context.search(normalizedName);
        
        if (searchResults.length === 0) {
            // This name isn't in our context - might need clarification
            // Extract surrounding context (up to 50 chars before and after)
            const index = transcriptText.indexOf(normalizedName);
            const start = Math.max(0, index - 50);
            const end = Math.min(transcriptText.length, index + normalizedName.length + 50);
            const surroundingContext = transcriptText.substring(start, end);
            
            unknowns.push({
                term: normalizedName,
                context: `..."${surroundingContext}"...`,
                type: 'new_person',
            });
        }
    }
    
    // Also look for potential project names (things like "the X project" or "working on X")
    const projectPattern = /(?:the\s+|working\s+on\s+|called\s+)([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/gi;
    let match;
    while ((match = projectPattern.exec(transcriptText)) !== null) {
        const projectName = match[1];
        const searchResults = context.search(projectName);
        
        if (searchResults.length === 0) {
            unknowns.push({
                term: projectName,
                context: match[0],
                type: 'new_project',
            });
        }
    }
    
    // ISSUE #3: Detect unknown terms (technical vocabulary, acronyms, domain-specific terms)
    // Get all known terms to avoid re-asking about them
    const allEntities = context.search('');
    const knownTermsSet = new Set(allEntities.map(e => e.name.toLowerCase()));
    
    // Pattern for technical terms: hyphenated words, acronyms, CamelCase
    // Examples: GraphQL, Kubernetes, machine-learning, OAuth, REST-API
    const termPattern = /\b([A-Z][a-z]+-[A-Z][a-z]+|[A-Z]{2,}\b|[a-z]+-[a-z]+(?:-[a-z]+)*)\b/g;
    let termMatch;
    const foundTerms = new Set<string>();
    
    while ((termMatch = termPattern.exec(transcriptText)) !== null) {
        const term = termMatch[1];
        // Only ask about terms we haven't seen and don't already know
        if (term.length > 2 && !knownTermsSet.has(term.toLowerCase()) && !foundTerms.has(term.toLowerCase())) {
            foundTerms.add(term.toLowerCase());
            const idx = transcriptText.indexOf(term);
            const start = Math.max(0, idx - 50);
            const end = Math.min(transcriptText.length, idx + term.length + 50);
            const context_str = transcriptText.substring(start, end);
            
            unknowns.push({
                term,
                context: `..."${context_str}"...`,
                type: 'new_term',
            });
        }
    }
    
    // Deduplicate by term
    const seen = new Set<string>();
    return unknowns.filter(u => {
        if (seen.has(u.term.toLowerCase())) return false;
        seen.add(u.term.toLowerCase());
        return true;
    });
};

/**
 * Apply corrections from clarification responses to the transcript
 */
const applyCorrections = (
    transcriptText: string,
    corrections: Map<string, string>
): string => {
    let correctedText = transcriptText;
    
    for (const [original, corrected] of corrections) {
        if (original !== corrected && corrected.trim() !== '') {
            // Replace all instances of the original with the corrected version
            const regex = new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            correctedText = correctedText.replace(regex, corrected);
        }
    }
    
    return correctedText;
};

export const create = (config: Config, operator: Dreadcabinet.Operator): Instance => {
    const logger = Logging.getLogger();
    const currentWorkingDir = globalThis.process.cwd();

    const locatePhase: LocatePhase.Instance = LocatePhase.create(config, operator);
    const simpleReplacePhase: SimpleReplacePhase.Instance = SimpleReplacePhase.create(config, operator);

    // Initialize interactive system if enabled
    let interactive: Interactive.InteractiveInstance | null = null;
    let context: Context.ContextInstance | null = null;
    let routing: Routing.RoutingInstance | null = null;
    let transcribePhase: TranscribePhase.Instance | null = null;

    const initializeAgenticSystems = async () => {
        if (!context) {
            logger.info('Initializing agentic systems...');
            
            // Initialize context system for entity lookup via tools
            context = await Context.create({
                startingDir: currentWorkingDir,
            });
            logger.info('Context system initialized - %d entities loaded', 
                context.search('').length); // Quick way to count
            
            // Initialize routing system with default config
            const defaultRouteDestination: Routing.RouteDestination = {
                path: config.outputDirectory || 'output',
                structure: (config.outputStructure || 'month') as Routing.FilesystemStructure,
                filename_options: (config.outputFilenameOptions || ['date', 'time']) as Routing.FilenameOption[],
                createDirectories: true,
            };
            
            // Convert context projects to routing format
            // Projects without a destination inherit from the default
            const contextProjects = context.getAllProjects();
            const routingProjects: Routing.ProjectRoute[] = contextProjects
                .filter(project => project.active !== false)
                .map(project => ({
                    projectId: project.id,
                    destination: {
                        path: project.routing.destination || defaultRouteDestination.path,
                        structure: project.routing.structure,
                        filename_options: project.routing.filename_options,
                        createDirectories: true,
                    },
                    classification: project.classification,
                    active: project.active,
                    auto_tags: project.routing.auto_tags,
                }));
            
            const routingConfig: Routing.RoutingConfig = {
                default: defaultRouteDestination,
                projects: routingProjects,
                conflict_resolution: 'primary',
            };
            
            routing = Routing.create(routingConfig, context);
            logger.info('Routing system initialized with %d projects', routingProjects.length);
            
            // Create transcribe phase with dependencies for agentic mode
            transcribePhase = TranscribePhase.create(config, operator, {
                contextInstance: context,
                routingInstance: routing,
            });
            logger.info('Agentic transcription ready - model will query context via tools');
        }

        if (config.interactive && !interactive && context) {
            interactive = Interactive.create(
                { 
                    enabled: true, 
                    defaultToSuggestion: true,
                },
                context
            );
            
            interactive.startSession();
            logger.info('Interactive session started');
        }
    };

    const process = async (audioFile: string) => {
        logger.verbose('Processing file %s', audioFile);

        // Initialize agentic systems (context, routing, interactive)
        await initializeAgenticSystems();
        
        if (!transcribePhase) {
            throw new Error('Transcribe phase not initialized');
        }

        // Locate the contents in time and on the filesystem
        logger.debug('Locating file %s', audioFile);
        const { creationTime, outputPath, contextPath, interimPath, transcriptionFilename, hash } = await locatePhase.locate(audioFile);
        logger.debug('Locate complete: %s', JSON.stringify({ creationTime, outputPath, contextPath, interimPath, transcriptionFilename, hash }));

        // Transcribe the audio
        logger.debug('Transcribing file %s', audioFile);
        let transcription = await transcribePhase.transcribe(creationTime, outputPath, contextPath, interimPath, transcriptionFilename, hash, audioFile);

        // ISSUE #2: Check routing confidence and ask for confirmation if low
        let routeDecision: Routing.RouteDecision | null = null;
        if (routing && context && config.interactive && interactive) {
            logger.info('Determining routing and checking confidence...');

            const routingContext: Routing.RoutingContext = {
                transcriptText: transcription.text,
                audioDate: creationTime,
                sourceFile: audioFile,
                hash,
            };

            routeDecision = routing.route(routingContext);

            // Apply simple-replace phase if we have a project classification
            if (routeDecision.projectId) {
                logger.debug('Applying simple-replace for project %s', routeDecision.projectId);
                const simpleReplaceResult = await simpleReplacePhase.replace(
                    transcription.text,
                    {
                        project: routeDecision.projectId,
                        confidence: routeDecision.confidence,
                    },
                    interimPath,
                    hash
                );

                // Update transcription text with corrected entities
                transcription = {
                    ...transcription,
                    text: simpleReplaceResult.text,
                };

                logger.info(
                    `Simple-replace applied: ${simpleReplaceResult.stats.totalReplacements} ` +
                    `replacements (Tier 1: ${simpleReplaceResult.stats.tier1Replacements}, ` +
                    `Tier 2: ${simpleReplaceResult.stats.tier2Replacements})`
                );
            }
            
            // If confidence is low, ask user to confirm routing
            if (routeDecision.confidence < 0.7) {
                logger.info('Routing confidence is %.1f%% - asking for confirmation', 
                    routeDecision.confidence * 100);
                
                const signalSummary = routeDecision.signals.length > 0
                    ? routeDecision.signals.map(s => `${s.value}`).join(', ')
                    : 'none detected';
                
                const routingRequest: Interactive.ClarificationRequest = {
                    type: 'low_confidence_routing',
                    term: `${(routeDecision.confidence * 100).toFixed(0)}%`,
                    context: `This note seems like it should go to:\n"${routeDecision.destination.path}"\n\nDetected signals: ${signalSummary}\n\nReasoning: ${routeDecision.reasoning}`,
                };
                
                await interactive.handleClarification(routingRequest);
                logger.debug('Routing confirmation handled');
            }
        }

        // Interactive clarification phase
        if (config.interactive && interactive && context) {
            logger.info('Analyzing transcript for potential clarifications...');
            
            const unknowns = analyzeTranscriptForUnknowns(transcription.text, context);
            
            if (unknowns.length > 0) {
                logger.info(`Found ${unknowns.length} potential unknown entities`);
                
                const corrections = new Map<string, string>();
                
                for (const unknown of unknowns) {
                    const request: Interactive.ClarificationRequest = {
                        type: unknown.type,
                        term: unknown.term,
                        context: unknown.context,
                    };
                    
                    const response = await interactive.handleClarification(request);
                    
                    if (response.response && response.response !== unknown.term) {
                        corrections.set(unknown.term, response.response);
                        logger.debug('Correction recorded', { 
                            original: unknown.term, 
                            corrected: response.response 
                        });
                        
                        // If user wants to remember this, save to context
                        if (response.shouldRemember && context) {
                            try {
                                await context.saveEntity({
                                    type: unknown.type === 'new_person' ? 'person' : unknown.type === 'new_project' ? 'project' : 'term',
                                    id: response.response.toLowerCase().replace(/\s+/g, '-'),
                                    name: response.response,
                                    soundsLike: [unknown.term],
                                } as Context.Person | Context.Project);
                                // ISSUE #1: Provide user feedback on successful save
                                // eslint-disable-next-line no-console
                                console.log(`\n✓ Remembered! "${response.response}" will be recognized in future transcripts.\n`);
                                logger.info('Saved new entity to context', { name: response.response });
                            } catch (err) {
                                // ISSUE #1: Inform user of save failure
                                // eslint-disable-next-line no-console
                                console.log(`\n⚠ Could not save "${response.response}" - check file permissions\n`);
                                logger.warn('Could not save entity to context', { error: err });
                            }
                        }
                    }
                }
                
                // Apply corrections to transcript if any were made
                if (corrections.size > 0) {
                    const correctedText = applyCorrections(transcription.text, corrections);
                    logger.info(`Applied ${corrections.size} corrections to transcript`);
                    // Note: The corrections are applied in memory but the existing
                    // transcription files are already written. The markdown file
                    // would need to be regenerated with corrections for them to persist.
                    // This is a limitation of the current architecture.
                    logger.debug('Corrected transcript preview', { 
                        preview: correctedText.substring(0, 200) 
                    });
                }
            } else {
                logger.info('No unknown entities detected - transcript looks good');
            }
        }

        logger.info('Transcription complete for file %s', audioFile);
        logger.info('Transcription saved to: %s', transcriptionFilename);
        
        // End interactive session if active
        if (interactive && config.interactive) {
            const session = interactive.endSession();
            logger.debug('Interactive session summary', {
                questions: session.requests.length,
                responses: session.responses.length,
            });
        }
        
        return;
    }

    return {
        process,
    }
}
