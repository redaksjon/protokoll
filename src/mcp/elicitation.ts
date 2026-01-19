/**
 * MCP Elicitation Module
 * 
 * Enables the server to request additional information from users through the client.
 * Useful for interactive workflows where user confirmation or input is needed.
 * 
 * Two modes:
 * - form: Collect structured data with schema validation (NOT for sensitive data)
 * - url: Direct users to external URLs for sensitive operations (OAuth, API keys, etc.)
 */

import type {
    ElicitationFormRequest,
    ElicitationUrlRequest,
    ElicitationResponse,
    ElicitationSchema,
} from './types';

/**
 * Check if the client supports elicitation
 * This should be called during initialization to check client capabilities
 */
export function clientSupportsElicitation(clientCapabilities: unknown): {
    supported: boolean;
    formSupported: boolean;
    urlSupported: boolean;
} {
    const caps = clientCapabilities as Record<string, unknown> | undefined;
    const elicitation = caps?.elicitation as Record<string, unknown> | undefined;
    
    if (!elicitation) {
        return { supported: false, formSupported: false, urlSupported: false };
    }

    // Empty object means form mode only (backward compatibility)
    const hasForm = elicitation.form !== undefined || Object.keys(elicitation).length === 0;
    const hasUrl = elicitation.url !== undefined;

    return {
        supported: true,
        formSupported: hasForm,
        urlSupported: hasUrl,
    };
}

/**
 * Build a form elicitation request to collect structured data
 * 
 * IMPORTANT: Do NOT use form mode for sensitive data (passwords, API keys, etc.)
 * Use URL mode for sensitive operations.
 */
export function buildFormElicitation(
    message: string,
    schema: ElicitationSchema
): ElicitationFormRequest {
    return {
        mode: 'form',
        message,
        requestedSchema: schema,
    };
}

/**
 * Build a URL elicitation request for sensitive operations
 * 
 * Use this for:
 * - OAuth authorization flows
 * - API key entry
 * - Payment processing
 * - Any sensitive data collection
 */
export function buildUrlElicitation(
    message: string,
    url: string,
    elicitationId: string
): ElicitationUrlRequest {
    return {
        mode: 'url',
        message,
        url,
        elicitationId,
    };
}

/**
 * Helper to build common elicitation schemas
 */
export const ElicitationSchemas = {
    /**
     * Simple text input
     */
    textInput(name: string, options?: {
        title?: string;
        description?: string;
        required?: boolean;
        minLength?: number;
        maxLength?: number;
    }): ElicitationSchema {
        return {
            type: 'object',
            properties: {
                [name]: {
                    type: 'string',
                    title: options?.title || name,
                    description: options?.description,
                    minLength: options?.minLength,
                    maxLength: options?.maxLength,
                },
            },
            required: options?.required ? [name] : undefined,
        };
    },

    /**
     * Confirmation dialog (yes/no)
     */
    confirmation(message: string): ElicitationSchema {
        return {
            type: 'object',
            properties: {
                confirmed: {
                    type: 'boolean',
                    title: 'Confirm',
                    description: message,
                    default: false,
                },
            },
            required: ['confirmed'],
        };
    },

    /**
     * Selection from options
     */
    selection(name: string, options: string[], config?: {
        title?: string;
        description?: string;
        required?: boolean;
    }): ElicitationSchema {
        return {
            type: 'object',
            properties: {
                [name]: {
                    type: 'string',
                    title: config?.title || name,
                    description: config?.description,
                    enum: options,
                },
            },
            required: config?.required ? [name] : undefined,
        };
    },

    /**
     * Project selection for Protokoll
     */
    projectSelection(projects: Array<{ id: string; name: string }>): ElicitationSchema {
        return {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    title: 'Select Project',
                    description: 'Choose which project this transcript belongs to',
                    oneOf: projects.map(p => ({ const: p.id, title: p.name })),
                },
            },
            required: ['projectId'],
        };
    },
};

/**
 * Process elicitation response
 */
export function processElicitationResponse(response: ElicitationResponse): {
    accepted: boolean;
    declined: boolean;
    cancelled: boolean;
    data: Record<string, unknown> | null;
} {
    return {
        accepted: response.action === 'accept',
        declined: response.action === 'decline',
        cancelled: response.action === 'cancel',
        data: response.action === 'accept' ? response.content || null : null,
    };
}
