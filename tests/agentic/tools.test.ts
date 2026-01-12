import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as LookupPerson from '../../src/agentic/tools/lookup-person';
import * as LookupProject from '../../src/agentic/tools/lookup-project';
import * as VerifySpelling from '../../src/agentic/tools/verify-spelling';
import * as RouteNote from '../../src/agentic/tools/route-note';
import * as StoreContext from '../../src/agentic/tools/store-context';
import { ToolContext } from '../../src/agentic/types';

describe('Agentic Tools', () => {
    let mockContext: ToolContext;
  
    beforeEach(() => {
        mockContext = {
            transcriptText: 'Test transcript',
            audioDate: new Date('2026-01-11'),
            sourceFile: 'test.m4a',
            contextInstance: {
                search: vi.fn(() => []),
                findBySoundsLike: vi.fn(() => undefined),
                getAllProjects: vi.fn(() => []),
                // @ts-ignore
            },
            routingInstance: {
                route: vi.fn(() => ({
                    projectId: null,
                    destination: { path: '~/notes', structure: 'month', filename_options: ['date'] },
                    confidence: 1.0,
                    signals: [],
                    reasoning: 'default',
                })),
                buildOutputPath: vi.fn(() => '/tmp/notes/2026/1/1-11-test.md'),
                // @ts-ignore
            },
            interactiveMode: false,
        };
    });
  
    describe('lookup_person', () => {
        it('should return found when person exists', async () => {
            mockContext.contextInstance.search = vi.fn(() => [
                { id: 'john', name: 'John Smith', type: 'person' }
            ]);
      
            const tool = LookupPerson.create(mockContext);
            const result = await tool.execute({ name: 'John' });
      
            expect(result.success).toBe(true);
            expect(result.data.found).toBe(true);
            expect(result.data.person.name).toBe('John Smith');
        });
    
        it('should return not found when person does not exist', async () => {
            const tool = LookupPerson.create(mockContext);
            const result = await tool.execute({ name: 'Unknown' });
      
            expect(result.success).toBe(true);
            expect(result.data.found).toBe(false);
        });
    
        it('should try phonetic match when phonetic arg provided', async () => {
            mockContext.contextInstance.findBySoundsLike = vi.fn(() => ({
                id: 'priya', name: 'Priya Sharma', type: 'person'
            }));
      
            const tool = LookupPerson.create(mockContext);
            const result = await tool.execute({ name: 'Pria', phonetic: 'pria' });
      
            expect(result.success).toBe(true);
            expect(result.data.found).toBe(true);
        });

        it('should not try phonetic match when phonetic arg not provided', async () => {
            mockContext.contextInstance.search = vi.fn(() => []);
            mockContext.contextInstance.findBySoundsLike = vi.fn();
      
            const tool = LookupPerson.create(mockContext);
            const result = await tool.execute({ name: 'Unknown' });
      
            expect(result.success).toBe(true);
            expect(result.data.found).toBe(false);
            expect(mockContext.contextInstance.findBySoundsLike).not.toHaveBeenCalled();
        });

        it('should return not found when phonetic match fails', async () => {
            mockContext.contextInstance.search = vi.fn(() => []);
            mockContext.contextInstance.findBySoundsLike = vi.fn(() => undefined);
      
            const tool = LookupPerson.create(mockContext);
            const result = await tool.execute({ name: 'Unknown', phonetic: 'phonetic' });
      
            expect(result.success).toBe(true);
            expect(result.data.found).toBe(false);
        });
    });
  
    describe('lookup_project', () => {
        it('should return found when project exists', async () => {
            mockContext.contextInstance.search = vi.fn(() => [
                { id: 'alpha', name: 'Project Alpha', type: 'project' }
            ]);
      
            const tool = LookupProject.create(mockContext);
            const result = await tool.execute({ name: 'Alpha' });
      
            expect(result.success).toBe(true);
            expect(result.data.found).toBe(true);
        });
    
        it('should return not found when project does not exist', async () => {
            const tool = LookupProject.create(mockContext);
            const result = await tool.execute({ name: 'Unknown' });
      
            expect(result.success).toBe(true);
            expect(result.data.found).toBe(false);
        });
    
        it('should match trigger phrases when provided', async () => {
            mockContext.contextInstance.getAllProjects = vi.fn(() => [{
                id: 'quarterly',
                name: 'Quarterly Planning',
                type: 'project',
                classification: {
                    context_type: 'work',
                    explicit_phrases: ['quarterly planning meeting'],
                },
                routing: { destination: '~/work', structure: 'month', filename_options: ['date'] },
            }]);
      
            const tool = LookupProject.create(mockContext);
            const result = await tool.execute({ 
                name: 'planning', 
                triggerPhrase: 'quarterly planning meeting' 
            });
      
            expect(result.success).toBe(true);
            expect(result.data.found).toBe(true);
            expect(result.data.matchedTrigger).toBe('quarterly planning meeting');
        });

        it('should not match trigger phrases when triggerPhrase not provided', async () => {
            mockContext.contextInstance.getAllProjects = vi.fn(() => [{
                id: 'quarterly',
                name: 'Quarterly Planning',
                type: 'project',
            }]);
      
            const tool = LookupProject.create(mockContext);
            const result = await tool.execute({ 
                name: 'planning'
            });
      
            expect(result.success).toBe(true);
            expect(result.data.found).toBe(false);
            expect(mockContext.contextInstance.getAllProjects).not.toHaveBeenCalled();
        });

        it('should handle project without explicit_phrases', async () => {
            mockContext.contextInstance.getAllProjects = vi.fn(() => [{
                id: 'project',
                name: 'Test Project',
                type: 'project',
                classification: {
                    context_type: 'work'
                },
            }]);
      
            const tool = LookupProject.create(mockContext);
            const result = await tool.execute({ 
                name: 'test', 
                triggerPhrase: 'test phrase' 
            });
      
            expect(result.success).toBe(true);
            expect(result.data.found).toBe(false);
        });

        it('should handle multiple projects with trigger phrase match', async () => {
            mockContext.contextInstance.getAllProjects = vi.fn(() => [
                {
                    id: 'project1',
                    name: 'First Project',
                    type: 'project',
                    classification: {
                        context_type: 'work',
                        explicit_phrases: ['first']
                    },
                },
                {
                    id: 'project2',
                    name: 'Matching Project',
                    type: 'project',
                    classification: {
                        context_type: 'work',
                        explicit_phrases: ['quarterly planning']
                    },
                }
            ]);
      
            const tool = LookupProject.create(mockContext);
            const result = await tool.execute({ 
                name: 'test', 
                triggerPhrase: 'quarterly planning' 
            });
      
            expect(result.success).toBe(true);
            expect(result.data.found).toBe(true);
            expect(result.data.project.id).toBe('project2');
        });
    });
  
    describe('verify_spelling', () => {
        it('should return best guess in non-interactive mode with suggestion', async () => {
            const tool = VerifySpelling.create(mockContext);
            const result = await tool.execute({ 
                term: 'pria', 
                suggestedSpelling: 'Priya' 
            });
      
            expect(result.success).toBe(true);
            expect(result.data.spelling).toBe('Priya');
            expect(result.data.useSuggestion).toBe(true);
        });

        it('should return term itself in non-interactive mode without suggestion', async () => {
            const tool = VerifySpelling.create(mockContext);
            const result = await tool.execute({ 
                term: 'pria'
            });
      
            expect(result.success).toBe(true);
            expect(result.data.spelling).toBe('pria');
            expect(result.data.verified).toBe(false);
        });
    
        it('should request user input in interactive mode with suggestion', async () => {
            mockContext.interactiveMode = true;
      
            const tool = VerifySpelling.create(mockContext);
            const result = await tool.execute({ term: 'pria', suggestedSpelling: 'Priya' });
      
            expect(result.success).toBe(true);
            expect(result.needsUserInput).toBe(true);
            expect(result.userPrompt).toContain('pria');
            expect(result.userPrompt).toContain('Priya');
        });

        it('should request user input in interactive mode without suggestion', async () => {
            mockContext.interactiveMode = true;
      
            const tool = VerifySpelling.create(mockContext);
            const result = await tool.execute({ term: 'pria' });
      
            expect(result.success).toBe(true);
            expect(result.needsUserInput).toBe(true);
            expect(result.userPrompt).toContain('pria');
            expect(result.userPrompt).not.toContain('Suggested');
        });

        it('should include context in user prompt when provided', async () => {
            mockContext.interactiveMode = true;
      
            const tool = VerifySpelling.create(mockContext);
            const result = await tool.execute({ 
                term: 'pria',
                context: 'Speaker context'
            });
      
            expect(result.success).toBe(true);
            expect(result.userPrompt).toContain('context:');
        });
    });
  
    describe('route_note', () => {
        it('should return routing decision', async () => {
            const tool = RouteNote.create(mockContext);
            const result = await tool.execute({ contentSummary: 'Test note' });
      
            expect(result.success).toBe(true);
            expect(result.data.destination).toBeDefined();
            expect(result.data.confidence).toBe(1.0);
        });
    });
  
    describe('store_context', () => {
        it('should acknowledge without persisting', async () => {
            const tool = StoreContext.create(mockContext);
            const result = await tool.execute({ 
                entityType: 'person', 
                name: 'New Person' 
            });
      
            expect(result.success).toBe(true);
            expect(result.data.stored).toBe(false);
            expect(result.data.message).toContain('--self-update');
        });
    });
});

