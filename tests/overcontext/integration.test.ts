import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { create } from '../../src/overcontext/adapter';
import { loadHierarchicalConfig } from '../../src/overcontext/discovery';

describe('Integration: Discovery + Storage', () => {
    let testDir: string;
  
    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), 'protokoll-test-'));
    });
  
    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });
  
    it('discovers and loads context', async () => {
        // Create .protokoll structure
        const protokollDir = join(testDir, '.protokoll');
        await mkdir(join(protokollDir, 'context', 'people'), { recursive: true });
    
        // Create test person
        await writeFile(
            join(protokollDir, 'context', 'people', 'john.yaml'),
            'id: john\nname: John Doe\ntype: person'
        );
    
        // Create config
        await writeFile(
            join(protokollDir, 'config.yaml'),
            'version: 1'
        );
    
        const result = await loadHierarchicalConfig({
            configDirName: '.protokoll',
            configFileName: 'config.yaml',
            startingDir: testDir,
        });
    
        expect(result.contextDirs.length).toBe(1);
    
        const storage = create();
        await storage.load(result.contextDirs);
    
        const john = storage.get('person', 'john');
        expect(john).toBeDefined();
        expect(john?.name).toBe('John Doe');
    });
  
    it('handles hierarchical context with override', async () => {
        // Create parent .protokoll
        const parentProtokolDir = join(testDir, '.protokoll');
        await mkdir(join(parentProtokolDir, 'context', 'people'), { recursive: true });
    
        // Parent person
        await writeFile(
            join(parentProtokolDir, 'context', 'people', 'alice.yaml'),
            'id: alice\nname: Alice Parent\ntype: person'
        );
    
        // Create child directory
        const childDir = join(testDir, 'child');
        await mkdir(childDir, { recursive: true });
    
        // Child .protokoll
        const childProtokolDir = join(childDir, '.protokoll');
        await mkdir(join(childProtokolDir, 'context', 'people'), { recursive: true });
    
        // Child person (overrides parent)
        await writeFile(
            join(childProtokolDir, 'context', 'people', 'alice.yaml'),
            'id: alice\nname: Alice Child\ntype: person'
        );
    
        // Additional person only in child
        await writeFile(
            join(childProtokolDir, 'context', 'people', 'bob.yaml'),
            'id: bob\nname: Bob Child\ntype: person'
        );
    
        const result = await loadHierarchicalConfig({
            configDirName: '.protokoll',
            configFileName: 'config.yaml',
            startingDir: childDir,
        });
    
        expect(result.contextDirs.length).toBe(2);
    
        const storage = create();
        await storage.load(result.contextDirs);
    
        // Alice should be from child (closer wins)
        const alice = storage.get('person', 'alice');
        expect(alice?.name).toBe('Alice Child');
    
        // Bob should exist (only in child)
        const bob = storage.get('person', 'bob');
        expect(bob?.name).toBe('Bob Child');
    });
  
    it('handles empty context gracefully', async () => {
        const result = await loadHierarchicalConfig({
            configDirName: '.protokoll',
            configFileName: 'config.yaml',
            startingDir: testDir,
        });
    
        expect(result.contextDirs.length).toBe(0);
    
        const storage = create();
        await storage.load(result.contextDirs);
    
        // Should not throw, just return undefined
        const person = storage.get('person', 'nonexistent');
        expect(person).toBeUndefined();
    
        // getAll should return empty arrays
        expect(storage.getAll('person')).toEqual([]);
    });
  
    it('loads multiple entity types', async () => {
        const protokollDir = join(testDir, '.protokoll');
        await mkdir(join(protokollDir, 'context', 'people'), { recursive: true });
        await mkdir(join(protokollDir, 'context', 'projects'), { recursive: true });
        await mkdir(join(protokollDir, 'context', 'terms'), { recursive: true });
    
        // Create entities
        await writeFile(
            join(protokollDir, 'context', 'people', 'jane.yaml'),
            'id: jane\nname: Jane Doe\ntype: person'
        );
    
        await writeFile(
            join(protokollDir, 'context', 'projects', 'myproject.yaml'),
            `id: myproject
name: My Project
type: project
classification:
  context_type: work
routing:
  structure: month
  filename_options:
    - date
    - subject`
        );
    
        await writeFile(
            join(protokollDir, 'context', 'terms', 'api.yaml'),
            'id: api\nname: API\ntype: term\nexpansion: Application Programming Interface'
        );
    
        const result = await loadHierarchicalConfig({
            configDirName: '.protokoll',
            configFileName: 'config.yaml',
            startingDir: testDir,
        });
    
        const storage = create();
        await storage.load(result.contextDirs);
    
        // Verify all entity types loaded
        expect(storage.get('person', 'jane')).toBeDefined();
        expect(storage.get('project', 'myproject')).toBeDefined();
        expect(storage.get('term', 'api')).toBeDefined();
    
        // Verify counts
        expect(storage.getAll('person').length).toBe(1);
        expect(storage.getAll('project').length).toBe(1);
        expect(storage.getAll('term').length).toBe(1);
    });
  
    it('supports search functionality', async () => {
        const protokollDir = join(testDir, '.protokoll');
        await mkdir(join(protokollDir, 'context', 'people'), { recursive: true });
    
        await writeFile(
            join(protokollDir, 'context', 'people', 'john.yaml'),
            'id: john\nname: John Doe\ntype: person'
        );
    
        await writeFile(
            join(protokollDir, 'context', 'people', 'jane.yaml'),
            'id: jane\nname: Jane Smith\ntype: person'
        );
    
        const result = await loadHierarchicalConfig({
            configDirName: '.protokoll',
            configFileName: 'config.yaml',
            startingDir: testDir,
        });
    
        const storage = create();
        await storage.load(result.contextDirs);
    
        // Search by name
        const johnResults = storage.search('John');
        expect(johnResults.length).toBe(1);
        expect(johnResults[0].name).toBe('John Doe');
    
        // Search should be case-insensitive
        const janeResults = storage.search('jane');
        expect(janeResults.length).toBe(1);
        expect(janeResults[0].name).toBe('Jane Smith');
    });
  
    it('supports sounds_like lookups', async () => {
        const protokollDir = join(testDir, '.protokoll');
        await mkdir(join(protokollDir, 'context', 'people'), { recursive: true });
    
        await writeFile(
            join(protokollDir, 'context', 'people', 'anil.yaml'),
            `id: anil
name: Anil
type: person
sounds_like:
  - a nil
  - a nill`
        );
    
        const result = await loadHierarchicalConfig({
            configDirName: '.protokoll',
            configFileName: 'config.yaml',
            startingDir: testDir,
        });
    
        const storage = create();
        await storage.load(result.contextDirs);
    
        // Find by sounds_like
        const found = storage.findBySoundsLike('a nil');
        expect(found).toBeDefined();
        expect(found?.name).toBe('Anil');
    
        // Should be case-insensitive
        const found2 = storage.findBySoundsLike('A NILL');
        expect(found2).toBeDefined();
        expect(found2?.name).toBe('Anil');
    });
});
