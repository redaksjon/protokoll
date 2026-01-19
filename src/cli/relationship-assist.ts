/**
 * Relationship Suggestion Assistant
 * 
 * Analyzes existing projects to suggest relationships when creating new projects.
 */

import * as Context from '../context';
import { Project, Term } from '../context/types';

export interface RelationshipSuggestions {
    parent?: {
        id: string;
        name: string;
        reason: string;
        confidence: 'high' | 'medium' | 'low';
    };
    siblings?: Array<{
        id: string;
        name: string;
        reason: string;
    }>;
    relatedTerms?: Array<{
        id: string;
        name: string;
        reason: string;
    }>;
}

interface SuggestionOptions {
    projectName: string;
    projectId: string;
    topics?: string[];
    destination?: string;
    description?: string;
}

/**
 * Suggest relationships for a new project based on existing context
 */
export const suggestRelationships = (
    context: Context.ContextInstance,
    options: SuggestionOptions
): RelationshipSuggestions => {
    const allProjects = context.getAllProjects();
    const allTerms = context.getAllTerms();
    
    const suggestions: RelationshipSuggestions = {};
    
    // Suggest parent based on naming patterns and topics
    const parentCandidates = findParentCandidates(allProjects, options);
    if (parentCandidates.length > 0) {
        suggestions.parent = parentCandidates[0];
    }
    
    // Suggest siblings based on shared parent or similar topics
    const siblingCandidates = findSiblingCandidates(allProjects, options, suggestions.parent?.id);
    if (siblingCandidates.length > 0) {
        suggestions.siblings = siblingCandidates.slice(0, 5); // Top 5
    }
    
    // Suggest related terms based on topics and description
    const termCandidates = findRelatedTerms(allTerms, options);
    if (termCandidates.length > 0) {
        suggestions.relatedTerms = termCandidates.slice(0, 5); // Top 5
    }
    
    return suggestions;
};

/**
 * Find parent project candidates
 */
function findParentCandidates(
    projects: Project[],
    options: SuggestionOptions
): Array<{ id: string; name: string; reason: string; confidence: 'high' | 'medium' | 'low' }> {
    const candidates: Array<{ project: Project; score: number; reasons: string[] }> = [];
    
    for (const project of projects) {
        if (project.id === options.projectId) continue; // Skip self
        
        const reasons: string[] = [];
        let score = 0;
        
        // Check if new project name contains parent name (e.g., "redaksjon-tools" contains "redaksjon")
        const projectNameLower = options.projectName.toLowerCase();
        const candidateNameLower = project.name.toLowerCase();
        
        if (projectNameLower.includes(candidateNameLower)) {
            score += 50;
            reasons.push(`name contains "${project.name}"`);
        }
        
        // Check if new project topics include "{parent}-subproject" pattern
        if (options.topics) {
            const subprojectTopic = options.topics.find(t => 
                t.toLowerCase().includes(`${project.id}-subproject`) ||
                t.toLowerCase().includes(`${candidateNameLower}-subproject`)
            );
            if (subprojectTopic) {
                score += 100; // Very strong signal
                reasons.push(`topic "${subprojectTopic}" indicates subproject`);
            }
            
            // Check for topic overlap
            const projectTopics = project.classification?.topics || [];
            const sharedTopics = options.topics.filter(t => 
                projectTopics.some(pt => pt.toLowerCase() === t.toLowerCase())
            );
            if (sharedTopics.length > 0) {
                score += sharedTopics.length * 10;
                reasons.push(`${sharedTopics.length} shared topics`);
            }
        }
        
        // Check if destination is subdirectory of candidate
        if (options.destination && project.routing?.destination) {
            if (options.destination.startsWith(project.routing.destination + '/')) {
                score += 75;
                reasons.push('destination is subdirectory');
            }
        }
        
        // Check description mentions
        if (options.description && options.description.toLowerCase().includes(candidateNameLower)) {
            score += 25;
            reasons.push('mentioned in description');
        }
        
        if (score > 0) {
            candidates.push({ project, score, reasons });
        }
    }
    
    // Sort by score and return top candidates
    const sorted = candidates.sort((a, b) => b.score - a.score);
    
    return sorted.map(c => ({
        id: c.project.id,
        name: c.project.name,
        reason: c.reasons.join(', '),
        confidence: c.score >= 75 ? 'high' : c.score >= 40 ? 'medium' : 'low'
    }));
}

