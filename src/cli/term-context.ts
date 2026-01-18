/**
 * Term Context
 * 
 * Gathers internal contextual information for term analysis:
 * - Similar existing terms
 * - Related projects (based on topics)
 * - Domain inference
 */

import { getLogger } from '../logging';
import { Project, Term } from '../context/types';
import { ContextInstance } from '../context';
import * as ContentFetcher from './content-fetcher';

export interface InternalTermContext {
    similarTerms: Term[];
    relatedProjects: Project[];
    suggestedDomain?: string;
}

export interface TermAnalysisContext {
    term: string;
    expansion?: string;
  
    // External content
    sourceContent?: string;
    sourceType?: 'url' | 'file' | 'directory' | 'github';
    sourceName?: string;
  
    // Internal context
    similarTerms: Term[];
    suggestedDomain?: string;
  
    // For project suggestions (populated after topic generation)
    topics?: string[];
    relatedProjects: Project[];
  
    // Formatted for LLM
    contextText: string;
}

export interface TermContextInstance {
    gatherInternalContext(term: string, expansion?: string): InternalTermContext;
    findSimilarTerms(term: string): Term[];
    findProjectsByTopic(topics: string[]): Project[];
    inferDomain(term: string, expansion?: string): string | undefined;
}

export const create = (contextInstance: ContextInstance): TermContextInstance => {
    const logger = getLogger();
  
    const findSimilarTerms = (term: string): Term[] => {
        const allTerms = contextInstance.getAllTerms();
        const termLower = term.toLowerCase();
  
        const similar = allTerms.filter((t: Term) => {
            const nameLower = t.name.toLowerCase();
    
            // Exact match (excluding self)
            if (nameLower === termLower) {
                return false;
            }
    
            // One contains the other
            if (nameLower.includes(termLower) || termLower.includes(nameLower)) {
                return true;
            }
    
            // Similar expansion
            if (t.expansion && termLower === t.expansion.toLowerCase()) {
                return true;
            }
    
            // Check sounds_like matches
            if (t.sounds_like?.some((s: string) => s.toLowerCase() === termLower)) {
                return true;
            }
    
            return false;
        });
  
        logger.debug('Found %d similar terms', similar.length);
        return similar.slice(0, 5);  // Limit to top 5
    };
  
    const findProjectsByTopic = (topics: string[]): Project[] => {
        if (topics.length === 0) {
            return [];
        }
  
        const allProjects = contextInstance.getAllProjects();
        const topicsLower = topics.map(t => t.toLowerCase());
  
        // Score each project by topic overlap
        const scoredProjects = allProjects
            .map((project: Project) => {
                const projectTopics = project.classification.topics || [];
                const projectTopicsLower = projectTopics.map((t: string) => t.toLowerCase());
      
                // Count matching topics
                const matches = topicsLower.filter((topic: string) => 
                    projectTopicsLower.some((pt: string) => 
                        pt.includes(topic) || topic.includes(pt)
                    )
                );
      
                return {
                    project,
                    score: matches.length,
                };
            })
            .filter((item: { project: Project; score: number }) => item.score > 0)
            .sort((a: { project: Project; score: number }, b: { project: Project; score: number }) => b.score - a.score);
  
        logger.debug('Found %d projects matching topics', scoredProjects.length);
        return scoredProjects.slice(0, 5).map((item: { project: Project; score: number }) => item.project);
    };
  
    const inferDomain = (term: string, expansion?: string): string | undefined => {
        const textToAnalyze = `${term} ${expansion || ''}`.toLowerCase();
  
        // Simple keyword-based domain inference
        const domainKeywords: Record<string, string[]> = {
            'devops': ['docker', 'kubernetes', 'k8s', 'ci', 'cd', 'deployment', 'container', 'orchestration', 'jenkins', 'gitlab', 'github-actions'],
            'engineering': ['algorithm', 'data structure', 'api', 'framework', 'library', 'code', 'programming', 'software'],
            'cloud': ['aws', 'azure', 'gcp', 'cloud', 's3', 'lambda', 'ec2', 'cloudformation', 'terraform'],
            'database': ['sql', 'nosql', 'database', 'postgres', 'mongo', 'redis', 'query', 'orm', 'schema'],
            'security': ['auth', 'encryption', 'certificate', 'ssl', 'tls', 'security', 'vault', 'oauth', 'jwt'],
            'business': ['roi', 'kpi', 'okr', 'revenue', 'cost', 'budget', 'stakeholder', 'metrics'],
            'product': ['user', 'feature', 'roadmap', 'requirement', 'specification', 'ux', 'ui', 'design'],
            'finance': ['accounting', 'invoice', 'payment', 'transaction', 'ledger', 'revenue', 'billing'],
            'testing': ['test', 'qa', 'quality', 'coverage', 'mock', 'integration', 'unit', 'e2e'],
            'frontend': ['react', 'vue', 'angular', 'javascript', 'typescript', 'css', 'html', 'component'],
            'backend': ['api', 'server', 'microservice', 'endpoint', 'rest', 'graphql', 'grpc'],
            'infrastructure': ['server', 'network', 'load-balancer', 'dns', 'proxy', 'infrastructure', 'platform'],
        };
  
        for (const [domain, keywords] of Object.entries(domainKeywords)) {
            if (keywords.some(keyword => textToAnalyze.includes(keyword))) {
                logger.debug('Inferred domain: %s', domain);
                return domain;
            }
        }
  
        return undefined;
    };
  
    const gatherInternalContext = (term: string, expansion?: string): InternalTermContext => {
        logger.debug('Gathering internal context for term: %s', term);
    
        return {
            similarTerms: findSimilarTerms(term),
            relatedProjects: [],  // Populated after topic generation
            suggestedDomain: inferDomain(term, expansion),
        };
    };
  
    return {
        gatherInternalContext,
        findSimilarTerms,
        findProjectsByTopic,
        inferDomain,
    };
};

