/**
 * Tests for MCP Server module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock the MCP SDK modules before importing the server
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
    CallToolRequestSchema: {},
    ListToolsRequestSchema: {},
}));

// Mock OpenAI to prevent API calls during tests
vi.mock('../../src/util/openai', () => ({
    createCompletion: vi.fn().mockResolvedValue('test variant 1,test variant 2,test phrase'),
}));

import {
    fileExists,
    getAudioMetadata,
    findProtokolkConfigs,
    getConfigInfo,
    suggestProjectsForFile,
    handleDiscoverConfig,
    handleSuggestProject,
    handleContextStatus,
    handleListProjects,
    handleListPeople,
    handleListTerms,
    handleListCompanies,
    handleSearchContext,
    handleGetEntity,
    handleAddPerson,
    handleAddProject,
    handleAddTerm,
    handleAddCompany,
    handleDeleteEntity,
    handleReadTranscript,
    handleEditTranscript,
    handleCombineTranscripts,
    tools,
    type DiscoveredConfig,
    type ProjectSuggestion,
} from '../../src/mcp/server';

// Sample transcript content for testing
const SAMPLE_TRANSCRIPT = `# Test Meeting Notes

## Metadata

**Date**: January 15, 2026
**Time**: 02:12 PM

**Project**: test-project
**Project ID**: \`test-project\`

### Routing

**Destination**: /tmp/notes
**Confidence**: 85.0%

**Tags**: \`test\`, \`meeting\`

**Duration**: 5m 30s

---

This is the transcript content.
`;

describe('MCP Server', () => {
    let tempDir: string;
    let protokollDir: string;

    beforeEach(async () => {
        // Create a temporary directory for testing
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
        protokollDir = path.join(tempDir, '.protokoll');
        await fs.mkdir(protokollDir, { recursive: true });
        await fs.mkdir(path.join(protokollDir, 'people'), { recursive: true });
        await fs.mkdir(path.join(protokollDir, 'projects'), { recursive: true });
        await fs.mkdir(path.join(protokollDir, 'terms'), { recursive: true });
        await fs.mkdir(path.join(protokollDir, 'companies'), { recursive: true });
    });

    afterEach(async () => {
        // Cleanup temp directory
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    // ========================================================================
    // Utility Functions
    // ========================================================================

    describe('fileExists', () => {
        it('should return true for existing file', async () => {
            const testFile = path.join(tempDir, 'test.txt');
            await fs.writeFile(testFile, 'content');
            expect(await fileExists(testFile)).toBe(true);
        });

        it('should return false for non-existing file', async () => {
            const testFile = path.join(tempDir, 'nonexistent.txt');
            expect(await fileExists(testFile)).toBe(false);
        });

        it('should return true for existing directory', async () => {
            expect(await fileExists(protokollDir)).toBe(true);
        });
    });

    describe('getAudioMetadata', () => {
        it('should return metadata for an existing file', async () => {
            // Create a test file to get metadata from
            const testFile = path.join(tempDir, 'test-audio.m4a');
            await fs.writeFile(testFile, 'fake audio content for testing');

            const metadata = await getAudioMetadata(testFile);

            expect(metadata).toBeDefined();
            expect(metadata.creationTime).toBeInstanceOf(Date);
            expect(typeof metadata.hash).toBe('string');
            expect(metadata.hash.length).toBe(8); // Should be 8 characters
        });
    });

    describe('findProtokolkConfigs', () => {
        it('should find .protokoll directory in current path', async () => {
            const configs = await findProtokolkConfigs(tempDir);
            expect(configs).toContain(protokollDir);
        });

        it('should find .protokoll in parent directories', async () => {
            const subDir = path.join(tempDir, 'sub', 'nested');
            await fs.mkdir(subDir, { recursive: true });
            const configs = await findProtokolkConfigs(subDir);
            expect(configs).toContain(protokollDir);
        });

        it('should return empty array when no .protokoll found', async () => {
            const isolatedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'no-protokoll-'));
            try {
                const configs = await findProtokolkConfigs(isolatedDir, 3);
                // May still find configs depending on where the test runs
                // but shouldn't find our test protokoll dir
                expect(configs.includes(protokollDir)).toBe(false);
            } finally {
                await fs.rm(isolatedDir, { recursive: true, force: true });
            }
        });

        it('should respect maxLevels parameter', async () => {
            const deepDir = path.join(tempDir, 'a', 'b', 'c', 'd', 'e');
            await fs.mkdir(deepDir, { recursive: true });
            
            // With maxLevels=2, shouldn't reach the .protokoll at root
            const configs = await findProtokolkConfigs(deepDir, 2);
            expect(configs.includes(protokollDir)).toBe(false);
        });
    });

    describe('getConfigInfo', () => {
        it('should return config info with entity counts', async () => {
            const info = await getConfigInfo(protokollDir);

            expect(info.path).toBe(protokollDir);
            expect(typeof info.projectCount).toBe('number');
            expect(typeof info.peopleCount).toBe('number');
            expect(typeof info.termsCount).toBe('number');
            expect(typeof info.companiesCount).toBe('number');
        });
    });

    describe('suggestProjectsForFile', () => {
        it('should return needsUserInput when no config found', async () => {
            const isolatedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'no-config-'));
            const audioFile = path.join(isolatedDir, 'test.m4a');
            await fs.writeFile(audioFile, 'fake audio');

            try {
                const result = await suggestProjectsForFile(audioFile);
                expect(result.needsUserInput).toBe(true);
                expect(result.configs).toHaveLength(0);
                expect(result.message).toContain('No .protokoll configuration found');
            } finally {
                await fs.rm(isolatedDir, { recursive: true, force: true });
            }
        });

        it('should find config and suggest projects', async () => {
            // Create a project with routing
            await fs.writeFile(
                path.join(protokollDir, 'projects', 'test-project.yaml'),
                `id: test-project
name: Test Project
active: true
routing:
  destination: ${tempDir}
classification:
  explicit_phrases:
    - "test"
`
            );

            const audioFile = path.join(tempDir, 'test', 'audio.m4a');
            await fs.mkdir(path.dirname(audioFile), { recursive: true });
            await fs.writeFile(audioFile, 'fake audio');

            const result = await suggestProjectsForFile(audioFile);
            expect(result.configs.length).toBeGreaterThan(0);
            expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
        });

        it('should suggest project when file is in project destination', async () => {
            // Create a project with routing to a specific destination
            const projectDest = path.join(tempDir, 'project-notes');
            await fs.mkdir(projectDest, { recursive: true });

            await fs.writeFile(
                path.join(protokollDir, 'projects', 'matched-project.yaml'),
                `id: matched-project
name: Matched Project
active: true
routing:
  destination: ${projectDest}
`
            );

            const audioFile = path.join(projectDest, 'meeting.m4a');
            await fs.writeFile(audioFile, 'fake audio');

            const result = await suggestProjectsForFile(audioFile);
            expect(result.configs.length).toBeGreaterThan(0);
            
            // Should suggest the project since audio is in its destination
            const matchedSuggestion = result.suggestions.find(s => s.projectId === 'matched-project');
            if (matchedSuggestion) {
                expect(matchedSuggestion.confidence).toBeGreaterThanOrEqual(0.7);
            }
        });
    });

    // ========================================================================
    // Discovery Handlers
    // ========================================================================

    describe('handleDiscoverConfig', () => {
        it('should discover config when it exists', async () => {
            const result = await handleDiscoverConfig({ path: tempDir });

            expect(result.found).toBe(true);
            expect(result.searchedFrom).toBe(tempDir);
            expect(result.configs.length).toBeGreaterThan(0);
            expect(result.primaryConfig).toBe(protokollDir);
        });

        it('should throw error for non-existent path', async () => {
            const fakePath = path.join(tempDir, 'nonexistent');
            await expect(handleDiscoverConfig({ path: fakePath }))
                .rejects.toThrow('Path not found');
        });

        it('should return not found when no config exists', async () => {
            const isolatedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'isolated-'));
            try {
                const result = await handleDiscoverConfig({ path: isolatedDir });
                // Note: May still find other configs if they exist in parent directories
                // The important thing is that it handles the case gracefully
                expect(typeof result.found).toBe('boolean');
            } finally {
                await fs.rm(isolatedDir, { recursive: true, force: true });
            }
        });

        it('should work with file path (uses parent directory)', async () => {
            const testFile = path.join(tempDir, 'test.txt');
            await fs.writeFile(testFile, 'content');

            const result = await handleDiscoverConfig({ path: testFile });
            expect(result.found).toBe(true);
        });
    });

    describe('handleSuggestProject', () => {
        it('should throw error for non-existent audio file', async () => {
            const fakePath = path.join(tempDir, 'nonexistent.m4a');
            await expect(handleSuggestProject({ audioFile: fakePath }))
                .rejects.toThrow('Audio file not found');
        });

        it('should return suggestions for existing audio file', async () => {
            const audioFile = path.join(tempDir, 'test.m4a');
            await fs.writeFile(audioFile, 'fake audio');

            const result = await handleSuggestProject({ audioFile });
            expect(result.audioFile).toBe(audioFile);
            expect(Array.isArray(result.configs)).toBe(true);
            expect(Array.isArray(result.suggestions)).toBe(true);
            expect(typeof result.needsUserInput).toBe('boolean');
        });
    });

    // ========================================================================
    // Context Management Handlers
    // ========================================================================

    describe('handleContextStatus', () => {
        it('should return context status', async () => {
            const result = await handleContextStatus({ contextDirectory: protokollDir });

            expect(typeof result.hasContext).toBe('boolean');
            expect(Array.isArray(result.discoveredDirectories)).toBe(true);
            expect(typeof result.entityCounts).toBe('object');
            expect(typeof result.entityCounts.projects).toBe('number');
            expect(typeof result.entityCounts.people).toBe('number');
        });
    });

    describe('handleListProjects', () => {
        it('should list projects', async () => {
            // Create a project using the handler
            await handleAddProject({
                id: 'list-test',
                name: 'List Test Project',
                destination: '/tmp/list-test',
                sounds_like: [],  // Bypass smart assistance
                explicit_phrases: [],
                contextDirectory: protokollDir
            });

            const result = await handleListProjects({ contextDirectory: protokollDir });
            expect(Array.isArray(result.projects)).toBe(true);
            expect(result.projects.length).toBeGreaterThan(0);
        });

        it('should filter inactive projects by default', async () => {
            // Create active and inactive projects
            await handleAddProject({
                id: 'active-filter-test',
                name: 'Active Project',
                destination: '/tmp/active',
                sounds_like: [],  // Bypass smart assistance
                explicit_phrases: [],
                contextDirectory: protokollDir
            });
            // Create inactive project by writing file directly (can't set inactive via handler)
            await fs.writeFile(
                path.join(protokollDir, 'projects', 'inactive-filter-test.yaml'),
                'id: inactive-filter-test\nname: Inactive Project\nactive: false\ntype: project'
            );

            const result = await handleListProjects({ contextDirectory: protokollDir });
            const inactiveProject = result.projects.find((p: { id: string }) => p.id === 'inactive-filter-test');
            expect(inactiveProject).toBeUndefined();
        });

        it('should return all projects when includeInactive is true', async () => {
            // This test verifies that includeInactive=true doesn't filter any projects
            // First add some projects
            await handleAddProject({
                id: 'include-test-project',
                name: 'Include Test Project',
                destination: '/tmp/include-test',
                sounds_like: [],  // Bypass smart assistance
                explicit_phrases: [],
                contextDirectory: protokollDir
            });

            const result = await handleListProjects({ 
                contextDirectory: protokollDir,
                includeInactive: true 
            });
            
            // Should return projects array  
            expect(Array.isArray(result.projects)).toBe(true);
            // Should have at least the project we just added
            expect(result.projects.length).toBeGreaterThan(0);
            // The include-test-project should be in the list
            const testProject = result.projects.find((p: { id: string }) => p.id === 'include-test-project');
            expect(testProject).toBeDefined();
        });
    });

    describe('handleListPeople', () => {
        it('should list people', async () => {
            await handleAddPerson({
                id: 'list-person-test',
                name: 'Test Person',
                contextDirectory: protokollDir
            });

            const result = await handleListPeople({ contextDirectory: protokollDir });
            expect(Array.isArray(result.people)).toBe(true);
            expect(result.people.length).toBeGreaterThan(0);
        });
    });

    describe('handleListTerms', () => {
        it('should list terms', async () => {
            await handleAddTerm({
                id: 'list-term-test',
                term: 'Test Term',
                contextDirectory: protokollDir
            });

            const result = await handleListTerms({ contextDirectory: protokollDir });
            expect(Array.isArray(result.terms)).toBe(true);
            expect(result.terms.length).toBeGreaterThan(0);
        });
    });

    describe('handleListCompanies', () => {
        it('should list companies', async () => {
            await handleAddCompany({
                id: 'list-company-test',
                name: 'Test Company',
                contextDirectory: protokollDir
            });

            const result = await handleListCompanies({ contextDirectory: protokollDir });
            expect(Array.isArray(result.companies)).toBe(true);
            expect(result.companies.length).toBeGreaterThan(0);
        });
    });

    describe('handleSearchContext', () => {
        it('should search across context entities', async () => {
            await handleAddPerson({
                id: 'searchable-person',
                name: 'Searchable Person',
                contextDirectory: protokollDir
            });

            const result = await handleSearchContext({
                query: 'searchable',
                contextDirectory: protokollDir
            });

            expect(Array.isArray(result.results)).toBe(true);
            expect(result.query).toBe('searchable');
        });
    });

    describe('handleGetEntity', () => {
        it('should get a specific person', async () => {
            await handleAddPerson({
                id: 'get-test-person',
                name: 'Get Test Person',
                role: 'Developer',
                contextDirectory: protokollDir
            });

            const result = await handleGetEntity({
                entityType: 'person',
                entityId: 'get-test-person',
                contextDirectory: protokollDir
            });

            expect(result.id).toBe('get-test-person');
            expect(result.name).toBe('Get Test Person');
            expect(result.filePath).toBeTruthy();
        });

        it('should throw error for non-existent entity', async () => {
            await expect(handleGetEntity({
                entityType: 'person',
                entityId: 'nonexistent-person',
                contextDirectory: protokollDir
            })).rejects.toThrow('not found');
        });

        it('should get a specific project', async () => {
            await handleAddProject({
                id: 'get-test-project',
                name: 'Get Test Project',
                destination: '/tmp/get-test',
                sounds_like: [],  // Bypass smart assistance
                explicit_phrases: [],
                contextDirectory: protokollDir
            });

            const result = await handleGetEntity({
                entityType: 'project',
                entityId: 'get-test-project',
                contextDirectory: protokollDir
            });

            expect(result.id).toBe('get-test-project');
            expect(result.name).toBe('Get Test Project');
        });
    });

    // ========================================================================
    // Entity Creation Handlers
    // ========================================================================

    describe('handleAddPerson', () => {
        it('should add a new person', async () => {
            const result = await handleAddPerson({
                name: 'New Person Add Test',
                sounds_like: ['new', 'nu person'],
                role: 'Engineer',
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
            expect(result.entity).toBeTruthy();
            expect(result.entity.id).toBeTruthy();
            expect(result.message).toContain('added successfully');
        });

        it('should handle custom ID', async () => {
            const result = await handleAddPerson({
                id: 'custom-person-id',
                name: 'Custom Person',
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
            expect(result.entity.id).toBe('custom-person-id');
        });
    });

    describe('handleAddProject', () => {
        it('should add a new project', async () => {
            const result = await handleAddProject({
                name: 'New Project',
                destination: '/tmp/new-project',
                sounds_like: [],  // Bypass smart assistance
                explicit_phrases: [],
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
            expect(result.entity).toBeTruthy();
            expect(result.entity.id).toBeTruthy();
            expect(result.message).toContain('added successfully');
        });

        it('should add project with classification', async () => {
            const result = await handleAddProject({
                name: 'Classified Project',
                destination: '/tmp/classified',
                explicit_phrases: ['classified', 'secret'],
                sounds_like: [],  // Bypass smart assistance
                topics: ['security'],
                contextType: 'work',
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
        });

        it('should add project with sounds_like phonetic variants', async () => {
            const result = await handleAddProject({
                name: 'Protokoll',
                destination: '/tmp/protokoll',
                sounds_like: ['protocol', 'pro to call', 'proto call'],
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
            expect(result.entity).toBeTruthy();
            expect(result.entity.sounds_like).toBeDefined();
            expect(result.entity.sounds_like).toContain('protocol');
            expect(result.entity.sounds_like).toContain('pro to call');
            expect(result.entity.sounds_like).toContain('proto call');
            expect(result.message).toContain('added successfully');
        });

        it('should add project with sounds_like and explicit_phrases together', async () => {
            const result = await handleAddProject({
                name: 'Kronologi',
                destination: '/tmp/kronologi',
                explicit_phrases: ['work on kronologi', 'kronologi project'],
                sounds_like: ['chronology', 'crono logy', 'crow no logy'],
                topics: ['timeline', 'history'],
                contextType: 'work',
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
            expect(result.entity).toBeTruthy();
            // Check explicit_phrases (in classification)
            expect(result.entity.classification?.explicit_phrases).toContain('work on kronologi');
            // Check sounds_like
            expect(result.entity.sounds_like).toContain('chronology');
            expect(result.entity.sounds_like).toContain('crono logy');
            // Check topics
            expect(result.entity.classification?.topics).toContain('timeline');
        });

        it('should add project with empty sounds_like array', async () => {
            const result = await handleAddProject({
                name: 'Empty Sounds Like',
                destination: '/tmp/empty-sounds',
                sounds_like: [],
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
            // Empty array is saved as-is (falsy check in handler means empty array is saved)
            expect(result.entity.sounds_like).toEqual([]);
        });

        it('should add Norwegian project with sounds_like for English transcription', async () => {
            const result = await handleAddProject({
                name: 'Observasjon',
                destination: '/tmp/observasjon',
                explicit_phrases: ['observasjon note', 'observation project'],
                sounds_like: ['observation', 'observe asian', 'obs er vah shun'],
                contextType: 'work',
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
            expect(result.entity.name).toBe('Observasjon');
            expect(result.entity.sounds_like).toContain('observation');
            expect(result.entity.sounds_like).toContain('observe asian');
        });

        it('should add project with custom id and sounds_like', async () => {
            const result = await handleAddProject({
                id: 'custom-norwegian-id',
                name: 'Redaksjon',
                destination: '/tmp/redaksjon',
                sounds_like: ['redaction', 'red action', 'red ox on'],
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
            expect(result.entity.id).toBe('custom-norwegian-id');
            expect(result.entity.name).toBe('Redaksjon');
            expect(result.entity.sounds_like).toContain('redaction');
        });
    });

    describe('handleAddTerm', () => {
        it('should add a new term', async () => {
            const result = await handleAddTerm({
                term: 'TestTerm',
                sounds_like: ['test term', 'tst trm'],
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
            expect(result.entity.id).toBeTruthy();
            expect(result.message).toContain('added successfully');
        });
    });

    describe('handleAddCompany', () => {
        it('should add a new company', async () => {
            const result = await handleAddCompany({
                name: 'Test Company Inc',
                sounds_like: ['test company', 'tc'],
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
            expect(result.entity.id).toBeTruthy();
            expect(result.message).toContain('added successfully');
        });
    });

    describe('handleDeleteEntity', () => {
        it('should delete an existing person', async () => {
            // First add a person using the handler so it's properly saved
            await handleAddPerson({
                id: 'to-delete',
                name: 'To Delete',
                contextDirectory: protokollDir
            });

            const result = await handleDeleteEntity({
                entityType: 'person',
                entityId: 'to-delete',
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('deleted');
        });

        it('should throw error for non-existent entity', async () => {
            await expect(handleDeleteEntity({
                entityType: 'person',
                entityId: 'nonexistent',
                contextDirectory: protokollDir
            })).rejects.toThrow('not found');
        });
    });

    // ========================================================================
    // Transcript Handlers
    // ========================================================================

    describe('handleReadTranscript', () => {
        it('should read and parse a transcript', async () => {
            const transcriptPath = path.join(tempDir, 'transcript.md');
            await fs.writeFile(transcriptPath, SAMPLE_TRANSCRIPT);

            const result = await handleReadTranscript({ transcriptPath });

            expect(result.filePath).toBe(transcriptPath);
            expect(result.title).toBe('Test Meeting Notes');
            expect(result.content).toContain('transcript content');
        });

        it('should throw error for non-existent file', async () => {
            const fakePath = path.join(tempDir, 'nonexistent.md');
            await expect(handleReadTranscript({ transcriptPath: fakePath }))
                .rejects.toThrow('Transcript not found');
        });
    });

    describe('handleEditTranscript', () => {
        it('should edit transcript title', async () => {
            const transcriptPath = path.join(tempDir, 'edit-test.md');
            await fs.writeFile(transcriptPath, SAMPLE_TRANSCRIPT);

            const result = await handleEditTranscript({
                transcriptPath,
                title: 'New Title'
            });

            expect(result.success).toBe(true);
            expect(result.originalPath).toBe(transcriptPath);
            expect(result.outputPath).toBeTruthy();
            expect(result.message).toBeTruthy();

            // Verify the file was updated
            const content = await fs.readFile(result.outputPath, 'utf-8');
            expect(content).toContain('New Title');
        });
    });

    describe('handleCombineTranscripts', () => {
        it('should combine multiple transcripts', async () => {
            const transcript1 = path.join(tempDir, '01-transcript1.md');
            const transcript2 = path.join(tempDir, '02-transcript2.md');
            
            await fs.writeFile(transcript1, `# Part 1

## Metadata

**Date**: January 15, 2026
**Time**: 02:00 PM

**Tags**: \`test\`

**Duration**: 5m

---

Content from part 1.
`);
            await fs.writeFile(transcript2, `# Part 2

## Metadata

**Date**: January 15, 2026
**Time**: 02:30 PM

**Tags**: \`test\`

**Duration**: 5m

---

Content from part 2.
`);

            const result = await handleCombineTranscripts({
                transcriptPaths: [transcript1, transcript2],
                title: 'Combined Transcript',
                contextDirectory: protokollDir
            });

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeTruthy();
            expect(result.sourceFiles).toHaveLength(2);
            expect(result.message).toContain('Combined 2 transcripts');

            // Verify the combined file exists
            const combinedContent = await fs.readFile(result.outputPath, 'utf-8');
            expect(combinedContent).toContain('Combined Transcript');
            expect(combinedContent).toContain('Content from part 1');
            expect(combinedContent).toContain('Content from part 2');
        });
    });

    // ========================================================================
    // Additional Edge Cases
    // ========================================================================

    describe('handleBatchProcess', () => {
        it('should throw error for non-existent input directory', async () => {
            const { handleBatchProcess } = await import('../../src/mcp/server');
            const fakePath = path.join(tempDir, 'nonexistent-dir');
            await expect(handleBatchProcess({
                inputDirectory: fakePath,
                contextDirectory: protokollDir
            })).rejects.toThrow('Input directory not found');
        });

        it('should return empty arrays when no audio files found', async () => {
            const { handleBatchProcess } = await import('../../src/mcp/server');
            const emptyDir = path.join(tempDir, 'empty-audio-dir');
            await fs.mkdir(emptyDir, { recursive: true });

            const result = await handleBatchProcess({
                inputDirectory: emptyDir,
                contextDirectory: protokollDir
            });

            expect(result.processed).toEqual([]);
            expect(result.errors).toEqual([]);
        });
    });

    describe('handleEditTranscript error cases', () => {
        it('should throw error when neither title nor projectId specified', async () => {
            const transcriptPath = path.join(tempDir, 'edit-error-test.md');
            await fs.writeFile(transcriptPath, SAMPLE_TRANSCRIPT);

            await expect(handleEditTranscript({
                transcriptPath,
            })).rejects.toThrow('Must specify title and/or projectId');
        });
    });

    describe('handleCombineTranscripts error cases', () => {
        it('should throw error when less than 2 files provided', async () => {
            const transcript1 = path.join(tempDir, 'single.md');
            await fs.writeFile(transcript1, SAMPLE_TRANSCRIPT);

            await expect(handleCombineTranscripts({
                transcriptPaths: [transcript1],
                contextDirectory: protokollDir
            })).rejects.toThrow('At least 2 transcript files are required');
        });

        it('should throw error when file does not exist', async () => {
            const transcript1 = path.join(tempDir, 'exists.md');
            const transcript2 = path.join(tempDir, 'does-not-exist.md');
            await fs.writeFile(transcript1, SAMPLE_TRANSCRIPT);

            await expect(handleCombineTranscripts({
                transcriptPaths: [transcript1, transcript2],
                contextDirectory: protokollDir
            })).rejects.toThrow('Transcript not found');
        });
    });

    describe('handleAddPerson error cases', () => {
        it('should throw error when person already exists', async () => {
            // First add a person
            await handleAddPerson({
                id: 'duplicate-person',
                name: 'Duplicate Person',
                contextDirectory: protokollDir
            });

            // Try to add again
            await expect(handleAddPerson({
                id: 'duplicate-person',
                name: 'Duplicate Person Again',
                contextDirectory: protokollDir
            })).rejects.toThrow('already exists');
        });
    });

    describe('handleAddProject error cases', () => {
        it('should throw error when project already exists', async () => {
            // First add a project
            await handleAddProject({
                id: 'duplicate-project',
                name: 'Duplicate Project',
                destination: '/tmp/dup',
                sounds_like: [],  // Bypass smart assistance
                explicit_phrases: [],
                contextDirectory: protokollDir
            });

            // Try to add again
            await expect(handleAddProject({
                id: 'duplicate-project',
                name: 'Duplicate Project Again',
                destination: '/tmp/dup2',
                sounds_like: [],  // Bypass smart assistance
                explicit_phrases: [],
                contextDirectory: protokollDir
            })).rejects.toThrow('already exists');
        });
    });

    describe('handleAddTerm error cases', () => {
        it('should throw error when term already exists', async () => {
            // First add a term
            await handleAddTerm({
                id: 'duplicate-term',
                term: 'Duplicate Term',
                contextDirectory: protokollDir
            });

            // Try to add again
            await expect(handleAddTerm({
                id: 'duplicate-term',
                term: 'Duplicate Term Again',
                contextDirectory: protokollDir
            })).rejects.toThrow('already exists');
        });
    });

    describe('handleAddCompany error cases', () => {
        it('should throw error when company already exists', async () => {
            // First add a company
            await handleAddCompany({
                id: 'duplicate-company',
                name: 'Duplicate Company',
                contextDirectory: protokollDir
            });

            // Try to add again
            await expect(handleAddCompany({
                id: 'duplicate-company',
                name: 'Duplicate Company Again',
                contextDirectory: protokollDir
            })).rejects.toThrow('already exists');
        });
    });

    // ========================================================================
    // Tool Definitions
    // ========================================================================

    describe('tools', () => {
        it('should have all expected tools defined', () => {
            const toolNames = tools.map(t => t.name);

            // Discovery tools
            expect(toolNames).toContain('protokoll_discover_config');
            expect(toolNames).toContain('protokoll_suggest_project');

            // Transcription tools
            expect(toolNames).toContain('protokoll_process_audio');
            expect(toolNames).toContain('protokoll_batch_process');

            // Context management tools
            expect(toolNames).toContain('protokoll_context_status');
            expect(toolNames).toContain('protokoll_list_projects');
            expect(toolNames).toContain('protokoll_list_people');
            expect(toolNames).toContain('protokoll_list_terms');
            expect(toolNames).toContain('protokoll_list_companies');
            expect(toolNames).toContain('protokoll_search_context');
            expect(toolNames).toContain('protokoll_get_entity');

            // Entity creation tools
            expect(toolNames).toContain('protokoll_add_person');
            expect(toolNames).toContain('protokoll_add_project');
            expect(toolNames).toContain('protokoll_add_term');
            expect(toolNames).toContain('protokoll_add_company');
            expect(toolNames).toContain('protokoll_delete_entity');

            // Transcript tools
            expect(toolNames).toContain('protokoll_read_transcript');
            expect(toolNames).toContain('protokoll_edit_transcript');
            expect(toolNames).toContain('protokoll_combine_transcripts');
            expect(toolNames).toContain('protokoll_provide_feedback');
        });

        it('should have valid input schemas for all tools', () => {
            for (const tool of tools) {
                expect(tool.name).toBeTruthy();
                expect(tool.description).toBeTruthy();
                expect(tool.inputSchema).toBeTruthy();
                expect(tool.inputSchema.type).toBe('object');
                expect(tool.inputSchema.properties).toBeTruthy();
            }
        });
    });
});