/**
 * Find sibling project candidates
 */
function findSiblingCandidates(
    projects: Project[],
    options: SuggestionOptions,
    suggestedParentId?: string
): Array<{ id: string; name: string; reason: string }> {
    const candidates: Array<{ project: Project; score: number; reasons: string[] }> = [];
    
    for (const project of projects) {
        if (project.id === options.projectId) continue; // Skip self
        
        const reasons: string[] = [];
        let score = 0;
        
        // If we have a suggested parent, check if this project shares that parent
        if (suggestedParentId && project.relationships?.parent === suggestedParentId) {
            score += 100; // Very strong - shares parent
            reasons.push(`shares parent "${suggestedParentId}"`);
        }
        
        // Check for topic overlap
        if (options.topics) {
            const projectTopics = project.classification?.topics || [];
            const sharedTopics = options.topics.filter(t => 
                projectTopics.some(pt => pt.toLowerCase() === t.toLowerCase())
            );
            if (sharedTopics.length >= 2) {
                score += sharedTopics.length * 15;
                reasons.push(`${sharedTopics.length} shared topics`);
            }
        }
        
        // Check if in same destination directory
        if (options.destination && project.routing?.destination) {
            const newDir = options.destination.split('/').slice(0, -1).join('/');
            const projDir = project.routing.destination.split('/').slice(0, -1).join('/');
            if (newDir === projDir) {
                score += 30;
                reasons.push('same destination directory');
            }
        }
        
        if (score > 0) {
            candidates.push({ project, score, reasons });
        }
    }
    
    // Sort by score and return top candidates
    const sorted = candidates.sort((a, b) => b.score - a.score);
    
    return sorted.map(c => ({
        id: c.project.id,
        name: c.project.name,
        reason: c.reasons.join(', '),
    }));
}

/**
 * Find related term candidates
 */
function findRelatedTerms(
    terms: Term[],
    options: SuggestionOptions
): Array<{ id: string; name: string; reason: string }> {
    const candidates: Array<{ term: Term; score: number; reasons: string[] }> = [];
    
    for (const term of terms) {
        const reasons: string[] = [];
        let score = 0;
        
        // Check if term appears in project name
        const projectNameLower = options.projectName.toLowerCase();
        const termNameLower = term.name.toLowerCase();
        
        if (projectNameLower.includes(termNameLower)) {
            score += 50;
            reasons.push('appears in project name');
        }
        
        // Check if term appears in description
        if (options.description && options.description.toLowerCase().includes(termNameLower)) {
            score += 40;
            reasons.push('mentioned in description');
        }
        
        // Check for topic overlap
        if (options.topics && term.topics) {
            const sharedTopics = options.topics.filter(t => 
                term.topics!.some(tt => tt.toLowerCase() === t.toLowerCase())
            );
            if (sharedTopics.length > 0) {
                score += sharedTopics.length * 20;
                reasons.push(`${sharedTopics.length} shared topics`);
            }
        }
        
        // Check if term name matches any topic
        if (options.topics) {
            if (options.topics.some(t => t.toLowerCase() === termNameLower)) {
                score += 30;
                reasons.push('matches project topic');
            }
        }
        
        if (score > 0) {
            candidates.push({ term, score, reasons });
        }
    }
    
    // Sort by score and return top candidates
    const sorted = candidates.sort((a, b) => b.score - a.score);
    
    return sorted.map(c => ({
        id: c.term.id,
        name: c.term.name,
        reason: c.reasons.join(', '),
    }));
}
