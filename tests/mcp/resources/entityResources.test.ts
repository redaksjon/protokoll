/**
 * Tests for Entity Resources
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies - must be before imports
vi.mock('@/context', () => ({
    create: vi.fn(),
}));

vi.mock('js-yaml', () => ({
    dump: vi.fn((obj: unknown) => `yaml-dump:${JSON.stringify(obj)}`),
}));

vi.mock('../../../src/mcp/uri', () => ({
    buildEntityUri: vi.fn((type: string, id: string) => `protokoll://entity/${type}/${id}`),
    buildEntitiesListUri: vi.fn((type: string) => `protokoll://entities/${type}`),
}));

import * as Context from '@/context';
import * as yaml from 'js-yaml';
import { buildEntityUri, buildEntitiesListUri } from '../../../src/mcp/uri';
import {
    readEntityResource,
    readEntitiesListResource,
} from '../../../src/mcp/resources/entityResources';

describe('entityResources', () => {
    const mockContext = {
        hasContext: vi.fn().mockReturnValue(true),
        getPerson: vi.fn(),
        getProject: vi.fn(),
        getTerm: vi.fn(),
        getCompany: vi.fn(),
        getIgnored: vi.fn(),
        getAllPeople: vi.fn().mockReturnValue([]),
        getAllProjects: vi.fn().mockReturnValue([]),
        getAllTerms: vi.fn().mockReturnValue([]),
        getAllCompanies: vi.fn().mockReturnValue([]),
        getAllIgnored: vi.fn().mockReturnValue([]),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(Context.create).mockResolvedValue(mockContext as any);
        mockContext.hasContext.mockReturnValue(true);
    });

    describe('readEntityResource', () => {
        it('should read person entity', async () => {
            const person = { id: 'john', name: 'John Doe', company: 'Acme', role: 'Engineer' };
            mockContext.getPerson.mockReturnValue(person);

            const result = await readEntityResource('person', 'john');

            expect(result).toBeDefined();
            expect(result.uri).toBe('protokoll://entity/person/john');
            expect(result.mimeType).toBe('application/yaml');
            expect(result.text).toContain('yaml-dump:');
            expect(Context.create).toHaveBeenCalledWith({ startingDir: process.cwd() });
            expect(mockContext.getPerson).toHaveBeenCalledWith('john');
            expect(yaml.dump).toHaveBeenCalledWith(person);
            expect(buildEntityUri).toHaveBeenCalledWith('person', 'john');
        });

        it('should read project entity', async () => {
            const project = { id: 'proj1', name: 'Project One', active: true };
            mockContext.getProject.mockReturnValue(project);

            const result = await readEntityResource('project', 'proj1');

            expect(result.uri).toBe('protokoll://entity/project/proj1');
            expect(result.mimeType).toBe('application/yaml');
            expect(mockContext.getProject).toHaveBeenCalledWith('proj1');
            expect(yaml.dump).toHaveBeenCalledWith(project);
        });

        it('should read term entity', async () => {
            const term = { id: 'k8s', name: 'Kubernetes', expansion: 'K8s', domain: 'tech' };
            mockContext.getTerm.mockReturnValue(term);

            const result = await readEntityResource('term', 'k8s');

            expect(result.uri).toBe('protokoll://entity/term/k8s');
            expect(mockContext.getTerm).toHaveBeenCalledWith('k8s');
            expect(yaml.dump).toHaveBeenCalledWith(term);
        });

        it('should read company entity', async () => {
            const company = { id: 'acme', name: 'Acme', fullName: 'Acme Corp', industry: 'Tech' };
            mockContext.getCompany.mockReturnValue(company);

            const result = await readEntityResource('company', 'acme');

            expect(result.uri).toBe('protokoll://entity/company/acme');
            expect(mockContext.getCompany).toHaveBeenCalledWith('acme');
            expect(yaml.dump).toHaveBeenCalledWith(company);
        });

        it('should read ignored entity', async () => {
            const ignored = { id: 'test', name: 'Test', reason: 'Testing' };
            mockContext.getIgnored.mockReturnValue(ignored);

            const result = await readEntityResource('ignored', 'test');

            expect(result.uri).toBe('protokoll://entity/ignored/test');
            expect(mockContext.getIgnored).toHaveBeenCalledWith('test');
            expect(yaml.dump).toHaveBeenCalledWith(ignored);
        });

        it('should use contextDirectory when provided', async () => {
            const person = { id: 'jane', name: 'Jane' };
            mockContext.getPerson.mockReturnValue(person);

            await readEntityResource('person', 'jane', '/custom/dir');

            expect(Context.create).toHaveBeenCalledWith({ startingDir: '/custom/dir' });
        });

        it('should throw when entity not found', async () => {
            mockContext.getPerson.mockReturnValue(undefined);

            await expect(readEntityResource('person', 'nonexistent')).rejects.toThrow(
                'person "nonexistent" not found'
            );
        });

        it('should throw when entity type is unknown', async () => {
            await expect(readEntityResource('invalid', 'id')).rejects.toThrow(
                'Unknown entity type: invalid'
            );
            expect(mockContext.getPerson).not.toHaveBeenCalled();
            expect(mockContext.getProject).not.toHaveBeenCalled();
        });
    });

    describe('readEntitiesListResource', () => {
        it('should read person list', async () => {
            const people = [
                { id: 'john', name: 'John', company: 'Acme', role: 'Engineer' },
                { id: 'jane', name: 'Jane', company: 'Beta', role: 'Designer' },
            ];
            mockContext.getAllPeople.mockReturnValue(people);

            const result = await readEntitiesListResource('person');

            expect(result).toBeDefined();
            expect(result.uri).toBe('protokoll://entities/person');
            expect(result.mimeType).toBe('application/json');

            const data = JSON.parse(result.text);
            expect(data.entityType).toBe('person');
            expect(data.count).toBe(2);
            expect(data.entities).toHaveLength(2);
            expect(data.entities[0]).toMatchObject({
                id: 'john',
                name: 'John',
                company: 'Acme',
                role: 'Engineer',
            });
            expect(data.entities[0].uri).toBe('protokoll://entity/person/john');
            expect(buildEntityUri).toHaveBeenCalledWith('person', 'john');
            expect(buildEntityUri).toHaveBeenCalledWith('person', 'jane');
            expect(buildEntitiesListUri).toHaveBeenCalledWith('person');
        });

        it('should read project list', async () => {
            const projects = [
                { id: 'p1', name: 'Project 1', active: true, routing: { destination: '/out' } },
                { id: 'p2', name: 'Project 2', active: false },
            ];
            mockContext.getAllProjects.mockReturnValue(projects);

            const result = await readEntitiesListResource('project');

            const data = JSON.parse(result.text);
            expect(data.entityType).toBe('project');
            expect(data.count).toBe(2);
            expect(data.entities[0]).toMatchObject({
                id: 'p1',
                name: 'Project 1',
                active: true,
                destination: '/out',
            });
            expect(data.entities[1].active).toBe(false); // active !== false
        });

        it('should read term list', async () => {
            const terms = [
                { id: 't1', name: 'Term 1', expansion: 'T1', domain: 'tech' },
            ];
            mockContext.getAllTerms.mockReturnValue(terms);

            const result = await readEntitiesListResource('term');

            const data = JSON.parse(result.text);
            expect(data.entityType).toBe('term');
            expect(data.count).toBe(1);
            expect(data.entities[0]).toMatchObject({
                id: 't1',
                name: 'Term 1',
                expansion: 'T1',
                domain: 'tech',
            });
        });

        it('should read company list', async () => {
            const companies = [
                { id: 'c1', name: 'Company 1', fullName: 'Company One', industry: 'Tech' },
            ];
            mockContext.getAllCompanies.mockReturnValue(companies);

            const result = await readEntitiesListResource('company');

            const data = JSON.parse(result.text);
            expect(data.entityType).toBe('company');
            expect(data.count).toBe(1);
            expect(data.entities[0]).toMatchObject({
                id: 'c1',
                name: 'Company 1',
                fullName: 'Company One',
                industry: 'Tech',
            });
        });

        it('should read ignored list', async () => {
            const ignored = [
                { id: 'i1', name: 'Ignored 1', reason: 'Test' },
            ];
            mockContext.getAllIgnored.mockReturnValue(ignored);

            const result = await readEntitiesListResource('ignored');

            const data = JSON.parse(result.text);
            expect(data.entityType).toBe('ignored');
            expect(data.count).toBe(1);
            expect(data.entities[0]).toMatchObject({
                id: 'i1',
                name: 'Ignored 1',
                reason: 'Test',
            });
        });

        it('should return empty list when no entities', async () => {
            mockContext.getAllProjects.mockReturnValue([]);

            const result = await readEntitiesListResource('project');

            const data = JSON.parse(result.text);
            expect(data.entityType).toBe('project');
            expect(data.count).toBe(0);
            expect(data.entities).toEqual([]);
        });

        it('should use contextDirectory when provided', async () => {
            mockContext.getAllPeople.mockReturnValue([]);

            await readEntitiesListResource('person', '/custom/dir');

            expect(Context.create).toHaveBeenCalledWith({ startingDir: '/custom/dir' });
        });

        it('should throw when no context found', async () => {
            mockContext.hasContext.mockReturnValue(false);

            await expect(readEntitiesListResource('person')).rejects.toThrow(
                'No Protokoll context found'
            );
        });

        it('should throw when entity type is unknown', async () => {
            await expect(readEntitiesListResource('invalid')).rejects.toThrow(
                'Unknown entity type: invalid'
            );
            expect(mockContext.getAllPeople).not.toHaveBeenCalled();
        });
    });
});
