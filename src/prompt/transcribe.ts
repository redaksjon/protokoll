import { Builder, Chat, Prompt } from "@riotprompt/riotprompt";
import { DEFAULT_INSTRUCTIONS_TRANSCRIBE_FILE, DEFAULT_PERSONA_TRANSCRIBER_FILE } from '@/constants';
import { Config } from '@/protokoll';
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getLogger } from "@/logging";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates a prompt for the transcription formatting task.
 * 
 * NOTE: Context is NOT loaded into the prompt. Instead, the agentic executor
 * provides tools for the model to query context on-demand. This is the 
 * agentic approach - the model investigates what it needs rather than
 * receiving everything upfront.
 */
export const createTranscribePrompt = async (
    transcriptionText: string,
    config: Config
): Promise<Prompt> => {
    const logger = getLogger();
    let builder: Builder.Instance = Builder.create({ logger, basePath: __dirname, overridePaths: [config.configDirectory], overrides: config.overrides });
    builder = await builder.addPersonaPath(DEFAULT_PERSONA_TRANSCRIBER_FILE);
    builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_TRANSCRIBE_FILE);
    builder = await builder.addContent(transcriptionText);
    // Context is NOT loaded here - it's queried via tools in agentic mode
    // This prevents sending huge context payloads with every request

    const prompt = await builder.build();
    return prompt;
};

/**
 * Factory interface for transcribe prompts
 */
export interface Factory {
    createTranscribePrompt: (transcriptionText: string) => Promise<Prompt>;
}

/**
 * Create a factory for transcribe prompts
 */
export const create = (model: Chat.Model, config: Config): Factory => {
    return {
        createTranscribePrompt: async (transcriptionText: string): Promise<Prompt> => {
            return createTranscribePrompt(transcriptionText, config);
        }
    };
}; 