/**
 * Build complete context for LLM analysis
 * Combines external content (from URL/file) with internal context (similar terms, projects)
 */
export const buildAnalysisContext = (
    term: string,
    expansion: string | undefined,
    fetchResult: ContentFetcher.FetchResult | undefined,
    internalContext: InternalTermContext
): TermAnalysisContext => {
    const parts: string[] = [];
  
    parts.push(`Term: ${term}`);
  
    if (expansion) {
        parts.push(`Expansion: ${expansion}`);
    }
  
    // Add source content if available
    if (fetchResult?.success && fetchResult.content) {
        parts.push('\n--- Source Content ---');
        parts.push(fetchResult.content.substring(0, 5000)); // Limit for context
        parts.push('--- End Source Content ---\n');
    }
  
    // Add suggested domain
    if (internalContext.suggestedDomain) {
        parts.push(`Suggested Domain: ${internalContext.suggestedDomain}`);
    }
  
    // Add similar terms
    if (internalContext.similarTerms.length > 0) {
        parts.push('\nSimilar existing terms:');
        internalContext.similarTerms.forEach(t => {
            parts.push(`- ${t.name}${t.expansion ? ` (${t.expansion})` : ''}: ${t.description || 'No description'}`);
            if (t.domain) {
                parts.push(`  Domain: ${t.domain}`);
            }
            if (t.topics && t.topics.length > 0) {
                parts.push(`  Topics: ${t.topics.join(', ')}`);
            }
        });
    }
  
    return {
        term,
        expansion,
        sourceContent: fetchResult?.content,
        sourceType: fetchResult?.sourceType,
        sourceName: fetchResult?.sourceName,
        similarTerms: internalContext.similarTerms,
        suggestedDomain: internalContext.suggestedDomain,
        relatedProjects: [],
        contextText: parts.join('\n'),
    };
};

/**
 * Enrich context with project suggestions after topic generation
 */
export const enrichWithProjects = (
    context: TermAnalysisContext,
    topics: string[],
    termContext: TermContextInstance
): TermAnalysisContext => {
    const relatedProjects = termContext.findProjectsByTopic(topics);
  
    return {
        ...context,
        topics,
        relatedProjects,
    };
};
