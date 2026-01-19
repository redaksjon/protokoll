/**
 * Tests for MCP Elicitation Module
 */

import { describe, it, expect } from 'vitest';
import * as Elicitation from '../../src/mcp/elicitation';
import type { ElicitationResponse } from '../../src/mcp/types';

describe('MCP Elicitation', () => {
    describe('clientSupportsElicitation', () => {
        it('should return true when client supports elicitation', () => {
            const capabilities = {
                elicitation: {
                    form: true,
                    url: true,
                },
            };

            const result = Elicitation.clientSupportsElicitation(capabilities);

            expect(result.supported).toBe(true);
            expect(result.formSupported).toBe(true);
            expect(result.urlSupported).toBe(true);
        });

        it('should return false when client does not support elicitation', () => {
            const capabilities = {};

            const result = Elicitation.clientSupportsElicitation(capabilities);

            expect(result.supported).toBe(false);
            expect(result.formSupported).toBe(false);
            expect(result.urlSupported).toBe(false);
        });

        it('should support form mode only', () => {
            const capabilities = {
                elicitation: {
                    form: true,
                },
            };

            const result = Elicitation.clientSupportsElicitation(capabilities);

            expect(result.supported).toBe(true);
            expect(result.formSupported).toBe(true);
            expect(result.urlSupported).toBe(false);
        });

        it('should support url mode only', () => {
            const capabilities = {
                elicitation: {
                    url: true,
                },
            };

            const result = Elicitation.clientSupportsElicitation(capabilities);

            expect(result.supported).toBe(true);
            expect(result.formSupported).toBe(false);
            expect(result.urlSupported).toBe(true);
        });

        it('should handle empty elicitation object (backward compatibility)', () => {
            const capabilities = {
                elicitation: {},
            };

            const result = Elicitation.clientSupportsElicitation(capabilities);

            expect(result.supported).toBe(true);
            expect(result.formSupported).toBe(true);
            expect(result.urlSupported).toBe(false);
        });

        it('should handle undefined capabilities', () => {
            const result = Elicitation.clientSupportsElicitation(undefined);

            expect(result.supported).toBe(false);
            expect(result.formSupported).toBe(false);
            expect(result.urlSupported).toBe(false);
        });

        it('should handle null capabilities', () => {
            const result = Elicitation.clientSupportsElicitation(null);

            expect(result.supported).toBe(false);
            expect(result.formSupported).toBe(false);
            expect(result.urlSupported).toBe(false);
        });

        it('should handle capabilities with elicitation undefined', () => {
            const capabilities = {
                elicitation: undefined,
            };

            const result = Elicitation.clientSupportsElicitation(capabilities);

            expect(result.supported).toBe(false);
        });
    });

    describe('buildFormElicitation', () => {
        it('should build a form elicitation request', () => {
            const schema = {
                type: 'object' as const,
                properties: {
                    name: { type: 'string' },
                },
            };

            const request = Elicitation.buildFormElicitation('Enter your name', schema);

            expect(request.mode).toBe('form');
            expect(request.message).toBe('Enter your name');
            expect(request.requestedSchema).toEqual(schema);
        });

        it('should preserve schema structure', () => {
            const schema = {
                type: 'object' as const,
                properties: {
                    field1: { type: 'string', minLength: 1 },
                    field2: { type: 'number', minimum: 0 },
                },
                required: ['field1'],
            };

            const request = Elicitation.buildFormElicitation('Fill form', schema);

            expect(request.requestedSchema).toEqual(schema);
        });

        it('should allow empty messages', () => {
            const schema = { type: 'object' as const, properties: {} };

            const request = Elicitation.buildFormElicitation('', schema);

            expect(request.message).toBe('');
        });

        it('should allow complex schemas', () => {
            const schema = {
                type: 'object' as const,
                properties: {
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                value: { type: 'number' },
                            },
                        },
                    },
                },
            };

            const request = Elicitation.buildFormElicitation('Complex form', schema);

            expect(request.requestedSchema).toEqual(schema);
        });
    });

    describe('buildUrlElicitation', () => {
        it('should build a URL elicitation request', () => {
            const request = Elicitation.buildUrlElicitation(
                'Authorize access',
                'https://oauth.example.com/authorize',
                'elicit-123'
            );

            expect(request.mode).toBe('url');
            expect(request.message).toBe('Authorize access');
            expect(request.url).toBe('https://oauth.example.com/authorize');
            expect(request.elicitationId).toBe('elicit-123');
        });

        it('should preserve all URL parameters', () => {
            const url = 'https://example.com/auth?client_id=123&redirect_uri=http://localhost';
            const request = Elicitation.buildUrlElicitation('Auth', url, 'auth-001');

            expect(request.url).toBe(url);
        });

        it('should allow any message', () => {
            const message = 'Multi\nline\nmessage';
            const request = Elicitation.buildUrlElicitation(message, 'https://example.com', 'id');

            expect(request.message).toBe(message);
        });

        it('should allow special characters in IDs', () => {
            const id = 'elicit-123-abc_DEF';
            const request = Elicitation.buildUrlElicitation('Message', 'https://example.com', id);

            expect(request.elicitationId).toBe(id);
        });
    });

    describe('ElicitationSchemas.textInput', () => {
        it('should create a text input schema', () => {
            const schema = Elicitation.ElicitationSchemas.textInput('username');

            expect(schema.type).toBe('object');
            expect(schema.properties?.username).toBeDefined();
            expect(schema.properties?.username.type).toBe('string');
        });

        it('should set title from name if not provided', () => {
            const schema = Elicitation.ElicitationSchemas.textInput('email');

            expect(schema.properties?.email.title).toBe('email');
        });

        it('should use custom title when provided', () => {
            const schema = Elicitation.ElicitationSchemas.textInput('username', {
                title: 'Enter Username',
            });

            expect(schema.properties?.username.title).toBe('Enter Username');
        });

        it('should include description when provided', () => {
            const schema = Elicitation.ElicitationSchemas.textInput('password', {
                description: 'Enter a secure password',
            });

            expect(schema.properties?.password.description).toBe('Enter a secure password');
        });

        it('should mark as required when specified', () => {
            const schema = Elicitation.ElicitationSchemas.textInput('email', { required: true });

            expect(schema.required).toContain('email');
        });

        it('should not mark as required by default', () => {
            const schema = Elicitation.ElicitationSchemas.textInput('optional');

            expect(schema.required).toBeUndefined();
        });

        it('should set length constraints', () => {
            const schema = Elicitation.ElicitationSchemas.textInput('pin', {
                minLength: 4,
                maxLength: 6,
            });

            expect(schema.properties?.pin.minLength).toBe(4);
            expect(schema.properties?.pin.maxLength).toBe(6);
        });
    });

    describe('ElicitationSchemas.confirmation', () => {
        it('should create a confirmation schema', () => {
            const schema = Elicitation.ElicitationSchemas.confirmation('Are you sure?');

            expect(schema.type).toBe('object');
            expect(schema.properties?.confirmed).toBeDefined();
            expect(schema.properties?.confirmed.type).toBe('boolean');
        });

        it('should set default to false', () => {
            const schema = Elicitation.ElicitationSchemas.confirmation('Proceed?');

            expect(schema.properties?.confirmed.default).toBe(false);
        });

        it('should use message as description', () => {
            const message = 'Delete all data?';
            const schema = Elicitation.ElicitationSchemas.confirmation(message);

            expect(schema.properties?.confirmed.description).toBe(message);
        });

        it('should mark confirmed as required', () => {
            const schema = Elicitation.ElicitationSchemas.confirmation('Confirm?');

            expect(schema.required).toContain('confirmed');
        });

        it('should set title to Confirm', () => {
            const schema = Elicitation.ElicitationSchemas.confirmation('Any message');

            expect(schema.properties?.confirmed.title).toBe('Confirm');
        });
    });

    describe('ElicitationSchemas.selection', () => {
        it('should create a selection schema', () => {
            const schema = Elicitation.ElicitationSchemas.selection('color', ['red', 'blue', 'green']);

            expect(schema.type).toBe('object');
            expect(schema.properties?.color).toBeDefined();
            expect(schema.properties?.color.type).toBe('string');
        });

        it('should include enum options', () => {
            const options = ['option1', 'option2', 'option3'];
            const schema = Elicitation.ElicitationSchemas.selection('choice', options);

            expect(schema.properties?.choice.enum).toEqual(options);
        });

        it('should set title from name if not provided', () => {
            const schema = Elicitation.ElicitationSchemas.selection('environment', ['dev', 'prod']);

            expect(schema.properties?.environment.title).toBe('environment');
        });

        it('should use custom title when provided', () => {
            const schema = Elicitation.ElicitationSchemas.selection('env', ['dev', 'prod'], {
                title: 'Select Environment',
            });

            expect(schema.properties?.env.title).toBe('Select Environment');
        });

        it('should include description when provided', () => {
            const schema = Elicitation.ElicitationSchemas.selection('level', ['low', 'med', 'high'], {
                description: 'Priority level',
            });

            expect(schema.properties?.level.description).toBe('Priority level');
        });

        it('should mark as required when specified', () => {
            const schema = Elicitation.ElicitationSchemas.selection('type', ['a', 'b'], { required: true });

            expect(schema.required).toContain('type');
        });

        it('should not mark as required by default', () => {
            const schema = Elicitation.ElicitationSchemas.selection('opt', ['x', 'y']);

            expect(schema.required).toBeUndefined();
        });

        it('should handle empty options array', () => {
            const schema = Elicitation.ElicitationSchemas.selection('empty', []);

            expect(schema.properties?.empty.enum).toEqual([]);
        });

        it('should handle single option', () => {
            const schema = Elicitation.ElicitationSchemas.selection('single', ['only']);

            expect(schema.properties?.single.enum).toEqual(['only']);
        });
    });

    describe('ElicitationSchemas.projectSelection', () => {
        it('should create a project selection schema', () => {
            const projects = [
                { id: 'proj1', name: 'Project 1' },
                { id: 'proj2', name: 'Project 2' },
            ];

            const schema = Elicitation.ElicitationSchemas.projectSelection(projects);

            expect(schema.type).toBe('object');
            expect(schema.properties?.projectId).toBeDefined();
        });

        it('should include all projects as options', () => {
            const projects = [
                { id: 'p1', name: 'Alpha' },
                { id: 'p2', name: 'Beta' },
                { id: 'p3', name: 'Gamma' },
            ];

            const schema = Elicitation.ElicitationSchemas.projectSelection(projects);

            expect(schema.properties?.projectId.oneOf).toHaveLength(3);
        });

        it('should map project IDs to const values', () => {
            const projects = [
                { id: 'id-1', name: 'Name 1' },
                { id: 'id-2', name: 'Name 2' },
            ];

            const schema = Elicitation.ElicitationSchemas.projectSelection(projects);
            const oneOf = schema.properties?.projectId.oneOf;

            expect(oneOf?.[0]?.const).toBe('id-1');
            expect(oneOf?.[1]?.const).toBe('id-2');
        });

        it('should map project names to titles', () => {
            const projects = [{ id: 'proj', name: 'My Project' }];

            const schema = Elicitation.ElicitationSchemas.projectSelection(projects);
            const oneOf = schema.properties?.projectId.oneOf;

            expect(oneOf?.[0]?.title).toBe('My Project');
        });

        it('should set title to Select Project', () => {
            const schema = Elicitation.ElicitationSchemas.projectSelection([]);

            expect(schema.properties?.projectId.title).toBe('Select Project');
        });

        it('should set description', () => {
            const schema = Elicitation.ElicitationSchemas.projectSelection([]);

            expect(schema.properties?.projectId.description).toBe('Choose which project this transcript belongs to');
        });

        it('should mark projectId as required', () => {
            const schema = Elicitation.ElicitationSchemas.projectSelection([]);

            expect(schema.required).toContain('projectId');
        });

        it('should handle empty project list', () => {
            const schema = Elicitation.ElicitationSchemas.projectSelection([]);

            expect(schema.properties?.projectId.oneOf).toEqual([]);
        });

        it('should handle single project', () => {
            const projects = [{ id: 'single', name: 'Only One' }];

            const schema = Elicitation.ElicitationSchemas.projectSelection(projects);

            expect(schema.properties?.projectId.oneOf).toHaveLength(1);
        });
    });

    describe('processElicitationResponse', () => {
        it('should process accepted response', () => {
            const response: ElicitationResponse = {
                action: 'accept',
                content: { field: 'value' },
            };

            const result = Elicitation.processElicitationResponse(response);

            expect(result.accepted).toBe(true);
            expect(result.declined).toBe(false);
            expect(result.cancelled).toBe(false);
            expect(result.data).toEqual({ field: 'value' });
        });

        it('should process declined response', () => {
            const response: ElicitationResponse = {
                action: 'decline',
            };

            const result = Elicitation.processElicitationResponse(response);

            expect(result.accepted).toBe(false);
            expect(result.declined).toBe(true);
            expect(result.cancelled).toBe(false);
            expect(result.data).toBeNull();
        });

        it('should process cancelled response', () => {
            const response: ElicitationResponse = {
                action: 'cancel',
            };

            const result = Elicitation.processElicitationResponse(response);

            expect(result.accepted).toBe(false);
            expect(result.declined).toBe(false);
            expect(result.cancelled).toBe(true);
            expect(result.data).toBeNull();
        });

        it('should return null data for declined response', () => {
            const response: ElicitationResponse = {
                action: 'decline',
                content: { field: 'value' },
            };

            const result = Elicitation.processElicitationResponse(response);

            expect(result.declined).toBe(true);
            expect(result.data).toBeNull();
        });

        it('should return null data for cancelled response', () => {
            const response: ElicitationResponse = {
                action: 'cancel',
                content: { field: 'value' },
            };

            const result = Elicitation.processElicitationResponse(response);

            expect(result.cancelled).toBe(true);
            expect(result.data).toBeNull();
        });

        it('should handle missing content in accepted response', () => {
            const response: ElicitationResponse = {
                action: 'accept',
            };

            const result = Elicitation.processElicitationResponse(response);

            expect(result.accepted).toBe(true);
            expect(result.data).toBeNull();
        });

        it('should preserve complex data structures', () => {
            const complexData = {
                nested: {
                    field: 'value',
                    array: [1, 2, 3],
                },
                boolean: true,
                number: 42,
            };

            const response: ElicitationResponse = {
                action: 'accept',
                content: complexData,
            };

            const result = Elicitation.processElicitationResponse(response);

            expect(result.data).toEqual(complexData);
        });
    });

    describe('integration scenarios', () => {
        it('should support typical form workflow', () => {
            // Check capability
            const caps = Elicitation.clientSupportsElicitation({ elicitation: { form: true } });
            expect(caps.formSupported).toBe(true);

            // Build form request
            const schema = Elicitation.ElicitationSchemas.textInput('name', { required: true });
            const request = Elicitation.buildFormElicitation('What is your name?', schema);
            expect(request.mode).toBe('form');

            // Process response
            const response: ElicitationResponse = {
                action: 'accept',
                content: { name: 'John' },
            };
            const result = Elicitation.processElicitationResponse(response);
            expect(result.accepted).toBe(true);
            expect(result.data?.name).toBe('John');
        });

        it('should support URL elicitation workflow', () => {
            // Check capability
            const caps = Elicitation.clientSupportsElicitation({ elicitation: { url: true } });
            expect(caps.urlSupported).toBe(true);

            // Build URL request
            const request = Elicitation.buildUrlElicitation(
                'Please authorize',
                'https://oauth.example.com',
                'auth-123'
            );
            expect(request.mode).toBe('url');

            // Process response
            const response: ElicitationResponse = { action: 'accept' };
            const result = Elicitation.processElicitationResponse(response);
            expect(result.accepted).toBe(true);
        });

        it('should support project selection workflow', () => {
            const projects = [
                { id: 'p1', name: 'Project A' },
                { id: 'p2', name: 'Project B' },
            ];

            const schema = Elicitation.ElicitationSchemas.projectSelection(projects);
            const request = Elicitation.buildFormElicitation('Select a project', schema);
            expect(request.mode).toBe('form');

            const response: ElicitationResponse = {
                action: 'accept',
                content: { projectId: 'p1' },
            };
            const result = Elicitation.processElicitationResponse(response);
            expect(result.data?.projectId).toBe('p1');
        });
    });
});