describe('Tool Registry', () => {
    let mockContext: ToolContext;
  
    beforeEach(() => {
        mockContext = {
            transcriptText: 'Test',
            audioDate: new Date(),
            sourceFile: 'test.m4a',
            contextInstance: {
                search: vi.fn(() => []),
                findBySoundsLike: vi.fn(() => undefined),
                getAllProjects: vi.fn(() => []),
                // @ts-ignore
            },
            routingInstance: {
                route: vi.fn(() => ({ projectId: null, confidence: 1.0 })),
                buildOutputPath: vi.fn(() => '/tmp/test.md'),
                // @ts-ignore
            },
            interactiveMode: false,
        };
    });
  
    it('should create registry with all tools', async () => {
        const Registry = await import('../../src/agentic/registry');
        const registry = Registry.create(mockContext);
    
        const tools = registry.getTools();
        expect(tools.length).toBe(5);
        expect(tools.map(t => t.name)).toContain('lookup_person');
        expect(tools.map(t => t.name)).toContain('lookup_project');
        expect(tools.map(t => t.name)).toContain('verify_spelling');
        expect(tools.map(t => t.name)).toContain('route_note');
        expect(tools.map(t => t.name)).toContain('store_context');
    });
  
    it('should generate tool definitions for LLM', async () => {
        const Registry = await import('../../src/agentic/registry');
        const registry = Registry.create(mockContext);
    
        const definitions = registry.getToolDefinitions();
        expect(definitions.length).toBe(5);
        // Flat format - reasoning client handles OpenAI conversion
        expect(definitions[0].name).toBeDefined();
        expect(definitions[0].description).toBeDefined();
        expect(definitions[0].parameters).toBeDefined();
    });
  
    it('should execute tools by name', async () => {
        const Registry = await import('../../src/agentic/registry');
        const registry = Registry.create(mockContext);
    
        const result = await registry.executeTool('store_context', { 
            entityType: 'person', 
            name: 'Test' 
        });
    
        expect(result.success).toBe(true);
    });
  
    it('should return error for unknown tool', async () => {
        const Registry = await import('../../src/agentic/registry');
        const registry = Registry.create(mockContext);
    
        const result = await registry.executeTool('unknown_tool', {});
    
        expect(result.success).toBe(false);
        expect(result.error).toContain('Unknown tool');
    });
});

