import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Context from '../../src/context';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Context System', () => {
  let tempDir: string;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-context-test-'));
  });
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });
  
  describe('create', () => {
    it('should create context instance with no config directories', async () => {
      const context = await Context.create({
        startingDir: tempDir,
      });
      
      expect(context.hasContext()).toBe(false);
      expect(context.getAllPeople()).toEqual([]);
    });
    
    it('should load context from .protokoll directory', async () => {
      // Create .protokoll structure
      const protokollDir = path.join(tempDir, '.protokoll');
      const peopleDir = path.join(protokollDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(
        path.join(protokollDir, 'config.yaml'),
        'version: 1\nmodel: gpt-4o'
      );
      await fs.writeFile(
        path.join(peopleDir, 'test-person.yaml'),
        'id: test-person\nname: Test Person'
      );
      
      const context = await Context.create({
        startingDir: tempDir,
      });
      
      expect(context.hasContext()).toBe(true);
      expect(context.getAllPeople().length).toBe(1);
      expect(context.getPerson('test-person')?.name).toBe('Test Person');
    });
    
    it('should merge config from multiple directories', async () => {
      // Create parent .protokoll
      const parentDir = path.join(tempDir, 'parent');
      const parentProtokoll = path.join(parentDir, '.protokoll');
      await fs.mkdir(parentProtokoll, { recursive: true });
      await fs.writeFile(
        path.join(parentProtokoll, 'config.yaml'),
        'model: gpt-4o\ndefault_timezone: America/New_York'
      );
      
      // Create child .protokoll
      const childDir = path.join(parentDir, 'child');
      const childProtokoll = path.join(childDir, '.protokoll');
      await fs.mkdir(childProtokoll, { recursive: true });
      await fs.writeFile(
        path.join(childProtokoll, 'config.yaml'),
        'model: gpt-4o-mini'
      );
      
      const context = await Context.create({
        startingDir: childDir,
      });
      
      const config = context.getConfig();
      // @ts-ignore
      expect(config.model).toBe('gpt-4o-mini'); // Child overrides
      // @ts-ignore
      expect(config.default_timezone).toBe('America/New_York'); // Parent preserved
    });
  });
  
  describe('entity access', () => {
    it('should provide typed access to all entity types', async () => {
      const protokollDir = path.join(tempDir, '.protokoll');
      
      // Create all entity directories
      await fs.mkdir(path.join(protokollDir, 'context', 'people'), { recursive: true });
      await fs.mkdir(path.join(protokollDir, 'context', 'projects'), { recursive: true });
      await fs.mkdir(path.join(protokollDir, 'context', 'companies'), { recursive: true });
      await fs.mkdir(path.join(protokollDir, 'context', 'terms'), { recursive: true });
      
      await fs.writeFile(path.join(protokollDir, 'config.yaml'), 'version: 1');
      
      await fs.writeFile(
        path.join(protokollDir, 'context', 'people', 'person.yaml'),
        'id: person\nname: Test Person'
      );
      await fs.writeFile(
        path.join(protokollDir, 'context', 'projects', 'project.yaml'),
        `id: project
name: Test Project
classification:
  context_type: work
routing:
  destination: ~/test
  structure: month
  filename_options: [date]`
      );
      await fs.writeFile(
        path.join(protokollDir, 'context', 'companies', 'company.yaml'),
        'id: company\nname: Test Company'
      );
      await fs.writeFile(
        path.join(protokollDir, 'context', 'terms', 'term.yaml'),
        'id: term\nname: Test Term'
      );
      
      const context = await Context.create({ startingDir: tempDir });
      
      expect(context.getPerson('person')?.name).toBe('Test Person');
      expect(context.getProject('project')?.name).toBe('Test Project');
      expect(context.getCompany('company')?.name).toBe('Test Company');
      expect(context.getTerm('term')?.name).toBe('Test Term');
      
      expect(context.getAllPeople().length).toBe(1);
      expect(context.getAllProjects().length).toBe(1);
      expect(context.getAllCompanies().length).toBe(1);
      expect(context.getAllTerms().length).toBe(1);
    });
  });
  
  describe('search', () => {
    it('should search across all entity types', async () => {
      const protokollDir = path.join(tempDir, '.protokoll');
      await fs.mkdir(path.join(protokollDir, 'context', 'people'), { recursive: true });
      await fs.mkdir(path.join(protokollDir, 'context', 'companies'), { recursive: true });
      await fs.writeFile(path.join(protokollDir, 'config.yaml'), 'version: 1');
      
      await fs.writeFile(
        path.join(protokollDir, 'context', 'people', 'john.yaml'),
        'id: john\nname: John Smith'
      );
      await fs.writeFile(
        path.join(protokollDir, 'context', 'companies', 'smith-co.yaml'),
        'id: smith-co\nname: Smith Corporation'
      );
      
      const context = await Context.create({ startingDir: tempDir });
      
      const results = context.search('smith');
      expect(results.length).toBe(2);
    });
  });
  
  describe('findBySoundsLike', () => {
    it('should find entities by phonetic variant', async () => {
      const protokollDir = path.join(tempDir, '.protokoll');
      await fs.mkdir(path.join(protokollDir, 'context', 'people'), { recursive: true });
      await fs.writeFile(path.join(protokollDir, 'config.yaml'), 'version: 1');
      
      await fs.writeFile(
        path.join(protokollDir, 'context', 'people', 'priya.yaml'),
        `id: priya
name: Priya Sharma
sounds_like:
  - "pria sharma"
  - "preya"
  - "priya sharmer"`
      );
      
      const context = await Context.create({ startingDir: tempDir });
      
      const result = context.findBySoundsLike('pria sharma');
      expect(result?.name).toBe('Priya Sharma');
    });
  });
  
  describe('saveEntity', () => {
    it('should save entity to closest .protokoll directory', async () => {
      const protokollDir = path.join(tempDir, '.protokoll');
      await fs.mkdir(path.join(protokollDir, 'context'), { recursive: true });
      await fs.writeFile(path.join(protokollDir, 'config.yaml'), 'version: 1');
      
      const context = await Context.create({ startingDir: tempDir });
      
      await context.saveEntity({
        id: 'new-person',
        name: 'New Person',
        type: 'person',
      });
      
      const filePath = path.join(protokollDir, 'context', 'people', 'new-person.yaml');
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
    });
    
    it('should throw error when no .protokoll directory exists', async () => {
      const context = await Context.create({ startingDir: tempDir });
      
      await expect(context.saveEntity({
        id: 'test',
        name: 'Test',
        type: 'person',
      })).rejects.toThrow('No .protokoll directory found');
    });
  });
  
  describe('reload', () => {
    it('should reload entities from disk', async () => {
      const protokollDir = path.join(tempDir, '.protokoll');
      const peopleDir = path.join(protokollDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(path.join(protokollDir, 'config.yaml'), 'version: 1');
      await fs.writeFile(
        path.join(peopleDir, 'person.yaml'),
        'id: person\nname: Original Name'
      );
      
      const context = await Context.create({ startingDir: tempDir });
      expect(context.getPerson('person')?.name).toBe('Original Name');
      
      // Modify file on disk
      await fs.writeFile(
        path.join(peopleDir, 'person.yaml'),
        'id: person\nname: Updated Name'
      );
      
      await context.reload();
      expect(context.getPerson('person')?.name).toBe('Updated Name');
    });
  });
  
  describe('getDiscoveredDirs', () => {
    it('should return list of discovered directories', async () => {
      const parentDir = path.join(tempDir, 'parent');
      const childDir = path.join(parentDir, 'child');
      
      await fs.mkdir(path.join(parentDir, '.protokoll'), { recursive: true });
      await fs.mkdir(path.join(childDir, '.protokoll'), { recursive: true });
      await fs.writeFile(path.join(parentDir, '.protokoll', 'config.yaml'), 'v: 1');
      await fs.writeFile(path.join(childDir, '.protokoll', 'config.yaml'), 'v: 2');
      
      const context = await Context.create({ startingDir: childDir });
      
      const dirs = context.getDiscoveredDirs();
      expect(dirs.length).toBe(2);
      expect(dirs[0].level).toBe(0); // Child is closest
      expect(dirs[1].level).toBe(1); // Parent is further
    });
  });
});

