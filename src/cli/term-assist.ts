/**
 * Term Assist
 * 
 * LLM-assisted term metadata generation for smart term creation.
 */

import { getLogger } from '../logging';
import * as OpenAI from '../util/openai';
import { SmartAssistanceConfig } from '../context/types';
import { TermAnalysisContext } from './term-context';

export interface TermSuggestions {
    soundsLike: string[];
    description?: string;
    topics: string[];
    domain?: string;
}

export interface TermAssistInstance {
    generateSoundsLike(term: string): Promise<string[]>;
    generateDescription(term: string, context: TermAnalysisContext): Promise<string>;
    generateTopics(term: string, context: TermAnalysisContext): Promise<string[]>;
    suggestDomain(term: string, context: TermAnalysisContext): Promise<string | undefined>;
    generateAll(term: string, context: TermAnalysisContext): Promise<TermSuggestions>;
    isAvailable(): boolean;
}

export const create = (config: SmartAssistanceConfig): TermAssistInstance => {
    const logger = getLogger();
  
    const isAvailable = (): boolean => {
        return !!process.env.OPENAI_API_KEY && config.enabled && config.termsEnabled !== false;
    };

    const generateSoundsLike = async (term: string): Promise<string[]> => {
        if (!isAvailable() || !config.termSoundsLikeOnAdd) {
            logger.debug('Term sounds_like generation not enabled');
            return [];
        }

        logger.debug('Generating phonetic variants for term: %s', term);

        const prompt = `The term "${term}" will be spoken in audio recordings and transcribed by Whisper speech-to-text.

Generate phonetic variations that Whisper might produce when mishearing this term. Include:
- Common phonetic mishearings
- How the term sounds in different accents
- Alternate spellings a speech-to-text system might produce
- Common transcription errors
- Phonetically similar words or phrases

This is for correcting the TERM when it's misheard in transcription.

Output ONLY a comma-separated list with no explanation, no quotes, no extra text.
Do NOT include the original term in the list.

Example for "Kubernetes": cube a netes,coobernettys,cube er netes,k8s,coobernetties
Example for "PostgreSQL": post gres,postgres,post gray sequel,postgre
Example for "OAuth": oh auth,o auth,open auth,o off`;

        try {
            const response = await OpenAI.createCompletion(
                [{ role: 'user', content: prompt }],
                { 
                    model: config.phoneticModel,
                    reasoningLevel: 'low',
                }
            );

            const variants: string[] = response
                .split(',')
                .map((p: string) => p.trim().toLowerCase())
                .filter((p: string) => p.length > 0 && p.toLowerCase() !== term.toLowerCase());

            const uniqueVariants = [...new Set(variants)];

            logger.debug('Generated %d phonetic variants', uniqueVariants.length);
            return uniqueVariants;

        } catch (error: any) {
            logger.error('Failed to generate phonetic variants: %s', error.message);
            return [];
        }
    };

    const generateDescription = async (term: string, context: TermAnalysisContext): Promise<string> => {
        if (!isAvailable() || !config.termDescriptionOnAdd) {
            logger.debug('Term description generation not enabled');
            return '';
        }

        logger.debug('Generating description for term: %s', term);

        // Build rich prompt with source content if available
        let sourceContext = '';
        if (context.sourceContent) {
            sourceContext = `\n\nSource documentation:\n---\n${context.sourceContent}\n---\n`;
        }

        const prompt = `Generate a clear, concise description for the term "${term}".

${context.expansion ? `This term is an abbreviation/acronym for: ${context.expansion}` : ''}

${sourceContext}

${context.contextText}

Write a description that:
- Explains what the term means in 1-3 sentences
- Is clear and accessible to someone unfamiliar with the term
- Focuses on practical understanding over formal definitions
- Relates to how this term is used in the user's work context

Output ONLY the description text with no preamble, quotes, or extra formatting.

Example for "Kubernetes": "Kubernetes is an open-source container orchestration platform that automates deployment, scaling, and management of containerized applications. It provides a framework for running distributed systems resiliently."

Example for "CICD": "CICD (Continuous Integration/Continuous Deployment) is a software development practice that automates the building, testing, and deployment of applications. It enables teams to deliver code changes more frequently and reliably."`;

        try {
            const response = await OpenAI.createCompletion(
                [{ role: 'user', content: prompt }],
                { 
                    model: config.analysisModel,
                    reasoningLevel: 'low',
                }
            );

            const description = response.trim();
            logger.debug('Generated description (%d chars)', description.length);
            return description;

        } catch (error: any) {
            logger.error('Failed to generate description: %s', error.message);
            return '';
        }
    };

    const generateTopics = async (term: string, context: TermAnalysisContext): Promise<string[]> => {
        if (!isAvailable() || !config.termTopicsOnAdd) {
            logger.debug('Term topics generation not enabled');
            return [];
        }

        logger.debug('Generating topics for term: %s', term);

        // Build rich prompt with source content if available
        let sourceContext = '';
        if (context.sourceContent) {
            sourceContext = `\n\nSource documentation:\n---\n${context.sourceContent}\n---\n`;
        }

        const prompt = `Generate related topic keywords for the term "${term}".

${context.expansion ? `This term is an abbreviation/acronym for: ${context.expansion}` : ''}

${sourceContext}

${context.contextText}

Generate keywords that:
- Describe technologies, concepts, or domains related to this term
- Are single words or hyphenated phrases
- Would help identify when this term is relevant to a conversation
- Include both specific and broader related concepts
- Aim for 8-15 keywords

Output ONLY a comma-separated list with no explanation, no quotes, no extra text.

Example for "Kubernetes": containers,orchestration,cloud-native,devops,docker,microservices,deployment,scaling,infrastructure,automation
Example for "OAuth": authentication,authorization,security,api,tokens,identity,access-control,sso`;

        try {
            const response = await OpenAI.createCompletion(
                [{ role: 'user', content: prompt }],
                { 
                    model: config.analysisModel,
                    reasoningLevel: 'low',
                }
            );

            const topics: string[] = response
                .split(',')
                .map((t: string) => t.trim().toLowerCase())
                .filter((t: string) => t.length > 0);

            const uniqueTopics = [...new Set(topics)];

            logger.debug('Generated %d topics', uniqueTopics.length);
            return uniqueTopics;

        } catch (error: any) {
            logger.error('Failed to generate topics: %s', error.message);
            return [];
        }
    };

    const suggestDomain = async (term: string, context: TermAnalysisContext): Promise<string | undefined> => {
        if (!isAvailable()) {
            logger.debug('Term domain suggestion not enabled');
            return context.suggestedDomain;
        }

        // If context already has a strong domain suggestion, use it
        if (context.suggestedDomain) {
            logger.debug('Using inferred domain: %s', context.suggestedDomain);
            return context.suggestedDomain;
        }

        logger.debug('Suggesting domain for term: %s', term);

        // Build rich prompt with source content if available
        let sourceContext = '';
        if (context.sourceContent) {
            sourceContext = `\n\nSource documentation:\n---\n${context.sourceContent}\n---\n`;
        }

        const prompt = `Suggest an appropriate domain/category for the term "${term}".

${context.expansion ? `This term is an abbreviation/acronym for: ${context.expansion}` : ''}

${sourceContext}

${context.contextText}

Choose ONE domain that best fits this term. Common domains include:
- devops
- engineering
- cloud
- database
- security
- business
- product
- finance
- testing
- infrastructure
- automation
- data-science
- frontend
- backend

Output ONLY the domain name (lowercase, hyphenated if needed) with no explanation or extra text.

Example for "Kubernetes": devops
Example for "React": frontend
Example for "PostgreSQL": database`;

        try {
            const response = await OpenAI.createCompletion(
                [{ role: 'user', content: prompt }],
                { 
                    model: config.analysisModel,
                    reasoningLevel: 'low',
                }
            );

            const domain = response.trim().toLowerCase();
            logger.debug('Suggested domain: %s', domain);
            return domain || undefined;

        } catch (error: any) {
            logger.error('Failed to suggest domain: %s', error.message);
            return undefined;
        }
    };

    const generateAll = async (term: string, context: TermAnalysisContext): Promise<TermSuggestions> => {
        if (!isAvailable()) {
            logger.debug('Smart assistance not available');
            return {
                soundsLike: [],
                topics: [],
            };
        }

        logger.debug('Generating all suggestions for term: %s', term);

        try {
            // Generate in parallel for efficiency
            const [soundsLike, description, topics, domain] = await Promise.all([
                config.termSoundsLikeOnAdd ? generateSoundsLike(term) : Promise.resolve([]),
                config.termDescriptionOnAdd ? generateDescription(term, context) : Promise.resolve(''),
                config.termTopicsOnAdd ? generateTopics(term, context) : Promise.resolve([]),
                suggestDomain(term, context),
            ]);

            return {
                soundsLike,
                description: description || undefined,
                topics,
                domain,
            };

        } catch (error: any) {
            logger.error('Failed to generate suggestions: %s', error.message);
            return {
                soundsLike: [],
                topics: [],
            };
        }
    };

    return {
        generateSoundsLike,
        generateDescription,
        generateTopics,
        suggestDomain,
        generateAll,
        isAvailable,
    };
};

/**
 * Helper for showing progress during async operations
 */
export const withProgress = async <T>(
    message: string,
    operation: () => Promise<T>,
    print: (text: string) => void
): Promise<T> => {
    print(`[${message}...]`);
    try {
        const result = await operation();
        return result;
    } finally {
        // Progress complete
    }
};
