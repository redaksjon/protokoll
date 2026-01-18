/**
 * Project Assist
 * 
 * LLM-assisted project metadata generation for smart project creation.
 * 
 * Two distinct generation functions:
 * - generateSoundsLike(): Phonetic variants of project NAME (for transcription correction)
 * - generateTriggerPhrases(): Content-matching phrases (for classification/routing)
 */

import { getLogger } from '../logging';
import * as OpenAI from '../util/openai';
import { SmartAssistanceConfig } from '../context/types';
import * as ContentFetcher from './content-fetcher';

export interface ProjectSuggestions {
    name?: string;
    soundsLike: string[];      // Phonetic variants of project name
    triggerPhrases: string[];  // Content-matching phrases
    topics?: string[];
    description?: string;
}

export interface ProjectAssistInstance {
    generateSoundsLike(name: string): Promise<string[]>;
    generateTriggerPhrases(name: string): Promise<string[]>;
    analyzeSource(source: string, existingName?: string): Promise<ProjectSuggestions>;
    isAvailable(): boolean;
}

interface ContentAnalysisResponse {
    name: string | null;
    topics: string[];
    description: string;
}

export const create = (config: SmartAssistanceConfig): ProjectAssistInstance => {
    const logger = getLogger();
    const fetcher = ContentFetcher.create();
    
    const isAvailable = (): boolean => {
        return !!process.env.OPENAI_API_KEY && config.enabled;
    };

    const generateSoundsLike = async (name: string): Promise<string[]> => {
        if (!isAvailable()) {
            logger.debug('Smart assistance not available, skipping sounds_like generation');
            return [];
        }

        logger.debug('Generating phonetic variants (sounds_like) for: %s', name);

        const prompt = `The project name "${name}" will be spoken in audio recordings and transcribed by Whisper speech-to-text.

Generate phonetic variations that Whisper might produce when mishearing this project name. Include:
- Common phonetic mishearings
- How the name sounds in different accents
- Alternate spellings a speech-to-text system might produce
- Common transcription errors (dropped letters, substitutions)
- Phonetically similar words

This is for correcting the PROJECT NAME when it's misheard, NOT for matching content.

Output ONLY a comma-separated list with no explanation, no quotes, no extra text.
Do NOT include the original name in the list.

Example for "Protokoll": protocol,pro to call,proto call,proto col,protocolle
Example for "Kubernetes": cube a net ease,coober nettys,cube er netes,k8s
Example for "Grunnverk": ground work,grundverk,grunnwerk,grunverk,groon verk`;

        try {
            const response = await OpenAI.createCompletion(
                [{ role: 'user', content: prompt }],
                { 
                    model: config.phoneticModel,
                    reasoningLevel: 'low',
                    maxTokens: 4000,
                    reason: `phonetic variants for "${name}"`,
                }
            );

            // Parse comma-separated response
            const variants: string[] = response
                .split(',')
                .map((p: string) => p.trim().toLowerCase())
                .filter((p: string) => p.length > 0 && p.toLowerCase() !== name.toLowerCase());

            // Remove duplicates
            const uniqueVariants: string[] = [...new Set(variants)];

            logger.debug('Generated %d phonetic variants', uniqueVariants.length);
            return uniqueVariants;

        } catch (error: any) {
            logger.error('Failed to generate phonetic variants: %s', error.message);
            return [];
        }
    };

    const generateTriggerPhrases = async (name: string): Promise<string[]> => {
        if (!isAvailable()) {
            logger.debug('Smart assistance not available, skipping trigger phrase generation');
            return [];
        }

        logger.debug('Generating trigger phrases (content matching) for: %s', name);

        const prompt = `Generate trigger phrases for a project named "${name}".

Trigger phrases are used to identify when audio content is ABOUT this project. These are phrases someone might say that indicate they're discussing this project.

Generate phrases that would appear in conversation about this project:
- "working on ${name.toLowerCase()}"
- "${name.toLowerCase()} meeting"
- "${name.toLowerCase()} project"
- Other contextual phrases that indicate the content is about this project

Do NOT include phonetic variations of the name - those go in a separate field.
Focus on CONTEXTUAL phrases that indicate content belongs to this project.

Output ONLY a comma-separated list with no explanation, no quotes, no extra text.
Include the project name in lowercase as the first item.

Example for "Protokoll": protokoll,working on protokoll,protokoll project,protokoll meeting,discussing protokoll
Example for "Quarterly Planning": quarterly planning,quarterly planning meeting,q1 planning,roadmap review`;

        try {
            const response = await OpenAI.createCompletion(
                [{ role: 'user', content: prompt }],
                { 
                    model: config.analysisModel,
                    reasoningLevel: 'low',
                    maxTokens: 4000,
                    reason: `trigger phrases for "${name}"`,
                }
            );

            // Parse comma-separated response
            const phrases: string[] = response
                .split(',')
                .map((p: string) => p.trim().toLowerCase())
                .filter((p: string) => p.length > 0);

            // Ensure original name is included as first item
            if (!phrases.includes(name.toLowerCase())) {
                phrases.unshift(name.toLowerCase());
            }

            // Remove duplicates
            const uniquePhrases: string[] = [...new Set(phrases)];

            logger.debug('Generated %d trigger phrases', uniquePhrases.length);
            return uniquePhrases;

        } catch (error: any) {
            logger.error('Failed to generate trigger phrases: %s', error.message);
            // Return just the original name as fallback
            return [name.toLowerCase()];
        }
    };

    const analyzeSource = async (source: string, existingName?: string): Promise<ProjectSuggestions> => {
        if (!isAvailable()) {
            logger.debug('Smart assistance not available, skipping content analysis');
            return { soundsLike: [], triggerPhrases: [] };
        }

        // Fetch content from source (file path, URL, or directory)
        logger.debug('Fetching content from source: %s', source);
        const fetchResult = await fetcher.fetch(source);
        
        if (!fetchResult.success || !fetchResult.content) {
            logger.error('Failed to fetch content: %s', fetchResult.error);
            return { soundsLike: [], triggerPhrases: [] };
        }

        const content = fetchResult.content;
        logger.info('Fetched %d chars from %s', content.length, fetchResult.sourceName);
        logger.debug('Analyzing content with AI...');

        const nameInstruction = existingName 
            ? `The project name is already known: "${existingName}". Set "name" to null in your response.`
            : `Extract or suggest a concise project name from the content. If the name is not obvious, suggest one based on the project's purpose.`;

        const prompt = `Analyze this project documentation and extract structured information.

${nameInstruction}

Extract the following:
1. **topics**: A list of single-word or hyphenated keywords that describe what this project is about. Focus on technologies, concepts, and domains. Aim for 10-25 relevant keywords.
2. **description**: A single paragraph (3-5 sentences) that provides context about what this project does, its purpose, and main features.

Documentation content:
---
${content}
---

Respond ONLY with valid JSON in this exact format:
{
  "name": "ProjectName or null",
  "topics": ["keyword1", "keyword2", "keyword3"],
  "description": "A concise paragraph describing the project..."
}`;

        try {
            const response = await OpenAI.createCompletion(
                [{ role: 'user', content: prompt }],
                { 
                    model: config.analysisModel,
                    reasoningLevel: 'low',
                    maxTokens: 3000,
                    reason: 'content analysis',
                }
            );

            // Parse JSON response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsed: ContentAnalysisResponse = JSON.parse(jsonMatch[0]);

            // Generate both sounds_like AND trigger phrases for the name
            const projectName = existingName || parsed.name || undefined;
            let soundsLike: string[] = [];
            let triggerPhrases: string[] = [];
            
            if (projectName) {
                // Generate in parallel for efficiency
                logger.debug('Generating phonetic and trigger phrases for: %s', projectName);
                [soundsLike, triggerPhrases] = await Promise.all([
                    generateSoundsLike(projectName),
                    generateTriggerPhrases(projectName),
                ]);
            }

            return {
                name: parsed.name || undefined,
                topics: parsed.topics || [],
                description: parsed.description || undefined,
                soundsLike,
                triggerPhrases,
            };

        } catch (error: any) {
            logger.error('Failed to analyze content: %s', error.message);
            
            // Return partial result with sounds_like and trigger phrases if we have a name
            if (existingName) {
                logger.debug('Generating phonetic and trigger phrases for existing name: %s', existingName);
                const [soundsLike, triggerPhrases] = await Promise.all([
                    generateSoundsLike(existingName),
                    generateTriggerPhrases(existingName),
                ]);
                return { soundsLike, triggerPhrases };
            }
            
            return { soundsLike: [], triggerPhrases: [] };
        }
    };

    return {
        generateSoundsLike,
        generateTriggerPhrases,
        analyzeSource,
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
        // Clear the progress message line (optional)
    }
};
