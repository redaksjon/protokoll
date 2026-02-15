import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Discovery from '@redaksjon/context';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Hierarchical Discovery', () => {
  let tempDir: string;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-test-'));
  });
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });
  
  describe('discoverConfigDirectories', () => {
    it('should discover .protokoll directories up the tree', async () => {
      // Create nested structure
      const deepDir = path.join(tempDir, 'a', 'b', 'c');
      await fs.mkdir(deepDir, { recursive: true });
      
      // Add .protokoll at root and middle
      await fs.mkdir(path.join(tempDir, '.protokoll'));
      await fs.mkdir(path.join(tempDir, 'a', '.protokoll'));
      
      const result = await Discovery.discoverConfigDirectories({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: deepDir,
      });
      
      expect(result.length).toBe(2);
      // Closest should have lower level number
      expect(result[0].level).toBeLessThan(result[1].level);
    });
    
    it('should return empty array when no config directories found', async () => {
      const deepDir = path.join(tempDir, 'a', 'b', 'c');
      await fs.mkdir(deepDir, { recursive: true });
      
      const result = await Discovery.discoverConfigDirectories({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: deepDir,
      });
      
      expect(result.length).toBe(0);
    });
    
    it('should respect maxLevels option', async () => {
      // Create deep structure with .protokoll at root
      const deepDir = path.join(tempDir, 'a', 'b', 'c', 'd', 'e');
      await fs.mkdir(deepDir, { recursive: true });
      await fs.mkdir(path.join(tempDir, '.protokoll'));
      
      // With maxLevels=3, should not find root .protokoll
      const result = await Discovery.discoverConfigDirectories({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: deepDir,
        maxLevels: 3,
      });
      
      expect(result.length).toBe(0);
    });
    
    it('should find .protokoll in starting directory', async () => {
      await fs.mkdir(path.join(tempDir, '.protokoll'));
      
      const result = await Discovery.discoverConfigDirectories({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: tempDir,
      });
      
      expect(result.length).toBe(1);
      expect(result[0].level).toBe(0);
    });
  });
  
  describe('loadHierarchicalConfig', () => {
    it('should merge configs with local precedence', async () => {
      // Create structure
      const childDir = path.join(tempDir, 'child');
      await fs.mkdir(childDir, { recursive: true });
      
      // Parent config
      await fs.mkdir(path.join(tempDir, '.protokoll'));
      await fs.writeFile(
        path.join(tempDir, '.protokoll', 'config.yaml'),
        'model: gpt-4o\ncontext_type: personal'
      );
      
      // Child config (overrides)
      await fs.mkdir(path.join(childDir, '.protokoll'));
      await fs.writeFile(
        path.join(childDir, '.protokoll', 'config.yaml'),
        'context_type: work'
      );
      
      const result = await Discovery.loadHierarchicalConfig({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: childDir,
      });
      
      // @ts-ignore
      expect(result.config.model).toBe('gpt-4o');        // From parent
      // @ts-ignore
      expect(result.config.context_type).toBe('work');  // From child (overridden)
    });
    
    it('should return empty config when no directories found', async () => {
      const result = await Discovery.loadHierarchicalConfig({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: tempDir,
      });
      
      expect(result.config).toEqual({});
      expect(result.discoveredDirs).toEqual([]);
      expect(result.contextDirs).toEqual([]);
    });
    
    it('should collect context directories (legacy .protokoll/context/)', async () => {
      // Create structure with context subdirectories
      const childDir = path.join(tempDir, 'child');
      await fs.mkdir(childDir, { recursive: true });
      
      // Parent with context
      await fs.mkdir(path.join(tempDir, '.protokoll', 'context'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.protokoll', 'config.yaml'),
        'version: 1'
      );
      
      // Child with context
      await fs.mkdir(path.join(childDir, '.protokoll', 'context'), { recursive: true });
      await fs.writeFile(
        path.join(childDir, '.protokoll', 'config.yaml'),
        'version: 2'
      );
      
      const result = await Discovery.loadHierarchicalConfig({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: childDir,
      });
      
      expect(result.contextDirs.length).toBe(2);
    });
    
    it('should prefer ./context/ at repository root over .protokoll/context/', async () => {
      // Create structure with both context locations
      await fs.mkdir(path.join(tempDir, '.protokoll'), { recursive: true });
      await fs.mkdir(path.join(tempDir, '.protokoll', 'context'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'context'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.protokoll', 'config.yaml'),
        'version: 1'
      );
      
      const result = await Discovery.loadHierarchicalConfig({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: tempDir,
      });
      
      expect(result.contextDirs.length).toBe(1);
      expect(result.contextDirs[0]).toBe(path.join(tempDir, 'context'));
    });
    
    it('should use explicit contextDirectory from config.yaml', async () => {
      // Create custom context location
      const customContextDir = path.join(tempDir, 'my-custom-context');
      await fs.mkdir(path.join(tempDir, '.protokoll'), { recursive: true });
      await fs.mkdir(customContextDir, { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.protokoll', 'config.yaml'),
        'contextDirectory: ./my-custom-context'
      );
      
      const result = await Discovery.loadHierarchicalConfig({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: tempDir,
      });
      
      expect(result.contextDirs.length).toBe(1);
      expect(result.contextDirs[0]).toBe(customContextDir);
    });
    
    it('should handle absolute contextDirectory path in config.yaml', async () => {
      // Create custom context location
      const customContextDir = path.join(tempDir, 'absolute-context');
      await fs.mkdir(path.join(tempDir, '.protokoll'), { recursive: true });
      await fs.mkdir(customContextDir, { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.protokoll', 'config.yaml'),
        `contextDirectory: ${customContextDir}`
      );
      
      const result = await Discovery.loadHierarchicalConfig({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: tempDir,
      });
      
      expect(result.contextDirs.length).toBe(1);
      expect(result.contextDirs[0]).toBe(customContextDir);
    });
    
    it('should fall back to default when explicit contextDirectory does not exist', async () => {
      // Create only ./context/ at root
      await fs.mkdir(path.join(tempDir, '.protokoll'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'context'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.protokoll', 'config.yaml'),
        'contextDirectory: ./nonexistent-context'
      );
      
      const result = await Discovery.loadHierarchicalConfig({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: tempDir,
      });
      
      expect(result.contextDirs.length).toBe(1);
      expect(result.contextDirs[0]).toBe(path.join(tempDir, 'context'));
    });
    
    it('should handle no context directory found', async () => {
      // Create .protokoll but no context directory anywhere
      await fs.mkdir(path.join(tempDir, '.protokoll'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.protokoll', 'config.yaml'),
        'version: 1'
      );
      
      const result = await Discovery.loadHierarchicalConfig({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: tempDir,
      });
      
      expect(result.contextDirs.length).toBe(0);
    });
    
    it('should handle missing config files gracefully', async () => {
      // Create .protokoll directory without config.yaml
      await fs.mkdir(path.join(tempDir, '.protokoll'));
      
      const result = await Discovery.loadHierarchicalConfig({
        configDirName: '.protokoll',
        configFileName: 'config.yaml',
        startingDir: tempDir,
      });
      
      expect(result.config).toEqual({});
      expect(result.discoveredDirs.length).toBe(1);
    });
  });
  
  describe('deepMerge', () => {
    it('should merge nested objects', () => {
      const target = { a: { b: 1, c: 2 } };
      const source = { a: { c: 3, d: 4 } };
      
      const result = Discovery.deepMerge(target, source);
      
      expect(result).toEqual({ a: { b: 1, c: 3, d: 4 } });
    });
    
    it('should replace arrays instead of merging', () => {
      const target = { arr: [1, 2, 3] };
      const source = { arr: [4, 5] };
      
      const result = Discovery.deepMerge(target, source);
      
      expect(result).toEqual({ arr: [4, 5] });
    });
    
    it('should handle null and undefined', () => {
      // @ts-ignore
      expect(Discovery.deepMerge(null, { a: 1 })).toEqual({ a: 1 });
      // @ts-ignore
      expect(Discovery.deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
    });

    it('should handle when source is a primitive (non-object)', () => {
      // When source is a primitive (number, string), it should return source
      // @ts-ignore
      const result = Discovery.deepMerge({ a: 1 }, 'string value');
      expect(result).toBe('string value');
    });

    it('should handle when target is a primitive', () => {
      // @ts-ignore
      const result = Discovery.deepMerge('old value', { a: 1 });
      expect(result).toEqual({ a: 1 });
    });

    it('should handle when source is an array directly', () => {
      // When source itself is an array (not a property), it should return a copy
      // @ts-ignore
      const source = [1, 2, 3];
      // @ts-ignore
      const result = Discovery.deepMerge({}, source);
      expect(result).toEqual([1, 2, 3]);
    });
  });
});

