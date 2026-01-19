/**
 * Interactive Mode Types
 *
 * Types for user interaction and clarification.
 */

export type ClarificationType = 
    | 'name_spelling'
    | 'new_person'
    | 'new_project'
    | 'new_company'
    | 'new_term'
    | 'routing_decision'
    | 'low_confidence_routing'
    | 'first_run_onboarding'
    | 'general';

export interface ClarificationRequest {
    type: ClarificationType;
    context: string;
    term: string;
    suggestion?: string;
    options?: string[];
}

export interface ClarificationResponse {
    type: ClarificationType;
    term: string;
    response: string;
    shouldRemember: boolean;
    additionalInfo?: Record<string, unknown>;
    skipRestOfFile?: boolean;  // User wants to skip remaining prompts for this file
}

/**
 * Tracks processing of a single file
 */
export interface FileProcessing {
    inputPath: string;
    outputPath?: string;
    movedTo?: string;
    promptsAnswered: number;
    skipped: boolean;
    startedAt: Date;
    completedAt?: Date;
}

/**
 * Tracks entities added/updated during session
 */
export interface SessionChanges {
    termsAdded: string[];
    termsUpdated: string[];
    projectsAdded: string[];
    projectsUpdated: string[];
    peopleAdded: string[];
    aliasesAdded: Array<{ alias: string; linkedTo: string }>;
}

export interface InteractiveSession {
    requests: ClarificationRequest[];
    responses: ClarificationResponse[];
    startedAt: Date;
    completedAt?: Date;
    
    // File tracking
    currentFile?: string;
    filesProcessed: FileProcessing[];
    
    // Entity changes
    changes: SessionChanges;
    
    // Session control
    shouldStop: boolean;  // User requested to stop mid-session
}

export interface InteractiveConfig {
    enabled: boolean;
    timeout?: number;  // ms to wait for user input
    defaultToSuggestion?: boolean;  // Use suggestion if timeout
    batchQuestions?: boolean;  // Ask all questions at once
    silent?: boolean;  // Disable sound notifications when prompting
}

/**
 * Bootstrap/Onboarding state for first-run detection
 */
export interface OnboardingState {
    hasProjects: boolean;
    hasDefaultDestination: boolean;
    hasAnyContext: boolean;
    needsOnboarding: boolean;
}

/**
 * Project setup collected during onboarding
 */
export interface OnboardingProject {
    name: string;
    description?: string;
    context_type: 'work' | 'personal' | 'mixed';
    destination: string;
    structure: 'none' | 'year' | 'month' | 'day';
    filename_options: Array<'date' | 'time' | 'subject'>;
    trigger_phrases?: string[];
}

export interface OnboardingResult {
    defaultDestination?: string;
    defaultStructure?: 'none' | 'year' | 'month' | 'day';
    projects: OnboardingProject[];
    completed: boolean;
}

/**
 * Result from the new project/term wizard
 */
export interface NewProjectWizardResult {
    action: 'create' | 'link' | 'term' | 'skip' | 'ignore';
    // For 'create' (new project)
    projectName?: string;
    destination?: string;
    description?: string;
    // For 'link' (link this variation to existing term/project)
    linkedProjectIndex?: number;
    linkedTermName?: string;      // Name of existing term this is an alias for
    aliasName?: string;           // The new variant/alias to add to the term
    termDescription?: string;
    // For 'term' (create a new term entity)
    termName?: string;
    termExpansion?: string;       // Full form if acronym
    termProjects?: number[];      // Indices of associated projects
    // If user created a new project inline (when processing a term)
    createdProject?: NewProjectWizardResult;
    // For 'ignore' - add term to ignore list
    ignoredTerm?: string;
}

/**
 * Result from the new person wizard
 */
export interface NewPersonWizardResult {
    action: 'create' | 'skip';
    // Person details
    personName?: string;
    organization?: string;
    notes?: string;
    // Project association
    linkedProjectId?: string;
    linkedProjectIndex?: number;
    // If user created a new project inline
    createdProject?: NewProjectWizardResult;
}

