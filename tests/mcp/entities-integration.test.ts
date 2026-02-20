/**
 * Integration tests for entity resources and tools
 *
 * Tests loading entities (readEntityResource, readEntitiesListResource),
 * editing entities (add/edit person, project), and search (list_projects,
 * list_people, search_context) with real context YAML files.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { readEntityResource, readEntitiesListResource } from '../../src/mcp/resources/entityResources';
import { handleReadResource } from '../../src/mcp/resources';
import {
  handleListProjects,
  handleListPeople,
  handleSearchContext,
  handleAddPerson,
  handleEditPerson,
  handleAddProject,
  handleEditProject,
} from '../../src/mcp/tools';
import * as shared from '../../src/mcp/tools/shared';
import * as Context from '../../src/context';
import * as ServerConfig from '../../src/mcp/serverConfig';

describe('Entities integration', () => {
  let tempDir: string;
  let contextDir: string;
  let testContext: Awaited<ReturnType<typeof Context.create>>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'entities-integration-'));
    contextDir = path.join(tempDir, 'context');

    await fs.mkdir(path.join(contextDir, 'people'), { recursive: true });
    await fs.mkdir(path.join(contextDir, 'projects'), { recursive: true });
    await fs.mkdir(path.join(contextDir, 'companies'), { recursive: true });
    await fs.mkdir(path.join(contextDir, 'terms'), { recursive: true });
    await fs.mkdir(path.join(contextDir, 'ignored'), { recursive: true });

    // Create fixture entities (minimal YAML matching redaksjon-context runtime test format)
    await fs.writeFile(
      path.join(contextDir, 'people', 'john-doe.yaml'),
      'id: john-doe\nname: John Doe\ncompany: acme\nrole: Developer\n'
    );
    await fs.writeFile(
      path.join(contextDir, 'people', 'jane-smith.yaml'),
      'id: jane-smith\nname: Jane Smith\n'
    );
    await fs.writeFile(
      path.join(contextDir, 'projects', 'walmart.yaml'),
      `id: walmart
name: Walmart
classification:
  context_type: work
routing:
  structure: month
  filename_options:
    - date
`
    );
    await fs.writeFile(
      path.join(contextDir, 'projects', 'acme-project.yaml'),
      `id: acme-project
name: Acme Project
description: Main Acme initiative
classification:
  context_type: work
routing:
  structure: month
  filename_options:
    - date
`
    );
    await fs.writeFile(
      path.join(contextDir, 'companies', 'acme.yaml'),
      'id: acme\nname: Acme\nfullName: Acme Corporation\n'
    );
    await fs.writeFile(
      path.join(contextDir, 'terms', 'api.yaml'),
      'id: api\nname: API\nexpansion: Application Programming Interface\ndomain: software\n'
    );

    // Create context with our fixture directory (protokoll context has getSmartAssistanceConfig)
    testContext = await Context.create({ contextDirectories: [contextDir] });

    // Mock ServerConfig so tools/resources use our context
    vi.spyOn(ServerConfig, 'isInitialized').mockReturnValue(true);
    vi.spyOn(ServerConfig, 'getWorkspaceRoot').mockReturnValue(tempDir);
    vi.spyOn(ServerConfig, 'getServerConfig').mockReturnValue({
      mode: 'local',
      context: testContext,
      workspaceRoot: tempDir,
      inputDirectory: path.join(tempDir, 'recordings'),
      outputDirectory: path.join(tempDir, 'notes'),
      processedDirectory: path.join(tempDir, 'processed'),
      configFilePath: null,
      configFile: { contextDirectories: [contextDir] },
      initialized: true,
    } as ReturnType<typeof ServerConfig.getServerConfig>);
    vi.spyOn(ServerConfig, 'getContext').mockReturnValue(testContext);
    vi.spyOn(ServerConfig, 'isRemoteMode').mockReturnValue(false);
    // Entity tools use createToolContext (not getContext) - mock to use same testContext
    vi.spyOn(shared, 'createToolContext').mockResolvedValue(testContext as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Loading entities (resources)', () => {
    it('should read single entity via readEntityResource', async () => {
      const result = await readEntityResource('person', 'john-doe', tempDir);

      expect(result.uri).toContain('entity/person/john-doe');
      expect(result.mimeType).toBe('application/yaml');
      expect(result.text).toContain('John Doe');
      expect(result.text).toContain('john-doe');
    });

    it('should read entity list via readEntitiesListResource', async () => {
      const result = await readEntitiesListResource('person', tempDir);

      const data = JSON.parse(result.text);
      expect(data.entityType).toBe('person');
      expect(data.count).toBe(2);
      expect(data.entities).toHaveLength(2);
      const ids = data.entities.map((e: { id: string }) => e.id).sort();
      expect(ids).toEqual(['jane-smith', 'john-doe']);
    });

    it('should read entity via handleReadResource (protokoll://entity/...)', async () => {
      const result = await handleReadResource('protokoll://entity/person/john-doe');

      expect(result.mimeType).toBe('application/yaml');
      expect(result.text).toContain('John Doe');
    });

    it('should read entities list via handleReadResource (protokoll://entities/...)', async () => {
      const result = await handleReadResource('protokoll://entities/project');

      const data = JSON.parse(result.text);
      expect(data.entityType).toBe('project');
      expect(data.count).toBe(2);
      expect(data.entities.some((e: { id: string }) => e.id === 'walmart')).toBe(true);
      expect(data.entities.some((e: { id: string }) => e.id === 'acme-project')).toBe(true);
    });

    it('should throw when entity not found', async () => {
      await expect(readEntityResource('person', 'nonexistent', tempDir)).rejects.toThrow(
        'person "nonexistent" not found'
      );
    });
  });

  describe('Search entities (context tools)', () => {
    it('should list projects with protokoll_list_projects', async () => {
      const result = await handleListProjects({ contextDirectory: tempDir });

      expect(result.projects).toHaveLength(2);
      const names = result.projects.map((p: { name: string }) => p.name).sort();
      expect(names).toEqual(['Acme Project', 'Walmart']);
    });

    it('should filter projects by search', async () => {
      const result = await handleListProjects({
        contextDirectory: tempDir,
        search: 'acme',
      });

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('Acme Project');
    });

    it('should list people with protokoll_list_people', async () => {
      const result = await handleListPeople({ contextDirectory: tempDir });

      expect(result.people).toHaveLength(2);
      const names = result.people.map((p: { name: string }) => p.name).sort();
      expect(names).toEqual(['Jane Smith', 'John Doe']);
    });

    it('should filter people by search', async () => {
      const result = await handleListPeople({
        contextDirectory: tempDir,
        search: 'jane',
      });

      expect(result.people).toHaveLength(1);
      expect(result.people[0].name).toBe('Jane Smith');
    });

    it('should search context with protokoll_search_context', async () => {
      const result = await handleSearchContext({
        query: 'API',
        contextDirectory: tempDir,
      });

      expect(result.results.length).toBeGreaterThanOrEqual(1);
      const termResult = result.results.find((r: { type: string }) => r.type === 'term');
      expect(termResult).toBeDefined();
      expect(termResult?.name).toBe('API');
    });
  });

  describe('Editing entities (entity tools)', () => {
    it('should add person with protokoll_add_person', async () => {
      const result = await handleAddPerson({
        name: 'Bob Wilson',
        role: 'Manager',
        contextDirectory: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.entity).toBeDefined();
      expect(result.entity?.name).toBe('Bob Wilson');
      expect(result.entity?.id).toBeDefined();

      // Verify persisted: list people and find the new one
      const listResult = await handleListPeople({ contextDirectory: tempDir });
      expect(listResult.people.length).toBe(3);
      const bob = listResult.people.find((p: { name: string }) => p.name === 'Bob Wilson');
      expect(bob).toBeDefined();
    });

    it('should edit person with protokoll_edit_person', async () => {
      const result = await handleEditPerson({
        id: 'john-doe',
        role: 'Senior Developer',
        contextDirectory: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.person?.role).toBe('Senior Developer');

      const resource = await readEntityResource('person', 'john-doe', tempDir);
      expect(resource.text).toContain('Senior Developer');
    });

    it('should add project with protokoll_add_project', async () => {
      const result = await handleAddProject({
        name: 'New Initiative',
        destination: './notes/new-initiative',
        useSmartAssist: false,
        contextDirectory: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.entity?.name).toBe('New Initiative');
      expect(result.entity?.id).toBeDefined();

      const listResult = await handleListProjects({ contextDirectory: tempDir });
      expect(listResult.projects.length).toBe(3);
      const newProj = listResult.projects.find((p: { name: string }) => p.name === 'New Initiative');
      expect(newProj).toBeDefined();
    });

    it('should edit project with protokoll_edit_project', async () => {
      const result = await handleEditProject({
        id: 'walmart',
        description: 'Updated Walmart project',
        contextDirectory: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.project?.description).toBe('Updated Walmart project');

      const resource = await readEntityResource('project', 'walmart', tempDir);
      expect(resource.text).toContain('Updated Walmart project');
    });
  });
});
