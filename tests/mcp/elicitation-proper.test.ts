/**
 * Tests for Elicitation module
 */

import { describe, it, expect } from 'vitest';
import * as Elicitation from '../../src/mcp/elicitation';

describe('elicitation', () => {
    describe('clientSupportsElicitation', () => {
        it('should return false for no elicitation support', () => {
            const result = Elicitation.clientSupportsElicitation({});
            expect(result.supported).toBe(false);
            expect(result.formSupported).toBe(false);
            expect(result.urlSupported).toBe(false);
        });

        it('should detect form support', () => {
            const result = Elicitation.clientSupportsElicitation({
                elicitation: { form: {} }
            });
            expect(result.supported).toBe(true);
            expect(result.formSupported).toBe(true);
            expect(result.urlSupported).toBe(false);
        });

        it('should detect url support', () => {
            const result = Elicitation.clientSupportsElicitation({
                elicitation: { url: {} }
            });
            expect(result.supported).toBe(true);
            expect(result.formSupported).toBe(false);
            expect(result.urlSupported).toBe(true);
        });

        it('should detect both form and url support', () => {
            const result = Elicitation.clientSupportsElicitation({
                elicitation: { form: {}, url: {} }
            });
            expect(result.supported).toBe(true);
            expect(result.formSupported).toBe(true);
            expect(result.urlSupported).toBe(true);
        });

        it('should treat empty elicitation object as form support', () => {
            const result = Elicitation.clientSupportsElicitation({
                elicitation: {}
            });
            expect(result.supported).toBe(true);
            expect(result.formSupported).toBe(true);
        });

        it('should handle undefined capabilities', () => {
            const result = Elicitation.clientSupportsElicitation(undefined);
            expect(result.supported).toBe(false);
        });

        it('should handle null capabilities', () => {
            const result = Elicitation.clientSupportsElicitation(null);
            expect(result.supported).toBe(false);
        });
    });

    describe('buildFormElicitation', () => {
        it('should build form request with message and schema', () => {
            const schema = {
                type: 'object' as const,
                properties: {
                    name: { type: 'string' as const }
                },
                required: ['name']
            };
            
            const request = Elicitation.buildFormElicitation('Enter your name', schema);
            
            expect(request).toBeDefined();
            expect(request.mode).toBe('form');
            expect(request.message).toBe('Enter your name');
            expect(request.requestedSchema).toEqual(schema);
        });

        it('should handle complex schema', () => {
            const schema = {
                type: 'object' as const,
                properties: {
                    name: { type: 'string' as const },
                    age: { type: 'number' as const },
                    email: { type: 'string' as const }
                },
                required: ['name', 'email']
            };
            
            const request = Elicitation.buildFormElicitation('Enter details', schema);
            
            expect(request.requestedSchema).toEqual(schema);
        });
    });

    describe('buildUrlElicitation', () => {
        it('should build url request', () => {
            const request = Elicitation.buildUrlElicitation(
                'Complete authentication',
                'https://example.com/auth',
                'auth-123'
            );
            
            expect(request).toBeDefined();
            expect(request.mode).toBe('url');
            expect(request.message).toBe('Complete authentication');
            expect(request.url).toBe('https://example.com/auth');
            expect(request.elicitationId).toBe('auth-123');
        });

        it('should handle different URLs', () => {
            const request = Elicitation.buildUrlElicitation(
                'Setup API key',
                'https://api.example.com/keys',
                'api-key-setup'
            );
            
            expect(request.url).toBe('https://api.example.com/keys');
            expect(request.elicitationId).toBe('api-key-setup');
        });
    });

    describe('ElicitationSchemas', () => {
        describe('textInput', () => {
            it('should create text input schema', () => {
                const schema = Elicitation.ElicitationSchemas.textInput('username');
                
                expect(schema).toBeDefined();
                expect(schema.type).toBe('object');
                expect(schema.properties).toHaveProperty('username');
                expect(schema.properties.username.type).toBe('string');
            });

            it('should handle options', () => {
                const schema = Elicitation.ElicitationSchemas.textInput('username', {
                    title: 'Username',
                    description: 'Enter your username',
                    required: true,
                    minLength: 3,
                    maxLength: 20
                });
                
                expect(schema.properties.username.title).toBe('Username');
                expect(schema.properties.username.description).toBe('Enter your username');
                expect(schema.properties.username.minLength).toBe(3);
                expect(schema.properties.username.maxLength).toBe(20);
                expect(schema.required).toEqual(['username']);
            });

            it('should make field optional by default', () => {
                const schema = Elicitation.ElicitationSchemas.textInput('nickname');
                
                expect(schema.required).toBeUndefined();
            });
        });

        describe('confirmation', () => {
            it('should create confirmation schema', () => {
                const schema = Elicitation.ElicitationSchemas.confirmation('Are you sure?');
                
                expect(schema).toBeDefined();
                expect(schema.type).toBe('object');
                expect(schema.properties).toHaveProperty('confirmed');
                expect(schema.properties.confirmed.type).toBe('boolean');
                expect(schema.properties.confirmed.description).toBe('Are you sure?');
                expect(schema.properties.confirmed.default).toBe(false);
                expect(schema.required).toEqual(['confirmed']);
            });
        });

        describe('selection', () => {
            it('should create selection schema', () => {
                const options = ['option1', 'option2', 'option3'];
                const schema = Elicitation.ElicitationSchemas.selection('choice', options);
                
                expect(schema).toBeDefined();
                expect(schema.type).toBe('object');
                expect(schema.properties).toHaveProperty('choice');
                expect(schema.properties.choice.type).toBe('string');
                expect(schema.properties.choice.enum).toEqual(options);
            });

            it('should handle config options', () => {
                const schema = Elicitation.ElicitationSchemas.selection('status', ['active', 'inactive'], {
                    title: 'Status',
                    description: 'Select status',
                    required: true
                });
                
                expect(schema.properties.status.title).toBe('Status');
                expect(schema.properties.status.description).toBe('Select status');
                expect(schema.required).toEqual(['status']);
            });

            it('should make selection optional by default', () => {
                const schema = Elicitation.ElicitationSchemas.selection('optional', ['a', 'b']);
                
                expect(schema.required).toBeUndefined();
            });
        });

        describe('projectSelection', () => {
            it('should create project selection schema', () => {
                const projects = [
                    { id: 'proj1', name: 'Project 1' },
                    { id: 'proj2', name: 'Project 2' }
                ];
                
                const schema = Elicitation.ElicitationSchemas.projectSelection(projects);
                
                expect(schema).toBeDefined();
                expect(schema.type).toBe('object');
                expect(schema.properties).toHaveProperty('projectId');
                expect(schema.properties.projectId.type).toBe('string');
                expect(schema.properties.projectId.title).toBe('Select Project');
                expect(schema.required).toEqual(['projectId']);
            });

            it('should map projects to oneOf options', () => {
                const projects = [
                    { id: 'proj1', name: 'Project 1' },
                    { id: 'proj2', name: 'Project 2' }
                ];
                
                const schema = Elicitation.ElicitationSchemas.projectSelection(projects);
                
                expect(schema.properties.projectId.oneOf).toBeDefined();
                expect(schema.properties.projectId.oneOf).toHaveLength(2);
                expect(schema.properties.projectId.oneOf[0]).toEqual({ const: 'proj1', title: 'Project 1' });
                expect(schema.properties.projectId.oneOf[1]).toEqual({ const: 'proj2', title: 'Project 2' });
            });

            it('should handle empty projects list', () => {
                const schema = Elicitation.ElicitationSchemas.projectSelection([]);
                
                expect(schema.properties.projectId.oneOf).toEqual([]);
            });
        });
    });

    describe('processElicitationResponse', () => {
        it('should process accept response', () => {
            const response: any = {
                action: 'accept',
                content: { name: 'John' }
            };
            
            const result = Elicitation.processElicitationResponse(response);
            
            expect(result.accepted).toBe(true);
            expect(result.declined).toBe(false);
            expect(result.cancelled).toBe(false);
            expect(result.data).toEqual({ name: 'John' });
        });

        it('should process decline response', () => {
            const response: any = {
                action: 'decline'
            };
            
            const result = Elicitation.processElicitationResponse(response);
            
            expect(result.accepted).toBe(false);
            expect(result.declined).toBe(true);
            expect(result.cancelled).toBe(false);
            expect(result.data).toBeNull();
        });

        it('should process cancel response', () => {
            const response: any = {
                action: 'cancel'
            };
            
            const result = Elicitation.processElicitationResponse(response);
            
            expect(result.accepted).toBe(false);
            expect(result.declined).toBe(false);
            expect(result.cancelled).toBe(true);
            expect(result.data).toBeNull();
        });

        it('should handle accept without content', () => {
            const response: any = {
                action: 'accept'
            };
            
            const result = Elicitation.processElicitationResponse(response);
            
            expect(result.accepted).toBe(true);
            expect(result.data).toBeNull();
        });

        it('should handle accept with empty content', () => {
            const response: any = {
                action: 'accept',
                content: {}
            };
            
            const result = Elicitation.processElicitationResponse(response);
            
            expect(result.accepted).toBe(true);
            expect(result.data).toEqual({});
        });
    });
});
