import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Storage from '../../src/context/storage';
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
      const person: Person = {
        id: 'jane-doe',
        name: 'Jane Doe',
        type: 'person',
        firstName: 'Jane',
        lastName: 'Doe',
      };
      
      await storage.save(person, tempDir);
      
      const filePath = path.join(tempDir, 'context', 'people', 'jane-doe.yaml');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('name: Jane Doe');
      expect(content).not.toContain('type:'); // Type should not be in file
    });
    
    it('should create directories if they do not exist', async () => {
      const term: Term = {
        id: 'new-term',
        name: 'New Term',
        type: 'term',
        expansion: 'New Term Expansion',
      };
      
      await storage.save(term, tempDir);
      
      const filePath = path.join(tempDir, 'context', 'terms', 'new-term.yaml');
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
});
