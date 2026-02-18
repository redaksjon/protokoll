import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStandaloneStorage as create } from '@redaksjon/context';
const Storage = { create };
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Person, Project, Company, Term } from '../../src/context/types';

describe('Context Storage', () => {
  let tempDir: string;
  let storage: Storage.StorageInstance;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-storage-test-'));
    storage = Storage.create();
  });
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });
  
  describe('load', () => {
    it('should load people from context directory', async () => {
      // Create people directory with a person
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(
        path.join(peopleDir, 'john-doe.yaml'),
        `id: john-doe
name: John Doe
firstName: John
lastName: Doe
sounds_like:
  - "john dough"
  - "jon doe"`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const person = storage.get<Person>('person', 'john-doe');
      expect(person).toBeDefined();
      expect(person?.name).toBe('John Doe');
      expect(person?.sounds_like).toContain('john dough');
    });
    
    it('should load projects from context directory', async () => {
      const projectsDir = path.join(tempDir, 'context', 'projects');
      await fs.mkdir(projectsDir, { recursive: true });
      await fs.writeFile(
        path.join(projectsDir, 'alpha.yaml'),
        `id: alpha
name: Project Alpha
classification:
  context_type: work
  topics:
    - planning
    - budget
routing:
  destination: ~/work/alpha
  structure: month
  filename_options:
    - date
    - subject`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const project = storage.get<Project>('project', 'alpha');
      expect(project).toBeDefined();
      expect(project?.classification.context_type).toBe('work');
      expect(project?.routing.structure).toBe('month');
    });
    
    it('should load companies from context directory', async () => {
      const companiesDir = path.join(tempDir, 'context', 'companies');
      await fs.mkdir(companiesDir, { recursive: true });
      await fs.writeFile(
        path.join(companiesDir, 'acme.yaml'),
        `id: acme
name: ACME Corp
fullName: ACME Corporation
industry: Technology
sounds_like:
  - "ack me"
  - "ak me"`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const company = storage.get<Company>('company', 'acme');
      expect(company).toBeDefined();
      expect(company?.fullName).toBe('ACME Corporation');
    });
    
    it('should load terms from context directory', async () => {
      const termsDir = path.join(tempDir, 'context', 'terms');
      await fs.mkdir(termsDir, { recursive: true });
      await fs.writeFile(
        path.join(termsDir, 'api.yaml'),
        `id: api
name: API
expansion: Application Programming Interface
domain: engineering`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const term = storage.get<Term>('term', 'api');
      expect(term).toBeDefined();
      expect(term?.expansion).toBe('Application Programming Interface');
    });
    
    it('should handle missing directories gracefully', async () => {
      // Load from non-existent directory
      await storage.load([path.join(tempDir, 'nonexistent')]);
      
      expect(storage.getAll('person')).toEqual([]);
    });
    
    it('should override entities from later directories', async () => {
      // Create first context directory
      const context1 = path.join(tempDir, 'context1');
      const people1 = path.join(context1, 'people');
      await fs.mkdir(people1, { recursive: true });
      await fs.writeFile(
        path.join(people1, 'john.yaml'),
        `id: john
name: John Original
role: Developer`
      );
      
      // Create second context directory with override
      const context2 = path.join(tempDir, 'context2');
      const people2 = path.join(context2, 'people');
      await fs.mkdir(people2, { recursive: true });
      await fs.writeFile(
        path.join(people2, 'john.yaml'),
        `id: john
name: John Override
role: Manager`
      );
      
      // Load with context2 after context1 (context2 should win)
      await storage.load([context1, context2]);
      
      const person = storage.get<Person>('person', 'john');
      expect(person?.name).toBe('John Override');
      expect(person?.role).toBe('Manager');
    });
  });
  
  describe('save', () => {
    it('should save entity to correct directory', async () => {
      const testId = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789';
      const person: Person = {
        id: testId,
        name: 'Jane Doe',
        type: 'person',
        firstName: 'Jane',
        lastName: 'Doe',
      };
      
      await storage.save(person, tempDir);
      
      // Find file with UUID prefix (first 10 chars of UUID)
      const peopleDir = path.join(tempDir, 'context', 'people');
      const files = await fs.readdir(peopleDir);
      const uuidPrefix = testId.substring(0, 10);
      const savedFile = files.find(f => f.startsWith(uuidPrefix) && f.endsWith('.yaml'));
      expect(savedFile).toBeDefined();
      
      const content = await fs.readFile(path.join(peopleDir, savedFile!), 'utf-8');
      expect(content).toContain('name: Jane Doe');
      expect(content).not.toContain('type:'); // Type should not be in file
    });
    
    it('should create directories if they do not exist', async () => {
      const testId = 'b1c2d3e4-f5a6-4789-bcde-f01234567890';
      const term: Term = {
        id: testId,
        name: 'New Term',
        type: 'term',
        expansion: 'New Term Expansion',
      };
      
      await storage.save(term, tempDir);
      
      // Find file with UUID prefix (first 10 chars of UUID)
      const termsDir = path.join(tempDir, 'context', 'terms');
      const files = await fs.readdir(termsDir);
      const uuidPrefix = testId.substring(0, 10);
      const savedFile = files.find(f => f.startsWith(uuidPrefix) && f.endsWith('.yaml'));
      expect(savedFile).toBeDefined();
      
      const filePath = path.join(termsDir, savedFile!);
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
    });
  });
  
  describe('search', () => {
    it('should find entities by name substring', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(
        path.join(peopleDir, 'john.yaml'),
        'id: john\nname: John Smith'
      );
      await fs.writeFile(
        path.join(peopleDir, 'jane.yaml'),
        'id: jane\nname: Jane Johnson'
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const results = storage.search('john');
      expect(results.length).toBe(2); // John Smith and Jane Johnson
    });
    
    it('should be case insensitive', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(
        path.join(peopleDir, 'john.yaml'),
        'id: john\nname: JOHN SMITH'
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const results = storage.search('john');
      expect(results.length).toBe(1);
    });
  });
  
  describe('findBySoundsLike', () => {
    it('should find entity by phonetic variant', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(
        path.join(peopleDir, 'priya.yaml'),
        `id: priya
name: Priya Sharma
sounds_like:
  - "pria"
  - "preya"
  - "priya sharma"`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const result = storage.findBySoundsLike('pria');
      expect(result).toBeDefined();
      expect(result?.name).toBe('Priya Sharma');
    });
    
    it('should be case insensitive', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(
        path.join(peopleDir, 'priya.yaml'),
        `id: priya
name: Priya Sharma
sounds_like:
  - "PRIA"`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const result = storage.findBySoundsLike('pria');
      expect(result).toBeDefined();
    });
    
    it('should return undefined when no match found', async () => {
      await storage.load([]);
      
      const result = storage.findBySoundsLike('nonexistent');
      expect(result).toBeUndefined();
    });
  });
  
  describe('getAll', () => {
    it('should return all entities of a type', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(path.join(peopleDir, 'a.yaml'), 'id: a\nname: Person A');
      await fs.writeFile(path.join(peopleDir, 'b.yaml'), 'id: b\nname: Person B');
      await fs.writeFile(path.join(peopleDir, 'c.yaml'), 'id: c\nname: Person C');
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const people = storage.getAll<Person>('person');
      expect(people.length).toBe(3);
    });
  });
  
  describe('clear', () => {
    it('should clear all loaded entities', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(path.join(peopleDir, 'a.yaml'), 'id: a\nname: Person A');
      
      await storage.load([path.join(tempDir, 'context')]);
      expect(storage.getAll('person').length).toBe(1);
      
      storage.clear();
      expect(storage.getAll('person').length).toBe(0);
    });
  });

  describe('branch coverage edge cases', () => {
    it('should handle entity without sounds_like in findBySoundsLike', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(
        path.join(peopleDir, 'john.yaml'),
        'id: john\nname: John Smith'
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const result = storage.findBySoundsLike('jon');
      expect(result).toBeUndefined();
    });

    it('should handle whitespace in phonetic variant matching', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(
        path.join(peopleDir, 'priya.yaml'),
        `id: priya
name: Priya Sharma
sounds_like:
  - "pria"
  - "preya"`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      // Test with extra whitespace
      const result = storage.findBySoundsLike('  pria  ');
      expect(result?.name).toBe('Priya Sharma');
    });

    it('should handle case variations in findBySoundsLike', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(
        path.join(peopleDir, 'priya.yaml'),
        `id: priya
name: Priya Sharma
sounds_like:
  - "pria"`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      // Test uppercase phonetic
      const result = storage.findBySoundsLike('PRIA');
      expect(result?.name).toBe('Priya Sharma');
    });

    it('should get undefined for non-existent entity', () => {
      const result = storage.get('person', 'nonexistent');
      expect(result).toBeUndefined();
    });

    it('should get all entities of a type when empty', () => {
      const result = storage.getAll('person');
      expect(result).toEqual([]);
    });    it('should handle loading from multiple directories', async () => {
      const dir1 = path.join(tempDir, 'context1', 'people');
      const dir2 = path.join(tempDir, 'context2', 'people');
      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });
      
      await fs.writeFile(path.join(dir1, 'a.yaml'), 'id: a\nname: Person A');
      await fs.writeFile(path.join(dir2, 'b.yaml'), 'id: b\nname: Person B');
      
      await storage.load([path.join(tempDir, 'context1'), path.join(tempDir, 'context2')]);
      
      const people = storage.getAll('person');
      expect(people.length).toBe(2);
      expect(people.some(p => p.name === 'Person A')).toBe(true);
      expect(people.some(p => p.name === 'Person B')).toBe(true);
    });

    it('should skip files that do not end with yaml or yml', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(path.join(peopleDir, 'a.yaml'), 'id: a\nname: Person A');
      await fs.writeFile(path.join(peopleDir, 'b.txt'), 'id: b\nname: Person B'); // Non-yaml file
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const people = storage.getAll('person');
      expect(people.length).toBe(1);
      expect(people[0].name).toBe('Person A');
    });

    it('should handle entities that parse to undefined', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(path.join(peopleDir, 'invalid.yaml'), ''); // Empty file
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const people = storage.getAll('person');
      expect(people.length).toBe(0);
    });

    it('should handle entities without id', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(
        path.join(peopleDir, 'noid.yaml'),
        'name: Person Without ID'
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const people = storage.getAll('person');
      expect(people.length).toBe(0);
    });

    it('should handle yml file extension', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(path.join(peopleDir, 'a.yml'), 'id: a\nname: Person A');
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const people = storage.getAll('person');
      expect(people.length).toBe(1);
    });
  });

  describe('delete', () => {
    it('should delete entity file and remove from memory', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      const filePath = path.join(peopleDir, 'to-delete.yaml');
      await fs.writeFile(filePath, 'id: to-delete\nname: To Delete');
      
      await storage.load([path.join(tempDir, 'context')]);
      expect(storage.get('person', 'to-delete')).toBeDefined();
      
      const deleted = await storage.delete('person', 'to-delete', path.join(tempDir, 'context'));
      
      expect(deleted).toBe(true);
      expect(storage.get('person', 'to-delete')).toBeUndefined();
      await expect(fs.stat(filePath)).rejects.toThrow();
    });

    it('should return false if entity file not found', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const deleted = await storage.delete('person', 'nonexistent', path.join(tempDir, 'context'));
      
      expect(deleted).toBe(false);
    });

    it('should delete yml files', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      const filePath = path.join(peopleDir, 'to-delete.yml');
      await fs.writeFile(filePath, 'id: to-delete\nname: To Delete');
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const deleted = await storage.delete('person', 'to-delete', path.join(tempDir, 'context'));
      
      expect(deleted).toBe(true);
      await expect(fs.stat(filePath)).rejects.toThrow();
    });
  });

  describe('getEntityFilePath', () => {
    it('should return path to yaml file', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(path.join(peopleDir, 'john.yaml'), 'id: john\nname: John');
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const filePath = storage.getEntityFilePath('person', 'john', [path.join(tempDir, 'context')]);
      
      expect(filePath).toBe(path.join(peopleDir, 'john.yaml'));
    });

    it('should return path to yml file', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      await fs.writeFile(path.join(peopleDir, 'jane.yml'), 'id: jane\nname: Jane');
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const filePath = storage.getEntityFilePath('person', 'jane', [path.join(tempDir, 'context')]);
      
      expect(filePath).toBe(path.join(peopleDir, 'jane.yml'));
    });

    it('should return undefined for non-existent entity', async () => {
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(peopleDir, { recursive: true });
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const filePath = storage.getEntityFilePath('person', 'nonexistent', [path.join(tempDir, 'context')]);
      
      expect(filePath).toBeUndefined();
    });

    it('should search directories in reverse order (closest first)', async () => {
      const contextDir1 = path.join(tempDir, 'context1');
      const contextDir2 = path.join(tempDir, 'context2');
      const peopleDir1 = path.join(contextDir1, 'people');
      const peopleDir2 = path.join(contextDir2, 'people');
      
      await fs.mkdir(peopleDir1, { recursive: true });
      await fs.mkdir(peopleDir2, { recursive: true });
      await fs.writeFile(path.join(peopleDir1, 'john.yaml'), 'id: john\nname: John 1');
      await fs.writeFile(path.join(peopleDir2, 'john.yaml'), 'id: john\nname: John 2');
      
      await storage.load([contextDir1, contextDir2]);
      
      // Should find the one in contextDir2 first (closest)
      const filePath = storage.getEntityFilePath('person', 'john', [contextDir1, contextDir2]);
      
      expect(filePath).toBe(path.join(peopleDir2, 'john.yaml'));
    });
  });

  describe('project sounds_like', () => {
    it('should load project with sounds_like field', async () => {
      const projectsDir = path.join(tempDir, 'context', 'projects');
      await fs.mkdir(projectsDir, { recursive: true });
      await fs.writeFile(
        path.join(projectsDir, 'protokoll.yaml'),
        `id: protokoll
name: Protokoll
classification:
  context_type: work
  explicit_phrases:
    - "work on protokoll"
routing:
  destination: ~/work/notes
  structure: month
  filename_options:
    - date
sounds_like:
  - "protocol"
  - "pro to call"
  - "proto call"`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const project = storage.get<Project>('project', 'protokoll');
      expect(project).toBeDefined();
      expect(project?.name).toBe('Protokoll');
      expect(project?.sounds_like).toBeDefined();
      expect(project?.sounds_like).toContain('protocol');
      expect(project?.sounds_like).toContain('pro to call');
      expect(project?.sounds_like).toContain('proto call');
    });

    it('should find project by sounds_like variant', async () => {
      const projectsDir = path.join(tempDir, 'context', 'projects');
      await fs.mkdir(projectsDir, { recursive: true });
      await fs.writeFile(
        path.join(projectsDir, 'kronologi.yaml'),
        `id: kronologi
name: Kronologi
classification:
  context_type: work
routing:
  destination: ~/work/kronologi
  structure: month
  filename_options:
    - date
sounds_like:
  - "chronology"
  - "crono logy"
  - "crow no logy"`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      // Should find by exact sounds_like match
      const result = storage.findBySoundsLike('chronology');
      expect(result).toBeDefined();
      expect(result?.name).toBe('Kronologi');
      expect(result?.type).toBe('project');
    });

    it('should find project by sounds_like case insensitive', async () => {
      const projectsDir = path.join(tempDir, 'context', 'projects');
      await fs.mkdir(projectsDir, { recursive: true });
      await fs.writeFile(
        path.join(projectsDir, 'observasjon.yaml'),
        `id: observasjon
name: Observasjon
classification:
  context_type: work
routing:
  destination: ~/work/obs
  structure: month
  filename_options:
    - date
sounds_like:
  - "observation"
  - "observe asian"`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      // Should be case insensitive
      const result1 = storage.findBySoundsLike('OBSERVATION');
      expect(result1?.name).toBe('Observasjon');
      
      const result2 = storage.findBySoundsLike('Observe Asian');
      expect(result2?.name).toBe('Observasjon');
    });

    it('should save project with sounds_like field', async () => {
      const testId = 'c1d2e3f4-a5b6-4789-cdef-012345678901';
      const project: Project = {
        id: testId,
        name: 'Redaksjon',
        type: 'project',
        classification: {
          context_type: 'work',
          explicit_phrases: ['redaksjon project'],
        },
        routing: {
          destination: '~/work/redaksjon',
          structure: 'month',
          filename_options: ['date', 'subject'],
        },
        sounds_like: ['redaction', 'red action', 'red ox on'],
        active: true,
      };
      
      await storage.save(project, tempDir);
      
      // Find file with UUID prefix (first 10 chars of UUID)
      const projectsDir = path.join(tempDir, 'context', 'projects');
      const files = await fs.readdir(projectsDir);
      const uuidPrefix = testId.substring(0, 10);
      const savedFile = files.find(f => f.startsWith(uuidPrefix) && f.endsWith('.yaml'));
      expect(savedFile).toBeDefined();
      
      const content = await fs.readFile(path.join(projectsDir, savedFile!), 'utf-8');
      expect(content).toContain('sounds_like:');
      expect(content).toContain('redaction');
      expect(content).toContain('red action');
      expect(content).toContain('red ox on');
    });

    it('should handle project without sounds_like in findBySoundsLike', async () => {
      const projectsDir = path.join(tempDir, 'context', 'projects');
      await fs.mkdir(projectsDir, { recursive: true });
      await fs.writeFile(
        path.join(projectsDir, 'no-sounds-like.yaml'),
        `id: no-sounds-like
name: No Sounds Like Project
classification:
  context_type: work
routing:
  destination: ~/work
  structure: month
  filename_options:
    - date`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      // Should not find when no sounds_like field
      const result = storage.findBySoundsLike('no sounds like');
      expect(result).toBeUndefined();
    });

    it('should handle whitespace in project sounds_like matching', async () => {
      const projectsDir = path.join(tempDir, 'context', 'projects');
      await fs.mkdir(projectsDir, { recursive: true });
      await fs.writeFile(
        path.join(projectsDir, 'whitespace-test.yaml'),
        `id: whitespace-test
name: Whitespace Test
classification:
  context_type: work
routing:
  destination: ~/work
  structure: month
  filename_options:
    - date
sounds_like:
  - "white space"`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      // Should handle extra whitespace
      const result = storage.findBySoundsLike('  white space  ');
      expect(result?.name).toBe('Whitespace Test');
    });

    it('should return first matching entity when multiple have same sounds_like', async () => {
      const projectsDir = path.join(tempDir, 'context', 'projects');
      const peopleDir = path.join(tempDir, 'context', 'people');
      await fs.mkdir(projectsDir, { recursive: true });
      await fs.mkdir(peopleDir, { recursive: true });
      
      // Project with sounds_like
      await fs.writeFile(
        path.join(projectsDir, 'alpha.yaml'),
        `id: alpha
name: Project Alpha
classification:
  context_type: work
routing:
  destination: ~/work
  structure: month
  filename_options:
    - date
sounds_like:
  - "alfa"`
      );
      
      // Person with same sounds_like
      await fs.writeFile(
        path.join(peopleDir, 'alfa-person.yaml'),
        `id: alfa-person
name: Alfa Person
sounds_like:
  - "alfa"`
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      // Should return one of them (implementation returns first found)
      const result = storage.findBySoundsLike('alfa');
      expect(result).toBeDefined();
      expect(['Project Alpha', 'Alfa Person']).toContain(result?.name);
    });
  });

  describe('ignored entities', () => {
    it('should load ignored entities', async () => {
      const ignoredDir = path.join(tempDir, 'context', 'ignored');
      await fs.mkdir(ignoredDir, { recursive: true });
      await fs.writeFile(
        path.join(ignoredDir, 'common-phrase.yaml'),
        'id: common-phrase\nname: Common Phrase\nignoredAt: 2026-01-15'
      );
      
      await storage.load([path.join(tempDir, 'context')]);
      
      const ignored = storage.getAll('ignored');
      expect(ignored.length).toBe(1);
      expect(ignored[0].name).toBe('Common Phrase');
    });

    it('should save ignored entities', async () => {
      const testId = 'd1e2f3a4-b5c6-4789-defa-123456789012';
      await storage.save({
        id: testId,
        name: 'Test Ignored',
        type: 'ignored',
      }, tempDir);
      
      // Find file with UUID prefix (first 10 chars of UUID)
      const ignoredDir = path.join(tempDir, 'context', 'ignored');
      const files = await fs.readdir(ignoredDir);
      const uuidPrefix = testId.substring(0, 10);
      const savedFile = files.find(f => f.startsWith(uuidPrefix) && f.endsWith('.yaml'));
      expect(savedFile).toBeDefined();
      
      const content = await fs.readFile(path.join(ignoredDir, savedFile!), 'utf-8');
      expect(content).toContain('name: Test Ignored');
    });
  });
});
