#!/usr/bin/env node
/**
 * Protokoll MCP Server
 *
 * Exposes intelligent audio transcription as MCP tools for AI coding assistants.
 * Allows AI tools to process audio, manage context, and work with transcripts
 * without needing to understand command-line interfaces.
 *
 * Key capabilities:
 * - Process audio files with context-aware transcription
 * - Manage context entities (people, projects, terms, companies)
 * - Edit and combine existing transcripts
 * - Provide feedback to improve transcription quality
 */

import 'dotenv/config';
// eslint-disable-next-line import/extensions
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// eslint-disable-next-line import/extensions
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
// eslint-disable-next-line import/extensions
} from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import * as Resources from './resources';
import * as Prompts from './prompts';
import { tools, handleToolCall } from './tools';

// ============================================================================
// Server Setup
// ============================================================================

async function main() {
    const server = new Server(
        {
            name: 'protokoll',
            version: '0.1.0',
            description:
                'Intelligent audio transcription with context-aware enhancement. ' +
                'Process audio files through a pipeline that transcribes with Whisper, ' +
                'then enhances using LLMs with knowledge of your people, projects, and terminology. ' +
                'Manage context entities (people, projects, terms) to improve recognition. ' +
                'Edit and combine existing transcripts.',
        },
        {
            capabilities: {
                tools: {},
                resources: {
                    subscribe: false,
                    listChanged: true,
                },
                prompts: {
                    listChanged: false,
                },
            },
        }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools,
    }));

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            const result = await handleToolCall(name, args);
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Error: ${message}` }],
                isError: true,
            };
        }
    });

    // List available resources
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return Resources.handleListResources();
    });

    // Read a resource
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;

        try {
            const contents = await Resources.handleReadResource(uri);
            return { contents: [contents] };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to read resource ${uri}: ${message}`);
        }
    });

    // List available prompts
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
        return { prompts: Prompts.getPrompts() };
    });

    // Get a prompt with arguments
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            const messages = await Prompts.getPrompt(name, args || {});
            return { messages };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get prompt ${name}: ${message}`);
        }
    });

    // Start server
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Keep the process alive - MCP servers should run indefinitely
    // The StdioServerTransport will handle stdin/stdout until the connection closes
    await new Promise(() => {
        // This promise never resolves, keeping the event loop alive
        // The process will only exit when killed or stdin closes
    });
}

// ES module equivalent of CommonJS `require.main === module`
// Use resolve() to normalize both paths before comparison to handle
// relative paths, symlinks, and path resolution differences
const isMainModule = import.meta.url.startsWith('file:') &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
    main().catch((error) => {
        // eslint-disable-next-line no-console
        console.error(error);
        process.exit(1);
    });
}

// ============================================================================
// Exports for Testing
// ============================================================================

export { main };
