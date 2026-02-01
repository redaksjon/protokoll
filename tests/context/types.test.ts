/**
 * Tests for Context Types Module
 */

import { describe, it, expect } from 'vitest';
import type {
    EntityType,
    BaseEntity,
    Person,
    Project,
    ProjectClassification,
    ProjectRouting,
    Company,
    Term,
    IgnoredTerm,
    Entity,
    ContextStore,
    ContextDiscoveryOptions,
    DiscoveredContextDir,
    HierarchicalContextResult,
    SmartAssistanceConfig,
} from '../../src/context/types';
import {
    isTermAssociatedWithProject,
    addProjectToTerm,
    removeProjectFromTerm,
    isParentProject,
} from '../../src/context/types';

describe('Context Types', () => {
    describe('EntityType', () => {
        it('should accept valid entity types', () => {
            const types: EntityType[] = ['person', 'project', 'company', 'term', 'ignored'];
            
            types.forEach(type => {
                expect(['person', 'project', 'company', 'term', 'ignored']).toContain(type);
            });
        });
    });

    describe('BaseEntity', () => {
        it('should create a valid base entity', () => {
            const entity: BaseEntity = {
                id: 'test-123',
                name: 'Test Entity',
                type: 'person',
                notes: 'Some notes',
            };

            expect(entity.id).toBe('test-123');
            expect(entity.name).toBe('Test Entity');
            expect(entity.type).toBe('person');
            expect(entity.notes).toBe('Some notes');
        });

        it('should support optional dates', () => {
            const entity: BaseEntity = {
                id: 'test',
                name: 'Entity',
                type: 'term',
                createdAt: new Date('2026-01-15'),
                updatedAt: new Date('2026-01-18'),
            };

            expect(entity.createdAt).toBeInstanceOf(Date);
            expect(entity.updatedAt).toBeInstanceOf(Date);
        });
    });

    describe('Person', () => {
        it('should create a valid person entity', () => {
            const person: Person = {
                id: 'john-doe',
                name: 'John Doe',
                type: 'person',
                firstName: 'John',
                lastName: 'Doe',
                company: 'acme-corp',
                role: 'Developer',
                context: 'Met at conference',
            };

            expect(person.type).toBe('person');
            expect(person.firstName).toBe('John');
            expect(person.role).toBe('Developer');
        });

        it('should support phonetic variants', () => {
            const person: Person = {
                id: 'test',
                name: 'Name',
                type: 'person',
                sounds_like: ['mishearing1', 'mishearing2'],
            };

            expect(person.sounds_like).toContain('mishearing1');
        });
    });

    describe('ProjectClassification', () => {
        it('should classify project context', () => {
            const classification: ProjectClassification = {
                context_type: 'work',
                associated_people: ['person-1', 'person-2'],
                topics: ['engineering', 'devops'],
                explicit_phrases: ['working on project', 'project meeting'],
            };

            expect(classification.context_type).toBe('work');
            expect(classification.associated_people).toContain('person-1');
            expect(classification.topics).toContain('engineering');
        });

        it('should support personal and mixed projects', () => {
            const work: ProjectClassification = { context_type: 'work' };
            const personal: ProjectClassification = { context_type: 'personal' };
            const mixed: ProjectClassification = { context_type: 'mixed' };

            expect(work.context_type).toBe('work');
            expect(personal.context_type).toBe('personal');
            expect(mixed.context_type).toBe('mixed');
        });
    });

    describe('ProjectRouting', () => {
        it('should define project routing', () => {
            const routing: ProjectRouting = {
                destination: '/output/projects/myproject',
                structure: 'month',
                filename_options: ['date', 'subject'],
                auto_tags: ['project', 'work'],
            };

            expect(routing.structure).toBe('month');
            expect(routing.filename_options).toContain('date');
            expect(routing.auto_tags).toContain('project');
        });

        it('should support different structures', () => {
            const structures: Array<'none' | 'year' | 'month' | 'day'> = ['none', 'year', 'month', 'day'];

            structures.forEach(structure => {
                const routing: ProjectRouting = {
                    structure,
                    filename_options: [],
                };

                expect(routing.structure).toBe(structure);
            });
        });
    });

    describe('Project', () => {
        it('should create a valid project', () => {
            const project: Project = {
                id: 'proj-123',
                name: 'My Project',
                type: 'project',
                description: 'A test project',
                classification: {
                    context_type: 'work',
                    topics: ['engineering'],
                },
                routing: {
                    structure: 'month',
                    filename_options: ['date'],
                },
                sounds_like: ['my projekt', 'my project'],
                active: true,
            };

            expect(project.type).toBe('project');
            expect(project.classification.context_type).toBe('work');
            expect(project.routing.structure).toBe('month');
            expect(project.active).toBe(true);
        });

        it('should support inactive projects', () => {
            const project: Project = {
                id: 'archived',
                name: 'Old Project',
                type: 'project',
                classification: { context_type: 'work' },
                routing: { structure: 'none', filename_options: [] },
                active: false,
            };

            expect(project.active).toBe(false);
        });
    });

    describe('Company', () => {
        it('should create a valid company', () => {
            const company: Company = {
                id: 'acme',
                name: 'ACME Corp',
                type: 'company',
                fullName: 'ACME Corporation',
                industry: 'Technology',
                sounds_like: ['acme corp', 'acme corporation'],
            };

            expect(company.type).toBe('company');
            expect(company.fullName).toBe('ACME Corporation');
            expect(company.industry).toBe('Technology');
        });
    });

    describe('Term', () => {
        it('should create a valid term', () => {
            const term: Term = {
                id: 'react',
                name: 'React',
                type: 'term',
                expansion: 'A JavaScript library for building UIs',
                domain: 'frontend',
                description: 'React is a JavaScript library...',
                topics: ['javascript', 'frontend', 'ui'],
                sounds_like: ['react', 'reack'],
                projects: ['project-1'],
            };

            expect(term.type).toBe('term');
            expect(term.expansion).toBeDefined();
            expect(term.domain).toBe('frontend');
            expect(term.description).toBeDefined();
            expect(term.topics).toContain('javascript');
        });
    });

    describe('IgnoredTerm', () => {
        it('should create an ignored term', () => {
            const ignored: IgnoredTerm = {
                id: 'um',
                name: 'um',
                type: 'ignored',
                reason: 'Common filler word',
                ignoredAt: '2026-01-18',
            };

            expect(ignored.type).toBe('ignored');
            expect(ignored.reason).toBe('Common filler word');
            expect(ignored.ignoredAt).toBe('2026-01-18');
        });
    });

    describe('Entity Union Type', () => {
        it('should accept any entity type', () => {
            const entities: Entity[] = [
                { id: 'p1', name: 'Person', type: 'person' },
                { id: 'p2', name: 'Project', type: 'project', classification: { context_type: 'work' }, routing: { structure: 'month', filename_options: [] } },
                { id: 'c1', name: 'Company', type: 'company' },
                { id: 't1', name: 'Term', type: 'term' },
                { id: 'i1', name: 'Ignored', type: 'ignored' },
            ];

            expect(entities).toHaveLength(5);
            expect(entities.every(e => ['person', 'project', 'company', 'term', 'ignored'].includes(e.type))).toBe(true);
        });
    });

    describe('ContextStore', () => {
        it('should create a valid context store', () => {
            const store: ContextStore = {
                people: new Map(),
                projects: new Map(),
                companies: new Map(),
                terms: new Map(),
                ignored: new Map(),
            };

            expect(store.people instanceof Map).toBe(true);
            expect(store.projects instanceof Map).toBe(true);
            expect(store.companies instanceof Map).toBe(true);
            expect(store.terms instanceof Map).toBe(true);
            expect(store.ignored instanceof Map).toBe(true);
        });

        it('should support adding entities to store', () => {
            const store: ContextStore = {
                people: new Map(),
                projects: new Map(),
                companies: new Map(),
                terms: new Map(),
                ignored: new Map(),
            };

            const person: Person = {
                id: 'john',
                name: 'John',
                type: 'person',
            };

            store.people.set('john', person);

            expect(store.people.get('john')).toEqual(person);
            expect(store.people.size).toBe(1);
        });
    });

    describe('ContextDiscoveryOptions', () => {
        it('should define discovery options', () => {
            const options: ContextDiscoveryOptions = {
                configDirName: '.protokoll',
                configFileName: 'config.yaml',
                maxLevels: 10,
                startingDir: '/home/user/project',
            };

            expect(options.configDirName).toBe('.protokoll');
            expect(options.configFileName).toBe('config.yaml');
            expect(options.maxLevels).toBe(10);
            expect(options.startingDir).toBe('/home/user/project');
        });

        it('should support optional discovery options', () => {
            const options: ContextDiscoveryOptions = {
                configDirName: '.my-context',
                configFileName: 'context.yaml',
            };

            expect(options.maxLevels).toBeUndefined();
            expect(options.startingDir).toBeUndefined();
        });
    });

    describe('DiscoveredContextDir', () => {
        it('should define discovered context directory', () => {
            const discovered: DiscoveredContextDir = {
                path: '/Users/user/project/.protokoll',
                level: 0,
            };

            expect(discovered.path).toBe('/Users/user/project/.protokoll');
            expect(discovered.level).toBe(0);
        });

        it('should track hierarchy levels', () => {
            const discovered: DiscoveredContextDir[] = [
                { path: '/home/user/project/.protokoll', level: 0 },
                { path: '/home/user/.protokoll', level: 1 },
                { path: '/home/.protokoll', level: 2 },
            ];

            expect(discovered[0].level).toBe(0);
            expect(discovered[1].level).toBe(1);
            expect(discovered[2].level).toBe(2);
        });
    });

    describe('HierarchicalContextResult', () => {
        it('should define context discovery result', () => {
            const result: HierarchicalContextResult = {
                config: { setting1: 'value1', setting2: 'value2' },
                discoveredDirs: [
                    { path: '/home/user/project/.protokoll', level: 0 },
                    { path: '/home/user/.protokoll', level: 1 },
                ],
                contextDirs: ['/home/user/project/.protokoll', '/home/user/.protokoll'],
            };

            expect(result.discoveredDirs).toHaveLength(2);
            expect(result.contextDirs).toHaveLength(2);
            expect(result.config).toBeDefined();
        });
    });

    describe('SmartAssistanceConfig', () => {
        it('should create a valid smart assistance config', () => {
            const config: SmartAssistanceConfig = {
                enabled: true,
                phoneticModel: 'gpt-5-nano',
                analysisModel: 'gpt-5-mini',
                soundsLikeOnAdd: true,
                triggerPhrasesOnAdd: true,
                promptForSource: true,
                termsEnabled: true,
                termSoundsLikeOnAdd: true,
                termDescriptionOnAdd: true,
                termTopicsOnAdd: true,
                termProjectSuggestions: true,
                timeout: 30000,
            };

            expect(config.enabled).toBe(true);
            expect(config.phoneticModel).toBe('gpt-5-nano');
            expect(config.termSoundsLikeOnAdd).toBe(true);
            expect(config.timeout).toBe(30000);
        });

        it('should support partial configs', () => {
            const config: SmartAssistanceConfig = {
                enabled: false,
                phoneticModel: 'gpt-4',
                analysisModel: 'gpt-4',
                soundsLikeOnAdd: false,
                triggerPhrasesOnAdd: false,
                promptForSource: false,
            };

            expect(config.termsEnabled).toBeUndefined();
            expect(config.timeout).toBeUndefined();
        });

        it('should support mixed enabled/disabled features', () => {
            const config: SmartAssistanceConfig = {
                enabled: true,
                phoneticModel: 'gpt-5-nano',
                analysisModel: 'gpt-5-mini',
                soundsLikeOnAdd: true,
                triggerPhrasesOnAdd: false,
                promptForSource: true,
                termsEnabled: false,
            };

            expect(config.soundsLikeOnAdd).toBe(true);
            expect(config.triggerPhrasesOnAdd).toBe(false);
            expect(config.termsEnabled).toBe(false);
        });
    });

    describe('Type interoperability', () => {
        it('should support complex entity hierarchies', () => {
            const project: Project = {
                id: 'proj',
                name: 'Project',
                type: 'project',
                classification: {
                    context_type: 'work',
                    associated_people: ['person-1', 'person-2'],
                    associated_companies: ['company-1'],
                    topics: ['topic1', 'topic2'],
                    explicit_phrases: ['phrase1', 'phrase2'],
                },
                routing: {
                    destination: '/output',
                    structure: 'month',
                    filename_options: ['date', 'subject'],
                    auto_tags: ['tag1'],
                },
            };

            const store: ContextStore = {
                people: new Map([['person-1', { id: 'person-1', name: 'Person 1', type: 'person' }]]),
                projects: new Map([['proj', project]]),
                companies: new Map(),
                terms: new Map(),
                ignored: new Map(),
            };

            expect(store.projects.get('proj')?.classification.associated_people).toContain('person-1');
        });
    });

    describe('Helper Functions', () => {
        describe('isTermAssociatedWithProject', () => {
            it('should return true when term is associated with project', () => {
                const term: Term = {
                    id: 'term1',
                    name: 'Term 1',
                    type: 'term',
                    projects: ['proj1', 'proj2'],
                };

                expect(isTermAssociatedWithProject(term, 'proj1')).toBe(true);
            });

            it('should return false when term is not associated with project', () => {
                const term: Term = {
                    id: 'term1',
                    name: 'Term 1',
                    type: 'term',
                    projects: ['proj1'],
                };

                expect(isTermAssociatedWithProject(term, 'proj2')).toBe(false);
            });

            it('should return false when term has no projects', () => {
                const term: Term = {
                    id: 'term1',
                    name: 'Term 1',
                    type: 'term',
                };

                expect(isTermAssociatedWithProject(term, 'proj1')).toBe(false);
            });
        });

        describe('addProjectToTerm', () => {
            it('should add project to term projects array', () => {
                const term: Term = {
                    id: 'term1',
                    name: 'Term 1',
                    type: 'term',
                    projects: ['proj1'],
                };

                const updated = addProjectToTerm(term, 'proj2');
                expect(updated.projects).toEqual(['proj1', 'proj2']);
                expect(updated.updatedAt).toBeDefined();
            });

            it('should not add duplicate project', () => {
                const term: Term = {
                    id: 'term1',
                    name: 'Term 1',
                    type: 'term',
                    projects: ['proj1'],
                };

                const updated = addProjectToTerm(term, 'proj1');
                expect(updated.projects).toEqual(['proj1']);
            });

            it('should handle term with no projects', () => {
                const term: Term = {
                    id: 'term1',
                    name: 'Term 1',
                    type: 'term',
                };

                const updated = addProjectToTerm(term, 'proj1');
                expect(updated.projects).toEqual(['proj1']);
            });
        });

        describe('removeProjectFromTerm', () => {
            it('should remove project from term projects array', () => {
                const term: Term = {
                    id: 'term1',
                    name: 'Term 1',
                    type: 'term',
                    projects: ['proj1', 'proj2'],
                };

                const updated = removeProjectFromTerm(term, 'proj1');
                expect(updated.projects).toEqual(['proj2']);
                expect(updated.updatedAt).toBeDefined();
            });

            it('should handle removing non-existent project', () => {
                const term: Term = {
                    id: 'term1',
                    name: 'Term 1',
                    type: 'term',
                    projects: ['proj1'],
                };

                const updated = removeProjectFromTerm(term, 'proj2');
                expect(updated.projects).toEqual(['proj1']);
            });

            it('should handle term with no projects', () => {
                const term: Term = {
                    id: 'term1',
                    name: 'Term 1',
                    type: 'term',
                };

                const updated = removeProjectFromTerm(term, 'proj1');
                expect(updated.projects).toEqual([]);
            });
        });

        describe('isParentProject', () => {
            it('should return true when projectA is parent of projectB', () => {
                const projectA: Project = {
                    id: 'parent',
                    name: 'Parent',
                    type: 'project',
                    classification: { triggers: { words: [] }, requireAll: false },
                    routing: { structure: 'month', filename_options: [] },
                };

                const projectB: Project = {
                    id: 'child',
                    name: 'Child',
                    type: 'project',
                    classification: { triggers: { words: [] }, requireAll: false },
                    routing: { structure: 'month', filename_options: [] },
                    relationships: [{ uri: 'redaksjon://project/parent', relationship: 'parent' }],
                };

                expect(isParentProject(projectA, projectB)).toBe(true);
            });

            it('should return false when projectA is not parent of projectB', () => {
                const projectA: Project = {
                    id: 'other',
                    name: 'Other',
                    type: 'project',
                    classification: { triggers: { words: [] }, requireAll: false },
                    routing: { structure: 'month', filename_options: [] },
                };

                const projectB: Project = {
                    id: 'child',
                    name: 'Child',
                    type: 'project',
                    classification: { triggers: { words: [] }, requireAll: false },
                    routing: { structure: 'month', filename_options: [] },
                    relationships: [{ uri: 'redaksjon://project/parent', relationship: 'parent' }],
                };

                expect(isParentProject(projectA, projectB)).toBe(false);
            });
        });
    });
});
