/**
 * Tests for handleToolCall routing in src/mcp/tools/index.ts
 *
 * Uses vi.spyOn to mock handlers and verify that handleToolCall correctly routes
 * each tool name to the appropriate handler. Goal: 100% coverage of the switch/case branches.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as SystemTools from '@/mcp/tools/systemTools';
import * as DiscoveryTools from '@/mcp/tools/discoveryTools';
import * as AudioTools from '@/mcp/tools/audioTools';
import * as ContextTools from '@/mcp/tools/contextTools';
import * as EntityTools from '@/mcp/tools/entityTools';
import * as AssistTools from '@/mcp/tools/assistTools';
import * as RelationshipTools from '@/mcp/tools/relationshipTools';
import * as ContentTools from '@/mcp/tools/contentTools';
import * as TranscriptTools from '@/mcp/tools/transcriptTools';
import * as StatusTools from '@/mcp/tools/statusTools';
import { handleToolCall } from '@/mcp/tools/index.js';

describe('handleToolCall routing', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('unknown tool', () => {
        it('throws for unknown tool name', async () => {
            await expect(handleToolCall('unknown_tool', {})).rejects.toThrow('Unknown tool: unknown_tool');
        });

        it('includes tool name in error message', async () => {
            try {
                await handleToolCall('nonexistent_protokoll_tool', {});
            } catch (e) {
                expect((e as Error).message).toBe('Unknown tool: nonexistent_protokoll_tool');
            }
        });
    });

    describe('System Information', () => {
        it('routes protokoll_get_version to handleGetVersion', async () => {
            vi.spyOn(SystemTools, 'handleGetVersion').mockResolvedValue({ version: 'mocked' });
            const result = await handleToolCall('protokoll_get_version', {});
            expect(result).toEqual({ version: 'mocked' });
            expect(SystemTools.handleGetVersion).toHaveBeenCalledTimes(1);
        });

        it('routes protokoll_info to handleGetInfo', async () => {
            vi.spyOn(SystemTools, 'handleGetInfo').mockResolvedValue({ info: 'mocked' });
            const result = await handleToolCall('protokoll_info', {});
            expect(result).toEqual({ info: 'mocked' });
            expect(SystemTools.handleGetInfo).toHaveBeenCalledTimes(1);
        });
    });

    describe('Discovery & Configuration', () => {
        it('routes protokoll_discover_config to handleDiscoverConfig', async () => {
            vi.spyOn(DiscoveryTools, 'handleDiscoverConfig').mockResolvedValue({ config: 'mocked' });
            const args = { projectPath: '/test' };
            const result = await handleToolCall('protokoll_discover_config', args);
            expect(result).toEqual({ config: 'mocked' });
            expect(DiscoveryTools.handleDiscoverConfig).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_suggest_project to handleSuggestProject', async () => {
            vi.spyOn(DiscoveryTools, 'handleSuggestProject').mockResolvedValue({ project: 'mocked' });
            const args = { projectPath: '/test' };
            const result = await handleToolCall('protokoll_suggest_project', args);
            expect(result).toEqual({ project: 'mocked' });
            expect(DiscoveryTools.handleSuggestProject).toHaveBeenCalledWith(args);
        });
    });

    describe('Audio Processing', () => {
        it('routes protokoll_process_audio to handleProcessAudio', async () => {
            vi.spyOn(AudioTools, 'handleProcessAudio').mockResolvedValue({ audio: 'mocked' });
            const args = { path: '/audio.mp3' };
            const result = await handleToolCall('protokoll_process_audio', args);
            expect(result).toEqual({ audio: 'mocked' });
            expect(AudioTools.handleProcessAudio).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_batch_process to handleBatchProcess', async () => {
            vi.spyOn(AudioTools, 'handleBatchProcess').mockResolvedValue({ batch: 'mocked' });
            const args = { paths: ['/a.mp3', '/b.mp3'] };
            const result = await handleToolCall('protokoll_batch_process', args);
            expect(result).toEqual({ batch: 'mocked' });
            expect(AudioTools.handleBatchProcess).toHaveBeenCalledWith(args);
        });
    });

    describe('Context Management', () => {
        it('routes protokoll_context_status to handleContextStatus', async () => {
            vi.spyOn(ContextTools, 'handleContextStatus').mockResolvedValue({ contextStatus: 'mocked' });
            const args = { contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_context_status', args);
            expect(result).toEqual({ contextStatus: 'mocked' });
            expect(ContextTools.handleContextStatus).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_list_projects to handleListProjects', async () => {
            vi.spyOn(ContextTools, 'handleListProjects').mockResolvedValue({ projects: 'mocked' });
            const args = { contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_list_projects', args);
            expect(result).toEqual({ projects: 'mocked' });
            expect(ContextTools.handleListProjects).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_list_people to handleListPeople', async () => {
            vi.spyOn(ContextTools, 'handleListPeople').mockResolvedValue({ people: 'mocked' });
            const args = { contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_list_people', args);
            expect(result).toEqual({ people: 'mocked' });
            expect(ContextTools.handleListPeople).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_list_terms to handleListTerms', async () => {
            vi.spyOn(ContextTools, 'handleListTerms').mockResolvedValue({ terms: 'mocked' });
            const args = { contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_list_terms', args);
            expect(result).toEqual({ terms: 'mocked' });
            expect(ContextTools.handleListTerms).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_list_companies to handleListCompanies', async () => {
            vi.spyOn(ContextTools, 'handleListCompanies').mockResolvedValue({ companies: 'mocked' });
            const args = { contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_list_companies', args);
            expect(result).toEqual({ companies: 'mocked' });
            expect(ContextTools.handleListCompanies).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_search_context to handleSearchContext', async () => {
            vi.spyOn(ContextTools, 'handleSearchContext').mockResolvedValue({ search: 'mocked' });
            const args = { query: 'foo', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_search_context', args);
            expect(result).toEqual({ search: 'mocked' });
            expect(ContextTools.handleSearchContext).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_get_entity to handleGetEntity', async () => {
            vi.spyOn(ContextTools, 'handleGetEntity').mockResolvedValue({ entity: 'mocked' });
            const args = { uri: 'protokoll://entity/person/1', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_get_entity', args);
            expect(result).toEqual({ entity: 'mocked' });
            expect(ContextTools.handleGetEntity).toHaveBeenCalledWith(args);
        });
    });

    describe('Entity CRUD', () => {
        it('routes protokoll_add_person to handleAddPerson', async () => {
            vi.spyOn(EntityTools, 'handleAddPerson').mockResolvedValue({ addPerson: 'mocked' });
            const args = { name: 'Alice', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_add_person', args);
            expect(result).toEqual({ addPerson: 'mocked' });
            expect(EntityTools.handleAddPerson).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_edit_person to handleEditPerson', async () => {
            vi.spyOn(EntityTools, 'handleEditPerson').mockResolvedValue({ editPerson: 'mocked' });
            const args = { id: '1', name: 'Alice', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_edit_person', args);
            expect(result).toEqual({ editPerson: 'mocked' });
            expect(EntityTools.handleEditPerson).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_add_project to handleAddProject', async () => {
            vi.spyOn(EntityTools, 'handleAddProject').mockResolvedValue({ addProject: 'mocked' });
            const args = { name: 'Proj', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_add_project', args);
            expect(result).toEqual({ addProject: 'mocked' });
            expect(EntityTools.handleAddProject).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_edit_project to handleEditProject', async () => {
            vi.spyOn(EntityTools, 'handleEditProject').mockResolvedValue({ editProject: 'mocked' });
            const args = { id: '1', name: 'Proj', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_edit_project', args);
            expect(result).toEqual({ editProject: 'mocked' });
            expect(EntityTools.handleEditProject).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_update_project to handleUpdateProject', async () => {
            vi.spyOn(EntityTools, 'handleUpdateProject').mockResolvedValue({ updateProject: 'mocked' });
            const args = { id: '1', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_update_project', args);
            expect(result).toEqual({ updateProject: 'mocked' });
            expect(EntityTools.handleUpdateProject).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_add_term to handleAddTerm', async () => {
            vi.spyOn(EntityTools, 'handleAddTerm').mockResolvedValue({ addTerm: 'mocked' });
            const args = { term: 'foo', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_add_term', args);
            expect(result).toEqual({ addTerm: 'mocked' });
            expect(EntityTools.handleAddTerm).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_edit_term to handleEditTerm', async () => {
            vi.spyOn(EntityTools, 'handleEditTerm').mockResolvedValue({ editTerm: 'mocked' });
            const args = { id: '1', term: 'foo', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_edit_term', args);
            expect(result).toEqual({ editTerm: 'mocked' });
            expect(EntityTools.handleEditTerm).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_update_term to handleUpdateTerm', async () => {
            vi.spyOn(EntityTools, 'handleUpdateTerm').mockResolvedValue({ updateTerm: 'mocked' });
            const args = { id: '1', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_update_term', args);
            expect(result).toEqual({ updateTerm: 'mocked' });
            expect(EntityTools.handleUpdateTerm).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_merge_terms to handleMergeTerms', async () => {
            vi.spyOn(EntityTools, 'handleMergeTerms').mockResolvedValue({ mergeTerms: 'mocked' });
            const args = { sourceId: '1', targetId: '2', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_merge_terms', args);
            expect(result).toEqual({ mergeTerms: 'mocked' });
            expect(EntityTools.handleMergeTerms).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_add_company to handleAddCompany', async () => {
            vi.spyOn(EntityTools, 'handleAddCompany').mockResolvedValue({ addCompany: 'mocked' });
            const args = { name: 'Acme', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_add_company', args);
            expect(result).toEqual({ addCompany: 'mocked' });
            expect(EntityTools.handleAddCompany).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_delete_entity to handleDeleteEntity', async () => {
            vi.spyOn(EntityTools, 'handleDeleteEntity').mockResolvedValue({ deleteEntity: 'mocked' });
            const args = { uri: 'protokoll://entity/person/1', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_delete_entity', args);
            expect(result).toEqual({ deleteEntity: 'mocked' });
            expect(EntityTools.handleDeleteEntity).toHaveBeenCalledWith(args);
        });
    });

    describe('Smart Assistance', () => {
        it('routes protokoll_suggest_project_metadata to handleSuggestProjectMetadata', async () => {
            vi.spyOn(AssistTools, 'handleSuggestProjectMetadata').mockResolvedValue({ suggestProject: 'mocked' });
            const args = { name: 'Proj', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_suggest_project_metadata', args);
            expect(result).toEqual({ suggestProject: 'mocked' });
            expect(AssistTools.handleSuggestProjectMetadata).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_suggest_term_metadata to handleSuggestTermMetadata', async () => {
            vi.spyOn(AssistTools, 'handleSuggestTermMetadata').mockResolvedValue({ suggestTerm: 'mocked' });
            const args = { term: 'foo', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_suggest_term_metadata', args);
            expect(result).toEqual({ suggestTerm: 'mocked' });
            expect(AssistTools.handleSuggestTermMetadata).toHaveBeenCalledWith(args);
        });
    });

    describe('Relationship Management', () => {
        it('routes protokoll_add_relationship to handleAddRelationship', async () => {
            vi.spyOn(RelationshipTools, 'handleAddRelationship').mockResolvedValue({ addRelationship: 'mocked' });
            const args = { source: 'uri1', target: 'uri2', type: 'works_on', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_add_relationship', args);
            expect(result).toEqual({ addRelationship: 'mocked' });
            expect(RelationshipTools.handleAddRelationship).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_remove_relationship to handleRemoveRelationship', async () => {
            vi.spyOn(RelationshipTools, 'handleRemoveRelationship').mockResolvedValue({ removeRelationship: 'mocked' });
            const args = { source: 'uri1', target: 'uri2', type: 'works_on', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_remove_relationship', args);
            expect(result).toEqual({ removeRelationship: 'mocked' });
            expect(RelationshipTools.handleRemoveRelationship).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_list_relationships to handleListRelationships', async () => {
            vi.spyOn(RelationshipTools, 'handleListRelationships').mockResolvedValue({ listRelationships: 'mocked' });
            const args = { contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_list_relationships', args);
            expect(result).toEqual({ listRelationships: 'mocked' });
            expect(RelationshipTools.handleListRelationships).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_find_related_entities to handleFindRelatedEntities', async () => {
            vi.spyOn(RelationshipTools, 'handleFindRelatedEntities').mockResolvedValue({ findRelated: 'mocked' });
            const args = { uri: 'protokoll://entity/person/1', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_find_related_entities', args);
            expect(result).toEqual({ findRelated: 'mocked' });
            expect(RelationshipTools.handleFindRelatedEntities).toHaveBeenCalledWith(args);
        });
    });

    describe('Content Management', () => {
        it('routes protokoll_add_content to handleAddContent', async () => {
            vi.spyOn(ContentTools, 'handleAddContent').mockResolvedValue({ addContent: 'mocked' });
            const args = { entityUri: 'protokoll://entity/project/1', content: 'text', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_add_content', args);
            expect(result).toEqual({ addContent: 'mocked' });
            expect(ContentTools.handleAddContent).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_remove_content to handleRemoveContent', async () => {
            vi.spyOn(ContentTools, 'handleRemoveContent').mockResolvedValue({ removeContent: 'mocked' });
            const args = { contentId: 'c1', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_remove_content', args);
            expect(result).toEqual({ removeContent: 'mocked' });
            expect(ContentTools.handleRemoveContent).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_list_content to handleListContent', async () => {
            vi.spyOn(ContentTools, 'handleListContent').mockResolvedValue({ listContent: 'mocked' });
            const args = { entityUri: 'protokoll://entity/project/1', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_list_content', args);
            expect(result).toEqual({ listContent: 'mocked' });
            expect(ContentTools.handleListContent).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_get_content to handleGetContent', async () => {
            vi.spyOn(ContentTools, 'handleGetContent').mockResolvedValue({ getContent: 'mocked' });
            const args = { contentId: 'c1', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_get_content', args);
            expect(result).toEqual({ getContent: 'mocked' });
            expect(ContentTools.handleGetContent).toHaveBeenCalledWith(args);
        });
    });

    describe('Transcript Operations', () => {
        it('routes protokoll_read_transcript to handleReadTranscript', async () => {
            vi.spyOn(TranscriptTools, 'handleReadTranscript').mockResolvedValue({ readTranscript: 'mocked' });
            const args = { uri: 'protokoll://transcript/1', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_read_transcript', args);
            expect(result).toEqual({ readTranscript: 'mocked' });
            expect(TranscriptTools.handleReadTranscript).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_list_transcripts to handleListTranscripts', async () => {
            vi.spyOn(TranscriptTools, 'handleListTranscripts').mockResolvedValue({ listTranscripts: 'mocked' });
            const args = { contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_list_transcripts', args);
            expect(result).toEqual({ listTranscripts: 'mocked' });
            expect(TranscriptTools.handleListTranscripts).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_edit_transcript to handleEditTranscript', async () => {
            vi.spyOn(TranscriptTools, 'handleEditTranscript').mockResolvedValue({ editTranscript: 'mocked' });
            const args = { uri: 'protokoll://transcript/1', edits: [], contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_edit_transcript', args);
            expect(result).toEqual({ editTranscript: 'mocked' });
            expect(TranscriptTools.handleEditTranscript).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_change_transcript_date to handleChangeTranscriptDate', async () => {
            vi.spyOn(TranscriptTools, 'handleChangeTranscriptDate').mockResolvedValue({ changeDate: 'mocked' });
            const args = { uri: 'protokoll://transcript/1', date: '2025-01-01', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_change_transcript_date', args);
            expect(result).toEqual({ changeDate: 'mocked' });
            expect(TranscriptTools.handleChangeTranscriptDate).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_combine_transcripts to handleCombineTranscripts', async () => {
            vi.spyOn(TranscriptTools, 'handleCombineTranscripts').mockResolvedValue({ combineTranscripts: 'mocked' });
            const args = { uris: ['uri1', 'uri2'], contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_combine_transcripts', args);
            expect(result).toEqual({ combineTranscripts: 'mocked' });
            expect(TranscriptTools.handleCombineTranscripts).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_provide_feedback to handleProvideFeedback', async () => {
            vi.spyOn(TranscriptTools, 'handleProvideFeedback').mockResolvedValue({ provideFeedback: 'mocked' });
            const args = { transcriptUri: 'protokoll://transcript/1', feedback: 'fix', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_provide_feedback', args);
            expect(result).toEqual({ provideFeedback: 'mocked' });
            expect(TranscriptTools.handleProvideFeedback).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_update_transcript_content to handleUpdateTranscriptContent', async () => {
            vi.spyOn(TranscriptTools, 'handleUpdateTranscriptContent').mockResolvedValue({ updateContent: 'mocked' });
            const args = { uri: 'protokoll://transcript/1', content: 'new', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_update_transcript_content', args);
            expect(result).toEqual({ updateContent: 'mocked' });
            expect(TranscriptTools.handleUpdateTranscriptContent).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_update_transcript_entity_references to handleUpdateTranscriptEntityReferences', async () => {
            vi.spyOn(TranscriptTools, 'handleUpdateTranscriptEntityReferences').mockResolvedValue({ updateRefs: 'mocked' });
            const args = { uri: 'protokoll://transcript/1', updates: [], contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_update_transcript_entity_references', args);
            expect(result).toEqual({ updateRefs: 'mocked' });
            expect(TranscriptTools.handleUpdateTranscriptEntityReferences).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_create_note to handleCreateNote', async () => {
            vi.spyOn(TranscriptTools, 'handleCreateNote').mockResolvedValue({ createNote: 'mocked' });
            const args = { content: 'note', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_create_note', args);
            expect(result).toEqual({ createNote: 'mocked' });
            expect(TranscriptTools.handleCreateNote).toHaveBeenCalledWith(args);
        });
    });

    describe('Lifecycle Status & Tasks', () => {
        it('routes protokoll_set_status to handleSetStatus', async () => {
            vi.spyOn(StatusTools, 'handleSetStatus').mockResolvedValue({ setStatus: 'mocked' });
            const args = { entityUri: 'protokoll://entity/project/1', status: 'done', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_set_status', args);
            expect(result).toEqual({ setStatus: 'mocked' });
            expect(StatusTools.handleSetStatus).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_create_task to handleCreateTask', async () => {
            vi.spyOn(StatusTools, 'handleCreateTask').mockResolvedValue({ createTask: 'mocked' });
            const args = { entityUri: 'protokoll://entity/project/1', title: 'Task', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_create_task', args);
            expect(result).toEqual({ createTask: 'mocked' });
            expect(StatusTools.handleCreateTask).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_complete_task to handleCompleteTask', async () => {
            vi.spyOn(StatusTools, 'handleCompleteTask').mockResolvedValue({ completeTask: 'mocked' });
            const args = { taskId: 't1', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_complete_task', args);
            expect(result).toEqual({ completeTask: 'mocked' });
            expect(StatusTools.handleCompleteTask).toHaveBeenCalledWith(args);
        });

        it('routes protokoll_delete_task to handleDeleteTask', async () => {
            vi.spyOn(StatusTools, 'handleDeleteTask').mockResolvedValue({ deleteTask: 'mocked' });
            const args = { taskId: 't1', contextDirectory: '/test' };
            const result = await handleToolCall('protokoll_delete_task', args);
            expect(result).toEqual({ deleteTask: 'mocked' });
            expect(StatusTools.handleDeleteTask).toHaveBeenCalledWith(args);
        });
    });
});
