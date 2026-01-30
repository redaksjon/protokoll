import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Context from '../../src/context';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Test for bug fix: Context Directory Discovery Issue
 * 
 * Bug: MCP tools were not finding context entities even though they existed
 * Root Cause: Context discovery was looking in .protokoll/context/ instead of ./context/
 * Fix: Changed default to look for ./context/ at repository root, with fallback to .protokoll/context/
 */
describe('Bug Fix: Context Directory Discovery', () => {
  let tempDir: string;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-bug-test-'));
  });
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });
  
  it('should find entities in ./context/ at repository root', async () => {
    // Create structure matching bug report:
    // repo/
    //   .protokoll/
    //     config.yaml
    //   context/
    //     projects/
    //       kjerneverk.yaml
    
    await fs.mkdir(path.join(tempDir, '.protokoll'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'context', 'projects'), { recursive: true });
    
    // Create config.yaml (no contextDirectory setting)
    await fs.writeFile(
      path.join(tempDir, '.protokoll', 'config.yaml'),
      'model: gpt-5.2\n'
    );
    
    // Create a project entity
    await fs.writeFile(
      path.join(tempDir, 'context', 'projects', 'kjerneverk.yaml'),
      `id: kjerneverk
name: Kjerneverk
type: project
classification:
  context_type: work
  explicit_phrases:
    - kjerneverk project
routing:
  destination: ./output/kjerneverk
  structure: month
  filename_options:
    - date
    - time
    - subject
active: true
`
    );
    
    // Create context and load
    const context = await Context.create({
      startingDir: tempDir,
    });
    
    // Should find the project
    const projects = context.getAllProjects();
    expect(projects.length).toBe(1);
    expect(projects[0].id).toBe('kjerneverk');
    expect(projects[0].name).toBe('Kjerneverk');
  });
  
  it('should use explicit contextDirectory from config.yaml', async () => {
    // Create structure with custom context location
    await fs.mkdir(path.join(tempDir, '.protokoll'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'my-custom-context', 'projects'), { recursive: true });
    
    // Create config.yaml with contextDirectory setting
    await fs.writeFile(
      path.join(tempDir, '.protokoll', 'config.yaml'),
      'contextDirectory: ./my-custom-context\n'
    );
    
    // Create a project entity
    await fs.writeFile(
      path.join(tempDir, 'my-custom-context', 'projects', 'test-project.yaml'),
      `id: test-project
name: Test Project
type: project
classification:
  context_type: work
routing:
  structure: month
  filename_options:
    - date
    - time
    - subject
active: true
`
    );
    
    // Create context and load
    const context = await Context.create({
      startingDir: tempDir,
    });
    
    // Should find the project in custom location
    const projects = context.getAllProjects();
    expect(projects.length).toBe(1);
    expect(projects[0].id).toBe('test-project');
  });
  
  it('should fall back to .protokoll/context/ for backward compatibility', async () => {
    // Create structure with only legacy location
    await fs.mkdir(path.join(tempDir, '.protokoll', 'context', 'projects'), { recursive: true });
    
    await fs.writeFile(
      path.join(tempDir, '.protokoll', 'config.yaml'),
      'model: gpt-5.2\n'
    );
    
    // Create a project entity in legacy location
    await fs.writeFile(
      path.join(tempDir, '.protokoll', 'context', 'projects', 'legacy-project.yaml'),
      `id: legacy-project
name: Legacy Project
type: project
classification:
  context_type: work
routing:
  structure: month
  filename_options:
    - date
    - time
    - subject
active: true
`
    );
    
    // Create context and load
    const context = await Context.create({
      startingDir: tempDir,
    });
    
    // Should find the project in legacy location
    const projects = context.getAllProjects();
    expect(projects.length).toBe(1);
    expect(projects[0].id).toBe('legacy-project');
  });
  
  it('should prefer ./context/ over .protokoll/context/ when both exist', async () => {
    // Create both locations
    await fs.mkdir(path.join(tempDir, '.protokoll', 'context', 'projects'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'context', 'projects'), { recursive: true });
    
    await fs.writeFile(
      path.join(tempDir, '.protokoll', 'config.yaml'),
      'model: gpt-5.2\n'
    );
    
    // Create project in root context (should be found)
    await fs.writeFile(
      path.join(tempDir, 'context', 'projects', 'root-project.yaml'),
      `id: root-project
name: Root Project
type: project
classification:
  context_type: work
routing:
  structure: month
  filename_options:
    - date
    - time
    - subject
active: true
`
    );
    
    // Create project in legacy location (should be ignored)
    await fs.writeFile(
      path.join(tempDir, '.protokoll', 'context', 'projects', 'legacy-project.yaml'),
      `id: legacy-project
name: Legacy Project
type: project
classification:
  context_type: work
routing:
  structure: month
  filename_options:
    - date
    - time
    - subject
active: true
`
    );
    
    // Create context and load
    const context = await Context.create({
      startingDir: tempDir,
    });
    
    // Should only find the project in root context
    const projects = context.getAllProjects();
    expect(projects.length).toBe(1);
    expect(projects[0].id).toBe('root-project');
  });
});
